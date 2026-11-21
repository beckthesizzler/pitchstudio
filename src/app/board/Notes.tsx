import { useEffect, useRef } from "react"
import { PS_VOLT } from "../theme"

/* The idea under the pitch: up to four numbered points, written on the board itself and exported with it.
   A wide picture sets them side by side in columns; a tall one lists them. While you write, they're a plain list of boxes. */

export const MAX_POINTS = 4
export const POINT_MAX = 120
const LINE = 21, GAP_COL = 28, GAP_ROW = 12, GUTTER = 34, CHAR = 7.7, MAX_LINES = 3

/** Points as they're kept: trimmed, none empty, at most four, each cut to length */
export const cleanPoints = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((p): p is string => typeof p === "string").map(p => p.trim().slice(0, POINT_MAX)).filter(Boolean).slice(0, MAX_POINTS) : []

/** A board's old caption or narrative, as points (a line each), for boards made before the points existed */
export const pointsFrom = (text: string): string[] => cleanPoints(text.split(/\n+/))

function wrap(text: string, max: number): string[] {
  const out: string[] = []
  let line = ""
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const word = w.length > max ? w.slice(0, max - 1) + "…" : w
    if (line && (line + " " + word).length > max) { out.push(line); line = word } else line = line ? line + " " + word : word
  }
  if (line) out.push(line)
  if (out.length > MAX_LINES) { const keep = out.slice(0, MAX_LINES); keep[MAX_LINES - 1] = keep[MAX_LINES - 1].replace(/\s*\S*$/, "") + "…"; return keep }
  return out
}

/** How the points sit in a frame this wide: columns side by side on a wide picture, a list on a tall or narrow one. Sizes are at scale k. */
export function notesLayout(points: string[], frameW: number, k: number, wide = true) {
  const n = points.length
  if (!n) return { cols: 1, colW: 0, lines: [] as string[][], h: 0 }
  const usable = frameW - 72 * k
  const cols = wide && usable >= 760 * k ? n : 1
  const colW = (usable - (cols - 1) * GAP_COL * k) / cols
  const max = Math.max(12, Math.floor((colW - GUTTER * k) / (CHAR * k)))
  const lines = points.map(p => wrap(p, max))
  const h = cols > 1
    ? Math.max(...lines.map(l => l.length)) * LINE * k
    : lines.reduce((s, l) => s + l.length * LINE * k, 0) + (n - 1) * GAP_ROW * k
  return { cols, colW, lines, h }
}

/** The room the points need under the pitch (at full size), so the frame can make space for them */
export const notesRoom = (points: string[], frameW: number, wide = true) => { const h = notesLayout(points, frameW, 1, wide).h; return h ? h + 18 : 0 }
const ROW_H = 32
const editorHeight = (rows: number) => rows * ROW_H + 38
/** The boxes for writing are taller than the points they make: while you write, the frame makes room for them, so they never cover the pitch */
export const editorRoom = (points: string[]) => {
  const rows = points.length ? points : [""]
  const shown = rows.length < MAX_POINTS && rows[rows.length - 1].trim() ? rows.length + 1 : rows.length
  return editorHeight(shown) + 18
}

/** The points as they print: a lime number, then the words */
export function NotesBlock({ points, x, bottom, under, w, k, ink, wide, onEdit }: {
  points: string[]; x: number; bottom: number; w: number; k: number; ink: string
  under?: number // where the pitch ends: the points sit just under it when there's room
  wide?: boolean // a wide picture: the points side by side
  onEdit?: () => void // on screen, a click on the points starts writing
}) {
  const L = notesLayout(points, w, k, wide)
  if (!L.h) return null
  const top = under !== undefined ? Math.min(under + 24 * k, bottom - L.h) : bottom - L.h
  const num = ink === "#000000" ? "#4d6b00" : PS_VOLT // the number in lime, or a deep green on a light board
  let y = top
  return (
    <g data-notes="" style={{ cursor: onEdit ? "text" : undefined, pointerEvents: onEdit ? "auto" : "none" }} onClick={onEdit}>
      {onEdit && <rect x={x - 8 * k} y={top - 10 * k} width={w - 72 * k + 16 * k} height={L.h + 16 * k} fill="transparent" />}
      {L.lines.map((ls, i) => {
        const cx = L.cols > 1 ? x + i * (L.colW + GAP_COL * k) : x
        const cy = L.cols > 1 ? top : y
        if (L.cols === 1) y += ls.length * LINE * k + GAP_ROW * k
        return (
          <g key={i}>
            <text x={cx} y={cy + 15 * k} fill={num} fontSize={14 * k} fontWeight={700} style={{ fontFamily: "'JetBrains Mono',monospace" }}>{String(i + 1).padStart(2, "0")}</text>
            {ls.map((t, j) => (
              <text key={j} x={cx + GUTTER * k} y={cy + 15 * k + j * LINE * k} fill={ink} fillOpacity={0.9} fontSize={15 * k} style={{ fontFamily: "'Inter',sans-serif" }}>{t}</text>
            ))}
          </g>
        )
      })}
    </g>
  )
}

