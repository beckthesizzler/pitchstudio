import { useEffect, useRef, useState, type RefObject } from "react"
import { AlignCenterHorizontal, AlignCenterVertical, ArrowDownToLine, ArrowUpToLine, CopyPlus, Crop, FlipHorizontal2, ImagePlus, Trash2 } from "lucide-react"
import { FORMATS, MAX_POINTS, MAX_ROWS, PAPERS, defaultRoles, newId, type Block, type ClubPalette, type Mark, type Report } from "./model"
import { dialScore, dialTilt } from "./Draw"
import { eventText, parseEvent } from "./fill"
import { lum } from "../brand/brand"
import { EDITORIAL } from "./templates"
import type { Mode, PitchTool } from "./Canvas"
import { Teams, type TeamsProps } from "./Teams"
import { Row, Seg, Toggle } from "./ui"

/* The panel on the right: everything about what is selected (or the page, when nothing is).
   Typing and sliders count as one change each for Undo: begin() when you start, end() when you finish. */

export const STORY_COLOURS = ["#d7ff3c", "#ff4d5e", "#38bdf8", "#fbbf24", "#f472b6", "#a78bfa", "#22c55e", "#ffffff"]
const TEXT_COLOURS: [string, string][] = [["ink", "Ink"], ["story", "Story"], ["muted", "Quiet"], ["#ffffff", "White"]]
const NAMES: Record<Block["kind"], string> = { text: "Text", pitch: "Pitch", stats: "Key stats", story: "Story", photo: "Photo", series: "Series line", timeline: "Timeline", idea: "The idea", dial: "Balance dial", cards: "Player cards", lines: "Lines", spine: "Spine", shape: "Shape" }
/** The club palettes to start from: [name, primary, secondary, accent] */
const PRESETS: [string, string, string, string][] = [["Barça", "#a11d48", "#1f4ba0", "#e9b949"], ["Mono", "#121316", "#6b6e76", "#e9b949"]]
/** Inks for hand-written words and drawn lines */
export const INKS: [string, string][] = [["#1f3e8c", "Blue"], ["#b3261e", "Red"], ["#2e7d32", "Green"], ["#6e1e3a", "Claret"], ["#1a1916", "Black"]]
const REF_COLOURS: [string, string][] = [["ink", "Ink"], ["story", "Story"], ["muted", "Quiet"], ["a", "Club 1"], ["b", "Club 2"], ["c", "Club 3"]]
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
  const [showKeys, setShowKeys] = useState(false) // the keyboard shortcuts, folded away until you ask
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
  const swatches = (value: string | null, put: (v: string | null) => void, auto: string, autoTitle: string, cols: string[] = STORY_COLOURS) => (
    <div className="rp-cols">
      <button className={`rp-sw rp-auto${value === null ? " on" : ""}`} aria-label={autoTitle} title={autoTitle} aria-pressed={value === null} style={{ background: auto }} onClick={() => put(null)}>A</button>
      {cols.map(c => <button key={c} className={`rp-sw${value === c ? " on" : ""}`} aria-label={`Colour ${c}`} aria-pressed={value === c} style={{ background: c }} onClick={() => put(c)} />)}
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
              {!!report.roles?.length && <Row label="Role"><div className="rp-cols">
                <button className={`rp-chip${!m.role ? " on" : ""}`} aria-pressed={!m.role} onClick={() => P.setMark({ role: null })}>Team colour</button>
                {report.roles.map(r => <button key={r.id} className={`rp-chip${m.role === r.id ? " on" : ""}`} aria-pressed={m.role === r.id} onClick={() => P.setMark({ role: r.id })}><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: "50%", background: r.color, marginRight: 6 }} />{r.name}</button>)}
              </div></Row>}
              {input("Tag (a small pill under the name)", m.tag ?? "", v => P.setMark({ tag: v.slice(0, 16) }, true), { max: 16, ph: "Nomad 10" })}
              <Toggle label="Point of Difference (gold ring)" on={!!m.ring} set={v => P.setMark({ ring: v })} />
            </>}
            {m.kind === "pass" && <>
              <Row label="Kind"><Seg label="Kind" value={m.run} options={[[false, "Pass"], [true, "Run"]]} set={v => P.setMark({ run: v })} /></Row>
              {report.actions && <Row label="Whose action"><Seg label="Whose action" value={m.team ?? -1} options={[[0, "Ours"], [1, "Theirs"], [-1, "Story"]]} set={v => P.setMark({ team: v === -1 ? null : (v as 0 | 1) })} /></Row>}
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
        {/* on the bright page only colours that read on paper: a pale one would need a highlighter behind the words */}
        <Row label="Story colour">{report.mode === "bright"
          ? swatches(report.story, v => P.setReport({ story: v }), lum(P.storyAuto) > 0.45 ? EDITORIAL : P.storyAuto, "Your colour (crimson on paper when yours is pale)", [EDITORIAL, "#1f3a68", ...STORY_COLOURS.filter(c => lum(c) <= 0.45)])
          : swatches(report.story, v => P.setReport({ story: v }), P.storyAuto, "Your colour (from your Creator Card)")}</Row>
        <Toggle label="Glow of your colour" on={report.glow} set={v => P.setReport({ glow: v })} />
        <Row label="Paper"><Seg label="Paper" value={report.paperStyle ?? "plain"} options={[["plain", "Plain"], ["dotted", "Dotted"], ["lined", "Lined"]]} set={v => P.setReport({ paperStyle: v })} /></Row>
        <p className="rp-cap" style={{ marginTop: 18 }}>CLUB PALETTE</p>
        <div className="rp-cols" style={{ marginBottom: 10 }}>
          <button className={`rp-chip${!report.palette ? " on" : ""}`} aria-pressed={!report.palette} onClick={() => P.setReport({ palette: null, stripe: false })}>Story colour</button>
          {PRESETS.map(([n, a, b, c]) => { const on = report.palette?.a === a && report.palette?.b === b && report.palette?.c === c
            return <button key={n} className={`rp-chip${on ? " on" : ""}`} aria-pressed={on} onClick={() => { const pal = { a, b, c }; P.setReport({ palette: pal, roles: report.roles?.length ? report.roles : defaultRoles(pal) }) }}>
              <span style={{ display: "inline-flex", gap: 2, marginRight: 6, verticalAlign: "-2px" }}>{[a, b, c].map(x => <i key={x} style={{ width: 10, height: 10, borderRadius: 3, background: x, display: "inline-block" }} />)}</span>{n}</button> })}
        </div>
        {report.palette && <>
          <div className="rp-cols" style={{ marginBottom: 12 }}>
            {(["a", "b", "c"] as const).map((k, i) => <label key={k} className="rp-lab" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="color" className="rp-sw rp-any" aria-label={["Primary", "Secondary", "Accent"][i]} value={report.palette![k]} onFocus={begin} onBlur={end}
                onChange={e => { const pal: ClubPalette = { ...report.palette!, [k]: e.target.value.toLowerCase() }; P.setReport({ palette: pal }) }} />{["Primary", "Secondary", "Accent"][i]}</label>)}
          </div>
          <Toggle label="Edge stripe" on={!!report.stripe} set={v => P.setReport({ stripe: v })} />
        </>}
        {(report.palette || !!report.roles?.length) && <>
          <p className="rp-cap" style={{ marginTop: 14 }}>ROLES</p>
          {(report.roles ?? []).map((r, i) => (
            <div className="rp-statrow" key={r.id}>
              <input type="color" className="rp-sw rp-any" aria-label={`${r.name} colour`} value={r.color} onFocus={begin} onBlur={end}
                onChange={e => P.setReport({ roles: report.roles!.map((x, j) => (j === i ? { ...x, color: e.target.value.toLowerCase() } : x)) })} />
              <input className="rp-inp" aria-label={`Role ${i + 1} name`} value={r.name} maxLength={24} onFocus={begin} onBlur={end} onChange={e => P.setReport({ roles: report.roles!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <button className="rp-icon sm" aria-label={`Delete ${r.name}`} onClick={() => P.setReport({ roles: report.roles!.filter(x => x.id !== r.id), blocks: report.blocks.map(b => (b.kind === "pitch" ? { ...b, marks: b.marks.map(m => (m.kind === "player" && m.role === r.id ? { ...m, role: null } : m)) } : b)) })}><Trash2 size={14} /></button>
            </div>
          ))}
          {(report.roles?.length ?? 0) < 8 && <button className="rp-btn sm" onClick={() => P.setReport({ roles: [...(report.roles ?? []), { id: newId().slice(0, 12), name: "New role", color: report.palette?.c ?? "#e9b949" }] })}>+ Add a role</button>}
        </>}
        <p className="rp-cap" style={{ marginTop: 18 }}>ACTIONS</p>
        <Toggle label="Colour passes by team" on={!!report.actions} set={v => P.setReport({ actions: v ? { ours: "#f2c230", theirs: "#ffffff" } : null })} />
        {report.actions && <div className="rp-cols" style={{ marginBottom: 12 }}>
          {(["ours", "theirs"] as const).map(k => <label key={k} className="rp-lab" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="color" className="rp-sw rp-any" aria-label={k === "ours" ? "Our actions" : "Their actions"} value={report.actions![k]} onFocus={begin} onBlur={end}
              onChange={e => P.setReport({ actions: { ...report.actions!, [k]: e.target.value.toLowerCase() } })} />{k === "ours" ? "Our actions" : "Their actions"}</label>)}
        </div>}
        <Row label="Your seal"><Seg label="Seal corner" value={report.seal} options={[["tl", "↖"], ["tr", "↗"], ["bl", "↙"], ["br", "↘"]]} set={v => P.setReport({ seal: v })} /></Row>
        <button className="rp-keysbtn" aria-expanded={showKeys} onClick={() => setShowKeys(v => !v)}><span aria-hidden="true">?</span> Keyboard shortcuts</button>
        {showKeys && <div className="rp-keys">
          {[["Double-click", "Go inside"], ["Drag", "Move, snaps"], ["Ctrl drag", "No snapping"], ["Shift drag", "Straight line"], ["Alt click", "The one underneath"], ["Arrows", "Nudge"], ["Ctrl D", "Duplicate"], ["Ctrl C / V", "Copy, paste"], ["Ctrl V", "Paste a photo"], ["Ctrl Z", "Undo"], ["Delete", "Remove"], ["Esc", "Step out"]].map(([k, t]) => <div key={k}><kbd>{k}</kbd><span>{t}</span></div>)}
        </div>}
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
        {b.style === "title" && <Toggle label="Fit on one line" on={!!b.fit} set={v => P.setBlock({ fit: v })} />}
        <Row label="Rule under it"><Seg label="Rule under it" value={b.under ?? "none"} options={[["none", "None"], ["thin", "Thin"], ["thick", "Thick"]]} set={v => P.setBlock({ under: v })} /></Row>
        <Row label="Writing"><Seg label="Writing" value={b.font ?? "sans"} options={[["sans", "Type"], ["hand", "By hand"]]} set={v => P.setBlock({ font: v })} /></Row>
        {b.font === "hand" && <Row label="Ink"><div className="rp-cols">{INKS.map(([c, n]) => <button key={c} className={`rp-sw${b.color === c ? " on" : ""}`} aria-label={`${n} ink`} title={n} aria-pressed={b.color === c} style={{ background: c }} onClick={() => P.setBlock({ color: c })} />)}</div></Row>}
        {b.rot !== 0 && <button className="rp-btn sm" onClick={() => P.setBlock({ rot: 0 })}>Straighten ({Math.round(b.rot)}°)</button>}
      </>}
      {b.kind === "pitch" && <>
        <button className="rp-btn pri wide" onClick={() => P.act("pitch")}>Edit players and passes</button>
        <p className="rp-note">Or double-click the pitch.</p>
        <p className="rp-cap" style={{ marginTop: 16 }}>TEAMS</p>
        <Teams b={b} storyAuto={P.storyAuto} begin={begin} end={end} setBlock={P.setBlock} {...P.team} />
        <p className="rp-cap" style={{ marginTop: 20 }}>PITCH</p>
        <Row label="Pitch"><Seg label="Pitch" value={b.view} options={[["full", "Full"], ["half", "Half"]]} set={v => P.act("view", v)} /></Row>
        <Row label="View"><Seg label="View" value={b.look} options={[["flat", "Flat"], ["grass", "Grass"], ["stadium", "Stadium"]]} set={v => P.act("look", v)} /></Row>
        {b.look !== "stadium" && <Row label="Attacking"><Seg label="Attacking" value={b.dir} options={[["up", "Up"], ["right", "Right"]]} set={v => P.act("dir", v)} /></Row>}
        {slider("Player size", b.ms, 0.5, 2.5, 0.05, v => P.setBlock({ ms: v }, true), v => `${Math.round(v * 100)}%`)}
        {b.look === "flat" && <Toggle label="Your crest, faded behind" on={b.crest} set={v => P.setBlock({ crest: v })} />}
        {b.slot && <p className="rp-note">{b.locked ? "Edited here, so the Fill form leaves its players alone." : "The Fill form places your eleven here. Change them here and it stops."}</p>}
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
          {slider("See-through", 1 - (b.opacity ?? 1), 0, 0.95, 0.01, v => P.setBlock({ opacity: Math.round((1 - v) * 100) / 100 }, true), v => `${Math.round(v * 100)}%`)}
          <div className="rp-line">
            <button className="rp-btn sm" onClick={() => P.setBlock({ flip: !b.flip })}><FlipHorizontal2 size={14} /> Flip</button>
            {b.rot !== 0 && <button className="rp-btn sm" onClick={() => P.setBlock({ rot: 0 })}>Straighten</button>}
          </div>
        </>}
      </>}
      {b.kind === "series" && <>
        {input("Words", b.text, v => P.setBlock({ text: v.slice(0, 80) }, true), { max: 80, ph: "@HANDLE · SERIES · Nº {n}" })}
        <p className="rp-note">{"{n}"} becomes the report's number (it's kept from its first export). @HANDLE becomes your handle.</p>
        {slider("Size", b.size, 10, 60, 1, v => P.setBlock({ size: v }, true), v => `${Math.round(v)}`)}
        <Row label="Colour"><div className="rp-cols">{REF_COLOURS.map(([c, t]) => <button key={c} className={`rp-chip${b.color === c ? " on" : ""}`} aria-pressed={b.color === c} onClick={() => P.setBlock({ color: c })}>{t}</button>)}</div></Row>
      </>}
      {b.kind === "timeline" && <TimelineEdit events={b.events} set={events => P.setBlock({ events })} />}
      {b.kind === "idea" && <>
        {input("Title", b.title, v => P.setBlock({ title: v }, true), { max: 60, ph: "The idea" })}
        {b.sections.map((q, i) => (
          <div key={i} className="rp-box">
            <div className="rp-statrow"><input className="rp-inp" aria-label={`Section ${i + 1} heading`} value={q.heading} maxLength={40} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ sections: b.sections.map((x, j) => (j === i ? { ...x, heading: e.target.value } : x)) }, true)} />
              <button className="rp-icon sm" aria-label={`Remove section ${i + 1}`} onClick={() => P.setBlock({ sections: b.sections.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></div>
            <textarea className="rp-inp" aria-label={`Section ${i + 1} text`} rows={3} value={q.body} maxLength={400} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ sections: b.sections.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) }, true)} />
          </div>
        ))}
        {b.sections.length < 8 && <button className="rp-btn sm" onClick={() => P.setBlock({ sections: [...b.sections, { heading: "New section", body: "" }] })}>+ Add a section</button>}
        <p className="rp-cap" style={{ marginTop: 16 }}>KEY SITUATIONS</p>
        {b.situations.map((q, i) => (
          <div key={i} className="rp-box">
            <div className="rp-statrow"><input className="rp-inp" aria-label={`Situation ${i + 1} tag`} value={q.tag} maxLength={24} placeholder="Trap · 7'" onFocus={begin} onBlur={end} onChange={e => P.setBlock({ situations: b.situations.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)) }, true)} />
              <button className="rp-icon sm" aria-label={`Remove situation ${i + 1}`} onClick={() => P.setBlock({ situations: b.situations.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></div>
            <textarea className="rp-inp" aria-label={`Situation ${i + 1}`} rows={2} value={q.text} maxLength={200} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ situations: b.situations.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) }, true)} />
            <Toggle label="Numbered (matches a pin)" on={q.pin} set={v => P.setBlock({ situations: b.situations.map((x, j) => (j === i ? { ...x, pin: v } : x)) })} />
          </div>
        ))}
        {b.situations.length < 6 && <button className="rp-btn sm" onClick={() => P.setBlock({ situations: [...b.situations, { tag: "", text: "", pin: true }] })}>+ Add a situation</button>}
        <p className="rp-cap" style={{ marginTop: 16 }}>POINT OF DIFFERENCE</p>
        {input("Player", b.pod, v => P.setBlock({ pod: v }, true), { max: 40, ph: "Yamal" })}
        <Row label="Why"><textarea className="rp-inp" aria-label="Why" rows={2} value={b.podLine} maxLength={160} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ podLine: e.target.value }, true)} /></Row>
      </>}
      {b.kind === "dial" && <>
        {slider("Tilt", b.value, -10, 10, 1, v => P.setBlock({ value: v }, true), v => `${dialScore(v)}/10`)}
        <p className="rp-note">{dialTilt(b)}. Drag the needle on the card, or use the arrow keys on this slider.</p>
        <DialType value={b.value} set={v => P.setBlock({ value: v })} left={b.left} right={b.right} />
        <div className="rp-two" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {input("Left end", b.left, v => P.setBlock({ left: v.toUpperCase() }, true), { max: 16 })}
          {input("Right end", b.right, v => P.setBlock({ right: v.toUpperCase() }, true), { max: 16 })}
        </div>
        <Row label="Why"><textarea className="rp-inp" aria-label="Why" rows={2} value={b.line} maxLength={160} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ line: e.target.value }, true)} /></Row>
      </>}
      {b.kind === "cards" && <>
        {slider("Across", b.cols, 1, 6, 1, v => P.setBlock({ cols: v }, true), v => `${v}`)}
        <Row label="Ink"><div className="rp-cols">{INKS.map(([c, n]) => <button key={c} className={`rp-sw${b.ink === c ? " on" : ""}`} aria-label={`${n} ink`} title={n} aria-pressed={b.ink === c} style={{ background: c }} onClick={() => P.setBlock({ ink: c })} />)}</div></Row>
        {b.cards.map((c, i) => (
          <div className="rp-statrow" key={i}>
            <input className="rp-inp" style={{ width: 46, flex: "none" }} aria-label={`Card ${i + 1} number`} value={c.no} maxLength={3} placeholder="8" onFocus={begin} onBlur={end} onChange={e => P.setBlock({ cards: b.cards.map((x, j) => (j === i ? { ...x, no: e.target.value } : x)) }, true)} />
            <input className="rp-inp" aria-label={`Card ${i + 1} name`} value={c.name} maxLength={24} placeholder="Name" onFocus={begin} onBlur={end} onChange={e => P.setBlock({ cards: b.cards.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }, true)} />
            <input className="rp-inp" style={{ width: 52, flex: "none" }} aria-label={`Card ${i + 1} position`} value={c.pos} maxLength={4} placeholder="CM" onFocus={begin} onBlur={end} onChange={e => P.setBlock({ cards: b.cards.map((x, j) => (j === i ? { ...x, pos: e.target.value } : x)) }, true)} />
            <button className="rp-icon sm" aria-label={`Remove card ${i + 1}`} onClick={() => P.setBlock({ cards: b.cards.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
        {b.cards.length < 24 && <button className="rp-btn sm" onClick={() => P.setBlock({ cards: [...b.cards, { no: "", name: "", pos: "", tag: "", line: "G __  A __" }] })}>+ Add a card</button>}
        {input("Last box", b.extra, v => P.setBlock({ extra: v }, true), { max: 30, ph: "+ bench (empty for none)" })}
      </>}
      {b.kind === "lines" && <>
        {input("Heading", b.heading, v => P.setBlock({ heading: v }, true), { max: 40 })}
        <Row label="Lines (one per row; ____ for a blank)"><textarea className="rp-inp" aria-label="Lines" rows={5} value={b.lines.join(String.fromCharCode(10))} onFocus={begin} onBlur={end}
          onChange={e => P.setBlock({ lines: e.target.value.split(String.fromCharCode(10)).slice(0, 12).map(l => l.slice(0, 120)) }, true)} /></Row>
        <Row label="Ink"><div className="rp-cols">{INKS.map(([c, n]) => <button key={c} className={`rp-sw${b.ink === c ? " on" : ""}`} aria-label={`${n} ink`} title={n} aria-pressed={b.ink === c} style={{ background: c }} onClick={() => P.setBlock({ ink: c })} />)}</div></Row>
      </>}
      {b.kind === "spine" && <p className="rp-note">The fold between the pages. Drag its sides to make it wider.</p>}
      {b.kind === "shape" && <>
        <Row label="Shape"><Seg label="Shape" value={b.shape} options={[["box", "Box"], ["shield", "Shield"], ["shirt", "Shirt"], ["circle", "Circle"]]} set={v => P.setBlock({ shape: v })} /></Row>
        {input("Label", b.label, v => P.setBlock({ label: v }, true), { max: 40 })}
        {slider("Label size", b.size, 8, 80, 1, v => P.setBlock({ size: v }, true), v => `${Math.round(v)}`)}
        <Row label="Line"><div className="rp-cols">{[...INKS, ["c", "Gold"] as [string, string]].map(([c, n]) => <button key={c} className={`rp-sw${b.stroke === c ? " on" : ""}`} aria-label={`${n} line`} title={n} aria-pressed={b.stroke === c} style={{ background: c === "c" ? "#e9b949" : c }} onClick={() => P.setBlock({ stroke: c })} />)}</div></Row>
        <Row label="Fill"><div className="rp-cols">
          <button className={`rp-chip${!b.fill ? " on" : ""}`} aria-pressed={!b.fill} onClick={() => P.setBlock({ fill: null })}>None</button>
          <input type="color" className="rp-sw rp-any" aria-label="Fill colour" value={b.fill && b.fill.startsWith("#") ? b.fill : "#ffffff"} onFocus={begin} onBlur={end} onChange={e => P.setBlock({ fill: e.target.value.toLowerCase() }, true)} />
        </div></Row>
        <Toggle label="Dashed" on={b.dash} set={v => P.setBlock({ dash: v })} />
      </>}
      {b.slot && b.kind !== "pitch" && b.locked && <p className="rp-note">Edited here, so the Fill form leaves this alone.</p>}
      {arrange}
    </div>
  )
}

/** The game state: type "7 Yamal goal" and press Enter. "HT Rodri off" puts it at half-time. */
export function TimelineEdit({ events, set, big = false, chips = false }: { events: import("./model").TLEvent[]; set: (e: import("./model").TLEvent[]) => void; big?: boolean; chips?: boolean }) {
  const [t, setT] = useState("")
  const [bad, setBad] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  // a quick chip writes its word and leaves the caret in front of it, ready for the minute and the name
  const seed = (w: string) => { setT(" " + w); setBad(false); requestAnimationFrame(() => { const el = ref.current; if (el) { el.focus(); el.setSelectionRange(0, 0) } }) }
  const addIt = () => { const e = parseEvent(t); if (!e) { setBad(true); return } if (events.length >= 12) return; set([...events, e].sort((a, b) => a.min - b.min)); setT(""); setBad(false) }
  return <>
    {chips && <div className="rp-cols" style={{ marginBottom: 10 }}>{[["+ Goal", "goal"], ["+ Sub", "sub"], ["+ Injury", "injury"], ["+ Red card", "red"]].map(([l, w]) => <button key={w} className="rp-chip" onClick={() => seed(w)}>{l}</button>)}</div>}
    <Row label="Add a moment"><input ref={ref} className={`rp-inp${big ? " big" : ""}`} aria-label="Add a moment" value={t} placeholder="7 Yamal goal" onChange={e => { setT(e.target.value); setBad(false) }}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addIt() } }} /></Row>
    <p className="rp-note">{bad ? "Start with the minute (or HT), then the name: 7 Yamal goal." : "The minute first, then the name. Goal, sub, off, on, injury or red sets the kind. Press Enter."}</p>
    <div className="rp-cols" style={{ marginBottom: 12 }}>
      {events.map((e, i) => <span key={i} className="rp-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{eventText(e)}
        <button aria-label={`Remove ${eventText(e)}`} onClick={() => set(events.filter((_, j) => j !== i))} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", padding: 0, display: "grid" }}><Trash2 size={12} /></button></span>)}
    </div>
  </>
}
/** Type "8 control" (or "7 chaos", "10") and the needle moves there */
function DialType({ value, set, left, right }: { value: number; set: (v: number) => void; left: string; right: string }) {
  const [t, setT] = useState("")
  const go = () => {
    const m = /^([0-9]{1,2})\s*(.*)$/.exec(t.trim())
    if (!m) return
    const score = Math.max(0, Math.min(10, parseInt(m[1], 10))), side = m[2].trim().toLowerCase(), off = 10 - score
    const toLeft = side && left.toLowerCase().startsWith(side.slice(0, 3)), toRight = side && right.toLowerCase().startsWith(side.slice(0, 3))
    set(toLeft ? -off : toRight ? off : value < 0 ? -off : off); setT("")
  }
  return <Row label="Or type it"><input className="rp-inp" aria-label="Score and side" value={t} placeholder={`8 ${right.toLowerCase()}`} onChange={e => setT(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); go() } }} onBlur={go} /></Row>
}
