import { supabase } from "../lib/supabase"
import type { Calib, CalPoint } from "./calib"

/* Live Game Analysis: the data. An analysis is up to 10 match shots, each with the marks drawn on it.
   Every position is in the shot's own pixels, so a mark sits on the same spot at any screen size and in the export. */

export type Pt = [number, number]
export type TagStyle = "cast" | "sig" | "plain" | "bare"
export type Tag = { id: string; kind: "tag"; color: string; x: number; y: number; dx: number; dy: number; label: string; ring: boolean; size: number; style?: TagStyle; glow?: boolean }
export type Spot = { id: string; kind: "spot"; color: string; x: number; y: number; size: number }
export type Zone = { id: string; kind: "zone"; color: string; pts: Pt[]; opacity: number; label: string; outline: boolean; size: number; round?: boolean }
export type Arrow = { id: string; kind: "arrow"; color: string; a: Pt; b: Pt; c: Pt | null; dash: "solid" | "dash" | "dot"; head: "end" | "none" | "both"; size: number }
export type Note = { id: string; kind: "text"; color: string; x: number; y: number; text: string; box: boolean; size: number }
/** A ring on the grass (r metres across when the shot is calibrated) */
export type Ring = { id: string; kind: "ring"; color: string; x: number; y: number; r: number; fill: number; double: boolean; size: number }
/** A tie between two players (or two points). ra and rb: the marks it is tied to, so it follows them. dist: show the metres */
export type Tie = { id: string; kind: "tie"; color: string; a: Pt; b: Pt; ra: string | null; rb: string | null; dash: "solid" | "dash" | "dot"; dist: boolean; size: number }
/** A measured distance on the grass */
export type Measure = { id: string; kind: "measure"; color: string; a: Pt; b: Pt; size: number }
/** The cover shadow: the space behind a presser (x, y) that the ball (bx, by) can't reach */
export type Shadow = { id: string; kind: "shadow"; color: string; x: number; y: number; bx: number; by: number; len: number; spread: number; size: number }
/** Focus: everything outside these corners goes dark */
export type Focus = { id: string; kind: "focus"; pts: Pt[]; dim: number; color: string; size: number }
export type Mark = (Tag | Spot | Zone | Arrow | Note | Ring | Tie | Measure | Shadow | Focus) & { step?: number }
export type Shot = { id: string; path: string | null; w: number; h: number; dim: number; items: Mark[]; calib?: Calib | null }
/** The words under a shot (and the caption of a video moment) */
export type Notes = { kicker: string; head: string; body: string; stats: string[]; show: boolean }
export const EMPTY_NOTES: Notes = { kicker: "", head: "", body: "", stats: [], show: true }
/** A moment in the video: it freezes there for a few seconds with drawings on it.
    lead: slow the second before it down. steps: when each build step appears, in seconds after the freeze */
export type Moment = { id: string; t: number; hold: number; dim: number; items: Mark[]; lead?: "off" | "slow"; calib?: Calib | null; caption?: Notes; capAt?: "auto" | "top" | "bottom"; steps?: Record<string, number> }
/** The video an analysis is made from (the file itself stays on the device) and what's drawn on it */
export type VideoProject = { name: string; key: string; size: number; dur: number; w: number; h: number; inT: number; outT: number; moments: Moment[] }
export type AnalysisData = { v: 1; shots: Shot[]; video: VideoProject | null }
export const MAX_MOMENTS = 40

export const MAX_SHOTS = 10
export const MAX_MARKS = 300
export const SHOT_BUCKET = "analysis-shots"
export const LONG_SIDE = 1920 // shots are stored at most this wide (or tall)
export const INPUT_MAX_MB = 25

/** The colours every mark can take: white, studio volt, red, amber, sky, royal blue, green, pink, black */
export const MARK_COLOURS = ["#ffffff", "#d7ff3c", "#f43f5e", "#fbbf24", "#38bdf8", "#2563eb", "#22c55e", "#f472b6", "#111111"]

/** How big marks are on a shot of this width (a 1920 wide shot is 1) */
export const unit = (w: number) => Math.max(0.35, w / 1920)

export const newId = () => {
  try { return crypto.randomUUID() } catch { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) }
}

/* ── reading saved data: never trust it ── */
const HEX = /^#[0-9a-fA-F]{6}$/
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const col = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : d)
const pt = (v: unknown, w: number, h: number): Pt | null => (Array.isArray(v) && v.length === 2 ? [num(v[0], -w, 2 * w, 0), num(v[1], -h, 2 * h, 0)] : null)

