import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { Marks, arrowPath } from "./Marks"
import { dist, mid, moveMark, newId, unit, type Arrow, type Mark, type Pt, type Shot, type TagStyle, type Tie, type Zone } from "./model"
import { apply as project, pathOf, pitchLines, ppmAt, type CalPoint, type Fit } from "./calib"

/* The shot you draw on. The picture and the marks are one svg (that is what gets exported);
   handles, the selection outline and half-drawn marks sit on a second svg on top, so they never end up in an export. */

export type Tool = "select" | "tag" | "spot" | "zone" | "oval" | "arrow" | "line" | "text" | "ring" | "tie" | "measure" | "shadow" | "focus" | "calib"
export type Defaults = {
  tag: { color: string; ring: boolean; glow: boolean; style: TagStyle }
  spot: { color: string }
  zone: { color: string; opacity: number; outline: boolean }
  oval: { color: string; opacity: number; outline: boolean }
  arrow: { color: string; dash: Arrow["dash"]; head: Arrow["head"] }
  line: { color: string; dash: Arrow["dash"] }
  text: { color: string; box: boolean }
  ring: { color: string; fill: number; double: boolean }
  tie: { color: string; dash: Tie["dash"]; dist: boolean }
  measure: { color: string }
  shadow: { color: string }
  focus: { dim: number }
}
export const START_DEFAULTS: Defaults = {
  tag: { color: "#d7ff3c", ring: true, glow: false, style: "sig" }, // the signature tag: the look that is always PitchStudio
  spot: { color: "#d7ff3c" },
  zone: { color: "#d7ff3c", opacity: 0.28, outline: false },
  oval: { color: "#ffffff", opacity: 0.25, outline: false },
  arrow: { color: "#ffffff", dash: "solid", head: "end" },
  line: { color: "#ffffff", dash: "solid" },
  text: { color: "#ffffff", box: true },
  ring: { color: "#d7ff3c", fill: 0.18, double: false },
  tie: { color: "#ffffff", dash: "solid", dist: false },
  measure: { color: "#ffffff" },
  shadow: { color: "#ffffff" },
  focus: { dim: 0.45 },
}

type Drag =
  | { type: "move"; id: string; start: Pt; orig: Mark; moved: boolean }
  | { type: "handle"; id: string; which: string; orig: Mark }
  | { type: "arrow"; tool: "arrow" | "line" | "tie" | "measure" | "shadow"; a: Pt; b: Pt; ra: string | null }
  | { type: "pin"; i: number }
  | { type: "box"; start: Pt; cur: Pt; round: boolean; focus?: boolean }
  | { type: "pan"; x: number; y: number; sl: number; st: number }

