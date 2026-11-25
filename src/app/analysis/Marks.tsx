import { useLayoutEffect, useRef, useState } from "react"
import { inkFor } from "../brand/brand"
import { centroid, ctrlFor, type Arrow, type Focus, type Mark, type Measure, type Note, type Pt, type Ring, type Shadow, type Spot, type Tag, type Tie, type Zone } from "./model"
import { apply, fmtM, groundCircle, groundLine, metres, pathOf, ppmAt, type Fit } from "./calib"

/* How each mark is drawn on a shot. The same drawing is shown on screen and saved in the export, so they always match.
   u is the size of one unit on this shot (1 on a 1920 wide shot), times the mark's own size. */

const CONDENSED = "'Barlow Condensed', 'Inter', sans-serif"
const SANS = "'Inter', sans-serif"
const safeId = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "")

/** The width a piece of svg text really takes, measured after it is drawn (fonts included). */
function useWidth(deps: unknown[]) {
  const ref = useRef<SVGTextElement>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const measure = () => { let v = 0; try { v = ref.current?.getBBox().width ?? 0 } catch { /* not drawn yet */ } setW(v) }
    measure()
    document.fonts?.ready.then(measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return [ref, w] as const
}

/* A player tag in one of four styles:
   cast   broadcast: a ring at the player's feet and the name in bold, in the tag colour with a dark outline, no box.
   sig    the PitchStudio plate (the default, the signature tag). A dark plate with its top left corner cut at 45 degrees (the Pitch Block's corner),
          a block of the tag colour down its left edge that follows the same cut, the name in spaced capitals,
          and a thin echo ring around the ground ring.
   plain  a rounded plate in the tag colour.
   bare   just the name, outlined so it reads on grass.
   The ring is solid, a glow (a soft halo with a bright disc), or off. */
function TagMark({ m, U, fit }: { m: Tag; U: number; fit?: Fit | null }) {
  const u = U * m.size
  const style = m.style ?? "sig", sig = style === "sig", bare = style === "bare", cast = style === "cast"
  const text = sig ? m.label.toUpperCase() : m.label
  const fs = (sig ? 25 : cast ? 31 : bare ? 30 : 25) * u, ph = (sig ? 38 : cast ? 40 : 36) * u, pad = 12 * u
  const bw = 7 * u, gap = 11 * u, cut = 11 * u // signature: block width, space after it, the cut corner
  const [ref, tw] = useWidth([text, fs, style])
  const lx = m.x + m.dx, ly = m.y + m.dy
  const textW = tw || text.length * fs * 0.5
  const pw = sig ? bw + gap + textW + 14 * u : cast ? textW : textW + 2 * pad
  const ring = { rx: 24 * u, ry: 8 * u }
  const showLabel = text.trim().length > 0
  // the leader runs from the label down to just above the ring, when the label is above the player
  const top = m.y - ring.ry - 3 * u
  const leader = showLabel && ly < top - 8 * u
  const x0 = lx - pw / 2, y0 = ly - ph, gid = "tg" + safeId(m.id)
  return (
    <g data-id={m.id}>
      {m.ring && m.glow && <>
        <defs>
          <radialGradient id={gid}>
            <stop offset="0" stopColor={m.color} stopOpacity={0.85} />
            <stop offset="0.5" stopColor={m.color} stopOpacity={0.42} />
            <stop offset="1" stopColor={m.color} stopOpacity={0} />
          </radialGradient>
        </defs>
        <ellipse cx={m.x} cy={m.y} rx={48 * u} ry={16 * u} fill={`url(#${gid})`} />
        <ellipse cx={m.x} cy={m.y} rx={22 * u} ry={7.5 * u} fill={m.color} fillOpacity={0.8} />
      </>}
      {m.ring && !m.glow && cast && (fit ? <>
        <path d={pathOf(groundCircle(fit, [m.x, m.y], 1.05 * m.size), true)} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={7.5 * u} />
        <path d={pathOf(groundCircle(fit, [m.x, m.y], 1.05 * m.size), true)} fill={m.color} fillOpacity={0.14} stroke={m.color} strokeWidth={3.8 * u} />
      </> : <>
        <ellipse cx={m.x} cy={m.y} rx={27 * u} ry={9.5 * u} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={7.5 * u} />
        <ellipse cx={m.x} cy={m.y} rx={27 * u} ry={9.5 * u} fill={m.color} fillOpacity={0.14} stroke={m.color} strokeWidth={3.8 * u} />
      </>)}
      {m.ring && !m.glow && !cast && (fit ? <>
        {sig && <path d={pathOf(groundCircle(fit, [m.x, m.y], 1.45 * m.size), true)} fill="none" stroke={m.color} strokeOpacity={0.6} strokeWidth={2 * u} />}
        <path d={pathOf(groundCircle(fit, [m.x, m.y], 0.95 * m.size), true)} fill={m.color} fillOpacity={0.2} stroke={m.color} strokeWidth={3.5 * u} />
      </> : <>
        {sig && <ellipse cx={m.x} cy={m.y} rx={36 * u} ry={12 * u} fill="none" stroke={m.color} strokeOpacity={0.6} strokeWidth={2 * u} />}
        <ellipse cx={m.x} cy={m.y} rx={ring.rx} ry={ring.ry} fill={m.color} fillOpacity={0.2} stroke={m.color} strokeWidth={3.5 * u} />
      </>)}
      {leader && cast && <line x1={lx} y1={ly} x2={m.x} y2={top} stroke="rgba(0,0,0,0.55)" strokeWidth={6 * u} strokeLinecap="round" />}
      {leader && <line x1={lx} y1={ly} x2={m.x} y2={top} stroke={m.color} strokeWidth={(sig ? 2 : 2.5) * u} strokeOpacity={0.9} strokeLinecap={cast ? "round" : undefined} />}
      {!m.ring && !showLabel && <circle cx={m.x} cy={m.y} r={7 * u} fill={m.color} />}
      {showLabel && sig && (
        <g>
          <polygon points={`${x0 + cut},${y0} ${x0 + pw},${y0} ${x0 + pw},${ly} ${x0},${ly} ${x0},${y0 + cut}`} fill="rgba(12,14,18,0.92)" stroke="rgba(255,255,255,0.12)" strokeWidth={u} strokeLinejoin="miter" />
          <polygon points={`${x0},${y0 + cut} ${x0 + bw},${y0 + cut - bw} ${x0 + bw},${ly} ${x0},${ly}`} fill={m.color} />
          <text ref={ref} x={x0 + bw + gap} y={ly - ph / 2} dominantBaseline="central" fill="#ffffff" fontSize={fs} fontWeight={800}
            style={{ fontFamily: CONDENSED, letterSpacing: "0.07em" }}>{text}</text>
        </g>
      )}
      {showLabel && style === "plain" && (
        <g>
          <rect x={x0} y={y0} width={pw} height={ph} rx={7 * u} fill={m.color} />
          <text ref={ref} x={lx} y={ly - ph / 2} textAnchor="middle" dominantBaseline="central" fill={inkFor(m.color)} fontSize={fs} fontWeight={700}
            style={{ fontFamily: CONDENSED, letterSpacing: "0.02em" }}>{text}</text>
        </g>
      )}
      {showLabel && cast && (
        <text ref={ref} x={lx} y={ly - ph / 2} textAnchor="middle" dominantBaseline="central" fill={m.color} fontSize={fs} fontWeight={700}
          stroke="#0a0b0d" strokeWidth={7.5 * u} paintOrder="stroke" strokeLinejoin="round"
          style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.015em" }}>{text}</text>
      )}
      {showLabel && bare && (
        <text ref={ref} x={lx} y={ly - ph / 2} textAnchor="middle" dominantBaseline="central" fill={m.color} fontSize={fs} fontWeight={800}
          stroke="rgba(0,0,0,0.75)" strokeWidth={6 * u} paintOrder="stroke" strokeLinejoin="round"
          style={{ fontFamily: CONDENSED, letterSpacing: "0.01em" }}>{text}</text>
      )}
    </g>
  )
}

function SpotMark({ m, U, h }: { m: Spot; U: number; h: number }) {
  const u = U * m.size
  const top = Math.max(0, m.y - 380 * u), id = "sp" + safeId(m.id)
  const half = (t: number) => (12 + (34 - 12) * t) * u // the beam widens as it comes down
  const fy = Math.min(h, m.y)
  return (
    <g data-id={m.id}>
      <defs>
        <linearGradient id={id + "b"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.color} stopOpacity={0} />
          <stop offset="0.55" stopColor={m.color} stopOpacity={0.22} />
          <stop offset="1" stopColor={m.color} stopOpacity={0.5} />
        </linearGradient>
        <radialGradient id={id + "g"}>
          <stop offset="0" stopColor={m.color} stopOpacity={0.75} />
          <stop offset="1" stopColor={m.color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <polygon points={`${m.x - half(0)},${top} ${m.x + half(0)},${top} ${m.x + half(1)},${fy} ${m.x - half(1)},${fy}`} fill={`url(#${id}b)`} />
      <ellipse cx={m.x} cy={fy} rx={46 * u} ry={14 * u} fill={`url(#${id}g)`} />
    </g>
  )
}

/* An outline zone or oval can be picked anywhere inside it, not only on its edge (pointerEvents visible). */

/** An oval that fits inside the zone's 4 corners, in perspective: tilt the corners and it lies flat on the pitch.
    The corners map a square onto the shot, and the circle inside that square is drawn through the same mapping. */
export function ovalPath(pts: Pt[]) {
  if (pts.length !== 4) return null
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = pts
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
  const den = dx1 * dy2 - dx2 * dy1
  const g = den ? (sx * dy2 - dx2 * sy) / den : 0, k = den ? (dx1 * sy - sx * dy1) / den : 0
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3
  const out: string[] = []
  for (let i = 0; i < 72; i++) {
    const t = (i / 72) * 2 * Math.PI, uu = 0.5 + 0.5 * Math.cos(t), vv = 0.5 + 0.5 * Math.sin(t)
    const q = g * uu + k * vv + 1
    if (!(q > 0.05)) return null // the corners are twisted: no oval fits, so the zone shape is drawn instead
    out.push(`${((a * uu + b * vv + x0) / q).toFixed(1)},${((d * uu + e * vv + y0) / q).toFixed(1)}`)
  }
  return "M" + out.join(" L") + " Z"
}

function ZoneMark({ m, U }: { m: Zone; U: number }) {
  const u = U * m.size
  const [cx, cy] = centroid(m.pts)
  const pts = m.pts.map(p => p.join(",")).join(" ")
  const oval = m.round ? ovalPath(m.pts) : null
  return (
    <g data-id={m.id}>
      {oval
        ? <path d={oval} fill={m.outline ? "none" : m.color} fillOpacity={m.opacity} stroke={m.color} strokeOpacity={m.outline ? 0.95 : 0.55}
          strokeWidth={(m.outline ? 4 : 2) * U} strokeLinejoin="round" pointerEvents="visible" />
        : <polygon points={pts} fill={m.outline ? "none" : m.color} fillOpacity={m.opacity} stroke={m.color} strokeOpacity={0.9} strokeWidth={3 * U}
          strokeDasharray={m.outline ? `${16 * U} ${10 * U}` : undefined} strokeLinejoin="round" pointerEvents="visible" />}
      {m.label.trim() && (
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill={m.color} fontSize={48 * u} fontWeight={800}
          stroke="rgba(0,0,0,0.55)" strokeWidth={6 * u} paintOrder="stroke" strokeLinejoin="round"
          style={{ fontFamily: CONDENSED, letterSpacing: "0.01em" }}>{m.label}</text>
      )}
    </g>
  )
}

/** The arrow's path: straight, or a curve through its middle handle */
export function arrowPath(a: Pt, b: Pt, c: Pt | null) {
  if (!c) return `M${a[0]},${a[1]} L${b[0]},${b[1]}`
  const q = ctrlFor(a, b, c)
  return `M${a[0]},${a[1]} Q${q[0]},${q[1]} ${b[0]},${b[1]}`
}
function head(tip: Pt, from: Pt, len: number, wid: number) {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  const bx = tip[0] - ux * len, by = tip[1] - uy * len
  return `${tip[0]},${tip[1]} ${bx - uy * wid / 2},${by + ux * wid / 2} ${bx + uy * wid / 2},${by - ux * wid / 2}`
}
function ArrowMark({ m, U }: { m: Arrow; U: number }) {
  const u = U * m.size
  const d = arrowPath(m.a, m.b, m.c)
  const sw = (m.dash === "dot" ? 8 : 6) * u
  const dash = m.dash === "dash" ? `${22 * u} ${14 * u}` : m.dash === "dot" ? `0.1 ${16 * u}` : undefined
  const q = m.c ? ctrlFor(m.a, m.b, m.c) : null
  const len = 26 * u, wid = 24 * u
  return (
    <g data-id={m.id}>
      <path d={d} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={sw + 4 * u} strokeDasharray={dash} strokeLinecap="round" />
      <path d={d} fill="none" stroke={m.color} strokeWidth={sw} strokeDasharray={dash} strokeLinecap="round" />
      {(m.head === "end" || m.head === "both") && <polygon points={head(m.b, q ?? m.a, len, wid)} fill={m.color} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5 * u} strokeLinejoin="round" />}
      {m.head === "both" && <polygon points={head(m.a, q ?? m.b, len, wid)} fill={m.color} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5 * u} strokeLinejoin="round" />}
    </g>
  )
}

