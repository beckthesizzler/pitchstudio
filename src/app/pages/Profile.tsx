import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, LogOut } from "lucide-react"
import { supabase } from "../lib/supabase"
import { IDENTITY_OPTIONS, normalizeHandle } from "../lib/account"
import { WORLD_COUNTRIES } from "../lib/countries"
import { Mark } from "../brand/Mark"
import { useTheme, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_ERROR, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT, ACCENT_SOFT, PS_VOLT } from "../theme"

/* Creator Profile ("/profile"): who you are in the studio, how your exports are signed, and how the app looks. */

export default function ProfilePage() {
  const navigate = useNavigate()
  const { choice, setChoice } = useTheme()
  const [userId, setUserId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [displayName, setDisplayName] = useState("")
  const [handle, setHandle] = useState("")
  const [bio, setBio] = useState("")
  const [country, setCountry] = useState("")
  const [favoriteClub, setFavoriteClub] = useState("")
  const [favoritePlayer, setFavoritePlayer] = useState("")
  const [identity, setIdentity] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<"saved" | "error" | null>(null)
  const [handleError, setHandleError] = useState("")

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/"); return }
      setUserId(session.user.id)
      const { data } = await supabase
        .from("profiles")
        .select("display_name, handle, bio, country, favorite_club, favorite_player, identity")
        .eq("id", session.user.id)
        .maybeSingle()
      if (data) {
        setDisplayName((data as any).display_name ?? "")
        setHandle((data as any).handle ?? "")
        setBio((data as any).bio ?? "")
        setCountry((data as any).country ?? "")
        setFavoriteClub((data as any).favorite_club ?? "")
        setFavoritePlayer((data as any).favorite_player ?? "")
        setIdentity((data as any).identity ?? "")
      }
      setLoaded(true)
    })
  }, [])

  const handleSave = async () => {
    if (!userId) return
    setSaving(true); setHandleError(""); setSaveMsg(null)
    const cleanHandle = normalizeHandle(handle)
    setHandle(cleanHandle)
    if (cleanHandle.length < 3) { setHandleError("Use at least 3 letters, numbers or underscores."); setSaving(false); return }
    const { error } = await supabase.from("profiles").update({
      display_name: displayName, handle: cleanHandle, bio, country,
      favorite_club: favoriteClub, favorite_player: favoritePlayer, identity: identity || null,
    }).eq("id", userId)
    setSaving(false)
    if (error) {
      if ((error as any).code === "23505") setHandleError("That handle's already taken. Try another.")
      else { setSaveMsg("error"); setTimeout(() => setSaveMsg(null), 3000) }
    } else {
      setSaveMsg("saved")
      ;(window as any).posthog?.capture("profile_updated")
      setTimeout(() => setSaveMsg(null), 2000)
    }
  }

  const signOut = async () => { await supabase.auth.signOut(); navigate("/") }

  if (!loaded) return <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE }} />

  const name = displayName.trim() || handle || "You"
  const idLabel = IDENTITY_OPTIONS.find(o => o.value === identity)?.label
  const field = (id: string, label: string, value: string, set: (v: string) => void, extra?: { prefix?: string; max?: number; err?: string; rows?: number; hint?: string }) => (
    <div className="pf-field">
      <label htmlFor={id} className="pf-label">{label}</label>
      <div className={`pf-inp${extra?.err ? " bad" : ""}`} style={extra?.rows ? { height: "auto", alignItems: "flex-start", padding: "12px 14px" } : undefined}>
        {extra?.prefix && <span style={{ color: TEXT_MUTED }}>{extra.prefix}</span>}
        {extra?.rows
          ? <textarea id={id} value={value} rows={extra.rows} maxLength={extra.max} onChange={e => set(e.target.value)} style={{ resize: "none", lineHeight: 1.5 }} />
          : <input id={id} type="text" value={value} maxLength={extra?.max} onChange={e => { set(e.target.value); if (id === "handle") setHandleError("") }} />}
      </div>
      {extra?.err ? <span className="pf-err">{extra.err}</span> : extra?.hint ? <span className="pf-hint">{extra.hint}</span> : null}
    </div>
  )

  return (
    <div className="pf" style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .pf * { box-sizing: border-box; }
        .pf-top { height: 60px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${DS_BORDER}; padding: 0 32px; }
        .pf-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: ${TEXT_MUTED}; font-size: 14px; cursor: pointer; font-family: inherit; padding: 6px 0; }
        .pf-back:hover { color: ${TEXT_PRIMARY}; }
        .pf-wrap { max-width: 1040px; margin: 0 auto; padding: 44px 32px 90px; display: grid; grid-template-columns: 320px 1fr; gap: 40px; }
        .pf-card { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 20px; padding: 26px; align-self: start; }
        .pf-av { width: 72px; height: 72px; border-radius: 50%; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; display: grid; place-items: center; font-size: 30px; font-weight: 700; }
        .pf-pill { display: inline-flex; align-items: center; gap: 8px; background: rgba(0,0,0,.6); border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 6px 12px 6px 6px; color: #fff; font-weight: 700; font-size: 12px; letter-spacing: .06em; font-family: 'Barlow Condensed', 'Inter', sans-serif; }
        .pf-pill i { width: 22px; height: 22px; border-radius: 50%; background: ${PS_VOLT}; color: #0a0c0f; display: grid; place-items: center; font-size: 10px; font-style: normal; }
        .pf-cap { font-size: 11px; letter-spacing: .12em; font-weight: 600; color: ${TEXT_MUTED}; margin: 0 0 12px; }
        .pf-sec { margin: 0 0 14px; font-size: 12px; letter-spacing: .12em; font-weight: 600; color: ${TEXT_MUTED}; }
        .pf-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .pf-g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .pf-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pf-label { font-size: 12px; color: ${TEXT_MUTED}; }
        .pf-inp { display: flex; align-items: center; gap: 6px; height: 48px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 12px; padding: 0 14px; transition: border-color .12s, box-shadow .12s; }
        .pf-inp:focus-within { border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 4px ${ACCENT_SOFT}; }
        .pf-inp.bad { border-color: ${DS_ERROR}; }
        .pf-inp input, .pf-inp textarea, .pf-inp select { flex: 1; min-width: 0; width: 100%; background: transparent; border: none; outline: none; color: ${TEXT_PRIMARY}; font-size: 15px; font-family: inherit; height: 100%; }
        .pf-inp select option { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; }
        .pf-err { font-size: 12px; color: ${DS_ERROR}; } .pf-hint { font-size: 11px; color: ${TEXT_MUTED}; }
        .pf-chip { padding: 9px 16px; border-radius: 999px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-size: 14px; cursor: pointer; font-family: inherit; margin: 0 8px 8px 0; }
        .pf-chip.on { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; font-weight: 600; }
        .pf-seg { display: inline-flex; background: ${SURFACE_2}; border-radius: 10px; padding: 3px; gap: 2px; }
        .pf-seg button { border: none; background: none; color: ${TEXT_MUTED}; font-size: 13px; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-family: inherit; }
        .pf-seg button.on { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .pf-save { height: 46px; padding: 0 28px; border-radius: 999px; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font-weight: 600; font-size: 15px; border: none; cursor: pointer; font-family: inherit; }
        .pf-save:disabled { opacity: .5; cursor: default; }
        .pf-out { display: inline-flex; align-items: center; gap: 8px; background: none; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; border-radius: 10px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-family: inherit; width: 100%; justify-content: center; }
        @media (max-width: 860px) {
          .pf-top { padding: 0 16px; }
          .pf-wrap { grid-template-columns: 1fr; gap: 24px; padding: 24px 20px 90px; }
          .pf-g2, .pf-g3 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="pf-top">
        <button className="pf-back" onClick={() => navigate("/")}><ArrowLeft size={16} /> Home</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mark size={26} color={ACCENT_SOLID} />
          <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, letterSpacing: "0.2em", fontWeight: 600 }}>PITCHSTUDIO</span>
        </div>
      </div>

      <div className="pf-wrap">
        <aside className="pf-card">
          <div className="pf-av">{name.charAt(0).toUpperCase()}</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16, letterSpacing: "-0.02em", wordBreak: "break-word" }}>{name}</div>
          <div style={{ color: TEXT_MUTED, fontSize: 14, marginTop: 4 }}>{handle ? `@${handle}` : "No handle yet"}{idLabel ? ` · ${idLabel}` : ""}</div>
          <div style={{ height: 1, background: DS_BORDER, margin: "20px 0" }} />
          <p className="pf-cap">YOUR EXPORT SIGNATURE</p>
          <span className="pf-pill"><i>PS</i>@{(handle || "you").toUpperCase()}  PITCHSTUDIO</span>
          <p style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5, margin: "10px 0 0" }}>Appears on every image, GIF and video you export.</p>
          <div style={{ height: 1, background: DS_BORDER, margin: "20px 0" }} />
          <p className="pf-cap">APPEARANCE</p>
          <div className="pf-seg" role="group" aria-label="Appearance">
            {(["auto", "night", "day"] as const).map(c => (
              <button key={c} className={choice === c ? "on" : ""} aria-pressed={choice === c} onClick={() => setChoice(c)}>{c === "auto" ? "Auto" : c === "night" ? "Night" : "Day"}</button>
            ))}
          </div>
          <div style={{ height: 1, background: DS_BORDER, margin: "20px 0" }} />
          <button className="pf-out" onClick={signOut}><LogOut size={14} /> Sign out</button>
        </aside>

        <main>
          <h1 style={{ margin: "0 0 4px", fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>Creator Profile</h1>
          <p style={{ margin: "0 0 28px", fontSize: 14, color: TEXT_MUTED }}>How you show up in the studio.</p>

          <p className="pf-sec">IDENTITY</p>
          <div className="pf-g2">
            {field("displayName", "Display name", displayName, setDisplayName)}
            {field("handle", "Handle", handle, setHandle, { prefix: "@", max: 30, err: handleError })}
          </div>
          <div style={{ marginTop: 14 }}>{field("bio", "Bio", bio, setBio, { rows: 3, max: 160, hint: `${bio.length}/160` })}</div>

          <p className="pf-sec" style={{ marginTop: 34 }}>FOOTBALL</p>
          <div className="pf-g3">
            <div className="pf-field">
              <label htmlFor="country" className="pf-label">Country</label>
              <div className="pf-inp">
                <select id="country" value={country} onChange={e => setCountry(e.target.value)}>
                  <option value="">Select country</option>
                  {WORLD_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {field("favoriteClub", "Favourite club", favoriteClub, setFavoriteClub)}
            {field("favoritePlayer", "Favourite player", favoritePlayer, setFavoritePlayer)}
          </div>

          <p className="pf-sec" style={{ marginTop: 34 }}>YOU ARE A</p>
          <div>
            {IDENTITY_OPTIONS.map(o => {
              const active = identity === o.value
              return <button key={o.value} className={`pf-chip${active ? " on" : ""}`} aria-pressed={active} onClick={() => setIdentity(active ? "" : o.value)}>{o.label}</button>
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16, marginTop: 30 }}>
            {saveMsg === "saved" && <span style={{ fontSize: 14, color: ACCENT_TEXT, fontWeight: 500 }}>Saved</span>}
            {saveMsg === "error" && <span style={{ fontSize: 14, color: DS_ERROR }}>Something went wrong. Try again.</span>}
            <button className="pf-save" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </main>
      </div>
    </div>
  )
}