function readMark(m: any, w: number, h: number): Mark | null {
  if (!m || typeof m !== "object") return null
  const id = str(m.id, 60) || newId()
  const x = num(m.x, -w, 2 * w, w / 2), y = num(m.y, -h, 2 * h, h / 2)
  const size = num(m.size, 0.3, 4, 1)
  switch (m.kind) {
    case "tag": return { id, kind: "tag", color: col(m.color, "#ffffff"), x, y, dx: num(m.dx, -2 * w, 2 * w, 0), dy: num(m.dy, -2 * h, 2 * h, -100), label: str(m.label, 40), ring: m.ring !== false, size, style: m.style === "plain" || m.style === "bare" || m.style === "cast" ? m.style : "sig", glow: m.glow === true }
    case "spot": return { id, kind: "spot", color: col(m.color, "#d7ff3c"), x, y, size }
    case "zone": {
      const pts = (Array.isArray(m.pts) ? m.pts : []).map((p: unknown) => pt(p, w, h)).filter(Boolean) as Pt[]
      if (pts.length < 3 || pts.length > 4) return null
      return { id, kind: "zone", color: col(m.color, "#d7ff3c"), pts, opacity: num(m.opacity, 0, 0.9, 0.28), label: str(m.label, 24), outline: m.outline === true, size, round: m.round === true && pts.length === 4 }
    }
    case "arrow": {
      const a = pt(m.a, w, h), b = pt(m.b, w, h)
      if (!a || !b) return null
      return { id, kind: "arrow", color: col(m.color, "#ffffff"), a, b, c: pt(m.c, w, h), dash: m.dash === "dash" || m.dash === "dot" ? m.dash : "solid", head: m.head === "none" || m.head === "both" ? m.head : "end", size }
    }
    case "text": return { id, kind: "text", color: col(m.color, "#ffffff"), x, y, text: str(m.text, 400), box: m.box !== false, size }
    case "ring": return { id, kind: "ring", color: col(m.color, "#d7ff3c"), x, y, r: num(m.r, 0.3, 6, 0.95), fill: num(m.fill, 0, 0.6, 0.18), double: m.double === true, size }
    case "tie": {
      const a = pt(m.a, w, h), b = pt(m.b, w, h)
      if (!a || !b) return null
      return { id, kind: "tie", color: col(m.color, "#ffffff"), a, b, ra: str(m.ra, 60) || null, rb: str(m.rb, 60) || null, dash: m.dash === "dash" || m.dash === "dot" ? m.dash : "solid", dist: m.dist === true, size }
    }
    case "measure": {
      const a = pt(m.a, w, h), b = pt(m.b, w, h)
      if (!a || !b) return null
      return { id, kind: "measure", color: col(m.color, "#ffffff"), a, b, size }
    }
    case "shadow": return { id, kind: "shadow", color: col(m.color, "#ffffff"), x, y, bx: num(m.bx, -w, 2 * w, x), by: num(m.by, -h, 2 * h, y + 100), len: num(m.len, 3, 40, 14), spread: num(m.spread, 3, 30, 10), size }
    case "focus": {
      const pts = (Array.isArray(m.pts) ? m.pts : []).map((p: unknown) => pt(p, w, h)).filter(Boolean) as Pt[]
      if (pts.length < 3 || pts.length > 8) return null
      return { id, kind: "focus", pts, dim: num(m.dim, 0.1, 0.85, 0.45), color: col(m.color, "#05060a"), size }
    }
  }
  return null
}
/** A mark read from saved data, keeping its build step */
function readMarkStep(m: any, w: number, h: number): Mark | null {
  const r = readMark(m, w, h)
  if (r && m && typeof m.step === "number" && Number.isFinite(m.step)) (r as Mark).step = Math.max(1, Math.min(99, Math.round(m.step)))
  return r
}
export function readMarks(v: unknown, w: number, h: number): Mark[] {
  return (Array.isArray(v) ? v.slice(0, MAX_MARKS) : []).map((m: unknown) => readMarkStep(m, w, h)).filter(Boolean) as Mark[]
}
export function readCalib(v: any, w: number, h: number): Calib | null {
  if (!v || typeof v !== "object" || !Array.isArray(v.pts)) return null
  const pts: CalPoint[] = []
  for (const q of v.pts.slice(0, 12)) {
    const img = pt(q?.img, w, h), pitch = Array.isArray(q?.pitch) && q.pitch.length === 2 ? [num(q.pitch[0], -10, 120, 0), num(q.pitch[1], -10, 80, 0)] as Pt : null
    if (img && pitch) pts.push({ img, pitch, id: str(q.id, 12) })
  }
  return pts.length ? { pts } : null
}
export function readNotes(v: any): Notes {
  if (!v || typeof v !== "object") return { ...EMPTY_NOTES, stats: [] }
  return { kicker: str(v.kicker, 80), head: str(v.head, 90), body: str(v.body, 600), stats: (Array.isArray(v.stats) ? v.stats : []).slice(0, 4).map((s: unknown) => str(s, 24)).filter(Boolean), show: v.show !== false }
}

