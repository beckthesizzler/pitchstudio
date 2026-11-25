import { useEffect, useRef, useState, type ReactNode } from "react"
import { Camera, ChevronLeft, ChevronRight, Diamond, FileVideo, Pause, Play, Plus, Trash2, Check } from "lucide-react"
import { Marks } from "./Marks"
import { exportStarted } from "../lib/telemetry"
import { MAX_MOMENTS, newId, type Mark, type Moment, type Notes, type VideoProject } from "./model"
import { mp4File, type AudioTrack } from "../lib/mp4"
import { DEFAULT_OPTS, cropRect, makeGrader, pictureFilter, placeSeal, svgImage, type RenderOpts } from "./Render"
import { fitCalib } from "./calib"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, ACCENT_SOLID, ACCENT_INK } from "../theme"

/* The video studio: a match clip up to 10 minutes, kept on this device. Scrub it frame by frame, set where the clip
   starts and ends, and add moments: the clip freezes there for a few seconds while your drawings appear (drawn with the
   same tools as a shot). Export makes an MP4 of it all, drawn frame by frame in the browser. */

const FPS = 30
export const fmtTime = (t: number, frames = true) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.min(FPS - 1, Math.floor((t % 1) * FPS + 0.001))
  return `${m}:${String(s).padStart(2, "0")}${frames ? "." + String(f).padStart(2, "0") : ""}`
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** The key a frame of the clip is kept under */
export const frameKey = (t: number) => t.toFixed(2)
/** Even times across a clip, for the picture strip under the timeline */
export const stripTimes = (dur: number, n = 24) => dur > 0 ? Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * dur) : []

/** Small pictures of the clip at these times (for the timeline and the moments list), drawn one by one from a
    second, hidden copy of the video so the one you watch never jumps. Kept until the file changes. */
export function useClipFrames(file: File | null, times: number[], width = 160) {
  const [frames, setFrames] = useState<Record<string, string>>({})
  const got = useRef<Record<string, string>>({})
  const forFile = useRef<File | null>(null)
  const want = [...new Set(times.map(frameKey))].join(",")
  useEffect(() => {
    if (forFile.current !== file) { forFile.current = file; got.current = {}; setFrames({}) }
    const todo = want ? want.split(",").filter(k => !(k in got.current)) : []
    if (!file || !todo.length) return
    let off = false
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url
    const cv = document.createElement("canvas")
    ;(async () => {
      await new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(new Error("load")) })
      cv.width = width; cv.height = Math.max(1, Math.round((width * (v.videoHeight || 9)) / (v.videoWidth || 16)))
      const ctx = cv.getContext("2d")
      if (!ctx) return
      for (const k of todo) {
        if (off) return
        await new Promise<void>(ok => {
          const t0 = window.setTimeout(ok, 1500)
          v.onseeked = () => { clearTimeout(t0); ok() }
          v.currentTime = Math.max(0, Math.min(+k, (v.duration || +k) - 0.05))
        })
        if (off) return
        ctx.drawImage(v, 0, 0, cv.width, cv.height)
        got.current[k] = cv.toDataURL("image/jpeg", 0.72)
        setFrames({ ...got.current })
      }
    })().catch(() => { /* no pictures: the timeline still works */ }).finally(() => { v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url) })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, want])
  return frames
}


