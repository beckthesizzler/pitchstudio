import { Suspense, lazy, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Mark } from "../brand/Mark"
import { TEXT_PRIMARY, SURFACE_BASE, ACCENT_SOLID } from "../theme"
import { LANDING_CSS } from "./landingCss"
import { projectId } from "../../../utils/supabase/info"

/* The first page a visitor sees: one screen to say it, five tiles to show it, one line to close. Everything is drawn with code
   (no pictures to load). The report in the DESIGN tile is drawn by the real report engine, loaded only when it comes near. */
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

/* Short films of the real app, kept with the welcome tour: the hero cycles through finished pieces, each tool shows how a piece starts and ends */
const MEDIA = `https://${projectId}.supabase.co/storage/v1/object/public/welcome-video/`
/** A silent looping clip that plays only while it's on screen. With reduced motion it stays on its last frame, the finished piece.
 *  If it can't load, onFail lets the page show the drawing it had before. */
function Clip({ name, eager, onFail }: { name: string; eager?: boolean; onFail: () => void }) {
  const v = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = v.current
    if (!el || typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause() }), { threshold: 0.3 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <video ref={v} className="ls-clip" src={MEDIA + `landing-${name}.mp4`} poster={MEDIA + `landing-${name}.jpg`} muted loop playsInline
    preload={eager ? "auto" : "none"} onError={onFail} aria-hidden="true" />
}

/* the five tools, each one verb and one line */
const TOOLS = [
  { id: "create", verb: "CREATE", line: <>Drop the XI. <b>Draw the move.</b> Post it anywhere.</>, wide: true },
  { id: "import", verb: "IMPORT", line: <>Drop in the shot. <b>Mark what mattered.</b></> },
  { id: "design", verb: "DESIGN", line: <>Your matchday, <b>on one page.</b></> },
  { id: "dump", verb: "DUMP", line: <>Pin every thought. <b>Start from a ready-made wall.</b></> },
  { id: "sign", verb: "SIGN", line: <>Your name <b>on everything</b> you make.</> },
] as const
const jump = (id: string) => document.getElementById("t-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" })

