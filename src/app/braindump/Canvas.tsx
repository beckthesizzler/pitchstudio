import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Maximize2, Minus, MoreHorizontal, Plus } from "lucide-react"
import { col, nameOf, type Note } from "./notes"
import { THREAD } from "./Wall"
import { Plant, type Stage } from "./Plant"
import { darkLook, photoLayer, wallSurface, type Look } from "./walls"
import { FRAME_MIN, GAP, HEAD, INDENT, NOTE_H, NOTE_W, PAD, PIN, arrange, inside, r1, union, type Centre, type Move, type Rect } from "./arrange"
export { FREE_CSS } from "./canvasCss"
export { NOTE_H, NOTE_W, type Centre, type Move, type Rect } from "./arrange"

const TILTS = [-1.1, 0.3, 1, -0.4, 0.7]
const LONG_PRESS = 380
type Stat = { id: Stage; label: string; ties: number }

/* The free wall: every note sits where you put it. Piles are frames you can move and resize, with their notes inside;
   drop a note onto another and a red thread ties them; drop it in a frame to put it there, or on the bare wall to take
   it out. Drag the wall to look around; pinch, Ctrl + scroll or the buttons to zoom. */

/** A thread from one pin to another, hanging a little slack */
const threadPath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const len = Math.hypot(b.x - a.x, b.y - a.y), bow = Math.min(26, len * 0.12)
  return `M${a.x} ${a.y} Q${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2 + bow).toFixed(1)} ${b.x} ${b.y}`
}

type Gesture =
  | { mode: "pan"; sx: number; sy: number; px: number; py: number; moved: boolean; pid: number }
  | { mode: "note" | "frame"; id: string; ids: string[]; sx: number; sy: number; px: number; py: number; on: boolean; touch: boolean; armed: boolean; timer: number; pid: number }
  | { mode: "resize"; id: string; sx: number; sy: number; r: Rect; min: { w: number; h: number }; pid: number }
  | { mode: "pinch"; d0: number; z0: number; mx: number; my: number; wx: number; wy: number }
type Drag = { ids: Set<string>; dx: number; dy: number; target: string | null; frameTarget: string | null; kind: "note" | "frame" } | null

