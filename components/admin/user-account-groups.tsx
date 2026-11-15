"use client"

import { useEffect, useState } from "react"
import { Button, Chip, Modal } from "@heroui/react"
import { ChevronDown, Pencil, UserRound } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

const groups = [
  { label: "Owner/Admin", role: "Owner/Admin" },
  { label: "Staff", role: "Staff" },
  { label: "Drivers", role: "Delivery Driver" },
  { label: "Customers", role: "Customer" },
]

export default function UserAccountGroups({ rows, busy, onAction }: { rows: string[][]; busy: boolean; onAction: (action: string, row: string[]) => void }) {
  const router = useRouter()
  const [selfId, setSelfId] = useState("")
  const [canManage, setCanManage] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const [account, setAccount] = useState({ role: "staff", name: "", email: "", phone: "", password: "" })
  const [editRow, setEditRow] = useState<string[] | null>(null)
  const [loginDraft, setLoginDraft] = useState({ email: "", password: "" })
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState("")
  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    void supabase.auth.getUser().then(async (auth) => {
      if (!mounted) return
      setSelfId(auth.data.user?.id ?? "")
      if (!auth.data.user?.id) return
      const { data: admin } = await supabase.from("admin_users").select("role,is_active").eq("user_id", auth.data.user.id).maybeSingle()
      if (mounted) setCanManage(admin?.role === "owner" && admin.is_active)
    })
    return () => { mounted = false }
  }, [])

  const createAccount = async () => {
    setCreating(true)
    setCreateError("")
    try {
      const response = await fetch("/api/admin/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: "users", action: "create", values: account }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "Could not create account.")
      setCreateOpen(false)
      setAccount({ role: "staff", name: "", email: "", phone: "", password: "" })
      router.refresh()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create account.")
    } finally {
      setCreating(false)
    }
  }

  const saveLogin = async () => {
    if (!editRow) return
    setEditBusy(true)
    setEditError("")
    try {
      const response = await fetch("/api/admin/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ module: "users", action: "edit-credentials", row: editRow, values: loginDraft }) })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || "Could not update login.")
      setEditRow(null)
      setLoginDraft({ email: "", password: "" })
      router.refresh()
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update login.")
    } finally {
      setEditBusy(false)
    }
  }

  return <>
    {canManage && <div className="mb-3 flex justify-end"><Button size="sm" variant="primary" isDisabled={busy} onPress={() => { setCreateError(""); setCreateOpen(true) }}>Create account</Button></div>}
    <div className="grid items-start gap-3 md:grid-cols-2">
    {groups.map(({ label, role }) => {
      const accounts = rows.filter((row) => row[6] === role)
      return <section key={role} aria-label={`${label} accounts`} className="min-w-0 overflow-hidden rounded-lg border border-default-200">
        <header className="flex items-center justify-between border-b border-default-200 bg-default-50/60 px-4 py-3">
          <h2 className="text-sm font-semibold">{label}</h2><Chip size="sm" variant="soft">{accounts.length}</Chip>
        </header>
        {!accounts.length ? <p className="px-4 py-8 text-center text-xs text-default-500">No matching accounts.</p> : <ul className="max-h-[38rem] divide-y divide-default-200 overflow-y-auto">
          {accounts.map((row) => {
            const status = row[4] || "Offline · Active"
            const banned = status.toLowerCase().includes("banned")
            const suspended = status.toLowerCase().includes("suspended")
            const isSelf = Boolean(selfId && row[7] === selfId)
            const actions = (banned ? ["Unban", "Delete"] : suspended ? ["Reactivate", "Ban", "Delete"] : ["Suspend", "Ban", "Delete"])
              .filter((action) => row[7] || !["Ban", "Unban"].includes(action))
            return <li key={row[0]}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 transition hover:bg-default-50 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning"><UserRound size={15}/></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{row[1] || "Unnamed account"}</span><span className="mt-0.5 block truncate text-[11px] text-default-500">{row[2] || "—"}</span></span>
                  <Chip size="sm" variant="soft" color={banned || suspended ? "danger" : status.toLowerCase().includes("online") ? "success" : "default"}>{status}</Chip>
                  <ChevronDown size={15} className="shrink-0 text-default-400 transition-transform group-open:rotate-180"/>
                </summary>
                <div className="space-y-3 border-t border-default-100 bg-default-50/40 px-4 py-3">
                  <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                    <div className="min-w-0"><dt className="text-default-500">Account ID</dt><dd className="mt-0.5 break-all font-mono">{row[0]?.split(":").slice(1).join(":") || "—"}</dd></div>
                    <div><dt className="text-default-500">Phone</dt><dd className="mt-0.5">{row[3] || "—"}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-default-500">Last sign in</dt><dd className="mt-0.5">{row[5] || "Never"}</dd></div>
                  </dl>
                  <div className="flex flex-wrap gap-2 border-t border-default-200 pt-3">
                    {canManage && !isSelf && row[7] && <Button size="sm" variant="outline" isDisabled={busy || editBusy} onPress={() => { setEditError(""); setLoginDraft({ email: row[2] === "—" ? "" : row[2], password: "" }); setEditRow(row) }}><Pencil size={14}/>Edit login</Button>}
                    {canManage && actions.map((action) => <Button key={action} size="sm" variant={action === "Delete" || action === "Ban" ? "danger" : action === "Reactivate" || action === "Unban" ? "primary" : "outline"} isDisabled={busy || isSelf} onPress={() => onAction(action, row)}>{action}</Button>)}
                    {isSelf && <span className="self-center text-[11px] text-default-500">Your account is protected.</span>}
                    {!canManage && !isSelf && <span className="self-center text-[11px] text-default-500">Owner access required.</span>}
                  </div>
                </div>
              </details>
            </li>
          })}
        </ul>}
      </section>
    })}
    </div>
    <Modal.Backdrop isOpen={createOpen} onOpenChange={(open) => { if (!open && !creating) setCreateOpen(false) }}>
      <Modal.Container><Modal.Dialog className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><Modal.CloseTrigger/><Modal.Header><Modal.Heading>Create staff account</Modal.Heading></Modal.Header><Modal.Body>
        <div className="space-y-3">
          <p className="text-xs leading-5 text-default-500">Create an owner, staff, or delivery driver login. Customer accounts are created through customer registration. Give the initial password to the account holder securely.</p>
          {createError && <p role="alert" className="rounded-md bg-danger/10 p-3 text-xs text-danger">{createError}</p>}
          <label className="block space-y-1 text-xs font-medium">Role<select aria-label="Account role" value={account.role} onChange={(event) => setAccount((current) => ({ ...current, role: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"><option value="owner">Owner/Admin</option><option value="staff">Staff</option><option value="driver">Delivery Driver</option></select></label>
          <label className="block space-y-1 text-xs font-medium">Name<input aria-label="Account name" autoComplete="name" maxLength={120} value={account.name} onChange={(event) => setAccount((current) => ({ ...current, name: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"/></label>
          <label className="block space-y-1 text-xs font-medium">Email<input aria-label="Account email" type="email" autoComplete="email" maxLength={254} value={account.email} onChange={(event) => setAccount((current) => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"/></label>
          <label className="block space-y-1 text-xs font-medium">Phone (optional)<input aria-label="Account phone" type="tel" autoComplete="tel" maxLength={32} value={account.phone} onChange={(event) => setAccount((current) => ({ ...current, phone: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"/></label>
          <label className="block space-y-1 text-xs font-medium">Initial password<input aria-label="Initial password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={account.password} onChange={(event) => setAccount((current) => ({ ...current, password: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"/></label>
        </div>
      </Modal.Body><Modal.Footer><Button variant="outline" isDisabled={creating} onPress={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" isDisabled={creating || !account.name.trim() || !account.email.trim() || account.password.length < 8} onPress={createAccount}>{creating ? "Creating…" : "Create account"}</Button></Modal.Footer></Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
    <Modal.Backdrop isOpen={Boolean(editRow)} onOpenChange={(open) => { if (!open && !editBusy) setEditRow(null) }}>
      <Modal.Container><Modal.Dialog className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><Modal.CloseTrigger/><Modal.Header><Modal.Heading>Edit account login</Modal.Heading></Modal.Header><Modal.Body>
        <div className="space-y-3">
          <p className="text-xs leading-5 text-default-500">Change the email or set a new password now. Supabase stores passwords as hashes, so the current password cannot be viewed. Leave the password blank to keep it unchanged.</p>
          {editError && <p role="alert" className="rounded-md bg-danger/10 p-3 text-xs text-danger">{editError}</p>}
          <label className="block space-y-1 text-xs font-medium">Email<input aria-label="New account email" type="email" autoComplete="email" maxLength={254} value={loginDraft.email} onChange={(event) => setLoginDraft((current) => ({ ...current, email: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"/></label>
          <label className="block space-y-1 text-xs font-medium">New password (optional)<input aria-label="New account password" type="password" autoComplete="new-password" minLength={8} maxLength={128} value={loginDraft.password} onChange={(event) => setLoginDraft((current) => ({ ...current, password: event.target.value }))} className="h-10 w-full rounded-md border border-default-200 bg-background px-3 text-sm"/></label>
          <p className="rounded-md bg-warning/10 p-3 text-xs leading-5 text-warning">The new email is confirmed immediately without an email verification step. Share any new password securely with the account holder. You cannot edit your own login here.</p>
        </div>
      </Modal.Body><Modal.Footer><Button variant="outline" isDisabled={editBusy} onPress={() => setEditRow(null)}>Cancel</Button><Button variant="primary" isDisabled={editBusy || !loginDraft.email.trim() || (loginDraft.password.length > 0 && loginDraft.password.length < 8)} onPress={saveLogin}>{editBusy ? "Saving…" : "Save login"}</Button></Modal.Footer></Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
  </>
}
