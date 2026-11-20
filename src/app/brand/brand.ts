import { projectId } from "../../../utils/supabase/info"
import { PS_VOLT } from "../theme"
import { CREST_IDS, type CrestId } from "./crests"

/* A creator's brand: the Creator Card. One small object saved in profiles.brand (jsonb). Anything read from the database is checked first. */

export type Brand = {
  color: string       // the card's main colour
  color2: string | null // a second colour (a club pair): the card's second bar. null: picked to suit the main colour
  crest: CrestId      // the icon on the crest (used when there is no logo)
  title: string       // the line at the bottom of the card ("The Tactician")
  motto: string       // one line under the name
  skin: string        // face colour (studio green until chosen)
  hair: boolean       // the Spiky punk hair
  madeWith: boolean   // sign exports with "PITCHSTUDIO" as well as your handle
  logo: string | null // public address of the uploaded logo in the brand-logos bucket
  photo: string | null // public address of your photo (same bucket), which fills the card's frame
  photoPos: PhotoPos  // how the photo is cropped in the frame
  style: CardStyle    // foil, matte, sticker or paper
}
/** x and y: where the photo sits in the frame (0 to 1, 0.5 centred); zoom: 1 to 3; ar: the photo's width over its height */
export type PhotoPos = { x: number; y: number; zoom: number; ar: number }
export type CardStyle = "foil" | "matte" | "sticker" | "paper"
export const CARD_STYLES: { id: CardStyle; name: string }[] = [{ id: "foil", name: "Foil" }, { id: "matte", name: "Matte" }, { id: "sticker", name: "Sticker" }, { id: "paper", name: "Paper" }]
export const DEFAULT_POS: PhotoPos = { x: 0.5, y: 0.5, zoom: 1, ar: 1 }

/** The card everyone starts with: charcoal, a ball crest, a studio-green face. */
export const DEFAULT_BRAND: Brand = { color: "#2b2d33", color2: null, crest: "ball", title: "The Creator", motto: "", skin: PS_VOLT, hair: false, madeWith: true, logo: null, photo: null, photoPos: DEFAULT_POS, style: "foil" }

export const COLOURS = ["#e53935", "#3b6cf0", "#2b2d33", "#f5b70a", "#8b5cf6", "#10b981", "#f472b6", "#f2f0ea"]
/** Two-colour pairs, the way clubs wear them: the card's main colour and its second bar */
export const PAIRS: { name: string; c1: string; c2: string }[] = [
  { name: "Garnet and blue", c1: "#a11d48", c2: "#1f4ba0" },
  { name: "Claret and sky", c1: "#6e1e3a", c2: "#95bfe5" },
  { name: "Green and white", c1: "#1d5a2c", c2: "#f2f0ea" },
  { name: "Volt and black", c1: "#d7ff3c", c2: "#121316" },
  { name: "Navy and gold", c1: "#1f3e8c", c2: "#f5b70a" },
  { name: "Red and white", c1: "#e53935", c2: "#f2f0ea" },
]
export const SKINS = [PS_VOLT, "#f1c9a5", "#e0ac7e", "#c68642", "#8d5524", "#5c3a21", "#3a2416"]
export const SKIN_LABELS = ["Studio green", "Light", "Fair", "Tan", "Brown", "Deep brown", "Dark"]
export const PACKS: { id: string; title: string; note: string; color: string; crest: CrestId }[] = [
  { id: "tactician", title: "The Tactician", note: "Red · lightning", color: "#e53935", crest: "bolt" },
  { id: "scout", title: "The Scout", note: "Blue · eye", color: "#3b6cf0", crest: "eye" },
  { id: "analyst", title: "The Analyst", note: "Charcoal · brain", color: "#2b2d33", crest: "brain" },
  { id: "ultra", title: "The Ultra", note: "Gold · star", color: "#f5b70a", crest: "star" },
]
export const TITLES = ["The Tactician", "The Scout", "The Analyst", "The Ultra", "The Gaffer", "The Playmaker", "The Creator"]
export const MOTTO_MAX = 60, TITLE_MAX = 24

export const LOGO_BUCKET = "brand-logos"
export const LOGO_PREFIX = `https://${projectId}.supabase.co/storage/v1/object/public/${LOGO_BUCKET}/`

const HEX = /^#[0-9a-fA-F]{6}$/
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.split("").map(ch => (ch.charCodeAt(0) < 32 ? " " : ch)).join("").trim().slice(0, max) : "")

