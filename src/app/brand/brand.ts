import { projectId } from "../../../utils/supabase/info"
import { PS_VOLT } from "../theme"
import { CREST_IDS, type CrestId } from "./crests"

/* A creator's brand: the Creator Card. One small object saved in profiles.brand (jsonb). Anything read from the database is checked first. */

export type Brand = {
  color: string       // the card's main colour
  crest: CrestId      // the icon on the crest (used when there is no logo)
  title: string       // the line at the bottom of the card ("The Tactician")
  motto: string       // one line under the name
  skin: string        // face colour (studio green until chosen)
  hair: boolean       // the Spiky punk hair
  madeWith: boolean   // sign exports with "PITCHSTUDIO" as well as your handle
  logo: string | null // public address of the uploaded logo in the brand-logos bucket
}

/** The card everyone starts with: charcoal, a ball crest, a studio-green face. */
export const DEFAULT_BRAND: Brand = { color: "#2b2d33", crest: "ball", title: "The Creator", motto: "", skin: PS_VOLT, hair: true, madeWith: true, logo: null }

export const COLOURS = ["#e53935", "#3b6cf0", "#2b2d33", "#f5b70a", "#8b5cf6", "#10b981", "#f472b6", "#f2f0ea"]
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
  const logo = typeof r.logo === "string" && r.logo.startsWith(LOGO_PREFIX) && r.logo.length < 300 && /^[A-Za-z0-9:/._%~-]+$/.test(r.logo) ? r.logo : null
  return {
    color: typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : d.color,
    crest: CREST_IDS.includes(r.crest as CrestId) ? (r.crest as CrestId) : d.crest,
    title: clean(r.title, TITLE_MAX) || d.title,
    motto: clean(r.motto, MOTTO_MAX),
    skin: typeof r.skin === "string" && HEX.test(r.skin) ? r.skin.toLowerCase() : d.skin,
    hair: typeof r.hair === "boolean" ? r.hair : d.hair,
    madeWith: typeof r.madeWith === "boolean" ? r.madeWith : d.madeWith,
    logo,
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
