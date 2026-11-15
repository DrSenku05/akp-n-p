"use client"

import { useEffect, useState } from "react"
import { Button, Chip } from "@heroui/react"
import { createClient } from "@/lib/supabase/client"

const groups = [
  { label: "Owner/Admin", role: "Owner/Admin" },
  { label: "Staff", role: "Staff" },
  { label: "Drivers", role: "Delivery Driver" },
  { label: "Customers", role: "Customer" },
]

export default function UserAccountGroups({ rows, busy, onAction }: { rows: string[][]; busy: boolean; onAction: (action: string, row: string[]) => void }) {
  const [selfId, setSelfId] = useState("")
  const [canManage, setCanManage] = useState(false)
  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    void Promise.all([supabase.auth.getUser(), supabase.from("admin_users").select("role,is_active").maybeSingle()]).then(([auth, admin]) => {
      if (!mounted) return
      setSelfId(auth.data.user?.id ?? "")
      setCanManage(admin.data?.role === "owner" && admin.data.is_active)
    })
    return () => { mounted = false }
  }, [])

  return <div className="grid items-start gap-3 md:grid-cols-2">
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
            return <li key={row[0]} className="space-y-3 p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{row[1] || "Unnamed account"}</p><p className="mt-1 break-all text-xs text-default-500">{row[2] || "—"}</p></div>
                <Chip size="sm" variant="soft" color={banned || suspended ? "danger" : status.toLowerCase().includes("online") ? "success" : "default"}>{status}</Chip>
              </div>
              <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                <div className="min-w-0"><dt className="text-default-500">Account ID</dt><dd className="mt-0.5 break-all font-mono">{row[0]?.split(":").slice(1).join(":") || "—"}</dd></div>
                <div><dt className="text-default-500">Phone</dt><dd className="mt-0.5">{row[3] || "—"}</dd></div>
                <div className="sm:col-span-2"><dt className="text-default-500">Last sign in</dt><dd className="mt-0.5">{row[5] || "Never"}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2 border-t border-default-100 pt-3">
                {canManage && actions.map((action) => <Button key={action} size="sm" variant={action === "Delete" || action === "Ban" ? "danger" : action === "Reactivate" || action === "Unban" ? "primary" : "outline"} isDisabled={busy || isSelf} onPress={() => onAction(action, row)}>{action}</Button>)}
                {isSelf && <span className="self-center text-[11px] text-default-500">Your account is protected.</span>}
                {!canManage && !isSelf && <span className="self-center text-[11px] text-default-500">Owner access required.</span>}
              </div>
            </li>
          })}
        </ul>}
      </section>
    })}
  </div>
}
