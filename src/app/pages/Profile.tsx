import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { ArrowLeft, LogOut, Dices, Download, Upload, ChevronDown, Copy, Instagram, Linkedin, ImagePlus, Trash2 } from "lucide-react"
import { getFontEmbedCSS, toPng } from "html-to-image"
import { supabase } from "../lib/supabase"
import { IDENTITY_OPTIONS, normalizeHandle, stripHandleSuffix } from "../lib/account"
import { WORLD_COUNTRIES } from "../lib/countries"
import { AccountData } from "./AccountData"
import { Mark } from "../brand/Mark"
import { CreatorCard } from "../brand/CardArt"
import { CreatorSeal } from "../brand/Signature"
import { CREST_IDS, CREST_LABELS, CrestIcon } from "../brand/crests"
import { CARD_STYLES, COLOURS, DEFAULT_BRAND, DEFAULT_POS, LOGO_BUCKET, LOGO_PREFIX, MOTTO_MAX, PACKS, SKINS, SKIN_LABELS, TITLES, TITLE_MAX, brandForSave, cardColours, logoToDataUrl, readBrand, shrinkPhoto, squareLogo, type Brand } from "../brand/brand"
import { openStudio, sinceLabel, studioLabel } from "../lib/studio"

const SITE = "https://pitchstudio-brown.vercel.app"
const postFor = (studio: number | null, handle: string) =>
  `Proud new member of PitchStudio. Studio ${studio ? studioLabel(studio) : "Nº —"} is open: boards, reports and ideas, all in one place. ${SITE}/c/${handle || "you"}`
/** A picture of the card on the studio's dark background, w by h, the card centred at cw wide */
async function cardOnBackground(card: string, w: number, h: number, cw: number, handle: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("card")); i.src = card })
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h
  const g = cv.getContext("2d")!
  const bg = g.createRadialGradient(w / 2, h * 0.42, 40, w / 2, h / 2, h * 0.7); bg.addColorStop(0, "#1e2229"); bg.addColorStop(1, "#08090b")
  g.fillStyle = bg; g.fillRect(0, 0, w, h)
  const ch = cw * (470 / 330), x = (w - cw) / 2, y = (h - ch) / 2 - (h > w * 1.5 ? 60 : 0)
  g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 60; g.shadowOffsetY = 24
  g.drawImage(img, x, y, cw, ch)
  g.shadowColor = "transparent"
  g.fillStyle = "#d7ff3c"; g.font = "700 30px Inter, sans-serif"; g.textAlign = "center"
  g.fillText(`pitchstudio-brown.vercel.app/c/${handle || "you"}`, w / 2, y + ch + (h > w * 1.5 ? 110 : 60))
  return cv.toDataURL("image/png")
}
import { useTheme, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_ERROR, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT, ACCENT_SOFT } from "../theme"

/* Creator Profile ("/profile"): your Creator Card (your brand, which signs every export), who you are in the studio, and how the app looks. */

const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)]

