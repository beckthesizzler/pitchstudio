import { newId, type KitPat, type Mark, type Pass, type Player, type Pt, type Shape } from "./model"

/* Teams on a pitch: formations, kits, names and squads. The formations, the shapes (in and out of possession) and the way players are matched to
   their new spots are the tactics board's, so a team set up here behaves the way it does there. Squads are shared with the board (same place in this browser).
   A formation is written as the board writes it: a 1050 by 680 pitch, the team attacking to the right (x along, y across, 10 units to the metre). */

export const PW = 1050, PH = 680
export type FPos = { x: number; y: number; pos: string; num: number }
export type Formation = { name: string; note: string; pos: FPos[] }
const f = (name: string, note: string, list: [number, number, string, number][]): Formation => ({ name, note, pos: list.map(([x, y, pos, num]) => ({ x, y, pos, num })) })
export const FORMATIONS: Formation[] = [
  f("4-3-3", "Attacking with wide forwards", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [440, 195, "CM", 6], [460, 340, "CM", 8], [440, 485, "CM", 7], [730, 118, "LW", 11], [790, 340, "ST", 9], [730, 562, "RW", 10]]),
  f("4-4-2", "Classic flat four", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [470, 100, "LM", 11], [450, 260, "CM", 8], [450, 420, "CM", 6], [470, 580, "RM", 7], [780, 240, "ST", 9], [780, 440, "ST", 10]]),
  f("4-2-3-1", "Double pivot with AM", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [400, 255, "DM", 6], [400, 425, "DM", 8], [590, 140, "LW", 11], [620, 340, "AM", 10], [590, 540, "RW", 7], [810, 340, "ST", 9]]),
  f("4-1-4-1", "Single pivot with wide mids", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [390, 340, "DM", 6], [540, 120, "LM", 11], [520, 267, "CM", 8], [520, 413, "CM", 7], [540, 560, "RM", 10], [820, 340, "ST", 9]]),
  f("3-5-2", "Three at back with wingbacks", [[100, 340, "GK", 1], [250, 180, "CB", 5], [260, 340, "CB", 4], [250, 500, "CB", 3], [390, 78, "LWB", 11], [420, 228, "CM", 8], [440, 340, "CM", 6], [420, 452, "CM", 7], [390, 602, "RWB", 2], [760, 250, "ST", 9], [760, 430, "ST", 10]]),
  f("3-4-3", "Three defenders, high wide", [[100, 340, "GK", 1], [250, 185, "CB", 5], [260, 340, "CB", 4], [250, 495, "CB", 3], [450, 120, "LM", 11], [430, 268, "CM", 8], [430, 412, "CM", 7], [450, 560, "RM", 2], [710, 140, "LW", 10], [770, 340, "ST", 9], [710, 540, "RW", 6]]),
  f("5-3-2", "Five defenders, compact", [[100, 340, "GK", 1], [250, 78, "LWB", 3], [260, 210, "CB", 5], [260, 340, "CB", 4], [260, 470, "CB", 6], [250, 602, "RWB", 2], [450, 210, "CM", 8], [470, 340, "CM", 10], [450, 470, "CM", 7], [750, 248, "ST", 9], [750, 432, "ST", 11]]),
  f("5-4-1", "Defensive five with bank of four", [[100, 340, "GK", 1], [250, 78, "LWB", 3], [260, 210, "CB", 5], [260, 340, "CB", 4], [260, 470, "CB", 6], [250, 602, "RWB", 2], [460, 145, "LM", 11], [445, 278, "CM", 8], [445, 402, "CM", 7], [460, 535, "RM", 10], [790, 340, "ST", 9]]),
  f("4-3-2-1", "Christmas Tree", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 255, "CB", 5], [260, 425, "CB", 4], [250, 570, "RB", 2], [400, 200, "CM", 6], [420, 340, "CM", 8], [400, 480, "CM", 7], [600, 235, "SS", 11], [600, 445, "SS", 10], [790, 340, "ST", 9]]),
  f("4-4-1-1", "Shadow striker behind lone forward", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 255, "CB", 5], [260, 425, "CB", 4], [250, 570, "RB", 2], [465, 128, "LM", 11], [445, 262, "CM", 8], [445, 418, "CM", 7], [465, 552, "RM", 10], [630, 340, "SS", 6], [800, 340, "ST", 9]]),
  f("4-2-4", "Ultra attacking with four forwards", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 255, "CB", 5], [260, 425, "CB", 4], [250, 570, "RB", 2], [450, 260, "CM", 6], [450, 420, "CM", 8], [740, 110, "LW", 11], [780, 260, "ST", 9], [780, 420, "ST", 10], [740, 570, "RW", 7]]),
  f("3-4-2-1", "Two attacking mids behind lone striker", [[100, 340, "GK", 1], [250, 185, "CB", 5], [260, 340, "CB", 4], [250, 495, "CB", 3], [450, 120, "LM", 11], [430, 268, "CM", 8], [430, 412, "CM", 6], [450, 560, "RM", 2], [650, 240, "AM", 10], [650, 440, "AM", 7], [800, 340, "ST", 9]]),
  f("4-5-1", "Flat five midfield with lone striker", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [480, 80, "LM", 11], [460, 220, "CM", 8], [470, 340, "CM", 6], [460, 460, "CM", 7], [480, 600, "RM", 10], [810, 340, "ST", 9]]),
  f("3-2-4-1", "Three defenders with double pivot and four forwards", [[100, 340, "GK", 1], [255, 185, "CB", 5], [260, 340, "CB", 4], [255, 495, "CB", 3], [400, 255, "DM", 6], [400, 425, "DM", 8], [620, 120, "LW", 11], [640, 265, "AM", 10], [640, 415, "AM", 7], [620, 560, "RW", 2], [810, 340, "ST", 9]]),
  f("4-1-2-1-2", "Midfield diamond with two strikers", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [390, 340, "DM", 6], [540, 215, "CM", 8], [540, 465, "CM", 7], [660, 340, "AM", 10], [790, 230, "ST", 9], [790, 450, "ST", 11]]),
  f("5-2-3", "Five defenders with narrow midfield", [[100, 340, "GK", 1], [250, 78, "LWB", 3], [260, 210, "CB", 5], [260, 340, "CB", 4], [260, 470, "CB", 6], [250, 602, "RWB", 2], [470, 260, "CM", 8], [470, 420, "CM", 7], [720, 140, "LW", 11], [780, 340, "ST", 9], [720, 540, "RW", 10]]),
  f("4-3-1-2", "Three midfielders behind an attacking mid and two strikers", [[100, 340, "GK", 1], [250, 110, "LB", 3], [260, 247, "CB", 5], [260, 433, "CB", 4], [250, 570, "RB", 2], [420, 190, "CM", 6], [440, 340, "CM", 8], [420, 490, "CM", 7], [620, 340, "AM", 10], [790, 230, "ST", 9], [790, 450, "ST", 11]]),
  f("3-1-4-2", "Three at back with a holding mid and four across", [[100, 340, "GK", 1], [255, 185, "CB", 5], [260, 340, "CB", 4], [255, 495, "CB", 3], [390, 340, "DM", 6], [560, 110, "LM", 11], [545, 268, "CM", 8], [545, 412, "CM", 7], [560, 570, "RM", 2], [790, 250, "ST", 9], [790, 430, "ST", 10]]),
]
const BY_NAME = new Map(FORMATIONS.map(x => [x.name, x]))
export const formationOf = (name: string) => BY_NAME.get(name)
/** The formations shown first; the rest are under "All" */
export const TOP_FORMATIONS = ["4-3-3", "4-4-2", "4-2-3-1", "3-5-2", "4-1-4-1", "5-3-2"]
const POS_CODES = new Set(FORMATIONS.flatMap(x => x.pos.map(p => p.pos)))

