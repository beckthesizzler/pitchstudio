import { DEFAULT_TEAMS, defaultRoles, newId, type Block, type FormationFill, type GameFill, type JournalFill, type Mark, type PitchBlock, type Pt, type Report, type ShapeBlock, type TextBlock } from "./model"
import { applyFill } from "./fill"

/* The ways to start a report. Each is ordinary report data: every block can be moved, resized, changed or deleted.
   The sample words are an example (a made-up Barcelona match), there to show what goes where. */

const NL = String.fromCharCode(10)
type Side = "below" | "above" | "left" | "right"
const pl = (team: 0 | 1, p: Pt, num: string, name: string, hi: boolean, side: Side = "below"): Mark => ({ id: newId(), kind: "player", team, p, num, name, side, hi })
const pass = (a: Pt, b: Pt, weight: 1 | 2 | 3, hi: boolean, o: { run?: boolean; c?: Pt; air?: boolean } = {}): Mark =>
  ({ id: newId(), kind: "pass", a, b, c: o.c ?? null, run: !!o.run, weight, hi, head: "end", air: !!o.air })
const pin = (p: Pt, n: number): Mark => ({ id: newId(), kind: "pin", p, n: String(n) })
const text = (x: number, y: number, w: number, t: string, style: "title" | "text" | "label", size: number, align: "left" | "center" | "right" = "left", color = "ink", plate: string | null = null): Block =>
  ({ id: newId(), kind: "text", x, y, w, rot: 0, text: t, style, size, align, color: style === "label" && color === "ink" ? "muted" : color, plate })
const pitch = (x: number, y: number, w: number, view: "full" | "half", marks: Mark[], o: Partial<PitchBlock> = {}): PitchBlock =>
  ({ id: newId(), kind: "pitch", x, y, w, view, dir: "up", look: "flat", teams: DEFAULT_TEAMS("Barcelona", "Athletic"), marks, crest: true, ms: 1, legend: false, ...o })
const slot = (x: number, y: number, w: number, h: number): Block =>
  ({ id: newId(), kind: "photo", x, y, w, h, rot: 0, src: "", nw: w, nh: h, ix: 0, iy: 0, iw: w, shape: "rect", edge: "hard", border: "none", shadow: false, flip: false })

export type TemplateId = "game" | "report" | "formation" | "journal" | "blank" | "breakdown" | "stadium"
/** The five defaults, then "More starting points" (more: true). The ids keep their meaning, so saved reports are unaffected. */
export const TEMPLATES: { id: TemplateId; name: string; note: string; more?: boolean }[] = [
  { id: "game", name: "Game Report", note: "The whole match on one card: the idea, the moments, a balance rating people argue about" },
  { id: "report", name: "Micro Breakdown", note: "One idea up close on warm paper: the pitch, the numbers and a photo" },
  { id: "formation", name: "Formation Change", note: "Your eleven in two shapes side by side, with who does what" },
  { id: "journal", name: "Matchday Journal", note: "A notebook spread: before kick-off on the left, the match on the right" },
  { id: "blank", name: "Your own", note: "An empty page and a headline. Add a pitch, stats, photos, anything" },
  { id: "breakdown", name: "The Breakdown", note: "One key idea in two small pitches side by side", more: true },
  { id: "stadium", name: "Under the Lights", note: "Your pitch from the stand, floodlit, passes in the air", more: true },
]

/** The editorial colour: a deep crimson that reads on paper (the story colour of The Breakdown) */
export const EDITORIAL = "#b3123f"

