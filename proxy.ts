import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const publicPaths = new Set(["/login", "/forgot-password", "/verify-code", "/reset-password", "/password-updated", "/auth/callback"])

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (publicPaths.has(pathname) || pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return NextResponse.next({ request })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 })
    return NextResponse.redirect(new URL("/login?setup=supabase", request.url))
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const userId = typeof claims?.sub === "string" ? claims.sub : null
  if (!userId) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
    const login = new URL("/login", request.url)
    login.searchParams.set("next", pathname)
    return NextResponse.redirect(login)
  }

  const { data: admin } = await supabase.from("admin_users").select("is_active").eq("user_id", userId).maybeSingle()
  if (!admin?.is_active) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Active admin access required." }, { status: 403 })
    return NextResponse.redirect(new URL("/login?access=denied", request.url))
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
