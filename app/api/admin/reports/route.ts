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
      const data = await prisma.$queryRaw<{ product_id: string; sku: string; product: string; stock: number; movements: number }[]>`
        select p.id::text as product_id, p.sku, p.name as product, p.stock_quantity as stock,
          count(im.id)::int as movements
        from public.products p
        left join public.inventory_movements im on im.product_id = p.id
          and im.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and im.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        where p.visibility <> 'archived'
        group by p.id
        order by p.name, p.sku
      `
      dimensions = [{ key: "productId", label: "Product", attributes: [{ key: "sku", label: "SKU" }] }]
      dimensionMembers = { productId: data.map((item) => ({ id: item.product_id, label: item.product, attributes: { sku: item.sku } })) }
      measures = [{ key: "currentStock", label: "Current Stock", format: "number" }, { key: "movementsInPeriod", label: "Movements in Period", format: "count" }]
      records = data.map((item) => ({ dimensions: { productId: item.product_id }, measures: { currentStock: item.stock, movementsInPeriod: item.movements } }))
    } else if (report === "orders") {
      const data = await prisma.$queryRaw<{ order_id: string; order_number: string; status: string; customer_name: string; ordered_at: string; fulfillment: string; total: string }[]>`
        select o.id::text as order_id, o.order_number, o.status,
          coalesce(c.name, 'Customer unavailable') as customer_name,
          to_char(o.created_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH12:MI AM') as ordered_at,
          o.fulfillment_method as fulfillment, o.total_amount::text as total
        from public.orders o
        left join public.customers c on c.id = o.customer_id
        where o.order_number not like 'DEMO-ORD-%'
          and o.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and o.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        order by o.created_at desc, o.order_number
      `
      dimensions = [{ key: "order", label: "Order ID", attributes: [{ key: "status", label: "Status" }, { key: "customer", label: "Ordered By" }, { key: "orderedAt", label: "Order Date & Time" }, { key: "fulfillment", label: "Fulfillment" }] }]
      dimensionMembers = {}
      dimensionMembers.order = data.map((item) => ({ id: item.order_id, label: item.order_number, attributes: { status: item.status, customer: item.customer_name, orderedAt: item.ordered_at, fulfillment: item.fulfillment } }))
      measures = [{ key: "orderValuePHP", label: "Order Total (PHP)", format: "currency" }]
      records = data.map((item) => ({ dimensions: { order: item.order_id }, measures: { orderValuePHP: item.total } }))
    } else if (report === "customers") {
      const data = await prisma.$queryRaw<{ customer_id: string; customer_name: string; delivery_id: string; order_number: string; order_status: string; ordered_at: string; total: string }[]>`
        select c.id::text as customer_id, c.name as customer_name, o.id::text as delivery_id,
          o.order_number, o.status as order_status,
          to_char(o.created_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH12:MI AM') as ordered_at,
          o.total_amount::text as total
        from public.orders o
        join public.customers c on c.id = o.customer_id
        where o.fulfillment_method = 'delivery'
          and o.order_number not like 'DEMO-ORD-%'
          and o.created_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and o.created_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
          and c.name not like 'Demo Customer - %'
          and coalesce(c.email, '') not like '%.demo@example.com'
        order by c.name, o.created_at desc, o.order_number
      `
      dimensions = [{ key: "customerDelivery", label: "Customer", attributes: [{ key: "deliveryId", label: "Delivery ID" }, { key: "orderNumber", label: "Order ID" }, { key: "orderedAt", label: "Order Date & Time" }, { key: "status", label: "Order Status" }] }]
      dimensionMembers = { customerDelivery: data.map((item) => ({ id: `${item.customer_id}:${item.delivery_id}`, label: item.customer_name, attributes: { deliveryId: item.delivery_id, orderNumber: item.order_number, orderedAt: item.ordered_at, status: item.order_status } })) }
      measures = [{ key: "orderValuePHP", label: "Order Total (PHP)", format: "currency" }]
      records = data.map((item) => ({ dimensions: { customerDelivery: `${item.customer_id}:${item.delivery_id}` }, measures: { orderValuePHP: item.total } }))
    } else if (report === "delivery") {
      const data = await prisma.$queryRaw<{ personnel_id: string; personnel: string; delivery_id: string; order_number: string; customer_name: string; delivered_at: string }[]>`
        select d.id::text as personnel_id, d.name as personnel, o.id::text as delivery_id,
          o.order_number, coalesce(c.name, 'Customer unavailable') as customer_name,
          to_char(o.delivered_at at time zone 'Asia/Manila', 'YYYY-MM-DD HH12:MI AM') as delivered_at
        from public.orders o
        join public.delivery_personnel d on d.id = o.delivery_personnel_id
        left join public.customers c on c.id = o.customer_id
        where o.fulfillment_method = 'delivery'
          and o.delivery_status = 'delivered'
          and o.delivered_at is not null
          and o.order_number not like 'DEMO-ORD-%'
          and o.delivered_at >= (${start}::date::timestamp at time zone 'Asia/Manila')
          and o.delivered_at < (((${end}::date) + 1)::timestamp at time zone 'Asia/Manila')
        order by d.name, o.delivered_at desc, o.order_number
      `
      dimensions = [{ key: "driverDelivery", label: "Driver", attributes: [{ key: "orderNumber", label: "Order ID" }, { key: "deliveredAt", label: "Delivery Date & Time" }, { key: "customer", label: "Customer" }] }]
      dimensionMembers = { driverDelivery: data.map((item) => ({ id: `${item.personnel_id}:${item.delivery_id}`, label: item.personnel, attributes: { orderNumber: item.order_number, deliveredAt: item.delivered_at, customer: item.customer_name } })) }
      measures = []
      records = data.map((item) => ({ dimensions: { driverDelivery: `${item.personnel_id}:${item.delivery_id}` }, measures: {} }))
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
      period: { from: start, to: end, timeZone: "Asia/Manila", scope: report === "inventory" ? "Current stock; movements within the selected period" : report === "delivery" ? "Completed deliveries within the selected period" : "Created within the selected period" },
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
