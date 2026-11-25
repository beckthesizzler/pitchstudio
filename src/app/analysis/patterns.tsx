import { ChevronLeft, ChevronRight, X } from "lucide-react"
import type { Tool } from "./Stage"

/* Pattern starters: the analysis behind the tools. Pick one and the right tools come up in order, one step at a time,
   with the notes shaped for that pattern ("__" for what only you can fill in). A step moves on by itself once you've
   made its mark. */

export type Pattern = { id: string; name: string; sub: string; steps: { tool: Tool; say: string }[]; head: string; body: string }

export const PATTERNS: Pattern[] = [
  {
    id: "high", name: "High line", sub: "How far up their back line sits",
    steps: [
      { tool: "calib", say: "Pin it to the pitch so the distance is real" },
      { tool: "tie", say: "Tie their back line together, player to player" },
      { tool: "measure", say: "Measure from the back line to their goal" },
      { tool: "tag", say: "Tag the runner who can get in behind" },
    ],
    head: "A line __ m from goal.", body: "Their back line holds __ m from their own goal. That leaves __ m behind it for __ to run into.",
  },
  {
    id: "trap", name: "Press trap", sub: "Where they force the ball, and win it",
    steps: [
      { tool: "ring", say: "Ring the player who presses first" },
      { tool: "shadow", say: "Draw his cover shadow: drag from him toward the ball" },
      { tool: "zone", say: "Outline the area the ball is forced into" },
      { tool: "arrow", say: "Arrow the pass they leave open, the one that walks into it" },
    ],
    head: "The trap is set.", body: "__ presses from the outside in. His cover shadow takes away __, so the ball goes to __, and that's where they win it back.",
  },
  {
    id: "over", name: "Overload", sub: "More of us than them on one side",
    steps: [
      { tool: "zone", say: "Outline the side where the numbers are" },
      { tool: "ring", say: "Ring each of your players in it" },
      { tool: "text", say: "Write the count on it, like 4v2" },
      { tool: "arrow", say: "Arrow the switch to the free side" },
    ],
    head: "__ v __ on the __ side.", body: "They pull __ players to one side. That leaves __ free on the far side, one switch away.",
  },
  {
    id: "rest", name: "Rest defence", sub: "Who stays back while you attack",
    steps: [
      { tool: "ring", say: "Ring every player behind the ball" },
      { tool: "tie", say: "Tie them together to show the shape" },
      { tool: "measure", say: "Measure the gap they'd have to cover" },
      { tool: "focus", say: "Light up that area and dim the rest" },
    ],
    head: "__ + __ behind the ball.", body: "With the ball high, __ stay back in a __. The gap they have to cover on the break is __ m.",
  },
]

export function PatternStrip({ onPick }: { onPick: (p: Pattern) => void }) {
  return (
    <div className="la-pat" role="group" aria-label="Start from a pattern">
      <span className="k">Start from a pattern</span>
      {PATTERNS.map(p => <button key={p.id} onClick={() => onPick(p)} title={p.sub}><b>{p.name}</b><small>{p.sub}</small></button>)}
    </div>
  )
}

export function PatternCoach({ p, step, setStep, onClose, toolName }: { p: Pattern; step: number; setStep: (n: number) => void; onClose: () => void; toolName: (t: Tool) => string }) {
  const s = p.steps[step], last = step === p.steps.length - 1
  return (
    <div className="la-coach" role="status" aria-live="polite">
      <div className="top"><b>{p.name}</b><span>Step {step + 1} of {p.steps.length}</span><button className="an-x" aria-label="Stop the pattern" onClick={onClose}><X size={14} /></button></div>
      <p>{s.say}</p>
      <div className="row">
        <span className="tool">{toolName(s.tool)}</span>
        <span className="la-sp" />
        <button className="la-tiny" disabled={!step} onClick={() => setStep(step - 1)} aria-label="Previous step"><ChevronLeft size={14} /></button>
        <button className="la-tiny" onClick={() => (last ? onClose() : setStep(step + 1))}>{last ? "Done" : <>Next <ChevronRight size={14} /></>}</button>
      </div>
      <div className="dots">{p.steps.map((_, i) => <i key={i} className={i < step ? "done" : i === step ? "now" : ""} />)}</div>
    </div>
  )
}

export const PATTERN_CSS = `
  .la-pat { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 7; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 12px; background: rgba(22,23,27,.94); border: 1px solid rgba(255,255,255,.1); box-shadow: 0 10px 30px rgba(0,0,0,.4); max-width: calc(100% - 24px); overflow-x: auto; }
  .la-pat .k { font: 600 11px 'Barlow Condensed', sans-serif; letter-spacing: .22em; text-transform: uppercase; color: #9a9aa3; padding: 0 6px; white-space: nowrap; }
  .la-pat button { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); color: #fff; border-radius: 9px; padding: 6px 10px; cursor: pointer; text-align: left; white-space: nowrap; }
  .la-pat button:hover { border-color: rgba(215,255,60,.5); background: rgba(215,255,60,.07); }
  .la-pat b { font: 700 13px Inter, sans-serif; } .la-pat small { font: 500 11px Inter, sans-serif; color: #9a9aa3; }
  .la-coach { position: absolute; left: 16px; top: 12px; z-index: 8; width: 290px; padding: 12px 14px; border-radius: 12px; background: rgba(22,23,27,.96); border: 1px solid rgba(215,255,60,.35); box-shadow: 0 12px 34px rgba(0,0,0,.5); }
  .la-coach .top { display: flex; align-items: center; gap: 8px; } .la-coach .top b { font: 800 17px 'Barlow Condensed', sans-serif; text-transform: uppercase; color: #d7ff3c; } .la-coach .top span { color: #9a9aa3; font-size: 12px; margin-right: auto; }
  .la-coach p { margin: 8px 0 10px; font-size: 14px; line-height: 1.45; color: #eceef2; }
  .la-coach .row { display: flex; align-items: center; gap: 6px; } .la-coach .tool { font: 600 12px Inter; color: #0a0c0f; background: #d7ff3c; border-radius: 6px; padding: 3px 8px; }
  .la-coach .dots { display: flex; gap: 4px; margin-top: 10px; } .la-coach .dots i { flex: 1; height: 3px; border-radius: 2px; background: rgba(255,255,255,.14); } .la-coach .dots i.done { background: rgba(215,255,60,.5); } .la-coach .dots i.now { background: #d7ff3c; }
`
