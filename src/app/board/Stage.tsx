import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, Play, Square, X, Scan, Maximize2 } from "lucide-react"
import { ACCENT_SOLID, ACCENT_INK, TEXT_PRIMARY, TEXT_MUTED, DS_BORDER } from "../theme"

/* The board's stage: the tool dock, the view controls in the top bar, Present mode, and zooming into one area of the pitch.
   The board itself (pieces, lines, saving) stays in App. */

const PW = 1050, PH = 680

/* ─────────── where the tools live ─────────── */
export type DockPlace = "bottom" | "side"
const DOCK_KEY = "ps_dock"
export function readDock(): DockPlace {
  try { return localStorage.getItem(DOCK_KEY) === "side" ? "side" : "bottom" } catch { return "bottom" }
}
export function saveDock(d: DockPlace) { try { localStorage.setItem(DOCK_KEY, d) } catch { /* the choice just isn't remembered */ } }
/* the settings panel: on the left or the right of the board, your choice (remembered on this device) */
export type PanelSide = "left" | "right"
const PANEL_KEY = "ps_panel_side"
export function readPanelSide(): PanelSide {
  try { return localStorage.getItem(PANEL_KEY) === "left" ? "left" : "right" } catch { return "right" }
}
export function savePanelSide(s: PanelSide) { try { localStorage.setItem(PANEL_KEY, s) } catch { /* the choice just isn't remembered */ } }

/** Shared look for the floating glass surfaces (dock, view controls, present bar, mini map) */
export const STAGE_CSS = `
:root, :root[data-theme="night"] { --ps-raised: #4b4c54; --ps-frost: rgba(38,39,44,0.72); }
:root[data-theme="day"] { --ps-raised: #ffffff; --ps-frost: rgba(255,255,255,0.74); }
.st-glass { background: var(--ps-frost); -webkit-backdrop-filter: saturate(1.6) blur(18px); backdrop-filter: saturate(1.6) blur(18px);
  border: 1px solid ${DS_BORDER}; box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset, 0 18px 50px -12px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.18); }
.st-dock { display: flex; align-items: center; gap: 2px; padding: 6px; border-radius: 18px; }
.st-sep { width: 1px; align-self: stretch; margin: 8px 5px; background: ${DS_BORDER}; }
.st-btn { position: relative; width: 40px; height: 40px; border-radius: 12px; border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: ${TEXT_MUTED};
  transition: background .16s ease, color .16s ease, transform .16s cubic-bezier(.2,.8,.2,1); }
.st-btn:hover { background: var(--ps-hover); color: ${TEXT_PRIMARY}; }
.st-btn:active { transform: scale(.92); }
.st-btn:disabled { opacity: .35; cursor: default; transform: none; background: transparent; }
.st-btn[aria-pressed="true"] { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; box-shadow: 0 6px 16px -6px ${ACCENT_SOLID}; }
.st-btn:focus-visible { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
.st-tip { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translate(-50%, 4px); opacity: 0; pointer-events: none;
  white-space: nowrap; font: 500 12px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; padding: 6px 9px; border-radius: 8px; transition: opacity .14s, transform .14s; z-index: 5; }
.st-tip kbd { font: 600 10.5px 'Inter', sans-serif; opacity: .55; margin-left: 6px; }
.st-btn:hover .st-tip { opacity: 1; transform: translate(-50%, 0); }
.st-seg { display: inline-flex; padding: 3px; border-radius: 11px; gap: 2px; }
.st-seg button { height: 28px; padding: 0 12px; border-radius: 8px; border: none; background: transparent; cursor: pointer;
  font: 600 12px 'Inter', sans-serif; color: ${TEXT_MUTED}; display: inline-flex; align-items: center; gap: 6px; transition: background .16s, color .16s; }
.st-seg button:hover { color: ${TEXT_PRIMARY}; }
.st-seg button[aria-pressed="true"] { background: var(--ps-raised, rgba(255,255,255,0.12)); color: ${TEXT_PRIMARY}; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
.st-chip { height: 34px; padding: 0 12px; border-radius: 11px; border: 1px solid ${DS_BORDER}; background: transparent; cursor: pointer;
  font: 600 12px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; display: inline-flex; align-items: center; gap: 6px; transition: background .16s, border-color .16s; }
.st-chip:hover { background: var(--ps-hover); }
.st-chip[aria-pressed="true"] { border-color: ${ACCENT_SOLID}; color: ${ACCENT_SOLID}; }
@keyframes st-rise { from { opacity: 0; transform: translate(-50%, 12px) scale(.98); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }
.st-float { position: absolute; left: 50%; transform: translateX(-50%); animation: st-rise .32s cubic-bezier(.2,.8,.2,1) both; }
@keyframes st-in { from { opacity: 0; transform: translateX(14px); } to { opacity: 1; transform: none; } }
.st-panel { animation: st-in .3s cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .st-float, .st-panel { animation: none; } .st-btn, .st-tip { transition: none; } }
`

