import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, LogOut, Dices, Download, Upload, Check } from "lucide-react"
import { getFontEmbedCSS, toPng } from "html-to-image"
import { supabase } from "../lib/supabase"
import { IDENTITY_OPTIONS, normalizeHandle, stripHandleSuffix } from "../lib/account"
import { WORLD_COUNTRIES } from "../lib/countries"
import { Mark } from "../brand/Mark"
import { CreatorCard } from "../brand/CardArt"
import { CreatorSeal } from "../brand/Signature"
import { CREST_IDS, CREST_LABELS, CrestIcon } from "../brand/crests"
import { COLOURS, DEFAULT_BRAND, LOGO_BUCKET, LOGO_PREFIX, MOTTO_MAX, PACKS, SKINS, SKIN_LABELS, TITLES, TITLE_MAX, brandForSave, cardColours, logoToDataUrl, readBrand, squareLogo, type Brand } from "../brand/brand"
import { useTheme, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_ERROR, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT, ACCENT_SOFT } from "../theme"

/* Creator Profile ("/profile"): your Creator Card (your brand, which signs every export), who you are in the studio, and how the app looks. */

const STEPS = ["Start", "Colours", "Crest", "Name", "You"] as const
type Step = (typeof STEPS)[number]
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { choice, setChoice } = useTheme()
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [since, setSince] = useState("")
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
  // the Creator Card
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [hadBrand, setHadBrand] = useState(false)          // has a card been saved before?
  const [touched, setTouched] = useState(false)             // has the card been changed on this page?
  const [savedLogo, setSavedLogo] = useState<string | null>(null) // the logo address in the database
  const [logoData, setLogoData] = useState<string | null>(null)   // the saved logo as a data address (cards and exports)
  const [pending, setPending] = useState<{ blob: Blob; data: string } | null>(null) // a new logo, uploaded when you save
  const [logoMsg, setLogoMsg] = useState("")
  const [step, setStep] = useState<Step>("Start")
  const [seen, setSeen] = useState<Step[]>(["Start"])
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedSnap = useRef("")

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/"); return }
      setUserId(session.user.id)
      setEmail(session.user.email ?? "")
      const made = new Date(session.user.created_at)
      setSince(Number.isNaN(made.getTime()) ? "" : String(made.getFullYear()))
      const { data } = await supabase
        .from("profiles")
        .select("display_name, handle, bio, country, favorite_club, favorite_player, identity, brand")
        .eq("id", session.user.id)
        .maybeSingle()
      if (data) {
        const d = data as any
        setDisplayName(d.display_name ?? "")
        setHandle(d.handle ?? "")
        setBio(d.bio ?? "")
        setCountry(d.country ?? "")
        setFavoriteClub(d.favorite_club ?? "")
        setFavoritePlayer(d.favorite_player ?? "")
        setIdentity(d.identity ?? "")
        if (d.brand) { const b = readBrand(d.brand); setBrand(b); setHadBrand(true); setSavedLogo(b.logo) }
      }
      setLoaded(true)
    })
  }, [])

  // The saved logo, as a data address
  useEffect(() => {
    let off = false
    if (!savedLogo) { setLogoData(null); return }
    logoToDataUrl(savedLogo).then(d => { if (!off) setLogoData(d) })
    return () => { off = true }
  }, [savedLogo])

  // What is on the page right now, to know if there is anything to save
  const snap = JSON.stringify([displayName, handle, bio, country, favoriteClub, favoritePlayer, identity, brand, !!pending])
  useEffect(() => { if (loaded && !savedSnap.current) savedSnap.current = snap }, [loaded])
  const dirty = loaded && savedSnap.current !== "" && snap !== savedSnap.current

  const edit = (patch: Partial<Brand>) => { setBrand(b => ({ ...b, ...patch })); setTouched(true); setSaveMsg(null) }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true); setHandleError(""); setSaveMsg(null)
    const cleanHandle = normalizeHandle(handle)
    setHandle(cleanHandle)
    if (cleanHandle.length < 3) { setHandleError("Use at least 3 letters, numbers or underscores."); setSaving(false); go("Name"); return }
    let next = brand
    if (pending) {
      const path = `${userId}/logo-${Date.now()}.png`
      const up = await supabase.storage.from(LOGO_BUCKET).upload(path, pending.blob, { contentType: "image/png", cacheControl: "31536000" })
      if (up.error) { setSaving(false); setSaveMsg("error"); setLogoMsg("The logo didn't upload. Try again."); return }
      next = { ...brand, logo: supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl }
    }
    const sendBrand = touched || !!pending
    const { error } = await supabase.from("profiles").update({
      display_name: displayName, handle: cleanHandle, bio, country,
      favorite_club: favoriteClub, favorite_player: favoritePlayer, identity: identity || null,
      ...(sendBrand ? { brand: brandForSave(next) } : {}),
    }).eq("id", userId)
    setSaving(false)
    if (error) {
      if ((error as any).code === "23505") { setHandleError("That handle's already taken. Try another."); go("Name") }
      else { setSaveMsg("error"); setTimeout(() => setSaveMsg(null), 3000) }
      return
    }
    // The old logo file is no longer used
    if (sendBrand && savedLogo && savedLogo !== next.logo && savedLogo.startsWith(LOGO_PREFIX)) {
      const old = savedLogo.slice(LOGO_PREFIX.length)
      if (old.startsWith(userId + "/")) supabase.storage.from(LOGO_BUCKET).remove([old]).catch(() => {})
    }
    if (sendBrand) {
      if (pending) setLogoData(pending.data)
      setBrand(next); setSavedLogo(next.logo); setPending(null); setHadBrand(true); setTouched(false)
    }
    savedSnap.current = JSON.stringify([displayName, cleanHandle, bio, country, favoriteClub, favoritePlayer, identity, next, false])
    setSaveMsg("saved")
    ;(window as any).posthog?.capture("profile_updated", sendBrand ? { card: true } : undefined)
    setTimeout(() => setSaveMsg(null), 2000)
  }

  const signOut = async () => { await supabase.auth.signOut(); navigate("/") }

  const pickLogo = async (file: File | undefined) => {
    setLogoMsg("")
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setLogoMsg("Pick a PNG, JPG or WebP picture under 5 MB."); return }
    try {
      const blob = await squareLogo(file)
      const data = await new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error("read")); fr.readAsDataURL(blob) })
      setPending({ blob, data }); setTouched(true); setSaveMsg(null)
    } catch { setLogoMsg("That picture couldn't be opened. Try another one.") }
  }
  const removeLogo = () => { setPending(null); edit({ logo: null }); setLogoMsg("") }

  const surprise = () => {
    edit({ color: pick(COLOURS), crest: pick(CREST_IDS), title: pick(TITLES) }) // a chosen logo stays; the crest behind it changes
  }

  const downloadCard = async () => {
    if (!cardRef.current || downloading) return
    setDownloading(true)
    try {
      const fontEmbedCSS = await getFontEmbedCSS(document.body).catch(() => "")
      const url = await toPng(cardRef.current, { pixelRatio: 3, fontEmbedCSS, width: 330, height: 470, style: { width: "330px", height: "470px", transform: "none" } }) // always the same size, wherever it is on the page
      const a = document.createElement("a"); a.href = url; a.download = `${normalizeHandle(handle) || "creator"}-card.png`; a.click()
      ;(window as any).posthog?.capture("creator_card_downloaded")
    } catch (e) { console.error(e); setSaveMsg("error"); setTimeout(() => setSaveMsg(null), 3000) }
    setDownloading(false)
  }

  const go = (s: Step) => { setStep(s); setSeen(v => (v.includes(s) ? v : [...v, s])) }

  if (!loaded) return <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE }} />

  const strippedName = handle ? stripHandleSuffix(handle, userId, email) : ""
  const name = displayName.trim() || strippedName || "You"
  const chosen = handle && strippedName === handle ? normalizeHandle(handle) : "" // only a handle you picked yourself signs exports
  const idLabel = IDENTITY_OPTIONS.find(o => o.value === identity)?.label
  const shownLogo = pending ? pending.data : brand.logo ? logoData : null
  const cc = cardColours(brand)
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
  const seg = (label: string, value: boolean, onText: string, offText: string, set: (v: boolean) => void) => (
    <div className="pf-seg" role="group" aria-label={label}>
      <button className={value ? "on" : ""} aria-pressed={value} onClick={() => set(true)}>{onText}</button>
      <button className={!value ? "on" : ""} aria-pressed={!value} onClick={() => set(false)}>{offText}</button>
    </div>
  )
  const next = STEPS[STEPS.indexOf(step) + 1]

  return (
    <div className="pf" style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .pf * { box-sizing: border-box; }
        .pf-top { height: 60px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${DS_BORDER}; padding: 0 32px; }
        .pf-back { display: inline-flex; align-items: center; gap: 6px; background: none; border: none; color: ${TEXT_MUTED}; font-size: 14px; cursor: pointer; font-family: inherit; padding: 6px 0; }
        .pf-back:hover { color: ${TEXT_PRIMARY}; }
        .pf-wrap { max-width: 1080px; margin: 0 auto; padding: 40px 32px 130px; display: grid; grid-template-columns: 340px 1fr; gap: 44px; }
        .pf-left { align-self: start; position: sticky; top: 24px; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .pf-tilt { perspective: 900px; }
        .pf-cardwrap { transform: rotateY(-8deg) rotateX(3deg); transition: transform .25s ease; filter: drop-shadow(0 22px 34px rgba(0,0,0,.35)); }
        .pf-cardwrap:hover { transform: rotateY(0) rotateX(0); }
        @media (prefers-reduced-motion: reduce) { .pf-cardwrap { transition: none; } }
        .pf-cardbox { border-radius: 22px; overflow: hidden; }
        .pf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 44px; padding: 0 20px; border-radius: 999px; font-weight: 600; font-size: 14px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; cursor: pointer; font-family: inherit; }
        .pf-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
        .pf-btn:disabled { opacity: .55; cursor: default; }
        .pf-panel { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 16px; padding: 18px; }
        .pf-pitch { height: 74px; border-radius: 8px; border: 1.5px solid rgba(255,255,255,.5); background: repeating-linear-gradient(90deg,#1f6a31 0 26px,#1a5c2a 26px 52px); overflow: hidden; }
        .pf-cap { font-size: 11px; letter-spacing: .12em; font-weight: 600; color: ${TEXT_MUTED}; margin: 0 0 10px; }
        .pf-sec { margin: 0 0 14px; font-size: 12px; letter-spacing: .12em; font-weight: 600; color: ${TEXT_MUTED}; }
        .pf-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .pf-g3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .pf-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .pf-label { font-size: 12px; color: ${TEXT_MUTED}; }
        .pf-inp { display: flex; align-items: center; gap: 6px; height: 48px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 12px; padding: 0 14px; transition: border-color .12s, box-shadow .12s; }
        .pf-panel .pf-inp { background: ${SURFACE_2}; }
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
        .pf-panel .pf-seg { background: ${SURFACE_BASE}; }
        .pf-out { display: inline-flex; align-items: center; gap: 8px; background: none; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; border-radius: 10px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-family: inherit; width: 100%; justify-content: center; }
        .cc-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 0 0 14px; }
        .cc-step { text-align: left; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; padding: 10px 12px; cursor: pointer; font-family: inherit; color: ${TEXT_MUTED}; font-size: 11px; }
        .cc-step b { display: flex; align-items: center; gap: 6px; color: ${TEXT_PRIMARY}; font-size: 14px; margin-top: 2px; font-weight: 600; }
        .cc-step.on { border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 3px ${ACCENT_SOFT}; }
        .cc-packs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .cc-pack { border-radius: 12px; border: 1px solid ${DS_BORDER}; padding: 12px; height: 88px; text-align: left; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; justify-content: flex-end; }
        .cc-pack b { font-size: 14px; } .cc-pack span { font-size: 12px; opacity: .85; }
        .cc-pack.on, .cc-sw.on, .cc-cr.on, .cc-skin.on { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .cc-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .cc-sw, .cc-skin { width: 36px; height: 36px; border-radius: 50%; border: 2px solid rgba(128,128,128,.35); cursor: pointer; padding: 0; }
        .cc-cr { width: 52px; height: 52px; border-radius: 12px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; display: grid; place-items: center; cursor: pointer; color: ${TEXT_PRIMARY}; }
        .cc-color { width: 36px; height: 36px; padding: 0; border: 2px solid rgba(128,128,128,.35); border-radius: 50%; background: none; cursor: pointer; }
        .pf-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; background: ${SURFACE_BASE}; border-top: 1px solid ${DS_BORDER}; }
        .pf-bar > div { max-width: 1080px; margin: 0 auto; padding: 12px 32px; display: flex; align-items: center; justify-content: flex-end; gap: 16px; }
        .pf-save { height: 46px; padding: 0 28px; border-radius: 999px; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font-weight: 600; font-size: 15px; border: none; cursor: pointer; font-family: inherit; }
        .pf-save:disabled { opacity: .5; cursor: default; }
        @media (max-width: 860px) {
          .pf-top { padding: 0 16px; }
          .pf-wrap { grid-template-columns: 1fr; gap: 24px; padding: 20px 20px 130px; }
          .pf-left { display: contents; }
          .pf-left > * { width: 100%; max-width: 340px; justify-self: center; }
          .pf-left > :nth-child(1) { order: 1; } .pf-left > :nth-child(2) { order: 2; } .pf-left > :nth-child(3) { order: 3; } .pf-left > :nth-child(4) { order: 5; max-width: none; }
          .pf-wrap > main { order: 4; }
          .pf-cardwrap { transform: none; }
          .pf-g2, .pf-g3 { grid-template-columns: 1fr; }
          .cc-steps { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
          .cc-step { padding: 8px 6px; } .cc-step span { display: none; } .cc-step b { font-size: 12px; justify-content: center; }
          .cc-packs { grid-template-columns: 1fr 1fr; }
          .pf-bar > div { padding: 10px 16px; }
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
        <aside className="pf-left">
          <div className="pf-tilt" data-card="preview">
            <div className="pf-cardwrap">
              <div ref={cardRef} className="pf-cardbox">
                <CreatorCard brand={brand} handle={chosen} name={name} since={since} logo={shownLogo} unfinished={!hadBrand} />
              </div>
            </div>
          </div>
          <button className="pf-btn pri" onClick={downloadCard} disabled={downloading}><Download size={16} /> {downloading ? "Making your card…" : "Download my card"}</button>
          <div className="pf-panel">
            <p className="pf-cap">YOUR EXPORT SIGNATURE</p>
            <div className="pf-pitch" data-card="signature">
              <svg viewBox="0 0 300 74" width="100%" height="100%" preserveAspectRatio="xMaxYMax meet" aria-label="Your signature on an export">
                <g transform="translate(298 76)"><CreatorSeal brand={brand} handle={chosen} logo={shownLogo} pill="rgba(0,0,0,0.62)" /></g>
              </svg>
            </div>
            <p style={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5, margin: "10px 0 0" }}>
              Signs every image, GIF and video you export.{!chosen ? " Choose your own handle to put your name on it." : ""}
            </p>
          </div>
          <div className="pf-panel">
            <p className="pf-cap">APPEARANCE</p>
            <div className="pf-seg" role="group" aria-label="Appearance">
              {(["auto", "night", "day"] as const).map(c => (
                <button key={c} className={choice === c ? "on" : ""} aria-pressed={choice === c} onClick={() => setChoice(c)}>{c === "auto" ? "Auto" : c === "night" ? "Night" : "Day"}</button>
              ))}
            </div>
            <div style={{ height: 1, background: DS_BORDER, margin: "16px 0" }} />
            <button className="pf-out" onClick={signOut}><LogOut size={14} /> Sign out</button>
          </div>
        </aside>

        <main style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, margin: "0 0 4px" }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>Build your Creator Card</h1>
            <button className="pf-btn pri" onClick={surprise} style={{ height: 40 }}><Dices size={16} /> Surprise me</button>
          </div>
          <p style={{ margin: "0 0 20px", fontSize: 14, color: TEXT_MUTED, lineHeight: 1.5 }}>
            {hadBrand ? "Your identity in the studio. It signs every export." : "You start with a starter card. Change anything, then save: it signs every export you make."}
          </p>

          <div className="cc-steps" role="tablist" aria-label="Card steps">
            {STEPS.map((s, i) => (
              <button key={s} role="tab" aria-selected={step === s} className={`cc-step${step === s ? " on" : ""}`} onClick={() => go(s)}>
                <span>{i + 1}</span>
                <b>{s}{seen.includes(s) && step !== s ? <Check size={13} color={ACCENT_TEXT} aria-label="seen" /> : null}</b>
              </button>
            ))}
          </div>

          <div className="pf-panel" role="tabpanel" aria-label={step}>
            {step === "Start" && (<>
              <p className="pf-cap">START FROM A PACK, OR SKIP</p>
              <div className="cc-packs">
                {PACKS.map(p => {
                  const c = cardColours({ ...brand, color: p.color })
                  const on = brand.color === p.color && brand.crest === p.crest && brand.title === p.title
                  return (
                    <button key={p.id} className={`cc-pack${on ? " on" : ""}`} aria-pressed={on} onClick={() => edit({ color: p.color, crest: p.crest, title: p.title })}
                      style={{ background: `linear-gradient(160deg, ${c.top}, ${c.bottom})`, color: c.text }}>
                      <b>{p.title}</b><span>{p.note}</span>
                    </button>
                  )
                })}
              </div>
            </>)}

            {step === "Colours" && (<>
              <p className="pf-cap">CARD COLOUR</p>
              <div className="cc-row">
                {COLOURS.map(c => <button key={c} className={`cc-sw${brand.color === c ? " on" : ""}`} aria-label={`Colour ${c}`} aria-pressed={brand.color === c} style={{ background: c }} onClick={() => edit({ color: c })} />)}
                <input type="color" className="cc-color" aria-label="Pick any colour" value={brand.color} onChange={e => edit({ color: e.target.value.toLowerCase() })} />
              </div>
            </>)}

            {step === "Crest" && (<>
              <p className="pf-cap">CREST</p>
              <div className="cc-row">
                {CREST_IDS.map(id => <button key={id} className={`cc-cr${!shownLogo && brand.crest === id ? " on" : ""}`} aria-label={CREST_LABELS[id]} aria-pressed={!shownLogo && brand.crest === id} onClick={() => { setPending(null); edit({ crest: id, logo: null }); setLogoMsg("") }}><CrestIcon id={id} size={26} /></button>)}
              </div>
              <div className="cc-row" style={{ marginTop: 16 }}>
                <input ref={fileRef} id="logoFile" type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = "" }} />
                <button className="pf-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload your own logo</button>
                {shownLogo && <button className="pf-btn" onClick={removeLogo}>Remove logo</button>}
              </div>
              {logoMsg ? <p className="pf-err" style={{ margin: "8px 0 0" }}>{logoMsg}</p> : <p className="pf-hint" style={{ margin: "8px 0 0" }}>PNG, JPG or WebP. We crop it square.</p>}
            </>)}

            {step === "Name" && (
              <div style={{ display: "grid", gap: 14 }}>
                {field("handle", "Tagname (your handle)", handle, setHandle, { prefix: "@", max: 30, err: handleError })}
                {field("motto", "Motto (one line under your name)", brand.motto, v => edit({ motto: v }), { max: MOTTO_MAX, hint: `${brand.motto.length}/${MOTTO_MAX}` })}
                {field("cardTitle", "Title (the line at the bottom of your card)", brand.title, v => edit({ title: v }), { max: TITLE_MAX })}
              </div>
            )}

            {step === "You" && (<>
              <p className="pf-cap">FACE</p>
              <div className="cc-row">
                {SKINS.map((s, i) => <button key={s} className={`cc-skin${brand.skin === s ? " on" : ""}`} aria-label={SKIN_LABELS[i]} aria-pressed={brand.skin === s} style={{ background: s }} onClick={() => edit({ skin: s })} />)}
              </div>
              <p className="pf-cap" style={{ marginTop: 18 }}>HAIR</p>
              {seg("Hair", brand.hair, "Spiky punk", "No hair", v => edit({ hair: v }))}
              <p className="pf-cap" style={{ marginTop: 18 }}>“PITCHSTUDIO” ON YOUR EXPORTS</p>
              {seg("PitchStudio on exports", brand.madeWith, "On", "Off", v => edit({ madeWith: v }))}
              <p className="pf-hint" style={{ margin: "8px 0 0" }}>Your crest and handle always sign your exports. This is the small “PITCHSTUDIO” next to them.</p>
            </>)}

            {next && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><button className="pf-btn" onClick={() => go(next)}>Next: {next}</button></div>}
          </div>

          <p className="pf-sec" style={{ marginTop: 40 }}>ACCOUNT</p>
          <div className="pf-g2">
            {field("displayName", "Display name", displayName, setDisplayName)}
            <div className="pf-field"><span className="pf-label">Handle</span><div style={{ fontSize: 14, color: TEXT_MUTED, lineHeight: "48px" }}>{handle ? `@${handle}` : "No handle yet"}{idLabel ? ` · ${idLabel}` : ""} <span style={{ fontSize: 12 }}>(change it in the Name step)</span></div></div>
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
        </main>
      </div>

      <div className="pf-bar" aria-live="polite">
        <div>
          {saveMsg === "saved" ? <span style={{ fontSize: 14, color: ACCENT_TEXT, fontWeight: 500 }}>Saved</span>
            : saveMsg === "error" ? <span style={{ fontSize: 14, color: DS_ERROR }}>Something went wrong. Try again.</span>
            : dirty ? <span style={{ fontSize: 14, color: TEXT_MUTED }}>You have unsaved changes</span> : null}
          <button className="pf-save" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  )
}
