import { Suspense, lazy, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Mark } from "../brand/Mark"
import { ThemeToggle, TEXT_PRIMARY, SURFACE_BASE, ACCENT_SOLID } from "../theme"
import { LANDING_CSS } from "./landingCss"

/* The first page a visitor sees. Everything is drawn with code (no pictures to load), and every colour is a theme variable,
   except the things that have their own colours: the pitches, the felt wall and the paper. The template previews are drawn
   by the real report engine, loaded only when that section comes near. */
const TemplateThumb = lazy(() => import("../report/Thumb"))

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

/** The board in the hero: each format reshapes its frame, and the line under it says where that format goes */
const RATIOS = [
  { id: "16:9", w: 560, h: 315, use: "YouTube, X video, the big screen" },
  { id: "4:5", w: 344, h: 430, use: "Instagram posts and carousels, X images" },
  { id: "1:1", w: 420, h: 420, use: "Anywhere, cropped for nothing" },
  { id: "9:16", w: 242, h: 430, use: "TikTok, Reels and Shorts" },
] as const
const LINKS = [["ls-board", "Tactics Board"], ["ls-live", "Live Analysis"], ["ls-reports", "Match Reports"], ["ls-dump", "Dump & Arrange"]] as const
const TEMPLATES = [
  { id: "game", name: "Game Report", note: "The whole match on one card, with a balance rating people argue about" },
  { id: "report", name: "Micro Breakdown", note: "One player, one pattern, zoomed all the way in" },
  { id: "formation", name: "Formation Change", note: "The shape you want, and who fits where" },
  { id: "journal", name: "Matchday Journal", note: "Your notebook, with room for every detail" },
] as const
const to = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })

export default function LandingPage() {
  const kick = useKickTo()
  const start = (e: React.MouseEvent<HTMLElement>) => kick("/signup", e.currentTarget)
  const signIn = () => kick("/signin", null)
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>(RATIOS[0])
  const [near, setNear] = useState(false) // the templates section is close: draw its previews
  const root = useRef<HTMLDivElement>(null)

  // sections rise in as they come into view (not with reduced motion)
  useEffect(() => {
    const els = [...(root.current?.querySelectorAll<HTMLElement>(".ls-rise") ?? [])]
    if (typeof IntersectionObserver === "undefined") { els.forEach(e => e.classList.add("in")); setNear(true); return }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target) } }), { threshold: 0.2 })
    els.forEach(e => io.observe(e))
    const tpl = document.getElementById("ls-reports")
    const io2 = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io2.disconnect() } }, { rootMargin: "600px 0px" })
    if (tpl) io2.observe(tpl)
    return () => { io.disconnect(); io2.disconnect() }
  }, [])

  return (
    <main className="ls" ref={root} style={{ background: SURFACE_BASE, color: TEXT_PRIMARY, minHeight: "100vh", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }}>
      <style>{LANDING_CSS}</style>

      <div className="ls-w">
        <nav className="ls-nav" aria-label="PitchStudio">
          <button className="ls-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="PitchStudio, back to the top"><Mark size={28} color={ACCENT_SOLID} /><span>PITCHSTUDIO</span></button>
          {LINKS.map(([id, t]) => <button key={id} className="ls-link ls-sec-link" onClick={() => to(id)}>{t}</button>)}
          <button className="ls-link" onClick={signIn}>Sign in</button>
          <ThemeToggle />
          <button className="ls-btn pri sm" onClick={start}>Open your studio, free</button>
        </nav>

        <header className="ls-hero">
          <div className="ls-hero-l">
            <span className="ls-cap">THE FOOTBALL STUDIO FOR CREATORS</span>
            <h1 className="ls-h1">SEE THE GAME.<br />MAKE IT YOURS.</h1>
            <p className="ls-lead">Draw tactics that move. Turn a match into a report that looks like a magazine page. Pin every idea until it grows into a post. Every piece carries your name, and every tool is free.</p>
            <div className="ls-row">
              <button className="ls-btn pri" onClick={start}>Open your studio</button>
              <button className="ls-btn sec" onClick={() => to("ls-board")}>See what you can make</button>
            </div>
            <span className="ls-small">No card. No trial. Every tool unlocked from day one.</span>
          </div>
          <div className="ls-hero-r">
            <div className="ls-panel ls-stage">
              <div className="ls-frame" style={{ width: `min(${ratio.w}px, 92%)`, aspectRatio: `${ratio.w} / ${ratio.h}` }}>
                <svg viewBox="0 0 480 320" preserveAspectRatio="xMidYMid slice" role="img" aria-label="An animated tactics board: three players rotate and the ball moves between them">
                  <rect x="0" y="0" width="480" height="320" fill="#1d5a2c" />
                  <path d="M0 0 h60 v320 h-60 Z M120 0 h60 v320 h-60 Z M240 0 h60 v320 h-60 Z M360 0 h60 v320 h-60 Z" fill="#20622f" />
                  <rect x="14" y="14" width="452" height="292" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
                  <line x1="240" y1="14" x2="240" y2="306" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
                  <circle cx="240" cy="160" r="40" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
                  <rect x="386" y="90" width="80" height="140" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
                  <path className="lp-dash" d="M170 220 C 220 190 260 170 290 150" stroke="#d7ff3c" strokeWidth="3" fill="none" />
                  <path className="lp-dash" d="M290 150 C 300 110 280 80 230 42" stroke="#d7ff3c" strokeWidth="3" fill="none" />
                  <polygon points="300,60 400,60 420,140 320,150" fill="rgba(215,255,60,.18)" stroke="#d7ff3c" strokeWidth="1.5" strokeDasharray="4 4" />
                  {[[330, 120], [360, 190], [300, 230]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="10" fill="#e9f0ff" stroke="#121316" strokeWidth="1.5" />)}
                  <g className="lp-a"><circle cx="170" cy="220" r="11" fill="#a11d48" stroke="#fff" strokeWidth="2" /></g>
                  <g className="lp-b"><circle cx="290" cy="150" r="11" fill="#a11d48" stroke="#fff" strokeWidth="2" /></g>
                  <g className="lp-c"><circle cx="230" cy="42" r="11" fill="#1f4ba0" stroke="#fff" strokeWidth="2" /></g>
                  <g className="lp-ball"><circle cx="172" cy="236" r="5" fill="#fff" stroke="#121316" strokeWidth="1.5" /></g>
                </svg>
                <span className="ls-tag" style={{ right: 10, bottom: 10 }}>@yourname <i>made with PitchStudio</i></span>
                <span className="ls-tag" style={{ left: 10, top: 10, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: ".1em", fontWeight: 500 }}><span className="lp-rec" style={{ width: 7, height: 7, borderRadius: 99, background: "#e53935" }} />EXPORTING MP4</span>
              </div>
            </div>
            <div className="ls-row" style={{ justifyContent: "center", alignItems: "center", gap: 8 }} role="group" aria-label="Try a format">
              <span className="ls-small" style={{ marginRight: 4 }}>Try a format</span>
              {RATIOS.map(r => <button key={r.id} className="ls-fmt" aria-pressed={ratio.id === r.id} onClick={() => setRatio(r)}>{r.id}</button>)}
            </div>
            <span style={{ fontSize: 13 }} aria-live="polite">{ratio.id} · {ratio.use}</span>
          </div>
        </header>
      </div>

      <section className="ls-strip" aria-label="What you get">
        <div className="ls-w"><span>MP4 · GIF · PNG</span><span>16:9 · 4:5 · 1:1 · 9:16</span><span>5 REPORT TEMPLATES</span><span>YOUR NAME ON EVERY EXPORT</span><span>FREE, ALL OF IT</span></div>
      </section>

      <div className="ls-w">
        <section id="ls-board" className="ls-sec ls-rise">
          <div className="ls-txt">
            <span className="ls-cap">01 · TACTICS BOARD</span>
            <h2 className="ls-h2">Draw the move once. Post it everywhere.</h2>
            <p className="ls-p">Place players, draw passes, runs and zones, then add frames and press play. Export the same move as a 16:9 video for YouTube, a 9:16 clip for TikTok or a 4:5 still for a carousel.</p>
            <ul className="ls-list">
              <li><span>→</span>Frames that animate between positions</li>
              <li><span>→</span>Passes, runs, shots, zones, notes on the pitch</li>
              <li><span>→</span>MP4, GIF or PNG, in any of four ratios</li>
            </ul>
          </div>
          <div className="ls-panel ls-art" aria-hidden="true">
            <div className="ls-frames">
              <div className="ls-fr on"><b>FRAME 1</b><i style={{ left: "30%", top: "60%" }} /><i style={{ left: "55%", top: "45%" }} /></div>
              <div className="ls-fr"><b>FRAME 2</b><i style={{ left: "50%", top: "40%" }} /><i style={{ left: "45%", top: "18%" }} /></div>
              <div className="ls-fr"><b>FRAME 3</b><i style={{ left: "70%", top: "30%" }} /><i className="blue" style={{ left: "40%", top: "12%" }} /></div>
            </div>
            <div className="ls-bar"><span /></div>
            <div className="ls-row" style={{ gap: 8 }}>{["16:9 · YouTube", "4:5 · Instagram, X", "1:1 · Anywhere", "9:16 · TikTok, Reels, Shorts"].map(c => <span key={c} className="ls-chip">{c}</span>)}</div>
          </div>
        </section>

        <section id="ls-live" className="ls-sec rev ls-rise">
          <div className="ls-panel ls-live" aria-hidden="true">
            <div className="ls-screen">
              <div style={{ position: "absolute", inset: "14% 10%", border: "2px solid rgba(255,255,255,.25)" }} />
              <span className="ls-tag" style={{ left: 12, top: 12, background: "#e53935" }}><span className="lp-rec" style={{ width: 7, height: 7, borderRadius: 99, background: "#fff" }} />LIVE · 63'</span>
              <svg viewBox="0 0 320 180" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}><path className="lp-dash" d="M80 130 C 140 110 190 90 250 60" stroke="#d7ff3c" strokeWidth="3" fill="none" /><circle cx="80" cy="130" r="7" fill="#a11d48" stroke="#fff" strokeWidth="2" /><circle cx="250" cy="60" r="7" fill="#a11d48" stroke="#fff" strokeWidth="2" /></svg>
            </div>
            <div className="ls-moments">
              <span>MOMENTS KEPT</span>
              <span className="ls-mo"><b>7'</b>Steal from the press</span>
              <span className="ls-mo"><b>52'</b>Pedri and Fermín combine</span>
              <span className="ls-mo now"><b>63'</b>Marking now…</span>
            </div>
          </div>
          <div className="ls-txt">
            <span className="ls-cap">02 · LIVE GAME ANALYSIS</span>
            <h2 className="ls-h2">Catch it while the match is still on.</h2>
            <p className="ls-p">Grab the moment, draw over it and keep it with its minute. By full time your report has half written itself.</p>
          </div>
        </section>

        <section id="ls-reports" className="ls-rise" style={{ padding: "96px 0 40px", display: "flex", flexDirection: "column", gap: 28 }}>
          <div className="ls-head">
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 }}>
              <span className="ls-cap">03 · MATCH REPORTS</span>
              <h2 className="ls-h2">Fill a form. The page designs itself.</h2>
              <p className="ls-p">Type the score, the moments and your take. The card lays itself out, then every word, dot and arrow stays yours to move.</p>
            </div>
            <button className="ls-more" onClick={start}>Start a report →</button>
          </div>
          <div className="ls-tpls">
            {TEMPLATES.map(t => (
              <figure key={t.id} className="ls-tpl">
                <div className="th">
                  {t.id === "journal"
                    ? <div className="ls-journal" aria-hidden="true"><small>MATCHDAY JOURNAL</small><b style={{ fontSize: 24, lineHeight: 1, color: "#1f3e8c", border: "none" }}>Barça v <em style={{ color: "#6e1e3a", fontStyle: "normal" }}>Villa</em></b><span><b>7'</b> Yamal, the steal</span><span><b>52'</b> Raphinha</span><span><b>64'</b> Raphinha</span><span style={{ color: "#2e7d32", border: "none" }}>→ keep the press</span></div>
                    : near && <Suspense fallback={null}><TemplateThumb id={t.id} /></Suspense>}
                </div>
                <figcaption><b>{t.name}</b><br /><span>{t.note}</span></figcaption>
              </figure>
            ))}
            <figure className="ls-tpl">
              <button className="th ls-own" onClick={start} aria-label="Start your own report"><b>+</b>Blank page, every tool</button>
              <figcaption><b>Your own</b><br /><span>Text, tables, pitches, photos, fonts. Build your own format</span></figcaption>
            </figure>
          </div>
        </section>

        <section id="ls-dump" className="ls-sec ls-rise">
          <div className="ls-txt">
            <span className="ls-cap">04 · DUMP &amp; ARRANGE</span>
            <h2 className="ls-h2">Every idea gets a pin. The good ones grow.</h2>
            <p className="ls-p">Pin a thought the second you have it. Tie related notes together with thread, and watch the pile grow from a seed into a tree: your question, your points, and what you made from them.</p>
          </div>
          <div className="ls-wall" aria-hidden="true">
            <span className="ls-slip" style={{ left: "8%", top: "18%", width: "34%", height: 64, background: "#f6e27a", transform: "rotate(-2deg)" }}>Jump the first loose pass</span>
            <span className="ls-slip" style={{ left: "14%", top: "48%", width: "30%", height: 58, background: "#faf6ec", transform: "rotate(1deg)", fontSize: 15 }}>Gomes always plays across</span>
            <span className="ls-slip" style={{ left: "54%", top: "22%", width: "34%", height: 64, background: "#9fd4e8", transform: "rotate(2deg)" }}>Pedri free between the lines</span>
            <span className="ls-slip" style={{ left: "58%", top: "56%", width: "30%", height: 58, background: "#ee9ab8", transform: "rotate(-1deg)", fontSize: 15 }}>Thread: why it worked</span>
            <svg viewBox="0 0 560 320" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}><path d="M140 64 Q120 120 160 160" stroke="#b3261e" strokeWidth="2" fill="none" /></svg>
            <svg className="lp-sway" width="44" height="50" viewBox="0 0 30 34" style={{ position: "absolute", left: "40%", bottom: 14 }}><path d="M15 33 V12 M15 24 L8 18 M15 18 L22 12" stroke="#5e4e38" strokeWidth="2.5" fill="none" strokeLinecap="round" /><path d="M8 18 C4 18 2 15 3 12 C6 12 9 15 8 18 Z M22 12 C26 12 28 9 27 6 C24 6 21 9 22 12 Z M15 12 C11 10 11 6 15 3 C19 6 19 10 15 12 Z" fill="#4f7a1f" /></svg>
          </div>
        </section>

        <section className="ls-sec rev ls-rise">
          <div className="ls-cards" aria-hidden="true">
            <div className="ls-card" style={{ background: "#15161a", border: "1px solid rgba(255,255,255,.18)", transform: "rotate(-4deg)", color: "#f5f5f7" }}>
              <div style={{ left: "7%", right: "7%", top: "12%", height: "50%", background: "#a11d48" }} /><b style={{ left: "7%", bottom: "18%" }}>@YOURNAME</b><small style={{ left: "7%", bottom: "8%", color: "#a3a3ad" }}>STUDIO Nº 001</small>
            </div>
            <div className="ls-card" style={{ background: "#f4efe2", border: "8px solid #f4efe2", outline: "2px solid #1d5a2c", transform: "rotate(5deg)", color: "#1d5a2c" }}>
              <div style={{ left: "3%", right: "3%", top: "9%", height: "50%", background: "#1d5a2c", borderRadius: 8 }} /><b style={{ left: "4%", bottom: "16%" }}>@THEIRNAME</b><small style={{ left: "4%", bottom: "6%", color: "#3a3b40" }}>STUDIO Nº 214</small>
            </div>
          </div>
          <div className="ls-txt">
            <span className="ls-cap">05 · YOUR CARD</span>
            <h2 className="ls-h2">Your face. Your colours. Your number.</h2>
            <p className="ls-p">Every creator gets a studio number and a card with their own photo and tagline. It signs every export you make and it is the page people find you on.</p>
          </div>
        </section>

        <section className="ls-end ls-rise">
          <h2>YOUR STUDIO IS WAITING.</h2>
          <p className="ls-lead" style={{ maxWidth: 620 }}>Every tool, every format, every template, free. Open it, make your card, and post your first piece today.</p>
          <button className="ls-btn pri" style={{ height: 56, padding: "0 30px", fontSize: 17 }} onClick={start}>Open your studio</button>
        </section>
      </div>

      <footer className="ls-foot"><div className="ls-w"><span>PitchStudio, the football studio for creators</span><span>Free for every fan</span></div></footer>
      <div className="ls-sticky"><button className="ls-btn pri" onClick={start}>Open your studio, free</button></div>
    </main>
  )
}
