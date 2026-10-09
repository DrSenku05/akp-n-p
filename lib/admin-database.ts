import "server-only"

import { prisma } from "@/prisma/prisma"

type PreviewResult = { rows: string[][]; announcements?: string[][]; error: boolean } | null
type ProductRecord = {
  sku: string
  name: string
  category: string | null
  price: string
  stock: number
  reorder: number
  visibility: string
  featured: boolean
  craft_origin: string | null
}

const money = (amount: string | number) => `₱${Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`
const dateLabel = (value: Date | string | null) => value ? new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const orderActions = (status: string) => status === "pending" ? "View · Process" : status === "processing" ? "View · Ship" : status === "shipped" ? "View · Track" : "View"

async function getDemoProducts() {
  return prisma.$queryRaw<ProductRecord[]>`
    select p.sku, p.name, c.name as category, p.price::text as price,
      p.stock_quantity as stock, p.reorder_level as reorder, p.visibility,
      p.is_featured as featured, p.craft_origin
    from public.products p
    left join public.product_categories c on c.id = p.category_id
    where p.sku like 'DEMO-SKU-%'
    order by p.sku
  `
}

export async function getAdminDatabasePreview(slug: string): Promise<PreviewResult> {
  if (!process.env.DATABASE_URL) return null

  try {
    if (slug === "products") {
      const products = await getDemoProducts()
      return { error: false, rows: products.map((p) => [p.sku, "—", p.name, p.category ?? "Uncategorized", money(p.price), String(p.stock), p.visibility === "archived" ? "Archived" : p.stock === 0 ? "Out of Stock" : p.stock <= p.reorder ? "Low Stock" : "Active", "Edit · Archive"]) }
    }

    if (slug === "inventory") {
      const products = await prisma.$queryRaw<(ProductRecord & { last_delta: number | null; last_reason: string | null; last_date: Date | null })[]>`
        select p.sku, p.name, c.name as category, p.price::text as price,
          p.stock_quantity as stock, p.reorder_level as reorder, p.visibility,
          p.is_featured as featured, p.craft_origin,
          movement.quantity_delta as last_delta, movement.reason as last_reason,
          movement.created_at as last_date
        from public.products p
        left join public.product_categories c on c.id = p.category_id
        left join lateral (
          select im.quantity_delta, im.reason, im.created_at
          from public.inventory_movements im
          where im.product_id = p.id
          order by im.created_at desc limit 1
        ) movement on true
        where p.sku like 'DEMO-SKU-%'
        order by p.sku
      `
      return { error: false, rows: products.map((p) => [p.sku, p.name, String(p.stock), String(p.reorder), p.last_delta === null ? "No movements" : `${dateLabel(p.last_date)} · ${p.last_delta > 0 ? "+" : ""}${p.last_delta} ${p.last_reason ?? "movement"}`, p.stock === 0 ? "Out of Stock" : p.stock <= p.reorder ? "Low Stock" : "Normal", "View · Adjust"]) }
    }

    if (slug === "customers") {
      const customers = await prisma.$queryRaw<{ id: string; name: string; email: string | null; phone: string | null; orders: number; spent: string; status: string }[]>`
        select c.id::text as id, c.name, c.email, c.phone, c.status,
          count(o.id)::int as orders, coalesce(sum(o.total_amount), 0)::text as spent
        from public.customers c
        left join public.orders o on o.customer_id = c.id and o.order_number like 'DEMO-ORD-%'
        where c.email like '%.demo@example.com'
        group by c.id, c.name, c.email, c.phone, c.status
        order by c.name
      `
      return { error: false, rows: customers.map((c, index) => [`CUS-${String(index + 1).padStart(3, "0")}`, c.name, c.email ?? "—", c.phone ?? "—", String(c.orders), money(c.spent), title(c.status), c.status === "active" ? "View · Suspend" : "View · Reactivate"]) }
    }

    if (slug === "orders") {
      const orders = await prisma.$queryRaw<{ order_number: string; customer: string | null; item_count: number; total: string; payment: string | null; status: string; created_at: Date }[]>`
        select o.order_number, c.name as customer, count(distinct oi.id)::int as item_count,
          o.total_amount::text as total, max(p.status) as payment, o.status, o.created_at
        from public.orders o
        left join public.customers c on c.id = o.customer_id
        left join public.order_items oi on oi.order_id = o.id
        left join public.payments p on p.order_id = o.id
        where o.order_number like 'DEMO-ORD-%'
        group by o.id, c.name
        order by o.created_at desc, o.order_number
      `
      return { error: false, rows: orders.map((o) => [o.order_number, o.customer ?? "Unknown", String(o.item_count), money(o.total), title(o.payment ?? "unpaid"), title(o.status), dateLabel(o.created_at), orderActions(o.status)]) }
    }

    if (slug === "delivery-personnel") {
      const personnel = await prisma.$queryRaw<{ id: string; name: string; phone: string | null; availability: string; assigned_orders: string | null }[]>`
        select d.id::text as id, d.name, d.phone, d.availability,
          string_agg(o.order_number, ', ' order by o.order_number) as assigned_orders
        from public.delivery_personnel d
        left join public.orders o on o.delivery_personnel_id = d.id
          and o.order_number like 'DEMO-ORD-%' and o.status in ('processing', 'shipped')
        where d.name like 'Demo Rider - %'
        group by d.id, d.name, d.phone, d.availability
        order by d.name
      `
      return { error: false, rows: personnel.map((d, index) => [`DEL-${String(index + 1).padStart(3, "0")}`, d.name, d.phone ?? "—", d.assigned_orders ?? "—", title(d.availability), d.availability === "available" ? "View · Edit · Assign" : "View · Edit"]) }
    }

    if (slug === "returns-refunds") {
      const returns = await prisma.$queryRaw<{ request_number: string; order_number: string; customer: string | null; reason: string; amount: string; status: string }[]>`
        select r.request_number, o.order_number, c.name as customer, r.reason,
          o.total_amount::text as amount, r.status
        from public.return_requests r
        join public.orders o on o.id = r.order_id
        left join public.customers c on c.id = r.customer_id
        where r.request_number like 'DEMO-RET-%'
        order by r.created_at desc
      `
      return { error: false, rows: returns.map((r) => [r.request_number, r.order_number, r.customer ?? "Unknown", r.reason, "Refund", money(r.amount), title(r.status), r.status === "pending" ? "Review · Approve · Reject" : "View"]) }
    }

    if (slug === "feedback") {
      const feedback = await prisma.$queryRaw<{ id: string; customer: string | null; product: string | null; rating: number; comment: string; order_number: string | null; created_at: Date; moderation_status: string }[]>`
        select f.id::text as id, c.name as customer, p.name as product, f.rating,
          f.comment, o.order_number, f.created_at, f.moderation_status
        from public.feedback f
        left join public.customers c on c.id = f.customer_id
        left join public.products p on p.id = f.product_id
        left join public.orders o on o.id = f.order_id
        where f.comment like 'DEMO:%'
        order by f.created_at desc
      `
      return { error: false, rows: feedback.map((f, index) => [`FBK-DEMO-${String(index + 1).padStart(3, "0")}`, f.customer ?? "Unknown", f.product ?? "Product removed", `${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}`, f.comment, f.order_number ?? "—", dateLabel(f.created_at), f.moderation_status === "flagged" ? "View · Unflag · Remove" : "View · Flag"]) }
    }

    if (slug === "payments") {
      const payments = await prisma.$queryRaw<{ id: string; order_number: string; customer: string | null; amount: string; method: string; status: string; created_at: Date }[]>`
        select p.id::text as id, o.order_number, c.name as customer,
          p.amount::text as amount, p.method, p.status, p.created_at
        from public.payments p
        join public.orders o on o.id = p.order_id
        left join public.customers c on c.id = o.customer_id
        where p.reference like 'DEMO-PAY-%'
        order by p.created_at desc
      `
      return { error: false, rows: payments.map((p, index) => [`TXN-DEMO-${String(index + 1).padStart(3, "0")}`, p.order_number, p.customer ?? "Unknown", money(p.amount), p.method, title(p.status), dateLabel(p.created_at), p.status === "pending" ? "Verify · Reject" : "View Receipt"]) }
    }

    if (slug === "heritage-showcase") {
      const products = await getDemoProducts()
      return { error: false, rows: products.filter((p) => p.visibility !== "archived").map((p) => [p.name, p.craft_origin ?? "Origin not provided", p.category ?? "Uncategorized", title(p.visibility), p.featured ? "Yes" : "No", p.visibility === "draft" ? "Edit · Publish" : "Edit · Remove"]) }
    }

    if (slug === "promotions") {
      const promotions = await prisma.$queryRaw<{ name: string; discount_type: string; discount_value: string; ends_at: Date; status: string }[]>`
        select name, discount_type, discount_value::text as discount_value, ends_at, status
        from public.promotions where name like 'DEMO:%' order by name
      `
      const announcements = await prisma.$queryRaw<{ title: string; audience: string; status: string; sent_at: Date | null }[]>`
        select title, audience, status, sent_at
        from public.announcements where title like 'DEMO:%' order by created_at desc
      `
      return {
        error: false,
        rows: promotions.map((p) => [p.name, p.discount_type === "percentage" ? `${p.discount_value}% off` : `${money(p.discount_value)} off`, dateLabel(p.ends_at), title(p.status), p.status === "draft" ? "Edit · Publish" : "Edit · End"]),
        announcements: announcements.map((a) => [a.title, title(a.audience), dateLabel(a.sent_at), "View"]),
      }
    }

    if (slug === "notifications") {
      const announcements = await prisma.$queryRaw<{ title: string; audience: string; status: string; sent_at: Date | null }[]>`
        select title, audience, status, sent_at
        from public.announcements where title like 'DEMO:%' order by created_at desc
      `
      return { error: false, rows: announcements.map((a) => [a.title, title(a.audience), "Announcement", dateLabel(a.sent_at), title(a.status), "View"]) }
    }

    if (slug === "audit-logs") {
      const logs = await prisma.$queryRaw<{ id: bigint; actor_role: string | null; module: string; action: string; created_at: Date; metadata: { row?: Record<string, unknown> } }[]>`
        select id, actor_role, module, action, created_at, metadata
        from public.audit_logs
        where metadata->'row'->>'sku' like 'DEMO-SKU-%'
          or metadata->'row'->>'order_number' like 'DEMO-ORD-%'
          or metadata->'row'->>'request_number' like 'DEMO-RET-%'
          or metadata->'row'->>'reference' like 'DEMO-PAY-%'
        order by created_at desc limit 100
      `
      return { error: false, rows: logs.map((log) => [`LOG-${log.id}`, "Demo seed", log.actor_role ? title(log.actor_role) : "—", title(log.module), `${title(log.action)} demo record`, "—", new Date(log.created_at).toLocaleString("en-PH")]) }
    }

    if (slug === "backup-restore" || slug === "users") return { error: false, rows: [] }
    return null
  } catch (error) {
    console.error("Admin database preview query failed", error)
    return { error: true, rows: [] }
  }
}

