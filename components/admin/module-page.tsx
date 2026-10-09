"use client"

import { useEffect, useMemo, useState } from "react"
import { Archive, Bell, CircleAlert, Download, Filter, Leaf, Plus, RotateCcw, ShieldCheck, Trash2, Eye, Pencil, PackagePlus } from "lucide-react"
import { Button, Card, Chip, Input, Modal } from "@heroui/react"

type ModuleConfig = { title: string; subtitle: string; action?: string; stats?: [string, string, string?][]; columns: string[]; rows: string[][]; search: string; filter?: string; filterOptions?: string[]; note?: string }

const modules: Record<string, ModuleConfig> = {
  orders: { title: "Order Management", subtitle: "Handle all customer orders and track fulfillment status", action: "Export Orders", stats: [["New Orders", "6"], ["Processing", "4"], ["Out for Delivery", "3"], ["Delivered Today", "11"]], search: "Search by order ID or customer...", filter: "All Status", columns: ["Order ID", "Customer", "Items", "Total", "Payment", "Status", "Date", "Actions"], rows: [["#ORD-0041", "Maria Santos", "3", "₱1,200", "Paid", "Pending", "Aug 14", "View · Process"], ["#ORD-0040", "Jose Reyes", "2", "₱840", "Paid", "Processing", "Aug 14", "View · Ship"], ["#ORD-0039", "Ana Cruz", "5", "₱2,100", "Paid", "Shipped", "Aug 13", "View · Track"], ["#ORD-0038", "Pedro Lim", "1", "₱560", "Paid", "Delivered", "Aug 13", "View"], ["#ORD-0037", "Rosa Tan", "2", "₱780", "Unpaid", "Cancelled", "Aug 12", "View"]], note: "Order flow: Pending → Processing → Shipped → Delivered. Cancelled orders are final." },
  inventory: { title: "Inventory Management", subtitle: "Track stock levels, movements, and product availability", action: "Record Movement", stats: [["Total SKUs", "42"], ["Low Stock Items", "5", "Below reorder threshold"], ["Out of Stock", "2"], ["Last Updated", "Today", "Aug 14, 2026"]], search: "Search by product name or SKU...", filter: "Filter by Status", columns: ["SKU", "Product Name", "Current Stock", "Reorder Level", "Last Movement", "Status", "Actions"], rows: [["SKU-001", "Woven Abaca Bag", "12", "10", "Aug 12 · +20 received", "Normal", "View · Adjust"], ["SKU-002", "Native Rattan Basket", "8", "10", "Aug 10 · -3 sold", "Low Stock", "View · Adjust"], ["SKU-003", "Handwoven Table Runner", "25", "8", "Aug 14 · -5 sold", "Normal", "View · Adjust"], ["SKU-004", "Bamboo Jewelry Set", "2", "5", "Aug 13 · -4 sold", "Low Stock", "View · Adjust"], ["SKU-005", "Native Buri Hat", "0", "5", "Aug 11 · -6 sold", "Out of Stock", "View · Adjust"]], note: "Movement history records restocking, sales, damage, and manual adjustments. Reorder thresholds trigger dashboard alerts." },
  customers: { title: "Customer Management", subtitle: "Manage customer accounts, information, and transaction records", action: "Export Customers", search: "Search by name, email, or phone...", filter: "Filter by Status", columns: ["Customer ID", "Name", "Email", "Phone", "Total Orders", "Total Spent", "Status", "Actions"], rows: [["CUS-001", "Maria Santos", "maria@email.com", "09XX-XXX-XXX", "6", "₱5,400", "Active", "View · Suspend"], ["CUS-002", "Jose Reyes", "jose@email.com", "09XX-XXX-XXX", "3", "₱2,100", "Active", "View · Suspend"], ["CUS-003", "Ana Cruz", "ana@email.com", "09XX-XXX-XXX", "10", "₱9,800", "Active", "View · Suspend"], ["CUS-004", "Pedro Lim", "pedro@email.com", "09XX-XXX-XXX", "1", "₱560", "Suspended", "View · Reactivate"]], note: "Customer details include profile information, address book, order history, and feedback records." },
  "delivery-personnel": { title: "Delivery Personnel Management", subtitle: "Manage delivery staff accounts, availability, and assignments", action: "Add Personnel", stats: [["Total Personnel", "8"], ["Available", "5"], ["On Delivery", "3"], ["Deliveries Today", "11"]], search: "Search personnel...", columns: ["Personnel ID", "Name", "Contact", "Assigned Orders", "Availability", "Actions"], rows: [["DEL-001", "Ramon Dela Cruz", "09XX-XXX-XXX", "#ORD-0041, #ORD-0039", "On Delivery", "View · Edit"], ["DEL-002", "Julio Marcos", "09XX-XXX-XXX", "#ORD-0040", "On Delivery", "View · Edit"], ["DEL-003", "Benito Aquino", "09XX-XXX-XXX", "—", "Available", "View · Edit · Assign"], ["DEL-004", "Carlos Ramos", "09XX-XXX-XXX", "—", "Off Duty", "View · Edit"]], note: "Assign pending orders to available personnel. Availability updates when an order is picked up or delivered." },
  "returns-refunds": { title: "Return and Refund Management", subtitle: "Handle eligible return and refund requests from customers", action: "Export", stats: [["Open Requests", "4"], ["Under Review", "2"], ["Approved", "1"], ["Rejected", "1"]], search: "Search by request, order, or customer...", filter: "All Status", columns: ["Request ID", "Order ID", "Customer", "Reason", "Type", "Amount", "Status", "Actions"], rows: [["RET-007", "#ORD-0033", "Rosa Tan", "Defective item", "Refund", "₱780", "Open", "Review · Approve · Reject"], ["RET-006", "#ORD-0030", "Ana Cruz", "Wrong item received", "Return + Refund", "₱1,200", "Under Review", "Review · Approve · Reject"], ["RET-005", "#ORD-0028", "Jose Reyes", "Changed mind", "Return", "₱430", "Rejected", "View"], ["RET-004", "#ORD-0025", "Maria Santos", "Item not as described", "Refund", "₱650", "Approved", "View"]], note: "Approved refunds create a payment reversal and notify the customer. Requests must be within the return window." },
  feedback: { title: "Customer Feedback Management", subtitle: "Monitor ratings and feedback on products and completed transactions", action: "Export Feedback", stats: [["Avg. Product Rating", "4.3 ★"], ["Total Reviews", "128"], ["Flagged Feedback", "2"], ["Unread", "7"]], search: "Search by product or customer...", filter: "All Ratings", filterOptions: ["★★★★★", "★★★★☆", "★★★☆☆", "★★☆☆☆", "★☆☆☆☆"], columns: ["Feedback ID", "Customer", "Product", "Rating", "Comment", "Order ID", "Date", "Actions"], rows: [["FBK-128", "Maria Santos", "Woven Abaca Bag", "★★★★★", "Beautiful craftsmanship!", "#ORD-0038", "Aug 14", "View · Flag"], ["FBK-127", "Ana Cruz", "Rattan Basket", "★★★★☆", "Good quality, fast delivery", "#ORD-0035", "Aug 13", "View · Flag"], ["FBK-126", "Unknown", "Bamboo Jewelry Set", "★☆☆☆☆", "[flagged content]", "#ORD-0032", "Aug 12", "View · Unflag · Remove"], ["FBK-125", "Jose Reyes", "Table Runner", "★★★★☆", "Nice product", "#ORD-0030", "Aug 11", "View · Flag"]], note: "Flagged feedback is hidden from the storefront pending review. Feedback is linked to verified purchases." },
  payments: { title: "Payment Management", subtitle: "Verify payments, manage transactions, and maintain payment records", action: "Export Records", stats: [["Total Collected (Month)", "₱48,320"], ["Pending Verification", "3"], ["Refunds Issued", "₱1,430"], ["Failed Transactions", "1"]], search: "Search by transaction ID or order...", filter: "All Methods", filterOptions: ["GCash", "Maya", "COD"], columns: ["Transaction ID", "Order ID", "Customer", "Amount", "Method", "Status", "Date", "Actions"], rows: [["TXN-0091", "#ORD-0041", "Maria Santos", "₱1,200", "GCash", "Pending Verification", "Aug 14", "Verify · Reject"], ["TXN-0090", "#ORD-0040", "Jose Reyes", "₱840", "Maya", "Verified", "Aug 14", "View Receipt"], ["TXN-0089", "#ORD-0039", "Ana Cruz", "₱2,100", "COD", "Completed", "Aug 13", "View Receipt"], ["TXN-0088", "#ORD-0038", "Pedro Lim", "₱560", "GCash", "Refunded", "Aug 13", "View Receipt"], ["TXN-0087", "#ORD-0037", "Rosa Tan", "₱780", "Maya", "Failed", "Aug 12", "View Details"]], note: "Payment verification checks customer proof. Verified payments update the linked order." },
  products: { title: "Product Management", subtitle: "Manage products, listings, and Native Heritage Showcase content", action: "Add Product", search: "Search products...", filter: "Category", filterOptions: ["Bags", "Baskets", "Home Decor", "Accessories", "Headwear"], columns: ["Product ID", "Image", "Product Name", "Category", "Price", "Stock", "Status", "Actions"], rows: [["PRD-001", "◻", "Woven Abaca Bag", "Bags", "₱850", "12", "Active", "Edit · Archive"], ["PRD-002", "◻", "Native Rattan Basket", "Baskets", "₱1,200", "8", "Active", "Edit · Archive"], ["PRD-003", "◻", "Handwoven Table Runner", "Home Decor", "₱430", "25", "Active", "Edit · Archive"], ["PRD-004", "◻", "Bamboo Jewelry Set", "Accessories", "₱650", "2", "Low Stock", "Edit · Archive"], ["PRD-005", "◻", "Native Buri Hat", "Headwear", "₱320", "0", "Out of Stock", "Edit · Archive"]], note: "Product images, category, price, stock, visibility, and Heritage Showcase membership are managed here." },
  "audit-logs": { title: "Audit Logs", subtitle: "Administrative activity log for monitoring, accountability, and security", action: "Export Logs", search: "Search by user, action, or module...", filter: "All Modules", filterOptions: ["Product Management", "Order Management", "Payment Management", "Customer Management", "Inventory Management", "Backup & Restore"], columns: ["Log ID", "User", "Role", "Module", "Action", "IP Address", "Timestamp"], rows: [["LOG-441", "admin@akp.com", "Owner", "Product Management", "Updated PRD-003 price", "192.168.1.1", "Aug 14, 10:42 AM"], ["LOG-440", "staff01@akp.com", "Staff", "Order Management", "Processed #ORD-0040", "192.168.1.5", "Aug 14, 10:38 AM"], ["LOG-439", "staff01@akp.com", "Staff", "Payment Management", "Verified TXN-0090", "192.168.1.5", "Aug 14, 10:30 AM"], ["LOG-438", "admin@akp.com", "Owner", "Customer Management", "Suspended CUS-004", "192.168.1.1", "Aug 14, 09:55 AM"], ["LOG-437", "staff02@akp.com", "Staff", "Inventory Management", "Adjusted SKU-001 stock +20", "192.168.1.7", "Aug 14, 09:20 AM"], ["LOG-436", "admin@akp.com", "Owner", "Backup & Restore", "Triggered manual backup", "192.168.1.1", "Aug 14, 08:00 AM"]], note: "Audit logs are read-only. Owner can review all records; Staff access is limited to their own activity." },
}

