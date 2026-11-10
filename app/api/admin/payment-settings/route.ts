import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type Settings = { account_name: string; account_number: string; qr_url: string | null; qr_path: string | null; enabled: boolean }
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
    const { data, error } = await supabase.from("store_payment_settings").select("account_name,account_number,qr_url,qr_path,enabled").eq("id", true).maybeSingle()
    if (error) return fail("Payment settings are not available yet. Ask the database session to provision store_payment_settings.", 503)
    const settings = data as Settings | null
    return NextResponse.json({ canEdit: role === "owner", settings: settings ? { accountName: settings.account_name, accountNumber: settings.account_number, qrUrl: settings.qr_url ?? "", qrPath: settings.qr_path ?? "", enabled: settings.enabled } : null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return fail(error instanceof Error ? error.message : "Could not load payment settings.", 500) }
}

export async function PUT(request: NextRequest) {
  try {
    const { supabase, role } = await activeAdmin()
    if (role !== "owner") return fail("Only an active owner can change GCash settings.", role ? 403 : 401)
    const body = await request.json() as { accountName?: unknown; accountNumber?: unknown; qrUrl?: unknown; qrPath?: unknown; enabled?: unknown }
    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : ""
    const accountNumber = typeof body.accountNumber === "string" ? body.accountNumber.trim() : ""
    const qrUrl = typeof body.qrUrl === "string" ? body.qrUrl.trim() : ""
    const qrPath = typeof body.qrPath === "string" ? body.qrPath.trim() : ""
    if (accountName.length < 2 || accountName.length > 100) return fail("Enter a valid GCash account name (2–100 characters).")
    if (!/^[0-9 +()-]{7,24}$/.test(accountNumber) || accountNumber.replace(/\D/g, "").length < 7) return fail("Enter a valid GCash number.")
    if (body.enabled !== false && (!qrUrl || !qrPath.startsWith("payment/"))) return fail("Upload a QR image before enabling GCash.")
    if (qrUrl && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !qrUrl.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/gcash-payment/payment/`))) return fail("QR image must be uploaded to the AKP payment image storage folder.")
    if (qrPath && !/^payment\/[a-zA-Z0-9._-]+$/.test(qrPath)) return fail("Invalid QR image storage path.")
    const { error } = await supabase.from("store_payment_settings").upsert({ id: true, account_name: accountName, account_number: accountNumber, qr_url: qrUrl || null, qr_path: qrPath || null, enabled: body.enabled === true }, { onConflict: "id" })
    if (error) return fail("Payment settings table is not ready or could not save. Ask the database session to provision store_payment_settings.", 503)
    return NextResponse.json({ ok: true })
  } catch (error) { return fail(error instanceof Error ? error.message : "Could not save payment settings.", 500) }
}
