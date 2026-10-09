import { ArrowUpRight, Bell, Boxes, ChartNoAxesCombined, CircleDollarSign, Leaf, MapPin, MessageSquareText, Package, ShoppingBag, Users } from "lucide-react"
import { Button, Card, Chip } from "@heroui/react"
import Link from "next/link"
import Image from "next/image"
import { getAdminDashboardPreview } from "@/lib/admin-database"

export const dynamic = "force-dynamic"

const metrics = [
  { label: "Total Orders Today", value: "24", note: "+3 from yesterday", icon: ShoppingBag, color: "text-success", tint: "bg-success/10" },
  { label: "Pending Orders", value: "8", note: "Awaiting fulfillment", icon: Boxes, color: "text-warning", tint: "bg-warning/10" },
  { label: "Total Revenue (Month)", value: "₱48,320", note: "As of today", icon: CircleDollarSign, color: "text-accent", tint: "bg-accent/10" },
  { label: "Low Stock Items", value: "5", note: "Needs restocking", icon: Package, color: "text-danger", tint: "bg-danger/10" },
]
const orders = [["#ORD-0041", "Maria Santos", "₱1,200", "Pending", "Aug 14, 2026"], ["#ORD-0040", "Jose Reyes", "₱840", "Processing", "Aug 14, 2026"], ["#ORD-0039", "Ana Cruz", "₱2,100", "Shipped", "Aug 13, 2026"], ["#ORD-0038", "Pedro Lim", "₱560", "Delivered", "Aug 13, 2026"]]
const bars = [38, 52, 44, 68, 56, 78, 61, 88, 72, 94, 76, 100]

function SectionTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">{title}</h2><p className="mt-1 text-xs text-default-500">{subtitle}</p></div>{action}</div> }

