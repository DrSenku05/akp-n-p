import { ArrowUpRight, Bell, Boxes, CircleDollarSign, Leaf, MapPin, Package, ShoppingBag } from "lucide-react"
import { Button, Card, Chip } from "@heroui/react"
import Link from "next/link"
import Image from "next/image"
import { getAdminDashboardPreview } from "@/lib/admin-database"

export const dynamic = "force-dynamic"

const metricIcons = [ShoppingBag, Boxes, CircleDollarSign, Package]
const metricStyles = [["text-success", "bg-success/10"], ["text-warning", "bg-warning/10"], ["text-accent", "bg-accent/10"], ["text-danger", "bg-danger/10"]]
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function SectionTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-default-500">{subtitle}</p></div>{action}</div> }

export default async function Home() {
  const preview = await getAdminDashboardPreview()
  const metricValues = [
    ["Orders Today", String(preview.metrics.ordersToday), "Orders placed today"],
    ["Pending Orders", String(preview.metrics.pendingOrders), "Awaiting fulfillment"],
    ["Verified Revenue (Month)", preview.metrics.revenueMonth, "Verified payments this month"],
    ["Low Stock Items", String(preview.metrics.lowStock), "At or below reorder level"],
  ] as const
  const visibleMetrics = metricValues.map(([label, value, note], index) => ({ label, value, note, icon: metricIcons[index], color: metricStyles[index][0], tint: metricStyles[index][1] }))
  const visibleOrders = preview.recentOrders
  const maxSales = Math.max(...preview.monthlySales, 0)
  const maxProductUnits = Math.max(...preview.topProducts.map(([, units]) => units), 0)
  const attention = [
    { count: preview.metrics.pendingOrders, label: "orders awaiting action", detail: "Review orders to continue fulfillment.", href: "/orders", tone: "warning", icon: Boxes },
    { count: preview.metrics.lowStock, label: "products at or below reorder level", detail: "Review inventory and restock as needed.", href: "/inventory", tone: "danger", icon: Package },
    { count: preview.metrics.openReturns, label: "open return requests", detail: "Review customer return requests.", href: "/returns-refunds", tone: "accent", icon: Bell },
    { count: preview.metrics.flaggedFeedback, label: "flagged feedback items", detail: "Review feedback requiring moderation.", href: "/feedback", tone: "success", icon: Bell },
  ].filter((item) => item.count > 0)
  const today = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date())
  return <div className="mx-auto max-w-[1540px] space-y-5 text-foreground">
  {preview?.error && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">Could not load dashboard records from Supabase. Check the server database connection.</div>}
  <div className="flex flex-wrap items-center gap-2 text-xs text-default-400"><span>Dashboard</span><span>/</span><span className="text-default-700">Overview</span></div>
  <section className="relative isolate min-h-[188px] overflow-hidden rounded-2xl border border-amber-900/15 bg-content1 shadow-lg shadow-amber-950/5 sm:min-h-[204px]">
    <Image src="/images/banig-badian.jpg" alt="Banig from Badian, Cebu" fill priority sizes="(max-width: 768px) 100vw, 1540px" className="object-cover object-[58%_46%]" />
    <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/10 dark:via-background/65 dark:to-background/0" />
    <div className="relative flex min-h-[188px] items-end justify-between gap-4 p-5 sm:min-h-[204px] sm:p-7">
      <div className="max-w-xl">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent"><Leaf size={12} />Gawang Pilipino</span>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-default-500">{today}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-default-600">A clear view of the orders, people, and locally made goods in your care.</p>
      </div>
      <div className="hidden items-end gap-4 sm:flex">
        <p className="mb-0.5 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-[10px] font-medium text-white backdrop-blur-sm"><MapPin size={12} />Banig from Badian · Cebu</p>
        <Link href="/reports" className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-default-300 bg-content1/85 px-3 text-xs font-medium shadow-sm backdrop-blur transition hover:bg-content1"><ArrowUpRight size={15} />View reports</Link>
      </div>
      <Link href="/reports" className="absolute right-4 top-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-default-300 bg-content1/85 px-2.5 text-[11px] font-medium shadow-sm backdrop-blur transition hover:bg-content1 sm:hidden"><ArrowUpRight size={14} />Reports</Link>
    </div>
  </section>
  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{visibleMetrics.map(({ label, value, note, icon: Icon, color, tint }) => <Card key={label} className="rounded-md border border-default-200 shadow-none"><Card.Content className="flex items-start justify-between gap-3 p-4"><div><p className="text-xs font-medium text-default-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-[11px] text-default-500">{note}</p></div><span className={`rounded-md p-2 ${tint} ${color}`}><Icon size={18} /></span></Card.Content></Card>)}</div>
  <div className="grid min-w-0 gap-4 xl:grid-cols-2">
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-4 p-4"><SectionTitle title="Sales Overview" subtitle="Verified payment totals by month" /><div className="flex h-48 min-w-0 items-end gap-2 border-b border-s border-default-200 px-2 pb-0 pt-4">{preview.monthlySales.map((amount, index) => <div key={index} className="flex h-full min-w-0 flex-1 flex-col justify-end"><div className={`w-full rounded-t-sm ${amount > 0 ? "bg-primary/70" : "bg-default-200"}`} style={{ height: `${maxSales ? Math.max((amount / maxSales) * 100, amount ? 4 : 0) : 0}%` }} /><span className="py-2 text-center text-[10px] text-default-400">{months[index]}</span></div>)}</div><div className="flex min-w-0 items-center gap-2 text-xs text-default-500"><span className="size-2 rounded-full bg-primary" />Monthly verified revenue</div></Card.Content></Card>
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-4 p-4"><SectionTitle title="Top Products" subtitle="Units in completed orders" />{preview.topProducts.length ? <div className="space-y-4">{preview.topProducts.map(([name, units]) => <div key={name} className="space-y-1.5"><div className="flex justify-between gap-3 text-xs"><span className="truncate text-default-600">{name}</span><span className="font-semibold">{units}</span></div><div className="h-2 overflow-hidden rounded-full bg-default-100"><div className="h-full rounded-full bg-primary" style={{ width: `${maxProductUnits ? (units / maxProductUnits) * 100 : 0}%` }} /></div></div>)}</div> : <p className="py-12 text-center text-xs text-default-500">No completed-order product sales yet.</p>}</Card.Content></Card>
  </div>
  <div className="grid min-w-0 gap-4 xl:grid-cols-[1.55fr_0.75fr]">
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-4 p-0"><div className="flex items-center justify-between px-4 pt-4"><SectionTitle title="Recent Orders" subtitle="Latest orders from the database" action={<Link href="/orders" className="rounded px-2 py-1 text-xs text-default-600 hover:bg-default-100">View all</Link>} /></div>{visibleOrders.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-default-50 text-default-500"><tr>{["Order ID", "Customer", "Amount", "Status", "Date"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody>{visibleOrders.map(([id, name, amount, status, date]) => <tr key={id} className="border-t border-default-100"><td className="px-4 py-3 font-semibold">{id}</td><td className="px-4 py-3">{name}</td><td className="px-4 py-3">{amount}</td><td className="px-4 py-3"><Chip size="sm" variant="soft" color={status === "Completed" ? "success" : status === "Pending" ? "warning" : "accent"}>{status}</Chip></td><td className="px-4 py-3 text-default-500">{date}</td></tr>)}</tbody></table></div> : <p className="px-4 pb-4 text-xs text-default-500">No customer orders to show.</p>}</Card.Content></Card>
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-3 p-4"><SectionTitle title="Needs Attention" subtitle="Live counts from current records" action={<Link href="/notifications" aria-label="View notifications" className="flex size-8 items-center justify-center rounded-md text-default-600 hover:bg-default-100"><Bell size={16} /></Link>} />{attention.length ? attention.map(({ count, label, detail, href, tone, icon: Icon }) => { const styles = { warning: "bg-warning/10 text-warning", danger: "bg-danger/10 text-danger", accent: "bg-accent/10 text-accent", success: "bg-success/10 text-success" }[tone]; return <Link key={label} href={href} className={`flex gap-3 rounded-md p-3 ${styles}`}><span className="mt-0.5"><Icon size={16} /></span><p className="text-xs leading-5"><strong className="font-semibold">{count} {label}</strong><br /><span className="text-default-500">{detail}</span></p></Link> }) : <p className="rounded-md bg-success/10 p-3 text-xs text-success">Nothing currently requires attention.</p>}<Link href="/notifications" className="flex h-9 w-full items-center justify-center rounded-md border border-default-300 text-xs font-medium hover:bg-default-50">View all notifications</Link></Card.Content></Card>
  </div>
</div> }
