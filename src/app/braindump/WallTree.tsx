import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Maximize2, Minus, Plus } from "lucide-react"
import { col, nameOf, type Note } from "./notes"
import { THREAD } from "./Wall"
import { HAND } from "./sketch"
import { supabase } from "../lib/supabase"

/* The Tree view of a wall: the same notes, grown left to right. Each frame is a root, the notes in it branch off it,
   and what's tied to a note hangs off that note. Press + on any note to grow the next step after it. Loose notes with
   nothing tied to them wait in a tray at the bottom until you drop them onto a branch. */

const NODE = { w: 210, h: 58 }, ROOT_W = 190, COL = 260, ROW = 70, TREE_GAP = 34, PAD = 30

type Placed = { n: Note; x: number; y: number; w: number; h: number; root: boolean; depth: number }
type Edge = { from: string; to: string }

function grow(roots: Note[], kids: (id: string) => Note[]) {
  const out: Placed[] = [], edges: Edge[] = [], seen = new Set<string>()
  let cursor = PAD
  const walk = (n: Note, depth: number): { top: number; bottom: number } => {
    seen.add(n.id)
    const ch = kids(n.id).filter(k => k.kind === "note" && !seen.has(k.id))
    const x = PAD + (depth === 0 ? 0 : ROOT_W + 50 + (depth - 1) * COL)
    if (!ch.length) {
      const y = cursor; cursor += ROW
      out.push({ n, x, y, w: depth === 0 ? ROOT_W : NODE.w, h: depth === 0 ? 46 : NODE.h, root: depth === 0, depth })
      return { top: y, bottom: y }
    }
    const spans = ch.map(k => { edges.push({ from: n.id, to: k.id }); return walk(k, depth + 1) })
    const y = (spans[0].top + spans[spans.length - 1].bottom) / 2
    out.push({ n, x, y, w: depth === 0 ? ROOT_W : NODE.w, h: depth === 0 ? 46 : NODE.h, root: depth === 0, depth })
    return { top: spans[0].top, bottom: spans[spans.length - 1].bottom }
  }
  for (const r of roots) { walk(r, 0); cursor += TREE_GAP }
  const W = Math.max(0, ...out.map(p => p.x + p.w)) + PAD, H = Math.max(cursor - TREE_GAP, 0) + PAD
  return { out, edges, W, H }
}

/** A note that's a wall, on the tree: closed (one box) until you peek inside it */
function Peek({ wall, count }: { wall: string; count: number }) {
  const [list, setList] = useState<{ id: string; title: string; color: string }[] | null>(null)
  useEffect(() => {
    let off = false
    ;(supabase as any).from("notes").select("id, title, color, kind").eq("wall_id", wall).eq("kind", "note").order("updated_at", { ascending: false }).limit(3)
      .then(({ data }: any) => { if (!off) setList(((data ?? []) as any[]).map(x => ({ id: String(x.id), title: String(x.title || "New idea"), color: String(x.color) }))) })
    return () => { off = true }
  }, [wall])
  return (
    <div className="wt-peek" aria-label="Inside this wall">
      <b>Inside</b>
      {list === null ? <small>Looking…</small> : list.length ? list.map(x => <span key={x.id} style={{ background: col(x.color as any).c }}>{x.title}</span>) : <small>Nothing pinned yet</small>}
      {count > 3 && <small>+ {count - 3} more</small>}
    </div>
  )
}

