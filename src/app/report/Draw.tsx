import { useEffect, useId, useState, type ReactNode, type RefObject } from "react"
import { Glyph } from "../brand/crests"
import { CreatorSeal } from "../brand/Signature"
import { cardColours, inkFor, lum, shade, type Brand } from "../brand/brand"
import {
  MODES, SIZES, ctrlFor, markUnit, pitchBox, projector, type Block, type Mark, type Pass, type PhotoBlock, type PitchBlock, type Player,
  type KitPat, type Pt, type Report, type StatsBlock, type StoryBlock, type TextBlock, type Zone,
  type SeriesBlock, type TimelineBlock, type IdeaBlock, type DialBlock, type CardsBlock, type LinesBlock, type SpineBlock, type ShapeBlock,
} from "./model"

/* How a report is drawn: one svg, the same in the editor, in the export and in the list of reports.
   k is the report's width over 1600, so lines and type keep their weight at every format. */

const COND = "'Barlow Condensed', 'Inter', sans-serif"
const ANTON = "'Anton', 'Barlow Condensed', sans-serif"
const HANDF = "'Kalam', 'Comic Sans MS', cursive"
const MONO = "'JetBrains Mono', ui-monospace, monospace"
const SANS = "'Inter', sans-serif"
const NL = String.fromCharCode(10)
const clean = (s: string) => s.split("").filter(ch => /[a-zA-Z0-9]/.test(ch)).join("")

/* ── measuring text with the real fonts, so lines wrap where they are drawn ── */
let ctx2d: CanvasRenderingContext2D | null = null
const widths = new Map<string, number>()
export function textWidth(text: string, font: string, spacing = 0) {
  const key = font + "|" + spacing + "|" + text
  const hit = widths.get(key)
  if (hit !== undefined) return hit
  if (!ctx2d) ctx2d = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null
  if (!ctx2d) return text.length * 10
  ctx2d.font = font
  const w = ctx2d.measureText(text).width + spacing * text.length
  if (widths.size > 4000) widths.clear()
  widths.set(key, w)
  return w
}
export function wrap(text: string, font: string, max: number, spacing = 0): string[] {
  const out: string[] = []
  for (const para of text.split(NL)) {
    const words = para.split(" ").filter(w => w.length > 0)
    if (!words.length) { out.push(""); continue }
    let line = words[0]
    for (const w of words.slice(1)) {
      if (textWidth(line + " " + w, font, spacing) <= max) line += " " + w
      else { out.push(line); line = w }
    }
    out.push(line)
  }
  return out
}
/** Draws again once the fonts have arrived (measured text must be measured with them) */
export function useFontsReady() {
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    const bump = () => { if (live) { widths.clear(); setN(v => v + 1) } }
    document.fonts?.ready.then(bump)
    document.fonts?.addEventListener?.("loadingdone", bump)
    return () => { live = false; document.fonts?.removeEventListener?.("loadingdone", bump) }
  }, [])
  return n
}

/* ── the palette: the mode's colours and the story colour ── */
export type Pal = (typeof MODES)["night"] & { story: string; storyInk: string; cased: boolean; bright: boolean
  pa: string; pb: string; pc: string; roles: Map<string, string>; acts: { ours: string; theirs: string } | null; issue: string; handle: string }
export function palette(r: Report, brand: Brand, issue = "", handle = ""): Pal {
  const base = palette0(r, brand), pal = r.palette
  const story = pal ? pal.a : base.story
  return { ...base, story, storyInk: inkFor(story), cased: r.mode === "bright" && lum(story) > 0.45,
    pa: pal?.a ?? story, pb: pal?.b ?? base.muted, pc: pal?.c ?? "#e9b949", roles: new Map((r.roles ?? []).map(x => [x.id, x.color])), acts: r.actions ?? null, issue, handle }
}
function palette0(r: Report, brand: Brand) {
  // your own colour tells the story; on the bright page a pale one (like studio lime), yours or picked, gives way to the editorial crimson,
  // which reads on paper: no highlighter band behind the words, ever
  const pick = r.story ?? cardColours(brand).disc, m = MODES[r.mode], story = r.mode === "bright" && lum(pick) > 0.45 ? "#b3123f" : pick
  // a page colour that fights its mode (a dark paper in Bright, say) is ignored, so the words always read
  const bg = r.paper && (r.mode === "bright" ? lum(r.paper) > 0.6 : lum(r.paper) < 0.2) ? r.paper : m.bg
  return { ...m, bg, story, bright: r.mode === "bright" }
}
/** A kit as a circle at (x, y): the main colour, with the second laid over it in the kit's pattern */
export function KitFill({ id, x = 0, y = 0, r, pat, c1, c2 }: { id: string; x?: number; y?: number; r: number; pat: KitPat; c1: string; c2: string }) {
  const w = (2 * r) / 5
  return (
    <g transform={`translate(${x} ${y})`}>
      <clipPath id={id}><circle r={r} /></clipPath>
      <circle r={r} fill={c1} />
      {pat !== "solid" && (
        <g clipPath={`url(#${id})`} fill={c2}>
          {pat === "stripes" && <><rect x={-r + w} y={-r} width={w} height={2 * r} /><rect x={-r + 3 * w} y={-r} width={w} height={2 * r} /></>}
          {pat === "hoops" && <><rect x={-r} y={-r + w} width={2 * r} height={w} /><rect x={-r} y={-r + 3 * w} width={2 * r} height={w} /></>}
          {pat === "halves" && <rect x={0} y={-r} width={r} height={2 * r} />}
          {pat === "sash" && <rect x={-1.5 * r} y={-r * 0.3} width={3 * r} height={r * 0.6} transform="rotate(45)" />}
          {pat === "band" && <rect x={-r} y={-r * 0.3} width={2 * r} height={r * 0.6} />}
          {pat === "sleeves" && <><rect x={-r} y={-r} width={r * 0.42} height={2 * r} /><rect x={r * 0.58} y={-r} width={r * 0.42} height={2 * r} /></>}
        </g>
      )}
    </g>
  )
}
const colourOf = (c: string, p: Pal) => (c === "ink" ? p.ink : c === "story" ? p.story : c === "muted" ? p.muted : c === "a" ? p.pa : c === "b" ? p.pb : c === "c" ? p.pc : c)
/** The series line's words: @HANDLE becomes your handle, {n} the issue number */
export const seriesText = (t: string, p: Pick<Pal, "issue" | "handle">) => t.replace(/@HANDLE/g, p.handle ? "@" + p.handle : "@YOU").replace(/[{]n[}]/g, p.issue || "—").toUpperCase()

