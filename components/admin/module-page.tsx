"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Archive, Bell, ChevronDown, CircleAlert, Download, Filter, Folder, ImagePlus, Leaf, MapPin, Plus, RotateCcw, ShieldCheck, Trash2, Eye, Pencil, PackagePlus, Smartphone, Upload } from "lucide-react"
import { Button, Card, Chip, Input, Modal } from "@heroui/react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import Image from "next/image"

type ModuleConfig = { title: string; subtitle: string; action?: string; stats?: [string, string, string?][]; columns: string[]; rows: string[][]; search: string; filter?: string; filterOptions?: string[]; note?: string }
type InventoryMovement = { movement_type: string; quantity_delta: number; reason: string; created_at: string }

function parseInventoryMovements(value: string | undefined): InventoryMovement[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((movement): movement is InventoryMovement =>
      typeof movement === "object" && movement !== null &&
      typeof movement.movement_type === "string" &&
      typeof movement.quantity_delta === "number" &&
      typeof movement.reason === "string" &&
      typeof movement.created_at === "string"
    )
  } catch {
    return []
  }
}

const modules: Record<string, ModuleConfig> = {
  orders: { title: "Order Management", subtitle: "Review customer orders, payment details, and pickup or delivery progress", action: "Export Orders", stats: [["Awaiting Action", "0"], ["Preparing", "0"], ["In Fulfillment", "0"], ["Completed", "0"]], search: "Search order ID or customer...", filter: "Order status", filterOptions: ["Pending", "Preparing", "Ready for Pickup", "Out for Delivery", "Completed", "Cancelled"], columns: ["Order ID", "Customer", "Order Type", "Items", "Total", "Payment Method", "Payment Status", "Order Status", "Date", "Actions"], rows: [["#ORD-0041", "Maria Santos", "Delivery", "3", "₱1,200", "GCash", "Pending", "Pending", "Aug 14", "View · Accept Order · Cancel"], ["#ORD-0040", "Jose Reyes", "Walk-in", "2", "₱840", "COD", "Pending", "Preparing", "Aug 14", "View · Ready for Pickup · Cancel"], ["#ORD-0039", "Ana Cruz", "Delivery", "5", "₱2,100", "GCash", "Paid", "Out for Delivery", "Aug 13", "View · Complete Order"]], note: "GCash references are not proof of payment. Confirm funds manually in the platform's GCash account. Walk-in orders progress to Ready for Pickup; delivery orders progress to Out for Delivery." },
  inventory: { title: "Inventory Management", subtitle: "Track stock levels, movements, and product availability", action: "Record Movement", stats: [["Total SKUs", "42"], ["Low Stock Items", "5", "At or below the store-wide warning threshold"], ["Out of Stock", "2"], ["Last Updated", "Today", "Aug 14, 2026"]], search: "Search by product name or SKU...", filter: "Filter by Status", columns: ["SKU", "Product Name", "Current Stock", "Movement History", "Status", "Actions"], rows: [["SKU-001", "Woven Abaca Bag", "12", "2 activities", "Normal", "", "[{\"movement_type\":\"restock\",\"quantity_delta\":20,\"reason\":\"Supplier delivery\",\"created_at\":\"2026-08-12T09:00:00.000Z\"},{\"movement_type\":\"sale\",\"quantity_delta\":-8,\"reason\":\"Customer orders\",\"created_at\":\"2026-08-13T10:30:00.000Z\"}]"], ["SKU-002", "Native Rattan Basket", "8", "1 activity", "Low Stock", "", "[{\"movement_type\":\"sale\",\"quantity_delta\":-3,\"reason\":\"Store sale\",\"created_at\":\"2026-08-10T09:00:00.000Z\"}]"], ["SKU-003", "Handwoven Table Runner", "25", "1 activity", "Normal", "", "[{\"movement_type\":\"sale\",\"quantity_delta\":-5,\"reason\":\"Customer order\",\"created_at\":\"2026-08-14T08:30:00.000Z\"}]"], ["SKU-004", "Bamboo Jewelry Set", "2", "1 activity", "Low Stock", "", "[{\"movement_type\":\"damage\",\"quantity_delta\":-4,\"reason\":\"Damaged during inspection\",\"created_at\":\"2026-08-13T08:00:00.000Z\"}]"], ["SKU-005", "Native Buri Hat", "0", "1 activity", "Out of Stock", "", "[{\"movement_type\":\"sale\",\"quantity_delta\":-6,\"reason\":\"Customer order\",\"created_at\":\"2026-08-11T09:00:00.000Z\"}]"]], note: "Movement history records restocking, sales, damage, and manual adjustments. Low-stock warnings use one store-wide threshold configured in Settings." },
  customers: { title: "Customer Management", subtitle: "Manage customer accounts, information, and transaction records", action: "Export Customers", search: "Search by name, email, or phone...", filter: "Filter by Status", columns: ["Customer ID", "Name", "Email", "Phone", "Total Orders", "Total Spent", "Status", "Actions"], rows: [["CUS-001", "Maria Santos", "maria@email.com", "09XX-XXX-XXX", "6", "₱5,400", "Active", "View · Suspend"], ["CUS-002", "Jose Reyes", "jose@email.com", "09XX-XXX-XXX", "3", "₱2,100", "Active", "View · Suspend"], ["CUS-003", "Ana Cruz", "ana@email.com", "09XX-XXX-XXX", "10", "₱9,800", "Active", "View · Suspend"], ["CUS-004", "Pedro Lim", "pedro@email.com", "09XX-XXX-XXX", "1", "₱560", "Suspended", "View · Reactivate"]], note: "Customer details include profile information, address book, order history, and feedback records." },
  "delivery-personnel": { title: "Delivery Personnel Management", subtitle: "Manage delivery staff availability and order assignments", stats: [["Total Personnel", "8"], ["Available", "5"], ["On Delivery", "3"], ["Deliveries Today", "11"]], search: "Search personnel...", columns: ["Personnel ID", "Name", "Contact", "Assigned Orders", "Availability", "Actions"], rows: [["DEL-001", "Ramon Dela Cruz", "09XX-XXX-XXX", "#ORD-0041, #ORD-0039", "On Delivery", "View · Unassign"], ["DEL-002", "Julio Marcos", "09XX-XXX-XXX", "#ORD-0040", "On Delivery", "View · Unassign"], ["DEL-003", "Benito Aquino", "09XX-XXX-XXX", "—", "Available", "View · Suspend"], ["DEL-004", "Carlos Ramos", "09XX-XXX-XXX", "—", "Off Duty", "View · Suspend"]], note: "Use Assign for a specific driver and order, or Auto-assign to balance open deliveries across available personnel." },
  "returns-refunds": { title: "Return and Refund Management", subtitle: "Handle eligible return and refund requests from customers", action: "Export", stats: [["Open Requests", "4"], ["Under Review", "2"], ["Approved", "1"], ["Rejected", "1"]], search: "Search by request, order, or customer...", filter: "All Status", columns: ["Request ID", "Order ID", "Customer", "Reason", "Type", "Amount", "Status", "Actions"], rows: [["RET-007", "#ORD-0033", "Rosa Tan", "Defective item", "Refund", "₱780", "Open", "Review · Approve · Reject"], ["RET-006", "#ORD-0030", "Ana Cruz", "Wrong item received", "Return + Refund", "₱1,200", "Under Review", "Review · Approve · Reject"], ["RET-005", "#ORD-0028", "Jose Reyes", "Changed mind", "Return", "₱430", "Rejected", "View"], ["RET-004", "#ORD-0025", "Maria Santos", "Item not as described", "Refund", "₱650", "Approved", "View"]], note: "Approved refunds create a payment reversal and notify the customer. Requests must be within the return window." },
  feedback: { title: "Customer Feedback Management", subtitle: "Monitor ratings and feedback on products and completed transactions", action: "Export Feedback", stats: [["Avg. Product Rating", "4.3 ★"], ["Total Reviews", "128"], ["Flagged Feedback", "2"], ["Unread", "7"]], search: "Search by product or customer...", filter: "All Ratings", filterOptions: ["★★★★★", "★★★★☆", "★★★☆☆", "★★☆☆☆", "★☆☆☆☆"], columns: ["Feedback ID", "Customer", "Product", "Rating", "Comment", "Order ID", "Date", "Actions"], rows: [["FBK-128", "Maria Santos", "Woven Abaca Bag", "★★★★★", "Beautiful craftsmanship!", "#ORD-0038", "Aug 14", "View · Flag"], ["FBK-127", "Ana Cruz", "Rattan Basket", "★★★★☆", "Good quality, fast delivery", "#ORD-0035", "Aug 13", "View · Flag"], ["FBK-126", "Unknown", "Bamboo Jewelry Set", "★☆☆☆☆", "[flagged content]", "#ORD-0032", "Aug 12", "View · Unflag · Remove"], ["FBK-125", "Jose Reyes", "Table Runner", "★★★★☆", "Nice product", "#ORD-0030", "Aug 11", "View · Flag"]], note: "Flagged feedback is hidden from the storefront pending review. Feedback is linked to verified purchases." },
  payments: { title: "Payment Management", subtitle: "Manually verify GCash transfers and record cash collected for COD orders", action: "Export Records", stats: [["GCash Verification", "0"], ["COD Collection Due", "0"], ["Paid", "0"], ["Rejected", "0"]], search: "Search payment, order, or customer...", filter: "Payment method", filterOptions: ["GCash", "COD"], columns: ["Payment ID", "Order ID", "Customer", "Amount", "Method", "GCash Reference", "Payment Status", "Date", "Actions"], rows: [["PAY-DEMO-001", "#ORD-0041", "Maria Santos", "₱1,200", "GCash", "DEMO-PAY-1001", "Pending", "Aug 14", "Confirm Payment · Reject Payment"], ["PAY-DEMO-002", "#ORD-0040", "Jose Reyes", "₱840", "COD", "—", "Pending", "Aug 14", "Mark Cash Collected"]], note: "GCash is manual verification only: independently confirm the exact amount and reference in the platform's GCash account. Never mark a transfer paid from a reference number or screenshot alone. COD stays pending until cash is physically collected." },
  products: { title: "Product Management", subtitle: "Manage products, listings, and Native Heritage Showcase content", action: "Add Product", search: "Search products...", filter: "Category", filterOptions: ["Native Materials", "Bags", "Baskets", "Home Decor", "Accessories", "Headwear"], columns: ["Product ID", "Image", "Product Name", "Category", "Price", "Stock", "Status", "Actions"], rows: [["PRD-001", "◻", "Woven Abaca Bag", "Bags", "₱850", "12", "Active", "View · Edit · Archive"], ["PRD-002", "◻", "Native Rattan Basket", "Baskets", "₱1,200", "8", "Active", "View · Edit · Archive"], ["PRD-003", "◻", "Handwoven Table Runner", "Home Decor", "₱430", "25", "Active", "View · Edit · Archive"], ["PRD-004", "◻", "Bamboo Jewelry Set", "Accessories", "₱650", "2", "Low Stock", "View · Edit · Archive"], ["PRD-005", "◻", "Native Buri Hat", "Headwear", "₱320", "0", "Out of Stock", "View · Edit · Archive"]], note: "Product images, category, price, stock, visibility, and Heritage Showcase membership are managed here." },
  "audit-logs": { title: "Audit Logs", subtitle: "Administrative activity log for monitoring, accountability, and security", action: "Export Logs", search: "Search by user, action, or module...", filter: "All Modules", filterOptions: ["Product Management", "Order Management", "Payment Management", "Customer Management", "Inventory Management", "Backup & Restore"], columns: ["Log ID", "User", "Role", "Module", "Action", "IP Address", "Timestamp"], rows: [["LOG-441", "admin@akp.com", "Owner", "Product Management", "Updated PRD-003 price", "192.168.1.1", "Aug 14, 10:42 AM"], ["LOG-440", "staff01@akp.com", "Staff", "Order Management", "Processed #ORD-0040", "192.168.1.5", "Aug 14, 10:38 AM"], ["LOG-439", "staff01@akp.com", "Staff", "Payment Management", "Verified TXN-0090", "192.168.1.5", "Aug 14, 10:30 AM"], ["LOG-438", "admin@akp.com", "Owner", "Customer Management", "Suspended CUS-004", "192.168.1.1", "Aug 14, 09:55 AM"], ["LOG-437", "staff02@akp.com", "Staff", "Inventory Management", "Adjusted SKU-001 stock +20", "192.168.1.7", "Aug 14, 09:20 AM"], ["LOG-436", "admin@akp.com", "Owner", "Backup & Restore", "Triggered manual backup", "192.168.1.1", "Aug 14, 08:00 AM"]], note: "Audit logs are read-only. Owner can review all records; Staff access is limited to their own activity." },
}

