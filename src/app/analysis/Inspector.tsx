import type { ReactNode, RefObject } from "react"
import { useState } from "react"
import { ArrowDownToLine, ArrowUpToLine, Circle, CircleDot, CopyPlus, Flashlight, GripVertical, Link2, MoveUpRight, Pentagon, Ruler, ScanEye, Slash, Spline, Tag as TagIcon, Trash2, Triangle, Type } from "lucide-react"
import { Marks } from "./Marks"
import { MARK_COLOURS, type Mark, type Shot, type TagStyle } from "./model"

/* The panel on the right: what you can change about the selected mark (or the shot, when nothing is selected).
   Typing and sliders count as one change each for Undo: begin() when you start, end() when you finish. */

export const NAMES: Record<Mark["kind"], string> = { tag: "Player tag", spot: "Spotlight", zone: "Zone", arrow: "Arrow", text: "Text", ring: "Ring", tie: "Tie", measure: "Measure", shadow: "Cover shadow", focus: "Focus" }

/** The tag looks as pictures: each one drawn by the same code that draws your tags */
const LOOKS: [TagStyle, string][] = [["sig", "Signature"], ["cast", "Broadcast"], ["plain", "Plain"], ["bare", "Name only"]]
export function TagLooks({ value, color, name, set }: { value: TagStyle; color: string; name: string; set: (v: TagStyle) => void }) {
  const label = (name.trim() || "Pedri").slice(0, 9).trim() // a preview: long names are cut so the look still shows
  return (
    <div className="an-looks" role="radiogroup" aria-label="Tag style">
      {LOOKS.map(([v, t]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => set(v)}>
          <svg viewBox="0 0 160 96" aria-hidden="true">
            <rect width="160" height="96" fill="#1f6b33" />
            <rect width="160" height="34" fill="#185a2a" />
            <line x1="0" y1="58" x2="160" y2="58" stroke="#fff" strokeOpacity=".35" strokeWidth="1.5" />
            <Marks items={[{ id: "look" + v, kind: "tag", color, x: 80, y: 82, dx: 0, dy: -38, label, ring: true, size: 2.1, style: v }]} w={160} h={96} />
          </svg>
          <span>{t}</span>
        </button>
      ))}
    </div>
  )
}

const ICONS: Record<string, ReactNode> = { tag: <TagIcon size={18} />, spot: <Flashlight size={18} />, zone: <Pentagon size={18} />, oval: <Circle size={18} />, arrow: <MoveUpRight size={18} />, line: <Slash size={18} />, text: <Type size={18} />,
  ring: <CircleDot size={18} />, tie: <Spline size={18} />, measure: <Ruler size={18} />, shadow: <Triangle size={18} />, focus: <ScanEye size={18} /> }

function Seg<T extends string | boolean>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return (
    <div className="an-seg" role="group" aria-label={label}>
      {options.map(([v, t]) => <button key={String(v)} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => set(v)}>{t}</button>)}
    </div>
  )
}

/** What a mark is called in the Layers list */
export function markName(m: Mark) {
  if (m.kind === "tag") return m.label.trim() || "Player tag"
  if (m.kind === "zone") return m.label.trim() || (m.round ? "Oval" : "Zone")
  if (m.kind === "text") return m.text.split("\n")[0].trim().slice(0, 28) || "Text"
  if (m.kind === "arrow") return m.head === "none" ? "Line" : "Arrow"
  return NAMES[m.kind]
}
/** Marks in build order: by step, then as drawn */
export const inOrder = (items: Mark[]) => items.map((m, i) => ({ m, i, s: m.step ?? i + 1 })).sort((a, b) => a.s - b.s || a.i - b.i).map(x => x.m)

