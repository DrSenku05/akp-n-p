import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

async function activeAdmin() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return { supabase, role: null as string | null }
  const { data: admin } = await supabase.from("admin_users").select("role,is_active").eq("user_id", userId).maybeSingle()
  return { supabase, role: admin?.is_active ? admin.role as string : null }
}

export async function GET() {
  try {
    const { supabase, role } = await activeAdmin()
    if (!role || !["owner", "staff"].includes(role)) return fail("Active admin access required.", 403)
    const { data, error } = await supabase.from("store_inventory_settings").select("low_stock_threshold").eq("id", true).maybeSingle()
    if (error) return fail("Inventory settings are unavailable. Apply supabase/sql/akp_inventory_settings.sql.", 503)
    return NextResponse.json({ threshold: data?.low_stock_threshold ?? 10, canEdit: role === "owner" }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load inventory settings.", 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, role } = await activeAdmin()
    if (role !== "owner") return fail("Only an active owner can change inventory settings.", role ? 403 : 401)
    const body = await request.json() as { threshold?: unknown }
    if (typeof body.threshold !== "number" || !Number.isInteger(body.threshold) || body.threshold < 0 || body.threshold > 100000) {
      return fail("Low-stock threshold must be a whole number from 0 to 100,000.")
    }
    const { error } = await supabase.from("store_inventory_settings").upsert({ id: true, low_stock_threshold: body.threshold }, { onConflict: "id" })
    if (error) return fail("Inventory settings could not be saved. Apply supabase/sql/akp_inventory_settings.sql.", 503)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save inventory settings.", 500)
  }
}
