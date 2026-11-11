import { useState } from "react"
import { useNavigate } from "react-router"
import { AlertTriangle, Download, Trash2 } from "lucide-react"
import { supabase } from "../lib/supabase"
import { reportError, track } from "../lib/telemetry"
import { Mark } from "../brand/Mark"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, DS_BORDER, DS_ERROR, DS_ERROR_SOFT, ACCENT_SOLID, ACCENT_INK } from "../theme"

/* Profile, "Your data": download everything you made as one file, or delete your account and everything in it.
   Files (logo, analysis screenshots, report photos) are removed through the storage service first, because the
   database is not allowed to delete stored files itself; then one database call deletes the account, and with it
   the profile, boards, analyses and reports. */

const BUCKETS = ["brand-logos", "analysis-shots", "report-media"] as const

/** Every file in your own folder of a bucket (folders inside are followed three levels down). */
async function listAll(bucket: string, prefix: string, depth = 0): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; offset < 20000; offset += 100) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 100, offset })
    if (error) throw error
    for (const it of data ?? []) {
      const path = `${prefix}/${it.name}`
      if (it.id === null) { if (depth < 3) out.push(...await listAll(bucket, path, depth + 1)) }
      else out.push(path)
    }
    if (!data || data.length < 100) break
  }
  return out
}

