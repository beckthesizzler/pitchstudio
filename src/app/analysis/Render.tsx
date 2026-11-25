import { useEffect, useRef, useState } from "react"
import { Copy, Download, Loader2, Mic, Square, X } from "lucide-react"
import { exportFontCSS, type Notes } from "./model"
import { SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* Render: how a shot or a video leaves PitchStudio. The picture can be cropped for where it's going, given a look
   (cleaner, sharper, richer grass) and, for a shot, the notes written under it. Marks, words and the seal are
   drawn fresh at full size on top, so they stay sharp whatever the picture. Everything happens on this computer. */

export type Format = "orig" | "16:9" | "4:5" | "1:1" | "9:16"
export type RenderOpts = {
  format: Format; offset: number // -1 (left) to 1 (right): where a narrower crop sits
  size: "source" | "1080" | "720"; fps: 30 | 60; quality: "std" | "high" | "master"
  clean: "off" | "light" | "strong"; sharpen: boolean; look: "natural" | "broadcast" | "night"
  sound: "original" | "duck" | "off"; notes: boolean; file: "png" | "jpg"
}
export const DEFAULT_OPTS: RenderOpts = { format: "orig", offset: 0, size: "source", fps: 60, quality: "high", clean: "light", sharpen: true, look: "broadcast", sound: "duck", notes: true, file: "png" }
const RATIO: Record<Exclude<Format, "orig">, number> = { "16:9": 16 / 9, "4:5": 4 / 5, "1:1": 1, "9:16": 9 / 16 }
const LOOK: Record<RenderOpts["look"], string> = { natural: "", broadcast: "contrast(1.12) saturate(1.22) brightness(1.03)", night: "contrast(1.16) saturate(1.12) brightness(1.1)" }

/** The svg filters a picture can be drawn through (mounted once on the page, so canvases can use them by name) */
export function FilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
      <filter id="ps-sharp" colorInterpolationFilters="sRGB"><feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix="0 -0.55 0 -0.55 3.2 -0.55 0 -0.55 0" /></filter>
      <filter id="ps-clean" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="0.45" /></filter>
      <filter id="ps-clean-sharp" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="0.45" result="b" /><feConvolveMatrix in="b" order="3" preserveAlpha="true" kernelMatrix="0 -0.6 0 -0.6 3.4 -0.6 0 -0.6 0" /></filter>
      <filter id="ps-strong" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="0.85" /></filter>
      <filter id="ps-strong-sharp" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="0.85" result="b" /><feConvolveMatrix in="b" order="3" preserveAlpha="true" kernelMatrix="0 -0.7 0 -0.7 3.8 -0.7 0 -0.7 0" /></filter>
    </svg>
  )
}
/** The css filter for the picture under the marks */
export function pictureFilter(o: Pick<RenderOpts, "look" | "sharpen" | "clean">) {
  const f = o.clean === "off" ? (o.sharpen ? "url(#ps-sharp)" : "") : o.clean === "light" ? (o.sharpen ? "url(#ps-clean-sharp)" : "url(#ps-clean)") : (o.sharpen ? "url(#ps-strong-sharp)" : "url(#ps-strong)")
  return [LOOK[o.look], f].filter(Boolean).join(" ") || "none"
}
/** The same clean-up, sharpen and look, done on the graphics card: for video, where a css filter on a canvas is
    far too slow (it runs on the processor, frame after frame). Gives back null where WebGL isn't there. */