/** The Layers list: drag to reorder; the link joins a mark to the step above, so they appear together in a video */
function Layers({ items, sel, onSelect, onOrder }: { items: Mark[]; sel: string | null; onSelect: (id: string) => void; onOrder: (next: Mark[]) => void }) {
  const list = inOrder(items)
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  let step = 0
  const rows = list.map((m, i) => {
    const joined = i > 0 && (m.step ?? -1) === (list[i - 1].step ?? -2)
    if (!joined) step++
    return { m, joined, step }
  })
  const renumber = (arr: { m: Mark; joined: boolean }[]) => { let n = 0; return arr.map((r, i) => { if (i === 0 || !r.joined) n++; return { ...r.m, step: n } as Mark }) }
  if (!list.length) return <p className="an-note">Your marks show up here in the order they appear in a video. Drag to change it.</p>
  return (
    <div className="an-layers" role="list">
      {rows.map((r, i) => (
        <div key={r.m.id} role="listitem" className={`an-layer${sel === r.m.id ? " on" : ""}${over === i ? " over" : ""}${r.joined ? " joined" : ""}`} draggable
          onDragStart={e => { setDrag(r.m.id); e.dataTransfer.effectAllowed = "move" }} onDragEnd={() => { setDrag(null); setOver(null) }}
          onDragOver={e => { if (drag) { e.preventDefault(); setOver(i) } }}
          onDrop={e => {
            e.preventDefault(); setOver(null)
            if (!drag) return
            const from = rows.findIndex(x => x.m.id === drag)
            if (from < 0 || from === i) return
            const next = [...rows]; const [moved] = next.splice(from, 1); next.splice(i, 0, { ...moved, joined: false })
            onOrder(renumber(next))
          }}
          onClick={() => onSelect(r.m.id)}>
          <GripVertical size={13} className="an-grip" aria-hidden="true" />
          <span className="an-stepno" title={`Appears in step ${r.step}`}>{r.joined ? "" : r.step}</span>
          <span className="an-lname">{markName(r.m)}</span>
          <span className="an-lkind">{NAMES[r.m.kind] === markName(r.m) ? "" : NAMES[r.m.kind]}</span>
          {i > 0 && <button className={`an-link${r.joined ? " on" : ""}`} aria-pressed={r.joined} title={r.joined ? "Appears with the mark above. Click to give it its own step" : "Make it appear with the mark above"}
            onClick={e => { e.stopPropagation(); const next = rows.map((x, j) => (j === i ? { ...x, joined: !x.joined } : x)); onOrder(renumber(next)) }}><Link2 size={13} /></button>}
        </div>
      ))}
    </div>
  )
}

export type TeamPick = { us: { name: string; color: string }; them: { name: string; color: string } }