/* ─────────── the dock ─────────── */
export type DockItem = { id: string; icon: ReactNode; label: string; key?: string; tint?: string; pressed?: boolean; disabled?: boolean; onClick: () => void }

export function DockButton({ item }: { item: DockItem }) {
  return (
    <button className="st-btn" aria-label={item.label} aria-pressed={item.pressed ?? false} onClick={item.onClick} disabled={item.disabled}
      style={!item.pressed && item.tint ? { color: item.tint } : undefined}>
      {item.icon}
      <span className="st-tip st-glass" role="tooltip">{item.label}{item.key && <kbd>{item.key}</kbd>}</span>
    </button>
  )
}

/** The tools in one floating row under the board */
export function Dock({ groups }: { groups: DockItem[][] }) {
  return (
    <div className="st-glass st-dock" role="toolbar" aria-label="Tools" onPointerDown={e => e.stopPropagation()}>
      {groups.filter(g => g.length).map((g, i) => (
        <div key={i} style={{ display: "contents" }}>
          {i > 0 && <div className="st-sep" />}
          {g.map(item => <DockButton key={item.id} item={item} />)}
        </div>
      ))}
    </div>
  )
}

/* ─────────── the view controls in the top bar ─────────── */
export function ViewControls({ view3d, onView3d, zoomed, onZoomArea, onPresent }: {
  view3d: boolean; onView3d: (v: boolean) => void
  zoomed: boolean; onZoomArea: () => void; onPresent: () => void
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div className="st-seg st-glass" role="group" aria-label="View" style={{ boxShadow: "none" }}>
        <button aria-pressed={!view3d} onClick={() => onView3d(false)}>2D</button>
        <button aria-pressed={view3d} onClick={() => onView3d(true)}>3D</button>
      </div>
      <button className="st-chip" aria-pressed={zoomed} onClick={onZoomArea} title="Zoom into one part of the pitch, then draw on it">
        <Scan size={14} /> <span className="hidden lg:inline">{zoomed ? "Zoomed in" : "Zoom area"}</span>
      </button>
      <button className="st-chip" onClick={onPresent} title="Present full screen (F)">
        <Maximize2 size={14} /> <span className="hidden lg:inline">Present</span>
      </button>
    </div>
  )
}

/* ─────────── Present mode ─────────── */
export function PresentBar({ step, steps, playing, onPrev, onNext, onPlay, onExit }: {
  step: number; steps: number; playing: boolean; onPrev: () => void; onNext: () => void; onPlay: () => void; onExit: () => void
}) {
  // the controls fade away while you talk, and come back when the mouse moves
  const [awake, setAwake] = useState(true)
  const timer = useRef(0)
  useEffect(() => {
    const wake = () => { setAwake(true); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setAwake(false), 2200) }
    wake()
    window.addEventListener("pointermove", wake)
    return () => { window.removeEventListener("pointermove", wake); window.clearTimeout(timer.current) }
  }, [])
  return (
    <div className="st-float" style={{ bottom: 28, zIndex: 70, opacity: awake ? 1 : 0, transition: "opacity .5s ease" }} onPointerDown={e => e.stopPropagation()}>
      <div className="st-glass st-dock" role="toolbar" aria-label="Presenting">
        {steps > 1 && <>
          <DockButton item={{ id: "prev", icon: <ChevronLeft size={19} />, label: "Previous step", key: "←", onClick: onPrev }} />
          <span style={{ font: "600 13px 'Inter', sans-serif", color: TEXT_PRIMARY, padding: "0 10px", fontVariantNumeric: "tabular-nums" }}>{step + 1} / {steps}</span>
          <DockButton item={{ id: "next", icon: <ChevronRight size={19} />, label: "Next step", key: "→", onClick: onNext }} />
          <DockButton item={{ id: "play", icon: playing ? <Square size={15} fill="currentColor" /> : <Play size={16} fill="currentColor" />, label: playing ? "Stop" : "Play the move", key: "Space", pressed: playing, onClick: onPlay }} />
          <div className="st-sep" />
        </>}
        <DockButton item={{ id: "exit", icon: <X size={18} />, label: "Stop presenting", key: "Esc", onClick: onExit }} />
      </div>
    </div>
  )
}

