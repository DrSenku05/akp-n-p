import ModulePage from "@/components/admin/module-page"
import { getAdminDatabasePreview } from "@/lib/admin-database"

export const dynamic = "force-dynamic"

export default async function ProductsPage() {
  const preview = await getAdminDatabasePreview("products")
  return <ModulePage slug="products" databaseRows={preview?.rows} databaseError={preview?.error} />
}
