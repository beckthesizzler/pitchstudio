import type { CSSProperties } from "react"
import { useTheme, PS_VOLT } from "../theme"

/* The studio drawing on the Home page: a creator thinking at a desk, a wall of pinned boards. All drawn with code.
   The face colour is a prop so the Brand Kit can change it later (studio green until then). */

const NIGHT = { wall: "#2a2c31", floor: "#1b1c20", desk: "#3a3c43", leg: "#2e3036", shirt: "#f2f0ea", pants: "#26282d", bubble: "#f2f3f5", ink: "#121316", paper: "#f2f0ea", dark: "#1f2024", hair: "#101114", edge: "rgba(255,255,255,.07)" }
const DAY = { wall: "#E4E1D9", floor: "#D8D4CA", desk: "#B3AFA4", leg: "#A39F94", shirt: "#121316", pants: "#2f3138", bubble: "#FFFFFF", ink: "#121316", paper: "#FFFFFF", dark: "#2b2d33", hair: "#101114", edge: "rgba(0,0,0,.08)" }

function Pitch({ x, y, s = 1.15 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect width="80" height="54" rx="3" fill="#1d5a2c" />
      <rect x="4" y="4" width="72" height="46" fill="none" stroke="rgba(255,255,255,.55)" />
      <line x1="40" y1="4" x2="40" y2="50" stroke="rgba(255,255,255,.55)" />
      <circle cx="40" cy="27" r="7" fill="none" stroke="rgba(255,255,255,.55)" />
      <circle cx="22" cy="18" r="2.6" fill="#f5b70a" /><circle cx="28" cy="34" r="2.6" fill="#f5b70a" /><circle cx="55" cy="22" r="2.6" fill="#3b6cf0" />
      <path d="M24 20 Q34 12 46 18" stroke="#d7ff3c" strokeWidth="1.4" fill="none" />
    </g>
  )
}

