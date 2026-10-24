/** A drawn picture of the tactics board (code, not an image), shared by the landing and sign-in pages. */
export function BoardArt() {
  const pitch = "#1f5a2c", pitch2 = "#236331", line = "rgba(255,255,255,0.78)"
  const home = [[150, 230], [250, 120], [250, 200], [250, 260], [250, 340], [360, 150], [360, 230], [360, 310], [470, 120], [470, 230], [470, 340]]
  const away = [[790, 230], [690, 120], [690, 200], [690, 260], [690, 340], [580, 150], [580, 230], [580, 310], [510, 150], [510, 310], [540, 230]]
  return (
    <svg viewBox="0 0 1000 560" role="img" aria-label="A tactics board with two teams and drawn movements" style={{ display: "block", width: "100%", height: "auto" }}>
      <rect width="1000" height="560" fill="#242529" />
      <rect width="1000" height="40" fill="#2C2D32" />
      <rect x="14" y="13" width="14" height="14" rx="3" fill="#d7ff3c" />
      <rect x="40" y="15" width="90" height="10" rx="5" fill="#44454c" />
      <rect x="840" y="11" width="62" height="18" rx="6" fill="#35363C" /><rect x="910" y="11" width="76" height="18" rx="6" fill="#d7ff3c" />
      <rect y="40" width="54" height="520" fill="#2C2D32" />
      {[70, 112, 154, 196, 238, 280].map((y, i) => <rect key={y} x="12" y={y} width="30" height="30" rx="8" fill={i === 0 ? "#d7ff3c" : "#35363C"} />)}
      <rect x="54" y="40" width="190" height="520" fill="#2C2D32" />
      {[70, 104, 138, 190, 224, 258, 330, 364, 398].map((y, i) => <rect key={y} x="68" y={y} width={i % 3 === 0 ? 90 : 150} height="14" rx="5" fill={i === 4 ? "#d7ff3c" : "#44454c"} />)}
      <g transform="translate(268 76)">
        <rect width="700" height="440" rx="2" fill={pitch} />
        {[0, 1, 2, 3, 4, 5, 6].map(i => i % 2 ? <rect key={i} x={i * 100} y="0" width="100" height="440" fill={pitch2} /> : null)}
        <g fill="none" stroke={line} strokeWidth="2">
          <rect x="6" y="6" width="688" height="428" /><line x1="350" y1="6" x2="350" y2="434" /><circle cx="350" cy="220" r="52" />
          <rect x="6" y="110" width="104" height="220" /><rect x="590" y="110" width="104" height="220" />
          <rect x="6" y="170" width="38" height="100" /><rect x="656" y="170" width="38" height="100" />
        </g>
        <g stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round">
          <path d="M 240 270 C 300 250 330 160 400 130" /><path d="M 400 130 l -14 3 m 14 -3 l -3 14" />
          <path d="M 360 300 C 420 320 480 330 520 300" /><path d="M 520 300 l -14 -2 m 14 2 l -8 12" />
        </g>
        {home.map(([x, y], i) => <g key={"h" + i}><circle cx={x - 40} cy={y - 40} r="15" fill="#fbbf24" stroke="#fff" strokeWidth="2" /><text x={x - 40} y={y - 35} fontSize="13" fontWeight="700" textAnchor="middle" fill="#1a1a1a" fontFamily="Barlow Condensed, sans-serif">{i + 1}</text></g>)}
        {away.map(([x, y], i) => <g key={"a" + i}><circle cx={x - 40} cy={y - 40} r="15" fill="#2563eb" stroke="#fff" strokeWidth="2" /><text x={x - 40} y={y - 35} fontSize="13" fontWeight="700" textAnchor="middle" fill="#fff" fontFamily="Barlow Condensed, sans-serif">{i + 1}</text></g>)}
      </g>
    </svg>
  )
}
