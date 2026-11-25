import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { supabase } from "../lib/supabase"
import { Mark } from "../brand/Mark"
import { matchLine, readMatch, type Match } from "../analysis/items"
import { remix, sharedPic, type SharePack } from "../analysis/share"
import { ACCENT_INK, ACCENT_SOLID, DS_BORDER, SURFACE_BASE, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* A shared Live Analysis folder ("/a/:id"): open to anyone, signed in or not. The rendered Game Shots with their notes,
   who made it, and Remix, which copies every Game Shot (marks and all) into your own Library. Only folders their owner
   shared are shown (get_shared_analysis returns nothing else). */

type Shared = { id: string; name: string; match: Match | null; pack: SharePack; handle: string | null }

export default function SharedAnalysisPage() {
  const navigate = useNavigate()
  const { id = "" } = useParams()
  const [page, setPage] = useState<Shared | null | "missing">(null)
  const [me, setMe] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  useEffect(() => {
    let off = false
    if (!/^[0-9a-f-]{36}$/i.test(id)) { setPage("missing"); return }
    supabase.auth.getSession().then(({ data }) => { if (!off) setMe(data.session?.user.id ?? null) })
    ;(supabase as any).rpc("get_shared_analysis", { f: id }).then(({ data, error }: { data: any[] | null; error: unknown }) => {
      if (off) return
      const row = !error && Array.isArray(data) ? data[0] : null
      const items = Array.isArray(row?.share?.items) ? row.share.items.filter((x: any) => x && typeof x.img === "string" && typeof x.raw === "string" && x.img.startsWith(id + "/")) : []
      if (!row || !items.length) { setPage("missing"); return }
      setPage({ id: row.id, name: String(row.name || "A breakdown"), match: readMatch(row.match), pack: { at: String(row.share.at ?? ""), items }, handle: row.handle ?? null })
      document.title = `${row.name || "A breakdown"}${row.handle ? ` · @${row.handle}` : ""} · PitchStudio`
    })
    return () => { off = true; document.title = "PitchStudio" }
  }, [id])

  const doRemix = async () => {
    if (!page || page === "missing") return
    if (!me) { navigate("/signup"); return }
    setBusy(true); setNote("")
    try {
      const folder = await remix(me, page.name, page.match, page.pack)
      ;(window as any).posthog?.capture("analysis_remixed", { shots: page.pack.items.length })
      navigate(`/analysis?folder=${folder}`)
    } catch (e) { console.error(e); setNote("Couldn't make your copy. Try again."); setBusy(false) }
  }

  const line = page && page !== "missing" ? matchLine(page.match) : ""
  return (
    <div className="sa" style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .sa * { box-sizing: border-box; }
        .sa-top { height: 60px; display: flex; align-items: center; gap: 10px; padding: 0 28px; border-bottom: 1px solid ${DS_BORDER}; position: sticky; top: 0; background: ${SURFACE_BASE}; z-index: 2; }
        .sa-home { display: flex; align-items: center; gap: 10px; cursor: pointer; background: none; border: 0; color: inherit; padding: 0; }
        .sa-home span { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; letter-spacing: .2em; font-weight: 600; }
        .sa-wrap { max-width: 1040px; margin: 0 auto; padding: 32px 28px 90px; }
        .sa-k { font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: .28em; text-transform: uppercase; color: ${ACCENT_SOLID}; margin: 0 0 8px; }
        .sa h1 { font: 800 clamp(36px, 5vw, 56px)/1 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 0 0 10px; }
        .sa-by { font-size: 14px; color: ${TEXT_MUTED}; margin: 0; }
        .sa-by button { background: none; border: 0; padding: 0; color: ${TEXT_PRIMARY}; font: 600 14px 'Inter', sans-serif; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .sa-head { display: flex; align-items: flex-end; gap: 24px; flex-wrap: wrap; margin-bottom: 30px; }
        .sa-side { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .sa-side p { margin: 0; font-size: 12.5px; color: ${TEXT_MUTED}; max-width: 280px; text-align: right; }
        .sa-cta { display: inline-flex; align-items: center; gap: 8px; height: 50px; padding: 0 26px; border-radius: 999px; border: none; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 700 15px 'Inter', sans-serif; cursor: pointer; }
        .sa-cta:disabled { opacity: .6; cursor: default; }
        .sa-shot { margin: 0 0 44px; }
        .sa-shot img { width: 100%; border-radius: 14px; border: 1px solid ${DS_BORDER}; display: block; background: #000; }
        .sa-n { font: 800 15px 'Barlow Condensed', sans-serif; color: ${ACCENT_INK}; background: ${ACCENT_SOLID}; border-radius: 5px; padding: 2px 8px; margin-right: 10px; }
        .sa-shot h2 { font: 800 28px/1.05 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 16px 0 8px; display: flex; align-items: center; }
        .sa-shot p { font-size: 16px; line-height: 1.6; color: #d5d7dc; margin: 0; max-width: 760px; white-space: pre-wrap; }
        .sa-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; } .sa-stats span { font: 600 13px Inter; padding: 5px 10px; border-radius: 7px; background: rgba(255,255,255,.06); }
        .sa-none { max-width: 520px; margin: 18vh auto 0; text-align: center; padding: 0 24px; }
        .sa-none button { background: none; border: none; color: ${TEXT_PRIMARY}; text-decoration: underline; text-underline-offset: 4px; font: 600 15px 'Inter', sans-serif; cursor: pointer; }
        @media (max-width: 720px) { .sa-wrap { padding: 20px 16px 60px; } .sa-side { margin-left: 0; align-items: flex-start; } .sa-side p { text-align: left; } }
      `}</style>
      <div className="sa-top">
        <button className="sa-home" onClick={() => navigate("/")} aria-label="PitchStudio home"><Mark size={26} color={ACCENT_SOLID} /><span>PITCHSTUDIO</span></button>
      </div>
      {page === null ? null : page === "missing" ? (
        <div className="sa-none">
          <h2 style={{ margin: "0 0 14px", fontSize: 26 }}>This breakdown isn't shared.</h2>
          <p style={{ margin: "0 0 18px", opacity: .7 }}>Its owner may have stopped sharing it, or the link may be wrong.</p>
          <button onClick={() => navigate("/")}>Go to PitchStudio</button>
        </div>
      ) : (
        <div className="sa-wrap">
          <div className="sa-head">
            <div style={{ minWidth: 0, flex: "1 1 460px" }}>
              {line && <p className="sa-k">{line}</p>}
              <h1>{page.name}</h1>
              {page.handle && <p className="sa-by">A breakdown by <button onClick={() => navigate(`/c/${page.handle}`)}>@{page.handle}</button> · made with PitchStudio</p>}
            </div>
            <div className="sa-side">
              <button className="sa-cta" onClick={doRemix} disabled={busy}>{busy ? "Making your copy…" : me ? "Remix into your Library" : "Sign up free to remix"}</button>
              <p>{me ? `${page.pack.items.length} Game ${page.pack.items.length === 1 ? "Shot" : "Shots"}, marks and all, in a new folder. The original stays as it is.` : "Your own studio, free: break down matches like this and remix any shared one."}</p>
              {note && <p role="alert" style={{ color: "#f87171" }}>{note}</p>}
            </div>
          </div>
          {page.pack.items.map(it => (
            <section key={it.n} className="sa-shot">
              <img src={sharedPic(it.img)} alt={it.head || `Game Shot ${it.n}`} width={it.w} height={it.h} loading={it.n > 2 ? "lazy" : undefined} />
              {(it.head || page.pack.items.length > 1) && <h2>{page.pack.items.length > 1 && <span className="sa-n">{it.n}/{page.pack.items.length}</span>}{it.head}</h2>}
              {it.body && <p>{it.body}</p>}
              {it.stats?.length > 0 && <div className="sa-stats">{it.stats.map(s => <span key={s}>{s}</span>)}</div>}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
