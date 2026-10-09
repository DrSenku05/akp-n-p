import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type Payload = { module?: string; action?: string; row?: string[]; values?: Record<string, string> }
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status })
const money = (value: string | undefined) => Number((value ?? "").replace(/[₱,\s]/g, ""))

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (!claims?.sub) return fail("Sign in required.", 401)
  const { data: admin } = await supabase.from("admin_users").select("role,is_active").eq("user_id", claims.sub).maybeSingle()
  if (!admin?.is_active || !["owner", "staff"].includes(admin.role)) return fail("Active admin access required.", 403)

  let body: Payload
  try { body = await request.json() as Payload } catch { return fail("Invalid request body.") }
  const module = body.module ?? ""
  const action = (body.action ?? "").toLowerCase()
  const row = body.row ?? []
  const values = body.values ?? {}
  const value = (...keys: string[]) => keys.map((key) => values[key]?.trim()).find((item) => item !== undefined) ?? ""
  let result: { error: { message: string } | null; data?: unknown } | null = null

  if (module === "products" || module === "heritage-showcase") {
    const sku = module === "products" ? row[0] : ""
    const productId = module === "heritage-showcase" ? value("Product ID") : ""
    const categoryName = value("Category")
    const { data: category } = categoryName ? await supabase.from("product_categories").select("id").eq("name", categoryName).maybeSingle() : { data: null }
    const fields = {
      name: value("Product Name", "Product") || (module === "heritage-showcase" ? row[0] : ""),
      description: value("Description", "Craft / Origin") || null,
      category_id: category?.id ?? null,
      price: money(value("Price")),
      reorder_level: Number(value("Reorder Level") || 0),
      craft_origin: value("Craft / Origin") || null,
      is_featured: ["yes", "true"].includes(value("Featured").toLowerCase()),
      visibility: value("Visibility", "Status").toLowerCase() === "active" ? "published" : value("Visibility", "Status").toLowerCase(),
    }
    if (module === "heritage-showcase") {
      result = await supabase.from("products").update({
        craft_origin: value("Craft / Origin") || null,
        category_id: category?.id ?? null,
        is_featured: ["yes", "true"].includes(value("Featured").toLowerCase()),
        visibility: value("Visibility").toLowerCase(),
      }).eq("name", row[0]).select("id")
    } else if (!fields.name || !Number.isFinite(fields.price) || fields.price < 0) return fail("Product name and a valid non-negative price are required.")
    else if (action === "create") {
      const skuInput = value("SKU", "Product ID")
      if (!skuInput) return fail("SKU is required to create a product.")
      const stock = Number(value("Stock") || 0)
      if (!Number.isInteger(stock) || stock < 0) return fail("Stock must be a whole number zero or greater.")
      result = await supabase.from("products").insert({ sku: skuInput, ...fields, stock_quantity: stock, visibility: fields.visibility || "draft" })
    } else {
      let query = supabase.from("products").update(fields)
      query = module === "products" ? query.eq("sku", sku) : query.eq("name", row[0])
      result = await query.select("id")
    }
  } else if (module === "inventory") {
    const productLookup = row[0]
      ? supabase.from("products").select("id,stock_quantity").eq("sku", row[0]).maybeSingle()
      : supabase.from("products").select("id,stock_quantity").eq("name", value("Product")).maybeSingle()
    const { data: product } = await productLookup
    if (!product) return fail("Product was not found.", 404)
    const rawQuantity = Number(value("Quantity", "Current Stock"))
    const type = value("Movement Type").toLowerCase()
    if (!Number.isInteger(rawQuantity) || rawQuantity <= 0) return fail("Enter a whole-number stock quantity greater than zero.")
    const movementType = type.includes("damage") ? "damage" : type.includes("sale") || type.includes("out") ? "sale" : type.includes("adjust") ? "adjustment" : "restock"
    const delta = action === "record-movement"
      ? movementType === "sale" || movementType === "damage" ? -rawQuantity : rawQuantity
      : rawQuantity - product.stock_quantity
    if (delta === 0) return fail("Stock is already at that quantity; no movement was recorded.")
    const actualType = action === "record-movement" ? movementType : "adjustment"
    result = await supabase.from("inventory_movements").insert({ product_id: product.id, movement_type: actualType, quantity_delta: delta, reason: value("Reason") || "Admin inventory update", created_by: claims.sub })
  } else if (module === "orders") {
    const status = action.includes("process") ? "processing" : action.includes("ship") ? "shipped" : action.includes("deliver") ? "delivered" : action.includes("cancel") ? "cancelled" : ""
    if (!status) return fail("Unsupported order action.")
    result = await supabase.from("orders").update({ status }).eq("order_number", row[0].replace(/^#/, "")).select("id")
  } else if (module === "customers") {
    const email = row[2]
    if (!email || email === "—") return fail("This customer row has no email identifier, so it cannot be safely updated.")
    if (action.includes("suspend") || action.includes("reactivate")) result = await supabase.from("customers").update({ status: action.includes("suspend") ? "suspended" : "active" }).eq("email", email).select("id")
    else result = await supabase.from("customers").update({ name: value("Name") || row[1], email: value("Email") || email, phone: value("Phone") || null }).eq("email", email).select("id")
  } else if (module === "delivery-personnel") {
    if (action.includes("edit") || action.includes("save")) {
      result = await supabase.from("delivery_personnel").update({ name: value("Name") || row[1], phone: value("Contact", "Phone") || null, availability: value("Availability").toLowerCase().replaceAll(" ", "_") || "available" }).eq("name", row[1]).select("id")
    } else return fail("Only editing existing delivery personnel is supported here.")
  } else if (module === "returns-refunds") {
    const status = action.includes("approve") ? "approved" : action.includes("reject") ? "rejected" : ""
    if (!status) return fail("Unsupported return request action.")
    result = await supabase.from("return_requests").update({ status, decision_note: value("Decision Notes") || null, decided_by: claims.sub, decided_at: new Date().toISOString() }).eq("request_number", row[0]).select("id")
  } else if (module === "payments") {
    if (!action.includes("verify") && !action.includes("reject")) return fail("Unsupported payment action.")
    const { data: order } = await supabase.from("orders").select("id").eq("order_number", row[1].replace(/^#/, "")).maybeSingle()
    if (!order) return fail("The linked order was not found.", 404)
    result = await supabase.from("payments").update({ status: action.includes("verify") ? "verified" : "rejected", verified_by: claims.sub, verified_at: new Date().toISOString() }).eq("order_id", order.id).select("id")
  } else if (module === "feedback") {
    const status = action.includes("remove") ? "removed" : action.includes("flag") && !action.includes("unflag") ? "flagged" : "visible"
    result = await supabase.from("feedback").update({ moderation_status: status }).eq("comment", row[4].replace(/^\[flagged content\]$/, "DEMO: sample feedback; replace with a verified customer review.")).select("id")
  } else if (module === "promotions") {
    if (action === "create") {
      const promoName = value("Promo Name")
      const discountText = value("Discount")
      const percent = discountText.includes("%")
      const discountValue = Number(discountText.replace(/[^\d.]/g, ""))
      if (!promoName || !Number.isFinite(discountValue) || discountValue <= 0) return fail("Promotion name and discount are required.")
      const ends = new Date(value("Valid Until"))
      if (!Number.isFinite(ends.getTime())) return fail("Enter a valid promotion end date.")
      result = await supabase.from("promotions").insert({ name: promoName, discount_type: percent ? "percentage" : "fixed_amount", discount_value: discountValue, starts_at: new Date().toISOString(), ends_at: ends.toISOString(), status: "draft", created_by: claims.sub })
      if (result.error) return fail(result.error.message)
      return NextResponse.json({ ok: true })
    }
    const status = action.includes("publish") || action.includes("reactivate") ? "active" : action.includes("end") || action.includes("archive") ? "archived" : null
    const patch: Record<string, string | number | null> = { name: value("Promo Name") || row[0] }
    if (values.Description !== undefined) patch.description = value("Description") || null
    if (status) patch.status = status
    if (values.Discount) {
      const discount = value("Discount")
      patch.discount_type = discount.includes("%") ? "percentage" : "fixed_amount"
      patch.discount_value = Number(discount.replace(/[^\d.]/g, ""))
    }
    if (values["Valid Until"]) patch.ends_at = new Date(value("Valid Until")).toISOString()
    result = await supabase.from("promotions").update(patch).eq("name", row[0]).select("id")
  } else if (module === "notifications") {
    if (action !== "create") return fail("Announcements can be saved as drafts; sending requires a configured notification service.")
    const title = value("Title")
    const message = value("Message")
    if (!title || !message) return fail("Announcement title and message are required.")
    result = await supabase.from("announcements").insert({ title, message, audience: value("Target").toLowerCase().includes("staff") ? "staff" : "customers", status: "draft", created_by: claims.sub })
  } else {
    return fail("This module is view-only or has no safe database action configured.", 422)
  }

  if (result?.error) return fail(result.error.message, 400)
  if (Array.isArray(result?.data) && result.data.length === 0) return fail("No matching record was updated.", 404)
  return NextResponse.json({ ok: true })
}
