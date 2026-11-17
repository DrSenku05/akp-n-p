"use client"

import { Bell, CircleAlert, LoaderCircle } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

type Notification = { id: string; title: string; detail: string; module: string; actor: string; createdAt: string; href: string }
const readKey = "akp-admin:notifications:last-read-id"
const changedEvent = "akp-admin:notifications-read"

function newestId(items: Notification[]) {
  return items.reduce((max, item) => BigInt(item.id) > max ? BigInt(item.id) : max, 0n).toString()
}

function useNotifications(markReadOnLoad = false) {
  const [items, setItems] = useState<Notification[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [lastReadId, setLastReadId] = useState("0")
  const syncRead = useCallback(() => setLastReadId(localStorage.getItem(readKey) ?? "0"), [])
  const markRead = useCallback((records: Notification[]) => {
    const current = BigInt(localStorage.getItem(readKey) ?? "0")
    const latest = BigInt(newestId(records))
    if (latest > current) localStorage.setItem(readKey, latest.toString())
    syncRead()
    window.dispatchEvent(new Event(changedEvent))
  }, [syncRead])

  useEffect(() => {
    syncRead()
    const onStorage = () => syncRead()
    window.addEventListener("storage", onStorage)
    window.addEventListener(changedEvent, onStorage)
    let active = true
    const load = async () => {
      try {
        const response = await fetch("/api/admin/notifications", { cache: "no-store" })
        const result = await response.json() as { notifications?: Notification[]; error?: string }
        if (!response.ok) throw new Error(result.error || "Could not load notifications.")
        if (!active) return
        const records = result.notifications ?? []
        setItems(records)
        setError("")
        if (markReadOnLoad) markRead(records)
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load notifications.")
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 3000)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("storage", onStorage); window.removeEventListener(changedEvent, onStorage) }
  }, [markRead, markReadOnLoad, syncRead])

  const unreadCount = useMemo(() => items.filter((item) => BigInt(item.id) > BigInt(lastReadId)).length, [items, lastReadId])
  return { items, error, loading, unreadCount, markRead }
}

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false)
  const { items, error, loading, unreadCount, markRead } = useNotifications()
  return <div className="relative">
    <button type="button" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) markRead(items) }} className="relative flex size-9 items-center justify-center rounded-lg border border-default-300 bg-transparent text-foreground transition hover:border-primary hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary">
      <Bell size={17} strokeWidth={1.8} />
      {unreadCount > 0 && <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>}
    </button>
    {open && <>
      <button data-preserve-button-hover aria-label="Close notifications" className="fixed inset-0 z-30 cursor-default border-0 bg-transparent" onClick={() => setOpen(false)} />
      <section aria-label="Recent system notifications" className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-default-200 bg-content1 text-foreground shadow-xl">
        <div className="flex items-center justify-between border-b border-default-200 px-4 py-3"><h2 className="text-sm font-semibold">System notifications</h2><Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-accent hover:underline">See all</Link></div>
        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          {error ? <p role="alert" className="p-4 text-xs text-danger">{error}</p> : loading && !items.length ? <div className="flex items-center gap-2 p-4 text-xs text-default-500"><LoaderCircle size={14} className="animate-spin"/>Loading activity…</div> : !items.length ? <div className="flex items-center gap-2 p-4 text-xs text-default-500"><CircleAlert size={15}/>No system activity yet.</div> : items.slice(0, 12).map((item) => <Link key={item.id} href={item.href} onClick={() => setOpen(false)} className="block border-b border-default-100 px-4 py-3 transition hover:bg-default-50"><p className="text-xs font-semibold">{item.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-default-600">{item.detail}</p><p className="mt-1 text-[10px] text-default-400">{new Date(item.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</p></Link>)}
        </div>
      </section>
    </>}
  </div>
}

export default function AdminNotificationsFeed() {
  const { items, error, loading } = useNotifications(true)
  if (error) return <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm text-danger">{error}</div>
  if (loading && !items.length) return <div className="flex items-center gap-2 rounded-lg border border-default-200 p-5 text-sm text-default-500"><LoaderCircle size={16} className="animate-spin"/>Loading system activity…</div>
  if (!items.length) return <div className="flex items-center gap-2 rounded-lg border border-dashed border-default-300 p-8 text-sm text-default-500"><CircleAlert size={17}/>No system activity to report yet.</div>
  return <div className="divide-y divide-default-100 rounded-lg border border-default-200">
    {items.map((item) => <article key={item.id} className="flex gap-3 p-4">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning"><Bell size={15}/></span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><h2 className="text-sm font-semibold">{item.title}</h2><time className="text-[11px] text-default-400" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</time></div><p className="mt-1 text-sm leading-5 text-default-600">{item.detail}</p><p className="mt-2 text-[11px] capitalize text-default-400">{item.module} · {item.actor}</p></div>
      <Link href={item.href} className="self-center whitespace-nowrap text-xs font-medium text-accent hover:underline">Open</Link>
    </article>)}
  </div>
}