/** Writing the points, in place under the pitch: a box per point. Enter goes to the next one, Backspace in an empty one goes back. */
export function NotesEditor({ points, x, bottom, under, w, k, onChange, onDone }: {
  points: string[]; x: number; bottom: number; under?: number; w: number; k: number
  onChange: (p: string[]) => void; onDone: () => void
}) {
  const rows = points.length ? points : [""]
  const shown = rows.length < MAX_POINTS && rows[rows.length - 1].trim() ? [...rows, ""] : rows
  const rowH = ROW_H * k, h = editorHeight(shown.length) * k
  const box = useRef<HTMLDivElement>(null)
  // straight to the box if it's there, so the next key lands in it; a box that's about to appear gets the focus once it's drawn
  const focusAt = (i: number) => {
    const el = box.current?.querySelectorAll<HTMLInputElement>("input")[i]
    if (el) el.focus(); else requestAnimationFrame(() => box.current?.querySelectorAll<HTMLInputElement>("input")[i]?.focus())
  }
  useEffect(() => { focusAt(Math.max(0, rows.length - 1)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // a click anywhere else on the page ends writing
  useEffect(() => {
    const off = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) onDone() }
    window.addEventListener("pointerdown", off, true)
    return () => window.removeEventListener("pointerdown", off, true)
  }, [onDone])
  const set = (i: number, v: string) => {
    const next = [...shown]; next[i] = v.slice(0, POINT_MAX)
    onChange(next.filter((p, j) => p || j === i).slice(0, MAX_POINTS)) // an empty box stays only while you're in it
  }
  const key = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value
    if (e.key === "Enter") { e.preventDefault(); if (!v.trim()) { onDone(); return } if (i + 1 < MAX_POINTS) focusAt(i + 1); else onDone() }
    else if (e.key === "Backspace" && !v && i > 0) { e.preventDefault(); onChange(shown.filter((_, j) => j !== i).filter(Boolean)); focusAt(i - 1) }
    else if (e.key === "Escape") { e.preventDefault(); onDone() }
    else if (e.key === "ArrowUp" && i > 0) { e.preventDefault(); focusAt(i - 1) }
    else if (e.key === "ArrowDown" && i + 1 < shown.length) { e.preventDefault(); focusAt(i + 1) }
    e.stopPropagation() // board shortcuts stay quiet while you type
  }
  return (
    <foreignObject data-noexport="" x={x - 12 * k} y={under !== undefined ? Math.min(under + 18 * k, bottom - h) : bottom - h} width={w - 72 * k + 24 * k} height={h}>
      <div ref={box} onPointerDown={e => e.stopPropagation()}
        style={{ boxSizing: "border-box", height: "100%", padding: `${8 * k}px ${12 * k}px`, borderRadius: 8 * k, border: `${2 * k}px dashed ${PS_VOLT}`, background: "rgba(14,15,18,.86)", display: "flex", flexDirection: "column", gap: 0, fontFamily: "'Inter',sans-serif" }}>
        <div style={{ font: `700 ${11 * k}px 'JetBrains Mono',monospace`, letterSpacing: ".16em", color: PS_VOLT, height: 22 * k, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>THE IDEA · UP TO 4 POINTS</span><span style={{ color: "#a3a3ad", letterSpacing: ".04em", fontFamily: "'Inter',sans-serif", fontWeight: 500 }}>Enter for the next · Esc when done</span>
        </div>
        {shown.map((p, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 10 * k, height: rowH }}>
            <b style={{ font: `700 ${14 * k}px 'JetBrains Mono',monospace`, color: p ? PS_VOLT : "#6b6b75", width: 22 * k }}>{String(i + 1).padStart(2, "0")}</b>
            <input value={p} maxLength={POINT_MAX} placeholder={i === 0 ? "What should people see? One line." : "Add a point"} aria-label={`Point ${i + 1}`}
              onChange={e => set(i, e.target.value)} onKeyDown={key(i)}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: "#f4f4f6", font: `400 ${15 * k}px 'Inter',sans-serif` }} />
          </label>
        ))}
      </div>
    </foreignObject>
  )
}
