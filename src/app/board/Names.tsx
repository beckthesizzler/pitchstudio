import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight } from "lucide-react"

/* Naming players straight on the pitch: a box sits under one player at a time, you type the name,
   Tab (or Enter) goes to the next one in team-sheet order, Shift+Tab goes back, Esc is done.
   "10 Pedri" sets the number too. */

export type NameRunPlayer = { id: string; name: string; num: string; team: "home" | "away"; pos?: string }

/** "10 Pedri", "#10 Pedri" or "Pedri 10" → number and name; anything else is just a name */
export function splitNumber(text: string): { name: string; num?: string } {
  const t = text.trim()
  const a = /^#?([0-9]{1,2})[ .:)-]+(.+)$/.exec(t)
  if (a) return { num: a[1], name: a[2].trim() }
  const b = /^(.+?) +#?([0-9]{1,2})$/.exec(t)
  if (b) return { name: b[1].trim(), num: b[2] }
  return { name: t }
}

export const NAMES_CSS = `
  .nr-box { position: fixed; z-index: 60; transform: translate(-50%, 0); display: flex; align-items: center; gap: 6px;
    padding: 5px 5px 5px 6px; border-radius: 14px; background: var(--ps-raised, #1b1d22); border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 12px 32px rgba(0,0,0,0.45), 0 0 0 4px rgba(215,255,60,0.16); animation: nr-in .16s ease-out; }
  .nr-box::before { content: ""; position: absolute; left: 50%; top: -6px; width: 10px; height: 10px; margin-left: -5px; transform: rotate(45deg);
    background: inherit; border-left: 1px solid rgba(255,255,255,0.14); border-top: 1px solid rgba(255,255,255,0.14); }
  .nr-num { min-width: 30px; height: 30px; padding: 0 6px; border-radius: 9px; display: grid; place-items: center; font: 800 14px 'Barlow Condensed', sans-serif; }
  .nr-box input { width: 190px; height: 30px; border: 0; outline: 0; background: transparent; color: inherit; font: 600 15px Inter, system-ui, sans-serif; }
  .nr-box input::placeholder { color: rgba(255,255,255,0.35); }
  .nr-hud { position: fixed; left: 50%; transform: translateX(-50%); z-index: 59; display: flex; align-items: center; gap: 10px; padding: 7px 8px 7px 14px;
    border-radius: 999px; font: 500 12.5px Inter, system-ui, sans-serif; white-space: nowrap; animation: nr-in .2s ease-out; }
  .nr-hud b { font-weight: 700; }
  .nr-hud kbd { font: 600 11px Inter, system-ui, sans-serif; padding: 1px 6px; border-radius: 6px; border: 1px solid rgba(127,127,127,0.35); opacity: .8; }
  .nr-hud button { height: 28px; padding: 0 10px; border-radius: 999px; border: 0; display: inline-flex; align-items: center; gap: 4px; font: 600 12.5px Inter, system-ui, sans-serif; cursor: pointer; }
  .nr-ring { animation: nr-pulse 1.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes nr-in { from { opacity: 0; transform: translate(-50%, 4px) } to { opacity: 1; transform: translate(-50%, 0) } }
  @keyframes nr-pulse { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
  @media (max-width: 640px) { .nr-hud .nr-keys { display: none } .nr-box input { width: 150px } }
`

