import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/prisma/prisma"

export const dynamic = "force-dynamic"

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })
type ReportValue = string | number
type ReportDimension = { key: string; label: string; attributes?: { key: string; label: string }[] }
type ReportDimensionMember = { id: string; label: string; attributes?: Record<string, string> }
type ReportMeasure = { key: string; label: string; format: "count" | "currency" | "number" }
type ReportRecord = { dimensions: Record<string, string>; measures: Record<string, ReportValue> }
const dateOnly = (date: Date) => date.toISOString().slice(0, 10)
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number(value.slice(0, 4)) > 0 && Number.isFinite(date.getTime()) && dateOnly(date) === value
}

function manilaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function getRange(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range")
  const today = manilaToday()
  if (range === "Custom range") {
    return {
      range,
      from: request.nextUrl.searchParams.get("from") ?? "",
      to: request.nextUrl.searchParams.get("to") ?? "",
    }
  }
  if (range === "Last 7 days") {
    const from = new Date(`${today}T00:00:00Z`)
    from.setUTCDate(from.getUTCDate() - 6)
    return { range, from: dateOnly(from), to: today }
  }
  if (range === "This month") return { range: "This month", from: `${today.slice(0, 7)}-01`, to: today }
  return null
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return fail("Sign in required.", 401)

  const { data: admin, error: adminError } = await supabase.from("admin_users").select("role,is_active").eq("user_id", userId).maybeSingle()
  if (adminError) return fail("Could not verify admin access.", 500)
  if (!admin?.is_active || !["owner", "staff"].includes(admin.role)) return fail("Active admin access required.", 403)

  const report = request.nextUrl.searchParams.get("report") ?? ""
  const titles: Record<string, string> = {
    sales: "Sales Report",
    inventory: "Inventory Report",
    orders: "Order Report",
    customers: "Customer Report",
    delivery: "Delivery Report",
    payments: "Payment Report",
  }
  if (!titles[report]) return fail("Choose a supported report.")

  const period = getRange(request)
  if (!period) return fail("Choose a valid date range.")
  if (!validDate(period.from) || !validDate(period.to) || period.from > period.to) return fail("Enter a valid start and end date.")
  if ((Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000 > 366) {
    return fail("Report date ranges cannot exceed 367 days.")
  }

  try {
    const start = period.from
    const end = period.to
    let dimensions: ReportDimension[]
    let dimensionMembers: Record<string, ReportDimensionMember[]>
    let measures: ReportMeasure[]
    let records: ReportRecord[]

    if (report === "sales") {
      const data = await prisma.$queryRaw<{ day: string; transactions: number; total: string }[]>`
        select to_char((p.created_at at time zone 'Asia/Manila')::date, 'YYYY-MM-DD') as day,
          count(*)::int as transactions, coalesce(sum(p.amount), 0)::text as total
        from public.payments p
        join public.orders o on o.id = p.order_id
        where p.status = 'verified'
          and o.order_number not like 'DEMO-ORD-%'
          and p.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and p.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        group by 1
        order by 1
      `
      dimensions = [{ key: "date", label: "Date" }]
      dimensionMembers = {}
      measures = [{ key: "verifiedTransactions", label: "Verified Transactions", format: "count" }, { key: "revenuePHP", label: "Revenue (PHP)", format: "currency" }]
      records = data.map((item) => ({ dimensions: { date: item.day }, measures: { verifiedTransactions: item.transactions, revenuePHP: item.total } }))
    } else if (report === "inventory") {
      const data = await prisma.$queryRaw<{ product_id: string; sku: string; product: string; stock: number; reorder_level: number; status: string; movements: number }[]>`
        select p.id::text as product_id, p.sku, p.name, p.stock_quantity as stock, p.reorder_level,
          case
            when p.stock_quantity = 0 then 'Out of Stock'
            when p.stock_quantity <= coalesce((select low_stock_threshold from public.store_inventory_settings where id = true), 10) then 'Low Stock'
            else 'Normal'
          end as status,
          count(im.id)::int as movements
        from public.products p
        left join public.inventory_movements im on im.product_id = p.id
          and im.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and im.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        where p.visibility <> 'archived'
        group by p.id
        order by p.name, p.sku
      `
      dimensions = [{ key: "productId", label: "Product", attributes: [{ key: "sku", label: "SKU" }] }, { key: "stockStatus", label: "Stock Status" }]
      dimensionMembers = { productId: data.map((item) => ({ id: item.product_id, label: item.product, attributes: { sku: item.sku } })) }
      measures = [{ key: "currentStock", label: "Current Stock", format: "number" }, { key: "reorderLevel", label: "Reorder Level", format: "number" }, { key: "movementsInPeriod", label: "Movements in Period", format: "count" }]
      records = data.map((item) => ({ dimensions: { productId: item.product_id, stockStatus: item.status }, measures: { currentStock: item.stock, reorderLevel: item.reorder_level, movementsInPeriod: item.movements } }))
    } else if (report === "orders") {
      const data = await prisma.$queryRaw<{ status: string; fulfillment: string; orders: number; total: string }[]>`
        select o.status, o.fulfillment_method as fulfillment,
          count(*)::int as orders, coalesce(sum(o.total_amount), 0)::text as total
        from public.orders o
        where o.order_number not like 'DEMO-ORD-%'
          and o.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and o.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        group by o.status, o.fulfillment_method
        order by o.status, o.fulfillment_method
      `
      dimensions = [{ key: "orderStatus", label: "Order Status" }, { key: "fulfillmentMethod", label: "Fulfillment" }]
      dimensionMembers = {}
      measures = [{ key: "orderCount", label: "Orders", format: "count" }, { key: "orderValuePHP", label: "Order Value (PHP)", format: "currency" }]
      records = data.map((item) => ({ dimensions: { orderStatus: item.status, fulfillmentMethod: item.fulfillment }, measures: { orderCount: item.orders, orderValuePHP: item.total } }))
    } else if (report === "customers") {
      const data = await prisma.$queryRaw<{ customer_id: string; name: string; email: string | null; orders: number; spent: string }[]>`
        select c.id::text as customer_id, c.name, c.email, count(o.id)::int as orders, coalesce(sum(o.total_amount), 0)::text as spent
        from public.customers c
        left join public.orders o on o.customer_id = c.id
          and o.order_number not like 'DEMO-ORD-%'
          and o.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and o.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        where c.name not like 'Demo Customer - %'
          and coalesce(c.email, '') not like '%.demo@example.com'
        group by c.id
        order by orders desc, spent desc, c.name
      `
      dimensions = [{ key: "customerId", label: "Customer ID", attributes: [{ key: "email", label: "Email" }] }]
      dimensionMembers = { customerId: data.map((item) => ({ id: item.customer_id, label: item.name, attributes: { email: item.email ?? "—" } })) }
      measures = [{ key: "orderCount", label: "Orders in Period", format: "count" }, { key: "orderValuePHP", label: "Order Value (PHP)", format: "currency" }]
      records = data.map((item) => ({ dimensions: { customerId: item.customer_id }, measures: { orderCount: item.orders, orderValuePHP: item.spent } }))
    } else if (report === "delivery") {
      const data = await prisma.$queryRaw<{ personnel_id: string | null; personnel: string; deliveries: number; completed: number; active: number }[]>`
        select d.id::text as personnel_id, coalesce(d.name, 'Unassigned') as personnel, count(o.id)::int as deliveries,
          count(*) filter (where o.status in ('delivered', 'completed'))::int as completed,
          count(*) filter (where o.status in ('pending', 'processing', 'shipped'))::int as active
        from public.orders o
        left join public.delivery_personnel d on d.id = o.delivery_personnel_id
        where o.fulfillment_method = 'delivery'
          and o.order_number not like 'DEMO-ORD-%'
          and o.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and o.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        group by d.id, d.name
        order by deliveries desc, personnel
      `
      dimensions = [{ key: "personnelId", label: "Delivery Personnel ID" }]
      dimensionMembers = { personnelId: data.map((item) => ({ id: item.personnel_id ?? "unassigned", label: item.personnel })) }
      measures = [{ key: "deliveries", label: "Deliveries", format: "count" }, { key: "completed", label: "Completed", format: "count" }, { key: "active", label: "Active", format: "count" }]
      records = data.map((item) => ({ dimensions: { personnelId: item.personnel_id ?? "unassigned" }, measures: { deliveries: item.deliveries, completed: item.completed, active: item.active } }))
    } else {
      const data = await prisma.$queryRaw<{ method: string; status: string; transactions: number; total: string }[]>`
        select p.method, p.status, count(*)::int as transactions, coalesce(sum(p.amount), 0)::text as total
        from public.payments p
        join public.orders o on o.id = p.order_id
        where o.order_number not like 'DEMO-ORD-%'
          and p.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and p.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        group by p.method, p.status
        order by p.method, p.status
      `
      dimensions = [{ key: "paymentMethod", label: "Payment Method" }, { key: "paymentStatus", label: "Payment Status" }]
      dimensionMembers = {}
      measures = [{ key: "transactionCount", label: "Transactions", format: "count" }, { key: "amountPHP", label: "Amount (PHP)", format: "currency" }]
      records = data.map((item) => ({ dimensions: { paymentMethod: item.method, paymentStatus: item.status }, measures: { transactionCount: item.transactions, amountPHP: item.total } }))
    }

    return NextResponse.json({
      report: { id: report, title: titles[report] },
      period: { from: start, to: end, timeZone: "Asia/Manila", scope: report === "inventory" ? "Current stock; movements within the selected period" : "Created within the selected period" },
      dimensions,
      dimensionMembers,
      measures,
      records,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Admin report query failed", error)
    return fail("Could not generate this report from the database.", 500)
  }
}
