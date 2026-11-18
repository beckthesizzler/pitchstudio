import { DEFAULT_TEAMS, newId, type Mark, type PitchBlock, type Pt } from "./model"

/* A Tactics Board, as a pitch in a report: its players, passes, runs, zones and the ball, in the same places.
   The board keeps its pitch 1050 × 680 (home goal on the left), drawn on a 1400 × 900 canvas; a report's pitch
   counts 0–1 across (u) and 0–1 from the goal you attack (v). The board's own files aren't touched. */

const CW = 1400, CH = 900, PW = 1050, PH = 680, VERT = 0.78
type Settings = { vertical?: boolean; pitchScale?: number; pitchOffX?: number; pitchOffY?: number } | null | undefined
export type BoardRow = { id: string; title: string | null; updated_at: string; players?: unknown; arrows?: unknown; zones?: unknown; settings?: Settings }

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d)
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/** board canvas → pitch (the board's toPitch) → report (u across, v from the attacked goal) */
function mapper(s: Settings) {
  const v = s?.vertical === true, sc = num(s?.pitchScale, 1) || 1, ox0 = num(s?.pitchOffX), oy0 = num(s?.pitchOffY)
  const g = v ? { ox: (CW - PH * VERT) / 2 + ox0, oy: (CH - PW * VERT) / 2 + oy0, sc: sc * VERT } : { ox: (CW - PW) / 2 + ox0, oy: (CH - PH) / 2 + oy0, sc }
  const toPitch = (x: number, y: number) => (v ? { x: PW - (y - g.oy) / g.sc, y: (x - g.ox) / g.sc } : { x: (x - g.ox) / g.sc, y: (y - g.oy) / g.sc })
  const at = (x: number, y: number): Pt => { const p = toPitch(x, y); return [+(p.y / PH).toFixed(4), +(1 - p.x / PW).toFixed(4)] }
  return { at, vertical: v }
}
const on = (p: Pt) => p[0] > -0.04 && p[0] < 1.04 && p[1] > -0.04 && p[1] < 1.04 // the bench and notes beside the pitch stay behind

export function boardCounts(r: BoardRow) {
  const ps = list(r.players)
  return { players: ps.filter(p => !p?.kind).length, lines: list(r.arrows).length, zones: list(r.zones).length }
}

/** The board as report marks plus the teams' colours. Two kit colours: the commoner one is your team. */
export function boardMarks(r: BoardRow): { marks: Mark[]; teams: PitchBlock["teams"]; vertical: boolean } {
  const m = mapper(r.settings), out: Mark[] = []
  const players = list(r.players).filter(p => p && typeof p.x === "number" && typeof p.y === "number")
  const kits = new Map<string, number>()
  for (const p of players) if (!p.kind) kits.set(String(p.bg), (kits.get(String(p.bg)) ?? 0) + 1)
  const order = [...kits].sort((a, b) => b[1] - a[1]).map(e => e[0])
  const teams = DEFAULT_TEAMS()
  if (order[0]) teams[0] = { ...teams[0], color: order[0] }
  if (order[1]) teams[1] = { ...teams[1], color: order[1] }
  const where = new Map<string, Pt>()
  for (const p of players) {
    const q = m.at(p.x, p.y); where.set(String(p.id), q)
    if (!on(q)) continue
    if (p.kind === "ball") out.push({ id: newId(), kind: "ball", p: q })
    else if (!p.kind) out.push({ id: newId(), kind: "player", team: order.indexOf(String(p.bg)) === 0 || order.length < 2 ? 0 : 1, p: q, num: String(p.num ?? "").slice(0, 3), name: String(p.name ?? "").slice(0, 32), side: "below", hi: true }) // filled discs in their kit colours, as on the board
  }
  for (const a of list(r.arrows)) {
    if (!a || typeof a.x1 !== "number") continue
    const A = (a.fromId && where.get(String(a.fromId))) || m.at(a.x1, a.y1), B = (a.toId && where.get(String(a.toId))) || m.at(a.x2, a.y2)
    if (!on(A) || !on(B)) continue
    // the board keeps a curve's control point; a report keeps the point the curve passes through
    const cp = m.at(num(a.cpx, (a.x1 + a.x2) / 2), num(a.cpy, (a.y1 + a.y2) / 2))
    const thru: Pt = [(A[0] + 2 * cp[0] + B[0]) / 4, (A[1] + 2 * cp[1] + B[1]) / 4], straight: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
    const bent = Math.hypot(thru[0] - straight[0], thru[1] - straight[1]) > 0.01
    out.push({ id: newId(), kind: "pass", a: A, b: B, c: bent ? thru : null, run: a.kind === "run" || a.kind === "dribble" || a.dash === "dashed", weight: 2, hi: true, head: a.kind === "line" ? "none" : a.twoWay ? "both" : "end", air: false })
  }
  for (const z of list(r.zones)) {
    if (!z || typeof z.x !== "number") continue
    out.push({ id: newId(), kind: "zone", p: [(z.y + z.h / 2) / PH, 1 - (z.x + z.w / 2) / PW], r: [Math.abs(z.h) / 2 / PH, Math.abs(z.w) / 2 / PW], oval: false, hi: true, label: String(z.label ?? "").slice(0, 40) })
  }
  return { marks: out.slice(0, 160), teams, vertical: m.vertical }
}

/** A pitch block of the board, centred on a point of the page */
export function boardPitch(r: BoardRow, at: Pt, pageW: number): PitchBlock {
  const { marks, teams, vertical } = boardMarks(r)
  const dir = vertical ? "up" : "right", w = Math.min(pageW - 160, vertical ? 620 : 1000)
  const h = dir === "right" ? w * 68 / 105 : w * 105 / 68
  return { id: newId(), kind: "pitch", x: Math.round(Math.max(0, at[0] - w / 2)), y: Math.round(Math.max(0, at[1] - h / 2)), w, view: "full", dir, look: "flat", teams, marks, crest: false, ms: 1.1, legend: false }
}
