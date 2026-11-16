import { useId } from "react"
import { Glyph } from "./crests"
import { cardColours, inkFor, isDark, shade, type Brand, type PhotoPos } from "./brand"
import { PS_VOLT } from "../theme"
import { studioLabel } from "../lib/studio"

/* The Creator Card, drawn with code as one svg (330 by 470) so it scales cleanly and can be saved as a picture. */

const SPIKY = "M24 56 L18 24 L38 38 L42 10 L58 32 L68 6 L78 32 L98 12 L96 40 L106 28 L98 58 Q80 42 60 44 Q40 44 24 56Z"
const SHIELD = "M50 4 92 18V50Q92 80 50 96 8 80 8 50V18Z"

/** Breaks a line into at most two lines of about 34 letters. */
function wrap(s: string, n = 34): string[] {
  // two lines at most, the second cut to fit
  if (s.length <= n) return s ? [s] : []
  const cut = s.lastIndexOf(" ", n)
  const i = cut > 8 ? cut : n
  return [s.slice(0, i).trim(), s.slice(i).trim().slice(0, n)]
}

/** The face and shoulders. Drawn at 122 by 150 units. */
export function Avatar({ skin, kit, hair, hairColor = "#101114" }: { skin: string; kit: string; hair: boolean; hairColor?: string }) {
  return (
    <g>
      <path d="M6 150 Q8 112 38 104 L84 104 Q114 112 116 150Z" fill={kit} />
      <rect x="50" y="84" width="22" height="26" rx="8" fill={skin} />
      <circle cx="61" cy="64" r="34" fill={skin} />
      {hair && <path d={SPIKY} fill={hairColor} />}
    </g>
  )
}

/** The four looks: background, text, and the two colour bars */
function look(brand: Brand) {
  const c = cardColours(brand), main = brand.color
  switch (brand.style) {
    case "matte": return { bg: main, bg2: shade(main, -0.25), text: inkFor(main), soft: inkFor(main), bar1: inkFor(main), bar2: shade(main, isDark(main) ? 0.35 : -0.35), edge: null as string | null, outline: null as string | null, frame: shade(main, -0.35) }
    case "sticker": return { bg: "#f4efe2", bg2: "#ece5d3", text: "#16171b", soft: "#5c5a54", bar1: main, bar2: c.pop === "#ffffff" ? "#16171b" : c.pop, edge: null, outline: main, frame: "#e2dac6" }
    case "paper": return { bg: "#f6f1e5", bg2: "#efe8d8", text: "#16171b", soft: "#5c5a54", bar1: main, bar2: "#16171b", edge: main, outline: null, frame: "#e4dccb" }
    default: return { bg: "#15171c", bg2: "#0b0c0f", text: "#ffffff", soft: "#a7abb5", bar1: isDark(main) ? PS_VOLT : main, bar2: isDark(main) ? "#ffffff" : c.disc === main ? PS_VOLT : c.disc, edge: null, outline: null, frame: shade(main, -0.55) }
  }
}

/** The biggest size (up to 40) at which the handle fits 288 units across, measured in the font the card draws it in */
let measure: CanvasRenderingContext2D | null = null
function fitName(t: string) {
  try {
    measure ??= document.createElement("canvas").getContext("2d")
    if (measure) { measure.font = "40px Anton, 'Barlow Condensed', sans-serif"; const w = measure.measureText(t).width; if (w > 0) return Math.max(14, Math.min(40, Math.floor(40 * 288 / w))) }
  } catch { /* no canvas: guess below */ }
  return Math.max(14, Math.min(40, Math.floor(288 / (t.length * 0.62))))
}

/** Where a cropped photo sits inside a frame of fw by fh */
export function photoBox(pos: PhotoPos, fx: number, fy: number, fw: number, fh: number) {
  const iw = Math.max(fw, fh * pos.ar) * pos.zoom, ih = iw / pos.ar
  return { x: fx + (fw - iw) * pos.x, y: fy + (fh - ih) * pos.y, w: iw, h: ih }
}

/** The Creator Card (330 by 470). photo: the photo to draw (a data address for exports). studio: your studio number.
 *  sheen: where the pointer is over the card (0 to 1), so the foil catches it. */