/* ── kits ── */
export type Kit = { id: string; name: string; pat: KitPat; c1: string; c2: string; num: string }
const kit = (id: string, name: string, pat: KitPat, c1: string, c2: string, num: string): Kit => ({ id, name, pat, c1, c2, num })
/** Named by colour only: no club names, no crests */
export const KITS: Kit[] = [
  kit("white", "White", "solid", "#ffffff", "#ffffff", "#000000"), kit("red", "Red", "solid", "#da291c", "#da291c", "#ffffff"),
  kit("sky", "Sky blue", "solid", "#6cabdd", "#6cabdd", "#0b1f4b"), kit("royal", "Royal blue", "solid", "#1d4ed8", "#1d4ed8", "#ffffff"),
  kit("navy", "Navy", "solid", "#0b1f4b", "#0b1f4b", "#ffffff"), kit("yellow", "Yellow", "solid", "#edbb00", "#edbb00", "#000000"),
  kit("amber", "Amber", "solid", "#fbbf24", "#fbbf24", "#000000"), kit("green", "Green", "solid", "#15803d", "#15803d", "#ffffff"),
  kit("black", "Black", "solid", "#111111", "#111111", "#ffffff"), kit("orange", "Orange", "solid", "#f97316", "#f97316", "#000000"),
  kit("claret", "Claret", "solid", "#7a263a", "#7a263a", "#ffffff"),
  kit("blue-garnet-stripes", "Blue & garnet stripes", "stripes", "#1d4ed8", "#a50044", "#ffffff"), kit("red-white-stripes", "Red & white stripes", "stripes", "#da291c", "#ffffff", "#ffffff"),
  kit("black-white-stripes", "Black & white stripes", "stripes", "#111111", "#ffffff", "#ffffff"), kit("red-black-stripes", "Red & black stripes", "stripes", "#da291c", "#111111", "#ffffff"),
  kit("green-white-hoops", "Green & white hoops", "hoops", "#15803d", "#ffffff", "#ffffff"), kit("blue-white-hoops", "Blue & white hoops", "hoops", "#1d4ed8", "#ffffff", "#ffffff"),
  kit("blue-white-halves", "Blue & white halves", "halves", "#1d4ed8", "#ffffff", "#ffffff"), kit("red-yellow-halves", "Red & yellow halves", "halves", "#da291c", "#edbb00", "#ffffff"),
  kit("white-red-sash", "White with red sash", "sash", "#ffffff", "#da291c", "#000000"), kit("navy-yellow-band", "Navy with yellow band", "band", "#0b1f4b", "#edbb00", "#ffffff"),
  kit("red-white-sleeves", "Red with white sleeves", "sleeves", "#da291c", "#ffffff", "#ffffff"), kit("white-black-sleeves", "White with black sleeves", "sleeves", "#ffffff", "#111111", "#000000"),
]
export const TOP_KITS = ["white", "red", "sky", "royal", "navy", "black-white-stripes"]
export const PATTERN_LABELS: Record<KitPat, string> = { solid: "Solid", stripes: "Stripes", hoops: "Hoops", halves: "Halves", sash: "Sash", band: "Band", sleeves: "Sleeves" }

