import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowDownToLine, ArrowRight, Leaf, Smartphone } from "lucide-react"

export const metadata: Metadata = {
  title: "AKP Native Products Trading",
  description: "Discover native products and heritage stories from AKP Native Products Trading.",
}

const customerAppDownload = "https://github.com/DrSenku05/akp-n-p/releases/download/customer-app-v1.0.0-code3/AKP-Customer-v1.0.0-code3.apk"

export default function Home() {
  return <main className="min-h-dvh overflow-hidden bg-background text-foreground">
    <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
      <Link href="/" aria-label="AKP Native Products Trading home" className="flex min-w-0 items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 font-serif text-sm font-bold tracking-wide text-accent">AKP</span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold tracking-tight">AKP Native Products Trading</span><span className="mt-0.5 block text-[10px] uppercase tracking-[.18em] text-default-500">Native craft · Living heritage</span></span>
      </Link>
      <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-5">
        <a href="#our-story" className="hidden text-sm text-default-600 transition hover:text-accent sm:inline">Our story</a>
        <a href="#heritage" className="hidden text-sm text-default-600 transition hover:text-accent sm:inline">Heritage</a>
        <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-full border border-default-300 bg-content1 px-4 text-sm font-medium transition hover:border-accent hover:bg-default-50">Admin login</Link>
      </nav>
    </header>

    <section className="relative isolate mx-auto grid min-h-[min(760px,calc(100svh-5rem))] w-full max-w-7xl items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:gap-14 lg:px-12 lg:pb-24 lg:pt-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-20 -z-10 size-[34rem] rounded-full bg-accent/10 blur-3xl" />
      <div className="relative z-10 max-w-2xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-content1/80 px-3 py-1.5 text-xs font-medium text-accent shadow-sm"><Leaf size={14} aria-hidden="true" />Rooted in Filipino heritage</div>
        <h1 className="font-serif text-5xl font-medium leading-[1.04] tracking-[-.045em] sm:text-6xl lg:text-7xl">Native heritage,<br /><span className="text-accent">made part of life.</span></h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-default-600 sm:text-lg sm:leading-8">Discover native products and the stories, materials, and traditions that give them meaning.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <a href={customerAppDownload} className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground shadow-lg shadow-accent/15 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><ArrowDownToLine size={17} aria-hidden="true" />Download customer app</a>
          <a href="#our-story" className="inline-flex h-12 items-center gap-2 rounded-full border border-default-300 bg-content1/80 px-5 text-sm font-medium transition hover:border-accent hover:bg-content1">Explore AKP<ArrowRight size={15} aria-hidden="true" /></a>
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs text-default-500"><Smartphone size={14} aria-hidden="true" />Android app · APK download</p>
      </div>

      <div className="relative mx-auto w-full max-w-[36rem] lg:ml-auto">
        <div className="absolute -inset-3 rotate-2 rounded-[2rem] border border-accent/15 bg-accent/5" />
        <div className="relative aspect-[4/4.25] overflow-hidden rounded-[1.7rem] border border-default-200 bg-default-100 shadow-2xl shadow-foreground/10 sm:aspect-[4/3.7]">
          <Image src="/images/banig-badian.jpg" alt="Sculptural woven native craft displayed in warm light" fill priority sizes="(max-width: 1024px) 90vw, 44vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-white/75">Craft · Culture · Community</p>
            <p className="mt-2 max-w-sm font-serif text-2xl leading-tight sm:text-3xl">Every piece carries a story worth keeping.</p>
          </div>
        </div>
        <div className="absolute -bottom-5 -left-3 rounded-2xl border border-default-200 bg-content1/95 px-4 py-3 shadow-xl backdrop-blur-xl sm:-left-8 sm:px-5">
          <p className="text-[10px] font-medium uppercase tracking-[.16em] text-default-500">AKP Native Products</p>
          <p className="mt-1 text-sm font-semibold">Inspired by heritage</p>
        </div>
      </div>
    </section>

    <section id="our-story" className="border-y border-default-200 bg-content1/65">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 md:grid-cols-[.8fr_1.2fr] md:items-center md:py-20 lg:px-12">
        <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">A little about AKP</p><h2 className="mt-3 max-w-sm font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Keeping native products close to everyday life.</h2></div>
        <p className="max-w-2xl text-sm leading-7 text-default-600 sm:text-base sm:leading-8">AKP Native Products Trading brings together products shaped by local craft and cultural heritage. We invite you to explore the collection, learn about the traditions behind it, and connect with AKP through the customer app.</p>
      </div>
    </section>

    <section id="heritage" className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-12 sm:px-8 md:flex-row md:items-center md:py-16 lg:px-12">
      <div><p className="text-xs font-semibold uppercase tracking-[.2em] text-accent">Explore with AKP</p><h2 className="mt-2 font-serif text-2xl tracking-tight sm:text-3xl">Bring the collection to your phone.</h2><p className="mt-2 text-sm text-default-600">Get the AKP Native Products customer app for Android.</p></div>
      <a href={customerAppDownload} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition hover:opacity-90"><ArrowDownToLine size={16} aria-hidden="true" />Download customer app</a>
    </section>

    <footer className="border-t border-default-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-xs text-default-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <span>© {new Date().getFullYear()} AKP Native Products Trading</span>
        <Link href="/login" className="w-fit transition hover:text-accent">Admin login</Link>
      </div>
    </footer>
  </main>
}