/* ── Game Report: Barcelona 3–0 Aston Villa, laid out like the card it was made from ── */
const lab = (x: number, y: number, w: number, t: string, size: number, o: Partial<TextBlock> = {}): TextBlock => ({ ...(text(x, y, w, t, "label", size) as TextBlock), ...o })
const slotted = <T extends Block>(b: T, slot: string): T => ({ ...b, slot, locked: false })
export const SAMPLE_GAME: GameFill = {
  template: "game", home: "BARCELONA", away: "ASTON VILLA", score: "3–0", meta: "Champions League · League phase, Matchday 4 · Spotify Camp Nou · 3 Nov 2026",
  headline: "VILLA PLAYED INTO THE TRAP", shape: "4-2-3-1",
  lineup: ["Joan García", "", "", "", "Cancelo", "Rodri", "Pedri", "Yamal", "Fermín", "Gordon", "Raphinha"], keys: ["Pedri", "Fermín", "Raphinha", "Yamal"], pod: "Yamal",
  podWhy: "Yamal made the difference: the steal and the finish in the 7th minute, 6 shots and 7 dribbles (Opta).",
  onball: "4-2-3-1. Rodri and Pedri behind Fermín, Yamal and Gordon wide, Raphinha up top. Pedri and Fermín combined for the second. Cancelo broke the last line down the left for the third.",
  offball: "A high press on Villa's short build-up, with a compact back line behind it. Villa had 9 shots and only 1 on target.",
  pattern: "Their strategy: play short through our press. Ours: jump the first loose pass. Their level of risk was our way in, and the same build-up kept turning into the same turnover situation.",
  situations: [
    { tag: "Trap · 7'", text: "Gomes plays a poor pass across his own zone, straight to Yamal. He steals it and finishes past Suzuki." },
    { tag: "Combination · 52'", text: "Pedri and Fermín combine. Fermín finds Raphinha at the edge of the box, and his shot deflects in." },
    { tag: "Carry · 64'", text: "Cancelo skips past McGinn and slides it across with the outside of his boot. Raphinha scores from six yards." },
    { tag: "Game state · HT", text: "Rodri off with calf discomfort, Bernal on. Control had to survive without him." },
    { tag: "Set piece · Late", text: "Goretzka heads a corner onto the frame. Villa's best chance of the second half." },
  ],
  events: [{ min: 7, label: "Yamal", kind: "goal" }, { min: 45, label: "Rodri off (calf) · Bernal on", kind: "sub" }, { min: 52, label: "Raphinha", kind: "goal" }, { min: 64, label: "Raphinha", kind: "goal" }],
  dial: 2, dialWhy: "Controlled the game and the chaos: our first Champions League clean sheet in 19 matches. Minus: Rodri off at half-time.",
  report: "What were we trying to achieve? Control without the ball, after the 4-2 defeat to PSG. Did we? Yes: a clean sheet, and Villa hit the target once. How? The press turned Villa's short build-up into a repeatable turnover situation, and Pedri, Fermín and Cancelo broke the last line. Retain the press and the compact back line. Add a layer that keeps our control if Rodri is out. Could we maximise our influence on the game? Yes. No new approach needed.",
}
export const BLANK_GAME: GameFill = { ...SAMPLE_GAME, home: "", away: "", score: "", meta: "", headline: "", lineup: Array(11).fill(""), keys: [], pod: "", podWhy: "", onball: "", offball: "", pattern: "", situations: [], events: [], dial: 0, dialWhy: "", report: "" }
const VILLA = "#9ec5e8"
function gameReport(handle: string): Report {
  const pal = { a: "#a11d48", b: "#1f4ba0", c: "#e9b949" }
  const t0 = DEFAULT_TEAMS("Barcelona", "Aston Villa")
  const opp: Mark[] = [[0.3, 0.06], [0.62, 0.04], [0.47, 0.1], [0.5, 0.19], [0.3, 0.21], [0.7, 0.24], [0.84, 0.34]].map(([u, v], i) =>
    ({ id: newId(), kind: "player", team: 1, p: [u, v], num: "", name: ["", "", "", "Gomes", "", "McGinn", ""][i] ?? "", side: "left", hi: true }))
  const pitchB: PitchBlock = slotted({ ...pitch(110, 540, 716, "full", opp, { look: "grass", crest: false, legend: false, ms: 1.25 }), teams: [{ ...t0[0], color: pal.b }, { ...t0[1], color: VILLA }] }, "pitch")
  const blocks: Block[] = [
    slotted({ id: newId(), kind: "series", x: 110, y: 96, w: 1380, size: 21, color: "b", text: `${handle ? "@" + handle : "@HANDLE"} · GAME MODEL · Nº {n}` }, "series"),
    slotted(lab(110, 132, 1410, "", 17, { under: "thin" }), "meta"),
    slotted(text(110, 182, 1410, "", "title", 56, "left", "a") as TextBlock, "score"),
    slotted({ ...(text(110, 236, 1410, "", "title", 124) as TextBlock), fit: true, under: "thick" }, "headline"),
    slotted({ id: newId(), kind: "timeline", x: 110, y: 380, w: 1410, s: 1, events: [] }, "timeline"),
    pitchB,
    slotted({ id: newId(), kind: "idea", x: 880, y: 546, w: 640, s: 0.82, title: "The idea", sections: [{ heading: "On-ball structure", body: "" }, { heading: "Off-ball structure", body: "" }, { heading: "Pattern recognition", body: "" }], situations: [], pod: "", podLine: "" }, "idea"),
    slotted({ id: newId(), kind: "dial", x: 880, y: 1404, w: 640, s: 0.9, value: 0, left: "CHAOS", right: "CONTROL", line: "" }, "dial"),
    lab(110, 1694, 600, "The report", 17),
    slotted(text(110, 1728, 1410, "", "text", 26) as TextBlock, "report"),
    { ...(text(110, 1942, 1100, "Positions illustrative, drawn from match reports. Base formations from published lineups.", "text", 14, "left", "muted") as TextBlock) },
  ]
  const r: Report = { v: 2, format: "4:5", mode: "bright", paper: "#f1eee6", story: null, glow: false, seal: "br", blocks, palette: pal, stripe: true,
    roles: defaultRoles(pal), actions: { ours: "#f2c230", theirs: "#ffffff" }, issue: null, paperStyle: "plain", fill: null }
  const out = applyFill(r, SAMPLE_GAME, false)
  // the sample's own touches: Yamal's tag, the trap, and the moves behind the goals
  const pb = out.blocks.find(b => b.slot === "pitch") as PitchBlock
  const at = (n: string) => (pb.marks.find(m => m.kind === "player" && m.team === 0 && m.name === n) as { p: Pt } | undefined)?.p
  const extra: Mark[] = []
  const go = (a: string, b: string, run = false) => { const A = at(a), B = at(b); if (A && B) extra.push({ ...(pass(A, B, 2, true, { run }) as any), team: 0 }) }
  go("Pedri", "Fermín"); go("Fermín", "Raphinha"); go("Cancelo", "Raphinha")
  const y = at("Yamal")
  if (y) extra.push({ id: newId(), kind: "zone", p: [y[0] - 0.1, y[1] + 0.02], r: [0.16, 0.06], oval: false, hi: false, label: "Trap" })
  return { ...out, blocks: out.blocks.map(b => (b.id === pb.id ? { ...pb, marks: [...extra, ...pb.marks.map(m => (m.kind === "player" && m.name === "Yamal" ? { ...m, tag: "Nomad 10" } : m))] } : b)) }
}
/** The next match from your last Game Report: its colours, roles, series line and headings, with the match itself cleared */
export function nextGameFrom(prev: Report, handle: string): Report {
  const fresh = applyFill(gameReport(handle), BLANK_GAME, false)
  const series = prev.blocks.find(b => b.slot === "series" && b.kind === "series")
  const idea = prev.blocks.find(b => b.slot === "idea" && b.kind === "idea")
  const blocks = fresh.blocks.map(b => {
    if (b.slot === "series" && b.kind === "series" && series?.kind === "series") return { ...b, text: series.text, color: series.color }
    if (b.slot === "idea" && b.kind === "idea" && idea?.kind === "idea") return { ...b, title: idea.title, sections: idea.sections.map(q => ({ heading: q.heading, body: "" })) }
    if (b.slot === "pitch" && b.kind === "pitch") return { ...b, marks: b.marks.filter(m => m.kind === "player" && m.team === 0).map(m => ({ ...m, name: "", tag: "", ring: false })) }
    return b
  })
  return { ...fresh, blocks, palette: prev.palette ?? fresh.palette, roles: prev.roles?.length ? prev.roles : fresh.roles, actions: prev.actions ?? fresh.actions, stripe: prev.stripe ?? true, issue: null, fill: { ...BLANK_GAME, shape: prev.fill?.template === "game" ? prev.fill.shape : "4-2-3-1" } }
}

