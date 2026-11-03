import { useState } from "react"
import { ChevronDown, Trash2 } from "lucide-react"
import { KitFill } from "./Draw"
import { KIT_PATTERNS, type KitPat, type PitchBlock, type Shape, type Team } from "./model"
import { FORMATIONS, KITS, PATTERN_LABELS, TOP_FORMATIONS, TOP_KITS, formationOf, parseLineup, readSquads, writeSquads, type Squad } from "./team"
import { Toggle } from "./ui"

/* Teams: for each team its name, formation, kit and players' names. This is the tactics board's team setup, on the report's pitch:
   pick a formation and the team moves into it (the players already there keep their names), pick a kit, paste a lineup, keep a squad. */

export type TeamsProps = {
  b: PitchBlock; storyAuto: string
  begin: () => void; end: () => void
  setTeam: (i: 0 | 1, patch: Partial<Team>, live?: boolean) => void
  setBlock: (patch: Partial<PitchBlock>) => void
  place: (i: 0 | 1, formation: string) => void
  moment: (m: "base" | "me" | "them") => void
  count: (i: 0 | 1) => number
  namesText: (i: 0 | 1) => string
  roster: (i: 0 | 1) => { name: string; num: string }[]
  lineup: (i: 0 | 1, entries: { name: string; num?: string }[], squad?: Squad) => void
}

/** A formation as a little pitch, the team attacking up */
function Mini({ name, color }: { name: string; color: string }) {
  const f = formationOf(name)
  return (
    <svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true" style={{ display: "block" }}>
      <rect x="0.75" y="0.75" width="32.5" height="42.5" rx="3" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.2" />
      <path d="M1 22H33" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" />
      {f?.pos.map((p, i) => <circle key={i} cx={4 + (p.y / 680) * 26} cy={3.5 + (1 - p.x / 1050) * 37} r="2.1" fill={color} />)}
    </svg>
  )
}
function KitDot({ id, size, pat, c1, c2 }: { id: string; size: number; pat: KitPat; c1: string; c2: string }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" style={{ display: "block" }}>
      <KitFill id={"kd" + id} r={11} pat={pat} c1={c1} c2={c2} />
      <circle r={11} fill="none" stroke="rgba(128,128,128,0.5)" strokeWidth={1} />
    </svg>
  )
}

