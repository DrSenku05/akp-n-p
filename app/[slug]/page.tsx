import ModulePage from "@/components/admin/module-page"
import { getAdminDatabasePreview } from "@/lib/admin-database"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AdminModuleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug === "payments") redirect("/orders")
  if (slug === "inventory") redirect("/products?section=stock")
  if (slug === "heritage-showcase") redirect("/products?section=heritage")
  const preview = await getAdminDatabasePreview(slug)
  return <ModulePage slug={slug} databaseRows={preview?.rows} databaseAnnouncements={preview?.announcements} assignableOrders={preview?.assignableOrders} unassignableOrders={preview?.unassignableOrders} databaseError={preview?.error} />
}
