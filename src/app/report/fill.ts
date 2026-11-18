import { applyLineup, formationOf, placeFormation } from "./team"
import { blockBox } from "./Draw"
import { newId, type Block, type CardsBlock, type Fill, type FormationFill, type GameFill, type IdeaBlock, type JournalFill, type LinesBlock, type Mark, type PitchBlock, type Player, type Pt, type Report, type ShapeBlock, type TLEvent, type TLKind, type TextBlock } from "./model"

/* Filling a template: the form's answers are written onto the blocks that carry a slot. Only the words and the data change,
   never where a block sits, how big it is or how it looks. A block edited by hand in Design is locked, and left alone. */

const BLANK = "____"
const or = (t: string, d = BLANK) => (t.trim() ? t : d)
/** Names compared loosely: case and accents don't matter */
export const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

/* ── the game state, typed as "7 Yamal goal", "HT Rodri off", "64 Raphinha" ── */
const KIND_WORDS: [RegExp, TLKind][] = [[/\bgoal\b/i, "goal"], [/\bred( card)?\b/i, "red"], [/\binjur(y|ed)\b/i, "injury"], [/\b(sub|off|on)\b/i, "sub"]]
export function parseEvent(text: string): TLEvent | null {
  const t = text.trim()
  const m = /^(ht|[0-9]{1,3})(\+[0-9]{1,2})?'?\s*(.*)$/i.exec(t)
  if (!m) return null
  const min = m[1].toLowerCase() === "ht" ? 45 : Math.min(120, parseInt(m[1], 10) + (m[2] ? parseInt(m[2].slice(1), 10) : 0))
  const rest = m[3].trim()
  const kind = KIND_WORDS.find(([re]) => re.test(rest))?.[1] ?? "other"
  const label = rest.replace(/\bgoal\b/i, "").replace(/\s{2,}/g, " ").trim().slice(0, 40)
  return { min, label, kind }
}
export const eventText = (e: TLEvent) => `${e.min === 45 && e.kind === "sub" ? "HT" : e.min + "'"} ${e.label}${e.kind === "goal" ? " · goal" : e.kind === "red" ? " · red" : e.kind === "injury" ? " · injury" : ""}`.trim()

