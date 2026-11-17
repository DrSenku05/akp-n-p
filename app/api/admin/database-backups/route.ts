import { NextResponse, type NextRequest } from "next/server"
import {
  acquireBackupLock,
  assertPostgresToolsAvailable,
  BackupError,
  createBackupClient,
  getActiveAdmin,
  releaseBackupLock,
  requireSameOrigin,
  requireOwner,
  saveDatabaseBackup,
} from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const fail = (error: unknown) => {
  if (error instanceof BackupError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }

  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : ""
  console.error("Unexpected database backup failure", {
    name: error instanceof Error ? error.name : "UnknownError",
    code: /^[A-Z0-9_]{2,10}$/.test(code) ? code : undefined,
  })

  const isNetworkError = ["ENETUNREACH", "EHOSTUNREACH", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND"].includes(code)
  const isSqlState = /^[0-9A-Z]{5}$/.test(code)
  const message = isNetworkError
    ? `Could not reach PostgreSQL (${code}). For a Supabase project on Vercel, set the server-only DIRECT_URL to the Session pooler connection string (port 5432), then redeploy.`
    : isSqlState
      ? `PostgreSQL rejected the backup operation (SQLSTATE ${code}). Check the Vercel Function log for the matching failure.`
      : "The database backup failed unexpectedly. Check the Vercel Function log for the matching failure."

  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    const { role } = await getActiveAdmin()
    requireOwner(role)
    const client = createBackupClient()
    try {
      await client.connect()
      const { rows } = await client.query(
        `select id, backup_name, file_name, file_size::text, sha256, format_version,
          schema_scope, description, created_at
         from public.database_backups
         order by created_at desc
         limit 100`,
      )
      return NextResponse.json({ backups: rows }, { headers: { "Cache-Control": "no-store" } })
    } finally {
      await client.end().catch(() => undefined)
    }
  } catch (error) {
    return fail(error)
  }
}

export async function POST(request: NextRequest) {
  let client: ReturnType<typeof createBackupClient> | undefined
  let lockHeld = false
  try {
    requireSameOrigin(request)
    const { role, userId } = await getActiveAdmin()
    requireOwner(role)
    if (!userId) throw new BackupError("Administrator session is missing.", 401)
    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (contentLength > 4096) throw new BackupError("Backup details are too large.", 413)
    const requestText = await request.text()
    if (Buffer.byteLength(requestText, "utf8") > 4096) throw new BackupError("Backup details are too large.", 413)

    let body: { backupName?: unknown; description?: unknown }
    try {
      body = JSON.parse(requestText) as { backupName?: unknown; description?: unknown }
    } catch {
      throw new BackupError("Provide valid JSON backup details.", 400)
    }
    const backupName = typeof body.backupName === "string" ? body.backupName.trim() : ""
    const description = typeof body.description === "string" ? body.description.trim() : ""
    if (backupName.length < 1 || backupName.length > 120) {
      throw new BackupError("Backup name must be between 1 and 120 characters.", 400)
    }
    if (description.length > 500) throw new BackupError("Description must be at most 500 characters.", 400)

    await assertPostgresToolsAvailable()
    client = createBackupClient()
    await client.connect()
    await acquireBackupLock(client)
    lockHeld = true
    const backup = await saveDatabaseBackup(client, { backupName, description, userId, source: "manual" })
    return NextResponse.json({ backup }, { status: 201, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return fail(error)
  } finally {
    if (client) {
      if (lockHeld) await releaseBackupLock(client).catch(() => undefined)
      await client.end().catch(() => undefined)
    }
  }
}
