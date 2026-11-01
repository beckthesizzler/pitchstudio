import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import type { Brand } from "../brand/brand"
import { ReportView, blockBox, passGround, pathOf } from "./Draw"
import { SIZES, mid, newId, projector, type Block, type Mark, type Pass, type PhotoBlock, type PitchBlock, type Pt, type Report } from "./model"

/* The page you design on. The report is drawn by ReportView; on top of it sits a second svg for everything that is not part of
   the picture (selection, handles, guides, the pitch-mode shade), so none of it can end up in an export.
   Three ways of working: the page (move and size blocks), inside a pitch (players, passes, pins, zones, the ball) and inside a photo (crop). */

export type Sel = { bid: string | null; mid: string | null }
export type Mode = { kind: "page" } | { kind: "pitch"; bid: string } | { kind: "crop"; bid: string }
export type PitchTool = "select" | "player" | "opp" | "pass" | "run" | "pin" | "zone" | "ball"

const V = "#d7ff3c" // the editor's own colour for selection and guides
const rad = (d: number) => (d * Math.PI) / 180
const rot = (q: Pt, a: number): Pt => [q[0] * Math.cos(a) - q[1] * Math.sin(a), q[0] * Math.sin(a) + q[1] * Math.cos(a)]
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]

type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "rot"
const DIRS: Record<Exclude<Handle, "rot">, [number, number]> = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1], n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }
/** Which handles each kind of block has: corners scale it; sides change its width (and crop a photo) */
export function handlesOf(b: Block): Handle[] {
  switch (b.kind) {
    case "photo": return ["nw", "ne", "sw", "se", "n", "s", "e", "w", "rot"]
    case "text": return ["nw", "ne", "sw", "se", "e", "w", "rot"]
    case "pitch": return ["nw", "ne", "sw", "se"]
    default: return ["nw", "ne", "sw", "se", "e", "w"]
  }
}

/** Resizing by a handle, with the opposite corner (or side) held still, in the block's own turned frame */
function resized(o: Block, h: Exclude<Handle, "rot">, p: Pt, free: boolean): Block {
  const B = blockBox(o), th = rad(B.rot), c0: Pt = [B.x + B.w / 2, B.y + B.h / 2]
  const [hx, hy] = DIRS[h], flow = o.kind === "text" || o.kind === "stats" || o.kind === "story" // these grow downwards
  const ax = -hx, ay = hy === 0 ? (flow ? -1 : 0) : -hy
  const A = add(c0, rot([ax * B.w / 2, ay * B.h / 2], th)), d = rot(sub(p, A), -th)
  let w = B.w, hh = B.h, f = 1
  const corner = hx !== 0 && hy !== 0
  if (corner && !(o.kind === "photo" && free)) {
    // scale along the diagonal
    f = Math.max(0.05, (hx * d[0] * B.w + hy * d[1] * B.h) / (B.w * B.w + B.h * B.h))
    const min = o.kind === "text" ? 8 / (o as { size: number }).size : 40 / Math.min(B.w, B.h)
    f = Math.max(f, min)
    w = B.w * f; hh = B.h * f
  } else {
    if (hx !== 0) w = Math.max(40, hx * d[0])
    if (hy !== 0) hh = Math.max(40, hy * d[1])
  }
  if (o.kind === "photo" && !corner) {
    // cropping: the frame may not leave the picture
    const ih = o.iw * (o.nh / o.nw)
    if (hx < 0) w = Math.min(w, B.w - o.ix); if (hx > 0) w = Math.min(w, o.ix + o.iw)
    if (hy < 0) hh = Math.min(hh, B.h - o.iy); if (hy > 0) hh = Math.min(hh, o.iy + ih)
  }
  const c1 = sub(A, rot([ax * w / 2, ay * hh / 2], th)), x = c1[0] - w / 2, y = c1[1] - hh / 2
  switch (o.kind) {
    case "text": return corner ? { ...o, x, y, w: o.w * f, size: Math.round(o.size * f * 10) / 10 } : { ...o, x, y: o.y, w }
    case "pitch": return { ...o, x, y, w: o.w * f }
    case "stats": case "story": return corner ? { ...o, x, y, w: o.w * f, s: o.s * f } : { ...o, x, y: o.y, w }
    case "photo": {
      if (corner) return { ...o, x, y, w, h: hh, ix: o.ix * f, iy: o.iy * f, iw: o.iw * f }
      // keep the picture still on the page: move it inside the frame by however much the frame's corner moved
      const tl0 = add(c0, rot([-B.w / 2, -B.h / 2], th)), tl1 = add(c1, rot([-w / 2, -hh / 2], th))
      const dl = rot(sub(tl0, tl1), -th)
      return { ...o, x, y, w, h: hh, ix: o.ix + dl[0], iy: o.iy + dl[1] }
    }
  }
}
/** A photo's picture must always cover its frame */
export function clampCrop(o: PhotoBlock): PhotoBlock {
  const cover = Math.max(o.w, o.h * (o.nw / o.nh))
  const iw = Math.max(o.iw, cover), ih = iw * (o.nh / o.nw)
  return { ...o, iw, ix: Math.min(0, Math.max(o.w - iw, o.ix)), iy: Math.min(0, Math.max(o.h - ih, o.iy)) }
}
export const moveBlock = (b: Block, dx: number, dy: number): Block => ({ ...b, x: b.x + dx, y: b.y + dy })
/** The lowest number not yet used by that team (for a new player or pin) */
export function nextNumber(marks: Mark[], kind: "player" | "pin", team = 0) {
  const used = new Set(marks.filter(m => m.kind === kind && (kind === "pin" || (m as { team: number }).team === team)).map(m => (m as { num?: string; n?: string }).num ?? (m as { n: string }).n))
  for (let i = 1; i < 100; i++) if (!used.has(String(i))) return String(i)
  return ""
}