/** Turns whatever is in the database into a safe Brand. Null (nobody has made a card yet) gives the default card. */
export function readBrand(raw: unknown): Brand {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_BRAND
  const ours = (v: unknown) => (typeof v === "string" && v.startsWith(LOGO_PREFIX) && v.length < 300 && /^[A-Za-z0-9:/._%~-]+$/.test(v) ? v : null)
  const logo = ours(r.logo), photo = ours(r.photo)
  const pp = (r.photoPos && typeof r.photoPos === "object" ? r.photoPos : {}) as Record<string, unknown>
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
  return {
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : d.color,
    color2: typeof r.color2 === "string" && HEX.test(r.color2) ? r.color2.toLowerCase() : null,
    crest: CREST_IDS.includes(r.crest as CrestId) ? (r.crest as CrestId) : d.crest,
    title: clean(r.title, TITLE_MAX) || d.title,
    motto: clean(r.motto, MOTTO_MAX),
    skin: typeof r.skin === "string" && HEX.test(r.skin) ? r.skin.toLowerCase() : d.skin,
    hair: false, // the punk hair is retired: the drawn you is the plain lime figure
    madeWith: typeof r.madeWith === "boolean" ? r.madeWith : d.madeWith,
    logo, photo,
    photoPos: { x: n(pp.x, 0, 1, 0.5), y: n(pp.y, 0, 1, 0.5), zoom: n(pp.zoom, 1, 3, 1), ar: n(pp.ar, 0.2, 5, 1) },
    style: CARD_STYLES.some(x => x.id === r.style) ? (r.style as CardStyle) : "foil",
  }
}

/** What is saved: the same fields, plus a version number for later. */
export const brandForSave = (b: Brand) => ({ v: 1, ...b })

/* ── colour helpers ── */
const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const hex = (c: number[]) => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")
export function mix(a: string, b: string, t: number) { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)) }
/** Lighter (t above 0) or darker (t below 0) */
export const shade = (h: string, t: number) => (t >= 0 ? mix(h, "#ffffff", t) : mix(h, "#000000", -t))
/** How bright a colour looks, 0 (black) to 1 (white) */
export function lum(h: string) { const [r, g, b] = rgb(h).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const inkFor = (h: string) => (lum(h) > 0.4 ? "#121316" : "#ffffff")
export const isDark = (h: string) => lum(h) < 0.06

/** The colours a card is drawn with, worked out from its main colour. Dark cards pop in studio volt. */
export function cardColours(b: Brand) {
  const c = b.color, dark = isDark(c), light = lum(c) > 0.55
  const pop = dark ? PS_VOLT : inkFor(c)            // crest, name and lines
  return {
    top: shade(c, dark ? 0.1 : 0.2), mid: c, bottom: shade(c, dark ? -0.6 : light ? -0.22 : -0.62),
    text: dark ? "#ffffff" : inkFor(c), name: dark ? PS_VOLT : inkFor(c), pop,
    glyph: dark ? c : shade(c, light ? -0.1 : -0.35),
    kit: light ? "#1d1f24" : dark ? "#454852" : shade(c, -0.12),
    stripe: dark ? PS_VOLT : inkFor(c),
    disc: dark ? PS_VOLT : c,                         // the round badge on exports
    discInk: dark ? "#0a0c0f" : inkFor(c),
  }
}

/** Fetches the logo once and turns it into a data address, so exports never depend on another website being reachable. */
export async function logoToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" })
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>(resolve => { const fr = new FileReader(); fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null); fr.onerror = () => resolve(null); fr.readAsDataURL(blob) })
  } catch { return null }
}

/** Shrinks a photo to at most 900px on its long side, as a JPEG under 1 MB (the bucket's limit). ar: its width over its height. */
export async function shrinkPhoto(file: File): Promise<{ blob: Blob; ar: number }> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("not an image")); i.src = url })
    const w0 = img.naturalWidth, h0 = img.naturalHeight
    if (!w0 || !h0) throw new Error("empty image")
    const k = Math.min(1, 900 / Math.max(w0, h0)), w = Math.round(w0 * k), h = Math.round(h0 * k)
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h
    cv.getContext("2d")!.drawImage(img, 0, 0, w, h)
    const at = (q: number) => new Promise<Blob>((ok, no) => cv.toBlob(b => (b ? ok(b) : no(new Error("could not make the picture"))), "image/jpeg", q))
    let blob = await at(0.82)
    if (blob.size > 1024 * 1024) blob = await at(0.7)
    if (blob.size > 1024 * 1024) throw new Error("too big")
    return { blob, ar: w / h }
  } finally { URL.revokeObjectURL(url) }
}

/** Crops a picked image to a square and shrinks it to 256 by 256 (a small png). */
export async function squareLogo(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("not an image")); i.src = url })
    const s = Math.min(img.naturalWidth, img.naturalHeight)
    if (!s) throw new Error("empty image")
    const cv = document.createElement("canvas"); cv.width = 256; cv.height = 256
    cv.getContext("2d")!.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256)
    return await new Promise<Blob>((ok, no) => cv.toBlob(b => (b ? ok(b) : no(new Error("could not make the picture"))), "image/png"))
  } finally { URL.revokeObjectURL(url) }
}
