import { useEffect, useRef, useState } from "react"
import { Play, X } from "lucide-react"
import { projectId } from "../../../utils/supabase/info"
import { track } from "../lib/telemetry"
import { ACCENT_SOLID, DS_BORDER_STRONG, SURFACE_1, SURFACE_2, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* The 43-second tour of a wall: filmed from the app, captions in the picture, no sound. A new member sees it on All walls;
   anyone can open it from "How it works". The chapter buttons jump to each part. If the video can't load, the player
   steps aside (onFail) so the page shows what it showed before. */

const BASE = `https://${projectId}.supabase.co/storage/v1/object/public/welcome-video/`
export const TOUR = { src: BASE + "welcome-walls.mp4", poster: BASE + "welcome-walls-poster.jpg", secs: 43 }
const CHAPTERS: [number, string][] = [[0, "Dump"], [6.5, "Frames"], [15.2, "Tie"], [20, "Views"], [26.75, "Walls inside"], [33.35, "Look"]]

export const TOUR_CSS = `
  .tv { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .tv-box { position: relative; aspect-ratio: 16 / 9; border-radius: 12px; overflow: hidden; background: #0e0f12; border: 1px solid ${DS_BORDER_STRONG}; }
  .tv-box video { width: 100%; height: 100%; display: block; object-fit: cover; background: #0e0f12; }
  .tv-go { position: absolute; inset: 0; border: none; padding: 0; background: linear-gradient(180deg, rgba(14,15,18,0) 45%, rgba(14,15,18,.72)); cursor: pointer; display: flex; align-items: flex-end; justify-content: flex-start; color: ${TEXT_PRIMARY}; }
  .tv-go span { display: inline-flex; align-items: center; gap: 10px; margin: 0 0 14px 14px; padding: 0 16px 0 6px; height: 44px; border-radius: 999px; background: rgba(14,15,18,.82); box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); font: 600 14px 'Inter', sans-serif; }
  .tv-go i { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #0e0f12; }
  .tv-go:focus-visible { outline: 2px solid ${ACCENT_SOLID}; outline-offset: -2px; }
  .tv-ch { display: flex; gap: 6px; flex-wrap: wrap; }
  .tv-ch button { height: 32px; padding: 0 11px; border-radius: 999px; border: 1px solid ${DS_BORDER_STRONG}; background: ${SURFACE_1}; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
  .tv-ch button:hover { color: ${TEXT_PRIMARY}; background: ${SURFACE_2}; }
  .tv-ch button[aria-current="true"] { color: #0e0f12; background: ${TEXT_PRIMARY}; border-color: transparent; }
  .tv-scrim { position: fixed; inset: 0; z-index: 80; background: rgba(8,9,11,.78); display: grid; place-items: center; padding: 20px; }
  .tv-modal { width: min(960px, 100%); background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .tv-modal header { display: flex; align-items: center; gap: 10px; font: 600 15px 'Inter', sans-serif; padding: 2px 2px 0 6px; }
  .tv-modal header small { color: ${TEXT_MUTED}; font-weight: 500; }
  .tv-x { margin-left: auto; width: 40px; height: 40px; border-radius: 10px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
  .tv-x:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
  .tv-fail { margin: 0; padding: 40px 16px; text-align: center; color: ${TEXT_MUTED}; font: 500 14px 'Inter', sans-serif; }
  @media (max-width: 700px) { .tv-scrim { padding: 10px; } .tv-modal { padding: 10px; border-radius: 14px; } .tv-ch button { height: 36px; } }
`

/** The tour player. start: play straight away (the "How it works" window); otherwise the poster waits for a tap */
export function TourVideo({ start = false, where, onFail }: { start?: boolean; where: string; onFail?: () => void }) {
  const v = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(start)
  const [at, setAt] = useState(0)
  const go = (from?: number) => {
    const el = v.current
    if (!el) return
    if (from !== undefined) el.currentTime = from
    setPlaying(true)
    el.play().catch(() => { /* the browser said no: the controls are there */ })
    track("tour_played", { where, from: from ?? 0 })
  }
  useEffect(() => { if (start) go() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const now = CHAPTERS.reduce((k, c, i) => (at >= c[0] - 0.05 ? i : k), 0)
  return (
    <div className="tv">
      <div className="tv-box">
        <video ref={v} src={TOUR.src} poster={TOUR.poster} playsInline muted preload={start ? "auto" : "metadata"} controls={playing}
          aria-label={`How a wall works: a ${TOUR.secs}-second video with captions and no sound`}
          onTimeUpdate={e => setAt(e.currentTarget.currentTime)} onEnded={() => track("tour_ended", { where })}
          onError={() => onFail?.()} />
        {!playing && <button className="tv-go" onClick={() => go()} aria-label={`Play how a wall works, ${TOUR.secs} seconds`}><span><i><Play size={15} fill="currentColor" /></i>How it works · {TOUR.secs}s</span></button>}
      </div>
      <div className="tv-ch" role="group" aria-label="Jump to a part">
        {CHAPTERS.map(([s, name], i) => <button key={name} aria-current={playing && i === now} onClick={() => go(s)}>{name}</button>)}
      </div>
    </div>
  )
}

/** "How it works": the tour in a window, from anywhere */
export function TourWindow({ onClose, where }: { onClose: () => void; where: string }) {
  const x = useRef<HTMLButtonElement>(null)
  const [failed, setFailed] = useState(false)
  const close = useRef(onClose); close.current = onClose
  useEffect(() => { // focus moves in, Escape closes, and focus goes back where it was
    const back = document.activeElement as HTMLElement | null
    x.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current() }
    addEventListener("keydown", key)
    return () => { removeEventListener("keydown", key); back?.focus?.() }
  }, [])
  return (
    <div className="tv-scrim" onClick={onClose}>
      <div className="tv-modal" role="dialog" aria-modal="true" aria-label="How a wall works" onClick={e => e.stopPropagation()}>
        <header>How a wall works <small>{TOUR.secs} seconds · no sound</small><button ref={x} className="tv-x" aria-label="Close" onClick={onClose}><X size={18} /></button></header>
        {failed
          ? <p className="tv-fail" role="alert">The video didn't load. Check your connection and try again.</p>
          : <TourVideo start where={where} onFail={() => setFailed(true)} />}
      </div>
    </div>
  )
}
