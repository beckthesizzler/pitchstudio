/* Match Report: the data. A report is one picture made of blocks placed freely on it: text, a pitch, key stats,
   the story (numbered points) and photos. The creator's seal is always on it.
   Positions are in the report's own pixels (a report is 1600 wide, or 1125 for a story). On a pitch, marks sit in the
   pitch's own units: u across (0 to 1) and v along (0 at the goal being attacked, 1 at the other end, or at halfway on a half pitch),
   so moving, resizing, turning the pitch or switching it to the stadium view takes every mark along. */

export type Pt = [number, number]
export type RFormat = "1:1" | "4:5" | "16:9" | "9:16"
export type RMode = "night" | "bright"
export type Corner = "br" | "bl" | "tr" | "tl"
export const FORMATS: { id: RFormat; name: string }[] = [{ id: "4:5", name: "X post" }, { id: "1:1", name: "Square" }, { id: "16:9", name: "Thread" }, { id: "9:16", name: "Story" }]
export const SIZES: Record<RFormat, [number, number]> = { "1:1": [1600, 1600], "4:5": [1600, 2000], "16:9": [1600, 900], "9:16": [1125, 2000] }
export const MAX_BLOCKS = 60, MAX_MARKS = 160, MAX_ROWS = 4, MAX_POINTS = 6

/* ── marks on a pitch. hi: part of the story (drawn in the story colour), otherwise quiet context ── */
/** role: one of the report's roles (its colour), null for the team colour. tag: a small pill under the name. ring: the Point of Difference. */
export type Player = { id: string; kind: "player"; team: 0 | 1; p: Pt; num: string; name: string; side: "below" | "above" | "left" | "right"; hi: boolean; role?: string | null; tag?: string; ring?: boolean }
/** team: whose action it is (drawn in that side's action colour when the report sets them), null for the story colours */
export type Pass = { id: string; kind: "pass"; a: Pt; b: Pt; c: Pt | null; run: boolean; weight: 1 | 2 | 3; hi: boolean; head: "end" | "none" | "both"; air: boolean; team?: 0 | 1 | null }
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

/** slot: the part of a template a fill form writes into ("headline", "pitch"…); locked: changed by hand in Design, so the form leaves it alone */
type Box = { id: string; x: number; y: number; slot?: string; locked?: boolean }
export type TextStyle = "title" | "text" | "label"
/** plate: a bar of colour behind each line of words ("dark", "story" or any colour; null for none) */
/** fit: one line, shrunk until it fits the width. under: a rule under the last line. font: "hand" writes it in Kalam. */
export type TextBlock = Box & { kind: "text"; w: number; rot: number; text: string; style: TextStyle; size: number; align: "left" | "center" | "right"; color: string; plate: string | null
  fit?: boolean; under?: "none" | "thin" | "thick"; font?: "sans" | "hand" }
export type PitchBlock = Box & { kind: "pitch"; w: number; view: "full" | "half"; dir: "up" | "right"; look: "flat" | "stadium" | "grass"; teams: [Team, Team]; marks: Mark[]; crest: boolean; ms: number; legend: boolean
  half?: { k: number; dir: "up" | "right" } } // opened to the full field: how to go back to the half pitch it was (k: its width over the full field's)
export type StatsBlock = Box & { kind: "stats"; w: number; s: number; type: "team" | "player"; player: string; num: string; rows: { value: string; label: string }[] }
export type StoryBlock = Box & { kind: "story"; w: number; s: number; title: string; points: string[] }
/** A photo: the frame (x, y, w, h) shows part of the picture; the picture sits at (ix, iy) inside the frame, iw wide. */
export type PhotoBlock = Box & { kind: "photo"; w: number; h: number; rot: number; src: string; nw: number; nh: number; ix: number; iy: number; iw: number
  shape: "rect" | "round" | "circle"; edge: "hard" | "soft" | "fade"; border: "none" | "white" | "story"; shadow: boolean; flip: boolean; opacity?: number }