export function makeGrader(W: number, H: number, o: Pick<RenderOpts, "look" | "sharpen" | "clean">) {
  const sig = o.clean === "light" ? 0.45 : o.clean === "strong" ? 0.85 : 0
  const [c, e] = !o.sharpen ? [1, 0] : o.clean === "off" ? [3.2, 0.55] : o.clean === "light" ? [3.4, 0.6] : [3.8, 0.7]
  const [ct, sat, br] = o.look === "broadcast" ? [1.12, 1.22, 1.03] : o.look === "night" ? [1.16, 1.12, 1.1] : [1, 1, 1]
  if (!sig && !e && o.look === "natural") return null
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H
  const gl = cv.getContext("webgl", { preserveDrawingBuffer: true, premultipliedAlpha: false, antialias: false })
  if (!gl) return null
  const g = (d: number) => (sig ? Math.exp(-(d * d) / (2 * sig * sig)) : d === 0 ? 1 : 0)
  const w0 = g(0), w1 = g(1), w2 = g(Math.SQRT2), tot = w0 + 4 * w1 + 4 * w2
  const VS = "attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }"
  const BLUR = `precision mediump float; varying vec2 uv; uniform sampler2D t; uniform vec4 r; uniform vec2 px;
    vec4 at(vec2 o){ vec2 q = uv + o * px; return texture2D(t, vec2(r.x + q.x * r.z, r.y + q.y * r.w)); }
    void main(){ gl_FragColor = (at(vec2(0.0)) * ${(w0 / tot).toFixed(5)}
      + (at(vec2(1.0,0.0)) + at(vec2(-1.0,0.0)) + at(vec2(0.0,1.0)) + at(vec2(0.0,-1.0))) * ${(w1 / tot).toFixed(5)}
      + (at(vec2(1.0,1.0)) + at(vec2(-1.0,1.0)) + at(vec2(1.0,-1.0)) + at(vec2(-1.0,-1.0))) * ${(w2 / tot).toFixed(5)}); }`
  const GRADE = `precision mediump float; varying vec2 uv; uniform sampler2D t; uniform vec2 px;
    void main(){
      vec3 m = texture2D(t, uv).rgb * ${c.toFixed(4)} - (texture2D(t, uv + vec2(px.x, 0.0)).rgb + texture2D(t, uv - vec2(px.x, 0.0)).rgb
        + texture2D(t, uv + vec2(0.0, px.y)).rgb + texture2D(t, uv - vec2(0.0, px.y)).rgb) * ${e.toFixed(4)};
      m = clamp(m, 0.0, 1.0);
      m = clamp((m - 0.5) * ${ct.toFixed(4)} + 0.5, 0.0, 1.0);
      float l = dot(m, vec3(0.2126, 0.7152, 0.0722));
      m = clamp(mix(vec3(l), m, ${sat.toFixed(4)}), 0.0, 1.0) * ${br.toFixed(4)};
      gl_FragColor = vec4(clamp(m, 0.0, 1.0), 1.0); }`
  const prog = (fs: string) => {
    const pr = gl.createProgram()!
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]] as const) {
      const sh = gl.createShader(type)!; gl.shaderSource(sh, src); gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader")
      gl.attachShader(pr, sh)
    }
    gl.bindAttribLocation(pr, 0, "p"); gl.linkProgram(pr)
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("link")
    return pr
  }
  try {
    const pBlur = prog(BLUR), pGrade = prog(GRADE)
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const tex = () => { const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE); for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR); return t }
    const src = tex(), mid = tex()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, mid, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, W, H)
    return {
      /** the part (sx, sy, sw, sh) of a picture iw by ih, graded, at W by H */
      draw(img: TexImageSource, iw: number, ih: number, sx: number, sy: number, sw: number, sh: number): HTMLCanvasElement {
        gl.bindTexture(gl.TEXTURE_2D, src); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.useProgram(pBlur)
        gl.uniform4f(gl.getUniformLocation(pBlur, "r"), sx / iw, 1 - (sy + sh) / ih, sw / iw, sh / ih)
        gl.uniform2f(gl.getUniformLocation(pBlur, "px"), 1 / W, 1 / H)
        gl.uniform1i(gl.getUniformLocation(pBlur, "t"), 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(pGrade); gl.bindTexture(gl.TEXTURE_2D, mid)
        gl.uniform2f(gl.getUniformLocation(pGrade, "px"), 1 / W, 1 / H)
        gl.uniform1i(gl.getUniformLocation(pGrade, "t"), 0)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        return cv
      },
    }
  } catch (err) { console.warn("grader", err); return null }
}
/** The part of a w by h picture a format keeps */
export function cropRect(w: number, h: number, format: Format, offset: number) {
  if (format === "orig") return { x: 0, y: 0, w, h }
  const r = RATIO[format]
  if (w / h > r) { const cw = Math.round(h * r); return { x: Math.round(((w - cw) / 2) * (1 + Math.max(-1, Math.min(1, offset)))), y: 0, w: cw, h } }
  const ch = Math.round(w / r); return { x: 0, y: Math.round((h - ch) / 2), w, h: ch }
}