/* ── Formation Change: your eleven in two shapes ── */
export const SAMPLE_FORMATION: FormationFill = { template: "formation", title: "MY DREAM XI", shapeA: "4-3-3", shapeB: "3-4-3",
  lineup: ["Joan García", "Koundé", "Araujo", "Cubarsí", "Balde", "Pedri", "De Jong", "Fermín", "Yamal", "Lewandowski", "Raphinha"], alt: ["", "", "", "", "", "Gavi", "", "", "", "", ""],
  roles: { Pedri: "mutant", Fermín: "mutant", Raphinha: "mutant", "De Jong": "anchor", Yamal: "special" }, note: "Illustrative lineup and positions, not tracking data." }
function formationReport(handle: string): Report {
  const pal = { a: "#e9b949", b: "#38bdf8", c: "#ff4d5e" }
  const roles = [{ id: "mutant", name: "Mutants", color: pal.a }, { id: "anchor", name: "Anchor", color: pal.b }, { id: "special", name: "Special", color: pal.c }]
  const teams = DEFAULT_TEAMS("Barcelona", "")
  const pa = slotted(pitch(110, 470, 670, "full", [], { teams: [{ ...teams[0], color: "#5b6b88" }, teams[1]], crest: false, ms: 1.6 }), "pitchA")
  const pb = slotted(pitch(820, 470, 670, "full", [], { teams: [{ ...teams[0], color: "#5b6b88" }, teams[1]], crest: false, ms: 1.6 }), "pitchB")
  const key = (x: number, label: string, color: string): Block[] => [
    { id: newId(), kind: "shape", x, y: 1560, w: 26, h: 26, shape: "circle", stroke: color, fill: color, c2: null, pat: "solid", label: "", size: 12, dash: false } as ShapeBlock,
    lab(x + 40, 1562, 300, label, 19, { color: "ink" }),
  ]
  const blocks: Block[] = [
    slotted({ id: newId(), kind: "series", x: 110, y: 96, w: 1380, size: 21, color: "a", text: `${handle ? "@" + handle : "@HANDLE"} · FORMATION CHANGE · Nº {n}` }, "series"),
    slotted({ ...(text(110, 140, 1380, "", "title", 160, "left", "ink") as TextBlock), fit: true }, "title"),
    slotted(lab(110, 318, 1380, "", 22, { color: "a" }), "shapes"),
    slotted(lab(110, 416, 670, "", 26, { color: "ink", align: "center" }), "labelA"),
    slotted(lab(820, 416, 670, "", 26, { color: "ink", align: "center" }), "labelB"),
    pa, pb,
    ...key(110, "Mutants", "a"), ...key(420, "Anchor", "b"), ...key(700, "Special", "c"),
    slotted(text(110, 1900, 1380, "", "text", 18, "left", "muted") as TextBlock, "note"),
  ]
  return applyFill({ v: 2, format: "4:5", mode: "night", paper: "#0f1f3d", story: null, glow: false, seal: "br", blocks, palette: pal, stripe: false, roles, actions: null, issue: null, paperStyle: "plain", fill: null }, SAMPLE_FORMATION, false)
}