type Drag =
  | { t: "move"; bid: string; start: Pt; orig: Block; moved: boolean; dbl: boolean }
  | { t: "size"; bid: string; h: Handle; orig: Block }
  | { t: "pan"; x: number; y: number; sl: number; st: number }
  | { t: "mark"; bid: string; mid: string; start: Pt; orig: Mark; links: { id: string; end: "a" | "b" }[]; moved: boolean; dbl: boolean }
  | { t: "mh"; bid: string; mid: string; h: string; orig: Mark }
  | { t: "newpass"; bid: string; a: Pt; b: Pt; run: boolean }
  | { t: "newzone"; bid: string; a: Pt; b: Pt }
  | { t: "crop"; bid: string; start: Pt; orig: PhotoBlock }

export function Canvas({ report, brand, handle, logo, media, sel, setSel, mode, setMode, tool, apply, begin, end, zoom, setZoom, svgRef, onEditText, onPickPhoto, onDropFiles, hint }: {
  report: Report; brand: Brand; handle: string; logo: string | null; media: Record<string, string>
  sel: Sel; setSel: (s: Sel) => void; mode: Mode; setMode: (m: Mode) => void; tool: PitchTool
  apply: (fn: (r: Report) => Report) => void; begin: () => void; end: () => void
  zoom: number; setZoom: (z: number) => void; svgRef: RefObject<SVGSVGElement | null>
  onEditText: (bid: string, mid?: string) => void; onPickPhoto: (bid: string) => void; onDropFiles: (files: File[], at: Pt) => void; hint: string
}) {
  const [W, H] = SIZES[report.format]
  const viewRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0)
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [hover, setHover] = useState<string | null>(null)
  const [space, setSpace] = useState(false)
  const last = useRef({ t: 0, x: 0, y: 0, id: "" })
  const zoomAt = useRef<{ px: Pt; cx: number; cy: number } | null>(null)
  const setDrag = (d: Drag | null) => { dragRef.current = d; setDragState(d) }

  useLayoutEffect(() => {
    const el = viewRef.current
    if (!el) return
    const measure = () => { const r = el.getBoundingClientRect(); setFit(Math.max(0.05, Math.min((r.width - 56) / W, (r.height - 56) / H))) }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [W, H])
  const scale = fit * zoom
  useLayoutEffect(() => {
    const z = zoomAt.current, el = viewRef.current
    if (!z || !el) return
    zoomAt.current = null
    el.scrollLeft = Math.max(0, z.px[0] * scale + 28 - z.cx); el.scrollTop = Math.max(0, z.px[1] * scale + 28 - z.cy)
  }, [scale])
  // Space held: drag to pan around a zoomed page
  useLayoutEffect(() => {
    const typing = (t: EventTarget | null) => { const e = t as HTMLElement | null; return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.isContentEditable) }
    const dn = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { if (!e.repeat) setSpace(true); e.preventDefault() } }
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false) }
    window.addEventListener("keydown", dn); window.addEventListener("keyup", up)
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up) }
  }, [])

  const toRep = (e: { clientX: number; clientY: number }): Pt => {
    const m = svgRef.current?.getScreenCTM()
    if (!m) return [0, 0]
    const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    return [q.x, q.y]
  }
  const byId = (id: string | null) => (id ? report.blocks.find(b => b.id === id) ?? null : null)
  const selBlock = byId(sel.bid)
  const pitchOf = (id: string) => byId(id) as PitchBlock | null
  const tol = 7 / Math.max(0.05, scale)

  /* ── snapping: the page's edges and middle, and every other block's edges and middle ── */
  const snapMove = (o: Block, dx: number, dy: number, off: boolean) => {
    const B = blockBox(o), M = 64 * (W / 1600)
    if (off) return { dx, dy, gx: null as number | null, gy: null as number | null }
    const others = report.blocks.filter(b => b.id !== o.id).map(blockBox)
    const xs = [M, W / 2, W - M, ...others.flatMap(b => [b.x, b.x + b.w / 2, b.x + b.w])]
    const ys = [M, H / 2, H - M, ...others.flatMap(b => [b.y, b.y + b.h / 2, b.y + b.h])]
    const best = (anchors: number[], targets: number[]) => {
      let bd = tol, out: { d: number; at: number } | null = null
      for (const a of anchors) for (const t of targets) { const d = t - a; if (Math.abs(d) < bd) { bd = Math.abs(d); out = { d, at: t } } }
      return out
    }
    const sx = best([B.x + dx, B.x + dx + B.w / 2, B.x + dx + B.w], xs), sy = best([B.y + dy, B.y + dy + B.h / 2, B.y + dy + B.h], ys)
    return { dx: dx + (sx?.d ?? 0), dy: dy + (sy?.d ?? 0), gx: sx?.at ?? null, gy: sy?.at ?? null }
  }

  /** Resizing snaps too: the edge being pulled lands on the page's margins and middle, and on other blocks' edges and middles */
  const snapSize = (o: Block, h: Exclude<Handle, "rot">, p: Pt, free: boolean, off: boolean) => {
    const B = blockBox(o)
    let nb = resized(o, h, p, free)
    if (off || B.rot) return { b: nb, gx: null as number | null, gy: null as number | null }
    const M = 64 * (W / 1600), others = report.blocks.filter(b => b.id !== o.id).map(blockBox)
    const xs = [M, W / 2, W - M, ...others.flatMap(b => [b.x, b.x + b.w / 2, b.x + b.w])]
    const ys = [M, H / 2, H - M, ...others.flatMap(b => [b.y, b.y + b.h / 2, b.y + b.h])]
    const near = (v: number, ts: number[]) => { let bd = tol, at: number | null = null; for (const t of ts) if (Math.abs(t - v) < bd) { bd = Math.abs(t - v); at = t } return at }
    const N = blockBox(nb), [hx, hy] = DIRS[h], ex = hx > 0 ? N.x + N.w : N.x, ey = hy > 0 ? N.y + N.h : N.y
    const tx = hx ? near(ex, xs) : null, ty = hy ? near(ey, ys) : null
    if (hx && hy && !(o.kind === "photo" && free)) {
      // a corner scales evenly: the nearer of the two edges decides, and the corner is placed exactly
      const useX = tx !== null && (ty === null || Math.abs(tx - ex) <= Math.abs(ty - ey))
      if (tx === null && ty === null) return { b: nb, gx: null, gy: null }
      const f = useX ? (hx > 0 ? tx! - B.x : B.x + B.w - tx!) / B.w : (hy > 0 ? ty! - B.y : B.y + B.h - ty!) / B.h
      const A: Pt = [hx > 0 ? B.x : B.x + B.w, hy > 0 ? B.y : B.y + B.h]
      nb = resized(o, h, [A[0] + hx * B.w * f, A[1] + hy * B.h * f], free)
      return { b: nb, gx: useX ? tx : null, gy: useX ? null : ty }
    }
    if (tx === null && ty === null) return { b: nb, gx: null, gy: null }
    nb = resized(o, h, [p[0] + (tx !== null ? tx - ex : 0), p[1] + (ty !== null ? ty - ey : 0)], free)
    return { b: nb, gx: tx, gy: ty }
  }

  /* ── inside a pitch ── */
  const pitchPt = (b: PitchBlock, p: Pt): Pt => projector(b).inv(p[0], p[1])
  const pitchScreen = (b: PitchBlock, q: Pt): Pt => { const r = projector(b).fwd(q[0], q[1]); return [r[0], r[1]] }
  const snapPlayer = (b: PitchBlock, q: Pt): Pt => {
    const s = pitchScreen(b, q)
    let best: Pt | null = null, bd = 26 / Math.max(0.05, scale)
    for (const m of b.marks) if (m.kind === "player") { const d = Math.hypot(...sub(pitchScreen(b, m.p), s)); if (d < bd) { bd = d; best = m.p } }
    return best ?? q
  }
  const setMarks = (bid: string, fn: (ms: Mark[]) => Mark[]) => apply(r => ({ ...r, blocks: r.blocks.map(b => (b.id === bid && b.kind === "pitch" ? { ...b, marks: fn(b.marks) } : b)) }))
  const setBlock = (bid: string, fn: (b: Block) => Block) => apply(r => ({ ...r, blocks: r.blocks.map(b => (b.id === bid ? fn(b) : b)) }))
  const insidePitch = (b: PitchBlock, q: Pt) => q[0] > -0.06 && q[0] < 1.06 && q[1] > -0.06 && q[1] < 1.08
  const moveMark = (b: PitchBlock, m: Mark, ds: Pt): Mark => {
    const mv = (q: Pt): Pt => pitchPt(b, add(pitchScreen(b, q), ds))
    switch (m.kind) {
      case "pass": return { ...m, a: mv(m.a), b: mv(m.b), c: m.c ? mv(m.c) : null }
      default: return { ...m, p: mv(m.p) }
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return
    e.preventDefault()
    const ae = document.activeElement as HTMLElement | null
    if (ae && ae !== document.body && ae.blur && ae.closest?.(".rp-insp") == null) ae.blur()
    const view = viewRef.current!
    if (e.button === 1 || space) { setDrag({ t: "pan", x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop }); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); return }
    const p = toRep(e), target = e.target as Element
    const now = performance.now(), ld = last.current
    const hit = (target.closest("[data-mid]") as HTMLElement | null)?.dataset.mid ?? (target.closest("[data-bid]") as HTMLElement | null)?.dataset.bid ?? ""
    const double = now - ld.t < 420 && Math.hypot(e.clientX - ld.x, e.clientY - ld.y) < 6 && ld.id === hit
    last.current = { t: double ? 0 : now, x: e.clientX, y: e.clientY, id: hit }
    const capture = () => (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const hEl = target.closest("[data-h]") as HTMLElement | null

    // inside a photo: drag the picture around its frame
    if (mode.kind === "crop") {
      const o = byId(mode.bid) as PhotoBlock | null
      if (o && (target.closest(`[data-crop]`) || target.closest(`[data-bid="${o.id}"]`))) { begin(); setDrag({ t: "crop", bid: o.id, start: p, orig: o }); capture(); return }
      setMode({ kind: "page" })
    }

    // inside a pitch
    if (mode.kind === "pitch") {
      const b = pitchOf(mode.bid)
      if (b) {
        const q = pitchPt(b, p)
        const mEl = target.closest("[data-mid]") as HTMLElement | null
        const mk = mEl ? b.marks.find(m => m.id === mEl.dataset.mid) ?? null : null
        if (hEl && sel.mid && hEl.dataset.h) {
          const m = b.marks.find(x => x.id === sel.mid)
          if (m) { begin(); setDrag({ t: "mh", bid: b.id, mid: m.id, h: hEl.dataset.h, orig: m }); capture(); return }
        }
        if (mk || insidePitch(b, q)) {
          const pick = (m: Mark) => {
            setSel({ bid: b.id, mid: m.id })
            const links = m.kind === "player" ? b.marks.filter((x): x is Pass => x.kind === "pass").flatMap(x => [
              ...(Math.hypot(x.a[0] - m.p[0], x.a[1] - m.p[1]) < 0.004 ? [{ id: x.id, end: "a" as const }] : []),
              ...(Math.hypot(x.b[0] - m.p[0], x.b[1] - m.p[1]) < 0.004 ? [{ id: x.id, end: "b" as const }] : [])]) : []
            // a second press only counts as a double-click if it lets go without moving (so click, then drag, still drags)
            begin(); setDrag({ t: "mark", bid: b.id, mid: m.id, start: p, orig: m, links, moved: false, dbl: double && (m.kind === "player" || m.kind === "zone") }); capture()
          }
          if (tool === "select") { if (mk) pick(mk); else setSel({ bid: b.id, mid: null }); return }
          if ((tool === "player" || tool === "opp") && mk?.kind === "player") { pick(mk); return }
          if (tool === "pin" && mk?.kind === "pin") { pick(mk); return }
          if (tool === "player" || tool === "opp") {
            const team = tool === "player" ? 0 : 1
            const m: Mark = { id: newId(), kind: "player", team, p: q, num: nextNumber(b.marks, "player", team), name: "", side: "below", hi: team === 0 }
            begin(); setMarks(b.id, ms => [...ms, m]); end(); setSel({ bid: b.id, mid: m.id }); return
          }
          if (tool === "pin") { const m: Mark = { id: newId(), kind: "pin", p: q, n: nextNumber(b.marks, "pin") }; begin(); setMarks(b.id, ms => [...ms, m]); end(); setSel({ bid: b.id, mid: m.id }); return }
          if (tool === "ball") {
            const ball = b.marks.find(m => m.kind === "ball")
            begin(); setMarks(b.id, ms => ball ? ms.map(m => (m.id === ball.id ? { ...m, p: q } : m)) : [...ms, { id: newId(), kind: "ball", p: q }]); end(); return
          }
          if (tool === "pass" || tool === "run") { const a = snapPlayer(b, q); setDrag({ t: "newpass", bid: b.id, a, b: q, run: tool === "run" }); capture(); return }
          if (tool === "zone") { setDrag({ t: "newzone", bid: b.id, a: q, b: q }); capture(); return }
          return
        }
      }
      setMode({ kind: "page" }) // a click outside the pitch: back to the page, and that click counts there too
    }

    // the page
    if (hEl && selBlock && hEl.dataset.h) { begin(); setDrag({ t: "size", bid: selBlock.id, h: hEl.dataset.h as Handle, orig: selBlock }); capture(); return }
    const bEl = target.closest("[data-bid]") as HTMLElement | null
    let b = bEl ? byId(bEl.dataset.bid ?? null) : null
    if (b && e.altKey) {
      // Alt click: the block underneath (again: the one under that), so nothing is ever stuck behind another
      const ids = [...new Set(document.elementsFromPoint(e.clientX, e.clientY).map(el => (el.closest("[data-bid]") as HTMLElement | null)?.dataset.bid ?? "").filter(Boolean))]
      const i = ids.indexOf(sel.bid ?? "")
      if (ids.length > 1) b = byId(ids[i < 0 ? 1 : (i + 1) % ids.length]) ?? b
    }
    if (!b) { setSel({ bid: null, mid: null }); return }
    setSel({ bid: b.id, mid: null })
    begin(); setDrag({ t: "move", bid: b.id, start: p, orig: b, moved: false, dbl: double && !e.altKey }); capture()
  }
  /** Double-click: into a pitch, into a photo's crop (or pick one for an empty slot), into a text's words */
  const goInside = (b: Block) => {
    if (b.kind === "pitch") setMode({ kind: "pitch", bid: b.id })
    else if (b.kind === "photo") { if (b.src && media[b.src]) setMode({ kind: "crop", bid: b.id }); else onPickPhoto(b.id) }
    else onEditText(b.id)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) {
      if (mode.kind === "page") { const bEl = (e.target as Element).closest("[data-bid]") as HTMLElement | null; const id = bEl?.dataset.bid ?? null; if (id !== hover) setHover(id) }
      return
    }
    if (d.t === "pan") { const v = viewRef.current!; v.scrollLeft = d.sl - (e.clientX - d.x); v.scrollTop = d.st - (e.clientY - d.y); return }
    const p = toRep(e)
    if (d.t === "move") {
      let dx = p[0] - d.start[0], dy = p[1] - d.start[1]
      if (!d.moved && Math.hypot(dx, dy) * scale < 3) return
      d.moved = true
      if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      const s = snapMove(d.orig, dx, dy, e.ctrlKey || e.metaKey)
      setGuides({ x: s.gx, y: s.gy })
      setBlock(d.bid, () => moveBlock(d.orig, s.dx, s.dy))
      return
    }
    if (d.t === "size") {
      if (d.h === "rot") {
        const B = blockBox(d.orig), c: Pt = [B.x + B.w / 2, B.y + B.h / 2]
        let a = (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI + 90
        if (e.shiftKey) a = Math.round(a / 15) * 15
        else for (const t of [-180, -90, 0, 90, 180, 270]) if (Math.abs(a - t) < 4) a = t
        a = ((((a + 180) % 360) + 360) % 360) - 180
        setBlock(d.bid, b => ({ ...b, rot: Math.round(a * 10) / 10 }) as Block)
        return
      }
      const r = snapSize(d.orig, d.h as Exclude<Handle, "rot">, p, e.shiftKey, e.ctrlKey || e.metaKey)
      setGuides({ x: r.gx, y: r.gy })
      setBlock(d.bid, () => r.b)
      return
    }
    if (d.t === "crop") {
      const th = rad(d.orig.rot), dl = rot(sub(p, d.start), -th)
      setBlock(d.bid, () => clampCrop({ ...d.orig, ix: d.orig.ix + (d.orig.flip ? dl[0] : dl[0]), iy: d.orig.iy + dl[1] }))
      return
    }
    const b = pitchOf(d.bid)
    if (!b) return
    if (d.t === "mark") {
      const ds = sub(p, d.start)
      if (!d.moved && Math.hypot(...ds) * scale < 3) return
      d.moved = true
      const moved = moveMark(b, d.orig, ds)
      setMarks(b.id, ms => ms.map(m => {
        if (m.id === d.mid) return moved
        const l = d.links.filter(x => x.id === m.id)
        if (!l.length || m.kind !== "pass" || moved.kind !== "player") return m
        let n = m
        for (const x of l) n = x.end === "a" ? { ...n, a: moved.p } : { ...n, b: moved.p }
        return n
      }))
      return
    }
    if (d.t === "mh") {
      const q = pitchPt(b, p), o = d.orig
      setMarks(b.id, ms => ms.map(m => {
        if (m.id !== d.mid) return m
        if (o.kind === "pass") return d.h === "a" ? { ...o, a: snapPlayer(b, q) } : d.h === "b" ? { ...o, b: snapPlayer(b, q) } : { ...o, c: q }
        if (o.kind === "zone") return { ...o, r: [Math.max(0.015, Math.abs(q[0] - o.p[0])), Math.max(0.015, Math.abs(q[1] - o.p[1]))] }
        return m
      }))
      return
    }
    if (d.t === "newpass") { setDrag({ ...d, b: snapPlayer(b, pitchPt(b, p)) }); return }
    if (d.t === "newzone") { setDrag({ ...d, b: pitchPt(b, p) }); return }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    setDrag(null); setGuides({ x: null, y: null })
    if (!d) return
    // only a press that let go without moving can be the first half of a double-click (a drag, then a click, is not one)
    if (!((d.t === "move" || d.t === "mark") && !d.moved)) last.current = { ...last.current, t: 0 }
    if (d.t === "move" || d.t === "size" || d.t === "crop" || d.t === "mark" || d.t === "mh") {
      end()
      if (d.t === "move" && d.dbl && !d.moved) { const b = byId(d.bid); if (b) goInside(b) }
      if (d.t === "mark" && d.dbl && !d.moved) onEditText(d.bid, d.mid)
      return
    }
    if (d.t === "pan") return
    const b = pitchOf(d.bid)
    if (!b) return
    if (d.t === "newpass") {
      const A = pitchScreen(b, d.a), B = pitchScreen(b, d.b)
      if (Math.hypot(...sub(A, B)) * scale < 12) return
      const m: Mark = { id: newId(), kind: "pass", a: d.a, b: d.b, c: null, run: d.run, weight: 2, hi: true, head: "end", air: false }
      begin(); setMarks(b.id, ms => [...ms, m]); end(); setSel({ bid: b.id, mid: m.id })
      return
    }
    if (d.t === "newzone") {
      const A = pitchScreen(b, d.a), B = pitchScreen(b, d.b), small = Math.hypot(...sub(A, B)) * scale < 12
      const c = small ? d.a : mid(d.a, d.b)
      const r: Pt = small ? [0.1, 0.07] : [Math.max(0.015, Math.abs(d.b[0] - d.a[0]) / 2), Math.max(0.015, Math.abs(d.b[1] - d.a[1]) / 2)]
      const m: Mark = { id: newId(), kind: "zone", p: c, r, oval: false, hi: true, label: "" }
      begin(); setMarks(b.id, ms => [...ms, m]); end(); setSel({ bid: b.id, mid: m.id })
    }
    void e
  }
  const onPointerCancel = () => { const d = dragRef.current; setDrag(null); setGuides({ x: null, y: null }); if (d && d.t !== "pan" && d.t !== "newpass" && d.t !== "newzone") end() }

  const onWheel = (e: WheelEvent) => {
    if (mode.kind === "crop" && !(e.ctrlKey || e.metaKey)) {
      const o = byId(mode.bid) as PhotoBlock | null
      if (!o) return
      e.preventDefault()
      const f = e.deltaY < 0 ? 1.06 : 1 / 1.06, iw = o.iw * f
      const fx = (o.w / 2 - o.ix) / o.iw, fy = (o.h / 2 - o.iy) / (o.iw * (o.nh / o.nw))
      begin(); setBlock(o.id, () => clampCrop({ ...o, iw, ix: o.w / 2 - fx * iw, iy: o.h / 2 - fy * iw * (o.nh / o.nw) })); end()
      return
    }
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const el = viewRef.current!, r = el.getBoundingClientRect()
    const next = Math.min(4, Math.max(0.5, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
    if (next === zoom) return
    zoomAt.current = { px: toRep(e), cx: e.clientX - r.left, cy: e.clientY - r.top }
    setZoom(next)
  }

  // the wheel is listened to directly (not passively), so Ctrl + scroll zooms the page here instead of the whole browser
  const wheel = useRef(onWheel); wheel.current = onWheel
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const h = (e: WheelEvent) => wheel.current(e)
    el.addEventListener("wheel", h, { passive: false })
    return () => el.removeEventListener("wheel", h)
  }, [])

  /* ── what sits on top: selection, handles, guides, the pitch shade, previews ── */
  const hs = 11 / Math.max(0.05, scale), sw = 1.6 / Math.max(0.05, scale)
  const frame = (b: Block, strong: boolean) => {
    const B = blockBox(b), c: Pt = [B.x + B.w / 2, B.y + B.h / 2]
    const corners: Record<Exclude<Handle, "rot">, Pt> = { nw: [B.x, B.y], ne: [B.x + B.w, B.y], sw: [B.x, B.y + B.h], se: [B.x + B.w, B.y + B.h], n: [c[0], B.y], s: [c[0], B.y + B.h], e: [B.x + B.w, c[1]], w: [B.x, c[1]] }
    const cur: Record<string, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", rot: "grab" }
    return (
      <g transform={B.rot ? `rotate(${B.rot} ${c[0]} ${c[1]})` : undefined}>
        <rect x={B.x} y={B.y} width={B.w} height={B.h} fill="none" stroke={V} strokeWidth={strong ? sw * 1.4 : sw} strokeDasharray={strong ? undefined : `${4 / scale} ${4 / scale}`} />
        {strong && handlesOf(b).map(h => h === "rot"
          ? <g key={h}><line x1={c[0]} y1={B.y} x2={c[0]} y2={B.y - 34 / scale} stroke={V} strokeWidth={sw} /><circle data-h="rot" cx={c[0]} cy={B.y - 34 / scale} r={hs * 0.62} fill="#0b0d10" stroke={V} strokeWidth={sw * 1.4} style={{ pointerEvents: "all", cursor: cur.rot }}><title>Turn (Shift for 15° steps)</title></circle></g>
          : <rect key={h} data-h={h} x={corners[h][0] - hs / 2} y={corners[h][1] - hs / 2} width={hs} height={hs} rx={h.length === 1 ? hs / 2 : hs * 0.18} fill="#ffffff" stroke="#0b0d10" strokeWidth={sw}
            style={{ pointerEvents: "all", cursor: cur[h] }} />)}
      </g>
    )
  }
  const pitchUi = () => {
    if (mode.kind !== "pitch") return null
    const b = pitchOf(mode.bid)
    if (!b) return null
    const B = blockBox(b), m = 26 / scale
    const shade = <path d={`M-4000,-4000 H${W + 4000} V${H + 4000} H-4000 Z M${B.x - m},${B.y - m} V${B.y + B.h + m} H${B.x + B.w + m} V${B.y - m} Z`} fill="#06070a" fillOpacity={0.62} fillRule="evenodd" />
    const S = (q: Pt) => pitchScreen(b, q)
    const mk = sel.mid ? b.marks.find(x => x.id === sel.mid) : null
    const dot = (h: string, q: Pt, shape: "c" | "d" = "c", title = "") => { const s = S(q); return shape === "d"
      ? <rect key={h} data-h={h} x={s[0] - hs / 2} y={s[1] - hs / 2} width={hs} height={hs} transform={`rotate(45 ${s[0]} ${s[1]})`} fill={V} stroke="#0b0d10" strokeWidth={sw} style={{ pointerEvents: "all", cursor: "move" }}><title>{title}</title></rect>
      : <circle key={h} data-h={h} cx={s[0]} cy={s[1]} r={hs * 0.6} fill="#ffffff" stroke="#0b0d10" strokeWidth={sw} style={{ pointerEvents: "all", cursor: "move" }}><title>{title}</title></circle> }
    let sel2 = null
    if (mk) {
      if (mk.kind === "pass") sel2 = <g><path d={pathOf(Array.from({ length: 21 }, (_, i) => S(passGround(mk)(i / 20))))} fill="none" stroke={V} strokeWidth={sw * 1.4} strokeDasharray={`${5 / scale} ${4 / scale}`} />
        {dot("a", mk.a, "c", "Start")}{dot("b", mk.b, "c", "End")}{dot("c", mk.c ?? mid(mk.a, mk.b), "d", "Curve")}</g>
      else if (mk.kind === "zone") { const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => S([mk.p[0] + i * mk.r[0], mk.p[1] + j * mk.r[1]])); sel2 = <g><path d={pathOf(pts, true)} fill="none" stroke={V} strokeWidth={sw * 1.4} />{dot("r", [mk.p[0] + mk.r[0], mk.p[1] + mk.r[1]], "d", "Size")}</g> }
      else { const s = S(mk.p); sel2 = <circle cx={s[0]} cy={s[1]} r={(mk.kind === "ball" ? 16 : 30) / Math.max(0.6, scale * 1.4)} fill="none" stroke={V} strokeWidth={sw * 1.6} /> }
    }
    const d = drag
    const preview = d?.t === "newpass" ? <path d={pathOf([S(d.a), S(d.b)])} stroke={V} strokeWidth={4 / scale} strokeDasharray={d.run ? `${10 / scale} ${7 / scale}` : undefined} fill="none" />
      : d?.t === "newzone" ? <path d={pathOf([S(d.a), S([d.b[0], d.a[1]]), S(d.b), S([d.a[0], d.b[1]])], true)} fill="rgba(215,255,60,0.15)" stroke={V} strokeWidth={sw * 1.4} /> : null
    return <g>{shade}<rect x={B.x - m} y={B.y - m} width={B.w + 2 * m} height={B.h + 2 * m} fill="none" stroke={V} strokeOpacity={0.5} strokeWidth={sw} strokeDasharray={`${6 / scale} ${5 / scale}`} />{sel2}{preview}</g>
  }
  const cropUi = () => {
    if (mode.kind !== "crop") return null
    const o = byId(mode.bid) as PhotoBlock | null
    if (!o || !media[o.src]) return null
    const c: Pt = [o.x + o.w / 2, o.y + o.h / 2], ih = o.iw * (o.nh / o.nw)
    return (
      <g transform={o.rot ? `rotate(${o.rot} ${c[0]} ${c[1]})` : undefined}>
        <image data-crop="1" href={media[o.src]} x={o.x + o.ix} y={o.y + o.iy} width={o.iw} height={ih} opacity={0.38} preserveAspectRatio="none" style={{ pointerEvents: "all", cursor: "grab" }}
          transform={o.flip ? `translate(${2 * (o.x + o.ix) + o.iw} 0) scale(-1 1)` : undefined} />
        <rect x={o.x + o.ix} y={o.y + o.iy} width={o.iw} height={ih} fill="none" stroke="#ffffff" strokeOpacity={0.6} strokeWidth={sw} strokeDasharray={`${5 / scale} ${4 / scale}`} />
        <rect data-crop="1" x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" stroke={V} strokeWidth={sw * 1.6} style={{ pointerEvents: "all", cursor: "grab" }} />
      </g>
    )
  }
  const hovered = mode.kind === "page" && hover && hover !== sel.bid && !drag ? byId(hover) : null
  const cursor = drag?.t === "pan" || space ? (drag ? "grabbing" : "grab") : mode.kind === "pitch" && tool !== "select" ? "crosshair" : drag?.t === "move" || drag?.t === "crop" ? "grabbing" : "default"

  return (
    <div ref={viewRef} className="rp-view" style={{ overflow: zoom > 1 ? "auto" : "hidden" }}
      onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault() }}
      onDrop={e => { const files = [...e.dataTransfer.files].filter(f => f.type.startsWith("image/")); if (!files.length) return; e.preventDefault(); e.stopPropagation(); onDropFiles(files, toRep(e)) }}>
      {fit > 0 && (
        <div className="rp-wrap" style={{ width: W * scale, height: H * scale, cursor, touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDragStart={e => e.preventDefault()}
          onPointerLeave={() => setHover(null)}>
          <ReportView report={report} brand={brand} handle={handle} logo={logo} media={media} editing svgRef={svgRef} />
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }} data-ui="1" data-stage="overlay">
            {pitchUi()}
            {cropUi()}
            {hovered && frame(hovered, false)}
            {selBlock && mode.kind === "page" && frame(selBlock, true)}
            {guides.x !== null && <line x1={guides.x} y1={-4000} x2={guides.x} y2={H + 4000} stroke="#ff3dbb" strokeWidth={sw} />}
            {guides.y !== null && <line x1={-4000} y1={guides.y} x2={W + 4000} y2={guides.y} stroke="#ff3dbb" strokeWidth={sw} />}
          </svg>
          {hint && <div className="rp-hint" role="status">{hint}</div>}
        </div>
      )}
    </div>
  )
}
