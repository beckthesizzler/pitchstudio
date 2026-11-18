import { useEffect, useRef, useState, type ReactNode } from "react"
import { ArrowLeft, ArrowRight, Check, Maximize2, Plus, Trash2, Unlock, X } from "lucide-react"
import { SHAPES4, type FormationFill, type GameFill, type Fill, type JournalFill, type Report } from "./model"
import { lineupOf, placeFormation, TOP_FORMATIONS } from "./team"
import { filledCount, filledList, lockedIn } from "./fill"
import { dialScore, dialTilt } from "./Draw"
import { TimelineEdit } from "./Panel"

/* The Fill side of a template: a form whose answers write themselves onto the card as you type (fill.ts does the writing).
   On a computer it's one long form beside the card; on a phone, one step per screen with the card above. */

type Step = { id: string; name: string; ask: string; body: ReactNode; sum?: string }
export type FillFormProps = {
  report: Report; fill: Fill; set: (f: Fill, live?: boolean) => void; begin: () => void; end: () => void
  club?: string // your club, from your profile
  unlock: (section: string) => void; phone: boolean; preview: ReactNode; full: ReactNode; title: string
  onDesign: () => void; onToGame?: () => void
  onStep?: (section: string | null) => void // the section being filled: its blocks light up on the card
}

const csv = (a: string[]) => a.filter(Boolean).join(", ")
const fromCsv = (t: string, max: number) => t.split(",").map(x => x.trim()).slice(0, max)
/** The positions of a formation in the order the XI is typed: goalkeeper first, then the back line from the right */
export function seatOrder(shape: string): string[] {
  const marks = placeFormation([], 0, shape, "base", "full", null)
  return lineupOf(marks, 0, shape, "base", "full").map(s => s.pos)
}

/** A new formation: each named player moves to the nearest spot of the new shape, so the list follows them rather than being dealt out again */
export function keepSpots(from: string, to: string, names: string[]): string[] {
  const placed = placeFormation([], 0, from, "base", "full", null)
  const seats = lineupOf(placed, 0, from, "base", "full")
  const named = placed.map(m => { const k = seats.findIndex(s => s.m?.id === m.id); return m.kind === "player" && k >= 0 ? { ...m, name: names[k] ?? "" } : m })
  const moved = placeFormation(named, 0, to, "base", "full", { name: from, shape: "base" })
  return lineupOf(moved, 0, to, "base", "full").map(s => s.m?.name ?? "")
}

