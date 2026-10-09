"use client"

import { usePathname } from "next/navigation"
import NavBar from "@/components/ui/navbar"
import SideBar from "@/components/ui/sidebar"

const authPaths = ["/login", "/forgot-password", "/verify-code", "/reset-password", "/password-updated"]

export default function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (authPaths.includes(pathname)) return <div className="min-h-dvh bg-background">{children}</div>
  return <div className="flex h-dvh flex-col overflow-hidden"><NavBar /><SideBar /><main className="akp-admin-canvas min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-7 md:py-6">{children}</main></div>
}
