import { useRef } from "react"
import { useNavigate } from "react-router"
import { Play, FileText, BookOpen } from "lucide-react"
import { BoardArt } from "./BoardArt"
import { Mark } from "../brand/Mark"
import { ThemeToggle, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT } from "../theme"

/* The first page a visitor sees. Everything is drawn with code (no pictures to load), and every colour is a theme variable. */

/** Goes to a page after a one-second ball animation (instantly if the person prefers less motion). */
export function useKickTo() {
  const navigate = useNavigate()
  const busy = useRef(false)
  return (to: string, from: HTMLElement | null) => {
    const calm = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (busy.current) return
    if (calm || !from || typeof from.animate !== "function") { navigate(to); return }
    busy.current = true
    const r = from.getBoundingClientRect()
    const size = 44
    const ball = document.createElement("div")
    ball.setAttribute("aria-hidden", "true")
    ball.style.cssText = `position:fixed;left:${r.left + r.width / 2 - size / 2}px;top:${r.top + r.height / 2 - size / 2}px;width:${size}px;height:${size}px;z-index:9999;pointer-events:none;will-change:transform,opacity`
    ball.innerHTML = `<svg viewBox="0 0 44 44" width="${size}" height="${size}"><circle cx="22" cy="22" r="20" fill="#fff" stroke="#0a0c0f" stroke-width="2"/><polygon points="22,12 30,18 27,28 17,28 14,18" fill="#0a0c0f"/><g stroke="#0a0c0f" stroke-width="1.6" fill="none"><path d="M22 12V3M30 18l9-4M27 28l6 8M17 28l-6 8M14 18L5 14"/></g></svg>`
    document.body.appendChild(ball)
    const dx = window.innerWidth / 2 - (r.left + r.width / 2)
    const dy = window.innerHeight * 0.4 - (r.top + r.height / 2)
    const a = ball.animate([
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 40}px) scale(2.2) rotate(180deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(34) rotate(540deg)`, opacity: 0.0, offset: 1 },
    ], { duration: 780, easing: "cubic-bezier(.5,0,.75,.4)", fill: "forwards" })
    const go = () => { navigate(to); window.setTimeout(() => { ball.remove(); busy.current = false }, 60) }
    window.setTimeout(go, 640)
    a.onfinish = () => { if (busy.current) { ball.remove() } }
  }
}

const STEPS = [
  { n: "01", t: "Set the shape", p: "Pick a formation for each team and say who has the ball. The lineups reshape themselves.", chips: ["23 kits", "4-3-3", "Names"] },
  { n: "02", t: "Draw the idea", p: "Arrows, zones and text on a pitch that never gets in the way. Add steps to show the move unfolding.", chips: ["Arrows", "Zones", "Steps"] },
  { n: "03", t: "Export and post", p: "One click to a GIF, MP4 or PDF in 16:9, 4:5, 1:1 or 9:16, signed with your handle.", chips: ["GIF", "MP4", "PDF", "9:16"] },
]
const SOON = [
  { t: "Live Game Analysis", p: "Annotate real match stills and screenshots.", ic: <Play size={18} /> },
  { t: "Match Report", p: "Build a match breakdown with your own tagline and logo.", ic: <FileText size={18} /> },
  { t: "Learn Football", p: "The best football threads, picked and credited.", ic: <BookOpen size={18} /> },
]

export default function LandingPage() {
  const kick = useKickTo()
  const start = (e: React.MouseEvent<HTMLElement>) => kick("/signup", e.currentTarget)
  const signIn = () => kick("/signin", null)
  return (
    <div className="ls" style={{ background: SURFACE_BASE, color: TEXT_PRIMARY, minHeight: "100vh", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }}>
      <style>{`
        .ls * { box-sizing: border-box; }
        .ls-wrap { max-width: 1180px; margin: 0 auto; padding: 0 40px; }
        .ls-nav { display: flex; align-items: center; justify-content: space-between; height: 72px; }
        .ls-nav-r { display: flex; align-items: center; gap: 8px; }
        .ls-link, .ls-btn { white-space: nowrap; }
        .ls-link { background: none; border: none; color: ${TEXT_MUTED}; font-size: 14px; padding: 8px 12px; cursor: pointer; font-family: inherit; border-radius: 8px; }
        .ls-link:hover { color: ${TEXT_PRIMARY}; }
        .ls-btn { display: inline-flex; align-items: center; justify-content: center; height: 48px; padding: 0 28px; border-radius: 999px; font-weight: 600; font-size: 15px; border: 1px solid transparent; cursor: pointer; font-family: inherit; transition: transform .12s, filter .12s; }
        .ls-btn:hover { transform: scale(1.03); }
        .ls-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; }
        .ls-btn.sec { background: transparent; color: ${TEXT_PRIMARY}; border-color: ${DS_BORDER}; }
        .ls-btn.sm { height: 40px; padding: 0 20px; font-size: 14px; }
        .ls-hero { text-align: center; position: relative; padding-top: 64px; }
        .ls-glow { position: absolute; left: 50%; top: 90px; width: 900px; max-width: 120%; height: 520px; transform: translateX(-50%); background: radial-gradient(closest-side, var(--ps-glow), transparent); pointer-events: none; }
        .ls-eyebrow { font-size: 12px; letter-spacing: .16em; font-weight: 600; color: ${ACCENT_TEXT}; position: relative; }
        .ls-h1 { font-size: clamp(44px, 7.4vw, 88px); line-height: 1.02; letter-spacing: -.035em; font-weight: 700; margin: 18px auto 0; position: relative; max-width: 900px; }
        .ls-h1 em { font-style: normal; color: ${ACCENT_TEXT}; }
        .ls-sub { font-size: clamp(16px, 2vw, 20px); line-height: 1.5; color: ${TEXT_MUTED}; max-width: 640px; margin: 22px auto 0; position: relative; }
        .ls-sub b { color: ${TEXT_PRIMARY}; font-weight: 500; }
        .ls-cta { display: flex; gap: 12px; justify-content: center; margin-top: 32px; position: relative; }
        .ls-fine { font-size: 13px; color: ${TEXT_MUTED}; margin-top: 14px; position: relative; }
        .ls-shot { margin: 52px auto 0; max-width: 1060px; border-radius: 16px; border: 1px solid ${DS_BORDER}; overflow: hidden; box-shadow: 0 40px 120px rgba(0,0,0,.35); position: relative; background: #242529; }
        .ls-sec { padding-top: 110px; }
        .ls-eb2 { font-size: 12px; letter-spacing: .14em; font-weight: 600; color: ${ACCENT_TEXT}; }
        .ls-h2 { font-size: clamp(30px, 4vw, 44px); letter-spacing: -.03em; line-height: 1.08; font-weight: 700; max-width: 620px; margin: 12px 0 0; }
        .ls-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 40px; }
        .ls-card { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 18px; padding: 28px; }
        .ls-card.soon { background: transparent; border-style: dashed; }
        .ls-card h3 { font-size: 21px; letter-spacing: -.02em; margin: 14px 0 8px; font-weight: 600; }
        .ls-card p { color: ${TEXT_MUTED}; line-height: 1.55; font-size: 15px; margin: 0; }
        .ls-n { font-size: 13px; color: ${ACCENT_TEXT}; font-weight: 700; letter-spacing: .1em; }
        .ls-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
        .ls-chips span { font-size: 12px; background: ${SURFACE_2}; border-radius: 999px; padding: 6px 11px; color: ${TEXT_PRIMARY}; }
        .ls-top { display: flex; justify-content: space-between; align-items: center; }
        .ls-ico { width: 40px; height: 40px; border-radius: 11px; background: ${SURFACE_2}; display: grid; place-items: center; color: ${TEXT_PRIMARY}; }
        .ls-tag { font-size: 10px; letter-spacing: .12em; font-weight: 700; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; border-radius: 999px; padding: 4px 9px; }
        .ls-band { margin-top: 110px; padding: 84px 0 80px; text-align: center; background: linear-gradient(180deg, transparent, var(--ps-accent-soft)); }
        .ls-band .ls-h2 { margin: 0 auto; }
        .ls-foot { padding: 30px 0 40px; text-align: center; font-size: 12px; color: ${TEXT_MUTED}; }
        .ls-sticky { display: none; }
        @media (max-width: 760px) {
          .ls-wrap { padding: 0 20px; }
          .ls-nav { height: 60px; }
          .ls-nav-r { gap: 2px; }
          .ls-logo { display: none; }
          .ls-wrap { padding: 0 16px; }
          .ls-link { padding: 8px 8px; }
          .ls-hide { display: none; }
          .ls-hero { padding-top: 36px; }
          .ls-cta { flex-direction: column; padding: 0 4px; }
          .ls-cta .sec { display: none; }
          .ls-btn { height: 52px; }
          .ls-shot { margin-top: 34px; border-radius: 12px; height: 230px; }
          .ls-shot svg { width: 210% !important; max-width: none !important; margin-left: -64%; margin-top: -26%; }
          .ls-sec { padding-top: 72px; }
          .ls-grid { grid-template-columns: 1fr; margin-top: 26px; }
          .ls-card { padding: 22px; }
          .ls-band { margin-top: 72px; padding-bottom: 110px; }
          .ls-foot { padding-bottom: 96px; }
          .ls-sticky { display: block; position: fixed; left: 0; right: 0; bottom: 0; padding: 14px 20px 18px; background: linear-gradient(180deg, transparent, ${SURFACE_BASE} 45%); z-index: 20; }
          .ls-sticky .ls-btn { width: 100%; }
        }
        @media (prefers-reduced-motion: reduce) { .ls-btn { transition: none; } .ls-btn:hover { transform: none; } }
      `}</style>
      <div className="ls-wrap">
        <nav className="ls-nav" aria-label="Main">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}><Mark size={30} color={ACCENT_SOLID} /><span className="ls-logo" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: "0.2em", fontSize: 19, fontWeight: 600 }}>PITCHSTUDIO</span></span>
          <div className="ls-nav-r">
            <button className="ls-link ls-hide" onClick={() => document.getElementById("ls-how")?.scrollIntoView({ behavior: "smooth" })}>How it works</button>
            <button className="ls-link" onClick={signIn}>Sign in</button>
            <ThemeToggle />
            <button className="ls-btn pri sm" onClick={start}>Start creating</button>
          </div>
        </nav>

        <header className="ls-hero">
          <div className="ls-glow" />
          <div className="ls-eyebrow">THE TACTICS STUDIO FOR FOOTBALL THINKERS</div>
          <h1 className="ls-h1">Enable your <em>creativity.</em></h1>
          <p className="ls-sub">Where your genius comes to life. <b>Set a formation, draw the movements and export a clip people stop scrolling for.</b></p>
          <div className="ls-cta">
            <button className="ls-btn pri" onClick={start}>Start creating</button>
            <button className="ls-btn sec" onClick={() => document.getElementById("ls-how")?.scrollIntoView({ behavior: "smooth" })}>See how it works</button>
          </div>
          <div className="ls-fine">Free for every creator.</div>
          <div className="ls-shot"><BoardArt /></div>
        </header>

        <section className="ls-sec" id="ls-how">
          <div className="ls-eb2">HOW IT WORKS</div>
          <h2 className="ls-h2">From idea to post in three steps.</h2>
          <div className="ls-grid">
            {STEPS.map(s => (
              <div className="ls-card" key={s.n}>
                <div className="ls-n">{s.n}</div><h3>{s.t}</h3><p>{s.p}</p>
                <div className="ls-chips">{s.chips.map(c => <span key={c}>{c}</span>)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="ls-sec">
          <div className="ls-eb2">COMING NEXT</div>
          <h2 className="ls-h2">More ways to explain the game.</h2>
          <div className="ls-grid">
            {SOON.map(s => (
              <div className="ls-card soon" key={s.t}>
                <div className="ls-top"><div className="ls-ico">{s.ic}</div><span className="ls-tag">SOON</span></div>
                <h3>{s.t}</h3><p>{s.p}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="ls-band">
        <div className="ls-wrap">
          <h2 className="ls-h2">Your next breakdown starts on a blank pitch.</h2>
          <div className="ls-cta"><button className="ls-btn pri" onClick={start}>Start creating</button></div>
        </div>
      </div>
      <footer className="ls-foot">PitchStudio is not affiliated with any club, league or player.</footer>
      <div className="ls-sticky"><button className="ls-btn pri" onClick={start}>Start creating</button></div>
    </div>
  )
}
