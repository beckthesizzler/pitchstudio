import type { CSSProperties } from "react"
import { useTheme, PS_VOLT, ACCENT_SOLID } from "../theme"

/* The studio drawing on the Home page: a creator thinking at a desk, a wall of pinned boards. All drawn with code.
   The face colour is a prop so the Brand Kit can change it later (studio green until then). */
/* Home makes it live: `focus` lights up the tool you're on (fading in 0.35s), `look` (-1 to 1) turns the head toward the
   pointer while the walls drift the other way. Without either prop it stays the still drawing it always was. */

const NIGHT = { wall: "#2a2c31", floor: "#1b1c20", desk: "#3a3c43", leg: "#2e3036", shirt: "#f2f0ea", pants: "#26282d", bubble: "#f2f3f5", ink: "#121316", paper: "#f2f0ea", dark: "#1f2024", hair: "#101114", edge: "rgba(255,255,255,.07)" }
const DAY = { wall: "#E4E1D9", floor: "#D8D4CA", desk: "#B3AFA4", leg: "#A39F94", shirt: "#121316", pants: "#2f3138", bubble: "#FFFFFF", ink: "#121316", paper: "#FFFFFF", dark: "#2b2d33", hair: "#101114", edge: "rgba(0,0,0,.08)" }

export type SceneFocus = "board" | "live" | "report" | "braindump" | "shelf" | "profile" | "learn"
const PITCHES = [92, 166].flatMap(y => [80, 184, 288].map(x => [x, y] as const)) // where the six pinned boards hang
const SCREEN = "M430 544 L466 476 L632 476 L604 544 Z" // the laptop's screen
const NOTES = ["#F6E27A", "#EE9AB8", "#A8E0C2", "#9FD4E8"] // sticky pads
const THREAD = "#B3261E"
const BOOKS: [number, number, number, string][] = [[504, 14, 54, "#e53935"], [520, 18, 62, "#3b6cf0"], [540, 12, 48, "#f5b70a"], [554, 16, 58, "#1d5a2c"], [572, 14, 52, "#f6a04a"]] // x, width, height, colour

function Pitch({ x, y, s = 1.15 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect width="80" height="54" rx="3" fill="#1d5a2c" />
      <rect x="4" y="4" width="72" height="46" fill="none" stroke="rgba(255,255,255,.55)" />
      <line x1="40" y1="4" x2="40" y2="50" stroke="rgba(255,255,255,.55)" />
      <circle cx="40" cy="27" r="7" fill="none" stroke="rgba(255,255,255,.55)" />
      <circle className="sc-pd" cx="22" cy="18" r="2.6" fill="#f5b70a" /><circle className="sc-pd" cx="28" cy="34" r="2.6" fill="#f5b70a" /><circle cx="55" cy="22" r="2.6" fill="#3b6cf0" />
      <path d="M24 20 Q34 12 46 18" stroke="#d7ff3c" strokeWidth="1.4" fill="none" />
    </g>
  )
}

/** A sticky note hanging from its pin (px, py), turned a little around it */
function Note({ px, py, w, h, color, turn, lines = 2 }: { px: number; py: number; w: number; h: number; color: string; turn: number; lines?: number }) {
  const x = px - w / 2, y = py - 4
  return (
    <g transform={`rotate(${turn} ${px} ${py})`}>
      <rect x={x} y={y} width={w} height={h} rx="2" fill={color} />
      {Array.from({ length: lines }, (_, i) => <rect key={i} x={x + w * 0.16} y={y + h * (0.38 + i * 0.22)} width={w * (i % 2 ? 0.46 : 0.62)} height={Math.max(2, h * 0.06)} rx="1" fill="rgba(0,0,0,.28)" />)}
    </g>
  )
}

