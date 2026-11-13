import "server-only"

import { prisma } from "@/prisma/prisma"

type PreviewResult = { rows: string[][]; announcements?: string[][]; assignableOrders?: { orderNumber: string; customer: string }[]; unassignableOrders?: { driverId: string; orderNumber: string; customer: string }[]; error: boolean } | null
const databaseModules = new Set(["customers", "orders", "delivery-personnel", "returns-refunds", "feedback", "payments", "promotions", "notifications", "audit-logs", "users"])
type ProductRecord = {
  sku: string
  name: string
  category: string | null
  price: string
  stock: number
  visibility: string
  featured: boolean
  craft_origin: string | null
  description: string | null
  image_url: string | null
}

type InventoryMovement = {
  movement_type: string
  quantity_delta: number
  reason: string
  created_at: Date | string
}

const money = (amount: string | number) => `₱${Number(amount).toLocaleString("en-PH", { maximumFractionDigits: 2 })}`
const dateLabel = (value: Date | string | null) => value ? new Date(value).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"
const dateTimeLabel = (value: Date | string | null) => value ? new Date(value).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : "Never"
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
const orderStatusLabel = (status: string, fulfillment: string) => {
  if (status === "pending") return "Pending"
  if (["processing", "preparing", "confirmed"].includes(status)) return "Preparing"
  if (["shipped", "ready_for_pickup", "out_for_delivery"].includes(status)) return ["pickup", "walk_in", "walk-in"].includes(fulfillment) ? "Ready for Pickup" : "Out for Delivery"
  if (["delivered", "completed"].includes(status)) return "Completed"
  return title(status)
}
const orderActions = (status: string, fulfillment: string) => {
  if (status === "pending") return "View · Accept Order · Cancel"
  if (["processing", "preparing", "confirmed"].includes(status)) return `View · ${["pickup", "walk_in", "walk-in"].includes(fulfillment) ? "Ready for Pickup" : "Out for Delivery"} · Cancel`
  if (["shipped", "ready_for_pickup", "out_for_delivery"].includes(status)) return "View · Complete Order"
  return "View"
}
const paymentMethodLabel = (method: string) => {
  const normalized = method.trim().toLowerCase()
  // GCash contains the substring "cash", so identify it before COD.
  if (normalized.includes("gcash") || normalized.includes("wallet")) return "Online payment (GCash)"
  if (normalized === "cod" || normalized.includes("cash on delivery") || normalized.includes("cash")) return "COD"
  return title(method)
}
const paymentStatusLabel = (status: string) => ["verified", "paid"].includes(status.toLowerCase()) ? "Paid" : title(status)

async function getDemoProducts() {
  return prisma.$queryRaw<ProductRecord[]>`
    select p.sku, p.name, c.name as category, p.price::text as price,
      p.stock_quantity as stock, p.visibility,
      p.is_featured as featured, p.craft_origin, p.description, p.image_url
    from public.products p
    left join public.product_categories c on c.id = p.category_id
    where p.sku like 'AKP-ACT-%'
    order by p.sku
  `
}

async function getLowStockThreshold() {
  const [settings] = await prisma.$queryRaw<{ threshold: number }[]>`
    select low_stock_threshold as threshold
    from public.store_inventory_settings where id = true
  `
  return settings?.threshold ?? 10
}

