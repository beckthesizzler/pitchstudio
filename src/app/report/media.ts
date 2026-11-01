import { supabase } from "../lib/supabase"

/* Match Report: photos and pictures. Photos live in a private bucket, in the creator's own folder (userId/reportId/photoId).
   A photo with see-through parts (a cut-out player PNG) stays a PNG, so it sits on the page without a box; anything else becomes a JPEG. */

export const MEDIA_BUCKET = "report-media"
export const INPUT_MAX_MB = 25
const LONG_SIDE = 1800

export const blobToData = (b: Blob) => new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error("read")); fr.readAsDataURL(b) })

/** Opens a picked, pasted or dropped picture: shrinks it (long side 1800 at most), keeps see-through parts, gives the file to store. */
export async function preparePhoto(file: Blob): Promise<{ blob: Blob; data: string; w: number; h: number; ext: "png" | "jpg" }> {
  if (!file.type.startsWith("image/")) throw new Error("not a picture")
  if (file.size > INPUT_MAX_MB * 1024 * 1024) throw new Error("too big")
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("unreadable")); i.src = url })
    const iw = img.naturalWidth, ih = img.naturalHeight
    if (!iw || !ih) throw new Error("unreadable")
    const s = Math.min(1, LONG_SIDE / Math.max(iw, ih))
    const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s))
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h
    const ctx = cv.getContext("2d", { willReadFrequently: true })!
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, 0, 0, w, h)
    // see-through anywhere? (only formats that can be)
    let alpha = false
    if (file.type !== "image/jpeg") {
      try {
        const px = ctx.getImageData(0, 0, w, h).data, step = Math.max(1, Math.floor((w * h) / 60000)) * 4
        for (let i = 3; i < px.length; i += step) if (px[i] < 250) { alpha = true; break }
      } catch { /* can't read it: treat it as solid */ }
    }
    let blob: Blob | null = null
    if (alpha) {
      // a cut-out stays a PNG; a very detailed one is made a little smaller until it fits comfortably
      let cw = w, ch = h
      blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, "image/png"))
      for (const f of [0.8, 0.62, 0.48]) {
        if (!blob || blob.size <= 9 * 1024 * 1024) break
        const c2 = document.createElement("canvas"); cw = c2.width = Math.max(1, Math.round(w * f)); ch = c2.height = Math.max(1, Math.round(h * f))
        const x2 = c2.getContext("2d")!; x2.imageSmoothingQuality = "high"; x2.drawImage(cv, 0, 0, cw, ch)
        blob = await new Promise<Blob | null>(ok => c2.toBlob(ok, "image/png"))
      }
      if (!blob) throw new Error("unreadable")
      return { blob, data: await blobToData(blob), w: cw, h: ch, ext: "png" }
    }
    else for (const q of [0.9, 0.82, 0.72]) { blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, "image/jpeg", q)); if (blob && blob.size < 6 * 1024 * 1024) break }
    if (!blob) throw new Error("unreadable")
    return { blob, data: await blobToData(blob), w, h, ext: alpha ? "png" : "jpg" }
  } finally { URL.revokeObjectURL(url) }
}

/* ── storage ── */
export async function uploadMedia(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blob, { contentType: path.endsWith(".png") ? "image/png" : "image/jpeg", upsert: true, cacheControl: "31536000" })
  if (error) throw error
}
export async function downloadMedia(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path)
    if (error || !data) return null
    return await blobToData(data)
  } catch { return null }
}
/** Short-lived links to photos, for the pictures in My reports (one request for all of them) */
export async function mediaLinks(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  if (!paths.length) return out
  try {
    const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths.slice(0, 300), 3600)
    for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl
  } catch { /* the pictures show without their photos */ }
  return out
}
/** Removes the files in a report's folder that the report no longer uses (photos deleted in an earlier visit) */
export async function tidyFolder(userId: string, reportId: string, keep: string[]) {
  try {
    const folder = `${userId}/${reportId}`
    const { data } = await supabase.storage.from(MEDIA_BUCKET).list(folder, { limit: 200 })
    const gone = (data ?? []).map(f => `${folder}/${f.name}`).filter(p => !keep.includes(p))
    if (gone.length) await supabase.storage.from(MEDIA_BUCKET).remove(gone)
  } catch { /* tidying can wait for the next visit */ }
}
export async function removeFolder(userId: string, reportId: string) { await tidyFolder(userId, reportId, []) }

/* ── fonts for exports: an exported picture is drawn from an svg, which can only use fonts that travel inside it ── */
const FONTS_URL = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap"
const NEED: Record<string, number[]> = { "Barlow Condensed": [600, 700, 800], Inter: [400, 500, 600, 700] }
let fontCache: Promise<string> | null = null
const prop = (block: string, name: string) => {
  const i = block.indexOf(name + ":")
  if (i < 0) return ""
  const j = block.indexOf(";", i), k = block.indexOf("}", i)
  const stop = j < 0 ? k : k < 0 ? j : Math.min(j, k)
  return block.slice(i + name.length + 1, stop < 0 ? undefined : stop).trim()
}
export function exportFonts(): Promise<string> {
  if (!fontCache) fontCache = (async () => {
    const css = await (await fetch(FONTS_URL)).text()
    const parts = css.split("@font-face"), out: string[] = []
    for (let n = 1; n < parts.length; n++) {
      const block = parts[n], before = parts[n - 1]
      const c = before.lastIndexOf("/*"), subset = c >= 0 ? before.slice(c + 2, before.indexOf("*/", c)).trim() : "latin"
      if (subset !== "latin" && subset !== "latin-ext") continue
      const family = prop(block, "font-family").split("'").join("").split('"').join("")
      const weight = parseInt(prop(block, "font-weight"), 10)
      if (!NEED[family]?.includes(weight) || prop(block, "font-style").includes("italic")) continue
      const u = block.indexOf("url(")
      if (u < 0) continue
      const url = block.slice(u + 4, block.indexOf(")", u)).split("'").join("").split('"').join("")
      const range = prop(block, "unicode-range")
      const data = await blobToData(await (await fetch(url)).blob())
      out.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};src:url(${data}) format('woff2');${range ? `unicode-range:${range};` : ""}}`)
    }
    return out.join("")
  })().catch(() => { fontCache = null; return "" })
  return fontCache
}

/** Draws the report's svg into a picture at its full size */
export async function svgToCanvas(svg: SVGSVGElement, W: number, H: number, solid: boolean): Promise<HTMLCanvasElement> {
  const css = await exportFonts()
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  clone.setAttribute("width", String(W)); clone.setAttribute("height", String(H)); clone.removeAttribute("style")
  clone.querySelectorAll("[data-ui]").forEach(n => n.remove()) // nothing of the editor goes into the picture
  if (css) { const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = css; clone.insertBefore(st, clone.firstChild) }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }))
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("draw")); i.src = url })
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H
    const ctx = cv.getContext("2d")!
    if (solid) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H) }
    ctx.drawImage(img, 0, 0, W, H)
    return cv
  } finally { URL.revokeObjectURL(url) }
}