/* ── where a formation's players stand: as written, in possession or out of it ── */
const IN_X: Record<string, number> = { GK: 140, CB: 330, LB: 560, RB: 560, LWB: 760, RWB: 760, DM: 470, CM: 640, LM: 720, RM: 720, LW: 830, RW: 830, AM: 740, SS: 800, ST: 900 }
const OUT_X: Record<string, number> = { g: 95, d: 230, dm: 320, m: 390, a: 480, s: 560 }
const ONSIDE_X = PW - OUT_X.d - 12 // in possession the front players stay just onside
export function shapePositions(fm: Formation, shape: Shape): FPos[] {
  if (shape === "base") return fm.pos
  const has = (...c: string[]) => fm.pos.some(p => c.includes(p.pos))
  const wide = has("LB", "RB", "LWB", "RWB"), dm = has("DM")
  const top = (p: FPos) => p.y < 340
  if (shape === "out") {
    // a compact block: everyone drops into a line, spread evenly across it
    const line = (p: FPos) => p.pos === "GK" ? "g" : ["CB", "LB", "RB", "LWB", "RWB"].includes(p.pos) || (!wide && (p.pos === "LM" || p.pos === "RM")) ? "d"
      : p.pos === "DM" ? "dm" : p.pos === "AM" || p.pos === "SS" ? "a" : p.pos === "ST" ? "s" : "m"
    const out = fm.pos.map(p => ({ ...p }))
    for (const k of Object.keys(OUT_X)) {
      const row = out.filter(p => line(p) === k).sort((a, b) => a.y - b.y), n = row.length
      const flank = row.some(p => /^[LR]/.test(p.pos))
      const span = n < 2 ? 0 : n === 2 ? (flank ? 400 : 180) : n === 3 ? (flank ? 420 : 260) : n === 4 ? 420 : 500
      row.forEach((p, i) => { p.x = OUT_X[k]; p.y = n < 2 ? 340 : 340 - span / 2 + (i * span) / (n - 1) })
    }
    return out
  }
  // in possession: full-backs high and wide, wingers inside, centre-backs split, the team pushed up
  const avg = (c: string) => { const xs = fm.pos.filter(p => p.pos === c).map(p => p.x); return xs.reduce((a, b) => a + b, 0) / xs.length }
  const cms = fm.pos.filter(p => p.pos === "CM")
  const six = !dm && cms.length === 3 ? cms.reduce((a, b) => (Math.abs(b.y - 340) < Math.abs(a.y - 340) ? b : a)) : null
  return fm.pos.map(p => {
    if (p.pos === "GK") return { ...p, x: IN_X.GK, y: 340 }
    let x = IN_X[p.pos] + (p.x - avg(p.pos)) * 0.5, y = p.y
    if (p.pos === "CB") y = 340 + (y - 340) * 1.35
    if (p.pos === "CM" && !dm) x = p === six ? 470 : cms.length === 3 ? 640 : 540
    if (p.pos === "LB" || p.pos === "RB") y = top(p) ? 65 : 615
    if (p.pos === "LWB" || p.pos === "RWB") y = top(p) ? 45 : 635
    if (p.pos === "LM" || p.pos === "RM") y = wide ? (top(p) ? 200 : 480) : (top(p) ? 50 : 630)
    if (p.pos === "LW" || p.pos === "RW") y = top(p) ? 195 : 485
    return { ...p, x: Math.min(ONSIDE_X, x), y: Math.max(40, Math.min(640, y)) }
  })
}