export function NameRun({ players, ids, index, teamLabel, colors, onName, onMove, onDone, hudTop }: {
  players: NameRunPlayer[]; ids: string[]; index: number; teamLabel: (t: "home" | "away") => string
  colors: (t: "home" | "away") => { bg: string; fg: string }
  onName: (id: string, text: string) => void; onMove: (delta: number) => void; onDone: () => void; hudTop: number
}) {
  const id = ids[index], p = players.find(x => x.id === id)
  const input = useRef<HTMLInputElement>(null)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  // follow the player on screen (the board can be panned, zoomed or tilted while naming)
  useLayoutEffect(() => {
    let raf = 0
    const tick = () => {
      const el = document.querySelector(`[data-pid="${id}"]`)
      if (el) { const r = el.getBoundingClientRect(); setAt(a => (a && Math.abs(a.x - (r.left + r.width / 2)) < 0.5 && Math.abs(a.y - r.bottom) < 0.5 ? a : { x: r.left + r.width / 2, y: r.bottom })) }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [id])
  const placed = at !== null
  useEffect(() => { const el = input.current; if (el) { el.focus({ preventScroll: true }); el.select() } }, [id, placed]) // once the box is on screen, and on each new player
  if (!p) return null
  const team = p.team, mine = ids.filter(x => players.find(q => q.id === x)?.team === team), k = mine.indexOf(id) + 1
  const c = colors(team), isDefault = !!p.pos && p.name === p.pos
  return (
    <>
      {at && (
        <div className="nr-box" style={{ left: Math.max(130, Math.min(window.innerWidth - 130, at.x)), top: Math.min(window.innerHeight - 60, at.y + 10) }}
          onMouseDown={e => { if (e.target !== input.current) e.preventDefault() }}>
          <span className="nr-num" style={{ background: c.bg, color: c.fg }}>{p.num || "–"}</span>
          <input ref={input} value={isDefault ? "" : p.name} placeholder={p.pos ? `${p.pos} · type a name` : "Type a name"} maxLength={34}
            aria-label={`Name for ${teamLabel(team)} number ${p.num || k}`}
            onChange={e => onName(id, e.target.value)}
            onBlur={e => { const to = e.relatedTarget as HTMLElement | null; if (!to?.closest?.(".nr-hud")) onDone() }}
            onKeyDown={e => {
              if (e.key === "Tab") { e.preventDefault(); onMove(e.shiftKey ? -1 : 1) }
              else if (e.key === "Enter") { e.preventDefault(); onMove(1) }
              else if (e.key === "Escape") { e.preventDefault(); onDone() }
              else if (e.key === "ArrowDown") { e.preventDefault(); onMove(1) }
              else if (e.key === "ArrowUp") { e.preventDefault(); onMove(-1) }
            }} />
        </div>
      )}
      <div className="nr-hud st-glass" style={{ top: hudTop }} onMouseDown={e => e.preventDefault()}>
        <span><b>{teamLabel(team)}</b> · {k} of {mine.length}</span>
        <span className="nr-keys"><kbd>Tab</kbd> next · <kbd>⇧ Tab</kbd> back · <kbd>Esc</kbd> done</span>
        <button aria-label="Previous player" onClick={() => onMove(-1)} disabled={index === 0} style={{ background: "transparent", color: "inherit", opacity: index === 0 ? 0.35 : 1 }}><ChevronLeft size={15} /></button>
        <button aria-label="Next player" onClick={() => onMove(1)} style={{ background: "transparent", color: "inherit" }}><ChevronRight size={15} /></button>
        <button onClick={onDone} style={{ background: "#d7ff3c", color: "#0a0b0d" }}><Check size={14} /> Done</button>
      </div>
    </>
  )
}

/** One team's sheet: a row per player in team-sheet order, number and name. Picking a row picks the player on the pitch. */
export function TeamSheet({ rows, color, onPick, onChange }: {
  rows: NameRunPlayer[]; color: { bg: string; fg: string }
  onPick: (id: string | null) => void; onChange: (id: string, patch: { name?: string; num?: string }) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const go = (i: number) => (box.current?.querySelectorAll<HTMLInputElement>("input[data-name]")[i])?.focus()
  return (
    <div ref={box} role="list" aria-label="Team sheet" style={{ display: "flex", flexDirection: "column", gap: 4 }}
      onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node)) onPick(null) }}>
      {rows.map((p, i) => (
        <div key={p.id} role="listitem" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input value={p.num} maxLength={3} aria-label={`Number, row ${i + 1}`} onFocus={() => onPick(p.id)}
            onChange={e => onChange(p.id, { num: e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 3) })}
            style={{ width: 34, height: 28, borderRadius: 8, border: 0, outline: 0, textAlign: "center", background: color.bg, color: color.fg, font: "800 14px 'Barlow Condensed', sans-serif" }} />
          <input data-name value={p.pos && p.name === p.pos ? "" : p.name} placeholder={p.pos || "Name"} maxLength={34} aria-label={`Name, row ${i + 1}`} onFocus={() => onPick(p.id)}
            onChange={e => onChange(p.id, { name: e.target.value })}
            onKeyDown={e => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); go(i + 1) } else if (e.key === "ArrowUp") { e.preventDefault(); go(i - 1) } }}
            className="flex-1 min-w-0 rounded px-2 text-xs outline-none" style={{ height: 28, background: "var(--ps-surface-2, rgba(127,127,127,0.12))", color: "inherit", border: "1px solid rgba(127,127,127,0.25)" }} />
        </div>
      ))}
    </div>
  )
}