function NoteMark({ m, U }: { m: Note; U: number }) {
  const u = U * m.size
  const fs = 28 * u, lh = fs * 1.32, pad = 18 * u
  const lines = (m.text || " ").split(String.fromCharCode(10))
  const [ref, tw] = useWidth([m.text, fs])
  const w = (tw || Math.max(...lines.map(l => l.length)) * fs * 0.52) + 2 * pad
  const h = lines.length * lh + 2 * pad - (lh - fs)
  return (
    <g data-id={m.id}>
      {m.box && <rect x={m.x} y={m.y} width={w} height={h} rx={10 * u} fill="rgba(12,14,18,0.82)" />}
      <text ref={ref} x={m.x + pad} y={m.y + pad} fill={m.color} fontSize={fs} fontWeight={600}
        stroke={m.box ? undefined : "rgba(0,0,0,0.6)"} strokeWidth={m.box ? undefined : 5 * u} paintOrder="stroke" strokeLinejoin="round"
        style={{ fontFamily: SANS }}>
        {lines.map((l, i) => <tspan key={i} x={m.x + pad} dy={i === 0 ? fs * 0.86 : lh}>{l || " "}</tspan>)}
      </text>
    </g>
  )
}


/* ── marks that live on the grass ── */
/** How thick lines are at a point: thinner far away when the shot is calibrated */
const depthK = (fit: Fit | null | undefined, p: Pt, U: number) => (fit ? Math.max(0.55, Math.min(1.5, ppmAt(fit, p) / (14 * U))) : 1)