/* ── text ── */
export const TEXT_STYLES = {
  title: { weight: 800, family: "Barlow Condensed", css: COND, lh: 0.96, upper: false, sp: 0.004 },
  text: { weight: 400, family: "Inter", css: SANS, lh: 1.42, upper: false, sp: 0 },
  label: { weight: 600, family: "Inter", css: SANS, lh: 1.32, upper: true, sp: 0.14 },
}
/** A text block's look: its style, written by hand (Kalam) when its font says so */
export function styleOf(t: TextBlock) {
  const st = TEXT_STYLES[t.style]
  return t.font === "hand" ? { weight: t.style === "text" ? 400 : 700, family: "Kalam", css: HANDF, lh: t.style === "title" ? 1.05 : 1.3, upper: st.upper, sp: t.style === "label" ? 0.06 : 0 } : st
}
/** The size a fitted line is drawn at: as set, or smaller until the line fits the width */
export function fitSize(t: TextBlock) {
  if (!t.fit) return t.size
  const st = styleOf(t), line = (st.upper ? t.text.toUpperCase() : t.text).split(NL).join(" ")
  const at = (sz: number) => textWidth(line, `${st.weight} ${sz}px "${st.family}"`, sz * st.sp)
  const w = at(t.size)
  return w <= t.w || w <= 0 ? t.size : Math.max(8, Math.floor(t.size * (t.w / w) * 100) / 100)
}
export function textLines(t: TextBlock) {
  const st = styleOf(t), size = fitSize(t), words = st.upper ? t.text.toUpperCase() : t.text
  if (t.fit) return [words.split(NL).join(" ")]
  return wrap(words, `${st.weight} ${size}px "${st.family}"`, t.w, size * st.sp)
}
const ruleH = (t: TextBlock) => (t.under === "thin" ? 12 + 1 : t.under === "thick" ? 12 + 4 : 0) * (t.size / Math.max(1, t.size))
export const textHeight = (t: TextBlock) => Math.max(1, textLines(t).length) * fitSize(t) * styleOf(t).lh + ruleH(t)
function TextView({ t: t0, p }: { t: TextBlock; p: Pal }) {
  const t = { ...t0, size: fitSize(t0) }
  const st = styleOf(t), lines = textLines(t0), lh = t.size * st.lh, font = `${st.weight} ${t.size}px "${st.family}"`
  const ax = t.align === "center" ? t.x + t.w / 2 : t.align === "right" ? t.x + t.w : t.x
  // a plate: a bar of colour hugging each line. Words too dark for a dark plate turn white.
  const plate = t.plate ? (t.plate === "dark" ? p.plate : t.plate === "story" ? p.story : t.plate) : null
  let fill = colourOf(t.color, p)
  if (plate && lum(fill) < 0.18 && lum(plate) < 0.18) fill = "#ffffff"
  // the story colour on the bright page: the words in ink on a band of the colour, like a highlighter
  const marker = !plate && t.color === "story" && p.cased
  const h = textHeight(t0), cx = t.x + t.w / 2, cy = t.y + h / 2, title = t.style === "title", ruleY = t.y + lines.length * lh + 12
  const spans = (o: { top: number; bottom: number; padX: number }, col: string, tag: string) => lines.map((l, i) => {
    if (!l.trim()) return null
    const lw = textWidth(l, font, t.size * st.sp), x0 = t.align === "center" ? ax - lw / 2 : t.align === "right" ? ax - lw : ax, base = t.y + t.size * 0.88 + i * lh
    return <rect key={tag + i} x={x0 - o.padX} y={base - o.top} width={lw + 2 * o.padX} height={o.top + o.bottom} fill={col} />
  })
  return (
    <g data-bid={t.id} transform={t.rot ? `rotate(${t.rot} ${cx} ${cy})` : undefined}>
      {marker && lines.map((l, i) => {
        const lw = textWidth(l, font, t.size * st.sp), x0 = t.align === "center" ? ax - lw / 2 : t.align === "right" ? ax - lw : ax
        const base = t.y + t.size * 0.88 + i * lh
        return <rect key={"m" + i} x={x0 - t.size * 0.08} y={base - t.size * (title ? 0.42 : 0.5)} width={lw + t.size * 0.16} height={t.size * (title ? 0.5 : 0.62)} fill={p.story} />
      })}
      {plate && spans(title ? { top: t.size * 0.84, bottom: t.size * 0.12, padX: t.size * 0.18 } : { top: t.size * 0.95, bottom: t.size * 0.25, padX: t.size * 0.3 }, plate, "p")}
      <text x={ax} y={t.y} textAnchor={t.align === "center" ? "middle" : t.align === "right" ? "end" : "start"} fill={marker ? p.ink : fill} fontSize={t.size} fontWeight={st.weight}
        style={{ fontFamily: st.css, letterSpacing: t.size * st.sp }}>
        {lines.map((l, i) => <tspan key={i} x={ax} dy={i === 0 ? t.size * 0.88 : lh}>{l || " "}</tspan>)}
      </text>
      {t.under === "thin" && <rect x={t.x} y={ruleY} width={t.w} height={1} fill={p.ink} fillOpacity={0.2} />}
      {t.under === "thick" && <rect x={t.x} y={ruleY} width={t.w} height={4} fill={p.ink} />}
      <rect x={t.x} y={t.y} width={t.w} height={h} fill="transparent" />
    </g>
  )
}

/* ── the pitch ── */
function arrowHead(tip: Pt, from: Pt, len: number, wid: number) {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d, bx = tip[0] - ux * len, by = tip[1] - uy * len
  return `${tip[0]},${tip[1]} ${bx - uy * wid / 2},${by + ux * wid / 2} ${bx + uy * wid / 2},${by - ux * wid / 2}`
}
export const pathOf = (pts: Pt[], close = false) => pts.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(" ") + (close ? " Z" : "")
/** A pass's path on the ground, in pitch units: straight, or curved through its middle handle */
export function passGround(m: Pass) {
  const c = m.c ? ctrlFor(m.a, m.b, m.c) : null
  return (t: number): Pt => c ? [(1 - t) ** 2 * m.a[0] + 2 * (1 - t) * t * c[0] + t * t * m.b[0], (1 - t) ** 2 * m.a[1] + 2 * (1 - t) * t * c[1] + t * t * m.b[1]]
    : [m.a[0] + (m.b[0] - m.a[0]) * t, m.a[1] + (m.b[1] - m.a[1]) * t]
}

