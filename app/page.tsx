import { ArrowUpRight, Bell, Boxes, CircleDollarSign, Package, ShoppingBag } from "lucide-react"
import { Card, Chip } from "@heroui/react"
import Link from "next/link"
import { getAdminDashboardPreview } from "@/lib/admin-database"

export const dynamic = "force-dynamic"

const metricStyles = [
  { icon: ShoppingBag, color: "text-success", tint: "bg-success/10" },
  { icon: Boxes, color: "text-warning", tint: "bg-warning/10" },
  { icon: CircleDollarSign, color: "text-accent", tint: "bg-accent/10" },
  { icon: Package, color: "text-danger", tint: "bg-danger/10" },
]

function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">{title}</h2>{action}</div>
}

export default async function Home() {
  const preview = await getAdminDashboardPreview()
  const metricValues = [
    ["Orders today", String(preview.metrics.ordersToday)],
    ["Pending orders", String(preview.metrics.pendingOrders)],
    ["Verified revenue this month", preview.metrics.revenueMonth],
    ["Low stock items", String(preview.metrics.lowStock)],
  ] as const
  const attention = [
    { count: preview.metrics.pendingOrders, label: "Orders to fulfill", detail: "Review pending customer orders.", href: "/orders", tone: "warning", icon: Boxes },
    { count: preview.metrics.lowStock, label: "Products need restocking", detail: "Check stock levels and reorder.", href: "/inventory", tone: "danger", icon: Package },
    { count: preview.metrics.openReturns, label: "Returns to review", detail: "Respond to open return requests.", href: "/returns-refunds", tone: "accent", icon: ArrowUpRight },
    { count: preview.metrics.flaggedFeedback, label: "Feedback flagged", detail: "Review items needing moderation.", href: "/feedback", tone: "success", icon: Bell },
  ].filter((item) => item.count > 0)
  const today = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date())

  return <div className="mx-auto max-w-[1540px] space-y-6 text-foreground">
    {preview.error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">Could not load dashboard records from Supabase. Check the server database connection.</div>}
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-medium text-default-500">{today}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-default-500">A quick view of your store’s daily operations.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/reports" className="inline-flex h-9 items-center gap-2 rounded-lg border border-default-200 bg-content1 px-3 text-xs font-medium transition hover:bg-default-50"><ArrowUpRight size={15} />Reports</Link>
        <Link href="/orders" className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"><ShoppingBag size={15} />Orders</Link>
      </div>
    </header>

    <section aria-label="Store metrics" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
      {metricValues.map(([label, value], index) => {
        const { icon: Icon, color, tint } = metricStyles[index]
        return <Card key={label} className="rounded-xl border border-default-200 shadow-none">
          <Card.Content className="flex items-center justify-between gap-3 p-4 sm:p-5">
            <div className="min-w-0"><p className="text-xs font-medium text-default-500">{label}</p><p className="mt-2 truncate text-2xl font-bold tracking-tight">{value}</p></div>
            <span className={`rounded-xl p-2.5 ${tint} ${color}`}><Icon size={19} aria-hidden="true" /></span>
          </Card.Content>
        </Card>
      })}
    </section>

    <div className="grid min-w-0 gap-4 xl:grid-cols-[1.4fr_0.8fr]">
      <Card className="min-w-0 rounded-xl border border-default-200 shadow-none">
        <Card.Content className="min-w-0 space-y-4 p-0">
          <div className="flex items-center justify-between gap-3 px-5 pt-5">
            <SectionTitle title="Recent orders" action={<Link href="/orders" className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-default-600 transition hover:bg-default-100">View all<ArrowUpRight size={13} /></Link>} />
          </div>
          {preview.recentOrders.length ? <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="bg-default-50 text-default-500"><tr>{["Order", "Customer", "Amount", "Status", "Date"].map((item) => <th key={item} className="px-5 py-3 font-medium">{item}</th>)}</tr></thead>
              <tbody>{preview.recentOrders.map(([id, name, amount, status, date]) => <tr key={id} className="border-t border-default-100">
                <td className="px-5 py-3 font-semibold">{id}</td>
                <td className="px-5 py-3">{name}</td>
                <td className="px-5 py-3">{amount}</td>
                <td className="px-5 py-3"><Chip size="sm" variant="soft" color={status === "Completed" ? "success" : status === "Pending" ? "warning" : "accent"}>{status}</Chip></td>
                <td className="px-5 py-3 text-default-500">{date}</td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="px-5 pb-5 text-xs text-default-500">No customer orders to show.</p>}
        </Card.Content>
      </Card>

      <Card className="min-w-0 rounded-xl border border-default-200 shadow-none">
        <Card.Content className="space-y-4 p-5">
          <SectionTitle title="Needs attention" />
          {attention.length ? <div className="space-y-2">{attention.map(({ count, label, detail, href, tone, icon: Icon }) => {
            const styles = { warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger", accent: "bg-accent/10 text-accent", success: "bg-success/10 text-success" }[tone]
            return <Link key={label} href={href} className="flex items-start gap-3 rounded-xl border border-default-100 p-3 transition hover:border-default-300 hover:bg-default-50">
              <span className={`mt-0.5 rounded-lg p-2 ${styles}`}><Icon size={15} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{count} {label}</span><span className="mt-1 block text-[11px] text-default-500">{detail}</span></span>
              <ArrowUpRight size={14} className="mt-1 shrink-0 text-default-400" aria-hidden="true" />
            </Link>
          })}</div> : <p className="rounded-xl bg-success/10 p-4 text-xs text-success">You’re all caught up. Nothing needs attention.</p>}
        </Card.Content>
      </Card>
    </div>
  </div>
}
