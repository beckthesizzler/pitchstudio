import { useId } from "react"
import { Glyph } from "./crests"
import { cardColours, isDark, type Brand } from "./brand"

/* The Creator Card, drawn with code as one svg (330 by 470) so it scales cleanly and can be saved as a picture. */

const SPIKY = "M24 56 L18 24 L38 38 L42 10 L58 32 L68 6 L78 32 L98 12 L96 40 L106 28 L98 58 Q80 42 60 44 Q40 44 24 56Z"
const SHIELD = "M50 4 92 18V50Q92 80 50 96 8 80 8 50V18Z"

/** Breaks a line into at most two lines of about 34 letters. */
function wrap(s: string, n = 34): string[] {
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

export function CreatorCard({ brand, handle, name, since, logo, unfinished = false, title: cardTitle }: {
  brand: Brand; handle: string; name: string; since: string; logo: string | null; unfinished?: boolean; title?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const c = cardColours(brand)
  const who = (handle ? "@" + handle : name || "YOU").toUpperCase()
  const nameSize = Math.max(15, Math.min(28, Math.floor(272 / (who.length * 0.66))))
  const motto = wrap(brand.motto)
  return (
    <svg viewBox="0 0 330 470" width="100%" role="img" aria-label={`Creator card for ${who}`} style={{ display: "block", borderRadius: 22 }}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor={c.top} /><stop offset="0.55" stopColor={c.mid} /><stop offset="1" stopColor={c.bottom} />
        </linearGradient>
        <linearGradient id={`s${uid}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0.3" stopColor="#fff" stopOpacity="0" /><stop offset="0.46" stopColor="#fff" stopOpacity="0.26" /><stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${uid}`}><rect width="330" height="470" rx="22" /></clipPath>
        <clipPath id={`l${uid}`}><path d={SHIELD} transform="translate(18 18) scale(0.64)" /></clipPath>
      </defs>
      <g clipPath={`url(#c${uid})`}>
        <rect width="330" height="470" fill={`url(#g${uid})`} />
        <rect x="-40" y="140" width="420" height="86" fill={c.stripe} opacity={isDark(brand.color) ? 0.06 : 0.13} transform="rotate(-8 165 183)" />
        <rect width="330" height="470" fill={`url(#s${uid})`} />
        {/* the crest */}
        <path d={SHIELD} transform="translate(18 18) scale(0.64)" fill={c.pop} />
        {logo
          ? <image href={logo} x="26" y="26" width="48" height="48" preserveAspectRatio="xMidYMid slice" clipPath={`url(#l${uid})`} />
          : <g transform="translate(34 33) scale(0.9)"><Glyph id={brand.crest} color={c.glyph} /></g>}
        <text x="310" y="34" textAnchor="end" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="12" letterSpacing="2" fill={c.text} opacity="0.9">CREATOR CARD</text>
        {unfinished && (
          <g><rect x="212" y="44" width="98" height="20" rx="10" fill={c.text} opacity="0.92" />
            <text x="261" y="58" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="10" letterSpacing="1.4" fill={c.mid}>UNFINISHED</text></g>
        )}
        {/* you */}
        <g transform="translate(70 72) scale(1.55)"><Avatar skin={brand.skin} kit={c.kit} hair={brand.hair} /></g>
        <text x="165" y="352" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="800" fontSize={nameSize} letterSpacing="-0.3" fill={c.name}>{who}</text>
        {motto.map((l, i) => <text key={i} x="165" y={380 + i * 19} textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontSize="15" fill={c.text} opacity="0.92">{(i === 0 ? "“" : "") + l + (i === motto.length - 1 ? "”" : "")}</text>)}
        <line x1="20" y1="436" x2="310" y2="436" stroke={c.text} strokeOpacity="0.3" />
        <text x="20" y="454" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="10" letterSpacing="1.8" fill={c.text} opacity="0.85">{(cardTitle ?? brand.title).toUpperCase()}</text>
        <text x="310" y="454" textAnchor="end" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="10" letterSpacing="1.8" fill={c.text} opacity="0.85">{since ? `SINCE ${since}` : ""}</text>
      </g>
    </svg>
  )
}
