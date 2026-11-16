import ProductManagement from "@/components/admin/product-management"

export const dynamic = "force-dynamic"

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams
  const initialSection = section === "stock" || section === "heritage" || section === "publishing" ? section : "general"
  return <ProductManagement initialSection={initialSection} />
}
