/* Calibration: four (or more) points you can see on the pitch tell us how the camera looks at it.
   From them we work out a homography: the mapping from the pitch, in metres, to the picture, in pixels.
   With it, rings lie flat on the grass and get smaller with distance, and distances are measured in metres.
   The pitch is 105 by 68. x runs along it (0 is the goal on the left of the picture), y across it (0 is the far touchline). */

export type Pt = [number, number]
export type Mat = number[] // 3 by 3, row by row
/** A calibration point: where it is in the picture, and which pitch point it is */
export type CalPoint = { img: Pt; pitch: Pt; id: string }
export type Calib = { pts: CalPoint[] }

export const PITCH_L = 105, PITCH_W = 68

/** The pitch points you can pick, as seen from the main camera: far touchline at the top, left goal on the left */
export const LANDMARKS: { id: string; name: string; p: Pt }[] = (() => {
  const L = PITCH_L, W = PITCH_W, c = W / 2
  const side = (s: "L" | "R") => {
    const g = s === "L" ? 0 : L, d = s === "L" ? 1 : -1, nm = s === "L" ? "Left" : "Right"
    return [
      { id: s + "c0", name: `${nm} corner, far side`, p: [g, 0] as Pt },
      { id: s + "c1", name: `${nm} corner, near side`, p: [g, W] as Pt },
      { id: s + "b0", name: `${nm} box: far corner on the goal line`, p: [g, c - 20.16] as Pt },
      { id: s + "b1", name: `${nm} box: far front corner`, p: [g + d * 16.5, c - 20.16] as Pt },
      { id: s + "b2", name: `${nm} box: near front corner`, p: [g + d * 16.5, c + 20.16] as Pt },
      { id: s + "b3", name: `${nm} box: near corner on the goal line`, p: [g, c + 20.16] as Pt },
      { id: s + "s0", name: `${nm} six-yard box: far front corner`, p: [g + d * 5.5, c - 9.16] as Pt },
      { id: s + "s1", name: `${nm} six-yard box: near front corner`, p: [g + d * 5.5, c + 9.16] as Pt },
      { id: s + "d0", name: `${nm} D: where it meets the box, far side`, p: [g + d * 16.5, c - 7.31] as Pt },
      { id: s + "d1", name: `${nm} D: where it meets the box, near side`, p: [g + d * 16.5, c + 7.31] as Pt },
      { id: s + "ps", name: `${nm} penalty spot`, p: [g + d * 11, c] as Pt },
    ]
  }
  return [
    ...side("L"), ...side("R"),
    { id: "h0", name: "Halfway line, far touchline", p: [L / 2, 0] },
    { id: "h1", name: "Halfway line, near touchline", p: [L / 2, W] },
    { id: "cc", name: "Centre spot", p: [L / 2, c] },
    { id: "k0", name: "Centre circle, far side (on the halfway line)", p: [L / 2, c - 9.15] },
    { id: "k1", name: "Centre circle, near side (on the halfway line)", p: [L / 2, c + 9.15] },
  ]
})()

/** The lines of a pitch, for drawing the check overlay: each a list of pitch points */
export function pitchLines(): Pt[][] {
  const L = PITCH_L, W = PITCH_W, c = W / 2, out: Pt[][] = []
  const seg = (a: Pt, b: Pt) => out.push([a, b])
  seg([0, 0], [L, 0]); seg([0, W], [L, W]); seg([0, 0], [0, W]); seg([L, 0], [L, W]); seg([L / 2, 0], [L / 2, W])
  for (const [g, d] of [[0, 1], [L, -1]] as const) {
    seg([g, c - 20.16], [g + d * 16.5, c - 20.16]); seg([g + d * 16.5, c - 20.16], [g + d * 16.5, c + 20.16]); seg([g + d * 16.5, c + 20.16], [g, c + 20.16])
    seg([g, c - 9.16], [g + d * 5.5, c - 9.16]); seg([g + d * 5.5, c - 9.16], [g + d * 5.5, c + 9.16]); seg([g + d * 5.5, c + 9.16], [g, c + 9.16])
    // the D: the part of the circle around the penalty spot that is outside the box
    const arc: Pt[] = []
    const a0 = Math.acos(5.5 / 9.15)
    for (let i = 0; i <= 24; i++) { const t = -a0 + (2 * a0 * i) / 24; arc.push([g + d * (11 + 9.15 * Math.cos(t)), c + 9.15 * Math.sin(t)]) }
    out.push(arc)
  }
  const circ: Pt[] = []
  for (let i = 0; i <= 64; i++) { const t = (i / 64) * 2 * Math.PI; circ.push([L / 2 + 9.15 * Math.cos(t), c + 9.15 * Math.sin(t)]) }
  out.push(circ)
  return out
}

