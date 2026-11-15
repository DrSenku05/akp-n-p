"use client"

import { ChevronDown, CircleAlert, Clock3, Folder, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

type AuditChange = { field: string; before?: unknown; after?: unknown; beforeKnown: boolean }
type AuditEntry = { id: string; user: string; role: string; module: string; action: string; target: string | null; createdAt: string; changes: AuditChange[] }
type UserFolder = { user: string; role: string; entries: AuditEntry[] }

function fieldLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function groupByUser(entries: AuditEntry[]): UserFolder[] {
  const folders = new Map<string, UserFolder>()
  for (const entry of entries) {
    const folder = folders.get(entry.user) ?? { user: entry.user, role: entry.role, entries: [] }
    folder.entries.push(entry)
    folders.set(entry.user, folder)
  }
  return [...folders.values()]
}

export default function AuditLogFolders() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch("/api/admin/audit-logs", { cache: "no-store" })
        const result = await response.json() as { entries?: AuditEntry[]; error?: string }
        if (!response.ok) throw new Error(result.error || "Could not load audit records.")
        if (!active) return
        setEntries(result.entries ?? [])
        setError("")
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load audit records.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load() }, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const folders = groupByUser(entries)
  if (loading && !entries.length) return <div className="flex items-center gap-2 rounded-lg border border-default-200 p-5 text-sm text-default-500"><LoaderCircle size={16} className="animate-spin"/>Loading audit history…</div>
  if (error) return <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
  if (!folders.length) return <div className="flex items-center gap-2 rounded-lg border border-dashed border-default-300 p-8 text-sm text-default-500"><CircleAlert size={17}/>No audit records to show.</div>

  return <div className="space-y-2">
    {folders.map((folder) => <details key={folder.user} className="group rounded-lg border border-default-200 bg-content1">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-default-50 [&::-webkit-details-marker]:hidden">
        <Folder size={17} className="shrink-0 text-accent"/>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{folder.user}</span><span className="text-[11px] capitalize text-default-500">{folder.role.replaceAll("_", " ")} · {folder.entries.length} {folder.entries.length === 1 ? "receipt" : "receipts"}</span></span>
        <span className="hidden items-center gap-1 text-[11px] text-default-400 sm:flex"><Clock3 size={12}/>{new Date(folder.entries[0].createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</span>
        <ChevronDown size={16} className="shrink-0 text-default-400 transition group-open:rotate-180"/>
      </summary>
      <div className="max-h-[34rem] space-y-2 overflow-y-auto border-t border-default-200 p-3">
        {folder.entries.map((entry) => <article key={entry.id} className="min-h-24 rounded-md border border-default-200 bg-default-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="text-xs font-semibold capitalize">{entry.action} · {fieldLabel(entry.module)}{entry.target ? ` · ${entry.target}` : ""}</h3><p className="mt-1 text-[10px] text-default-400">LOG-{entry.id} · {new Date(entry.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</p></div><span className="rounded-full border border-default-200 px-2 py-0.5 text-[10px] capitalize text-default-500">{entry.action}</span></div>
          {entry.action === "update" && entry.changes.some((change) => !change.beforeKnown) && <p className="mt-2 text-[11px] text-warning">Older record: before values were not stored; showing the saved row contents.</p>}
          {entry.changes.length ? <div className="mt-2 max-h-80 divide-y divide-default-200 overflow-y-auto rounded border border-default-200 bg-background">{entry.changes.map((change) => <div key={`${entry.id}-${change.field}`} className="flex min-h-16 flex-col justify-center gap-1 px-2.5 py-2 text-[11px] sm:flex-row sm:items-center sm:gap-3"><span className="w-36 shrink-0 font-medium text-default-600">{fieldLabel(change.field)}</span>{entry.action === "update" && change.beforeKnown ? <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2"><p className="min-w-0 break-all"><span className="text-default-400">Before: </span>{valueLabel(change.before)}</p><p className="min-w-0 break-all"><span className="text-default-400">After: </span>{valueLabel(change.after)}</p></div> : <p className="min-w-0 flex-1 break-all"><span className="text-default-400">{entry.action === "delete" ? "Deleted value: " : "Inserted value: "}</span>{valueLabel(entry.action === "delete" ? change.before : change.after)}</p>}</div>)}</div> : <p className="mt-2 text-xs text-default-500">No changed values were recorded for this action.</p>}
        </article>)}
      </div>
    </details>)}
  </div>
}