/* ── pairing players with spots (the Hungarian method: the lowest total distance, nobody sharing) ── */
function assign(cost: number[][]): number[] {
  const n = cost.length, m = n ? cost[0].length : 0
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(m + 1).fill(Infinity), used = new Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity, j1 = 0
      for (let j = 1; j <= m; j++) if (!used[j]) {
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0 }
        if (minv[j] < delta) { delta = minv[j]; j1 = j }
      }
      for (let j = 0; j <= m; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta } else minv[j] -= delta }
      j0 = j1
    } while (p[j0] !== 0)
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1 } while (j0)
  }
  const res = new Array(n).fill(-1)
  for (let j = 1; j <= m; j++) if (p[j]) res[p[j] - 1] = j - 1
  return res
}
/** For each point in a, the point in b it is paired with (closest overall, no two sharing), or -1 when b runs out */
function matchPoints(a: Pt[], b: Pt[]): number[] {
  if (!a.length || !b.length) return a.map(() => -1)
  const d = (p: Pt, q: Pt) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
  if (a.length <= b.length) return assign(a.map(p => b.map(q => d(p, q))))
  const res = a.map(() => -1)
  assign(b.map(q => a.map(p => d(p, q)))).forEach((i, j) => { res[i] = j })
  return res
}
/** One formation's spots paired with another's: as close as possible, keeping defenders in defence and each side on its side (a left-back becomes a left wing-back) */
function matchSlots(from: FPos[], to: FPos[]): number[] {
  const role = (pos: string) => [pos === "GK" ? 0 : /B$/.test(pos) ? 1 : /^(DM|CM|LM|RM)$/.test(pos) ? 2 : 3, pos[0] === "L" ? 0 : pos[0] === "R" ? 2 : 1]
  return assign(from.map(p => to.map(q => {
    const [g1, s1] = role(p.pos), [g2, s2] = role(q.pos)
    return (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + 30000 * (Math.abs(g1 - g2) + Math.abs(s1 - s2))
  })))
}
/** Team-sheet order: the goalkeeper, then each line from the back, right to left */
function sheetOrder(pts: { x: number; y: number }[]): number[] {
  const lines: number[][] = []
  for (const i of pts.map((_, i) => i).sort((i, j) => pts[i].x - pts[j].x)) {
    const last = lines[lines.length - 1]
    if (last && pts[i].x - pts[last[last.length - 1]].x < 80) last.push(i); else lines.push([i])
  }
  return lines.flatMap(l => l.sort((i, j) => pts[j].y - pts[i].y))
}

/* ── a team on a pitch (in pitch units: u across 0 to 1, v along 0 to 1) ── */
type View = "full" | "half"
const lenOf = (view: View) => (view === "full" ? 105 : 52.5)
const metres = (q: Pt, view: View): Pt => [q[0] * 68, q[1] * lenOf(view)]
export type Slot = { j: number; p: Pt; pos: string; num: string }
/** Where a formation's players stand on this pitch. Your team attacks the top goal, the opponents defend it. On a half pitch your goalkeeper is out of sight. */
export function slotsFor(fm: Formation, team: 0 | 1, shape: Shape, view: View): Slot[] {
  const out: Slot[] = []
  shapePositions(fm, shape).forEach((s, j) => {
    const v0 = 1 - s.x / PW, u0 = s.y / PH
    let u = u0, v = v0
    if (team === 1) { u = 1 - u0; v = 1 - v0 }
    if (view === "half") {
      if (team === 0) { if (s.pos === "GK") return; v = 0.12 + (v0 - 0.2) * 1.2 }
      else v = s.pos === "GK" ? 0.045 : 0.04 + (1 - v0) * 1.2
      v = Math.max(0.03, Math.min(0.97, v))
    }
    out.push({ j, p: [Math.round(u * 1000) / 1000, Math.round(v * 1000) / 1000], pos: s.pos, num: String(s.num) })
  })
  return out
}
const playersOf = (marks: Mark[], team: 0 | 1) => marks.filter((m): m is Player => m.kind === "player" && m.team === team)
const near = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.004

/** Eases players that stand too close apart, across the pitch. Those in cells move; fixed ones stay. */
function easeApart(cells: { p: Pt }[], fixed: Pt[], view: View) {
  const need = 5.5, L = lenOf(view), clamp = (u: number) => Math.max(0.03, Math.min(0.97, u))
  for (let round = 0; round < 12; round++) {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length + fixed.length; j++) {
        const a = cells[i], other = j < cells.length ? cells[j] : null, q = other ? other.p : fixed[j - cells.length]
        const along = (a.p[1] - q[1]) * L, across = (a.p[0] - q[0]) * 68
        if (Math.hypot(along, across) >= need) continue
        const room = Math.sqrt(need * need - along * along), side = across === 0 ? -1 : Math.sign(across)
        if (other) { const mid = ((a.p[0] + q[0]) / 2) * 68; a.p = [clamp((mid + (side * room) / 2) / 68), a.p[1]]; other.p = [clamp((mid - (side * room) / 2) / 68), other.p[1]] }
        else a.p = [clamp((q[0] * 68 + side * room) / 68), a.p[1]]
      }
    }
  }
}
/** Puts a team into a formation. The players already there move to the spot that suits them (the left-back stays the left-back) and keep their names
 *  and numbers; missing players are added; passes that start or end on a player go with them. */