/* ── the pitch: our eleven in the formation's spots, named, with their roles and the Point of Difference ── */
function fillTeam(b: PitchBlock, shape: string, names: string[], roleOf: (name: string) => string | null, ring: string): PitchBlock {
  if (!formationOf(shape)) return b
  const T = b.teams[0], prev = T.formation && formationOf(T.formation) ? { name: T.formation, shape: T.shape } : null
  let marks = placeFormation(b.marks, 0, shape, "base", b.view, prev)
  // a team with more than eleven (hand-added extras) keeps them where they are; names go to the eleven in their spots
  marks = applyLineup(marks, 0, names.map(name => ({ name })), shape, "base", b.view)
  const rn = norm(ring)
  marks = marks.map(m => (m.kind === "player" && m.team === 0 ? { ...m, hi: true, role: roleOf(m.name), ring: !!rn && norm(m.name).split(" / ")[0] === rn } : m))
  return { ...b, marks, teams: [{ ...T, formation: shape, shape: "base" }, b.teams[1]] }
}
/** A pin for each situation: next to the first player of ours its words name, or in a clear spot, never on a player */
function placePins(b: PitchBlock, texts: string[]): PitchBlock {
  const players = b.marks.filter((m): m is Player => m.kind === "player")
  const ours = players.filter(m => m.team === 0 && m.name)
  const taken: Pt[] = players.map(m => m.p)
  const pins: Mark[] = []
  const clear = (q: Pt) => taken.every(t => Math.hypot(t[0] - q[0], (t[1] - q[1]) * 1.4) > 0.07)
  texts.forEach((text, i) => {
    const words = norm(text)
    const who = ours.find(m => { const n = norm(m.name).split(" / ")[0]; return n.length > 1 && new RegExp("\\b" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(words) })
    let at: Pt | null = null
    if (who) for (const [du, dv] of [[0.08, -0.04], [-0.08, -0.04], [0.08, 0.04], [-0.08, 0.04], [0, -0.07], [0, 0.07]]) {
      const q: Pt = [Math.min(0.95, Math.max(0.05, who.p[0] + du)), Math.min(0.97, Math.max(0.03, who.p[1] + dv))]
      if (clear(q)) { at = q; break }
    }
    if (!at) for (let k = 0; k < 200 && !at; k++) { const q: Pt = [0.12 + ((k * 37) % 77) / 100, 0.08 + ((k * 53) % 84) / 100]; if (clear(q)) at = q }
    const p = at ?? [0.1, 0.1 + i * 0.08]
    taken.push(p)
    pins.push({ id: newId(), kind: "pin", p, n: String(i + 1) })
  })
  return { ...b, marks: [...b.marks.filter(m => m.kind !== "pin"), ...pins] }
}

/* ── each template's answers, onto its slots ── */
type Writer = (b: Block) => Block
const text = (t: string): Writer => b => (b.kind === "text" ? { ...b, text: t } : b)
function gameWriters(f: GameFill, r: Report): Record<string, Writer> {
  const keys = new Set(f.keys.map(norm).filter(Boolean)), roles = new Set((r.roles ?? []).map(x => x.id))
  const roleOf = (name: string) => { if (!name) return roles.has("rest") ? "rest" : null; return keys.has(norm(name)) ? (roles.has("key") ? "key" : null) : roles.has("rest") ? "rest" : null }
  const sits = f.situations.filter(x => x.tag.trim() || x.text.trim())
  const pinned = sits.filter(x => !/^game state/i.test(x.tag.trim()))
  return {
    meta: text(f.meta), score: text([f.home, f.score, f.away].map(x => x.trim()).filter(Boolean).join(" ")), headline: text(f.headline),
    timeline: b => (b.kind === "timeline" ? { ...b, events: f.events.slice(0, 12) } : b),
    pitch: b => (b.kind === "pitch" ? placePins(fillTeam(b, f.shape, f.lineup, roleOf, f.pod), pinned.map(x => `${x.tag} ${x.text}`)) : b),
    idea: b => {
      if (b.kind !== "idea") return b
      const bodies = [f.onball, f.offball, f.pattern], sections = b.sections.map((q, i) => (i < 3 ? { ...q, body: bodies[i] } : q))
      return { ...b, sections, situations: sits.map(x => ({ tag: x.tag, text: x.text, pin: !/^game state/i.test(x.tag.trim()) })), pod: f.pod, podLine: f.podWhy }
    },
    dial: b => (b.kind === "dial" ? { ...b, value: f.dial, line: f.dialWhy } : b),
    report: text(f.report),
  }
}
function formationWriters(f: FormationFill, r: Report): Record<string, Writer> {
  const roles = new Set((r.roles ?? []).map(x => x.id))
  const names = f.lineup.map((n, i) => (n.trim() && f.alt[i]?.trim() ? `${n.trim()} / ${f.alt[i].trim()}` : n.trim()))
  const roleOf = (name: string) => { const id = f.roles[name.split(" / ")[0]] ?? null; return id && roles.has(id) ? id : null }
  return {
    title: text(f.title), shapes: text(`${f.shapeA} → ${f.shapeB}`), note: text(f.note),
    pitchA: b => (b.kind === "pitch" ? fillTeam(b, f.shapeA, names, roleOf, "") : b),
    pitchB: b => (b.kind === "pitch" ? fillTeam(b, f.shapeB, names, roleOf, "") : b),
    labelA: text(f.shapeA), labelB: text(f.shapeB),
  }
}
function journalWriters(f: JournalFill): Record<string, Writer> {
  const lines = (list: string[], n: number): Writer => b => (b.kind === "lines" ? { ...b, lines: Array.from({ length: Math.max(n, list.length) }, (_, i) => or(list[i] ?? "")) } : b)
  const shape = (label: string): Writer => b => (b.kind === "shape" ? { ...b, label } : b)
  const [home, score, away] = [or(f.home), or(f.score, "_–_"), or(f.away)]
  const out: Record<string, Writer> = {
    home: text(home), away: text("v " + away), meta: text(or(f.meta)), date: text(or(f.date)), xilabel: text(`Our XI ${f.shape}`),
    xi: b => (b.kind === "cards" ? { ...b, cards: f.xi.map((x, i) => ({ no: x.no, name: x.name, pos: x.pos, tag: b.cards[i]?.tag ?? "", line: b.cards[i]?.line ?? "G __  A __" })), extra: f.bench.trim() ? "+ " + f.bench.trim().slice(0, 28) : "+ bench" } : b),
    danger: lines(f.danger.map(d => (d.name.trim() ? `${d.name.trim()}: ${d.note.trim()}` : "")), 4), watching: lines(f.watching, 3),
    shome: text(home), score: text(score), saway: text(away), goals: lines(f.goals, 4), subs: lines(f.subs, 3),
    yellows: text(or(f.yellows)), reds: text(or(f.reds)), numbers: lines(f.numbers, 3), officials: lines([f.officials], 1),
    pod: text(or(f.pod)), dial: b => (b.kind === "dial" ? { ...b, value: f.dial } : b), verdict: lines(f.verdict, 2),
  }
  f.last5.forEach((x, i) => { out["r" + (i + 1)] = shape(x) })
  return out
}

/** Writes the answers onto every slot block that isn't locked. A block that grows (the idea) pushes the blocks under it down. */
export function applyFill(r: Report, f: Fill, push = true): Report {
  const writers = f.template === "game" ? gameWriters(f, r) : f.template === "formation" ? formationWriters(f, r) : journalWriters(f)
  const blocks = r.blocks.map(b => (b.slot && !b.locked && writers[b.slot] ? writers[b.slot](b) : b))
  return push ? reflow({ ...r, blocks, fill: f }, r) : { ...r, blocks, fill: f }
}

/** When a growing block (the idea, a list of lines, the cards) gets taller or shorter, the blocks under it in the same column move by as much.
 *  "The same column": a block mostly within the grown block's width (a full-width block under two columns stays put). */
export function reflow(after: Report, before: Report): Report {
  let blocks = after.blocks
  for (const a of after.blocks) {
    if (a.kind !== "idea" && a.kind !== "lines" && a.kind !== "cards") continue
    const b = before.blocks.find(x => x.id === a.id)
    if (!b || b.x !== a.x || b.y !== a.y || b.kind !== a.kind) continue
    const A = blockBox(a), B = blockBox(b), dh = A.h - B.h
    if (Math.abs(dh) < 0.5) continue
    const bottom = B.y + B.h
    blocks = blocks.map(x => {
      if (x.id === a.id) return x
      const X = blockBox(x)
      const overlap = Math.min(X.x + X.w, A.x + A.w) - Math.max(X.x, A.x)
      return X.y >= bottom - 1 && overlap > X.w * 0.6 ? { ...x, y: x.y + dh } : x
    })
  }
  return blocks === after.blocks ? after : { ...after, blocks }
}

/** What a slot block says, apart from where it sits and how it looks: a change here, made in Design, locks it */
const LOOKS = new Set(["id", "x", "y", "w", "h", "s", "size", "rot", "align", "color", "plate", "style", "fit", "under", "font", "slot", "locked", "look", "dir", "view", "ms", "crest", "legend", "cols", "ink", "stroke", "fill", "c2", "pat", "dash", "shape", "nw", "nh", "ix", "iy", "iw", "edge", "border", "shadow", "flip", "opacity"])
const content = (b: Block) => JSON.stringify(Object.entries(b).filter(([k]) => !LOOKS.has(k)).map(([k, v]) => (k === "marks" ? [k, (v as Mark[]).map(m => ({ ...m, id: "" }))] : [k, v])))
/** Locks every slot block whose words or marks were changed by hand (Design), so the form leaves it alone from now on */
export function lockEdited(after: Report, before: Report): Report {
  if (!after.fill) return after
  let changed = false
  const blocks = after.blocks.map(b => {
    if (!b.slot || b.locked) return b
    const o = before.blocks.find(x => x.id === b.id)
    if (!o || content(o) === content(b)) return b
    changed = true
    return { ...b, locked: true }
  })
  return changed ? { ...after, blocks } : after
}
/** The slot blocks of each form section: a section shows "Edited in Design" when one of them is locked */
export const SECTION_SLOTS: Record<string, string[]> = {
  match: ["meta", "score"], headline: ["headline"], state: ["timeline"], shape: ["pitch"], idea: ["idea"], situations: ["idea", "pitch"], balance: ["dial"], report: ["report"],
  ftitle: ["title"], fshapes: ["shapes", "pitchA", "pitchB", "labelA", "labelB"], fnames: ["pitchA", "pitchB"], fnote: ["note"],
  jbefore: ["home", "away", "meta", "date", "r1", "r2", "r3", "r4", "r5"], jxi: ["xi", "xilabel"], jdanger: ["danger", "watching"], jscore: ["shome", "score", "saway", "goals", "subs"],
  jcards: ["yellows", "reds", "numbers", "officials"], jverdict: ["pod", "dial", "verdict"],
}
export const lockedIn = (r: Report, section: string) => r.blocks.some(b => b.slot && b.locked && (SECTION_SLOTS[section] ?? []).includes(b.slot))
/** Unlock: the section's blocks go back under the form, and take its answers again */
export function unlock(r: Report, section: string): Report {
  const slots = new Set(SECTION_SLOTS[section] ?? [])
  const open = { ...r, blocks: r.blocks.map(b => (b.slot && slots.has(b.slot) ? { ...b, locked: false } : b)) }
  return r.fill ? applyFill(open, r.fill) : open
}

/** Which of a form's sections have an answer, in the form's order */
export function filledList(f: Fill): boolean[] {
  if (f.template === "game") return [f.home || f.away || f.score || f.meta, f.headline, f.events.length, f.lineup.some(Boolean), f.onball || f.offball || f.pattern, f.situations.some(x => x.text), f.dial !== 0 || f.dialWhy, f.report].map(Boolean)
  if (f.template === "formation") return [f.title, f.shapeA && f.shapeB, f.lineup.some(Boolean), f.note].map(Boolean)
  return [f.home || f.away, f.xi.some(x => x.name), f.danger.some(d => d.name) || f.watching.some(Boolean), f.score || f.goals.some(Boolean), f.yellows || f.reds || f.numbers.some(Boolean), f.pod || f.verdict.some(Boolean)].map(Boolean)
}

/** How many of a form's sections have an answer */
export function filledCount(f: Fill): [number, number] {
  if (f.template === "game") {
    const done = [f.home || f.away || f.score || f.meta, f.headline, f.events.length, f.lineup.some(Boolean), f.onball || f.offball || f.pattern, f.situations.some(x => x.text), f.dial !== 0 || f.dialWhy, f.report].filter(Boolean).length
    return [done, 8]
  }
  if (f.template === "formation") return [[f.title, f.shapeA && f.shapeB, f.lineup.some(Boolean), f.note].filter(Boolean).length, 4]
  return [[f.home || f.away, f.xi.some(x => x.name), f.danger.some(d => d.name) || f.watching.some(Boolean), f.score || f.goals.some(Boolean), f.yellows || f.reds || f.numbers.some(Boolean), f.pod || f.verdict.some(Boolean)].filter(Boolean).length, 6]
}

/** A Game Report's answers from a journal: the teams, the score, goals and subs as events, the Point of Difference, the verdict */
export function journalToGame(j: JournalFill, base: GameFill): GameFill {
  const events = [...j.goals, ...j.subs].map(x => x.trim()).filter(x => x && x !== BLANK).map(x => parseEvent(/goal|sub|off|on|red/i.test(x) ? x : x + " goal")).filter((e): e is TLEvent => !!e)
  return { ...base, home: j.home, away: j.away, score: j.score, meta: j.meta, headline: "", events: events.slice(0, 12), pod: j.pod, dial: j.dial, report: j.verdict.filter(Boolean).join(" ") }
}
export const BLANK_TEXT = BLANK
export type { CardsBlock, IdeaBlock, LinesBlock, ShapeBlock, TextBlock }
