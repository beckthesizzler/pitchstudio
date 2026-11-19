import { DEFAULT_TEAMS, SIZES, newId, pitchBox, type Block, type LookId, type Mark, type PitchBlock, type Pt, type Report, type RFormat } from "./model"
import { blockBox } from "./Draw"
import { pass, pitch, pl, slot, text } from "./templates"
import { lum, type Brand } from "../brand/brand"

/* Create your own: a shape, a layout and a look make a real page that already looks good, with an example in every block.
   Its blocks stack: one that grows or shrinks moves the blocks under it (fill.ts reflow), and a new block slots in
   between two others instead of landing on top of them (stackPlace). "Place freely" turns the stacking off. */

export type LayoutId = "pitch" | "points" | "two" | "player" | "timeline" | "free"
export const LAYOUTS: { id: LayoutId; name: string; note: string }[] = [
  { id: "pitch", name: "Big pitch", note: "A headline, the pitch, one line" },
  { id: "points", name: "Pitch and points", note: "The move and what it means" },
  { id: "two", name: "Two pitches", note: "Before and after, this or that" },
  { id: "player", name: "Player focus", note: "One player: number, points, photo" },
  { id: "timeline", name: "Timeline", note: "How the game turned" },
  { id: "free", name: "Free page", note: "A headline and every tool" },
]
export const SHAPE_OPTS: { id: RFormat; name: string }[] = [{ id: "4:5", name: "X post" }, { id: "1:1", name: "Square" }, { id: "16:9", name: "Thread" }, { id: "9:16", name: "Story" }]
export const LOOKS: { id: LookId; name: string; note: string }[] = [
  { id: "night", name: "Night", note: "Dark, bold" }, { id: "paper", name: "Paper", note: "Warm, editorial" }, { id: "club", name: "Club", note: "Your colours" },
  { id: "journal", name: "Journal", note: "Handwritten" }, { id: "poster", name: "Poster", note: "Pitch, floodlit" }, { id: "mono", name: "Mono", note: "Black and white" },
]

/** What a Look sets on the page. Club takes your Creator Card's colours, and keeps the words readable on them. */
export function lookPage(id: LookId, brand: Brand): Pick<Report, "mode" | "paper" | "story" | "glow" | "paperStyle"> {
  switch (id) {
    case "night": return { mode: "night", paper: null, story: null, glow: false, paperStyle: "plain" }
    case "paper": return { mode: "bright", paper: "#f1eee6", story: null, glow: false, paperStyle: "plain" }
    case "journal": return { mode: "bright", paper: "#f5ecd2", story: "#1d3a6b", glow: false, paperStyle: "lined" }
    case "poster": return { mode: "night", paper: "#0b1a12", story: null, glow: true, paperStyle: "plain" }
    case "mono": return { mode: "bright", paper: "#f4f4f2", story: "#111111", glow: false, paperStyle: "plain" }
    case "club": {
      const c1 = brand.color, light = lum(c1) > 0.4
      let c2 = brand.color2 ?? (light ? "#111111" : "#f2c230")
      if (Math.abs(lum(c2) - lum(c1)) < 0.18) c2 = light ? "#111111" : "#ffffff"
      return { mode: light ? "bright" : "night", paper: c1, story: c2, glow: false, paperStyle: "plain" }
    }
  }
}

/** A Look over the whole page: its colours, Journal's handwriting on every text, Poster's grass on every flat pitch.
 *  Leaving Journal or Poster takes back only what they put on. */
export function applyLook(r: Report, id: LookId, brand: Brand): Report {
  const prev = r.look ?? null
  const blocks = r.blocks.map((b): Block => {
    if (b.kind === "text") return { ...b, font: id === "journal" ? "hand" : prev === "journal" ? "sans" : b.font }
    if (b.kind === "pitch" && b.look !== "stadium") return { ...b, look: id === "poster" ? "grass" : prev === "poster" && b.look === "grass" ? "flat" : b.look }
    return b
  })
  return { ...r, ...lookPage(id, brand), blocks, look: id }
}