export default async function Home() {
  const preview = await getAdminDashboardPreview()
  const visibleMetrics = preview?.metrics ? [
    { ...metrics[0], value: String(preview.metrics.ordersToday), note: "Demo orders created today" },
    { ...metrics[1], value: String(preview.metrics.pendingOrders), note: "Awaiting fulfillment" },
    { ...metrics[2], value: preview.metrics.revenueMonth, note: "Verified demo payments this month" },
    { ...metrics[3], value: String(preview.metrics.lowStock), note: "At or below reorder level" },
  ] : metrics
  const visibleOrders = preview?.metrics ? preview.recentOrders : orders
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
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-4 p-4"><SectionTitle title="Sales Overview" subtitle="Monthly sales performance" action={<select aria-label="Sales period" className="h-8 rounded-md border border-default-200 bg-background px-2 text-xs"><option>This year</option><option>Last year</option></select>} /><div className="flex h-48 min-w-0 items-end gap-2 border-b border-s border-default-200 px-2 pb-0 pt-4">{bars.map((height, index) => <div key={index} className="flex h-full min-w-0 flex-1 flex-col justify-end"><div className={`w-full rounded-t-sm ${index === 9 ? "bg-primary" : "bg-primary/40"}`} style={{ height: `${height}%` }} /><span className="py-2 text-center text-[10px] text-default-400">{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][index]}</span></div>)}</div><div className="flex min-w-0 items-center justify-between gap-2 text-xs text-default-500"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Monthly revenue</span><span className="flex items-center gap-1 text-primary"><ArrowUpRight size={14} /> 8.4% vs previous month</span></div></Card.Content></Card>
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-4 p-4"><SectionTitle title="Top Products" subtitle="Sales share this month" /><div className="flex min-h-56 min-w-0 flex-wrap items-center justify-center gap-5"><div className="relative size-40 shrink-0 rounded-full" style={{ background: "conic-gradient(#315f43 0 34%, #9bb8a0 34% 59%, #d6bd8a 59% 78%, #d8ded8 78% 100%)" }}><div className="absolute inset-[23px] flex flex-col items-center justify-center rounded-full bg-content1"><span className="text-xl font-bold">126</span><span className="text-[10px] text-default-500">items sold</span></div></div><div className="space-y-3 text-xs">{[["Woven Abaca Bag", "34%", "#315f43"], ["Native Rattan Basket", "25%", "#9bb8a0"], ["Bamboo Jewelry Set", "19%", "#d6bd8a"], ["Other products", "22%", "#d8ded8"]].map(([name, share, color]) => <div key={name} className="flex items-center gap-2"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color }} /><span className="min-w-0 text-default-600">{name}</span><span className="font-semibold">{share}</span></div>)}</div></div></Card.Content></Card>
  </div>
  <div className="grid min-w-0 gap-4 xl:grid-cols-[1.55fr_0.75fr]">
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-4 p-0"><div className="flex items-center justify-between px-4 pt-4"><SectionTitle title="Recent Orders" subtitle={preview?.metrics ? "Latest demo orders from Supabase" : "Latest customer transactions"} action={<Link href="/orders" className="rounded px-2 py-1 text-xs text-default-600 hover:bg-default-100">View all</Link>} /></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-default-50 text-default-500"><tr>{["Order ID", "Customer", "Amount", "Status", "Date"].map((item) => <th key={item} className="px-4 py-3 font-medium">{item}</th>)}</tr></thead><tbody>{visibleOrders.map(([id, name, amount, status, date]) => <tr key={id} className="border-t border-default-100"><td className="px-4 py-3 font-semibold">{id}</td><td className="px-4 py-3">{name}</td><td className="px-4 py-3">{amount}</td><td className="px-4 py-3"><Chip size="sm" variant="soft" color={status === "Delivered" ? "success" : status === "Pending" ? "warning" : "accent"}>{status}</Chip></td><td className="px-4 py-3 text-default-500">{date}</td></tr>)}</tbody></table></div>{preview?.metrics && visibleOrders.length === 0 && <p className="px-4 pb-4 text-xs text-default-500">No demo orders have been seeded.</p>}</Card.Content></Card>
    <Card className="min-w-0 rounded-md border border-default-200 shadow-none"><Card.Content className="min-w-0 space-y-3 p-4"><SectionTitle title="System Notifications" subtitle="Items that may need your attention" action={<Link href="/settings" aria-label="Notification settings" className="flex size-8 items-center justify-center rounded-md text-default-600 hover:bg-default-100"><Bell size={16} /></Link>} /><div className="flex gap-3 rounded-md bg-warning/10 p-3"><span className="mt-0.5 text-warning"><Users size={16} /></span><p className="text-xs leading-5"><strong className="font-semibold">5 orders awaiting confirmation</strong><br /><span className="text-default-500">Review new orders to begin fulfillment.</span></p></div><div className="flex gap-3 rounded-md bg-danger/10 p-3"><span className="mt-0.5 text-danger"><Package size={16} /></span><p className="text-xs leading-5"><strong className="font-semibold">Low stock: Woven Bag (2 left)</strong><br /><span className="text-default-500">Restock to avoid selling out.</span></p></div><div className="flex gap-3 rounded-md bg-success/10 p-3"><span className="mt-0.5 text-success"><ChartNoAxesCombined size={16} /></span><p className="text-xs leading-5"><strong className="font-semibold">New return request: #RET-007</strong><br /><span className="text-default-500">A customer request is ready for review.</span></p></div><div className="flex gap-3 rounded-md bg-accent/10 p-3"><span className="mt-0.5 text-accent"><MessageSquareText size={16} /></span><p className="text-xs leading-5"><strong className="font-semibold">2 unread customer feedback</strong><br /><span className="text-default-500">New reviews are ready to read.</span></p></div><Link href="/notifications" className="flex h-9 w-full items-center justify-center rounded-md border border-default-300 text-xs font-medium hover:bg-default-50">View all notifications</Link></Card.Content></Card>
  </div>
  <p className="border-t border-default-200 pt-3 text-[10px] text-default-400">{preview?.metrics ? "Metrics and recent orders are loaded from Supabase. Sales charts and attention items are sample previews." : "Sample dashboard preview. Live metrics will appear when the server database connection is available."}</p>
</div> }
