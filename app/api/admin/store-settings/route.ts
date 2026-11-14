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
    const { data, error } = await supabase.from("store_settings")
      .select("store_name,currency_code,return_window_days")
      .eq("id", true)
      .maybeSingle()
    if (error) return fail("Store settings are unavailable. Apply supabase/sql/akp_customer_returns.sql.", 503)
    if (!data) return fail("Store settings have not been initialized.", 503)
    return NextResponse.json({
      storeName: data.store_name,
      currencyCode: data.currency_code,
      returnWindowDays: data.return_window_days,
      canEdit: role === "owner",
    }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load store settings.", 500)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, role } = await activeAdmin()
    if (role !== "owner") return fail("Only an active owner can change store settings.", role ? 403 : 401)
    const body = await request.json() as { storeName?: unknown; currencyCode?: unknown; returnWindowDays?: unknown }
    const storeName = typeof body.storeName === "string" ? body.storeName.trim() : ""
    if (storeName.length < 2 || storeName.length > 120) return fail("Store name must be between 2 and 120 characters.")
    if (body.currencyCode !== undefined && body.currencyCode !== "PHP") return fail("This store currently supports Philippine pesos only.")
    if (typeof body.returnWindowDays !== "number" || !Number.isInteger(body.returnWindowDays) || body.returnWindowDays < 1 || body.returnWindowDays > 365) {
      return fail("Return window must be a whole number from 1 to 365 days.")
    }

    const { data, error } = await supabase.from("store_settings")
      .update({ store_name: storeName, currency_code: "PHP", return_window_days: body.returnWindowDays })
      .eq("id", true)
      .select("store_name,currency_code,return_window_days")
      .maybeSingle()
    if (error) return fail("Store settings could not be saved.", 503)
    if (!data) return fail("Store settings were not updated. Confirm that your owner account can edit them.", 403)
    return NextResponse.json({
      ok: true,
      storeName: data.store_name,
      currencyCode: data.currency_code,
      returnWindowDays: data.return_window_days,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save store settings.", 500)
  }
}
