import type { ReactNode, RefObject } from "react"
import { ArrowDownToLine, ArrowUpToLine, Circle, CopyPlus, Flashlight, MoveUpRight, Pentagon, Slash, Tag as TagIcon, Trash2, Type } from "lucide-react"
import { Marks } from "./Marks"
import { MARK_COLOURS, type Mark, type Shot, type TagStyle } from "./model"

/* The panel on the right: what you can change about the selected mark (or the shot, when nothing is selected).
   Typing and sliders count as one change each for Undo: begin() when you start, end() when you finish. */

const NAMES: Record<Mark["kind"], string> = { tag: "Player tag", spot: "Spotlight", zone: "Zone", arrow: "Arrow", text: "Text" }
const KEYS: [string, string][] = [["V", "Select"], ["T", "Tag"], ["S", "Spotlight"], ["Z", "Zone"], ["O", "Oval"], ["A", "Arrow"], ["L", "Line"], ["X", "Text"],
  ["Delete", "Remove"], ["Ctrl Z", "Undo"], ["Ctrl D", "Duplicate"], ["Arrows", "Nudge"], ["+ / −", "Zoom"], ["Ctrl wheel", "Zoom"], ["Space drag", "Pan"], ["1 to 9", "Shots"]]

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

const ICONS: Record<string, ReactNode> = { tag: <TagIcon size={18} />, spot: <Flashlight size={18} />, zone: <Pentagon size={18} />, oval: <Circle size={18} />, arrow: <MoveUpRight size={18} />, line: <Slash size={18} />, text: <Type size={18} /> }

function Seg<T extends string | boolean>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return (
    <div className="an-seg" role="group" aria-label={label}>
      {options.map(([v, t]) => <button key={String(v)} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => set(v)}>{t}</button>)}
    </div>
  )
}

