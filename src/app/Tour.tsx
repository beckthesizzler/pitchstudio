import { useEffect, useLayoutEffect, useState } from "react"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_1, DS_BORDER_STRONG, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT } from "./theme"

/* The first-visit tour: three short steps that point at the real controls. Skippable, shown once. */
const STEPS = [
  { sel: '[data-tour="teams"]', t: "Pick a formation", p: "Choose a shape for each team, then say who has the ball. The lineups reshape themselves." },
  { sel: '[data-tour="canvas"]', t: "Drag a player", p: "Move players, draw arrows and add steps to show a move unfolding." },
  { sel: '[data-tour="export"]', t: "Export and post", p: "Save a PNG, a PDF, a GIF or a video in the shape your platform wants." },
]
export const TOUR_KEY = "ps_tour_done"

export default function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [, tick] = useState(0)

  // Steps whose control isn't on screen (a small phone, a closed panel) are skipped
  const find = (idx: number) => { const el = document.querySelector(STEPS[idx].sel) as HTMLElement | null; const r = el?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 ? r : null }
  useLayoutEffect(() => {
    let k = i
    while (k < STEPS.length && !find(k)) k++
    if (k >= STEPS.length) { finish(); return }
    if (k !== i) { setI(k); return }
    setRect(find(i))
  }, [i])
  useEffect(() => {
    const on = () => { setRect(find(i)); tick(n => n + 1) }
    window.addEventListener("resize", on); return () => window.removeEventListener("resize", on)
  }, [i])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") finish() }
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey)
  }, [])

  function finish() { try { localStorage.setItem(TOUR_KEY, "1") } catch { /* fine */ } onDone() }
  const next = () => { let k = i + 1; while (k < STEPS.length && !find(k)) k++; if (k >= STEPS.length) finish(); else setI(k) }
  if (!rect) return null

  const pad = 6, W = 300
  const vw = window.innerWidth, vh = window.innerHeight
  let left = rect.right + 16, top = rect.top
  if (left + W > vw - 12) { left = Math.max(12, Math.min(vw - W - 12, rect.left + rect.width / 2 - W / 2)); top = rect.bottom + 14 }
  if (top + 190 > vh - 12) top = Math.max(12, rect.top - 200)
  const shown = STEPS.filter((_, n) => n <= i && find(n)).length
  const total = STEPS.filter((_, n) => find(n)).length

  return (
    <div role="dialog" aria-label="Quick tour" style={{ position: "fixed", inset: 0, zIndex: 80 }}>
      <div onClick={finish} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, borderRadius: 12, border: `2px solid ${ACCENT_SOLID}`, boxShadow: "0 0 0 9999px rgba(8,9,11,0.62)", pointerEvents: "none", transition: "all .2s" }} />
      <div style={{ position: "absolute", left, top, width: W, background: SURFACE_1, border: `1px solid ${DS_BORDER_STRONG}`, borderRadius: 14, padding: "16px 18px", boxShadow: "0 20px 60px rgba(0,0,0,.45)", color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: 11, letterSpacing: ".14em", fontWeight: 600, color: ACCENT_TEXT }}>{shown} OF {total}</div>
        <div style={{ fontSize: 16, fontWeight: 600, margin: "6px 0 4px" }}>{STEPS[i].t}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: TEXT_MUTED }}>{STEPS[i].p}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <button onClick={finish} style={{ background: "none", border: "none", color: TEXT_MUTED, fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Skip tour</button>
          <button onClick={next} autoFocus style={{ background: ACCENT_SOLID, color: ACCENT_INK, border: "none", borderRadius: 999, height: 34, padding: "0 18px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>{shown >= total ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  )
}
