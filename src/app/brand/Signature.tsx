import { useId, useLayoutEffect, useRef, useState } from "react"
import { Glyph } from "./crests"
import { cardColours, type Brand } from "./brand"

/* How a creator signs what they export: a round badge (their logo, or their crest) with their handle, and "PITCHSTUDIO" if they keep it on.
   The same pieces draw the small seal on every picture and the end card on GIFs and videos. */

/** The round badge: the uploaded logo, or the crest icon on the brand colour. Drawn around (cx, cy). */
export function SealDisc({ cx, cy, r, brand, logo, clipId }: { cx: number; cy: number; r: number; brand: Brand; logo: string | null; clipId: string }) {
  const c = cardColours(brand)
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={c.disc} />
      {logo ? (
        <g>
          <clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath>
          <image href={logo} x={cx - r} y={cy - r} width={2 * r} height={2 * r} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
        </g>
      ) : (
        <g transform={`translate(${cx - r * 0.62},${cy - r * 0.62}) scale(${(r * 1.24) / 24})`}><Glyph id={brand.crest} color={c.discInk} /></g>
      )}
    </g>
  )
}

/** The small seal in the corner of every picture. It is placed by its parent (the bottom right corner of the frame). */
export function CreatorSeal({ brand, handle, logo, pill }: { brand: Brand; handle: string; logo: string | null; pill: string }) {
  const clipId = "psseal" + useId().replace(/[^a-zA-Z0-9]/g, "")
  const textRef = useRef<SVGTextElement>(null)
  const [tw, setTw] = useState(0)
  const hasText = !!handle || brand.madeWith
  // The seal's background fits its text (a handle can be any length): the width the words really take, letter spacing included
  useLayoutEffect(() => {
    const measure = () => { const el = textRef.current; let w = 0; try { w = el ? Math.max(el.getComputedTextLength(), el.getBBox().width) : 0 } catch { /* not drawn yet */ } if (w) setTw(Math.ceil(w)) }
    measure()
    document.fonts?.ready.then(measure)
  }, [handle, brand.madeWith])
  const w = hasText ? (tw || 92) + 48 : 34
  return (
    <g>
      <rect x={-14 - w} y={-42} width={w} height={28} rx={14} fill={pill} />
      <SealDisc cx={-14 - w + 17} cy={-28} r={11} brand={brand} logo={logo} clipId={clipId} />
      {hasText && (
        <text ref={textRef} x={-26} y={-22} textAnchor="end" fontSize={17} style={{ fontFamily: "'Barlow Condensed',sans-serif" }}>
          {handle && <tspan fill="rgba(255,255,255,0.78)" fontWeight="600" style={{ letterSpacing: "0.04em" }}>@{handle}</tspan>}
          {brand.madeWith && <tspan dx={handle ? 8 : 0} fill="rgba(255,255,255,0.95)" fontWeight="700" style={{ letterSpacing: "0.12em" }}>PITCHSTUDIO</tspan>}
        </text>
      )}
    </g>
  )
}