export function Stage({ shot, src, tool, sel, zoom, setZoom, defaults, onSelect, onCreate, apply: applyItems, begin, end, onFocusText, seal, stageRef, hint, fit: cal, calPts, calPick, onCalib, look, under }: {
  shot: Shot; src: string | undefined; tool: Tool; sel: string | null; zoom: number; setZoom: (z: number) => void; defaults: Defaults
  onSelect: (id: string | null) => void; onCreate: (m: Mark) => void; apply: (fn: (items: Mark[]) => Mark[]) => void
  begin: () => void; end: () => void; onFocusText: () => void; seal: ReactNode; stageRef: RefObject<SVGSVGElement | null>; hint: string
  fit?: Fit | null
  calPts?: CalPoint[] // calibration pins (shown while calibrating)
  calPick?: string | null // the pitch point waiting to be placed
  onCalib?: (pts: CalPoint[], live?: boolean) => void
  look?: string // a css filter for the picture only (the render look, previewed)
  under?: ReactNode // drawn right on the picture, under the marks (the calibration check)
}) {
  const apply = applyItems
  const { w, h } = shot
  const U = unit(w)
  const viewRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [poly, setPoly] = useState<Pt[]>([]) // zone corners clicked so far
  const [hover, setHover] = useState<Pt | null>(null)
  const [space, setSpace] = useState(false)
  const [selBox, setSelBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const zoomAt = useRef<{ px: Pt; cx: number; cy: number } | null>(null)
  const lastDown = useRef({ t: 0, x: 0, y: 0 }) // to spot a double-click (the pointer is captured, so the browser's own can't be used)
  const setD = (d: Drag | null) => { dragRef.current = d; setDrag(d) }

  // The shot always fits the space it has (zoom 1), and zooms in from there
  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    const measure = () => { const r = el.getBoundingClientRect(); setFit(Math.max(0.05, Math.min((r.width - 24) / w, (r.height - 24) / h))) }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [w, h])
  const scale = fit * zoom // screen pixels per shot pixel

  // Zooming keeps the point under the pointer still
  useLayoutEffect(() => {
    const z = zoomAt.current, el = viewRef.current
    if (!z || !el) return
    zoomAt.current = null
    const wrap = el.firstElementChild as HTMLElement | null
    if (!wrap) return
    el.scrollLeft = wrap.offsetLeft + z.px[0] * scale - z.cx
    el.scrollTop = wrap.offsetTop + z.px[1] * scale - z.cy
  }, [scale])

  // A new shot or tool: forget half-drawn zones
  useEffect(() => { setPoly([]); setD(null) }, [shot.id, tool])

  // Space held down: drag to pan
  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) }
    const onControl = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.("button, a, [role=button], [role=menuitem]") // Space still presses buttons
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e) && !onControl(e)) { if (!e.repeat) setSpace(true); e.preventDefault() } }
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false) }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up) }
  }, [])

  // Enter finishes a zone of 3 corners, Escape drops it
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (tool !== "zone" || !poly.length) return
      if (e.key === "Enter" && poly.length >= 3) { e.preventDefault(); finishZone(poly) }
      if (e.key === "Escape") { e.stopPropagation(); setPoly([]) }
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  })

  // The outline around the selected mark (measured from the drawing itself)
  useLayoutEffect(() => {
    const g = sel ? stageRef.current?.querySelector(`[data-id="${CSS.escape(sel)}"]`) as SVGGraphicsElement | null : null
    if (!g) { setSelBox(o => (o ? null : o)); return }
    try {
      const b = g.getBBox()
      setSelBox(o => (o && o.x === b.x && o.y === b.y && o.width === b.width && o.height === b.height ? o : { x: b.x, y: b.y, width: b.width, height: b.height }))
    } catch { setSelBox(null) }
  })

  const toImg = (e: { clientX: number; clientY: number }): Pt => {
    const svg = stageRef.current
    if (!svg) return [0, 0]
    const m = svg.getScreenCTM()
    if (!m) return [0, 0]
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [p.x, p.y]
  }
  // Ends of arrows and lines snap onto tagged players
  const snapTo = (p: Pt): { p: Pt; id: string | null } => {
    let best: Pt | null = null, id: string | null = null, bd = 30 * U / Math.max(0.5, zoom)
    for (const m of shot.items) if (m.kind === "tag" || m.kind === "spot" || m.kind === "ring") { const d = dist(p, [m.x, m.y]); if (d < bd) { bd = d; best = [m.x, m.y]; id = m.id } }
    return { p: best ?? p, id }
  }
  const snap = (p: Pt): Pt => snapTo(p).p

  const finishZone = (pts: Pt[], round = false) => {
    const d = round ? defaults.oval : defaults.zone
    const z: Zone = { id: newId(), kind: "zone", color: d.color, pts, opacity: d.opacity, label: "", outline: d.outline, size: 1, ...(round ? { round: true } : {}) }
    setPoly([]); onCreate(z)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!src || e.button === 2) return
    e.preventDefault() // no text selection and no native picture drag while drawing
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae !== document.body && ae.blur) ae.blur() // finish typing in the panel first
    const view = viewRef.current!
    if (e.button === 1 || space) {
      e.preventDefault()
      setD({ type: "pan", x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop })
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      return
    }
    const p = toImg(e)
    const target = e.target as Element
    const now = performance.now(), ld = lastDown.current
    const double = now - ld.t < 400 && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < 6
    lastDown.current = { t: double ? 0 : now, x: e.clientX, y: e.clientY }
    const handle = target.closest("[data-h]") as HTMLElement | null
    if (handle && sel) {
      const m = shot.items.find(x => x.id === sel)
      if (m) {
        // double-click the curve handle: the arrow goes straight again
        if (double && handle.dataset.h === "c" && m.kind === "arrow") { begin(); apply(items => items.map(x => (x.id === m.id ? { ...m, c: null } : x))); end(); return }
        begin(); setD({ type: "handle", id: m.id, which: handle.dataset.h!, orig: m })
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        return
      }
    }
    const hit = (target.closest("[data-id]") as HTMLElement | null)?.dataset.id ?? null
    const hitMark = hit ? shot.items.find(x => x.id === hit) : undefined
    const pickInstead = hitMark && tool !== "calib" && (tool === "select" || (tool === "tag" && hitMark.kind === "tag") || (tool === "spot" && hitMark.kind === "spot") || (tool === "text" && hitMark.kind === "text") || (tool === "ring" && hitMark.kind === "ring"))
    if (tool === "select" || pickInstead) {
      if (hitMark) {
        onSelect(hitMark.id)
        // double-click a tag, zone or note: its words open for typing
        if (double && (hitMark.kind === "tag" || hitMark.kind === "text" || hitMark.kind === "zone")) { onFocusText(); return }
        begin(); setD({ type: "move", id: hitMark.id, start: p, orig: hitMark, moved: false })
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      } else onSelect(null)
      return
    }
    if (tool === "calib") {
      const pins = calPts ?? []
      const near = pins.findIndex(q => dist(q.img, p) * scale < 14)
      if (near >= 0) { setD({ type: "pin", i: near }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return }
      if (calPick && onCalib) onCalib([...pins.filter(q => q.id !== calPick), { id: calPick, img: p, pitch: [0, 0] }])
      return
    }
    if (tool === "ring") { const d = defaults.ring; const s0 = snapTo(p); onCreate({ id: newId(), kind: "ring", color: d.color, x: s0.p[0], y: s0.p[1], r: 0.95, fill: d.fill, double: d.double, size: 1 }); return }
    if (tool === "tie" || tool === "measure" || tool === "shadow") {
      const s0 = tool === "shadow" ? { p, id: null } : snapTo(p)
      setD({ type: "arrow", tool, a: s0.p, b: p, ra: s0.id }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return
    }
    if (tool === "focus") { setD({ type: "box", start: p, cur: p, round: false, focus: true }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return }
    if (tool === "tag") {
      const d = defaults.tag
      const up = cal ? Math.max(70 * U, ppmAt(cal, p) * 2.9 + 26 * U) : 118 * U // above the player's head
      onCreate({ id: newId(), kind: "tag", color: d.color, x: p[0], y: p[1], dx: 0, dy: -up, label: "", ring: d.ring, glow: d.glow, style: d.style, size: 1 })
      onFocusText(); return
    }
    if (tool === "spot") { onCreate({ id: newId(), kind: "spot", color: defaults.spot.color, x: p[0], y: p[1], size: 1 }); return }
    if (tool === "text") {
      const d = defaults.text
      onCreate({ id: newId(), kind: "text", color: d.color, x: p[0], y: p[1], text: "", box: d.box, size: 1 })
      onFocusText(); return
    }
    if (tool === "arrow" || tool === "line") {
      const a = snap(p)
      setD({ type: "arrow", tool, a, b: p, ra: null }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return
    }
    if (tool === "zone") {
      if (poly.length) {
        // clicking the first corner again (or a fourth corner) closes the zone
        if (poly.length >= 3 && dist(p, poly[0]) < 16 / scale) { finishZone(poly); return }
        const next = [...poly, p]
        if (next.length === 4) finishZone(next); else setPoly(next)
        return
      }
      setD({ type: "box", start: p, cur: p, round: false }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (tool === "oval") { setD({ type: "box", start: p, cur: p, round: true }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) { if (tool === "zone" && poly.length) setHover(toImg(e)); return }
    if (d.type === "pan") { const v = viewRef.current!; v.scrollLeft = d.sl - (e.clientX - d.x); v.scrollTop = d.st - (e.clientY - d.y); return }
    const p = toImg(e)
    if (d.type === "move") {
      const dx = p[0] - d.start[0], dy = p[1] - d.start[1]
      if (!d.moved && Math.hypot(dx, dy) * scale < 3) return
      dragRef.current = { ...d, moved: true }
      apply(items => items.map(x => (x.id === d.id ? moveMark(d.orig, dx, dy) : x)))
    } else if (d.type === "handle") {
      const o = d.orig
      apply(items => items.map(x => {
        if (x.id !== d.id) return x
        if (o.kind === "tag" && d.which === "label") return { ...o, dx: p[0] - o.x, dy: p[1] - o.y }
        if (o.kind === "zone" && d.which.startsWith("p")) { const i = +d.which.slice(1); return { ...o, pts: o.pts.map((q, j) => (j === i ? p : q)) } }
        if (o.kind === "arrow") {
          if (d.which === "a") return { ...o, a: snap(p) }
          if (d.which === "b") return { ...o, b: snap(p) }
          if (d.which === "c") return { ...o, c: p }
        }
        if (o.kind === "tie") {
          const s0 = snapTo(p)
          if (d.which === "a") return { ...o, a: s0.p, ra: s0.id }
          if (d.which === "b") return { ...o, b: s0.p, rb: s0.id }
        }
        if (o.kind === "measure") { if (d.which === "a") return { ...o, a: snap(p) }; if (d.which === "b") return { ...o, b: snap(p) } }
        if (o.kind === "shadow") { if (d.which === "a") return { ...o, x: p[0], y: p[1] }; if (d.which === "b") return { ...o, bx: p[0], by: p[1] } }
        if (o.kind === "focus" && d.which.startsWith("p")) { const i = +d.which.slice(1); return { ...o, pts: o.pts.map((q, j) => (j === i ? p : q)) } }
        return x
      }))
    } else if (d.type === "pin") {
      if (onCalib && calPts) onCalib(calPts.map((q, i) => (i === d.i ? { ...q, img: p } : q)), true)
    } else if (d.type === "arrow") setD({ ...d, b: p })
    else if (d.type === "box") setD({ ...d, cur: p })
  }

  // The browser took the pointer away (a gesture, a dialog): keep what was moved, draw nothing new
  const onPointerCancel = () => {
    const d = dragRef.current
    setD(null)
    if (d && (d.type === "move" || d.type === "handle")) end()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    setD(null)
    if (!d) return
    if (d.type === "move" || d.type === "handle") { end(); return }
    if (d.type === "pin") { if (onCalib && calPts) onCalib(calPts); return }
    if (d.type === "arrow" && (d.tool === "tie" || d.tool === "measure" || d.tool === "shadow")) {
      const raw = toImg(e), s1 = d.tool === "shadow" ? { p: snap(raw), id: null } : snapTo(raw)
      if (dist(d.a, s1.p) * scale < 10) return
      if (d.tool === "tie") { const df = defaults.tie; onCreate({ id: newId(), kind: "tie", color: df.color, a: d.a, b: s1.p, ra: d.ra, rb: s1.id, dash: df.dash, dist: df.dist && !!cal, size: 1 }) }
      else if (d.tool === "measure") onCreate({ id: newId(), kind: "measure", color: defaults.measure.color, a: d.a, b: s1.p, size: 1 })
      else onCreate({ id: newId(), kind: "shadow", color: defaults.shadow.color, x: s1.p[0], y: s1.p[1], bx: d.a[0], by: d.a[1], len: 14, spread: 10, size: 1 })
      return
    }
    if (d.type === "arrow") {
      const b = snap(toImg(e))
      if (dist(d.a, b) * scale < 10) return // a click, not a drag
      const df = d.tool === "line" ? { ...defaults.line, head: "none" as const } : defaults.arrow
      onCreate({ id: newId(), kind: "arrow", color: df.color, a: d.a, b, c: null, dash: df.dash, head: df.head, size: d.tool === "line" ? 0.7 : 1 })
      return
    }
    if (d.type === "box" && d.focus) {
      const c = toImg(e)
      let [x0, x1] = [Math.min(d.start[0], c[0]), Math.max(d.start[0], c[0])], [y0, y1] = [Math.min(d.start[1], c[1]), Math.max(d.start[1], c[1])]
      if ((x1 - x0) * scale < 10 || (y1 - y0) * scale < 10) { x0 = d.start[0] - w * 0.18; x1 = d.start[0] + w * 0.18; y0 = d.start[1] - h * 0.22; y1 = d.start[1] + h * 0.22 }
      onCreate({ id: newId(), kind: "focus", pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dim: defaults.focus.dim, color: "#05060a", size: 1 })
      return
    }
    if (d.type === "box") {
      const c = toImg(e)
      if (Math.abs(c[0] - d.start[0]) * scale > 10 && Math.abs(c[1] - d.start[1]) * scale > 10) {
        const [x0, x1] = [Math.min(d.start[0], c[0]), Math.max(d.start[0], c[0])], [y0, y1] = [Math.min(d.start[1], c[1]), Math.max(d.start[1], c[1])]
        finishZone([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], d.round)
      } else if (d.round) {
        // a click: an oval of a usual size around that spot
        const [x, y] = d.start, rx = 70 * U, ry = 34 * U
        finishZone([[x - rx, y - ry], [x + rx, y - ry], [x + rx, y + ry], [x - rx, y + ry]], true)
      } else { setPoly([d.start]); setHover(d.start) }
    }
  }

  // Ctrl (or Cmd) and the wheel zooms, around the pointer
  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !src) return
    e.preventDefault()
    const el = viewRef.current!, r = el.getBoundingClientRect()
    const next = Math.min(6, Math.max(1, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
    if (next === zoom) return
    zoomAt.current = { px: toImg(e), cx: e.clientX - r.left, cy: e.clientY - r.top }
    setZoom(next)
  }
  // React's wheel listener is passive, so the page would zoom too: stop it here
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const stop = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault() }
    el.addEventListener("wheel", stop, { passive: false })
    return () => el.removeEventListener("wheel", stop)
  }, [])

  const selMark = sel ? shot.items.find(x => x.id === sel) : undefined
  const r = 7 / scale, sw = 1.6 / scale // handles look the same size at any zoom
  const H = (id: string, p: Pt, shape: "c" | "s" | "d" = "c", label?: string) => (
    <g key={id} data-h={id} style={{ cursor: "grab", pointerEvents: "all" }} role="img" aria-label={label}>
      <circle cx={p[0]} cy={p[1]} r={r * 2.2} fill="transparent" />
      {shape === "c" && <circle cx={p[0]} cy={p[1]} r={r} fill="#ffffff" stroke="#111" strokeWidth={sw} />}
      {shape === "s" && <rect x={p[0] - r} y={p[1] - r} width={2 * r} height={2 * r} fill="#d7ff3c" stroke="#111" strokeWidth={sw} />}
      {shape === "d" && <rect x={p[0] - r} y={p[1] - r} width={2 * r} height={2 * r} fill="#ffffff" stroke="#111" strokeWidth={sw} transform={`rotate(45 ${p[0]} ${p[1]})`} />}
    </g>
  )
  const cursor = drag?.type === "pan" || space ? (drag ? "grabbing" : "grab") : tool === "select" ? "default" : "crosshair"
  const ar = drag?.type === "arrow" ? drag : null, bx = drag?.type === "box" ? drag : null

  return (
    <div ref={viewRef} className="an-view" onWheel={onWheel} style={{ overflow: zoom > 1 ? "auto" : "hidden" }}>
      {fit > 0 && (
        <div className="an-wrap" style={{ width: w * scale, height: h * scale, cursor, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDragStart={e => e.preventDefault()}
          onPointerLeave={() => setHover(null)}>
          <svg ref={stageRef} viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ display: "block" }} data-stage="shot">
            {src ? <image href={src} x={0} y={0} width={w} height={h} preserveAspectRatio="none" style={look ? { filter: look } : undefined} data-pic="1" /> : <rect width={w} height={h} fill="#16181c" />}
            {shot.dim > 0 && <rect width={w} height={h} fill="#000" fillOpacity={shot.dim} />}
            {under}
            <Marks items={shot.items} w={w} h={h} fit={cal} />
            {seal}
          </svg>
          <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} data-stage="overlay">
            {selBox && <rect x={selBox.x - 6 * U} y={selBox.y - 6 * U} width={selBox.width + 12 * U} height={selBox.height + 12 * U} fill="none" stroke="#d7ff3c" strokeWidth={sw} strokeDasharray={`${5 / scale} ${4 / scale}`} />}
            {selMark?.kind === "tag" && selMark.label.trim() && H("label", [selMark.x + selMark.dx, selMark.y + selMark.dy], "s", "Move the label")}
            {selMark?.kind === "zone" && <>
              <polygon points={selMark.pts.map(p => p.join(",")).join(" ")} fill="none" stroke="#d7ff3c" strokeWidth={sw} strokeDasharray={selMark.round ? `${5 / scale} ${4 / scale}` : undefined} />
              {selMark.pts.map((p, i) => H("p" + i, p, "s", `Corner ${i + 1}`))}
            </>}
            {selMark?.kind === "arrow" && <>
              {H("a", selMark.a, "c", "Start")}{H("b", selMark.b, "c", "End")}
              {H("c", selMark.c ?? mid(selMark.a, selMark.b), "d", "Curve")}
            </>}
            {(selMark?.kind === "tie" || selMark?.kind === "measure") && <>{H("a", selMark.a, "c", "Start")}{H("b", selMark.b, "c", "End")}</>}
            {selMark?.kind === "shadow" && <>{H("a", [selMark.x, selMark.y], "s", "The presser")}{H("b", [selMark.bx, selMark.by], "c", "The ball")}</>}
            {selMark?.kind === "focus" && <>
              <polygon points={selMark.pts.map(p => p.join(",")).join(" ")} fill="none" stroke="#d7ff3c" strokeWidth={sw} strokeDasharray={`${5 / scale} ${4 / scale}`} />
              {selMark.pts.map((p, i) => H("p" + i, p, "s", `Corner ${i + 1}`))}
            </>}
            {tool === "calib" && cal && pitchLines().map((ln, i) => <path key={"pl" + i} d={pathOf(ln.map(q => project(cal.H, q)))} fill="none" stroke="#ff3ea5" strokeWidth={2.2 / scale} strokeOpacity={0.9} />)}
            {tool === "calib" && (calPts ?? []).map((q, i) => (
              <g key={q.id} style={{ pointerEvents: "all", cursor: "grab" }}>
                <circle cx={q.img[0]} cy={q.img[1]} r={13 / scale} fill="#d7ff3c" stroke="#0a0c0f" strokeWidth={2.5 / scale} />
                <text x={q.img[0]} y={q.img[1]} textAnchor="middle" dominantBaseline="central" fontSize={13 / scale} fontWeight={800} fill="#0a0c0f" style={{ fontFamily: "Inter, sans-serif" }}>{i + 1}</text>
              </g>
            ))}
            {ar && (ar.tool === "tie" || ar.tool === "measure" || ar.tool === "shadow") && <path d={`M${ar.a[0]},${ar.a[1]} L${ar.b[0]},${ar.b[1]}`} stroke="#d7ff3c" strokeWidth={3 * U} strokeDasharray={`${8 * U} ${6 * U}`} fill="none" />}
            {ar && ar.tool !== "tie" && ar.tool !== "measure" && ar.tool !== "shadow" && <path d={arrowPath(ar.a, ar.b, null)} stroke="#d7ff3c" strokeWidth={4 * U} strokeDasharray={ar.tool === "line" ? undefined : `${12 * U} ${8 * U}`} fill="none" />}
            {bx?.round && <ellipse cx={(bx.start[0] + bx.cur[0]) / 2} cy={(bx.start[1] + bx.cur[1]) / 2} rx={Math.abs(bx.cur[0] - bx.start[0]) / 2} ry={Math.abs(bx.cur[1] - bx.start[1]) / 2} fill="rgba(215,255,60,0.18)" stroke="#d7ff3c" strokeWidth={sw} />}
            {bx?.focus && <rect x={Math.min(bx.start[0], bx.cur[0])} y={Math.min(bx.start[1], bx.cur[1])} width={Math.abs(bx.cur[0] - bx.start[0])} height={Math.abs(bx.cur[1] - bx.start[1])} fill="none" stroke="#d7ff3c" strokeWidth={2 * sw} strokeDasharray={`${6 / scale} ${4 / scale}`} />}
            {bx && !bx.round && !bx.focus && <rect x={Math.min(bx.start[0], bx.cur[0])} y={Math.min(bx.start[1], bx.cur[1])} width={Math.abs(bx.cur[0] - bx.start[0])} height={Math.abs(bx.cur[1] - bx.start[1])} fill="rgba(215,255,60,0.18)" stroke="#d7ff3c" strokeWidth={sw} />}
            {poly.length > 0 && <>
              <polyline points={[...poly, ...(hover ? [hover] : [])].map(p => p.join(",")).join(" ")} fill="rgba(215,255,60,0.15)" stroke="#d7ff3c" strokeWidth={2 * sw} />
              {poly.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={r} fill={i === 0 ? "#d7ff3c" : "#fff"} stroke="#111" strokeWidth={sw} />)}
            </>}
          </svg>
          {hint && <div className="an-hint" role="status">{poly.length ? (poly.length < 3 ? `Corner ${poly.length + 1} of 4. Click on the pitch.` : "Click the 4th corner, or press Enter to finish with 3.") : hint}</div>}
        </div>
      )}
    </div>
  )
}