function Visual({ id, near }: { id: string; near: boolean }) {
  if (id === "create") return (
    <>
      <div className="ls-frames">
        <div className="ls-fr on"><b>STEP 1</b><i style={{ left: "28%", top: "62%" }} /><i style={{ left: "52%", top: "44%" }} /></div>
        <div className="ls-fr"><b>STEP 2</b><i style={{ left: "48%", top: "40%" }} /><i style={{ left: "44%", top: "18%" }} /></div>
        <div className="ls-fr"><b>STEP 3</b><i style={{ left: "70%", top: "30%" }} /><i className="blue" style={{ left: "40%", top: "14%" }} /></div>
      </div>
    </>
  )
  if (id === "import") return (
    <div className="ls-shot">
      <span className="ls-min">63'</span>
      <span className="ls-ring" style={{ left: "38%", top: "70%" }} />
      <span className="ls-sig" style={{ left: "38%", top: "60%" }}><s /><span>PEDRI</span></span>
      <span className="ls-ring" style={{ left: "70%", top: "40%" }} />
      <span className="ls-sig" style={{ left: "70%", top: "30%" }}><s style={{ background: "#1f4ba0" }} /><span>YAMAL</span></span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}><path d="M38 70 C 50 55 60 48 70 40" stroke="#d7ff3c" strokeWidth="1.2" strokeDasharray="2.4 2" fill="none" vectorEffect="non-scaling-stroke" /></svg>
    </div>
  )
  if (id === "design") return <div className="ls-tpl">{near && <Suspense fallback={null}><TemplateThumb id="game" /></Suspense>}</div>
  if (id === "dump") return (
    <div className="ls-wall">
      <span className="ls-slip" style={{ left: "8%", top: "14%", width: "40%", height: 58, background: "#f6e27a", transform: "rotate(-2deg)" }}>Jump the first loose pass</span>
      <span className="ls-slip" style={{ left: "12%", top: "52%", width: "36%", height: 54, background: "#faf6ec", transform: "rotate(1deg)" }}>Gomes always plays across</span>
      <span className="ls-slip" style={{ left: "54%", top: "20%", width: "38%", height: 58, background: "#9fd4e8", transform: "rotate(2deg)" }}>Pedri between the lines</span>
      <span className="ls-slip" style={{ left: "56%", top: "58%", width: "34%", height: 54, background: "#ee9ab8", transform: "rotate(-1deg)" }}>Why it worked</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}><path d="M28 34 Q 22 44 30 52" stroke="#b3261e" strokeWidth="1.4" fill="none" vectorEffect="non-scaling-stroke" /></svg>
    </div>
  )
  return (
    <div className="ls-cards">
      <div className="ls-card" style={{ left: "8%", top: "4%", background: "#15161a", border: "1px solid rgba(255,255,255,.18)", transform: "rotate(-5deg)", color: "#f5f5f7" }}>
        <div className="face" /><b style={{ left: "9%", bottom: "17%" }}>@YOURNAME</b><small style={{ left: "9%", bottom: "8%", color: "#a3a3ad" }}>STUDIO Nº 001</small>
      </div>
      <div className="ls-card" style={{ right: "6%", top: "12%", background: "#f4efe2", border: "6px solid #f4efe2", outline: "2px solid #a11d48", transform: "rotate(5deg)", color: "#a11d48" }}>
        <div className="face" style={{ background: "#a11d48" }} /><b style={{ left: "8%", bottom: "16%" }}>@THEIRNAME</b><small style={{ left: "8%", bottom: "7%", color: "#3a3b40" }}>STUDIO Nº 214</small>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const kick = useKickTo()
  const start = (e: React.MouseEvent<HTMLElement>) => kick("/signup", e.currentTarget)
  const signIn = () => kick("/signin", null)
  const [near, setNear] = useState(false) // the DESIGN tile is close: draw its report
  const [noClip, setNoClip] = useState<Record<string, boolean>>({}) // clips that couldn't load: their drawing shows instead
  const lost = (name: string) => () => setNoClip(x => ({ ...x, [name]: true }))
  const [shown, setShown] = useState<Record<string, boolean>>({ hero: true }) // a big button is on screen: the phone's sticky one stays away
  const cta = useRef<HTMLButtonElement>(null), endCta = useRef<HTMLButtonElement>(null)
  const heroCta = Object.values(shown).some(Boolean)

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") { setNear(true); return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: "600px 0px" })
    const t = document.getElementById("t-design"); if (t) io.observe(t)
    const io2 = new IntersectionObserver(es => setShown(s => { const n = { ...s }; es.forEach(e => { n[e.target === cta.current ? "hero" : "end"] = e.isIntersecting }); return n }))
    if (cta.current) io2.observe(cta.current)
    if (endCta.current) io2.observe(endCta.current)
    return () => { io.disconnect(); io2.disconnect() }
  }, [])

  return (
    <main className="ls" style={{ background: SURFACE_BASE, color: TEXT_PRIMARY, minHeight: "100vh", fontFamily: "'Inter', sans-serif", overflowX: "hidden" }}>
      <style>{LANDING_CSS}</style>
      <div className="ls-w">
        <nav className="ls-nav" aria-label="PitchStudio">
          <button className="ls-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="PitchStudio, back to the top"><Mark size={30} color={ACCENT_SOLID} /><span>PITCHSTUDIO</span></button>
          <button className="ls-in" onClick={signIn}>Sign in</button>
        </nav>

        <header className="ls-hero">
          <span className="ls-cap">THE FOOTBALL STUDIO</span>
          <h1 className="ls-h1">ENABLE YOUR<br /><em>CREATIVITY.</em></h1>
          <p className="ls-lead">Where your genius comes to life. Free, forever.</p>
          <button ref={cta} className="ls-btn pri" onClick={start}>Open your studio</button>
          <nav className="ls-verbs" aria-label="The tools">
            {TOOLS.map((t, i) => <button key={t.id} onClick={() => jump(t.id)}><b>0{i + 1}</b>{t.verb}</button>)}
          </nav>
          <div className="ls-stage">
            {!noClip.hero ? <Clip name="hero" eager onFail={lost("hero")} /> : <>
            <svg viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A tactics board playing a move: three players rotate and the ball moves between them">
              <rect x="0" y="0" width="480" height="270" fill="#1d5a2c" />
              <path d="M0 0 h60 v270 h-60 Z M120 0 h60 v270 h-60 Z M240 0 h60 v270 h-60 Z M360 0 h60 v270 h-60 Z" fill="#20622f" />
              <rect x="14" y="14" width="452" height="242" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.6" />
              <line x1="240" y1="14" x2="240" y2="256" stroke="rgba(255,255,255,.6)" strokeWidth="1.6" />
              <circle cx="240" cy="135" r="34" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.6" />
              <rect x="390" y="75" width="76" height="120" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.6" />
              <rect x="14" y="75" width="76" height="120" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="1.6" />
              <path className="lp-dash" d="M170 200 C 220 170 260 150 290 130" stroke="#d7ff3c" strokeWidth="2.4" fill="none" />
              <path className="lp-dash" d="M290 130 C 300 95 280 70 230 40" stroke="#d7ff3c" strokeWidth="2.4" fill="none" />
              <polygon points="300,52 400,52 420,124 320,132" fill="rgba(215,255,60,.16)" stroke="#d7ff3c" strokeWidth="1.2" strokeDasharray="4 4" />
              {[[330, 104], [360, 166], [300, 204]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="8" fill="#e9f0ff" stroke="#121316" strokeWidth="1.4" />)}
              <g className="lp-a"><circle cx="170" cy="200" r="9" fill="#a11d48" stroke="#fff" strokeWidth="1.8" /></g>
              <g className="lp-b"><circle cx="290" cy="130" r="9" fill="#a11d48" stroke="#fff" strokeWidth="1.8" /></g>
              <g className="lp-c"><circle cx="230" cy="40" r="9" fill="#1f4ba0" stroke="#fff" strokeWidth="1.8" /></g>
              <g className="lp-ball"><circle cx="172" cy="214" r="4" fill="#fff" stroke="#121316" strokeWidth="1.3" /></g>
            </svg>
            <span className="ls-tag" style={{ right: 14, bottom: 14 }}>@yourname <i>made with PitchStudio</i></span>
            </>}
          </div>
        </header>

        <section className="ls-bento" aria-label="Five tools, all free">
          {TOOLS.map((t, i) => (
            <button key={t.id} id={"t-" + t.id} className={`ls-tile${"wide" in t && t.wide ? " wide" : ""}`} onClick={start} aria-label={`${t.verb}. Open your studio`}>
              <span className="ls-tt"><span className="n">0{i + 1}</span>
              <h2>{t.verb}<i>.</i></h2>
              <p>{t.line}</p></span>
              {noClip[t.id] ? <div className="ls-vis" aria-hidden="true"><Visual id={t.id} near={near} /></div>
                : <div className="ls-film"><Clip name={t.id} onFail={lost(t.id)} /></div>}
            </button>
          ))}
        </section>

        <section className="ls-end">
          <h2>FREE.<br /><em>ALL OF IT.</em></h2>
          <p>No card. No trial. Every tool, day one.</p>
          <button ref={endCta} className="ls-btn pri" onClick={start}>Open your studio</button>
        </section>
      </div>

      <footer className="ls-foot"><div className="ls-w"><span>PitchStudio · The football studio</span><span>Enable your creativity.</span></div></footer>
      <div className={`ls-sticky${heroCta ? " off" : ""}`} aria-hidden={heroCta}><button className="ls-btn pri" onClick={start} tabIndex={heroCta ? -1 : 0}>Open your studio</button></div>
    </main>
  )
}