const count = async (table: string, col: string, id: string) => {
  const { count: n, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq(col, id)
  if (error) throw error
  return n ?? 0
}

export function AccountData({ userId, email }: { userId: string | null; email: string }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState<"" | "download" | "delete">("")
  const [msg, setMsg] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState("")
  const [totals, setTotals] = useState<{ boards: number; analyses: number; reports: number } | null>(null)
  const [error, setError] = useState("")

  const download = async () => {
    if (!userId || busy) return
    setBusy("download"); setMsg("")
    try {
      const [p, b, a, r, lf, ls] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("boards").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        supabase.from("analyses").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        supabase.from("reports").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
        (supabase as any).from("library_folders").select("*").eq("user_id", userId),
        (supabase as any).from("library_shots").select("*").eq("user_id", userId),
      ])
      const failed = [p, b, a, r].find(x => x.error)
      if (failed) throw failed.error
      const files: Record<string, string[]> = {}
      for (const bucket of BUCKETS) files[bucket] = await listAll(bucket, userId)
      const out = {
        about: "Everything you made in PitchStudio. Board pictures are inside each board; report and analysis photos are listed under files.",
        exported_at: new Date().toISOString(),
        account: { id: userId, email },
        profile: p.data, boards: b.data ?? [], analyses: a.data ?? [], reports: r.data ?? [],
        library: { folders: lf.error ? [] : lf.data ?? [], shots: ls.error ? [] : ls.data ?? [] }, files,
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }))
      const link = document.createElement("a")
      link.href = url; link.download = `pitchstudio-my-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      track("data_downloaded")
      setMsg("Your data is downloading.")
    } catch (e) {
      reportError(e, "download_data")
      setMsg("Your data couldn't be gathered. Check your connection and try again.")
    } finally { setBusy("") }
  }

  const openConfirm = async () => {
    if (!userId) return
    setConfirming(true); setTyped(""); setError(""); setTotals(null)
    try {
      const [boards, analyses, reports] = await Promise.all([count("boards", "user_id", userId), count("analyses", "user_id", userId), count("reports", "user_id", userId)])
      setTotals({ boards, analyses, reports })
    } catch { /* the totals are only shown for clarity */ }
  }

  const remove = async () => {
    if (!userId || busy || typed.trim() !== "DELETE") return
    setBusy("delete"); setError("")
    try {
      for (const bucket of BUCKETS) {
        const paths = await listAll(bucket, userId)
        for (let i = 0; i < paths.length; i += 100) {
          const { error: e } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
          if (e) throw e
        }
      }
      track("account_deleted")
      const { error: e } = await (supabase as any).rpc("delete_my_account")
      if (e) throw e
      // the goodbye page first: signing out on Profile would send you to the home page instead
      navigate("/goodbye", { replace: true })
      await supabase.auth.signOut({ scope: "local" }).catch(() => { /* the account is already gone */ })
    } catch (e) {
      reportError(e, "delete_account")
      setError("Your account wasn't deleted. Check your connection and try again.")
      setBusy("")
    }
  }

  const s = totals
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <section aria-labelledby="pf-data">
      <p id="pf-data" className="pf-sec" style={{ marginTop: 34 }}>YOUR DATA</p>
      <div className="pf-panel" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Download my data</div>
            <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 3 }}>Your profile, Creator Card, boards, analyses, Library and reports in one file.</div>
          </div>
          <button className="pf-btn" onClick={download} disabled={!userId || !!busy}><Download size={15} /> {busy === "download" ? "Gathering…" : "Download"}</button>
        </div>
        {msg && <p role="status" style={{ margin: 0, fontSize: 13, color: TEXT_MUTED }}>{msg}</p>}
        <div style={{ height: 1, background: DS_BORDER }} />
        {!confirming ? (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 220, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Delete my account</div>
              <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 3 }}>Removes your account and everything you made. This can't be undone.</div>
            </div>
            <button className="pf-btn" onClick={openConfirm} disabled={!userId || !!busy} style={{ color: DS_ERROR, borderColor: DS_ERROR }}><Trash2 size={15} /> Delete account</button>
          </div>
        ) : (
          <div role="region" aria-label="Delete my account" style={{ border: `1px solid ${DS_ERROR}`, background: DS_ERROR_SOFT, borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle size={18} style={{ color: DS_ERROR, flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                <b>This deletes {email ? <span style={{ wordBreak: "break-all" }}>{email}</span> : "your account"} for good.</b>{" "}
                {s ? <>Your profile, Creator Card, {plural(s.boards, "board", "boards")}, {plural(s.analyses, "analysis", "analyses")}, {plural(s.reports, "report", "reports")} and every photo you uploaded go with it.</>
                  : <>Your profile, Creator Card, boards, analyses, reports and every photo you uploaded go with it.</>}
                {" "}Download your data first if you want a copy.
              </div>
            </div>
            <label htmlFor="pf-confirm-delete" className="pf-label" style={{ display: "block", marginTop: 14 }}>Type DELETE to confirm</label>
            <div className="pf-inp" style={{ marginTop: 6 }}>
              <input id="pf-confirm-delete" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                onKeyDown={e => { if (e.key === "Enter") remove(); if (e.key === "Escape") setConfirming(false) }} autoFocus disabled={busy === "delete"} />
            </div>
            {error && <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, color: DS_ERROR }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button className="pf-btn" onClick={remove} disabled={typed.trim() !== "DELETE" || busy === "delete"}
                style={{ background: DS_ERROR, borderColor: DS_ERROR, color: "#ffffff" }}>{busy === "delete" ? "Deleting everything…" : "Delete my account forever"}</button>
              <button className="pf-btn" onClick={() => setConfirming(false)} disabled={busy === "delete"}>Keep my account</button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/** "/goodbye": shown once, right after an account is deleted. */
export function GoodbyePage() {
  const navigate = useNavigate()
  return (
    <div style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, display: "grid", placeItems: "center", padding: 24, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <div style={{ display: "inline-grid", placeItems: "center", width: 64, height: 64, borderRadius: 18, background: SURFACE_1, border: `1px solid ${DS_BORDER}` }}><Mark size={30} color={ACCENT_SOLID} /></div>
        <h1 style={{ fontSize: 30, letterSpacing: "-0.03em", margin: "22px 0 0" }}>Your account is deleted</h1>
        <p style={{ color: TEXT_MUTED, lineHeight: 1.55, fontSize: 15, margin: "12px 0 0" }}>Everything in it is gone: your profile, Creator Card, boards, analyses, reports and photos. You can start again with a new account any time.</p>
        <button onClick={() => navigate("/", { replace: true })} style={{ marginTop: 26, height: 48, padding: "0 26px", borderRadius: 999, border: "none", background: ACCENT_SOLID, color: ACCENT_INK, fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>Back to PitchStudio</button>
      </div>
    </div>
  )
}
