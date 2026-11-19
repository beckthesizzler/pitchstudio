import { useEffect, useState } from "react"
import { COLORS, type Color } from "./notes"
import { photoLayer, photoUrl, wallSurface, type Look, type View } from "./walls"

/* A wall's card on All walls: a small picture of it (its surface, frames and notes, where they really sit), how long
   ago it changed, and the ready-made walls a new member can start from. */

export type Card = { notes: number; inside: number; last: string; preview: { k: string; c: string; x: number | null; y: number | null; w: number | null; h: number | null }[] }
export const hexOf = (c: string) => COLORS.find(x => x.id === c)?.c ?? "#f7e36a"
export const ago = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000
  if (!Number.isFinite(d)) return ""
  if (d < 90) return "Just now"; if (d < 3600) return `${Math.round(d / 60)}m`; if (d < 86400) return `${Math.round(d / 3600)}h`
  if (d < 86400 * 7) return `${Math.round(d / 86400)}d`; return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

/** A small picture of a wall: its surface, its frames and its notes, where they really sit */
export function MiniWall({ look, card }: { look: Look; card: Card | undefined }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let off = false; if (look.bg === "photo" && look.photo) photoUrl(look.photo).then(u => { if (!off) setUrl(u) }); return () => { off = true } }, [look.bg, look.photo])
  const items = (card?.preview ?? []).filter(p => p.x !== null && p.y !== null)
  const box = items.length ? items.reduce((b, p) => {
    const w = p.k === "tree" ? p.w ?? 260 : 220, h = p.k === "tree" ? p.h ?? 170 : 78
    return { x0: Math.min(b.x0, p.x!), y0: Math.min(b.y0, p.y!), x1: Math.max(b.x1, p.x! + w), y1: Math.max(b.y1, p.y! + h) }
  }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) : null
  const s = wallSurface(look, url)
  return (
    <div className="aw-pv" style={{ background: s.background, borderColor: s.borderColor }}>
      {look.bg === "photo" && url && <><div className="aw-ph" style={photoLayer(look, url)} />{look.treat === "duo" && <div className="aw-duo" />}</>}
      {box && <svg viewBox={`${box.x0 - 30} ${box.y0 - 30} ${box.x1 - box.x0 + 60} ${box.y1 - box.y0 + 60}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {items.filter(p => p.k === "tree").map((p, i) => <rect key={"f" + i} x={p.x!} y={p.y!} width={p.w ?? 260} height={p.h ?? 170} rx="12" fill="rgba(255,255,255,.1)" stroke="rgba(27,26,23,.4)" strokeWidth="4" strokeDasharray="14 10" />)}
        {items.filter(p => p.k !== "tree").map((p, i) => <rect key={"n" + i} x={p.x!} y={p.y!} width="220" height="78" fill={hexOf(p.c)} />)}
      </svg>}
      {!box && <span className="aw-pv-empty">{(card?.notes ?? 0) ? `${card!.notes} notes` : "Empty"}</span>}
    </div>
  )
}

/* ── ready-made walls ── */
export type Starter = { id: string; title: string; note: string; view: View; look: Partial<Look>; frames: { t: string; c: Color; notes: string[] }[] }
export const STARTERS: Starter[] = [
  { id: "match", title: "Match notes", note: "Before, during and after a game", view: "columns", look: {}, frames: [
    { t: "Before", c: "lime", notes: ["How will they press us?", "Who starts on the left?"] },
    { t: "During", c: "aqua", notes: ["First 15 minutes: shape out of possession"] },
    { t: "After", c: "pink", notes: ["The moment that decided it", "Clip to make"] } ] },
  { id: "video", title: "Video plan", note: "From idea to posted", view: "columns", look: { bg: "paper" }, frames: [
    { t: "Idea", c: "pink", notes: ["Pedri's scanning before he receives"] }, { t: "Script", c: "orange", notes: [] },
    { t: "Filmed", c: "aqua", notes: [] }, { t: "Posted", c: "lime", notes: [] } ] },
  { id: "player", title: "Player file", note: "Strengths, gaps and clips", view: "wall", look: { bg: "felt" }, frames: [
    { t: "Strengths", c: "lime", notes: ["What he does better than anyone"] }, { t: "Gaps", c: "pink", notes: ["Where he can be got at"] }, { t: "Clips", c: "aqua", notes: [] } ] },
  { id: "tactic", title: "Tactical idea", note: "A problem, then how to beat it", view: "tree", look: {}, frames: [
    { t: "The problem", c: "yellow", notes: ["What goes wrong now", "What we'd try instead", "How we'd know it worked"] } ] },
]