/** Turns a saved analysis into safe data. Shots must live in this user's own folder. */
export function readAnalysis(raw: unknown, userId: string): AnalysisData {
  const r = (raw && typeof raw === "object" ? raw : {}) as any
  const shots: Shot[] = []
  for (const s of Array.isArray(r.shots) ? r.shots.slice(0, MAX_SHOTS) : []) {
    if (!s || typeof s !== "object") continue
    const path = typeof s.path === "string" && s.path.startsWith(userId + "/") && s.path.length < 300 && !s.path.includes("..") ? s.path : null
    if (!path) continue
    const w = Math.round(num(s.w, 16, 8000, 1920)), h = Math.round(num(s.h, 16, 8000, 1080))
    const items = readMarks(s.items, w, h)
    shots.push({ id: str(s.id, 60) || newId(), path, w, h, dim: num(s.dim, 0, 0.7, 0), items })
  }
  return { v: 1, shots, video: readVideo(r.video) }
}
export function readVideo(v: any): VideoProject | null {
  if (!v || typeof v !== "object") return null
  const key = str(v.key, 140), size = num(v.size, 1, 1e12, 0), dur = num(v.dur, 0.1, 601, 0)
  if (!key || !size || !dur) return null
  const w = Math.round(num(v.w, 16, 8000, 1920)), h = Math.round(num(v.h, 16, 8000, 1080))
  const inT = num(v.inT, 0, dur, 0), outT = num(v.outT, inT, dur, dur)
  const moments: Moment[] = (Array.isArray(v.moments) ? v.moments.slice(0, MAX_MOMENTS) : []).filter((m: any) => m && typeof m === "object").map((m: any) => ({
    id: str(m.id, 60) || newId(), t: num(m.t, 0, dur, 0), hold: num(m.hold, 0.5, 15, 3), dim: num(m.dim, 0, 0.7, 0),
    items: readMarks(m.items, w, h), lead: m.lead === "slow" ? "slow" as const : "off" as const, calib: readCalib(m.calib, w, h),
    caption: m.caption ? readNotes(m.caption) : undefined, capAt: m.capAt === "top" || m.capAt === "bottom" ? m.capAt : undefined,
    steps: m.steps && typeof m.steps === "object" ? Object.fromEntries(Object.entries(m.steps).slice(0, 40).filter(([k, t]) => /^\d{1,2}$/.test(k) && typeof t === "number" && t >= 0 && t <= 15).map(([k, t]) => [k, t as number])) : undefined,
  })).sort((a: Moment, b: Moment) => a.t - b.t)
  return { name: str(v.name, 200) || "Video", key, size, dur, w, h, inT, outT, moments }
}

/* ── geometry ── */
/** The control point that makes a curve pass through c (the handle you drag sits on the line) */
export const ctrlFor = (a: Pt, b: Pt, c: Pt): Pt => [2 * c[0] - (a[0] + b[0]) / 2, 2 * c[1] - (a[1] + b[1]) / 2]
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
export const centroid = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Moves a whole mark by (dx, dy) */
export function moveMark(m: Mark, dx: number, dy: number): Mark {
  const sh = (p: Pt): Pt => [p[0] + dx, p[1] + dy]
  switch (m.kind) {
    case "zone": return { ...m, pts: m.pts.map(sh) }
    case "focus": return { ...m, pts: m.pts.map(sh) }
    case "arrow": return { ...m, a: sh(m.a), b: sh(m.b), c: m.c ? sh(m.c) : null }
    case "tie": return { ...m, a: sh(m.a), b: sh(m.b), ra: null, rb: null }
    case "measure": return { ...m, a: sh(m.a), b: sh(m.b) }
    case "shadow": return { ...m, x: m.x + dx, y: m.y + dy, bx: m.bx + dx, by: m.by + dy }
    default: return { ...m, x: m.x + dx, y: m.y + dy }
  }
}