/** The series line: "@HANDLE · SERIES · Nº {n}", {n} becomes the report's issue number */
export type SeriesBlock = Box & { kind: "series"; w: number; size: number; color: string; text: string }
export type TLKind = "goal" | "sub" | "injury" | "red" | "other"
export type TLEvent = { min: number; label: string; kind: TLKind }
/** The game state: the match as a line from 0' to 90' (or 120'), with what changed it */
export type TimelineBlock = Box & { kind: "timeline"; w: number; s: number; events: TLEvent[] }
export type IdeaSection = { heading: string; body: string }
export type Situation = { tag: string; text: string; pin: boolean }
/** The idea: the game model in words, its key situations (numbered to match the pins) and the Point of Difference */
export type IdeaBlock = Box & { kind: "idea"; w: number; s: number; title: string; sections: IdeaSection[]; situations: Situation[]; pod: string; podLine: string }
/** The balance dial: -10 (all chaos) to 10 (all control); the score is 10 minus how far it tips */
export type DialBlock = Box & { kind: "dial"; w: number; s: number; value: number; left: string; right: string; line: string }
export type Card = { no: string; name: string; pos: string; tag: string; line: string }
/** A grid of player cards, like a notebook's team sheet. extra: a last box ("+ bench"), or "" for none. */
export type CardsBlock = Box & { kind: "cards"; w: number; s: number; cols: number; ink: string; cards: Card[]; extra: string }
/** A heading and ruled lines to write on ("____" for the blanks) */
export type LinesBlock = Box & { kind: "lines"; w: number; s: number; heading: string; ink: string; lines: string[] }
/** The fold down the middle of a notebook spread */
export type SpineBlock = Box & { kind: "spine"; w: number; h: number }
/** A drawn outline: a box, a shield, a shirt (in a kit's colours) or a circle, with an optional label inside */
export type ShapeBlock = Box & { kind: "shape"; w: number; h: number; shape: "box" | "shield" | "shirt" | "circle"; stroke: string; fill: string | null; c2: string | null; pat: KitPat; label: string; size: number; dash: boolean }
export type Block = TextBlock | PitchBlock | StatsBlock | StoryBlock | PhotoBlock | SeriesBlock | TimelineBlock | IdeaBlock | DialBlock | CardsBlock | LinesBlock | SpineBlock | ShapeBlock

export type ClubPalette = { a: string; b: string; c: string }
export type Role = { id: string; name: string; color: string }
/** story: the colour the story is told in (null: the creator's own colour). glow: a soft light of that colour behind everything.
 *  paper: the page colour (null: the mode's own). palette: a club's three colours (primary, secondary, accent), or null.
 *  stripe: two bands of the palette down the left edge. roles: what players are, each with a colour. actions: each side's pass colour.
 *  issue: the report's number in your series (taken at its first export). fill: the answers a template's form keeps. */
export type Report = { v: 2; format: RFormat; mode: RMode; paper: string | null; story: string | null; glow: boolean; seal: Corner; blocks: Block[]
  palette?: ClubPalette | null; stripe?: boolean; roles?: Role[]; actions?: { ours: string; theirs: string } | null; issue?: number | null
  paperStyle?: "plain" | "dotted" | "lined"; fill?: Fill | null
  stack?: boolean // blocks stack: one that grows or shrinks moves the blocks under it, and a new block slots in between (Create your own starts this way)
  look?: LookId | null } // the Look last picked (Create your own), so the panel can show it
export const LOOK_IDS = ["night", "paper", "club", "journal", "poster", "mono"] as const
export type LookId = (typeof LOOK_IDS)[number]

/* ── what a template's form keeps: the answers, which fill.ts writes onto the blocks ── */
export const SHAPES4 = ["4-2-3-1", "4-3-3", "4-4-2", "3-5-2"] as const
export type GameFill = { template: "game"; home: string; away: string; score: string; meta: string; headline: string; shape: (typeof SHAPES4)[number]
  lineup: string[]; keys: string[]; pod: string; podWhy: string; onball: string; offball: string; pattern: string; situations: { tag: string; text: string }[]
  events: TLEvent[]; dial: number; dialWhy: string; report: string }