export function WallTree({ notes, kids, sel, dim, editing, onEdit, onTitle, onDoneEdit, onGrowFrom, slipDown, dragId, overId, onSelect, onOpen, onMenu, inside }: {
  notes: Note[]; kids: (id: string | null) => Note[]; sel: string | null; dim: (n: Note) => boolean
  editing: string | null; onEdit: (id: string | null) => void; onTitle: (id: string, t: string) => void
  onDoneEdit: (id: string, next: "none" | "sibling") => void
  onGrowFrom: (parent: string) => void
  slipDown: (e: React.PointerEvent, id: string) => void; dragId: string | null; overId: string | null
  onSelect: (id: string) => void; onOpen: (id: string) => void; onMenu: (kind: "note" | "pile", id: string, x: number, y: number) => void
  inside: Map<string, { wall: string; notes: number }>
}) {
  const [peeked, setPeeked] = useState<Set<string>>(new Set())
  const frames = notes.filter(n => n.kind === "tree").sort((a, b) => a.pos - b.pos)
  const loose = kids(null).filter(n => n.kind === "note")
  const rootsLoose = loose.filter(n => kids(n.id).some(k => k.kind === "note")) // a loose note with things tied to it grows its own little tree
  const tray = loose.filter(n => !kids(n.id).some(k => k.kind === "note"))
  const T = useMemo(() => grow([...frames, ...rootsLoose], id => kids(id)), [notes]) // eslint-disable-line react-hooks/exhaustive-deps
  const at = useMemo(() => new Map(T.out.map(p => [p.n.id, p])), [T])
  const scroller = useRef<HTMLDivElement>(null)
  const [z, setZ] = useState(1)
  const fit = () => { const el = scroller.current; if (el && T.W) setZ(Math.max(0.4, Math.min(1, (el.clientWidth - 20) / T.W, (el.clientHeight - 20) / Math.max(T.H, 300)))) }
  useLayoutEffect(() => { const el = scroller.current; if (el && el.clientWidth < 560) setZ(0.8) }, [])
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) setTimeout(() => input.current?.focus(), 30) }, [editing])
  const path = (a: Placed, b: Placed) => { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, m = (x1 + x2) / 2; return `M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}` }
  return (
    <div className="wt">
      <div className="wt-scroll" ref={scroller}>
        {!T.out.length
          ? <p className="wt-empty">Start a frame, or tie two notes together, and your tree grows here.</p>
          : <div className="wt-canvas" style={{ width: T.W, height: T.H, zoom: z }}>
              <svg width={T.W} height={T.H} className="wt-wood" aria-hidden="true">
                {T.edges.map(e => { const a = at.get(e.from), b = at.get(e.to); return a && b ? <path key={e.to} d={path(a, b)} fill="none" stroke={a.root && a.n.kind === "tree" ? "#8A7A62" : THREAD} strokeWidth={a.root ? 3 : 2.2} strokeLinecap="round" /> : null })}
              </svg>
              {T.out.map(P => {
                const n = P.n, c = col(n.color)
                if (P.root && n.kind === "tree") return (
                  <div key={n.id} className={`wt-root${dragId && overId === `pile:${n.id}` ? " over" : ""}`} data-drop={`pile:${n.id}`} style={{ left: P.x, top: P.y, width: P.w, height: P.h }}
                    onContextMenu={e => { e.preventDefault(); onMenu("pile", n.id, e.clientX, e.clientY) }}>
                    <i style={{ background: c.root }} /><b>{nameOf(n)}</b>
                    <button className="wt-plus" aria-label={`Grow a step from ${nameOf(n)}`} onClick={() => onGrowFrom(n.id)}><Plus size={14} /></button>
                  </div>
                )
                if (editing === n.id) return (
                  <div key={n.id} className="wt-node edit" style={{ left: P.x, top: P.y, width: P.w, height: P.h, ["--paper" as any]: c.c }}>
                    <input ref={input} value={n.title} maxLength={120} placeholder="The next step…" aria-label="The next step"
                      onChange={e => onTitle(n.id, e.target.value)}
                      onBlur={() => onDoneEdit(n.id, "none")}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onDoneEdit(n.id, "none") } else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); onDoneEdit(n.id, "sibling") } else if (e.key === "Escape") { e.preventDefault(); onDoneEdit(n.id, "none") } }} />
                    <small>Enter adds it · Tab adds another</small>
                  </div>
                )
                const over = !!dragId && dragId !== n.id && overId === `note:${n.id}`, W = inside.get(n.id)
                return (
                  <div key={n.id} className={`wt-node${P.root ? " lone" : ""}${dragId === n.id ? " lifted" : ""}${over ? " over" : ""}${dim(n) ? " dim" : ""}${W ? " walled" : ""}`} data-drop={`note:${n.id}`}
                    style={{ left: P.x, top: P.y, width: P.w, height: P.h, ["--paper" as any]: c.c, ["--pin" as any]: c.root }}>
                    <button className="wt-face" aria-pressed={sel === n.id} onPointerDown={e => slipDown(e, n.id)} onClick={() => onSelect(n.id)} onDoubleClick={() => onOpen(n.id)}
                      onContextMenu={e => { e.preventDefault(); onMenu("note", n.id, e.clientX, e.clientY) }}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onOpen(n.id) } else if (e.key === "+" || e.key === "=") { e.preventDefault(); onGrowFrom(n.id) } }}
                      aria-label={`${nameOf(n)}. Enter opens it, plus grows the next step`}>
                      <span>{nameOf(n)}</span>
                      {W && <small>▤ A wall · {W.notes} notes</small>}
                    </button>
                    {W && <button className="wt-peekbtn" aria-expanded={peeked.has(n.id)} onClick={() => setPeeked(s => { const t = new Set(s); t.has(n.id) ? t.delete(n.id) : t.add(n.id); return t })}>{peeked.has(n.id) ? "▾ Hide what's inside" : "▸ Show what's inside"}</button>}
                    {W && peeked.has(n.id) && <Peek wall={W.wall} count={W.notes} />}
                    <button className="wt-plus" aria-label={`Grow a step after ${nameOf(n)}`} onClick={() => onGrowFrom(n.id)}><Plus size={14} /></button>
                  </div>
                )
              })}
            </div>}
      </div>
      <div className={`wt-tray${dragId && overId === "pinned" ? " over" : ""}`} data-drop="pinned">
        <span className="wt-tray-t">Not in the tree yet · {tray.length}</span>
        {tray.length
          ? <div className="wt-tray-list">{tray.map(n => (
              <button key={n.id} className={`wt-chip${dragId === n.id ? " lifted" : ""}`} data-drop={`note:${n.id}`} style={{ ["--paper" as any]: col(n.color).c }} onPointerDown={e => slipDown(e, n.id)}
                onClick={() => onSelect(n.id)} onDoubleClick={() => onOpen(n.id)} aria-label={`${nameOf(n)}, not in the tree yet. Drag it onto a branch`}>{nameOf(n)}</button>
            ))}</div>
          : <small>Every note is on the tree.</small>}
      </div>
      <div className="fw-zoom" role="group" aria-label="Zoom">
        <button onClick={() => setZ(v => Math.max(0.4, v / 1.2))} aria-label="Zoom out"><Minus size={15} /></button>
        <span aria-live="polite">{Math.round(z * 100)}%</span>
        <button onClick={() => setZ(v => Math.min(1.6, v * 1.2))} aria-label="Zoom in"><Plus size={15} /></button>
        <button onClick={fit} aria-label="Fit everything in view" title="Fit"><Maximize2 size={14} /> Fit</button>
      </div>
    </div>
  )
}