/** An svg on the page as a picture (with the export fonts inside it). keep: which parts stay */
export async function svgImage(svg: SVGSVGElement, w: number, h: number, edit?: (c: SVGSVGElement) => void): Promise<HTMLImageElement> {
  const css = await exportFontCSS()
  const c = svg.cloneNode(true) as SVGSVGElement
  c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", String(w)); c.setAttribute("height", String(h)); c.removeAttribute("style")
  edit?.(c)
  if (css) { const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = css; c.insertBefore(st, c.firstChild) }
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: "image/svg+xml;charset=utf-8" }))
  try { return await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("draw")); i.src = url }) }
  finally { setTimeout(() => URL.revokeObjectURL(url), 2000) }
}
export const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("load")); i.src = src })

/** Moves the seal in a cloned stage to the bottom right of the crop */
export function placeSeal(c: SVGSVGElement, crop: { x: number; y: number; w: number; h: number }, w: number) {
  const g = c.querySelector("[data-seal]")
  if (!g) return
  const u = Math.max(0.35, w / 1920)
  g.setAttribute("transform", (g.getAttribute("transform") ?? "").replace(/translate\([^)]*\)/, `translate(${crop.x + crop.w - 8 * u},${crop.y + crop.h - 8 * u})`))
}

/* ── the notes under a picture, drawn on a canvas ── */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = []
  for (const para of text.split("\n")) {
    let line = ""
    for (const word of para.split(/\s+/)) {
      const t = line ? line + " " + word : word
      if (ctx.measureText(t).width > max && line) { out.push(line); line = word } else line = t
    }
    out.push(line)
  }
  return out
}
export async function notesHeight(n: Notes, W: number) {
  const k = W / 1600
  const cv = document.createElement("canvas").getContext("2d")!
  cv.font = `400 ${Math.round(22 * k)}px Inter, sans-serif`
  const lines = n.body.trim() ? wrap(cv, n.body.trim(), W - 2 * 44 * k - 30 * k).length : 0
  return Math.round(5 * k + 34 * k + (n.kicker.trim() ? 26 * k : 0) + (n.head.trim() ? 62 * k : 0) + lines * 33 * k + 30 * k)
}
export async function drawNotes(ctx: CanvasRenderingContext2D, n: Notes, x: number, y: number, W: number, H: number) {
  const k = W / 1600
  await Promise.all([document.fonts?.load(`800 ${Math.round(58 * k)}px "Barlow Condensed"`), document.fonts?.load(`600 ${Math.round(16 * k)}px "Barlow Condensed"`)].map(p => p?.catch(() => null)))
  ctx.save()
  ctx.fillStyle = "#0f1114"; ctx.fillRect(x, y, W, H)
  ctx.fillStyle = "#d7ff3c"; ctx.fillRect(x, y, W, Math.max(3, 5 * k))
  const pad = 44 * k
  let cy = y + 5 * k + 30 * k
  ctx.textBaseline = "top"
  if (n.kicker.trim()) {
    ctx.fillStyle = "#d7ff3c"; ctx.font = `600 ${Math.round(16 * k)}px "Barlow Condensed", sans-serif`
    ;(ctx as any).letterSpacing = `${4 * k}px`; ctx.fillText(n.kicker.trim().toUpperCase(), x + pad, cy); (ctx as any).letterSpacing = "0px"
    cy += 26 * k
  }
  if (n.head.trim()) {
    ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(58 * k)}px "Barlow Condensed", sans-serif`
    ctx.fillText(n.head.trim().toUpperCase(), x + pad, cy, W - 2 * pad)
    cy += 62 * k
  }
  if (n.body.trim()) {
    ctx.fillStyle = "#c9ccd3"; ctx.font = `400 ${Math.round(22 * k)}px Inter, sans-serif`
    for (const l of wrap(ctx, n.body.trim(), W - 2 * pad - 30 * k)) { ctx.fillText(l, x + pad, cy); cy += 33 * k }
  }
  ctx.restore()
}

/** A shot, rendered: the picture (cropped, with its look), the marks and seal on top, the notes under it */
export async function renderShot(o: { svg: SVGSVGElement; src: string; w: number; h: number; notes: Notes; opts: RenderOpts; maxW?: number }): Promise<HTMLCanvasElement> {
  const { svg, src, w, h, notes, opts } = o
  const crop = cropRect(w, h, opts.format, opts.offset)
  const s = o.maxW ? Math.min(1, o.maxW / crop.w) : 1
  const W = Math.round(crop.w * s), Hp = Math.round(crop.h * s)
  const withNotes = opts.notes && notes.show && !!(notes.head.trim() || notes.body.trim() || notes.kicker.trim())
  const NH = withNotes ? await notesHeight(notes, W) : 0
  const cv = document.createElement("canvas"); cv.width = W; cv.height = Hp + NH
  const ctx = cv.getContext("2d")!
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, Hp)
  const pic = await loadImg(src)
  ctx.save(); ctx.filter = pictureFilter(opts)
  ctx.drawImage(pic, (crop.x / w) * pic.naturalWidth, (crop.y / h) * pic.naturalHeight, (crop.w / w) * pic.naturalWidth, (crop.h / h) * pic.naturalHeight, 0, 0, W, Hp)
  ctx.restore()
  const marks = await svgImage(svg, w, h, c => { c.querySelector("[data-pic]")?.remove(); placeSeal(c, crop, w) })
  ctx.drawImage(marks, crop.x, crop.y, crop.w, crop.h, 0, 0, W, Hp)
  if (withNotes) await drawNotes(ctx, notes, 0, Hp, W, NH)
  return cv
}
export const canvasBlob = (cv: HTMLCanvasElement, type: "image/png" | "image/jpeg", q = 0.92) => new Promise<Blob>((ok, no) => cv.toBlob(b => (b ? ok(b) : no(new Error("draw"))), type, q))

/* ── the panel ── */
type Row<T> = { label: string; note?: string; value: T; options: [T, string][]; set: (v: T) => void }
function Opt<T extends string | number | boolean>({ label, note, value, options, set }: Row<T>) {
  return (
    <div className="rn-row">
      <div><b>{label}</b>{note && <small>{note}</small>}</div>
      <div className="rn-seg" role="group" aria-label={label}>
        {options.map(([v, t]) => <button key={String(v)} aria-pressed={value === v} className={value === v ? "on" : ""} onClick={() => set(v)}>{t}</button>)}
      </div>
    </div>
  )
}

export function RenderPanel({ kind, title, w, h, opts, setOpts, preview, before, onRender, onCopy, onClose, busy, voice, onVoice, recording }: {
  kind: "shot" | "video"; title: string; w: number; h: number
  opts: RenderOpts; setOpts: (o: RenderOpts) => void
  preview: string | null // the rendered picture (shot) or the graded frame (video)
  before: string | null // the frame as it is (video compare)
  onRender: () => void; onCopy?: () => void; onClose: () => void
  busy: string | null
  voice?: boolean; onVoice?: () => void; recording?: boolean
}) {
  const [cmp, setCmp] = useState(0.5)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); onClose() } }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [busy, onClose])
  const set = <K extends keyof RenderOpts>(k: K) => (v: RenderOpts[K]) => setOpts({ ...opts, [k]: v })
  const crop = cropRect(w, h, opts.format, opts.offset)
  const scale = opts.size === "source" ? 1 : Math.min(1, (opts.size === "1080" ? 1080 : 720) / Math.min(crop.w, crop.h))
  const outW = Math.round(crop.w * scale / 2) * 2, outH = Math.round(crop.h * scale / 2) * 2
  const move = (cx: number) => { const r = boxRef.current?.getBoundingClientRect(); if (r) setCmp(Math.max(0.02, Math.min(0.98, (cx - r.left) / r.width))) }
  return (
    <div className="rn-scrim" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <style>{`
        .rn-scrim { position: fixed; inset: 0; z-index: 70; background: rgba(8,9,12,.72); display: grid; place-items: center; padding: 3vh 3vw; }
        .rn { width: min(1240px, 100%); max-height: 94vh; background: #1f2024; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 18px; display: grid; grid-template-columns: minmax(0,1fr) 440px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.6); color: ${TEXT_PRIMARY}; font-family: Inter, sans-serif; }
        .rn-l { padding: 22px; border-right: 1px solid ${DS_BORDER}; display: flex; flex-direction: column; min-height: 0; }
        .rn-k { font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: .3em; text-transform: uppercase; color: #d7ff3c; }
        .rn-h { font: 800 34px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 6px 0 14px; }
        .rn-prev { position: relative; flex: 1; min-height: 240px; border-radius: 10px; overflow: hidden; background: #0b0c0f; display: grid; place-items: center; }
        .rn-prev img { max-width: 100%; max-height: 62vh; display: block; }
        .rn-cmp { position: relative; width: 100%; height: 100%; min-height: 300px; cursor: ew-resize; touch-action: none; }
        .rn-cmp img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; max-height: none; }
        .rn-cmp .line { position: absolute; top: 0; bottom: 0; width: 2px; background: #d7ff3c; }
        .rn-cmp .knob { position: absolute; top: 50%; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: #d7ff3c; color: #0a0c0f; display: grid; place-items: center; font: 800 14px Inter; }
        .rn-tag { position: absolute; top: 10px; font: 600 12px Inter; padding: 4px 9px; border-radius: 6px; background: rgba(10,12,15,.8); }
        .rn-tag.v { color: #d7ff3c; border: 1px solid rgba(215,255,60,.35); }
        .rn-cap { color: ${TEXT_MUTED}; font-size: 13px; line-height: 1.5; margin-top: 10px; }
        .rn-r { padding: 20px 22px; display: flex; flex-direction: column; overflow-y: auto; }
        .rn-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
        .rn-row b { display: block; font-weight: 600; font-size: 14px; } .rn-row small { display: block; color: ${TEXT_MUTED}; font-size: 11.5px; margin-top: 2px; }
        .rn-seg { display: inline-flex; padding: 3px; border-radius: 9px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; flex-wrap: nowrap; flex: none; white-space: nowrap; }
        .rn-seg button { border: none; background: none; color: ${TEXT_MUTED}; font: 600 12.5px Inter, sans-serif; padding: 5px 10px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
        .rn-seg button.on { background: #d7ff3c; color: #0a0c0f; }
        .rn-foot { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding-top: 12px; }
        .rn-foot small { color: ${TEXT_MUTED}; font-size: 12px; line-height: 1.4; flex: 1; }
        .rn-btn { height: 40px; padding: 0 16px; border-radius: 10px; border: 1px solid ${DS_BORDER_STRONG}; background: none; color: ${TEXT_PRIMARY}; font: 600 13.5px Inter, sans-serif; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
        .rn-btn.pri { background: #d7ff3c; color: #0a0c0f; border-color: #d7ff3c; }
        .rn-btn:disabled { opacity: .5; cursor: default; }
        .rn-btn:hover:not(:disabled) { background: ${SURFACE_2}; } .rn-btn.pri:hover:not(:disabled) { filter: brightness(1.05); background: #d7ff3c; }
        .rn-x { position: absolute; right: 14px; top: 14px; width: 34px; height: 34px; border-radius: 9px; border: none; background: none; color: ${TEXT_MUTED}; cursor: pointer; display: grid; place-items: center; }
        .rn-slide { display: flex; align-items: center; gap: 8px; } .rn-slide input { width: 140px; accent-color: #d7ff3c; }
        @media (max-width: 980px) { .rn { grid-template-columns: 1fr; } .rn-l { border-right: none; border-bottom: 1px solid ${DS_BORDER}; } }
        .rn-spin { animation: rnSpin 1s linear infinite; } @keyframes rnSpin { to { transform: rotate(360deg); } }
      `}</style>
      <div className="rn" role="dialog" aria-label={`Render ${title}`} style={{ position: "relative" }}>
        <div className="rn-l">
          <div className="rn-k">Render · {title}</div>
          <div className="rn-h">{kind === "video" ? "Make it look broadcast" : "Ready to post"}</div>
          <div className="rn-prev">
            {kind === "video" && before && preview ? (
              <div className="rn-cmp" ref={boxRef} onPointerDown={e => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); move(e.clientX) }}
                onPointerMove={e => { if (dragging.current) move(e.clientX) }} onPointerUp={() => { dragging.current = false }}>
                <img src={preview} alt="The frame, rendered" />
                <img src={before} alt="The frame as it is" style={{ clipPath: `inset(0 ${(1 - cmp) * 100}% 0 0)` }} />
                <div className="line" style={{ left: `${cmp * 100}%` }} /><div className="knob" style={{ left: `${cmp * 100}%` }}>⇆</div>
                <span className="rn-tag" style={{ left: 10 }}>Source</span><span className="rn-tag v" style={{ right: 10 }}>Rendered</span>
              </div>
            ) : preview ? <img src={preview} alt="Preview of the render" /> : <Loader2 className="rn-spin" size={22} color="#d7ff3c" />}
          </div>
          <p className="rn-cap">{kind === "video" ? "Drag the line to compare. Marks, words and your seal are drawn fresh at full size, so they stay sharp whatever the source." : "What you see is what you get: the picture with its look, your marks, your seal and your notes."}</p>
        </div>
        <div className="rn-r">
          <Opt label="Format" note={opts.format === "16:9" ? "X and YouTube" : opts.format === "4:5" ? "Instagram feed" : opts.format === "9:16" ? "Stories, Reels, TikTok" : opts.format === "1:1" ? "Square" : "As the source"} value={opts.format}
            options={[["orig", "Source"], ["16:9", "16:9"], ["4:5", "4:5"], ["1:1", "1:1"], ["9:16", "9:16"]]} set={set("format")} />
          {opts.format !== "orig" && crop.w < w && (
            <div className="rn-row"><div><b>Frame</b><small>Slide to choose what stays in</small></div>
              <div className="rn-slide"><span style={{ color: TEXT_MUTED, fontSize: 12 }}>Left</span><input type="range" min={-1} max={1} step={0.02} value={opts.offset} aria-label="Where the crop sits" onChange={e => set("offset")(+e.target.value)} /><span style={{ color: TEXT_MUTED, fontSize: 12 }}>Right</span></div>
            </div>
          )}
          {kind === "video" && <Opt label="Size" note={`${outW} × ${outH}`} value={opts.size} options={[["source", "Source"], ["1080", "1080p"], ["720", "720p"]]} set={set("size")} />}
          {kind === "video" && <Opt label="Frame rate" note={opts.fps === 60 ? "Smooth slow motion" : "Smaller file"} value={opts.fps} options={[[60, "60"], [30, "30"]]} set={set("fps")} />}
          {kind === "video" && <Opt label="Quality" value={opts.quality} options={[["std", "Standard"], ["high", "High"], ["master", "Master"]]} set={set("quality")} />}
          <Opt label="Clean up" note="Takes out recording noise" value={opts.clean} options={[["off", "Off"], ["light", "Light"], ["strong", "Strong"]]} set={set("clean")} />
          <Opt label="Sharpen" value={opts.sharpen} options={[[false, "Off"], [true, "On"]]} set={set("sharpen")} />
          <Opt label="Look" note="Richer grass, cleaner whites" value={opts.look} options={[["natural", "Natural"], ["broadcast", "Broadcast"], ["night", "Night"]]} set={set("look")} />
          {kind === "shot" && <Opt label="Notes under it" value={opts.notes} options={[[true, "On"], [false, "Off"]]} set={set("notes")} />}
          {kind === "shot" && <Opt label="File" note={opts.file === "png" ? "Sharpest" : "Smaller"} value={opts.file} options={[["png", "PNG"], ["jpg", "JPG"]]} set={set("file")} />}
          {kind === "video" && <Opt label="Sound" value={opts.sound} options={[["original", "Original"], ["duck", "Quieter in freezes"], ["off", "Off"]]} set={set("sound")} />}
          {kind === "video" && onVoice && (
            <div className="rn-row"><div><b>Voice-over</b><small>{voice ? "Recorded: it plays over the sound" : "Talk over it while it plays"}</small></div>
              <button className="rn-btn" style={{ height: 32 }} onClick={onVoice}>{recording ? <><Square size={13} fill="currentColor" /> Stop</> : <><Mic size={14} /> {voice ? "Record again" : "Record over it"}</>}</button>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div className="rn-foot">
            <small>{kind === "video" ? `${outW} × ${outH} · ${opts.fps} fps · made on this computer; your clip never leaves it` : "Made on this computer"}</small>
            {onCopy && <button className="rn-btn" disabled={!!busy} onClick={onCopy}><Copy size={15} /> Copy</button>}
            <button className="rn-btn pri" disabled={!!busy} onClick={onRender}>{busy ? <><Loader2 size={15} className="rn-spin" /> {busy}</> : <><Download size={15} /> {kind === "video" ? "Render video" : "Render picture"}</>}</button>
          </div>
        </div>
        <button className="rn-x" aria-label="Close" onClick={onClose} disabled={!!busy}><X size={17} /></button>
      </div>
    </div>
  )
}