export async function getAdminDatabasePreview(slug: string): Promise<PreviewResult> {
  slug = ({ "return-refund": "returns-refunds", "return-and-refund": "returns-refunds", "returns-and-refunds": "returns-refunds", "marketing-notifications": "promotions" } as Record<string, string>)[slug] ?? slug
  if (!process.env.DATABASE_URL) return databaseModules.has(slug) ? { error: true, rows: [] } : null

  try {
    if (slug === "products") {
      const [products, threshold] = await Promise.all([getDemoProducts(), getLowStockThreshold()])
      return { error: false, rows: products.map((p) => [p.sku, p.image_url ?? "—", p.name, p.category ?? "Uncategorized", money(p.price), String(p.stock), p.visibility === "archived" ? "Archived" : p.stock === 0 ? "Out of Stock" : p.stock <= threshold ? "Low Stock" : "Active", "View · Edit · Archive", p.description ?? "", p.visibility, p.featured ? "Yes" : "No", p.craft_origin ?? "", p.image_url ?? ""]) }
    }

    if (slug === "inventory") {
      const [products, threshold] = await Promise.all([prisma.$queryRaw<(ProductRecord & { movement_history: InventoryMovement[] | null })[]>`
        select p.sku, p.name, c.name as category, p.price::text as price,
          p.stock_quantity as stock, p.visibility,
          p.is_featured as featured, p.craft_origin, p.description, p.image_url,
          movement.movement_history
        from public.products p
        left join public.product_categories c on c.id = p.category_id
        left join lateral (
          select jsonb_agg(
            jsonb_build_object(
              'movement_type', im.movement_type,
              'quantity_delta', im.quantity_delta,
              'reason', im.reason,
              'created_at', im.created_at
            ) order by im.created_at desc
          ) as movement_history
          from public.inventory_movements im
          where im.product_id = p.id
        ) movement on true
        where p.sku like 'AKP-ACT-%'
        order by p.sku
      `, getLowStockThreshold()])
      return { error: false, rows: products.map((p) => {
        const movements = p.movement_history ?? []
        return [p.sku, p.name, String(p.stock), `${movements.length} ${movements.length === 1 ? "activity" : "activities"}`, p.stock === 0 ? "Out of Stock" : p.stock <= threshold ? "Low Stock" : "Normal", "Adjust", JSON.stringify(movements)]
      }) }
    }

    if (slug === "customers") {
      const customers = await prisma.$queryRaw<{ id: string; name: string; email: string | null; phone: string | null; orders: number; spent: string; status: string; addresses: string | null; address_pin: string | null }[]>`
        select c.id::text as id, c.name, c.email, c.phone, c.status,
          address_book.addresses, address_book.address_pin,
          count(o.id)::int as orders, coalesce(sum(o.total_amount), 0)::text as spent
        from public.customers c
        left join public.orders o on o.customer_id = c.id and o.order_number not like 'DEMO-ORD-%'
        left join lateral (
          select string_agg(nullif(concat_ws(', ', nullif(trim(a.address_line), ''), nullif(trim(a.barangay), ''), a.city, a.province, a.postal_code, a.country,
            case when nullif(trim(a.landmark), '') is not null then 'Landmark: ' || trim(a.landmark) end), ''), ' · ' order by a.is_default desc, a.created_at) as addresses,
            (select pin.latitude::text || ',' || pin.longitude::text from public.customer_addresses pin
             where pin.customer_id = c.id and pin.latitude is not null and pin.longitude is not null
             order by pin.is_default desc, pin.created_at limit 1) as address_pin
          from public.customer_addresses a where a.customer_id = c.id
        ) address_book on true
        where coalesce(c.email, '') not like '%.demo@example.com'
          and c.name not like 'Demo Customer - %'
        group by c.id, c.name, c.email, c.phone, c.status, address_book.addresses, address_book.address_pin
        order by c.name
      `
      return { error: false, rows: customers.map((c) => [`CUS-${c.id.slice(0, 8).toUpperCase()}`, c.name, c.email ?? "—", c.phone ?? "—", String(c.orders), money(c.spent), title(c.status), `View · Edit · ${c.status === "active" ? "Suspend" : "Reactivate"}`, c.id, c.addresses ?? "No saved addresses", c.address_pin ?? ""]) }
    }

    if (slug === "orders") {
      const orders = await prisma.$queryRaw<{ order_number: string; customer_id: string | null; customer: string | null; item_count: number; items: string | null; total: string; method: string | null; payment: string | null; reference: string | null; fulfillment: string; status: string; address: string | null; latitude: number | null; longitude: number | null; created_at: Date }[]>`
        select o.order_number, o.customer_id::text as customer_id, c.name as customer, coalesce(items.item_count, 0)::int as item_count,
          items.items as items, o.total_amount::text as total,
          coalesce(nullif(o.payment_method, ''), p.method) as method,
          coalesce(p.status, o.payment_status) as payment,
          p.reference, o.fulfillment_method as fulfillment, o.status,
          nullif(concat_ws(', ', nullif(trim(concat_ws(' ', a.address_line, a.barangay)), ''),
            case when nullif(trim(coalesce(a.landmark, o.delivery_address->>'landmark')), '') is not null
              then 'Landmark: ' || trim(coalesce(a.landmark, o.delivery_address->>'landmark')) end,
            a.city, a.province, a.postal_code), '') as address,
          a.latitude, a.longitude,
          o.created_at
        from public.orders o
        left join public.customers c on c.id = o.customer_id
        left join public.customer_addresses a on a.id = o.delivery_address_id
        left join lateral (
          select count(*)::int as item_count,
            coalesce(json_agg(json_build_object('name', oi.product_name, 'quantity', oi.quantity) order by oi.created_at)::text, '[]') as items
          from public.order_items oi where oi.order_id = o.id
        ) items on true
        left join lateral (
          select pay.method, pay.status, pay.reference
          from public.payments pay where pay.order_id = o.id
          order by pay.created_at desc limit 1
        ) p on true
        where o.order_number not like 'DEMO-ORD-%'
        order by o.created_at desc, o.order_number
      `
      return { error: false, rows: orders.map((o) => {
        const fulfillment = o.fulfillment?.toLowerCase() ?? "delivery"
        const method = o.method ? paymentMethodLabel(o.method) : "—"
        const pin = o.latitude !== null && o.longitude !== null ? `${o.latitude},${o.longitude}` : ""
        return [o.order_number, o.customer ?? "Unknown", ["pickup", "walk_in", "walk-in"].includes(fulfillment) ? "Walk-in" : "Delivery", String(o.item_count), money(o.total), method, paymentStatusLabel(o.payment ?? "pending"), orderStatusLabel(o.status, fulfillment), dateLabel(o.created_at), orderActions(o.status, fulfillment), o.address ?? "Not provided", o.items ?? "[]", method === "Online payment (GCash)" ? o.reference ?? "Not provided" : "—", o.fulfillment, pin, o.customer_id ?? o.order_number]
      }) }
    }

    if (slug === "delivery-personnel") {
      const [personnel, assignableOrders, unassignableOrders] = await Promise.all([
        prisma.$queryRaw<{ id: string; name: string; phone: string | null; availability: string; assigned_orders: string | null; suspendable: boolean }[]>`
          select d.id::text as id, d.name, d.phone, d.availability,
            string_agg(o.order_number, ', ' order by o.order_number) as assigned_orders,
            (d.availability <> 'on_delivery' and count(o.id) = 0) as suspendable
          from public.delivery_personnel d
          left join public.orders o on o.delivery_personnel_id = d.id
            and o.order_number not like 'DEMO-ORD-%' and o.status in ('pending', 'processing', 'shipped')
          where d.name not like 'Demo Rider - %'
          group by d.id, d.name, d.phone, d.availability
          order by d.name
        `,
        prisma.$queryRaw<{ order_number: string; customer: string | null }[]>`
          select o.order_number, c.name as customer
          from public.orders o
          left join public.customers c on c.id = o.customer_id
          where o.delivery_personnel_id is null
            and o.fulfillment_method = 'delivery'
            and o.status in ('pending', 'processing', 'shipped')
            and o.order_number not like 'DEMO-ORD-%'
          order by o.created_at desc
        `,
        prisma.$queryRaw<{ driver_id: string; order_number: string; customer: string | null }[]>`
          select o.delivery_personnel_id::text as driver_id, o.order_number, c.name as customer
          from public.orders o
          left join public.customers c on c.id = o.customer_id
          where o.delivery_personnel_id is not null
            and o.delivery_status = 'assigned'
            and o.fulfillment_method = 'delivery'
            and o.status in ('pending', 'processing', 'shipped')
            and o.order_number not like 'DEMO-ORD-%'
          order by o.created_at desc
        `,
      ])
      return {
        error: false,
        rows: personnel.map((d) => [`DEL-${d.id.slice(0, 8).toUpperCase()}`, d.name, d.phone ?? "—", d.assigned_orders ?? "—", title(d.availability), `${d.availability === "available" ? "View · Edit · Assign" : "View · Edit"}${unassignableOrders.some((order) => order.driver_id === d.id) ? " · Unassign" : ""}${d.suspendable ? " · Suspend" : ""}${d.availability === "suspended" ? " · Reactivate" : ""}`, d.id]),
        assignableOrders: assignableOrders.map((order) => ({ orderNumber: order.order_number, customer: order.customer ?? "Customer" })),
        unassignableOrders: unassignableOrders.map((order) => ({ driverId: order.driver_id, orderNumber: order.order_number, customer: order.customer ?? "Customer" })),
      }
    }

    if (slug === "returns-refunds") {
      const returns = await prisma.$queryRaw<{ request_number: string; order_number: string; customer: string | null; reason: string; amount: string; status: string }[]>`
        select r.request_number, o.order_number, c.name as customer, r.reason,
          o.total_amount::text as amount, r.status
        from public.return_requests r
        join public.orders o on o.id = r.order_id
        left join public.customers c on c.id = r.customer_id
        where r.request_number not like 'DEMO-RET-%'
          and o.order_number not like 'DEMO-ORD-%'
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
        where f.comment not like 'DEMO:%'
          and coalesce(o.order_number, '') not like 'DEMO-ORD-%'
        order by f.created_at desc
      `
      return { error: false, rows: feedback.map((f) => [`FBK-${f.id.slice(0, 8).toUpperCase()}`, f.customer ?? "Unknown", f.product ?? "Product removed", `${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}`, f.comment, f.order_number ?? "—", dateLabel(f.created_at), f.moderation_status === "flagged" ? "View · Unflag · Remove" : "View · Flag", f.id]) }
    }

    if (slug === "payments") {
      const payments = await prisma.$queryRaw<{ id: string; order_number: string; customer: string | null; amount: string; method: string; reference: string | null; receipt_url: string | null; status: string; created_at: Date }[]>`
        select p.id::text as id, o.order_number, c.name as customer,
          p.amount::text as amount, p.method, p.reference, p.receipt_url, p.status, p.created_at
        from public.payments p
        join public.orders o on o.id = p.order_id
        left join public.customers c on c.id = o.customer_id
        where o.order_number not like 'DEMO-ORD-%'
          and coalesce(p.reference, '') not like 'DEMO-PAY-%'
        order by p.created_at desc
      `
      return { error: false, rows: payments.map((p) => {
        const method = paymentMethodLabel(p.method)
        const status = paymentStatusLabel(p.status)
        const actions = `${status !== "Pending" ? "View Details" : method === "COD" ? "Mark Cash Collected" : method === "Online payment (GCash)" ? "Confirm Payment · Reject Payment" : "View Details"}${p.receipt_url ? " · View Receipt" : ""}`
        return [`PAY-${p.id.slice(0, 8).toUpperCase()}`, p.order_number, p.customer ?? "Unknown", money(p.amount), method, p.reference ?? "—", status, dateLabel(p.created_at), actions, p.id, p.receipt_url ?? ""]
      }) }
    }

    if (slug === "heritage-showcase") {
      const products = await getDemoProducts()
      return { error: false, rows: products.filter((p) => p.visibility !== "archived").map((p) => [p.name, p.craft_origin ?? "Origin not provided", p.category ?? "Uncategorized", title(p.visibility), p.featured ? "Yes" : "No", p.visibility === "draft" ? "Edit · Publish" : "Edit · Remove"]) }
    }

    if (slug === "promotions") {
      const promotions = await prisma.$queryRaw<{ name: string; discount_type: string; discount_value: string; ends_at: Date; status: string }[]>`
        select name, discount_type, discount_value::text as discount_value, ends_at, status
        from public.promotions where name not like 'DEMO:%' order by name
      `
      const announcements = await prisma.$queryRaw<{ title: string; audience: string; status: string; sent_at: Date | null }[]>`
        select title, audience, status, sent_at
        from public.announcements where title not like 'DEMO:%' order by created_at desc
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
        from public.announcements where title not like 'DEMO:%' order by created_at desc
      `
      return { error: false, rows: announcements.map((a) => [a.title, title(a.audience), "Announcement", dateLabel(a.sent_at), title(a.status), "View"]) }
    }

    if (slug === "audit-logs") {
      const logs = await prisma.$queryRaw<{ id: bigint; actor_role: string | null; module: string; action: string; created_at: Date; metadata: { row?: Record<string, unknown> }; actor_email: string }[]>`
        select l.id, l.actor_role, l.module, l.action, l.created_at, l.metadata,
          coalesce(u.email, 'Admin') as actor_email
        from public.audit_logs l
        left join auth.users u on u.id = l.actor_id
        where l.actor_id is not null
        order by l.created_at desc limit 100
      `
      return { error: false, rows: logs.map((log) => [`LOG-${log.id}`, log.actor_email, log.actor_role ? title(log.actor_role) : "—", title(log.module), title(log.action), "—", new Date(log.created_at).toLocaleString("en-PH")]) }
    }

    if (slug === "users") {
      const accounts = await prisma.$queryRaw<{ account_id: string; display_name: string; email: string | null; account_type: string; status: string; last_sign_in_at: Date | null; rank: number; suspendable: boolean }[]>`
        select 'admin:' || au.user_id::text as account_id, au.display_name,
          u.email, case when au.role = 'owner' then 'Owner/Admin' else 'Staff' end as account_type,
          case when au.is_active then 'Active' else 'Suspended' end as status,
          u.last_sign_in_at, case when au.role = 'owner' then 1 else 2 end as rank,
          (au.role = 'staff') as suspendable
        from public.admin_users au
        left join auth.users u on u.id = au.user_id
        union all
        select 'driver:' || d.id::text, d.name, coalesce(u.email, d.email), 'Delivery Driver',
          case when d.availability = 'suspended' then 'Suspended' else initcap(replace(d.availability, '_', ' ')) end,
          u.last_sign_in_at, 3,
          (d.availability <> 'on_delivery')
        from public.delivery_personnel d
        left join auth.users u on u.id = d.auth_user_id
        where d.name not like 'Demo Rider - %'
        union all
        select 'customer:' || c.id::text, c.name, c.email, 'Customer', initcap(c.status),
          u.last_sign_in_at, 4, true
        from public.customers c
        left join auth.users u on lower(u.email) = lower(c.email)
        where coalesce(c.email, '') not like '%.demo@example.com'
          and c.name not like 'Demo Customer - %'
        union all
        select 'customer-auth:' || u.id::text,
          coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', u.email, 'Customer'),
          u.email, 'Customer', 'No customer profile', u.last_sign_in_at, 4, false
        from auth.users u
        where coalesce(u.email, '') not like '%.demo@example.com'
          and not exists (select 1 from public.admin_users au where au.user_id = u.id)
          and not exists (select 1 from public.delivery_personnel d where d.auth_user_id = u.id)
          and not exists (select 1 from public.customers c where lower(c.email) = lower(u.email))
        order by rank, display_name
      `
      return { error: false, rows: accounts.map((account) => [account.account_id, account.display_name, account.email ?? "—", account.account_type, account.status, dateTimeLabel(account.last_sign_in_at), account.suspendable ? (account.status === "Suspended" ? "View · Reactivate" : "View · Suspend") : "View"]) }
    }

    if (slug === "backup-restore") return { error: false, rows: [] }
    return null
  } catch (error) {
    console.error("Admin database preview query failed", error)
    return { error: true, rows: [] }
  }
}