export function Inspector({ mark, shot, set, begin, end, textRef, onDuplicate, onDelete, onFront, onBack, onDim, video, where, tagLook, onTagLook, panel }: {
  mark: Mark | null; shot: Shot | null; set: (patch: Partial<Mark>, live?: boolean) => void; begin: () => void; end: () => void
  textRef: RefObject<(HTMLInputElement & HTMLTextAreaElement) | null>; onDuplicate: () => void; onDelete: () => void; onFront: () => void; onBack: () => void; onDim: (v: number, live?: boolean) => void; video?: boolean
  where?: string // "Shot 2" or "Moment 3": shown over the mark's name
  tagLook: { style: TagStyle; color: string }; onTagLook: (v: TagStyle) => void // how new tags look, picked before the first shot
  panel?: ReactNode // shown instead of the start steps (the video's moments)
}) {
  const row = (label: string, body: ReactNode) => <div className="an-row"><span className="an-lab">{label}</span>{body}</div>
  const slider = (label: string, value: number, min: number, max: number, step: number, put: (v: number) => void, fmt?: (v: number) => string) => row(label,
    <div className="an-slide">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
        onPointerDown={begin} onKeyDown={begin} onChange={e => put(+e.target.value)} onPointerUp={end} onKeyUp={end} onBlur={end} />
      <span>{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </div>)

  if (!shot && panel) return <div className="an-insp">{panel}</div>
  if (!shot) return (
    <div className="an-insp">
      <p className="an-cap">Start here</p>
      <ol className="an-steps">
        <li className="on">{video ? "Pick a moment in your clip and press Add a moment." : "Add up to 10 match shots."}</li>
        <li>Tag the players that matter.</li>
        <li>Show the idea: zones, arrows, spotlights.</li>
        <li>Export, ready to post.</li>
      </ol>
      <p className="an-cap" style={{ marginTop: 26 }}>Tag style</p>
      <TagLooks value={tagLook.style} color={tagLook.color} name="" set={onTagLook} />
      <p className="an-note" style={{ marginTop: 10 }}>Every new tag starts this way. You can change any tag later.</p>
    </div>
  )

  if (!mark) return (
    <div className="an-insp">
      <p className="an-cap">{where ?? "Shot"}</p>
      {slider("Darken the shot", shot.dim, 0, 0.6, 0.05, v => onDim(v, true))}
      <p className="an-note">Darkening makes your marks stand out.</p>
      <div className="an-keysbox">
        <p className="an-cap" style={{ marginTop: 22 }}>KEYS</p>
        <div className="an-keys">{KEYS.map(([k, t]) => <div key={k}><kbd>{k}</kbd><span>{t}</span></div>)}</div>
      </div>
    </div>
  )

  const m = mark
  const kind = m.kind === "arrow" && m.head === "none" ? "line" : m.kind === "zone" && m.round ? "oval" : m.kind
  const kindName = kind === "line" ? "Line" : kind === "oval" ? "Oval" : NAMES[m.kind]
  const big = (m.kind === "tag" || m.kind === "zone" ? m.label : m.kind === "text" ? m.text.split("\n")[0] : "").trim() || kindName
  return (
    <div className="an-insp" aria-label={kindName}>
      <div className="an-head">
        <span className="an-ico" aria-hidden="true">{ICONS[kind]}</span>
        <div style={{ minWidth: 0 }}>
          <p className="an-cap" style={{ margin: 0 }}>{kindName}{where ? ` · ${where}` : ""}</p>
          <p className="an-big">{big}</p>
        </div>
      </div>
      {m.kind === "tag" && row("Style", <TagLooks value={m.style ?? "sig"} color={m.color} name={m.label} set={v => set({ style: v })} />)}

      {m.kind === "tag" && row("Name", <input ref={textRef} id="an-label" className="an-inp" value={m.label} maxLength={40} placeholder="e.g. LCM Enzo" onFocus={begin} onBlur={end} onChange={e => set({ label: e.target.value }, true)} />)}
      {m.kind === "zone" && row("Label", <input ref={textRef} id="an-label" className="an-inp" value={m.label} maxLength={24} placeholder="e.g. 3v2" onFocus={begin} onBlur={end} onChange={e => set({ label: e.target.value }, true)} />)}
      {m.kind === "text" && row("Text", <textarea ref={textRef} id="an-text" className="an-inp" rows={4} value={m.text} maxLength={400} placeholder={"Inside diag is on." + String.fromCharCode(10) + "N6 vacates the lane."} onFocus={begin} onBlur={end} onChange={e => set({ text: e.target.value }, true)} />)}

      {row("Colour", <div className="an-cols">
        {MARK_COLOURS.map(c => <button key={c} className={`an-sw${m.color === c ? " on" : ""}`} aria-label={`Colour ${c}`} aria-pressed={m.color === c} style={{ background: c }} onClick={() => set({ color: c })} />)}
        <input type="color" className="an-sw an-any" aria-label="Any colour" value={m.color} onFocus={begin} onBlur={end} onChange={e => set({ color: e.target.value.toLowerCase() }, true)} />
      </div>)}

      {m.kind === "tag" && <>
        {row("Ring under the player", <Seg label="Ring" value={!m.ring ? "off" : m.glow ? "glow" : "solid"} options={[["solid", "Solid"], ["glow", "Glow"], ["off", "Off"]]}
          set={v => set(v === "off" ? { ring: false } : { ring: true, glow: v === "glow" })} />)}
        {slider("Size", m.size, 0.5, 2.5, 0.05, v => set({ size: v }, true))}
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
        <button className="an-act" onClick={onDuplicate} title="Duplicate (Ctrl D)"><CopyPlus size={15} /> Duplicate</button>
        <button className="an-act bad" onClick={onDelete} title="Delete (Del)"><Trash2 size={15} /> Delete</button>
        <button className="an-act sm" onClick={onFront} title="Bring to front"><ArrowUpToLine size={15} /> To front</button>
        <button className="an-act sm" onClick={onBack} title="Send to back"><ArrowDownToLine size={15} /> To back</button>
      </div>
    </div>
  )
}
