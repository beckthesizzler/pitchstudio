import { useEffect, useState, type RefObject } from "react"
import { AlignCenterHorizontal, AlignCenterVertical, ArrowDownToLine, ArrowUpToLine, CopyPlus, Crop, FlipHorizontal2, ImagePlus, Trash2 } from "lucide-react"
import { FORMATS, MAX_POINTS, MAX_ROWS, PAPERS, type Block, type Mark, type Report } from "./model"
import { lum } from "../brand/brand"
import type { Mode, PitchTool } from "./Canvas"
import { Teams, type TeamsProps } from "./Teams"
import { Row, Seg, Toggle } from "./ui"

/* The panel on the right: everything about what is selected (or the page, when nothing is).
   Typing and sliders count as one change each for Undo: begin() when you start, end() when you finish. */

export const STORY_COLOURS = ["#d7ff3c", "#ff4d5e", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#22c55e", "#ffffff"]
const TEXT_COLOURS: [string, string][] = [["ink", "Ink"], ["story", "Story"], ["muted", "Quiet"], ["#ffffff", "White"]]
const NAMES: Record<Block["kind"], string> = { text: "Text", pitch: "Pitch", stats: "Key stats", story: "Story", photo: "Photo" }
const MARK_NAMES: Record<Mark["kind"], string> = { player: "Player", pass: "Pass", pin: "Pin", zone: "Zone", ball: "Ball" }
export const PITCH_HINTS: Record<PitchTool, string> = {
  select: "Drag players and marks. Double-click a player to name them.",
  player: "Click the pitch to add one of your players.",
  opp: "Click the pitch to add an opponent.",
  pass: "Drag from one player to another for a pass.",
  run: "Drag where the player runs.",
  pin: "Click to drop the next numbered pin. It matches that point in your story.",
  zone: "Drag over the space that matters.",
  ball: "Click where the ball is.",
}

export type PanelProps = {
  report: Report; block: Block | null; mark: Mark | null; mode: Mode; tool: PitchTool
  setReport: (patch: Partial<Report>) => void; setBlock: (patch: Partial<Block>, live?: boolean) => void; setMark: (patch: Partial<Mark>, live?: boolean) => void
  begin: () => void; end: () => void; textRef: RefObject<HTMLTextAreaElement | null>; nameRef: RefObject<HTMLInputElement | null>
  act: (what: "dup" | "del" | "front" | "back" | "centre" | "middle" | "pitch" | "crop" | "done" | "photo" | "fitphoto" | "delmark" | "view" | "look" | "dir", arg?: string) => void
  team: Pick<TeamsProps, "setTeam" | "place" | "moment" | "count" | "namesText" | "roster" | "lineup">; reformat: (f: Report["format"]) => void
  storyAuto: string
}

export function Panel(P: PanelProps) {
  const { report, block: b, mark: m, mode, begin, end } = P
  // inside a pitch the panel has two tabs: the teams, and the selected mark. Choosing a mark opens its tab.
  const [tab, setTab] = useState<"teams" | "marks">("teams")
  useEffect(() => { setTab(m ? "marks" : "teams") }, [m?.id])
  const slider = (label: string, value: number, min: number, max: number, step: number, put: (v: number) => void, fmt: (v: number) => string) => (
    <Row label={label}>
      <div className="rp-slide">
        <input type="range" aria-label={label} min={min} max={max} step={step} value={value}
          onPointerDown={begin} onKeyDown={begin} onChange={e => put(+e.target.value)} onPointerUp={end} onKeyUp={end} onBlur={end} />
        <span>{fmt(value)}</span>
      </div>
    </Row>
  )
  const input = (label: string, value: string, put: (v: string) => void, o: { max?: number; ph?: string; ref?: RefObject<HTMLInputElement | null>; id?: string } = {}) => (
    <Row label={label}><input ref={o.ref} id={o.id} aria-label={label} className="rp-inp" value={value} maxLength={o.max ?? 60} placeholder={o.ph} onFocus={begin} onBlur={end} onChange={e => put(e.target.value)} /></Row>
  )
  const swatches = (value: string | null, put: (v: string | null) => void, auto: string, autoTitle: string) => (
    <div className="rp-cols">
      <button className={`rp-sw rp-auto${value === null ? " on" : ""}`} aria-label={autoTitle} title={autoTitle} aria-pressed={value === null} style={{ background: auto }} onClick={() => put(null)}>A</button>
      {STORY_COLOURS.map(c => <button key={c} className={`rp-sw${value === c ? " on" : ""}`} aria-label={`Colour ${c}`} aria-pressed={value === c} style={{ background: c }} onClick={() => put(c)} />)}
      <input type="color" className="rp-sw rp-any" aria-label="Any colour" value={value ?? auto} onFocus={begin} onBlur={end} onChange={e => put(e.target.value.toLowerCase())} />
    </div>
  )
  const arrange = (
    <div className="rp-acts">
      <button className="rp-icon" onClick={() => P.act("dup")} aria-label="Duplicate" title="Duplicate (Ctrl D)"><CopyPlus size={16} /></button>
      <button className="rp-icon" onClick={() => P.act("front")} aria-label="Bring to front" title="Bring to front"><ArrowUpToLine size={16} /></button>
      <button className="rp-icon" onClick={() => P.act("back")} aria-label="Send to back" title="Send to back"><ArrowDownToLine size={16} /></button>
      <button className="rp-icon" onClick={() => P.act("centre")} aria-label="Centre on the page" title="Centre on the page"><AlignCenterVertical size={16} /></button>
      <button className="rp-icon" onClick={() => P.act("middle")} aria-label="Middle of the page" title="Middle of the page"><AlignCenterHorizontal size={16} /></button>
      <span className="rp-sp" />
      <button className="rp-icon bad" onClick={() => P.act("del")} aria-label="Delete" title="Delete (Del)"><Trash2 size={16} /></button>
    </div>
  )

  /* ── inside a pitch: Teams (formations, kits, names) and Marks (the selected player, pass, pin or zone) ── */
  if (mode.kind === "pitch" && b?.kind === "pitch") {
    return (
      <div className="rp-insp" aria-label="Pitch">
        <div className="rp-head"><p className="rp-cap">EDITING THE PITCH</p><button className="rp-btn pri sm" onClick={() => P.act("done")}>Done</button></div>
        <div className="tm-tabs" role="tablist" aria-label="Pitch panel">
          <button role="tab" aria-selected={tab === "teams"} className={tab === "teams" ? "on" : ""} onClick={() => setTab("teams")}>Teams</button>
          <button role="tab" aria-selected={tab === "marks"} className={tab === "marks" ? "on" : ""} onClick={() => setTab("marks")}>{m ? MARK_NAMES[m.kind] : "Marks"}</button>
        </div>
        {tab === "teams" ? <Teams b={b} storyAuto={P.storyAuto} begin={begin} end={end} setBlock={P.setBlock} {...P.team} /> : <>
          <p className="rp-note">{PITCH_HINTS[P.tool]}</p>
          {!m && <p className="rp-note">Click a player, pass, pin or zone to change it. The tools on the left add more.</p>}
          {m && <>
            {m.kind === "player" && <>
              <div className="rp-two">
                {input("Number", m.num, v => P.setMark({ num: v.slice(0, 3) }, true), { max: 3, ph: "8" })}
                {input("Name", m.name, v => P.setMark({ name: v }, true), { max: 32, ph: "Pedri", ref: P.nameRef, id: "rp-name" })}
              </div>
              <Row label="Team"><Seg label="Team" value={m.team} options={[[0, "Yours"], [1, "Opponents"]]} set={v => P.setMark({ team: v, hi: v === 0 ? m.hi : false })} /></Row>
              <Toggle label="In the story (your colour)" on={m.hi} set={v => P.setMark({ hi: v })} />
              <Row label="Name sits"><Seg label="Name sits" value={m.side} options={[["below", "Below"], ["above", "Above"], ["left", "Left"], ["right", "Right"]]} set={v => P.setMark({ side: v })} /></Row>
            </>}
            {m.kind === "pass" && <>
              <Row label="Kind"><Seg label="Kind" value={m.run} options={[[false, "Pass"], [true, "Run"]]} set={v => P.setMark({ run: v })} /></Row>
              <Toggle label="In the story (your colour)" on={m.hi} set={v => P.setMark({ hi: v })} />
              <Row label="Weight"><Seg label="Weight" value={m.weight} options={[[1, "Light"], [2, "Medium"], [3, "Heavy"]]} set={v => P.setMark({ weight: v })} /></Row>
              <Row label="Arrow"><Seg label="Arrow" value={m.head} options={[["end", "End"], ["both", "Both"], ["none", "None"]]} set={v => P.setMark({ head: v })} /></Row>
              <Toggle label="In the air (stadium view)" on={m.air} set={v => P.setMark({ air: v })} />
              {m.c ? <button className="rp-btn sm" onClick={() => P.setMark({ c: null })}>Straighten</button> : <p className="rp-note">Drag the diamond in the middle to curve it.</p>}
            </>}
            {m.kind === "pin" && input("Number", m.n, v => P.setMark({ n: v.slice(0, 2) }, true), { max: 2 })}
            {m.kind === "zone" && <>
              <Row label="Shape"><Seg label="Shape" value={m.oval} options={[[false, "Box"], [true, "Oval"]]} set={v => P.setMark({ oval: v })} /></Row>
              <Toggle label="In the story (your colour)" on={m.hi} set={v => P.setMark({ hi: v })} />
              {input("Label", m.label, v => P.setMark({ label: v }, true), { max: 40, ph: "e.g. the pocket", ref: P.nameRef, id: "rp-name" })}
            </>}
            <div className="rp-acts"><span className="rp-sp" /><button className="rp-icon bad" onClick={() => P.act("delmark")} aria-label="Delete" title="Delete (Del)"><Trash2 size={16} /></button></div>
          </>}
        </>}
      </div>
    )
  }

  /* ── nothing selected: the page ── */
  if (!b) {
    return (
      <div className="rp-insp" aria-label="Page">
        <p className="rp-cap">PAGE</p>
        <Row label="Size"><Seg label="Size" value={report.format} options={FORMATS.map(f => [f.id, f.name] as [Report["format"], string])} set={v => P.reformat(v)} /></Row>
        <Row label="Mode"><Seg label="Mode" value={report.mode} options={[["night", "Night"], ["bright", "Bright"]]} set={v => P.setReport({ mode: v, paper: null })} /></Row>
        <Row label="Page colour"><div className="rp-cols">
          {PAPERS[report.mode].map(([c, name], i) => {
            const on = (report.paper ?? PAPERS[report.mode][0][0]) === c
            return <button key={c} className={`rp-sw rp-paper${on ? " on" : ""}`} aria-label={`Page colour: ${name}`} title={name} aria-pressed={on} style={{ background: c }} onClick={() => P.setReport({ paper: i === 0 ? null : c })} />
          })}
          <input type="color" className="rp-sw rp-any" aria-label="Any page colour" value={report.paper ?? PAPERS[report.mode][0][0]} onFocus={begin} onBlur={end}
            onChange={e => { const c = e.target.value.toLowerCase(), light = lum(c) > 0.6, dark = lum(c) < 0.2; if (light || dark) P.setReport({ paper: c, mode: light ? "bright" : "night" }) }} />
        </div></Row>
        <p className="rp-note">Warm paper, not pure white: your colour looks richer on it.</p>
        <Row label="Story colour">{swatches(report.story, v => P.setReport({ story: v }), P.storyAuto, "Your colour (from your Creator Card)")}</Row>
        <Toggle label="Glow of your colour" on={report.glow} set={v => P.setReport({ glow: v })} />
        <Row label="Your seal"><Seg label="Seal corner" value={report.seal} options={[["tl", "↖"], ["tr", "↗"], ["bl", "↙"], ["br", "↘"]]} set={v => P.setReport({ seal: v })} /></Row>
        <p className="rp-cap" style={{ marginTop: 22 }}>KEYS</p>
        <div className="rp-keys">
          {[["Double-click", "Go inside"], ["Drag", "Move, snaps"], ["Ctrl drag", "No snapping"], ["Shift drag", "Straight line"], ["Alt click", "The one underneath"], ["Arrows", "Nudge"], ["Ctrl D", "Duplicate"], ["Ctrl C / V", "Copy, paste"], ["Ctrl V", "Paste a photo"], ["Ctrl Z", "Undo"], ["Delete", "Remove"], ["Esc", "Step out"]].map(([k, t]) => <div key={k}><kbd>{k}</kbd><span>{t}</span></div>)}
        </div>
      </div>
    )
  }

  /* ── a block ── */
  return (
    <div className="rp-insp" aria-label={NAMES[b.kind]}>
      <p className="rp-cap">{NAMES[b.kind].toUpperCase()}</p>
      {b.kind === "text" && <>
        <Row label="Words"><textarea ref={P.textRef} id="rp-text" aria-label="Words" className="rp-inp" rows={b.style === "title" ? 2 : 4} value={b.text} maxLength={600} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ text: e.target.value }, true)} /></Row>
        <Row label="Style"><Seg label="Text style" value={b.style} options={[["title", "Headline"], ["text", "Text"], ["label", "Label"]]} set={v => P.setBlock({ style: v, size: v === "title" ? Math.max(b.size, 64) : v === "label" ? Math.min(b.size, 22) : Math.min(Math.max(b.size, 18), 40) })} /></Row>
        {slider("Size", b.size, 10, 300, 1, v => P.setBlock({ size: v }, true), v => `${Math.round(v)}`)}
        <Row label="Line up"><Seg label="Line up" value={b.align} options={[["left", "Left"], ["center", "Centre"], ["right", "Right"]]} set={v => P.setBlock({ align: v })} /></Row>
        <Row label="Colour"><div className="rp-cols">
          {TEXT_COLOURS.map(([c, t]) => <button key={c} className={`rp-chip${b.color === c ? " on" : ""}`} aria-pressed={b.color === c} onClick={() => P.setBlock({ color: c })}>{t}</button>)}
          <input type="color" className="rp-sw rp-any" aria-label="Any colour" value={b.color.startsWith("#") ? b.color : "#ffffff"} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ color: e.target.value.toLowerCase() }, true)} />
        </div></Row>
        <Row label="Look">
          <div className="rp-cols">
            {([["Marker", null, "story"], ["Lime block", "story", "#14161a"], ["Ink", null, "ink"], ["Lime on dark", "dark", "story"], ["White on dark", "dark", "#ffffff"]] as [string, string | null, string][]).map(([t, pl, col]) => {
              const on = b.plate === pl && b.color === col
              return <button key={t} className={`rp-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => P.setBlock({ plate: pl, color: col })}>{t}</button>
            })}
          </div>
        </Row>
        <Row label="Bar behind the words"><div className="rp-cols">
          {([["None", null], ["Dark", "dark"], ["Story", "story"]] as [string, string | null][]).map(([t, v]) => <button key={t} className={`rp-chip${b.plate === v ? " on" : ""}`} aria-pressed={b.plate === v} onClick={() => P.setBlock({ plate: v })}>{t}</button>)}
          <input type="color" className="rp-sw rp-any" aria-label="Any bar colour" value={b.plate && b.plate.startsWith("#") ? b.plate : "#14161a"} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ plate: e.target.value.toLowerCase() }, true)} />
        </div></Row>
        {b.rot !== 0 && <button className="rp-btn sm" onClick={() => P.setBlock({ rot: 0 })}>Straighten ({Math.round(b.rot)}°)</button>}
      </>}
      {b.kind === "pitch" && <>
        <button className="rp-btn pri wide" onClick={() => P.act("pitch")}>Edit players and passes</button>
        <p className="rp-note">Or double-click the pitch.</p>
        <p className="rp-cap" style={{ marginTop: 16 }}>TEAMS</p>
        <Teams b={b} storyAuto={P.storyAuto} begin={begin} end={end} setBlock={P.setBlock} {...P.team} />
        <p className="rp-cap" style={{ marginTop: 20 }}>PITCH</p>
        <Row label="Pitch"><Seg label="Pitch" value={b.view} options={[["full", "Full"], ["half", "Half"]]} set={v => P.act("view", v)} /></Row>
        <Row label="View"><Seg label="View" value={b.look} options={[["flat", "Flat"], ["stadium", "Stadium"]]} set={v => P.act("look", v)} /></Row>
        {b.look === "flat" && <Row label="Attacking"><Seg label="Attacking" value={b.dir} options={[["up", "Up"], ["right", "Right"]]} set={v => P.act("dir", v)} /></Row>}
        {slider("Player size", b.ms, 0.5, 2.5, 0.05, v => P.setBlock({ ms: v }, true), v => `${Math.round(v * 100)}%`)}
        {b.look === "flat" && <Toggle label="Your crest, faded behind" on={b.crest} set={v => P.setBlock({ crest: v })} />}
      </>}
      {b.kind === "stats" && <>
        <Row label="Stats for"><Seg label="Stats for" value={b.type} options={[["team", "A team"], ["player", "A player"]]} set={v => P.setBlock({ type: v })} /></Row>
        {b.type === "player" && <div className="rp-two">
          {input("Number", b.num, v => P.setBlock({ num: v.slice(0, 3) }, true), { max: 3, ph: "8" })}
          {input("Player", b.player, v => P.setBlock({ player: v }, true), { max: 32, ph: "Pedri" })}
        </div>}
        {b.rows.map((r, i) => (
          <div className="rp-statrow" key={i}>
            <input className="rp-inp" aria-label={`Stat ${i + 1} number`} value={r.value} maxLength={12} placeholder="64%" onFocus={begin} onBlur={end}
              onChange={e => P.setBlock({ rows: b.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }, true)} />
            <input className="rp-inp" aria-label={`Stat ${i + 1} label`} value={r.label} maxLength={30} placeholder="Possession" onFocus={begin} onBlur={end}
              onChange={e => P.setBlock({ rows: b.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }, true)} />
            <button className="rp-icon sm" aria-label={`Remove stat ${i + 1}`} onClick={() => P.setBlock({ rows: b.rows.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
        {b.rows.length < MAX_ROWS && <button className="rp-btn sm" onClick={() => P.setBlock({ rows: [...b.rows, { value: "", label: "" }] })}>+ Add a stat</button>}
      </>}
      {b.kind === "story" && <>
        {input("Title", b.title, v => P.setBlock({ title: v }, true), { max: 40, ph: "The story" })}
        {b.points.map((t, i) => (
          <div className="rp-statrow" key={i}>
            <span className="rp-num">{i + 1}</span>
            <textarea className="rp-inp" aria-label={`Point ${i + 1}`} rows={2} value={t} maxLength={200} onFocus={begin} onBlur={end} ref={i === 0 ? P.textRef : undefined}
              onChange={e => P.setBlock({ points: b.points.map((x, j) => (j === i ? e.target.value : x)) }, true)} />
            <button className="rp-icon sm" aria-label={`Remove point ${i + 1}`} onClick={() => P.setBlock({ points: b.points.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
        {b.points.length < MAX_POINTS && <button className="rp-btn sm" onClick={() => P.setBlock({ points: [...b.points, ""] })}>+ Add a point</button>}
        <p className="rp-note">The numbers match the pins on your pitch.</p>
      </>}
      {b.kind === "photo" && <>
        {!b.src ? <>
          <button className="rp-btn pri wide" onClick={() => P.act("photo")}><ImagePlus size={15} /> Choose a photo</button>
          <p className="rp-note">Or paste one (Ctrl V) or drop it here. A cut-out PNG keeps all of itself, with no frame or box.</p>
        </> : <>
          {mode.kind === "crop" ? <>
            <button className="rp-btn pri wide" onClick={() => P.act("done")}>Done cropping</button>
            <p className="rp-note">Drag the photo inside its frame. Scroll to zoom.</p>
            {slider("Zoom", b.iw / Math.max(b.w, b.h * (b.nw / b.nh)), 1, 4, 0.01, v => {
              const iw = Math.max(b.w, b.h * (b.nw / b.nh)) * v, fx = (b.w / 2 - b.ix) / b.iw, fy = (b.h / 2 - b.iy) / (b.iw * (b.nh / b.nw))
              P.setBlock({ iw, ix: Math.min(0, Math.max(b.w - iw, b.w / 2 - fx * iw)), iy: Math.min(0, Math.max(b.h - iw * (b.nh / b.nw), b.h / 2 - fy * iw * (b.nh / b.nw))) }, true)
            }, v => `${Math.round(v * 100)}%`)}
          </> : <div className="rp-line">
            <button className="rp-btn sm" onClick={() => P.act("crop")}><Crop size={14} /> Crop</button>
            <button className="rp-btn sm" onClick={() => P.act("fitphoto")}>Whole photo</button>
            <button className="rp-btn sm" onClick={() => P.act("photo")}>Replace</button>
          </div>}
          <Row label="Shape"><Seg label="Shape" value={b.shape} options={[["rect", "As is"], ["round", "Rounded"], ["circle", "Circle"]]} set={v => P.setBlock({ shape: v })} /></Row>
          <Row label="Edge"><Seg label="Edge" value={b.edge} options={[["hard", "Sharp"], ["soft", "Soft"], ["fade", "Fade out"]]} set={v => P.setBlock({ edge: v })} /></Row>
          {b.src.endsWith(".png")
            ? <Row label="Outline (follows the cut-out)"><Seg label="Outline" value={b.border} options={[["none", "None"], ["white", "White"], ["story", "Story"]]} set={v => P.setBlock({ border: v })} /></Row>
            : b.edge === "hard" && <Row label="Border"><Seg label="Border" value={b.border} options={[["none", "None"], ["white", "White"], ["story", "Story"]]} set={v => P.setBlock({ border: v })} /></Row>}
          <Toggle label="Shadow" on={b.shadow} set={v => P.setBlock({ shadow: v })} />
          <div className="rp-line">
            <button className="rp-btn sm" onClick={() => P.setBlock({ flip: !b.flip })}><FlipHorizontal2 size={14} /> Flip</button>
            {b.rot !== 0 && <button className="rp-btn sm" onClick={() => P.setBlock({ rot: 0 })}>Straighten</button>}
          </div>
        </>}
      </>}
      {arrange}
    </div>
  )
}
