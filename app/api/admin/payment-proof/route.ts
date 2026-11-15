import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path") ?? ""
  if (!/^[0-9a-f-]{36}\/checkout-[a-zA-Z0-9-]+\/receipt\.(jpg|png|webp)$/i.test(path)) {
    return NextResponse.json({ error: "Invalid receipt path." }, { status: 400 })
  }
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return NextResponse.json({ error: "Sign in required." }, { status: 401 })
  const { data: admin } = await supabase.from("admin_users").select("role,is_active").eq("user_id", userId).maybeSingle()
  if (!admin?.is_active || !["owner", "staff"].includes(admin.role)) {
    return NextResponse.json({ error: "Active admin access required." }, { status: 403 })
  }
  const { data, error } = await supabase.storage.from("customer-payment-proofs").createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not open this receipt." }, { status: 404 })
  return NextResponse.redirect(data.signedUrl, 302)
}
