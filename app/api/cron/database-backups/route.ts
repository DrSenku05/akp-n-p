import { timingSafeEqual } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import {
  acquireBackupLock,
  assertPostgresToolsAvailable,
  BackupError,
  createBackupClient,
  releaseBackupLock,
  saveDatabaseBackup,
} from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get("authorization") ?? ""
  const expected = secret ? `Bearer ${secret}` : ""
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 })
  const suppliedBytes = Uint8Array.from(Buffer.from(supplied))
  const expectedBytes = Uint8Array.from(Buffer.from(expected))
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  const client = createBackupClient()
  let lockHeld = false
  let connected = false
  try {
    await assertPostgresToolsAvailable()
    await client.connect()
    connected = true
    await acquireBackupLock(client)
    lockHeld = true
    const { rows } = await client.query<{ enabled: boolean; interval_days: number; last_run_at: Date | null }>(
      "select enabled, interval_days, last_run_at from public.database_backup_automation where id = true",
    )
    const settings = rows[0]
    if (!settings) throw new BackupError("Backup automation settings are missing; apply akp_database_backup_automation.sql.", 503)
    if (!settings.enabled) return NextResponse.json({ ok: true, skipped: "disabled" })
    const { rows: dueCheck } = await client.query<{ due: boolean }>(
      "select $1::timestamptz is null or now() >= $1::timestamptz + make_interval(days => $2::integer) as due",
      [settings.last_run_at, settings.interval_days],
    )
    if (!dueCheck[0]?.due) return NextResponse.json({ ok: true, skipped: "interval-not-reached" })

    await saveDatabaseBackup(client, {
      backupName: `Automatic backup ${new Date().toISOString().slice(0, 10)}`,
      description: `Scheduled business-data backup every ${settings.interval_days} day(s).`,
      userId: null,
      source: "automatic",
    })
    return NextResponse.json({ ok: true, created: true })
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/[\r\n]+/g, " ").slice(0, 500) : "Backup failed."
    if (connected) {
      await client.query("update public.database_backup_automation set last_error = $1 where id = true", [detail]).catch(() => undefined)
    }
    const status = error instanceof BackupError ? error.status : 500
    return NextResponse.json({ error: detail }, { status })
  } finally {
    if (lockHeld) await releaseBackupLock(client).catch(() => undefined)
    await client.end().catch(() => undefined)
  }
}
