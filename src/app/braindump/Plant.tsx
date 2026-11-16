import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Leaf } from "lucide-react"
import { supabase } from "../lib/supabase"
import { listName, type PieceKind } from "../lib/names"
import { firstLine, hex, nameOf, type Note } from "./notes"
import { HAND } from "./sketch"

/* The pile's plant (it grows with every thread) and the tree view: the pile's question at the root, the ideas you tied
   things to as branches, what hangs off them as twigs, and what you made from them as lime leaves. */

export type Stage = "seed" | "sprout" | "sapling" | "tree"
const STEM = "#8A7A62", LEAF = "#D7FF3C", CREAM = "#F4EEDC", INK = "#1b1a17"

/** A small plant, 30 × 34, that sways. pop: it just grew. */
export function Plant({ stage, pop = false, size = 1 }: { stage: Stage; pop?: boolean; size?: number }) {
  return (
    <svg width={30 * size} height={34 * size} viewBox="0 0 30 34" aria-hidden="true" className={`bd-plant-svg${pop ? " pop" : ""}`}>
      <path d="M4 32.5 H26" stroke={STEM} strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      <g className="bd-sway">
        {stage === "seed" && <>
          <ellipse cx="15" cy="29.5" rx="4.2" ry="3" fill={STEM} />
          <path d="M15 27 C15 24 17 22.5 19 22.6 C18.6 25 17 26.6 15 27 Z" fill={LEAF} />
        </>}
        {stage === "sprout" && <>
          <path d="M15 32 C15 27 15 22 15.5 17" stroke={STEM} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M15.4 19 C12 19 9.5 16.8 9 14 C12.4 13.8 15 15.8 15.4 19 Z" fill={LEAF} />
          <path d="M15.6 17.6 C18.6 16.6 21 14 21.2 10.8 C18 11.4 15.8 14 15.6 17.6 Z" fill={LEAF} />
        </>}
        {stage === "sapling" && <>
          <path d="M15 32 C15 25 15 17 15 9" stroke={STEM} strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M15 22 C12.5 20 10 18.6 8 17" stroke={STEM} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M15 17 C17.6 15 19.8 13.6 22 12.6" stroke={STEM} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M8 17 C5 17.4 3 15.6 2.6 13.2 C5.4 12.8 7.6 14.4 8 17 Z" fill={LEAF} />
          <path d="M22 12.6 C25 12.6 27 10.6 27.2 8.2 C24.4 8 22.4 10 22 12.6 Z" fill={LEAF} />
          <path d="M15 9 C12.6 7.6 12.2 4.6 13.4 2.4 C15.8 3.8 16.4 6.6 15 9 Z" fill={LEAF} />
          <path d="M15 26 C17.8 25 20 23 20.4 20.4 C17.6 20.6 15.6 22.8 15 26 Z" fill={LEAF} />
        </>}
        {stage === "tree" && <>
          <path d="M15 32 C14.4 26 15 20 15 14" stroke={STEM} strokeWidth="3.2" fill="none" strokeLinecap="round" />
          <path d="M15 21 C12 19 9.6 17 8 14.6 M15 18 C18 16.4 20.4 14.4 22 12 M15 15 C14.6 12 15 9.6 15.4 7" stroke={STEM} strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <circle cx="15" cy="8.5" r="6.2" fill={LEAF} />
          <circle cx="8.4" cy="13" r="5" fill={LEAF} />
          <circle cx="21.8" cy="11.4" r="5.2" fill={LEAF} />
          <circle cx="12" cy="5.2" r="3.4" fill={LEAF} opacity=".85" />
          <circle cx="18.6" cy="6" r="3" fill={LEAF} opacity=".85" />
        </>}
      </g>
    </svg>
  )
}

/* ── the tree view ── */
const BR = { w: 210, h: 60 }, TW = { w: 180, h: 52 }, DEEP = { w: 160, h: 38 }, LEAF_H = 30
const ARM = 44, OUT = 30, BAND_GAP = 30, ROOT_ZONE = 150, TOP_PAD = 40
const W = 2 * (ARM + BR.w + OUT + TW.w) + 80

type Box = { note: Note; x: number; y: number; w: number; h: number; kind: "branch" | "twig" | "deep"; i: number }
type Line = { d: string; width: number }
type LeafAt = { ref: string; x: number; y: number; w: number; i: number }