/* ── Matchday Journal: a notebook spread, written by hand. Anything not known stays "____". ── */
const INK = { blue: "#1f3e8c", red: "#b3261e", green: "#2e7d32", claret: "#6e1e3a", black: "#1a1916" }
export const SAMPLE_JOURNAL: JournalFill = { template: "journal", home: "Barça", away: "Aston Villa", date: "Mon 3 Nov 2026", meta: "Champions League · League phase, MD4 · Camp Nou",
  last5: ["L", "W", "W", "W", "D"], shape: "4-2-3-1",
  xi: [["13", "Joan García", "GK"], ["", "Cancelo", "LB"], ["", "", "CB"], ["", "", "CB"], ["", "", "RB"], ["", "Rodri", "DM"], ["8", "Pedri", "DM"], ["", "Gordon", "LW"], ["16", "Fermín", "AM"], ["10", "Yamal", "RW"], ["11", "Raphinha", "ST"]].map(([no, name, pos]) => ({ no, name, pos })),
  bench: "Bernal", danger: [{ name: "Goretzka", note: "heads in from set pieces" }, { name: "McGinn", note: "carries through the middle" }, { name: "Gomes", note: "short build-up from the back" }, { name: "", note: "" }],
  watching: ["Do we jump their short build-up?", "Does the back line stay compact behind the press?", "Who keeps control if Rodri tires?"],
  score: "3–0", goals: ["7' Yamal", "52' Raphinha", "64' Raphinha"], subs: ["HT Rodri off (calf) · Bernal on"], yellows: "", reds: "", numbers: ["Villa 9 shots, 1 on target", "Yamal 6 shots, 7 dribbles (Opta)"], officials: "",
  pod: "Yamal", dial: 2, verdict: ["Control without the ball, and a clean sheet.", "Keep the press. Add a plan for when Rodri is out."] }
