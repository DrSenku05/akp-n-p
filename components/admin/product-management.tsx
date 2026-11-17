"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, ArrowLeft, Cog, ImagePlus, PackagePlus, Pencil, Search, Star, Trash2, X } from "lucide-react"
import { Button, Modal } from "@heroui/react"
import { createClient } from "@/lib/supabase/client"

type Section = "general" | "stock" | "heritage" | "publishing"
type Product = {
  id: string; sku: string; name: string; description: string | null; category_id: string | null
  subcategory_id: string | null; price: number; supplier_cost: number | null; stock_quantity: number; reserved_stock: number
  available_stock: number; reorder_level: number; image_url: string | null; craft_origin: string | null
  is_featured: boolean; heritage_required: boolean; visibility: "draft" | "published" | "archived"
}
type Category = { id: string; name: string; parent_category_id: string | null; archived_at: string | null }
type ProductImage = { id: string; product_id: string; image_url: string; is_primary: boolean; sort_order: number }
type Story = { product_id: string; heritage_description: string | null; origin: string | null; traditional_craft: string | null; cover_image_url: string | null }
type ProductDialog =
  | { kind: "confirm"; title: string; description: string; confirmLabel: string; destructive?: boolean; onConfirm: () => Promise<void> }
  | { kind: "rename-category"; category: Category; name: string }
  | { kind: "walk-in-order"; product: Product; quantity: string; customerName: string }
type Movement = { id: string; movement_type: string; quantity_delta: number; reserved_delta: number; reason: string; stock_before: number; stock_after: number; reserved_before: number; reserved_after: number; created_by: string | null; created_at: string }

const sections: { id: Section; title: string }[] = [
  { id: "general", title: "General" }, { id: "stock", title: "Pricing & Stock" },
  { id: "heritage", title: "Native Heritage" }, { id: "publishing", title: "Publishing" },
]
const inputClass = "w-full rounded-lg border border-default-300 bg-background px-3 py-2 text-sm outline-none focus:border-primary"
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-default-600"
const cardClass = "rounded-xl border border-default-200 bg-background p-4"
const visibilityClass = { published: "bg-success/10 text-success", draft: "bg-warning/10 text-warning", archived: "bg-default-100 text-default-600" } as const