const extras: Record<string, ModuleConfig> = {
  "backup-restore": { title: "Backup and Restore", subtitle: "Ensure business data is backed up and can be recovered", action: "Trigger Manual Backup", stats: [["Last Backup", "Aug 14", "Today at 08:00 AM · Successful"], ["Backup Size", "124 MB"], ["Auto Backup", "Enabled", "Daily at 2:00 AM"], ["Total Backups Stored", "30", "Oldest: Jul 1, 2026"]], search: "Search backup history...", columns: ["Backup ID", "Type", "Size", "Status", "Date & Time", "Actions"], rows: [["BCK-030", "Auto", "124 MB", "Successful", "Aug 14 · 02:00 AM", "Restore · Download"], ["BCK-029", "Manual", "312 MB", "Successful", "Aug 14 · 08:00 AM", "Restore · Download"], ["BCK-028", "Auto", "121 MB", "Successful", "Aug 13 · 02:00 AM", "Restore · Download"], ["BCK-027", "Auto", "120 MB", "Failed", "Aug 12 · 02:00 AM", "Retry · Details"]], note: "Only Owner can restore. Restoring overwrites current data and requires confirmation. Failed backups alert the Owner." },
  reports: { title: "Reports", subtitle: "Business and operational reports for monitoring and management", action: "Export PDF", search: "Select a date range...", columns: ["Report", "Description", "Period", "Actions"], rows: [["Sales Report", "Daily, weekly, monthly revenue breakdown", "This month", "Generate"], ["Inventory Report", "Stock levels, movements, reorder alerts", "Current", "Generate"], ["Order Report", "Order volume, fulfillment rate, cancellations", "This month", "Generate"], ["Customer Report", "New registrations, activity, top buyers", "This month", "Generate"], ["Delivery Report", "Delivery success rate, personnel performance", "This month", "Generate"], ["Payment Report", "Transactions, refunds, payment methods", "This month", "Generate"]], note: "Choose a date range and generate a report. Preview updates inline; exports are available as PDF or CSV." },
  promotions: { title: "Marketing and Notifications", subtitle: "Manage promotions, business announcements, and system notifications", action: "New Promotion", search: "Search promotions and announcements...", columns: ["Promo Name", "Discount", "Valid Until", "Status", "Actions"], rows: [["Summer Sale", "15% off", "Aug 31", "Active", "Edit · End"], ["Bulk Discount", "₱100 off ₱1k+", "Sep 15", "Active", "Edit · End"], ["New User Promo", "10% off", "Expired", "Inactive", "Reactivate"]], note: "Announcements target all customers or all users. Notification history and send status are available." },
  notifications: { title: "Marketing and Notifications", subtitle: "Send announcements and customer notifications", action: "New Announcement", search: "Search sent notifications...", columns: ["Title", "Target", "Type", "Sent", "Status", "Actions"], rows: [["New product arrivals!", "All Customers", "Announcement", "Aug 14", "Sent", "View"], ["Holiday hours notice", "All Customers", "Announcement", "Aug 10", "Sent", "View"], ["App maintenance", "All Users", "System", "Aug 5", "Sent", "View"]], note: "Compose a message, select a target audience and notification type, then send." },
  "heritage-showcase": { title: "Native Heritage Showcase", subtitle: "Curate local products and the stories behind their craft", action: "Add to Showcase", search: "Search showcased products...", columns: ["Product", "Craft / Origin", "Category", "Visibility", "Featured", "Actions"], rows: [["Woven Abaca Bag", "Handwoven abaca · South Cotabato", "Bags", "Published", "Yes", "Edit · Remove"], ["Native Rattan Basket", "Traditional rattan weaving", "Baskets", "Published", "Yes", "Edit · Remove"], ["Bamboo Jewelry Set", "Locally crafted bamboo", "Accessories", "Draft", "No", "Edit · Publish"]], note: "Showcase entries connect to catalog products and explain local materials, makers, and craft traditions." },
  "returns-and-refunds": { title: "Return and Refund Management", subtitle: "Handle eligible return and refund requests from customers", action: "Export", stats: [["Open Requests", "4"], ["Under Review", "2"], ["Approved", "1"], ["Rejected", "1"]], search: "Search requests...", columns: ["Request ID", "Order ID", "Customer", "Reason", "Type", "Amount", "Status", "Actions"], rows: [["RET-007", "#ORD-0033", "Rosa Tan", "Defective item", "Refund", "₱780", "Open", "Review · Approve · Reject"]] },
  users: { title: "User Management", subtitle: "Review real owner, staff, delivery driver, and customer accounts", stats: [["Owner/Admin", "0"], ["Staff", "0"], ["Delivery Drivers", "0"], ["Customers", "0"]], search: "Search by name or email...", filter: "Account type", filterOptions: ["Owner/Admin", "Staff", "Delivery Driver", "Customer"], columns: ["Account ID", "Name", "Email", "Account Type", "Status", "Last Sign In", "Actions"], rows: [], note: "Accounts are ranked by type. Suspending a driver with active deliveries is blocked; owner accounts cannot be suspended from this screen. Customer and driver status changes update their records and depend on the customer app enforcing those statuses." },
  settings: { title: "Settings", subtitle: "Configure store, operational, and account preferences", columns: ["Setting", "Current value", "Description", "Actions"], search: "", rows: [["Store name", "AKP Native Products Trading", "Displayed in admin and customer surfaces", "Edit"], ["Currency", "PHP (₱)", "Local transaction currency", "Edit"], ["Return window", "7 days", "Eligible return period", "Edit"], ["Automatic backups", "Daily at 2:00 AM", "Backup schedule", "Configure"]] },
}

const slugAliases: Record<string, string> = { "return-refund": "returns-refunds", "return-and-refund": "returns-refunds", "marketing-notifications": "promotions" }
const titleCase = (slug: string) => slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")

function statusColor(value: string) { const s = value.toLowerCase(); if (["active", "successful", "verified", "paid", "completed", "delivered", "ready for pickup", "normal", "available", "approved", "published", "sent"].some((x) => s.includes(x))) return "success" as const; if (["pending", "low stock", "open", "review", "processing", "preparing", "out for delivery", "on delivery"].some((x) => s.includes(x))) return "warning" as const; if (["failed", "rejected", "cancelled", "out of stock", "suspended", "inactive"].some((x) => s.includes(x))) return "danger" as const; return "default" as const }

function parseOrderItems(value: string): { name: string; quantity: string }[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.flatMap((item): { name: string; quantity: string }[] => {
      if (typeof item !== "object" || item === null || !("name" in item) || !("quantity" in item)) return []
      if (typeof item.name !== "string" || (typeof item.quantity !== "number" && typeof item.quantity !== "string")) return []
      return [{ name: item.name, quantity: String(item.quantity) }]
    })
  } catch {
    const legacyItem = /^(.*)\s×\s(\d+)$/.exec(value)
    return legacyItem ? [{ name: legacyItem[1], quantity: legacyItem[2] }] : []
  }
  return []
}

function getDisplayStats(slug: string, stats: ModuleConfig["stats"], rows: string[][], databaseBacked: boolean) {
  if (!stats || !databaseBacked) return stats
  const countStatus = (index: number, value: string) => rows.filter((row) => row[index]?.toLowerCase() === value).length
  const today = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(new Date())
  if (slug === "orders") return [["Awaiting Action", String(countStatus(7, "pending"))], ["Preparing", String(countStatus(7, "preparing"))], ["In Fulfillment", String(rows.filter((row) => ["ready for pickup", "out for delivery"].includes(row[7]?.toLowerCase())).length)], ["Completed", String(countStatus(7, "completed"))]] as [string, string, string?][]
  if (slug === "inventory") return [["Total SKUs", String(rows.length)], ["Low Stock Items", String(rows.filter((row) => ["low stock", "out of stock"].includes(row[4]?.toLowerCase())).length), "At or below store-wide threshold"], ["Out of Stock", String(countStatus(4, "out of stock"))], ["Last Updated", today, "Philippine time"]] as [string, string, string?][]
  if (slug === "delivery-personnel") return [["Total Personnel", String(rows.length)], ["Available", String(countStatus(4, "available"))], ["On Delivery", String(countStatus(4, "on delivery"))], ["Assigned Orders", String(rows.filter((row) => row[3] && row[3] !== "—").length)]] as [string, string, string?][]
  if (slug === "users") return [["Owner/Admin", String(rows.filter((row) => row[3] === "Owner/Admin").length)], ["Staff", String(rows.filter((row) => row[3] === "Staff").length)], ["Delivery Drivers", String(rows.filter((row) => row[3] === "Delivery Driver").length)], ["Customers", String(rows.filter((row) => row[3] === "Customer").length)]] as [string, string, string?][]
  if (slug === "returns-refunds") return [["Open Requests", String(countStatus(6, "pending"))], ["Under Review", String(countStatus(6, "under review"))], ["Approved", String(countStatus(6, "approved"))], ["Rejected", String(countStatus(6, "rejected"))]] as [string, string, string?][]
  if (slug === "feedback") {
    const ratings = rows.map((row) => (row[3]?.match(/★/g) ?? []).length).filter((rating) => rating > 0)
    const average = ratings.length ? (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1) : "—"
    const flagged = rows.filter((row) => row[7]?.toLowerCase().includes("unflag") || row[4]?.toLowerCase().includes("flagged content")).length
    return [["Avg. Product Rating", `${average}${average === "—" ? "" : " ★"}`], ["Total Reviews", String(rows.length)], ["Flagged Feedback", String(flagged)], ["Unread", "—", "Not tracked in the current schema"]] as [string, string, string?][]
  }
  if (slug === "payments") {
    const amount = (row: string[]) => Number((row[3] ?? "").replace(/[^\d.]/g, "")) || 0
    return [["GCash Verification", String(rows.filter((row) => row[4] === "Online payment (GCash)" && row[6] === "Pending").length)], ["COD Collection Due", String(rows.filter((row) => row[4] === "COD" && row[6] === "Pending").length)], ["Paid", String(countStatus(6, "paid"))], ["Rejected", String(countStatus(6, "rejected"))]] as [string, string, string?][]
  }
  return stats
}

type DialogState = { title: string; kind: "view" | "form" | "confirm"; row?: string[]; rowIndex?: number; bulkRows?: string[][]; action?: string; values?: Record<string, string>; message?: string; table?: "main" | "announcements"; fields?: string[]; extraFields?: [string, string][] }

const bulkActions: Record<string, string[]> = {
  orders: ["Accept Order", "Cancel"], payments: ["Confirm Payment", "Reject Payment", "Mark Cash Collected"],
  customers: ["Suspend", "Reactivate"], users: ["Suspend", "Reactivate"],
  "returns-refunds": ["Approve", "Reject"], feedback: ["Flag", "Unflag", "Remove"],
  products: ["Archive"],
}

