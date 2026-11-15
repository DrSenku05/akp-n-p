import { NextResponse } from "next/server"
import {
  acquireBackupLock,
  assertPostgresToolsAvailable,
  BackupError,
  createBackupClient,
  getActiveAdmin,
  getArchiveFingerprint,
  readAndVerifyBackup,
  releaseBackupLock,
  requireSameOrigin,
  requireOwner,
  executeSqlRestore,
} from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let client: ReturnType<typeof createBackupClient> | undefined
  let lockHeld = false
  try {
    requireSameOrigin(_request)
    const { role } = await getActiveAdmin()
    requireOwner(role)
    const { id } = await params
    await assertPostgresToolsAvailable()
    client = createBackupClient()
    await client.connect()
    await acquireBackupLock(client)
    lockHeld = true

    const [{ backup, sql }, archiveFingerprint] = await Promise.all([
      readAndVerifyBackup(id),
      getArchiveFingerprint(client),
    ])
    if (!sql.toString("utf8").includes("-- PostgreSQL database dump")) {
      throw new BackupError("The selected file is not a supported PostgreSQL SQL backup.", 422)
    }
    await executeSqlRestore(client, process.env.DIRECT_URL!, sql)
    const afterRestoreFingerprint = await getArchiveFingerprint(client)
    if (afterRestoreFingerprint !== archiveFingerprint) {
      throw new BackupError("Restore finished, but the protected backup archive changed unexpectedly. Stop further restores and inspect the database.", 500)
    }
    return NextResponse.json({
      ok: true,
      restoredBackupId: backup.id,
      restoredAt: new Date().toISOString(),
      archivePreserved: true,
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof BackupError ? error.status : 500
    return NextResponse.json({ error: error instanceof BackupError ? error.message : "The database restore failed. Any database changes were rolled back." }, { status })
  } finally {
    if (client) {
      if (lockHeld) await releaseBackupLock(client).catch(() => undefined)
      await client.end().catch(() => undefined)
    }
  }
}