export default function ProductManagement({ initialSection = "general" }: { initialSection?: Section }) {
  const supabase = useMemo(() => createClient(), [])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [stories, setStories] = useState<Story[]>([])
  const [imagePreview, setImagePreview] = useState<{ url: string; alt: string } | null>(null)
  const [productDialog, setProductDialog] = useState<ProductDialog | null>(null)
  const [selectedId, setSelectedId] = useState("")
  const [isEditing, setIsEditing] = useState(false)
  const [section, setSection] = useState<Section>(initialSection)
  const [role, setRole] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [sort, setSort] = useState("name")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsTrigger = useRef<HTMLButtonElement>(null)
  const settingsBack = useRef<HTMLButtonElement>(null)
  const [newName, setNewName] = useState("")
  const [newSupplierCost, setNewSupplierCost] = useState("")
  const [newImage, setNewImage] = useState<File | null>(null)
  const [movementType, setMovementType] = useState("restock")
  const [movementQty, setMovementQty] = useState("1")
  const [movementDirection, setMovementDirection] = useState("Increase")
  const [movementReason, setMovementReason] = useState("")
  const [history, setHistory] = useState<Movement[]>([])
  const [threshold, setThreshold] = useState("10")
  const [canEditThreshold, setCanEditThreshold] = useState(false)
  const [skuPrefix, setSkuPrefix] = useState("AKP-PRD-")
  const [skuDigits, setSkuDigits] = useState("8")
  const [categoryName, setCategoryName] = useState("")
  const [categoryParent, setCategoryParent] = useState("")
  const [draft, setDraft] = useState<Partial<Product>>({})
  const [storyDraft, setStoryDraft] = useState<Partial<Story>>({})

  const load = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData.user) {
      setRole(null)
      setProducts([]); setCategories([]); setImages([]); setStories([])
      setNotice("Sign in with an active owner or staff account to load the catalog. Products are protected by admin access policies.")
      setLoading(false)
      return
    }

    const { data: adminRow, error: adminError } = await supabase
      .from("admin_users")
      .select("role,is_active")
      .eq("user_id", authData.user.id)
      .maybeSingle()
    if (adminError || !adminRow?.is_active || !["owner", "staff"].includes(adminRow.role)) {
      setRole(null)
      setProducts([]); setCategories([]); setImages([]); setStories([])
      setNotice(adminError
        ? `Could not verify catalog access: ${adminError.message}`
        : "This signed-in account is not an active owner or staff admin. The catalog is hidden by row-level security; no product rows were removed.")
      setLoading(false)
      return
    }
    setRole(adminRow.role)

    const [p, c, i, h] = await Promise.all([
      supabase.from("products").select("id,sku,name,description,category_id,subcategory_id,price,supplier_cost,stock_quantity,reserved_stock,available_stock,reorder_level,image_url,craft_origin,is_featured,heritage_required,visibility").order("name"),
      supabase.from("product_categories").select("id,name,parent_category_id,archived_at").order("name"),
      supabase.from("product_images").select("id,product_id,image_url,is_primary,sort_order").order("sort_order"),
      supabase.from("native_heritage_stories").select("product_id,heritage_description,origin,traditional_craft,cover_image_url"),
    ])
    const fetchError = p.error || c.error || i.error || h.error
    if (fetchError) setNotice(`Could not load catalog: ${fetchError.message}`)
    if (!p.error) {
      const nextProducts = p.data as Product[]
      setProducts(nextProducts)
      setSelectedId((current) => current && !nextProducts.some((item) => item.id === current) ? "" : current)
    }
    if (!c.error) setCategories(c.data as Category[])
    if (!i.error) setImages(i.data as ProductImage[])
    if (!h.error) setStories(h.data as Story[])
    if (adminRow.role === "owner") {
      const { data: formatResult } = await supabase.rpc("get_product_sku_format").maybeSingle()
      const format = formatResult as { prefix: string; minimum_digits: number } | null
      if (format) { setSkuPrefix(format.prefix); setSkuDigits(String(format.minimum_digits)) }
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { void load() }, [load])
  useEffect(() => { if (settingsOpen) settingsBack.current?.focus() }, [settingsOpen])
  useEffect(() => {
    if (!imagePreview) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setImagePreview(null) }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [imagePreview])
  useEffect(() => { setSelectedImageIds([]) }, [selectedId])
  useEffect(() => {
    void fetch("/api/admin/inventory-settings").then(async (r) => r.ok ? r.json() : null).then((data) => {
      if (data) { setThreshold(String(data.threshold)); setCanEditThreshold(data.canEdit) }
    }).catch(() => undefined)
  }, [])

  const selected = products.find((item) => item.id === selectedId) || null
  const story = stories.find((item) => item.product_id === selected?.id) || null
  const productImages = images.filter((item) => item.product_id === selected?.id)
  const deletableImages = productImages.filter((image) => !image.is_primary)
  const selectedDeletableImageIds = selectedImageIds.filter((id) => deletableImages.some((image) => image.id === id))
  const topCategories = categories.filter((item) => !item.parent_category_id && !item.archived_at)

  const selectedCategory = categories.find((c) => c.id === selected?.category_id) || null
  const selectedSubcategory = categories.find((c) => c.id === selected?.subcategory_id) || null
  const ownerEarningPerUnit = selected?.supplier_cost == null ? null : Number(selected.price) - Number(selected.supplier_cost)
  const ownerEarningFromStock = ownerEarningPerUnit == null || !selected ? null : ownerEarningPerUnit * selected.stock_quantity
  const ownerEarningPercent = ownerEarningPerUnit == null || !selected || Number(selected.price) <= 0 ? null : ownerEarningPerUnit / Number(selected.price) * 100
  const publishChecklist = [
    { label: "Name", ready: !!selected?.name.trim() },
    { label: "Primary image", ready: !!selected?.image_url },
    { label: "Category", ready: !!selectedCategory && !selectedCategory.archived_at && !selectedCategory.parent_category_id && (!selectedSubcategory || (!selectedSubcategory.archived_at && selectedSubcategory.parent_category_id === selectedCategory.id)) },
    { label: "Price above zero", ready: Number(selected?.price) > 0 },
    { label: "Required heritage story", ready: !selected?.heritage_required || !!(story?.heritage_description?.trim() && story.origin?.trim() && story.traditional_craft?.trim() && story.cover_image_url) },
  ]
  const canPublish = (role === "owner" || role === "staff") && publishChecklist.every((item) => item.ready)

  const visibleRows = products.filter((item) => {
    const matchesText = `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === "all" || (filter === "low" ? item.available_stock <= Number(threshold) : filter === "featured" ? item.is_featured : item.visibility === filter)
    const matchesCategory = categoryFilter === "all" || item.category_id === categoryFilter || item.subcategory_id === categoryFilter
    return matchesText && matchesFilter && matchesCategory
  }).sort((a, b) => sort === "stock" ? a.available_stock - b.available_stock : sort === "price" ? a.price - b.price : a.name.localeCompare(b.name))

  useEffect(() => {
    if (!selected) { setDraft({}); setStoryDraft({}); setHistory([]); return }
    setDraft({ ...selected })
    setStoryDraft({ ...(story || { product_id: selected.id }) })
    void supabase.from("inventory_movements").select("id,movement_type,quantity_delta,reserved_delta,reason,stock_before,stock_after,reserved_before,reserved_after,created_by,created_at").eq("product_id", selected.id).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => setHistory((data || []) as Movement[]))
  }, [selectedId, products, stories, selected, supabase])

  function updateDraft<K extends keyof Product>(key: K, value: Product[K]) { setDraft((old) => ({ ...old, [key]: value })) }
  function updateStory<K extends keyof Story>(key: K, value: Story[K]) { setStoryDraft((old) => ({ ...old, [key]: value })) }
  function fail(message: string) { setNotice(message); setBusy(false) }
  async function upload(file: File, folder: string) {
    if (!new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]).has(file.type) || file.size > 10 * 1024 * 1024) throw new Error("Choose a JPG, PNG, WebP, GIF, or AVIF image under 10 MB.")
    const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw error
    return { path, url: supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl }
  }
  async function saveGeneral() {
    if (!selected) return
    if (draft.supplier_cost == null) return fail("Add the supplier cost in Pricing & Stock before saving product details.")
    setBusy(true); setNotice("")
    const { error } = await supabase.rpc("save_product_details_as_draft", { p_product_id: selected.id, p_name: draft.name, p_description: draft.description, p_category_id: draft.category_id, p_subcategory_id: draft.subcategory_id || null, p_price: Number(draft.price), p_supplier_cost: draft.supplier_cost, p_image_url: draft.image_url })
    if (error) return fail(error.message)
    setNotice("Product details saved as a draft."); setBusy(false); await load()
  }
  async function savePricing() {
    if (!selected) return
    if (draft.supplier_cost == null || !Number.isFinite(Number(draft.supplier_cost)) || Number(draft.supplier_cost) < 0) return fail("Enter a valid supplier cost before saving pricing.")
    setBusy(true); setNotice("")
    const { error } = await supabase.from("products").update({ price: Number(draft.price), supplier_cost: Number(draft.supplier_cost) }).eq("id", selected.id)
    if (error) return fail(error.message)
    setNotice("Retail price and supplier cost saved."); setBusy(false); await load()
  }
  async function createDraft(event: React.FormEvent) {
    event.preventDefault(); if (!newName.trim() || !newImage || newSupplierCost === "" || !Number.isFinite(Number(newSupplierCost)) || Number(newSupplierCost) < 0) return fail("Enter a product name, supplier cost, and image.")
    setBusy(true); setNotice("")
    let stage = "uploading the product image"
    try {
      const uploaded = await upload(newImage, "products")
      stage = "creating the product draft"
      const { data, error } = await supabase.rpc("create_product_draft_with_cost", { p_name: newName.trim(), p_image_url: uploaded.url, p_supplier_cost: Number(newSupplierCost) })
      if (error) { await supabase.storage.from("product-images").remove([uploaded.path]); return fail(error.message) }
      const created = Array.isArray(data) ? data[0] : data
      setShowCreate(false); setNewName(""); setNewSupplierCost(""); setNewImage(null); setNotice(`Draft created with SKU ${created?.sku || ""}.`)
      await load(); if (created?.id) setSelectedId(created.id)
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error."
      fail(`Could not create product while ${stage}: ${detail}${stage === "uploading the product image" ? " Check that this session belongs to an active owner or staff admin; the storage upload policy checks the signed-in account." : ""}`)
    }
    setBusy(false)
  }
  async function addImage(file: File, primary = false) {
    if (!selected) return
    setBusy(true)
    try {
      const uploaded = await upload(file, `products/${selected.sku}`)
      const { data, error } = await supabase.from("product_images").insert({ product_id: selected.id, image_url: uploaded.url, is_primary: false, sort_order: productImages.length }).select("id").single()
      if (error) { await supabase.storage.from("product-images").remove([uploaded.path]); return fail(error.message) }
      if (primary || !productImages.some((item) => item.is_primary)) {
        const { error: primaryError } = await supabase.rpc("set_product_primary_image", { p_image_id: data.id })
        if (primaryError) return fail(primaryError.message)
      }
      setNotice("Image added."); await load()
    } catch (error) { fail(error instanceof Error ? error.message : "Could not upload image.") }
    setBusy(false)
  }
  async function saveStory() {
    if (!selected) return
    setBusy(true)
    const row = { product_id: selected.id, heritage_description: storyDraft.heritage_description || null, origin: storyDraft.origin || null, traditional_craft: storyDraft.traditional_craft || null, cover_image_url: storyDraft.cover_image_url || null }
    const { error } = await supabase.from("native_heritage_stories").upsert(row, { onConflict: "product_id" })
    if (error) return fail(error.message)
    setNotice("Native Heritage story saved."); setBusy(false); await load()
  }
  async function recordMovement(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return
    setBusy(true)
    const { error } = await supabase.rpc("record_product_stock_movement", { p_sku: selected.sku, p_movement: movementType, p_quantity: Number(movementQty), p_direction: movementDirection, p_reason: movementReason })
    if (error) return fail(error.message)
    setMovementReason(""); setNotice("Inventory movement recorded."); setBusy(false); await load()
  }
  async function rpc(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true); const { error } = await supabase.rpc(name, args)
    if (error) return fail(error.message)
    setNotice(success); setBusy(false); await load()
  }
  async function saveCategory(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    const { error } = await supabase.from("product_categories").insert({ name: categoryName.trim(), parent_category_id: categoryParent || null })
    if (error) return fail(error.message)
    setCategoryName(""); setNotice("Category added."); setBusy(false); await load()
  }
  function archiveCategory(category: Category) {
    setProductDialog({
      kind: "confirm", title: "Archive category", description: `Archive “${category.name}”? Existing product assignments will stay.`,
      confirmLabel: "Archive category", destructive: true,
      onConfirm: async () => {
        setBusy(true); const { error } = await supabase.from("product_categories").update({ archived_at: new Date().toISOString() }).eq("id", category.id)
        if (error) return fail(error.message)
        setNotice("Category archived."); setBusy(false); await load()
      },
    })
  }
  function renameCategory(category: Category) {
    setProductDialog({ kind: "rename-category", category, name: category.name })
  }
  async function saveRenamedCategory(category: Category, value: string) {
    const name = value.trim()
    if (!name || name === category.name) return
    setBusy(true); const { error } = await supabase.from("product_categories").update({ name }).eq("id", category.id)
    if (error) return fail(error.message)
    setNotice("Category renamed."); setBusy(false); await load()
  }
  function removeImage(image: ProductImage) {
    if (image.is_primary) return
    setProductDialog({
      kind: "confirm", title: "Remove gallery image", description: "Remove this image from the product gallery?",
      confirmLabel: "Remove image", destructive: true,
      onConfirm: async () => {
        setBusy(true)
        const { error } = await supabase.from("product_images").delete().eq("id", image.id)
        if (error) return fail(error.message)
        try {
          const marker = "/storage/v1/object/public/product-images/"
          const path = decodeURIComponent(new URL(image.image_url).pathname.split(marker)[1] || "")
          if (path) await supabase.storage.from("product-images").remove([path])
        } catch { /* An external image URL has no product-images object to remove. */ }
        setBusy(false); setNotice("Gallery image removed."); await load()
      },
    })
  }
  function removeSelectedImages() {
    if (!selected) return
    const selectedImages = deletableImages.filter((image) => selectedDeletableImageIds.includes(image.id))
    if (!selectedImages.length) return
    const productId = selected.id
    setProductDialog({
      kind: "confirm", title: "Remove selected images", description: `Remove ${selectedImages.length} selected gallery image(s)?`,
      confirmLabel: "Remove selected", destructive: true,
      onConfirm: async () => {
        setBusy(true)
        const { data: deletedRows, error } = await supabase.from("product_images").delete().in("id", selectedImages.map((image) => image.id)).eq("product_id", productId).select("id")
        if (error) return fail(error.message)
        const deletedIds = new Set((deletedRows || []).map((row) => row.id))
        const deletedImages = selectedImages.filter((image) => deletedIds.has(image.id))
        if (!deletedImages.length) return fail("No selected images were deleted. Check your admin permissions and try again.")
        setSelectedImageIds((current) => current.filter((id) => !deletedIds.has(id)))
        const marker = "/storage/v1/object/public/product-images/"
        const paths = deletedImages.flatMap((image) => {
          try {
            const path = decodeURIComponent(new URL(image.image_url).pathname.split(marker)[1] || "")
            return path ? [path] : []
          } catch {
            return []
          }
        })
        const { error: storageError } = paths.length ? await supabase.storage.from("product-images").remove(paths) : { error: null }
        await load()
        setBusy(false)
        const skippedCount = selectedImages.length - deletedImages.length
        setNotice(storageError
          ? `${deletedImages.length} gallery image record(s) removed, but some stored files could not be deleted: ${storageError.message}`
          : skippedCount
            ? `${deletedImages.length} gallery image(s) removed. ${skippedCount} selected image(s) could not be deleted.`
            : `Selected ${deletedImages.length} gallery image(s) removed.`)
      },
    })
  }
  function permanentlyDeleteSelected() {
    if (!selected) return
    const product = selected
    const urls = [...productImages.map((image) => image.image_url), story?.cover_image_url || ""]
    setProductDialog({
      kind: "confirm", title: "Permanently delete product", description: `Permanently delete ${product.name}? Historical orders and inventory movements keep their snapshots; this cannot be undone.`,
      confirmLabel: "Permanently delete", destructive: true,
      onConfirm: async () => {
        setBusy(true)
        const { error } = await supabase.rpc("delete_product", { p_sku: product.sku })
        if (error) return fail(error.message)
        const marker = "/storage/v1/object/public/product-images/"
        const paths = urls.flatMap((url) => {
          try { const path = decodeURIComponent(new URL(url).pathname.split(marker)[1] || ""); return path ? [path] : [] } catch { return [] }
        })
        if (paths.length) await supabase.storage.from("product-images").remove(paths)
        setBusy(false); setNotice("Product deleted. Historical order and inventory snapshots remain; its SKU stays reserved."); await load()
      },
    })
  }
  async function saveThreshold() {
    const response = await fetch("/api/admin/inventory-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threshold: Number(threshold) }) })
    const body = await response.json()
    setNotice(response.ok ? "Low-stock threshold saved." : body.error || "Could not save threshold.")
  }
  async function saveSkuFormat() {
    const { error } = await supabase.rpc("set_product_sku_format", { p_prefix: skuPrefix, p_minimum_digits: Number(skuDigits) })
    setNotice(error ? error.message : "SKU format saved. Existing SKUs remain unchanged.")
  }
  function createWalkInOrder() {
    if (!selected || selected.visibility !== "published") return
    setProductDialog({ kind: "walk-in-order", product: selected, quantity: "", customerName: "" })
  }
  async function saveWalkInOrder(product: Product, rawQuantity: string, customerName: string) {
    const quantity = Number(rawQuantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return setNotice("Enter a whole-number quantity from 1 to 99.")
    setBusy(true)
    const { data, error } = await supabase.rpc("create_walk_in_order", { p_items: [{ sku: product.sku, quantity }], p_customer_name: customerName.trim() || null })
    if (error) return fail(error.message)
    setNotice(`Walk-in order ${data.order_number} created and ${quantity} unit(s) reserved.`); setBusy(false); await load()
  }

  return <main className="mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden p-2 sm:p-3">
    <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">Catalog</p><h1 className="mt-0.5 text-xl font-bold">Products</h1><p className="mt-0.5 text-xs text-default-500">Manage product details, stock, heritage, and publishing in one place.</p></div>
      <div className="flex items-center gap-2">
        <button ref={settingsTrigger} type="button" aria-label="Product settings" aria-expanded={settingsOpen} aria-controls="product-settings-drawer" onClick={() => setSettingsOpen(true)} className="inline-flex size-9 items-center justify-center rounded-lg border border-default-400 bg-background transition-colors hover:border-accent hover:bg-accent/10"><Cog size={17}/></button>
        <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg border border-primary bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><PackagePlus size={16}/> Add product</button>
      </div>
    </header>
    {notice && <div role="status" className="mb-2 flex shrink-0 items-center justify-between rounded-lg border border-default-200 bg-default-50 px-3 py-2 text-xs">{notice}<button aria-label="Dismiss" onClick={() => setNotice("")} className="rounded-md border border-default-300 p-1 hover:border-accent"><X size={14}/></button></div>}
    <div data-has-selection={Boolean(selected)} className="product-selector-layout grid min-h-0 flex-1 gap-3">
      <aside className={`${cardClass} flex min-h-0 flex-col`}>
        <div className="relative mb-3"><Search className="absolute left-3 top-2.5 text-default-400" size={16}/><input className={`${inputClass} pl-9`} placeholder="Search name or SKU" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
        <div className="mb-3 grid grid-cols-2 gap-2"><select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All status</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option><option value="low">Low stock</option><option value="featured">Featured</option></select><select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parent_category_id ? "↳ " : ""}{c.name}{c.archived_at ? " (archived)" : ""}</option>)}</select><select className={`${inputClass} col-span-2`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Sort by name</option><option value="stock">Sort by available stock</option><option value="price">Sort by price</option></select></div>
        <div className="min-h-40 flex-1 space-y-1 overflow-y-auto" aria-label="Products list">
          {loading ? <p className="p-4 text-sm text-default-500">Loading products…</p> : visibleRows.length === 0 ? <div className="p-5 text-center text-sm text-default-500">No products match. Add a product to begin.</div> : visibleRows.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setIsEditing(false) }} className={`product-selector-row flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-default-100 ${selectedId === item.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}>
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-default-100">{item.image_url && <img src={item.image_url} alt="" className="h-full w-full object-cover"/>}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="mt-1 flex flex-wrap items-center gap-1.5"><span className="truncate text-[11px] text-default-500">{item.sku}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${visibilityClass[item.visibility]}`}>{item.visibility}</span></span><span className={`block text-xs ${item.available_stock <= Number(threshold) ? "font-semibold text-danger" : "text-default-500"}`}>Available {item.available_stock}{item.available_stock <= Number(threshold) ? " · Low stock" : ""}</span></span>{item.is_featured && <Star size={15} className="fill-accent text-accent"/>}
          </button>)}
        </div>
        <div className="mt-3 border-t border-default-200 pt-3 text-xs text-default-500">{products.length} products · {products.filter((p) => p.visibility === "published").length} published</div>
      </aside>
      <section className={`${cardClass} flex min-h-0 min-w-0 flex-col overflow-hidden p-3 md:p-4`}>
        {!selected ? <div className="grid min-h-0 flex-1 place-items-center text-center"><div><PackagePlus className="mx-auto mb-3 text-default-400" size={36}/><p className="font-semibold">Select a product to view details</p><p className="mt-1 text-sm text-default-500">Your product list stays here while extended details open beside it.</p><button onClick={() => setShowCreate(true)} className="mt-4 rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add product</button></div></div> : <div key={selected.id} className="product-panel-enter flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default-200 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="h-12 w-12 overflow-hidden rounded-lg bg-default-100">{selected.image_url && <img src={selected.image_url} alt="" className="h-full w-full object-cover"/>}</div>
              <div>
                <h2 className="text-base font-bold">{selected.name}</h2>
                <p className="text-xs text-default-500">{selected.sku}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${visibilityClass[selected.visibility]}`}>{selected.visibility}</span>
              {isEditing ? (
                <>
                  <button type="button" disabled={!canPublish || busy || selected.visibility === "published"} onClick={() => void rpc("publish_product", { p_sku: selected.sku }, "Product published.")} className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
                    Publish
                  </button>
                  <button type="button" disabled={busy || draft.supplier_cost == null} onClick={() => void saveGeneral()} className="inline-flex items-center gap-1.5 rounded-lg border border-default-400 bg-background px-3 py-1.5 text-xs font-semibold hover:border-accent disabled:opacity-50">
                    Save as draft
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                  <Pencil size={14}/> Edit product
                </button>
              )}
            </div>
          </div>
          {isEditing && (
            <nav className="my-2 flex shrink-0 gap-1 overflow-x-auto border-b border-default-200" aria-label="Product sections">{sections.map((item) => <button key={item.id} onClick={() => { setSection(item.id); const url = new URL(window.location.href); url.searchParams.set("section", item.id); window.history.replaceState({}, "", url) }} className={`whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs font-medium ${section === item.id ? "border-accent text-accent" : "border-transparent text-default-500 hover:text-foreground"}`}>{item.title}</button>)}</nav>
          )}
          <div className="product-detail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div key={isEditing ? "edit" : "view"} className={`product-mode-enter ${isEditing ? "product-mode-enter-forward" : "product-mode-enter-back"}`}>
          {!isEditing ? (
            <div className="space-y-4 pt-1">
              {/* Quick Actions & Highlights */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-default-200 bg-default-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-default-500">Quick actions:</span>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("general") }} className="rounded-md border border-default-300 bg-background px-2.5 py-1 text-xs font-medium hover:border-accent">Edit info</button>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("stock") }} className="rounded-md border border-default-300 bg-background px-2.5 py-1 text-xs font-medium hover:border-accent">Adjust stock</button>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("heritage") }} className="rounded-md border border-default-300 bg-background px-2.5 py-1 text-xs font-medium hover:border-accent">Heritage story</button>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("publishing") }} className="rounded-md border border-default-300 bg-background px-2.5 py-1 text-xs font-medium hover:border-accent">Publishing</button>
                </div>
                {selected.visibility === "published" && (
                  <button type="button" disabled={busy} onClick={() => void createWalkInOrder()} className="rounded-md border border-default-400 bg-background px-3 py-1 text-xs font-semibold hover:border-accent">
                    + Walk-in order
                  </button>
                )}
              </div>

              {/* Product and inventory overview */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className={cardClass}>
                  <span className={labelClass}>Price</span>
                  <p className="text-2xl font-bold text-foreground">₱{Number(selected.price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-default-500">Retail price</p>
                </div>
                <div className={cardClass}>
                  <span className={labelClass}>Physical stock</span>
                  <p className="text-2xl font-bold text-accent">{selected.stock_quantity}</p>
                  <p className="text-xs text-default-500">Total units on hand</p>
                </div>
                <div className={cardClass}>
                  <span className={labelClass}>Reserved</span>
                  <p className="text-2xl font-bold text-warning">{selected.reserved_stock}</p>
                  <p className="text-xs text-default-500">Held for pending orders</p>
                </div>
                <div className={`${cardClass} ${selected.available_stock <= Number(threshold) ? "border-danger/30 bg-danger/5" : "border-success/20 bg-success/5"}`}>
                  <span className={labelClass}>Available</span>
                  <p className={`text-2xl font-bold ${selected.available_stock <= Number(threshold) ? "text-danger" : "text-success"}`}>{selected.available_stock}</p>
                  <p className="text-xs text-default-500">{selected.available_stock <= Number(threshold) ? "At or below threshold" : "Ready for order"}</p>
                </div>
              </div>
              <div className={`${cardClass} flex flex-wrap items-center justify-between gap-3`}>
                <div><span className={labelClass}>Estimated owner earnings</span><p className="text-xs text-default-500">Current retail price minus supplier cost, multiplied by physical stock. Before promotions and other costs.</p></div>
                {ownerEarningFromStock == null ? <p className="text-sm font-semibold text-default-500">Add supplier cost to calculate</p> : <div className="text-right"><p className={`text-2xl font-bold ${ownerEarningFromStock < 0 ? "text-danger" : "text-success"}`}>₱{ownerEarningFromStock.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-xs text-default-500">{selected.stock_quantity} units · ₱{ownerEarningPerUnit!.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} each{ownerEarningPercent == null ? "" : ` · ${ownerEarningPercent.toFixed(1)}%`}</p></div>}
              </div>

              {/* Main Specifications & Categories */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className={`${cardClass} space-y-3`}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-default-500">General Information</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-default-100 pb-1.5">
                      <span className="text-default-500">Product Name:</span>
                      <span className="font-semibold text-foreground text-right">{selected.name}</span>
                    </div>
                    <div className="flex justify-between border-b border-default-100 pb-1.5">
                      <span className="text-default-500">SKU:</span>
                      <span className="font-mono text-xs font-semibold text-foreground">{selected.sku}</span>
                    </div>
                    <div className="flex justify-between border-b border-default-100 pb-1.5">
                      <span className="text-default-500">Category:</span>
                      <span className="font-medium text-foreground">{selectedCategory?.name || "Uncategorized"}</span>
                    </div>
                    {selectedSubcategory && (
                      <div className="flex justify-between border-b border-default-100 pb-1.5">
                        <span className="text-default-500">Subcategory:</span>
                        <span className="font-medium text-foreground">{selectedSubcategory.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-b border-default-100 pb-1.5">
                      <span className="text-default-500">Visibility:</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${visibilityClass[selected.visibility]}`}>{selected.visibility}</span>
                    </div>
                    <div className="flex justify-between border-b border-default-100 pb-1.5">
                      <span className="text-default-500">Featured in Heritage:</span>
                      <span className="font-medium text-foreground">{selected.is_featured ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-default-500">Heritage Required:</span>
                      <span className="font-medium text-foreground">{selected.heritage_required ? "Yes (by owner)" : "Optional"}</span>
                    </div>
                  </div>
                </div>

                <div className={`${cardClass} flex flex-col justify-between space-y-3`}>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-default-500 mb-2">Description</h3>
                    <p className="text-sm leading-relaxed text-default-700 whitespace-pre-wrap">
                      {selected.description ? selected.description : <span className="italic text-default-400">No description provided yet.</span>}
                    </p>
                  </div>
                  {selected.craft_origin && (
                    <div className="border-t border-default-100 pt-2 text-xs">
                      <span className="text-default-500">Craft / Origin: </span>
                      <span className="font-medium text-foreground">{selected.craft_origin}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Gallery Images */}
              <div className={cardClass}>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">Product Gallery ({productImages.length} images)</h3>
                    <p className="text-xs text-default-500">Primary display image and supplemental views</p>
                  </div>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("general") }} className="text-xs text-primary hover:underline">Manage images</button>
                </div>
                {productImages.length ? (
                  <div className="flex flex-wrap gap-3">
                    {productImages.map((image) => (
                      <figure key={image.id} className="relative h-24 w-24 overflow-hidden rounded-lg border border-default-200">
                        <button type="button" aria-label={`Preview ${selected.name} gallery image`} onClick={() => setImagePreview({ url: image.image_url, alt: `${selected.name} gallery image` })} className="h-full w-full"><img src={image.image_url} alt="" className="h-full w-full object-cover"/></button>
                        {image.is_primary && <span className="absolute bottom-0 w-full bg-black/65 px-1 py-1 text-center text-[10px] text-white">Primary</span>}
                      </figure>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs italic text-default-400">No gallery images uploaded.</p>
                )}
              </div>

              {/* Native Heritage Story */}
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-accent text-sm">Native Heritage & Artisan Story</h3>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("heritage") }} className="text-xs text-accent hover:underline">Edit story</button>
                </div>
                {story?.heritage_description || story?.origin || story?.traditional_craft || story?.cover_image_url ? (
                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <div className="space-y-2 text-xs text-default-700">
                      {story.origin && <p><b className="text-default-900">Origin / Community:</b> {story.origin}</p>}
                      {story.traditional_craft && <p><b className="text-default-900">Traditional Craft:</b> {story.traditional_craft}</p>}
                      {story.heritage_description && (
                        <p className="mt-1 leading-relaxed whitespace-pre-wrap text-sm text-foreground">{story.heritage_description}</p>
                      )}
                    </div>
                    {story.cover_image_url && (
                      <div className="shrink-0">
                        <p className="text-[11px] text-default-500 mb-1">Cover Image</p>
                        <img src={story.cover_image_url} alt="Cover preview" className="h-24 w-36 rounded-lg border border-default-200 object-cover"/>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs italic text-default-500">No Native Heritage story recorded for this product yet.</p>
                )}
              </div>

              {/* Recent Inventory Movements */}
              <div className={cardClass}>
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">Recent Inventory History</h3>
                    <p className="text-xs text-default-500">Audit trail of stock received, damaged, or adjusted</p>
                  </div>
                  <button type="button" onClick={() => { setIsEditing(true); setSection("stock") }} className="text-xs text-primary hover:underline">Record movement</button>
                </div>
                {history.length ? (
                  <div className="space-y-2">
                    {history.slice(0, 5).map((m) => (
                      <div key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-default-100 py-2 text-xs">
                        <span>
                          <b className="capitalize text-foreground">{m.movement_type}</b> · {m.reason}
                          <span className="block text-default-500">{m.created_by ? `Admin ${m.created_by}` : "System / order"}</span>
                        </span>
                        <span className={m.quantity_delta > 0 ? "font-semibold text-success" : m.quantity_delta < 0 ? "font-semibold text-danger" : "text-default-600"}>
                          Physical {m.stock_before} → {m.stock_after} · Reserved {m.reserved_before} → {m.reserved_after} · {new Date(m.created_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-default-500">No inventory movements recorded yet.</p>
                )}
              </div>
            </div>
          ) : (
            <>
          {section === "general" && <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Product name</span><input className={inputClass} value={draft.name || ""} onChange={(e) => updateDraft("name", e.target.value)}/></label><label className="md:col-span-2"><span className={labelClass}>Description</span><textarea className={inputClass} rows={4} value={draft.description || ""} onChange={(e) => updateDraft("description", e.target.value)}/></label>
              <label><span className={labelClass}>Category</span><select className={inputClass} value={draft.category_id || ""} onChange={(e) => { updateDraft("category_id", e.target.value || null); updateDraft("subcategory_id", null) }}><option value="">Choose category</option>{topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span className={labelClass}>Subcategory</span><select className={inputClass} value={draft.subcategory_id || ""} onChange={(e) => updateDraft("subcategory_id", e.target.value || null)}><option value="">None</option>{categories.filter((c) => c.parent_category_id === draft.category_id && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
            <div className={cardClass}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="font-semibold">Product images</h3><p className="text-xs text-default-500">One primary image plus additional gallery images.</p></div>
                <div className="flex items-center gap-2">
                  {deletableImages.length > 0 && <button type="button" onClick={() => setSelectedImageIds(selectedDeletableImageIds.length === deletableImages.length ? [] : deletableImages.map((image) => image.id))} className="rounded-lg border border-default-400 px-3 py-2 text-xs font-medium">{selectedDeletableImageIds.length === deletableImages.length ? "Clear selection" : "Select all"}</button>}
                  <button type="button" disabled={busy || selectedDeletableImageIds.length === 0} onClick={() => void removeSelectedImages()} className="inline-flex items-center gap-1.5 rounded-lg border border-danger/50 px-3 py-2 text-xs font-medium text-danger disabled:opacity-50"><Trash2 size={14}/> Delete selected ({selectedDeletableImageIds.length})</button>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-default-400 px-3 py-2 text-sm hover:border-accent"><ImagePlus size={16}/> Add image<input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void addImage(e.target.files[0])}/></label>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">{productImages.map((image) => <figure key={image.id} className="relative h-24 w-24 overflow-hidden rounded-lg border border-default-200">
                <button type="button" aria-label={`Preview ${selected.name} gallery image`} onClick={() => setImagePreview({ url: image.image_url, alt: `${selected.name} gallery image` })} className="h-full w-full"><img src={image.image_url} alt="" className="h-full w-full object-cover"/></button>
                <input type="checkbox" aria-label={`Select ${selected.name} gallery image for deletion`} disabled={image.is_primary || busy} checked={selectedImageIds.includes(image.id)} onChange={(event) => setSelectedImageIds((current) => event.target.checked ? [...current, image.id] : current.filter((id) => id !== image.id))} className="absolute left-1 top-1 h-4 w-4 accent-red-600"/>
                {image.is_primary ? <span className="absolute bottom-0 w-full bg-black/65 px-1 py-1 text-center text-[10px] text-white">Primary</span> : <><button type="button" onClick={() => void rpc("set_product_primary_image", { p_image_id: image.id }, "Primary image updated.")} className="absolute inset-x-1 bottom-1 rounded border border-default-400 bg-background/95 py-1 text-[10px]">Make primary</button><button type="button" aria-label="Remove image" onClick={() => void removeImage(image)} className="absolute right-1 top-1 rounded-full border border-default-400 bg-background/95 p-1"><X size={12}/></button></>}
              </figure>)}</div>
            </div>
          </div>}
          {section === "stock" && <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><div className={cardClass}><span className={labelClass}>Physical stock</span><p className="text-2xl font-bold text-accent">{selected.stock_quantity}</p></div><div className={cardClass}><span className={labelClass}>Reserved</span><p className="text-2xl font-bold text-warning">{selected.reserved_stock}</p></div><div className={`${cardClass} ${selected.available_stock <= Number(threshold) ? "border-danger/30 bg-danger/5" : "border-success/20 bg-success/5"}`}><span className={labelClass}>Available</span><p className={`text-2xl font-bold ${selected.available_stock <= Number(threshold) ? "text-danger" : "text-success"}`}>{selected.available_stock}</p><p className="text-xs text-default-500">Physical stock minus reserved</p></div></div>
            {selected.visibility === "published" && <button disabled={busy} onClick={() => void createWalkInOrder()} className="rounded-lg border border-default-400 px-4 py-2.5 text-sm font-semibold hover:border-accent">Create walk-in order for this product</button>}
            <div className={`${cardClass} grid gap-4 md:grid-cols-2`}><label><span className={labelClass}>Retail price</span><input className={inputClass} type="number" min="0" step="0.01" value={draft.price ?? 0} onChange={(e) => updateDraft("price", Number(e.target.value))}/></label><label><span className={labelClass}>Supplier cost per item (bought price)</span><input className={inputClass} type="number" min="0" max="9999999999.99" step="0.01" required value={draft.supplier_cost ?? ""} onChange={(e) => updateDraft("supplier_cost", e.target.value === "" ? null : Number(e.target.value))}/></label><button disabled={busy || draft.supplier_cost == null} onClick={() => void savePricing()} className="justify-self-start rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save pricing</button><div className="md:col-span-2 border-t border-default-200 pt-4"><h3 className="font-semibold">Record a stock movement</h3><p className="mb-3 text-xs text-default-500">Each entry records who changed stock, why, and before/after quantities.</p><form onSubmit={recordMovement} className="grid gap-3 md:grid-cols-2"><label><span className={labelClass}>Movement</span><select className={inputClass} value={movementType} onChange={(e) => setMovementType(e.target.value)}><option value="restock">Received</option><option value="damage">Damage</option><option value="adjustment">Correction</option></select></label>{movementType === "adjustment" && <label><span className={labelClass}>Direction</span><select className={inputClass} value={movementDirection} onChange={(e) => setMovementDirection(e.target.value)}><option>Increase</option><option>Decrease</option></select></label>}<label><span className={labelClass}>Quantity</span><input className={inputClass} type="number" min="1" step="1" value={movementQty} onChange={(e) => setMovementQty(e.target.value)} required/></label><label><span className={labelClass}>Reason</span><input className={inputClass} value={movementReason} onChange={(e) => setMovementReason(e.target.value)} maxLength={500} required/></label><button disabled={busy} className="rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground md:col-span-2">Record movement</button></form></div></div>
            <div className={cardClass}><h3 className="mb-2 font-semibold">Recent inventory history</h3>{history.length ? <div className="space-y-2">{history.map((m) => <div key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-default-100 py-2 text-xs"><span><b className="capitalize">{m.movement_type}</b> · {m.reason}<span className="block text-default-500">{m.created_by ? `Admin ${m.created_by}` : "System / order"}</span></span><span className={m.quantity_delta > 0 ? "font-semibold text-success" : m.quantity_delta < 0 ? "font-semibold text-danger" : "text-default-600"}>Physical {m.stock_before} → {m.stock_after} · Reserved {m.reserved_before} → {m.reserved_after} · {new Date(m.created_at).toLocaleString()}</span></div>)}</div> : <p className="text-sm text-default-500">No movements recorded yet.</p>}</div>
          </div>}
          {section === "heritage" && <div className="space-y-4"><div className="rounded-xl border border-accent/20 bg-accent/5 p-4"><h3 className="text-lg font-semibold text-accent">Native Heritage story</h3><p className="text-sm text-default-600">Optional unless the owner marks it required before publishing.</p></div><label><span className={labelClass}>Story</span><textarea className={inputClass} rows={6} value={storyDraft.heritage_description || ""} onChange={(e) => updateStory("heritage_description", e.target.value)}/></label><div className="grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Origin / community</span><input className={inputClass} value={storyDraft.origin || ""} onChange={(e) => updateStory("origin", e.target.value)}/></label><label><span className={labelClass}>Traditional craft</span><input className={inputClass} value={storyDraft.traditional_craft || ""} onChange={(e) => updateStory("traditional_craft", e.target.value)}/></label></div><div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-default-400 px-4 py-2 text-sm hover:border-accent"><ImagePlus size={16}/> Upload heritage cover<input hidden type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { const uploaded = await upload(file, `heritage/${selected.sku}`); updateStory("cover_image_url", uploaded.url); setNotice("Cover uploaded. Save the story to keep it.") } catch (error) { fail(error instanceof Error ? error.message : "Could not upload cover.") } setBusy(false) }}/></label>{storyDraft.cover_image_url && <img src={storyDraft.cover_image_url} alt="Heritage cover preview" className="h-20 w-32 rounded-lg object-cover"/>}{role === "owner" && <label className="ml-auto inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.heritage_required} onChange={(e) => void rpc("set_product_heritage_required", { p_sku: selected.sku, p_required: e.target.checked }, e.target.checked ? "Heritage fields are now required." : "Heritage fields are optional.")}/> Required before publishing</label>}</div><button disabled={busy} onClick={() => void saveStory()} className="rounded-lg border border-primary bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Save story</button><div className={cardClass}><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.is_featured} onChange={(e) => void rpc("set_product_featured", { p_sku: selected.sku, p_featured: e.target.checked }, e.target.checked ? "Product featured." : "Product unfeatured.")}/> Feature in Native Heritage presentation</label><p className="mt-1 text-xs text-default-500">Featured selection only; the storefront keeps its current rotation behavior.</p></div></div>}
          {section === "publishing" && <div className="w-full space-y-4"><div className={cardClass}><h3 className="font-semibold">Publishing checklist</h3><ul className="mt-3 space-y-2 text-sm">{publishChecklist.map(({ label, ready }) => <li key={label} className="flex justify-between border-b border-default-100 py-2"><span>{label}</span><span className={ready ? "text-success" : "text-danger"}>{ready ? "Ready" : "Needs attention"}</span></li>)}</ul></div><div className="flex flex-wrap gap-2">{selected.visibility !== "published" && <button disabled={busy || !canPublish} onClick={() => void rpc("publish_product", { p_sku: selected.sku }, "Product published.")} className="rounded-lg border border-primary bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">Publish</button>}{selected.visibility !== "archived" && <button disabled={busy} onClick={() => void rpc("archive_product", { p_sku: selected.sku }, "Product archived.")} className="rounded-lg border border-default-400 px-4 py-2.5 text-sm font-semibold hover:border-accent">Archive</button>}{role === "owner" && <button disabled={busy} onClick={() => void permanentlyDeleteSelected()} className="ml-auto rounded-lg border border-danger/50 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5">Permanently delete</button>}</div><p className="text-xs text-default-500">Drafts and archived products stay hidden. Published products remain listed when stock reaches zero; checkout enforces available stock.</p></div>}
          </>)}
          </div>
          </div>
        </div>}
      </section>
    </div>
    <Modal.Backdrop isOpen={Boolean(productDialog)} onOpenChange={(open) => { if (!open) setProductDialog(null) }}>
      <Modal.Container>
        <Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>{productDialog?.kind === "confirm" ? productDialog.title : productDialog?.kind === "rename-category" ? "Rename category" : productDialog?.kind === "walk-in-order" ? "Create walk-in order" : ""}</Modal.Heading></Modal.Header>
          <Modal.Body>
            {productDialog?.kind === "rename-category"
              ? <label className="block space-y-1.5 text-sm"><span className={labelClass}>Category name</span><input autoFocus className={inputClass} value={productDialog.name} maxLength={80} onChange={(event) => setProductDialog((current) => current?.kind === "rename-category" ? { ...current, name: event.target.value } : current)} /></label>
              : productDialog?.kind === "walk-in-order"
                ? <div className="space-y-3"><p className="text-sm font-medium">{productDialog.product.name}</p><label className="block space-y-1.5 text-sm"><span className={labelClass}>Quantity</span><input autoFocus className={inputClass} type="number" min="1" max="99" step="1" value={productDialog.quantity} onChange={(event) => setProductDialog((current) => current?.kind === "walk-in-order" ? { ...current, quantity: event.target.value } : current)} /></label><label className="block space-y-1.5 text-sm"><span className={labelClass}>Customer name (optional)</span><input className={inputClass} value={productDialog.customerName} onChange={(event) => setProductDialog((current) => current?.kind === "walk-in-order" ? { ...current, customerName: event.target.value } : current)} /></label></div>
                : <p className="text-sm leading-6 text-default-600">{productDialog?.kind === "confirm" ? productDialog.description : ""}</p>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline" slot="close">Cancel</Button>
            <Button
              variant={productDialog?.kind === "confirm" && productDialog.destructive ? "danger" : "primary"}
              isDisabled={productDialog?.kind === "rename-category" && (!productDialog.name.trim() || productDialog.name.trim() === productDialog.category.name) || productDialog?.kind === "walk-in-order" && (!Number.isInteger(Number(productDialog.quantity)) || Number(productDialog.quantity) < 1 || Number(productDialog.quantity) > 99)}
              onPress={() => {
                const pending = productDialog
                setProductDialog(null)
                if (pending?.kind === "rename-category") void saveRenamedCategory(pending.category, pending.name)
                else if (pending?.kind === "walk-in-order") void saveWalkInOrder(pending.product, pending.quantity, pending.customerName)
                else if (pending?.kind === "confirm") void pending.onConfirm()
              }}
            >{productDialog?.kind === "rename-category" ? "Save category" : productDialog?.kind === "walk-in-order" ? "Create order" : productDialog?.kind === "confirm" ? productDialog.confirmLabel : "Confirm"}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
    {imagePreview && <div className="fixed inset-0 z-[70] grid place-items-center p-4">
      <button type="button" data-preserve-button-hover aria-label="Close image preview" onClick={() => setImagePreview(null)} style={{ backgroundColor: "rgb(0 0 0 / 55%)" }} className="absolute inset-0 border-0"/>
      <div role="dialog" aria-modal="true" aria-label="Image preview" className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
        <button type="button" autoFocus aria-label="Close image preview" onClick={() => setImagePreview(null)} className="absolute -right-3 -top-3 z-10 rounded-full border border-default-300 bg-background p-2 text-foreground shadow-lg"><X size={18}/></button>
        <img src={imagePreview.url} alt={imagePreview.alt} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"/>
      </div>
    </div>}
    {showCreate && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={createDraft} className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Quick-create a draft</h2><p className="text-sm text-default-500">Enter the name, supplier cost, and primary image.</p></div><button type="button" aria-label="Close" onClick={() => setShowCreate(false)} className="rounded-lg border border-default-400 p-1 hover:border-accent"><X size={20}/></button></div><label className="mb-4 block"><span className={labelClass}>Product name</span><input className={inputClass} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} required/></label><label className="mb-4 block"><span className={labelClass}>Supplier cost per item (bought price)</span><input className={inputClass} type="number" min="0" max="9999999999.99" step="0.01" value={newSupplierCost} onChange={(e) => setNewSupplierCost(e.target.value)} required/></label><label className="mb-5 block"><span className={labelClass}>Product image</span><input className={inputClass} type="file" accept="image/*" onChange={(e) => setNewImage(e.target.files?.[0] || null)} required/><span className="mt-1 block text-xs text-default-500">JPG, PNG, WebP, GIF or AVIF · max 10 MB</span></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-default-400 px-4 py-2 text-sm hover:border-accent">Cancel</button><button disabled={busy} className="rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create hidden draft</button></div></form></div>}
    <div aria-hidden={!settingsOpen} className={`fixed inset-0 z-[60] transition-opacity duration-300 ${settingsOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <aside id="product-settings-drawer" role="dialog" aria-modal={settingsOpen} aria-label="Product settings" inert={!settingsOpen} className={`absolute inset-y-0 right-0 flex w-[min(26rem,92vw)] flex-col border-l border-default-200 bg-background shadow-2xl transition-transform duration-300 ease-out ${settingsOpen ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex min-h-[60px] items-center gap-3 border-b border-default-200 px-4">
          <button ref={settingsBack} type="button" aria-label="Back to products" onClick={() => { setSettingsOpen(false); settingsTrigger.current?.focus() }} className="flex size-9 items-center justify-center rounded-lg border border-default-300 transition-colors hover:border-accent hover:bg-accent/10"><ArrowLeft size={18}/></button>
          <h2 className="text-sm font-semibold">Product settings</h2>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section className={`${cardClass} space-y-3`}>
            <div><h3 className="font-semibold">Global low-stock threshold</h3><p className="text-xs text-default-500">One threshold applies to all products. Items at or below this available quantity are flagged.</p></div>
            <div className="flex items-end gap-2"><label className="flex-1"><span className={labelClass}>Available units</span><input className={inputClass} type="number" min="0" max="100000" step="1" disabled={!canEditThreshold} value={threshold} onChange={(e) => setThreshold(e.target.value)}/></label>{canEditThreshold && <button type="button" onClick={() => void saveThreshold()} className="rounded-lg border border-default-400 px-4 py-2 text-sm font-semibold hover:border-accent">Save threshold</button>}</div>
          </section>
          {role === "owner" && <section className={`${cardClass} space-y-3`}>
            <div><h3 className="font-semibold">SKU formatting</h3><p className="text-xs text-default-500">Changes apply to newly created products. Existing SKUs remain unchanged.</p></div>
            <label><span className={labelClass}>SKU prefix</span><input className={inputClass} value={skuPrefix} maxLength={24} onChange={(e) => setSkuPrefix(e.target.value)}/></label>
            <label><span className={labelClass}>Minimum number digits</span><input className={inputClass} type="number" min="1" max="16" value={skuDigits} onChange={(e) => setSkuDigits(e.target.value)}/></label>
            <button type="button" onClick={() => void saveSkuFormat()} className="rounded-lg border border-default-400 px-4 py-2 text-sm font-semibold hover:border-accent">Save SKU format</button>
          </section>}
          <section className={`${cardClass} space-y-3`}>
            <div><h3 className="font-semibold">Product categories</h3><p className="text-xs text-default-500">Create top-level categories or subcategories, and rename or archive existing ones.</p></div>
            <form onSubmit={saveCategory} className="space-y-2">
              <input className={inputClass} placeholder="Category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} maxLength={80} required/>
              <select className={inputClass} value={categoryParent} onChange={(e) => setCategoryParent(e.target.value)}><option value="">Top-level category</option>{topCategories.map((category) => <option key={category.id} value={category.id}>Subcategory of {category.name}</option>)}</select>
              <button type="submit" disabled={busy} className="rounded-lg border border-primary bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add category</button>
            </form>
            <div className="space-y-2">{categories.filter((category) => !category.archived_at).map((category) => <div key={category.id} className="flex items-center justify-between gap-2 rounded-lg border border-default-200 px-3 py-2 text-sm"><span className="min-w-0 truncate">{category.parent_category_id ? "↳ " : ""}{category.name}</span><span className="flex shrink-0 gap-1"><button type="button" title={`Rename ${category.name}`} onClick={() => void renameCategory(category)} className="rounded border border-default-300 px-2 py-1 text-xs hover:border-accent hover:text-accent">Rename</button><button type="button" title={`Archive ${category.name}`} onClick={() => void archiveCategory(category)} className="rounded border border-default-300 px-2 py-1 text-xs hover:border-accent hover:text-accent">Archive</button></span></div>)}</div>
          </section>
        </div>
      </aside>
    </div>
  </main>
}
