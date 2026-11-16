import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/prisma/prisma"

export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 })

  const { data: admin, error: adminError } = await supabase.from("admin_users")
    .select("role,is_active").eq("user_id", userId).maybeSingle()
  if (adminError || !admin?.is_active || !["owner", "staff"].includes(admin.role)) {
    return NextResponse.json({ error: "Active admin access required." }, { status: 403 })
  }

  try {
    const records = await prisma.$queryRaw<{ id: bigint; module: string; action: string; actor_role: string | null; actor_email: string | null; entity_id: string | null; metadata: (Record<string, unknown> & { row?: Record<string, unknown> }) | null; created_at: Date }[]>`
      select l.id, l.module, l.action, l.actor_role, u.email as actor_email,
        l.entity_id::text as entity_id, l.metadata, l.created_at
      from public.audit_logs l
      left join auth.users u on u.id = l.actor_id
      where (${admin.role === "owner"} or l.actor_id = ${userId}::uuid
        or (l.module = 'inventory' and l.action = 'low_stock'))
      order by l.created_at desc, l.id desc
      limit 100
    `

    const notifications = records.filter((record) => {
      const row = record.metadata?.row ?? {}
      return !Object.values(row).some((value) => typeof value === "string" && (value.startsWith("DEMO-ORD-") || value.startsWith("Demo Customer - ") || value.includes(".demo@example.com")))
    }).map((record) => {
      const row = record.metadata?.row ?? {}
      const module = record.module.replaceAll("_", " ")
      const action = record.action.toLowerCase()
      const orderNumber = typeof row.order_number === "string" ? row.order_number : ""
      const title = record.module === "inventory" && action === "low_stock"
        ? "Low stock warning"
        : record.module === "orders" && action === "insert"
        ? "New customer order"
        : `${module.replace(/\b\w/g, (letter) => letter.toUpperCase())} ${action === "insert" ? "created" : action === "update" ? "updated" : action === "delete" ? "removed" : action}`
      const detail = record.module === "inventory" && action === "low_stock"
        ? `${String(record.metadata?.available_stock ?? "Stock")} available · ${String(record.metadata?.product ?? "Product")} · threshold ${String(record.metadata?.threshold ?? "")}`
        : orderNumber
        ? `Order ${orderNumber} was placed${typeof row.total_amount === "string" || typeof row.total_amount === "number" ? ` · ₱${Number(row.total_amount).toLocaleString("en-PH")}` : ""}.`
        : record.actor_email ? `${record.actor_email} · ${module}` : `New ${module} activity · ${record.actor_role ?? "System"}`
      const href = record.module === "inventory" ? "/products?section=stock" : record.module === "orders" ? "/orders" : record.module === "payments" ? "/payments" : record.module === "feedback" ? "/feedback" : record.module === "return_requests" ? "/returns-refunds" : "/audit-logs"
      return {
        id: String(record.id),
        title,
        detail,
        module,
        actor: record.actor_email ?? (record.actor_role ? record.actor_role.replaceAll("_", " ") : "System"),
        createdAt: record.created_at.toISOString(),
        href,
      }
    })
    return NextResponse.json({ notifications }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load system notifications." }, { status: 500 })
  }
}
