"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Archive, ImagePlus, PackagePlus, Search, Star, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Section = "general" | "stock" | "heritage" | "publishing"
type Product = {
  id: string; sku: string; name: string; description: string | null; category_id: string | null
  subcategory_id: string | null; price: number; stock_quantity: number; reserved_stock: number
  available_stock: number; reorder_level: number; image_url: string | null; craft_origin: string | null
  is_featured: boolean; heritage_required: boolean; visibility: "draft" | "published" | "archived"
}
type Category = { id: string; name: string; parent_category_id: string | null; archived_at: string | null }
type ProductImage = { id: string; product_id: string; image_url: string; is_primary: boolean; sort_order: number }
type Story = { product_id: string; heritage_description: string | null; origin: string | null; traditional_craft: string | null; cover_image_url: string | null }
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
  const [stories, setStories] = useState<Story[]>([])
  const [selectedId, setSelectedId] = useState("")
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
  const [newName, setNewName] = useState("")
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
    setLoading(true)
    const [p, c, i, h, admin] = await Promise.all([
      supabase.from("products").select("id,sku,name,description,category_id,subcategory_id,price,stock_quantity,reserved_stock,available_stock,reorder_level,image_url,craft_origin,is_featured,heritage_required,visibility").order("name"),
      supabase.from("product_categories").select("id,name,parent_category_id,archived_at").order("name"),
      supabase.from("product_images").select("id,product_id,image_url,is_primary,sort_order").order("sort_order"),
      supabase.from("native_heritage_stories").select("product_id,heritage_description,origin,traditional_craft,cover_image_url"),
      supabase.auth.getUser(),
    ])
    const fetchError = p.error || c.error || i.error || h.error
    if (fetchError) setNotice(`Could not load catalog: ${fetchError.message}`)
    const nextProducts = (p.data || []) as Product[]
    setProducts(nextProducts); setCategories((c.data || []) as Category[])
    setImages((i.data || []) as ProductImage[]); setStories((h.data || []) as Story[])
    if (!selectedId && nextProducts[0]) setSelectedId(nextProducts[0].id)
    if (selectedId && !nextProducts.some((item) => item.id === selectedId)) setSelectedId(nextProducts[0]?.id || "")
    if (admin.data.user) {
      const { data: adminRow } = await supabase.from("admin_users").select("role,is_active").eq("user_id", admin.data.user.id).maybeSingle()
      setRole(adminRow?.is_active ? adminRow.role : null)
      if (adminRow?.is_active && adminRow.role === "owner") {
        const { data: formatResult } = await supabase.rpc("get_product_sku_format").maybeSingle()
        const format = formatResult as { prefix: string; minimum_digits: number } | null
        if (format) { setSkuPrefix(format.prefix); setSkuDigits(String(format.minimum_digits)) }
      }
    }
    setLoading(false)
  }, [selectedId, supabase])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    void fetch("/api/admin/inventory-settings").then(async (r) => r.ok ? r.json() : null).then((data) => {
      if (data) { setThreshold(String(data.threshold)); setCanEditThreshold(data.canEdit) }
    }).catch(() => undefined)
  }, [])

  const selected = products.find((item) => item.id === selectedId) || null
  const story = stories.find((item) => item.product_id === selected?.id) || null
  const productImages = images.filter((item) => item.product_id === selected?.id)
  const topCategories = categories.filter((item) => !item.parent_category_id && !item.archived_at)
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
    setBusy(true); setNotice("")
    const { error } = await supabase.from("products").update({ name: draft.name, description: draft.description, category_id: draft.category_id, subcategory_id: draft.subcategory_id || null, price: Number(draft.price), image_url: draft.image_url }).eq("id", selected.id)
    if (error) return fail(error.message)
    setNotice("Product details saved."); setBusy(false); await load()
  }
  async function createDraft(event: React.FormEvent) {
    event.preventDefault(); if (!newName.trim() || !newImage) return fail("A product image and name are required.")
    setBusy(true); setNotice("")
    try {
      const uploaded = await upload(newImage, "products")
      const { data, error } = await supabase.rpc("create_product_draft", { p_name: newName.trim(), p_image_url: uploaded.url })
      if (error) { await supabase.storage.from("product-images").remove([uploaded.path]); return fail(error.message) }
      const created = Array.isArray(data) ? data[0] : data
      setShowCreate(false); setNewName(""); setNewImage(null); setNotice(`Draft created with SKU ${created?.sku || ""}.`)
      await load(); if (created?.id) setSelectedId(created.id)
    } catch (error) { fail(error instanceof Error ? error.message : "Could not create draft.") }
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
  async function archiveCategory(category: Category) {
    if (!confirm(`Archive “${category.name}”? Existing product assignments will stay.`)) return
    setBusy(true); const { error } = await supabase.from("product_categories").update({ archived_at: new Date().toISOString() }).eq("id", category.id)
    if (error) return fail(error.message)
    setNotice("Category archived."); setBusy(false); await load()
  }
  async function renameCategory(category: Category) {
    const name = prompt("Category name", category.name)?.trim()
    if (!name || name === category.name) return
    setBusy(true); const { error } = await supabase.from("product_categories").update({ name }).eq("id", category.id)
    if (error) return fail(error.message)
    setNotice("Category renamed."); setBusy(false); await load()
  }
  async function removeImage(image: ProductImage) {
    if (image.is_primary || !confirm("Remove this gallery image?")) return
    setBusy(true)
    const { error } = await supabase.from("product_images").delete().eq("id", image.id)
    if (error) return fail(error.message)
    try {
      const marker = "/storage/v1/object/public/product-images/"
      const path = decodeURIComponent(new URL(image.image_url).pathname.split(marker)[1] || "")
      if (path) await supabase.storage.from("product-images").remove([path])
    } catch { /* An external image URL has no product-images object to remove. */ }
    setBusy(false); setNotice("Gallery image removed."); await load()
  }
  async function permanentlyDeleteSelected() {
    if (!selected || !confirm(`Permanently delete ${selected.name}? Historical orders and movements keep their snapshots; this cannot be undone.`)) return
    setBusy(true)
    const { error } = await supabase.rpc("delete_product", { p_sku: selected.sku })
    if (error) return fail(error.message)
    const marker = "/storage/v1/object/public/product-images/"
    const urls = [...productImages.map((image) => image.image_url), story?.cover_image_url || ""]
    const paths = urls.flatMap((url) => {
      try { const path = decodeURIComponent(new URL(url).pathname.split(marker)[1] || ""); return path ? [path] : [] } catch { return [] }
    })
    if (paths.length) await supabase.storage.from("product-images").remove(paths)
    setBusy(false); setNotice("Product deleted. Historical order and inventory snapshots remain; its SKU stays reserved."); await load()
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
  async function createWalkInOrder() {
    if (!selected || selected.visibility !== "published") return
    const rawQuantity = prompt(`Quantity for ${selected.name}`)
    if (rawQuantity === null) return
    const quantity = Number(rawQuantity)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return setNotice("Enter a whole-number quantity from 1 to 99.")
    const customerName = prompt("Customer name (optional)") || null
    setBusy(true)
    const { data, error } = await supabase.rpc("create_walk_in_order", { p_items: [{ sku: selected.sku, quantity }], p_customer_name: customerName })
    if (error) return fail(error.message)
    setNotice(`Walk-in order ${data.order_number} created and ${quantity} unit(s) reserved.`); setBusy(false); await load()
  }

  return <main className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col overflow-hidden p-3 md:p-4">
    <header className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-primary">Catalog</p><h1 className="mt-0.5 text-xl font-bold">Products</h1><p className="mt-0.5 text-xs text-default-500">Manage product details, stock, heritage, and publishing in one place.</p></div>
      <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><PackagePlus size={16}/> Add product</button>
    </header>
    {notice && <div role="status" className="mb-2 flex shrink-0 items-center justify-between rounded-lg border border-default-200 bg-default-50 px-3 py-2 text-xs">{notice}<button aria-label="Dismiss" onClick={() => setNotice("")}><X size={14}/></button></div>}
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(150px,0.3fr)_minmax(0,1fr)] gap-3 xl:grid-cols-[300px_minmax(0,1fr)] xl:grid-rows-1">
      <aside className={`${cardClass} flex min-h-0 flex-col`}>
        <div className="relative mb-3"><Search className="absolute left-3 top-2.5 text-default-400" size={16}/><input className={`${inputClass} pl-9`} placeholder="Search name or SKU" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
        <div className="mb-3 grid grid-cols-2 gap-2"><select className={inputClass} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All status</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option><option value="low">Low stock</option><option value="featured">Featured</option></select><select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.parent_category_id ? "↳ " : ""}{c.name}{c.archived_at ? " (archived)" : ""}</option>)}</select><select className={`${inputClass} col-span-2`} value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Sort by name</option><option value="stock">Sort by available stock</option><option value="price">Sort by price</option></select></div>
        <div className="min-h-40 flex-1 space-y-1 overflow-y-auto" aria-label="Products list">
          {loading ? <p className="p-4 text-sm text-default-500">Loading products…</p> : visibleRows.length === 0 ? <div className="p-5 text-center text-sm text-default-500">No products match. Add a product to begin.</div> : visibleRows.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-default-100 ${selectedId === item.id ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}>
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-default-100">{item.image_url && <img src={item.image_url} alt="" className="h-full w-full object-cover"/>}</div><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.name}</span><span className="mt-1 flex flex-wrap items-center gap-1.5"><span className="truncate text-[11px] text-default-500">{item.sku}</span><span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ${visibilityClass[item.visibility]}`}>{item.visibility}</span></span><span className={`block text-xs ${item.available_stock <= Number(threshold) ? "font-semibold text-danger" : "text-default-500"}`}>Available {item.available_stock}{item.available_stock <= Number(threshold) ? " · Low stock" : ""}</span></span>{item.is_featured && <Star size={15} className="fill-accent text-accent"/>}
          </button>)}
        </div>
        <div className="mt-3 border-t border-default-200 pt-3 text-xs text-default-500">{products.length} products · {products.filter((p) => p.visibility === "published").length} published</div>
      </aside>
      <section className={`${cardClass} flex min-h-0 min-w-0 flex-col overflow-hidden p-3 md:p-4`}>
        {!selected ? <div className="grid min-h-0 flex-1 place-items-center text-center"><div><PackagePlus className="mx-auto mb-3 text-default-400" size={36}/><p className="font-semibold">Start with a product photo and name</p><p className="mt-1 text-sm text-default-500">The system assigns a permanent SKU and creates a hidden draft.</p><button onClick={() => setShowCreate(true)} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Add product</button></div></div> : <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default-200 pb-2"><div className="flex items-center gap-2.5"><div className="h-12 w-12 overflow-hidden rounded-lg bg-default-100">{selected.image_url && <img src={selected.image_url} alt="" className="h-full w-full object-cover"/>}</div><div><h2 className="text-base font-bold">{selected.name}</h2><p className="text-xs text-default-500">{selected.sku}</p></div></div><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${visibilityClass[selected.visibility]}`}>{selected.visibility}</span></div>
          <nav className="my-2 flex shrink-0 gap-1 overflow-x-auto border-b border-default-200" aria-label="Product sections">{sections.map((item) => <button key={item.id} onClick={() => { setSection(item.id); const url = new URL(window.location.href); url.searchParams.set("section", item.id); window.history.replaceState({}, "", url) }} className={`whitespace-nowrap border-b-2 px-2.5 py-1.5 text-xs font-medium ${section === item.id ? "border-accent text-accent" : "border-transparent text-default-500 hover:text-foreground"}`}>{item.title}</button>)}</nav>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {section === "general" && <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Product name</span><input className={inputClass} value={draft.name || ""} onChange={(e) => updateDraft("name", e.target.value)}/></label><label><span className={labelClass}>SKU · permanent</span><input className={`${inputClass} bg-default-100`} readOnly value={selected.sku}/></label><label className="md:col-span-2"><span className={labelClass}>Description</span><textarea className={inputClass} rows={4} value={draft.description || ""} onChange={(e) => updateDraft("description", e.target.value)}/></label>
              <label><span className={labelClass}>Category</span><select className={inputClass} value={draft.category_id || ""} onChange={(e) => { updateDraft("category_id", e.target.value || null); updateDraft("subcategory_id", null) }}><option value="">Choose category</option>{topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label><span className={labelClass}>Subcategory</span><select className={inputClass} value={draft.subcategory_id || ""} onChange={(e) => updateDraft("subcategory_id", e.target.value || null)}><option value="">None</option>{categories.filter((c) => c.parent_category_id === draft.category_id && !c.archived_at).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
            <div className={cardClass}><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Product images</h3><p className="text-xs text-default-500">One primary image plus additional gallery images.</p></div><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-default-300 px-3 py-2 text-sm"><ImagePlus size={16}/> Add image<input hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void addImage(e.target.files[0])}/></label></div><div className="flex flex-wrap gap-3">{productImages.map((image) => <figure key={image.id} className="relative h-24 w-24 overflow-hidden rounded-lg border border-default-200"><img src={image.image_url} alt="" className="h-full w-full object-cover"/>{image.is_primary ? <span className="absolute bottom-0 w-full bg-black/65 px-1 py-1 text-center text-[10px] text-white">Primary</span> : <><button onClick={() => void rpc("set_product_primary_image", { p_image_id: image.id }, "Primary image updated.")} className="absolute inset-x-1 bottom-1 rounded bg-white/90 py-1 text-[10px]">Make primary</button><button aria-label="Remove image" onClick={() => void removeImage(image)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1"><X size={12}/></button></>}</figure>)}</div></div>
            <div className={`${cardClass} space-y-3`}><div><h3 className="font-semibold">Categories</h3><p className="text-xs text-default-500">Rename or archive categories. Archiving keeps current product assignments.</p></div><form onSubmit={saveCategory} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]"><input className={inputClass} placeholder="Category name" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} required/><select className={inputClass} value={categoryParent} onChange={(e) => setCategoryParent(e.target.value)}><option value="">Top-level category</option>{topCategories.map((c) => <option key={c.id} value={c.id}>Subcategory of {c.name}</option>)}</select><button disabled={busy} className="rounded-lg border border-default-300 px-4 py-2 text-sm font-semibold">Add</button></form><div className="flex flex-wrap gap-2">{categories.filter((c) => !c.archived_at).map((c) => <span key={c.id} className="inline-flex items-center gap-2 rounded-full bg-default-100 px-3 py-1 text-xs">{c.parent_category_id ? "↳ " : ""}{c.name}<button title={`Rename ${c.name}`} onClick={() => void renameCategory(c)}><span aria-hidden="true">✎</span></button><button title={`Archive ${c.name}`} onClick={() => void archiveCategory(c)}><Archive size={13}/></button></span>)}</div></div>
            {role === "owner" && <div className={`${cardClass} grid gap-3 md:grid-cols-[1fr_1fr_auto]`}><label><span className={labelClass}>New SKU prefix</span><input className={inputClass} value={skuPrefix} maxLength={24} onChange={(e) => setSkuPrefix(e.target.value)}/></label><label><span className={labelClass}>Minimum number digits</span><input className={inputClass} type="number" min="1" max="16" value={skuDigits} onChange={(e) => setSkuDigits(e.target.value)}/></label><button onClick={() => void saveSkuFormat()} className="self-end rounded-lg border border-default-300 px-4 py-2 text-sm font-semibold">Save SKU format</button></div>}
            <button disabled={busy} onClick={() => void saveGeneral()} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Save general details</button>
          </div>}
          {section === "stock" && <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><div className={cardClass}><span className={labelClass}>Physical stock</span><p className="text-2xl font-bold text-accent">{selected.stock_quantity}</p></div><div className={cardClass}><span className={labelClass}>Reserved</span><p className="text-2xl font-bold text-warning">{selected.reserved_stock}</p></div><div className={`${cardClass} ${selected.available_stock <= Number(threshold) ? "border-danger/30 bg-danger/5" : "border-success/20 bg-success/5"}`}><span className={labelClass}>Available</span><p className={`text-2xl font-bold ${selected.available_stock <= Number(threshold) ? "text-danger" : "text-success"}`}>{selected.available_stock}</p><p className="text-xs text-default-500">Physical stock minus reserved</p></div></div>
            {selected.visibility === "published" && <button disabled={busy} onClick={() => void createWalkInOrder()} className="rounded-lg border border-default-300 px-4 py-2.5 text-sm font-semibold">Create walk-in order for this product</button>}
            <div className={`${cardClass} grid gap-4 md:grid-cols-2`}><label><span className={labelClass}>Price</span><input className={inputClass} type="number" min="0" step="0.01" value={draft.price ?? 0} onChange={(e) => updateDraft("price", Number(e.target.value))}/></label><div className="flex items-end"><button disabled={busy} onClick={() => void saveGeneral()} className="rounded-lg border border-default-300 px-4 py-2 text-sm font-semibold">Save price</button></div><div className="md:col-span-2 border-t border-default-200 pt-4"><h3 className="font-semibold">Record a stock movement</h3><p className="mb-3 text-xs text-default-500">Each entry records who changed stock, why, and before/after quantities.</p><form onSubmit={recordMovement} className="grid gap-3 md:grid-cols-2"><label><span className={labelClass}>Movement</span><select className={inputClass} value={movementType} onChange={(e) => setMovementType(e.target.value)}><option value="restock">Received</option><option value="damage">Damage</option><option value="adjustment">Correction</option></select></label>{movementType === "adjustment" && <label><span className={labelClass}>Direction</span><select className={inputClass} value={movementDirection} onChange={(e) => setMovementDirection(e.target.value)}><option>Increase</option><option>Decrease</option></select></label>}<label><span className={labelClass}>Quantity</span><input className={inputClass} type="number" min="1" step="1" value={movementQty} onChange={(e) => setMovementQty(e.target.value)} required/></label><label><span className={labelClass}>Reason</span><input className={inputClass} value={movementReason} onChange={(e) => setMovementReason(e.target.value)} maxLength={500} required/></label><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground md:col-span-2">Record movement</button></form></div></div>
            <div className={`${cardClass} flex flex-wrap items-end justify-between gap-3`}><div><h3 className="font-semibold">Global low-stock threshold</h3><p className="text-xs text-default-500">Products at or below this available quantity are flagged.</p></div><div className="flex gap-2"><input className={`${inputClass} w-28`} type="number" min="0" step="1" disabled={!canEditThreshold} value={threshold} onChange={(e) => setThreshold(e.target.value)}/>{canEditThreshold && <button onClick={() => void saveThreshold()} className="rounded-lg border border-default-300 px-3 text-sm">Save</button>}</div></div>
            <div className={cardClass}><h3 className="mb-2 font-semibold">Recent inventory history</h3>{history.length ? <div className="space-y-2">{history.map((m) => <div key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-default-100 py-2 text-xs"><span><b className="capitalize">{m.movement_type}</b> · {m.reason}<span className="block text-default-500">{m.created_by ? `Admin ${m.created_by}` : "System / order"}</span></span><span className={m.quantity_delta > 0 ? "font-semibold text-success" : m.quantity_delta < 0 ? "font-semibold text-danger" : "text-default-600"}>Physical {m.stock_before} → {m.stock_after} · Reserved {m.reserved_before} → {m.reserved_after} · {new Date(m.created_at).toLocaleString()}</span></div>)}</div> : <p className="text-sm text-default-500">No movements recorded yet.</p>}</div>
          </div>}
          {section === "heritage" && <div className="space-y-4"><div className="rounded-xl border border-accent/20 bg-accent/5 p-4"><h3 className="text-lg font-semibold text-accent">Native Heritage story</h3><p className="text-sm text-default-600">Optional unless the owner marks it required before publishing.</p></div><label><span className={labelClass}>Story</span><textarea className={inputClass} rows={6} value={storyDraft.heritage_description || ""} onChange={(e) => updateStory("heritage_description", e.target.value)}/></label><div className="grid gap-4 md:grid-cols-2"><label><span className={labelClass}>Origin / community</span><input className={inputClass} value={storyDraft.origin || ""} onChange={(e) => updateStory("origin", e.target.value)}/></label><label><span className={labelClass}>Traditional craft</span><input className={inputClass} value={storyDraft.traditional_craft || ""} onChange={(e) => updateStory("traditional_craft", e.target.value)}/></label></div><div className="flex flex-wrap items-center gap-3"><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-default-300 px-4 py-2 text-sm"><ImagePlus size={16}/> Upload heritage cover<input hidden type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); try { const uploaded = await upload(file, `heritage/${selected.sku}`); updateStory("cover_image_url", uploaded.url); setNotice("Cover uploaded. Save the story to keep it.") } catch (error) { fail(error instanceof Error ? error.message : "Could not upload cover.") } setBusy(false) }}/></label>{storyDraft.cover_image_url && <img src={storyDraft.cover_image_url} alt="Heritage cover preview" className="h-20 w-32 rounded-lg object-cover"/>}{role === "owner" && <label className="ml-auto inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.heritage_required} onChange={(e) => void rpc("set_product_heritage_required", { p_sku: selected.sku, p_required: e.target.checked }, e.target.checked ? "Heritage fields are now required." : "Heritage fields are optional.")}/> Required before publishing</label>}</div><button disabled={busy} onClick={() => void saveStory()} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Save story</button><div className={cardClass}><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.is_featured} onChange={(e) => void rpc("set_product_featured", { p_sku: selected.sku, p_featured: e.target.checked }, e.target.checked ? "Product featured." : "Product unfeatured.")}/> Feature in Native Heritage presentation</label><p className="mt-1 text-xs text-default-500">Featured selection only; the storefront keeps its current rotation behavior.</p></div></div>}
          {section === "publishing" && <div className="max-w-3xl space-y-4"><div className={cardClass}><h3 className="font-semibold">Publishing checklist</h3><ul className="mt-3 space-y-2 text-sm">{[["Name", !!selected.name.trim()], ["Primary image", !!selected.image_url], ["Category", !!selected.category_id], ["Price above zero", Number(selected.price) > 0], ["Required heritage story", !selected.heritage_required || !!(story?.heritage_description?.trim() && story.origin?.trim() && story.traditional_craft?.trim() && story.cover_image_url) ]].map(([label, ok]) => <li key={String(label)} className="flex justify-between border-b border-default-100 py-2"><span>{label}</span><span className={ok ? "text-success" : "text-danger"}>{ok ? "Ready" : "Needs attention"}</span></li>)}</ul></div><div className="flex flex-wrap gap-2">{selected.visibility !== "published" && <button disabled={busy} onClick={() => void rpc("publish_product", { p_sku: selected.sku }, "Product published.")} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Publish</button>}{selected.visibility !== "archived" && <button disabled={busy} onClick={() => void rpc("archive_product", { p_sku: selected.sku }, "Product archived.")} className="rounded-lg border border-default-300 px-4 py-2.5 text-sm font-semibold">Archive</button>}{role === "owner" && <button disabled={busy} onClick={() => void permanentlyDeleteSelected()} className="ml-auto rounded-lg border border-danger/30 px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5">Permanently delete</button>}</div><p className="text-xs text-default-500">Drafts and archived products stay hidden. Published products remain listed when stock reaches zero; checkout enforces available stock.</p></div>}
          </div>
        </>}
      </section>
    </div>
    {showCreate && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form onSubmit={createDraft} className="w-full max-w-md rounded-2xl bg-background p-5 shadow-xl"><div className="mb-4 flex items-center justify-between"><div><h2 className="text-lg font-bold">Quick-create a draft</h2><p className="text-sm text-default-500">Only an image and product name are needed.</p></div><button type="button" aria-label="Close" onClick={() => setShowCreate(false)}><X size={20}/></button></div><label className="mb-4 block"><span className={labelClass}>Product name</span><input className={inputClass} autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={200} required/></label><label className="mb-5 block"><span className={labelClass}>Product image</span><input className={inputClass} type="file" accept="image/*" onChange={(e) => setNewImage(e.target.files?.[0] || null)} required/><span className="mt-1 block text-xs text-default-500">JPG, PNG, WebP, GIF or AVIF · max 10 MB</span></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-default-300 px-4 py-2 text-sm">Cancel</button><button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create hidden draft</button></div></form></div>}
  </main>
}
