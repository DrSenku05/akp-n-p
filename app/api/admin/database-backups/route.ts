import { NextResponse, type NextRequest } from "next/server"
import {
  acquireBackupLock,
  assertPostgresToolsAvailable,
  BACKUP_TABLES,
  BackupError,
  createBackupClient,
  createBackupId,
  generateSqlBackup,
  getActiveAdmin,
  getBackupDigest,
  MAX_BASE64_BYTES,
  MAX_SQL_BYTES,
  releaseBackupLock,
  requireSameOrigin,
  requireOwner,
} from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const fail = (error: unknown) => error instanceof BackupError
  ? NextResponse.json({ error: error.message }, { status: error.status })
  : NextResponse.json({ error: "The database backup operation failed." }, { status: 500 })

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
    const sql = await generateSqlBackup(process.env.DIRECT_URL!)
    const backupData = sql.toString("base64")
    if (Buffer.byteLength(backupData, "utf8") > MAX_BASE64_BYTES || sql.byteLength > MAX_SQL_BYTES) {
      throw new BackupError("The SQL dump exceeds the database backup archive limit.", 413)
    }

    const id = createBackupId()
    const createdAt = new Date()
    const stamp = createdAt.toISOString().replaceAll(/[-:.]/g, "")
    const fileName = `akp-database-backup-${stamp}.sql`
    const digest = getBackupDigest(sql)
    await client.query("begin")
    try {
      const { rows } = await client.query(
        `insert into public.database_backups
          (id, backup_name, backup_data, file_name, file_size, sha256, format_version, schema_scope, description, metadata, created_by)
          values ($1, $2, $3, $4, $5, $6, 1, array['public']::text[], $7,
            jsonb_build_object('encoding', 'base64', 'dumpFormat', 'plain-sql', 'tableScope', $9::text[], 'postgresqlVersion', current_setting('server_version')),
           $8)
         returning id, backup_name, file_name, file_size::text, sha256, format_version, schema_scope, description, created_at`,
        [id, backupName, backupData, fileName, sql.byteLength, digest, description || null, userId, [...BACKUP_TABLES]],
      )
      const { rows: savedRows } = await client.query<{ backup_data: string; file_size: string; sha256: string }>(
        "select backup_data, file_size::text, sha256 from public.database_backups where id = $1",
        [id],
      )
      const saved = savedRows[0]
      if (!saved
        || saved.backup_data !== backupData
        || Number(saved.file_size) !== sql.byteLength
        || saved.sha256 !== digest
        || getBackupDigest(Buffer.from(saved.backup_data, "base64")) !== digest) {
        throw new BackupError("The saved SQL backup failed integrity verification and was not retained.", 500)
      }
      await client.query("commit")
      return NextResponse.json({ backup: rows[0] }, { status: 201, headers: { "Cache-Control": "no-store" } })
    } catch (error) {
      await client.query("rollback").catch(() => undefined)
      throw error
    }
  } catch (error) {
    return fail(error)
  } finally {
    if (client) {
      if (lockHeld) await releaseBackupLock(client).catch(() => undefined)
      await client.end().catch(() => undefined)
    }
  }
}