function layoutTree(pile: Note, kids: (id: string) => Note[], under: (id: string) => Note[]) {
  const ideas = (id: string) => kids(id).filter(n => n.kind === "note")
  const branches = ideas(pile.id).filter(n => ideas(n.id).length > 0 || !!n.made_ref)
  const twigBlock = (t: Note) => TW.h + (t.made_ref ? LEAF_H + 4 : 0) + Math.min(6, under(t.id).filter(n => n.kind === "note").length) * (DEEP.h + 6) + 10
  const bands = branches.map(b => {
    const twigs = ideas(b.id)
    const twigH = twigs.reduce((s, t) => s + twigBlock(t), 0)
    return { b, twigs, h: Math.max(BR.h + (b.made_ref ? LEAF_H + 8 : 0) + 10, twigH) }
  })
  const H = TOP_PAD + bands.reduce((s, x) => s + x.h + BAND_GAP, 0) + ROOT_ZONE
  const cx = W / 2, boxes: Box[] = [], lines: Line[] = [], leaves: LeafAt[] = []
  let acc = 0, n = 0
  bands.forEach(({ b, twigs, h }, i) => {
    const bottom = H - ROOT_ZONE - acc
    acc += h + BAND_GAP
    const left = i % 2 === 0
    const leafH = b.made_ref ? LEAF_H + 8 : 0
    const by = bottom - BR.h - leafH, bx = left ? cx - ARM - BR.w : cx + ARM
    const inner = left ? bx + BR.w : bx, outer = left ? bx : bx + BR.w, my = by + BR.h / 2
    lines.push({ d: `M${cx} ${my + 26} C${cx + (left ? -16 : 16)} ${my + 12} ${inner + (left ? 18 : -18)} ${my + 4} ${inner} ${my}`, width: 7 })
    boxes.push({ note: b, x: bx, y: by, w: BR.w, h: BR.h, kind: "branch", i: n++ })
    if (b.made_ref) leaves.push({ ref: b.made_ref, x: bx, y: by + BR.h + 8, w: BR.w, i: n++ })
    let ty = bottom
    for (const t of twigs) {
      const blockH = twigBlock(t)
      ty -= blockH
      const tx = left ? bx - OUT - TW.w : bx + BR.w + OUT
      const tin = left ? tx + TW.w : tx, tmy = ty + TW.h / 2
      lines.push({ d: `M${outer} ${my} C${outer + (left ? -14 : 14)} ${my} ${tin + (left ? 12 : -12)} ${tmy} ${tin} ${tmy}`, width: 3 })
      boxes.push({ note: t, x: tx, y: ty, w: TW.w, h: TW.h, kind: "twig", i: n++ })
      let dy = ty + TW.h + 6
      if (t.made_ref) { leaves.push({ ref: t.made_ref, x: tx, y: dy, w: TW.w, i: n++ }); dy += LEAF_H + 4 }
      for (const d of under(t.id).filter(x => x.kind === "note").slice(0, 6)) {
        boxes.push({ note: d, x: tx + (left ? TW.w - DEEP.w : 0), y: dy, w: DEEP.w, h: DEEP.h, kind: "deep", i: n++ })
        dy += DEEP.h + 6
      }
    }
  })
  const trunkTop = bands.length ? Math.min(...boxes.filter(b => b.kind === "branch").map(b => b.y + b.h / 2)) - 16 : H - ROOT_ZONE - 40
  return { H, cx, boxes, lines, leaves, trunkTop, empty: !branches.length }
}

const KIND: Record<string, { table: string; label: PieceKind; path: string }> = {
  board: { table: "boards", label: "Board", path: "/board" },
  report: { table: "reports", label: "Report", path: "/report" },
  analysis: { table: "analyses", label: "Analysis", path: "/analysis" },
}
const STATUS_LABEL = { idea: "IDEA", making: "MAKING", made: "MADE" } as const

