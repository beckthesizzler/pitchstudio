import type { Note } from "./notes"

/* Where everything sits on the free wall: the sizes of notes and frames, and how a wall is laid out the first time
   (piles side by side as frames) or when something isn't placed yet. */

/** Where a note's pin sits (and what it turns around) */
export const PIN = { x: 16, y: 14 }
export const NOTE_W = 220, NOTE_H = 78
export const PAD = 22, HEAD = 64, GAP = 14, INDENT = 26, TOP = 110
export const FRAME_MIN = { w: NOTE_W + PAD * 2, h: 170 }
export type Rect = { x: number; y: number; w: number; h: number }
export type Move = { id: string; x: number; y: number; w?: number; h?: number }
/** The middle of what you're looking at on the free wall, and (once the wall is drawn) the empty spot nearest it for something w × h */
export type Centre = { x: number; y: number; free?: (w: number, h: number, also: Rect[]) => { x: number; y: number; off: boolean } | null }

export const inside = (r: Rect, px: number, py: number) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
export const union = (a: Rect, b: Rect): Rect => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y } }
export const r1 = (v: number) => Math.round(v)

/* Where everything sits. Notes go where you put them. A note not placed yet, or sitting outside the frame it belongs to
   (moved in Columns, added in Grow this idea, or by an older version of the app), is seated at the bottom of its frame;
   a loose note sitting inside a frame it isn't in goes to the free space on the right. `fresh`: the spots to save. */