function RingMark({ m, U, fit }: { m: Ring; U: number; fit?: Fit | null }) {
  const u = U * m.size, k = depthK(fit, [m.x, m.y], U)
  const sw = 3.4 * u * k
  const inner = fit ? pathOf(groundCircle(fit, [m.x, m.y], m.r * m.size), true) : null
  const outer = m.double ? (fit ? pathOf(groundCircle(fit, [m.x, m.y], m.r * m.size * 1.45), true) : null) : null
  const rx = 26 * u, ry = 9 * u
  return (
    <g data-id={m.id}>
      {inner ? <path d={inner} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={sw + 3 * U} /> : <ellipse cx={m.x} cy={m.y} rx={rx} ry={ry} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={sw + 3 * U} />}
      {inner ? <path d={inner} fill={m.color} fillOpacity={m.fill} stroke={m.color} strokeWidth={sw} /> : <ellipse cx={m.x} cy={m.y} rx={rx} ry={ry} fill={m.color} fillOpacity={m.fill} stroke={m.color} strokeWidth={sw} />}
      {m.double && (outer ? <path d={outer} fill="none" stroke={m.color} strokeOpacity={0.55} strokeWidth={sw * 0.6} /> : <ellipse cx={m.x} cy={m.y} rx={rx * 1.45} ry={ry * 1.45} fill="none" stroke={m.color} strokeOpacity={0.55} strokeWidth={sw * 0.6} />)}
    </g>
  )
}

