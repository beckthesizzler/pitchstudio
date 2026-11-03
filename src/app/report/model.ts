/* Match Report: the data. A report is one picture made of blocks placed freely on it: text, a pitch, key stats,
   the story (numbered points) and photos. The creator's seal is always on it.
   Positions are in the report's own pixels (a report is 1600 wide, or 1125 for a story). On a pitch, marks sit in the
   pitch's own units: u across (0 to 1) and v along (0 at the goal being attacked, 1 at the other end, or at halfway on a half pitch),
   so moving, resizing, turning the pitch or switching it to the stadium view takes every mark along. */

export type Pt = [number, number]
export type RFormat = "1:1" | "4:5" | "16:9" | "9:16"
export type RMode = "night" | "bright"
export type Corner = "br" | "bl" | "tr" | "tl"
export const FORMATS: { id: RFormat; name: string }[] = [{ id: "1:1", name: "Square" }, { id: "4:5", name: "Portrait" }, { id: "16:9", name: "Wide" }, { id: "9:16", name: "Story" }]
export const SIZES: Record<RFormat, [number, number]> = { "1:1": [1600, 1600], "4:5": [1600, 2000], "16:9": [1600, 900], "9:16": [1125, 2000] }
export const MAX_BLOCKS = 60, MAX_MARKS = 160, MAX_ROWS = 4, MAX_POINTS = 6

/* ── marks on a pitch. hi: part of the story (drawn in the story colour), otherwise quiet context ── */
export type Player = { id: string; kind: "player"; team: 0 | 1; p: Pt; num: string; name: string; side: "below" | "above" | "left" | "right"; hi: boolean }
export type Pass = { id: string; kind: "pass"; a: Pt; b: Pt; c: Pt | null; run: boolean; weight: 1 | 2 | 3; hi: boolean; head: "end" | "none" | "both"; air: boolean }
export type Pin = { id: string; kind: "pin"; p: Pt; n: string }
export type Zone = { id: string; kind: "zone"; p: Pt; r: Pt; oval: boolean; hi: boolean; label: string }
export type Ball = { id: string; kind: "ball"; p: Pt }
export type Mark = Player | Pass | Pin | Zone | Ball

/** How a kit's second colour is laid over its main colour */
export const KIT_PATTERNS = ["solid", "stripes", "hoops", "halves", "sash", "band", "sleeves"] as const
export type KitPat = (typeof KIT_PATTERNS)[number]
export type Shape = "base" | "in" | "out"
/** A team: its name, its kit and its formation. A colour of null means your story colour for your team, a quiet grey for the opponents.
 *  formation "" means the players were placed by hand. shape: the lineup as written, in possession (pushed up) or out of it (a compact block). */
export type Team = { name: string; color: string | null; pat: KitPat; c2: string; num: string | null; formation: string; shape: Shape }

type Box = { id: string; x: number; y: number }
export type TextStyle = "title" | "text" | "label"
/** plate: a bar of colour behind each line of words ("dark", "story" or any colour; null for none) */
export type TextBlock = Box & { kind: "text"; w: number; rot: number; text: string; style: TextStyle; size: number; align: "left" | "center" | "right"; color: string; plate: string | null }
export type PitchBlock = Box & { kind: "pitch"; w: number; view: "full" | "half"; dir: "up" | "right"; look: "flat" | "stadium"; teams: [Team, Team]; marks: Mark[]; crest: boolean; ms: number; legend: boolean }
export type StatsBlock = Box & { kind: "stats"; w: number; s: number; type: "team" | "player"; player: string; num: string; rows: { value: string; label: string }[] }
export type StoryBlock = Box & { kind: "story"; w: number; s: number; title: string; points: string[] }
/** A photo: the frame (x, y, w, h) shows part of the picture; the picture sits at (ix, iy) inside the frame, iw wide. */
export type PhotoBlock = Box & { kind: "photo"; w: number; h: number; rot: number; src: string; nw: number; nh: number; ix: number; iy: number; iw: number
  shape: "rect" | "round" | "circle"; edge: "hard" | "soft" | "fade"; border: "none" | "white" | "story"; shadow: boolean; flip: boolean }
export type Block = TextBlock | PitchBlock | StatsBlock | StoryBlock | PhotoBlock

/** story: the colour the story is told in (null: the creator's own colour). glow: a soft light of that colour behind everything. */
/** paper: the page colour (null: the mode's own). */
export type Report = { v: 2; format: RFormat; mode: RMode; paper: string | null; story: string | null; glow: boolean; seal: Corner; blocks: Block[] }

export const newId = () => {
  try { return crypto.randomUUID() } catch { return "id" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) }
}