export function arrange(notes: Note[], kids: (id: string | null) => Note[], pileOf: (n: Note) => Note | null): { at: Map<string, Rect>; fresh: Move[] } {
  const at = new Map<string, Rect>(), fresh: Move[] = []
  const piles = notes.filter(n => n.kind === "tree").sort((a, b) => a.pos - b.pos)
  const order = (root: string | null) => { // a pile's notes (or the loose ones) top to bottom, each with how deep it hangs
    const out: { n: Note; depth: number }[] = [], seen = new Set<string>()
    const walk = (list: Note[], d: number) => { for (const n of list) { if (n.kind !== "note" || seen.has(n.id)) continue; seen.add(n.id); out.push({ n, depth: d }); walk(kids(n.id), d + 1) } }
    walk(root ? kids(root) : kids(null).filter(n => n.kind === "note"), 0)
    return out
  }
  const loose = () => { // the notes in no frame (and any caught in a loop of ties)
    const top = order(null), ids = new Set([...piles.flatMap(p => order(p.id).map(o => o.n.id)), ...top.map(o => o.n.id)])
    return [...top, ...notes.filter(n => n.kind === "note" && !ids.has(n.id)).map(n => ({ n, depth: 0 }))]
  }

  if (!notes.some(n => n.x !== null)) { // nothing placed yet: the piles stand side by side as frames, the loose notes after them
    let cx = 40
    for (const p of piles) {
      const rows = order(p.id), deep = Math.min(2, Math.max(0, ...rows.map(r => r.depth)))
      const w = NOTE_W + PAD * 2 + deep * INDENT, h = Math.max(FRAME_MIN.h, HEAD + rows.length * (NOTE_H + GAP) - GAP + PAD)
      at.set(p.id, { x: cx, y: TOP, w, h }); fresh.push({ id: p.id, x: cx, y: TOP, w, h })
      rows.forEach((r, i) => { const x = cx + PAD + Math.min(r.depth, 2) * INDENT, y = TOP + HEAD + i * (NOTE_H + GAP); at.set(r.n.id, { x, y, w: NOTE_W, h: NOTE_H }); fresh.push({ id: r.n.id, x, y }) })
      cx += w + 60
    }
    loose().forEach((r, i) => {
      const x = cx + Math.floor(i / 7) * (NOTE_W + 70) + Math.min(r.depth, 2) * INDENT, y = TOP + 20 + (i % 7) * (NOTE_H + GAP + 6)
      at.set(r.n.id, { x, y, w: NOTE_W, h: NOTE_H }); fresh.push({ id: r.n.id, x, y })
    })
    return { at, fresh }
  }

  // frames: where you put them (a new one goes to the right of everything)
  const placed = notes.filter(n => n.x !== null && n.y !== null)
  let right = Math.max(40, ...placed.map(n => (n.x ?? 0) + (n.kind === "tree" ? n.w ?? FRAME_MIN.w : NOTE_W))) + 60
  for (const p of piles) {
    if (p.x !== null && p.y !== null) { at.set(p.id, { x: p.x, y: p.y, w: Math.max(FRAME_MIN.w, p.w ?? FRAME_MIN.w), h: Math.max(FRAME_MIN.h, p.h ?? FRAME_MIN.h) }); continue }
    const r = { x: right, y: TOP, w: FRAME_MIN.w, h: FRAME_MIN.h }
    at.set(p.id, r); fresh.push({ id: p.id, ...r }); right += r.w + 60
  }
  const frames = piles.map(p => ({ id: p.id, r: at.get(p.id)! }))
  const byId = new Map(notes.map(n => [n.id, n]))
  /** A new step tied to a note that's already on the wall goes to its right (the way the Tree grows), in the first free spot */
  const nextTo = (n: Note, own: string | null): { x: number; y: number } | null => {
    const P = n.parent_id ? at.get(n.parent_id) : undefined
    if (!P || byId.get(n.parent_id!)?.kind !== "note") return null
    const taken = [...at.entries()].filter(([k]) => byId.get(k)?.kind === "note").map(([, r]) => r)
    const busy = (x: number, y: number) => taken.some(o => x < o.x + o.w - 8 && x + NOTE_W > o.x + 8 && y < o.y + o.h - 8 && y + NOTE_H > o.y + 8)
    const intoOther = (x: number, y: number) => { // would this spot (or its frame, grown to hold it) run into another frame?
      let G: Rect = { x: x - PAD, y: y - HEAD, w: NOTE_W + PAD * 2, h: NOTE_H + HEAD + PAD }
      if (own && at.has(own)) G = union(at.get(own)!, G)
      return piles.some(f => f.id !== own && at.has(f.id) && (() => { const F = at.get(f.id)!; return G.x < F.x + F.w && G.x + G.w > F.x && G.y < F.y + F.h && G.y + G.h > F.y })())
    }
    let x = P.x + NOTE_W + 46, y = P.y
    for (let i = 0; i < 40 && busy(x, y); i++) y += NOTE_H + GAP
    if (!intoOther(x, y)) return { x, y }
    x = P.x + INDENT; y = P.y + NOTE_H + GAP // no room to the right without spilling into another frame: underneath instead
    for (let i = 0; i < 60 && busy(x, y); i++) y += NOTE_H + GAP
    return { x, y }
  }
  // notes in frames: kept if they sit inside their own frame, seated at its bottom if not
  for (const p of piles) {
    const F = at.get(p.id)!, rows = order(p.id), wait: { n: Note; depth: number }[] = []
    let bottom = F.y + HEAD - GAP
    for (const r of rows) {
      const n = r.n
      if (n.x !== null && n.y !== null && inside(F, n.x + NOTE_W / 2, n.y + NOTE_H / 2)) { at.set(n.id, { x: n.x, y: n.y, w: NOTE_W, h: NOTE_H }); bottom = Math.max(bottom, n.y + NOTE_H) }
      else wait.push(r)
    }
    if (!wait.length) continue
    for (const r of wait) {
      const near = r.n.x === null ? nextTo(r.n, p.id) : null
      const x = near?.x ?? F.x + PAD + Math.min(r.depth, 2) * INDENT, y = near?.y ?? bottom + GAP
      at.set(r.n.id, { x, y, w: NOTE_W, h: NOTE_H }); fresh.push({ id: r.n.id, x, y }); bottom = Math.max(bottom, y + NOTE_H)
    }
    const far = Math.max(...wait.map(r => at.get(r.n.id)!.x + NOTE_W))
    const h = Math.max(F.h, bottom + PAD - F.y), w = Math.max(F.w, NOTE_W + PAD * 2 + 2 * INDENT, far + PAD - F.x)
    if (h !== F.h || w !== F.w) { const G = { ...F, w, h }; at.set(p.id, G); fresh.push({ id: p.id, ...G }) }
  }
  // loose notes: kept unless they sit inside a frame they're not in
  let k = 0
  for (const r of loose()) {
    const n = r.n
    const ok = n.x !== null && n.y !== null && !frames.some(f => inside(at.get(f.id)!, n.x! + NOTE_W / 2, n.y! + NOTE_H / 2))
    if (ok) { at.set(n.id, { x: n.x!, y: n.y!, w: NOTE_W, h: NOTE_H }); continue }
    const near = n.x === null ? nextTo(n, null) : null
    if (near) { at.set(n.id, { ...near, w: NOTE_W, h: NOTE_H }); fresh.push({ id: n.id, ...near }); continue }
    const x = right + Math.floor(k / 7) * (NOTE_W + 70), y = TOP + 20 + (k % 7) * (NOTE_H + GAP + 6); k++
    at.set(n.id, { x, y, w: NOTE_W, h: NOTE_H }); fresh.push({ id: n.id, x, y })
  }
  // a frame always holds all of its notes
  for (const p of piles) {
    let F = at.get(p.id)!
    for (const r of order(p.id)) { const R = at.get(r.n.id); if (R) F = union(F, { x: R.x - PAD, y: R.y - HEAD, w: R.w + PAD * 2, h: R.h + HEAD + PAD }) }
    at.set(p.id, F)
  }
  return { at, fresh }
}

