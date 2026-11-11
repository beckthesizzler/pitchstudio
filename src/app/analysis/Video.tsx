import { useEffect, useRef, useState, type ReactNode } from "react"
import { Camera, ChevronLeft, ChevronRight, Clapperboard, Diamond, FileVideo, Pause, Play, Plus, Trash2, Check } from "lucide-react"
import { Marks } from "./Marks"
import { MAX_MOMENTS, exportFontCSS, newId, type Moment, type VideoProject } from "./model"
import { mp4File } from "../lib/mp4"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_1, SURFACE_2, DS_BORDER, ACCENT_SOLID, ACCENT_INK } from "../theme"

/* The video studio: a match clip up to 10 minutes, kept on this device. Scrub it frame by frame, set where the clip
   starts and ends, and add moments: the clip freezes there for a few seconds while your drawings appear (drawn with the
   same tools as a shot). Export makes an MP4 of it all, drawn frame by frame in the browser. */

const FPS = 30
export const fmtTime = (t: number, frames = true) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.min(FPS - 1, Math.floor((t % 1) * FPS + 0.001))
  return `${m}:${String(s).padStart(2, "0")}${frames ? "." + String(f).padStart(2, "0") : ""}`
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function VideoStudio({ project, file, missing, editing, onChoose, onSet, onOpenMoment, onCapture, seal, fileBase, exportRef, say, children }: {
  project: VideoProject | null; file: File | null; missing: boolean; editing: string | null
  onChoose: () => void
  onSet: (fn: (p: VideoProject) => VideoProject) => void
  onOpenMoment: (id: string | null, frame?: string) => void
  onCapture: (blob: Blob) => void
  seal: (w: number, h: number) => ReactNode
  fileBase: string
  exportRef: React.MutableRefObject<(() => void) | null>
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
  const [making, setMaking] = useState<{ done: number } | null>(null)
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
      v.pause(); v.currentTime = hit.t; setT(hit.t); lastT.current = hit.t; setFrozen(hit.id)
      freezeTimer.current = window.setTimeout(() => { setFrozen(null); lastT.current = hit.t + 0.001; v.play().catch(() => {}); raf.current = requestAnimationFrame(tick) }, hit.hold * 1000 / rate)
      return
    }
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
  exportRef.current = async () => {
    if (!p || !url || making) return
    if (typeof VideoEncoder === "undefined") { say("Video export needs Chrome, Edge or Safari 16.4 or newer."); return }
    stop(); if (editing) onOpenMoment(null)
    cancel.current = false; setMaking({ done: 0 })
    const v = document.createElement("video")
    v.muted = true; v.preload = "auto"; v.src = url
    try {
      await new Promise<void>((ok, no) => { v.onloadeddata = () => ok(); v.onerror = () => no(new Error("load")) })
      const k = Math.min(1, 1920 / p.w), W = Math.round(p.w * k / 2) * 2, H = Math.round(p.h * k / 2) * 2
      const css = await exportFontCSS()
      // the seal and the drawings are drawn off screen first (so their words are measured), then copied as pictures
      setDrawOff(true)
      for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r))
      await document.fonts?.ready
      const raster = async (part: string) => {
        const el = offRef.current?.querySelector(`svg[data-part="${part}"]`)
        if (!el) throw new Error("draw")
        const c = el.cloneNode(true) as SVGSVGElement
        c.setAttribute("xmlns", "http://www.w3.org/2000/svg"); c.setAttribute("width", String(W)); c.setAttribute("height", String(H)); c.removeAttribute("style")
        if (css) { const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = css; c.insertBefore(st, c.firstChild) }
        const svg = new XMLSerializer().serializeToString(c)
        const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }))
        try { return await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("draw")); i.src = u }) } finally { setTimeout(() => URL.revokeObjectURL(u), 1000) }
      }
      const sealImg = await raster("seal")
      const inClip = p.moments.filter(m => m.t >= p.inT && m.t <= p.outT)
      const over = new Map<string, HTMLImageElement>()
      for (const m of inClip) over.set(m.id, await raster(m.id))
      setDrawOff(false)

      let config: VideoEncoderConfig | null = null
      for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028", "vp09.00.40.08"]) {
        const c: VideoEncoderConfig = { codec, width: W, height: H, bitrate: W > 1280 ? 8_000_000 : 5_000_000, framerate: FPS, ...(codec.startsWith("avc1") ? { avc: { format: "avc" as const } } : {}) }
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
      let j = 0
      const total = Math.round((p.outT - p.inT) * FPS) + inClip.reduce((n, m) => n + Math.round(m.hold * FPS), 0)
      const emit = async () => {
        const vf = new VideoFrame(cv, { timestamp: Math.round((j * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) })
        enc.encode(vf, { keyFrame: j % 60 === 0 }); vf.close(); j++
        while (enc.encodeQueueSize > 6) await sleep(4)
        if (j % 10 === 0) setMaking({ done: Math.min(1, j / total) })
      }
      const goto = (to: number) => new Promise<void>(ok => { const done = () => { v.removeEventListener("seeked", done); ok() }; v.addEventListener("seeked", done); v.currentTime = to })
      let mi = 0
      for (let f = 0; ; f++) {
        if (cancel.current || failed) break
        const tt = p.inT + f / FPS
        if (tt > p.outT - 0.5 / FPS) break // the clip's last frame is the one before its end
        while (mi < inClip.length && inClip[mi].t <= tt) {
          const m = inClip[mi++], img = over.get(m.id)!, n = Math.max(1, Math.round(m.hold * FPS))
          await goto(m.t); bctx.drawImage(v, 0, 0, W, H)
          for (let h = 0; h < n && !cancel.current; h++) {
            ctx.drawImage(base, 0, 0)
            ctx.globalAlpha = Math.min(1, (h + 1) / (0.35 * FPS)); ctx.drawImage(img, 0, 0, W, H); ctx.globalAlpha = 1
            ctx.drawImage(sealImg, 0, 0, W, H)
            await emit()
          }
        }
        await goto(tt)
        ctx.drawImage(v, 0, 0, W, H); ctx.drawImage(sealImg, 0, 0, W, H)
        await emit()
      }
      if (!cancel.current && !failed) await enc.flush()
      enc.close()
      if (cancel.current) return
      if (failed || !frames.length) throw failed ?? new Error("no frames")
      const blob = mp4File({ w: W, h: H, fps: FPS, codec: config.codec, config: desc, frames })
      const a = document.createElement("a"), u = URL.createObjectURL(blob)
      a.href = u; a.download = `${fileBase}.mp4`; a.click()
      setTimeout(() => URL.revokeObjectURL(u), 60000)
      ;(window as any).posthog?.capture("video_exported", { seconds: Math.round(p.outT - p.inT), moments: inClip.length })
      say("Your video is downloading.")
    } catch (e) {
      console.error(e); say("Couldn't make the video in this browser. Try Chrome or Edge.")
    } finally {
      v.removeAttribute("src"); v.load(); setMaking(null); setDrawOff(false)
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
        .vs-bar { padding: 10px 16px 14px; border-top: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; display: flex; flex-direction: column; gap: 10px; }
        .vs-ctl { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .vs-b { height: 34px; min-width: 34px; padding: 0 10px; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; transition: background .14s, transform .14s; }
        .vs-b:hover { background: var(--ps-hover); } .vs-b:active { transform: scale(.95); }
        .vs-b.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
        .vs-b.play { width: 42px; height: 42px; border-radius: 50%; background: ${TEXT_PRIMARY}; color: ${SURFACE_1}; border: none; }
        .vs-time { font: 600 13px 'JetBrains Mono', ui-monospace, monospace; color: ${TEXT_PRIMARY}; font-variant-numeric: tabular-nums; padding: 0 6px; }
        .vs-time small { color: ${TEXT_MUTED}; font-weight: 500; }
        .vs-sp { flex: 1; }
        .vs-rate { display: inline-flex; padding: 2px; border-radius: 10px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; }
        .vs-rate button { height: 28px; padding: 0 9px; border: none; border-radius: 8px; background: transparent; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .vs-rate button[aria-pressed="true"] { background: var(--ps-raised, ${SURFACE_1}); color: ${TEXT_PRIMARY}; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
        .vs-track { position: relative; height: 46px; cursor: pointer; touch-action: none; user-select: none; }
        .vs-rail { position: absolute; left: 0; right: 0; top: 22px; height: 8px; border-radius: 4px; background: ${SURFACE_2}; }
        .vs-clip { position: absolute; top: 22px; height: 8px; border-radius: 4px; background: rgba(215,255,60,.38); }
        .vs-brk { position: absolute; top: 15px; width: 10px; height: 22px; margin-left: -5px; border: 2.5px solid ${TEXT_PRIMARY}; border-radius: 3px; cursor: ew-resize; background: transparent; padding: 0; }
        .vs-brk.in { border-right: none; border-radius: 4px 0 0 4px; } .vs-brk.out { border-left: none; border-radius: 0 4px 4px 0; }
        .vs-head { position: absolute; top: 6px; bottom: 2px; width: 2px; margin-left: -1px; background: ${ACCENT_SOLID}; pointer-events: none; box-shadow: 0 0 0 1px rgba(0,0,0,.35); }
        .vs-head::before { content: ""; position: absolute; top: -2px; left: -5px; width: 12px; height: 12px; border-radius: 50%; background: ${ACCENT_SOLID}; box-shadow: 0 1px 4px rgba(0,0,0,.5); }
        .vs-mom { position: absolute; top: 0; width: 18px; height: 18px; margin-left: -9px; border: none; background: transparent; padding: 0; cursor: pointer; display: grid; place-items: center; color: ${ACCENT_SOLID}; }
        .vs-mom svg { filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
        .vs-mom[aria-pressed="true"] { color: #fff; }
        .vs-momentbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 600 13px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; }
        .vs-empty { margin: auto; text-align: center; color: #c9ccd2; max-width: 480px; padding: 30px; border: 2px dashed rgba(255,255,255,.18); border-radius: 18px; }
        .vs-empty h2 { color: #f5f5f7; font-size: 22px; margin: 14px 0 6px; letter-spacing: -.02em; }
        .vs-empty p { font-size: 14px; line-height: 1.55; margin: 0 0 18px; }
        .vs-making { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: rgba(0,0,0,.55); }
        .vs-making div.card { width: 300px; border-radius: 16px; padding: 16px 18px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_PRIMARY}; font: 600 14px 'Inter', sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .vs-prog { height: 6px; border-radius: 3px; background: ${SURFACE_2}; overflow: hidden; margin: 12px 0 10px; } .vs-prog i { display: block; height: 100%; background: ${ACCENT_SOLID}; transition: width .2s; }
      `}</style>
      <div className="vs-stage">
        {!p ? (
          <div className="vs-empty" data-empty="video">
            <Clapperboard size={34} color="#d7ff3c" style={{ margin: "0 auto", display: "block" }} />
            <h2>Analyse a match clip</h2>
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
              {frozenM && (
                <svg viewBox={`0 0 ${p.w} ${p.h}`} aria-hidden="true">
                  {frozenM.dim > 0 && <rect width={p.w} height={p.h} fill="#000" fillOpacity={frozenM.dim} />}
                  <Marks items={frozenM.items} w={p.w} h={p.h} />
                </svg>
              )}
            </div>
          </>
        )}
        {drawOff && p && (
          <div ref={offRef} aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, width: 400, height: 225, overflow: "hidden", pointerEvents: "none" }}>
            <svg data-part="seal" viewBox={`0 0 ${p.w} ${p.h}`} width={400} height={225}>{seal(p.w, p.h)}</svg>
            {p.moments.map(m => (
              <svg key={m.id} data-part={m.id} viewBox={`0 0 ${p.w} ${p.h}`} width={400} height={225}>
                {m.dim > 0 && <rect width={p.w} height={p.h} fill="#000" fillOpacity={m.dim} />}
                <Marks items={m.items} w={p.w} h={p.h} />
              </svg>
            ))}
          </div>
        )}
        {making && (
          <div className="vs-making" role="status" aria-live="polite">
            <div className="card">
              Making your video… {Math.round(making.done * 100)}%
              <div className="vs-prog"><i style={{ width: `${making.done * 100}%` }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: TEXT_MUTED, fontWeight: 500 }}>
                Drawn frame by frame, without sound
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
              <button className="vs-b" aria-label="Back one frame" title="Back one frame (←)" onClick={() => step(-1)}><ChevronLeft size={16} /></button>
              <button className="vs-b play" aria-label={playing || frozen ? "Pause" : "Play"} title="Play or pause (Space)" onClick={() => (playing || frozen ? stop() : play())}>
                {playing || frozen ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginLeft: 2 }} />}
              </button>
              <button className="vs-b" aria-label="Forward one frame" title="Forward one frame (→)" onClick={() => step(1)}><ChevronRight size={16} /></button>
              <span className="vs-time">{fmtTime(t)} <small>/ {fmtTime(dur, false)}</small></span>
              <div className="vs-rate" role="group" aria-label="Speed">
                {[0.25, 0.5, 1].map(r => <button key={r} aria-pressed={rate === r} onClick={() => setRate(r)}>{r === 1 ? "1×" : r === 0.5 ? "½×" : "¼×"}</button>)}
              </div>
              <span className="vs-sp" />
              <button className="vs-b" title="Start the clip here (I)" onClick={() => onSet(q => ({ ...q, inT: Math.min(t, q.outT - 0.5) }))}>Start here</button>
              <button className="vs-b" title="End the clip here (O)" onClick={() => onSet(q => ({ ...q, outT: Math.max(t, q.inT + 0.5) }))}>End here</button>
              <button className="vs-b" title="Add this frame to your shots" onClick={capture}><Camera size={15} /> To shots</button>
              <button className="vs-b pri" title="Freeze here and draw (M)" onClick={addMoment}><Plus size={15} /> Moment</button>
            </div>
          )}
          <div className="vs-track" ref={trackRef} onPointerDown={e => { if ((e.target as HTMLElement).closest(".vs-brk,.vs-mom")) return; stop(); if (editing) onOpenMoment(null); seek(at(e.clientX)); setDrag("head") }}>
            <div className="vs-rail" />
            <div className="vs-clip" style={{ left: pct(p.inT), width: `calc(${pct(p.outT)} - ${pct(p.inT)})` }} />
            <button className="vs-brk in" style={{ left: pct(p.inT) }} aria-label={`Clip starts at ${fmtTime(p.inT)}`} onPointerDown={e => { e.stopPropagation(); setDrag("in") }} />
            <button className="vs-brk out" style={{ left: pct(p.outT) }} aria-label={`Clip ends at ${fmtTime(p.outT)}`} onPointerDown={e => { e.stopPropagation(); setDrag("out") }} />
            {moments.map(m => (
              <button key={m.id} className="vs-mom" style={{ left: pct(m.t) }} aria-pressed={m.id === editing} aria-label={`Moment at ${fmtTime(m.t)}`} title={`Moment at ${fmtTime(m.t)} · ${m.hold}s`}
                onPointerDown={e => e.stopPropagation()} onClick={() => openMoment(m)}><Diamond size={14} fill="currentColor" /></button>
            ))}
            <div className="vs-head" style={{ left: pct(t) }} />
          </div>
        </div>
      )}
    </div>
  )
}
