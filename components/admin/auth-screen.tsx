"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Eye, EyeOff, LockKeyhole } from "lucide-react"
import { Button } from "@heroui/react"
import { createClient } from "@/lib/supabase/client"

type AuthStep = "login" | "forgot-password" | "verify-code" | "reset-password" | "password-updated"

function maskEmail(address: string) {
  const [local = "", domain] = address.split("@")
  if (!domain) return "your email address"
  return `${local.slice(0, Math.min(3, local.length))}${"*".repeat(Math.max(3, local.length - 3))}@${domain}`
}

export default function AuthScreen({ step }: { step: AuthStep }) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [verificationCode, setVerificationCode] = useState(["", "", "", "", "", ""])
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resendSeconds, setResendSeconds] = useState(0)
  const [checkingRecoverySession, setCheckingRecoverySession] = useState(step === "reset-password")
  const go = (path: string) => router.push(path)

  const title = step === "login" ? "Staff / Owner Login" : step === "forgot-password" ? "Forgot Password" : step === "verify-code" ? "Enter Verification Code" : step === "reset-password" ? "Reset Password" : "Password Updated"
  const description = step === "login" ? "Enter your account details to access the administration system." : step === "forgot-password" ? "Enter the email address linked to your admin account. We’ll send a one-time reset code." : step === "verify-code" ? "Enter the six-digit code from your email, or use its secure reset link." : step === "reset-password" ? "Create a new password for your admin account." : "Your admin password has been changed. You can now sign in with your new password."

  useEffect(() => {
    if (step === "verify-code" || step === "reset-password") setEmail(sessionStorage.getItem("akp-admin-recovery-email") ?? "")
    if (step !== "reset-password") return
    let alive = true
    createClient().auth.getSession().then(({ data }) => {
      if (!alive) return
      if (!data.session) router.replace("/forgot-password")
      setCheckingRecoverySession(false)
    }).catch(() => {
      if (!alive) return
      setCheckingRecoverySession(false)
      router.replace("/forgot-password")
    })
    return () => { alive = false }
  }, [router, step])

  useEffect(() => {
    if (resendSeconds <= 0) return
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  async function requestRecoveryCode(address: string) {
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address.trim(), { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` })
    if (resetError) throw resetError
    sessionStorage.setItem("akp-admin-recovery-email", address.trim())
    setEmail(address.trim())
    setResendSeconds(30)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setBusy(true)
    try {
      const supabase = createClient()
      if (step === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (authError || !data.user) throw new Error("Email or password is incorrect.")
        const { data: admin, error: roleError } = await supabase.from("admin_users").select("role, is_active").eq("user_id", data.user.id).maybeSingle()
        if (roleError || !admin?.is_active) {
          await supabase.auth.signOut()
          throw new Error("This account does not have active admin access.")
        }
        if (admin.role !== role) {
          await supabase.auth.signOut()
          throw new Error(`This account is not registered for the ${role === "owner" ? "Owner" : "Staff"} role.`)
        }
        const next = new URLSearchParams(window.location.search).get("next")
        router.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/")
        return
      }
      if (step === "forgot-password") {
        await requestRecoveryCode(email)
        go("/verify-code")
        return
      }
      if (step === "verify-code") {
        const token = verificationCode.join("")
        if (!email || token.length !== 6) throw new Error("Enter the six-digit code from your email.")
        const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: "recovery" })
        if (verifyError) throw new Error("That code is invalid or expired. Request a new reset code and try again.")
        go("/reset-password")
        return
      }
      if (step === "reset-password") {
        if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) throw new Error("Use at least 8 characters, including an uppercase letter and a number.")
        if (newPassword !== confirmPassword) throw new Error("The passwords do not match.")
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
        if (updateError) throw updateError
        sessionStorage.removeItem("akp-admin-recovery-email")
        go("/password-updated")
        return
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete this request. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function resendCode() {
    if (!email || resendSeconds > 0 || busy) return
    setError("")
    setBusy(true)
    try {
      await requestRecoveryCode(email)
      setError("A new code has been requested. Check your inbox.")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send another code right now.")
    } finally {
      setBusy(false)
    }
  }

  if (checkingRecoverySession) return <main className="grid min-h-dvh place-items-center bg-background text-sm text-default-500">Checking password reset session…</main>

  return <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
    <section className="w-full max-w-[520px] rounded-xl border border-default-200 bg-content1 p-6 shadow-[0_20px_60px_rgba(44,40,30,0.12)] sm:p-9">
        <div className="mb-7 flex items-center gap-3 border-b border-default-200 pb-5"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 text-[10px] font-bold tracking-tight text-white shadow-sm" style={{ backgroundImage: "linear-gradient(rgba(26, 24, 20, 0.44), rgba(26, 24, 20, 0.44)), url('/images/banig-badian.jpg')", backgroundPosition: "center", backgroundSize: "cover" }}>AKP</span><div><p className="text-sm font-bold tracking-wide">AKP Native Products</p><p className="mt-0.5 text-[11px] text-default-500">Gawang Pilipino · Administration System</p></div></div>
        {step === "password-updated" ? <div className="flex min-h-[400px] flex-col items-center justify-center text-center"><span className="flex size-14 items-center justify-center rounded-full bg-success/10 text-success"><Check size={26} /></span><h1 className="mt-5 text-xl font-bold">{title}</h1><p className="mt-2 max-w-sm text-sm leading-6 text-default-500">{description}</p><Button className="mt-7 w-full max-w-xs" variant="primary" onPress={() => go("/login")}>Back to Login</Button></div> : <>
          {step !== "login" && <button className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-default-500 hover:text-foreground" onClick={() => go(step === "forgot-password" ? "/login" : step === "verify-code" ? "/forgot-password" : "/verify-code")}><ArrowLeft size={14} />{step === "verify-code" ? "Change email" : step === "reset-password" ? "Verification" : "Back to Login"}</button>}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1><p className="mt-2 text-sm leading-6 text-default-500">{description}</p>
          <form className="mt-7 space-y-4" onSubmit={submit}>
            {step === "login" && <>
              <label className="block space-y-1.5 text-xs font-medium">Role<select required aria-label="Admin role" value={role} onChange={(event) => setRole(event.target.value)} className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 text-sm text-foreground outline-none focus:border-primary"><option value="">Select role...</option><option value="owner">Owner</option><option value="staff">Staff</option></select></label>
              <label className="block space-y-1.5 text-xs font-medium">Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder="Enter your admin email" className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 text-sm text-foreground placeholder:text-default-400 outline-none focus:border-primary" /></label>
              <label className="block space-y-1.5 text-xs font-medium">Password<span className="relative block"><input required value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 pr-10 text-sm text-foreground placeholder:text-default-400 outline-none focus:border-primary" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-default-400">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
              <div className="text-right"><button type="button" onClick={() => go("/forgot-password")} className="text-xs font-medium text-primary">Forgot password?</button></div>
            </>}
            {step === "forgot-password" && <label className="block space-y-1.5 text-xs font-medium">Admin email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Enter your admin email" className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 text-sm text-foreground placeholder:text-default-400 outline-none focus:border-primary" /></label>}
            {step === "verify-code" && <>
              <p className="text-xs text-default-500">A six-digit code was sent to <span className="font-medium text-foreground">{maskEmail(email)}</span>. Enter it below.</p>
              <div className="flex justify-between gap-2">{verificationCode.map((digit, index) => <input key={index} aria-label={`Verification digit ${index + 1}`} inputMode="numeric" pattern="[0-9]*" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={1} value={digit} onChange={(event) => { const nextDigit = event.target.value.replace(/\D/g, "").slice(-1); setError(""); setVerificationCode((current) => current.map((value, currentIndex) => currentIndex === index ? nextDigit : value)); if (nextDigit && index < 5) document.getElementById(`verification-digit-${index + 1}`)?.focus() }} onKeyDown={(event) => { if (event.key === "Backspace" && !digit && index > 0) document.getElementById(`verification-digit-${index - 1}`)?.focus() }} id={`verification-digit-${index}`} className="h-12 w-11 rounded-lg border border-default-200 bg-background text-center text-lg font-semibold text-foreground outline-none focus:border-primary" />)}</div>
              <p className="text-center text-xs text-default-500">Didn’t receive it? <button type="button" disabled={resendSeconds > 0 || busy} onClick={resendCode} className="font-semibold text-primary disabled:text-default-400">{resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend code"}</button></p>
            </>}
            {step === "reset-password" && <><label className="block space-y-1.5 text-xs font-medium">New Password<input required value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setError("") }} minLength={8} type="password" autoComplete="new-password" placeholder="Enter new password" className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 text-sm text-foreground placeholder:text-default-400 outline-none focus:border-primary" /></label><label className="block space-y-1.5 text-xs font-medium">Confirm New Password<input required value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError("") }} minLength={8} type="password" autoComplete="new-password" placeholder="Re-enter new password" className="h-11 w-full rounded-lg border border-default-200 bg-background px-3 text-sm text-foreground placeholder:text-default-400 outline-none focus:border-primary" /></label><div className="flex flex-wrap gap-3 text-[10px] text-default-500"><span className={`flex items-center gap-1 ${newPassword.length >= 8 ? "text-success" : ""}`}><Check size={12} />8+ chars</span><span className={`flex items-center gap-1 ${/[A-Z]/.test(newPassword) ? "text-success" : ""}`}><Check size={12} />Uppercase</span><span className={`flex items-center gap-1 ${/\d/.test(newPassword) ? "text-success" : ""}`}><Check size={12} />Number</span></div></>}
            {error && <p role="status" className={`rounded-lg px-3 py-2 text-xs ${step === "forgot-password" && error.startsWith("If the address") || step === "verify-code" && error.startsWith("A new code") ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{error}</p>}
            <Button type="submit" className="w-full" variant="primary" isDisabled={busy}>{busy ? "Please wait…" : step === "login" ? "Log In" : step === "forgot-password" ? "Send Reset Code" : step === "verify-code" ? "Verify Code" : "Set New Password"}</Button>
          </form>
        </>}
        <div className="mt-8 flex items-start gap-2 border-t border-default-100 pt-4 text-[10px] leading-4 text-default-400"><LockKeyhole size={13} className="mt-0.5 shrink-0" />Unauthorized access is prohibited. Contact system administrator for account issues.</div>
    </section>
  </main>
}