export type FormationFill = { template: "formation"; title: string; shapeA: string; shapeB: string; lineup: string[]; alt: string[]; roles: Record<string, string>; note: string }
export type JournalFill = { template: "journal"; home: string; away: string; date: string; meta: string; last5: string[]; shape: string
  xi: { no: string; name: string; pos: string }[]; bench: string; danger: { name: string; note: string }[]; watching: string[]
  score: string; goals: string[]; subs: string[]; yellows: string; reds: string; numbers: string[]; officials: string; pod: string; dial: number; verdict: string[] }
export type Fill = GameFill | FormationFill | JournalFill

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

/** The three roles a palette starts with */
export const defaultRoles = (p: ClubPalette): Role[] => [{ id: "key", name: "Key player", color: p.a }, { id: "rest", name: "Rest", color: p.b }, { id: "special", name: "Special", color: p.c }]

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
const list = <T,>(v: unknown, max: number, f: (x: any) => T | null): T[] => (Array.isArray(v) ? v.slice(0, max).map(f).filter((x): x is T => x !== null) : [])
const strs = (v: unknown, max: number, len: number) => list(v, max, x => (typeof x === "string" ? x.slice(0, len) : null))
const TL_KINDS = ["goal", "sub", "injury", "red", "other"] as const
const readEvent = (e: any): TLEvent | null => (e && typeof e === "object" ? { min: Math.round(num(e.min, 0, 120, 0)), label: str(e.label, 40), kind: one(e.kind, TL_KINDS, "other") } : null)
const inkOf = (v: unknown, d = "ink") => (["ink", "story", "muted", "a", "b", "c"].includes(v as string) ? (v as string) : hex(v) ?? d)

function readMark(m: any): Mark | null {
  if (!m || typeof m !== "object") return null
  switch (m.kind) {
    case "player": return { id: id(m.id), kind: "player", team: m.team === 1 ? 1 : 0, p: pt(m.p, [0.5, 0.5]), num: str(m.num, 3), name: str(m.name, 32), side: one(m.side, ["below", "above", "left", "right"] as const, "below"), hi: m.hi !== false,
      role: typeof m.role === "string" && m.role ? m.role.slice(0, 40) : null, tag: str(m.tag, 16), ring: m.ring === true }
    case "pass": return { id: id(m.id), kind: "pass", a: pt(m.a, [0.4, 0.6]), b: pt(m.b, [0.6, 0.4]), c: m.c ? pt(m.c, [0.5, 0.5]) : null, run: m.run === true, weight: m.weight === 1 || m.weight === 3 ? m.weight : 2, hi: m.hi !== false, head: one(m.head, ["end", "none", "both"] as const, "end"), air: m.air === true,
      team: m.team === 0 || m.team === 1 ? m.team : null }
    case "pin": return { id: id(m.id), kind: "pin", p: pt(m.p, [0.5, 0.5]), n: str(m.n, 2) || "1" }
    case "zone": { const r = pt(m.r, [0.12, 0.08]); return { id: id(m.id), kind: "zone", p: pt(m.p, [0.5, 0.5]), r: [Math.max(0.01, Math.abs(r[0])), Math.max(0.01, Math.abs(r[1]))], oval: m.oval === true, hi: m.hi !== false, label: str(m.label, 40) } }
    case "ball": return { id: id(m.id), kind: "ball", p: pt(m.p, [0.5, 0.5]) }
  }
  return null
}
const mediaOk = (src: unknown, userId: string) => typeof src === "string" && src.startsWith(userId + "/") && src.length < 300 && !src.includes("..")