export function FillForm(P: FillFormProps) {
  const { report, fill, set, begin, end } = P
  const [step, setStep] = useState(0)
  const [big, setBig] = useState(false)
  const [done, total] = filledCount(fill)
  const doneAt = filledList(fill)
  const [open, setOpen] = useState(() => Math.max(0, doneAt.indexOf(false))) // on a computer, one section open at a time
  // a new report starts with your club as your team
  const clubbed = useRef(false)
  useEffect(() => {
    if (clubbed.current || !P.club || fill.template === "formation" || fill.home) return
    clubbed.current = true
    set({ ...fill, home: P.club } as Fill, false)
  }, [P.club, fill]) // eslint-disable-line react-hooks/exhaustive-deps
  const field = (label: string, value: string, put: (v: string) => void, o: { max?: number; ph?: string; area?: number } = {}) => (
    <label className="ff-field"><span>{label}</span>
      {o.area ? <textarea className="rp-inp" rows={o.area} value={value} maxLength={o.max ?? 400} placeholder={o.ph} onFocus={begin} onBlur={end} onChange={e => put(e.target.value)} />
        : <input className="rp-inp" value={value} maxLength={o.max ?? 80} placeholder={o.ph} onFocus={begin} onBlur={end} onChange={e => put(e.target.value)} />}
    </label>
  )
  const chips = <T extends string>(value: T, opts: readonly T[], put: (v: T) => void, label: string) => (
    <div className="rp-cols" role="group" aria-label={label}>{opts.map(o => <button key={o} className={`rp-chip${value === o ? " on" : ""}`} aria-pressed={value === o} onClick={() => put(o)}>{o}</button>)}</div>
  )
  const lockNote = (section: string) => lockedIn(report, section) && (
    <div className="ff-lock"><span>Edited in Design</span><button className="rp-btn sm" onClick={() => P.unlock(section)}><Unlock size={13} /> Unlock</button></div>
  )

  const steps: Step[] = fill.template === "game" ? gameSteps(fill) : fill.template === "formation" ? formationSteps(fill) : journalSteps(fill)

  function gameSteps(f: GameFill): Step[] {
    const put = (patch: Partial<GameFill>, live = true) => set({ ...f, ...patch }, live)
    const seats = seatOrder(f.shape)
    const dial = { value: f.dial, left: "CHAOS", right: "CONTROL" }
    return [
      { id: "match", name: "The match", ask: "Who played, and where?", sum: [[f.home, f.score, f.away].filter(Boolean).join(" "), f.meta].filter(Boolean).join(" · "), body: <>{lockNote("match")}
        <div className="ff-three">{field("Your team", f.home, v => put({ home: v }), { max: 30, ph: P.club || "Your team" })}{field("Score", f.score, v => put({ score: v }), { max: 12, ph: "3–0" })}{field("Opponent", f.away, v => put({ away: v }), { max: 30, ph: "Opponent" })}</div>
        {field("Competition, ground, date", f.meta, v => put({ meta: v }), { ph: "Competition · Matchday · Ground · Date" })}</> },
      { id: "headline", name: "Headline", ask: "What's the story in one line?", sum: f.headline, body: <>{lockNote("headline")}{field("Headline", f.headline, v => put({ headline: v }), { ph: "Villa played into the trap" })}<p className="rp-note">It shrinks to fit one line, however long.</p></> },
      { id: "state", name: "Game state", ask: "What changed the game, and when?", sum: f.events.length ? `${f.events.length} moment${f.events.length === 1 ? "" : "s"} · ${f.events.slice(0, 2).map(e => `${e.min}′ ${e.label}`).join(", ")}` : "", body: <>{lockNote("state")}
        <TimelineEdit events={f.events} set={events => put({ events }, false)} big={P.phone} chips={P.phone} /></> },
      { id: "shape", name: "Shape and players", ask: "How did you line up?", sum: f.lineup.some(Boolean) ? `${f.shape} · ${f.lineup.filter(Boolean).length} named${f.keys.length ? ` · ${f.keys.join(", ")}` : ""}` : "", body: <>{lockNote("shape")}
        <div className="ff-field"><span>Formation</span>{chips(f.shape, SHAPES4, v => put({ shape: v, lineup: keepSpots(f.shape, v, f.lineup) }, false), "Formation")}</div>
        {field("Our XI, keeper first", csv(f.lineup) ? f.lineup.join(", ").replace(/(, )+$/, "") : "", v => { const a = fromCsv(v, 11); while (a.length < 11) a.push(""); put({ lineup: a }) }, { area: 2, max: 400, ph: "Goalkeeper, right back, centre back, centre back, left back, …" })}
        <div className="ff-seats">{seats.map((pos, i) => <span key={i}><b>{pos}</b>{f.lineup[i] || "—"}</span>)}</div>
        {field("Key players (highlighted)", csv(f.keys), v => put({ keys: fromCsv(v, 11).filter(Boolean) }), { ph: "Up to 4 names, with commas" })}
        {field("Point of Difference (gold ring)", f.pod, v => put({ pod: v }), { max: 32, ph: "One name" })}
        {field("Why they made the difference", f.podWhy, v => put({ podWhy: v }), { area: 2, max: 160 })}</> },
      { id: "idea", name: "The idea", ask: "What was the plan?", sum: f.onball || f.offball || f.pattern, body: <>{lockNote("idea")}
        {field("On-ball structure", f.onball, v => put({ onball: v }), { area: 3 })}
        {field("Off-ball structure", f.offball, v => put({ offball: v }), { area: 3 })}
        {field("Pattern recognition", f.pattern, v => put({ pattern: v }), { area: 3 })}</> },
      { id: "situations", name: "Key situations", ask: "Which moments prove it?", sum: (n => n ? `${n} filled` : "")(f.situations.filter(x => x.text).length), body: <>{lockNote("situations")}
        <p className="rp-note">Each one gets a numbered pin, next to the first player of yours it names. Start a tag with "Game state" for one without a pin.</p>
        {f.situations.map((q, i) => <div key={i} className="ff-sit">
          <div className="ff-two">{field(`Tag ${i + 1}`, q.tag, v => put({ situations: f.situations.map((x, j) => (j === i ? { ...x, tag: v } : x)) }), { max: 24, ph: "Trap · 7'" })}
            <button className="rp-icon sm" style={{ alignSelf: "end", marginBottom: 2 }} aria-label={`Remove situation ${i + 1}`} onClick={() => put({ situations: f.situations.filter((_, j) => j !== i) }, false)}><Trash2 size={14} /></button></div>
          {field("What happened", q.text, v => put({ situations: f.situations.map((x, j) => (j === i ? { ...x, text: v } : x)) }), { area: 2, max: 200 })}
        </div>)}
        {f.situations.length < 6 && <button className="rp-btn sm" onClick={() => put({ situations: [...f.situations, { tag: "", text: "" }] }, false)}><Plus size={14} /> Add a situation</button>}</> },
      { id: "balance", name: "Balance", ask: "Control or chaos?", sum: f.dial !== 0 || f.dialWhy ? `${dialScore(f.dial)} of 10 · ${dialTilt(dial)}` : "", body: <>{lockNote("balance")}
        <input className="ff-dial" type="range" min={-10} max={10} step={1} value={f.dial} aria-label="Balance" onPointerDown={begin} onPointerUp={end} onKeyDown={begin} onKeyUp={end} onChange={e => put({ dial: +e.target.value })} />
        <div className="ff-dial-row"><span>CHAOS</span><b>{dialScore(f.dial)}/10 · {dialTilt(dial)}</b><span>CONTROL</span></div>
        {field("Why, in one line", f.dialWhy, v => put({ dialWhy: v }), { max: 160 })}</> },
      { id: "report", name: "The report", ask: "What's your verdict?", sum: f.report, body: <>{lockNote("report")}{field("The report", f.report, v => put({ report: v }), { area: 6, max: 600, ph: "What were we trying to achieve? Did we? How?" })}</> },
    ]
  }

  function formationSteps(f: FormationFill): Step[] {
    const put = (patch: Partial<FormationFill>, live = true) => set({ ...f, ...patch }, live)
    const shapes = [...new Set([...TOP_FORMATIONS, "3-4-3"])]
    const seats = seatOrder(f.shapeA), roles = report.roles ?? []
    return [
      { id: "ftitle", name: "Title", ask: "What's this team?", body: <>{lockNote("ftitle")}{field("Title", f.title, v => put({ title: v }), { max: 60, ph: "My dream XI" })}</> },
      { id: "fshapes", name: "The two shapes", ask: "Which shape becomes which?", body: <>{lockNote("fshapes")}
        <div className="ff-field"><span>From</span>{chips(f.shapeA, shapes, v => put({ shapeA: v }, false), "From")}</div>
        <div className="ff-field"><span>To</span>{chips(f.shapeB, shapes, v => put({ shapeB: v }, false), "To")}</div></> },
      { id: "fnames", name: "The eleven", ask: "Who plays, and what do they do?", body: <>{lockNote("fnames")}
        {field("Your XI, keeper first", f.lineup.join(", ").replace(/(, )+$/, ""), v => { const a = fromCsv(v, 11); while (a.length < 11) a.push(""); put({ lineup: a }) }, { area: 2, max: 400 })}
        <div className="ff-rows">{seats.map((pos, i) => <div key={i} className="ff-row">
          <b>{pos}</b><span className="n">{f.lineup[i] || "—"}</span>
          <input className="rp-inp" aria-label={`Second name for ${pos}`} value={f.alt[i] ?? ""} maxLength={32} placeholder="/ second name" onFocus={begin} onBlur={end} onChange={e => put({ alt: f.alt.map((x, j) => (j === i ? e.target.value : x)) })} />
          {roles.length > 0 && f.lineup[i] && <select className="rp-inp" aria-label={`${f.lineup[i]}'s role`} value={f.roles[f.lineup[i]] ?? ""} onChange={e => { const r = { ...f.roles }; if (e.target.value) r[f.lineup[i]] = e.target.value; else delete r[f.lineup[i]]; put({ roles: r }, false) }}>
            <option value="">No role</option>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}
        </div>)}</div></> },
      { id: "fnote", name: "Note", ask: "Anything the reader should know?", body: <>{lockNote("fnote")}{field("Note", f.note, v => put({ note: v }), { max: 160 })}</> },
    ]
  }

  function journalSteps(f: JournalFill): Step[] {
    const put = (patch: Partial<JournalFill>, live = true) => set({ ...f, ...patch }, live)
    const lines = (label: string, value: string[], n: number, k: keyof JournalFill) => field(label, value.join(String.fromCharCode(10)), v => put({ [k]: v.split(String.fromCharCode(10)).slice(0, n) } as Partial<JournalFill>), { area: Math.min(4, n), max: 600 })
    return [
      { id: "jbefore", name: "Before kick-off", ask: "Who's playing, and how are they coming in?", body: <>{lockNote("jbefore")}
        <div className="ff-two">{field("Home", f.home, v => put({ home: v }), { max: 30 })}{field("Away", f.away, v => put({ away: v }), { max: 30 })}</div>
        {field("Date", f.date, v => put({ date: v }), { max: 30 })}{field("Competition and ground", f.meta, v => put({ meta: v }))}
        <div className="ff-field"><span>Last 5</span><div className="rp-cols">{f.last5.map((x, i) => <button key={i} className={`rp-chip${x ? " on" : ""}`} aria-label={`Result ${i + 1}: ${x || "unknown"}`}
          onClick={() => put({ last5: f.last5.map((y, j) => (j === i ? (["", "W", "D", "L"][(["", "W", "D", "L"].indexOf(y) + 1) % 4]) : y)) }, false)}>{x || "–"}</button>)}</div></div></> },
      { id: "jxi", name: "Our XI", ask: "Who starts?", body: <>{lockNote("jxi")}
        {field("Shape", f.shape, v => put({ shape: v }), { max: 12 })}
        <div className="ff-rows">{f.xi.map((x, i) => <div key={i} className="ff-row three">
          <input className="rp-inp" aria-label={`Player ${i + 1} number`} value={x.no} maxLength={3} placeholder="#" onFocus={begin} onBlur={end} onChange={e => put({ xi: f.xi.map((y, j) => (j === i ? { ...y, no: e.target.value } : y)) })} />
          <input className="rp-inp" aria-label={`Player ${i + 1} name`} value={x.name} maxLength={24} placeholder="____" onFocus={begin} onBlur={end} onChange={e => put({ xi: f.xi.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)) })} />
          <input className="rp-inp" aria-label={`Player ${i + 1} position`} value={x.pos} maxLength={4} placeholder="POS" onFocus={begin} onBlur={end} onChange={e => put({ xi: f.xi.map((y, j) => (j === i ? { ...y, pos: e.target.value.toUpperCase() } : y)) })} />
        </div>)}</div>
        {field("Bench", f.bench, v => put({ bench: v }), { max: 120 })}</> },
      { id: "jdanger", name: "Danger and watching", ask: "Who worries you, and what are you watching for?", body: <>{lockNote("jdanger")}
        {f.danger.concat(Array(Math.max(0, 4 - f.danger.length)).fill({ name: "", note: "" })).slice(0, 4).map((d, i) => <div key={i} className="ff-two">
          {field(`Danger man ${i + 1}`, d.name, v => { const a = [...f.danger]; while (a.length < 4) a.push({ name: "", note: "" }); a[i] = { ...a[i], name: v }; put({ danger: a }) }, { max: 24 })}
          {field("Why", d.note, v => { const a = [...f.danger]; while (a.length < 4) a.push({ name: "", note: "" }); a[i] = { ...a[i], note: v }; put({ danger: a }) }, { max: 80 })}</div>)}
        {lines("What I'm watching (one per line)", f.watching, 3, "watching")}</> },
      { id: "jscore", name: "The match", ask: "How did it finish?", body: <>{lockNote("jscore")}
        {field("Score", f.score, v => put({ score: v }), { max: 12, ph: "3–0" })}
        {lines("Goals (one per line: 7' Yamal)", f.goals, 8, "goals")}{lines("Subs (one per line)", f.subs, 8, "subs")}</> },
      { id: "jcards", name: "Cards and numbers", ask: "Bookings, numbers, officials?", body: <>{lockNote("jcards")}
        {field("Yellow cards", f.yellows, v => put({ yellows: v }), { max: 120 })}{field("Red cards", f.reds, v => put({ reds: v }), { max: 120 })}
        {lines("Numbers (one per line)", f.numbers, 6, "numbers")}{field("Officials", f.officials, v => put({ officials: v }), { max: 120 })}</> },
      { id: "jverdict", name: "Verdict", ask: "Who made the difference, and what's your verdict?", body: <>{lockNote("jverdict")}
        {field("Point of Difference", f.pod, v => put({ pod: v }), { max: 32 })}
        <input className="ff-dial" type="range" min={-10} max={10} step={1} value={f.dial} aria-label="Balance" onPointerDown={begin} onPointerUp={end} onChange={e => put({ dial: +e.target.value })} />
        <div className="ff-dial-row"><span>CHAOS</span><b>{dialScore(f.dial)}/10 · {dialTilt({ value: f.dial, left: "CHAOS", right: "CONTROL" })}</b><span>CONTROL</span></div>
        {lines("Verdict (two lines)", f.verdict, 2, "verdict")}
        {P.onToGame && <button className="rp-btn pri wide" onClick={P.onToGame}>Turn into a Game Report</button>}</> },
    ]
  }

  const css = <style>{`
    .ff { display: flex; flex-direction: column; gap: 6px; }
    .ff-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; min-width: 0; } .ff-field > span { font-size: 12px; color: var(--ff-muted, #9aa0aa); }
    .ff-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: start; }
    .ff-three { display: grid; grid-template-columns: 1fr minmax(64px, .7fr) 1fr; gap: 10px; align-items: start; }
    .ff-sec { padding: 6px 0 8px; margin-bottom: 14px; border-bottom: 1px solid var(--ps-bd, rgba(128,128,128,.2)); }
    .ff-sec:last-of-type { border-bottom: none; }
    .ff-sec h3 { margin: 0 0 12px; font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .16em; text-transform: uppercase; color: var(--ps-mu, #9aa0aa); }
    .ff-top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 2px 0 14px; font-size: 14px; color: var(--ps-mu, #9aa0aa); }
    .ff-count { font: 500 12px 'JetBrains Mono', monospace; letter-spacing: .16em; text-transform: uppercase; color: var(--ps-em, #d7ff3c); white-space: nowrap; }
    .ff-k { font: 500 12px 'JetBrains Mono', monospace; letter-spacing: .16em; text-transform: uppercase; color: var(--ps-mu, #9aa0aa); }
    .ff-ticks { display: grid; grid-auto-flow: column; gap: 4px; margin: -4px 0 8px; } .ff-ticks i { height: 4px; border-radius: 2px; background: rgba(128,128,128,.25); } .ff-ticks i.on { background: var(--ps-accent, #d7ff3c); }
    .ff-acc { border-bottom: 1px solid var(--ps-bd, rgba(128,128,128,.2)); }
    .ff-acc-h { width: 100%; display: flex; align-items: flex-start; gap: 12px; padding: 13px 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer; }
    .ff-acc-h:focus-visible { outline: 2px solid var(--ps-accent, #d7ff3c); outline-offset: 2px; border-radius: 8px; }
    .ff-n { width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: rgba(128,128,128,.18); font: 700 12px 'Inter', sans-serif; }
    .ff-n.cur { background: var(--ps-accent, #d7ff3c); color: #121316; } .ff-n.ok { background: rgba(128,128,128,.18); }
    .ff-acc-t { min-width: 0; flex: 1; } .ff-acc-t b { display: block; font: 500 12px 'JetBrains Mono', monospace; letter-spacing: .16em; text-transform: uppercase; color: var(--ps-mu, #9aa0aa); }
    .ff-acc.open .ff-acc-t b { color: inherit; }
    .ff-acc-t small { display: block; margin-top: 4px; font: 400 13.5px 'Inter', sans-serif; color: var(--ps-mu, #9aa0aa); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ff-acc.open .ff-acc-t small { white-space: normal; color: inherit; font-weight: 500; }
    .ff-acc-b { padding: 4px 0 18px 38px; }
    .ff-lock { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 10px; background: rgba(233,185,73,.14); color: #e9b949; font: 600 12.5px 'Inter', sans-serif; margin-bottom: 12px; }
    .ff-seats { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: -4px 0 12px; font-size: 12px; color: var(--ps-mu, #9aa0aa); } .ff-seats b { font: 700 12px 'JetBrains Mono', monospace; margin-right: 4px; color: inherit; opacity: .8; }
    .ff-rows { display: grid; gap: 6px; margin-bottom: 12px; } .ff-row { display: grid; grid-template-columns: 38px 1fr 1fr auto; gap: 8px; align-items: center; font-size: 13px; } .ff-row b { font: 700 12px 'JetBrains Mono', monospace; color: var(--ps-mu, #9aa0aa); } .ff-row .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ff-row.three { grid-template-columns: 56px 1fr 70px; }
    .ff-sit { border-top: 1px dashed rgba(128,128,128,.25); padding-top: 10px; }
    .ff-dial { width: 100%; accent-color: var(--ps-accent, #d7ff3c); margin: 6px 0; }
    .ff-dial-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font: 700 12px 'JetBrains Mono', monospace; letter-spacing: .1em; color: var(--ps-mu, #9aa0aa); margin-bottom: 14px; } .ff-dial-row b { color: inherit; font-family: 'Inter', sans-serif; font-size: 13px; letter-spacing: .06em; }
    .ff-quick { margin-bottom: 10px; }
    .rp-inp.big, .ff-phone .rp-inp { min-height: 52px; font-size: 16px; }
    .ff-phone { display: flex; flex-direction: column; min-height: calc(100dvh - 56px); }
    .ff-prev { display: flex; gap: 12px; align-items: center; padding: 12px; border-bottom: 1px solid rgba(128,128,128,.2); }
    .ff-prev .card { width: 96px; flex: none; border-radius: 8px; overflow: hidden; box-shadow: 0 6px 16px rgba(0,0,0,.4); }
    .ff-prev small { display: block; font: 700 12px 'JetBrains Mono', monospace; letter-spacing: .14em; color: var(--ps-em, #d7ff3c); }
    .ff-prev p { margin: 4px 0 8px; font-size: 13px; color: var(--ps-mu, #9aa0aa); line-height: 1.4; }
    .ff-bar { display: grid; grid-auto-flow: column; gap: 4px; padding: 12px 16px 0; } .ff-bar i { height: 4px; border-radius: 2px; background: rgba(128,128,128,.25); } .ff-bar i.on { background: var(--ps-accent, #d7ff3c); }
    .ff-step { flex: 1; padding: 14px 16px 18px; overflow-y: auto; }
    .ff-step small { font: 700 12px 'JetBrains Mono', monospace; letter-spacing: .14em; color: var(--ps-mu, #9aa0aa); }
    .ff-step h2 { font-size: 24px; letter-spacing: -.02em; line-height: 1.2; margin: 6px 0 16px; }
    .ff-nav { position: sticky; bottom: 0; display: grid; grid-template-columns: auto 1fr; gap: 10px; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: inherit; border-top: 1px solid rgba(128,128,128,.2); }
    .ff-nav .rp-btn { height: 52px; font-size: 15px; }
    .ff-full { position: fixed; inset: 0; z-index: 70; background: #0b0c0e; overflow: auto; touch-action: pan-x pan-y pinch-zoom; }
    .ff-full .inner { width: max(100vw, 900px); padding: 56px 12px 24px; }
    .ff-full button { position: fixed; top: 10px; right: 10px; z-index: 2; }
  `}</style>

  if (P.phone) {
    const s = steps[Math.min(step, steps.length - 1)], last = step >= steps.length - 1
    return (
      <div className="ff ff-phone">{css}
        <div className="ff-prev">
          <div className="card">{P.preview}</div>
          <div><small>LIVE PREVIEW</small><p>Every answer lands on the card as you type.</p><button className="rp-btn sm" onClick={() => setBig(true)}><Maximize2 size={13} /> See it full size</button></div>
        </div>
        <div className="ff-bar" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((_, i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>
        <div className="ff-step">
          <small>STEP {step + 1} OF {steps.length} · {s.name.toUpperCase()}</small>
          <h2>{s.ask}</h2>
          {s.body}
        </div>
        <div className="ff-nav">
          <button className="rp-btn" disabled={step === 0} onClick={() => setStep(x => Math.max(0, x - 1))}><ArrowLeft size={16} /> Back</button>
          <button className="rp-btn pri" onClick={() => (last ? setBig(true) : setStep(x => x + 1))}>{last ? "See my card" : <>Next: {steps[step + 1].name} <ArrowRight size={16} /></>}</button>
        </div>
        {big && <div className="ff-full" role="dialog" aria-label="Your card, full size"><button className="rp-btn" onClick={() => setBig(false)}><X size={15} /> Close</button><div className="inner">{P.full}</div></div>}
      </div>
    )
  }
  const cur = Math.min(open, steps.length - 1)
  return (
    <div className="ff">{css}
      <div className="ff-top"><span className="ff-k">Fill it in</span><span className="ff-count">{done} of {total}</span></div>
      <div className="ff-ticks" aria-hidden="true">{doneAt.map((d, i) => <i key={i} className={d ? "on" : ""} />)}</div>
      {steps.map((s, i) => {
        const on = i === cur, ok = !!doneAt[i]
        return (
          <section key={s.id} className={`ff-acc${on ? " open" : ""}`} aria-label={s.name}>
            <button className="ff-acc-h" aria-expanded={on} onClick={() => { setOpen(on ? -1 : i); P.onStep?.(on ? null : s.id) }} onFocus={() => P.onStep?.(s.id)}>
              <span className={`ff-n${on ? " cur" : ok ? " ok" : ""}`}>{ok && !on ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
              <span className="ff-acc-t"><b>{s.name}</b><small>{on ? s.ask : s.sum || "Not filled yet"}</small></span>
            </button>
            {on && <div className="ff-acc-b" onFocusCapture={() => P.onStep?.(s.id)}>{s.body}
              {i < steps.length - 1 && <button className="rp-btn sm" style={{ marginTop: 4 }} onClick={() => { setOpen(i + 1); P.onStep?.(steps[i + 1].id) }}>Next: {steps[i + 1].name} <ArrowRight size={14} /></button>}
            </div>}
          </section>
        )
      })}
      <p className="rp-note" style={{ marginTop: 14 }}>Anything else (colours, layout, extra blocks) is in <button className="tm-link" onClick={P.onDesign}>Design</button>.</p>
    </div>
  )
}
