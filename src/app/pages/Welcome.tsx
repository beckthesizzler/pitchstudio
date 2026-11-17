import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowRight } from "lucide-react"
import { supabase } from "../lib/supabase"
import { IDENTITY_OPTIONS, normalizeHandle, stripHandleSuffix } from "../lib/account"
import { openStudio, sinceLabel, studioLabel } from "../lib/studio"
import { CreatorCard } from "../brand/CardArt"
import { DEFAULT_BRAND, readBrand, type Brand } from "../brand/brand"
import { Mark } from "../brand/Mark"
import { ACCENT_INK, ACCENT_SOLID, ACCENT_TEXT, DS_BORDER, SURFACE_BASE, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

const SITE = "https://pitchstudio-brown.vercel.app"
/** Shown once per browser, the first time a new member reaches the studio */
export const welcomedKey = (uid: string) => `ps-welcomed-${uid}`

/* Step 3 of 3: the moment the studio opens. Your number, your card, and the way to your first post. */
export default function WelcomePage() {
  const navigate = useNavigate()
  const [me, setMe] = useState<{ id: string; handle: string; name: string; role: string; since: string; brand: Brand } | null>(null)
  const [studio, setStudio] = useState<number | null>(null)

  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user
      if (!u) { navigate("/", { replace: true }); return }
      try { localStorage.setItem(welcomedKey(u.id), "1") } catch { /* private mode: shown again next time, nothing breaks */ }
      const { data } = await supabase.from("profiles").select("display_name, handle, identity, brand, studio_no, opened_at").eq("id", u.id).maybeSingle()
      if (off) return
      const d = (data ?? {}) as any
      const raw: string = d.handle ?? "", stripped = raw ? stripHandleSuffix(raw, u.id, u.email) : ""
      const handle = raw && stripped === raw ? normalizeHandle(raw) : ""
      setMe({ id: u.id, handle, name: d.display_name || stripped || "You", role: IDENTITY_OPTIONS.find(o => o.value === d.identity)?.label ?? "", since: sinceLabel(d.opened_at ?? u.created_at), brand: d.brand ? readBrand(d.brand) : DEFAULT_BRAND })
      if (typeof d.studio_no === "number") setStudio(d.studio_no)
      else openStudio().then(n => { if (!off && n) setStudio(n) })
      ;(window as any).posthog?.capture("studio_opened")
    })
    return () => { off = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: string, what: string) => { (window as any).posthog?.capture("welcome_choice", { what }); navigate(to, { replace: true }) }
  const shareX = () => {
    const text = `My studio is open. PitchStudio ${studio ? studioLabel(studio) : ""}: tactics boards, match reports and ideas, all in one place, all free. ${SITE}/c/${me?.handle || ""}`
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text.replace(/\s+/g, " "))}`, "_blank", "noopener")
    ;(window as any).posthog?.capture("card_shared", { to: "x", from: "welcome" })
  }

  return (
    <div className="wl">
      <style>{`
        .wl { min-height: 100vh; min-height: 100dvh; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; display: flex; flex-direction: column; }
        .wl * { box-sizing: border-box; }
        .wl-top { display: flex; align-items: center; gap: 10px; padding: 20px 28px; font: 500 13px 'JetBrains Mono', monospace; letter-spacing: .22em; }
        .wl-main { flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 12px 28px 48px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 56px; align-items: center; }
        .wl-prog { display: flex; gap: 8px; margin-bottom: 16px; } .wl-prog i { flex: 1; height: 4px; border-radius: 2px; background: ${ACCENT_SOLID}; max-width: 90px; }
        .wl-cap { font: 500 12px 'JetBrains Mono', monospace; letter-spacing: .18em; color: ${ACCENT_TEXT}; }
        .wl h1 { margin: 10px 0 14px; font: 400 76px/0.98 Anton, 'Barlow Condensed', sans-serif; letter-spacing: .005em; }
        .wl-lead { margin: 0 0 30px; font-size: 18px; line-height: 1.55; color: ${TEXT_MUTED}; max-width: 460px; }
        .wl-lead b { color: ${TEXT_PRIMARY}; }
        .wl-acts { display: flex; flex-direction: column; gap: 10px; max-width: 420px; }
        .wl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 22px; border-radius: 999px; font: 700 16px 'Inter', sans-serif; cursor: pointer; border: 1px solid ${DS_BORDER}; background: transparent; color: ${TEXT_PRIMARY}; }
        .wl-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
        .wl-btn:hover { filter: brightness(1.06); }
        .wl-btn small { font-weight: 500; opacity: .7; }
        .wl-note { font-size: 13px; color: ${TEXT_MUTED}; margin-top: 6px; }
        .wl-card { display: flex; justify-content: center; perspective: 1100px; }
        .wl-card > div { width: min(100%, 380px); filter: drop-shadow(0 30px 40px rgba(0,0,0,.45)); animation: wlIn .9s cubic-bezier(.2,.9,.2,1) both .15s; }
        @keyframes wlIn { from { opacity: 0; transform: rotateY(-28deg) translateY(24px) scale(.92); } to { opacity: 1; transform: none; } }
        .wl-skip { background: none; border: none; color: ${TEXT_MUTED}; font: 500 14px 'Inter', sans-serif; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; min-height: 44px; align-self: flex-start; padding: 0; }
        @media (max-width: 860px) {
          .wl-main { grid-template-columns: 1fr; gap: 28px; padding: 4px 20px 40px; }
          .wl-card { order: -1; } .wl-card > div { width: min(58vw, 240px); }
          .wl h1 { font-size: 52px; } .wl-lead { font-size: 16px; margin-bottom: 22px; }
          .wl-acts { max-width: none; }
        }
        @media (prefers-reduced-motion: reduce) { .wl-card > div { animation: none; } }
      `}</style>
      <header className="wl-top"><Mark size={26} color={ACCENT_SOLID} />PITCHSTUDIO</header>
      {me && (
        <main className="wl-main">
          <div>
            <div className="wl-prog" aria-hidden="true"><i /><i /><i /></div>
            <span className="wl-cap">STEP 3 OF 3</span>
            <h1>YOUR STUDIO<br />IS OPEN.</h1>
            <p className="wl-lead">You're <b>Studio {studio ? studioLabel(studio) : "Nº …"}</b>. Every tool is yours and free, and this card signs everything you make. Your first post is a line-up away.</p>
            <div className="wl-acts">
              <button className="wl-btn pri" onClick={() => go("/board?start=lineup", "first_post")}>Make your first post <ArrowRight size={17} /></button>
              <button className="wl-btn" onClick={() => go("/profile?welcome=1", "card")}>Make the card yours <small>· photo, colours</small></button>
              {me.handle && <button className="wl-btn" onClick={shareX}>Share that you're in</button>}
              <button className="wl-skip" onClick={() => go("/", "home")}>Look around first</button>
            </div>
          </div>
          <div className="wl-card">
            <div><CreatorCard brand={me.brand} handle={me.handle} name={me.name} since={me.since} logo={null} photo={null} studio={studio} title={me.role || me.brand.title} /></div>
          </div>
        </main>
      )}
    </div>
  )
}
