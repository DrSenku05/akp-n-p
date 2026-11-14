import { NextResponse } from "next/server"
import {
  acquireBackupLock,
  BackupError,
  createBackupClient,
  getActiveAdmin,
  releaseBackupLock,
  requireOwner,
  requireSameOrigin,
} from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let client: ReturnType<typeof createBackupClient> | undefined
  let lockHeld = false
  try {
    requireSameOrigin(_request)
    const { role } = await getActiveAdmin()
    requireOwner(role)
    const { id } = await params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new BackupError("Invalid backup identifier.", 400)
    }
    client = createBackupClient()
    await client.connect()
    await acquireBackupLock(client)
    lockHeld = true
    const result = await client.query("delete from public.database_backups where id = $1 returning id", [id])
    if (!result.rowCount) throw new BackupError("The selected backup was not found.", 404)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const status = error instanceof BackupError ? error.status : 500
    return NextResponse.json({ error: error instanceof BackupError ? error.message : "The backup could not be deleted." }, { status })
  } finally {
    if (client) {
      if (lockHeld) await releaseBackupLock(client).catch(() => undefined)
      await client.end().catch(() => undefined)
    }
  }
}