export function StudioScene({ skin = PS_VOLT, hair = true, view = "full", style }: { skin?: string; hair?: boolean; view?: "full" | "banner"; style?: CSSProperties }) {
  const { theme } = useTheme()
  const c = theme === "night" ? NIGHT : DAY
  const vb = view === "banner" ? "180 190 600 340" : "0 0 880 820"
  return (
    <svg className="sc" viewBox={vb} preserveAspectRatio="xMidYMid slice" role="img" aria-label="A creator thinking at a desk, surrounded by pinned tactics boards"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }}>
      <style>{`
        @keyframes scBubble { 0%,100% { transform: scale(1); } 50% { transform: scale(1.035); } }
        .sc-bubble { transform-box: fill-box; transform-origin: 30% 100%; animation: scBubble 3.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .sc-bubble { animation: none; } }
      `}</style>
      {/* the wall */}
      <rect x="60" y="70" width="330" height="300" rx="6" fill={c.wall} stroke={c.edge} />
      {[92, 166].flatMap(y => [80, 184, 288].map(x => <Pitch key={`${x}-${y}`} x={x} y={y} />))}
      <rect x="80" y="240" width="92" height="110" rx="3" fill={c.paper} />
      <rect x="88" y="252" width="60" height="6" fill="#121316" /><rect x="88" y="266" width="74" height="3" fill="#9a9ea8" /><rect x="88" y="274" width="70" height="3" fill="#9a9ea8" />
      <rect x="88" y="290" width="74" height="48" fill="#1d5a2c" />
      <rect x="184" y="240" width="196" height="110" rx="3" fill={c.dark} />
      <path d="M200 330 C240 300 260 270 300 262 C330 256 350 270 366 250" stroke="#d7ff3c" strokeWidth="3" fill="none" strokeDasharray="2 8" strokeLinecap="round" /><circle cx="366" cy="250" r="5" fill="#d7ff3c" />
      <circle cx="126" cy="86" r="4" fill="#e53935" /><circle cx="230" cy="86" r="4" fill="#d7ff3c" /><circle cx="334" cy="86" r="4" fill="#3b6cf0" />
      <rect x="440" y="110" width="380" height="230" rx="6" fill={c.wall} stroke={c.edge} />
      <rect x="462" y="132" width="160" height="108" rx="3" fill="#1d5a2c" />
      <path d="M480 220 L540 170 L600 190" stroke="#fff" strokeWidth="2" fill="none" /><polygon points="520,150 600,150 590,230 530,230" fill="rgba(215,255,60,.25)" />
      <rect x="636" y="132" width="164" height="50" rx="3" fill={c.paper} /><rect x="646" y="144" width="90" height="6" fill="#121316" /><rect x="646" y="158" width="140" height="3" fill="#9a9ea8" /><rect x="646" y="166" width="120" height="3" fill="#9a9ea8" />
      <rect x="636" y="190" width="164" height="50" rx="3" fill={c.paper} /><rect x="646" y="202" width="70" height="6" fill="#121316" /><rect x="646" y="216" width="140" height="3" fill="#9a9ea8" />
      <rect x="462" y="254" width="338" height="66" rx="3" fill={c.dark} />
      <text x="478" y="294" fill="#d7ff3c" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="26" letterSpacing="2">3v2</text>
      <path d="M560 288 h200" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeDasharray="6 6" />
      {/* floor and desk */}
      <rect x="0" y="560" width="880" height="260" fill={c.floor} />
      <rect x="120" y="548" width="640" height="20" rx="4" fill={c.desk} /><rect x="150" y="568" width="16" height="200" fill={c.leg} /><rect x="714" y="568" width="16" height="200" fill={c.leg} />
      {/* laptop */}
      <path d="M420 548 L460 470 L640 470 L610 548 Z" fill="#c9ccd2" /><path d="M430 544 L466 476 L632 476 L604 544 Z" fill="#1d5a2c" />
      <path d="M500 520 Q540 490 590 500" stroke="#d7ff3c" strokeWidth="3" fill="none" /><circle cx="490" cy="525" r="4" fill="#f5b70a" /><circle cx="560" cy="505" r="4" fill="#3b6cf0" />
      <rect x="400" y="544" width="230" height="8" rx="3" fill="#a9acb3" />
      {/* papers and mug */}
      <rect x="200" y="528" width="120" height="20" rx="2" fill={c.paper} transform="rotate(-4 260 538)" /><rect x="215" y="520" width="110" height="20" rx="2" fill={c.paper} opacity=".85" transform="rotate(3 270 530)" />
      <rect x="660" y="516" width="30" height="34" rx="5" fill="#d7ff3c" /><path d="M690 524 q14 0 14 12 q0 10 -14 10" stroke="#d7ff3c" strokeWidth="5" fill="none" />
      {/* the creator */}
      <rect x="250" y="640" width="170" height="24" rx="8" fill={c.desk} /><rect x="262" y="664" width="14" height="110" fill={c.leg} /><rect x="396" y="664" width="14" height="110" fill={c.leg} />
      <path d="M300 640 L300 520 Q300 470 345 462 L370 460 Q400 462 404 500 L410 560 L398 640 Z" fill={c.shirt} />
      <path d="M318 640 L318 700 L420 700 L440 760 L470 760 L448 680 Q440 640 410 640 Z" fill={c.pants} />
      <rect x="440" y="752" width="48" height="14" rx="6" fill={c.shirt} />
      <path d="M380 500 Q430 520 470 540 L482 532 Q450 505 395 478 Z" fill={c.shirt} />
      <rect x="332" y="430" width="26" height="36" rx="8" fill={skin} />
      <circle cx="350" cy="404" r="40" fill={skin} />
      {hair && <path d="M306 395 L299 357 L323 373 L328 340 L346 366 L358 336 L370 366 L394 343 L391 376 L403 362 L394 397 Q372 378 349 380 Q325 380 306 395Z" fill={c.hair} />}
      <path d="M372 470 Q392 446 384 430" stroke={skin} strokeWidth="14" strokeLinecap="round" fill="none" />
      {/* the thought: a run being drawn */}
      <circle cx="410" cy="350" r="7" fill={c.bubble} opacity=".85" /><circle cx="434" cy="322" r="11" fill={c.bubble} opacity=".9" />
      <g className="sc-bubble">
        <rect x="440" y="212" width="210" height="110" rx="55" fill={c.bubble} stroke={theme === "day" ? "rgba(0,0,0,.18)" : "none"} />
        <circle cx="490" cy="286" r="7" fill={c.ink} /><circle cx="516" cy="272" r="7" fill={c.ink} />
        <path d="M540 260 C560 248 572 236 590 228" stroke={c.ink} strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M574 222 L596 222 L594 244" stroke={c.ink} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
      <ellipse cx="440" cy="780" rx="330" ry="26" fill="rgba(0,0,0,.28)" />
    </svg>
  )
}
