/* Pictures added to a board are saved inside the board itself, so they are made small before they go in:
   the long side at most 1600 pixels, a photo as a JPEG under about 900 KB, a picture with see-through parts kept as a PNG.
   Drawings (SVG) and small animated GIFs are kept exactly as they are. */

export const BOARD_LONG_SIDE = 1600
export const BOARD_INPUT_MAX_MB = 25
const JPEG_MAX = 900 * 1024
const PNG_MAX = 1536 * 1024
const KEEP_AS_IS = 1536 * 1024 // SVG and GIF files up to this size go in untouched

export type ShrunkImage = { src: string; w: number; h: number }

export const readAsData = (b: Blob) => new Promise<string>((ok, no) => {
  const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(new Error("unreadable")); fr.readAsDataURL(b)
})

const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("unreadable")); i.src = src
})

const toBlob = (cv: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>(ok => cv.toBlob(ok, type, q))

/** Makes a picture ready to live inside a board. Throws "not a picture", "too big" or "unreadable". */
export async function shrinkForBoard(file: Blob): Promise<ShrunkImage> {
  if (!file.type.startsWith("image/")) throw new Error("not a picture")
  if (file.size > BOARD_INPUT_MAX_MB * 1024 * 1024) throw new Error("too big")
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const iw = img.naturalWidth, ih = img.naturalHeight
    if (!iw || !ih) throw new Error("unreadable")
    // a drawing, or a small (maybe animated) GIF: kept exactly as it is
    if ((file.type === "image/svg+xml" || file.type === "image/gif") && file.size <= KEEP_AS_IS) {
      return { src: await readAsData(file), w: iw, h: ih }
    }
    const s = Math.min(1, BOARD_LONG_SIDE / Math.max(iw, ih))
    let w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s))
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h
    const ctx = cv.getContext("2d", { willReadFrequently: true })
    if (!ctx) throw new Error("unreadable")
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
      blob = await toBlob(cv, "image/png")
      for (const f of [0.8, 0.64, 0.5]) {
        if (!blob || blob.size <= PNG_MAX) break
        const c2 = document.createElement("canvas")
        c2.width = Math.max(1, Math.round(w * f)); c2.height = Math.max(1, Math.round(h * f))
        const x2 = c2.getContext("2d")
        if (!x2) break
        x2.imageSmoothingQuality = "high"; x2.drawImage(cv, 0, 0, c2.width, c2.height)
        const next = await toBlob(c2, "image/png")
        if (next) { blob = next; w = c2.width; h = c2.height }
      }
    } else {
      for (const q of [0.86, 0.78, 0.68]) { blob = await toBlob(cv, "image/jpeg", q); if (blob && blob.size <= JPEG_MAX) break }
    }
    if (!blob) throw new Error("unreadable")
    return { src: await readAsData(blob), w, h }
  } finally { URL.revokeObjectURL(url) }
}

/** Plain words for why a picture didn't go in. */
export function imageProblem(err: unknown): string {
  const m = err instanceof Error ? err.message : ""
  if (m === "not a picture") return "That isn't a picture. Use a PNG, JPG, WebP, GIF or SVG."
  if (m === "too big") return `That picture is over ${BOARD_INPUT_MAX_MB} MB.`
  return "That picture couldn't be opened. iPhone photos (HEIC) need saving as JPG first."
}
