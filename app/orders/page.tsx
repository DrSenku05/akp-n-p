import ModulePage from "@/components/admin/module-page"
import { getAdminDatabasePreview } from "@/lib/admin-database"

export const dynamic = "force-dynamic"

export default async function OrdersPage() {
  const orders = await getAdminDatabasePreview("orders")
  return <ModulePage slug="orders" databaseRows={orders?.rows} assignableOrders={orders?.assignableOrders} unassignableOrders={orders?.unassignableOrders} databaseError={orders?.error} />
}