export const TREE_CSS = `
  .wt { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; border: 10px solid #3A332D; border-radius: 6px; background: radial-gradient(rgba(0,0,0,.05) 1px, transparent 1px) 0 0 / 5px 5px, #CBC6BC; color: #1b1a17; overflow: hidden; }
  .wt-scroll { flex: 1; min-height: 0; overflow: auto; }
  .wt-canvas { position: relative; }
  .wt-wood { position: absolute; left: 0; top: 0; pointer-events: none; }
  .wt-empty { margin: 80px auto; max-width: 340px; text-align: center; font: 700 20px/1.35 ${HAND}; color: rgba(27,26,23,.55); }
  .wt-root { position: absolute; display: flex; align-items: center; gap: 8px; padding: 0 8px 0 12px; border-radius: 6px; background: #F4EEDC; box-shadow: 0 6px 12px -8px rgba(0,0,0,.6); font: 700 17px ${HAND}; }
  .wt-root i { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .wt-root b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: inherit; }
  .wt-root.over { box-shadow: 0 0 0 3px #1b1a17; }
  .wt-node { position: absolute; }
  .wt-face { width: 100%; height: 100%; border: none; border-radius: 2px; padding: 8px 30px 8px 12px; text-align: left; cursor: grab; background: var(--paper); color: #1b1a17; box-shadow: 0 1px 1px rgba(0,0,0,.14), 0 8px 14px -8px rgba(0,0,0,.5); touch-action: manipulation; -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; }
  .wt-face span { font: 700 15px/1.12 ${HAND}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .wt-face[aria-pressed="true"] { outline: 3px solid #7cc4ff; outline-offset: 3px; }
  .wt-face:focus-visible { outline: 3px solid #1b1a17; outline-offset: 2px; }
  .wt-node.lone .wt-face { border-left: 5px solid var(--pin); }
  .wt-node.lifted { opacity: .3; } .wt-node.dim { opacity: .3; }
  .wt-node.over .wt-face { outline: 3px solid ${THREAD}; outline-offset: 2px; }
  .wt-plus { position: absolute; right: -13px; top: 50%; margin-top: -13px; width: 26px; height: 26px; border-radius: 50%; border: none; background: #1b1c20; color: #D7FF3C; display: grid; place-items: center; cursor: pointer; box-shadow: 0 0 0 3px #CBC6BC; opacity: .0; transition: opacity .15s; }
  .wt-root .wt-plus { position: static; margin: 0; opacity: .85; }
  .wt-node:hover .wt-plus, .wt-node:focus-within .wt-plus, .wt-plus:focus-visible { opacity: 1; }
  @media (hover: none) { .wt-plus { opacity: 1; } }
  .wt-node.edit { background: #fff; border: 2px solid #D7FF3C; box-shadow: 0 0 0 4px rgba(215,255,60,.35), 0 8px 16px -8px rgba(0,0,0,.5); padding: 6px 10px; display: flex; flex-direction: column; justify-content: center; }
  .wt-node.edit input { border: none; outline: none; background: none; font: 700 15px ${HAND}; color: #1b1a17; padding: 0; width: 100%; }
  .wt-node.edit small { font: 500 12px 'Inter', sans-serif; color: #6f6a60; }
  .wt-node.walled .wt-face { background: #2b2c31; color: #f5f5f7; border-radius: 8px; box-shadow: 0 0 0 1px rgba(255,255,255,.12), 4px -4px 0 -1px #3d3e44, 8px -8px 0 -2px #4a4b52; display: flex; flex-direction: column; gap: 2px; }
  .wt-node.walled .wt-face small { font: 500 11.5px 'Inter', sans-serif; color: #b9bbc2; }
  .wt-peekbtn { position: absolute; left: 0; top: calc(100% + 6px); height: 26px; padding: 0 9px; border: none; border-radius: 7px; background: #1b1c20; color: #D7FF3C; font: 600 12px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; z-index: 2; }
  .wt-peek { position: absolute; left: calc(100% + 26px); top: -8px; width: 190px; z-index: 3; padding: 22px 8px 8px; border: 2px dashed rgba(30,30,30,.4); border-radius: 12px; background: rgba(31,59,51,.12); display: grid; gap: 6px; }
  .wt-peek > b { position: absolute; top: -12px; left: 10px; background: #1f3b33; color: #e8efe9; font: 600 11px 'Inter', sans-serif; padding: 3px 9px; border-radius: 6px; }
  .wt-peek span { padding: 6px 9px; font: 700 13.5px ${HAND}; color: #1b1a17; box-shadow: 0 4px 8px -6px rgba(0,0,0,.5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wt-peek small { font: 600 12px 'Inter', sans-serif; color: rgba(27,26,23,.6); padding: 2px 4px; }
  .wt-tray { position: relative; flex-shrink: 0; min-height: 92px; max-height: 34%; overflow-y: auto; margin: 0 14px 12px; padding: 42px 12px 10px; border-top: 2px dashed rgba(58,51,45,.35); }
  .wt-tray.over { background: rgba(255,255,255,.25); border-radius: 10px; }
  .wt-tray-t { position: absolute; top: 6px; left: 0; background: #F4EEDC; padding: 3px 10px; border-radius: 4px; font: 700 14px ${HAND}; }
  .wt-tray small { font: 500 12.5px 'Inter', sans-serif; color: rgba(27,26,23,.6); }
  .wt-tray-list { display: flex; flex-wrap: wrap; gap: 10px; padding-right: 200px; }
  .wt-chip { max-width: 220px; min-height: 40px; padding: 7px 12px; border: none; border-radius: 2px; background: var(--paper); color: #1b1a17; font: 700 14.5px/1.1 ${HAND}; text-align: left; cursor: grab; box-shadow: 0 6px 12px -8px rgba(0,0,0,.55); touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .wt-chip.lifted { opacity: .3; }
  .wt .fw-zoom { bottom: 10px; }
  @media (max-width: 700px) { .wt { border-width: 6px; } .wt-tray-list { padding-right: 0; padding-bottom: 54px; } }
`
