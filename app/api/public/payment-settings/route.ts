import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from("store_payment_settings").select("account_name,account_number,qr_url,enabled").eq("id", true).eq("enabled", true).maybeSingle()
    if (error) return NextResponse.json({ error: "Payment settings are not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } })
    return NextResponse.json({ gcash: data ? { accountName: data.account_name, accountNumber: data.account_number, qrUrl: data.qr_url } : null }, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "Payment settings are not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