export type WallView = { x: number; y: number; z: number }
export function FreeWall(p: {
  wallKey: string; notes: Note[]; look: Look; photo: string | null; banner: ReactNode
  kids: (id: string | null) => Note[]; pileOf: (n: Note) => Note | null; under: (id: string) => Note[]
  sel: string | null; dim: (n: Note) => boolean; flash: string | null; popped: Set<string>; stat: (pileId: string) => Stat
  name: (pile: Note) => ReactNode
  statusCaps: (n: Note) => ReactNode
  centre: React.MutableRefObject<Centre>
  show: React.MutableRefObject<((id: string) => void) | null>
  onPlace: (m: Move[]) => void
  onFile: (id: string, pile: string | null, m: Move[]) => void
  onTie: (id: string, to: string, m: Move[]) => void
  onSelect: (id: string | null) => void
  onOpen: (id: string) => void
  onMenu: (kind: "note" | "pile", id: string, x: number, y: number) => void
  onAddAt: (x: number, y: number, pile: string | null) => void
  onGrow: (pileId: string) => void
  onDragging: (on: boolean) => void
  inside: Map<string, { wall: string; notes: number }> // notes that open into walls of their own
}) {
  const { notes, look } = p
  const L = useMemo(() => arrange(notes, p.kids, p.pileOf), [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const byId = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes])
  // anything just placed for the first time is saved, once
  const savedFresh = useRef("")
  useEffect(() => {
    if (!L.fresh.length) return
    const key = L.fresh.map(m => `${m.id}:${m.x}:${m.y}:${m.w ?? ""}:${m.h ?? ""}`).join("|")
    if (key === savedFresh.current) return
    savedFresh.current = key
    p.onPlace(L.fresh.map(m => ({ ...m, x: r1(m.x), y: r1(m.y), ...(m.w ? { w: r1(m.w), h: r1(m.h!) } : {}) })))
  }, [L]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── looking around: pan and zoom, remembered per wall in this browser ── */
  const box = useRef<HTMLDivElement>(null)
  const VKEY = `ps-wall-view-${p.wallKey}`
  const [v, setV] = useState<WallView | null>(null)
  const vRef = useRef<WallView>({ x: 0, y: 0, z: 1 })
  if (v) vRef.current = v
  const fit = () => {
    const el = box.current
    if (!el) return
    const rs = [...L.at.values()]
    if (!rs.length) { setV({ x: el.clientWidth / 2 - 300, y: 0, z: 1 }); return }
    const b0 = rs.reduce(union), b = { ...b0, y: b0.y - 100, h: b0.h + 100 } // with the banner above
    const W = el.clientWidth, H = el.clientHeight, top = 20
    if (W < 560) { // a phone: readable, starting at the top left of everything, rather than all of it tiny
      const z = Math.max(0.5, Math.min(1, (W - 28) / (NOTE_W + PAD * 2 + INDENT * 2)))
      setV({ z, x: 14 - b.x * z, y: top + 10 - b.y * z })
      return
    }
    const z = Math.max(0.25, Math.min(1.1, (W - 60) / b.w, (H - top - 70) / b.h))
    setV({ x: (W - b.w * z) / 2 - b.x * z, y: top - b.y * z + Math.max(0, (H - top - 70 - b.h * z) / 2), z })
  }
  useLayoutEffect(() => {
    let saved: WallView | null = null
    try { const s = JSON.parse(localStorage.getItem(VKEY) || "null"); if (s && [s.x, s.y, s.z].every(Number.isFinite)) saved = { x: s.x, y: s.y, z: Math.max(0.2, Math.min(2.5, s.z)) } } catch { /* nothing kept */ }
    if (saved) setV(saved); else fit()
  }, [p.wallKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!v) return; const t = setTimeout(() => { try { localStorage.setItem(VKEY, JSON.stringify(v)) } catch { /* not kept */ } }, 400); return () => clearTimeout(t) }, [v, VKEY])
  const view = v ?? vRef.current
  const toWorld = (cx: number, cy: number) => { const r = box.current!.getBoundingClientRect(), V = vRef.current; return { x: (cx - r.left - V.x) / V.z, y: (cy - r.top - V.y) / V.z } }
  const zoomAt = (z: number, cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect(), V = vRef.current, nz = Math.max(0.2, Math.min(2.5, z))
    const wx = (cx - r.left - V.x) / V.z, wy = (cy - r.top - V.y) / V.z
    setV({ z: nz, x: cx - r.left - wx * nz, y: cy - r.top - wy * nz })
  }
  // where a new note goes: the empty spot nearest the middle of what you're looking at, never on a note or inside a frame
  useEffect(() => {
    const el = box.current
    if (!el) return
    const V = view, cx = (el.clientWidth / 2 - V.x) / V.z, cy = (el.clientHeight / 2 - V.y) / V.z
    const banner = el.querySelector<HTMLElement>(".fw-banner") // the wall's name (centred on its spot) sits above everything: keep it clear too
    const taken = (also: Rect[]) => [...L.at.values(), ...also, ...(banner ? [{ x: banner.offsetLeft - banner.offsetWidth / 2, y: banner.offsetTop, w: banner.offsetWidth, h: banner.offsetHeight }] : [])]
    // the nearest empty spot in an area (s = how many screens wide it reaches past what you see)
    const look = (w: number, h: number, all: Rect[], s: number) => {
      const W = el.clientWidth / V.z, H = el.clientHeight / V.z, m = 16 / V.z, gap = 14, step = Math.max(12, 24 / V.z) * (1 + s)
      const x0 = -V.x / V.z + m - s * W, y0 = -V.y / V.z + m - s * H, x1 = -V.x / V.z + W - m - w + s * W, y1 = -V.y / V.z + H - m - h + s * H
      const clear = (x: number, y: number) => !all.some(o => x < o.x + o.w + gap && x + w + gap > o.x && y < o.y + o.h + gap && y + h + gap > o.y)
      let best: { x: number; y: number } | null = null, bd = Infinity
      for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
        const d = (x + w / 2 - cx) ** 2 + (y + h / 2 - cy) ** 2
        if (d < bd && clear(x, y)) { bd = d; best = { x: r1(x), y: r1(y) } }
      }
      return best
    }
    // in view if there's room; if not, just past the edge (and the wall then brings it into view)
    const free = (w: number, h: number, also: Rect[]) => {
      const all = taken(also), here = look(w, h, all, 0)
      if (here) return { ...here, off: false }
      const near = look(w, h, all, 1)
      return near ? { ...near, off: true } : null
    }
    p.centre.current = { x: cx - NOTE_W / 2, y: cy - NOTE_H / 2, free }
  })
  // the side list (or search) asks to see a frame or a note: it comes to the middle, lit up
  p.show.current = (id: string) => {
    const R = L.at.get(id), el = box.current
    if (!R || !el) return
    const z = Math.max(vRef.current.z, 0.7)
    setV({ z, x: el.clientWidth / 2 - (R.x + R.w / 2) * z, y: el.clientHeight / 2 - (R.y + Math.min(R.h, 300) / 2) * z })
  }
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) zoomAt(vRef.current.z * Math.exp(-e.deltaY * 0.0022), e.clientX, e.clientY)
      else setV(V => { const W = V ?? vRef.current; return { ...W, x: W.x - e.deltaX, y: W.y - e.deltaY } })
    }
    el.addEventListener("wheel", wheel, { passive: false })
    return () => el.removeEventListener("wheel", wheel)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── moving things: notes, frames, frame corners, the wall itself ── */
  const g = useRef<Gesture | null>(null)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const [drag, setDrag] = useState<Drag>(null)
  const dragRef = useRef<Drag>(null)
  dragRef.current = drag
  const quiet = useRef(false) // a drag just ended: the click after it does nothing
  const hush = () => { quiet.current = true; setTimeout(() => { quiet.current = false }, 0) }
  const members = (frameId: string) => notes.filter(n => n.kind === "note" && p.pileOf(n)?.id === frameId).map(n => n.id)
  const targetAt = (cx: number, cy: number, ids: Set<string>) => {
    let note: string | null = null, frame: string | null = null
    for (const el of document.elementsFromPoint(cx, cy) as HTMLElement[]) {
      const n = el.closest?.("[data-fw-note]") as HTMLElement | null, f = el.closest?.("[data-fw-frame]") as HTMLElement | null
      if (!note && n && !ids.has(n.dataset.fwNote!)) note = n.dataset.fwNote!
      if (!frame && f && !ids.has(f.dataset.fwFrame!)) frame = f.dataset.fwFrame!
    }
    return { note, frame }
  }
  const banned = (id: string) => new Set([id, ...p.under(id).map(k => k.id)])
  const edge = useRef({ x: 0, y: 0, cx: 0, cy: 0 })
  const raf = useRef(0)
  const step = () => { // near the edge while dragging, the wall slides along
    const e = edge.current
    if (!e.x && !e.y) { raf.current = 0; return }
    setV(V => { const W = V ?? vRef.current; return { ...W, x: W.x - e.x, y: W.y - e.y } })
    moveDrag(e.cx, e.cy)
    raf.current = requestAnimationFrame(step)
  }
  const moveDrag = (cx: number, cy: number) => {
    const G = g.current
    if (!G || (G.mode !== "note" && G.mode !== "frame") || !G.on) return
    const V = vRef.current, dx = (cx - G.sx - (V.x - G.px)) / V.z, dy = (cy - G.sy - (V.y - G.py)) / V.z
    const ids = new Set(G.ids)
    const t = G.mode === "note" ? targetAt(cx, cy, ids) : { note: null, frame: null }
    setDrag({ ids, dx, dy, target: t.note, frameTarget: t.frame, kind: G.mode })
  }
  const start = (e: React.PointerEvent, mode: "note" | "frame", id: string) => {
    if (e.button !== 0 || touches.current.size > 1) return
    e.stopPropagation()
    const touch = e.pointerType === "touch"
    const ids = mode === "note" ? [...banned(id)] : [id, ...members(id)]
    const G: Gesture = { mode, id, ids, sx: e.clientX, sy: e.clientY, px: vRef.current.x, py: vRef.current.y, on: false, touch, armed: !touch || mode === "frame", timer: 0, pid: e.pointerId }
    if (touch && mode === "note") G.timer = window.setTimeout(() => {
      if (g.current !== G) return
      G.armed = true
      try { navigator.vibrate?.(12) } catch { /* no buzz */ }
      G.on = true; p.onDragging(true); moveDrag(G.sx, G.sy)
    }, LONG_PRESS)
    g.current = G
  }
  const fingers = (e: React.PointerEvent) => { // every finger, wherever it lands (a note, a frame, the wall): two of them zoom
    if (e.pointerType !== "touch") return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size === 2) {
      const [a, b] = [...touches.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, w = toWorld(mx, my)
      const G = g.current
      if (G && (G.mode === "note" || G.mode === "frame")) window.clearTimeout(G.timer)
      setDrag(null); p.onDragging(false)
      g.current = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), z0: vRef.current.z, mx, my, wx: w.x, wy: w.y }
      e.stopPropagation()
    }
  }
  const down = (e: React.PointerEvent) => { // on the bare wall: look around
    if (g.current || e.button !== 0) return
    if ((e.target as HTMLElement).closest("button, input, textarea, [data-fw-stop]")) return
    g.current = { mode: "pan", sx: e.clientX, sy: e.clientY, px: vRef.current.x, py: vRef.current.y, moved: false, pid: e.pointerId }
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const G = g.current
      if (!G) return
      if (G.mode === "pinch") {
        if (touches.current.size < 2) return
        const [a, b] = [...touches.current.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        const z = Math.max(0.2, Math.min(2.5, G.z0 * Math.hypot(a.x - b.x, a.y - b.y) / G.d0)), r = box.current!.getBoundingClientRect()
        setV({ z, x: mx - r.left - G.wx * z, y: my - r.top - G.wy * z })
        return
      }
      if (e.pointerId !== G.pid) return
      if (G.mode === "pan") {
        if (!G.moved && Math.hypot(e.clientX - G.sx, e.clientY - G.sy) < 4) return
        G.moved = true
        setV({ ...vRef.current, x: G.px + e.clientX - G.sx, y: G.py + e.clientY - G.sy })
        return
      }
      if (G.mode === "resize") {
        const z = vRef.current.z
        setDrag(null)
        setResize({ id: G.id, w: Math.max(G.min.w, G.r.w + (e.clientX - G.sx) / z), h: Math.max(G.min.h, G.r.h + (e.clientY - G.sy) / z) })
        return
      }
      const far = Math.hypot(e.clientX - G.sx, e.clientY - G.sy)
      if (G.touch && !G.armed) { // a finger moved before the long press: it's looking around, not lifting the note
        if (far > 8) { window.clearTimeout(G.timer); g.current = { mode: "pan", sx: G.sx, sy: G.sy, px: G.px, py: G.py, moved: true, pid: G.pid } }
        return
      }
      if (!G.on) { if (far < 5) return; G.on = true; p.onDragging(true) }
      moveDrag(e.clientX, e.clientY)
      const r = box.current!.getBoundingClientRect(), M = 46, sp = 12
      edge.current = { x: e.clientX < r.left + M ? -sp : e.clientX > r.right - M ? sp : 0, y: e.clientY < r.top + M ? -sp : e.clientY > r.bottom - M ? sp : 0, cx: e.clientX, cy: e.clientY }
      if ((edge.current.x || edge.current.y) && !raf.current) raf.current = requestAnimationFrame(step)
    }
    const up = (e: PointerEvent) => {
      touches.current.delete(e.pointerId)
      const G = g.current
      if (!G) return
      if (G.mode === "pinch") { if (touches.current.size < 2) g.current = null; return }
      if (e.pointerId !== G.pid) return
      g.current = null
      edge.current = { x: 0, y: 0, cx: 0, cy: 0 }
      if (G.mode === "pan") { if (G.moved) hush(); return }
      if (G.mode === "resize") { finishResize(); return }
      window.clearTimeout(G.timer)
      if (G.touch && G.armed && !G.on && G.mode === "note") { hush(); p.onMenu("note", G.id, e.clientX, e.clientY); return }
      if (G.touch && G.armed && G.on && G.mode === "note" && Math.hypot(e.clientX - G.sx, e.clientY - G.sy) < 8) { setDrag(null); p.onDragging(false); hush(); p.onMenu("note", G.id, e.clientX, e.clientY); return }
      if (!G.on) return
      hush()
      const D = dragRef.current
      setDrag(null); p.onDragging(false)
      if (D) drop(G, D)
    }
    const cancel = (e: PointerEvent) => { touches.current.delete(e.pointerId); const G = g.current; if (G && "timer" in G) window.clearTimeout(G.timer); g.current = null; setDrag(null); setResize(null); p.onDragging(false) }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel) }
  })
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  /** The frame grown just enough to take these spots */
  const grow = (frameId: string, spots: Move[]): Move[] => {
    const F = L.at.get(frameId)
    if (!F) return []
    let G = F
    for (const s of spots) G = union(G, { x: s.x - PAD, y: s.y - HEAD, w: NOTE_W + PAD * 2, h: NOTE_H + HEAD + PAD })
    return G === F ? [] : [{ id: frameId, x: r1(G.x), y: r1(G.y), w: r1(G.w), h: r1(G.h) }]
  }
  const drop = (G: Extract<Gesture, { mode: "note" | "frame" }>, D: NonNullable<Drag>) => {
    let moves: Move[] = G.ids.map(id => { const R = L.at.get(id)!; return { id, x: r1(R.x + D.dx), y: r1(R.y + D.dy), ...(byId.get(id)?.kind === "tree" ? { w: r1(R.w), h: r1(R.h) } : {}) } })
    if (G.mode === "frame") { p.onPlace(moves); return }
    const n = byId.get(G.id)!, now = p.pileOf(n)?.id ?? null
    if (D.target) { // tied: it hangs just under the note it's tied to (in the first free spot), with what hangs off it
      const T = L.at.get(D.target)!, root = moves.find(m => m.id === G.id)!, mine = new Set(G.ids)
      const others = ideas.filter(o => !mine.has(o.id)).map(o => L.at.get(o.id)).filter(Boolean) as Rect[]
      const hits = (x: number, y: number) => others.some(o => x < o.x + o.w - 8 && x + NOTE_W > o.x + 8 && y < o.y + o.h - 8 && y + NOTE_H > o.y + 8)
      let tx = T.x + INDENT, ty = T.y + NOTE_H + GAP
      for (let i = 0; i < 40 && hits(tx, ty); i++) ty += NOTE_H + GAP
      const sx = tx - root.x, sy = ty - root.y
      moves = moves.map(m => ({ ...m, x: m.x + sx, y: m.y + sy }))
      const tp = p.pileOf(byId.get(D.target)!)
      p.onTie(G.id, D.target, [...moves, ...(tp ? grow(tp.id, moves) : [])])
      return
    }
    if (D.frameTarget) { const extra = grow(D.frameTarget, moves); if (D.frameTarget === now) p.onPlace([...moves, ...extra]); else p.onFile(G.id, D.frameTarget, [...moves, ...extra]); return }
    if (now) p.onFile(G.id, null, moves) // out of its frame, onto the bare wall
    else p.onPlace(moves)
  }
  const [resize, setResize] = useState<{ id: string; w: number; h: number } | null>(null)
  const resizeRef = useRef(resize); resizeRef.current = resize
  const finishResize = () => { const R = resizeRef.current; setResize(null); hush(); if (!R) return; const F = L.at.get(R.id)!; p.onPlace([{ id: R.id, x: r1(F.x), y: r1(F.y), w: r1(R.w), h: r1(R.h) }]) }
  const startResize = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const F = L.at.get(id)!
    let w = FRAME_MIN.w, h = FRAME_MIN.h
    for (const m of members(id)) { const R = L.at.get(m); if (R) { w = Math.max(w, R.x + R.w + PAD - F.x); h = Math.max(h, R.y + R.h + PAD - F.y) } }
    g.current = { mode: "resize", id, sx: e.clientX, sy: e.clientY, r: F, min: { w, h }, pid: e.pointerId }
  }

  /** Where something is drawn right now: moved along while it's being dragged */
  const rectOf = (id: string): Rect => {
    const R = L.at.get(id)!
    let out = drag && drag.ids.has(id) ? { ...R, x: R.x + drag.dx, y: R.y + drag.dy } : R
    if (resize && resize.id === id) out = { ...out, w: resize.w, h: resize.h }
    return out
  }
  const keyMove = (e: React.KeyboardEvent, n: Note) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (e.key === "Enter") { e.preventDefault(); p.onOpen(n.id); return }
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); p.onMenu("note", n.id, b.left + 20, b.bottom); return }
    if (!d) return
    e.preventDefault()
    const s = e.shiftKey ? 50 : 10, ids = [...banned(n.id)]
    p.onPlace(ids.map(id => { const R = L.at.get(id)!; return { id, x: r1(R.x + d[0] * s), y: r1(R.y + d[1] * s) } }))
  }

  const piles = notes.filter(n => n.kind === "tree")
  const ideas = notes.filter(n => n.kind === "note")
  // the banner hangs above everything on the wall, in the middle
  const top = useMemo(() => { const rs = [...L.at.values()]; if (!rs.length) return { x: 300, y: 10 }; const b = rs.reduce(union); return { x: b.x + b.w / 2, y: b.y - 92 } }, [L])
  const dark = darkLook(look)
  const surface = wallSurface(look, p.photo)
  return (
    <div className={`fw${dark ? " dark" : ""} n-${look.note} p-${look.pin}${drag ? " dragging" : ""}`} ref={box} style={surface} onPointerDownCapture={fingers} onPointerDown={down}
      onClick={e => { if (quiet.current || (e.target as HTMLElement).closest("[data-fw-note], [data-fw-frame-head], button")) return; p.onSelect(null) }}
      onDoubleClick={e => { if ((e.target as HTMLElement).closest("[data-fw-note], [data-fw-frame-head], button, input")) return; const w = toWorld(e.clientX, e.clientY); const f = piles.find(f => inside(L.at.get(f.id)!, w.x, w.y)); p.onAddAt(r1(w.x - NOTE_W / 2), r1(w.y - NOTE_H / 2), f?.id ?? null) }}
      onContextMenu={e => { if (!(e.target as HTMLElement).closest("[data-fw-note], [data-fw-frame-head]")) e.preventDefault() }}
      role="region" aria-label="Your wall. Drag to look around, double-click to pin a note">
      {look.bg === "photo" && p.photo && <><div className="fw-photo" style={photoLayer(look, p.photo)} aria-hidden="true" />{look.treat === "duo" && <div className="fw-duo" aria-hidden="true" />}</>}
      <div className="fw-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}>
        {piles.map(f => {
          const R = rectOf(f.id), st = p.stat(f.id), over = drag?.kind === "note" && drag.frameTarget === f.id && !drag.target
          return (
            <section key={f.id} className={`fw-frame${over ? " over" : ""}${p.flash === f.id ? " flash" : ""}${drag?.ids.has(f.id) ? " moving" : ""}`} data-fw-frame={f.id}
              style={{ left: R.x, top: R.y, width: R.w, height: R.h, ["--dot" as any]: col(f.color).root }} aria-label={`Frame: ${nameOf(f)}`}>
              <div className="fw-fhead" data-fw-frame-head={f.id} onPointerDown={e => { if (!(e.target as HTMLElement).closest("input")) start(e, "frame", f.id) }}
                onClickCapture={e => { if (quiet.current) { e.stopPropagation(); e.preventDefault() } }}
                onContextMenu={e => { e.preventDefault(); p.onMenu("pile", f.id, e.clientX, e.clientY) }}>
                <div className="bd-tag" style={{ ["--dot" as any]: col(f.color).root }}>
                  <span className="bd-tag-pin" aria-hidden="true" />
                  {p.name(f)}
                  <button className="bd-tag-more" aria-label={`More for ${nameOf(f)}`} onClick={e => { const b = e.currentTarget.getBoundingClientRect(); p.onMenu("pile", f.id, b.left, b.bottom + 4) }}><MoreHorizontal size={15} /></button>
                </div>
                <button className="bd-grow" onClick={() => p.onGrow(f.id)} aria-label={`${st.label}, ${st.ties} tie${st.ties === 1 ? "" : "s"}. Grow this idea`} title="Grow this idea">
                  <Plant stage={st.id} pop={p.popped.has(f.id)} />
                  <span><b>{st.label}</b><small>{st.ties} tie{st.ties === 1 ? "" : "s"}</small></span>
                </button>
              </div>
              {!members(f.id).length && <p className="fw-fempty">Drag notes in here</p>}
              <span className="fw-resize" data-fw-stop onPointerDown={e => startResize(e, f.id)} title="Drag to resize" aria-hidden="true" />
            </section>
          )
        })}
        <div className="fw-banner" data-fw-stop style={{ left: top.x, top: top.y }}>{p.banner}</div>
        <svg className="fw-threads" width="1" height="1" aria-hidden="true">
          {ideas.map(n => {
            const t = n.parent_id ? byId.get(n.parent_id) : undefined
            if (!t || t.kind !== "note" || !L.at.has(t.id) || !L.at.has(n.id)) return null
            const a = rectOf(n.id), b = rectOf(t.id), A = { x: a.x + PIN.x, y: a.y + PIN.y }, B = { x: b.x + PIN.x, y: b.y + PIN.y }
            return <g key={n.id}><path d={threadPath(B, A)} fill="none" stroke={THREAD} strokeWidth="2.2" strokeLinecap="round" /><circle cx={A.x} cy={A.y} r="2.4" fill={THREAD} /><circle cx={B.x} cy={B.y} r="2.4" fill={THREAD} /></g>
          })}
        </svg>
        {ideas.map((n, i) => {
          if (!L.at.has(n.id)) return null
          const R = rectOf(n.id), c = col(n.color), lifted = drag?.ids.has(n.id)
          const can = drag?.kind === "note" && !lifted, over = can && drag?.target === n.id
          return (
            <div key={n.id} className={`fw-note${lifted ? " lifted" : ""}${over ? " over" : ""}${p.dim(n) ? " dim" : ""}${p.sel === n.id ? " sel" : ""}${p.inside.has(n.id) ? " walled" : ""}`} data-fw-note={n.id}
              style={{ left: R.x, top: R.y, width: NOTE_W, height: NOTE_H, ["--paper" as any]: c.c, ["--pin" as any]: c.root, ["--tilt" as any]: `${look.note === "sticky" ? TILTS[i % TILTS.length] : 0}deg` }}>
              <button className="fw-face" onPointerDown={e => start(e, "note", n.id)} aria-pressed={p.sel === n.id}
                onClick={() => { if (!quiet.current) p.onSelect(n.id) }} onDoubleClick={() => { if (!quiet.current) p.onOpen(n.id) }}
                onContextMenu={e => { e.preventDefault(); if (quiet.current) return; p.onMenu("note", n.id, e.clientX, e.clientY) }}
                onKeyDown={e => keyMove(e, n)} aria-label={`${nameOf(n)}${p.inside.has(n.id) ? `, a wall with ${p.inside.get(n.id)!.notes} notes` : ""}. Arrow keys move it, Enter opens it`}>
                <span className="t">{nameOf(n)}</span>
                <span className="m">{p.inside.has(n.id) ? <>▤ A WALL · {p.inside.get(n.id)!.notes}</> : p.statusCaps(n)}</span>
              </button>
              {p.inside.has(n.id) && <button className="fw-go" onClick={() => p.onOpen(n.id)} aria-label={`Open the wall ${nameOf(n)}`}>Open ↗</button>}
              <span className="fw-pin" aria-hidden="true" />
            </div>
          )
        })}
      </div>
      <div className="fw-zoom" data-fw-stop role="group" aria-label="Zoom">
        <button onClick={() => { const r = box.current!.getBoundingClientRect(); zoomAt(vRef.current.z / 1.25, r.left + r.width / 2, r.top + r.height / 2) }} aria-label="Zoom out"><Minus size={15} /></button>
        <span aria-live="polite">{Math.round(view.z * 100)}%</span>
        <button onClick={() => { const r = box.current!.getBoundingClientRect(); zoomAt(vRef.current.z * 1.25, r.left + r.width / 2, r.top + r.height / 2) }} aria-label="Zoom in"><Plus size={15} /></button>
        <button onClick={fit} aria-label="Fit everything in view" title="Fit"><Maximize2 size={14} /> Fit</button>
      </div>
      {!ideas.length && !piles.length && <p className="fw-hello">Double-click anywhere to pin your first idea, or type it on the left.</p>}
    </div>
  )
}
