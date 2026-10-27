import type { ReactNode, RefObject } from "react"
import { ArrowDownToLine, ArrowUpToLine, CopyPlus, Trash2 } from "lucide-react"
import { MARK_COLOURS, type Mark, type Shot } from "./model"

/* The panel on the right: what you can change about the selected mark (or the shot, when nothing is selected).
   Typing and sliders count as one change each for Undo: begin() when you start, end() when you finish. */

const NAMES: Record<Mark["kind"], string> = { tag: "Player tag", spot: "Spotlight", zone: "Zone", arrow: "Arrow", text: "Text" }
const KEYS: [string, string][] = [["V", "Select"], ["T", "Tag"], ["S", "Spotlight"], ["Z", "Zone"], ["A", "Arrow"], ["L", "Line"], ["X", "Text"],
  ["Delete", "Remove"], ["Ctrl Z", "Undo"], ["Ctrl D", "Duplicate"], ["Arrows", "Nudge"], ["+ / −", "Zoom"], ["Ctrl wheel", "Zoom"], ["Space drag", "Pan"], ["1 to 4", "Shots"]]

function Seg<T extends string | boolean>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return (
    <div className="an-seg" role="group" aria-label={label}>
      {options.map(([v, t]) => <button key={String(v)} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => set(v)}>{t}</button>)}
    </div>
  )
}

export function Inspector({ mark, shot, set, begin, end, textRef, onDuplicate, onDelete, onFront, onBack, onDim }: {
  mark: Mark | null; shot: Shot | null; set: (patch: Partial<Mark>, live?: boolean) => void; begin: () => void; end: () => void
  textRef: RefObject<(HTMLInputElement & HTMLTextAreaElement) | null>; onDuplicate: () => void; onDelete: () => void; onFront: () => void; onBack: () => void; onDim: (v: number, live?: boolean) => void
}) {
  const row = (label: string, body: ReactNode) => <div className="an-row"><span className="an-lab">{label}</span>{body}</div>
  const slider = (label: string, value: number, min: number, max: number, step: number, put: (v: number) => void, fmt?: (v: number) => string) => row(label,
    <div className="an-slide">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
        onPointerDown={begin} onKeyDown={begin} onChange={e => put(+e.target.value)} onPointerUp={end} onKeyUp={end} onBlur={end} />
      <span>{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
    </div>)

  if (!shot) return (
    <div className="an-insp">
      <p className="an-cap">START HERE</p>
      <ol className="an-steps">
        <li>Add up to 4 match shots.</li>
        <li>Tag the players that matter.</li>
        <li>Show the idea: zones, arrows, spotlights.</li>
        <li>Export, ready to post.</li>
      </ol>
    </div>
  )

  if (!mark) return (
    <div className="an-insp">
      <p className="an-cap">SHOT</p>
      {slider("Darken the shot", shot.dim, 0, 0.6, 0.05, v => onDim(v, true))}
      <p className="an-note">Darkening makes your marks stand out.</p>
      <div className="an-keysbox">
        <p className="an-cap" style={{ marginTop: 22 }}>KEYS</p>
        <div className="an-keys">{KEYS.map(([k, t]) => <div key={k}><kbd>{k}</kbd><span>{t}</span></div>)}</div>
      </div>
    </div>
  )

  const m = mark
  return (
    <div className="an-insp" aria-label={NAMES[m.kind]}>
      <p className="an-cap">{m.kind === "arrow" && m.head === "none" ? "LINE" : NAMES[m.kind].toUpperCase()}</p>

      {m.kind === "tag" && row("Name", <input ref={textRef} id="an-label" className="an-inp" value={m.label} maxLength={40} placeholder="e.g. LCM Enzo" onFocus={begin} onBlur={end} onChange={e => set({ label: e.target.value }, true)} />)}
      {m.kind === "zone" && row("Label", <input ref={textRef} id="an-label" className="an-inp" value={m.label} maxLength={24} placeholder="e.g. 3v2" onFocus={begin} onBlur={end} onChange={e => set({ label: e.target.value }, true)} />)}
      {m.kind === "text" && row("Text", <textarea ref={textRef} id="an-text" className="an-inp" rows={4} value={m.text} maxLength={400} placeholder={"Inside diag is on." + String.fromCharCode(10) + "N6 vacates the lane."} onFocus={begin} onBlur={end} onChange={e => set({ text: e.target.value }, true)} />)}

      {row("Colour", <div className="an-cols">
        {MARK_COLOURS.map(c => <button key={c} className={`an-sw${m.color === c ? " on" : ""}`} aria-label={`Colour ${c}`} aria-pressed={m.color === c} style={{ background: c }} onClick={() => set({ color: c })} />)}
        <input type="color" className="an-sw an-any" aria-label="Any colour" value={m.color} onFocus={begin} onBlur={end} onChange={e => set({ color: e.target.value.toLowerCase() }, true)} />
      </div>)}

      {m.kind === "tag" && <>
        {row("Ring under the player", <Seg label="Ring" value={m.ring} options={[[true, "On"], [false, "Off"]]} set={v => set({ ring: v })} />)}
        {slider("Size", m.size, 0.5, 2.5, 0.05, v => set({ size: v }, true))}
      </>}
      {m.kind === "spot" && slider("Beam width", m.size, 0.4, 2.5, 0.05, v => set({ size: v }, true))}
      {m.kind === "zone" && <>
        {row("Style", <Seg label="Zone style" value={m.outline} options={[[false, "Filled"], [true, "Outline"]]} set={v => set({ outline: v })} />)}
        {!m.outline && slider("Fill", m.opacity, 0.05, 0.7, 0.01, v => set({ opacity: v }, true))}
        {slider("Label size", m.size, 0.4, 2.5, 0.05, v => set({ size: v }, true))}
        <p className="an-note">Drag the corners onto the pitch lines to match the camera angle.</p>
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
        <button className="an-icon" onClick={onDuplicate} aria-label="Duplicate" title="Duplicate (Ctrl D)"><CopyPlus size={16} /></button>
        <button className="an-icon" onClick={onFront} aria-label="Bring to front" title="Bring to front"><ArrowUpToLine size={16} /></button>
        <button className="an-icon" onClick={onBack} aria-label="Send to back" title="Send to back"><ArrowDownToLine size={16} /></button>
        <button className="an-icon bad" onClick={onDelete} aria-label="Delete" title="Delete (Del)"><Trash2 size={16} /></button>
      </div>
    </div>
  )
}