export async function getAdminDashboardPreview() {
  if (!process.env.DATABASE_URL) return null

  try {
    const [metrics] = await prisma.$queryRaw<{ orders_today: number; pending_orders: number; revenue_month: string; low_stock: number }[]>`
      select
        (select count(*)::int from public.orders where order_number like 'DEMO-ORD-%' and created_at >= date_trunc('day', now())) as orders_today,
        (select count(*)::int from public.orders where order_number like 'DEMO-ORD-%' and status = 'pending') as pending_orders,
        (select coalesce(sum(amount), 0)::text from public.payments where reference like 'DEMO-PAY-%' and status = 'verified' and created_at >= date_trunc('month', now())) as revenue_month,
        (select count(*)::int from public.products where sku like 'DEMO-SKU-%' and visibility <> 'archived' and stock_quantity <= reorder_level) as low_stock
    `
    const recentOrders = await prisma.$queryRaw<{ order_number: string; customer: string | null; amount: string; status: string; created_at: Date }[]>`
      select o.order_number, c.name as customer, o.total_amount::text as amount, o.status, o.created_at
      from public.orders o left join public.customers c on c.id = o.customer_id
      where o.order_number like 'DEMO-ORD-%'
      order by o.created_at desc limit 4
    `
    return {
      error: false,
      metrics: {
        ordersToday: metrics.orders_today,
        pendingOrders: metrics.pending_orders,
        revenueMonth: money(metrics.revenue_month),
        lowStock: metrics.low_stock,
      },
      recentOrders: recentOrders.map((o) => [o.order_number, o.customer ?? "Unknown", money(o.amount), title(o.status), dateLabel(o.created_at)]),
    }
  } catch (error) {
    console.error("Admin dashboard preview query failed", error)
    return { error: true, metrics: null, recentOrders: [] as string[][] }
  }
}
