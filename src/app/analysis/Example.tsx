import { Marks } from "./Marks"
import type { Mark } from "./model"

/* The example on an empty analysis: a drawn match moment with real marks on it (the same drawing code as your shots),
   so what you see is exactly what you will make. 1920 by 1080, like a broadcast frame. */

const W = 1920, H = 1080
const SKIN = "#c98d68", HOME = "#a3214a", HOME2 = "#1f4ba0", AWAY = "#f4f4f2"

// the crowd: the same dots every time
const CROWD = (() => {
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const cols = ["#e8b4c6", "#f5f5f7", "#9fb7e8", "#d7ff3c", "#f0c9a0"]
  return Array.from({ length: 520 }, () => [r() * W, 14 + r() * 300, 1.5 + r() * 2.4, cols[Math.floor(r() * cols.length)], 0.35 + r() * 0.5] as const)
})()

/** A player standing with their feet at (x, y), s times the size of one at the front */
function Player({ x, y, s, home }: { x: number; y: number; s: number; home: boolean }) {
  const k = (v: number) => v * s
  const shirt = home ? HOME : AWAY
  return (
    <g>
      <ellipse cx={x} cy={y} rx={k(34)} ry={k(9)} fill="rgba(0,0,0,.28)" />
      <rect x={x - k(15)} y={y - k(118)} width={k(12)} height={k(112)} rx={k(5)} fill={SKIN} />
      <rect x={x + k(3)} y={y - k(118)} width={k(12)} height={k(112)} rx={k(5)} fill={SKIN} />
      <rect x={x - k(16)} y={y - k(30)} width={k(14)} height={k(26)} rx={k(3)} fill="#f5f5f7" />
      <rect x={x + k(2)} y={y - k(30)} width={k(14)} height={k(26)} rx={k(3)} fill="#f5f5f7" />
      <rect x={x - k(24)} y={y - k(146)} width={k(48)} height={k(32)} fill="#141414" />
      <rect x={x - k(38)} y={y - k(236)} width={k(13)} height={k(78)} rx={k(6)} fill={shirt} />
      <rect x={x + k(25)} y={y - k(236)} width={k(13)} height={k(78)} rx={k(6)} fill={shirt} />
      <path d={`M${x - k(27)} ${y - k(240)} L${x + k(27)} ${y - k(240)} L${x + k(24)} ${y - k(142)} L${x - k(24)} ${y - k(142)} Z`} fill={shirt} />
      <path d={`M${x - k(22)} ${y - k(240)} Q${x} ${y - k(226)} ${x + k(22)} ${y - k(240)}`} stroke={home ? HOME2 : "#141414"} strokeWidth={k(7)} fill="none" />
      <rect x={x - k(7)} y={y - k(258)} width={k(14)} height={k(20)} fill={SKIN} />
      <circle cx={x} cy={y - k(280)} r={k(24)} fill={SKIN} />
    </g>
  )
}

export function ExampleShot({ color, label }: { color: string; label?: string }) {
  const edge = color
  const items: Mark[] = [
    { id: "x1", kind: "spot", color: "#ffffff", x: 1010, y: 905, size: 1.25 },
    { id: "x2", kind: "arrow", color: "#d7ff3c", a: [800, 985], b: [1250, 820], c: [960, 790], dash: "solid", head: "end", size: 2 },
    { id: "x3", kind: "tag", color: edge, x: 660, y: 985, dx: 0, dy: -520, label: "Pedri", ring: true, size: 1.75, style: "sig" },
    { id: "x4", kind: "tag", color: edge, x: 1010, y: 905, dx: 0, dy: -500, label: "De Jong", ring: true, size: 1.75, style: "sig" },
    { id: "x5", kind: "tag", color: "#ffffff", x: 1250, y: 820, dx: 150, dy: -415, label: "N. Williams", ring: true, size: 1.75, style: "sig" },
  ]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? "An example: three players tagged, one in the spotlight, and a pass drawn between them"} style={{ display: "block", width: "100%", height: "auto" }}>
      <defs>
        <linearGradient id="exSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#141a3c" /><stop offset="1" stopColor="#1b2350" /></linearGradient>
        <linearGradient id="exGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#226d36" /><stop offset="1" stopColor="#2f8a45" /></linearGradient>
      </defs>
      <rect width={W} height={340} fill="url(#exSky)" />
      {CROWD.map(([x, y, r, c, o], i) => <circle key={i} cx={x} cy={y} r={r} fill={c} opacity={o} />)}
      <rect y={320} width={W} height={40} fill="#16181d" />
      <rect y={360} width={W} height={H - 360} fill="url(#exGrass)" />
      {Array.from({ length: 9 }, (_, i) => <path key={i} d={`M${i * 240 - 80} 360 L${i * 240 + 40} 360 L${i * 300 - 200} ${H} L${i * 300 - 360} ${H} Z`} fill="#ffffff" opacity={0.035} />)}
      <g stroke="#f5f5f7" strokeWidth={5} fill="none" opacity={0.9}>
        <line x1={0} y1={455} x2={W} y2={455} />
        <line x1={760} y1={455} x2={600} y2={H} />
        <line x1={1080} y1={455} x2={1300} y2={H} />
        <ellipse cx={980} cy={905} rx={360} ry={110} />
      </g>
      <Player x={300} y={700} s={0.95} home />
      <Player x={1500} y={690} s={0.9} home={false} />
      <Player x={1720} y={660} s={0.78} home={false} />
      <Player x={470} y={760} s={1.02} home={false} />
      <Player x={1250} y={820} s={1.12} home={false} />
      <Player x={1010} y={905} s={1.25} home />
      <Player x={660} y={985} s={1.42} home />
      <circle cx={815} cy={990} r={20} fill="#f5f5f7" stroke="#1a1a1a" strokeWidth={3} />
      <Marks items={items} w={W} h={H} />
    </svg>
  )
}