function readBlock(b: any, userId: string, W: number, H: number): Block | null {
  const out = readBody(b, userId, W, H)
  if (!out) return null
  if (typeof b.slot === "string" && /^[a-z0-9]{1,24}$/.test(b.slot)) { out.slot = b.slot; out.locked = b.locked === true }
  return out
}
function readBody(b: any, userId: string, W: number, H: number): Block | null {
  if (!b || typeof b !== "object") return null
  const x = num(b.x, -2 * W, 3 * W, 0), y = num(b.y, -2 * H, 3 * H, 0), w = num(b.w, 20, 4 * W, 400), s = num(b.s, 0.3, 4, 1)
  switch (b.kind) {
    case "text": return { id: id(b.id), kind: "text", x, y, w, rot: num(b.rot, -180, 180, 0), text: str(b.text, 600), style: one(b.style, ["title", "text", "label"] as const, "text"),
      size: num(b.size, 8, 400, 24), align: one(b.align, ["left", "center", "right"] as const, "left"), color: ["ink", "story", "muted"].includes(b.color) ? b.color : hex(b.color) ?? "ink",
      plate: b.plate === "dark" || b.plate === "story" ? b.plate : hex(b.plate),
      fit: b.fit === true, under: one(b.under, ["none", "thin", "thick"] as const, "none"), font: b.font === "hand" ? "hand" : "sans" }
    case "pitch": {
      const team = (t: any, d: string): Team => ({ name: str(t?.name, 30) || d, color: hex(t?.color), pat: one(t?.pat, KIT_PATTERNS, "solid"), c2: hex(t?.c2) ?? "#ffffff", num: hex(t?.num),
        formation: str(t?.formation, 20), shape: one(t?.shape, ["base", "in", "out"] as const, "base") })
      const teams = Array.isArray(b.teams) ? b.teams : []
      return { id: id(b.id), kind: "pitch", x, y, w, view: b.view === "full" ? "full" : "half", dir: b.dir === "right" ? "right" : "up", look: b.look === "stadium" || b.look === "grass" ? b.look : "flat",
        teams: [team(teams[0], "Your team"), team(teams[1], "Opponents")], marks: (Array.isArray(b.marks) ? b.marks.slice(0, MAX_MARKS) : []).map(readMark).filter(Boolean) as Mark[],
        crest: b.crest !== false, ms: num(b.ms, 0.5, 2.5, 1), legend: b.legend === true,
        ...(b.view === "full" && b.half && typeof b.half === "object" ? { half: { k: num(b.half.k, 0.2, 5, 1), dir: b.half.dir === "right" ? "right" as const : "up" as const } } : {}) }
    }
    case "stats": return { id: id(b.id), kind: "stats", x, y, w, s: num(b.s, 0.3, 4, 1), type: b.type === "player" ? "player" : "team", player: str(b.player, 32), num: str(b.num, 3),
      rows: (Array.isArray(b.rows) ? b.rows.slice(0, MAX_ROWS) : []).map((r: any) => ({ value: str(r?.value, 12), label: str(r?.label, 30) })) }
    case "story": return { id: id(b.id), kind: "story", x, y, w, s: num(b.s, 0.3, 4, 1), title: str(b.title, 40), points: (Array.isArray(b.points) ? b.points.slice(0, MAX_POINTS) : []).map((p: unknown) => str(p, 200)) }
    case "photo": {
      if (b.src !== "" && !mediaOk(b.src, userId)) return null // "" is an empty photo slot, waiting for a picture
      const nw = num(b.nw, 1, 10000, 1000), nh = num(b.nh, 1, 10000, 1000), ph = num(b.h, 20, 4 * H, 300)
      return { id: id(b.id), kind: "photo", x, y, w, h: ph, rot: num(b.rot, -180, 180, 0), src: b.src, nw, nh, ix: num(b.ix, -40000, 40000, 0), iy: num(b.iy, -40000, 40000, 0), iw: num(b.iw, 10, 40000, w),
        shape: one(b.shape, ["rect", "round", "circle"] as const, "rect"), edge: one(b.edge, ["hard", "soft", "fade"] as const, "hard"), border: one(b.border, ["none", "white", "story"] as const, "none"),
        shadow: b.shadow === true, flip: b.flip === true, opacity: num(b.opacity, 0.05, 1, 1) }
    }
    case "series": return { id: id(b.id), kind: "series", x, y, w, size: num(b.size, 8, 120, 22), color: inkOf(b.color, "muted"), text: str(b.text, 80) }
    case "timeline": return { id: id(b.id), kind: "timeline", x, y, w, s, events: list(b.events, 12, readEvent) }
    case "idea": return { id: id(b.id), kind: "idea", x, y, w, s, title: str(b.title, 60),
      sections: list(b.sections, 8, (q: any) => (q && typeof q === "object" ? { heading: str(q.heading, 40), body: str(q.body, 400) } : null)),
      situations: list(b.situations, 6, (q: any) => (q && typeof q === "object" ? { tag: str(q.tag, 24), text: str(q.text, 200), pin: q.pin !== false } : null)),
      pod: str(b.pod, 40), podLine: str(b.podLine, 160) }
    case "dial": return { id: id(b.id), kind: "dial", x, y, w, s, value: Math.round(num(b.value, -10, 10, 0)), left: str(b.left, 16) || "CHAOS", right: str(b.right, 16) || "CONTROL", line: str(b.line, 160) }
    case "cards": return { id: id(b.id), kind: "cards", x, y, w, s, cols: Math.round(num(b.cols, 1, 6, 4)), ink: inkOf(b.ink), extra: str(b.extra, 30),
      cards: list(b.cards, 24, (c: any) => (c && typeof c === "object" ? { no: str(c.no, 3), name: str(c.name, 24), pos: str(c.pos, 4), tag: str(c.tag, 16), line: str(c.line, 24) } : null)) }
    case "lines": return { id: id(b.id), kind: "lines", x, y, w, s, heading: str(b.heading, 40), ink: inkOf(b.ink), lines: strs(b.lines, 12, 120) }
    case "spine": return { id: id(b.id), kind: "spine", x, y, w, h: num(b.h, 20, 4 * H, 400) }
    case "shape": return { id: id(b.id), kind: "shape", x, y, w, h: num(b.h, 10, 4 * H, 100), shape: one(b.shape, ["box", "shield", "shirt", "circle"] as const, "box"),
      stroke: inkOf(b.stroke), fill: b.fill === null || b.fill === undefined ? null : inkOf(b.fill), c2: hex(b.c2), pat: one(b.pat, KIT_PATTERNS, "solid"), label: str(b.label, 40), size: num(b.size, 6, 200, 24), dash: b.dash === true }
  }
  return null
}