/* ── colours of the two modes ── */
export const MODES = {
  night: { bg: "#0f1114", ink: "#f2f2ee", muted: "#9298a3", lines: "rgba(255,255,255,0.26)", ctx: "rgba(255,255,255,0.34)", ring: "#8c929c", card: "#171a1f", plate: "#262b33" },
  bright: { bg: "#f4f1ea", ink: "#1a1916", muted: "#6e6a62", lines: "#c9c3b6", ctx: "#bdb7a9", ring: "#a29c90", card: "#fbf9f5", plate: "#1a1916" },
}
/** Page colours that suit each mode. Bright ones are warm papers (pure white glares and makes lime look thin); night ones are deep, never pure black. */
export const PAPERS: Record<RMode, [string, string][]> = {
  bright: [["#f4f1ea", "Paper"], ["#fbfaf7", "Chalk"], ["#ece5d6", "Sand"], ["#e7e8e4", "Stone"], ["#e6edf0", "Mist"]],
  night: [["#0f1114", "Ink"], ["#0c1712", "Floodlight"], ["#0d1422", "Navy"], ["#1b1d21", "Graphite"], ["#1d1416", "Claret"]],
}
export type ModeColours = (typeof MODES)["night"]

/* ── the pitch: its size on the picture and the camera that turns pitch units into picture pixels ── */
export const R_DEPTH = 2.2 // stadium view: how much narrower the far end looks
/** The pitch's box on the picture. Flat: the lines. Stadium: w is the near touchline, h the depth to the far goal line. */
export function pitchBox(b: PitchBlock) {
  const len = b.view === "full" ? 105 : 52.5
  if (b.look === "stadium") return { w: b.w, h: b.w * (b.view === "full" ? 0.7 : 0.5) }
  return b.dir === "right" ? { w: b.w, h: b.w * 68 / len } : { w: b.w, h: b.w * len / 68 }
}
/** How big marks are on this pitch: 1 when the pitch is 1000 pixels across, times the creator's marker size */
export function markUnit(b: PitchBlock) {
  const box = pitchBox(b)
  const across = b.look === "stadium" ? b.w * 0.62 : b.dir === "right" ? box.h : box.w
  return (across / 1000) * b.ms
}
export type Projector = { fwd: (u: number, v: number) => [number, number, number]; inv: (x: number, y: number) => Pt }
/** fwd: pitch units to the picture (and the size there, 1 on a flat pitch); inv: the picture back to pitch units */
export function projector(b: PitchBlock): Projector {
  const { w, h } = pitchBox(b)
  if (b.look === "stadium") {
    const sf = 1 / R_DEPTH, cx = b.x + w / 2
    return {
      fwd: (u, v) => { const s = 1 / (R_DEPTH + (1 - R_DEPTH) * v); return [cx + (u - 0.5) * w * s, b.y + h * (s - sf) / (1 - sf), s] },
      inv: (x, y) => { const s = sf + ((y - b.y) / h) * (1 - sf), z = 1 / Math.max(0.05, s); return [0.5 + (x - cx) / (w * Math.max(0.05, s)), (R_DEPTH - z) / (R_DEPTH - 1)] },
    }
  }
  if (b.dir === "right") return { fwd: (u, v) => [b.x + (1 - v) * w, b.y + u * h, 1], inv: (x, y) => [(y - b.y) / h, 1 - (x - b.x) / w] }
  return { fwd: (u, v) => [b.x + u * w, b.y + v * h, 1], inv: (x, y) => [(x - b.x) / w, (y - b.y) / h] }
}

/** The control point that makes a curve pass through c (the handle you drag sits on the curve) */
export const ctrlFor = (a: Pt, b: Pt, c: Pt): Pt => [2 * c[0] - (a[0] + b[0]) / 2, 2 * c[1] - (a[1] + b[1]) / 2]
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

export const DEFAULT_TEAMS = (a = "Your team", b = "Opponents"): [Team, Team] => [
  { name: a, color: null, pat: "solid", c2: "#ffffff", num: null, formation: "", shape: "base" },
  { name: b, color: null, pat: "solid", c2: "#ffffff", num: null, formation: "", shape: "base" },
]

/* ── reading saved data: never trust it ── */
const HEX = /^#[0-9a-fA-F]{6}$/
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const hex = (v: unknown) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : null)
const one = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d)
const pt = (v: unknown, d: Pt): Pt => (Array.isArray(v) && v.length === 2 ? [num(v[0], -1, 2, d[0]), num(v[1], -1, 2, d[1])] : d)
const id = (v: unknown) => str(v, 60) || newId()

function readMark(m: any): Mark | null {
  if (!m || typeof m !== "object") return null
  switch (m.kind) {
    case "player": return { id: id(m.id), kind: "player", team: m.team === 1 ? 1 : 0, p: pt(m.p, [0.5, 0.5]), num: str(m.num, 3), name: str(m.name, 32), side: one(m.side, ["below", "above", "left", "right"] as const, "below"), hi: m.hi !== false }
    case "pass": return { id: id(m.id), kind: "pass", a: pt(m.a, [0.4, 0.6]), b: pt(m.b, [0.6, 0.4]), c: m.c ? pt(m.c, [0.5, 0.5]) : null, run: m.run === true, weight: m.weight === 1 || m.weight === 3 ? m.weight : 2, hi: m.hi !== false, head: one(m.head, ["end", "none", "both"] as const, "end"), air: m.air === true }
    case "pin": return { id: id(m.id), kind: "pin", p: pt(m.p, [0.5, 0.5]), n: str(m.n, 2) || "1" }
    case "zone": { const r = pt(m.r, [0.12, 0.08]); return { id: id(m.id), kind: "zone", p: pt(m.p, [0.5, 0.5]), r: [Math.max(0.01, Math.abs(r[0])), Math.max(0.01, Math.abs(r[1]))], oval: m.oval === true, hi: m.hi !== false, label: str(m.label, 40) } }
    case "ball": return { id: id(m.id), kind: "ball", p: pt(m.p, [0.5, 0.5]) }
  }
  return null
}
const mediaOk = (src: unknown, userId: string) => typeof src === "string" && src.startsWith(userId + "/") && src.length < 300 && !src.includes("..")