export function Inspector({ mark, shot, set, begin, end, textRef, onDuplicate, onDelete, onFront, onBack, onDim, where, teams, onTeams, onOrder, onSelect, calibrated, extra, fit }: {
  mark: Mark | null; shot: Shot; set: (patch: Partial<Mark>, live?: boolean) => void; begin: () => void; end: () => void
  textRef: RefObject<(HTMLInputElement & HTMLTextAreaElement) | null>; onDuplicate: () => void; onDelete: () => void; onFront: () => void; onBack: () => void; onDim: (v: number, live?: boolean) => void
  where?: string
  teams: TeamPick; onTeams: (t: TeamPick) => void
  onOrder: (next: Mark[]) => void; onSelect: (id: string | null) => void
  calibrated: boolean
  extra?: ReactNode // the video moment's settings, shown above the layers
  fit?: unknown
}) {
  void fit
  const row = (label: string, body: ReactNode) => <div className="an-row"><span className="an-lab">{label}</span>{body}</div>
  const slider = (label: string, value: number, min: number, max: number, step: number, put: (v: number) => void, fmt?: (v: number) => string) => row(label,
    <div className="an-slide">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
        onPointerDown={begin} onKeyDown={begin} onChange={e => put(+e.target.value)} onPointerUp={end} onKeyUp={end} onBlur={end} />
      <span>{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </div>)
  const layers = <>
    <div className="an-sep" />
    <p className="an-cap">Layers · build order</p>
    <Layers items={shot.items} sel={mark?.id ?? null} onSelect={id => onSelect(id)} onOrder={onOrder} />
    {shot.items.length > 0 && <p className="an-note" style={{ marginTop: 8 }}>Drag to reorder. In a video, marks appear in this order; the link makes one appear with the mark above.</p>}
  </>

  if (!mark) return (
    <div className="an-insp">
      {extra}
      <p className="an-cap">Teams</p>
      <div className="an-teams">
        {(["us", "them"] as const).map(k => (
          <label key={k} className="an-team">
            <input type="color" aria-label={`${k === "us" ? "Your team" : "The other team"} colour`} value={teams[k].color} onChange={e => onTeams({ ...teams, [k]: { ...teams[k], color: e.target.value.toLowerCase() } })} />
            <input className="an-inp" aria-label={k === "us" ? "Your team" : "The other team"} value={teams[k].name} maxLength={20} placeholder={k === "us" ? "Your team" : "Opponent"} onChange={e => onTeams({ ...teams, [k]: { ...teams[k], name: e.target.value } })} />
          </label>
        ))}
      </div>
      <p className="an-note">Pick a team above the picture and every new mark takes its colour.</p>
      {slider("Darken the shot", shot.dim, 0, 0.6, 0.05, v => onDim(v, true))}
      {!calibrated && <p className="an-note">Calibrate the shot and rings lie flat on the grass, shrink with distance, and ties can show metres.</p>}
      {layers}
    </div>
  )

  const m = mark
  const kind = m.kind === "arrow" && m.head === "none" ? "line" : m.kind === "zone" && m.round ? "oval" : m.kind
  const kindName = kind === "line" ? "Line" : kind === "oval" ? "Oval" : NAMES[m.kind]
  const big = markName(m)
  const colours = [...new Set([teams.us.color, teams.them.color, ...MARK_COLOURS])]
  return (
    <div className="an-insp" aria-label={kindName}>
      {extra}
      <div className="an-head">
        <span className="an-ico" aria-hidden="true">{ICONS[kind]}</span>
        <div style={{ minWidth: 0 }}>
          <p className="an-cap" style={{ margin: 0 }}>{kindName}{where ? ` · ${where}` : ""}</p>
          <p className="an-big">{big}</p>
        </div>
      </div>
      {m.kind === "tag" && row("Style", <TagLooks value={m.style ?? "sig"} color={m.color} name={m.label} set={v => set({ style: v })} />)}

      {m.kind === "tag" && row("Name", <input ref={textRef} id="an-label" className="an-inp" value={m.label} maxLength={40} placeholder="RW · Yamal" onFocus={begin} onBlur={end} onChange={e => set({ label: e.target.value }, true)} />)}
      {m.kind === "zone" && row("Label", <input ref={textRef} id="an-label" className="an-inp" value={m.label} maxLength={24} placeholder="3v2" onFocus={begin} onBlur={end} onChange={e => set({ label: e.target.value }, true)} />)}
      {m.kind === "text" && row("Text", <textarea ref={textRef} id="an-text" className="an-inp" rows={4} value={m.text} maxLength={400} placeholder={"Inside diag is on." + String.fromCharCode(10) + "N6 vacates the lane."} onFocus={begin} onBlur={end} onChange={e => set({ text: e.target.value }, true)} />)}

      {m.kind !== "focus" && row("Colour", <div className="an-cols">
        {colours.map(c => <button key={c} className={`an-sw${m.color === c ? " on" : ""}`} aria-label={`Colour ${c}${c === teams.us.color ? `, ${teams.us.name}` : c === teams.them.color ? `, ${teams.them.name}` : ""}`} title={c === teams.us.color ? teams.us.name : c === teams.them.color ? teams.them.name : undefined} aria-pressed={m.color === c} style={{ background: c }} onClick={() => set({ color: c })} />)}
        <input type="color" className="an-sw an-any" aria-label="Any colour" value={m.color} onFocus={begin} onBlur={end} onChange={e => set({ color: e.target.value.toLowerCase() }, true)} />
      </div>)}

      {m.kind === "tag" && <>
        {row("Ring under the player", <Seg label="Ring" value={!m.ring ? "off" : m.glow ? "glow" : "solid"} options={[["solid", "Solid"], ["glow", "Glow"], ["off", "Off"]]}
          set={v => set(v === "off" ? { ring: false } : { ring: true, glow: v === "glow" })} />)}
        {slider("Size", m.size, 0.5, 2.5, 0.05, v => set({ size: v }, true))}
      </>}
      {m.kind === "ring" && <>
        {row("Echo ring", <Seg label="Echo ring" value={m.double} options={[[false, "Off"], [true, "On"]]} set={v => set({ double: v })} />)}
        {slider("Fill", m.fill, 0, 0.6, 0.02, v => set({ fill: v }, true))}
        {slider("Size", m.size, 0.5, 3, 0.05, v => set({ size: v }, true), v => `${(m.r * v * 2).toFixed(1)} m`)}
        {!calibrated && <p className="an-note">Calibrate the shot and the ring lies flat on the grass, smaller further away.</p>}
      </>}
      {m.kind === "tie" && <>
        {row("Line", <Seg label="Line style" value={m.dash} options={[["solid", "Solid"], ["dash", "Dashed"], ["dot", "Dotted"]]} set={v => set({ dash: v })} />)}
        {row("Distance", <Seg label="Show the distance" value={m.dist} options={[[false, "Hide"], [true, "Show"]]} set={v => set({ dist: v })} />)}
        {slider("Thickness", m.size, 0.4, 2.5, 0.05, v => set({ size: v }, true))}
        {m.dist && !calibrated && <p className="an-note">Distances show once the shot is calibrated.</p>}
        {(m.ra || m.rb) && <p className="an-note">Tied to the players: move them and it follows.</p>}
      </>}
      {m.kind === "measure" && <>
        {slider("Thickness", m.size, 0.4, 2.5, 0.05, v => set({ size: v }, true))}
        {!calibrated && <p className="an-note">Calibrate the shot to measure in metres.</p>}
      </>}
      {m.kind === "shadow" && <>
        {slider("Length", m.len, 4, 30, 0.5, v => set({ len: v }, true), v => calibrated ? `${v} m` : `${v}`)}
        {slider("Width", m.spread, 4, 25, 1, v => set({ spread: v }, true), v => `${v}°`)}
        <p className="an-note">Drag the square onto the presser and the dot onto the ball. The shadow is the lane he takes away.</p>
      </>}
      {m.kind === "focus" && <>
        {slider("Darkness", m.dim, 0.15, 0.8, 0.01, v => set({ dim: v }, true))}
        <p className="an-note">Everything outside the corners goes dark. Drag the corners onto the area that matters.</p>
      </>}
      {m.kind === "spot" && slider("Beam width", m.size, 0.4, 2.5, 0.05, v => set({ size: v }, true))}
      {m.kind === "zone" && <>
        {m.pts.length === 4 && row("Shape", <Seg label="Zone shape" value={!!m.round} options={[[false, "Area"], [true, "Oval"]]} set={v => set({ round: v })} />)}
        {row("Style", <Seg label="Zone style" value={m.outline} options={[[false, "Filled"], [true, "Outline"]]} set={v => set({ outline: v })} />)}
        {!m.outline && slider("Fill", m.opacity, 0.05, 0.7, 0.01, v => set({ opacity: v }, true))}
        {slider("Label size", m.size, 0.4, 2.5, 0.05, v => set({ size: v }, true))}
        <p className="an-note">{m.round ? "Drag the corners to shape the oval. Tilt them and it lies flat on the pitch." : "Drag the corners onto the pitch lines to match the camera angle."}</p>
      </>}
      {m.kind === "arrow" && <>
        {row("Line", <Seg label="Line style" value={m.dash} options={[["solid", "Solid"], ["dash", "Dashed"], ["dot", "Dotted"]]} set={v => set({ dash: v })} />)}
        {row("Heads", <Seg label="Arrow heads" value={m.head} options={[["none", "None"], ["end", "End"], ["both", "Both"]]} set={v => set({ head: v })} />)}
        {slider("Thickness", m.size, 0.3, 2.5, 0.05, v => set({ size: v }, true))}
        {m.c ? <button className="an-btn" onClick={() => set({ c: null })}>Straighten</button> : <p className="an-note">Drag the diamond in the middle to curve it.</p>}
      </>}
      {m.kind === "text" && <>
        {row("Style", <Seg label="Text style" value={m.box} options={[[true, "Caption box"], [false, "Plain"]]} set={v => set({ box: v })} />)}
        {slider("Size", m.size, 0.5, 2.5, 0.05, v => set({ size: v }, true))}
      </>}

      <div className="an-acts">
        <button className="an-act" onClick={onDuplicate} title="Duplicate (⌘D)"><CopyPlus size={15} /> Duplicate</button>
        <button className="an-act bad" onClick={onDelete} title="Delete (Del)"><Trash2 size={15} /> Delete</button>
        <button className="an-act sm" onClick={onFront} title="Bring to front"><ArrowUpToLine size={15} /> To front</button>
        <button className="an-act sm" onClick={onBack} title="Send to back"><ArrowDownToLine size={15} /> To back</button>
      </div>
      {layers}
    </div>
  )
}