/** A small value plate, e.g. 12.6 M */
function Chip({ at, text, U, bg = "#d7ff3c", fg = "#0d0f12", k = 1 }: { at: Pt; text: string; U: number; bg?: string; fg?: string; k?: number }) {
  const fs = 24 * U * k, h = fs + 12 * U * k, w = text.length * fs * 0.5 + 22 * U * k
  return (
    <g transform={`translate(${at[0] - w / 2},${at[1] - h / 2})`}>
      <rect width={w} height={h} rx={4 * U * k} fill={bg} stroke="rgba(0,0,0,0.35)" strokeWidth={1.5 * U} />
      <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="central" fill={fg} fontSize={fs} fontWeight={800} style={{ fontFamily: CONDENSED, letterSpacing: "0.03em" }}>{text}</text>
    </g>
  )
}

/** Where a tie ends: on the mark it is tied to (if it is still there), else its own point. Ties stop short of rings. */
function tieEnds(m: Tie, byId: Map<string, Mark>): [Pt, Pt] {
  const at = (ref: string | null, p: Pt): Pt => { const o = ref ? byId.get(ref) : undefined; return o && "x" in o && "y" in o ? [o.x, o.y] : p }
  return [at(m.ra, m.a), at(m.rb, m.b)]
}
function TieMark({ m, U, fit, byId }: { m: Tie; U: number; fit?: Fit | null; byId: Map<string, Mark> }) {
  const [a0, b0] = tieEnds(m, byId)
  const u = U * m.size
  // stop short of each end, by about a metre (or a ring's width)
  const trim = (p: Pt, q: Pt): Pt => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1
    const g = fit ? Math.min(d * 0.3, ppmAt(fit, p) * 1.15) : Math.min(d * 0.3, 26 * U)
    return [p[0] + ((q[0] - p[0]) * g) / d, p[1] + ((q[1] - p[1]) * g) / d]
  }
  const a = trim(a0, b0), b = trim(b0, a0)
  const d = `M${a[0]},${a[1]} L${b[0]},${b[1]}`
  const sw = 2.8 * u * depthK(fit, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], U)
  const dash = m.dash === "dash" ? `${16 * u} ${10 * u}` : m.dash === "dot" ? `0.1 ${10 * u}` : undefined
  const mm = fit && m.dist ? metres(fit, a0, b0) : null
  return (
    <g data-id={m.id}>
      <path d={d} stroke="rgba(0,0,0,0.42)" strokeWidth={sw + 3 * U} strokeLinecap="round" strokeDasharray={dash} fill="none" />
      <path d={d} stroke={m.color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={dash} fill="none" />
      <path d={d} stroke="transparent" strokeWidth={22 * U} fill="none" />
      {mm !== null && <Chip at={[(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2 - 22 * U]} text={fmtM(mm)} U={U} bg={m.color === "#d7ff3c" ? "#d7ff3c" : "#ffffff"} k={0.9} />}
    </g>
  )
}

function MeasureMark({ m, U, fit }: { m: Measure; U: number; fit?: Fit | null }) {
  const u = U * m.size
  const pts = fit ? groundLine(fit, m.a, m.b, 30) : [m.a, m.b]
  const dx = m.b[0] - m.a[0], dy = m.b[1] - m.a[1], L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * 12 * u, ny = (dx / L) * 12 * u
  const tick = (p: Pt) => `M${p[0] - nx},${p[1] - ny} L${p[0] + nx},${p[1] + ny}`
  const mid: Pt = [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2]
  const text = fit ? fmtM(metres(fit, m.a, m.b)) : "CALIBRATE"
  return (
    <g data-id={m.id}>
      {[pathOf(pts), tick(m.a), tick(m.b)].map((d, i) => <path key={"s" + i} d={d} stroke="rgba(0,0,0,0.5)" strokeWidth={5 * u} strokeLinecap="round" fill="none" />)}
      <path d={pathOf(pts)} stroke={m.color} strokeWidth={2.4 * u} strokeLinecap="round" strokeDasharray={`1 ${8 * u}`} fill="none" />
      {[tick(m.a), tick(m.b)].map((d, i) => <path key={"t" + i} d={d} stroke={m.color} strokeWidth={2.4 * u} strokeLinecap="round" fill="none" />)}
      <path d={pathOf(pts)} stroke="transparent" strokeWidth={22 * U} fill="none" />
      <Chip at={mid} text={text} U={U} />
    </g>
  )
}

function ShadowMark({ m, U, fit }: { m: Shadow; U: number; fit?: Fit | null }) {
  const gid = "sh" + safeId(m.id)
  let pts: Pt[], far: Pt
  if (fit) {
    const p = apply(fit.Hi, [m.x, m.y]), b = apply(fit.Hi, [m.bx, m.by])
    const ang = Math.atan2(p[1] - b[1], p[0] - b[0]), s = (m.spread * Math.PI) / 180
    const ground: Pt[] = [p]
    for (let i = 0; i <= 24; i++) { const a = ang - s + (2 * s * i) / 24; ground.push([p[0] + m.len * m.size * Math.cos(a), p[1] + m.len * m.size * Math.sin(a)]) }
    pts = ground.map(q => apply(fit.H, q))
    far = apply(fit.H, [p[0] + m.len * m.size * Math.cos(ang), p[1] + m.len * m.size * Math.sin(ang)])
  } else {
    const ang = Math.atan2(m.y - m.by, m.x - m.bx), s = (m.spread * Math.PI) / 180, L = 260 * U * m.size
    pts = [[m.x, m.y]]
    for (let i = 0; i <= 24; i++) { const a = ang - s + (2 * s * i) / 24; pts.push([m.x + L * Math.cos(a), m.y + L * Math.sin(a)]) }
    far = [m.x + L * Math.cos(ang), m.y + L * Math.sin(ang)]
  }
  return (
    <g data-id={m.id}>
      <defs>
        <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={m.x} y1={m.y} x2={far[0]} y2={far[1]}>
          <stop offset="0" stopColor={m.color} stopOpacity={0.45} /><stop offset="1" stopColor={m.color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={pathOf(pts, true)} fill={`url(#${gid})`} pointerEvents="visible" />
    </g>
  )
}

/** Focus: the picture outside the corners goes dark (drawn under every other mark) */
function FocusMark({ m, w, h }: { m: Focus; w: number; h: number }) {
  const mid = "fm" + safeId(m.id)
  return (
    <g data-id={m.id}>
      <defs><mask id={mid}><rect width={w} height={h} fill="white" /><polygon points={m.pts.map(p => p.join(",")).join(" ")} fill="black" /></mask></defs>
      <rect width={w} height={h} fill={m.color} fillOpacity={m.dim} mask={`url(#${mid})`} pointerEvents="none" />
      <polygon points={m.pts.map(p => p.join(",")).join(" ")} fill="transparent" stroke="#d7ff3c" strokeOpacity={0.0} pointerEvents="visibleStroke" strokeWidth={14} />
    </g>
  )
}

/** Marks are drawn in layers, so the pitch stays readable: zones and spotlights at the bottom, then arrows and lines,
    then player tags, then text on top. Inside a layer, later marks sit on top (Bring to front and Send to back change that). */
const LAYER: Record<Mark["kind"], number> = { focus: -1, zone: 0, shadow: 0, spot: 0, ring: 0.5, tie: 1, measure: 1, arrow: 1, tag: 2, text: 3 }
export const layered = (items: Mark[]) => [...items].sort((a, b) => LAYER[a.kind] - LAYER[b.kind])

/** All the marks on a shot */
export function Marks({ items, w, h, fit, only }: { items: Mark[]; w: number; h: number; fit?: Fit | null; only?: (m: Mark) => boolean }) {
  const U = Math.max(0.35, w / 1920)
  const byId = new Map(items.map(m => [m.id, m]))
  return (
    <g>
      {layered(items).filter(m => !only || only(m)).map(m =>
        m.kind === "tag" ? <TagMark key={m.id} m={m} U={U} fit={fit} />
          : m.kind === "spot" ? <SpotMark key={m.id} m={m} U={U} h={h} />
            : m.kind === "zone" ? <ZoneMark key={m.id} m={m} U={U} />
              : m.kind === "arrow" ? <ArrowMark key={m.id} m={m} U={U} />
                : m.kind === "ring" ? <RingMark key={m.id} m={m} U={U} fit={fit} />
                  : m.kind === "tie" ? <TieMark key={m.id} m={m} U={U} fit={fit} byId={byId} />
                    : m.kind === "measure" ? <MeasureMark key={m.id} m={m} U={U} fit={fit} />
                      : m.kind === "shadow" ? <ShadowMark key={m.id} m={m} U={U} fit={fit} />
                        : m.kind === "focus" ? <FocusMark key={m.id} m={m} w={w} h={h} />
                          : <NoteMark key={m.id} m={m} U={U} />)}
    </g>
  )
}
