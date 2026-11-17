"use client"
import { LoaderCircle, Menu, Search } from "lucide-react"
import { Button } from "@heroui/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ThemeSwitch } from "../theme-switch"
import { createClient } from "@/lib/supabase/client"
import { AdminNotificationBell } from "@/components/admin/admin-notifications"
const searchablePages: [string, string][] = [["order", "/orders"], ["inventory", "/inventory"], ["stock", "/inventory"], ["delivery", "/delivery-personnel"], ["return", "/returns-refunds"], ["refund", "/returns-refunds"], ["customer", "/customers"], ["feedback", "/feedback"], ["payment", "/payments"], ["product", "/products"], ["heritage", "/heritage-showcase"], ["promotion", "/promotions"], ["notification", "/notifications"], ["report", "/reports"], ["audit", "/audit-logs"], ["backup", "/backup-restore"], ["user", "/users"], ["setting", "/settings"]]

export default function NavBar({ onOpenMenu, inert = false }: { onOpenMenu: () => void; inert?: boolean }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState("")
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState("")
  const [profile, setProfile] = useState({ name: "Admin", role: "Administrator" })
  const [storeName, setStoreName] = useState("AKP Native Products Trading")
  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: settings } = await supabase.from("store_settings").select("store_name").eq("id", true).maybeSingle()
      if (active && typeof settings?.store_name === "string" && settings.store_name.trim()) setStoreName(settings.store_name)
      if (!user) return
      const { data } = await supabase.from("admin_users").select("display_name, role").eq("user_id", user.id).maybeSingle()
      if (active && data) setProfile({ name: data.display_name, role: data.role === "owner" ? "Owner" : "Staff" })
    }
    void loadProfile()
    return () => { active = false }
  }, [])
  const signOut = async () => {
    if (signingOut) return
    setSignOutError("")
    setSigningOut(true)
    try {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      router.replace("/login")
      router.refresh()
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : "Unable to sign out. Please try again.")
      setSigningOut(false)
    }
  }
  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = query.trim().toLowerCase()
    if (!normalized) return
    const match = searchablePages.find(([term]) => normalized.includes(term))
    if (match) { router.push(match[1]); setMessage("") }
    else setMessage("No matching admin section. Try orders, products, customers, or reports.")
  }
  return <>
    {signingOut && <div className="fixed inset-0 z-[100] grid place-items-center bg-background px-4 text-foreground" role="status" aria-live="polite"><div className="flex flex-col items-center gap-3 text-center"><LoaderCircle size={30} className="animate-spin text-primary" aria-hidden="true" /><p className="text-sm text-default-600">Signing you out…</p></div></div>}
    {signOutError && <p role="alert" className="fixed right-4 top-4 z-[101] max-w-sm rounded-lg bg-danger px-4 py-3 text-sm text-white shadow-lg">{signOutError}</p>}
    <header inert={inert} className="relative z-10 flex min-h-[66px] shrink-0 items-center gap-3 border-t-2 border-amber-600 bg-background px-3 text-foreground shadow-sm shadow-black/10 sm:gap-4 sm:px-5 md:px-8">
    <button type="button" aria-label="Open admin navigation" onClick={onOpenMenu} className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-default-300 bg-transparent text-foreground transition hover:border-primary hover:bg-default-100 focus-visible:outline-2 focus-visible:outline-primary">
      <Menu size={21} strokeWidth={1.8} aria-hidden="true" />
    </button>
    <Link href="/" className="flex shrink-0 items-center gap-3 text-foreground no-underline">
      <span
        className="flex size-11 items-center justify-center rounded-md border border-amber-300/55 text-[11px] font-bold tracking-tight text-white shadow-sm shadow-black/30 ring-1 ring-black/20"
        style={{ backgroundImage: "linear-gradient(rgba(26, 24, 20, 0.48), rgba(26, 24, 20, 0.48)), url('/images/banig-badian.jpg')", backgroundPosition: "center", backgroundSize: "cover" }}
      >AKP</span>
      <span className="hidden text-sm font-bold tracking-wide sm:block">{storeName}</span>
      <span className="hidden border-s border-default-300 pl-4 text-[10px] font-medium uppercase tracking-[0.18em] text-default-600 md:block">Administration</span>
    </Link>
    <div className="ml-auto min-w-0 flex-1 sm:max-w-sm">
      <form onSubmit={search} className="flex items-center gap-2 rounded-lg border border-default-300 bg-default-50 px-3 py-2 text-default-600 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
        <Search size={15} aria-hidden="true" />
        <input aria-label="Search admin sections" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sections..." className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-default-500" />
      </form>
      {message && <p role="status" className="absolute right-40 top-full mt-1 rounded-lg border border-default-200 bg-content1 px-3 py-2 text-xs text-foreground shadow-lg">{message}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <AdminNotificationBell />
      <ThemeSwitch className="border border-default-300 bg-transparent text-foreground hover:bg-default-100" />
      <div className="hidden items-center gap-2.5 border-l border-default-300 pl-3 sm:flex">
        <span className="flex size-8 items-center justify-center rounded-full border border-default-300 bg-default-100 text-xs font-semibold text-foreground">{profile.name.slice(0, 1).toUpperCase()}</span>
        <div className="leading-tight">
          <p className="max-w-28 truncate text-xs font-medium">{profile.name}</p>
          <p className="mt-0.5 text-[10px] text-default-600">{profile.role}</p>
          <Button type="button" variant="ghost" size="sm" onPress={signOut} className="mt-0.5 h-auto min-h-0 min-w-0 justify-start px-1 py-0 text-[10px] text-default-600 hover:text-foreground">Sign out</Button>
        </div>
      </div>
    </div>
    </header>
  </>
}
