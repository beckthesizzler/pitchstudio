/* Hand-drawn shapes for Brain Dump: every box, oval and arrow is drawn with a slight wobble, twice over, like a pen sketch.
   The wobble comes from the shape's own id, so a shape looks the same every time it's drawn. */

export function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000 }
}

/** A rounded box, drawn as two slightly different pen strokes */
export function sketchBox(x: number, y: number, w: number, h: number, seed: string, r = 12, rough = 1.4): string {
  const out: string[] = []
  for (let pass = 0; pass < 2; pass++) {
    const R = rng(seed + pass), j = () => (R() - 0.5) * 2 * rough
    const rr = Math.min(r, w / 2, h / 2)
    const p = (px: number, py: number) => `${(px + j()).toFixed(1)},${(py + j()).toFixed(1)}`
    out.push(`M${p(x + rr, y)} L${p(x + w - rr, y)} Q${p(x + w, y)} ${p(x + w, y + rr)} L${p(x + w, y + h - rr)} Q${p(x + w, y + h)} ${p(x + w - rr, y + h)} L${p(x + rr, y + h)} Q${p(x, y + h)} ${p(x, y + h - rr)} L${p(x, y + rr)} Q${p(x, y)} ${p(x + rr + j(), y)}`)
  }
  return out.join(" ")
}

/** An oval, drawn as two slightly different pen strokes that don't quite close */
export function sketchEllipse(cx: number, cy: number, rx: number, ry: number, seed: string, rough = 1.6): string {
  const out: string[] = []
  for (let pass = 0; pass < 2; pass++) {
    const R = rng(seed + "e" + pass), start = R() * Math.PI * 2, pts: string[] = []
    for (let i = 0; i <= 26; i++) {
      const t = start + (i / 24) * Math.PI * 2, k = 1 + (R() - 0.5) * 0.03
      pts.push(`${(cx + Math.cos(t) * rx * k + (R() - 0.5) * rough).toFixed(1)},${(cy + Math.sin(t) * ry * k + (R() - 0.5) * rough).toFixed(1)}`)
    }
    out.push("M" + pts.join(" L"))
  }
  return out.join(" ")
}

/** A line with a gentle bow, drawn twice */
export function sketchLine(x1: number, y1: number, x2: number, y2: number, seed: string, bow = 0.04): string {
  const out: string[] = []
  for (let pass = 0; pass < 2; pass++) {
    const R = rng(seed + "l" + pass), dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1
    const b = (R() - 0.5) * 2 * bow * len, mx = (x1 + x2) / 2 - (dy / len) * b, my = (y1 + y2) / 2 + (dx / len) * b
    const j = () => (R() - 0.5) * 1.6
    out.push(`M${(x1 + j()).toFixed(1)},${(y1 + j()).toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${(x2 + j()).toFixed(1)},${(y2 + j()).toFixed(1)}`)
  }
  return out.join(" ")
}

/** The two strokes of an arrowhead at (x2, y2), pointing away from (x1, y1) */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, size = 13): string {
  const a = Math.atan2(y2 - y1, x2 - x1), s = 0.45
  const p = (t: number) => `${(x2 - size * Math.cos(a + t)).toFixed(1)},${(y2 - size * Math.sin(a + t)).toFixed(1)}`
  return `M${p(s)} L${x2.toFixed(1)},${y2.toFixed(1)} L${p(-s)}`
}

/** Where a line from the middle of a box towards (tx, ty) leaves the box */
export function edgePoint(b: { x: number; y: number; w: number; h: number }, tx: number, ty: number, round = false, gap = 6) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy
  if (!dx && !dy) return { x: cx, y: cy }
  if (round) {
    const rx = b.w / 2 + gap, ry = b.h / 2 + gap, t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
    return { x: cx + dx * t, y: cy + dy * t }
  }
  const sx = (b.w / 2 + gap) / Math.abs(dx || 1e-6), sy = (b.h / 2 + gap) / Math.abs(dy || 1e-6), t = Math.min(sx, sy)
  return { x: cx + dx * t, y: cy + dy * t }
}

/** Pen colours for shapes: a soft fill and a stronger stroke */
export const INKS: { id: string; fill: string; stroke: string }[] = [
  { id: "blue", fill: "#dbeafe", stroke: "#3b6fd8" },
  { id: "red", fill: "#fde2e1", stroke: "#d9483b" },
  { id: "green", fill: "#dcf5e3", stroke: "#2f9e57" },
  { id: "yellow", fill: "#fdf3c4", stroke: "#c99a06" },
  { id: "purple", fill: "#ece4ff", stroke: "#7c5cd6" },
  { id: "grey", fill: "#f1f0ec", stroke: "#57544c" },
]
export const ink = (id: string) => INKS.find(i => i.id === id) ?? INKS[5]
export const HAND = "'Kalam', 'Comic Sans MS', 'Segoe Print', cursive"
let fontAsked = false
/** The handwriting font, fetched once when Brain Dump opens */
export function loadHand() {
  if (fontAsked || typeof document === "undefined") return
  fontAsked = true
  const l = document.createElement("link")
  l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap"
  document.head.appendChild(l)
}