const extras: Record<string, ModuleConfig> = {
  "backup-restore": { title: "Backup and Restore", subtitle: "Ensure business data is backed up and can be recovered", action: "Trigger Manual Backup", stats: [["Last Backup", "Aug 14", "Today at 08:00 AM · Successful"], ["Backup Size", "124 MB"], ["Auto Backup", "Enabled", "Daily at 2:00 AM"], ["Total Backups Stored", "30", "Oldest: Jul 1, 2026"]], search: "Search backup history...", columns: ["Backup ID", "Type", "Size", "Status", "Date & Time", "Actions"], rows: [["BCK-030", "Auto", "124 MB", "Successful", "Aug 14 · 02:00 AM", "Restore · Download"], ["BCK-029", "Manual", "312 MB", "Successful", "Aug 14 · 08:00 AM", "Restore · Download"], ["BCK-028", "Auto", "121 MB", "Successful", "Aug 13 · 02:00 AM", "Restore · Download"], ["BCK-027", "Auto", "120 MB", "Failed", "Aug 12 · 02:00 AM", "Retry · Details"]], note: "Only Owner can restore. Restoring overwrites current data and requires confirmation. Failed backups alert the Owner." },
  reports: { title: "Reports", subtitle: "Business and operational reports for monitoring and management", action: "Export PDF", search: "Select a date range...", columns: ["Report", "Description", "Period", "Actions"], rows: [["Sales Report", "Daily, weekly, monthly revenue breakdown", "This month", "Generate"], ["Inventory Report", "Stock levels, movements, reorder alerts", "Current", "Generate"], ["Order Report", "Order volume, fulfillment rate, cancellations", "This month", "Generate"], ["Customer Report", "New registrations, activity, top buyers", "This month", "Generate"], ["Delivery Report", "Delivery success rate, personnel performance", "This month", "Generate"], ["Payment Report", "Transactions, refunds, payment methods", "This month", "Generate"]], note: "Choose a date range and generate a report. Preview updates inline; exports are available as PDF or CSV." },
  promotions: { title: "Marketing and Notifications", subtitle: "Manage promotions, business announcements, and system notifications", action: "New Promotion", search: "Search promotions and announcements...", columns: ["Promo Name", "Discount", "Valid Until", "Status", "Actions"], rows: [["Summer Sale", "15% off", "Aug 31", "Active", "Edit · End"], ["Bulk Discount", "₱100 off ₱1k+", "Sep 15", "Active", "Edit · End"], ["New User Promo", "10% off", "Expired", "Inactive", "Reactivate"]], note: "Announcements target all customers or all users. Notification history and send status are available." },
  notifications: { title: "Marketing and Notifications", subtitle: "Send announcements and customer notifications", action: "New Announcement", search: "Search sent notifications...", columns: ["Title", "Target", "Type", "Sent", "Status", "Actions"], rows: [["New product arrivals!", "All Customers", "Announcement", "Aug 14", "Sent", "View"], ["Holiday hours notice", "All Customers", "Announcement", "Aug 10", "Sent", "View"], ["App maintenance", "All Users", "System", "Aug 5", "Sent", "View"]], note: "Compose a message, select a target audience and notification type, then send." },
  "heritage-showcase": { title: "Native Heritage Showcase", subtitle: "Curate local products and the stories behind their craft", action: "Add to Showcase", search: "Search showcased products...", columns: ["Product", "Craft / Origin", "Category", "Visibility", "Featured", "Actions"], rows: [["Woven Abaca Bag", "Handwoven abaca · South Cotabato", "Bags", "Published", "Yes", "Edit · Remove"], ["Native Rattan Basket", "Traditional rattan weaving", "Baskets", "Published", "Yes", "Edit · Remove"], ["Bamboo Jewelry Set", "Locally crafted bamboo", "Accessories", "Draft", "No", "Edit · Publish"]], note: "Showcase entries connect to catalog products and explain local materials, makers, and craft traditions." },
  "returns-and-refunds": { title: "Return and Refund Management", subtitle: "Handle eligible return and refund requests from customers", action: "Export", stats: [["Open Requests", "4"], ["Under Review", "2"], ["Approved", "1"], ["Rejected", "1"]], search: "Search requests...", columns: ["Request ID", "Order ID", "Customer", "Reason", "Type", "Amount", "Status", "Actions"], rows: [["RET-007", "#ORD-0033", "Rosa Tan", "Defective item", "Refund", "₱780", "Open", "Review · Approve · Reject"]] },
  users: { title: "User Management", subtitle: "Manage Owner and Staff access to the administration system", action: "Add User", search: "Search by name or email...", filter: "All Roles", columns: ["Name", "Email", "Role", "Status", "Last Login", "Actions"], rows: [["AKP Owner", "admin@akp.com", "Owner", "Active", "Aug 14, 08:00 AM", "Edit"], ["Staff Account 01", "staff01@akp.com", "Staff", "Active", "Aug 14, 10:38 AM", "Edit · Suspend"], ["Staff Account 02", "staff02@akp.com", "Staff", "Active", "Aug 14, 09:20 AM", "Edit · Suspend"]], note: "Owner manages users and roles. Staff access follows the module permission policy." },
  settings: { title: "Settings", subtitle: "Configure store, operational, and account preferences", columns: ["Setting", "Current value", "Description", "Actions"], search: "", rows: [["Store name", "AKP Native Products Trading", "Displayed in admin and customer surfaces", "Edit"], ["Currency", "PHP (₱)", "Local transaction currency", "Edit"], ["Low stock threshold", "Per product", "Reorder level is set for each SKU", "Manage"], ["Return window", "7 days", "Eligible return period", "Edit"], ["Automatic backups", "Daily at 2:00 AM", "Backup schedule", "Configure"]] },
}

