import { useEffect, useMemo, useRef, useState } from "react"
import { X } from "lucide-react"
import { ReportView } from "./Draw"
import { makeFromNotes, NOTE_LAYOUTS } from "./templates"
import { foundOf, readNotes } from "./notes"
import type { Report } from "./model"
import type { Brand } from "../brand/brand"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, ACCENT_SOLID, ACCENT_INK, ACCENT_SOFT, ACCENT_TEXT, SCRIM } from "../theme"

/* Paste your notes: a thread, bullet points or a voice note typed up become a laid-out report. What was understood is
   shown as chips before anything is made; the preview redraws as you type; three layouts, one click. */

const MONO = "'JetBrains Mono', ui-monospace, monospace"
const EXAMPLE = [
  "Barça 2–1 Madrid. The press broke them.", "",
  "Raphinha and Lewandowski split the centre-backs, so Madrid's first pass always went wide. That's the trap: Pedri and Fermín jump the full-back, Koundé closes the line.", "",
  "3 things:",
  "- Cubarsí stepped into midfield on the ball",
  "- Yamal isolated Mendy 1v1 every time",
  "- Second half we dropped too deep after 70'", "",
  "Player of the match: Pedri",
].join("\n")

// a small drawing of each layout: grey bars for words, green for the pitch
const SHAPES: { x: number; y: number; w: number; h: number; g?: boolean }[][] = [
  [{ x: 4, y: 4, w: 40, h: 5 }, { x: 4, y: 13, w: 24, h: 18, g: true }, { x: 31, y: 13, w: 13, h: 18 }, { x: 4, y: 35, w: 40, h: 9 }],
  [{ x: 4, y: 4, w: 40, h: 5 }, { x: 4, y: 13, w: 40, h: 22, g: true }, { x: 4, y: 39, w: 40, h: 5 }],
  [{ x: 4, y: 4, w: 40, h: 7 }, { x: 4, y: 15, w: 40, h: 4 }, { x: 4, y: 23, w: 40, h: 4 }, { x: 4, y: 31, w: 26, h: 4 }, { x: 32, y: 31, w: 12, h: 13, g: true }],
]