function journalReport(): Report {
  const hand = (x: number, y: number, w: number, t: string, size: number, color: string, style: "title" | "text" | "label" = "text", align: "left" | "center" | "right" = "left"): TextBlock =>
    ({ ...(text(x, y, w, t, style, size, align, color) as TextBlock), font: "hand" })
  const mono = (x: number, y: number, t: string, color = "muted") => lab(x, y, 700, t, 13, { color })
  const shape = (x: number, y: number, w: number, h: number, o: Partial<ShapeBlock>): ShapeBlock => ({ id: newId(), kind: "shape", x, y, w, h, shape: "box", stroke: INK.black, fill: null, c2: null, pat: "solid", label: "", size: 18, dash: false, ...o })
  const lines = (x: number, y: number, w: number, heading: string, n: number, ink: string, s = 0.8): Block => ({ id: newId(), kind: "lines", x, y, w, s, heading, ink, lines: Array(n).fill("") })
  const blocks: Block[] = [
    { id: newId(), kind: "spine", x: 780, y: 0, w: 40, h: 900 },
    mono(60, 26, "Before kick-off"),
    shape(60, 52, 44, 52, { shape: "shield", stroke: INK.claret }),
    slotted(hand(118, 46, 440, "", 34, INK.blue, "title"), "home"),
    slotted(hand(118, 84, 440, "", 30, INK.claret, "title"), "away"),
    slotted(hand(60, 126, 520, "", 17, INK.black), "meta"),
    shape(600, 46, 70, 66, { shape: "shirt", stroke: INK.black, fill: "#a11d48", c2: "#1f4ba0", pat: "stripes" }),
    shape(686, 46, 70, 66, { shape: "shirt", stroke: INK.black, fill: "#7a263a", c2: "#95bfe5", pat: "sleeves" }),
    mono(60, 166, "Coming in · last 5"),
    ...[0, 1, 2, 3, 4].map(i => slotted(shape(60 + i * 44, 186, 36, 36, { stroke: INK.black, size: 20 }), "r" + (i + 1))),
    slotted(mono(60, 244, "", INK.blue), "xilabel"),
    slotted({ id: newId(), kind: "cards", x: 60, y: 264, w: 700, s: 0.7, cols: 4, ink: INK.blue, cards: [], extra: "+ bench" }, "xi"),
    slotted(lines(60, 548, 340, "Their danger men", 4, INK.red, 0.82), "danger"),
    slotted(lines(420, 548, 340, "What I'm watching", 3, INK.green, 0.82), "watching"),
    mono(840, 26, "The match"),
    slotted(hand(840, 46, 420, "", 20, INK.black), "date"),
    shape(840, 82, 420, 72, { stroke: INK.black }),
    slotted(hand(846, 96, 140, "", 26, INK.blue, "title", "center"), "shome"),
    slotted(hand(986, 88, 100, "", 44, INK.black, "title", "center"), "score"),
    slotted(hand(1086, 96, 170, "", 26, INK.claret, "title", "center"), "saway"),
    slotted(pitch(1290, 82, 250, "full", [{ id: newId(), kind: "pin", p: [0.72, 0.18], n: "1" }, { id: newId(), kind: "pin", p: [0.4, 0.14], n: "2" }, { id: newId(), kind: "pin", p: [0.22, 0.12], n: "3" }], { crest: false, teams: DEFAULT_TEAMS("", ""), ms: 0.9 }), "sketch"),
    slotted(lines(840, 170, 420, "Goals", 4, INK.black), "goals"),
    slotted(lines(840, 330, 420, "Subs · off ↘ on ↗", 3, INK.green), "subs"),
    mono(840, 460, "Bookings"),
    shape(840, 482, 20, 28, { fill: "#f2c230", stroke: "#a8861c" }),
    slotted(hand(870, 480, 390, "", 18, INK.black), "yellows"),
    shape(840, 518, 20, 28, { fill: "#d7261e", stroke: "#8f1913" }),
    slotted(hand(870, 516, 390, "", 18, INK.black), "reds"),
    slotted(lines(840, 560, 420, "Numbers", 3, INK.blue), "numbers"),
    slotted(lines(1290, 490, 250, "Officials", 1, INK.black), "officials"),
    shape(1290, 560, 250, 92, { stroke: "c" }),
    lab(1304, 572, 230, "Point of difference", 12, { color: "muted" }),
    slotted(hand(1304, 596, 230, "", 28, INK.claret, "title"), "pod"),
    slotted({ id: newId(), kind: "dial", x: 1290, y: 676, w: 250, s: 0.5, value: 0, left: "CHAOS", right: "CONTROL", line: "" }, "dial"),
    slotted(lines(840, 690, 420, "Verdict", 2, INK.black), "verdict"),
    { id: newId(), kind: "series", x: 840, y: 836, w: 420, size: 14, color: INK.blue, text: "→ turn into Game Report Nº {n}" },
  ]
  return applyFill({ v: 2, format: "16:9", mode: "bright", paper: "#f4f1ea", story: null, glow: false, seal: "tr", blocks, palette: { a: INK.claret, b: INK.blue, c: "#e9b949" }, stripe: false, roles: [], actions: null, issue: null, paperStyle: "dotted", fill: null }, SAMPLE_JOURNAL, false)
}