/* ── pictures ── */
/** Opens a picked or pasted picture, shrinks it so its long side is at most 1920, and makes a JPEG. */
/** Plain black bars around a screenshot (letterboxing, the edge of a phone screen) are cut off when the shot is added.
    Only edges that are almost fully black go, and never more than a quarter of the picture from any side. */
function blackBars(img: HTMLImageElement) {
  const iw = img.naturalWidth, ih = img.naturalHeight, all = { x: 0, y: 0, w: iw, h: ih }
  const n = Math.min(1, 400 / Math.max(iw, ih)), sw = Math.max(1, Math.round(iw * n)), sh = Math.max(1, Math.round(ih * n))
  const cv = document.createElement("canvas"); cv.width = sw; cv.height = sh
  const ctx = cv.getContext("2d", { willReadFrequently: true })
  if (!ctx) return all
  ctx.drawImage(img, 0, 0, sw, sh)
  let px: Uint8ClampedArray
  try { px = ctx.getImageData(0, 0, sw, sh).data } catch { return all }
  const dark = (x: number, y: number) => { const i = (y * sw + x) * 4; return Math.max(px[i], px[i + 1], px[i + 2]) < 24 }
  const col = (x: number) => { let d = 0; for (let y = 0; y < sh; y++) if (dark(x, y)) d++; return d >= sh * 0.97 }
  const row = (y: number) => { let d = 0; for (let x = 0; x < sw; x++) if (dark(x, y)) d++; return d >= sw * 0.97 }
  let l = 0, r = sw, t = 0, b = sh
  while (l < sw / 4 && col(l)) l++
  while (r > sw * 3 / 4 && col(r - 1)) r--
  while (t < sh / 4 && row(t)) t++
  while (b > sh * 3 / 4 && row(b - 1)) b--
  if (!l && r === sw && !t && b === sh) return all
  // one sample more on each cut side, so no dark edge is left
  if (l) l++
  if (r < sw) r--
  if (t) t++
  if (b < sh) b--
  const k = 1 / n, x = Math.round(l * k), y = Math.round(t * k)
  return { x, y, w: Math.min(iw - x, Math.round((r - l) * k)), h: Math.min(ih - y, Math.round((b - t) * k)) }
}

export async function prepareShot(file: Blob): Promise<{ blob: Blob; data: string; w: number; h: number }> {
  if (!file.type.startsWith("image/")) throw new Error("not a picture")
  if (file.size > INPUT_MAX_MB * 1024 * 1024) throw new Error("too big")
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("unreadable")); i.src = url })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("unreadable")
    const c = blackBars(img)
    const s = Math.min(1, LONG_SIDE / Math.max(c.w, c.h))
    const w = Math.max(1, Math.round(c.w * s)), h = Math.max(1, Math.round(c.h * s))
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h
    const ctx = cv.getContext("2d")!
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, c.x, c.y, c.w, c.h, 0, 0, w, h)
    let blob: Blob | null = null
    for (const q of [0.9, 0.8, 0.7]) {
      blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, "image/jpeg", q))
      if (blob && blob.size < 4.5 * 1024 * 1024) break
    }
    if (!blob) throw new Error("unreadable")
    return { blob, data: await blobToData(blob), w, h }
  } finally { URL.revokeObjectURL(url) }
}

export const blobToData = (b: Blob) => new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error("read")); fr.readAsDataURL(b) })

/* ── storage (a private bucket: only you can see your shots) ── */
export async function uploadShot(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(SHOT_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "31536000" })
  if (error) throw error
}
export async function downloadShot(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(SHOT_BUCKET).download(path)
    if (error || !data) return null
    return await blobToData(data)
  } catch { return null }
}
export async function removeShots(paths: string[]) {
  if (!paths.length) return
  try { await supabase.storage.from(SHOT_BUCKET).remove(paths) } catch { /* the files stay; nothing else depends on them */ }
}

/* ── fonts for exports ──
   An export is drawn from an svg, which can only use fonts that travel inside it. So the fonts the marks use are fetched
   once (from Google Fonts, the same files the app already uses) and put inside every export. */
