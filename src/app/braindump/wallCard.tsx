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

/* ── ready-made walls: the three the studio shows off with ── */
/** A note in a ready-made wall. tie: tied by a thread to the note before it. wall: the note opens into a wall of its own, holding these notes. */
export type StarterNote = { t: string; c?: Color; tie?: boolean; wall?: string[] }
export type Starter = { id: string; title: string; note: string; view: View; look: Partial<Look>; frames: { t: string; c: Color; notes: StarterNote[] }[]; loose?: StarterNote[] }
export const STARTERS: Starter[] = [
  { id: "build", title: "Build-up wall", note: "Frames, threads and a just-pinned corner", view: "wall", look: {}, frames: [
    { t: "Barça build-up", c: "yellow", notes: [{ t: "Cubarsí steps into midfield when the 9 presses", c: "yellow" }, { t: "Pedri drops between the CBs", c: "peach", tie: true }, { t: "Third man to Lamine", c: "aqua", tie: true }] },
    { t: "Next video", c: "pink", notes: [{ t: "Raphinha's pressing triggers", c: "pink" }, { t: "Kounde stays wide", c: "lime" }] } ],
    loose: [{ t: "Flick's rest defence", c: "yellow" }, { t: "Full-backs invert", c: "lilac", tie: true }] },
  { id: "press", title: "Pressing board", note: "A felt board with a wall inside a note", view: "wall", look: { bg: "felt", note: "card" }, frames: [
    { t: "Triggers", c: "lime", notes: [{ t: "Lamine presses within 4 seconds", c: "yellow" }, { t: "Back pass to the keeper = go", c: "lime" }, { t: "Wrong touch, jump", c: "aqua" }] },
    { t: "Shape of the press", c: "aqua", notes: [{ t: "Trap them on the touchline", c: "lilac" }, { t: "Lewa screens the 6", c: "aqua" }] } ],
    loose: [{ t: "Bodies", c: "peach", wall: ["Who jumps first", "Who covers the gap", "Who stays home"] }] },
  { id: "tree", title: "Build-up tree", note: "One idea, branching step by step", view: "tree", look: {}, frames: [
    { t: "Barça build-up", c: "yellow", notes: [{ t: "Cubarsí steps into midfield", c: "yellow" }, { t: "Pedri drops between the CBs", c: "peach", tie: true }, { t: "Third man to Lamine", c: "aqua", tie: true }, { t: "Lamine attacks the full-back", c: "pink", tie: true }] },
    { t: "Next video", c: "pink", notes: [{ t: "Raphinha's pressing triggers", c: "pink" }, { t: "Pass map from the last game", c: "lime", tie: true }] } ] },
]
