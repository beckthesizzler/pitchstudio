import { newId, type Block, type Mark, type PitchBlock, type Pt, type Report } from "./model"

/* The ways to start a report. Each is ordinary report data: every block can be moved, resized, changed or deleted.
   The sample words are an example (a made-up Barcelona match), there to show what goes where. */

const NL = String.fromCharCode(10)
type Side = "below" | "above" | "left" | "right"
const pl = (team: 0 | 1, p: Pt, num: string, name: string, hi: boolean, side: Side = "below"): Mark => ({ id: newId(), kind: "player", team, p, num, name, side, hi })
const pass = (a: Pt, b: Pt, weight: 1 | 2 | 3, hi: boolean, o: { run?: boolean; c?: Pt; air?: boolean } = {}): Mark =>
  ({ id: newId(), kind: "pass", a, b, c: o.c ?? null, run: !!o.run, weight, hi, head: "end", air: !!o.air })
const pin = (p: Pt, n: number): Mark => ({ id: newId(), kind: "pin", p, n: String(n) })
const text = (x: number, y: number, w: number, t: string, style: "title" | "text" | "label", size: number, align: "left" | "center" | "right" = "left", color = "ink"): Block =>
  ({ id: newId(), kind: "text", x, y, w, rot: 0, text: t, style, size, align, color: style === "label" && color === "ink" ? "muted" : color })
const pitch = (x: number, y: number, w: number, view: "full" | "half", marks: Mark[], o: Partial<PitchBlock> = {}): PitchBlock =>
  ({ id: newId(), kind: "pitch", x, y, w, view, dir: "up", look: "flat", teams: [{ name: "Barcelona", color: null }, { name: "Athletic", color: null }], marks, crest: true, ms: 1, ...o })
const slot = (x: number, y: number, w: number, h: number): Block =>
  ({ id: newId(), kind: "photo", x, y, w, h, rot: 0, src: "", nw: w, nh: h, ix: 0, iy: 0, iw: w, shape: "rect", edge: "hard", border: "none", shadow: false, flip: false })

export type TemplateId = "report" | "full" | "stadium" | "blank"
export const TEMPLATES: { id: TemplateId; name: string; note: string }[] = [
  { id: "report", name: "Match Report", note: "One idea up close: both teams, your story, the numbers and a photo" },
  { id: "full", name: "Full Pitch", note: "The whole match on one pitch, with the headline down the side" },
  { id: "stadium", name: "Stadium", note: "The fun one: your pitch from the stand, floodlit, passes in the air" },
  { id: "blank", name: "Blank", note: "An empty page and a headline. Add what you need" },
]

