import { NextResponse, type NextRequest } from "next/server"
import { createBackupClient, getActiveAdmin, requireOwner, requireSameOrigin } from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ready = Boolean(process.env.CRON_SECRET && process.env.DIRECT_URL)
const fail = (message: string, status = 500) => NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } })

export async function GET() {
  let client: ReturnType<typeof createBackupClient> | undefined
  try {
    const { role } = await getActiveAdmin()
    requireOwner(role)
    client = createBackupClient()
    await client.connect()
    const { rows } = await client.query("select enabled, last_run_at, last_error from public.database_backup_automation where id = true")
    if (!rows[0]) return fail("Backup automation settings were not found. Run akp_database_backup_automation.sql in Supabase.", 503)
    return NextResponse.json({ ...rows[0], ready, canEdit: true, retention: 5, schedule: "Daily · 02:00 UTC" }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load backup automation settings."
    return fail(message.includes("does not exist") ? "Run akp_database_backup_automation.sql in Supabase before enabling automatic backups." : message, 503)
  } finally {
    if (client) await client.end().catch(() => undefined)
  }
}

export async function PUT(request: NextRequest) {
  let client: ReturnType<typeof createBackupClient> | undefined
  try {
    requireSameOrigin(request)
    const { role, userId } = await getActiveAdmin()
    requireOwner(role)
    const body = await request.json() as { enabled?: unknown }
    if (typeof body.enabled !== "boolean") return fail("Choose whether automatic backups are enabled.", 400)
    if (body.enabled && !ready) return fail("Set CRON_SECRET and DIRECT_URL in Vercel before enabling the schedule.", 503)
    client = createBackupClient()
    await client.connect()
    const { rows } = await client.query(
      "update public.database_backup_automation set enabled = $1, updated_by = $2, updated_at = now(), last_error = null where id = true returning enabled, last_run_at, last_error",
      [body.enabled, userId],
    )
    if (!rows[0]) return fail("Backup automation settings were not found. Run akp_database_backup_automation.sql in Supabase.", 503)
    return NextResponse.json({ ...rows[0], ready, canEdit: true, retention: 5, schedule: "Daily · 02:00 UTC" }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save backup automation settings."
    return fail(message.includes("does not exist") ? "Run akp_database_backup_automation.sql in Supabase before enabling automatic backups." : message, 503)
  } finally {
    if (client) await client.end().catch(() => undefined)
  }
}
