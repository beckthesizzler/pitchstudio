/* Pin to pitch: optional. It asks for one pitch marking at a time, by name, with a little pitch
   showing which one. Four that are not all on one line are enough. Nothing else changes. */
import { LANDMARKS, PITCH_L, PITCH_W, pitchLines, type CalPoint, type Pt } from "./calib"

/** the order it asks in: the markings a broadcast shot most often shows first */
export const PIN_ORDER: { id: string; ask: string; how: string }[] = [
  { id: "k0", ask: "Top of the centre circle", how: "Click where the circle meets the halfway line, on the far side." },
  { id: "k1", ask: "Bottom of the centre circle", how: "Click where the circle meets the halfway line, on the near side." },
  { id: "h0", ask: "Halfway line, far end", how: "Click where the halfway line meets the far touchline." },
  { id: "h1", ask: "Halfway line, near end", how: "Click where the halfway line meets the near touchline." },
  { id: "Lb1", ask: "Left box, far front corner", how: "The corner of the big box furthest from the camera." },
  { id: "Lb2", ask: "Left box, near front corner", how: "The corner of the big box nearest the camera." },
  { id: "Rb1", ask: "Right box, far front corner", how: "The corner of the big box furthest from the camera." },
  { id: "Rb2", ask: "Right box, near front corner", how: "The corner of the big box nearest the camera." },
  { id: "Lb0", ask: "Left box, far corner on the goal line", how: "Where the big box meets the goal line, far side." },
  { id: "Lb3", ask: "Left box, near corner on the goal line", how: "Where the big box meets the goal line, near side." },
  { id: "Rb0", ask: "Right box, far corner on the goal line", how: "Where the big box meets the goal line, far side." },
  { id: "Rb3", ask: "Right box, near corner on the goal line", how: "Where the big box meets the goal line, near side." },
  { id: "Ls0", ask: "Left six-yard box, far front corner", how: "The small box, the corner furthest from the camera." },
  { id: "Ls1", ask: "Left six-yard box, near front corner", how: "The small box, the corner nearest the camera." },
  { id: "Rs0", ask: "Right six-yard box, far front corner", how: "The small box, the corner furthest from the camera." },
  { id: "Rs1", ask: "Right six-yard box, near front corner", how: "The small box, the corner nearest the camera." },
  { id: "Lps", ask: "Left penalty spot", how: "The spot in front of the left goal." },
  { id: "Rps", ask: "Right penalty spot", how: "The spot in front of the right goal." },
  { id: "Lc0", ask: "Left corner flag, far side", how: "Where the goal line meets the far touchline." },
  { id: "Rc0", ask: "Right corner flag, far side", how: "Where the goal line meets the far touchline." },
]
export const pitchPoint = (id: string): Pt | null => LANDMARKS.find(l => l.id === id)?.p ?? null

/** the guide that sits over the picture while pinning */
export function PinGuide({ step, pins, stuck, onSkip, onStop }: { step: number; pins: CalPoint[]; stuck: boolean; onSkip: () => void; onStop: () => void }) {
  const at = PIN_ORDER[step]
  if (!at) return null
  const p = pitchPoint(at.id)!
  const S = 1.12, P = 3
  const xy = (q: Pt) => [P + q[0] * S, P + q[1] * S]
  const [x, y] = xy(p)
  const n = pins.length
  return (
    <div className="pp-guide" role="dialog" aria-label="Pin to pitch">
      <svg viewBox={`0 0 ${PITCH_L * S + 2 * P} ${PITCH_W * S + 2 * P}`} className="pp-mini" aria-hidden="true">
        <rect x={P} y={P} width={PITCH_L * S} height={PITCH_W * S} fill="#1d3b24" />
        {pitchLines().map((ln, i) => <polyline key={i} points={ln.map(q => xy(q).join(",")).join(" ")} fill="none" stroke="rgba(207,232,208,.6)" strokeWidth={0.9} />)}
        {pins.map(q => { const [a, b] = xy(q.pitch); return <circle key={q.id} cx={a} cy={b} r={2.6} fill="#d7ff3c" opacity={0.55} /> })}
        <circle cx={x} cy={y} r={4.2} fill="#d7ff3c" /><circle cx={x} cy={y} r={7.5} fill="none" stroke="#d7ff3c" strokeWidth={1.3} />
      </svg>
      <div className="pp-t">
        <span className="pp-k">{stuck ? "One more, away from the others" : `${Math.min(n + 1, 4)} of 4`}</span>
        <b>{at.ask}</b>
        <small>{at.how}</small>
      </div>
      <div className="pp-acts">
        <button className="la-tiny" onClick={onSkip}>Can't see it</button>
        <button className="la-tiny" onClick={onStop}>Stop</button>
      </div>
      <p className="pp-note">Click it on your picture. A pin in the wrong place? Drag it. Your marks aren't touched while you pin.</p>
    </div>
  )
}

export const PIN_CSS = `
  .pp-guide { display: flex; flex-direction: column; gap: 12px; padding: 4px 16px 16px; }
  .pp-mini { width: 100%; border-radius: 6px; }
  .pp-t { min-width: 0; }
  .pp-k { font: 600 11px Inter, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #8e929b; }
  .pp-t b { display: block; font: 800 24px/1.05 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 4px 0 6px; text-wrap: balance; }
  .pp-t small { display: block; color: #a7abb3; font-size: 13px; line-height: 1.45; text-wrap: balance; }
  .pp-acts { display: flex; gap: 8px; }
  .pp-acts .la-tiny { flex: 1; justify-content: center; height: 34px; border: 1px solid #3a3e46; border-radius: 8px; background: #1f2125; font-weight: 600; }
  .pp-acts .la-tiny:hover { border-color: #d7ff3c; }
  .pp-note { color: #8e929b; font-size: 12px; line-height: 1.45; margin: 0; text-wrap: balance; }
  .pp-chip { position: relative; }
  .pp-chip .pp-tip { display: none; position: absolute; top: calc(100% + 10px); right: 0; width: 280px; padding: 12px 14px; border-radius: 10px; background: #24262b; border: 1px solid #3a3e46; box-shadow: 0 10px 30px rgba(0,0,0,.5); font: 400 12.5px/1.45 Inter, sans-serif; color: #d3d6dc; text-align: left; white-space: normal; text-wrap: balance; z-index: 20; pointer-events: none; }
  .pp-chip .pp-tip b { display: block; color: #fff; font-size: 13px; margin-bottom: 4px; }
  .pp-chip:hover .pp-tip, .pp-chip:focus-visible .pp-tip { display: block; }
  .la-chip.pp-done { border-color: rgba(215,255,60,.5); color: #d7ff3c; background: rgba(215,255,60,.08); }
  .pp-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; }
`
