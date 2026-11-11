"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
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
  X,
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

export default function SideBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const [today, setToday] = useState("")
  const closeButton = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [open, onClose])

  return <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
    <button
      type="button"
      tabIndex={open ? 0 : -1}
      aria-label="Close admin navigation"
      onClick={onClose}
      className={`absolute inset-0 h-full w-full bg-black/30 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
    />
    <aside
      role="dialog"
      aria-modal={open}
      aria-label="Admin navigation"
      inert={!open}
      className={`absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col border-r border-default-200 bg-background/95 shadow-2xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "-translate-x-full"}`}
    >
      <div className="flex min-h-[66px] items-center justify-between border-t-2 border-amber-600 bg-[#211e18] px-5 text-stone-50">
        <span className="text-sm font-bold tracking-wide">Admin navigation</span>
        <button ref={closeButton} type="button" aria-label="Close navigation" onClick={onClose} className="flex size-9 items-center justify-center rounded-lg text-stone-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-amber-300">
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Admin sections">
        <Link
          href="/"
          onClick={onClose}
          aria-current={pathname === "/" ? "page" : undefined}
          className={`mb-3 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${pathname === "/" ? "bg-accent font-semibold text-accent-foreground" : "text-foreground hover:bg-default-100"}`}
        >
          <LayoutDashboard size={17} strokeWidth={1.8} aria-hidden="true" />
          Dashboard
        </Link>
        {sections.filter((section) => section.links.length > 0).map((section) => {
          const SectionIcon = section.icon
          return <div key={section.label} className="mb-4">
            <Link
              href={section.href}
              onClick={onClose}
              aria-current={section === activeSection ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-primary ${section === activeSection ? "text-accent" : "text-default-500 hover:bg-default-100 hover:text-foreground"}`}
            >
              <SectionIcon size={16} strokeWidth={1.8} aria-hidden="true" />
              {section.label}
            </Link>
            <div className="mt-1 grid gap-1">
              {section.links.map((link) => {
                const active = isCurrent(pathname, link.href)
                const Icon = link.icon
                return <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-lg py-2 pl-10 pr-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary ${active ? "bg-default-100 font-semibold text-accent" : "text-foreground/80 hover:bg-default-100 hover:text-foreground"}`}
                >
                  <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                  {link.label}
                </Link>
              })}
            </div>
          </div>;
        })}
      </nav>
      <div className="border-t border-default-200 px-5 py-3 text-[11px] font-medium tabular-nums text-default-500">
        <span className="mr-2 inline-block size-1.5 rounded-full bg-accent" />{today}
      </div>
    </aside>
  </div>
}