/** "Create your own": shapes to start from. Each is a real page with an example in every block, never an empty box, so there is always something to change. */
export type ShapeId = "pitch" | "two" | "story" | "numbers" | "blank"
export const SHAPES: { id: ShapeId; name: string; note: string }[] = [
  { id: "pitch", name: "One big pitch", note: "A headline, a pitch and a line under it" },
  { id: "two", name: "Two pitches", note: "Before and after, this or that" },
  { id: "story", name: "Pitch and story", note: "The move, and the points beside it" },
  { id: "numbers", name: "Numbers first", note: "Three numbers, then the pitch" },
  { id: "blank", name: "Blank page", note: "A headline and every tool" },
]
export function makeShape(id: ShapeId): Report {
  const base = { v: 2 as const, format: "1:1" as const, mode: "night" as const, paper: null, story: null, glow: false, seal: "br" as const }
  const example = (): Mark[] => [
    { id: newId(), kind: "zone", p: [0.5, 0.48], r: [0.12, 0.08], oval: false, hi: true, label: "" },
    pass([0.3, 0.86], [0.48, 0.5], 2, true), pass([0.5, 0.5], [0.74, 0.3], 2, true, { run: true }),
  ]
  const head = (y = 90, size = 110) => text(80, y, 1440, "YOUR HEADLINE", "title", size)
  const wide = { ...base, format: "16:9" as const } // 1600 × 900: side-by-side shapes fill it with no empty half
  if (id === "pitch") return { ...base, blocks: [head(), pitch(230, 300, 1140, "half", example()), text(230, 1230, 1140, "One line that says what to look at.", "text", 32)] }
  if (id === "two") return { ...wide, blocks: [head(56, 84),
    text(80, 178, 700, "1 · BEFORE", "label", 22), pitch(80, 214, 700, "half", example()), text(80, 772, 700, "What happens first.", "text", 26),
    text(820, 178, 700, "2 · AFTER", "label", 22), pitch(820, 214, 700, "half", example()), text(820, 772, 700, "What changes.", "text", 26)] }
  if (id === "story") return { ...wide, blocks: [head(56, 84), pitch(80, 176, 860, "half", example()),
    { id: newId(), kind: "story", x: 1010, y: 200, w: 510, s: 1, title: "The story", points: ["Your first point.", "Your second point.", "What it means."] }] }
  if (id === "numbers") return { ...base, blocks: [head(),
    { id: newId(), kind: "stats", x: 80, y: 290, w: 1440, s: 1, type: "team", player: "", num: "", rows: [{ value: "62%", label: "Possession" }, { value: "2.4", label: "xG" }, { value: "14", label: "Shots" }] },
    pitch(330, 640, 940, "half", example())] }
  return makeTemplate("blank")
}

