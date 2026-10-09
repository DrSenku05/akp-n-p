"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Archive,
  BarChart3,
  Bell,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  MessageSquareText,
  Package,
  RotateCcw,
  Settings2,
  Shapes,
  Truck,
  UsersRound,
  WalletCards,
} from "lucide-react"

const sections = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, links: [] },
  { label: "Operations", href: "/orders", icon: ClipboardList, links: [
    { label: "Orders", href: "/orders", icon: ClipboardList },
    { label: "Inventory", href: "/inventory", icon: Boxes },
    { label: "Delivery Personnel", href: "/delivery-personnel", icon: Truck },
    { label: "Return & Refund", href: "/returns-refunds", icon: RotateCcw },
  ] },
  { label: "Customers", href: "/customers", icon: UsersRound, links: [
    { label: "Customers", href: "/customers", icon: UsersRound },
    { label: "Feedback", href: "/feedback", icon: MessageSquareText },
    { label: "Payments", href: "/payments", icon: WalletCards },
  ] },
  { label: "Catalog & Marketing", href: "/products", icon: Shapes, links: [
    { label: "Products", href: "/products", icon: Package },
    { label: "Heritage Showcase", href: "/heritage-showcase", icon: Archive },
    { label: "Promotions", href: "/promotions", icon: Shapes },
    { label: "Notifications", href: "/notifications", icon: Bell },
  ] },
  { label: "System", href: "/reports", icon: Settings2, links: [
    { label: "Reports", href: "/reports", icon: BarChart3 },
    { label: "Audit Logs", href: "/audit-logs", icon: ClipboardList },
    { label: "Backup & Restore", href: "/backup-restore", icon: Archive },
    { label: "Users", href: "/users", icon: UsersRound },
    { label: "Settings", href: "/settings", icon: Settings2 },
  ] },
]

function isCurrent(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}

export default function SideBar() {
  const pathname = usePathname()
  const [today, setToday] = useState("")
  const activeSection = sections.find((section) => section.links.some((link) => isCurrent(pathname, link.href)))
    ?? sections[0]

  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date()))
  }, [])

  return <div className="shrink-0 border-b border-default-200 bg-content1 shadow-sm">
    <nav className="flex min-h-12 items-stretch gap-1 overflow-x-auto border-b border-default-200/80 px-3 md:px-6" aria-label="Admin sections">
      {sections.map((section) => {
        const active = section === activeSection
        const Icon = section.icon
        return <Link
          key={section.label}
          href={section.href}
          aria-current={active && (section.label === "Dashboard" ? pathname === "/" : true) ? "page" : undefined}
          className={`my-1 flex min-h-10 shrink-0 items-center gap-2 rounded-md border-b-2 px-4 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${active ? "border-accent bg-accent font-semibold text-accent-foreground shadow-sm" : "border-transparent text-stone-700 hover:bg-default-100/80 hover:text-stone-950 dark:text-stone-300 dark:hover:text-white"}`}
        >
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
          {section.label}
        </Link>
      })}
      <span className="ml-auto hidden shrink-0 items-center gap-2 px-3 text-[11px] font-medium tabular-nums text-default-500 md:flex"><span className="size-1.5 rounded-full bg-accent" />{today}</span>
    </nav>
    {activeSection.links.length > 0 && <nav className="flex min-h-10 items-stretch gap-2 overflow-x-auto px-3 md:px-6" aria-label={`${activeSection.label} pages`}>
      {activeSection.links.map((link) => {
        const active = isCurrent(pathname, link.href)
        const Icon = link.icon
        return <Link
          key={link.href}
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${active ? "border-accent font-semibold text-accent" : "border-transparent text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"}`}
        >
          <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
          {link.label}
        </Link>
      })}
    </nav>}
  </div>
}
