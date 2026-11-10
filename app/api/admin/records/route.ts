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
    const visibilityInput = value("Visibility", "Status").toLowerCase()
    const fields = {
      name: value("Product Name", "Product") || (module === "heritage-showcase" ? row[0] : ""),
      description: value("Description") || null,
      category_id: category?.id ?? null,
      price: money(value("Price")),
      reorder_level: Number(value("Reorder Level") || 0),
      craft_origin: value("Craft / Origin") || null,
      is_featured: ["yes", "true"].includes(value("Featured").toLowerCase()),
      visibility: visibilityInput ? visibilityInput === "active" ? "published" : visibilityInput : undefined,
      image_url: value("Image URL") || null,
    }
    if (module === "heritage-showcase") {
      result = await supabase.from("products").update({
        craft_origin: value("Craft / Origin") || null,
        category_id: category?.id ?? null,
        is_featured: ["yes", "true"].includes(value("Featured").toLowerCase()),
        visibility: value("Visibility").toLowerCase(),
      }).eq("name", row[0]).select("id")
    } else if (module === "products" && action.includes("archive")) {
      result = await supabase.from("products").update({ visibility: "archived" }).eq("sku", sku).select("id")
    } else if (!fields.name || !Number.isFinite(fields.price) || fields.price < 0) return fail("Product name and a valid non-negative price are required.")
    else if (action === "create") {
      const skuInput = value("SKU", "Product ID")
      if (!skuInput) return fail("SKU is required to create a product.")
      const stock = Number(value("Stock") || 0)
      if (!Number.isInteger(stock) || stock < 0) return fail("Stock must be a whole number zero or greater.")
      result = await supabase.from("products").insert({ sku: skuInput, ...fields, stock_quantity: stock, visibility: fields.visibility || "draft" })
    } else {
      const productPatch: Record<string, string | number | boolean | null> = { name: fields.name, price: fields.price }
      if (categoryName) productPatch.category_id = category?.id ?? null
      if (values.Description !== undefined) productPatch.description = value("Description") || null
      if (values["Craft / Origin"] !== undefined) productPatch.craft_origin = value("Craft / Origin") || null
      if (values["Image URL"] !== undefined) productPatch.image_url = value("Image URL") || null
      if (values.Featured !== undefined) productPatch.is_featured = ["yes", "true"].includes(value("Featured").toLowerCase())
      if (values["Reorder Level"] !== undefined) productPatch.reorder_level = Number(value("Reorder Level") || 0)
      if (visibilityInput) productPatch.visibility = visibilityInput === "active" ? "published" : visibilityInput
      let query = supabase.from("products").update(productPatch)
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
    const orderNumber = row[0]?.replace(/^#/, "")
    if (!orderNumber) return fail("Order number is required.")
    const { data: order, error: lookupError } = await supabase.from("orders").select("id,status,fulfillment_method").eq("order_number", orderNumber).maybeSingle()
    if (lookupError) return fail(lookupError.message)
    if (!order) return fail("Order was not found.", 404)
    const current = order.status.toLowerCase()
    const fulfillment = order.fulfillment_method.toLowerCase()
    const isWalkIn = ["pickup", "walk_in", "walk-in"].includes(fulfillment)
    let status = ""
    if (action.includes("accept") || action.includes("start preparing")) {
      if (current !== "pending") return fail("Only pending orders can start preparation.", 409)
      status = "processing"
    } else if (action.includes("ready for pickup")) {
      if (!isWalkIn) return fail("Only walk-in orders can be marked ready for pickup.")
      if (current !== "processing") return fail("The order must be preparing before it can be ready for pickup.", 409)
      status = "shipped"
    } else if (action.includes("out for delivery")) {
      if (isWalkIn) return fail("Walk-in orders do not go out for delivery.")
      if (current !== "processing") return fail("The order must be preparing before it can go out for delivery.", 409)
      status = "shipped"
    } else if (action.includes("complete")) {
      if (current !== "shipped") return fail("The order must be ready for pickup or out for delivery before completion.", 409)
      status = "delivered"
    } else if (action.includes("cancel")) {
      if (!["pending", "processing"].includes(current)) return fail("Only pending or preparing orders can be cancelled.", 409)
      status = "cancelled"
    } else return fail("Unsupported order action.")
    result = await supabase.from("orders").update({ status }).eq("id", order.id).select("id")
  } else if (module === "customers") {
    const email = row[2]
    const customerId = row[8]
    if (!customerId && (!email || email === "—")) return fail("This customer row has no safe database identifier.")
    const patch = action.includes("suspend") || action.includes("reactivate")
      ? { status: action.includes("suspend") ? "suspended" : "active" }
      : { name: value("Name") || row[1], email: value("Email") || email, phone: value("Phone") || null }
    const update = supabase.from("customers").update(patch)
    result = await (customerId ? update.eq("id", customerId) : update.eq("email", email)).select("id")
  } else if (module === "delivery-personnel") {
    if (action.includes("edit") || action.includes("save")) {
      result = await supabase.from("delivery_personnel").update({ name: value("Name") || row[1], phone: value("Contact", "Phone") || null, availability: value("Availability").toLowerCase().replaceAll(" ", "_") || "available" }).eq("id", row[6] || row[0]).select("id")
    } else return fail("Only editing existing delivery personnel is supported here.")
  } else if (module === "users") {
    if (admin.role !== "owner") return fail("Only an owner can change account status.", 403)
    const [accountType, accountId] = (row[0] ?? "").split(":")
    if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return fail("Account identifier is invalid.")
    const suspend = action.includes("suspend")
    const reactivate = action.includes("reactivate")
    if (!suspend && !reactivate) return fail("Unsupported account action.")
    if (accountType === "admin") {
      const { data: target, error } = await supabase.from("admin_users").select("role,is_active").eq("user_id", accountId).maybeSingle()
      if (error) return fail(error.message)
      if (!target) return fail("Admin account was not found.", 404)
      if (target.role === "owner") return fail("Owner accounts cannot be suspended from this screen.", 403)
      if (suspend && accountId === claims.sub) return fail("You cannot suspend your own account.", 403)
      result = await supabase.from("admin_users").update({ is_active: reactivate }).eq("user_id", accountId).select("user_id")
    } else if (accountType === "driver") {
      const { data: driver, error } = await supabase.from("delivery_personnel").select("availability").eq("id", accountId).maybeSingle()
      if (error) return fail(error.message)
      if (!driver) return fail("Delivery driver was not found.", 404)
      if (suspend) {
        const { count, error: assignmentError } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("delivery_personnel_id", accountId).in("status", ["processing", "shipped"])
        if (assignmentError) return fail(assignmentError.message)
        if (driver.availability === "on_delivery" || (count ?? 0) > 0) return fail("Reassign or complete this driver's active deliveries before suspending the account.", 409)
      }
      let availability = suspend ? "suspended" : "available"
      if (reactivate) {
        const { count, error: assignmentError } = await supabase.from("orders").select("id", { count: "exact", head: true }).eq("delivery_personnel_id", accountId).in("status", ["processing", "shipped"])
        if (assignmentError) return fail(assignmentError.message)
        if ((count ?? 0) > 0) availability = "on_delivery"
      }
      result = await supabase.from("delivery_personnel").update({ availability }).eq("id", accountId).select("id")
    } else if (accountType === "customer") {
      result = await supabase.from("customers").update({ status: suspend ? "suspended" : "active" }).eq("id", accountId).select("id")
    } else return fail("Unsupported account type.")
  } else if (module === "returns-refunds") {
    const status = action.includes("approve") ? "approved" : action.includes("reject") ? "rejected" : ""
    if (!status) return fail("Unsupported return request action.")
    result = await supabase.from("return_requests").update({ status, decision_note: value("Decision Notes") || null, decided_by: claims.sub, decided_at: new Date().toISOString() }).eq("request_number", row[0]).select("id")
  } else if (module === "payments") {
    const paymentId = row[9]
    if (!paymentId) return fail("Payment identifier is missing. Refresh the payment list and try again.")
    const { data: payment, error: lookupError } = await supabase.from("payments").select("id,method,status").eq("id", paymentId).maybeSingle()
    if (lookupError) return fail(lookupError.message)
    if (!payment) return fail("Payment record was not found.", 404)
    if (payment.status.toLowerCase() !== "pending") return fail("Only pending payments can be changed.", 409)
    const method = payment.method.toLowerCase()
    const isCod = method.includes("cod") || method.includes("cash")
    const isGcash = method.includes("gcash") || method.includes("wallet")
    let status = ""
    if (action.includes("reject payment")) {
      if (!isGcash) return fail("Only GCash payments can be rejected here.")
      status = "rejected"
    } else if (action.includes("confirm payment")) {
      if (!isGcash) return fail("This action is only for GCash payments.")
      status = "verified"
    } else if (action.includes("cash collected")) {
      if (!isCod) return fail("Cash collection can only be recorded for COD payments.")
      status = "verified"
    } else return fail("Unsupported payment action.")
    result = await supabase.from("payments").update({ status, verified_by: claims.sub, verified_at: new Date().toISOString() }).eq("id", payment.id).eq("status", "pending").select("id")
  } else if (module === "feedback") {
    const status = action.includes("remove") ? "removed" : action.includes("flag") && !action.includes("unflag") ? "flagged" : "visible"
    if (!row[8]) return fail("Feedback identifier is missing. Refresh and try again.")
    result = await supabase.from("feedback").update({ moderation_status: status }).eq("id", row[8]).select("id")
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