export async function getAdminDashboardPreview() {
  const emptyPreview = { error: true, metrics: { ordersToday: 0, pendingOrders: 0, revenueMonth: money(0), lowStock: 0, openReturns: 0, flaggedFeedback: 0 }, recentOrders: [] as string[][] }
  if (!process.env.DATABASE_URL) return emptyPreview

  try {
    const [metrics] = await prisma.$queryRaw<{ orders_today: number; pending_orders: number; revenue_month: string; low_stock: number; open_returns: number; flagged_feedback: number }[]>`
      select
        (select count(*)::int from public.orders where order_number not like 'DEMO-ORD-%' and created_at >= date_trunc('day', now())) as orders_today,
        (select count(*)::int from public.orders where order_number not like 'DEMO-ORD-%' and status = 'pending') as pending_orders,
        (select coalesce(sum(p.amount), 0)::text from public.payments p join public.orders o on o.id = p.order_id where o.order_number not like 'DEMO-ORD-%' and coalesce(p.reference, '') not like 'DEMO-PAY-%' and p.status = 'verified' and p.created_at >= date_trunc('month', now())) as revenue_month,
        (select count(*)::int from public.products where sku like 'AKP-ACT-%' and visibility <> 'archived' and stock_quantity <= coalesce((select low_stock_threshold from public.store_inventory_settings where id = true), 10)) as low_stock,
        (select count(*)::int from public.return_requests r join public.orders o on o.id = r.order_id where r.request_number not like 'DEMO-RET-%' and o.order_number not like 'DEMO-ORD-%' and r.status = 'pending') as open_returns,
        (select count(*)::int from public.feedback f left join public.orders o on o.id = f.order_id where f.comment not like 'DEMO:%' and coalesce(o.order_number, '') not like 'DEMO-ORD-%' and f.moderation_status = 'flagged') as flagged_feedback
    `
    const recentOrders = await prisma.$queryRaw<{ order_number: string; customer: string | null; amount: string; status: string; created_at: Date }[]>`
      select o.order_number, c.name as customer, o.total_amount::text as amount, o.status, o.created_at
      from public.orders o left join public.customers c on c.id = o.customer_id
      where o.order_number not like 'DEMO-ORD-%'
      order by o.created_at desc limit 4
    `
    return {
      error: false,
      metrics: {
        ordersToday: metrics.orders_today,
        pendingOrders: metrics.pending_orders,
        revenueMonth: money(metrics.revenue_month),
        lowStock: metrics.low_stock,
        openReturns: metrics.open_returns,
        flaggedFeedback: metrics.flagged_feedback,
      },
      recentOrders: recentOrders.map((o) => [o.order_number, o.customer ?? "Unknown", money(o.amount), title(o.status), dateLabel(o.created_at)]),
    }
  } catch (error) {
    console.error("Admin dashboard preview query failed", error)
    return emptyPreview
  }
}