function saveCsv(filename: string, headings: string[], rows: string[][]) {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`
  const csv = [headings, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function ModulePage({ slug: rawSlug, databaseRows, databaseAnnouncements, assignableOrders = [], unassignableOrders = [], databaseError = false }: { slug: string; databaseRows?: string[][]; databaseAnnouncements?: string[][]; assignableOrders?: { orderNumber: string; customer: string }[]; unassignableOrders?: { driverId: string; orderNumber: string; customer: string }[]; databaseError?: boolean }) {
  const router = useRouter()
  const slug = slugAliases[rawSlug] ?? rawSlug
  const config = modules[slug] ?? extras[slug] ?? { title: titleCase(slug), subtitle: `Manage ${titleCase(slug).toLowerCase()} for AKP Native Products`, columns: ["Name", "Details", "Status", "Actions"], rows: [], search: "Search..." }
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("All")
  const [generatedReport, setGeneratedReport] = useState<string | null>(null)
  const [rows, setRows] = useState<string[][]>(databaseRows ?? config.rows)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkAction, setBulkAction] = useState("")
  const [loaded, setLoaded] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [productImage, setProductImage] = useState<File | null>(null)
  const [productImagePreview, setProductImagePreview] = useState("")
  const previewObjectUrl = useRef("")
  const [saving, setSaving] = useState(false)
  const [autoAssignBusy, setAutoAssignBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const [dateRange, setDateRange] = useState("This month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [announcementRows, setAnnouncementRows] = useState<string[][]>(databaseError ? [] : databaseAnnouncements ?? [["New product arrivals!", "All Customers", "Aug 14", "View · Delete"], ["Holiday hours notice", "All Customers", "Aug 10", "View · Delete"], ["App maintenance", "All Users", "Aug 5", "View · Delete"]])
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [restoreId, setRestoreId] = useState("")
  const [gcash, setGcash] = useState({ accountName: "", accountNumber: "", qrUrl: "", qrPath: "", enabled: false, canEdit: false })
  const [gcashFile, setGcashFile] = useState<File | null>(null)
  const [gcashPreview, setGcashPreview] = useState("")
  const [gcashDialogOpen, setGcashDialogOpen] = useState(false)
  const [gcashBusy, setGcashBusy] = useState(false)
  const [gcashMessage, setGcashMessage] = useState("")
  const gcashObjectUrl = useRef("")
  const [inventoryThreshold, setInventoryThreshold] = useState(10)
  const [thresholdDraft, setThresholdDraft] = useState("10")
  const [thresholdCanEdit, setThresholdCanEdit] = useState(false)
  const [thresholdBusy, setThresholdBusy] = useState(false)
  const [thresholdMessage, setThresholdMessage] = useState("")
  const isDatabasePreview = databaseRows !== undefined
  useEffect(() => () => { if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current); if (gcashObjectUrl.current) URL.revokeObjectURL(gcashObjectUrl.current) }, [])
  useEffect(() => {
    if (slug !== "settings") return
    let active = true
    let settingsLoading = false
    const loadSettings = async () => {
      if (settingsLoading) return
      settingsLoading = true
      try {
        const response = await fetch("/api/admin/payment-settings", { cache: "no-store" })
        const result = await response.json() as { settings?: { accountName?: string; accountNumber?: string; qrUrl?: string; qrPath?: string; enabled?: boolean }; canEdit?: boolean; error?: string }
        if (!response.ok) throw new Error(result.error || "Could not load GCash settings.")
        if (!active || document.querySelector('[role="dialog"]')) return
        setGcash({ accountName: result.settings?.accountName ?? "", accountNumber: result.settings?.accountNumber ?? "", qrUrl: result.settings?.qrUrl ?? "", qrPath: result.settings?.qrPath ?? "", enabled: result.settings?.enabled ?? false, canEdit: result.canEdit ?? false })
        setGcashPreview(result.settings?.qrUrl ?? "")
      } catch (error) {
        if (active && !document.querySelector('[role="dialog"]')) setGcashMessage(error instanceof Error ? error.message : "Could not load GCash settings.")
      } finally { settingsLoading = false }
    }
    void loadSettings()
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector('[role="dialog"]')) void loadSettings()
    }, 3000)
    return () => { active = false; window.clearInterval(interval) }
  }, [slug])
  useEffect(() => {
    if (!["inventory", "settings"].includes(slug)) return
    let active = true
    fetch("/api/admin/inventory-settings", { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as { threshold?: number; canEdit?: boolean; error?: string }
      if (!response.ok) throw new Error(result.error || "Could not load inventory settings.")
      if (!active) return
      const threshold = result.threshold ?? 10
      setInventoryThreshold(threshold)
      setThresholdDraft(String(threshold))
      setThresholdCanEdit(result.canEdit ?? false)
      setThresholdMessage("")
    }).catch((error: unknown) => {
      if (active) setThresholdMessage(error instanceof Error ? error.message : "Could not load inventory settings.")
    })
    return () => { active = false }
  }, [slug])
  useEffect(() => {
    setLoaded(false)
    if (databaseRows !== undefined) {
      setRows(databaseRows)
      if (databaseError) setAnnouncementRows([])
      else if (databaseAnnouncements !== undefined) setAnnouncementRows(databaseAnnouncements)
      setLoaded(true)
      return
    }
    try {
      const saved = localStorage.getItem(`akp-admin:${slug}`)
      setRows(saved ? JSON.parse(saved) as string[][] : config.rows)
      const savedAnnouncements = localStorage.getItem("akp-admin:announcements")
      if (savedAnnouncements) setAnnouncementRows(JSON.parse(savedAnnouncements) as string[][])
      const savedNotes = localStorage.getItem(`akp-admin:notes:${slug}`)
      if (savedNotes) setDecisionNotes(JSON.parse(savedNotes) as Record<string, string>)
    } catch { setRows(config.rows) }
    setLoaded(true)
  }, [slug, databaseRows, databaseAnnouncements, databaseError])
  useEffect(() => { if (loaded && !isDatabasePreview) localStorage.setItem(`akp-admin:${slug}`, JSON.stringify(rows)) }, [loaded, isDatabasePreview, rows, slug])
  useEffect(() => { if (loaded && !isDatabasePreview) localStorage.setItem("akp-admin:announcements", JSON.stringify(announcementRows)) }, [loaded, isDatabasePreview, announcementRows])
  useEffect(() => { if (loaded) localStorage.setItem(`akp-admin:notes:${slug}`, JSON.stringify(decisionNotes)) }, [loaded, decisionNotes, slug])
  const filteredRows = useMemo(() => rows.filter((row) => (slug === "orders" ? row.slice(0, config.columns.length) : row).join(" ").toLowerCase().includes(query.toLowerCase()) && (filter === "All" || row.some((cell) => cell.toLowerCase().includes(filter.toLowerCase())))), [rows, filter, query, slug, config.columns.length])
  const selectedRows = rows.filter((row) => selectedIds.includes(row[0]))
  const toggleSelected = (row: string[], checked: boolean) => setSelectedIds((current) => checked ? current.includes(row[0]) ? current : current.length < 100 ? [...current, row[0]] : current : current.filter((id) => id !== row[0]))
  const startBulkAction = () => {
    if (!bulkAction || !selectedRows.length) return
    setDialog({ title: `${bulkAction} ${selectedRows.length} selected records?`, kind: "confirm", row: [String(selectedRows.length)], bulkRows: selectedRows, action: bulkAction, message: `This will attempt “${bulkAction}” on ${selectedRows.length} selected records. Each record is checked independently; some may be skipped if its current status does not allow this action.` })
  }
  const openForm = (title: string, row?: string[], rowIndex?: number, action?: string, customFields?: string[]) => {
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current)
    previewObjectUrl.current = ""
    setProductImage(null)
    setProductImagePreview(slug === "products" ? row?.[12] || "" : "")
    const fields = customFields ?? config.columns.filter((column) => column !== "Actions" && column !== "Status" && !(slug === "products" && column === "Image"))
    const productValues: Record<string, string> = {
      "Product Name": row?.[2] ?? "", Description: row?.[8] ?? "",
      Category: row?.[3] ?? "", Price: (row?.[4] ?? "").replace(/^₱/, ""),
      "Craft / Origin": row?.[11] ?? "", Visibility: row?.[9] ?? "", Featured: row?.[10] ?? "No",
    }
    const values = Object.fromEntries(fields.map((field) => [field, slug === "products" ? (productValues[field] ?? "") : row?.[config.columns.indexOf(field)] ?? ""]))
    setDialog({ title, kind: "form", row, rowIndex, action, values })
  }
  const exportRows = (format: "csv" | "pdf" = "csv") => {
    if (format === "pdf") { window.print(); return }
    if (slug === "reports") {
      const selectedRows = generatedReport ? config.rows.filter((row) => row[0] === generatedReport) : config.rows
      const output = selectedRows.map(([name, description]) => [name, description, dateRange === "Custom range" ? `${customStart || "Start date"} to ${customEnd || "End date"}` : dateRange])
      saveCsv(`reports-${new Date().toISOString().slice(0, 10)}.csv`, ["Report", "Description", "Period"], output)
      setNotice(`Exported ${output.length} report ${output.length === 1 ? "preview" : "summaries"} as CSV.`)
      return
    }
    saveCsv(`${slug}-${new Date().toISOString().slice(0, 10)}.csv`, config.columns, filteredRows.map((row) => row.slice(0, config.columns.length)))
    setNotice(`Exported ${filteredRows.length} ${config.title.toLowerCase()} records as CSV.`)
  }
  const openAction = (action: string, row: string[], rowIndex: number, table: "main" | "announcements" = "main") => {
    const targetRows = table === "main" ? rows : announcementRows
    const index = targetRows.findIndex((candidate) => candidate[0] === row[0])
    const lower = action.toLowerCase()
    if (slug === "payments" && lower === "view receipt") {
      if (!row[10]) { setNotice("No payment screenshot was attached to this transfer."); return }
      window.open(`/api/admin/payment-proof?path=${encodeURIComponent(row[10])}`, "_blank", "noopener,noreferrer")
      return
    }
    if (/^(view|review|track|details|view details|view receipt)$/.test(lower)) {
      const extraFields: [string, string][] = []
      if (slug === "customers") extraFields.push(["Saved addresses", row[9] || "No saved addresses"], ["Order history", "See linked transactions in Order Management."], ["Feedback", "See verified reviews in Customer Feedback."])
      if (slug === "returns-refunds" && decisionNotes[row[0]]) extraFields.push(["Decision notes", decisionNotes[row[0]]])
      if (slug === "orders") extraFields.push(["Delivery address", row[10] || "Pickup at store / no address provided"], ["Ordered products", row[11] || "No item details available"], ["GCash reference", row[12] || "Not applicable"])
      if (slug === "payments") extraFields.push(["GCash transaction reference", row[5] || "Not provided"], ["Receipt screenshot", row[10] ? "Attached · use View Receipt to open the private image" : "Not attached"], ["Verification rule", row[4] === "Online payment (GCash)" ? "Compare the exact amount and reference against the incoming transaction in the platform's GCash account. A reference or screenshot alone is not confirmation." : "Mark paid only after cash has physically been collected."])
      if (slug === "products") extraFields.push(["Description", row[8] || "No description provided"], ["Visibility", row[9] || "—"], ["Featured", row[10] || "No"], ["Craft / Origin", row[11] || "Not provided"], ["Image URL", row[12] || "No image uploaded"])
      setDialog({ title: `${action}: ${row[0]}`, kind: "view", row, fields: table === "announcements" ? ["Title", "Target", "Sent"] : config.columns.filter((column) => column !== "Actions"), extraFields })
      return
    }
    if (lower === "download") {
      saveCsv(`${row[0].toLowerCase()}-backup.csv`, config.columns, [row])
      setNotice(`Downloaded ${row[0]} metadata as CSV.`)
      return
    }
    if (lower.includes("edit") || lower === "adjust") {
      const fields = lower === "adjust" ? ["Current Stock", "Reason"] : slug === "products" ? ["Product Name", "Image URL", "Description", "Category", "Price", "Craft / Origin", "Visibility", "Featured"] : undefined
      openForm(`${action}: ${row[0]}`, row, index, action, fields)
      return
    }
    if (lower === "assign") {
      if (isDatabasePreview && !assignableOrders.length) {
        setNotice("There are no unassigned delivery orders ready to assign.")
        return
      }
      openForm(`Assign an order to ${row[1]}`, row, index, action, ["Delivery Order"])
      return
    }
    if (lower === "unassign") {
      const driverOrders = unassignableOrders.filter((order) => order.driverId === row[6])
      if (!driverOrders.length) {
        setNotice("This driver has no unaccepted deliveries to remove.")
        return
      }
      openForm(`Remove an assigned order from ${row[1]}`, row, index, action, ["Assigned Order"])
      return
    }
    if (slug === "returns-refunds" && (lower === "approve" || lower === "reject")) {
      openForm(`${action}: ${row[0]}`, row, index, action, ["Decision Notes"])
      return
    }
    setDialog({ title: `${action}: ${row[0]}`, kind: "confirm", row, rowIndex: index, action, message: confirmMessage(action, slug), table })
  }
  const commitDialog = async () => {
    if (!dialog) return
    let uploadedImageUrl = ""
    let uploadedImagePath = ""
    if (isDatabasePreview) {
      const writable = ["products", "inventory", "orders", "customers", "delivery-personnel", "returns-refunds", "payments", "feedback", "promotions", "notifications", "heritage-showcase", "users"]
      if (!writable.includes(slug)) {
        setNotice("This module is read-only because its schema has no safe edit operation configured.")
        setDialog(null)
        return
      }
      const action = dialog.kind === "form"
        ? dialog.action === "Record Movement" ? "record-movement" : ["assign", "unassign"].includes(dialog.action?.toLowerCase() ?? "") ? dialog.action?.toLowerCase() : slug === "returns-refunds" ? dialog.action ?? "edit" : dialog.row ? "edit" : "create"
        : dialog.action ?? ""
      try {
        setSaving(true)
        if (dialog.bulkRows) {
          let succeeded = 0
          const failures: string[] = []
          for (const selectedRow of dialog.bulkRows) {
            try {
              const response = await fetch("/api/admin/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: slug, action, row: selectedRow }) })
              const result = await response.json() as { error?: string }
              if (!response.ok) throw new Error(result.error || "Action failed")
              succeeded += 1
            } catch (error) {
              failures.push(`${selectedRow[0]}: ${error instanceof Error ? error.message : "Action failed"}`)
            }
          }
          setSelectedIds([])
          setDialog(null)
          setNotice(`${action} applied to ${succeeded} of ${dialog.bulkRows.length} records.${failures.length ? ` Skipped: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? `; and ${failures.length - 3} more` : ""}` : ""}`)
          if (succeeded) router.refresh()
          return
        }
        let values = dialog.values ?? {}
        if (slug === "products" && productImage) {
          const supabase = createClient()
          const safeName = productImage.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "product-image"
          uploadedImagePath = `products/${crypto.randomUUID()}-${safeName}`
          const { error: uploadError } = await supabase.storage.from("product-images").upload(uploadedImagePath, productImage, { contentType: productImage.type, upsert: false })
          if (uploadError) throw uploadError
          uploadedImageUrl = supabase.storage.from("product-images").getPublicUrl(uploadedImagePath).data.publicUrl
          values = { ...values, "Image URL": uploadedImageUrl }
        }
        const response = await fetch("/api/admin/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module: slug, action, row: dialog.row ?? (slug === "inventory" ? rows.find((item) => item[0] === values.Product) : slug === "delivery-personnel" && action === "assign" ? rows.find((item) => `${item[1]} · ${item[0]}` === values["Delivery Personnel"]) : undefined), values }),
        })
        const result = await response.json() as { error?: string }
        if (!response.ok) {
          if (uploadedImagePath) await createClient().storage.from("product-images").remove([uploadedImagePath])
          throw new Error(result.error || "Database save failed.")
        }
        if (slug === "delivery-personnel" && action === "assign") {
          setNotice(`Assigned ${values["Delivery Order"]?.split(" · ")[0] ?? "order"} to ${dialog.row?.[1] ?? values["Delivery Personnel"]?.split(" · ")[0] ?? "driver"}.`)
          setDialog(null)
          router.refresh()
          return
        }
        if (slug === "delivery-personnel" && action === "unassign") {
          setNotice(`Removed ${values["Assigned Order"]?.split(" · ")[0] ?? "order"} from ${dialog.row?.[1] ?? "driver"}.`)
          setDialog(null)
          router.refresh()
          return
        }
        if (slug === "inventory") {
          setNotice(`${dialog.action} saved for ${dialog.row?.[1] ?? dialog.row?.[0] ?? "inventory"}.`)
          setDialog(null)
          router.refresh()
          return
        }
        if (["orders", "payments", "users"].includes(slug)) {
          setNotice(`${dialog.action} saved for ${dialog.row?.[1] ?? dialog.row?.[0] ?? "record"}.`)
          setDialog(null)
          router.refresh()
          return
        }
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "Database save failed. No local changes were applied.")
        setDialog(null)
        return
      } finally {
        setSaving(false)
      }
    }
    if (dialog.kind === "form") {
      const fields = [...Object.keys(dialog.values ?? {}), ...(uploadedImageUrl ? ["Image URL"] : [])]
      if (["Announcement", "New Announcement", "Send Notification"].includes(dialog.action ?? "")) {
        const values = dialog.values ?? {}
        if (!values.Title?.trim() || !values.Message?.trim()) { setNotice("Add a title and message before saving the announcement."); return }
        if (slug === "notifications") setRows((existing) => [[values.Title, values.Target || "All Customers", "Announcement", "—", "Draft", "View"] , ...existing])
        else setAnnouncementRows((existing) => [[values.Title, values.Target || "All Customers", "—", "View · Delete"], ...existing])
        setNotice("Announcement saved as a draft in Supabase. No message was sent.")
        setDialog(null)
        return
      }
      if (dialog.action === "Record Movement") {
        const product = dialog.values?.Product?.trim()
        const quantity = Number(dialog.values?.Quantity)
        const type = dialog.values?.["Movement Type"] || ""
        if (!product || !type || !Number.isFinite(quantity) || quantity <= 0) { setNotice("Choose a product, movement type, and quantity greater than zero."); return }
        const productColumn = config.columns.indexOf("Product Name")
        const stockColumn = config.columns.indexOf("Current Stock")
        const movementColumn = config.columns.indexOf("Movement History")
        const statusColumn = config.columns.indexOf("Status")
        const target = rows.findIndex((item) => item[0] === product)
        if (target < 0) { setNotice("Choose a product from the inventory list."); return }
        const stock = Number(rows[target][stockColumn])
        const movementType = type === "Stock correction" ? "adjustment" : type === "Damage" ? "damage" : type === "Sale / stock out" ? "sale" : "restock"
        const decreasesStock = ["damage", "sale"].includes(movementType) || movementType === "adjustment" && dialog.values?.["Correction Direction"] === "Decrease"
        const delta = decreasesStock ? -quantity : quantity
        const nextStock = stock + delta
        if (nextStock < 0) { setNotice("This movement would make stock negative."); return }
        const reason = dialog.values?.Reason?.trim()
        if (!reason) { setNotice("Enter a reason for this inventory movement."); return }
        const movement = { movement_type: movementType, quantity_delta: delta, reason, created_at: new Date().toISOString() }
        setRows((existing) => existing.map((item, index) => {
          if (index !== target) return item
          const history = parseInventoryMovements(item[6])
          const updated = [...item]
          updated[stockColumn] = String(nextStock)
          updated[movementColumn] = `${history.length + 1} ${history.length === 0 ? "activity" : "activities"}`
          updated[statusColumn] = nextStock === 0 ? "Out of Stock" : nextStock <= inventoryThreshold ? "Low Stock" : "Normal"
          updated[6] = JSON.stringify([movement, ...history])
          return updated
        }))
        setNotice(`Recorded ${type.toLowerCase()} for ${rows[target][productColumn]}.`)
        setDialog(null)
        return
      }
      if (slug === "returns-refunds" && ["Approve", "Reject"].includes(dialog.action ?? "") && dialog.rowIndex !== undefined) {
        const decision = dialog.action
        const note = dialog.values?.["Decision Notes"]?.trim() ?? ""
        if (decision === "Reject" && !note) { setNotice("Add a reason before rejecting this request."); return }
        const statusColumn = config.columns.indexOf("Status")
        const actionsColumn = config.columns.indexOf("Actions")
        setRows((existing) => existing.map((item, index) => index === dialog.rowIndex ? item.map((cell, column) => column === statusColumn ? decision === "Approve" ? "Approved" : "Rejected" : column === actionsColumn ? "View" : cell) : item))
        if (note) setDecisionNotes((existing) => ({ ...existing, [dialog.row?.[0] ?? ""]: note }))
        setNotice(decision === "Approve" ? "Request approved in the local prototype; payment reversal and customer notification need connected services." : "Request rejected and reason saved locally.")
        setDialog(null)
        return
      }
      const current = dialog.row ? [...dialog.row] : Array(config.columns.length).fill("")
      if (!dialog.row) {
        const optional = new Set(["Product ID", "SKU", "Customer ID", "Personnel ID", "User ID", "Image", "Last Login", "Actions", "Status"])
        const missing = fields.filter((field) => !(field === "Correction Direction" && dialog.values?.["Movement Type"] !== "Stock correction") && !optional.has(field) && !dialog.values?.[field]?.trim())
        if (missing.length) { setNotice(`Complete required fields: ${missing.join(", ")}.`); return }
      }
      fields.forEach((field, index) => {
        const columnIndex = config.columns.indexOf(field)
        if (columnIndex >= 0) current[columnIndex] = dialog.values?.[field] ?? ""
        else if (field === "Image URL" && uploadedImageUrl) {
          current[config.columns.indexOf("Image")] = uploadedImageUrl
          current[12] = uploadedImageUrl
        }
        else if (field === "Assigned Orders") {
          const assignedIndex = config.columns.indexOf("Assigned Orders")
          if (assignedIndex >= 0) current[assignedIndex] = dialog.values?.[field] ?? ""
        }
      })
      if (!dialog.row) {
        current[0] ||= `${slug.toUpperCase().slice(0, 3)}-${String(Date.now()).slice(-4)}`
        const statusIndex = config.columns.indexOf("Status")
        if (statusIndex >= 0 && !current[statusIndex]) current[statusIndex] = slug === "inventory" ? "Normal" : isDatabasePreview && ["products", "promotions"].includes(slug) ? "Draft" : "Active"
        const actionIndex = config.columns.indexOf("Actions")
        if (actionIndex >= 0) current[actionIndex] = defaultRowAction(slug)
        setRows((existing) => [current, ...existing])
      } else if (dialog.rowIndex !== undefined) {
        if (dialog.action === "Assign") {
          const availabilityIndex = config.columns.indexOf("Availability")
          if (availabilityIndex >= 0) current[availabilityIndex] = "On Delivery"
          const actionIndex = config.columns.indexOf("Actions")
          if (actionIndex >= 0) current[actionIndex] = "View · Edit"
        }
        setRows((existing) => existing.map((item, index) => index === dialog.rowIndex ? current : item))
      }
      setNotice(dialog.row ? `${dialog.row[0]} saved.` : `${config.title} record added.`)
    } else if (dialog.kind === "confirm" && dialog.row && dialog.action) {
      const action = dialog.action.toLowerCase()
      const updateTarget = dialog.table === "announcements" ? setAnnouncementRows : setRows
      if (action.includes("delete") || action.includes("remove")) {
        updateTarget((existing) => existing.filter((_, index) => index !== dialog.rowIndex))
        setNotice(`${dialog.row[0]} removed from this browser prototype.`)
      } else if (action.includes("restore")) {
        setNotice(`Restore simulation completed for ${restoreId || dialog.row[0]}. No live database is connected.`)
      } else {
        const statusColumn = config.columns.findIndex((column) => ["Status", "Availability", "Visibility", "Order Status", "Payment Status"].includes(column))
        let status = ""
        if (action.includes("approve")) status = "Approved"
        else if (action.includes("reject")) status = "Rejected"
        else if (action.includes("accept") || action.includes("start preparing") || action.includes("process")) status = "Preparing"
        else if (action.includes("ready for pickup")) status = "Ready for Pickup"
        else if (action.includes("out for delivery") || action.includes("ship")) status = "Out for Delivery"
        else if (action.includes("complete")) status = "Completed"
        else if (action.includes("cancel")) status = "Cancelled"
        else if (action.includes("confirm payment") || action.includes("cash collected") || action.includes("verify")) status = "Paid"
        else if (action.includes("suspend")) status = "Suspended"
        else if (action.includes("reactivate")) status = "Active"
        else if (action.includes("archive")) status = "Archived"
        else if (action.includes("end")) status = "Inactive"
        else if (action.includes("unpublish")) status = "Draft"
        else if (action.includes("publish")) status = "Published"
        else if (action.includes("flag")) status = action.includes("unflag") ? "Unflagged" : "Flagged"
        if (dialog.rowIndex !== undefined && statusColumn >= 0 && status) {
          updateTarget((existing) => existing.map((item, index) => index === dialog.rowIndex ? item.map((cell, column) => column === statusColumn ? status : cell) : item))
        } else if (dialog.rowIndex !== undefined && action.includes("flag")) {
          updateTarget((existing) => existing.map((item, index) => index === dialog.rowIndex ? item.map((cell) => cell.split(" · ").map((part) => part === "Flag" ? "Unflag" : part === "Unflag" ? "Flag" : part).join(" · ")) : item))
        }
        if (dialog.rowIndex !== undefined && dialog.table !== "announcements" && (action.includes("process") || action.includes("preparing") || action.includes("ship") || action.includes("pickup") || action.includes("delivery") || action.includes("complete") || action.includes("payment") || action.includes("cash collected") || action.includes("approve") || action.includes("reject") || action.includes("cancel"))) {
          const actionsColumn = config.columns.indexOf("Actions")
          const nextActions = slug === "orders" && (action.includes("preparing") || action.includes("process"))
            ? `View · ${dialog.row[2] === "Walk-in" ? "Ready for Pickup" : "Out for Delivery"} · Cancel`
            : slug === "orders" && (action.includes("pickup") || action.includes("delivery")) ? "View · Complete Order" : "View"
          if (actionsColumn >= 0) setRows((existing) => existing.map((item, index) => index === dialog.rowIndex ? item.map((cell, column) => column === actionsColumn ? nextActions : cell) : item))
        }
        if (dialog.rowIndex !== undefined && (action.includes("archive") || action.includes("end") || action.includes("reactivate") || action.includes("publish"))) {
          const actionsColumn = config.columns.indexOf("Actions")
          const nextActions = action.includes("archive") || action.includes("end") ? "Edit · Reactivate" : action.includes("publish") ? "Edit · Unpublish" : "Edit · Archive"
          if (actionsColumn >= 0) updateTarget((existing) => existing.map((item, index) => index === dialog.rowIndex ? item.map((cell, column) => column === actionsColumn ? nextActions : cell) : item))
        }
        setNotice(`${dialog.action} completed for ${dialog.row[0]} in this browser prototype.`)
      }
    }
    setDialog(null)
  }
  const triggerTopAction = (action: string) => {
    if (action.toLowerCase().includes("export")) { exportRows(); return }
    if (["Announcement", "New Announcement", "Send Notification"].includes(action)) { openForm(action, undefined, undefined, action, ["Title", "Target", "Message"]); return }
    if (action.toLowerCase().includes("backup")) {
      const id = `BCK-${String(31 + rows.length).padStart(3, "0")}`
      const backup = [id, "Manual", "124 MB", "Successful", new Date().toLocaleString(), "Restore · Download"]
      setRows((existing) => [backup, ...existing])
      setNotice(`Manual backup ${id} created in this browser prototype.`)
      return
    }
    if (action === "Record Movement") { openForm(action, undefined, undefined, action, ["Product", "Movement Type", "Quantity", "Correction Direction", "Reason"]); return }
    openForm(action, undefined, undefined, action)
  }
  const saveGcashSettings = async () => {
    if (!gcash.accountName.trim() || !gcash.accountNumber.trim()) { setGcashMessage("Enter the GCash account name and number."); return }
    if (gcash.enabled && !(gcashFile || gcash.qrUrl)) { setGcashMessage("Upload a QR image before enabling GCash payments."); return }
    setGcashBusy(true)
    setGcashMessage("")
    let qrUrl = gcash.qrUrl
    let qrPath = gcash.qrPath
    let uploadedPath = ""
    try {
      if (gcashFile) {
        const safeName = gcashFile.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "gcash-qr"
        qrPath = `payment/gcash-${crypto.randomUUID()}-${safeName}`
        uploadedPath = qrPath
        const storage = createClient().storage.from("gcash-payment")
        const { error } = await storage.upload(qrPath, gcashFile, { contentType: gcashFile.type, upsert: false })
        if (error) throw error
        qrUrl = storage.getPublicUrl(qrPath).data.publicUrl
      }
      const response = await fetch("/api/admin/payment-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountName: gcash.accountName.trim(), accountNumber: gcash.accountNumber.trim(), qrUrl, qrPath, enabled: gcash.enabled }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "Could not save GCash settings.")
      setGcash((current) => ({ ...current, qrUrl, qrPath }))
      setGcashPreview(qrUrl)
      setGcashFile(null)
      if (gcashObjectUrl.current) URL.revokeObjectURL(gcashObjectUrl.current)
      gcashObjectUrl.current = ""
      setGcashDialogOpen(false)
      setGcashMessage("GCash payment instructions saved for the customer app.")
    } catch (error) {
      if (uploadedPath) await createClient().storage.from("gcash-payment").remove([uploadedPath])
      setGcashMessage(error instanceof Error ? error.message : "Could not save GCash settings.")
    }
    finally { setGcashBusy(false) }
  }
  const saveInventoryThreshold = async () => {
    const threshold = Number(thresholdDraft)
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100000) {
      setThresholdMessage("Enter a whole number from 0 to 100,000.")
      return
    }
    setThresholdBusy(true)
    setThresholdMessage("")
    try {
      const response = await fetch("/api/admin/inventory-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "Could not save inventory settings.")
      setInventoryThreshold(threshold)
      setThresholdDraft(String(threshold))
      setThresholdMessage("Low-stock warning threshold saved.")
    } catch (error) {
      setThresholdMessage(error instanceof Error ? error.message : "Could not save inventory settings.")
    } finally {
      setThresholdBusy(false)
    }
  }
  const secondary = slug === "promotions" || slug === "notifications" ? "Catalog & Marketing" : ["customers", "feedback", "payments"].includes(slug) ? "Customers" : ["reports", "audit-logs", "backup-restore", "users", "settings"].includes(slug) ? "System" : "Operations"
  const displayStats = getDisplayStats(slug, config.stats, rows, isDatabasePreview)
  const movementProduct = dialog?.action === "Record Movement" ? rows.find((item) => item[0] === dialog.values?.Product) : undefined
  const personnelAvailabilityColumn = config.columns.indexOf("Availability")
  const availablePersonnel = rows.filter((row) => row[personnelAvailabilityColumn]?.toLowerCase() === "available")
  const openManualAssign = () => {
    if (!availablePersonnel.length) {
      setNotice("There are no available delivery personnel to assign.")
      return
    }
    if (!assignableOrders.length) {
      setNotice("There are no unassigned delivery orders ready to assign.")
      return
    }
    openForm("Assign a delivery order", undefined, undefined, "Assign", ["Delivery Personnel", "Delivery Order"])
  }
  const autoAssignOrders = async () => {
    if (!isDatabasePreview || !assignableOrders.length || !availablePersonnel.length || autoAssignBusy) return
    const assignedOrdersColumn = config.columns.indexOf("Assigned Orders")
    const drivers = availablePersonnel.map((row, index) => ({
      row,
      index,
      assigned: row[assignedOrdersColumn] && row[assignedOrdersColumn] !== "—" ? row[assignedOrdersColumn].split(",").length : 0,
    }))
    let succeeded = 0
    const failures: string[] = []
    setAutoAssignBusy(true)
    try {
      for (const order of assignableOrders) {
        drivers.sort((a, b) => a.assigned - b.assigned || a.index - b.index)
        const driver = drivers[0]
        try {
          const response = await fetch("/api/admin/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module: slug, action: "assign", row: driver.row, values: { "Delivery Order": `${order.orderNumber} · ${order.customer}` } }),
          })
          const result = await response.json() as { error?: string }
          if (!response.ok) {
            failures.push(`${order.orderNumber}: ${result.error || "Assignment failed"}`)
            if ([401, 403, 503].includes(response.status)) break
            continue
          }
          driver.assigned += 1
          succeeded += 1
        } catch (error) {
          failures.push(`${order.orderNumber}: ${error instanceof Error ? error.message : "Assignment failed"}`)
          break
        }
      }
      setNotice(`Auto-assigned ${succeeded} of ${assignableOrders.length} orders.${failures.length ? ` Issues: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? `; and ${failures.length - 3} more` : ""}` : ""}`)
      if (succeeded) router.refresh()
    } finally {
      setAutoAssignBusy(false)
    }
  }
  return <div className="mx-auto max-w-[1540px] space-y-5">
    <div className="flex flex-wrap items-center gap-2 text-xs text-default-500"><Leaf size={13} className="text-accent" /><span>{secondary}</span><span className="text-default-300">/</span><span className="font-medium text-foreground">{config.title}</span></div>
    {isDatabasePreview && databaseError && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">Could not load records from Supabase. Check the server database connection.</div>}
    {slug === "inventory" && thresholdMessage && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{thresholdMessage}</div>}
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">AKP Native Products · {secondary}</p><h1 className="text-2xl font-bold tracking-tight">{config.title}</h1><p className="mt-1 text-sm text-default-500">{config.subtitle}</p></div>
      <div className="flex flex-wrap gap-2">
        {slug === "products" && <Button size="sm" variant="outline" onPress={() => location.assign("/heritage-showcase")}>Heritage Showcase</Button>}
        {slug === "inventory" && <Button size="sm" variant="outline" onPress={() => exportRows("csv")}><Download size={15}/>Export</Button>}
        {slug === "reports" && <><Button size="sm" variant="outline" onPress={() => exportRows("pdf")}><Download size={15}/>Export PDF</Button><Button size="sm" variant="outline" onPress={() => exportRows("csv")}><Download size={15}/>Export CSV</Button></>}
        {slug === "promotions" && <><Button size="sm" variant="outline" onPress={() => triggerTopAction("Announcement")}><Plus size={15}/>Announcement</Button><Button size="sm" variant="primary" onPress={() => triggerTopAction("New Promotion")}><Plus size={15}/>New Promotion</Button></>}
        {slug === "delivery-personnel" && <>
          <Button size="sm" variant="outline" isDisabled={!isDatabasePreview || !assignableOrders.length || !availablePersonnel.length || autoAssignBusy} onPress={autoAssignOrders}><PackagePlus size={15}/>{autoAssignBusy ? "Auto-assigning…" : "Auto-assign"}</Button>
          <Button size="sm" variant="primary" isDisabled={!isDatabasePreview || !assignableOrders.length || !availablePersonnel.length || autoAssignBusy} onPress={openManualAssign}><Plus size={15}/>Assign</Button>
        </>}
        {config.action && !["reports", "promotions", "delivery-personnel"].includes(slug) && <Button size="sm" variant="primary" onPress={() => triggerTopAction(config.action!)}>{config.action.toLowerCase().includes("export") ? <Download size={15} /> : <Plus size={15} />}{config.action}</Button>}
      </div>
    </div>
    {notice && <div role="status" className="flex items-center justify-between rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">{notice}<Button size="sm" variant="ghost" onPress={() => setNotice("")}>Dismiss</Button></div>}
    {slug === "payments" && <Card className="rounded-md border border-warning/30 bg-warning/5 shadow-none"><Card.Content className="grid gap-4 p-4 md:grid-cols-2"><div><p className="text-xs font-semibold text-foreground">GCash · verify outside the website</p><p className="mt-1 text-xs leading-5 text-default-600">Open the platform’s official GCash account separately. Match the actual incoming transfer, exact amount, and customer reference before confirming. A screenshot or reference alone is not proof.</p></div><div><p className="text-xs font-semibold text-foreground">Cash on Delivery · collect first</p><p className="mt-1 text-xs leading-5 text-default-600">Keep COD pending until the full cash amount is physically received. Record collection with “Mark Cash Collected.”</p></div></Card.Content></Card>}
    {slug === "settings" && <Card className="rounded-xl border border-default-200 shadow-none"><Card.Content className="flex flex-wrap items-center gap-5 p-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning"><PackagePlus size={19}/></span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Low-stock warning threshold</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-default-500">Use one store-wide stock quantity for low-stock warnings across inventory and the dashboard. Products at or below this quantity are flagged.</p>{thresholdMessage && <p role={thresholdMessage.includes("saved") ? "status" : "alert"} className={`mt-2 text-xs ${thresholdMessage.includes("saved") ? "text-success" : "text-danger"}`}>{thresholdMessage}</p>}</div><label className="flex items-center gap-2 text-xs font-medium">Units<input aria-label="Low-stock warning threshold" type="number" min="0" max="100000" step="1" value={thresholdDraft} disabled={!thresholdCanEdit || thresholdBusy} onChange={(event) => setThresholdDraft(event.target.value)} className="h-9 w-24 rounded-md border border-default-200 bg-background px-2 text-sm disabled:opacity-60"/></label><Button size="sm" variant="primary" isDisabled={!thresholdCanEdit || thresholdBusy || !thresholdDraft.trim()} onPress={saveInventoryThreshold}>{thresholdBusy ? "Saving…" : "Save threshold"}</Button></Card.Content></Card>}
    {slug === "settings" && <Card className="rounded-xl border border-default-200 shadow-none"><Card.Content className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"><Smartphone size={19}/></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">GCash online payments</h2><Chip size="sm" variant="soft" color={gcash.enabled ? "success" : "default"}>{gcash.enabled ? "Enabled" : "Not enabled"}</Chip></div><p className="mt-1 max-w-2xl text-xs leading-5 text-default-500">Set the account details and QR image customers should see after choosing GCash in the app. This displays payment instructions only; transfers still require manual verification.</p><p className="mt-2 text-xs text-default-600">{gcash.accountName || "Account name not set"}{gcash.accountNumber ? ` · ${gcash.accountNumber}` : ""}</p>{gcashMessage && <p role="status" className="mt-2 text-xs text-success">{gcashMessage}</p>}</div></div><div className="flex items-center gap-3">{gcashPreview ? <img src={gcashPreview} alt="Configured GCash QR code" className="size-16 rounded-lg border border-default-200 bg-white object-contain p-1"/> : <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-default-300 text-default-400"><ImagePlus size={20}/></div>}<Button size="sm" variant="outline" isDisabled={!gcash.canEdit} onPress={() => { setGcashMessage(""); setGcashDialogOpen(true) }}>{gcash.qrUrl ? "Manage GCash" : "Set up GCash"}</Button></div></Card.Content></Card>}
    {displayStats && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{displayStats.map(([label, value, note]) => <Card key={label} className="rounded-md border border-default-200 shadow-none"><Card.Content className="p-4"><p className="text-xs text-default-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{note && <p className="mt-1 text-[11px] text-default-400">{note}</p>}</Card.Content></Card>)}</div>}
    {slug === "backup-restore" && <Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="grid gap-5 p-4 md:grid-cols-[1.1fr_0.9fr]"><div><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Archive size={16} /> Backup history</div><p className="text-xs text-default-500">Select a backup to restore. Restoring overwrites current data and must be confirmed.</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Select backup to restore" value={restoreId} onChange={(event) => setRestoreId(event.target.value)} className="h-9 min-w-48 rounded-md border border-default-200 bg-background px-3 text-xs"><option value="">Select backup to restore</option>{rows.map((r) => <option key={r[0]} value={r[0]}>{r[0]} · {r[3]}</option>)}</select><Button size="sm" variant="danger" isDisabled={!restoreId} onPress={() => setDialog({ title: "Restore backup", kind: "confirm", row: [restoreId], action: "Restore", message: "This irreversible operation normally replaces live business data. Here it only simulates restore because this prototype has no database." })}><RotateCcw size={14} />Restore selected</Button></div></Card.Content></Card>}
    {slug === "reports" && <><div className="flex flex-wrap items-end justify-between gap-3"><label className="space-y-1 text-xs text-default-500">Date range<select aria-label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="block h-9 min-w-48 rounded-md border border-default-200 bg-background px-3 text-xs"><option>Last 7 days</option><option>This month</option><option>Custom range</option></select></label>{dateRange === "Custom range" && <div className="flex flex-wrap gap-2"><label className="space-y-1 text-xs text-default-500">From<input aria-label="Custom start date" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="block h-9 rounded-md border border-default-200 bg-background px-2 text-xs" /></label><label className="space-y-1 text-xs text-default-500">To<input aria-label="Custom end date" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="block h-9 rounded-md border border-default-200 bg-background px-2 text-xs" /></label></div>}<p className="text-[11px] text-default-400">Choose a report to preview</p></div><div className="grid gap-3 md:grid-cols-2">{config.rows.map((row) => <Card key={row[0]} className="rounded-md border border-default-200 shadow-none"><Card.Content className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm font-semibold">{row[0]}</p><p className="mt-1 text-xs text-default-500">{row[1]}</p></div><Button size="sm" variant="outline" onPress={() => setGeneratedReport(row[0])}>Generate</Button></Card.Content></Card>)}</div><Card className="min-h-48 rounded-md border border-default-200 shadow-none"><Card.Content className="flex min-h-48 flex-col items-center justify-center p-6 text-center"><p className="text-sm font-semibold">{generatedReport ?? "Report Preview Area"}</p><p className="mt-2 max-w-lg text-xs leading-5 text-default-500">{generatedReport ? `${generatedReport} for ${dateRange === "Custom range" ? `${customStart || "start date"} to ${customEnd || "end date"}` : dateRange} · Preview is ready for export.` : "Generated report chart or table will appear here after you choose Generate."}</p>{generatedReport && <div className="mt-5 flex h-16 items-end gap-2">{[35, 58, 46, 78, 62, 92, 70, 100].map((height, index) => <span key={index} className="w-5 rounded-t-sm bg-[#8dab92]" style={{ height: `${height}%` }} />)}</div>}</Card.Content></Card></>}
    {slug === "promotions" && <div className="grid gap-3 xl:grid-cols-2"><Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="space-y-3 p-4"><h2 className="text-sm font-semibold">Active Promotions</h2>{isDatabasePreview && <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-default-600">{selectedIds.length} selected</span><select aria-label="Bulk promotion action" value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} className="h-9 min-w-40 rounded-md border border-default-200 bg-background px-3 text-xs"><option value="">Bulk action</option><option>End</option><option>Reactivate</option></select><Button size="sm" variant="primary" isDisabled={!selectedIds.length || !bulkAction || selectedIds.length > 100 || saving} onPress={startBulkAction}>Apply</Button><Button size="sm" variant="ghost" isDisabled={!selectedIds.length} onPress={() => setSelectedIds([])}>Clear</Button></div>}<DataTable compact config={{ ...config, columns: ["Promo Name", "Discount", "Valid Until", "Status", "Actions"] }} rows={rows} selectable={isDatabasePreview} selectedIds={selectedIds} onToggle={toggleSelected} onToggleAll={(checked) => setSelectedIds((current) => checked ? Array.from(new Set([...current, ...rows.map((row) => row[0])])).slice(0, 100) : current.filter((id) => !rows.some((row) => row[0] === id)))} onAction={(action, row, index) => openAction(action, row, index)} /></Card.Content></Card><Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="space-y-3 p-4"><h2 className="text-sm font-semibold">Announcements</h2><DataTable compact config={{ ...config, columns: ["Title", "Target", "Sent", "Actions"] }} rows={announcementRows} onAction={(action, row, index) => openAction(action, row, index, "announcements")} /></Card.Content></Card><Card className="rounded-md border border-default-200 shadow-none xl:col-span-2"><Card.Content className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="text-sm font-semibold">Send an announcement</h2><p className="mt-1 text-xs text-default-500">Compose and save a message to the local notification history.</p></div><Button size="sm" variant="primary" onPress={() => triggerTopAction("Send Notification")}><Bell size={15} />Compose notification</Button></Card.Content></Card></div>}
    {slug !== "reports" && slug !== "promotions" && <Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="space-y-4 p-4"><div className="flex flex-wrap items-center gap-2"><div className="min-w-[230px] flex-1"><Input aria-label={config.search || "Search records"} placeholder={config.search || "Search records..."} value={query} onChange={(e) => setQuery(e.target.value)} /></div>{config.filter && <select aria-label={config.filter} className="h-9 min-w-36 rounded-md border border-default-200 bg-background px-3 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="All">{config.filter}</option>{(config.filterOptions ?? Array.from(new Set(rows.flatMap((row) => row.filter((cell) => ["Active", "Suspended", "Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Normal", "Low Stock", "Out of Stock", "Verified", "Refunded", "Failed", "Open", "Approved", "Rejected", "Successful"].includes(cell)))))).map((option) => <option key={option}>{option}</option>)}</select>}<Button isIconOnly variant="outline" size="sm" aria-label="Clear search and filters" onPress={() => { setQuery(""); setFilter("All"); setNotice("Search and filters cleared.") }}><Filter size={15} /></Button></div>{isDatabasePreview && bulkActions[slug] && <div className="flex flex-wrap items-center gap-2 rounded-md border border-default-200 bg-default-50/60 p-2"><span className="px-1 text-xs text-default-600">{selectedIds.length} selected</span><select aria-label="Bulk action" value={bulkAction} onChange={(event) => setBulkAction(event.target.value)} className="h-9 min-w-44 rounded-md border border-default-200 bg-background px-3 text-xs"><option value="">Choose bulk action</option>{bulkActions[slug].map((action) => <option key={action}>{action}</option>)}</select><Button size="sm" variant="primary" isDisabled={!selectedIds.length || !bulkAction || selectedIds.length > 100 || saving} onPress={startBulkAction}>Apply to selected</Button><Button size="sm" variant="ghost" isDisabled={!selectedIds.length} onPress={() => setSelectedIds([])}>Clear selection</Button><span className="text-[11px] text-default-500">Select up to 100 · actions still enforce each record’s rules</span></div>}<DataTable config={config} rows={filteredRows} selectable={isDatabasePreview && Boolean(bulkActions[slug])} selectedIds={selectedIds} onToggle={toggleSelected} onToggleAll={(checked) => setSelectedIds((current) => checked ? Array.from(new Set([...current, ...filteredRows.map((row) => row[0])])).slice(0, 100) : current.filter((id) => !filteredRows.some((row) => row[0] === id)))} onAction={(action, row, index) => openAction(action, row, index)} /></Card.Content></Card>}
    {config.note && !["inventory", "customers", "products", "reports", "promotions", "notifications", "heritage-showcase"].includes(slug) && <div className="flex items-start gap-2 rounded-md border border-default-200 bg-default-50 px-3 py-2.5 text-xs leading-5 text-default-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#55745e]" />{config.note}</div>}
    <Modal.Backdrop isOpen={Boolean(dialog)} onOpenChange={(isOpen) => { if (!isOpen) setDialog(null) }}>
      <Modal.Container>
        <Modal.Dialog className={dialog?.action === "Record Movement" ? "max-h-[calc(100dvh-2rem)] w-[min(96vw,42rem)] max-w-[42rem] overflow-y-auto" : slug === "products" ? "max-h-[calc(100dvh-2rem)] w-[min(96vw,72rem)] max-w-[72rem] overflow-y-auto" : "max-h-[85dvh] overflow-y-auto sm:max-w-lg"}>
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>{dialog?.title}</Modal.Heading></Modal.Header>
          <Modal.Body>
            {dialog?.kind === "view" && dialog.row && (slug === "products" ? <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">{dialog.row[12] ? <Image src={dialog.row[12]} alt={`${dialog.row[2]} product`} width={960} height={720} unoptimized className="max-h-[26rem] w-full rounded-xl border border-default-200 object-cover" /> : <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-default-300 bg-default-50 text-sm text-default-500"><ImagePlus size={18} className="mr-2" />No product image uploaded</div>}<dl className="grid content-start grid-cols-1 gap-3 sm:grid-cols-2">{(dialog.fields ?? config.columns.filter((column) => column !== "Actions")).filter((column) => column !== "Image").map((column) => { const index = config.columns.indexOf(column); return <div key={column} className="min-w-0 rounded-lg border border-default-200 bg-default-50/70 p-3"><dt className="text-xs text-default-500">{column}</dt><dd className="mt-1 break-words text-sm font-medium">{dialog.row?.[index] || "—"}</dd></div> })}{dialog.extraFields?.map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-default-200 bg-default-50/70 p-3"><dt className="text-xs text-default-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value}</dd></div>)}</dl></div> : <div className="space-y-4"><dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(dialog.fields ?? config.columns.filter((column) => column !== "Actions")).map((column, index) => <div key={column} className="rounded-md bg-default-50 p-3"><dt className="text-xs text-default-500">{column}</dt><dd className="mt-1 text-sm font-medium">{dialog.row?.[index] || "—"}</dd></div>)}{dialog.extraFields?.map(([label, value]) => <div key={label} className="rounded-md bg-default-50 p-3"><dt className="text-xs text-default-500">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>{(slug === "orders" || slug === "customers") && (() => { const pin = slug === "orders" ? dialog.row?.[14] : dialog.row?.[10]; const [latitude, longitude] = (pin ?? "").split(",").map(Number); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null; const src = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01}%2C${latitude - 0.01}%2C${longitude + 0.01}%2C${latitude + 0.01}&layer=mapnik&marker=${latitude}%2C${longitude}`; const title = slug === "orders" ? "Delivery location" : "Default saved address"; return <section className="space-y-2"><h3 className="text-sm font-semibold">{title}</h3><iframe title={`${title} map pin`} src={src} className="h-64 w-full rounded-lg border border-default-200" loading="lazy" referrerPolicy="no-referrer" /></section> })()}</div>)}
            {dialog?.kind === "form" && (
              dialog.action === "Record Movement" ? <div className="space-y-5">
                <p className="text-sm leading-6 text-default-600">Log stock received, sales, damage, or a counted-stock correction. Each entry is saved as a separate movement receipt with its own reason.</p>
                <label className="block space-y-1.5 text-xs font-medium">Product
                  <select aria-label="Product" value={dialog.values?.Product ?? ""} onChange={(event) => setDialog((current) => current ? { ...current, values: { ...(current.values ?? {}), Product: event.target.value } } : current)} className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 text-sm">
                    <option value="">Choose a product</option>{rows.map((item) => <option key={item[0]} value={item[0]}>{item[1]} · {item[0]}</option>)}
                  </select>
                </label>
                {movementProduct && <div className="flex items-center justify-between gap-3 rounded-xl border border-default-200 bg-default-50/70 p-4">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{movementProduct[1]}</p><p className="mt-1 text-xs text-default-500">{movementProduct[0]}</p></div>
                  <div className="shrink-0 text-right"><p className="text-[10px] font-medium uppercase tracking-wide text-default-500">Current stock</p><p className="mt-0.5 text-xl font-bold tabular-nums">{movementProduct[2]} <span className="text-xs font-normal text-default-500">units</span></p></div>
                </div>}
                <fieldset className="space-y-2">
                  <legend className="text-xs font-medium">Movement type</legend>
                  <div className="grid gap-2 sm:grid-cols-2">{[
                    ["Stock received", "Adds incoming supplier or returned stock."],
                    ["Sale / stock out", "Removes items sold or otherwise issued."],
                    ["Damage", "Removes unsellable or damaged items."],
                    ["Stock correction", "Adjusts stock after a physical count."],
                  ].map(([type, description]) => <button key={type} type="button" aria-pressed={dialog.values?.["Movement Type"] === type} onClick={() => setDialog((current) => current ? { ...current, values: { ...(current.values ?? {}), "Movement Type": type } } : current)} className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary ${dialog.values?.["Movement Type"] === type ? "border-accent bg-accent/5" : "border-default-200 hover:bg-default-50"}`}><span className="block text-xs font-semibold">{type}</span><span className="mt-1 block text-[11px] leading-4 text-default-500">{description}</span></button>)}</div>
                </fieldset>
                {dialog.values?.["Movement Type"] === "Stock correction" && <fieldset className="space-y-2">
                  <legend className="text-xs font-medium">Correction direction</legend>
                  <div className="grid grid-cols-2 gap-2">{["Increase", "Decrease"].map((direction) => <button key={direction} type="button" aria-pressed={dialog.values?.["Correction Direction"] === direction} onClick={() => setDialog((current) => current ? { ...current, values: { ...(current.values ?? {}), "Correction Direction": direction } } : current)} className={`rounded-lg border px-3 py-2.5 text-xs font-medium ${dialog.values?.["Correction Direction"] === direction ? "border-accent bg-accent/5" : "border-default-200 hover:bg-default-50"}`}>{direction} stock</button>)}</div>
                </fieldset>}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-1.5 text-xs font-medium">Quantity
                    <div className="relative"><input aria-label="Quantity" type="number" min="1" step="1" inputMode="numeric" value={dialog.values?.Quantity ?? ""} onChange={(event) => setDialog((current) => current ? { ...current, values: { ...(current.values ?? {}), Quantity: event.target.value } } : current)} placeholder="Enter whole units" className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 pr-14 text-sm tabular-nums"/><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-default-400">units</span></div>
                  </label>
                  <div className="flex items-end"><div className="w-full rounded-lg bg-default-50 px-3 py-2.5"><p className="text-[10px] font-medium uppercase tracking-wide text-default-500">After movement</p><p className="mt-1 text-sm font-semibold tabular-nums">{(() => {
                    if (!movementProduct) return "Choose a product"
                    const quantity = Number(dialog.values?.Quantity)
                    if (!Number.isInteger(quantity) || quantity <= 0) return `${movementProduct[2]} units`
                    const type = dialog.values?.["Movement Type"]
                    const decreases = ["Damage", "Sale / stock out"].includes(type ?? "") || type === "Stock correction" && dialog.values?.["Correction Direction"] === "Decrease"
                    const projected = Number(movementProduct[2]) + (decreases ? -quantity : quantity)
                    return projected < 0 ? "Insufficient stock" : `${projected} units`
                  })()}</p></div></div>
                </div>
                <label className="block space-y-1.5 text-xs font-medium">Reason <span className="font-normal text-default-500">· Required for the receipt</span>
                  <textarea aria-label="Reason" maxLength={500} value={dialog.values?.Reason ?? ""} onChange={(event) => setDialog((current) => current ? { ...current, values: { ...(current.values ?? {}), Reason: event.target.value } } : current)} placeholder="e.g. Supplier delivery, order #, inspection damage, or count correction" className="min-h-24 w-full rounded-lg border border-default-200 bg-background p-3 text-sm font-normal"/>
                  <span className="block text-right text-[10px] font-normal text-default-400">{dialog.values?.Reason?.length ?? 0}/500</span>
                </label>
              </div> : <div className={slug === "products" ? "grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : "space-y-3"}>
                {dialog.message && <p className={slug === "products" ? "text-sm text-default-600 lg:col-span-2" : "text-sm text-default-600"}>{dialog.message}</p>}
                {slug === "products" && <section className="space-y-3 rounded-xl border border-default-200 bg-default-50/60 p-4 lg:col-start-1" aria-label="Product image upload">
                  <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success"><ImagePlus size={18} /></span><div><h3 className="text-sm font-semibold">Product photo</h3><p className="mt-1 text-xs leading-5 text-default-500">Choose an image from your device. JPG, PNG, WEBP, GIF, or AVIF · up to 10 MB.</p></div></div>
                  {productImagePreview ? <Image src={productImagePreview} alt="Selected product image preview" width={960} height={480} unoptimized className="max-h-72 w-full rounded-lg border border-default-200 object-cover" /> : <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-default-300 bg-background text-center"><ImagePlus size={24} className="text-default-400" /><p className="text-xs text-default-500">Image preview appears here</p></div>}
                  {isDatabasePreview ? <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-default-200 bg-background px-3 text-xs font-medium hover:bg-default-100"><ImagePlus size={14} />{productImagePreview ? "Choose a different image" : "Choose image"}<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]; if (!allowed.includes(file.type)) { setNotice("Choose a JPG, PNG, WEBP, GIF, or AVIF image."); return } if (file.size > 10 * 1024 * 1024) { setNotice("Product images must be 10 MB or smaller."); return } if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current); previewObjectUrl.current = URL.createObjectURL(file); setProductImage(file); setProductImagePreview(previewObjectUrl.current); setNotice("") }} /></label> : <p className="text-xs text-warning">Connect the admin page to Supabase to upload and save product images.</p>}
                </section>}
                <div className={`grid gap-3 sm:grid-cols-2 ${slug === "products" ? "lg:col-start-2" : ""}`}>
                  {Object.entries(dialog.values ?? {}).map(([field, value]) => (
                    <div key={field} className={["Description", "Image URL", "Craft / Origin", "Reason"].includes(field) ? "sm:col-span-2" : ""}>
                      <DialogField field={field} value={value} choicesOverride={field === "Product" ? rows.map((item) => slug === "inventory" ? item[1] : item[0]).filter(Boolean) : field === "Delivery Personnel" ? availablePersonnel.map((item) => `${item[1]} · ${item[0]}`) : field === "Delivery Order" ? assignableOrders.map((order) => `${order.orderNumber} · ${order.customer}`) : field === "Assigned Order" ? unassignableOrders.filter((order) => order.driverId === dialog.row?.[6]).map((order) => `${order.orderNumber} · ${order.customer}`) : undefined} onChange={(next) => setDialog((current) => current ? { ...current, values: { ...(current.values ?? {}), [field]: next } } : current)} />
                    </div>
                  ))}
                </div>
              </div>)}
            {dialog?.kind === "confirm" && <div className="space-y-3"><p className="text-sm leading-6 text-default-600">{dialog.message ?? `Continue with ${dialog.action?.toLowerCase()} for ${dialog.row?.[0]}?`}</p><p className="rounded-md bg-warning/10 p-3 text-xs leading-5 text-warning">{isDatabasePreview ? "This action is recorded to the admin database. Payment decisions must be made only after independently checking the official GCash account or physically collecting COD cash." : "This is an illustrative browser preview; live payment and order changes require the connected database."}</p></div>}
          </Modal.Body>
          {dialog?.kind !== "view" && <Modal.Footer><Button variant="outline" slot="close" isDisabled={saving}>Cancel</Button><Button variant={dialog?.kind === "confirm" && isDestructive(dialog.action) ? "danger" : "primary"} isDisabled={saving || dialog?.action === "Record Movement" && (!dialog.values?.Product || !dialog.values?.["Movement Type"] || !dialog.values?.Quantity || !dialog.values?.Reason?.trim() || dialog.values?.["Movement Type"] === "Stock correction" && !dialog.values?.["Correction Direction"])} onPress={commitDialog}>{saving ? "Saving…" : dialog?.action === "Record Movement" ? "Record movement" : dialog?.kind === "confirm" ? "Confirm" : "Save changes"}</Button></Modal.Footer>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
    <Modal.Backdrop isOpen={gcashDialogOpen} onOpenChange={(open) => { if (!open && !gcashBusy) setGcashDialogOpen(false) }}>
      <Modal.Container><Modal.Dialog className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><Modal.CloseTrigger/><Modal.Header><Modal.Heading>GCash payment details</Modal.Heading></Modal.Header><Modal.Body><div className="space-y-4"><p className="text-sm leading-6 text-default-500">Customers see these details after choosing GCash. Use the registered account name and number. Do not upload payment receipts here.</p><label className="block space-y-1 text-xs font-medium">GCash account name<input aria-label="GCash account name" autoComplete="name" className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm font-normal" value={gcash.accountName} onChange={(event) => setGcash((current) => ({ ...current, accountName: event.target.value }))}/></label><label className="block space-y-1 text-xs font-medium">GCash mobile/account number<input aria-label="GCash mobile or account number" inputMode="tel" autoComplete="tel" className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm font-normal" value={gcash.accountNumber} onChange={(event) => setGcash((current) => ({ ...current, accountNumber: event.target.value }))}/></label><div className="space-y-2"><p className="text-xs font-medium">GCash QR image <span className="font-normal text-default-500">PNG, JPG, or WEBP · up to 5 MB</span></p>{gcashPreview ? <img src={gcashPreview} alt="GCash QR code preview" className="mx-auto max-h-64 w-full rounded-lg border border-default-200 bg-white object-contain p-2"/> : <div className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-default-300 text-default-500"><ImagePlus size={22}/><span className="text-xs">Choose an image to preview the QR code</span></div>}<label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-default-200 px-3 text-xs font-medium hover:bg-default-50"><Upload size={14}/>{gcashFile ? "Choose another image" : "Upload QR from this device"}<input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setGcashMessage("Choose a PNG, JPG, or WEBP image."); return } if (file.size > 5 * 1024 * 1024) { setGcashMessage("The GCash QR image must be 5 MB or smaller."); return } if (gcashObjectUrl.current) URL.revokeObjectURL(gcashObjectUrl.current); gcashObjectUrl.current = URL.createObjectURL(file); setGcashFile(file); setGcashPreview(gcashObjectUrl.current); setGcashMessage("") }}/></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={gcash.enabled} onChange={(event) => setGcash((current) => ({ ...current, enabled: event.target.checked }))}/><span>Show GCash as an online payment option</span></label><p className="rounded-lg bg-warning/10 p-3 text-xs leading-5 text-warning">The QR is for customers to pay. Independently verify each transfer in GCash before marking an order paid.</p></div></Modal.Body><Modal.Footer><Button variant="outline" isDisabled={gcashBusy} onPress={() => setGcashDialogOpen(false)}>Cancel</Button><Button variant="primary" isDisabled={gcashBusy} onPress={saveGcashSettings}>{gcashBusy ? "Saving…" : "Save GCash settings"}</Button></Modal.Footer></Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
    <p className="text-[10px] text-default-400">{isDatabasePreview ? "Record values are loaded from Supabase. Demo seed entries are clearly marked in the database." : "Screen content follows the supplied admin references. Sample records are illustrative and stored in this browser until a database connection is configured."}</p>
  </div>
}

function DataTable({ config, rows, compact = false, selectable = false, selectedIds = [], onToggle, onToggleAll, onAction }: { config: ModuleConfig; rows: string[][]; compact?: boolean; selectable?: boolean; selectedIds?: string[]; onToggle?: (row: string[], checked: boolean) => void; onToggleAll?: (checked: boolean) => void; onAction?: (action: string, row: string[], index: number) => void }) {
  if (config.title === "Order Management") return <OrderDirectory config={config} rows={rows} selectable={selectable} selectedIds={selectedIds} onToggle={onToggle} onAction={onAction} />
  if (config.title === "Inventory Management") return <InventoryDirectory config={config} rows={rows} onAction={onAction} />
  if (config.title === "Delivery Personnel Management") return <PersonnelDirectory config={config} rows={rows} onAction={onAction} />
  const statusValues = ["Active", "Suspended", "Pending", "Processing", "Preparing", "Ready for Pickup", "Out for Delivery", "Paid", "Shipped", "Delivered", "Completed", "Cancelled", "Normal", "Low Stock", "Out of Stock", "Verified", "Refunded", "Failed", "Open", "Approved", "Rejected", "Successful", "Inactive", "Archived", "Available", "On Delivery", "Off Duty", "Under Review", "Published", "Draft", "Flagged", "Unflagged"]
  return <div className="overflow-x-auto"><table className={`w-full ${compact ? "min-w-[540px]" : "min-w-[760px]"} text-left text-xs`}><thead className="bg-default-50 text-default-500"><tr>{selectable && <th className="w-10 px-3 py-3"><input aria-label="Select all visible records" type="checkbox" checked={rows.length > 0 && rows.every((row) => selectedIds.includes(row[0]))} onChange={(event) => onToggleAll?.(event.target.checked)} /></th>}{config.columns.map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-default-100 transition-colors hover:bg-default-50/70">{selectable && <td className="px-3 py-2"><input aria-label={`Select ${row[0]}`} type="checkbox" checked={selectedIds.includes(row[0])} onChange={(event) => onToggle?.(row, event.target.checked)} /></td>}{config.columns.map((heading, cellIndex) => { const cell = row[cellIndex] ?? ""; if (heading === "Actions") { const actions = cell.split(" · ").map((item) => item.trim()).filter(Boolean); return <td key={heading} className="px-3 py-2 align-middle"><div className="flex flex-wrap gap-x-1 gap-y-1">{actions.map((action) => { const lower = action.toLowerCase(); const Icon = lower.includes("delete") || lower.includes("remove") ? Trash2 : lower.includes("edit") || lower.includes("adjust") ? Pencil : lower.includes("view") || lower.includes("review") || lower.includes("detail") || lower.includes("receipt") || lower.includes("track") ? Eye : lower.includes("download") ? Download : lower.includes("record") ? PackagePlus : undefined; const destructive = ["delete", "remove", "reject", "suspend", "archive", "end"].some((word) => lower.includes(word)); return <Button key={action} size="sm" variant="ghost" className={`h-7 min-w-0 px-1.5 text-[11px] ${destructive ? "text-danger" : "text-[#315f43]"}`} onPress={() => onAction?.(action, row, index)}>{Icon && <Icon size={12} />}{action}</Button> })}</div></td> } if (heading === "Image") return <td key={heading} className="px-3 py-2 align-middle">{cell && cell !== "—" ? <Image src={cell} alt={`${row[config.columns.indexOf("Product Name")] || "Product"} image`} width={52} height={52} unoptimized className="size-12 rounded-lg border border-default-200 object-cover" /> : <span className="text-default-400">No image</span>}</td>; return <td key={`${cellIndex}-${cell}`} className="max-w-64 px-3 py-3 align-middle text-default-700">{statusValues.includes(cell) ? <Chip size="sm" variant="soft" color={statusColor(cell)}>{cell}</Chip> : <span className={cellIndex === 0 ? "font-semibold" : ""}>{cell}</span>}</td> })}</tr>)}</tbody></table>{rows.length === 0 && <div className="flex flex-col items-center gap-2 py-14 text-center"><CircleAlert size={22} className="text-default-400" /><p className="text-sm font-medium">No records found</p><p className="text-xs text-default-500">Try adjusting your search or filters.</p></div>}<div className="flex items-center justify-between border-t border-default-100 pt-3 text-[11px] text-default-500"><span>Showing {rows.length} records</span><div className="flex gap-2"><Button size="sm" variant="outline" isDisabled>Previous</Button><Button size="sm" variant="outline" isDisabled>Next</Button></div></div></div>
}

function InventoryDirectory({ config, rows, onAction }: { config: ModuleConfig; rows: string[][]; onAction?: (action: string, row: string[], index: number) => void }) {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set())
  if (!rows.length) return <div className="flex flex-col items-center gap-2 py-14 text-center"><CircleAlert size={22} className="text-default-400" /><p className="text-sm font-medium">No inventory items found</p><p className="text-xs text-default-500">Try adjusting your search or filters.</p></div>

  return <div className="space-y-3">
    {rows.map((row, index) => {
      const expanded = expandedProducts.has(row[0])
      const panelId = `inventory-details-${encodeURIComponent(row[0])}`
      const status = row[config.columns.indexOf("Status")] || "Unknown"
      const actions = (row[config.columns.indexOf("Actions")] ?? "").split(" · ").map((action) => action.trim()).filter((action) => action && !/^view$/i.test(action))
      const movements = parseInventoryMovements(row[6])
      return <section key={row[0]} className="rounded-xl border border-default-200 bg-content1/60">
        <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpandedProducts((current) => { const next = new Set(current); if (next.has(row[0])) next.delete(row[0]); else next.add(row[0]); return next })} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-4 text-left transition hover:bg-default-50/70 focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Folder size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row[1] || "Unnamed product"}</span><span className="mt-1 block text-xs text-default-500">{row[0]} · {row[config.columns.indexOf("Movement History")] || "No movements"}</span></span>
          <span className="hidden text-xs text-default-500 sm:block">Stock: <strong className="text-foreground">{row[2] ?? "—"}</strong></span>
          <Chip size="sm" variant="soft" color={statusColor(status)}>{status}</Chip>
          <ChevronDown size={17} className={`shrink-0 text-default-500 transition-transform duration-300 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <div id={panelId} aria-hidden={!expanded} inert={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-4 border-t border-default-200 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {config.columns.map((heading, columnIndex) => {
                  if (heading === "Actions" || heading === "Movement History") return null
                  const value = row[columnIndex] || "—"
                  return <div key={heading} className="min-w-0 rounded-lg bg-default-50/70 p-3">
                    <p className="text-[11px] text-default-500">{heading}</p>
                    {heading === "Status" ? <div className="mt-1"><Chip size="sm" variant="soft" color={statusColor(value)}>{value}</Chip></div> : <p className="mt-1 break-words text-xs font-medium">{value}</p>}
                  </div>
                })}
              </div>
              <section aria-label={`Movement history for ${row[1]}`} className="overflow-hidden rounded-xl border border-default-200 bg-background/80">
                <h3 className="border-b border-dashed border-default-300 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Movement receipts</h3>
                {movements.length ? <ul className="divide-y divide-dashed divide-default-200">
                  {movements.map((movement, movementIndex) => <li key={`${movement.created_at}-${movementIndex}`} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold capitalize">{movement.movement_type.replaceAll("_", " ")}</span>
                      <span className={`font-semibold tabular-nums ${movement.quantity_delta > 0 ? "text-success" : "text-danger"}`}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-default-500">{new Date(movement.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}</p>
                    <div className="mt-3 border-t border-dashed border-default-200 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-default-500">Reason</p>
                      <p className="mt-1 break-words text-xs">{movement.reason}</p>
                    </div>
                  </li>)}
                </ul> : <p className="px-4 py-3 text-xs text-default-500">No movement activity recorded.</p>}
              </section>
              <div className="flex flex-wrap justify-end gap-1 border-t border-default-100 pt-3">
                {actions.map((action) => <Button key={action} size="sm" variant="ghost" className="h-8 min-w-0 px-2 text-xs text-accent" onPress={() => onAction?.(action, row, index)}>{action}</Button>)}
              </div>
            </div>
          </div>
        </div>
      </section>
    })}
    <div className="border-t border-default-100 pt-3 text-[11px] text-default-500">Showing {rows.length} inventory {rows.length === 1 ? "item" : "items"}</div>
  </div>
}

function PersonnelDirectory({ config, rows, onAction }: { config: ModuleConfig; rows: string[][]; onAction?: (action: string, row: string[], index: number) => void }) {
  const [expandedPersonnel, setExpandedPersonnel] = useState<Set<string>>(new Set())
  const idColumn = config.columns.indexOf("Personnel ID")
  const nameColumn = config.columns.indexOf("Name")
  const ordersColumn = config.columns.indexOf("Assigned Orders")
  const availabilityColumn = config.columns.indexOf("Availability")
  const actionsColumn = config.columns.indexOf("Actions")

  if (!rows.length) return <div className="flex flex-col items-center gap-2 py-14 text-center"><CircleAlert size={22} className="text-default-400" /><p className="text-sm font-medium">No delivery personnel found</p><p className="text-xs text-default-500">Try adjusting your search or filters.</p></div>

  return <div className="space-y-3">
    {rows.map((row, index) => {
      const id = row[idColumn] || row[6] || String(index)
      const expanded = expandedPersonnel.has(id)
      const panelId = `personnel-details-${encodeURIComponent(id)}`
      const assignedOrders = (row[ordersColumn] ?? "").split(",").map((order) => order.trim()).filter((order) => order && order !== "—")
      const actions = (row[actionsColumn] ?? "").split(" · ").map((action) => action.trim()).filter((action) => action && !/^view$/i.test(action))
      const availability = row[availabilityColumn] || "Unknown"
      return <section key={id} className="rounded-xl border border-default-200 bg-content1/60">
        <button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpandedPersonnel((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-4 text-left transition hover:bg-default-50/70 focus-visible:outline-2 focus-visible:outline-primary">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Folder size={18} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row[nameColumn] || "Unnamed personnel"}</span><span className="mt-1 block text-xs text-default-500">{row[idColumn] || "No personnel ID"} · {assignedOrders.length} {assignedOrders.length === 1 ? "assigned order" : "assigned orders"}</span></span>
          <Chip size="sm" variant="soft" color={statusColor(availability)}>{availability}</Chip>
          <ChevronDown size={17} className={`shrink-0 text-default-500 transition-transform duration-300 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <div id={panelId} aria-hidden={!expanded} inert={!expanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-4 border-t border-default-200 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-default-50/70 p-3"><p className="text-[11px] text-default-500">Personnel ID</p><p className="mt-1 break-words text-xs font-medium">{row[idColumn] || "—"}</p></div>
                <div className="rounded-lg bg-default-50/70 p-3"><p className="text-[11px] text-default-500">Availability</p><div className="mt-1"><Chip size="sm" variant="soft" color={statusColor(availability)}>{availability}</Chip></div></div>
              </div>
              <section aria-label={`Assigned orders for ${row[nameColumn]}`} className="overflow-hidden rounded-xl border border-default-200 bg-background/80">
                <div className="flex items-center justify-between border-b border-dashed border-default-300 px-4 py-3"><h3 className="text-xs font-semibold uppercase tracking-wide">Assigned orders</h3><span className="text-[11px] text-default-500">{assignedOrders.length}</span></div>
                {assignedOrders.length ? <ul className="divide-y divide-dashed divide-default-200">{assignedOrders.map((order) => <li key={order} className="flex items-center gap-3 px-4 py-3 text-xs"><span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"><PackagePlus size={14} aria-hidden="true" /></span><span className="font-medium">{order}</span><span className="ml-auto text-[11px] text-default-500">Assigned</span></li>)}</ul> : <p className="px-4 py-3 text-xs text-default-500">No active orders assigned.</p>}
              </section>
              {actions.length > 0 && <div className="flex flex-wrap justify-end gap-1 border-t border-default-100 pt-3">{actions.map((action) => <Button key={action} size="sm" variant={action.toLowerCase().includes("suspend") ? "outline" : "ghost"} className={`h-8 min-w-0 px-2 text-xs ${action.toLowerCase().includes("suspend") ? "text-danger" : "text-accent"}`} onPress={() => onAction?.(action, row, index)}>{action}</Button>)}</div>}
            </div>
          </div>
        </div>
      </section>
    })}
    <div className="border-t border-default-100 pt-3 text-[11px] text-default-500">Showing {rows.length} {rows.length === 1 ? "delivery person" : "delivery personnel"}</div>
  </div>
}

function OrderDirectory({ config, rows, selectable, selectedIds, onToggle, onAction }: { config: ModuleConfig; rows: string[][]; selectable: boolean; selectedIds: string[]; onToggle?: (row: string[], checked: boolean) => void; onAction?: (action: string, row: string[], index: number) => void }) {
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const groupedOrders = new Map<string, { name: string; orders: { row: string[]; index: number }[] }>()
  rows.forEach((row, index) => {
    const key = row[15] || row[1] || row[0]
    const group = groupedOrders.get(key) ?? { name: row[1] || "Unknown customer", orders: [] }
    group.orders.push({ row, index })
    groupedOrders.set(key, group)
  })

  if (!rows.length) return <div className="flex flex-col items-center gap-2 py-14 text-center"><CircleAlert size={22} className="text-default-400" /><p className="text-sm font-medium">No orders found</p><p className="text-xs text-default-500">Try adjusting your search or filters.</p></div>

  return <div className="space-y-3">
    {[...groupedOrders.entries()].map(([key, group]) => {
      const customerExpanded = expandedCustomers.has(key)
      const customerPanelId = `customer-orders-${encodeURIComponent(key)}`
      return <section key={key} className="group rounded-xl border border-default-200 bg-content1/60">
      <button type="button" aria-expanded={customerExpanded} aria-controls={customerPanelId} onClick={() => setExpandedCustomers((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-4 text-left transition hover:bg-default-50/70 focus-visible:outline-2 focus-visible:outline-primary">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent"><Folder size={18} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{group.name}</span><span className="mt-1 block text-xs text-default-500">{group.orders.length} {group.orders.length === 1 ? "order" : "orders"}</span></span>
        <ChevronDown size={17} className={`shrink-0 text-default-500 transition-transform duration-300 motion-reduce:transition-none ${customerExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={customerPanelId} aria-hidden={!customerExpanded} inert={!customerExpanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${customerExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
        <div className="space-y-2 border-t border-default-200 p-3 sm:p-4">
        {group.orders.map(({ row, index }) => {
          const orderExpanded = expandedOrders.has(row[0])
          const orderPanelId = `order-details-${encodeURIComponent(row[0])}`
          const orderedItems = parseOrderItems(row[11] ?? "")
          const [latitude, longitude] = (row[14] ?? "").split(",").map(Number)
          const hasMapPin = Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
          const mapParams = new URLSearchParams({ q: `${latitude},${longitude}`, z: "16", output: "embed" })
          const mapUrl = `https://maps.google.com/maps?${mapParams.toString()}`
          const mapLink = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`
          return <section key={row[0]} className="group/order rounded-lg border border-default-200 bg-background/70">
          <div className="flex items-center gap-3 px-3 sm:px-4">
            {selectable && <label aria-label={`Select order ${row[0]}`} className="flex size-8 shrink-0 cursor-pointer items-center justify-center"><input type="checkbox" checked={selectedIds.includes(row[0])} onChange={(event) => onToggle?.(row, event.target.checked)} /></label>}
            <button type="button" aria-expanded={orderExpanded} aria-controls={orderPanelId} onClick={() => setExpandedOrders((current) => { const next = new Set(current); if (next.has(row[0])) next.delete(row[0]); else next.add(row[0]); return next })} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-3 text-left transition hover:bg-default-50/70 focus-visible:outline-2 focus-visible:outline-primary">
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{row[0]}</span><span className="mt-1 block text-[11px] text-default-500">{row[2]} · {row[3]} {row[3] === "1" ? "item" : "items"}</span></span>
            <span className="hidden text-xs font-semibold sm:block">{row[4]}</span>
            <Chip size="sm" variant="soft" color={statusColor(row[7])}>{row[7]}</Chip>
            <ChevronDown size={15} className={`shrink-0 text-default-500 transition-transform duration-300 motion-reduce:transition-none ${orderExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          </div>
          <div id={orderPanelId} aria-hidden={!orderExpanded} inert={!orderExpanded} className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${orderExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 border-t border-default-100 p-3 sm:p-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {config.columns.map((heading, columnIndex) => {
                if (["Customer", "Order ID", "Actions", "Items"].includes(heading)) return null
                const value = row[columnIndex] || "—"
                return <div key={heading} className="min-w-0 rounded-lg bg-default-50/70 p-3">
                  <p className="text-[11px] text-default-500">{heading}</p>
                  {["Order Status", "Payment Status"].includes(heading) ? <div className="mt-1"><Chip size="sm" variant="soft" color={statusColor(value)}>{value}</Chip></div> : <p className="mt-1 break-words text-xs font-medium">{value}</p>}
                </div>
              })}
              {[
                ["Delivery address", row[10] || "Pickup at store / no address provided"],
                ["GCash reference", row[12] || "Not applicable"],
              ].map(([heading, value]) => <div key={heading} className="min-w-0 rounded-lg bg-default-50/70 p-3">
                <p className="text-[11px] text-default-500">{heading}</p>
                <p className="mt-1 break-words text-xs font-medium">{value}</p>
              </div>)}
            </div>
            <section aria-label="Ordered products" className="overflow-hidden rounded-xl border border-default-200 bg-background/80">
              <h3 className="border-b border-dashed border-default-300 px-4 py-3 text-xs font-semibold uppercase tracking-wide">Ordered products</h3>
              <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 border-b border-default-100 bg-default-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-default-500">
                <span>Product</span><span className="text-right">Qty</span>
              </div>
              {orderedItems.length ? <ul className="divide-y divide-dashed divide-default-200">
                {orderedItems.map((item, itemIndex) => <li key={`${item.name}-${itemIndex}`} className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 px-4 py-3 text-xs">
                  <span className="break-words font-medium">{item.name}</span><span className="text-right tabular-nums text-default-600">{item.quantity}</span>
                </li>)}
              </ul> : <p className="px-4 py-3 text-xs text-default-500">No item details available.</p>}
            </section>
            {hasMapPin && <section aria-label="Delivery pinpoint map" className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold"><MapPin size={14} className="text-accent" />Delivery location</h3>
                <a href={mapLink} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline">Open map</a>
              </div>
              <iframe title={`Delivery location for order ${row[0]}`} src={mapUrl} className="h-56 w-full rounded-lg border border-default-200" loading="lazy" referrerPolicy="no-referrer" />
            </section>}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-default-100 pt-3">
              <div className="flex flex-wrap gap-1">
                {(row[9] ?? "").split(" · ").map((action) => action.trim()).filter((action) => action && !/^view$/i.test(action)).map((action) => <Button key={action} size="sm" variant="ghost" className={`h-8 min-w-0 px-2 text-xs ${isDestructive(action) ? "text-danger" : "text-accent"}`} onPress={() => onAction?.(action, row, index)}>{action}</Button>)}
              </div>
            </div>
          </div>
          </div>
          </div>
        </section>})}
        </div>
        </div>
      </div>
      </section>
    })}
    <div className="border-t border-default-100 pt-3 text-[11px] text-default-500">Showing {rows.length} {rows.length === 1 ? "order" : "orders"} across {groupedOrders.size} {groupedOrders.size === 1 ? "customer" : "customers"}</div>
  </div>
}

function DialogField({ field, value, onChange, choicesOverride }: { field: string; value: string; onChange: (value: string) => void; choicesOverride?: string[] }) {
  const options: Record<string, string[]> = {
    "Movement Type": ["Stock in (restock)", "Stock out (sale)", "Damage"],
    Category: ["Native Materials", "Bags", "Baskets", "Home Decor", "Accessories", "Headwear"],
    Target: ["All Customers", "All Users"],
    Role: ["Owner", "Staff"],
    Visibility: ["Published", "Draft"],
    Featured: ["Yes", "No"],
    Availability: ["Available", "On Delivery", "Off Duty"],
    "Assigned Orders": ["#ORD-0041"],
  }
  const choices = choicesOverride ?? options[field]
  const multiline = ["message", "reason", "address", "description", "comment", "note"].some((term) => field.toLowerCase().includes(term))
  const numeric = ["quantity", "stock", "reorder"].some((term) => field.toLowerCase().includes(term))
  return <label className="block space-y-1 text-xs font-medium">{field}{choices ? <select aria-label={field} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm font-normal" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Choose {field.toLowerCase()}</option>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select> : multiline ? <textarea aria-label={field} className="min-h-20 w-full rounded-md border border-default-200 bg-background p-3 text-sm font-normal" value={value} onChange={(event) => onChange(event.target.value)} /> : <input aria-label={field} type={numeric ? "number" : "text"} min={numeric ? "0" : undefined} step={numeric ? "any" : undefined} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm font-normal" value={value} onChange={(event) => onChange(event.target.value)} />}</label>
}

function isDestructive(action?: string) {
  const value = action?.toLowerCase() ?? ""
  return ["delete", "remove", "reject", "suspend", "archive", "end", "restore", "cancel"].some((term) => value.includes(term))
}

function confirmMessage(action: string, slug: string) {
  const normalized = action.toLowerCase()
  if (slug === "users" && normalized.includes("suspend")) return "Suspend this account? The account record will be marked suspended. This does not delete the account or its history."
  if (slug === "users" && normalized.includes("reactivate")) return "Reactivate this account so its current status is active/available again?"
  if (normalized.includes("archive")) return "Archive this product from the active catalog? It can be reactivated later."
  if (normalized.includes("end")) return "End this promotion? It will become inactive and can be reactivated later."
  if (normalized.includes("delete") || normalized.includes("remove")) return `Remove this ${slug === "feedback" ? "feedback record" : "record"}? This cannot be undone in the local demo.`
  if (normalized.includes("restore")) return "Restoring overwrites current data. Confirm only after verifying the selected backup."
  if (normalized.includes("reject payment")) return "Reject this GCash payment only if you checked the platform account and the incoming transaction is missing, incorrect, or does not match. This does not initiate a refund."
  if (normalized.includes("reject")) return "Reject this request? The status will be changed to Rejected in this browser prototype."
  if (normalized.includes("approve")) return "Approve this request? The status will be changed to Approved in this browser prototype."
  if (normalized.includes("confirm payment")) return "Before confirming, independently check the platform's official GCash account. Match the exact amount and transaction reference against the incoming transaction. A customer-entered reference or screenshot alone is not proof of payment."
  if (normalized.includes("cash collected")) return "Confirm that the full COD amount was physically collected in cash. This will mark the payment as paid."
  if (normalized.includes("verify")) return "Confirm that you inspected the payment in the provider account. Never rely only on a customer screenshot or reference number."
  if (normalized.includes("accept") || normalized.includes("start preparing")) return "Accept this order and begin preparing it. Stock will be deducted when the acceptance is saved."
  if (normalized.includes("ready for pickup")) return "Confirm this walk-in order is packed and ready for the customer to collect at the store."
  if (normalized.includes("out for delivery")) return "Confirm this delivery order has been handed off and is on its way to the provided address."
  if (normalized.includes("complete")) return "Mark this order completed after pickup or delivery has been fulfilled. COD must be recorded as collected separately."
  if (normalized.includes("cancel")) return "Cancel this order? Cancelled orders are final and cannot be progressed afterward."
  return `Continue with ${action.toLowerCase()}? The change will be saved locally in this browser.`
}

function defaultRowAction(slug: string) {
  if (slug === "products") return "Edit · Archive"
  if (slug === "users" || slug === "customers") return "View · Edit · Suspend"
  if (slug === "promotions") return "Edit · End"
  return "View · Edit"
}