export function StudioScene({ skin = PS_VOLT, hair = false, view = "full", style, focus, look }: { skin?: string; hair?: boolean; view?: "full" | "banner"; style?: CSSProperties; focus?: SceneFocus; look?: number }) {
  const { theme } = useTheme()
  const c = theme === "night" ? NIGHT : DAY
  const vb = view === "banner" ? "180 190 600 340" : "0 0 880 820"
  const live = focus !== undefined || look !== undefined // only Home's live scene moves; anywhere else it's the still drawing
  const lk = look === undefined ? undefined : Math.max(-1, Math.min(1, Number.isFinite(look) ? look : 0))
  const on = (f: SceneFocus) => ({ opacity: focus === f ? 1 : 0 })
  const steam = theme === "night" ? "rgba(242,240,234,.5)" : "rgba(18,19,22,.28)"
  return (
    <svg className={live ? "sc sc-live" : "sc"} data-focus={focus} viewBox={vb} preserveAspectRatio="xMidYMid slice" role="img" aria-label="A creator thinking at a desk, surrounded by pinned tactics boards"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", ...style }}>
      <style>{`
        .sc-ol { fill: none; stroke: ${ACCENT_SOLID}; stroke-width: 2.5; }
        .sc-live[data-focus="board"] .sc-pd { opacity: 0; }
        .sc-steam { opacity: .55; }
        .sc-arm { transform-origin: 390px 490px; }
        .sc-head { transform-origin: 345px 442px; }
        @media (prefers-reduced-motion: no-preference) {
          .sc-f, .sc-pd { transition: opacity .35s ease; }
          .sc-walls, .sc-head { transition: transform .4s ease-out; }
        }
      `}</style>
      {/* both walls, which drift a little against the pointer */}
      <g className="sc-walls" style={lk === undefined ? undefined : { transform: `translateX(${(-lk * 8).toFixed(2)}px)` }}>
      {/* the wall */}
      <rect x="60" y="70" width="330" height="300" rx="6" fill={c.wall} stroke={c.edge} />
      {[92, 166].flatMap(y => [80, 184, 288].map(x => <Pitch key={`${x}-${y}`} x={x} y={y} />))}
      <rect x="80" y="240" width="92" height="110" rx="3" fill={c.paper} />
      <rect x="88" y="252" width="60" height="6" fill="#121316" /><rect x="88" y="266" width="74" height="3" fill="#9a9ea8" /><rect x="88" y="274" width="70" height="3" fill="#9a9ea8" />
      <rect x="88" y="290" width="74" height="48" fill="#1d5a2c" />
      <rect x="184" y="240" width="196" height="110" rx="3" fill={c.dark} />
      <path className="sc-run" d="M200 330 C240 300 260 270 300 262 C330 256 350 270 366 250" stroke="#d7ff3c" strokeWidth="3" fill="none" strokeDasharray="2 8" strokeLinecap="round" /><circle cx="366" cy="250" r="5" fill="#d7ff3c" />
      {live && (
        <g className="sc-f" style={on("board")}>
          {/* board: every pinned pitch outlined, two players drifting on each (they take over from the still dots) */}
          {PITCHES.map(([x, y], i) => (
            <g key={`${x}-${y}`}>
              <rect className="sc-ol" x={x - 3} y={y - 3} width="98" height="68" rx="6" />
              <g transform={`translate(${x} ${y}) scale(1.15)`}>
                <circle className="sc-drift1" cx="22" cy="18" r="2.6" fill="#f5b70a" style={{ animationDelay: `${-i * 0.45}s` }} />
                <circle className="sc-drift2" cx="28" cy="34" r="2.6" fill="#f5b70a" style={{ animationDelay: `${-i * 0.6}s` }} />
              </g>
            </g>
          ))}
        </g>
      )}
      <circle cx="126" cy="86" r="4" fill="#e53935" /><circle cx="230" cy="86" r="4" fill="#d7ff3c" /><circle cx="334" cy="86" r="4" fill="#3b6cf0" />
      <rect x="440" y="110" width="380" height="230" rx="6" fill={c.wall} stroke={c.edge} />
      <rect x="462" y="132" width="160" height="108" rx="3" fill="#1d5a2c" />
      <path d="M480 220 L540 170 L600 190" stroke="#fff" strokeWidth="2" fill="none" /><polygon points="520,150 600,150 590,230 530,230" fill="rgba(215,255,60,.25)" />
      <rect x="636" y="132" width="164" height="50" rx="3" fill={c.paper} /><rect x="646" y="144" width="90" height="6" fill="#121316" /><rect x="646" y="158" width="140" height="3" fill="#9a9ea8" /><rect x="646" y="166" width="120" height="3" fill="#9a9ea8" />
      <rect x="636" y="190" width="164" height="50" rx="3" fill={c.paper} /><rect x="646" y="202" width="70" height="6" fill="#121316" /><rect x="646" y="216" width="140" height="3" fill="#9a9ea8" />
      <rect x="462" y="254" width="338" height="66" rx="3" fill={c.dark} />
      <text x="478" y="294" fill="#d7ff3c" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="26" letterSpacing="2">3v2</text>
      <path d="M560 288 h200" stroke="rgba(255,255,255,.4)" strokeWidth="2" strokeDasharray="6 6" />
      {live && (
        <>
          {/* report: the paper on the left wall and the two paper cards on the right */}
          <g className="sc-f" style={on("report")}>
            <rect className="sc-ol" x="77" y="237" width="98" height="116" rx="6" />
            <rect className="sc-ol" x="634" y="130" width="168" height="54" rx="6" />
            <rect className="sc-ol" x="634" y="188" width="168" height="54" rx="6" />
          </g>
          {/* live: the big pitch is on air */}
          <g className="sc-f" style={on("live")}>
            <rect className="sc-ol" x="459" y="129" width="166" height="114" rx="6" />
            <rect x="468" y="137" width="52" height="18" rx="3" fill="#e53935" />
            <circle className="sc-blink" cx="477" cy="146" r="3" fill="#fff" />
            <text x="484" y="150" fill="#fff" fontFamily="Inter, sans-serif" fontWeight="800" fontSize="11" letterSpacing="1">LIVE</text>
            {/* the bar runs along the pitch's visible bottom edge, just above the thought bubble */}
            <rect x="470" y="203" width="144" height="3" rx="1.5" fill="rgba(255,255,255,.35)" />
            <rect className="sc-play" x="468" y="198" width="4" height="12" rx="2" fill="#d7ff3c" />
          </g>
          {/* dump & arrange: sticky notes pinned over the left wall, two of them tied */}
          <g className="sc-f" style={on("braindump")}>
            <Note px={126} py={108} w={52} h={46} color={NOTES[0]} turn={-6} />
            <Note px={232} py={154} w={52} h={46} color={NOTES[1]} turn={5} />
            <Note px={332} py={104} w={52} h={46} color={NOTES[2]} turn={-4} />
            <Note px={136} py={260} w={52} h={46} color={NOTES[3]} turn={4} />
            <path d="M126 108 Q229 146 332 104" stroke={THREAD} strokeWidth="2" fill="none" strokeLinecap="round" />
            {[[126, 108], [232, 154], [332, 104], [136, 260]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" fill="#121316" />)}
          </g>
          {/* shelf: both walls are the collection */}
          <g className="sc-f" style={on("shelf")}>
            <rect className="sc-ol" x="54" y="64" width="342" height="312" rx="10" strokeDasharray="8 6" />
            <rect className="sc-ol" x="434" y="104" width="392" height="242" rx="10" strokeDasharray="8 6" />
          </g>
        </>
      )}
      </g>
      {/* floor and desk */}
      <rect x="0" y="560" width="880" height="260" fill={c.floor} />
      <rect x="120" y="548" width="640" height="20" rx="4" fill={c.desk} /><rect x="150" y="568" width="16" height="200" fill={c.leg} /><rect x="714" y="568" width="16" height="200" fill={c.leg} />
      {/* laptop */}
      <path d="M420 548 L460 470 L640 470 L610 548 Z" fill="#c9ccd2" /><path d="M430 544 L466 476 L632 476 L604 544 Z" fill="#1d5a2c" />
      <path className="sc-pass" d="M500 520 Q540 490 590 500" stroke="#d7ff3c" strokeWidth="3" fill="none" /><circle cx="490" cy="525" r="4" fill="#f5b70a" /><circle cx="560" cy="505" r="4" fill="#3b6cf0" />
      <rect x="400" y="544" width="230" height="8" rx="3" fill="#a9acb3" />
      {live && (
        <>
          {/* what the laptop shows for report, dump & arrange and profile */}
          <g className="sc-f" style={on("report")}>
            <path d={SCREEN} fill={c.paper} />
            <rect x="474" y="488" width="84" height="8" fill="#121316" />
            <rect x="466" y="504" width="120" height="3" fill="#9a9ea8" /><rect x="462" y="514" width="128" height="3" fill="#9a9ea8" /><rect x="458" y="524" width="104" height="3" fill="#9a9ea8" />
          </g>
          <g className="sc-f" style={on("braindump")}>
            <path d={SCREEN} fill={c.dark} />
            {[487, 520, 553, 586].map((x, i) => <Note key={x} px={x} py={490} w={26} h={24} color={NOTES[i]} turn={[-5, 4, -3, 6][i]} lines={1} />)}
          </g>
          <g className="sc-f" style={on("profile")}>
            <path d={SCREEN} fill={c.dark} />
            <rect x="482" y="486" width="104" height="44" rx="5" fill={PS_VOLT} />
            <circle cx="500" cy="506" r="10" fill="#121316" />
            <rect x="516" y="498" width="50" height="6" rx="2" fill="#121316" /><rect x="516" y="510" width="36" height="4" rx="2" fill="rgba(18,19,22,.55)" />
          </g>
        </>
      )}
      {/* papers and mug */}
      <rect x="200" y="528" width="120" height="20" rx="2" fill={c.paper} transform="rotate(-4 260 538)" /><rect x="215" y="520" width="110" height="20" rx="2" fill={c.paper} opacity=".85" transform="rotate(3 270 530)" />
      <rect x="660" y="516" width="30" height="34" rx="5" fill="#d7ff3c" /><path d="M690 524 q14 0 14 12 q0 10 -14 10" stroke="#d7ff3c" strokeWidth="5" fill="none" />
      {live && (
        <g fill="none" stroke={steam} strokeWidth="3" strokeLinecap="round">
          <path className="sc-steam" d="M669 508 c-5 -7 5 -12 0 -19 c-5 -7 5 -12 0 -19" />
          <path className="sc-steam" d="M682 506 c-5 -7 5 -12 0 -19 c-5 -6 5 -11 0 -17" style={{ animationDelay: "-1.7s" }} />
        </g>
      )}
      {/* the creator */}
      <rect x="250" y="640" width="170" height="24" rx="8" fill={c.desk} /><rect x="262" y="664" width="14" height="110" fill={c.leg} /><rect x="396" y="664" width="14" height="110" fill={c.leg} />
      <path d="M300 640 L300 520 Q300 470 345 462 L370 460 Q400 462 404 500 L410 560 L398 640 Z" fill={c.shirt} />
      <path d="M318 640 L318 700 L420 700 L440 760 L470 760 L448 680 Q440 640 410 640 Z" fill={c.pants} />
      <rect x="440" y="752" width="48" height="14" rx="6" fill={c.shirt} />
      <path className="sc-arm" d="M380 500 Q430 520 470 540 L482 532 Q450 505 395 478 Z" fill={c.shirt} />
      <rect x="332" y="430" width="26" height="36" rx="8" fill={skin} />
      {/* the head, which turns around the neck toward the pointer */}
      <g className="sc-head" style={lk === undefined ? undefined : { transform: `rotate(${(lk * 7).toFixed(2)}deg)` }}>
      <circle cx="350" cy="404" r="40" fill={skin} />
      {hair && <path d="M306 395 L299 357 L323 373 L328 340 L346 366 L358 336 L370 366 L394 343 L391 376 L403 362 L394 397 Q372 378 349 380 Q325 380 306 395Z" fill={c.hair} />}
      </g>
      <path d="M372 470 Q392 446 384 430" stroke={skin} strokeWidth="14" strokeLinecap="round" fill="none" />
      {/* the thought: a run being drawn */}
      <circle cx="410" cy="350" r="7" fill={c.bubble} opacity=".85" /><circle cx="434" cy="322" r="11" fill={c.bubble} opacity=".9" />
      <g className="sc-bubble">
        <rect x="440" y="212" width="210" height="110" rx="55" fill={c.bubble} stroke={theme === "day" ? "rgba(0,0,0,.18)" : "none"} />
        <g className="sc-f" style={live ? { opacity: !focus || focus === "board" ? 1 : 0 } : undefined}>
        <circle cx="490" cy="286" r="7" fill={c.ink} /><circle cx="516" cy="272" r="7" fill={c.ink} />
        <path d="M540 260 C560 248 572 236 590 228" stroke={c.ink} strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M574 222 L596 222 L594 244" stroke={c.ink} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
        {live && (
          <>
            {/* live: play over a progress bar */}
            <g className="sc-f" style={on("live")}>
              <path d="M532 234 L532 270 L562 252 Z" fill={c.ink} stroke={c.ink} strokeWidth="6" strokeLinejoin="round" />
              <rect x="482" y="286" width="126" height="10" rx="5" fill={c.ink} opacity=".15" />
              <rect x="482" y="286" width="74" height="10" rx="5" fill="#e53935" />
            </g>
            {/* report: a headline, two lines and a small pitch */}
            <g className="sc-f" style={on("report")}>
              <rect x="486" y="236" width="98" height="12" rx="4" fill={c.ink} />
              <rect x="486" y="256" width="120" height="6" rx="3" fill={c.ink} opacity=".35" />
              <rect x="486" y="268" width="96" height="6" rx="3" fill={c.ink} opacity=".35" />
              <rect x="486" y="282" width="58" height="28" rx="3" fill="#1d5a2c" />
              <line x1="515" y1="282" x2="515" y2="310" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" />
              <circle cx="515" cy="296" r="5" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.5" />
            </g>
            {/* dump & arrange: three notes tied by a thread */}
            <g className="sc-f" style={on("braindump")}>
              <Note px={500} py={254} w={36} h={32} color={NOTES[0]} turn={-6} />
              <Note px={548} py={244} w={36} h={32} color={NOTES[1]} turn={4} />
              <Note px={596} py={258} w={36} h={32} color={NOTES[2]} turn={-3} />
              <path d="M500 254 Q524 270 548 244 Q572 272 596 258" stroke={THREAD} strokeWidth="2.5" fill="none" strokeLinecap="round" />
              {[[500, 254], [548, 244], [596, 258]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3" fill={c.ink} />)}
            </g>
            {/* shelf: five spines in a row */}
            <g className="sc-f" style={on("shelf")}>
              {BOOKS.map(([x, w, h, f]) => (
                <g key={x}>
                  <rect x={x} y={298 - h} width={w} height={h} rx="2" fill={f} />
                  <rect x={x} y={306 - h} width={w} height="3" fill="rgba(255,255,255,.55)" />
                </g>
              ))}
              <rect x="486" y="298" width="118" height="5" rx="2" fill={c.ink} />
            </g>
            {/* profile: the creator card */}
            <g className="sc-f" style={on("profile")}>
              <rect x="480" y="236" width="130" height="64" rx="10" fill={PS_VOLT} stroke={c.ink} strokeWidth="3" />
              <circle cx="510" cy="268" r="16" fill={c.ink} />
              <rect x="536" y="256" width="56" height="8" rx="4" fill={c.ink} />
              <rect x="536" y="272" width="40" height="6" rx="3" fill={c.ink} opacity=".5" />
            </g>
            {/* learn: an open book */}
            <g className="sc-f" style={on("learn")} fill="none" stroke={c.ink} strokeWidth="6" strokeLinejoin="round">
              <path d="M545 250 C528 238 506 236 486 240 L486 294 C506 290 528 292 545 304 Z" />
              <path d="M545 250 C562 238 584 236 604 240 L604 294 C584 290 562 292 545 304 Z" />
            </g>
          </>
        )}
      </g>
      <ellipse cx="440" cy="780" rx="330" ry="26" fill="rgba(0,0,0,.28)" />
    </svg>
  )
}
