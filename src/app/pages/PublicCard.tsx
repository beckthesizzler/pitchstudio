import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { supabase } from "../lib/supabase"
import { sinceLabel, studioLabel } from "../lib/studio"
import { IDENTITY_OPTIONS } from "../lib/account"
import { CreatorCard } from "../brand/CardArt"
import { Mark } from "../brand/Mark"
import { readBrand, type Brand } from "../brand/brand"
import { ACCENT_INK, ACCENT_SOLID, DS_BORDER, SURFACE_BASE, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* A creator's public card ("/c/:handle"): open to anyone, signed in or not. Only what the card shows is public
   (get_public_card returns nothing else), and only for someone whose studio is open. */

type Card = { handle: string; display_name: string | null; identity: string | null; bio: string | null; favorite_club: string | null; brand: Brand; studio_no: number; opened_at: string | null }

export default function PublicCardPage() {
  const navigate = useNavigate()
  const { handle: raw = "" } = useParams()
  const handle = raw.replace(/^@/, "").toLowerCase()
  const [card, setCard] = useState<Card | null | "missing">(null)
  const [tilt, setTilt] = useState<{ rx: number; ry: number; x: number; y: number } | null>(null)

  useEffect(() => {
    let off = false
    document.title = `@${handle} · PitchStudio`
    if (!/^[a-z0-9_]{1,30}$/.test(handle)) { setCard("missing"); return }
    ;(supabase as any).rpc("get_public_card", { h: handle }).then(({ data, error }: { data: any[] | null; error: unknown }) => {
      if (off) return
      const row = !error && Array.isArray(data) ? data[0] : null
      if (!row) { setCard("missing"); return }
      setCard({ handle: String(row.handle), display_name: row.display_name ?? null, identity: row.identity ?? null, bio: row.bio ?? null, favorite_club: row.favorite_club ?? null,
        brand: readBrand(row.brand), studio_no: Number(row.studio_no), opened_at: row.opened_at ?? null })
    })
    return () => { off = true; document.title = "PitchStudio" }
  }, [handle])

  const still = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const role = card && card !== "missing" ? IDENTITY_OPTIONS.find(o => o.value === card.identity)?.label : undefined
  return (
    <div className="pc" style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .pc * { box-sizing: border-box; }
        .pc-top { height: 60px; display: flex; align-items: center; gap: 10px; padding: 0 28px; border-bottom: 1px solid ${DS_BORDER}; cursor: pointer; }
        .pc-top span { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; letter-spacing: .2em; font-weight: 600; }
        .pc-wrap { max-width: 1040px; margin: 0 auto; padding: 48px 28px 80px; display: grid; grid-template-columns: minmax(0, 440px) minmax(0, 1fr); gap: 56px; align-items: center; }
        .pc-3d { perspective: 1100px; } .pc-3d > div { transition: transform .35s cubic-bezier(.2,.8,.2,1); filter: drop-shadow(0 30px 40px rgba(0,0,0,.45)); }
        .pc-cap { font: 700 12px 'JetBrains Mono', monospace; letter-spacing: .16em; color: ${TEXT_MUTED}; margin: 0 0 10px; }
        .pc h1 { font-family: Anton, 'Barlow Condensed', sans-serif; font-weight: 400; font-size: 64px; line-height: 1; margin: 0 0 12px; letter-spacing: .01em; word-break: break-word; }
        .pc-tag { font: italic 22px/1.4 Georgia, serif; margin: 0 0 22px; }
        .pc-facts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; } .pc-facts span { border: 1px solid ${DS_BORDER}; border-radius: 999px; padding: 6px 14px; font-size: 13px; }
        .pc-bio { color: ${TEXT_MUTED}; font-size: 15px; line-height: 1.6; margin: 0 0 30px; white-space: pre-wrap; }
        .pc-cta { display: inline-flex; align-items: center; height: 50px; padding: 0 26px; border-radius: 999px; border: none; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 700 15px 'Inter', sans-serif; cursor: pointer; }
        .pc-none { max-width: 520px; margin: 18vh auto 0; text-align: center; padding: 0 24px; }
        .pc-none button { background: none; border: none; color: ${TEXT_PRIMARY}; text-decoration: underline; text-underline-offset: 4px; font: 600 15px 'Inter', sans-serif; cursor: pointer; }
        @media (max-width: 820px) { .pc-wrap { grid-template-columns: 1fr; gap: 30px; padding: 24px 20px 60px; } .pc h1 { font-size: 46px; } }
      `}</style>
      <div className="pc-top" onClick={() => navigate("/")} role="link" aria-label="PitchStudio home"><Mark size={26} color={ACCENT_SOLID} /><span>PITCHSTUDIO</span></div>
      {card === null ? null : card === "missing" ? (
        <div className="pc-none"><h2 style={{ margin: "0 0 14px", fontSize: 26 }}>No studio by that name.</h2><button onClick={() => navigate("/")}>Go to PitchStudio</button></div>
      ) : (
        <div className="pc-wrap">
          <div className="pc-3d" onPointerMove={e => { if (e.pointerType === "touch" || still) return; const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; setTilt({ ry: (x - 0.5) * 22, rx: (0.5 - y) * 18, x, y }) }} onPointerLeave={() => setTilt(null)}>
            <div style={{ transform: tilt ? `rotateX(${tilt.rx.toFixed(2)}deg) rotateY(${tilt.ry.toFixed(2)}deg)` : "none" }}>
              <CreatorCard brand={card.brand} handle={card.handle} name={card.display_name ?? ""} since={sinceLabel(card.opened_at)} logo={card.brand.logo} photo={card.brand.photo}
                studio={card.studio_no} title={role ?? card.brand.title} sheen={tilt ? { x: tilt.x, y: tilt.y } : null} />
            </div>
          </div>
          <div>
            <p className="pc-cap">STUDIO {studioLabel(card.studio_no).toUpperCase()}{card.opened_at ? ` · ${sinceLabel(card.opened_at).toUpperCase()}` : ""}</p>
            <h1>@{card.handle.toUpperCase()}</h1>
            {card.brand.motto && <p className="pc-tag">“{card.brand.motto}”</p>}
            <div className="pc-facts">{role && <span>{role}</span>}{card.favorite_club && <span>{card.favorite_club}</span>}</div>
            {card.bio && <p className="pc-bio">{card.bio}</p>}
            <button className="pc-cta" onClick={() => navigate("/signup")}>Open your own studio, free</button>
          </div>
        </div>
      )}
    </div>
  )
}