export function PasteNotes({ brand, handle, logo, known, issue, onUse, onClose }: {
  brand: Brand; handle: string; logo: string | null; known: string[]; issue?: number | null
  onUse: (r: Report, layout: number) => void; onClose: () => void
}) {
  const [text, setText] = useState("")
  const [shown, setShown] = useState("")
  const [layout, setLayout] = useState<0 | 1 | 2>(0)
  const box = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { const t = setTimeout(() => setShown(text), 180); return () => clearTimeout(t) }, [text])
  useEffect(() => { box.current?.focus() }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k)
  }, [onClose])
  const notes = useMemo(() => readNotes(shown, known), [shown, known])
  const found = foundOf(notes)
  const report = useMemo(() => makeFromNotes(notes, layout, handle), [notes, layout, handle])
  const empty = !text.trim()
  const use = () => { if (!empty) onUse(makeFromNotes(readNotes(text, known), layout, handle), layout) }

  return (
    <div className="pn-scrim" onClick={onClose}>
      <style>{`
        .pn-scrim { position: fixed; inset: 0; background: ${SCRIM}; z-index: 60; display: grid; place-items: center; padding: 20px; }
        .pn { width: min(1200px, 100%); max-height: calc(100vh - 40px); background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 22px; display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 36px; padding: 32px; position: relative; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; overflow: hidden; }
        .pn * { box-sizing: border-box; }
        .pn-k { font: 600 11px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; margin: 0 0 10px; }
        .pn h2 { font-family: 'Anton', sans-serif; font-weight: 400; font-size: 46px; line-height: 1; text-transform: uppercase; margin: 0 0 12px; letter-spacing: .005em; }
        .pn-lead { color: ${TEXT_MUTED}; font-size: 15px; line-height: 1.5; margin: 0 0 18px; max-width: 680px; }
        .pn-lead button { background: none; border: 0; padding: 0; color: ${ACCENT_TEXT}; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .pn-left { display: flex; flex-direction: column; min-height: 0; }
        .pn textarea { flex: 1; min-height: 300px; width: 100%; resize: none; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 14px; padding: 18px; font: 15px/1.6 'Inter', sans-serif; outline: none; }
        .pn textarea:focus { border-color: ${ACCENT_SOLID}; }
        .pn-found { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; min-height: 34px; }
        .pn-found > span:first-child { font: 600 11px ${MONO}; letter-spacing: .16em; color: ${TEXT_MUTED}; margin-right: 4px; }
        .pn-chip { padding: 7px 11px; border-radius: 8px; background: ${SURFACE_2}; font-size: 13px; font-weight: 500; }
        .pn-chip.hi { background: ${ACCENT_SOFT}; color: ${ACCENT_TEXT}; }
        .pn-none { color: ${TEXT_MUTED}; font-size: 13px; }
        .pn-right { display: flex; flex-direction: column; min-height: 0; }
        .pn-prev { flex: 1; min-height: 0; display: grid; place-items: center; }
        .pn-prev > div { width: 100%; max-width: 356px; max-height: 100%; aspect-ratio: 4 / 5; box-shadow: 0 10px 40px rgba(0,0,0,.4); border-radius: 4px; overflow: hidden; }
        .pn-lays { display: flex; gap: 10px; justify-content: center; margin: 18px 0; }
        .pn-lay { width: 62px; height: 62px; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_2}; padding: 6px; cursor: pointer; }
        .pn-lay[aria-pressed="true"] { border: 2px solid ${ACCENT_SOLID}; padding: 5px; }
        .pn-lay:focus-visible { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .pn-btns { display: grid; grid-template-columns: 140px 1fr; gap: 10px; }
        .pn-btn { height: 48px; border-radius: 12px; border: 1px solid ${DS_BORDER_STRONG}; background: transparent; color: ${TEXT_PRIMARY}; font: 600 15px 'Inter', sans-serif; cursor: pointer; }
        .pn-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; font-size: 16px; }
        .pn-btn.pri:disabled { opacity: .45; cursor: default; }
        .pn-x { position: absolute; top: 14px; right: 14px; width: 36px; height: 36px; border-radius: 10px; border: 0; background: transparent; color: ${TEXT_MUTED}; cursor: pointer; display: grid; place-items: center; }
        .pn-x:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        @media (max-width: 860px) {
          .pn-scrim { padding: 0; place-items: stretch; }
          .pn { grid-template-columns: 1fr; gap: 18px; padding: 22px 18px calc(18px + env(safe-area-inset-bottom)); border-radius: 0; max-height: none; height: 100dvh; overflow-y: auto; align-content: start; }
          .pn h2 { font-size: 34px; }
          .pn textarea { min-height: 220px; flex: none; height: 34vh; }
          .pn-left, .pn-right { min-height: auto; } /* rows size to their content, so nothing overlaps */
          .pn-prev { flex: none; }
          .pn-prev > div { max-width: 250px; }
          .pn-btns { position: sticky; bottom: 0; background: ${SURFACE_1}; padding-top: 8px; }
        }
      `}</style>
      <div className="pn" role="dialog" aria-modal="true" aria-labelledby="pn-h" onClick={e => e.stopPropagation()}>
        <button className="pn-x" aria-label="Close" onClick={onClose}><X size={18} /></button>
        <div className="pn-left">
          <p className="pn-k">Paste your notes</p>
          <h2 id="pn-h">Your words, laid out.</h2>
          <p className="pn-lead">A thread, a voice note you typed up, bullet points. PitchStudio finds the headline, the idea, your points and the players, and you fix anything after. {empty && <button onClick={() => { setText(EXAMPLE); setShown(EXAMPLE) }}>Try an example</button>}</p>
          <textarea ref={box} value={text} onChange={e => setText(e.target.value)} maxLength={6000} aria-label="Your notes"
            placeholder={"Barça 2–1 Madrid. The press broke them.\n\nWhat the plan was, in a few sentences.\n\n- Your first point\n- Your second point\n\nPlayer of the match: Pedri"} />
          <div className="pn-found" aria-live="polite">
            <span>FOUND</span>
            {found.length ? found.map(f => <span key={f} className={"pn-chip" + (/player/.test(f) && !/match/.test(f) ? " hi" : "")}>{f}</span>)
              : <span className="pn-none">{empty ? "Paste something and it shows here." : "Nothing yet: try a first line like “Barça 2–1 Madrid”."}</span>}
          </div>
        </div>
        <div className="pn-right">
          <p className="pn-k">Preview</p>
          <div className="pn-prev"><div><ReportView report={report} brand={brand} handle={handle} logo={logo} media={{}} issue={issue} /></div></div>
          <div className="pn-lays" role="group" aria-label="Layout">
            {SHAPES.map((s, i) => (
              <button key={i} className="pn-lay" aria-pressed={layout === i} aria-label={NOTE_LAYOUTS[i]} title={NOTE_LAYOUTS[i]} onClick={() => setLayout(i as 0 | 1 | 2)}>
                <svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">{s.map((r, j) => <rect key={j} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} fill={r.g ? "#3f8f55" : "#5b5f66"} />)}</svg>
              </button>
            ))}
          </div>
          <div className="pn-btns">
            <button className="pn-btn" onClick={onClose}>Cancel</button>
            <button className="pn-btn pri" disabled={empty} onClick={use}>Use this layout</button>
          </div>
        </div>
      </div>
    </div>
  )
}
