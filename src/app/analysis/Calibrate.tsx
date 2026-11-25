import { Check, RotateCcw, X } from "lucide-react"
import { LANDMARKS, PITCH_L, PITCH_W, pitchLines, type CalPoint, type Fit } from "./calib"

/* Calibrating a shot: pick a point on the little pitch, then click the same point on your shot. Four points do it.
   The pitch lines are then drawn over your shot in pink, so you can see at a glance if it fits; drag a pin to fine-tune. */

const S = 3.2 // pixels per metre on the little pitch
const PAD = 10
export const pitchOf = (id: string) => LANDMARKS.find(l => l.id === id)?.p ?? null

export function CalibratePanel({ pts, pick, setPick, onRemove, onClear, onDone, fit }: {
  pts: CalPoint[]; pick: string | null; setPick: (id: string | null) => void; onRemove: (id: string) => void; onClear: () => void; onDone: () => void; fit: Fit | null
}) {
  const W = PITCH_L * S + 2 * PAD, H = PITCH_W * S + 2 * PAD
  const xy = (p: [number, number]) => [PAD + p[0] * S, PAD + p[1] * S] as const
  const placed = new Map(pts.map((p, i) => [p.id, i + 1]))
  const pickName = pick ? LANDMARKS.find(l => l.id === pick)?.name : null
  const left = Math.max(0, 4 - pts.length)
  const quality = fit ? (fit.err < 4 ? "Spot on" : fit.err < 10 ? "Good" : "Rough: check the pins") : null
  return (
    <div className="an-insp an-cal">
      <p className="an-cap">Calibrate · {fit ? "done" : `${left} more point${left === 1 ? "" : "s"}`}</p>
      <p className="an-note" style={{ marginTop: 0 }}>{pickName ? <>Now click <b style={{ color: "#fff" }}>{pickName.toLowerCase()}</b> on your shot.</> : "Pick a point you can see on your shot, then click it there. Spread them out: points far apart work best."}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="an-mini" role="group" aria-label="Pitch points">
        <rect x={0} y={0} width={W} height={H} rx={8} fill="#1d5a2c" />
        {pitchLines().map((ln, i) => <polyline key={i} points={ln.map(p => xy(p).join(",")).join(" ")} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={1.2} />)}
        <text x={W / 2} y={7} textAnchor="middle" fontSize={6} fill="rgba(255,255,255,.55)" style={{ fontFamily: "Inter, sans-serif", letterSpacing: ".1em" }}>FAR SIDE</text>
        <text x={W / 2} y={H - 2} textAnchor="middle" fontSize={6} fill="rgba(255,255,255,.55)" style={{ fontFamily: "Inter, sans-serif", letterSpacing: ".1em" }}>NEAR SIDE · CAMERA</text>
        {LANDMARKS.map(l => {
          const [x, y] = xy(l.p), n = placed.get(l.id), on = pick === l.id
          return (
            <g key={l.id} role="button" aria-label={l.name + (n ? `, pin ${n}` : "")} tabIndex={0} style={{ cursor: "pointer" }}
              onClick={() => setPick(on ? null : l.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPick(on ? null : l.id) } }}>
              <title>{l.name}</title>
              <circle cx={x} cy={y} r={9} fill="transparent" />
              <circle cx={x} cy={y} r={n ? 6 : on ? 6 : 3.6} fill={n ? "#d7ff3c" : on ? "#ff3ea5" : "#fff"} stroke="#0a0c0f" strokeWidth={1.2} />
              {n && <text x={x} y={y + 0.4} textAnchor="middle" dominantBaseline="central" fontSize={7} fontWeight={800} fill="#0a0c0f" style={{ fontFamily: "Inter, sans-serif" }}>{n}</text>}
            </g>
          )
        })}
      </svg>
      {pts.length > 0 && (
        <ol className="an-pins">
          {pts.map((p, i) => (
            <li key={p.id}><b>{i + 1}</b><span>{LANDMARKS.find(l => l.id === p.id)?.name ?? "Point"}</span>
              <button className="an-x" aria-label="Remove this point" onClick={() => onRemove(p.id)}><X size={13} /></button></li>
          ))}
        </ol>
      )}
      {fit && <p className="an-note">{quality}. The pink lines should sit on the pitch lines. Drag a pin to fine-tune.</p>}
      {pts.length >= 4 && !fit && <p className="an-note" style={{ color: "#ff8fa3" }}>These points don't fit together. Check each pin is on the right spot, or use points further apart.</p>}
      <div className="an-acts" style={{ marginTop: 12 }}>
        <button className="an-act" onClick={onClear} disabled={!pts.length}><RotateCcw size={14} /> Start again</button>
        <button className="an-act pri" onClick={onDone}><Check size={14} /> {fit ? "Done" : "Close"}</button>
      </div>
    </div>
  )
}