export function placeFormation(marks: Mark[], team: 0 | 1, name: string, shape: Shape, view: View, prev: { name: string; shape: Shape } | null): Mark[] {
  const fm = formationOf(name)
  if (!fm) return marks
  const slots = slotsFor(fm, team, shape, view), mine = playersOf(marks, team)
  const at = mine.map(m => metres(m.p, view))
  const prevF = prev ? formationOf(prev.name) : undefined
  let slotOf: number[]
  if (prevF && prev) {
    const prevSlots = slotsFor(prevF, team, prev.shape, view), jmap = matchSlots(prevF.pos, fm.pos), idx = new Map(slots.map((s, i) => [s.j, i]))
    slotOf = matchPoints(at, prevSlots.map(s => metres(s.p, view))).map(i => (i < 0 ? -1 : idx.get(jmap[prevSlots[i].j]) ?? -1))
    // a player left without a spot (the spot was a hidden goalkeeper's, say) takes the nearest spot nobody else has
    const lost = slotOf.map((x, k) => (x < 0 ? k : -1)).filter(k => k >= 0), open = slots.map((_, i) => i).filter(i => !slotOf.includes(i))
    if (lost.length && open.length) matchPoints(lost.map(k => at[k]), open.map(i => metres(slots[i].p, view))).forEach((x, n) => { if (x >= 0) slotOf[lost[n]] = open[x] })
  } else slotOf = matchPoints(at, slots.map(s => metres(s.p, view)))
  const used = new Set(mine.map(m => m.num))
  const free = (n: string) => { let k = parseInt(n, 10) || 1; while (used.has(String(k))) k++; used.add(String(k)); return String(k) }
  const taken = new Set(slotOf.filter(i => i >= 0))
  // where everyone on the team ends up: the players already there (by id) and the ones to add (no id)
  const cells: { id: string | null; p: Pt; num: string }[] = []
  // a player without a shirt number takes the number that goes with his new spot
  const nums = new Map<string, string>()
  mine.forEach((m, k) => { if (slotOf[k] >= 0) { if (!m.num.trim()) nums.set(m.id, free(slots[slotOf[k]].num)); cells.push({ id: m.id, p: slots[slotOf[k]].p, num: m.num }) } })
  slots.forEach((s, i) => { if (!taken.has(i)) cells.push({ id: null, p: s.p, num: s.num }) })
  // players that land on top of each other (a team pushed up, or two lineups meeting) are eased apart across the pitch; nobody's depth changes
  easeApart(cells, [...playersOf(marks, team === 0 ? 1 : 0), ...mine.filter((_, k) => slotOf[k] < 0)].map(m => m.p), view)
  const to = new Map<string, Pt>(), from = new Map<string, Pt>()
  for (const c of cells) if (c.id) { to.set(c.id, c.p); from.set(c.id, mine.find(m => m.id === c.id)!.p) }
  const added: Player[] = cells.filter(c => !c.id).map(c => ({ id: newId(), kind: "player" as const, team, p: c.p, num: free(c.num), name: "", side: "below" as const, hi: team === 0 }))
  const next = marks.map((m): Mark => {
    if (m.kind === "player") return to.has(m.id) ? { ...m, p: to.get(m.id)!, side: "below", num: nums.get(m.id) ?? m.num } : m // names go back under the players: the old sides were set for the old spots
    if (m.kind !== "pass") return m
    let a = m.a, b = m.b, da: Pt = [0, 0], db: Pt = [0, 0]
    for (const [id, p0] of from) {
      const p1 = to.get(id)!
      if (near(m.a, p0)) { a = p1; da = [p1[0] - p0[0], p1[1] - p0[1]] }
      if (near(m.b, p0)) { b = p1; db = [p1[0] - p0[0], p1[1] - p0[1]] }
    }
    // a run or pass into space (one end on nobody) travels with the player at its other end, so it keeps its length and direction
    const free = (q: Pt) => !marks.some(x => x.kind === "player" && near(q, x.p)), fit = (q: Pt, d: Pt): Pt => [Math.min(1, Math.max(0, q[0] + d[0])), Math.min(1, Math.max(0, q[1] + d[1]))]
    if (a !== m.a && free(m.b)) { b = fit(m.b, da); db = da }
    else if (b !== m.b && free(m.a)) { a = fit(m.a, db); da = db }
    return { ...m, a, b, c: m.c ? [m.c[0] + (da[0] + db[0]) / 2, m.c[1] + (da[1] + db[1]) / 2] : null } as Pass
  })
  return [...next, ...added]
}

