import type { ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { Marks } from "./Marks"
import { fitCalib } from "./calib"
import { readShotData, signed, loadItem, matchLine, type Match } from "./items"
import { canvasBlob, renderShot, type RenderOpts } from "./Render"
import { DEFAULT_OPTS } from "./Render"

/* Draws a Game Shot to a picture without opening it in the editor: the same picture, marks, seal and notes
   the Render button makes. Used for threads and share links, many at once. */

export type Seal = (w: number, h: number) => ReactNode

export async function renderSaved(userId: string, id: string, seal: Seal, opts: Partial<RenderOpts>, maxW = 1920, kickerFallback = "") {
  const row = await loadItem(id, userId)
  if (!row || row.kind !== "shot") throw new Error("not a shot")
  const d = readShotData(row.data, userId)
  if (!d.path) throw new Error("no picture")
  const src = (await signed([d.path]))[d.path]
  if (!src) throw new Error("no link")
  // the picture comes down once as a blob, so drawing it never trips over cross-site rules
  const blob = await (await fetch(src)).blob()
  const local = URL.createObjectURL(blob)
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:10px;height:10px;overflow:hidden"
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    const fit = d.calib ? fitCalib(d.calib) : null
    flushSync(() => root.render(
      <svg viewBox={`0 0 ${d.w} ${d.h}`} width={d.w} height={d.h} xmlns="http://www.w3.org/2000/svg">
        <image href={local} x={0} y={0} width={d.w} height={d.h} preserveAspectRatio="none" data-pic="1" />
        {d.dim > 0 && <rect width={d.w} height={d.h} fill="#000" fillOpacity={d.dim} />}
        <Marks items={d.items} w={d.w} h={d.h} fit={fit} />
        {seal(d.w, d.h)}
      </svg>
    ))
    const svg = host.querySelector("svg") as SVGSVGElement
    const notes = { ...d.notes, kicker: d.notes.kicker || kickerFallback }
    const cv = await renderShot({ svg, src: local, w: d.w, h: d.h, notes, opts: { ...DEFAULT_OPTS, ...opts }, maxW })
    return { canvas: cv, data: d, row }
  } finally {
    root.unmount(); host.remove()
    setTimeout(() => URL.revokeObjectURL(local), 5000)
  }
}

/** A post's text: "2/5 Headline\nBody", kept to X's 280 characters */
export function postText(n: number, total: number, head: string, body: string, limit = 280) {
  const tag = total > 1 ? `${n}/${total} ` : ""
  let t = `${tag}${head.trim()}${head.trim() && body.trim() ? "\n\n" : ""}${body.trim()}`.trim()
  if (t.length > limit) t = t.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…"
  return t
}

/** Draws "2/5" in the top right corner of a rendered picture */
export function stampNumber(cv: HTMLCanvasElement, n: number, total: number) {
  const ctx = cv.getContext("2d")!
  const k = Math.max(0.5, cv.width / 1920), text = `${n}/${total}`
  ctx.save()
  ctx.font = `800 ${Math.round(34 * k)}px "Barlow Condensed", sans-serif`
  const w = ctx.measureText(text).width + 28 * k, h = 50 * k, x = cv.width - w - 26 * k, y = 26 * k
  ctx.fillStyle = "#d7ff3c"; ctx.beginPath(); ctx.roundRect(x, y, w, h, 8 * k); ctx.fill()
  ctx.fillStyle = "#0a0c0f"; ctx.textBaseline = "middle"; ctx.fillText(text, x + 14 * k, y + h / 2 + 1)
  ctx.restore()
}

export { canvasBlob, matchLine }
export type { Match }