export default function ProfilePage() {
  const navigate = useNavigate()
  const { choice, setChoice } = useTheme()
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState("")
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
  const savedLogoPhoto = useRef<string | null>(null)        // the photo address in the database
  const [touched, setTouched] = useState(false)             // has the card been changed on this page?
  const [savedLogo, setSavedLogo] = useState<string | null>(null) // the logo address in the database
  const [logoData, setLogoData] = useState<string | null>(null)   // the saved logo as a data address (cards and exports)
  const [pending, setPending] = useState<{ blob: Blob; data: string } | null>(null) // a new logo, uploaded when you save
  const [logoMsg, setLogoMsg] = useState("")
  const [downloading, setDownloading] = useState(false)
  const [studioNo, setStudioNo] = useState<number | null>(null)
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const [photoPending, setPhotoPending] = useState<{ blob: Blob; data: string } | null>(null) // a new photo, uploaded when you save
  const [photoData, setPhotoData] = useState<string | null>(null) // the saved photo as a data address (exports)
  const [photoMsg, setPhotoMsg] = useState("")
  const [cropping, setCropping] = useState(false)
  const [tilt, setTilt] = useState<{ rx: number; ry: number; x: number; y: number } | null>(null)
  const [post, setPost] = useState<string | null>(null) // null: the default post
  const [shareMsg, setShareMsg] = useState("")
  const [moreOpen, setMoreOpen] = useState(false)
  const welcome = new URLSearchParams(useLocation().search).get("welcome") === "1"
  const cardRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null) // the card at its own size (330 by 470), out of sight, for downloads
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const cropDrag = useRef<{ x: number; y: number; px: number; py: number; w: number; h: number } | null>(null)
  const savedSnap = useRef("")

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/"); return }
      setUserId(session.user.id)
      setEmail(session.user.email ?? "")
      const { data } = await supabase
        .from("profiles")
        .select("display_name, handle, bio, country, favorite_club, favorite_player, identity, brand, studio_no, opened_at")
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
        if (d.brand) { const b = readBrand(d.brand); setBrand(b); setHadBrand(true); setSavedLogo(b.logo); savedLogoPhoto.current = b.photo }
        setOpenedAt(d.opened_at ?? session.user.created_at ?? null)
        if (typeof d.studio_no === "number") setStudioNo(d.studio_no)
        else openStudio().then(n => { if (n) setStudioNo(n) })
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

  // The saved photo, as a data address (so a downloaded card never depends on another website)
  useEffect(() => {
    let off = false
    if (!brand.photo || photoPending) return
    logoToDataUrl(brand.photo).then(d => { if (!off) setPhotoData(d) })
    return () => { off = true }
  }, [brand.photo, photoPending])

  // What is on the page right now, to know if there is anything to save
  const snap = JSON.stringify([displayName, handle, bio, country, favoriteClub, favoritePlayer, identity, brand, !!pending, !!photoPending])
  useEffect(() => { if (loaded && !savedSnap.current) savedSnap.current = snap }, [loaded])
  const dirty = loaded && savedSnap.current !== "" && snap !== savedSnap.current

  const edit = (patch: Partial<Brand>) => { setBrand(b => ({ ...b, ...patch })); setTouched(true); setSaveMsg(null) }

  const handleSave = async () => {
    if (!userId) return
    setSaving(true); setHandleError(""); setSaveMsg(null)
    const cleanHandle = normalizeHandle(handle)
    setHandle(cleanHandle)
    if (cleanHandle.length < 3) { setHandleError("Use at least 3 letters, numbers or underscores."); setSaving(false); toHandle(); return }
    let next = brand
    if (photoPending) {
      const path = `${userId}/photo-${Date.now()}.jpg`
      const up = await supabase.storage.from(LOGO_BUCKET).upload(path, photoPending.blob, { contentType: "image/jpeg", cacheControl: "31536000" })
      if (up.error) { setSaving(false); setSaveMsg("error"); setPhotoMsg("The photo didn't upload. Try again."); return }
      next = { ...next, photo: supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl }
    }
    if (pending) {
      const path = `${userId}/logo-${Date.now()}.png`
      const up = await supabase.storage.from(LOGO_BUCKET).upload(path, pending.blob, { contentType: "image/png", cacheControl: "31536000" })
      if (up.error) { setSaving(false); setSaveMsg("error"); setLogoMsg("The logo didn't upload. Try again."); return }
      next = { ...next, logo: supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl }
    }
    const sendBrand = touched || !!pending || !!photoPending
    const { error } = await (supabase as any).from("profiles").update({
      display_name: displayName, handle: cleanHandle, bio, country,
      favorite_club: favoriteClub, favorite_player: favoritePlayer, identity: identity || null,
      ...(sendBrand ? { brand: brandForSave(next) } : {}),
    }).eq("id", userId)
    setSaving(false)
    if (error) {
      if ((error as any).code === "23505") { setHandleError("That handle's already taken. Try another."); toHandle() }
      else { setSaveMsg("error"); setTimeout(() => setSaveMsg(null), 3000) }
      return
    }
    // The old logo file is no longer used
    if (sendBrand && savedLogo && savedLogo !== next.logo && savedLogo.startsWith(LOGO_PREFIX)) {
      const old = savedLogo.slice(LOGO_PREFIX.length)
      if (old.startsWith(userId + "/")) supabase.storage.from(LOGO_BUCKET).remove([old]).catch(() => {})
    }
    // the old photo too, once it's replaced or removed
    const savedPhoto = savedLogoPhoto.current
    if (sendBrand && savedPhoto && savedPhoto !== next.photo && savedPhoto.startsWith(LOGO_PREFIX)) {
      const old = savedPhoto.slice(LOGO_PREFIX.length)
      if (old.startsWith(userId + "/")) supabase.storage.from(LOGO_BUCKET).remove([old]).catch(() => {})
    }
    if (sendBrand) {
      if (pending) setLogoData(pending.data)
      if (photoPending) setPhotoData(photoPending.data)
      savedLogoPhoto.current = next.photo
      setBrand(next); setSavedLogo(next.logo); setPending(null); setPhotoPending(null); setHadBrand(true); setTouched(false); setCropping(false)
    }
    savedSnap.current = JSON.stringify([displayName, cleanHandle, bio, country, favoriteClub, favoritePlayer, identity, next, false, false])
    setSaveMsg("saved")
    ;(window as any).posthog?.capture("profile_updated", sendBrand ? { card: true } : undefined)
    if (welcome) { navigate("/", { replace: true }); return }
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

  /* ── your photo ── */
  const pickPhoto = async (file: File | undefined) => {
    setPhotoMsg("")
    if (!file) return
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) { setPhotoMsg("Pick a PNG, JPG or WebP photo under 15 MB."); return }
    try {
      const { blob, ar } = await shrinkPhoto(file)
      const data = await new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error("read")); fr.readAsDataURL(blob) })
      setPhotoPending({ blob, data }); edit({ photoPos: { ...DEFAULT_POS, ar } }); setCropping(true)
    } catch { setPhotoMsg("That photo couldn't be used. Try another one.") }
  }
  const removePhoto = () => { setPhotoPending(null); setPhotoData(null); edit({ photo: null, photoPos: DEFAULT_POS }); setCropping(false); setPhotoMsg("") }
  const shownPhoto = photoPending ? photoPending.data : brand.photo ? (photoData ?? brand.photo) : null
  // drag to crop: the frame is 298 by 262 of the card's 330 by 470
  const cropDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    cropDrag.current = { x: e.clientX, y: e.clientY, px: brand.photoPos.x, py: brand.photoPos.y, w: r.width * (298 / 330), h: r.width * (262 / 330) }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const cropMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = cropDrag.current
    if (!d) return
    const p = brand.photoPos, iw = Math.max(d.w, d.h * p.ar) * p.zoom, ih = iw / p.ar
    const ox = iw - d.w, oy = ih - d.h
    edit({ photoPos: { ...p, x: ox > 1 ? Math.min(1, Math.max(0, d.px - (e.clientX - d.x) / ox)) : 0.5, y: oy > 1 ? Math.min(1, Math.max(0, d.py - (e.clientY - d.y) / oy)) : 0.5 } })
  }

  /* ── the card tilts toward the pointer (not on touch, not with reduced motion) ── */
  const still = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const tiltMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || still || cropping) return
    const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    setTilt({ ry: (x - 0.5) * 22, rx: (0.5 - y) * 18, x, y })
  }

  /* ── sharing ── */
  const postText = post ?? postFor(studioNo, normalizeHandle(handle))
  const cardPng = async () => {
    const fontEmbedCSS = await getFontEmbedCSS(document.body).catch(() => "")
    return toPng(exportRef.current!, { pixelRatio: 3, fontEmbedCSS, width: 330, height: 470 })
  }
  const save = (url: string, file: string) => { const a = document.createElement("a"); a.href = url; a.download = file; a.click() }
  const copyPost = async () => { try { await navigator.clipboard.writeText(postText); return true } catch { return false } }
  const shareX = () => { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(postText)}`, "_blank", "noopener"); (window as any).posthog?.capture("card_shared", { to: "x" }) }
  const shareImage = async (kind: "story" | "card") => {
    if (!exportRef.current || downloading) return
    setDownloading(true); setShareMsg("")
    try {
      const card = await cardPng(), who = normalizeHandle(handle) || "creator"
      const url = kind === "story" ? await cardOnBackground(card, 1080, 1920, 860, who) : await cardOnBackground(card, 1080, 1350, 760, who)
      save(url, kind === "story" ? `${who}-story.png` : `${who}-card.png`)
      if (kind === "story") setShareMsg((await copyPost()) ? "Story image saved, and the post is copied. Paste it in Instagram." : "Story image saved.")
      ;(window as any).posthog?.capture(kind === "story" ? "card_shared" : "creator_card_downloaded", kind === "story" ? { to: "instagram" } : undefined)
    } catch (e) { console.error(e); setShareMsg("The image couldn't be made. Try again.") }
    setDownloading(false)
  }
  const shareLinkedIn = async () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${SITE}/c/${normalizeHandle(handle)}`)}`, "_blank", "noopener")
    setShareMsg((await copyPost()) ? "The post is copied. Paste it in LinkedIn." : "")
    ;(window as any).posthog?.capture("card_shared", { to: "linkedin" })
  }

  const surprise = () => {
    edit({ color: pick(COLOURS), crest: pick(CREST_IDS), title: pick(TITLES) }) // a chosen logo stays; the crest behind it changes
  }

  const downloadCard = () => shareImage("card")

  const toHandle = () => document.getElementById("handle")?.focus()

  if (!loaded) return <div style={{ width: "100vw", height: "100vh", background: SURFACE_BASE }} />

  const strippedName = handle ? stripHandleSuffix(handle, userId, email) : ""
  const name = displayName.trim() || strippedName || "You"
  const chosen = handle && strippedName === handle ? normalizeHandle(handle) : "" // only a handle you picked yourself signs exports
  const idLabel = IDENTITY_OPTIONS.find(o => o.value === identity)?.label
  const shownLogo = pending ? pending.data : brand.logo ? logoData : null
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
        .pf-photo { border-style: dashed; border-color: var(--ps-bd2); display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }
        .pf-photo > .cc-row { margin: 0; }
        .pf-photo-row { flex: 1 1 280px; display: flex; align-items: center; gap: 14px; min-width: 0; }
        .pf-photo-row b { display: block; font-size: 15px; } .pf-photo-row div > span { display: block; font-size: 13px; color: ${TEXT_MUTED}; margin-top: 2px; line-height: 1.4; }
        .pf-photo-ico { width: 46px; height: 46px; flex: none; border-radius: 12px; display: grid; place-items: center; background: ${SURFACE_2}; color: ${ACCENT_TEXT}; }
        .pf-photo > p { flex-basis: 100%; }
        @media (hover: none) { .pf-tilt-hint { display: none; } }
        .pf-cap { font-size: 12px; letter-spacing: .12em; font-weight: 600; color: ${TEXT_MUTED}; margin: 0 0 10px; }
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
        .pf-err { font-size: 12px; color: ${DS_ERROR}; } .pf-hint { font-size: 12px; color: ${TEXT_MUTED}; }
        .pf-chip { padding: 9px 16px; border-radius: 999px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-size: 14px; cursor: pointer; font-family: inherit; margin: 0 8px 8px 0; }
        .pf-chip.on { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; font-weight: 600; }
        .pf-seg { display: inline-flex; background: ${SURFACE_2}; border-radius: 10px; padding: 3px; gap: 2px; }
        .pf-seg button { border: none; background: none; color: ${TEXT_MUTED}; font-size: 13px; padding: 7px 14px; border-radius: 8px; cursor: pointer; font-family: inherit; }
        .pf-seg button.on { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .pf-panel .pf-seg { background: ${SURFACE_BASE}; }
        .pf-out { display: inline-flex; align-items: center; gap: 8px; background: none; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; border-radius: 10px; padding: 9px 14px; font-size: 13px; cursor: pointer; font-family: inherit; width: 100%; justify-content: center; }
        .cc-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 0 0 14px; }
        .cc-step { text-align: left; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; padding: 10px 12px; cursor: pointer; font-family: inherit; color: ${TEXT_MUTED}; font-size: 12px; }
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
        .pf-wrap2 { max-width: 1240px; margin: 0 auto; padding: 32px 32px 130px; display: grid; grid-template-columns: 560px minmax(0, 1fr); gap: 48px; }
        .pf-stage { position: sticky; top: 20px; align-self: start; display: flex; flex-direction: column; gap: 14px; }
        .pf-card3d { perspective: 1100px; }
        .pf-card3d > div { width: min(100%, 440px); margin: 0 auto; transition: transform .35s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 30px 40px rgba(0,0,0,.45)); touch-action: none; }
        .pf-styles { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
        .pf-crop { position: absolute; left: 4.85%; top: 3.4%; width: 90.3%; height: 55.7%; border-radius: 14px; cursor: grab; outline: 2px dashed rgba(255,255,255,.85); display: grid; place-items: end center; padding-bottom: 10px; }
        .pf-crop span { background: rgba(0,0,0,.65); color: #fff; font-size: 12px; padding: 4px 10px; border-radius: 999px; pointer-events: none; }
        .pf-welcome { background: ${ACCENT_SOFT}; border-bottom: 1px solid ${DS_BORDER}; }
        .pf-welcome > div { max-width: 1240px; margin: 0 auto; padding: 12px 32px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 14px; }
        .pf-welcome b { color: ${ACCENT_TEXT}; }
        .pf-h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.03em; }
        .pf-share textarea { width: 100%; min-height: 96px; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; border: 1px solid ${DS_BORDER}; border-radius: 12px; padding: 12px; font: 400 14px/1.5 'Inter', sans-serif; resize: vertical; }
        .pf-share .row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
        .pf-share .row .pf-btn { padding: 0 10px; font-size: 13px; }
        .pf-more { width: 100%; display: flex; align-items: center; justify-content: space-between; background: none; border: none; color: ${TEXT_PRIMARY}; font: 700 14px 'Inter', sans-serif; padding: 16px 0; cursor: pointer; border-top: 1px solid ${DS_BORDER}; }
        @media (max-width: 700px) {
          .pf-wrap2 .pf-chip, .pf-wrap2 .pf-btn, .pf-back { min-height: 44px; } .pf-wrap2 .cc-sw { width: 40px; height: 40px; }
          .pf-wrap2 input:not([type=range]), .pf-wrap2 textarea, .pf-wrap2 select { font-size: 16px; }
        }
        @media (max-width: 1080px) { .pf-wrap2 { grid-template-columns: 1fr; padding: 20px 18px 130px; gap: 24px; } .pf-stage { position: static; } .pf-share .row { grid-template-columns: 1fr 1fr; } .pf-welcome > div { padding: 10px 18px; } }
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

      {welcome && (
        <div className="pf-welcome" role="status"><div>
          <span style={{ flex: 1 }}><b>Welcome to the studio.</b> Make your card first: it signs everything you export.</span>
          <button className="pf-btn" style={{ height: 36 }} onClick={() => { try { sessionStorage.setItem("ps-card-later", "1") } catch { /* private mode */ } navigate("/", { replace: true }) }}>Skip for now</button>
        </div></div>
      )}
      <div className="pf-top">
        <button className="pf-back" onClick={() => navigate("/")}><ArrowLeft size={16} /> Home</button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Mark size={26} color={ACCENT_SOLID} />
          <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, letterSpacing: "0.2em", fontWeight: 600 }}>PITCHSTUDIO</span>
        </div>
      </div>

      <div className="pf-wrap2">
        <aside className="pf-stage">
          <div className="pf-card3d" data-card="preview" onPointerMove={tiltMove} onPointerLeave={() => setTilt(null)}>
            <div style={{ transform: tilt ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)` : "none", position: "relative" }}>
              <div ref={cardRef} className="pf-cardbox">
                <CreatorCard brand={brand} handle={chosen} name={name} since={sinceLabel(openedAt)} logo={shownLogo} unfinished={!hadBrand} photo={shownPhoto} studio={studioNo}
                  title={idLabel ?? brand.title} sheen={tilt ? { x: tilt.x, y: tilt.y } : null} />
              </div>
              {cropping && shownPhoto && <div className="pf-crop" onPointerDown={cropDown} onPointerMove={cropMove} onPointerUp={() => { cropDrag.current = null }} aria-label="Drag to crop your photo"><span>Drag to crop</span></div>}
            </div>
          </div>
          <div aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0, width: 330, height: 470, pointerEvents: "none" }}>
            <div ref={exportRef} style={{ width: 330, height: 470, borderRadius: 22, overflow: "hidden" }}>
              <CreatorCard brand={brand} handle={chosen} name={name} since={sinceLabel(openedAt)} logo={shownLogo} unfinished={!hadBrand} photo={shownPhoto} studio={studioNo} title={idLabel ?? brand.title} />
            </div>
          </div>
          <div className="pf-styles" role="group" aria-label="Card style">
            {CARD_STYLES.map(st => <button key={st.id} className={`pf-chip${brand.style === st.id ? " on" : ""}`} style={{ margin: 0 }} aria-pressed={brand.style === st.id} onClick={() => edit({ style: st.id })}>{st.name}</button>)}
          </div>
          <p className="pf-hint pf-tilt-hint" style={{ textAlign: "center", margin: 0 }}>Move your mouse over the card.</p>
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
        </aside>

        <main style={{ minWidth: 0 }}>
          <h1 className="pf-h1">Your card is your stamp.</h1>
          <p style={{ margin: "8px 0 24px", fontSize: 15, color: TEXT_MUTED, lineHeight: 1.55 }}>It signs every image, clip and report you export, and it is the page people land on.</p>

          <div className="pf-panel pf-photo" style={{ marginBottom: 16 }}>
            <div className="pf-photo-row">
              <span className="pf-photo-ico" aria-hidden="true"><ImagePlus size={18} /></span>
              <div style={{ flex: 1, minWidth: 0 }}><b>{shownPhoto ? "Your photo" : "Upload your photo"}</b><span>Any photo. Drag it in the frame to crop. Yours to remove any time.</span></div>
            </div>
            <div className="cc-row">
              <input ref={photoRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = "" }} />
              <button className="pf-btn pri" onClick={() => photoRef.current?.click()}><ImagePlus size={15} /> {shownPhoto ? "Change photo" : "Choose photo"}</button>
              {shownPhoto && <button className="pf-btn" onClick={() => setCropping(v => !v)}>{cropping ? "Done cropping" : "Crop"}</button>}
              {shownPhoto && <button className="pf-btn" onClick={removePhoto}><Trash2 size={14} /> Remove photo</button>}
            </div>
            {shownPhoto && cropping && <div style={{ flexBasis: "100%" }}>
              <label className="pf-label" htmlFor="pf-zoom">Zoom</label>
              <input id="pf-zoom" type="range" min={1} max={3} step={0.01} value={brand.photoPos.zoom} onChange={e => edit({ photoPos: { ...brand.photoPos, zoom: +e.target.value } })} style={{ width: "100%", accentColor: ACCENT_SOLID }} />
            </div>}
            {photoMsg && <p className="pf-err" style={{ margin: "8px 0 0" }}>{photoMsg}</p>}
          </div>

          <div className="pf-g2" style={{ marginBottom: 16 }}>
            {field("handle", "Handle", handle, setHandle, { prefix: "@", max: 30, err: handleError })}
            {field("motto", "Tagline", brand.motto, v => edit({ motto: v }), { max: MOTTO_MAX, hint: `${brand.motto.length}/${MOTTO_MAX}` })}
          </div>

          <p className="pf-sec" style={{ marginTop: 22 }}>I AM A</p>
          <div>
            {IDENTITY_OPTIONS.map(o => {
              const active = identity === o.value
              return <button key={o.value} className={`pf-chip${active ? " on" : ""}`} aria-pressed={active} onClick={() => setIdentity(active ? "" : o.value)}>{o.label}</button>
            })}
          </div>

          <p className="pf-sec" style={{ marginTop: 22 }}>MY COLOURS</p>
          <div className="cc-row" style={{ marginBottom: 12 }}>
            {COLOURS.map(c => <button key={c} className={`cc-sw${brand.color === c ? " on" : ""}`} aria-label={`Colour ${c}`} aria-pressed={brand.color === c} style={{ background: c }} onClick={() => edit({ color: c })} />)}
            <input type="color" className="cc-color" aria-label="Pick any colour" value={brand.color} onChange={e => edit({ color: e.target.value.toLowerCase() })} />
          </div>
          <div className="cc-packs" style={{ marginBottom: 26 }}>
            {PACKS.map(p => {
              const c = cardColours({ ...brand, color: p.color })
              const on = brand.color === p.color && brand.crest === p.crest && brand.title === p.title
              return (
                <button key={p.id} className={`cc-pack${on ? " on" : ""}`} aria-pressed={on} onClick={() => edit({ color: p.color, crest: p.crest, title: p.title })}
                  style={{ background: `linear-gradient(160deg, ${c.top}, ${c.bottom})`, color: c.text, height: 70 }}>
                  <b>{p.title}</b><span>{p.note}</span>
                </button>
              )
            })}
          </div>

          <div className="pf-panel pf-share" style={{ marginBottom: 22 }}>
            <p className="pf-cap">SHARE THAT YOU'RE IN</p>
            <textarea aria-label="Your post" value={postText} maxLength={280} onChange={e => setPost(e.target.value)} />
            <div className="row">
              <button className="pf-btn pri" onClick={shareX}>Post on X</button>
              <button className="pf-btn" onClick={() => shareImage("story")} disabled={downloading}><Instagram size={15} /> Story 9:16</button>
              <button className="pf-btn" onClick={shareLinkedIn}><Linkedin size={15} /> LinkedIn</button>
              <button className="pf-btn" onClick={downloadCard} disabled={downloading}><Download size={15} /> {downloading ? "Making…" : "Download card"}</button>
            </div>
            <p className="pf-hint" style={{ margin: "10px 0 0" }} aria-live="polite">{shareMsg || "X opens with the text and link filled in. Instagram and LinkedIn: we copy the text and save the image, you paste."}</p>
            {!hadBrand && <p className="pf-hint" style={{ margin: "6px 0 0" }}>Save your card first, so the link shows it.</p>}
            <button className="pf-btn" style={{ height: 34, marginTop: 10 }} onClick={async () => setShareMsg((await copyPost()) ? "Copied." : "Couldn't copy. Select the text instead.")}><Copy size={13} /> Copy the post</button>
          </div>

          <button className="pf-more" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)}>More about you <ChevronDown size={18} style={{ transform: moreOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} /></button>
          {moreOpen && <div style={{ display: "grid", gap: 22, paddingBottom: 10 }}>
            <div className="pf-g2">
              {field("displayName", "Display name", displayName, setDisplayName)}
              {field("cardTitle", "Title (when you haven't picked a role)", brand.title, v => edit({ title: v }), { max: TITLE_MAX })}
            </div>
            {field("bio", "Bio", bio, setBio, { rows: 3, max: 160, hint: `${bio.length}/160` })}
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
            <div className="pf-panel">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                <p className="pf-cap" style={{ margin: 0 }}>CREST</p>
                <button className="pf-btn" style={{ height: 34 }} onClick={surprise}><Dices size={14} /> Surprise me</button>
              </div>
              <div className="cc-row">
                {CREST_IDS.map(id => <button key={id} className={`cc-cr${!shownLogo && brand.crest === id ? " on" : ""}`} aria-label={CREST_LABELS[id]} aria-pressed={!shownLogo && brand.crest === id} onClick={() => { setPending(null); edit({ crest: id, logo: null }); setLogoMsg("") }}><CrestIcon id={id} size={26} /></button>)}
              </div>
              <div className="cc-row" style={{ marginTop: 16 }}>
                <input ref={fileRef} id="logoFile" type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = "" }} />
                <button className="pf-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> Upload your own logo</button>
                {shownLogo && <button className="pf-btn" onClick={removeLogo}>Remove logo</button>}
              </div>
              {logoMsg ? <p className="pf-err" style={{ margin: "8px 0 0" }}>{logoMsg}</p> : <p className="pf-hint" style={{ margin: "8px 0 0" }}>PNG, JPG or WebP. We crop it square.</p>}
              <p className="pf-cap" style={{ marginTop: 18 }}>THE DRAWN YOU (WHEN THERE'S NO PHOTO)</p>
              <div className="cc-row">
                {SKINS.map((sk, i) => <button key={sk} className={`cc-skin${brand.skin === sk ? " on" : ""}`} aria-label={SKIN_LABELS[i]} aria-pressed={brand.skin === sk} style={{ background: sk }} onClick={() => edit({ skin: sk })} />)}
              </div>
              <div style={{ marginTop: 12 }}>{seg("Hair", brand.hair, "Spiky punk", "No hair", v => edit({ hair: v }))}</div>
              <p className="pf-cap" style={{ marginTop: 18 }}>“MADE WITH PITCHSTUDIO” ON YOUR EXPORTS</p>
              {seg("PitchStudio on exports", brand.madeWith, "On", "Off", v => edit({ madeWith: v }))}
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
            <AccountData userId={userId} email={email} />
          </div>}
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