/** A team in team-sheet order, each with the position code of the spot it stands on. On a half pitch your goalkeeper is off the pitch: his line is there (m is null)
 *  so a full eleven, goalkeeper first, names the right people. */
export type Seat = { m: Player | null; pos: string; num: string }
export function lineupOf(marks: Mark[], team: 0 | 1, formation: string, shape: Shape, view: View): Seat[] {
  const mine = playersOf(marks, team), fm = formationOf(formation)
  if (!fm) {
    const pts = mine.map(m => ({ x: (team === 0 ? 1 - m.p[1] : m.p[1]) * lenOf(view) * 10, y: (team === 0 ? m.p[0] : 1 - m.p[0]) * PH }))
    return sheetOrder(pts).map(i => ({ m: mine[i], pos: "", num: mine[i].num }))
  }
  const slots = slotsFor(fm, team, shape, view), spot = matchPoints(mine.map(m => metres(m.p, view)), slots.map(s => metres(s.p, view)))
  const rank = new Map(sheetOrder(fm.pos).map((j, k) => [j, k]))
  const seats = mine.map((m, i) => ({ m: m as Player | null, pos: spot[i] < 0 ? "" : fm.pos[slots[spot[i]].j].pos, num: m.num, k: spot[i] < 0 ? 100 + i : rank.get(slots[spot[i]].j)! }))
  const gk = fm.pos.findIndex(x => x.pos === "GK")
  if (gk >= 0 && !slots.some(x => x.j === gk)) seats.push({ m: null, pos: "GK", num: String(fm.pos[gk].num), k: rank.get(gk)! })
  return seats.sort((a, b) => a.k - b.k).map(({ m, pos, num }) => ({ m, pos, num }))
}
/** The text for the names box: a number and a name (or the position, until it is named) on each line, goalkeeper first */
export const lineupText = (marks: Mark[], team: 0 | 1, formation: string, shape: Shape, view: View) =>
  lineupOf(marks, team, formation, shape, view).map(({ m, pos, num }) => `${num} ${m?.name || pos}`.trim()).join(String.fromCharCode(10))
