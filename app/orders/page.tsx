import OrderOperationsWorkspace from "@/components/admin/order-operations-workspace"
import ModulePage from "@/components/admin/module-page"
import { getAdminDatabasePreview } from "@/lib/admin-database"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

const sections = ["orders", "payments", "inventory"] as const

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams
  const activeSection = sections.includes(section as (typeof sections)[number]) ? section as (typeof sections)[number] : "orders"
  const [orders, payments, inventory] = await Promise.all([
    getAdminDatabasePreview("orders"),
    getAdminDatabasePreview("payments"),
    getAdminDatabasePreview("inventory"),
  ])

  if (!orders && !payments && !inventory) redirect("/")

  return <OrderOperationsWorkspace activeSection={activeSection}>
    {activeSection === "orders" ? <ModulePage slug="orders" databaseRows={orders?.rows} assignableOrders={orders?.assignableOrders} unassignableOrders={orders?.unassignableOrders} databaseError={orders?.error} /> : null}
    {activeSection === "payments" ? <ModulePage slug="payments" databaseRows={payments?.rows} databaseError={payments?.error} /> : null}
    {activeSection === "inventory" ? <ModulePage slug="inventory" databaseRows={inventory?.rows} databaseError={inventory?.error} /> : null}
  </OrderOperationsWorkspace>
}