export function makeTemplate(id: TemplateId, handle = ""): Report {
  if (id === "game") return gameReport(handle)
  if (id === "formation") return formationReport(handle)
  if (id === "journal") return journalReport()
  if (id === "breakdown") {
    const ball = (p: Pt): Mark => ({ id: newId(), kind: "ball", p })
    const zone = (p: Pt, r: Pt, label: string, hi: boolean, oval = false): Mark => ({ id: newId(), kind: "zone", p, r, oval, hi, label })
    // 1 Compact: three of his team reach the first man, and his post is already covered
    const one: Mark[] = [
      zone([0.17, 0.78], [0.1, 0.08], "His post", true), zone([0.63, 0.46], [0.22, 0.17], "", false, true),
      pass([0.22, 0.7], [0.44, 0.38], 2, true, { run: true }),
      pass([0.8, 0.28], [0.67, 0.41], 1, false, { run: true }), pass([0.52, 0.66], [0.6, 0.52], 1, false, { run: true }), pass([0.24, 0.6], [0.18, 0.74], 1, false, { run: true }),
      pl(0, [0.44, 0.36], "95", "Bastoni", true, "above"), pl(0, [0.8, 0.26], "", "", false), pl(0, [0.52, 0.68], "", "", false), pl(0, [0.24, 0.58], "", "", false), pl(0, [0.08, 0.38], "", "", false),
      pl(1, [0.63, 0.46], "", "First man", false, "below"), ball([0.66, 0.48]), pl(1, [0.3, 0.16], "", "", false), pl(1, [0.42, 0.62], "", "", false), pl(1, [0.88, 0.72], "", "", false),
    ]
    // 2 Spread out: he's alone, his post is open and the counter is on
    const two: Mark[] = [
      zone([0.17, 0.78], [0.1, 0.08], "His post", true), zone([0.63, 0.46], [0.22, 0.17], "", false, true),
      pass([0.22, 0.7], [0.44, 0.38], 2, true, { run: true }),
      pass([0.63, 0.46], [0.285, 0.75], 2, false, { c: [0.45, 0.68] }), pass([0.42, 0.62], [0.285, 0.81], 1, false, { run: true }), // both stop at the edge of his post, clear of its label
      pl(0, [0.44, 0.36], "95", "Bastoni", true, "above"), pl(0, [0.92, 0.12], "", "", false), pl(0, [0.08, 0.3], "", "", false), pl(0, [0.5, 0.86], "", "", false),
      pl(1, [0.63, 0.46], "", "First man", false, "below"), ball([0.66, 0.48]), pl(1, [0.3, 0.16], "", "", false), pl(1, [0.42, 0.62], "", "", false), pl(1, [0.88, 0.72], "", "", false),
    ]
    const t0 = DEFAULT_TEAMS("Inter", "Napoli"), teams: typeof t0 = [{ ...t0[0], color: "#1f3a68" }, t0[1]]
    return { v: 2, format: "1:1", mode: "bright", paper: null, story: EDITORIAL, glow: false, seal: "br", blocks: [
      text(900, 74, 620, "Key 3 · Balance", "label", 19, "right", "story"),
      text(80, 62, 1100, "Who covers his post?", "title", 100),
      text(80, 186, 1100, "Inter 2–1 Napoli · Serie A · Matchday 12", "label", 17),
      text(80, 268, 700, "1  Compact", "title", 50),
      text(80, 330, 700, "Three reach the first man. His post is covered.", "text", 23, "left", "muted"),
      pitch(80, 380, 700, "half", one, { teams, crest: false, legend: false, ms: 1.7 }),
      text(820, 268, 700, "2  Spread out", "title", 50),
      text(820, 330, 700, "He's alone, and his post is open.", "text", 23, "left", "muted"),
      pitch(820, 380, 700, "half", two, { teams, crest: false, legend: true, ms: 1.7 }),
      text(80, 1040, 1440, "Bastoni jumps into midfield and the ball is lost. Compact, and three of his team reach the first man while his post is already covered. Spread out, and he's alone: his post is open and the counter is on.", "text", 32),
      { id: newId(), kind: "stats", x: 80, y: 1225, w: 1440, s: 1, type: "team", player: "", num: "", rows: [{ value: "3", label: "Reach the first man, compact" }, { value: "1", label: "Reaches him, spread out" }, { value: "4s", label: "Until the counter hits his post" }] },
      text(80, 1490, 900, "Illustrative, not a match moment.", "label", 14),
    ] }
  }
  if (id === "stadium") {
    const marks: Mark[] = [
      pl(1, [0.5, 0.03], "", "", false), pl(1, [0.2, 0.2], "", "", false), pl(1, [0.42, 0.16], "", "", false), pl(1, [0.6, 0.17], "", "", false),
      pl(1, [0.79, 0.27], "", "", false), pl(1, [0.5, 0.42], "", "", false), pl(1, [0.66, 0.5], "", "", false),
      pl(0, [0.5, 0.21], "9", "", false), pl(0, [0.15, 0.3], "11", "", false), pl(0, [0.88, 0.36], "10", "Yamal", true),
      pl(0, [0.4, 0.64], "8", "Pedri", true), pl(0, [0.9, 0.74], "23", "", false),
      pass([0.4, 0.64], [0.88, 0.36], 3, true, { air: true }), pass([0.88, 0.36], [0.72, 0.15], 2, true, { run: true }), pass([0.9, 0.74], [0.96, 0.44], 2, false, { run: true }),
      { id: newId(), kind: "ball", p: [0.42, 0.62] },
    ]
    return { v: 2, format: "1:1", mode: "night", paper: null, story: null, glow: true, seal: "bl", blocks: [
      pitch(-150, 540, 1900, "half", marks, { look: "stadium", crest: false, ms: 1.45 }),
      text(80, 80, 1440, "Match report · Barcelona 2–0 Athletic", "label", 18, "center", "#ffffff"),
      text(80, 118, 1440, "THE NIGHT YAMAL", "title", 168, "center", "#ffffff"),
      text(80, 280, 1440, "OWNED THE RIGHT", "title", 168, "center", "story"),
      text(80, 1410, 980, "Pedri's switch found Yamal 1v1 eleven times. Athletic never doubled up.", "text", 27, "left", "#ffffff"),
      slot(1170, 860, 360, 640),
    ] }
  }
  if (id === "blank") return { v: 2, format: "1:1", mode: "night", paper: null, story: null, glow: false, seal: "br", blocks: [text(80, 90, 1440, "YOUR HEADLINE", "title", 120)] }
  // the default: warm paper, the headline in ink with a stroke of your colour behind it (a highlighter), one idea up close
  const marks: Mark[] = [
    { id: newId(), kind: "zone", p: [0.47, 0.5], r: [0.08, 0.06], oval: false, hi: true, label: "" },
    pass([0.43, 0.88], [0.47, 0.52], 2, true), pass([0.47, 0.52], [0.69, 0.33], 2, true, { run: true }),
    pass([0.9, 0.8], [0.92, 0.5], 2, false, { run: true }), pass([0.08, 0.72], [0.07, 0.45], 2, false, { run: true }),
    pl(1, [0.5, 0.05], "", "", false), pl(1, [0.2, 0.21], "", "", false), pl(1, [0.4, 0.17], "", "", false), pl(1, [0.6, 0.17], "", "", false),
    pl(1, [0.8, 0.21], "", "", false), pl(1, [0.3, 0.39], "", "", false), pl(1, [0.62, 0.42], "", "", false), pl(1, [0.74, 0.55], "", "", false), pl(1, [0.38, 0.72], "", "", false),
    pl(0, [0.5, 0.27], "9", "Jesus", false, "right"), pl(0, [0.12, 0.3], "11", "Raphinha", false), pl(0, [0.88, 0.3], "10", "Yamal", false),
    pl(0, [0.69, 0.33], "7", "Fermín", true, "right"), pl(0, [0.47, 0.52], "8", "Pedri", true, "right"), pl(0, [0.43, 0.88], "21", "De Jong", true, "left"),
    pl(0, [0.9, 0.8], "23", "Koundé", false, "left"), pl(0, [0.08, 0.72], "3", "Balde", false, "right"),
    pin([0.53, 0.84], 1), pin([0.6, 0.62], 2), pin([0.8, 0.4], 3),
  ]
  return { v: 2, format: "1:1", mode: "bright", paper: null, story: null, glow: false, seal: "br", blocks: [
    text(80, 74, 1440, "Match report · Barcelona 2–0 Athletic", "label", 16),
    text(84, 108, 1440, "PEDRI, FREE BETWEEN THE LINES", "title", 108, "left", "story"),
    text(80, 258, 1000, "Athletic's midfield jumps to De Jong. That one step leaves a pocket behind it, and Pedri lives there.", "text", 23),
    pitch(80, 380, 1000, "half", marks, { legend: true }),
    { id: newId(), kind: "story", x: 1140, y: 390, w: 380, s: 1, title: "The idea", points: ["De Jong drops in and draws the midfield.", "The pocket opens: Pedri gets the ball on the half-turn.", "One pass and Fermín is running at the back four."] },
    slot(1130, 730, 400, 740),
    { id: newId(), kind: "stats", x: 80, y: 1260, w: 1000, s: 1, type: "team", player: "", num: "", rows: [{ value: "94", label: "Pedri passes" }, { value: "17", label: "Between the lines" }, { value: "4", label: "Chances made" }] },
  ] }
}