/* ── the fill: a template's answers ── */
const lineup11 = (v: unknown) => { const a = strs(v, 11, 32); while (a.length < 11) a.push(""); return a }
export function readFill(f: any): Fill | null {
  if (!f || typeof f !== "object") return null
  if (f.template === "game") return { template: "game", home: str(f.home, 30), away: str(f.away, 30), score: str(f.score, 12), meta: str(f.meta, 80), headline: str(f.headline, 80),
    shape: one(f.shape, SHAPES4, "4-2-3-1"), lineup: lineup11(f.lineup), keys: strs(f.keys, 11, 32), pod: str(f.pod, 32), podWhy: str(f.podWhy, 160), onball: str(f.onball, 400), offball: str(f.offball, 400), pattern: str(f.pattern, 400),
    situations: list(f.situations, 6, (q: any) => (q && typeof q === "object" ? { tag: str(q.tag, 24), text: str(q.text, 200) } : null)),
    events: list(f.events, 12, readEvent), dial: Math.round(num(f.dial, -10, 10, 0)), dialWhy: str(f.dialWhy, 160), report: str(f.report, 600) }
  if (f.template === "formation") {
    const roles: Record<string, string> = {}
    if (f.roles && typeof f.roles === "object") for (const [k, v] of Object.entries(f.roles).slice(0, 40)) if (typeof v === "string") roles[k.slice(0, 32)] = v.slice(0, 40)
    return { template: "formation", title: str(f.title, 60), shapeA: str(f.shapeA, 12) || "4-3-3", shapeB: str(f.shapeB, 12) || "3-4-3", lineup: lineup11(f.lineup), alt: lineup11(f.alt), roles, note: str(f.note, 160) }
  }
  if (f.template === "journal") {
    const five = strs(f.last5, 5, 1).map(x => (["W", "D", "L"].includes(x) ? x : "")); while (five.length < 5) five.push("")
    const xi = list(f.xi, 11, (q: any) => (q && typeof q === "object" ? { no: str(q.no, 3), name: str(q.name, 24), pos: str(q.pos, 4) } : null)); while (xi.length < 11) xi.push({ no: "", name: "", pos: "" })
    return { template: "journal", home: str(f.home, 30), away: str(f.away, 30), date: str(f.date, 30), meta: str(f.meta, 80), last5: five, shape: str(f.shape, 12) || "4-2-3-1", xi, bench: str(f.bench, 120),
      danger: list(f.danger, 4, (q: any) => (q && typeof q === "object" ? { name: str(q.name, 24), note: str(q.note, 80) } : null)), watching: strs(f.watching, 3, 120),
      score: str(f.score, 12), goals: strs(f.goals, 8, 80), subs: strs(f.subs, 8, 80), yellows: str(f.yellows, 120), reds: str(f.reds, 120), numbers: strs(f.numbers, 6, 80), officials: str(f.officials, 120),
      pod: str(f.pod, 32), dial: Math.round(num(f.dial, -10, 10, 0)), verdict: strs(f.verdict, 2, 160) }
  }
  return null
}
const readPalette = (v: any): ClubPalette | null => { const a = hex(v?.a), b = hex(v?.b), c = hex(v?.c); return a && b && c ? { a, b, c } : null }
/** Turns a saved report into safe data. Photos must live in this user's own folder. */
export function readReport(raw: unknown, userId: string): Report {
  const r = (raw && typeof raw === "object" ? raw : {}) as any
  const format = one(r.format, ["1:1", "4:5", "16:9", "9:16"] as const, "1:1")
  const [W, H] = SIZES[format]
  const actions = r.actions && typeof r.actions === "object" ? { ours: hex(r.actions.ours) ?? "#f2c230", theirs: hex(r.actions.theirs) ?? "#ffffff" } : null
  return { v: 2, format, mode: r.mode === "bright" ? "bright" : "night", paper: hex(r.paper), story: hex(r.story), glow: r.glow === true, seal: one(r.seal, ["br", "bl", "tr", "tl"] as const, "br"),
    blocks: (Array.isArray(r.blocks) ? r.blocks.slice(0, MAX_BLOCKS) : []).map((b: unknown) => readBlock(b, userId, W, H)).filter(Boolean) as Block[],
    palette: readPalette(r.palette), stripe: r.stripe === true, actions,
    roles: list(r.roles, 8, (q: any) => (q && typeof q === "object" && typeof q.id === "string" && hex(q.color) ? { id: q.id.slice(0, 40), name: str(q.name, 24) || "Role", color: hex(q.color)! } : null)),
    issue: typeof r.issue === "number" && Number.isInteger(r.issue) && r.issue > 0 && r.issue < 1000000 ? r.issue : null,
    paperStyle: one(r.paperStyle, ["plain", "dotted", "lined"] as const, "plain"), fill: readFill(r.fill),
    ...(r.stack === true ? { stack: true } : {}), ...((LOOK_IDS as readonly string[]).includes(r.look) ? { look: r.look as LookId } : {}) }
}
/** Every photo a report uses (its storage paths) */
export const mediaOf = (r: Report) => r.blocks.filter((b): b is PhotoBlock => b.kind === "photo" && !!b.src).map(b => b.src)
