import { NextResponse, type NextRequest } from "next/server"
import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

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
  const value = (...keys: string[]) => keys.map((key) => typeof values[key] === "string" ? values[key].trim() : undefined).find((item) => item !== undefined) ?? ""
  let result: { error: { message: string } | null; data?: unknown } | null = null

  if (module === "products" || module === "heritage-showcase") {
    const sku = module === "products" ? row[0] : ""
    const showcaseSku = (module === "heritage-showcase" ? row[5] : row[6]) || value("Product SKU").split(" · ")[0]
    const selectedCategory = value("Category")
    const newCategoryName = value("New Category")
    const isNewCategory = selectedCategory === "Add new category"
    const categoryName = isNewCategory ? newCategoryName : selectedCategory
    if (isNewCategory && !categoryName) return fail("Enter a category name.")
    if (categoryName.length > 80) return fail("Category names must be 80 characters or fewer.")
    let category = null as { id: string } | null
    let categoryError: { message: string } | null = null
    if (categoryName) {
      const existing = await supabase.from("product_categories").select("id").eq("name", categoryName).maybeSingle()
      category = existing.data
      categoryError = existing.error
      if (!category && !categoryError && isNewCategory) {
        const created = await supabase.from("product_categories").insert({ name: newCategoryName }).select("id").single()
        category = created.data
        categoryError = created.error
      }
    }
    if (categoryError) return fail(categoryError.message)
    if (categoryName && !category) return fail("Product category was not found.", 404)
    const visibilityInput = value("Visibility", "Status").toLowerCase()
    if (module === "heritage-showcase") {
      if (!showcaseSku) return fail("Product SKU is required.")
      if (action === "publish") {
        result = await supabase.from("products").update({ visibility: "published" }).eq("sku", showcaseSku).select("id")
      } else if (action === "archive") {
        result = await supabase.from("products").update({ visibility: "archived" }).eq("sku", showcaseSku).select("id")
      } else if (action === "add-to-showcase") {
        result = await supabase.from("products").update({
          is_featured: true,
          visibility: "draft",
          ...(values["Craft / Origin"] !== undefined ? { craft_origin: value("Craft / Origin") || null } : {}),
          ...(values["Heritage Description"] !== undefined ? { description: value("Heritage Description") || null } : {}),
        }).eq("sku", showcaseSku).select("id")
      } else if (action === "feature") {
        result = await supabase.from("products").update({ is_featured: true }).eq("sku", showcaseSku).select("id")
      } else if (action === "remove") {
        result = await supabase.from("products").update({ is_featured: false }).eq("sku", showcaseSku).select("id")
      } else if (action === "edit") {
        const patch: Record<string, string | boolean | null> = {
          visibility: "draft",
        }
        if (values["Heritage Description"] !== undefined) patch.description = value("Heritage Description") || null
        if (values["Craft / Origin"] !== undefined) patch.craft_origin = value("Craft / Origin") || null
        if (!Object.keys(patch).length) return fail("No showcase changes were provided.")
        result = await supabase.from("products").update(patch).eq("sku", showcaseSku).select("id")
      } else return fail("Unsupported showcase action.")
    } else {
        const fields = {
          name: value("Product Name", "Product") || row[0] || "",
          description: value("Description") || null,
          category_id: category?.id ?? null,
          price: money(value("Price")),
          craft_origin: value("Craft / Origin") || null,
          is_featured: ["yes", "true"].includes(value("Featured").toLowerCase()),
          visibility: visibilityInput ? visibilityInput === "active" ? "published" : visibilityInput : undefined,
          image_url: value("Image URL") || null,
        }
        if (action.includes("reactivate")) {
          result = await supabase.from("products").update({ visibility: "published" }).eq("sku", sku).select("id")
        } else if (action.includes("archive")) {
          result = await supabase.from("products").update({ visibility: "archived" }).eq("sku", sku).select("id")
        } else if (!fields.name || !Number.isFinite(fields.price) || fields.price < 0) return fail("Product name and a valid non-negative price are required.")
        else if (action === "create") {
          const generatedSku = `AKP-PRD-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`
          const stock = Number(value("Stock") || 0)
          if (!Number.isInteger(stock) || stock < 0) return fail("Stock must be a whole number zero or greater.")
          result = await supabase.from("products").insert({ sku: generatedSku, ...fields, stock_quantity: stock, visibility: fields.visibility || "draft" })
        } else {
          const productPatch: Record<string, string | number | boolean | null> = { name: fields.name, price: fields.price }
          if (categoryName) productPatch.category_id = category?.id ?? null
          if (values.Description !== undefined) productPatch.description = value("Description") || null
          if (values["Craft / Origin"] !== undefined) productPatch.craft_origin = value("Craft / Origin") || null
          if (values["Image URL"] !== undefined) productPatch.image_url = value("Image URL") || null
          if (values.Featured !== undefined) productPatch.is_featured = ["yes", "true"].includes(value("Featured").toLowerCase())
          if (visibilityInput) productPatch.visibility = visibilityInput === "active" ? "published" : visibilityInput
          let query = supabase.from("products").update(productPatch)
          query = query.eq("sku", sku)
          result = await query.select("id")
        }
    }
  } else if (module === "inventory") {
    const productLookup = row[0]
      ? supabase.from("products").select("id,stock_quantity").eq("sku", row[0]).maybeSingle()
      : supabase.from("products").select("id,stock_quantity").eq("name", value("Product")).maybeSingle()
    const { data: product } = await productLookup
    if (!product) return fail("Product was not found.", 404)
    const rawQuantity = Number(value("Quantity", "Current Stock"))
    const type = value("Movement Type")
    const reason = value("Reason")
    if (!Number.isInteger(rawQuantity) || (action === "record-movement" ? rawQuantity <= 0 : rawQuantity < 0)) {
      return fail(action === "record-movement" ? "Enter a whole-number stock quantity greater than zero." : "Stock must be a whole number zero or greater.")
    }
    if (!reason || reason.length > 500) return fail("Enter a reason of 1 to 500 characters for this inventory movement.")
    const movementTypes: Record<string, string> = {
      "Stock received": "restock",
      "Sale / stock out": "sale",
      Damage: "damage",
      "Stock correction": "adjustment",
    }
    const movementType = movementTypes[type] ?? (action === "record-movement" ? "" : "adjustment")
    if (action === "record-movement" && !movementType) return fail("Choose a valid movement type.")
    if (action === "record-movement" && movementType === "adjustment" && !["Increase", "Decrease"].includes(value("Correction Direction"))) {
      return fail("Choose whether the stock correction increases or decreases stock.")
    }
    const delta = action === "record-movement"
      ? ["sale", "damage"].includes(movementType) || movementType === "adjustment" && value("Correction Direction") === "Decrease" ? -rawQuantity : rawQuantity
      : rawQuantity - product.stock_quantity
    if (delta === 0) return fail("Stock is already at that quantity; no movement was recorded.")
    const actualType = action === "record-movement" ? movementType : "adjustment"
    result = await supabase.from("inventory_movements").insert({ product_id: product.id, movement_type: actualType, quantity_delta: delta, reason, created_by: claims.sub })
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
    result = await supabase.from("orders").update({ status }).eq("id", order.id).eq("status", current).select("id")
    if (result.error) return fail(result.error.message)
    if (Array.isArray(result.data) && result.data.length === 0) return fail("Order status changed while this action was being processed. Refresh and try again.", 409)
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
    if (action === "unassign") {
      const driverId = row[6]
      const orderNumber = value("Assigned Order").split(" · ")[0].replace(/^#/, "").trim()
      if (!driverId || !/^[0-9a-f-]{36}$/i.test(driverId)) return fail("Driver identifier is invalid.")
      if (!orderNumber) return fail("Choose an assigned order to remove.")

      const { data: order, error: orderError } = await supabase.from("orders")
        .select("id,status,fulfillment_method,delivery_personnel_id,delivery_status")
        .eq("order_number", orderNumber)
        .maybeSingle()
      if (orderError) return fail(orderError.message)
      if (!order) return fail("Delivery order was not found.", 404)
      if (order.delivery_personnel_id !== driverId) return fail("This order is no longer assigned to that driver. Refresh and try again.", 409)
      if (order.fulfillment_method !== "delivery") return fail("Only delivery orders can be removed from a driver.", 409)
      if (order.delivery_status !== "assigned") return fail("This delivery has already been accepted or started and cannot be unassigned here.", 409)
      if (!( ["pending", "processing", "shipped"] as string[]).includes(order.status)) return fail("Only open deliveries can be unassigned.", 409)

      const { data: unassigned, error: unassignError } = await supabase.from("orders")
        .update({ delivery_personnel_id: null })
        .eq("id", order.id)
        .eq("delivery_personnel_id", driverId)
        .eq("delivery_status", "assigned")
        .in("status", ["pending", "processing", "shipped"])
        .select("id")
      if (unassignError) return fail(unassignError.message)
      if (!unassigned?.length) return fail("This delivery changed while you were removing it. Refresh and try again.", 409)
      return NextResponse.json({ ok: true })
    }
    if (action === "assign") {
      const driverId = row[6]
      const orderNumber = value("Delivery Order").split(" · ")[0].replace(/^#/, "").trim()
      if (!driverId || !/^[0-9a-f-]{36}$/i.test(driverId)) return fail("Driver identifier is invalid.")
      if (!orderNumber) return fail("Choose a delivery order to assign.")

      const { data: driver, error: driverError } = await supabase.from("delivery_personnel").select("id,availability").eq("id", driverId).maybeSingle()
      if (driverError) return fail(driverError.message)
      if (!driver) return fail("Delivery driver was not found.", 404)
      if (driver.availability !== "available") return fail("Only available drivers can receive a new assignment.", 409)

      const { data: order, error: orderError } = await supabase.from("orders").select("id,status,fulfillment_method,delivery_personnel_id").eq("order_number", orderNumber).maybeSingle()
      if (orderError) return fail(orderError.message)
      if (!order) return fail("Delivery order was not found.", 404)
      if (order.fulfillment_method !== "delivery") return fail("Only delivery orders can be assigned to a driver.", 409)
      if (!(["pending", "processing", "shipped"] as string[]).includes(order.status)) return fail("Only open orders can be assigned to a driver.", 409)
      if (order.delivery_personnel_id) return fail("This order is already assigned. Refresh the list and try again.", 409)

      const { data: assigned, error: assignError } = await supabase.from("orders")
        .update({ delivery_personnel_id: driver.id, delivery_status: "assigned" })
        .eq("id", order.id)
        .is("delivery_personnel_id", null)
        .in("status", ["pending", "processing", "shipped"])
        .select("id")
      if (assignError) return fail(assignError.message.includes("delivery_status") ? "Run the driver database setup before assigning orders." : assignError.message, assignError.message.includes("delivery_status") ? 503 : 400)
      if (!assigned?.length) return fail("This order changed while you were assigning it. Refresh and try again.", 409)
      return NextResponse.json({ ok: true })
    }
    if (action.includes("edit") || action.includes("save")) {
      result = await supabase.from("delivery_personnel").update({ name: value("Name") || row[1], phone: value("Contact", "Phone") || null, availability: value("Availability").toLowerCase().replaceAll(" ", "_") || "available" }).eq("id", row[6] || row[0]).select("id")
    } else return fail("Only editing existing delivery personnel is supported here.")
  } else if (module === "users") {
    if (admin.role !== "owner") return fail("Only an owner can manage accounts.", 403)
    if (action === "edit-credentials") {
      const [accountType, accountId] = (row[0] ?? "").split(":")
      if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return fail("Account identifier is invalid.")
      const newEmail = value("email").toLowerCase()
      const password = typeof values.password === "string" ? values.password : ""
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail) || newEmail.length > 254) return fail("Enter a valid email address.")
      if (password && (password.length < 8 || password.length > 128)) return fail("A new password must be between 8 and 128 characters.")
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceKey) return fail("Account editing needs SUPABASE_SECRET_KEY configured in the Vercel project environment.", 503)
      const authAdmin = createSupabaseClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin
      let authUserId = ""
      let expectedEmail = ""
      if (accountType === "admin") {
        authUserId = accountId
      } else if (accountType === "driver") {
        const { data: driver, error } = await supabase.from("delivery_personnel").select("auth_user_id,email").eq("id", accountId).maybeSingle()
        if (error) return fail(error.message)
        if (!driver) return fail("Delivery driver was not found.", 404)
        authUserId = driver.auth_user_id ?? row[7] ?? ""
        expectedEmail = driver.email?.trim().toLowerCase() ?? ""
      } else if (accountType === "customer") {
        const { data: customer, error } = await supabase.from("customers").select("auth_user_id,email").eq("id", accountId).maybeSingle()
        if (error) return fail(error.message)
        if (!customer) return fail("Customer profile was not found.", 404)
        authUserId = customer.auth_user_id ?? row[7] ?? ""
        expectedEmail = customer.email?.trim().toLowerCase() ?? ""
      } else if (accountType === "customer-auth") {
        authUserId = accountId
      } else return fail("Unsupported account type.")
      if (!authUserId || !/^[0-9a-f-]{36}$/i.test(authUserId)) return fail("This profile has no linked login account.", 409)
      if (authUserId === claims.sub) return fail("You cannot edit your own login here.", 403)
      const { data: target, error: targetError } = await authAdmin.getUserById(authUserId)
      if (targetError || !target.user) return fail(targetError?.message ?? "Auth account was not found.", 404)
      if (expectedEmail && target.user.email?.trim().toLowerCase() !== expectedEmail) return fail("The login no longer matches this profile email. Refresh the account list and try again.", 409)
      const emailChanged = target.user.email?.trim().toLowerCase() !== newEmail
      if (!emailChanged && !password) return fail("Enter a different email or a new password.")
      const { error } = await authAdmin.updateUserById(authUserId, {
        ...(emailChanged ? { email: newEmail, email_confirm: true } : {}),
        ...(password ? { password } : {}),
      })
      if (error) return fail(error.message, 400)
      if (emailChanged && (accountType === "driver" || accountType === "customer")) {
        const profileUpdate = accountType === "driver"
          ? await supabase.from("delivery_personnel").update({ email: newEmail }).eq("id", accountId)
          : await supabase.from("customers").update({ email: newEmail }).eq("id", accountId)
        if (profileUpdate.error) {
          const { error: rollbackError } = await authAdmin.updateUserById(authUserId, { email: target.user.email ?? expectedEmail, email_confirm: true })
          return fail(rollbackError ? `Profile email update failed and the Auth email rollback also failed: ${profileUpdate.error.message}; ${rollbackError.message}` : profileUpdate.error.message, 409)
        }
      }
      return NextResponse.json({ ok: true })
    }
    if (action === "create") {
      const role = value("role").toLowerCase()
      const name = value("name")
      const email = value("email").toLowerCase()
      const phone = value("phone")
      const password = typeof values.password === "string" ? values.password : ""
      if (!(role === "owner" || role === "staff" || role === "driver")) return fail("Choose Owner/Admin, Staff, or Delivery Driver.")
      if (!name || name.length > 120) return fail("Enter a name up to 120 characters.")
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail("Enter a valid email address.")
      if (phone.length > 32) return fail("Phone numbers must be 32 characters or fewer.")
      if (password.length < 8 || password.length > 128) return fail("Enter an initial password between 8 and 128 characters.")
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceKey) return fail("Account creation needs SUPABASE_SECRET_KEY configured in the Vercel project environment.", 503)
      const authAdmin = createSupabaseClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin
      const { data: created, error: createError } = await authAdmin.createUser({ email, password, phone: phone || undefined, email_confirm: true, user_metadata: { full_name: name, name } })
      if (createError || !created.user) return fail(createError?.message ?? "Supabase did not create the account.", 400)
      const profile = role === "driver"
        ? await supabase.from("delivery_personnel").insert({ auth_user_id: created.user.id, name, email, phone: phone || null, availability: "available" })
        : await supabase.from("admin_users").insert({ user_id: created.user.id, display_name: name, role, is_active: true })
      if (profile.error) {
        const { error: cleanupError } = await authAdmin.deleteUser(created.user.id)
        return fail(cleanupError ? `Could not save the role profile (${profile.error.message}); remove the unused Auth account ${email} in Supabase Auth.` : profile.error.message, 409)
      }
      return NextResponse.json({ ok: true })
    }
    const [accountType, accountId] = (row[0] ?? "").split(":")
    if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return fail("Account identifier is invalid.")
    const actionName = action.trim()
    if (!["suspend", "reactivate", "ban", "unban", "delete"].includes(actionName)) return fail("Unsupported account action.")
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) return fail("Account controls need SUPABASE_SECRET_KEY configured in the Vercel project environment.", 503)
    const authAdmin = createSupabaseClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }).auth.admin
    const deleting = actionName === "delete"
    const banning = actionName === "ban"
    const suspending = actionName === "suspend"
    const reactivating = actionName === "reactivate"
    const unbanning = actionName === "unban"
    let authUserId = accountType === "admin" || accountType === "customer-auth" ? accountId : ""
    let profileId = accountId
    let currentState = "active"
    let targetAdminRole = ""
    let fallbackAuthUserId = ""
    let expectedAuthEmail = ""
    let currentAuthMetadata: Record<string, unknown> = {}
    if (accountType === "admin") {
      const { data: target, error } = await supabase.from("admin_users").select("role,is_active").eq("user_id", accountId).maybeSingle()
      if (error) return fail(error.message)
      if (!target) return fail("Admin account was not found.", 404)
      targetAdminRole = target.role
      currentState = target.is_active ? "active" : "suspended"
    } else if (accountType === "driver") {
      const { data: driver, error } = await supabase.from("delivery_personnel").select("id,auth_user_id,email,availability").eq("id", accountId).maybeSingle()
      if (error) return fail(error.message)
      if (!driver) return fail("Delivery driver was not found.", 404)
      authUserId = driver.auth_user_id ?? ""
      if (!authUserId && /^[0-9a-f-]{36}$/i.test(row[7] ?? "")) {
        fallbackAuthUserId = row[7]
        expectedAuthEmail = driver.email?.trim().toLowerCase() ?? ""
      }
      currentState = driver.availability === "suspended" ? "suspended" : "active"
    } else if (accountType === "customer") {
      const { data: customer, error } = await supabase.from("customers").select("id,auth_user_id,email,status").eq("id", accountId).maybeSingle()
      if (error) return fail(error.message)
      if (!customer) return fail("Customer profile was not found.", 404)
      authUserId = customer.auth_user_id ?? ""
      if (!authUserId && /^[0-9a-f-]{36}$/i.test(row[7] ?? "")) {
        fallbackAuthUserId = row[7]
        expectedAuthEmail = customer.email?.trim().toLowerCase() ?? ""
      }
      currentState = customer.status
    } else if (accountType === "customer-auth") {
      authUserId = accountId
    } else return fail("Unsupported account type.")
    if (!authUserId && fallbackAuthUserId) {
      if (!expectedAuthEmail) return fail("Cannot safely match this profile to its Auth account.", 409)
      authUserId = fallbackAuthUserId
    }
    if (authUserId && authUserId === claims.sub) return fail("You cannot change or delete your own account.", 403)
    if (authUserId) {
      const { data: target, error } = await authAdmin.getUserById(authUserId)
      if (error || !target.user) return fail(error?.message ?? "Auth account was not found.", 404)
      if (expectedAuthEmail && target.user.email?.trim().toLowerCase() !== expectedAuthEmail) return fail("The Auth account no longer matches this customer profile. Refresh and try again.", 409)
      currentAuthMetadata = target.user.app_metadata ?? {}
      const storedStatus = currentAuthMetadata.akp_account_status
      currentState = storedStatus === "banned" ? "banned" : storedStatus === "suspended" ? "suspended" : currentState
    }
    if (currentState === "banned" && (suspending || reactivating)) return fail("This account is banned. Use Unban to restore access.", 409)
    if (currentState !== "banned" && unbanning) return fail("This account is not banned.", 409)
    if (currentState !== "suspended" && reactivating) return fail("This account is not suspended.", 409)
    if (currentState === "suspended" && suspending) return fail("This account is already suspended.", 409)
    if (accountType === "admin" && targetAdminRole === "owner" && (deleting || suspending || banning)) {
      const { count, error } = await supabase.from("admin_users").select("user_id", { count: "exact", head: true }).eq("role", "owner").eq("is_active", true)
      if (error) return fail(error.message)
      const { data: owner, error: ownerError } = await supabase.from("admin_users").select("is_active").eq("user_id", accountId).maybeSingle()
      if (ownerError) return fail(ownerError.message)
      if (owner?.is_active && (count ?? 0) <= 1) return fail("The last active owner cannot be disabled or deleted.", 409)
    }
    const activeDriverOrder = async () => {
      const { data, error } = await supabase.from("orders").select("id").eq("delivery_personnel_id", profileId).not("status", "eq", "cancelled").not("delivery_status", "in", "(delivered,failed)").limit(1)
      if (error) throw new Error(error.message)
      return Boolean(data?.length)
    }
    if (accountType === "driver" && (deleting || suspending || banning)) {
      let hasActiveOrder = false
      try { hasActiveOrder = await activeDriverOrder() } catch (error) { return fail(error instanceof Error ? error.message : "Could not check this driver's active deliveries.") }
      if (hasActiveOrder) return fail("Reassign or complete this driver's active deliveries before suspending, banning, or deleting the account.", 409)
    }

    if (deleting) {
      if (authUserId) {
        const { error } = await authAdmin.deleteUser(authUserId)
        if (error) return fail(`Could not delete Auth account: ${error.message}`, 409)
      }
      if (accountType === "driver") result = await supabase.from("delivery_personnel").delete().eq("id", profileId).select("id")
      else if (accountType === "customer") result = await supabase.from("customers").delete().eq("id", profileId).select("id")
      return result?.error ? fail(result.error.message) : NextResponse.json({ ok: true })
    }

    if (banning && !authUserId) return fail("A permanent email ban requires a linked Supabase Auth account.", 409)
    if (authUserId) {
      const metadata = { ...currentAuthMetadata, akp_account_status: banning ? "banned" : suspending ? "suspended" : "active" }
      const { error } = await authAdmin.updateUserById(authUserId, {
        ban_duration: suspending || banning ? "876000h" : "none",
        app_metadata: metadata,
      })
      if (error) return fail(error.message)
    }
    if (accountType === "admin") {
      result = await supabase.from("admin_users").update({ is_active: reactivating || unbanning }).eq("user_id", accountId).select("user_id")
    } else if (accountType === "driver") {
      let availability = suspending || banning ? "suspended" : "available"
      if (reactivating || unbanning) {
        let hasActiveOrder = false
        try { hasActiveOrder = await activeDriverOrder() } catch (error) { return fail(error instanceof Error ? error.message : "Could not check this driver's active deliveries.") }
        if (hasActiveOrder) availability = "on_delivery"
      }
      result = await supabase.from("delivery_personnel").update({ availability }).eq("id", profileId).select("id")
    } else if (accountType === "customer") {
      result = await supabase.from("customers").update({ status: suspending || banning ? "suspended" : "active" }).eq("id", profileId).select("id")
    }
  } else if (module === "returns-refunds") {
    if (action === "record refund") {
      const refundAmount = money(value("Refund Amount"))
      const refundReference = value("GCash Transaction Reference")
      if (!Number.isFinite(refundAmount) || refundAmount <= 0 || !refundReference || refundReference.length > 120) {
        return fail("Enter a positive refund amount and a GCash transaction reference of up to 120 characters.")
      }
      const { error } = await supabase.rpc("record_customer_return_refund", {
        p_request_number: row[0],
        p_refund_amount: refundAmount,
        p_refund_reference: refundReference,
      })
      if (error) return fail(error.message, error.code === "42501" ? 403 : 400)
      return NextResponse.json({ ok: true })
    }
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
    const method = payment.method.trim().toLowerCase().replaceAll("_", " ")
    const isCod = ["cod", "cash on delivery"].includes(method)
    const isGcash = ["gcash", "wallet", "e-wallet"].includes(method)
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
    if (result.error) return fail(result.error.message)
    if (Array.isArray(result.data) && result.data.length === 0) return fail("Payment status changed while this action was being processed. Refresh and try again.", 409)
  } else if (module === "feedback") {
    const status = action.includes("remove") ? "removed" : action.includes("flag") && !action.includes("unflag") ? "flagged" : "visible"
    if (!row[8]) return fail("Feedback identifier is missing. Refresh and try again.")
    result = await supabase.from("feedback").update({ moderation_status: status }).eq("id", row[8]).select("id")
  } else if (module === "promotions") {
    if (action === "create") {
      const promoName = value("Promo Name")
      const description = value("Promotion Description")
      const productSku = value("Promotion Product").split(" · ")[0]
      const discountInput = value("Discount (%)")
      const discount = Number(discountInput)
      const endDate = value("Valid Until")
      if (!promoName || promoName.length > 120 || !description.trim() || description.length > 1000 || !productSku || !/^\d{1,2}(?:\.\d{1,2})?$/.test(discountInput) || !Number.isFinite(discount) || discount <= 0 || discount >= 100) return fail("Enter a name, description (up to 1,000 characters), published product, and percentage from 0.01 to 99.99.")
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return fail("Choose a valid promotion end date.")
      const ends = new Date(`${endDate}T23:59:59+08:00`)
      if (!Number.isFinite(ends.getTime()) || ends.toISOString().slice(0, 10) !== endDate || ends <= new Date()) return fail("Choose a valid future end date.")
      const { error } = await supabase.rpc("create_product_promotion", {
        p_name: promoName,
        p_description: description,
        p_product_sku: productSku,
        p_discount_percent: discount,
        p_ends_at: ends.toISOString(),
      })
      if (error) return fail(error.message, error.code === "42501" ? 403 : 400)
      return NextResponse.json({ ok: true })
    }
    const promotionId = typeof row[6] === "string" ? row[6] : ""
    if (!promotionId) return fail("Promotion identifier is missing. Refresh and try again.")
    const status = action.includes("publish") || action.includes("reactivate") ? "active" : action.includes("end") ? "ended" : action.includes("archive") ? "archived" : null
    const patch: Record<string, string | number | null> = { name: value("Promo Name") || row[0] }
    if (values.Description !== undefined) patch.description = value("Description") || null
    if (status) patch.status = status
    if (values.Discount) {
      const discount = value("Discount")
      patch.discount_type = discount.includes("%") ? "percentage" : "fixed_amount"
      patch.discount_value = Number(discount.replace(/[^\d.]/g, ""))
    }
    if (values["Valid Until"]) patch.ends_at = new Date(value("Valid Until")).toISOString()
    result = await supabase.from("promotions").update(patch).eq("id", promotionId).select("id")
  } else if (module === "notifications") {
    if (action !== "create") return fail("Unsupported announcement action.")
    const title = value("Title")
    const message = value("Description")
    const role = value("Target Role").toLowerCase()
    const audience = role === "customer" ? "customers" : role === "driver" ? "drivers" : role === "staff" ? "staff" : ""
    if (!title || title.length > 120 || !message || message.length > 2000 || !audience) return fail("Enter a title, description (up to 2,000 characters), and choose Customers, Staff, or Drivers.")
    result = await supabase.from("announcements").insert({ title, message, audience, status: "sent", sent_at: new Date().toISOString(), created_by: claims.sub, kind: "announcement" })
  } else {
    return fail("This module is view-only or has no safe database action configured.", 422)
  }

  if (result?.error) return fail(result.error.message, 400)
  if (Array.isArray(result?.data) && result.data.length === 0) return fail("No matching record was updated.", 404)
  return NextResponse.json({ ok: true })
}
