import { DEFAULT_TEAMS, newId, type Block, type Mark, type PitchBlock, type Pt, type Report } from "./model"

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

export type TemplateId = "breakdown" | "report" | "stadium" | "blank"
export const TEMPLATES: { id: TemplateId; name: string; note: string }[] = [
  { id: "breakdown", name: "The Breakdown", note: "The match, one key idea in two small pitches side by side, and the story told underneath" },
  { id: "report", name: "Match Report", note: "Warm paper: one idea up close, the numbers and a photo" },
  { id: "stadium", name: "Under the Lights", note: "The 3D one: your pitch from the stand, floodlit, passes in the air" },
  { id: "blank", name: "Design your own", note: "An empty page and a headline. Add a pitch, stats, photos, anything" },
]

/** The editorial colour: a deep crimson that reads on paper (the story colour of The Breakdown) */
export const EDITORIAL = "#b3123f"

export function makeTemplate(id: TemplateId): Report {
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
      pass([0.63, 0.46], [0.2, 0.76], 2, false, { c: [0.42, 0.7] }), pass([0.42, 0.62], [0.22, 0.8], 1, false, { run: true }),
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
    pl(0, [0.5, 0.27], "9", "Lewandowski", false, "right"), pl(0, [0.12, 0.3], "11", "Raphinha", false), pl(0, [0.88, 0.3], "10", "Yamal", false),
    pl(0, [0.69, 0.33], "16", "Fermín", true, "right"), pl(0, [0.47, 0.52], "8", "Pedri", true, "right"), pl(0, [0.43, 0.88], "21", "De Jong", true, "left"),
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
