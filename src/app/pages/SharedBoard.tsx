import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { supabase } from "../lib/supabase"
import { Mark } from "../brand/Mark"
import { ACCENT_INK, ACCENT_SOLID, DS_BORDER, SURFACE_BASE, SURFACE_1, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* A shared board ("/b/:id"): open to anyone, signed in or not. It shows the picture its owner shared, the title, the notes and who made it.
   Remix copies the board into your own Library (signing up first if you have no studio yet). Only boards their owner shared are shown
   (get_shared_board returns nothing else). */

type Shared = { id: string; title: string; updated_at: string; handle: string | null; display_name: string | null; notes: string[] }

export default function SharedBoardPage() {
  const navigate = useNavigate()
  const { id = "" } = useParams()
  const [board, setBoard] = useState<Shared | null | "missing">(null)
  const [me, setMe] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")

  useEffect(() => {
    let off = false
    if (!/^[0-9a-f-]{36}$/i.test(id)) { setBoard("missing"); return }
    supabase.auth.getSession().then(({ data }) => { if (!off) setMe(data.session?.user.id ?? null) })
    ;(supabase as any).rpc("get_shared_board", { b: id }).then(({ data, error }: { data: any[] | null; error: unknown }) => {
      if (off) return
      const row = !error && Array.isArray(data) ? data[0] : null
      if (!row) { setBoard("missing"); return }
      const notes = Array.isArray(row.notes) ? row.notes.filter((x: unknown) => typeof x === "string" && x.trim()).slice(0, 4) : []
      setBoard({ id: row.id, title: String(row.title || "A board"), updated_at: row.updated_at, handle: row.handle ?? null, display_name: row.display_name ?? null, notes })
      document.title = `${row.title || "A board"}${row.handle ? ` · @${row.handle}` : ""} · PitchStudio`
    })
    return () => { off = true; document.title = "PitchStudio" }
  }, [id])

  /** Remix: a copy of the board in your own Library, opened straight away */
  const remix = async () => {
    if (!board || board === "missing") return
    if (!me) { navigate("/signup"); return }
    setBusy(true); setNote("")
    try {
      const { data: src, error } = await (supabase as any).from("boards").select("canvas_data, narrative, title").eq("id", board.id).single()
      if (error || !src) throw error ?? new Error("not found")
      const cd = src.canvas_data && typeof src.canvas_data === "object" && src.canvas_data.settings ? { ...src.canvas_data, settings: { ...src.canvas_data.settings, issueNo: 0, issueDay: "" } } : src.canvas_data
      const title = `Remix · ${String(src.title || "Board")}`.slice(0, 80)
      const res = await (supabase as any).from("boards").insert({ user_id: me, title, canvas_data: cd, narrative: src.narrative ?? "" }).select("id").single()
      if (res.error || !res.data?.id) throw res.error ?? new Error("no id")
      ;(window as any).posthog?.capture("board_remixed")
      navigate(`/board?open=${res.data.id}`)
    } catch {
      setNote("Couldn't make your copy. Try again.")
      setBusy(false)
    }
  }

  const pic = board && board !== "missing" ? `${supabase.storage.from("board-shares").getPublicUrl(`${board.id}.jpg`).data.publicUrl}?v=${encodeURIComponent(board.updated_at ?? "")}` : ""
  return (
    <div className="sb" style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .sb * { box-sizing: border-box; }
        .sb-top { height: 60px; display: flex; align-items: center; gap: 10px; padding: 0 28px; border-bottom: 1px solid ${DS_BORDER}; }
        .sb-home { display: flex; align-items: center; gap: 10px; cursor: pointer; background: none; border: 0; color: inherit; padding: 0; }
        .sb-home span { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; letter-spacing: .2em; font-weight: 600; }
        .sb-wrap { max-width: 1120px; margin: 0 auto; padding: 28px 28px 80px; }
        .sb-pic { max-width: 100%; max-height: calc(100vh - 250px); margin: 0 auto; object-fit: contain; border-radius: 14px; border: 1px solid ${DS_BORDER}; display: block; background: ${SURFACE_1}; box-shadow: 0 30px 60px -30px rgba(0,0,0,.6); }
        .sb-row { display: flex; align-items: flex-start; gap: 24px; margin-top: 24px; flex-wrap: wrap; }
        .sb h1 { font-family: Anton, 'Barlow Condensed', sans-serif; font-weight: 400; font-size: 40px; line-height: 1.05; margin: 0 0 8px; letter-spacing: .01em; }
        .sb-by { font-size: 14px; color: ${TEXT_MUTED}; margin: 0; }
        .sb-by button { background: none; border: 0; padding: 0; color: ${TEXT_PRIMARY}; font: 600 14px 'Inter', sans-serif; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
        .sb-notes { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .sb-notes li { font-size: 15px; line-height: 1.5; } .sb-notes b { color: ${ACCENT_SOLID}; font: 700 12px 'JetBrains Mono', monospace; margin-right: 10px; }
        .sb-cta { display: inline-flex; align-items: center; gap: 8px; height: 50px; padding: 0 26px; border-radius: 999px; border: none; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 700 15px 'Inter', sans-serif; cursor: pointer; }
        .sb-cta:disabled { opacity: .6; cursor: default; }
        .sb-side { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .sb-side p { margin: 0; font-size: 12.5px; color: ${TEXT_MUTED}; max-width: 260px; text-align: right; }
        .sb-none { max-width: 520px; margin: 18vh auto 0; text-align: center; padding: 0 24px; }
        .sb-none button { background: none; border: none; color: ${TEXT_PRIMARY}; text-decoration: underline; text-underline-offset: 4px; font: 600 15px 'Inter', sans-serif; cursor: pointer; }
        @media (max-width: 720px) { .sb-wrap { padding: 18px 16px 60px; } .sb h1 { font-size: 30px; } .sb-side { margin-left: 0; align-items: flex-start; } .sb-side p { text-align: left; } }
      `}</style>
      <div className="sb-top">
        <button className="sb-home" onClick={() => navigate("/")} aria-label="PitchStudio home"><Mark size={26} color={ACCENT_SOLID} /><span>PITCHSTUDIO</span></button>
      </div>
      {board === null ? null : board === "missing" ? (
        <div className="sb-none">
          <h2 style={{ margin: "0 0 14px", fontSize: 26 }}>This board isn't shared.</h2>
          <p style={{ margin: "0 0 18px", opacity: .7 }}>Its owner may have stopped sharing it, or the link may be wrong.</p>
          <button onClick={() => navigate("/")}>Go to PitchStudio</button>
        </div>
      ) : (
        <div className="sb-wrap">
          <img className="sb-pic" src={pic} alt={board.title} />
          <div className="sb-row">
            <div style={{ minWidth: 0, flex: "1 1 420px" }}>
              <h1>{board.title}</h1>
              {board.handle && <p className="sb-by">Made by <button onClick={() => navigate(`/c/${board.handle}`)}>@{board.handle}</button> with PitchStudio</p>}
              {board.notes.length > 0 && <ol className="sb-notes">{board.notes.map((n, i) => <li key={i}><b>{String(i + 1).padStart(2, "0")}</b>{n}</li>)}</ol>}
            </div>
            <div className="sb-side">
              <button className="sb-cta" onClick={remix} disabled={busy}>{busy ? "Making your copy…" : me ? "Remix this board" : "Sign up free to remix"}</button>
              <p>{me ? "A copy goes into your Library. The original stays as it is." : "Your own studio, free: make boards like this and remix any shared one."}</p>
              {note && <p role="alert" style={{ color: "#f87171" }}>{note}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
