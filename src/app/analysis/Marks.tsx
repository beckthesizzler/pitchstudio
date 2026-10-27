import { useLayoutEffect, useRef, useState } from "react"
import { inkFor } from "../brand/brand"
import { centroid, ctrlFor, type Arrow, type Mark, type Note, type Pt, type Spot, type Tag, type Zone } from "./model"

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

/* A player tag in one of three styles:
   sig    the PitchStudio signature. A dark plate with its top left corner cut at 45 degrees (the Pitch Block's corner),
          a block of the tag colour down its left edge that follows the same cut, the name in spaced capitals,
          and a thin echo ring around the ground ring.
   plain  a rounded plate in the tag colour.
   bare   just the name, outlined so it reads on grass.
   The ring is solid, a glow (a soft halo with a bright disc), or off. */
function TagMark({ m, U }: { m: Tag; U: number }) {
  const u = U * m.size
  const style = m.style ?? "sig", sig = style === "sig", bare = style === "bare"
  const text = sig ? m.label.toUpperCase() : m.label
  const fs = (sig ? 23 : bare ? 30 : 25) * u, ph = (sig ? 34 : 36) * u, pad = 12 * u
  const bw = 6 * u, gap = 9 * u, cut = 9 * u // signature: block width, space after it, the cut corner
  const [ref, tw] = useWidth([text, fs, style])
  const lx = m.x + m.dx, ly = m.y + m.dy
  const textW = tw || text.length * fs * 0.5
  const pw = sig ? bw + gap + textW + 11 * u : textW + 2 * pad
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
      {m.ring && !m.glow && <>
        {sig && <ellipse cx={m.x} cy={m.y} rx={34 * u} ry={11.5 * u} fill="none" stroke={m.color} strokeOpacity={0.5} strokeWidth={1.5 * u} />}
        <ellipse cx={m.x} cy={m.y} rx={ring.rx} ry={ring.ry} fill={m.color} fillOpacity={0.2} stroke={m.color} strokeWidth={3.5 * u} />
      </>}
      {leader && <line x1={lx} y1={ly} x2={m.x} y2={top} stroke={m.color} strokeWidth={(sig ? 2 : 2.5) * u} strokeOpacity={0.9} />}
      {!m.ring && !showLabel && <circle cx={m.x} cy={m.y} r={7 * u} fill={m.color} />}
      {showLabel && sig && (
        <g>
          <polygon points={`${x0 + cut},${y0} ${x0 + pw},${y0} ${x0 + pw},${ly} ${x0},${ly} ${x0},${y0 + cut}`} fill="rgba(12,14,18,0.86)" stroke="rgba(255,255,255,0.1)" strokeWidth={u} strokeLinejoin="miter" />
          <polygon points={`${x0},${y0 + cut} ${x0 + bw},${y0 + cut - bw} ${x0 + bw},${ly} ${x0},${ly}`} fill={m.color} />
          <text ref={ref} x={x0 + bw + gap} y={ly - ph / 2} dominantBaseline="central" fill="#ffffff" fontSize={fs} fontWeight={700}
            style={{ fontFamily: CONDENSED, letterSpacing: "0.06em" }}>{text}</text>
        </g>
      )}
      {showLabel && style === "plain" && (
        <g>
          <rect x={x0} y={y0} width={pw} height={ph} rx={7 * u} fill={m.color} />
          <text ref={ref} x={lx} y={ly - ph / 2} textAnchor="middle" dominantBaseline="central" fill={inkFor(m.color)} fontSize={fs} fontWeight={700}
            style={{ fontFamily: CONDENSED, letterSpacing: "0.02em" }}>{text}</text>
        </g>
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

/** Marks are drawn in layers, so the pitch stays readable: zones and spotlights at the bottom, then arrows and lines,
    then player tags, then text on top. Inside a layer, later marks sit on top (Bring to front and Send to back change that). */
const LAYER: Record<Mark["kind"], number> = { zone: 0, spot: 0, arrow: 1, tag: 2, text: 3 }
export const layered = (items: Mark[]) => [...items].sort((a, b) => LAYER[a.kind] - LAYER[b.kind])

/** All the marks on a shot */
export function Marks({ items, w, h }: { items: Mark[]; w: number; h: number }) {
  const U = Math.max(0.35, w / 1920)
  return (
    <g>
      {layered(items).map(m =>
        m.kind === "tag" ? <TagMark key={m.id} m={m} U={U} />
          : m.kind === "spot" ? <SpotMark key={m.id} m={m} U={U} h={h} />
            : m.kind === "zone" ? <ZoneMark key={m.id} m={m} U={U} />
              : m.kind === "arrow" ? <ArrowMark key={m.id} m={m} U={U} />
                : <NoteMark key={m.id} m={m} U={U} />)}
    </g>
  )
}
