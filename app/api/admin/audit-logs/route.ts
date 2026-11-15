import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/prisma/prisma"

export const dynamic = "force-dynamic"

type RowSnapshot = Record<string, unknown>
type AuditRecord = {
  id: bigint
  actor_role: string | null
  actor_email: string | null
  module: string
  action: string
  entity_id: string | null
  metadata: { row?: RowSnapshot; old_row?: RowSnapshot; new_row?: RowSnapshot } | null
  created_at: Date
}

const hiddenField = /password|secret|token|latitude|longitude|(^|_)pin($|_)|auth_user_id/i
const isRecord = (value: unknown): value is RowSnapshot => typeof value === "object" && value !== null && !Array.isArray(value)
const jsonEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

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
    const records = await prisma.$queryRaw<AuditRecord[]>`
      select l.id, l.actor_role, u.email as actor_email, l.module, l.action,
        l.entity_id::text as entity_id, l.metadata, l.created_at
      from public.audit_logs l
      left join auth.users u on u.id = l.actor_id
      where (${admin.role === "owner"} or l.actor_id = ${userId}::uuid)
      order by l.created_at desc, l.id desc
      limit 500
    `
    const entries = records.map((record) => {
      const metadata = record.metadata ?? {}
      const snapshot = isRecord(metadata.row) ? metadata.row : {}
      const oldRow = isRecord(metadata.old_row) ? metadata.old_row : record.action === "delete" ? snapshot : null
      const newRow = isRecord(metadata.new_row) ? metadata.new_row : record.action !== "delete" ? snapshot : null
      const action = record.action.toLowerCase()
      let changes: { field: string; before?: unknown; after?: unknown; beforeKnown: boolean }[]

      if (action === "update" && oldRow && newRow) {
        changes = Array.from(new Set([...Object.keys(oldRow), ...Object.keys(newRow)]))
          .filter((field) => !jsonEqual(oldRow[field], newRow[field]))
          .map((field) => ({ field, before: oldRow[field], after: newRow[field], beforeKnown: true }))
      } else if (action === "delete") {
        changes = Object.entries(oldRow ?? {}).map(([field, before]) => ({ field, before, beforeKnown: true }))
      } else {
        changes = Object.entries(newRow ?? {}).map(([field, after]) => ({ field, after, beforeKnown: false }))
      }

      changes = changes.filter((change) => !hiddenField.test(change.field))
      const current = newRow ?? oldRow ?? snapshot
      const target = ["order_number", "sku", "name", "email", "id"].map((key) => current[key]).find((value) => typeof value === "string" && value)
      return {
        id: String(record.id),
        user: record.actor_email ?? (record.actor_role ? record.actor_role.replaceAll("_", " ") : "System / app activity"),
        role: record.actor_role ?? "system",
        module: record.module,
        action,
        target: typeof target === "string" ? target : record.entity_id,
        createdAt: record.created_at.toISOString(),
        changes,
      }
    })
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load audit records." }, { status: 500 })
  }
}
