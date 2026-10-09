"use client"
import { Bell, Search, UserRound } from "lucide-react"
import { Button } from "@heroui/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ThemeSwitch } from "../theme-switch"
import { createClient } from "@/lib/supabase/client"
const searchablePages: [string, string][] = [["order", "/orders"], ["inventory", "/inventory"], ["stock", "/inventory"], ["delivery", "/delivery-personnel"], ["return", "/returns-refunds"], ["refund", "/returns-refunds"], ["customer", "/customers"], ["feedback", "/feedback"], ["payment", "/payments"], ["product", "/products"], ["heritage", "/heritage-showcase"], ["promotion", "/promotions"], ["notification", "/notifications"], ["report", "/reports"], ["audit", "/audit-logs"], ["backup", "/backup-restore"], ["user", "/users"], ["setting", "/settings"]]

export default function NavBar() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState("")
  const [profile, setProfile] = useState({ name: "Admin", role: "Administrator" })
  useEffect(() => {
    let active = true
    const loadProfile = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from("admin_users").select("display_name, role").eq("user_id", user.id).maybeSingle()
      if (active && data) setProfile({ name: data.display_name, role: data.role === "owner" ? "Owner" : "Staff" })
    }
    void loadProfile()
    return () => { active = false }
  }, [])
  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace("/login")
    router.refresh()
  }
  const search = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = query.trim().toLowerCase()
    if (!normalized) return
    const match = searchablePages.find(([term]) => normalized.includes(term))
    if (match) { router.push(match[1]); setMessage("") }
    else setMessage("No matching admin section. Try orders, products, customers, or reports.")
  }
  return <header className="relative z-10 flex min-h-[66px] shrink-0 items-center gap-4 border-t-2 border-amber-600 bg-[#211e18] px-4 text-stone-50 shadow-sm shadow-black/10 sm:gap-5 sm:px-5 md:px-8">
    <Link href="/" className="flex shrink-0 items-center gap-3 text-stone-50 no-underline">
      <span
        className="flex size-11 items-center justify-center rounded-md border border-amber-300/55 text-[11px] font-bold tracking-tight text-white shadow-sm shadow-black/30 ring-1 ring-black/20"
        style={{ backgroundImage: "linear-gradient(rgba(26, 24, 20, 0.48), rgba(26, 24, 20, 0.48)), url('/images/banig-badian.jpg')", backgroundPosition: "center", backgroundSize: "cover" }}
      >AKP</span>
      <span className="hidden text-sm font-bold tracking-wide sm:block">AKP Native Products</span>
      <span className="hidden border-s border-white/15 pl-4 text-[10px] font-medium uppercase tracking-[0.18em] text-stone-300/65 md:block">Administration</span>
    </Link>
    <div className="ml-auto min-w-0 flex-1 sm:max-w-sm">
      <form onSubmit={search} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-stone-300 transition focus-within:border-amber-400/50 focus-within:bg-white/[0.09] focus-within:ring-2 focus-within:ring-amber-400/10">
        <Search size={15} aria-hidden="true" />
        <input aria-label="Search admin sections" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sections..." className="w-full bg-transparent text-xs text-white outline-none placeholder:text-stone-400/75" />
      </form>
      {message && <p role="status" className="absolute right-40 top-full mt-1 rounded-lg border border-default-200 bg-content1 px-3 py-2 text-xs text-foreground shadow-lg">{message}</p>}
    </div>
    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
      <Link href="/notifications" aria-label="Notifications" className="flex size-9 items-center justify-center rounded-lg text-stone-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-300"><Bell size={17} strokeWidth={1.8} /></Link>
      <ThemeSwitch className="text-stone-100" />
      <div className="hidden items-center gap-2.5 border-l border-white/15 pl-3 sm:flex">
        <span className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-xs font-semibold text-amber-100">{profile.name.slice(0, 1).toUpperCase()}</span>
        <div className="leading-tight">
          <p className="max-w-28 truncate text-xs font-medium">{profile.name}</p>
          <p className="mt-0.5 text-[10px] text-stone-300/65">{profile.role}</p>
          <Button type="button" variant="ghost" size="sm" onPress={signOut} className="mt-0.5 h-auto min-h-0 min-w-0 justify-start px-0 py-0 text-[10px] text-stone-300/75 hover:text-white">Sign out</Button>
        </div>
      </div>
    </div>
  </header>
}