/** The build steps of a moment: each step number its marks share, and when it appears (seconds after the freeze) */
export function stepsOf(m: Moment): { step: number; at: number; marks: Mark[] }[] {
  const groups = new Map<number, Mark[]>()
  m.items.forEach((x, i) => { const s = x.step ?? i + 1; groups.set(s, [...(groups.get(s) ?? []), x]) })
  return [...groups.keys()].sort((a, b) => a - b).map((step, k) => ({ step, at: m.steps?.[String(step)] ?? 0.25 + k * 0.75, marks: groups.get(step)! }))
}
/** Where a moment's caption goes: the edge (top or bottom) with fewer marks near it, so it doesn't cover them */
export function captionAtBottom(m: Moment, h: number, w = h * 16 / 9) {
  let top = 0, bottom = 0
  // only what the box would cover: the left two thirds, a quarter of the height from that edge. Name tags count most
  const see = (x: number, y: number, k = 1) => { if (x > w * 0.7) return; if (y < h * 0.27) top += k; else if (y > h * 0.73) bottom += k }
  for (const it of m.items as any[]) {
    if (typeof it.x === "number" && typeof it.y === "number") see(it.kind === "tag" ? it.x + (it.dx ?? 0) : it.x, it.kind === "tag" ? it.y + (it.dy ?? 0) : it.y, it.kind === "tag" || it.kind === "text" ? 3 : 1)
    for (const k of ["a", "b", "c"]) if (Array.isArray(it[k])) see(it[k][0], it[k][1])
    if (Array.isArray(it.pts)) for (const q of it.pts) if (Array.isArray(q)) see(q[0], q[1], 0.5)
  }
  return bottom < top
}
/** A moment's caption, top left or bottom left, over the frozen picture */
export function drawCaption(ctx: CanvasRenderingContext2D, c: Notes, W: number, H: number, alpha: number, atBottom = false) {
  const k = Math.min(W, H * 1.78) / 1920
  const pad = 30 * k, x = 44 * k, maxW = Math.min(W - 2 * x, 1250 * k)
  ctx.save(); ctx.globalAlpha = alpha
  ctx.font = `400 ${Math.round(24 * k)}px Inter, sans-serif`
  const words = c.body.trim().split(/\s+/).filter(Boolean), lines: string[] = []
  let line = ""
  for (const w0 of words) { const t = line ? line + " " + w0 : w0; if (ctx.measureText(t).width > maxW - 2 * pad - 6 * k && line) { lines.push(line); line = w0 } else line = t }
  if (line) lines.push(line)
  const hh = (c.kicker.trim() ? 28 * k : 0) + (c.head.trim() ? 70 * k : 0) + lines.slice(0, 3).length * 34 * k
  const bh = hh + 2 * pad - 6 * k
  const y = atBottom ? H - 30 * k - bh - 64 * k : 30 * k // above the seal at the bottom
  ctx.fillStyle = "rgba(11,12,15,0.88)"; ctx.fillRect(x, y, maxW, bh)
  ctx.fillStyle = "#d7ff3c"; ctx.fillRect(x, y, 6 * k, bh)
  ctx.textBaseline = "top"
  let cy = y + pad - 4 * k
  if (c.kicker.trim()) { ctx.fillStyle = "#d7ff3c"; ctx.font = `600 ${Math.round(19 * k)}px "Barlow Condensed", sans-serif`; (ctx as any).letterSpacing = `${5 * k}px`; ctx.fillText(c.kicker.trim().toUpperCase(), x + pad + 6 * k, cy); (ctx as any).letterSpacing = "0px"; cy += 28 * k }
  if (c.head.trim()) { ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(66 * k)}px "Barlow Condensed", sans-serif`; ctx.fillText(c.head.trim().toUpperCase(), x + pad + 6 * k, cy, maxW - 2 * pad); cy += 70 * k }
  ctx.fillStyle = "#cfd2d8"; ctx.font = `400 ${Math.round(24 * k)}px Inter, sans-serif`
  for (const l of lines.slice(0, 3)) { ctx.fillText(l, x + pad + 6 * k, cy); cy += 34 * k }
  ctx.restore()
}

/** The sound of the render: the clip's own sound where the picture plays, the sound around a freeze while it is frozen
    (quieter, if asked), and a voice-over on top. Encoded as AAC, or Opus where AAC can't be made. */
async function soundTrack(o: { file: File; segs: { out: number; len: number; src: number; sync: boolean }[]; dur: number; duck: number; original: boolean; voice: AudioBuffer | null }): Promise<AudioTrack | null> {
  if (typeof AudioEncoder === "undefined") return null
  const RATE = 48000, N = Math.ceil(o.dur * RATE)
  const L = new Float32Array(N), R = new Float32Array(N)
  if (o.original && o.file.size < 700 * 1024 * 1024) {
    const actx = new OfflineAudioContext(2, RATE, RATE)
    const src = await actx.decodeAudioData(await o.file.arrayBuffer()).catch(() => null)
    if (src) {
      const c0 = src.getChannelData(0), c1 = src.numberOfChannels > 1 ? src.getChannelData(1) : c0
      const ramp = Math.round(0.03 * RATE)
      for (const s of o.segs) {
        const g = s.sync ? 1 : o.duck, n = Math.round(s.len * RATE), a = Math.round(s.out * RATE), b = Math.round(s.src * RATE)
        for (let i = 0; i < n && a + i < N; i++) {
          const k = b + i
          if (k >= c0.length) break
          const env = Math.min(1, i / ramp, (n - i) / ramp) * g * (o.voice ? 0.5 : 1)
          L[a + i] += c0[k] * env; R[a + i] += c1[k] * env
        }
      }
    }
  }
  if (o.voice) {
    const v0 = o.voice.getChannelData(0), v1 = o.voice.numberOfChannels > 1 ? o.voice.getChannelData(1) : v0
    for (let i = 0; i < Math.min(N, v0.length); i++) { L[i] += v0[i]; R[i] += v1[i] }
  }
  for (let i = 0; i < N; i++) { L[i] = Math.max(-1, Math.min(1, L[i])); R[i] = Math.max(-1, Math.min(1, R[i])) }
  let codec: "aac" | "opus" | null = null, cfg: AudioEncoderConfig | null = null
  for (const [c, name] of [["mp4a.40.2", "aac"], ["opus", "opus"]] as const) {
    const t: AudioEncoderConfig = { codec: c, sampleRate: RATE, numberOfChannels: 2, bitrate: 160000 }
    try { if ((await AudioEncoder.isConfigSupported(t)).supported) { cfg = t; codec = name; break } } catch { /* next */ }
  }
  if (!cfg || !codec) return null
  const out: { data: Uint8Array; dur: number }[] = []
  let desc: Uint8Array | null = null, failed: unknown = null
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const d = meta?.decoderConfig?.description
      if (d && !desc) desc = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)) : new Uint8Array(d as ArrayBuffer)
      const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data)
      out.push({ data, dur: Math.max(1, Math.round(((chunk.duration ?? (codec === "aac" ? 21333 : 20000)) * RATE) / 1e6)) })
    },
    error: e => { failed = e },
  })
  enc.configure(cfg)
  const STEP = 4800
  for (let i = 0; i < N && !failed; i += STEP) {
    const n = Math.min(STEP, N - i), buf = new Float32Array(n * 2)
    buf.set(L.subarray(i, i + n), 0); buf.set(R.subarray(i, i + n), n)
    const ad = new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / RATE) * 1e6), data: buf })
    enc.encode(ad); ad.close()
    while (enc.encodeQueueSize > 8) await sleep(2)
  }
  await enc.flush(); enc.close()
  if (failed || !out.length) return null
  if (codec === "aac") out.forEach(f => { f.dur = 1024 })
  return { codec, rate: RATE, channels: 2, config: desc, frames: out }
}

export function VideoStudio({ project, file, missing, editing, onChoose, onSet, onOpenMoment, onCapture, seal, fileBase, exportRef, frameRef, openRef, frames, say, children }: {
  project: VideoProject | null; file: File | null; missing: boolean; editing: string | null
  onChoose: () => void
  onSet: (fn: (p: VideoProject) => VideoProject) => void
  onOpenMoment: (id: string | null, frame?: string) => void
  onCapture: (blob: Blob) => void
  seal: (w: number, h: number) => ReactNode
  fileBase: string
  exportRef: React.MutableRefObject<((o?: RenderOpts, voice?: AudioBuffer | null) => Promise<void>) | null>
  frameRef?: React.MutableRefObject<(() => Promise<string | null>) | null> // the frame on screen, as a picture (for the Render preview)
  openRef?: React.MutableRefObject<((id: string) => void) | null> // the moments list opens a moment through this
  frames?: Record<string, string> // small pictures of the clip, by frameKey
  say: (t: string) => void
  children: ReactNode
}) {
  const vRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [frozen, setFrozen] = useState<string | null>(null) // a moment showing while the clip plays
  const [drag, setDrag] = useState<null | "head" | "in" | "out">(null)
  const [making, setMaking] = useState<{ done: number; what?: string } | null>(null)
  const [frozenAt, setFrozenAt] = useState(0) // seconds into the freeze being shown (steps appear one by one)
  const [drawOff, setDrawOff] = useState(false) // while exporting: the seal and each moment's drawings, drawn off screen to be copied
  const offRef = useRef<HTMLDivElement>(null)
  const cancel = useRef(false)
  const raf = useRef(0), freezeTimer = useRef(0), lastT = useRef(0)

  useEffect(() => {
    if (!file) { setUrl(null); return }
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])
  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(freezeTimer.current) }, [])
  useEffect(() => { if (vRef.current) vRef.current.playbackRate = rate }, [rate, url])

  const p = project
  const dur = p?.dur ?? 0
  const moments = p?.moments ?? []
  const editingM = moments.find(m => m.id === editing) ?? null
  const frozenM = moments.find(m => m.id === frozen) ?? null

  const seek = (to: number) => {
    const v = vRef.current
    if (!v || !p) return
    const c = Math.max(0, Math.min(p.dur, to))
    v.currentTime = c; setT(c); lastT.current = c
  }
  const stop = () => { const v = vRef.current; v?.pause(); setPlaying(false); cancelAnimationFrame(raf.current); clearTimeout(freezeTimer.current); setFrozen(null) }
  // Playing: the clip freezes on each moment for its seconds with the drawings on, and stops at the end of the clip
  const tick = () => {
    const v = vRef.current
    if (!v || !p) return
    const now = v.currentTime, prev = lastT.current
    const hit = p.moments.find(m => m.t > prev && m.t <= now && m.t >= p.inT && m.t <= p.outT)
    if (hit) {
      v.pause(); v.playbackRate = rate; v.currentTime = hit.t; setT(hit.t); lastT.current = hit.t; setFrozen(hit.id); setFrozenAt(0)
      const t0 = performance.now()
      const clock = () => { const s0 = (performance.now() - t0) / 1000 * rate; setFrozenAt(s0); if (s0 < hit.hold) freezeTimer.current = window.setTimeout(clock, 50) as unknown as number; else { setFrozen(null); lastT.current = hit.t + 0.001; v.play().catch(() => {}); raf.current = requestAnimationFrame(tick) } }
      freezeTimer.current = window.setTimeout(clock, 50)
      return
    }
    // a slow lead-in: the clip slows down in the 0.4 seconds before a moment
    const next = p.moments.find(m => m.t > now && m.lead === "slow" && m.t - now <= 0.4)
    const want = next ? rate * 0.4 : rate
    if (Math.abs(v.playbackRate - want) > 0.01) v.playbackRate = want
    if (now >= p.outT - 0.001) { v.pause(); setPlaying(false); setT(p.outT); return }
    lastT.current = now; setT(now)
    raf.current = requestAnimationFrame(tick)
  }
  const play = () => {
    const v = vRef.current
    if (!v || !p) return
    if (editing) onOpenMoment(null)
    if (v.currentTime >= p.outT - 0.02 || v.currentTime < p.inT) { v.currentTime = p.inT; lastT.current = p.inT - 0.001 } else lastT.current = v.currentTime - 0.001
    v.play().then(() => { setPlaying(true); raf.current = requestAnimationFrame(tick) }).catch(() => say("This video can't play here."))
  }
  const step = (n: number) => { stop(); seek((vRef.current?.currentTime ?? t) + n / FPS) }

  /** The frame on screen, as a picture */
  const grab = async (type: "image/jpeg" | "dataurl"): Promise<Blob | string | null> => {
    const v = vRef.current
    if (!v || !p || !v.videoWidth) return null
    const cv = document.createElement("canvas"); cv.width = p.w; cv.height = p.h
    cv.getContext("2d")!.drawImage(v, 0, 0, p.w, p.h)
    if (type === "dataurl") return cv.toDataURL("image/jpeg", 0.92)
    return await new Promise<Blob | null>(ok => cv.toBlob(ok, "image/jpeg", 0.92))
  }
  const whenSeeked = () => new Promise<void>(ok => {
    const v = vRef.current
    if (!v) return ok()
    if (!v.seeking) { requestAnimationFrame(() => ok()); return }
    const done = () => { v.removeEventListener("seeked", done); requestAnimationFrame(() => ok()) }
    v.addEventListener("seeked", done)
  })
  const openMoment = async (m: Moment) => {
    stop(); seek(m.t); await whenSeeked()
    const frame = await grab("dataurl")
    onOpenMoment(m.id, typeof frame === "string" ? frame : undefined)
  }
  const addMoment = async () => {
    if (!p) return
    const now = vRef.current?.currentTime ?? t
    const near = p.moments.find(m => Math.abs(m.t - now) < 1.5 / FPS)
    if (near) { openMoment(near); return }
    if (p.moments.length >= MAX_MOMENTS) { say(`A clip holds ${MAX_MOMENTS} moments.`); return }
    const m: Moment = { id: newId(), t: Math.round(now * 1000) / 1000, hold: 3, dim: 0, items: [] }
    onSet(q => ({ ...q, moments: [...q.moments, m].sort((a, b) => a.t - b.t) }))
    ;(window as any).posthog?.capture("video_moment_added")
    openMoment(m)
  }
  if (frameRef) frameRef.current = async () => { const f = await grab("dataurl"); return typeof f === "string" ? f : null }
  if (openRef) openRef.current = (id: string) => { const m = moments.find(x => x.id === id); if (m) openMoment(m) }
  const capture = async () => {
    stop(); await whenSeeked()
    const b = await grab("image/jpeg")
    if (b instanceof Blob) onCapture(b)
  }

  // the timeline: click or drag to scrub; the two brackets set where the clip starts and ends
  const at = (clientX: number) => { const r = trackRef.current!.getBoundingClientRect(); return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * dur }
  useEffect(() => {
    if (!drag || !p) return
    const move = (e: PointerEvent) => {
      const x = at(e.clientX)
      if (drag === "head") seek(x)
      else if (drag === "in") onSet(q => ({ ...q, inT: Math.min(x, q.outT - 0.5) }))
      else onSet(q => ({ ...q, outT: Math.max(x, q.inT + 0.5) }))
    }
    const up = () => setDrag(null)
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag])

  // keys: Space plays, the arrows step a frame (Shift: a second), M adds a moment, I and O set the start and end
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (!p || !url || (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) || e.ctrlKey || e.metaKey || e.altKey) return
      if (editing) return // drawing on a moment: the drawing keys win
      if (e.key === " ") { e.preventDefault(); playing || frozen ? stop() : play() }
      else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); step((e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? FPS : 1)) }
      else if (e.key === "m" || e.key === "M") addMoment()
      else if (e.key === "i" || e.key === "I") onSet(q => ({ ...q, inT: Math.min(vRef.current?.currentTime ?? t, q.outT - 0.5) }))
      else if (e.key === "o" || e.key === "O") onSet(q => ({ ...q, outT: Math.max(vRef.current?.currentTime ?? t, q.inT + 0.5) }))
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  })

  /* ── export: the clip, frame by frame, with each moment frozen and its drawings fading in ── */
  exportRef.current = async (opts: RenderOpts = DEFAULT_OPTS, voice: AudioBuffer | null = null) => {
    if (!p || !url || making) return
    if (typeof VideoEncoder === "undefined") { say("Video export needs Chrome, Edge or Safari 16.4 or newer."); return }
    stop(); if (editing) onOpenMoment(null)
    cancel.current = false; setMaking({ done: 0, what: "Drawing your marks…" })
    exportStarted("analysis", "mp4")
    const v = document.createElement("video")
    v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = url
    // kept in the page (out of sight): browsers slow down decoding for videos that aren't in the page
    v.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1"
    document.body.appendChild(v)
    try {
      await new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(new Error("load")) })
      const fps = opts.fps
      const crop = cropRect(p.w, p.h, opts.format, opts.offset)
      const sc = Math.min(opts.size === "source" ? 1 : (opts.size === "1080" ? 1080 : 720) / Math.min(crop.w, crop.h), 3840 / Math.max(crop.w, crop.h), 1)
      const W = Math.max(2, Math.round((crop.w * sc) / 2) * 2), H = Math.max(2, Math.round((crop.h * sc) / 2) * 2)
      const inClip = p.moments.filter(m => m.t >= p.inT && m.t <= p.outT)
      // the seal and each build step are drawn off screen first (so their words are measured), then copied as pictures
      setDrawOff(true)
      for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r))
      await document.fonts?.ready
      const raster = async (part: string, sealToo = false) => {
        const el = offRef.current?.querySelector(`svg[data-part="${part}"]`) as SVGSVGElement | null
        if (!el) throw new Error("draw")
        return svgImage(el, p.w, p.h, c => { if (sealToo) placeSeal(c, crop, p.w) })
      }
      const sealImg = await raster("seal", true)
      const plans = new Map<string, { steps: { at: number; img: HTMLImageElement }[]; capAt: number; cap: Moment["caption"]; low: boolean }>()
      for (const m of inClip) {
        const st = stepsOf(m), list: { at: number; img: HTMLImageElement }[] = []
        for (const s of st) list.push({ at: s.at, img: await raster(`${m.id}:${s.step}`) })
        const last = st.length ? st[st.length - 1].at : 0
        const cap = m.caption && (m.caption.head.trim() || m.caption.body.trim() || m.caption.kicker.trim()) ? m.caption : undefined
        plans.set(m.id, { steps: list, capAt: Math.min(Math.max(0.4, last + 0.75), Math.max(0.4, m.hold - 1.2)), cap , low: captionAtBottom(m, p.h, p.w) })
      }
      setDrawOff(false)

      let config: VideoEncoderConfig | null = null
      const bitrate = Math.round(W * H * fps * (opts.quality === "master" ? 0.2 : opts.quality === "high" ? 0.12 : 0.07))
      for (const codec of ["avc1.640033", "avc1.640028", "avc1.4d0028", "avc1.42e028", "vp09.00.40.08"]) {
        const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate, framerate: fps, ...(codec.startsWith("avc1") ? { avc: { format: "avc" as const } } : {}) }
        try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break } } catch { /* try the next */ }
      }
      if (!config) throw new Error("no codec")
      const frames: { data: Uint8Array; key: boolean }[] = []
      let desc: Uint8Array | null = null, failed: unknown = null
      const enc = new VideoEncoder({
        output: (chunk, meta) => {
          const d = meta?.decoderConfig?.description
          if (d && !desc) desc = ArrayBuffer.isView(d) ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)) : new Uint8Array(d as ArrayBuffer)
          const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); frames.push({ data, key: chunk.type === "key" })
        },
        error: e => { failed = e },
      })
      enc.configure(config)
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H
      const ctx = cv.getContext("2d", { alpha: false })!
      const base = document.createElement("canvas"); base.width = W; base.height = H
      const bctx = base.getContext("2d", { alpha: false })!
      const filt = pictureFilter(opts)
      const vw = () => v.videoWidth || p.w, vh = () => v.videoHeight || p.h
      const grader = filt === "none" ? null : makeGrader(W, H, opts)
      const drawPic = (c: CanvasRenderingContext2D) => {
        if (grader) { c.drawImage(grader.draw(v, vw(), vh(), (crop.x / p.w) * vw(), (crop.y / p.h) * vh(), (crop.w / p.w) * vw(), (crop.h / p.h) * vh()), 0, 0); return }
        c.save(); c.filter = filt
        c.drawImage(v, (crop.x / p.w) * vw(), (crop.y / p.h) * vh(), (crop.w / p.w) * vw(), (crop.h / p.h) * vh(), 0, 0, W, H)
        c.restore()
      }
      const over = (img: CanvasImageSource) => ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H)
      // the order of things: normal play, a slow lead-in, the freeze; the sound follows the same plan
      const segs: { out: number; len: number; src: number; sync: boolean }[] = []
      let j = 0
      const leadLen = (m: Moment) => (m.lead === "slow" ? Math.min(0.4, Math.max(0, m.t - p.inT)) : 0)
      const total = Math.round((p.outT - p.inT) * fps) + inClip.reduce((n, m) => n + Math.round(m.hold * fps) + Math.round((leadLen(m) / 0.4) * fps), 0)
      const emit = async () => {
        const vf = new VideoFrame(cv, { timestamp: Math.round((j * 1_000_000) / fps), duration: Math.round(1_000_000 / fps) })
        enc.encode(vf, { keyFrame: j % (fps * 2) === 0 }); vf.close(); j++
        while (enc.encodeQueueSize > 6) await sleep(4)
        if (j % 10 === 0) setMaking({ done: Math.min(0.97, j / total), what: "Rendering…" })
      }
      const goto = (to: number) => new Promise<void>(ok => {
        if (Math.abs(v.currentTime - to) < 1e-4 && !v.seeking) { ok(); return }
        const done = () => { v.removeEventListener("seeked", done); ok() }; v.addEventListener("seeked", done); v.currentTime = to
      })
      // frame by frame by seeking: exact, but every seek decodes from the last keyframe, so it's slow on long clips
      const seekFrames = async (from: number, speed: number, f0: number, n: number) => {
        for (let f = f0; f < n && !cancel.current && !failed; f++) {
          await goto(from + (f * speed) / fps)
          drawPic(ctx); over(sealImg); await emit()
        }
      }
      // while it plays: each frame the browser shows is drawn into every output frame it covers (as fast as the clip runs)
      const liveFrames = (from: number, speed: number, n: number) => new Promise<number>(ok => {
        let f = 0, busy = false, over_ = false, last = performance.now()
        const target = (k: number) => from + (k * speed) / fps
        const end = () => { if (over_) return; over_ = true; clearInterval(watch); v.pause(); ok(f) }
        const pump = async (mt: number, all: boolean) => {
          busy = true
          while (f < n && !cancel.current && !failed && (all || target(f) <= mt + 0.25 / fps)) {
            drawPic(ctx); over(sealImg); await emit(); f++
            if (enc.encodeQueueSize > 4 && !v.paused) { v.pause(); while (enc.encodeQueueSize > 2) await sleep(4); if (!over_) v.play().catch(() => end()) }
          }
          busy = false
          if (f >= n || cancel.current || failed) end()
        }
        const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
          if (over_) return
          last = performance.now()
          if (!busy) pump(meta.mediaTime, meta.mediaTime >= target(n - 1)).then(() => { if (!over_) v.requestVideoFrameCallback(tick) })
          else v.requestVideoFrameCallback(tick)
        }
        // no new frame for 2.5 s (a hidden tab, a stalled file): stop here and finish by seeking
        const watch = window.setInterval(() => { if (!busy && performance.now() - last > 2500) end() }, 500)
        v.onended = () => { if (!busy) pump(Infinity, true) }
        v.playbackRate = speed
        v.requestVideoFrameCallback(tick)
        v.play().catch(() => end())
      })
      const live = "requestVideoFrameCallback" in HTMLVideoElement.prototype
      const play = async (from: number, to: number, speed: number, sync: boolean) => {
        const n = Math.max(0, Math.round(((to - from) / speed) * fps))
        if (!n) return
        segs.push({ out: j / fps, len: n / fps, src: from, sync })
        let done = 0
        if (live && n > 6) { await goto(from); done = await liveFrames(from, speed, n); v.onended = null; v.playbackRate = 1 }
        if (done < n) await seekFrames(from, speed, done, n)
      }
      let tt = p.inT
      for (const m of inClip) {
        if (cancel.current || failed) break
        const lead = leadLen(m)
        await play(tt, m.t - lead, 1, true)
        if (lead) await play(m.t - lead, m.t, 0.4, false)
        const plan = plans.get(m.id)!, n = Math.max(1, Math.round(m.hold * fps))
        await goto(m.t); drawPic(bctx)
        segs.push({ out: j / fps, len: n / fps, src: m.t, sync: false })
        for (let h = 0; h < n && !cancel.current; h++) {
          const t = h / fps, fade = (x: number) => Math.max(0, Math.min(1, (t - x) / 0.3))
          ctx.drawImage(base, 0, 0)
          if (m.dim > 0) { ctx.fillStyle = `rgba(0,0,0,${m.dim * fade(0)})`; ctx.fillRect(0, 0, W, H) }
          for (const s of plan.steps) { const a = fade(s.at); if (a > 0) { ctx.globalAlpha = a; over(s.img); ctx.globalAlpha = 1 } }
          if (plan.cap) { const a = fade(plan.capAt); if (a > 0) drawCaption(ctx, plan.cap, W, H, a, plan.low) }
          over(sealImg)
          await emit()
        }
        tt = m.t
      }
      if (!cancel.current && !failed) await play(tt, p.outT, 1, true)
      if (!cancel.current && !failed) await enc.flush()
      enc.close()
      if (cancel.current) return
      if (failed || !frames.length) throw failed ?? new Error("no frames")
      // the sound
      let audio: AudioTrack | null = null
      if ((opts.sound !== "off" || voice) && file) {
        setMaking({ done: 0.98, what: "Adding the sound…" })
        audio = await soundTrack({ file, segs, dur: j / fps, duck: opts.sound === "duck" ? 0.35 : opts.sound === "off" ? 0 : 1, original: opts.sound !== "off", voice }).catch(e => { console.warn(e); return null })
        if (!audio) say("Your video has no sound: this browser couldn't add it.")
      }
      const blob = mp4File({ w: W, h: H, fps, codec: config.codec, config: desc, frames, audio })
      const a = document.createElement("a"), u = URL.createObjectURL(blob)
      a.href = u; a.download = `${fileBase}.mp4`; a.click()
      setTimeout(() => URL.revokeObjectURL(u), 60000)
      ;(window as any).posthog?.capture("video_exported", { seconds: Math.round(p.outT - p.inT), moments: inClip.length })
      say("Your video is downloading.")
    } catch (e) {
      console.error(e); say("Couldn't make the video in this browser. Try Chrome or Edge.")
    } finally {
      v.removeAttribute("src"); v.load(); v.remove(); setMaking(null); setDrawOff(false)
    }
  }

  const pct = (x: number) => `${dur ? (x / dur) * 100 : 0}%`
  return (
    <div className="vs">
      <style>{`
        .vs { display: grid; grid-template-rows: 1fr auto; min-height: 0; min-width: 0; height: 100%; }
        .vs-stage { position: relative; min-height: 0; min-width: 0; display: flex; }
        .vs-stage > .an-view { flex: 1; padding-bottom: 84px; }
        .vs-player { position: absolute; inset: 12px; }
        .vs-player video, .vs-player svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: contain; }
        .vs-bar { container-type: inline-size; padding: 12px 22px 12px; border-top: 1px solid ${DS_BORDER}; background: ${SURFACE_BASE}; display: flex; flex-direction: column; gap: 12px; }
        .vs-ctl { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .vs-b { height: 34px; min-width: 34px; padding: 0 12px; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: transparent; color: ${TEXT_PRIMARY}; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: 600 13px 'Inter', sans-serif; cursor: pointer; transition: background .14s, transform .14s; }
        .vs-b:hover { background: var(--ps-hover); } .vs-b:active { transform: scale(.95); }
        .vs-b.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
        .vs-b.round { width: 36px; padding: 0; border-radius: 50%; background: ${SURFACE_2}; border-color: transparent; color: ${TEXT_MUTED}; }
        .vs-b.play { width: 46px; height: 46px; border-radius: 50%; background: #f5f5f7; color: #0d0e11; border: none; }
        .vs-b.quiet { border-color: transparent; color: ${TEXT_MUTED}; padding: 0 8px; }
        .vs-b.quiet:hover { color: ${TEXT_PRIMARY}; }
        .vs-time { font: 600 13px 'JetBrains Mono', ui-monospace, monospace; color: ${TEXT_PRIMARY}; font-variant-numeric: tabular-nums; padding: 0 6px; }
        .vs-time small { color: ${TEXT_MUTED}; font-weight: 500; }
        .vs-now { font: 500 22px 'JetBrains Mono', ui-monospace, monospace; color: ${TEXT_PRIMARY}; font-variant-numeric: tabular-nums; margin: 0 8px 0 6px; letter-spacing: .02em; }
        .vs-now small { font-size: 22px; color: ${TEXT_MUTED}; }
        .vs-len { font: 500 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; color: ${TEXT_MUTED}; text-transform: uppercase; white-space: nowrap; margin-right: 6px; }
        .vs-sp { flex: 1; }
        .vs-rate { display: inline-flex; padding: 2px; border-radius: 10px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; }
        .vs-rate button { height: 28px; padding: 0 9px; border: none; border-radius: 8px; background: transparent; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .vs-rate button[aria-pressed="true"] { background: var(--ps-raised, ${SURFACE_1}); color: ${TEXT_PRIMARY}; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
        .vs-track { position: relative; height: 76px; cursor: pointer; touch-action: none; user-select: none; }
        .vs-rail { position: absolute; left: 0; right: 0; top: 26px; height: 46px; border-radius: 8px; background: #0b0c0f; overflow: hidden; display: flex; }
        .vs-rail img { flex: 1 1 0; min-width: 0; height: 100%; object-fit: cover; display: block; }
        .vs-shade { position: absolute; top: 26px; height: 46px; background: rgba(8,9,12,.62); pointer-events: none; }
        .vs-clip { position: absolute; top: 26px; height: 46px; box-shadow: inset 0 2px 0 ${ACCENT_SOLID}, inset 0 -2px 0 ${ACCENT_SOLID}; pointer-events: none; }
        .vs-brk { position: absolute; top: 22px; width: 12px; height: 54px; margin-left: -6px; border: none; border-radius: 4px; background: ${ACCENT_SOLID}; cursor: ew-resize; padding: 0; box-shadow: 0 2px 8px rgba(0,0,0,.5); }
        .vs-brk::after { content: ""; position: absolute; left: 5px; top: 18px; width: 2px; height: 18px; border-radius: 1px; background: rgba(0,0,0,.45); }
        .vs-brk:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
        .vs-head { position: absolute; top: 20px; bottom: 0; width: 2px; margin-left: -1px; background: #fff; pointer-events: none; box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
        .vs-mom { position: absolute; top: 0; width: 26px; height: 26px; margin-left: -13px; border: none; background: transparent; padding: 0; cursor: pointer; display: grid; place-items: center; }
        .vs-mom i { width: 17px; height: 17px; transform: rotate(45deg); background: ${ACCENT_SOLID}; border-radius: 3px; box-shadow: 0 1px 4px rgba(0,0,0,.6); display: grid; place-items: center; }
        .vs-mom b { transform: rotate(-45deg); font: 700 12px 'Inter', sans-serif; color: ${ACCENT_INK}; line-height: 1; }
        .vs-mom[aria-pressed="true"] i { background: #fff; }
        .vs-mom:focus-visible { outline: 2px solid #fff; border-radius: 6px; }
        .vs-ruler { position: relative; height: 16px; font: 500 12px 'JetBrains Mono', ui-monospace, monospace; color: ${TEXT_MUTED}; letter-spacing: .08em; }
        .vs-ruler span { position: absolute; top: 0; transform: translateX(-50%); white-space: nowrap; }
        .vs-ruler span.l { transform: none; } .vs-ruler span.r { transform: translateX(-100%); }
        @container (max-width: 880px) { .vs-len { display: none; } }
        @container (max-width: 760px) { .vs-b .lg { display: none; } }
        @media (max-width: 700px) { .vs-ruler span.mid { display: none; } .vs-now, .vs-now small { font-size: 17px; } .vs-len { display: none; } .vs-bar { padding: 10px 12px; } }
        .vs-momentbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 600 13px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; }
        .vs-empty { margin: auto; text-align: center; color: #c9ccd2; max-width: 520px; padding: 30px; }
        .vs-empty h2 { color: #f5f5f7; font-size: 22px; margin: 14px 0 6px; letter-spacing: -.02em; }
        .vs-empty p { font-size: 14px; line-height: 1.55; margin: 0 0 18px; }
        .vs-making { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0,0,0,.55); }
        .vs-making div.card { width: 300px; border-radius: 16px; padding: 16px 18px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; font: 600 14px 'Inter', sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .vs-prog { height: 6px; border-radius: 3px; background: ${SURFACE_2}; overflow: hidden; margin: 12px 0 10px; } .vs-prog i { display: block; height: 100%; background: ${ACCENT_SOLID}; transition: width .2s; }
      `}</style>
      <div className="vs-stage">
        {!p ? (
          <div className="vs-empty" data-empty="video">
            <p className="an-k">Video · up to 10 minutes</p>
            <h2 className="an-h">Freeze it. Draw it. Play it.</h2>
            <p>Up to 10 minutes, MP4, MOV or WebM. Freeze any moment and draw on it, then export it as a video. The clip stays on this computer; only your drawings are saved to your account.</p>
            <button className="an-btn pri" style={{ margin: "0 auto" }} onClick={onChoose}><FileVideo size={15} /> Choose a video</button>
          </div>
        ) : missing || !url ? (
          <div className="vs-empty">
            <FileVideo size={34} color="#d7ff3c" style={{ margin: "0 auto", display: "block" }} />
            <h2>Find “{p.name}”</h2>
            <p>This analysis was made from a video that isn't on this computer. Choose the same file and your moments come back.</p>
            <button className="an-btn pri" style={{ margin: "0 auto" }} onClick={onChoose}><FileVideo size={15} /> Choose the video</button>
          </div>
        ) : (
          <>
            {editing && children}
            <div className="vs-player" style={{ display: editing ? "none" : undefined }}>
              <video ref={vRef} src={url} playsInline muted preload="auto" onLoadedMetadata={() => seek(t)} onPause={() => { if (!frozen) setPlaying(false) }} />
              {frozenM && (() => { const shown = new Set(stepsOf(frozenM).filter(s => s.at <= frozenAt).flatMap(s => s.marks.map(x => x.id))); return (
                <svg viewBox={`0 0 ${p.w} ${p.h}`} aria-hidden="true">
                  {frozenM.dim > 0 && <rect width={p.w} height={p.h} fill="#000" fillOpacity={frozenM.dim} />}
                  <Marks items={frozenM.items} w={p.w} h={p.h} fit={fitCalib(frozenM.calib)} only={x => shown.has(x.id)} />
                </svg>
              ) })()}
            </div>
          </>
        )}
        {drawOff && p && (
          <div ref={offRef} aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, width: 400, height: 225, overflow: "hidden", pointerEvents: "none" }}>
            <svg data-part="seal" viewBox={`0 0 ${p.w} ${p.h}`} width={400} height={225}>{seal(p.w, p.h)}</svg>
            {p.moments.flatMap(m => { const f = fitCalib(m.calib); return stepsOf(m).map(st => (
              <svg key={m.id + st.step} data-part={`${m.id}:${st.step}`} viewBox={`0 0 ${p.w} ${p.h}`} width={400} height={225}>
                <Marks items={m.items} w={p.w} h={p.h} fit={f} only={x => st.marks.includes(x)} />
              </svg>
            )) })}
          </div>
        )}
        {making && (
          <div className="vs-making" role="status" aria-live="polite">
            <div className="card">
              {making.what ?? "Making your video…"} {Math.round(making.done * 100)}%
              <div className="vs-prog"><i style={{ width: `${making.done * 100}%` }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>
                Made frame by frame on this computer
                <button className="vs-b" onClick={() => { cancel.current = true }}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
      {p && url && !missing && (
        <div className="vs-bar" aria-label="Video">
          {editingM ? (
            <div className="vs-momentbar">
              <Diamond size={15} fill={ACCENT_SOLID} color={ACCENT_SOLID} />
              Moment at {fmtTime(editingM.t)}
              <span style={{ color: TEXT_MUTED, fontWeight: 500, marginLeft: 8 }}>Freezes for</span>
              <button className="vs-b" aria-label="Shorter" onClick={() => onSet(q => ({ ...q, moments: q.moments.map(m => (m.id === editingM.id ? { ...m, hold: Math.max(0.5, m.hold - 0.5) } : m)) }))}>−</button>
              <span className="vs-time">{editingM.hold.toFixed(1)}s</span>
              <button className="vs-b" aria-label="Longer" onClick={() => onSet(q => ({ ...q, moments: q.moments.map(m => (m.id === editingM.id ? { ...m, hold: Math.min(10, m.hold + 0.5) } : m)) }))}>+</button>
              <span className="vs-sp" />
              <button className="vs-b" onClick={() => { onSet(q => ({ ...q, moments: q.moments.filter(m => m.id !== editingM.id) })); onOpenMoment(null) }}><Trash2 size={14} /> Delete moment</button>
              <button className="vs-b pri" onClick={() => onOpenMoment(null)}><Check size={15} /> Done</button>
            </div>
          ) : (
            <div className="vs-ctl">
              <button className="vs-b round" aria-label="Back one frame" title="Back one frame (←)" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
              <button className="vs-b play" aria-label={playing || frozen ? "Pause" : "Play"} title="Play or pause (Space)" onClick={() => (playing || frozen ? stop() : play())}>
                {playing || frozen ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
              </button>
              <button className="vs-b round" aria-label="Forward one frame" title="Forward one frame (→)" onClick={() => step(1)}><ChevronRight size={16} /></button>
              <span className="vs-now" aria-label={`At ${fmtTime(t)}`}>{fmtTime(t).replace(/\.\d+$/, "")}<small>{fmtTime(t).match(/\.\d+$/)?.[0]}</small></span>
              <div className="vs-rate" role="group" aria-label="Speed">
                {[0.25, 0.5, 1].map(r => <button key={r} aria-pressed={rate === r} onClick={() => setRate(r)}>{r === 1 ? "1×" : r === 0.5 ? "½×" : "¼×"}</button>)}
              </div>
              <span className="vs-sp" />
              <span className="vs-len">Clip {fmtTime(p.outT - p.inT, false)} of {fmtTime(dur, false)}</span>
              <button className="vs-b quiet" title="Start the clip here (I)" aria-label="Start the clip here" onClick={() => onSet(q => ({ ...q, inT: Math.min(t, q.outT - 0.5) }))}><span>In<span className="lg"> here</span></span></button>
              <button className="vs-b quiet" title="End the clip here (O)" aria-label="End the clip here" onClick={() => onSet(q => ({ ...q, outT: Math.max(t, q.inT + 0.5) }))}><span>Out<span className="lg"> here</span></span></button>
              <button className="vs-b" title="Add this frame to your shots" aria-label="Add this frame to your shots" onClick={capture}><Camera size={15} /><span className="lg">To shots</span></button>
              <button className="vs-b" title="Freeze here and draw (M)" onClick={addMoment}><Plus size={15} /> Add a moment</button>
            </div>
          )}
          <div className="vs-track" ref={trackRef} onPointerDown={e => { if ((e.target as HTMLElement).closest(".vs-brk,.vs-mom")) return; stop(); if (editing) onOpenMoment(null); seek(at(e.clientX)); setDrag("head") }}>
            <div className="vs-rail">{stripTimes(dur).map(x => frames?.[frameKey(x)] ? <img key={x} src={frames[frameKey(x)]} alt="" draggable={false} /> : <span key={x} style={{ flex: "1 1 0" }} />)}</div>
            <div className="vs-shade" style={{ left: 0, width: pct(p.inT), borderRadius: "8px 0 0 8px" }} />
            <div className="vs-shade" style={{ left: pct(p.outT), right: 0, borderRadius: "0 8px 8px 0" }} />
            <div className="vs-clip" style={{ left: pct(p.inT), width: `calc(${pct(p.outT)} - ${pct(p.inT)})` }} />
            <button className="vs-brk in" style={{ left: pct(p.inT) }} aria-label={`Clip starts at ${fmtTime(p.inT)}`} onPointerDown={e => { e.stopPropagation(); setDrag("in") }} />
            <button className="vs-brk out" style={{ left: pct(p.outT) }} aria-label={`Clip ends at ${fmtTime(p.outT)}`} onPointerDown={e => { e.stopPropagation(); setDrag("out") }} />
            <div className="vs-head" style={{ left: pct(t) }} />
            {moments.map((m, i) => (
              <button key={m.id} className="vs-mom" style={{ left: pct(m.t) }} aria-pressed={m.id === editing} aria-label={`Moment ${i + 1} at ${fmtTime(m.t)}`} title={`Moment ${i + 1} at ${fmtTime(m.t)} · ${m.hold}s`}
                onPointerDown={e => e.stopPropagation()} onClick={() => openMoment(m)}><i><b>{i + 1}</b></i></button>
            ))}
          </div>
          <div className="vs-ruler" aria-hidden="true">
            <span className={p.inT / (dur || 1) < 0.08 ? "l" : ""} style={{ left: pct(p.inT) }}>{fmtTime(p.inT, false)} IN</span>
            {[0.25, 0.5, 0.75].map(f => { const x = p.inT + (p.outT - p.inT) * f; return (p.outT - p.inT) / (dur || 1) > 0.35 ? <span key={f} className="mid" style={{ left: pct(x) }}>{fmtTime(x, false)}</span> : null })}
            <span className={p.outT / (dur || 1) > 0.92 ? "r" : ""} style={{ left: pct(p.outT) }}>{fmtTime(p.outT, false)} OUT</span>
          </div>
        </div>
      )}
    </div>
  )
}