export function Teams(P: TeamsProps) {
  const { b, begin, end } = P
  const [open, setOpen] = useState<0 | 1 | null>(0)
  const [more, setMore] = useState<[boolean, boolean]>([false, false])
  const [kitView, setKitView] = useState<["" | "more" | "own", "" | "more" | "own"]>(["", ""])
  const [namesFor, setNamesFor] = useState<0 | 1 | null>(null)
  const [text, setText] = useState("")
  const [squads, setSquads] = useState<Squad[]>(readSquads)
  const [squadId, setSquadId] = useState("")
  const flip = <T,>(a: [T, T], i: 0 | 1, v: T): [T, T] => (i === 0 ? [v, a[1]] : [a[0], v])
  const moment = b.teams[0].shape === "in" && b.teams[1].shape === "out" ? "me" : b.teams[0].shape === "out" && b.teams[1].shape === "in" ? "them" : b.teams[0].shape === "base" && b.teams[1].shape === "base" ? "base" : ""

  const card = (i: 0 | 1) => {
    const T = b.teams[i], isOpen = open === i, label = i === 0 ? "Your team" : "Opponents"
    const c1 = T.color ?? (i === 0 ? P.storyAuto : "#8c929c")
    const match = KITS.find(k => k.pat === T.pat && k.c1 === T.color && (k.pat === "solid" || k.c2 === T.c2))
    const shown = kitView[i] === "more" ? KITS : [...KITS.filter(k => TOP_KITS.includes(k.id)), ...(match && !TOP_KITS.includes(match.id) ? [match] : [])]
    const forms = more[i] ? FORMATIONS : FORMATIONS.filter(f => TOP_FORMATIONS.includes(f.name) || f.name === T.formation)
    const n = P.count(i), call = T.name.trim() || label
    const patch = (p: Partial<Team>, live = false) => P.setTeam(i, p, live)
    return (
      <section key={i} className={`tm${isOpen ? " open" : ""}`} data-team={i} aria-label={`${label} setup`}>
        <button className="tm-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i)}>
          <KitDot id={`h${i}`} size={26} pat={T.pat} c1={c1} c2={T.c2} />
          <span className="tm-name"><b>{call}</b><small>{T.formation || (n ? "Custom shape" : "No players yet")}{n ? ` · ${n} players` : ""}</small></span>
          <ChevronDown size={16} className="tm-chev" />
        </button>
        {isOpen && <div className="tm-body">
          <input className="rp-inp" aria-label={`${label} name`} value={T.name} maxLength={30} placeholder={label} onFocus={begin} onBlur={end} onChange={e => patch({ name: e.target.value }, true)} />
          <p className="tm-lab">Formation{T.formation ? "" : n ? " · custom: pick one to place them" : ""}</p>
          <div className="tm-forms" role="group" aria-label={`${label} formation`}>
            {forms.map(f => (
              <button key={f.name} className={`tm-form${T.formation === f.name ? " on" : ""}`} aria-pressed={T.formation === f.name} title={f.note} aria-label={`${f.name} formation`} onClick={() => P.place(i, f.name)}>
                <Mini name={f.name} color={c1} /><span>{f.name}</span>
              </button>
            ))}
          </div>
          <button className="tm-link" onClick={() => setMore(m => flip(m, i, !m[i]))}>{more[i] ? "Fewer formations" : `All ${FORMATIONS.length} formations`}</button>
          <p className="tm-lab">Kit · {match ? match.name : T.color ? "Your own" : i === 0 ? "Your colour" : "Quiet grey"}</p>
          <div className="tm-kits">
            <button className={`tm-kit${T.color === null && T.pat === "solid" ? " on" : ""}`} aria-label={i === 0 ? "Your colour, from your Creator Card" : "Quiet grey"} aria-pressed={T.color === null && T.pat === "solid"} title={i === 0 ? "Your colour" : "Quiet grey"}
              onClick={() => patch({ color: null, pat: "solid", c2: "#ffffff", num: null })}><KitDot id={`a${i}`} size={22} pat="solid" c1={i === 0 ? P.storyAuto : "#8c929c"} c2="#fff" /></button>
            {shown.map(k => {
              const on = match?.id === k.id
              return <button key={k.id} className={`tm-kit${on ? " on" : ""}`} title={k.name} aria-label={`${label} kit: ${k.name}`} aria-pressed={on} onClick={() => patch({ color: k.c1, pat: k.pat, c2: k.c2, num: k.num })}>
                <KitDot id={`${i}${k.id}`} size={22} pat={k.pat} c1={k.c1} c2={k.c2} /></button>
            })}
          </div>
          <div className="tm-links">
            <button className="tm-link" aria-expanded={kitView[i] === "more"} onClick={() => setKitView(v => flip(v, i, v[i] === "more" ? "" : "more"))}>{kitView[i] === "more" ? "Fewer kits" : `More kits (${KITS.length})`}</button>
            <span>·</span>
            <button className="tm-link" aria-expanded={kitView[i] === "own"} onClick={() => setKitView(v => flip(v, i, v[i] === "own" ? "" : "own"))}>Make your own</button>
          </div>
          {kitView[i] === "own" && <div className="tm-own">
            <div className="tm-cols">
              {([["Main", c1, (v: string) => patch({ color: v }, true)], ["Second", T.c2, (v: string) => patch({ c2: v }, true)], ["Number", T.num ?? "#ffffff", (v: string) => patch({ num: v }, true)]] as [string, string, (v: string) => void][]).map(([t, v, put]) => (
                <label key={t}><span>{t}</span><input type="color" aria-label={`${label} ${t.toLowerCase()} colour`} value={v} onFocus={begin} onBlur={end} onChange={e => put(e.target.value.toLowerCase())} /></label>
              ))}
            </div>
            <div className="rp-seg" role="group" aria-label={`${label} pattern`}>
              {KIT_PATTERNS.map(pt => <button key={pt} className={T.pat === pt ? "on" : ""} aria-pressed={T.pat === pt} onClick={() => patch({ pat: pt, c2: pt !== "solid" && T.c2.toLowerCase() === c1.toLowerCase() ? (c1.toLowerCase() === "#ffffff" ? "#111111" : "#ffffff") : T.c2 })}>{PATTERN_LABELS[pt]}</button>)}
            </div>
          </div>}
          <div className="tm-acts">
            <button className={`rp-btn sm${namesFor === i ? " pri" : ""}`} aria-expanded={namesFor === i} disabled={!n} title={n ? "Type or paste the names" : "Pick a formation first"}
              onClick={() => { if (namesFor === i) { setNamesFor(null); return } setText(P.namesText(i)); setNamesFor(i) }}>Names</button>
            <span className="rp-sp" />
          </div>
          {namesFor === i && n > 0 && <div className="tm-names">
            <textarea className="rp-inp" rows={Math.min(12, Math.max(6, n))} aria-label={`${label} lineup names`} value={text} onChange={e => setText(e.target.value)}
              placeholder={"One per line, goalkeeper first, then each line right to left. A shirt number next to a name is used too."} />
            <button className="rp-btn pri sm" disabled={!text.trim()} onClick={() => { P.lineup(i, parseLineup(text)); setNamesFor(null) }}>Name {call}</button>
            {squads.length > 0 && <div className="tm-squad">
              <select className="rp-inp" aria-label="Saved squad" value={squadId} onChange={e => { const q = squads.find(x => x.id === e.target.value); setSquadId(e.target.value); if (q) { P.lineup(i, q.players, q); setNamesFor(null) } }}>
                <option value="">Use a saved squad…</option>
                {squads.map(q => <option key={q.id} value={q.id}>{q.name} ({q.players.length})</option>)}
              </select>
              <button className="rp-icon sm bad" aria-label="Delete the squad" disabled={!squadId} title={squadId ? "Delete this squad" : "Choose a squad first"}
                onClick={() => { const next = squads.filter(x => x.id !== squadId); setSquads(next); writeSquads(next); setSquadId("") }}><Trash2 size={14} /></button>
            </div>}
            <button className="tm-link" onClick={() => {
              const players = P.roster(i); if (!players.length) return
              const sq: Squad = { id: Math.random().toString(36).slice(2, 9), name: T.name.trim() || label, teamName: T.name.trim(), kit: { pat: T.pat, c1, c2: T.c2, num: T.num ?? "#ffffff" }, players }
              const next = [...squads.filter(x => x.name !== sq.name), sq]; setSquads(next); writeSquads(next); setSquadId(sq.id)
            }}>Save {call} as a squad</button>
            <p className="rp-note">A squad keeps the names, numbers and kit in this browser, for any report or board.</p>
          </div>}
        </div>}
      </section>
    )
  }

  return (
    <div className="tm-wrap">
      <p className="tm-lab" style={{ marginTop: 0 }}>Who has the ball</p>
      <div className="rp-seg" role="group" aria-label="Who has the ball">
        {([["base", "Lineups"], ["me", "We attack"], ["them", "They attack"]] as ["base" | "me" | "them", string][]).map(([v, t]) =>
          <button key={v} className={moment === v ? "on" : ""} aria-pressed={moment === v} onClick={() => P.moment(v)}>{t}</button>)}
      </div>
      <p className="rp-note" style={{ marginTop: 8 }}>With a formation set, both teams move into their shape for that moment.</p>
      {card(0)}{card(1)}
      {b.look === "flat" && <Toggle label="Team names under the pitch" on={b.legend} set={v => P.setBlock({ legend: v })} />}
    </div>
  )
}