/** Names a team from a pasted list, in team-sheet order */
export function applyLineup(marks: Mark[], team: 0 | 1, entries: { name: string; num?: string }[], formation: string, shape: Shape, view: View): Mark[] {
  const named = new Map<string, { name: string; num?: string }>()
  lineupOf(marks, team, formation, shape, view).slice(0, entries.length).forEach((o, i) => { if (o.m) named.set(o.m.id, entries[i]) })
  return marks.map(m => { const e = named.get(m.id); return e && m.kind === "player" ? { ...m, name: POS_CODES.has(e.name) ? "" : e.name.slice(0, 32), ...(e.num ? { num: e.num.slice(0, 3) } : {}) } : m })
}
/** Reads a pasted lineup: one name per line, or separated by commas; a shirt number before or after a name is kept */
export function parseLineup(text: string): { name: string; num?: string }[] {
  const NL = String.fromCharCode(10), gaps = new RegExp("[" + String.fromCharCode(9, 13, 160) + "]", "g")
  return text.replace(/[,;]/g, NL).split(NL).map(t => t.replace(gaps, " ").replace(/^ *[-•*·] */, "").trim()).filter(Boolean).map(t => {
    const a = /^#?([0-9]{1,2})[.): -]+(.+)$/.exec(t)
    if (a) return { name: a[2].trim(), num: a[1] }
    const b = /^(.+?)[ (#-]+([0-9]{1,2})[)]?$/.exec(t)
    if (b) return { name: b[1].trim(), num: b[2] }
    return { name: t }
  }).filter(e => e.name).map(e => ({ ...e, name: e.name.slice(0, 30) })).slice(0, 30)
}

/* ── squads: a team's name, kit and players, kept in this browser, the same list the tactics board uses ── */
export type Squad = { id: string; name: string; teamName: string; kit: { pat: KitPat; c1: string; c2: string; num: string }; players: { name: string; num: string }[] }
const SQUADS_KEY = "ps-squads"
export const readSquads = (): Squad[] => {
  try {
    const v = JSON.parse(localStorage.getItem(SQUADS_KEY) || "[]")
    return Array.isArray(v) ? v.filter((q: Squad) => q && typeof q.id === "string" && typeof q.name === "string" && Array.isArray(q.players) && q.kit && (["solid", "stripes", "hoops", "halves", "sash", "band", "sleeves"] as string[]).includes(q.kit.pat)) : []
  } catch { return [] }
}
export const writeSquads = (list: Squad[]) => { try { localStorage.setItem(SQUADS_KEY, JSON.stringify(list)) } catch { /* private window: squads just aren't kept */ } }
