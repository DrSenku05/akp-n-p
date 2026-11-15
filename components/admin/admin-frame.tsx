"use client"

import { useEffect, useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import NavBar from "@/components/ui/navbar"
import SideBar from "@/components/ui/sidebar"
import { createClient } from "@/lib/supabase/client"

const authPaths = ["/login", "/forgot-password", "/verify-code", "/reset-password", "/password-updated"]

function SoftRefresh() {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible" || refreshing || document.querySelector('[role="dialog"]')) return
      startTransition(() => router.refresh())
    }, 3000)
    return () => window.clearInterval(interval)
  }, [refreshing, router])

  return null
}

function PresenceHeartbeat() {
  useEffect(() => {
    let active = true
    let userId = ""
    const supabase = createClient()
    const writeHeartbeat = async () => {
      if (!active || document.visibilityState !== "visible") return
      if (!userId) {
        const { data } = await supabase.auth.getUser()
        userId = data.user?.id ?? ""
      }
      if (userId) await supabase.from("user_presence").upsert({ user_id: userId, last_seen_at: new Date().toISOString() })
    }
    void writeHeartbeat()
    const timer = window.setInterval(() => void writeHeartbeat(), 30_000)
    document.addEventListener("visibilitychange", writeHeartbeat)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", writeHeartbeat)
    }
  }, [])
  return null
}

export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  if (authPaths.includes(pathname)) return <div className="min-h-dvh bg-background">{children}</div>
  return <div className="flex h-dvh flex-col overflow-hidden"><SoftRefresh /><PresenceHeartbeat /><NavBar onOpenMenu={() => setMenuOpen(true)} inert={menuOpen} /><SideBar open={menuOpen} onClose={() => setMenuOpen(false)} /><main inert={menuOpen} className="akp-admin-canvas min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6">{children}</main></div>
}