const slugAliases: Record<string, string> = { "return-refund": "returns-refunds", "return-and-refund": "returns-refunds", "marketing-notifications": "promotions" }
const titleCase = (slug: string) => slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")

function statusColor(value: string) { const s = value.toLowerCase(); if (["active", "successful", "verified", "completed", "delivered", "normal", "available", "approved", "published", "sent"].some((x) => s.includes(x))) return "success" as const; if (["pending", "low stock", "open", "review", "processing", "on delivery"].some((x) => s.includes(x))) return "warning" as const; if (["failed", "rejected", "cancelled", "out of stock", "suspended", "inactive"].some((x) => s.includes(x))) return "danger" as const; return "default" as const }

function getDisplayStats(slug: string, stats: ModuleConfig["stats"], rows: string[][], databaseBacked: boolean) {
  if (!stats || !databaseBacked) return stats
  const countStatus = (index: number, value: string) => rows.filter((row) => row[index]?.toLowerCase() === value).length
  const today = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(new Date())
  if (slug === "orders") return [["New Orders", String(countStatus(5, "pending"))], ["Processing", String(countStatus(5, "processing"))], ["Out for Delivery", String(countStatus(5, "shipped"))], ["Delivered Today", String(countStatus(5, "delivered")), "Demo orders in the current dataset"]] as [string, string, string?][]
  if (slug === "inventory") return [["Total SKUs", String(rows.length)], ["Low Stock Items", String(rows.filter((row) => ["low stock", "out of stock"].includes(row[5]?.toLowerCase())).length), "At or below reorder threshold"], ["Out of Stock", String(countStatus(5, "out of stock"))], ["Last Updated", today, "Philippine time"]] as [string, string, string?][]
  if (slug === "delivery-personnel") return [["Total Personnel", String(rows.length)], ["Available", String(countStatus(4, "available"))], ["On Delivery", String(countStatus(4, "on delivery"))], ["Assigned Orders", String(rows.filter((row) => row[3] && row[3] !== "—").length)]] as [string, string, string?][]
  if (slug === "returns-refunds") return [["Open Requests", String(countStatus(6, "pending"))], ["Under Review", String(countStatus(6, "under review"))], ["Approved", String(countStatus(6, "approved"))], ["Rejected", String(countStatus(6, "rejected"))]] as [string, string, string?][]
  if (slug === "feedback") {
    const ratings = rows.map((row) => (row[3]?.match(/★/g) ?? []).length).filter((rating) => rating > 0)
    const average = ratings.length ? (ratings.reduce((total, rating) => total + rating, 0) / ratings.length).toFixed(1) : "—"
    const flagged = rows.filter((row) => row[7]?.toLowerCase().includes("unflag") || row[4]?.toLowerCase().includes("flagged content")).length
    return [["Avg. Product Rating", `${average}${average === "—" ? "" : " ★"}`], ["Total Reviews", String(rows.length)], ["Flagged Feedback", String(flagged)], ["Unread", "—", "Not tracked in the current schema"]] as [string, string, string?][]
  }
  if (slug === "payments") {
    const amount = (row: string[]) => Number((row[3] ?? "").replace(/[^\d.]/g, "")) || 0
    const collected = rows.filter((row) => ["verified", "completed"].includes(row[5]?.toLowerCase())).reduce((total, row) => total + amount(row), 0)
    const refunded = rows.filter((row) => row[5]?.toLowerCase() === "refunded").reduce((total, row) => total + amount(row), 0)
    const money = (value: number) => `₱${value.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`
    return [["Total Collected", money(collected), "Verified demo payments"], ["Pending Verification", String(countStatus(5, "pending"))], ["Refunds Issued", money(refunded)], ["Failed Transactions", String(countStatus(5, "failed"))]] as [string, string, string?][]
  }
  return stats
}