/** The tree view of one pile: /braindump?tree=ID&view=tree */
export function TreeView({ pile, kids, under, stage, onBack, onOpen, onNavigate }: {
  pile: Note; kids: (id: string) => Note[]; under: (id: string) => Note[]; stage: Stage
  onBack: () => void; onOpen: (id: string) => void; onNavigate: (to: string) => void
}) {
  const L = useMemo(() => layoutTree(pile, kids, under), [pile, kids, under])
  const refs = useMemo(() => L.leaves.map(l => l.ref), [L])
  // what each leaf is called: one select per kind of piece, for the ones shown only. undefined: still asking; null: gone
  const [titles, setTitles] = useState<Record<string, string | null>>({})
  const key = refs.slice().sort().join(",")
  useEffect(() => {
    let off = false
    const by: Record<string, string[]> = {}
    for (const r of refs) { const [k, id] = r.split(":"); (by[k] ??= []).push(id) }
    Promise.all(Object.entries(by).map(async ([k, ids]) => {
      const meta = KIND[k]
      if (!meta) return [] as [string, string | null][]
      const { data, error } = await (supabase as any).from(meta.table).select("id, title, updated_at").in("id", ids)
      if (error) return [] as [string, string | null][] // couldn't ask: they stay "…" rather than look deleted
      const found = new Map<string, any>((data ?? []).map((x: any) => [String(x.id), x]))
      return ids.map(id => { const x = found.get(id); return [`${k}:${id}`, x ? listName(meta.label, x.title, x.updated_at) : null] as [string, string | null] })
    })).then(lists => { if (!off) setTitles(Object.fromEntries(lists.flat())) })
    return () => { off = true }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const scroller = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => { // start centred on the trunk, at the root
    const el = scroller.current
    if (!el) return
    el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
    el.scrollTop = el.scrollHeight
  }, [pile.id])

  const question = firstLine(pile).split(String.fromCharCode(10))[0].trim()
  const c = hex(pile.color)
  return (
    <div className="bd-tv">
      <div className="bd-tv-top">
        <button className="bd-btn" onClick={onBack}><ArrowLeft size={15} /> Back to the wall</button>
        <div className="bd-tv-name"><span className="bd-dot" style={{ background: c }} /><b>{nameOf(pile)}</b><Plant stage={stage} /><em>{stage}</em></div>
        <div className="bd-tv-legend" aria-label="How to read the tree">ROOT = THE QUESTION · BRANCHES = YOUR POINTS · <span>LEAVES = WHAT YOU MADE</span></div>
      </div>
      <div className="bd-tv-scroll" ref={scroller}>
        <div className="bd-tv-canvas" style={{ width: W, height: L.H }}>
          <svg width={W} height={L.H} className="bd-tv-wood" aria-hidden="true">
            <path d={`M${L.cx} ${L.H - ROOT_ZONE + 70} L${L.cx} ${L.trunkTop}`} stroke="#8A7A62" strokeWidth="14" strokeLinecap="round" />
            <path d={`M${L.cx} ${L.H - ROOT_ZONE + 62} C${L.cx - 30} ${L.H - ROOT_ZONE + 80} ${L.cx - 70} ${L.H - ROOT_ZONE + 84} ${L.cx - 96} ${L.H - ROOT_ZONE + 96} M${L.cx} ${L.H - ROOT_ZONE + 62} C${L.cx + 30} ${L.H - ROOT_ZONE + 80} ${L.cx + 70} ${L.H - ROOT_ZONE + 84} ${L.cx + 96} ${L.H - ROOT_ZONE + 96}`} stroke="#8A7A62" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".7" />
            {L.lines.map((l, i) => <path key={i} d={l.d} stroke="#8A7A62" strokeWidth={l.width} fill="none" strokeLinecap="round" />)}
          </svg>
          <button className={`bd-tv-root${question ? "" : " ask"}`} style={{ left: L.cx, top: L.H - ROOT_ZONE + 74 }} onClick={() => onOpen(pile.id)}
            title={question ? "Open the pile's page" : "Write the pile's question"}>
            <small>THE QUESTION</small>{question || "What is this pile about?"}
          </button>
          {L.empty && <p className="bd-tv-seed" style={{ left: L.cx, top: L.H - ROOT_ZONE - 120 }}>This pile is still a seed. Drag one note onto another on the wall and it starts to grow.</p>}
          {L.boxes.map(b => (
            <button key={b.note.id} className={`bd-tv-slip ${b.kind}`} onClick={() => onOpen(b.note.id)}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h, animationDelay: `${Math.min(b.i, 24) * 35}ms`, ["--paper" as any]: b.kind === "branch" ? hex(b.note.color) : CREAM }}>
              {b.kind !== "deep" && <small>{b.kind === "branch" ? "POINT" : "DETAIL"} · {STATUS_LABEL[b.note.status]}</small>}
              <span>{nameOf(b.note)}</span>
            </button>
          ))}
          {L.leaves.map(l => {
            const [k, id] = l.ref.split(":"), meta = KIND[k], t = titles[l.ref]
            const gone = t === null, label = `${meta?.label ?? "Piece"}: ${t === undefined ? "…" : gone ? "(deleted)" : t}`
            return gone || !meta
              ? <span key={l.ref + l.i} className="bd-tv-leaf gone" style={{ left: l.x, top: l.y, maxWidth: l.w, animationDelay: `${Math.min(l.i, 24) * 35}ms` }}><Leaf size={13} /> {meta?.label ?? "Piece"} (deleted)</span>
              : <button key={l.ref + l.i} className="bd-tv-leaf" style={{ left: l.x, top: l.y, maxWidth: l.w, animationDelay: `${Math.min(l.i, 24) * 35}ms` }} onClick={() => onNavigate(`${meta.path}?open=${id}`)} title={`Open ${label}`}><Leaf size={13} /> <span>{label}</span></button>
          })}
        </div>
      </div>
    </div>
  )
}