export function CreatorCard({ brand, handle, name, since, logo, unfinished = false, title: cardTitle, photo = null, studio = null, sheen = null }: {
  brand: Brand; handle: string; name: string; since: string; logo: string | null; unfinished?: boolean; title?: string
  photo?: string | null; studio?: number | null; sheen?: { x: number; y: number } | null
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const c = cardColours(brand), L = look(brand)
  const who = (handle ? "@" + handle : name || "YOU").toUpperCase()
  const nameSize = fitName(who)
  const motto = wrap(brand.motto, 38)
  const F = { x: 16, y: 16, w: 298, h: 262 }, P = photoBox(brand.photoPos, F.x, F.y, F.w, F.h)
  const sx = sheen ? sheen.x : 0.35, sy = sheen ? sheen.y : 0.2
  const role = (cardTitle ?? brand.title).toUpperCase()
  return (
    <svg viewBox="0 0 330 470" width="100%" role="img" aria-label={`Creator card for ${who}`} style={{ display: "block", borderRadius: 22 }}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stopColor={L.bg} /><stop offset="1" stopColor={L.bg2} /></linearGradient>
        <linearGradient id={`s${uid}`} x1={sx - 0.5} y1={sy - 0.5} x2={sx + 0.5} y2={sy + 0.5}>
          <stop offset="0.3" stopColor="#ffffff" stopOpacity="0" /><stop offset="0.45" stopColor="#c9f7ff" stopOpacity="0.22" /><stop offset="0.5" stopColor="#ffd6f6" stopOpacity="0.26" />
          <stop offset="0.55" stopColor="#f6ffb8" stopOpacity="0.2" /><stop offset="0.7" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`f${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.45" /></linearGradient>
        <clipPath id={`c${uid}`}><rect width="330" height="470" rx="22" /></clipPath>
        <clipPath id={`p${uid}`}><rect x={F.x} y={F.y} width={F.w} height={F.h} rx="14" /></clipPath>
        <clipPath id={`l${uid}`}><path d={SHIELD} transform="translate(272 28) scale(0.34)" /></clipPath>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width="330" height="470" fill={`url(#g${uid})`} />
        {L.edge && <rect width="12" height="470" fill={L.edge} />}
        {/* the frame: your photo, or the drawn you */}
        <g clipPath={`url(#p${uid})`}>
          <rect x={F.x} y={F.y} width={F.w} height={F.h} fill={L.frame} />
          {photo
            ? <image href={photo} x={P.x} y={P.y} width={P.w} height={P.h} preserveAspectRatio="none" />
            : <><rect x={F.x} y={F.y} width={F.w} height={F.h} fill={c.mid} /><g transform="translate(70 70) scale(1.55)"><Avatar skin={brand.skin} kit={c.kit} hair={brand.hair} /></g></>}
          <rect x={F.x} y={F.y} width={F.w} height={F.h} fill={`url(#f${uid})`} />
        </g>
        {/* studio number, crest */}
        <rect x="28" y="28" width={studio ? 108 : 0} height="22" rx="11" fill="#0b0c0f" fillOpacity="0.72" />
        {studio && <text x="82" y="43" textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontWeight="700" fontSize="10.5" letterSpacing="1.2" fill="#ffffff">STUDIO {studioLabel(studio).toUpperCase()}</text>}
        <path d={SHIELD} transform="translate(272 28) scale(0.34)" fill={c.pop === "#ffffff" ? "#ffffff" : c.pop} stroke="#0b0c0f" strokeOpacity="0.25" />
        {logo
          ? <image href={logo} x="275" y="31" width="28" height="28" preserveAspectRatio="xMidYMid slice" clipPath={`url(#l${uid})`} />
          : <g transform="translate(278.5 33.5) scale(0.48)"><Glyph id={brand.crest} color={c.glyph} /></g>}
        {unfinished && (
          <g><rect x="200" y="252" width="104" height="18" rx="9" fill="#ffffff" opacity="0.92" />
            <text x="252" y="265" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="9.5" letterSpacing="1.4" fill="#16171b">UNFINISHED</text></g>
        )}
        {/* you */}
        <text x="22" y="304" fontFamily="'JetBrains Mono', monospace" fontWeight="700" fontSize="10.5" letterSpacing="2" fill={L.soft}>{role}</text>
        <text x="20" y={304 + nameSize * 0.95 + 6} fontFamily="Anton, 'Barlow Condensed', sans-serif" fontSize={nameSize} letterSpacing="0.3" fill={L.text}>{who}</text>
        {motto.map((l, i) => <text key={i} x="22" y={304 + nameSize + 30 + i * 18} fontFamily="Georgia, 'Cormorant Garamond', serif" fontStyle="italic" fontSize="15" fill={L.text} opacity="0.9">{(i === 0 ? "“" : "") + l + (i === motto.length - 1 ? "”" : "")}</text>)}
        <rect x="22" y="424" width="64" height="6" rx="3" fill={L.bar1} />
        <rect x="90" y="424" width="34" height="6" rx="3" fill={L.bar2} />
        <text x="22" y="452" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="9.5" letterSpacing="1.8" fill={L.soft}>{`PITCHSTUDIO${since ? " · " + since.toUpperCase() : ""}`}</text>
        {brand.style === "foil" && <rect width="330" height="470" fill={`url(#s${uid})`} style={{ mixBlendMode: "screen" }} />}
        {L.outline && <rect x="5" y="5" width="320" height="460" rx="18" fill="none" stroke={L.outline} strokeWidth="5" />}
      </g>
    </svg>
  )
}
