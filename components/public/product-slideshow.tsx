"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

type Slide = { id: string; name: string; image_url: string }

const fallback: Slide = { id: "akp", name: "Every piece carries a story worth keeping.", image_url: "/images/banig-badian.jpg" }

export default function ProductSlideshow() {
  const [slides, setSlides] = useState<Slide[]>([fallback])
  const [active, setActive] = useState(0)

  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        const { data, error } = await createClient().from("products")
          .select("id,name,image_url,is_featured")
          .eq("visibility", "published")
          .not("image_url", "is", null)
          .order("is_featured", { ascending: false })
          .order("name")
          .limit(8)
        if (!mounted || error || !data?.length) return
        const loaded = data.filter((item) => item.image_url?.trim()).map(({ id, name, image_url }) => ({ id, name, image_url }))
        const preloaded = await Promise.all(loaded.map(async (item) => {
          const image = new window.Image()
          image.src = item.image_url
          try {
            await image.decode()
            return item
          } catch {
            return null
          }
        }))
        const ready = preloaded.filter((item): item is Slide => item !== null)
        if (mounted && ready.length) setSlides(ready)
      } catch {
        // Keep the local hero image when Supabase is unavailable.
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 5000)
    return () => window.clearInterval(timer)
  }, [slides.length])

  const move = (direction: number) => setActive((current) => (current + direction + slides.length) % slides.length)
  const slide = slides[active] || fallback

  return <div className="relative mx-auto w-full max-w-[36rem] lg:ml-auto">
    <div className="absolute -inset-3 rotate-2 rounded-[2rem] border border-accent/15 bg-accent/5" />
    <div className="relative aspect-[4/4.25] overflow-hidden rounded-[1.7rem] border border-default-200 bg-default-100 shadow-2xl shadow-foreground/10 sm:aspect-[4/3.7]">
      {slides.map((item, index) => <img key={item.id} src={item.image_url} alt={index === active ? (item.id === "akp" ? "Woven native craft displayed in warm light" : item.name) : ""} aria-hidden={index !== active} className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-1000 ease-out motion-reduce:transition-none ${index === active ? "scale-[1.035] opacity-100" : "scale-100 opacity-0"}`} />)}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
      <div key={slide.id} className="absolute inset-x-0 bottom-0 p-6 text-white transition-opacity duration-500 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-white/75">Craft · Culture · Community</p>
        <p className="mt-2 max-w-sm font-serif text-2xl leading-tight sm:text-3xl">{slide.name}</p>
      </div>
      {slides.length > 1 && <>
        <button type="button" aria-label="Previous product image" onClick={() => move(-1)} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur hover:bg-black/60"><ChevronLeft size={20} /></button>
        <button type="button" aria-label="Next product image" onClick={() => move(1)} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/35 text-white backdrop-blur hover:bg-black/60"><ChevronRight size={20} /></button>
        <div className="absolute right-5 top-5 rounded-full bg-black/40 px-3 py-1 text-xs text-white">{active + 1} / {slides.length}</div>
      </>}
    </div>
    <div className="absolute -bottom-5 -left-3 rounded-2xl border border-default-200 bg-content1/95 px-4 py-3 shadow-xl backdrop-blur-xl sm:-left-8 sm:px-5">
      <p className="text-[10px] font-medium uppercase tracking-[.16em] text-default-500">AKP Native Products</p>
      <p className="mt-1 text-sm font-semibold">Inspired by heritage</p>
    </div>
  </div>
}