function readBlock(b: any, userId: string, W: number, H: number): Block | null {
  if (!b || typeof b !== "object") return null
  const x = num(b.x, -2 * W, 3 * W, 0), y = num(b.y, -2 * H, 3 * H, 0), w = num(b.w, 20, 4 * W, 400)
  switch (b.kind) {
    case "text": return { id: id(b.id), kind: "text", x, y, w, rot: num(b.rot, -180, 180, 0), text: str(b.text, 600), style: one(b.style, ["title", "text", "label"] as const, "text"),
      size: num(b.size, 8, 400, 24), align: one(b.align, ["left", "center", "right"] as const, "left"), color: ["ink", "story", "muted"].includes(b.color) ? b.color : hex(b.color) ?? "ink",
      plate: b.plate === "dark" || b.plate === "story" ? b.plate : hex(b.plate) }
    case "pitch": {
      const team = (t: any, d: string): Team => ({ name: str(t?.name, 30) || d, color: hex(t?.color), pat: one(t?.pat, KIT_PATTERNS, "solid"), c2: hex(t?.c2) ?? "#ffffff", num: hex(t?.num),
        formation: str(t?.formation, 20), shape: one(t?.shape, ["base", "in", "out"] as const, "base") })
      const teams = Array.isArray(b.teams) ? b.teams : []
      return { id: id(b.id), kind: "pitch", x, y, w, view: b.view === "full" ? "full" : "half", dir: b.dir === "right" ? "right" : "up", look: b.look === "stadium" ? "stadium" : "flat",
        teams: [team(teams[0], "Your team"), team(teams[1], "Opponents")], marks: (Array.isArray(b.marks) ? b.marks.slice(0, MAX_MARKS) : []).map(readMark).filter(Boolean) as Mark[],
        crest: b.crest !== false, ms: num(b.ms, 0.5, 2.5, 1), legend: b.legend === true }
    }
    case "stats": return { id: id(b.id), kind: "stats", x, y, w, s: num(b.s, 0.3, 4, 1), type: b.type === "player" ? "player" : "team", player: str(b.player, 32), num: str(b.num, 3),
      rows: (Array.isArray(b.rows) ? b.rows.slice(0, MAX_ROWS) : []).map((r: any) => ({ value: str(r?.value, 12), label: str(r?.label, 30) })) }
    case "story": return { id: id(b.id), kind: "story", x, y, w, s: num(b.s, 0.3, 4, 1), title: str(b.title, 40), points: (Array.isArray(b.points) ? b.points.slice(0, MAX_POINTS) : []).map((p: unknown) => str(p, 200)) }
    case "photo": {
      if (b.src !== "" && !mediaOk(b.src, userId)) return null // "" is an empty photo slot, waiting for a picture
      const nw = num(b.nw, 1, 10000, 1000), nh = num(b.nh, 1, 10000, 1000), ph = num(b.h, 20, 4 * H, 300)
      return { id: id(b.id), kind: "photo", x, y, w, h: ph, rot: num(b.rot, -180, 180, 0), src: b.src, nw, nh, ix: num(b.ix, -40000, 40000, 0), iy: num(b.iy, -40000, 40000, 0), iw: num(b.iw, 10, 40000, w),
        shape: one(b.shape, ["rect", "round", "circle"] as const, "rect"), edge: one(b.edge, ["hard", "soft", "fade"] as const, "hard"), border: one(b.border, ["none", "white", "story"] as const, "none"),
        shadow: b.shadow === true, flip: b.flip === true }
    }
  }
  return null
}
/** Turns a saved report into safe data. Photos must live in this user's own folder. */
export function readReport(raw: unknown, userId: string): Report {
  const r = (raw && typeof raw === "object" ? raw : {}) as any
  const format = one(r.format, ["1:1", "4:5", "16:9", "9:16"] as const, "1:1")
  const [W, H] = SIZES[format]
  return { v: 2, format, mode: r.mode === "bright" ? "bright" : "night", paper: hex(r.paper), story: hex(r.story), glow: r.glow === true, seal: one(r.seal, ["br", "bl", "tr", "tl"] as const, "br"),
    blocks: (Array.isArray(r.blocks) ? r.blocks.slice(0, MAX_BLOCKS) : []).map((b: unknown) => readBlock(b, userId, W, H)).filter(Boolean) as Block[] }
}
/** Every photo a report uses (its storage paths) */
export const mediaOf = (r: Report) => r.blocks.filter((b): b is PhotoBlock => b.kind === "photo" && !!b.src).map(b => b.src)
