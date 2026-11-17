import Link from "next/link"
import { ClipboardList, Package, WalletCards } from "lucide-react"
import type { ReactNode } from "react"

const sections = [
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "payments", label: "Payments", icon: WalletCards },
  { id: "inventory", label: "Inventory", icon: Package },
] as const

export default function OrderOperationsWorkspace({ activeSection, children }: { activeSection: (typeof sections)[number]["id"]; children: ReactNode }) {
  return <div className="space-y-5">
    <header>
      <h1 className="text-xl font-semibold tracking-tight">Order Operations</h1>
      <p className="mt-1 text-sm text-default-500">Review orders, verify payments, and track stock in one workspace.</p>
    </header>
    <nav aria-label="Order operations sections" className="flex flex-wrap gap-2 border-b border-default-200">
      {sections.map(({ id, label, icon: Icon }) => {
        const active = activeSection === id
        return <Link
          key={id}
          href={id === "orders" ? "/orders" : `/orders?section=${id}`}
          aria-current={active ? "page" : undefined}
          className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${active ? "border-accent text-accent" : "border-transparent text-default-500 hover:border-default-300 hover:text-foreground"}`}
        >
          <Icon size={16} aria-hidden="true" />{label}
        </Link>
      })}
    </nav>
    {children}
  </div>
}