type DialogState = { title: string; kind: "view" | "form" | "confirm"; row?: string[]; rowIndex?: number; action?: string; values?: Record<string, string>; message?: string; table?: "main" | "announcements"; fields?: string[]; extraFields?: [string, string][] }

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

export default function ModulePage({ slug: rawSlug, databaseRows, databaseAnnouncements, databaseError = false }: { slug: string; databaseRows?: string[][]; databaseAnnouncements?: string[][]; databaseError?: boolean }) {
  const slug = slugAliases[rawSlug] ?? rawSlug
  const config = modules[slug] ?? extras[slug] ?? { title: titleCase(slug), subtitle: `Manage ${titleCase(slug).toLowerCase()} for AKP Native Products`, columns: ["Name", "Details", "Status", "Actions"], rows: [], search: "Search..." }
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("All")
  const [generatedReport, setGeneratedReport] = useState<string | null>(null)
  const [rows, setRows] = useState<string[][]>(databaseRows ?? config.rows)
  const [loaded, setLoaded] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [notice, setNotice] = useState("")
  const [dateRange, setDateRange] = useState("This month")
  const [customStart, setCustomStart] = useState("")
  const [customEnd, setCustomEnd] = useState("")
  const [announcementRows, setAnnouncementRows] = useState<string[][]>(databaseAnnouncements ?? [["New product arrivals!", "All Customers", "Aug 14", "View · Delete"], ["Holiday hours notice", "All Customers", "Aug 10", "View · Delete"], ["App maintenance", "All Users", "Aug 5", "View · Delete"]])
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({})
  const [restoreId, setRestoreId] = useState("")
  const isDatabasePreview = databaseRows !== undefined
  useEffect(() => {
    setLoaded(false)
    if (databaseRows !== undefined) {
      setRows(databaseRows)
      if (databaseAnnouncements !== undefined) setAnnouncementRows(databaseAnnouncements)
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
  }, [slug, databaseRows, databaseAnnouncements])
  useEffect(() => { if (loaded && !isDatabasePreview) localStorage.setItem(`akp-admin:${slug}`, JSON.stringify(rows)) }, [loaded, isDatabasePreview, rows, slug])
  useEffect(() => { if (loaded && !isDatabasePreview) localStorage.setItem("akp-admin:announcements", JSON.stringify(announcementRows)) }, [loaded, isDatabasePreview, announcementRows])
  useEffect(() => { if (loaded) localStorage.setItem(`akp-admin:notes:${slug}`, JSON.stringify(decisionNotes)) }, [loaded, decisionNotes, slug])
  const filteredRows = useMemo(() => rows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase()) && (filter === "All" || row.some((cell) => cell.toLowerCase().includes(filter.toLowerCase())))), [rows, filter, query])
  const openForm = (title: string, row?: string[], rowIndex?: number, action?: string, customFields?: string[]) => {
    const fields = customFields ?? config.columns.filter((column) => column !== "Actions" && column !== "Status")
    const values = Object.fromEntries(fields.map((field) => [field, row?.[config.columns.indexOf(field)] ?? ""]))
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
    saveCsv(`${slug}-${new Date().toISOString().slice(0, 10)}.csv`, config.columns, filteredRows)
    setNotice(`Exported ${filteredRows.length} ${config.title.toLowerCase()} records as CSV.`)
  }
  const openAction = (action: string, row: string[], rowIndex: number, table: "main" | "announcements" = "main") => {
    const targetRows = table === "main" ? rows : announcementRows
    const index = targetRows.findIndex((candidate) => candidate[0] === row[0])
    const lower = action.toLowerCase()
    if (/^(view|review|track|details|view details|view receipt)$/.test(lower)) {
      const extraFields: [string, string][] = []
      if (slug === "customers") extraFields.push(["Address book", "Address details are not included in the reference sample."], ["Order history", "See linked transactions in Order Management."], ["Feedback", "See verified reviews in Customer Feedback."])
      if (slug === "returns-refunds" && decisionNotes[row[0]]) extraFields.push(["Decision notes", decisionNotes[row[0]]])
      if (slug === "payments" && lower === "view receipt") extraFields.push(["Receipt proof", "No receipt attachment is included in the sample data."])
      setDialog({ title: `${action}: ${row[0]}`, kind: "view", row, fields: table === "announcements" ? ["Title", "Target", "Sent"] : config.columns.filter((column) => column !== "Actions"), extraFields })
      return
    }
    if (lower === "download") {
      saveCsv(`${row[0].toLowerCase()}-backup.csv`, config.columns, [row])
      setNotice(`Downloaded ${row[0]} metadata as CSV.`)
      return
    }
    if (lower.includes("edit") || lower === "adjust") {
      const fields = lower === "adjust" ? ["Current Stock", "Reason"] : undefined
      openForm(`${action}: ${row[0]}`, row, index, action, fields)
      return
    }
    if (lower === "assign") {
      openForm(`Assign ${row[0]}`, row, index, action, ["Assigned Orders"])
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
    if (isDatabasePreview) {
      const writable = ["products", "inventory", "orders", "customers", "delivery-personnel", "returns-refunds", "payments", "feedback", "promotions", "notifications", "heritage-showcase"]
      if (!writable.includes(slug)) {
        setNotice("This module is read-only because its schema has no safe edit operation configured.")
        setDialog(null)
        return
      }
      const action = dialog.kind === "form"
        ? dialog.action === "Record Movement" ? "record-movement" : slug === "returns-refunds" ? dialog.action ?? "edit" : dialog.row ? "edit" : "create"
        : dialog.action ?? ""
      try {
        const response = await fetch("/api/admin/records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ module: slug, action, row: dialog.row, values: dialog.values }),
        })
        const result = await response.json() as { error?: string }
        if (!response.ok) throw new Error(result.error || "Database save failed.")
      } catch (cause) {
        setNotice(cause instanceof Error ? cause.message : "Database save failed. No local changes were applied.")
        setDialog(null)
        return
      }
    }
    if (dialog.kind === "form") {
      const fields = Object.keys(dialog.values ?? {})
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
        const reorderColumn = config.columns.indexOf("Reorder Level")
        const movementColumn = config.columns.indexOf("Last Movement")
        const statusColumn = config.columns.indexOf("Status")
        const target = rows.findIndex((item) => item[productColumn]?.toLowerCase() === product.toLowerCase())
        if (target < 0) { setNotice("Product not found. Enter an exact product name from Inventory."); return }
        const stock = Number(rows[target][stockColumn])
        const delta = type.toLowerCase().includes("out") || type.toLowerCase().includes("sale") || type.toLowerCase().includes("damage") ? -quantity : quantity
        const nextStock = Math.max(0, stock + delta)
        const reorder = Number(rows[target][reorderColumn])
        setRows((existing) => existing.map((item, index) => index === target ? item.map((cell, column) => column === stockColumn ? String(nextStock) : column === movementColumn ? `${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${delta > 0 ? "+" : ""}${delta} ${dialog.values?.Reason || type}` : column === statusColumn ? nextStock === 0 ? "Out of Stock" : nextStock <= reorder ? "Low Stock" : "Normal" : cell) : item))
        setNotice(`Recorded stock ${delta > 0 ? "in" : "out"} for ${product}.`)
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
        const missing = fields.filter((field) => !optional.has(field) && !dialog.values?.[field]?.trim())
        if (missing.length) { setNotice(`Complete required fields: ${missing.join(", ")}.`); return }
      }
      fields.forEach((field, index) => {
        const columnIndex = config.columns.indexOf(field)
        if (columnIndex >= 0) current[columnIndex] = dialog.values?.[field] ?? ""
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
        if (dialog.action === "Adjust") {
          const stockColumn = config.columns.indexOf("Current Stock")
          const reorderColumn = config.columns.indexOf("Reorder Level")
          const movementColumn = config.columns.indexOf("Last Movement")
          const statusColumn = config.columns.indexOf("Status")
          const stock = Number(current[stockColumn])
          if (!Number.isFinite(stock) || stock < 0) { setNotice("Stock quantity must be zero or greater."); return }
          if (movementColumn >= 0) current[movementColumn] = `${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })} · adjusted${dialog.values?.Reason ? `: ${dialog.values.Reason}` : ""}`
          if (statusColumn >= 0) current[statusColumn] = stock === 0 ? "Out of Stock" : stock <= Number(current[reorderColumn]) ? "Low Stock" : "Normal"
        }
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
        const statusColumn = config.columns.findIndex((column) => ["Status", "Availability", "Visibility"].includes(column))
        let status = ""
        if (action.includes("approve")) status = "Approved"
        else if (action.includes("reject")) status = "Rejected"
        else if (action.includes("process")) status = "Processing"
        else if (action.includes("ship")) status = "Shipped"
        else if (action.includes("verify")) status = "Verified"
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
        if (dialog.rowIndex !== undefined && dialog.table !== "announcements" && (action.includes("process") || action.includes("ship") || action.includes("verify") || action.includes("approve") || action.includes("reject"))) {
          const actionsColumn = config.columns.indexOf("Actions")
          const nextActions = action.includes("process") ? "View · Ship" : action.includes("ship") ? "View · Track" : action.includes("approve") || action.includes("reject") ? "View" : action.includes("verify") ? "View Receipt" : "View Details"
          if (actionsColumn >= 0) setRows((existing) => existing.map((item, index) => index === dialog.rowIndex ? item.map((cell, column) => column === actionsColumn ? nextActions : cell) : item))
        }
        if (slug === "payments" && action.includes("verify") && dialog.row) {
          try {
            const orderId = dialog.row[1]
            const orderColumns = modules.orders.columns
            const statusIndex = orderColumns.indexOf("Status")
            const actionsIndex = orderColumns.indexOf("Actions")
            const savedOrders = localStorage.getItem("akp-admin:orders")
            const orders = savedOrders ? JSON.parse(savedOrders) as string[][] : modules.orders.rows
            const updatedOrders = orders.map((order) => order[0] === orderId && order[statusIndex] === "Pending" ? order.map((cell, column) => column === statusIndex ? "Processing" : column === actionsIndex ? "View · Ship" : cell) : order)
            localStorage.setItem("akp-admin:orders", JSON.stringify(updatedOrders))
          } catch { setNotice("Payment verified locally, but linked order status could not be updated.") }
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
    if (action === "Record Movement") { openForm(action, undefined, undefined, action, ["Product", "Movement Type", "Quantity", "Reason"]); return }
    openForm(action, undefined, undefined, action)
  }
  const secondary = slug === "promotions" || slug === "notifications" ? "Catalog & Marketing" : ["customers", "feedback", "payments"].includes(slug) ? "Customers" : ["reports", "audit-logs", "backup-restore", "users", "settings"].includes(slug) ? "System" : "Operations"
  const displayStats = getDisplayStats(slug, config.stats, rows, isDatabasePreview)
  return <div className="mx-auto max-w-[1540px] space-y-5">
    <div className="flex flex-wrap items-center gap-2 text-xs text-default-500"><Leaf size={13} className="text-accent" /><span>{secondary}</span><span className="text-default-300">/</span><span className="font-medium text-foreground">{config.title}</span></div>
    {isDatabasePreview && databaseError && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">Could not load records from Supabase. Check the server database connection.</div>}
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">AKP Native Products · {secondary}</p><h1 className="text-2xl font-bold tracking-tight">{config.title}</h1><p className="mt-1 text-sm text-default-500">{config.subtitle}</p></div><div className="flex flex-wrap gap-2">{slug === "products" && <Button size="sm" variant="outline" onPress={() => location.assign("/heritage-showcase")}>Heritage Showcase</Button>}{slug === "inventory" && <Button size="sm" variant="outline" onPress={() => exportRows("csv")}><Download size={15}/>Export</Button>}{slug === "reports" && <><Button size="sm" variant="outline" onPress={() => exportRows("pdf")}><Download size={15}/>Export PDF</Button><Button size="sm" variant="outline" onPress={() => exportRows("csv")}><Download size={15}/>Export CSV</Button></>}{slug === "promotions" && <><Button size="sm" variant="outline" onPress={() => triggerTopAction("Announcement")}><Plus size={15}/>Announcement</Button><Button size="sm" variant="primary" onPress={() => triggerTopAction("New Promotion")}><Plus size={15}/>New Promotion</Button></>}{config.action && !["reports", "promotions"].includes(slug) && <Button size="sm" variant="primary" onPress={() => triggerTopAction(config.action!)}>{config.action.toLowerCase().includes("export") ? <Download size={15} /> : <Plus size={15} />}{config.action}</Button>}</div></div>
    {notice && <div role="status" className="flex items-center justify-between rounded-md border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">{notice}<Button size="sm" variant="ghost" onPress={() => setNotice("")}>Dismiss</Button></div>}
    {displayStats && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{displayStats.map(([label, value, note]) => <Card key={label} className="rounded-md border border-default-200 shadow-none"><Card.Content className="p-4"><p className="text-xs text-default-500">{label}</p><p className="mt-2 text-xl font-bold">{value}</p>{note && <p className="mt-1 text-[11px] text-default-400">{note}</p>}</Card.Content></Card>)}</div>}
    {slug === "backup-restore" && <Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="grid gap-5 p-4 md:grid-cols-[1.1fr_0.9fr]"><div><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Archive size={16} /> Backup history</div><p className="text-xs text-default-500">Select a backup to restore. Restoring overwrites current data and must be confirmed.</p></div><div className="flex flex-wrap items-center gap-2"><select aria-label="Select backup to restore" value={restoreId} onChange={(event) => setRestoreId(event.target.value)} className="h-9 min-w-48 rounded-md border border-default-200 bg-background px-3 text-xs"><option value="">Select backup to restore</option>{rows.map((r) => <option key={r[0]} value={r[0]}>{r[0]} · {r[3]}</option>)}</select><Button size="sm" variant="danger" isDisabled={!restoreId} onPress={() => setDialog({ title: "Restore backup", kind: "confirm", row: [restoreId], action: "Restore", message: "This irreversible operation normally replaces live business data. Here it only simulates restore because this prototype has no database." })}><RotateCcw size={14} />Restore selected</Button></div></Card.Content></Card>}
    {slug === "reports" && <><div className="flex flex-wrap items-end justify-between gap-3"><label className="space-y-1 text-xs text-default-500">Date range<select aria-label="Date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="block h-9 min-w-48 rounded-md border border-default-200 bg-background px-3 text-xs"><option>Last 7 days</option><option>This month</option><option>Custom range</option></select></label>{dateRange === "Custom range" && <div className="flex flex-wrap gap-2"><label className="space-y-1 text-xs text-default-500">From<input aria-label="Custom start date" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="block h-9 rounded-md border border-default-200 bg-background px-2 text-xs" /></label><label className="space-y-1 text-xs text-default-500">To<input aria-label="Custom end date" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="block h-9 rounded-md border border-default-200 bg-background px-2 text-xs" /></label></div>}<p className="text-[11px] text-default-400">Choose a report to preview</p></div><div className="grid gap-3 md:grid-cols-2">{config.rows.map((row) => <Card key={row[0]} className="rounded-md border border-default-200 shadow-none"><Card.Content className="flex items-center justify-between gap-4 p-4"><div><p className="text-sm font-semibold">{row[0]}</p><p className="mt-1 text-xs text-default-500">{row[1]}</p></div><Button size="sm" variant="outline" onPress={() => setGeneratedReport(row[0])}>Generate</Button></Card.Content></Card>)}</div><Card className="min-h-48 rounded-md border border-default-200 shadow-none"><Card.Content className="flex min-h-48 flex-col items-center justify-center p-6 text-center"><p className="text-sm font-semibold">{generatedReport ?? "Report Preview Area"}</p><p className="mt-2 max-w-lg text-xs leading-5 text-default-500">{generatedReport ? `${generatedReport} for ${dateRange === "Custom range" ? `${customStart || "start date"} to ${customEnd || "end date"}` : dateRange} · Preview is ready for export.` : "Generated report chart or table will appear here after you choose Generate."}</p>{generatedReport && <div className="mt-5 flex h-16 items-end gap-2">{[35, 58, 46, 78, 62, 92, 70, 100].map((height, index) => <span key={index} className="w-5 rounded-t-sm bg-[#8dab92]" style={{ height: `${height}%` }} />)}</div>}</Card.Content></Card></>}
    {slug === "promotions" && <div className="grid gap-3 xl:grid-cols-2"><Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="space-y-3 p-4"><h2 className="text-sm font-semibold">Active Promotions</h2><DataTable compact config={{ ...config, columns: ["Promo Name", "Discount", "Valid Until", "Status", "Actions"] }} rows={rows} onAction={(action, row, index) => openAction(action, row, index)} /></Card.Content></Card><Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="space-y-3 p-4"><h2 className="text-sm font-semibold">Announcements</h2><DataTable compact config={{ ...config, columns: ["Title", "Target", "Sent", "Actions"] }} rows={announcementRows} onAction={(action, row, index) => openAction(action, row, index, "announcements")} /></Card.Content></Card><Card className="rounded-md border border-default-200 shadow-none xl:col-span-2"><Card.Content className="flex flex-wrap items-center justify-between gap-3 p-4"><div><h2 className="text-sm font-semibold">Send an announcement</h2><p className="mt-1 text-xs text-default-500">Compose and save a message to the local notification history.</p></div><Button size="sm" variant="primary" onPress={() => triggerTopAction("Send Notification")}><Bell size={15} />Compose notification</Button></Card.Content></Card></div>}
    {slug !== "reports" && slug !== "promotions" && <Card className="rounded-md border border-default-200 shadow-none"><Card.Content className="space-y-4 p-4"><div className="flex flex-wrap items-center gap-2"><div className="min-w-[230px] flex-1"><Input aria-label={config.search || "Search records"} placeholder={config.search || "Search records..."} value={query} onChange={(e) => setQuery(e.target.value)} /></div>{config.filter && <select aria-label={config.filter} className="h-9 min-w-36 rounded-md border border-default-200 bg-background px-3 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="All">{config.filter}</option>{(config.filterOptions ?? Array.from(new Set(rows.flatMap((row) => row.filter((cell) => ["Active", "Suspended", "Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Normal", "Low Stock", "Out of Stock", "Verified", "Refunded", "Failed", "Open", "Approved", "Rejected", "Successful"].includes(cell)))))).map((option) => <option key={option}>{option}</option>)}</select>}<Button isIconOnly variant="outline" size="sm" aria-label="Clear search and filters" onPress={() => { setQuery(""); setFilter("All"); setNotice("Search and filters cleared.") }}><Filter size={15} /></Button></div><DataTable config={config} rows={filteredRows} onAction={(action, row, index) => openAction(action, row, index)} /></Card.Content></Card>}
    {config.note && <div className="flex items-start gap-2 rounded-md border border-default-200 bg-default-50 px-3 py-2.5 text-xs leading-5 text-default-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#55745e]" />{config.note}</div>}
    <Modal.Backdrop isOpen={Boolean(dialog)} onOpenChange={(isOpen) => { if (!isOpen) setDialog(null) }}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <Modal.CloseTrigger />
          <Modal.Header><Modal.Heading>{dialog?.title}</Modal.Heading></Modal.Header>
          <Modal.Body>
            {dialog?.kind === "view" && dialog.row && <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{(dialog.fields ?? config.columns.filter((column) => column !== "Actions")).map((column, index) => <div key={column} className="rounded-md bg-default-50 p-3"><dt className="text-xs text-default-500">{column}</dt><dd className="mt-1 text-sm font-medium">{dialog.row?.[index] || "—"}</dd></div>)}{dialog.extraFields?.map(([label, value]) => <div key={label} className="rounded-md bg-default-50 p-3"><dt className="text-xs text-default-500">{label}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>)}</dl>}
            {dialog?.kind === "form" && <div className="space-y-3">{dialog.message && <p className="text-sm text-default-600">{dialog.message}</p>}{Object.entries(dialog.values ?? {}).map(([field, value]) => <DialogField key={field} field={field} value={value} onChange={(next) => setDialog((current) => current ? { ...current, values: { ...current.values, [field]: next } } : current)} />)}</div>}
            {dialog?.kind === "confirm" && <div className="space-y-3"><p className="text-sm leading-6 text-default-600">{dialog.message ?? `Continue with ${dialog.action?.toLowerCase()} for ${dialog.row?.[0]}?`}</p><p className="rounded-md bg-warning/10 p-3 text-xs leading-5 text-warning">This demo stores changes only in this browser. No customer, payment, or production database will be changed.</p></div>}
          </Modal.Body>
          {dialog?.kind !== "view" && <Modal.Footer><Button variant="outline" slot="close">Cancel</Button><Button variant={dialog?.kind === "confirm" && isDestructive(dialog.action) ? "danger" : "primary"} onPress={commitDialog}>{dialog?.kind === "confirm" ? "Confirm" : "Save changes"}</Button></Modal.Footer>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
    <p className="text-[10px] text-default-400">{isDatabasePreview ? "Record values are loaded from Supabase. Demo seed entries are clearly marked in the database." : "Screen content follows the supplied admin references. Sample records are illustrative and stored in this browser until a database connection is configured."}</p>
  </div>
}

function DataTable({ config, rows, compact = false, onAction }: { config: ModuleConfig; rows: string[][]; compact?: boolean; onAction?: (action: string, row: string[], index: number) => void }) {
  const statusValues = ["Active", "Suspended", "Pending", "Processing", "Shipped", "Delivered", "Cancelled", "Normal", "Low Stock", "Out of Stock", "Verified", "Refunded", "Failed", "Open", "Approved", "Rejected", "Successful", "Inactive", "Archived", "Available", "On Delivery", "Off Duty", "Under Review", "Published", "Draft", "Flagged", "Unflagged"]
  return <div className="overflow-x-auto"><table className={`w-full ${compact ? "min-w-[540px]" : "min-w-[760px]"} text-left text-xs`}><thead className="bg-default-50 text-default-500"><tr>{config.columns.map((heading) => <th key={heading} className="whitespace-nowrap px-3 py-3 font-medium">{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-default-100 transition-colors hover:bg-default-50/70">{config.columns.map((heading, cellIndex) => { const cell = row[cellIndex] ?? ""; if (heading === "Actions") { const actions = cell.split(" · ").map((item) => item.trim()).filter(Boolean); return <td key={heading} className="px-3 py-2 align-middle"><div className="flex flex-wrap gap-x-1 gap-y-1">{actions.map((action) => { const lower = action.toLowerCase(); const Icon = lower.includes("delete") || lower.includes("remove") ? Trash2 : lower.includes("edit") || lower.includes("adjust") ? Pencil : lower.includes("view") || lower.includes("review") || lower.includes("detail") || lower.includes("receipt") || lower.includes("track") ? Eye : lower.includes("download") ? Download : lower.includes("record") ? PackagePlus : undefined; const destructive = ["delete", "remove", "reject", "suspend", "archive", "end"].some((word) => lower.includes(word)); return <Button key={action} size="sm" variant="ghost" className={`h-7 min-w-0 px-1.5 text-[11px] ${destructive ? "text-danger" : "text-[#315f43]"}`} onPress={() => onAction?.(action, row, index)}>{Icon && <Icon size={12} />}{action}</Button> })}</div></td> } return <td key={`${cellIndex}-${cell}`} className="max-w-64 px-3 py-3 align-middle text-default-700">{statusValues.includes(cell) ? <Chip size="sm" variant="soft" color={statusColor(cell)}>{cell}</Chip> : <span className={cellIndex === 0 ? "font-semibold" : ""}>{cell}</span>}</td> })}</tr>)}</tbody></table>{rows.length === 0 && <div className="flex flex-col items-center gap-2 py-14 text-center"><CircleAlert size={22} className="text-default-400" /><p className="text-sm font-medium">No records found</p><p className="text-xs text-default-500">Try adjusting your search or filters.</p></div>}<div className="flex items-center justify-between border-t border-default-100 pt-3 text-[11px] text-default-500"><span>Showing {rows.length} records</span><div className="flex gap-2"><Button size="sm" variant="outline" isDisabled>Previous</Button><Button size="sm" variant="outline" isDisabled>Next</Button></div></div></div>
}

function DialogField({ field, value, onChange }: { field: string; value: string; onChange: (value: string) => void }) {
  const options: Record<string, string[]> = {
    Product: ["Woven Abaca Bag", "Native Rattan Basket", "Handwoven Table Runner", "Bamboo Jewelry Set", "Native Buri Hat"],
    "Movement Type": ["Stock in (restock)", "Stock out (sale)", "Damage"],
    Category: ["Bags", "Baskets", "Home Decor", "Accessories", "Headwear"],
    Target: ["All Customers", "All Users"],
    Role: ["Owner", "Staff"],
    Visibility: ["Published", "Draft"],
    Featured: ["Yes", "No"],
    Availability: ["Available", "On Delivery", "Off Duty"],
    "Assigned Orders": ["#ORD-0041"],
  }
  const choices = options[field]
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
  if (normalized.includes("archive")) return "Archive this product from the active catalog? It can be reactivated later."
  if (normalized.includes("end")) return "End this promotion? It will become inactive and can be reactivated later."
  if (normalized.includes("delete") || normalized.includes("remove")) return `Remove this ${slug === "feedback" ? "feedback record" : "record"}? This cannot be undone in the local demo.`
  if (normalized.includes("restore")) return "Restoring overwrites current data. Confirm only after verifying the selected backup."
  if (normalized.includes("reject")) return "Reject this request? The status will be changed to Rejected in this browser prototype."
  if (normalized.includes("approve")) return "Approve this request? The status will be changed to Approved in this browser prototype."
  if (normalized.includes("verify")) return "Confirm that you inspected the customer-provided proof for this sample transaction. This demo does not contact a payment provider or change a real payment."
  if (normalized.includes("cancel")) return "Cancel this order? Cancelled orders are final and cannot be progressed afterward."
  return `Continue with ${action.toLowerCase()}? The change will be saved locally in this browser.`
}

function defaultRowAction(slug: string) {
  if (slug === "products") return "Edit · Archive"
  if (slug === "users" || slug === "customers") return "View · Edit · Suspend"
  if (slug === "promotions") return "Edit · End"
  return "View · Edit"
}
