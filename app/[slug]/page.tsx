import ModulePage from "@/components/admin/module-page"
import { getAdminDatabasePreview } from "@/lib/admin-database"

export const dynamic = "force-dynamic"

export default async function AdminModuleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const preview = await getAdminDatabasePreview(slug)
  return <ModulePage slug={slug} databaseRows={preview?.rows} databaseAnnouncements={preview?.announcements} databaseError={preview?.error} />
}
