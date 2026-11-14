import { NextResponse, type NextRequest } from "next/server"
import { BackupError, getActiveAdmin, readAndVerifyBackup, requireOwner } from "@/lib/admin-database-backups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await getActiveAdmin()
    requireOwner(role)
    const { id } = await params
    const { backup, sql } = await readAndVerifyBackup(id)
    let offset = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= sql.byteLength) {
          controller.close()
          return
        }
        const end = Math.min(offset + 64 * 1024, sql.byteLength)
        controller.enqueue(new Uint8Array(sql.subarray(offset, end)))
        offset = end
      },
    })
    return new Response(body, {
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${backup.file_name}"`,
        "Content-Length": String(sql.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    const status = error instanceof BackupError ? error.status : 500
    return NextResponse.json({ error: error instanceof BackupError ? error.message : "The backup could not be downloaded." }, { status })
  }
}