/** Styles for the plant and the tree view (the page adds them to its own sheet) */
export const PLANT_CSS = `
  .bd-plant-svg { overflow: visible; flex-shrink: 0; }
  .bd-sway { transform-origin: 15px 32px; animation: bd-sway 3.2s ease-in-out infinite; }
  @keyframes bd-sway { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }
  .bd-plant-svg.pop { animation: bd-pop .35s cubic-bezier(.2,1.4,.4,1) both; }
  @keyframes bd-pop { from { transform: scale(.4); } to { transform: scale(1); } }
  .bd-tv { position: absolute; inset: 0; display: flex; flex-direction: column; background: #CBC6BC; color: ${INK}; border: 10px solid #3A332D; border-radius: 6px; }
  .bd-tv-top { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 18px; padding: 12px 16px; background: rgba(244,238,220,.82); border-bottom: 1px solid rgba(27,26,23,.12); }
  .bd-tv-top .bd-btn { background: ${INK}; color: #fff; border-color: transparent; }
  .bd-tv-name { display: flex; align-items: center; gap: 8px; font: 700 22px ${HAND}; }
  .bd-tv-name em { font: 600 11px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; font-style: normal; opacity: .6; }
  .bd-tv-legend { margin-left: auto; font: 600 11px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .12em; color: rgba(27,26,23,.62); }
  .bd-tv-legend span { color: ${INK}; background: ${LEAF}; padding: 2px 6px; border-radius: 4px; }
  .bd-tv-scroll { flex: 1; overflow: auto; }
  .bd-tv-canvas { position: relative; margin: 0 auto; }
  .bd-tv-wood { position: absolute; left: 0; top: 0; pointer-events: none; }
  .bd-tv-root { position: absolute; transform: translateX(-50%) rotate(-1deg); max-width: 380px; min-width: 220px; padding: 10px 18px 12px; border: none; border-radius: 4px; background: ${CREAM}; color: ${INK}; font: 700 19px/1.25 ${HAND}; text-align: center; cursor: pointer; box-shadow: 0 10px 22px -12px rgba(0,0,0,.55); }
  .bd-tv-root small { display: block; font: 600 10.5px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .16em; opacity: .55; margin-bottom: 3px; }
  .bd-tv-root.ask { color: rgba(27,26,23,.55); border: 1.5px dashed rgba(27,26,23,.35); }
  .bd-tv-seed { position: absolute; transform: translateX(-50%); width: 320px; margin: 0; text-align: center; font: 700 18px/1.35 ${HAND}; color: rgba(27,26,23,.62); }
  .bd-tv-slip { position: absolute; border: none; border-radius: 3px; padding: 7px 10px; text-align: left; cursor: pointer; background: var(--paper); color: ${INK}; box-shadow: 0 1px 1px rgba(0,0,0,.12), 0 10px 18px -10px rgba(0,0,0,.5); display: flex; flex-direction: column; gap: 2px; overflow: hidden; animation: bd-pop-in .35s cubic-bezier(.2,1.2,.4,1) both; }
  .bd-tv-slip small { font: 600 10px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; opacity: .6; }
  .bd-tv-slip span { font: 700 16px/1.15 ${HAND}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .bd-tv-slip.twig { padding: 5px 9px; }
  .bd-tv-slip.twig span { font-size: 13px; line-height: 1.04; }
  .bd-tv-slip.deep { padding: 5px 9px; justify-content: center; opacity: .92; }
  .bd-tv-slip.deep span { font-size: 13.5px; -webkit-line-clamp: 1; }
  .bd-tv-slip:hover { box-shadow: 0 0 0 2px rgba(27,26,23,.55), 0 10px 18px -10px rgba(0,0,0,.5); }
  .bd-tv-slip:focus-visible, .bd-tv-leaf:focus-visible, .bd-tv-root:focus-visible { outline: 3px solid ${INK}; outline-offset: 2px; }
  .bd-tv-leaf { position: absolute; display: inline-flex; align-items: center; gap: 6px; height: ${LEAF_H - 4}px; padding: 0 11px; border-radius: 999px; border: none; background: ${LEAF}; color: ${INK}; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; overflow: hidden; animation: bd-pop-in .35s cubic-bezier(.2,1.2,.4,1) both; box-shadow: 0 6px 14px -8px rgba(0,0,0,.5); }
  .bd-tv-leaf span { overflow: hidden; text-overflow: ellipsis; }
  .bd-tv-leaf.gone { background: rgba(27,26,23,.12); color: rgba(27,26,23,.6); cursor: default; box-shadow: none; }
  @keyframes bd-pop-in { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
  @media (max-width: 700px) { .bd-tv { border-width: 6px; } .bd-tv-legend { margin-left: 0; font-size: 10px; } }
  @media (prefers-reduced-motion: reduce) { .bd-sway, .bd-plant-svg.pop, .bd-tv-slip, .bd-tv-leaf { animation: none; } }
`