function PitchView({ b, p, k, brand, logo, scope }: { b: PitchBlock; p: Pal; k: number; brand: Brand; logo: string | null; scope: string }) {
  const pr = projector(b), box = pitchBox(b), L = b.view === "full" ? 105 : 52.5, std = b.look === "stadium", turf = b.look === "grass"
  const pu = markUnit(b) // the size of one mark unit here
  const M = (X: number, Y: number): Pt => { const q = pr.fwd(X / 68, Y / L); return [q[0], q[1]] }
  const ring = (cx: number, cy: number, r: number, a0 = 0, a1 = Math.PI * 2, n = 72): Pt[] => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return M(cx + r * Math.cos(a), cy + r * Math.sin(a)) })
  const lineCol = std ? "rgba(255,255,255,0.85)" : turf ? "rgba(255,255,255,0.75)" : p.lines, lw = (std ? 2.6 : 2.4) * k
  const end = (gy: number, dir: 1 | -1) => {
    const y = (m: number) => gy + dir * m, a = Math.atan2(5.5, Math.sqrt(9.15 * 9.15 - 5.5 * 5.5))
    return <g>
      <path d={pathOf([M(13.84, y(0)), M(13.84, y(16.5)), M(54.16, y(16.5)), M(54.16, y(0))])} />
      <path d={pathOf([M(24.84, y(0)), M(24.84, y(5.5)), M(43.16, y(5.5)), M(43.16, y(0))])} />
      <path d={pathOf(ring(34, y(11), 9.15, dir > 0 ? a : Math.PI + a, dir > 0 ? Math.PI - a : 2 * Math.PI - a, 24))} />
      <path d={pathOf([M(30.34, y(0)), M(30.34, y(-2.2)), M(37.66, y(-2.2)), M(37.66, y(0))])} />
      <path d={pathOf(ring(34, y(11), 0.3, 0, Math.PI * 2, 8), true)} fill={lineCol} />
    </g>
  }
  const lines = (
    <g fill="none" stroke={lineCol} strokeWidth={lw} strokeLinejoin="round">
      <path d={pathOf([M(0, 0), M(68, 0), M(68, L), M(0, L)], true)} />
      {end(0, 1)}
      {b.view === "full" ? <>
        <path d={pathOf([M(0, L / 2), M(68, L / 2)])} />
        <path d={pathOf(ring(34, L / 2, 9.15), true)} />
        <path d={pathOf(ring(34, L / 2, 0.3, 0, Math.PI * 2, 8), true)} fill={lineCol} />
        {end(L, -1)}
      </> : <path d={pathOf(ring(34, L, 9.15, Math.PI, 2 * Math.PI, 36))} />}
    </g>
  )
  const gid = "pv" + scope + clean(b.id)
  // the stadium: grass, mowing stripes and floodlight, the near end fading into the page
  const grass = std ? (() => {
    const bands = Math.round(L / 5.25), stripes: ReactNode[] = []
    for (let i = 0; i < bands; i++) if (i % 2) stripes.push(<path key={i} d={pathOf([M(0, i * L / bands), M(68, i * L / bands), M(68, (i + 1) * L / bands), M(0, (i + 1) * L / bands)], true)} fill="#000" fillOpacity={0.07} />)
    const far = pr.fwd(0.5, 0), near = pr.fwd(0.5, 1)
    return <g>
      <defs>
        <linearGradient id={gid + "g"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1f6a3c" /><stop offset="1" stopColor="#2f8a4e" /></linearGradient>
        <radialGradient id={gid + "l"} cx="0.5" cy="0.35" r="0.6"><stop offset="0" stopColor="#ffffff" stopOpacity={0.16} /><stop offset="1" stopColor="#ffffff" stopOpacity={0} /></radialGradient>
      </defs>
      <path d={pathOf([M(-7, -5), M(75, -5), M(75, L + 9), M(-7, L + 9)], true)} fill={`url(#${gid}g)`} />
      {stripes}
      <ellipse cx={far[0]} cy={far[1] + (near[1] - far[1]) * 0.4} rx={b.w * 0.55} ry={(near[1] - far[1]) * 0.7} fill={`url(#${gid}l)`} />
    </g>
  })() : null
  // grass: mowing stripes in two greens, a little beyond the lines
  const lawn = turf ? (() => {
    const bands = Math.round(L / 5.25), out: ReactNode[] = []
    for (let i = 0; i < bands; i++) {
      const y0 = i === 0 ? -3 : i * L / bands, y1 = i === bands - 1 ? L + 3 : (i + 1) * L / bands
      out.push(<path key={i} d={pathOf([M(-3, y0), M(71, y0), M(71, y1), M(-3, y1)], true)} fill={i % 2 ? "#38723F" : "#3E7C46"} />)
    }
    return <g>{out}</g>
  })() : null
  const fade = std ? (() => { const near = pr.fwd(0.5, 1), far = pr.fwd(0.5, 0), d = near[1] - far[1]; return (
    <g style={{ pointerEvents: "none" }}><defs><linearGradient id={gid + "f"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.bg} stopOpacity={0} /><stop offset="0.16" stopColor={p.bg} stopOpacity={0.75} /><stop offset="0.3" stopColor={p.bg} stopOpacity={0.95} /></linearGradient></defs>
      <rect x={b.x - b.w} y={near[1] - d * 0.18} width={b.w * 3} height={d * 0.18 + 1400} fill={`url(#${gid}f)`} /></g>) })() : null

  const P = (q: Pt) => pr.fwd(q[0], q[1])
  const sz = (s: number) => pu * (std ? 0.45 + 0.75 * s : 1) // marks shrink with distance in the stadium
  const t0 = b.teams[0].color ?? p.story
  const roleCol = (pl: Player) => (pl.role ? p.roles.get(pl.role) ?? null : null)
  const teamCol = (pl: Player) => roleCol(pl) ?? (pl.team === 0 ? t0 : b.teams[1].color ?? (pl.hi ? p.ink : p.ring))
  const halo = turf ? "rgba(0,0,0,0.42)" : p.bg, ground = turf ? "#2f6538" : p.bg

  const pass = (m: Pass) => {
    const ground = passGround(m)
    const A = P(m.a), B = P(m.b), span = Math.hypot(B[0] - A[0], B[1] - A[1]), s = (A[2] + B[2]) / 2, u = sz(s)
    const near = (q: Pt) => b.marks.some(x => x.kind === "player" && Math.hypot(x.p[0] - q[0], x.p[1] - q[1]) < 0.012)
    // stop short of a player at either end
    const trim = (26 * u) / Math.max(1, span)
    const t0x = near(m.a) ? Math.min(0.4, trim) : 0, t1x = near(m.b) ? 1 - Math.min(0.4, trim) : 1
    const lift = std && m.air ? span * 0.42 : 0
    const pts: Pt[] = []
    for (let i = 0; i <= 40; i++) { const t = t0x + (t1x - t0x) * i / 40, q = P(ground(t)); pts.push([q[0], q[1] - lift * 4 * t * (1 - t)]) }
    const act = p.acts && (m.team === 0 || m.team === 1) ? (m.team === 0 ? p.acts.ours : p.acts.theirs) : null
    const col = act ?? (m.hi ? p.story : turf ? "rgba(255,255,255,0.7)" : p.ctx), w = [0, 2.6, 4.8, 8][m.weight] * u
    const d = pathOf(pts), tip = pts[pts.length - 1], back = pts[Math.max(0, pts.length - 5)]
    const tail = pts[0], tail2 = pts[4]
    const len = 12 * u + w * 1.7, wid = 10 * u + w * 1.5
    const dash = m.run ? `${12 * u} ${9 * u}` : undefined
    const casing = m.hi && p.cased && !std && !act && !turf
    return (
      <g key={m.id} data-mid={m.id}>
        {lift > 0 && <path d={pathOf(Array.from({ length: 21 }, (_, i) => { const q = P(ground(t0x + (t1x - t0x) * i / 20)); return [q[0], q[1]] as Pt }))} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={Math.max(1.5, w * 0.8)} strokeDasharray={`${3 * u} ${7 * u}`} strokeLinecap="round" />}
        {casing && <path d={d} fill="none" stroke={p.ink} strokeWidth={w + 3 * u} strokeLinecap={m.run ? "butt" : "round"} strokeDasharray={dash} />}
        <path d={d} fill="none" stroke={col} strokeWidth={w} strokeLinecap={m.run ? "butt" : "round"} strokeDasharray={dash} />
        {(m.head === "end" || m.head === "both") && <polygon points={arrowHead(tip, back, len, wid)} fill={col} stroke={casing ? p.ink : "none"} strokeWidth={1.5 * u} strokeLinejoin="round" />}
        {m.head === "both" && <polygon points={arrowHead(tail, tail2, len, wid)} fill={col} stroke={casing ? p.ink : "none"} strokeWidth={1.5 * u} strokeLinejoin="round" />}
        <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(18 * u, w + 12)} />
      </g>
    )
  }
  const zone = (m: Zone) => {
    const pts: Pt[] = []
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const ex = m.oval ? Math.cos(a) : Math.max(-1, Math.min(1, Math.cos(a) * 1.5)), ey = m.oval ? Math.sin(a) : Math.max(-1, Math.min(1, Math.sin(a) * 1.5))
      const q = P([m.p[0] + ex * m.r[0], m.p[1] + ey * m.r[1]]); pts.push([q[0], q[1]])
    }
    const col = m.hi ? p.story : p.ctx, c = P(m.p)
    return (
      <g key={m.id} data-mid={m.id}>
        <path d={pathOf(pts, true)} fill={col} fillOpacity={m.hi ? (p.cased ? 0.32 : 0.12) : 0.1} stroke={m.hi && p.cased ? p.ink : col} strokeOpacity={m.hi && p.cased ? 0.55 : 0.9}
          strokeWidth={2.2 * k} strokeDasharray={`${9 * k} ${7 * k}`} strokeLinejoin="round" />
        {m.label && <text x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="central" fill={m.hi && !p.cased ? p.story : p.ink} fontSize={15 * sz(c[2])} fontWeight={700}
          style={{ fontFamily: SANS, letterSpacing: 15 * sz(c[2]) * 0.08 }}>{m.label.toUpperCase()}</text>}
      </g>
    )
  }
  const player = (m: Player) => {
    const [x, y, s] = P(m.p), u = sz(s), r = 17 * u
    if (roleCol(m) && !std) m = { ...m, hi: true } // a player with a role is drawn in its colour
    // a pale colour as a quiet outline on the bright page would vanish: it is drawn deeper there
    const col = !m.hi && p.bright && lum(teamCol(m)) > 0.45 ? shade(teamCol(m), -0.5) : teamCol(m)
    const fs = (m.hi ? 18 : 15.5) * u
    const T = b.teams[m.team], kitted = T.pat !== "solid", kc = "k" + gid + clean(m.id)
    if (std) {
      const head = 15 * u, hy = y - 44 * u
      const fill = m.hi ? col : m.team === 0 ? "#0b0d10" : "#f2f2ee", ink = m.hi ? inkFor(col) : m.team === 0 ? col : "#0b0d10"
      return (
        <g key={m.id} data-mid={m.id}>
          <ellipse cx={x} cy={y} rx={17 * u} ry={5.5 * u} fill="#000" fillOpacity={0.4} />
          <line x1={x} y1={y} x2={x} y2={hy} stroke={m.hi ? col : "rgba(255,255,255,0.75)"} strokeWidth={3 * u} strokeLinecap="round" />
          {kitted ? <KitFill id={kc} x={x} y={hy} r={head} pat={T.pat} c1={col} c2={T.c2} /> : <circle cx={x} cy={hy} r={head} fill={fill} />}
          <circle cx={x} cy={hy} r={head} fill="none" stroke={m.hi ? "#ffffff" : m.team === 0 ? col : "#0b0d10"} strokeWidth={2.6 * u} />
          {m.num && <text x={x} y={hy + 0.5} textAnchor="middle" dominantBaseline="central" fill={kitted ? T.num ?? inkFor(col) : ink} fontSize={15 * u} fontWeight={700}
            stroke={kitted ? (lum(T.num ?? inkFor(col)) > 0.5 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.75)") : undefined} strokeWidth={kitted ? 3 * u : undefined} paintOrder="stroke" style={{ fontFamily: COND }}>{m.num}</text>}
          <rect x={x - 18 * u} y={hy - head - 4 * u} width={36 * u} height={y - hy + head + 10 * u} fill="transparent" />
        </g>
      )
    }
    const off = r + (kitted && m.hi ? 10 : 6) * u
    const pos = m.side === "below" ? [x, y + off + fs * 0.8, "middle"] : m.side === "above" ? [x, y - off, "middle"] : m.side === "left" ? [x - off, y + fs * 0.35, "end"] : [x + off, y + fs * 0.35, "start"]
    const edge = turf ? "#ffffff" : p.bright ? (lum(col) > 0.45 ? p.ink : p.bg) : p.bg
    const tag = m.tag ? m.tag.toUpperCase() : "", tfs = 11.5 * u, tw = tag ? textWidth(tag, `700 ${tfs}px "Inter"`, tfs * 0.08) + 14 * u : 0
    const nameBottom = m.side === "below" ? (pos[1] as number) + fs * 0.35 : y + off + fs * 0.4
    return (
      <g key={m.id} data-mid={m.id}>
        {kitted ? <>
          {m.hi && <circle cx={x} cy={y} r={r + 5 * u} fill="none" stroke={p.cased ? p.ink : p.story} strokeWidth={3.4 * u} />}
          <circle cx={x} cy={y} r={r + 1.6 * u} fill={p.bright ? "#ffffff" : p.bg} />
          <KitFill id={kc} x={x} y={y} r={r} pat={T.pat} c1={col} c2={T.c2} />
          <circle cx={x} cy={y} r={r} fill="none" stroke={p.bright ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.3)"} strokeWidth={1.4 * u} />
          {m.num && <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={T.num ?? inkFor(col)} fontSize={15 * u} fontWeight={800}
            stroke={lum(T.num ?? inkFor(col)) > 0.5 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.8)"} strokeWidth={3 * u} paintOrder="stroke" strokeLinejoin="round" style={{ fontFamily: COND }}>{m.num}</text>}
        </> : <>
          {m.hi ? <circle cx={x} cy={y} r={r} fill={col} stroke={edge} strokeWidth={(p.bright && lum(col) > 0.45 ? 2 : 3) * u} />
            : <circle cx={x} cy={y} r={r - 1.6 * u} fill={ground} stroke={col} strokeOpacity={m.team === 0 ? 0.6 : 1} strokeWidth={3.2 * u} />}
          {m.num && <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={m.hi ? inkFor(col) : col} fillOpacity={m.hi || m.team === 1 ? 1 : 0.8} fontSize={15 * u} fontWeight={700} style={{ fontFamily: COND }}>{m.num}</text>}
        </>}
        {m.ring && <circle cx={x} cy={y} r={r + 6 * u} fill="none" stroke={p.pc} strokeWidth={4 * u} />}
        {m.name && <text x={pos[0] as number} y={pos[1] as number} textAnchor={pos[2] as "middle"} fill={turf ? "#ffffff" : m.hi ? p.ink : p.muted} fontSize={fs} fontWeight={m.hi ? 700 : 600}
          stroke={halo} strokeWidth={5 * u} paintOrder="stroke" strokeLinejoin="round" style={{ fontFamily: SANS }}>{m.name}</text>}
        {tag && <g>
          <rect x={x - tw / 2} y={nameBottom + 4 * u} width={tw} height={tfs * 1.55} rx={tfs * 0.78} fill={p.pc} />
          <text x={x} y={nameBottom + 4 * u + tfs * 0.78} textAnchor="middle" dominantBaseline="central" fill={inkFor(p.pc)} fontSize={tfs} fontWeight={700} style={{ fontFamily: SANS, letterSpacing: tfs * 0.08 }}>{tag}</text>
        </g>}
      </g>
    )
  }
  // from the stand the names go on top of everything (heads behind, balls in the air), so no name is cut by a head or a pass
  const tag = (m: Player) => {
    if (!m.name) return null
    const [x, y, s] = P(m.p), u = sz(s), hy = y - 44 * u
    return <g key={"n" + m.id} data-mid={m.id}><text x={x} y={hy - 25 * u} textAnchor="middle" fill="#ffffff" fontSize={(m.hi ? 20 : 16) * u} fontWeight={m.hi ? 800 : 600}
      stroke="rgba(0,0,0,0.6)" strokeWidth={5 * u} paintOrder="stroke" strokeLinejoin="round" style={{ fontFamily: m.hi ? COND : SANS, letterSpacing: m.hi ? 1 * u : 0 }}>{m.hi ? m.name.toUpperCase() : m.name}</text></g>
  }
  const pin = (m: { id: string; p: Pt; n: string }) => {
    const [x, y, s] = P(m.p), r = 19 * sz(s)
    const light = p.bright && !std
    return <g key={m.id} data-mid={m.id}>
      <circle cx={x} cy={y} r={r} fill={light ? p.ink : p.story} stroke={light ? p.bg : "#0b0d10"} strokeWidth={r * 0.14} />
      <text x={x} y={y + r * 0.05} textAnchor="middle" dominantBaseline="central" fill={light ? (p.cased ? p.story : "#ffffff") : p.storyInk} fontSize={r * 1.15} fontWeight={800} style={{ fontFamily: COND }}>{m.n}</text>
    </g>
  }
  const ball = (m: { id: string; p: Pt }) => { const [x, y, s] = P(m.p), r = 8 * sz(s); return <g key={m.id} data-mid={m.id}>
    {std && <ellipse cx={x} cy={y + r * 0.6} rx={r} ry={r * 0.35} fill="#000" fillOpacity={0.4} />}
    <circle cx={x} cy={std ? y - r * 0.4 : y} r={r} fill="#ffffff" stroke="#111" strokeWidth={1.6 * k} /><circle cx={x} cy={std ? y - r * 0.4 : y} r={r * 0.38} fill="#111" /></g> }

  // the teams, named under the pitch: each with its kit
  const legend = (() => {
    if (!b.legend || std) return null
    const q = (b.dir === "right" ? box.h : box.w) / 1000, fs = 26 * q, r = 12 * q, rows: ReactNode[] = []
    let x = b.x + r
    ;([0, 1] as const).forEach(i => {
      const T = b.teams[i], name = T.name.trim().toUpperCase()
      if (!name) return
      const c1 = T.color ?? (i === 0 ? p.story : p.ring), font = `700 ${fs}px "Barlow Condensed"`, tw = textWidth(name, font, fs * 0.08), y = b.y + box.h + 46 * q
      rows.push(<g key={i} data-legend="1">
        <circle cx={x} cy={y} r={r + 1.6 * q} fill={p.bright ? "#ffffff" : p.bg} />
        <KitFill id={gid + "lg" + i} x={x} y={y} r={r} pat={T.pat} c1={c1} c2={T.c2} />
        <circle cx={x} cy={y} r={r} fill="none" stroke={p.bright ? "rgba(20,22,26,0.35)" : "rgba(255,255,255,0.3)"} strokeWidth={1.4 * q} />
        <text x={x + r + 12 * q} y={y} dominantBaseline="central" fill={p.ink} fontSize={fs} fontWeight={700} style={{ fontFamily: COND, letterSpacing: fs * 0.08 }}>{name}</text>
      </g>)
      x += r * 2 + 12 * q + tw + 44 * q
    })
    return rows.length ? <g>{rows}</g> : null
  })()
  const of = <T extends Mark["kind"]>(kind: T) => b.marks.filter(m => m.kind === kind) as Extract<Mark, { kind: T }>[]
  const people = std ? of("player").slice().sort((a, c) => a.p[1] - c.p[1]) : of("player")
  const clipM = Math.max(70 * pu, 0.06 * Math.min(box.w, box.h))
  const mk = b.crest && !std ? Math.min(box.w, box.h) * 0.38 : 0, mcx = b.x + box.w / 2, mcy = b.y + box.h / 2
  return (
    <g data-bid={b.id}>
      <rect x={b.x} y={b.y} width={box.w} height={box.h} fill="transparent" />
      {grass}
      {lawn}
      {mk > 0 && !turf && <g opacity={p.bright ? 0.035 : 0.045}>
        {logo ? <image href={logo} x={mcx - mk / 2} y={mcy - mk / 2} width={mk} height={mk} preserveAspectRatio="xMidYMid meet" />
          : <g transform={`translate(${mcx - mk / 2},${mcy - mk / 2}) scale(${mk / 24})`}><Glyph id={brand.crest} color={p.ink} /></g>}
      </g>}
      {lines}
      {!std && <defs><clipPath id={gid + "k"}><rect x={b.x - clipM} y={b.y - clipM} width={box.w + 2 * clipM} height={box.h + 2 * clipM} /></clipPath></defs>}
      <g clipPath={std ? undefined : `url(#${gid}k)`}>
        {of("zone").map(zone)}
        {of("pass").filter(m => !(std && m.air)).map(pass)}
        {people.map(player)}
        {of("ball").map(ball)}
        {of("pass").filter(m => std && m.air).map(pass)}
        {of("pin").map(pin)}
        {std && people.map(tag)}
      </g>
      {fade}
      {legend}
    </g>
  )
}

/* ── key stats ── */
export const statsHeight = (s: StatsBlock) => (s.type === "player" ? 66 * s.s : 0) + (s.rows.length ? 118 * s.s : 20 * s.s)
function StatsView({ b, p }: { b: StatsBlock; p: Pal }) {
  const s = b.s, n = Math.max(1, b.rows.length), cw = b.w / n, top = b.type === "player" ? b.y + 66 * s : b.y
  return (
    <g data-bid={b.id}>
      <rect x={b.x} y={b.y} width={b.w} height={statsHeight(b)} fill="transparent" />
      {b.type === "player" && <g>
        <circle cx={b.x + 22 * s} cy={b.y + 24 * s} r={22 * s} fill={p.story} stroke={p.cased ? p.ink : "none"} strokeWidth={2 * s} />
        <text x={b.x + 22 * s} y={b.y + 25 * s} textAnchor="middle" dominantBaseline="central" fill={p.storyInk} fontSize={21 * s} fontWeight={800} style={{ fontFamily: COND }}>{b.num || "–"}</text>
        <text x={b.x + 58 * s} y={b.y + 36 * s} fill={p.ink} fontSize={36 * s} fontWeight={700} style={{ fontFamily: COND, letterSpacing: 36 * s * 0.03 }}>{(b.player || "Player").toUpperCase()}</text>
      </g>}
      {b.rows.map((r, i) => {
        const x = b.x + i * cw, pad = i > 0 ? 28 * s : 0
        return <g key={i}>
          {i > 0 && <line x1={x} y1={top + 6 * s} x2={x} y2={top + 110 * s} stroke={p.ctx} strokeWidth={1.4 * s} />}
          <text x={x + pad} y={top + 74 * s} fill={p.ink} fontSize={84 * s} fontWeight={800} style={{ fontFamily: COND, letterSpacing: -0.5 * s }}>{r.value || "–"}</text>
          <text x={x + pad} y={top + 108 * s} fill={p.muted} fontSize={13.5 * s} fontWeight={600} style={{ fontFamily: SANS, letterSpacing: 13.5 * s * 0.14 }}>{r.label.toUpperCase()}</text>
        </g>
      })}
    </g>
  )
}

/* ── the story: numbered points that match the pins on the pitch ── */
function storyLayout(b: StoryBlock) {
  const s = b.s, r = 19 * s, fs = 21 * s, tw = b.w - 2 * r - 18 * s
  let y = b.y + (b.title ? 46 * s : 0)
  const rows = b.points.map(t => { const lines = wrap(t, `500 ${fs}px "Inter"`, tw); const y0 = y; y += Math.max(2 * r, lines.length * fs * 1.38) + 24 * s; return { y0, lines } })
  return { r, fs, rows, h: Math.max(20 * s, y - b.y - (b.points.length ? 24 * s : 0)) }
}
export const storyHeight = (b: StoryBlock) => storyLayout(b).h
function StoryView({ b, p }: { b: StoryBlock; p: Pal }) {
  const s = b.s, { r, fs, rows, h } = storyLayout(b), tx = b.x + 2 * r + 18 * s
  return (
    <g data-bid={b.id}>
      <rect x={b.x} y={b.y} width={b.w} height={h} fill="transparent" />
      {b.title && <>
        <text x={b.x} y={b.y + 14 * s} fill={p.muted} fontSize={14 * s} fontWeight={600} style={{ fontFamily: SANS, letterSpacing: 14 * s * 0.16 }}>{b.title.toUpperCase()}</text>
        <rect x={b.x} y={b.y + 24 * s} width={36 * s} height={4 * s} fill={p.story} />
      </>}
      {rows.map((row, i) => (
        <g key={i}>
          <circle cx={b.x + r} cy={row.y0 + r} r={r} fill={p.bright ? p.ink : p.story} />
          <text x={b.x + r} y={row.y0 + r * 1.05} textAnchor="middle" dominantBaseline="central" fill={p.bright ? (p.cased ? p.story : "#ffffff") : p.storyInk} fontSize={r * 1.15} fontWeight={800} style={{ fontFamily: COND }}>{i + 1}</text>
          <text x={tx} y={row.y0} fill={p.ink} fontSize={fs} fontWeight={500} style={{ fontFamily: SANS }}>
            {row.lines.map((l, j) => <tspan key={j} x={tx} dy={j === 0 ? fs * 1.12 : fs * 1.38}>{l}</tspan>)}
          </text>
        </g>
      ))}
    </g>
  )
}

/* ── photos: pasted straight onto the page; a soft edge, a border or a shadow only if you want one ── */
function PhotoView({ b, p, k, src, editing, scope }: { b: PhotoBlock; p: Pal; k: number; src: string | undefined; editing: boolean; scope: string }) {
  const uid = "ph" + scope + clean(b.id), cx = b.x + b.w / 2, cy = b.y + b.h / 2
  const rx = b.shape === "round" ? Math.min(b.w, b.h) * 0.08 : 0, bd = b.border === "none" ? 0 : 9 * k
  const shape = (grow: number, extra: Record<string, unknown> = {}) => b.shape === "circle"
    ? <ellipse cx={cx} cy={cy} rx={b.w / 2 + grow} ry={b.h / 2 + grow} {...extra} />
    : <rect x={b.x - grow} y={b.y - grow} width={b.w + 2 * grow} height={b.h + 2 * grow} rx={rx ? rx + grow : 0} {...extra} />
  const ih = b.iw * (b.nh / b.nw), feather = Math.min(b.w, b.h) * 0.12
  if (!src) {
    // an empty spot for a photo: only while editing, never in the picture. A cut-out pasted here keeps all of itself, no frame.
    if (!editing) return null
    const g = Math.min(b.w, b.h) * 0.2, fs = Math.min(20 * k, b.w / 13), ty = cy + g * 0.95
    return <g data-bid={b.id} data-ui="1" transform={b.rot ? `rotate(${b.rot} ${cx} ${cy})` : undefined}>
      {shape(0, { fill: p.bright ? "rgba(20,22,26,0.035)" : "rgba(255,255,255,0.035)", stroke: p.muted, strokeOpacity: 0.55, strokeDasharray: `${3 * k} ${9 * k}`, strokeLinecap: "round", strokeWidth: 2.5 * k })}
      {b.src ? <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={p.muted} fontSize={fs} fontWeight={600} style={{ fontFamily: SANS }}>Loading the photo…</text> : <>
        <g fill={p.muted} opacity={0.5}>
          <circle cx={cx} cy={cy - g * 0.55} r={g * 0.26} />
          <path d={`M${cx - g * 0.52},${cy + g * 0.42} C${cx - g * 0.52},${cy - g * 0.08} ${cx - g * 0.3},${cy - g * 0.2} ${cx},${cy - g * 0.2} C${cx + g * 0.3},${cy - g * 0.2} ${cx + g * 0.52},${cy - g * 0.08} ${cx + g * 0.52},${cy + g * 0.42} Z`} />
        </g>
        <text x={cx} y={ty} textAnchor="middle" dominantBaseline="hanging" fill={p.muted} fontSize={fs} fontWeight={600} style={{ fontFamily: SANS }}>Paste a player here</text>
        <text x={cx} y={ty + fs * 1.45} textAnchor="middle" dominantBaseline="hanging" fill={p.muted} fillOpacity={0.7} fontSize={fs * 0.8} fontWeight={500} style={{ fontFamily: SANS }}>Ctrl V, drop or double-click</text>
      </>}
    </g>
  }
  // a see-through cut-out (a PNG): its outline and shadow follow the player, not a box
  const cut = b.src.endsWith(".png"), edgeCol = b.border === "story" ? p.story : "#ffffff"
  return (
    <g data-bid={b.id} transform={b.rot ? `rotate(${b.rot} ${cx} ${cy})` : undefined}>
      <defs>
        <clipPath id={uid + "c"}>{shape(0)}</clipPath>
        {b.shadow && <filter id={uid + "s"} x="-25%" y="-25%" width="150%" height="160%"><feDropShadow dx="0" dy={10 * k} stdDeviation={14 * k} floodColor="#000" floodOpacity="0.35" /></filter>}
        {b.edge === "soft" && <>
          <filter id={uid + "b"} x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation={feather / 2.2} /></filter>
          <mask id={uid + "m"} maskUnits="userSpaceOnUse" x={b.x - 10} y={b.y - 10} width={b.w + 20} height={b.h + 20}>
            <rect x={b.x + feather} y={b.y + feather} width={Math.max(1, b.w - 2 * feather)} height={Math.max(1, b.h - 2 * feather)} fill="#fff" filter={`url(#${uid}b)`} />
          </mask>
        </>}
        {b.edge === "fade" && <>
          <linearGradient id={uid + "g"} x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity={0} /></linearGradient>
          <mask id={uid + "m"} maskUnits="userSpaceOnUse" x={b.x} y={b.y} width={b.w} height={b.h}><rect x={b.x} y={b.y} width={b.w} height={b.h} fill={`url(#${uid}g)`} /></mask>
        </>}
        {cut && (bd > 0 || b.shadow) && <filter id={uid + "f"} x="-20%" y="-20%" width="140%" height="150%" colorInterpolationFilters="sRGB">
          {bd > 0 && <><feMorphology in="SourceAlpha" operator="dilate" radius={bd * 0.8} result="d" /><feFlood floodColor={edgeCol} result="c" /><feComposite in="c" in2="d" operator="in" result="o" />
            <feMerge result="m"><feMergeNode in="o" /><feMergeNode in="SourceGraphic" /></feMerge></>}
          {b.shadow && <feDropShadow in={bd > 0 ? "m" : "SourceGraphic"} dx="0" dy={10 * k} stdDeviation={14 * k} floodColor="#000" floodOpacity="0.4" />}
        </filter>}
      </defs>
      {!cut && (bd > 0 || b.shadow) && b.edge === "hard" && shape(bd, { fill: b.border === "story" ? p.story : b.border === "white" ? "#ffffff" : p.bg, filter: b.shadow ? `url(#${uid}s)` : undefined })}
      <g opacity={b.opacity ?? 1} filter={cut && (bd > 0 || b.shadow) ? `url(#${uid}f)` : !cut && b.shadow && b.edge !== "hard" ? `url(#${uid}s)` : undefined}>
        <g clipPath={`url(#${uid}c)`} mask={b.edge !== "hard" ? `url(#${uid}m)` : undefined}>
          <image href={src} x={b.x + b.ix} y={b.y + b.iy} width={b.iw} height={ih} preserveAspectRatio="none"
            transform={b.flip ? `translate(${2 * (b.x + b.ix) + b.iw} 0) scale(-1 1)` : undefined} />
        </g>
      </g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
    </g>
  )
}


/* ── the series line ── */
export const seriesHeight = (b: SeriesBlock) => b.size * 1.2
function SeriesView({ b, p }: { b: SeriesBlock; p: Pal }) {
  return <g data-bid={b.id}>
    <text x={b.x} y={b.y + b.size * 0.92} fill={colourOf(b.color, p)} fontSize={b.size} fontWeight={700} style={{ fontFamily: SANS, letterSpacing: b.size * 0.18 }}>{seriesText(b.text, p)}</text>
    <rect x={b.x} y={b.y} width={b.w} height={seriesHeight(b)} fill="transparent" />
  </g>
}

/* ── the game state: 0' to 90' (or 120'), half-time, and what changed the game ── */
export const timelineHeight = (b: TimelineBlock) => 150 * b.s
export const timelineEnd = (b: TimelineBlock) => (b.events.some(e => e.min > 90) ? 120 : 90)
function TimelineView({ b, p }: { b: TimelineBlock; p: Pal }) {
  const s = b.s, end = timelineEnd(b), ly = b.y + 82 * s, X = (m: number) => b.x + (Math.min(end, Math.max(0, m)) / end) * b.w
  const ev = b.events.slice().sort((a, c) => a.min - c.min), lfs = 17 * s
  const col = (k: string) => (k === "goal" ? p.pa : k === "red" ? "#d7261e" : null)
  return <g data-bid={b.id}>
    <rect x={b.x} y={b.y} width={b.w} height={timelineHeight(b)} fill="transparent" />
    <text x={b.x} y={b.y + 14 * s} fill={p.muted} fontSize={14 * s} fontWeight={600} style={{ fontFamily: SANS, letterSpacing: 14 * s * 0.16 }}>GAME STATE</text>
    <rect x={b.x} y={ly - 1.5 * s} width={b.w} height={3 * s} fill={p.ink} fillOpacity={0.85} />
    <text x={b.x} y={ly + 34 * s} fill={p.muted} fontSize={13 * s} fontWeight={600} style={{ fontFamily: MONO }}>0'</text>
    <text x={b.x + b.w} y={ly + 34 * s} textAnchor="end" fill={p.muted} fontSize={13 * s} fontWeight={600} style={{ fontFamily: MONO }}>{end}'</text>
    <g transform={`translate(${X(45)} ${ly}) rotate(45)`}><rect x={-7 * s} y={-7 * s} width={14 * s} height={14 * s} fill={p.bg} stroke={p.ink} strokeWidth={2.4 * s} /></g>
    {!ev.some(e => e.min === 45 && e.kind !== "goal") && <text x={X(45)} y={ly + 34 * s} textAnchor="middle" fill={p.muted} fontSize={13 * s} fontWeight={700} style={{ fontFamily: MONO }}>HT</text>}
    {(() => { const last = { up: -1e9, down: -1e9 }; return ev.map(e => {
      const x = X(e.min), c = col(e.kind), ht = e.min === 45 && e.kind !== "goal", label = `${ht ? "HT" : e.min + "'"} ${e.label}`.trim()
      const lw = textWidth(label, `600 ${lfs}px "Inter"`), lx = Math.min(b.x + b.w - lw / 2, Math.max(b.x + lw / 2, x))
      let up = e.kind === "goal" || e.kind === "red"
      if (lx - lw / 2 < (up ? last.up : last.down) + 14 * s) up = !up
      if (up) last.up = lx + lw / 2; else last.down = lx + lw / 2
      return { e, x, c, label, lx, up }
    }) })().map(({ e, x, c, label, lx, up }, i) => {
      return <g key={i}>
        <line x1={x} y1={ly} x2={x} y2={up ? ly - 22 * s : ly + 22 * s} stroke={p.ink} strokeOpacity={0.35} strokeWidth={1.4 * s} />
        {e.min === 45 && e.kind !== "goal" ? <g transform={`translate(${x} ${ly}) rotate(45)`}><rect x={-8 * s} y={-8 * s} width={16 * s} height={16 * s} fill={c ?? p.bg} stroke={c ?? p.ink} strokeWidth={2.4 * s} /></g>
          : <circle cx={x} cy={ly} r={9 * s} fill={c ?? p.bg} stroke={c ?? p.ink} strokeWidth={2.4 * s} />}
        <text x={lx} y={up ? ly - 28 * s : ly + 30 * s + lfs * 0.8} textAnchor="middle" fill={p.ink} fontSize={lfs} fontWeight={600} style={{ fontFamily: SANS }}>{label}</text>
      </g>
    })}
  </g>
}

/* ── the idea: the game model in words, the key situations and the Point of Difference ── */
function ideaLayout(b: IdeaBlock) {
  const s = b.s, bfs = 19 * s, tfs = 18 * s, rows: { kind: "sec" | "sit" | "pod" | "cap"; y: number; lines: string[]; i: number }[] = []
  let y = b.y + (b.title ? 44 * s : 0)
  b.sections.forEach((q, i) => {
    const lines = wrap(q.body, `400 ${bfs}px "Inter"`, b.w)
    rows.push({ kind: "sec", y, lines, i }); y += 26 * s + lines.length * bfs * 1.4 + 18 * s
  })
  if (b.situations.length) { rows.push({ kind: "cap", y, lines: ["KEY SITUATIONS"], i: 0 }); y += 34 * s }
  b.situations.forEach((q, i) => {
    const lines = wrap(q.text, `400 ${tfs}px "Inter"`, b.w - 40 * s)
    rows.push({ kind: "sit", y, lines, i }); y += 24 * s + lines.length * tfs * 1.38 + 14 * s
  })
  if (b.pod || b.podLine) {
    const lines = wrap(b.podLine, `400 ${tfs}px "Inter"`, b.w)
    rows.push({ kind: "pod", y, lines, i: 0 }); y += 34 * s + 34 * s + lines.length * tfs * 1.38
  }
  return { rows, h: Math.max(40 * s, y - b.y), bfs, tfs }
}
export const ideaHeight = (b: IdeaBlock) => ideaLayout(b).h
function IdeaView({ b, p }: { b: IdeaBlock; p: Pal }) {
  const s = b.s, L = ideaLayout(b), cap = (y: number, t: string, c = p.muted) => <text x={b.x} y={y + 14 * s} fill={c} fontSize={14 * s} fontWeight={700} style={{ fontFamily: SANS, letterSpacing: 14 * s * 0.16 }}>{t}</text>
  let pinNo = 0
  return <g data-bid={b.id}>
    <rect x={b.x} y={b.y} width={b.w} height={L.h} fill="transparent" />
    {b.title && <>{cap(b.y, b.title.toUpperCase())}<rect x={b.x} y={b.y + 24 * s} width={36 * s} height={4 * s} fill={p.pa} /></>}
    {L.rows.map(r => {
      if (r.kind === "cap") return <g key="cap">{cap(r.y, "KEY SITUATIONS")}</g>
      if (r.kind === "sec") { const q = b.sections[r.i]; return <g key={"s" + r.i}>
        {cap(r.y, q.heading.toUpperCase(), p.pa)}
        <text x={b.x} y={r.y + 26 * s} fill={p.ink} fontSize={L.bfs} style={{ fontFamily: SANS }}>{r.lines.map((l, j) => <tspan key={j} x={b.x} dy={j === 0 ? L.bfs * 1.05 : L.bfs * 1.4}>{l}</tspan>)}</text>
      </g> }
      if (r.kind === "sit") {
        const q = b.situations[r.i], n = q.pin ? ++pinNo : 0, tx = b.x + 40 * s
        return <g key={"t" + r.i}>
          {n > 0 && <><circle cx={b.x + 14 * s} cy={r.y + 12 * s} r={14 * s} fill={p.ink} /><text x={b.x + 14 * s} y={r.y + 12.5 * s} textAnchor="middle" dominantBaseline="central" fill={p.bg} fontSize={16 * s} fontWeight={800} style={{ fontFamily: COND }}>{n}</text></>}
          <text x={tx} y={r.y + 17 * s} fill={p.pa} fontSize={15 * s} fontWeight={800} style={{ fontFamily: SANS, letterSpacing: 15 * s * 0.1 }}>{q.tag.toUpperCase()}</text>
          <text x={tx} y={r.y + 24 * s} fill={p.ink} fontSize={L.tfs} style={{ fontFamily: SANS }}>{r.lines.map((l, j) => <tspan key={j} x={tx} dy={j === 0 ? L.tfs * 1.05 : L.tfs * 1.38}>{l}</tspan>)}</text>
        </g>
      }
      const pw = b.pod ? textWidth(b.pod.toUpperCase(), `800 ${17 * s}px "Inter"`, 17 * s * 0.06) + 26 * s : 0
      return <g key="pod">
        {cap(r.y, "POINT OF DIFFERENCE")}
        {b.pod && <><rect x={b.x} y={r.y + 30 * s} width={pw} height={30 * s} rx={15 * s} fill="none" stroke={p.pc} strokeWidth={3 * s} />
          <text x={b.x + pw / 2} y={r.y + 45.5 * s} textAnchor="middle" dominantBaseline="central" fill={p.ink} fontSize={17 * s} fontWeight={800} style={{ fontFamily: SANS, letterSpacing: 17 * s * 0.06 }}>{b.pod.toUpperCase()}</text></>}
        <text x={b.x} y={r.y + 68 * s} fill={p.ink} fontSize={L.tfs} style={{ fontFamily: SANS }}>{r.lines.map((l, j) => <tspan key={j} x={b.x} dy={j === 0 ? L.tfs * 1.05 : L.tfs * 1.38}>{l}</tspan>)}</text>
      </g>
    })}
  </g>
}

/* ── the balance dial ── */
export const dialScore = (v: number) => 10 - Math.abs(Math.round(v))
export const dialTilt = (b: Pick<DialBlock, "value" | "left" | "right">) => (b.value > 0 ? `TILT · ${b.right}` : b.value < 0 ? `TILT · ${b.left}` : "BALANCED")
const dialLines = (b: DialBlock) => (b.line ? wrap(b.line, `400 ${18 * b.s}px "Inter"`, b.w).slice(0, 2) : [])
export const dialHeight = (b: DialBlock) => 206 * b.s + dialLines(b).length * 25 * b.s
/** Where the needle sits across the dial's bar (0 to 1) */
export const dialAt = (v: number) => 0.5 + Math.max(-10, Math.min(10, v)) * 0.05
function DialView({ b, p, scope }: { b: DialBlock; p: Pal; scope: string }) {
  const s = b.s, gid = "dl" + scope + clean(b.id), by = b.y + 128 * s, bh = 18 * s, nx = b.x + dialAt(b.value) * b.w
  return <g data-bid={b.id}>
    <rect x={b.x} y={b.y} width={b.w} height={dialHeight(b)} fill="transparent" />
    <defs><linearGradient id={gid} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor={p.pa} /><stop offset="1" stopColor={p.pb} /></linearGradient></defs>
    <text x={b.x} y={b.y + 14 * s} fill={p.muted} fontSize={14 * s} fontWeight={700} style={{ fontFamily: SANS, letterSpacing: 14 * s * 0.16 }}>BALANCE RATING</text>
    <text x={b.x} y={b.y + 104 * s} fill={p.ink} fontSize={84 * s} style={{ fontFamily: ANTON }}>{dialScore(b.value)}<tspan fontSize={40 * s} fill={p.muted}>/10</tspan></text>
    <rect x={b.x} y={by} width={b.w} height={bh} rx={bh / 2} fill={`url(#${gid})`} />
    <rect x={b.x + b.w / 2 - 1 * s} y={by - 6 * s} width={2 * s} height={bh + 12 * s} fill={p.ink} fillOpacity={0.5} />
    <g data-needle={b.id} style={{ cursor: "ew-resize" }}>
      <rect x={nx - 4 * s} y={by - 10 * s} width={8 * s} height={bh + 20 * s} rx={4 * s} fill="#ffffff" stroke={p.ink} strokeWidth={2 * s} />
      <rect x={nx - 18 * s} y={by - 18 * s} width={36 * s} height={bh + 36 * s} fill="transparent" />
    </g>
    <text x={b.x} y={by + bh + 30 * s} fill={p.muted} fontSize={13 * s} fontWeight={700} style={{ fontFamily: MONO }}>{b.left.toUpperCase()}</text>
    <text x={b.x + b.w / 2} y={by + bh + 30 * s} textAnchor="middle" fill={p.ink} fontSize={14 * s} fontWeight={800} style={{ fontFamily: SANS, letterSpacing: 14 * s * 0.12 }}>{dialTilt(b)}</text>
    <text x={b.x + b.w} y={by + bh + 30 * s} textAnchor="end" fill={p.muted} fontSize={13 * s} fontWeight={700} style={{ fontFamily: MONO }}>{b.right.toUpperCase()}</text>
    {dialLines(b).map((l, i) => <text key={i} x={b.x} y={by + bh + 62 * s + i * 25 * s} fill={p.ink} fontSize={18 * s} style={{ fontFamily: SANS }}>{l}</text>)}
  </g>
}

/* ── a notebook's team sheet: player cards ── */
const CARD_H = 112
export const cardsHeight = (b: CardsBlock) => { const n = b.cards.length + (b.extra ? 1 : 0); return Math.max(1, Math.ceil(n / b.cols)) * (CARD_H + 12) * b.s - 12 * b.s }
function CardsView({ b, p }: { b: CardsBlock; p: Pal }) {
  const s = b.s, gap = 12 * s, cw = (b.w - gap * (b.cols - 1)) / b.cols, ch = CARD_H * s, ink = colourOf(b.ink, p)
  const at = (i: number) => ({ x: b.x + (i % b.cols) * (cw + gap), y: b.y + Math.floor(i / b.cols) * (ch + gap) })
  return <g data-bid={b.id}>
    <rect x={b.x} y={b.y} width={b.w} height={cardsHeight(b)} fill="transparent" />
    {b.cards.map((c, i) => { const { x, y } = at(i), nfs = Math.min(26 * s, cw / 7); return <g key={i}>
      <rect x={x} y={y} width={cw} height={ch} rx={6 * s} fill={p.bright ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.04)"} stroke={ink} strokeOpacity={0.55} strokeWidth={1.6 * s} />
      <circle cx={x + 20 * s} cy={y + 22 * s} r={13 * s} fill="none" stroke={ink} strokeWidth={2 * s} />
      <text x={x + 20 * s} y={y + 22.5 * s} textAnchor="middle" dominantBaseline="central" fill={ink} fontSize={14 * s} fontWeight={700} style={{ fontFamily: HANDF }}>{c.no || "–"}</text>
      <text x={x + cw - 10 * s} y={y + 26 * s} textAnchor="end" fill={p.muted} fontSize={12 * s} fontWeight={700} style={{ fontFamily: MONO }}>{c.pos.toUpperCase()}</text>
      <text x={x + 12 * s} y={y + 62 * s} fill={ink} fontSize={nfs} fontWeight={700} style={{ fontFamily: HANDF }}>{c.name || "____"}</text>
      {c.tag && <text x={x + 12 * s} y={y + 82 * s} fill={p.pa} fontSize={12 * s} fontWeight={700} style={{ fontFamily: SANS, letterSpacing: 12 * s * 0.1 }}>{c.tag.toUpperCase()}</text>}
      <text x={x + 12 * s} y={y + ch - 12 * s} fill={p.muted} fontSize={14 * s} style={{ fontFamily: HANDF }}>{c.line || "G __  A __"}</text>
    </g> })}
    {b.extra && (() => { const { x, y } = at(b.cards.length); return <g>
      <rect x={x} y={y} width={cw} height={ch} rx={6 * s} fill="none" stroke={ink} strokeOpacity={0.5} strokeWidth={1.6 * s} strokeDasharray={`${6 * s} ${5 * s}`} />
      <text x={x + cw / 2} y={y + ch / 2} textAnchor="middle" dominantBaseline="central" fill={ink} fontSize={20 * s} fontWeight={700} style={{ fontFamily: HANDF }}>{b.extra}</text>
    </g> })()}
  </g>
}

/* ── a heading and ruled lines to write on ── */
const LINE_GAP = 38
export const linesHeight = (b: LinesBlock) => (b.heading ? 30 : 0) * b.s + Math.max(1, b.lines.length) * LINE_GAP * b.s
function LinesView({ b, p }: { b: LinesBlock; p: Pal }) {
  const s = b.s, ink = colourOf(b.ink, p), top = b.y + (b.heading ? 30 * s : 0), fs = 21 * s
  return <g data-bid={b.id}>
    <rect x={b.x} y={b.y} width={b.w} height={linesHeight(b)} fill="transparent" />
    {b.heading && <text x={b.x} y={b.y + 16 * s} fill={ink} fontSize={13.5 * s} fontWeight={700} style={{ fontFamily: MONO, letterSpacing: 13.5 * s * 0.14 }}>{b.heading.toUpperCase()}</text>}
    {(b.lines.length ? b.lines : [""]).map((l, i) => { const y = top + (i + 1) * LINE_GAP * s; return <g key={i}>
      <rect x={b.x} y={y - 1 * s} width={b.w} height={1.2 * s} fill={p.muted} fillOpacity={0.35} />
      <text x={b.x + 2 * s} y={y - 9 * s} fill={ink} fontSize={fs} style={{ fontFamily: HANDF }}>{wrap(l, `400 ${fs}px "Kalam"`, b.w - 4 * s)[0] ?? ""}</text>
    </g> })}
  </g>
}

/* ── the fold of a notebook spread ── */
function SpineView({ b, p, scope }: { b: SpineBlock; p: Pal; scope: string }) {
  const gid = "sp" + scope + clean(b.id)
  return <g data-bid={b.id}>
    <defs><linearGradient id={gid} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#000" stopOpacity={0} /><stop offset="0.5" stopColor="#000" stopOpacity={p.bright ? 0.16 : 0.4} /><stop offset="1" stopColor="#000" stopOpacity={0} /></linearGradient></defs>
    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={`url(#${gid})`} />
    <line x1={b.x + b.w / 2} y1={b.y} x2={b.x + b.w / 2} y2={b.y + b.h} stroke={p.ink} strokeOpacity={0.18} strokeWidth={1.2} strokeDasharray="10 8" />
  </g>
}

/* ── drawn outlines: boxes, a shield, kit shirts, circles ── */
const SHIELD = "M0.5 0 L1 0.12 L0.96 0.55 C0.9 0.8 0.72 0.92 0.5 1 C0.28 0.92 0.1 0.8 0.04 0.55 L0 0.12 Z"
const SHIRT = "M0.3 0 L0.4 0.06 C0.45 0.1 0.55 0.1 0.6 0.06 L0.7 0 L1 0.16 L0.88 0.36 L0.78 0.3 L0.78 1 L0.22 1 L0.22 0.3 L0.12 0.36 L0 0.16 Z"
function ShapeView({ b, p, scope }: { b: ShapeBlock; p: Pal; scope: string }) {
  const stroke = colourOf(b.stroke, p), fill = b.fill ? colourOf(b.fill, p) : "none", gid = "sh" + scope + clean(b.id)
  const sw = Math.max(1.5, Math.min(b.w, b.h) * 0.025), dash = b.dash ? `${sw * 3} ${sw * 2.5}` : undefined
  const tf = `translate(${b.x} ${b.y}) scale(${b.w} ${b.h})`
  const path = b.shape === "shield" ? SHIELD : b.shape === "shirt" ? SHIRT : null
  return <g data-bid={b.id}>
    {path ? <>
      <clipPath id={gid}><path d={path} transform={tf} /></clipPath>
      <path d={path} transform={tf} fill={fill} />
      {b.c2 && b.pat !== "solid" && <g clipPath={`url(#${gid})`} fill={b.c2}>
        {b.pat === "stripes" && [0.18, 0.42, 0.66].map(f => <rect key={f} x={b.x + f * b.w} y={b.y} width={b.w * 0.12} height={b.h} />)}
        {b.pat === "hoops" && [0.3, 0.6].map(f => <rect key={f} x={b.x} y={b.y + f * b.h} width={b.w} height={b.h * 0.14} />)}
        {b.pat === "halves" && <rect x={b.x + b.w / 2} y={b.y} width={b.w / 2} height={b.h} />}
        {(b.pat === "sash" || b.pat === "band") && <rect x={b.x} y={b.y + b.h * 0.42} width={b.w} height={b.h * 0.16} />}
        {b.pat === "sleeves" && <><rect x={b.x} y={b.y} width={b.w * 0.24} height={b.h} /><rect x={b.x + b.w * 0.76} y={b.y} width={b.w * 0.24} height={b.h} /></>}
      </g>}
      <path d={path} transform={tf} fill="none" stroke={stroke} strokeWidth={sw} vectorEffect="non-scaling-stroke" strokeDasharray={dash} strokeLinejoin="round" />
    </> : b.shape === "circle"
      ? <ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />
      : <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={Math.min(b.w, b.h) * 0.06} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray={dash} />}
    {b.label && <text x={b.x + b.w / 2} y={b.y + b.h * (b.shape === "shirt" ? 0.6 : 0.5)} textAnchor="middle" dominantBaseline="central" fill={b.fill && lum(colourOf(b.fill, p)) < 0.45 ? "#ffffff" : stroke} fontSize={b.size} fontWeight={700} style={{ fontFamily: HANDF }}>{b.label}</text>}
    <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
  </g>
}

/* ── where each block sits (for selecting, snapping and arranging) ── */
export function blockBox(b: Block): { x: number; y: number; w: number; h: number; rot: number } {
  switch (b.kind) {
    case "text": return { x: b.x, y: b.y, w: b.w, h: textHeight(b), rot: b.rot }
    case "pitch": { const q = pitchBox(b); return { x: b.x, y: b.y, w: q.w, h: q.h, rot: 0 } }
    case "stats": return { x: b.x, y: b.y, w: b.w, h: statsHeight(b), rot: 0 }
    case "story": return { x: b.x, y: b.y, w: b.w, h: storyHeight(b), rot: 0 }
    case "photo": return { x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot }
    case "series": return { x: b.x, y: b.y, w: b.w, h: seriesHeight(b), rot: 0 }
    case "timeline": return { x: b.x, y: b.y, w: b.w, h: timelineHeight(b), rot: 0 }
    case "idea": return { x: b.x, y: b.y, w: b.w, h: ideaHeight(b), rot: 0 }
    case "dial": return { x: b.x, y: b.y, w: b.w, h: dialHeight(b), rot: 0 }
    case "cards": return { x: b.x, y: b.y, w: b.w, h: cardsHeight(b), rot: 0 }
    case "lines": return { x: b.x, y: b.y, w: b.w, h: linesHeight(b), rot: 0 }
    case "spine": case "shape": return { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 }
  }
}

/* ── the seal, in any corner ── */
function Seal({ brand, handle, logo, corner, W, H, k }: { brand: Brand; handle: string; logo: string | null; corner: Report["seal"]; W: number; H: number; k: number }) {
  const sc = 1.3 * k
  const words = (handle ? textWidth("@" + handle, `700 17px "Barlow Condensed"`, 17 * 0.04) : 0) + (brand.madeWith ? textWidth("made with PitchStudio", `500 12px "Inter"`, 12 * 0.02) + (handle ? 9 : 0) : 0)
  const w = (handle || brand.madeWith ? words + 48 : 34) + 14
  const left = corner === "bl" || corner === "tl", top = corner === "tr" || corner === "tl"
  const x = left ? 20 * k + w * sc : W - 20 * k, y = top ? 20 * k + 42 * sc : H - 20 * k
  return <g data-seal="1" transform={`translate(${x},${y}) scale(${sc})`} style={{ pointerEvents: "none" }}><CreatorSeal brand={brand} handle={handle} logo={logo} pill="rgba(0,0,0,0.66)" /></g>
}

/** The whole report. media: each photo's picture (by its storage path). editing: show empty photo slots. */
/** "08": an issue number as the series line shows it after "Nº" */
export const issueText = (n: number | null | undefined) => (n ? String(n).padStart(2, "0") : "")
/** The whole report. issue: the number the series line shows (the report's own, or the one it would take next). */
export function ReportView({ report, brand, handle, logo, media, editing = false, svgRef, children, width = "100%", issue }: {
  report: Report; brand: Brand; handle: string; logo: string | null; media: Record<string, string>; editing?: boolean
  svgRef?: RefObject<SVGSVGElement | null>; children?: ReactNode; width?: string | number; issue?: number | null
}) {
  useFontsReady()
  const scope = clean(useId()) // ids inside this drawing stay unique when several reports are on the page
  const [W, H] = SIZES[report.format], k = W / 1600, p = palette(report, brand, issueText(report.issue ?? issue), handle)
  const dot = 18 * k
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={width} height="100%" style={{ display: "block" }} data-report={report.format} xmlns="http://www.w3.org/2000/svg">
      <rect width={W} height={H} fill={p.bg} />
      {report.paperStyle === "dotted" && <><defs><pattern id={"pd" + scope} width={dot} height={dot} patternUnits="userSpaceOnUse"><circle cx={dot / 2} cy={dot / 2} r={1.1 * k} fill={p.muted} fillOpacity={0.45} /></pattern></defs><rect width={W} height={H} fill={`url(#pd${scope})`} /></>}
      {report.paperStyle === "lined" && <><defs><pattern id={"pl" + scope} width={W} height={34 * k} patternUnits="userSpaceOnUse"><rect y={34 * k - 1.2 * k} width={W} height={1.2 * k} fill={p.muted} fillOpacity={0.3} /></pattern></defs><rect width={W} height={H} fill={`url(#pl${scope})`} /></>}
      {report.stripe && <><rect x={0} y={0} width={12 * k} height={H} fill={p.pb} /><rect x={12 * k} y={0} width={12 * k} height={H} fill={p.pa} /></>}
      {report.glow && <g>
        <defs><radialGradient id={"rg" + scope} cx="0.5" cy="0.36" r="0.75"><stop offset="0" stopColor={p.story} stopOpacity={p.bright ? 0.22 : 0.2} /><stop offset="0.6" stopColor={p.story} stopOpacity={0.04} /><stop offset="1" stopColor={p.story} stopOpacity={0} /></radialGradient></defs>
        <rect width={W} height={H} fill={`url(#rg${scope})`} />
      </g>}
      {report.blocks.map(b => {
        switch (b.kind) {
          case "text": return <TextView key={b.id} t={b} p={p} />
          case "pitch": return <PitchView key={b.id} b={b} p={p} k={k} brand={brand} logo={logo} scope={scope} />
          case "stats": return <StatsView key={b.id} b={b} p={p} />
          case "story": return <StoryView key={b.id} b={b} p={p} />
          case "photo": return <PhotoView key={b.id} b={b} p={p} k={k} src={b.src ? media[b.src] : undefined} editing={editing} scope={scope} />
          case "series": return <SeriesView key={b.id} b={b} p={p} />
          case "timeline": return <TimelineView key={b.id} b={b} p={p} />
          case "idea": return <IdeaView key={b.id} b={b} p={p} />
          case "dial": return <DialView key={b.id} b={b} p={p} scope={scope} />
          case "cards": return <CardsView key={b.id} b={b} p={p} />
          case "lines": return <LinesView key={b.id} b={b} p={p} />
          case "spine": return <SpineView key={b.id} b={b} p={p} scope={scope} />
          case "shape": return <ShapeView key={b.id} b={b} p={p} scope={scope} />
        }
      })}
      <Seal brand={brand} handle={handle} logo={logo} corner={report.seal} W={W} H={H} k={k} />
      {children}
    </svg>
  )
}