export function makeTemplate(id: TemplateId): Report {
  if (id === "full") {
    const marks: Mark[] = [
      { id: newId(), kind: "zone", p: [0.5, 0.36], r: [0.15, 0.05], oval: false, hi: true, label: "" },
      pass([0.37, 0.8], [0.13, 0.66], 1, false), pass([0.5, 0.94], [0.63, 0.8], 1, false), pass([0.13, 0.66], [0.15, 0.25], 2, false, { c: [0.1, 0.45] }),
      pass([0.63, 0.4], [0.5, 0.13], 1, false), pass([0.15, 0.25], [0.5, 0.13], 1, false), pass([0.31, 0.46], [0.63, 0.4], 2, false, { c: [0.47, 0.39] }),
      pass([0.63, 0.8], [0.5, 0.6], 3, true), pass([0.5, 0.6], [0.31, 0.46], 3, true), pass([0.5, 0.6], [0.87, 0.69], 2, true, { c: [0.71, 0.61] }),
      pass([0.87, 0.69], [0.88, 0.27], 3, true), pass([0.31, 0.46], [0.88, 0.27], 2, true, { c: [0.6, 0.27] }),
      pl(0, [0.5, 0.94], "1", "Joan García", false), pl(0, [0.87, 0.69], "23", "Koundé", true, "left"), pl(0, [0.63, 0.8], "5", "Cubarsí", false),
      pl(0, [0.37, 0.8], "4", "Araujo", false), pl(0, [0.13, 0.66], "3", "Balde", false), pl(0, [0.5, 0.6], "21", "De Jong", true, "right"),
      pl(0, [0.31, 0.46], "8", "Pedri", true, "left"), pl(0, [0.63, 0.4], "16", "Fermín", false, "right"), pl(0, [0.88, 0.27], "10", "Yamal", true),
      pl(0, [0.15, 0.25], "11", "Raphinha", false), pl(0, [0.5, 0.13], "9", "Lewandowski", false),
      pin([0.36, 0.56], 1), pin([0.38, 0.33], 2), pin([0.62, 0.21], 3), pin([0.95, 0.5], 4),
    ]
    return { v: 2, format: "1:1", mode: "night", story: null, glow: false, seal: "br", blocks: [
      text(80, 84, 470, "Match report · LaLiga · 26 Oct 2026", "label", 16),
      text(80, 118, 530, "BARÇA 2–0" + NL + "ATHLETIC", "title", 106),
      text(80, 352, 470, "Flick's side won it through the middle: De Jong and Pedri carried the build-up, Yamal finished it on the right.", "text", 22),
      { id: newId(), kind: "story", x: 80, y: 560, w: 470, s: 1, title: "The story", points: [
        "De Jong takes every first pass, so the press has nobody to jump.", "Pedri receives between the lines and turns.",
        "The switch finds Yamal 1v1 on the right.", "Koundé overlaps, so his man can't double up."] },
      { id: newId(), kind: "stats", x: 80, y: 1330, w: 480, s: 1, type: "team", player: "", num: "", rows: [{ value: "64%", label: "Possession" }, { value: "2.31", label: "xG" }, { value: "612", label: "Passes" }] },
      pitch(650, 90, 870, "full", marks, { ms: 1.15 }),
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
    return { v: 2, format: "1:1", mode: "night", story: null, glow: true, seal: "bl", blocks: [
      pitch(-150, 540, 1900, "half", marks, { look: "stadium", crest: false, ms: 1.45 }),
      text(80, 80, 1440, "Match report · Barcelona 2–0 Athletic", "label", 18, "center", "#ffffff"),
      text(80, 118, 1440, "THE NIGHT YAMAL", "title", 168, "center", "#ffffff"),
      text(80, 280, 1440, "OWNED THE RIGHT", "title", 168, "center", "story"),
      text(80, 1410, 980, "Pedri's switch found Yamal 1v1 eleven times. Athletic never doubled up.", "text", 27, "left", "#ffffff"),
      slot(1170, 860, 360, 640),
    ] }
  }
  if (id === "blank") return { v: 2, format: "1:1", mode: "night", story: null, glow: false, seal: "br", blocks: [text(80, 90, 1440, "YOUR HEADLINE", "title", 120)] }
  // the default: one idea up close
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
  return { v: 2, format: "1:1", mode: "night", story: null, glow: false, seal: "br", blocks: [
    text(80, 74, 1440, "Match report · Barcelona 2–0 Athletic", "label", 16),
    text(80, 108, 1440, "PEDRI, FREE BETWEEN THE LINES", "title", 108),
    text(80, 238, 1000, "Athletic's midfield jumps to De Jong. That one step leaves a pocket behind it, and Pedri lives there.", "text", 23),
    pitch(80, 370, 1000, "half", marks),
    { id: newId(), kind: "story", x: 1140, y: 380, w: 380, s: 1, title: "The idea", points: ["De Jong drops in and draws the midfield.", "The pocket opens: Pedri gets the ball on the half-turn.", "One pass and Fermín is running at the back four."] },
    slot(1130, 720, 400, 740),
    { id: newId(), kind: "stats", x: 80, y: 1230, w: 1000, s: 1, type: "team", player: "", num: "", rows: [{ value: "94", label: "Pedri passes" }, { value: "17", label: "Between the lines" }, { value: "4", label: "Chances made" }] },
  ] }
}
