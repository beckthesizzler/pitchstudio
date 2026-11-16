import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { Note } from "./notes"

/* The wall's pieces: how a pile's slips stack down its column, the red threads between them, the pile's plant stage,
   the cloth banner with the wall's name, and the small menu that opens on a slip or a pile. */

export const THREAD = "#B3261E"
/** Slip sizes: in the pile, one level in, two levels or deeper */
const SLIPS = [{ w: 236, h: 64 }, { w: 214, h: 58 }, { w: 192, h: 58 }]
export const STACK_W = 236
const INDENT = 22, GAP = 12
/** Where a slip's pin sits (and what it turns around) */
export const PIN = { x: 14, y: 12 }
export const TILTS = [-0.9, 0, 0.9]

export type Row = { note: Note; depth: number; parent: string | null; x: number; y: number; w: number; h: number }

/** One column: each idea, then everything tied under it, stacked down in pos order. `seen` keeps a note from showing twice. */
export function layoutColumn(roots: Note[], kids: (id: string) => Note[], seen: Set<string>): { rows: Row[]; height: number } {
  const rows: Row[] = []
  let y = 0
  const walk = (list: Note[], depth: number, parent: string | null) => {
    for (const n of list) {
      if (n.kind !== "note" || seen.has(n.id)) continue
      seen.add(n.id)
      const d = Math.min(depth, 2), s = SLIPS[d]
      rows.push({ note: n, depth, parent, x: d * INDENT, y, w: s.w, h: s.h })
      y += s.h + GAP
      walk(kids(n.id), depth + 1, n.id)
    }
  }
  walk(roots, 0, null)
  return { rows, height: Math.max(0, y - GAP) }
}

/** Every tie in a pile grows its plant: 0 seed, 1 sprout, 2 or 3 sapling, 4 or more tree. rank: higher is bigger. */
const STAGES = [{ min: 4, id: "tree", label: "Tree", rank: 3 }, { min: 2, id: "sapling", label: "Sapling", rank: 2 }, { min: 1, id: "sprout", label: "Sprout", rank: 1 }, { min: 0, id: "seed", label: "Seed", rank: 0 }] as const
export const plantStage = (ties: number) => STAGES.find(s => ties >= s.min) ?? STAGES[STAGES.length - 1]

/** A red thread from one pin to another, hanging a little slack */
function threadPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const len = Math.hypot(b.x - a.x, b.y - a.y), bow = Math.min(12, len * 0.1)
  return `M${a.x} ${a.y} Q${((a.x + b.x) / 2 - bow).toFixed(1)} ${((a.y + b.y) / 2 + bow * 0.5).toFixed(1)} ${b.x} ${b.y}`
}

/** The thread layer over a column's slips: each idea's pin to the pin of the idea it hangs from */
export function Threads({ rows, height }: { rows: Row[]; height: number }) {
  const at = new Map(rows.map(r => [r.note.id, r]))
  return (
    <svg className="bd-threads" width={STACK_W} height={height} aria-hidden="true">
      {rows.map(r => {
        const p = r.parent ? at.get(r.parent) : undefined
        if (!p) return null
        const a = { x: r.x + PIN.x, y: r.y + PIN.y }, b = { x: p.x + PIN.x, y: p.y + PIN.y }
        return (
          <g key={r.note.id}>
            <path d={threadPath(a, b)} fill="none" stroke={THREAD} strokeWidth="2" strokeLinecap="round" />
            <circle cx={a.x} cy={a.y} r="2.2" fill={THREAD} /><circle cx={b.x} cy={b.y} r="2.2" fill={THREAD} />
          </g>
        )
      })}
    </svg>
  )
}

const WALL_KEY = "ps-wall-name", WALL_DEFAULT = "MY IDEAS"
const readWall = () => { try { return localStorage.getItem(WALL_KEY)?.trim() || WALL_DEFAULT } catch { return WALL_DEFAULT } }

/** The cloth banner across the top of the wall. Click it to rename the wall (kept in this browser). */
export function Banner() {
  const [name, setName] = useState(readWall)
  const [edit, setEdit] = useState<string | null>(null)
  const done = (keep: boolean) => {
    if (keep && edit !== null) {
      const v = edit.trim() || WALL_DEFAULT
      setName(v)
      try { if (v === WALL_DEFAULT) localStorage.removeItem(WALL_KEY); else localStorage.setItem(WALL_KEY, v) } catch { /* storage blocked: kept for this visit */ }
    }
    setEdit(null)
  }
  return (
    <div className="bd-banner-row">
      {edit === null
        ? <button className="bd-banner" onClick={() => setEdit(name)} aria-label={`Wall name: ${name}. Rename`} title="Rename the wall">{name}</button>
        : <input className="bd-banner" value={edit} maxLength={40} autoFocus aria-label="Wall name" onFocus={e => e.currentTarget.select()}
            onChange={e => setEdit(e.target.value)} onBlur={() => done(true)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); done(true) } else if (e.key === "Escape") { e.preventDefault(); done(false) } }} />}
    </div>
  )
}

/** A small menu at a point, kept on screen. Arrow keys move through it; Escape or a click outside closes it. */
export function Popover({ x, y, label, onClose, children }: { x: number; y: number; label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState({ left: x, top: y })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect(), left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8))
    setAt(p => (p.left === left && p.top === top ? p : { left, top }))
  })
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus({ preventScroll: true })
    return () => { if (back?.isConnected) back.focus({ preventScroll: true }) }
  }, [])
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const items = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement), down = e.key === "ArrowDown"
    items[i < 0 ? (down ? 0 : items.length - 1) : (i + (down ? 1 : -1) + items.length) % items.length]?.focus()
  }
  return (
    <>
      <div className="bd-menu-back" onPointerDown={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={ref} className="bd-menu" role="menu" aria-label={label} style={at} onKeyDown={onKey}>{children}</div>
    </>
  )
}