/* ── the maths ── */
export function apply(H: Mat, p: Pt): Pt {
  const x = H[0] * p[0] + H[1] * p[1] + H[2], y = H[3] * p[0] + H[4] * p[1] + H[5], w = H[6] * p[0] + H[7] * p[1] + H[8]
  return [x / w, y / w]
}
/** The w of a point: positive in front of the camera */
export const depth = (H: Mat, p: Pt) => H[6] * p[0] + H[7] * p[1] + H[8]
export function invert(m: Mat): Mat | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g
  const det = a * A + b * B + c * C
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det]
}
const mul = (A: Mat, B: Mat): Mat => {
  const o: Mat = new Array(9).fill(0)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c]
  return o
}
/** Moves points to have their centre at 0 and an average distance of √2 (makes the fit stable) */
function normaliser(pts: Pt[]): Mat {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
  const md = pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1
  const k = Math.SQRT2 / md
  return [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1]
}
/** Solves A x = b by Gaussian elimination with pivoting */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k] }
  }
  return M.map((r, i) => r[n] / r[i])
}
/** Twice the area of the biggest triangle of the points: 0 when they are all on one line */
function spread(pts: Pt[]) {
  let best = 0
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
    const [a, b, c] = [pts[i], pts[j], pts[k]]
    best = Math.max(best, Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])))
  }
  return best
}

export type Fit = { H: Mat; Hi: Mat; err: number } // err: the average miss of the points, in pixels
/** The pitch-to-picture mapping from 4 or more points, by least squares; null if the points can't give one */
export function fitCalib(c: Calib | null | undefined): Fit | null {
  if (!c || c.pts.length < 4) return null
  const src = c.pts.map(p => p.pitch), dst = c.pts.map(p => p.img)
  if (spread(src) < 20 || spread(dst) < 200) return null // the points are (nearly) on one line
  const Ts = normaliser(src), Td = normaliser(dst)
  const s = src.map(p => apply(Ts, p)), d = dst.map(p => apply(Td, p))
  // h33 = 1; normal equations of the 2n by 8 system
  const rows: number[][] = [], rhs: number[] = []
  s.forEach(([x, y], i) => {
    const [u, v] = d[i]
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); rhs.push(u)
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); rhs.push(v)
  })
  const AtA = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => rows.reduce((t, row) => t + row[r] * row[c], 0)))
  const Atb = Array.from({ length: 8 }, (_, r) => rows.reduce((t, row, k) => t + row[r] * rhs[k], 0))
  const h = solve(AtA, Atb)
  if (!h) return null
  const Hn: Mat = [...h, 1]
  const Tdi = invert(Td)
  if (!Tdi) return null
  let H = mul(Tdi, mul(Hn, Ts))
  H = H.map(v => v / H[8])
  const Hi = invert(H)
  if (!Hi || H.some(v => !Number.isFinite(v))) return null
  // every point must be in front of the camera, with the same sign
  const s0 = Math.sign(depth(H, src[0]))
  if (src.some(p => Math.sign(depth(H, p)) !== s0)) return null
  const err = dst.reduce((t, p, i) => { const q = apply(H, src[i]); return t + Math.hypot(q[0] - p[0], q[1] - p[1]) }, 0) / dst.length
  return { H, Hi, err }
}

/** Pixels per metre at a picture point (how big a metre looks there) */
export function ppmAt(f: Fit, img: Pt) {
  const p = apply(f.Hi, img)
  const a = apply(f.H, p), b = apply(f.H, [p[0] + 1, p[1]]), c = apply(f.H, [p[0], p[1] + 1])
  return (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - a[0], c[1] - a[1])) / 2
}
/** A circle of r metres on the grass around a picture point, as a closed path */
export function groundCircle(f: Fit, img: Pt, r: number, n = 48): Pt[] {
  const c = apply(f.Hi, img)
  return Array.from({ length: n }, (_, i) => apply(f.H, [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]))
}
/** The straight-line distance on the grass between two picture points, in metres */
export function metres(f: Fit, a: Pt, b: Pt) {
  const p = apply(f.Hi, a), q = apply(f.Hi, b)
  return Math.hypot(p[0] - q[0], p[1] - q[1])
}
/** Points along a line on the grass (straight on the grass is straight in the picture too, but this keeps dashes even) */
export function groundLine(f: Fit, a: Pt, b: Pt, n = 24): Pt[] {
  const p = apply(f.Hi, a), q = apply(f.Hi, b)
  return Array.from({ length: n + 1 }, (_, i) => apply(f.H, [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n]))
}
export const pathOf = (pts: Pt[], close = false) => "M" + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L") + (close ? " Z" : "")
export const fmtM = (m: number) => (m < 10 ? m.toFixed(1) : String(Math.round(m))) + " M"