const EXPORT_FONTS = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@500;600;700&display=swap" // what marks are drawn in
const NEED: Record<string, number[]> = { "Barlow Condensed": [600, 700, 800], Inter: [500, 600, 700] }
let fontCache: Promise<string> | null = null
const prop = (block: string, name: string) => {
  const i = block.indexOf(name + ":")
  if (i < 0) return ""
  const j = block.indexOf(";", i), k = block.indexOf("}", i)
  const stop = j < 0 ? k : k < 0 ? j : Math.min(j, k)
  return block.slice(i + name.length + 1, stop < 0 ? undefined : stop).trim()
}
/** Puts 2 to 10 exported shots into one picture: 2 side by side, up to 4 in a 2 by 2 grid, up to 9 in rows of 3, 10 in rows of 4
    (a short last row sits in the middle). Each shot keeps its own shape inside its cell and gets its number, top right, in the signature plate. */
export function combineShots(cvs: HTMLCanvasElement[]): Promise<Blob> {
  const n = cvs.length, cols = n <= 4 ? 2 : n <= 9 ? 3 : 4, rows = Math.ceil(n / cols), gap = 12, cw = cols === 2 ? 1280 : 960
  const ch = Math.round(cw * Math.min(1.25, Math.max(0.4, cvs[0].height / cvs[0].width)))
  const W = cols * cw + (cols + 1) * gap, H = rows * ch + (rows + 1) * gap
  const out = document.createElement("canvas"); out.width = W; out.height = H
  const ctx = out.getContext("2d")!
  ctx.fillStyle = "#0d0e10"; ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingQuality = "high"
  cvs.forEach((c, i) => {
    const row = Math.floor(i / cols), inRow = row === rows - 1 ? n - row * cols : cols, offset = (W - (inRow * cw + (inRow + 1) * gap)) / 2
    const x = offset + gap + (i % cols) * (cw + gap), y = gap + row * (ch + gap)
    const s = Math.min(cw / c.width, ch / c.height), w = c.width * s, h = c.height * s
    ctx.drawImage(c, x + (cw - w) / 2, y + (ch - h) / 2, w, h)
    // the number: a small dark plate with its corner cut and a volt block, like a signature tag
    const b = 46, cut = 12, bw = 7, bx = x + cw - b - 16, by = y + 16
    ctx.beginPath(); ctx.moveTo(bx + cut, by); ctx.lineTo(bx + b, by); ctx.lineTo(bx + b, by + b); ctx.lineTo(bx, by + b); ctx.lineTo(bx, by + cut); ctx.closePath()
    ctx.fillStyle = "rgba(12,14,18,0.86)"; ctx.fill()
    ctx.beginPath(); ctx.moveTo(bx, by + cut); ctx.lineTo(bx + bw, by + cut - bw); ctx.lineTo(bx + bw, by + b); ctx.lineTo(bx, by + b); ctx.closePath()
    ctx.fillStyle = "#d7ff3c"; ctx.fill()
    ctx.fillStyle = "#ffffff"; ctx.font = "700 30px 'Barlow Condensed', 'Inter', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText(String(i + 1), bx + bw + (b - bw) / 2, by + b / 2 + 1)
  })
  return new Promise((ok, no) => out.toBlob(bl => (bl ? ok(bl) : no(new Error("draw"))), "image/png"))
}

export function exportFontCSS(): Promise<string> {
  if (!fontCache) fontCache = (async () => {
    const css = await (await fetch(EXPORT_FONTS)).text()
    const parts = css.split("@font-face")
    const out: string[] = []
    for (let n = 1; n < parts.length; n++) {
      const block = parts[n], before = parts[n - 1]
      const c = before.lastIndexOf("/*"), subset = c >= 0 ? before.slice(c + 2, before.indexOf("*/", c)).trim() : "latin"
      if (subset !== "latin" && subset !== "latin-ext") continue
      const family = prop(block, "font-family").replace(/['"]/g, "")
      const weight = parseInt(prop(block, "font-weight"), 10)
      if (!NEED[family]?.includes(weight) || prop(block, "font-style").includes("italic")) continue
      const u = block.indexOf("url(")
      if (u < 0) continue
      const url = block.slice(u + 4, block.indexOf(")", u)).replace(/['"]/g, "")
      const range = prop(block, "unicode-range")
      const data = await blobToData(await (await fetch(url)).blob())
      out.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(${data}) format('woff2');${range ? `unicode-range:${range};` : ""}}`)
    }
    return out.join("")
  })().catch(() => { fontCache = null; return "" })
  return fontCache
}