/* ─────────── zooming into an area ─────────── */
/** One tap instead of a drag: parts of the pitch that are zoomed into all the time (x1, y1, x2, y2 on the 1050 × 680 pitch) */
export const AREA_PRESETS: { name: string; area: [number, number, number, number] }[] = [
  { name: "Left box", area: [0, 110, 330, 570] },
  { name: "Right box", area: [720, 110, 1050, 570] },
  { name: "Left half", area: [0, 0, 525, 680] },
  { name: "Right half", area: [525, 0, 1050, 680] },
  { name: "Centre", area: [350, 0, 700, 680] },
]
/** Drag over the board to choose the area to zoom into (or tap a preset). Gives back the rectangle in screen pixels. */
export function AreaPicker({ onPick, onPreset, onCancel }: { onPick: (r: { x1: number; y1: number; x2: number; y2: number }) => void; onPreset: (a: [number, number, number, number]) => void; onCancel: () => void }) {
  const [drag, setDrag] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onCancel() } }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [onCancel])
  const at = (e: React.PointerEvent) => { const r = box.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const r = drag ? { l: Math.min(drag.x0, drag.x), t: Math.min(drag.y0, drag.y), w: Math.abs(drag.x - drag.x0), h: Math.abs(drag.y - drag.y0) } : null
  return (
    <div ref={box} data-area-picker style={{ position: "absolute", inset: 0, zIndex: 40, cursor: "crosshair", background: drag ? "transparent" : "rgba(0,0,0,0.18)", touchAction: "none" }}
      onPointerDown={e => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); const p = at(e); setDrag({ x0: p.x, y0: p.y, x: p.x, y: p.y }) }}
      onPointerMove={e => { if (!drag) return; const p = at(e); setDrag(d => d && { ...d, x: p.x, y: p.y }) }}
      onPointerUp={e => {
        if (!drag) return
        const rb = box.current!.getBoundingClientRect(), p = at(e)
        setDrag(null)
        if (Math.abs(p.x - drag.x0) < 24 || Math.abs(p.y - drag.y0) < 24) return // a click, not a drag: keep choosing
        onPick({ x1: rb.left + Math.min(drag.x0, p.x), y1: rb.top + Math.min(drag.y0, p.y), x2: rb.left + Math.max(drag.x0, p.x), y2: rb.top + Math.max(drag.y0, p.y) })
      }}>
      {r && (
        <div style={{ position: "absolute", left: r.l, top: r.t, width: r.w, height: r.h, borderRadius: 10, border: `2px solid ${ACCENT_SOLID}`,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.38)", pointerEvents: "none" }} />
      )}
      {!drag && (
        <div className="st-float st-glass" style={{ top: 18, borderRadius: 12, padding: "9px 14px", whiteSpace: "nowrap", font: "500 13px 'Inter', sans-serif", color: TEXT_PRIMARY, display: "flex", gap: 12, alignItems: "center", pointerEvents: "auto" }}
          onPointerDown={e => e.stopPropagation()}>
          <Scan size={15} style={{ color: ACCENT_SOLID }} /> Drag over the pitch to zoom in, or tap
          {AREA_PRESETS.map(pr => <button key={pr.name} className="st-chip" style={{ height: 28 }} onClick={() => onPreset(pr.area)}>{pr.name}</button>)}
          <button onClick={onCancel} style={{ border: "none", background: "transparent", color: TEXT_MUTED, font: "600 12px 'Inter', sans-serif", cursor: "pointer" }}>Cancel</button>
        </div>
      )}
    </div>
  )
}

/** While zoomed into an area: where it is on the pitch, and the way back out */
export function AreaMap({ area, vertical, onRepick, onExit }: { area: [number, number, number, number]; vertical: boolean; onRepick: () => void; onExit: () => void }) {
  const [x1, y1, x2, y2] = area
  const W = vertical ? 64 : 112, H = vertical ? 99 : 72, k = vertical ? W / PH : W / PW
  const rx = vertical ? y1 * k : x1 * k, ry = vertical ? (PW - x2) * k : y1 * k, rw = (vertical ? y2 - y1 : x2 - x1) * k, rh = (vertical ? x2 - x1 : y2 - y1) * k
  return (
    <div className="st-glass" style={{ position: "absolute", bottom: 120, left: 14, zIndex: 20, borderRadius: 14, padding: 10, display: "flex", gap: 10, alignItems: "center" }}
      onPointerDown={e => e.stopPropagation()}>
      <svg width={W} height={H} viewBox={`-2 -2 ${W + 4} ${H + 4}`} aria-label="Where the zoomed area is on the pitch">
        <rect x={0} y={0} width={W} height={H} rx={3} fill="rgba(46,125,70,0.55)" stroke="rgba(255,255,255,0.55)" strokeWidth={1} />
        {vertical ? <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(255,255,255,0.45)" /> : <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(255,255,255,0.45)" />}
        <rect x={rx} y={ry} width={rw} height={rh} rx={2} fill="rgba(215,255,60,0.25)" stroke={ACCENT_SOLID} strokeWidth={1.6} />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <button className="st-chip" style={{ height: 28 }} onClick={onRepick}><Scan size={13} /> Change area</button>
        <button className="st-chip" style={{ height: 28 }} onClick={onExit}><Maximize2 size={13} /> Whole pitch</button>
      </div>
    </div>
  )
}
