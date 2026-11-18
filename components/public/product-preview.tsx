"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Star } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Product = {
  id: string
  name: string
  price: number
  image_url: string
  average_rating: number | null
  review_count: number | null
}
type RatingSummary = { product_id: string; average_rating: number; review_count: number }

export default function ProductPreview() {
  const [products, setProducts] = useState<Product[]>([])
  const [ratingsAvailable, setRatingsAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const carousel = useRef<HTMLDivElement>(null)
  const scrollFrame = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const supabase = createClient()
        const [{ data: productRows, error: productsError }, { data: ratingRows, error: ratingsError }] = await Promise.all([
          supabase.from("products").select("id,name,price,image_url,is_featured")
            .eq("visibility", "published").not("image_url", "is", null)
            .order("is_featured", { ascending: false }).order("name").limit(12),
          supabase.rpc("get_published_product_rating_summaries"),
        ])
        if (!mounted) return
        if (!productsError && productRows) {
          const ratings = new Map<string, RatingSummary>(Array.from(ratingRows ?? [], (row: RatingSummary) => [row.product_id, row] as const))
          setProducts(productRows.filter((item) => item.image_url?.trim()).map((item) => {
            const summary = ratings.get(item.id)
            return {
              id: item.id,
              name: item.name,
              price: item.price,
              image_url: item.image_url,
              average_rating: ratingsError || !summary || Number(summary.review_count) === 0 ? null : Number(summary.average_rating),
              review_count: ratingsError || !summary ? null : Number(summary.review_count),
            }
          }))
          setRatingsAvailable(!ratingsError)
        }
      } catch {
        // Keep the product preview empty if the public catalog is unavailable.
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (products.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = window.setInterval(() => scroll(1), 6500)
    return () => {
      window.clearInterval(timer)
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
    }
  }, [products.length])

  const scroll = (direction: number) => {
    const element = carousel.current
    const card = element?.querySelector<HTMLElement>("[data-product-card]")
    if (!element || !card) return
    const distance = card.offsetWidth + 16
    const atEnd = element.scrollLeft + element.clientWidth >= element.scrollWidth - 8
    const atStart = element.scrollLeft <= 8
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
    if (reducedMotion) {
      if (direction > 0 && atEnd) element.scrollTo({ left: 0, behavior: "auto" })
      else if (direction < 0 && atStart) element.scrollTo({ left: element.scrollWidth, behavior: "auto" })
      else element.scrollBy({ left: distance * direction, behavior: "auto" })
      return
    }

    const start = element.scrollLeft
    const max = element.scrollWidth - element.clientWidth
    const target = direction > 0 && atEnd ? 0 : direction < 0 && atStart ? max : Math.max(0, Math.min(max, start + distance * direction))
    const beganAt = performance.now()
    const duration = 1800
    const animate = (now: number) => {
      const progress = Math.min((now - beganAt) / duration, 1)
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - Math.pow(-2 * progress + 2, 3) / 2
      element.scrollLeft = start + (target - start) * eased
      if (progress < 1) scrollFrame.current = window.requestAnimationFrame(animate)
      else scrollFrame.current = null
    }
    scrollFrame.current = window.requestAnimationFrame(animate)
  }

  if (!loading && products.length === 0) return null

  return <section aria-labelledby="product-preview-title" className="border-y border-default-200 bg-content1/55 py-12 sm:py-16">
    <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">From the collection</p><h2 id="product-preview-title" className="mt-2 font-serif text-2xl tracking-tight sm:text-3xl">A few things to discover</h2><p className="mt-2 text-sm text-default-600">Published products from the AKP collection.</p></div>
        {products.length > 1 && <div className="flex shrink-0 gap-2"><button type="button" aria-label="Previous products" onClick={() => scroll(-1)} className="grid size-10 place-items-center rounded-full border border-default-300 bg-content1 transition hover:border-accent hover:text-accent"><ArrowLeft size={17}/></button><button type="button" aria-label="Next products" onClick={() => scroll(1)} className="grid size-10 place-items-center rounded-full border border-default-300 bg-content1 transition hover:border-accent hover:text-accent"><ArrowRight size={17}/></button></div>}
      </div>
      <div ref={carousel} style={{ maskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)" }} className="flex gap-4 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Featured product preview">
        {products.map((product) => <article data-product-card key={product.id} className="w-[82%] shrink-0 overflow-hidden rounded-2xl border border-default-200 bg-content1 shadow-sm sm:w-[48%] lg:w-[32%]">
          <div className="relative aspect-[4/3] overflow-hidden bg-default-100"><img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 hover:scale-105 motion-reduce:transition-none"/></div>
          <div className="p-4"><div className="flex items-start justify-between gap-3"><h3 className="line-clamp-2 text-sm font-semibold leading-5">{product.name}</h3><span className="shrink-0 text-sm font-semibold text-accent">{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 }).format(product.price)}</span></div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-default-600"><Star size={14} className="fill-amber-400 text-amber-500" aria-hidden="true"/>{product.average_rating === null ? <span>{ratingsAvailable ? "No ratings yet" : "Rating unavailable"}</span> : <span>{product.average_rating.toFixed(1)} · {product.review_count} {product.review_count === 1 ? "review" : "reviews"}</span>}</div>
          </div>
        </article>)}
      </div>
    </div>
  </section>
}