const halfToFull = (p: Pt): Pt => [p[0], p[1] * 0.5]
/** The example on a pitch: three of yours, a pass and a run into a zone, three of theirs */
function example(view: "half" | "full"): Mark[] {
  const at = (p: Pt) => (view === "full" ? halfToFull(p) : p)
  return [
    { id: newId(), kind: "zone", p: at([0.5, 0.46]), r: view === "full" ? [0.12, 0.04] : [0.12, 0.08], oval: false, hi: true, label: "" },
    pass(at([0.3, 0.84]), at([0.49, 0.52]), 2, true), pass(at([0.51, 0.48]), at([0.72, 0.3]), 2, true, { run: true }),
    pl(0, at([0.3, 0.86]), "8", "", true), pl(0, at([0.5, 0.5]), "10", "", true), pl(0, at([0.74, 0.28]), "9", "", true),
    pl(1, at([0.38, 0.3]), "", "", false), pl(1, at([0.62, 0.4]), "", "", false), pl(1, at([0.24, 0.52]), "", "", false),
  ]
}
/** How far a flat pitch's goals stick out past its box, above and below (a goal is 2.2 m deep on a pitch 68 m across) */
const NET = 2.4 / 68
const nets = (b: Block): [number, number] => b.kind !== "pitch" || b.look === "stadium" || b.dir === "right" ? [0, 0] : b.view === "full" ? [NET * b.w, NET * b.w] : [NET * b.w, 0]
/** A block's room in a stack: its box, and a pitch's goals too, so nothing stacks into the net */
export function stackBox(b: Block) { const q = blockBox(b), [t, d] = nets(b); return { ...q, y: q.y - t, h: q.h + t + d } }
/** A pitch as large as fits a box (left, top, width, height) with its goals, centred across it and standing on its top */
function pitchIn(x: number, y: number, w: number, h: number, view: "half" | "full", dir: "up" | "right"): PitchBlock {
  const base = pitch(0, 0, 1, view, example(view), { dir, teams: DEFAULT_TEAMS(), crest: true })
  const one = pitchBox({ ...base, w: 1 }), [t, d] = nets({ ...base, w: 1 }), pw = Math.max(1, Math.min(w / one.w, h / (one.h + t + d)))
  return { ...base, w: pw, x: x + (w - pw * one.w) / 2, y: y + t * pw }
}
const H_ = (b: Block) => stackBox(b).h
const bot = (b: Block) => { const q = stackBox(b); return q.y + q.h }
const at = <T extends Block>(b: T, y: number, x?: number): T => ({ ...b, y, ...(x === undefined ? {} : { x }) })

/** A Create your own page: the layout in the shape, in the look. Everything is ordinary blocks you can change. */
export function makeOwn(layout: LayoutId, format: RFormat, look: LookId, brand: Brand, handle = ""): Report {
  const [W, H] = SIZES[format], k = W / 1600, m = 80 * k, cw = W - 2 * m, gap = 34 * k, foot = H - 130 * k
  const wide = W / H > 1.3, narrow = W / H < 0.7
  // every text is measured in the look's own letters (Journal's handwriting is taller), so nothing overlaps once it's on
  const font = look === "journal" ? "hand" as const : "sans" as const
  const tx = (...a: Parameters<typeof text>): Block => ({ ...text(...a), font } as Block)
  let out: Block[] = []
  for (const hs of [1, 0.86, 0.74, 0.62]) {
    const blocks: Block[] = []
    let y = (wide ? 56 : 74) * k
    const put = (b: Block) => { blocks.push(at(b, y)); y += H_(at(b, y)) + gap }
    put(tx(m, 0, cw, `${handle ? "@" + handle.toUpperCase() + " · " : ""}Your match · Competition`, "label", 18 * k))
    put(tx(m, 0, cw, "YOUR HEADLINE", "title", (wide ? 84 : narrow ? 150 : 120) * k * hs, "left", "story"))
    const room = () => foot - y
    const caption = (t: string, w = cw, x = m) => tx(x, 0, w, t, "text", 30 * k)
    const points = (x: number, w: number) => ({ id: newId(), kind: "story" as const, x, y: 0, w, s: k, title: "The points", points: ["Your first point.", "Your second point.", "What it means."] })
    const stats = () => ({ id: newId(), kind: "stats" as const, x: m, y: 0, w: cw, s: k, type: "team" as const, player: "", num: "", rows: [{ value: "62%", label: "Possession" }, { value: "2.4", label: "xG" }, { value: "14", label: "Shots" }] })

    if (layout === "pitch") {
      const c = caption("One line that says what to look at."), ch = H_(c)
      const p = wide ? pitchIn(m, y, cw, room() - ch - gap, "full", "right") : pitchIn(m, y, cw, room() - ch - gap, "half", "up")
      blocks.push(p); y = bot(p) + gap; put(c)
    } else if (layout === "points") {
      put(caption("Say the idea in one or two lines.", wide ? cw * 0.62 : cw))
      if (wide || format === "1:1") {
        const lw = cw * (wide ? 0.56 : 0.62), sx = m + lw + 50 * k, sw = cw - lw - 50 * k
        const p = pitchIn(m, y, lw, room(), "half", "up")
        blocks.push(p, at(points(sx, sw), y)); y = Math.max(bot(p), y + H_(at(points(sx, sw), y))) + gap
      } else {
        const st = points(m, cw), sh = H_(at(st, 0))
        const p = pitchIn(m, y, cw, room() - sh - gap, "half", "up")
        blocks.push(p); y = bot(p) + gap; put(st)
      }
    } else if (layout === "two") {
      const lab = (t: string, x: number, w: number) => tx(x, 0, w, t, "label", 22 * k, "left", "story")
      if (narrow) {
        const lh = H_(lab("1 · BEFORE", m, cw)), chh = H_(caption("What happens first.")), each = (room() - 2 * (lh + chh) - 5 * gap) / 2
        for (const [t, c] of [["1 · BEFORE", "What happens first."], ["2 · AFTER", "What changes."]]) {
          put(lab(t, m, cw)); const p = pitchIn(m, y, cw, each, "half", "up"); blocks.push(p); y = bot(p) + gap; put(caption(c))
        }
      } else {
        const colW = (cw - 40 * k) / 2, y0 = y
        let bottom = y0
        ;[[m, "1 · BEFORE", "What happens first."], [m + colW + 40 * k, "2 · AFTER", "What changes."]].forEach(([x, t, c]) => {
          let yy = y0
          const l = at(lab(t as string, x as number, colW), yy); blocks.push(l); yy += H_(l) + gap * 0.6
          const cap = caption(c as string, colW, x as number), chh = H_(cap)
          const p = pitchIn(x as number, yy, colW, foot - yy - chh - gap, "half", "up"); blocks.push(p); yy = bot(p) + gap * 0.6
          blocks.push(at(cap, yy)); yy += chh
          bottom = Math.max(bottom, yy)
        })
        y = bottom + gap
      }
    } else if (layout === "player") {
      const num = tx(m, 0, cw, "8", "title", 250 * k, "left", "story"), name = tx(m, 0, cw, "PLAYER", "title", 74 * k)
      if (wide) {
        const a = cw * 0.26, b = cw * 0.36, c = cw - a - b - 80 * k, y0 = y
        const n1 = at({ ...num, w: a }, y0), n2 = at({ ...name, w: a }, y0 + H_(n1))
        const st = at(points(m + a + 40 * k, b), y0)
        blocks.push(n1, n2, st, at(slot(m + a + b + 80 * k, 0, c, Math.min(room(), c * 1.2)) as Block, y0))
        y = y0 + Math.max(H_(n1) + H_(n2), H_(st), Math.min(room(), c * 1.2)) + gap
      } else if (narrow) {
        put(num); put(name)
        const st = points(m, cw), sh = H_(at(st, 0)), ph = Math.min(cw * 0.8, room() - sh - gap)
        put(slot(m, 0, cw, Math.max(120 * k, ph))); put(st)
      } else {
        const L = cw * 0.42, y0 = y
        const n1 = at({ ...num, w: L }, y0), n2 = at({ ...name, w: L }, y0 + H_(n1)), st = at(points(m, L), y0 + H_(n1) + H_(n2) + gap * 0.5)
        const leftBottom = st.y + H_(st), sx = m + L + 40 * k, sw = cw - L - 40 * k
        const sh = Math.min(leftBottom - y0, sw * 1.3)
        blocks.push(n1, n2, st, at(slot(sx, 0, sw, sh) as Block, y0))
        y = Math.max(leftBottom, y0 + sh) + gap
        const s = stats()
        if (y + H_(at(s, y)) <= foot) put(s)
      }
    } else if (layout === "timeline") {
      put({ id: newId(), kind: "timeline", x: m, y: 0, w: cw, s: k, events: [{ min: 7, label: "Your moment", kind: "goal" }, { min: 55, label: "The turn", kind: "sub" }] })
      const c = caption("What the game looked like after it."), ch = H_(c)
      const p = wide ? pitchIn(m, y, cw, room() - ch - gap, "full", "right") : pitchIn(m, y, cw, room() - ch - gap, "half", "up")
      blocks.push(p); y = bot(p) + gap; put(c)
    }
    out = blocks
    const bottom = Math.max(...blocks.map(bot))
    if (bottom <= foot + 1) break
  }
  const r: Report = { v: 2, format, mode: "night", paper: null, story: null, glow: false, seal: "br", blocks: out, stack: true, look: null }
  return applyLook(r, look, brand)
}

/** Where a new block goes in a stacking page: dropped at a height, it takes the place of the block nearest there (that
 *  block and everything under it in its column move down to make room); with no height, it goes after the last block. */
export function stackPlace(r: Report, b: Block, dropY: number | null): { y: number; line: number; push: number; col: (x: Block) => boolean; top: number } {
  const [W] = SIZES[r.format], k = W / 1600, gap = 34 * k, B = stackBox(b)
  const col = (x: Block) => { const X = stackBox(x), o = Math.min(X.x + X.w, B.x + B.w) - Math.max(X.x, B.x); return o > Math.min(X.w, B.w) * 0.6 }
  const inCol = r.blocks.filter(col).map(x => stackBox(x)).sort((a, c) => a.y - c.y)
  const end = inCol.length ? Math.max(...inCol.map(X => X.y + X.h)) + gap : 74 * k
  const spots = [...inCol.map(X => X.y), end]
  const y = dropY === null ? end : spots.reduce((best, s) => (Math.abs(s - dropY) < Math.abs(best - dropY) ? s : best), end)
  // y is the top of the new block's room: its own box starts lower by its goal, if it's a pitch
  return { y: y + (blockBox(b).y - B.y), line: y - gap / 2, push: y < end ? B.h + gap : 0, col, top: y }
}
