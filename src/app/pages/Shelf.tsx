import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, ArrowRight, FileText, GripVertical, Image as ImageIcon, LayoutDashboard, Search, Sprout, X } from "lucide-react"
import { supabase } from "../lib/supabase"
import { stripHandleSuffix } from "../lib/account"
import { relTime } from "../lib/time"
import { listName } from "../lib/names"
import { issueLabel } from "../lib/issues"
import { reportError, track } from "../lib/telemetry"
import { Mark as PSMark } from "../brand/Mark"
import { readBrand, DEFAULT_BRAND, type Brand } from "../brand/brand"
import { ReportView } from "../report/Draw"
import { readReport } from "../report/model"
import { downloadShot } from "../analysis/model"
import { DropThumb, BOARD_CARD_COLS, boardCardOf } from "../App"
import { ACCENT_SOLID, ACCENT_INK, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER } from "../theme"

/* The shelf ("/shelf"): everything you've made in one private place — boards, analyses, reports and Brain Dump trees —
   each with its name, its issue number once it has one, and a picture of it. You put them in the order you want
   (drag a card, or use the arrows), and the order is kept in your account. Nobody else sees it. */

type Kind = "board" | "analysis" | "report" | "tree"
type Piece = { key: string; kind: Kind; id: string; name: string; no: number; updated: string; thumb: React.ReactNode; href: string }
const KINDS: { id: Kind | "all"; label: string }[] = [{ id: "all", label: "Everything" }, { id: "board", label: "Boards" }, { id: "analysis", label: "Analyses" }, { id: "report", label: "Reports" }, { id: "tree", label: "Trees" }]
const KIND_NAME: Record<Kind, string> = { board: "Board", analysis: "Analysis", report: "Report", tree: "Tree" }
const KIND_ICON: Record<Kind, React.ReactNode> = { board: <LayoutDashboard size={12} />, analysis: <ImageIcon size={12} />, report: <FileText size={12} />, tree: <Sprout size={12} /> }
const TREE_COLORS: Record<string, string> = { yellow: "#f7e36a", pink: "#f58cb4", peach: "#f9b27e", orange: "#f6a04a", lime: "#c8e86c", aqua: "#88dde0", teal: "#5ec6cb", lilac: "#c6b6fb" }

/** A small drawing of a Brain Dump tree: its roof and the first ideas hanging under it */
function TreeThumb({ name, color, ideas }: { name: string; color: string; ideas: string[] }) {
  const c = TREE_COLORS[color] ?? TREE_COLORS.lime, shown = ideas.slice(0, 4), n = Math.max(1, shown.length)
  return (
    <svg viewBox="0 0 320 200" width="100%" height="100%" style={{ display: "block" }} aria-hidden="true">
      <rect width="320" height="200" fill="#16181d" />
      <rect x="70" y="24" width="180" height="36" rx="12" fill={c} />
      <text x={160} y={47} textAnchor="middle" fontSize={13} fontWeight={700} fontFamily="Inter, sans-serif" fill="#121316">{name.slice(0, 22)}</text>
      {shown.map((t, i) => {
        const x = 160 + (i - (n - 1) / 2) * 68
        return (
          <g key={i}>
            <path d={`M160,60 C160,92 ${x},88 ${x},116`} fill="none" stroke={c} strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" />
            <rect x={x - 28} y={116} width={56} height={50} rx={4} fill={c} fillOpacity={0.88} />
            <text x={x} y={146} textAnchor="middle" fontSize={9} fontFamily="Inter, sans-serif" fill="#1b1a17">{t.slice(0, 9)}</text>
          </g>
        )
      })}
      {!shown.length && <text x={160} y={136} textAnchor="middle" fontSize={12} fill="#8b9099" fontFamily="Inter, sans-serif">No ideas under it yet</text>}
    </svg>
  )
}

/** An analysis's first shot, fetched when the card is on screen */
function ShotThumb({ path }: { path: string | null }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { let off = false; if (path) downloadShot(path).then(d => { if (!off) setSrc(d) }); return () => { off = true } }, [path])
  return src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: TEXT_MUTED, background: "#16181d" }}><ImageIcon size={26} /></div>
}

export default function ShelfPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [who, setWho] = useState({ handle: "", name: "" })
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [pieces, setPieces] = useState<Piece[] | null>(null)
  const [order, setOrder] = useState<string[]>([]) // the keys in the order you chose
  const [kind, setKind] = useState<Kind | "all">("all")
  const [q, setQ] = useState("")
  const [toast, setToast] = useState("")
  const [drag, setDrag] = useState<{ key: string; over: string | null } | null>(null)
  const saveTimer = useRef(0)
  const press = useRef<{ key: string; x: number; y: number; on: boolean } | null>(null)

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2800); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user
      if (!u) { navigate("/", { replace: true }); return }
      setUser({ id: u.id, email: u.email ?? "" })
      const [prof, b, a, r, n] = await Promise.all([
        (supabase as any).from("profiles").select("handle, display_name, brand, shelf").eq("id", u.id).maybeSingle(),
        (supabase as any).from("boards").select(BOARD_CARD_COLS).eq("user_id", u.id).order("updated_at", { ascending: false }).limit(500),
        (supabase as any).from("analyses").select("id, title, updated_at, shots:data->shots").eq("user_id", u.id).order("updated_at", { ascending: false }).limit(500),
        (supabase as any).from("reports").select("id, title, updated_at, data").eq("user_id", u.id).order("updated_at", { ascending: false }).limit(500),
        (supabase as any).from("notes").select("id, kind, parent_id, title, color, pos, updated_at").eq("user_id", u.id).limit(2000),
      ])
      if (off) return
      // without the shelf column (or the profile) the shelf still opens, in the order things were last changed
      const p = prof.data ?? (await (supabase as any).from("profiles").select("handle, display_name, brand").eq("id", u.id).maybeSingle()).data
      const h: string = p?.handle || ""
      setWho({ handle: h && stripHandleSuffix(h, u.id, u.email) === h ? h : "", name: stripHandleSuffix(p?.display_name || h || "", u.id, u.email) })
      const br = readBrand(p?.brand); setBrand(br)
      const out: Piece[] = []
      for (const row of b.data ?? []) {
        const c = boardCardOf(row), no = Number(row.settings?.issueNo) || 0
        out.push({ key: "board:" + c.id, kind: "board", id: c.id, name: c.title, no, updated: c.updated_at, href: `/board?open=${c.id}`, thumb: <DropThumb data={c.thumb} /> })
      }
      for (const row of a.data ?? []) {
        const first = Array.isArray(row.shots) ? row.shots.find((s: any) => s && typeof s.path === "string") : null
        out.push({ key: "analysis:" + row.id, kind: "analysis", id: row.id, name: listName("Analysis", row.title, row.updated_at), no: 0, updated: row.updated_at, href: `/analysis?open=${row.id}`, thumb: <ShotThumb path={first?.path ?? null} /> })
      }
      for (const row of r.data ?? []) {
        const rep = readReport(row.data, u.id), no = Number(row.data?.issueNo) || 0
        out.push({ key: "report:" + row.id, kind: "report", id: row.id, name: listName("Report", row.title, row.updated_at), no, updated: row.updated_at, href: `/report?open=${row.id}`,
          thumb: <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", background: "#16181d", pointerEvents: "none" }}><ReportView report={rep} brand={br} handle={h} logo={null} media={{}} width="auto" /></div> })
      }
      const notes: any[] = n.error ? [] : n.data ?? []
      for (const t of notes.filter(x => x.kind === "tree" && !x.parent_id)) {
        const kids = notes.filter(x => x.parent_id === t.id).sort((x, y) => x.pos - y.pos)
        const latest = [t, ...kids].map(x => x.updated_at).sort().pop() ?? t.updated_at
        out.push({ key: "tree:" + t.id, kind: "tree", id: t.id, name: t.title?.trim() || "Name this tree", no: 0, updated: latest, href: `/braindump?tree=${t.id}`, thumb: <TreeThumb name={t.title?.trim() || "Name this tree"} color={t.color} ideas={kids.map(k => k.title || "Idea")} /> })
      }
      const saved: string[] = Array.isArray(prof.data?.shelf) ? prof.data.shelf.filter((k: unknown) => typeof k === "string") : []
      setOrder(saved)
      setPieces(out)
    }).catch(e => { reportError(e, "shelf_load"); setPieces([]); setToast("Your shelf didn't load. Try again.") })
    return () => { off = true }
  }, [navigate])

  /* ── the order: yours first, and anything new since goes at the front, newest first ── */
  const ordered = useMemo(() => {
    if (!pieces) return []
    const at = new Map(order.map((k, i) => [k, i]))
    const fresh = pieces.filter(p => !at.has(p.key)).sort((a, b) => (a.updated < b.updated ? 1 : -1))
    const placed = pieces.filter(p => at.has(p.key)).sort((a, b) => at.get(a.key)! - at.get(b.key)!)
    return [...fresh, ...placed]
  }, [pieces, order])
  const term = q.trim().toLowerCase()
  const shown = ordered.filter(p => (kind === "all" || p.kind === kind) && (!term || p.name.toLowerCase().includes(term)))
  const canMove = kind === "all" && !term // the order is one list: it's changed with everything in view

  const saveOrder = (keys: string[]) => {
    setOrder(keys)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      if (!user) return
      const { error } = await (supabase as any).from("profiles").update({ shelf: keys }).eq("id", user.id)
      if (error) { reportError(error, "shelf_order"); setToast("Your new order didn't save. Try again.") } else track("shelf_reordered")
    }, 500)
  }
  const move = (key: string, to: number) => {
    const keys = ordered.map(p => p.key), from = keys.indexOf(key)
    if (from < 0 || to < 0 || to >= keys.length || to === from) return
    keys.splice(from, 1); keys.splice(to, 0, key)
    saveOrder(keys)
  }

  /* ── dragging a card (mouse or pen); on a phone, the arrows do it ── */
  useEffect(() => {
    const over = (x: number, y: number) => ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-piece]") as HTMLElement | null)?.dataset.piece ?? null
    const mv = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.on && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return
      p.on = true
      setDrag({ key: p.key, over: over(e.clientX, e.clientY) })
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      press.current = null
      if (!p) return
      if (!p.on) { const it = ordered.find(x => x.key === p.key); if (it) navigate(it.href); return }
      setDrag(null)
      const t = over(e.clientX, e.clientY)
      if (t && t !== p.key) move(p.key, ordered.findIndex(x => x.key === t))
    }
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up) }
  })

  const counts = (k: Kind) => (pieces ?? []).filter(p => p.kind === k).length
  const total = pieces?.length ?? 0
  return (
    <div className="sh" style={{ minHeight: "100vh", background: SURFACE_BASE, color: TEXT_PRIMARY, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .sh * { box-sizing: border-box; }
        .sh-top { height: 60px; display: flex; align-items: center; gap: 12px; padding: 0 24px; border-bottom: 1px solid ${DS_BORDER}; }
        .sh-icon { width: 36px; height: 36px; border-radius: 10px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
        .sh-icon:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        .sh-wrap { max-width: 1240px; margin: 0 auto; padding: 40px 28px 80px; }
        .sh-kick { font: 600 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; color: ${ACCENT_SOLID}; }
        .sh-h1 { margin: 10px 0 0; font: 800 54px/1 'Barlow Condensed', sans-serif; letter-spacing: .01em; text-transform: uppercase; }
        .sh-sub { margin: 12px 0 0; max-width: 640px; color: ${TEXT_MUTED}; font-size: 15px; line-height: 1.55; }
        .sh-tally { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
        .sh-tally span { font-size: 12.5px; padding: 6px 11px; border-radius: 999px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; }
        .sh-tally b { color: ${TEXT_PRIMARY}; font-weight: 700; margin-right: 4px; }
        .sh-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 30px 0 18px; }
        .sh-seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; }
        .sh-seg button { height: 34px; padding: 0 14px; border-radius: 9px; border: none; background: none; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
        .sh-seg button[aria-pressed="true"] { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        .sh-search { margin-left: auto; display: flex; align-items: center; gap: 8px; height: 40px; width: min(320px, 100%); padding: 0 12px; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; }
        .sh-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; }
        .sh-hint { font-size: 12.5px; color: ${TEXT_MUTED}; margin: -6px 0 16px; }
        .sh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 22px; }
        .sh-card { position: relative; border-radius: 18px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; overflow: hidden; transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s, opacity .2s; }
        .sh-card:hover { transform: translateY(-3px); box-shadow: 0 22px 40px -22px rgba(0,0,0,.7); }
        .sh-card.lifted { opacity: .35; }
        .sh-card.target { box-shadow: 0 0 0 3px ${ACCENT_SOLID}; }
        .sh-face { display: block; width: 100%; padding: 0; border: none; background: none; color: inherit; text-align: left; cursor: pointer; }
        .sh-face:focus-visible { outline: 3px solid ${ACCENT_SOLID}; outline-offset: -3px; border-radius: 18px; }
        .sh-pic { aspect-ratio: 16 / 10; background: #16181d; overflow: hidden; border-bottom: 1px solid ${DS_BORDER}; }
        .sh-pic > svg, .sh-pic > img { width: 100%; height: 100%; }
        .sh-meta { padding: 14px 16px 16px; }
        .sh-name { font: 700 16px/1.25 'Inter', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sh-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 12.5px; color: ${TEXT_MUTED}; }
        .sh-kind { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font-weight: 600; font-size: 12px; }
        .sh-no { font: 700 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .08em; color: ${ACCENT_SOLID}; }
        .sh-tools { position: absolute; top: 10px; right: 10px; display: flex; gap: 6px; opacity: 0; transition: opacity .15s; }
        .sh-card:hover .sh-tools, .sh-card:focus-within .sh-tools { opacity: 1; }
        @media (hover: none) { .sh-tools { opacity: 1; } }
        .sh-tools button { width: 32px; height: 32px; border-radius: 10px; border: none; background: rgba(12,13,16,.78); color: #fff; display: grid; place-items: center; cursor: pointer; -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); }
        .sh-tools button:disabled { opacity: .35; cursor: default; }
        .sh-grip { position: absolute; top: 10px; left: 10px; width: 32px; height: 32px; border-radius: 10px; background: rgba(12,13,16,.78); color: #fff; display: grid; place-items: center; opacity: 0; transition: opacity .15s; pointer-events: none; }
        .sh-card:hover .sh-grip { opacity: 1; }
        .sh-empty { border: 2px dashed ${DS_BORDER}; border-radius: 22px; padding: 46px 30px; text-align: center; color: ${TEXT_MUTED}; }
        .sh-empty b { display: block; color: ${TEXT_PRIMARY}; font: 800 30px 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: .02em; margin-bottom: 8px; }
        .sh-btn { height: 40px; padding: 0 16px; border-radius: 12px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font: 600 14px 'Inter', sans-serif; cursor: pointer; }
        .sh-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: transparent; }
        .sh-skel { aspect-ratio: 16 / 13; border-radius: 18px; background: ${SURFACE_1}; animation: sh-pulse 1.2s ease-in-out infinite alternate; }
        @keyframes sh-pulse { from { opacity: .55 } to { opacity: 1 } }
        .sh-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; padding: 10px 16px; border-radius: 999px; font: 500 13px 'Inter', sans-serif; z-index: 60; }
        .sh.dragging, .sh.dragging * { cursor: grabbing !important; user-select: none; }
        @media (max-width: 720px) { .sh-wrap { padding: 26px 16px 70px; } .sh-h1 { font-size: 40px; } .sh-search { margin-left: 0; width: 100%; } .sh-seg { overflow-x: auto; max-width: 100%; } }
        @media (prefers-reduced-motion: reduce) { .sh-card, .sh-skel { transition: none; animation: none; } }
      `}</style>
      <header className="sh-top">
        <button className="sh-icon" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color={ACCENT_SOLID} /></button>
        <span style={{ font: "800 15px 'Barlow Condensed', sans-serif", letterSpacing: ".14em", textTransform: "uppercase" }}>Your shelf</span>
      </header>
      <main className={`sh-wrap${drag ? " dragging" : ""}`}>
        <div className="sh-kick">Only you can see this</div>
        <h1 className="sh-h1">{who.handle ? `@${who.handle}'s shelf` : who.name ? `${who.name}'s shelf` : "Your shelf"}</h1>
        <p className="sh-sub">Everything you've made, in the order you choose. Boards carry their issue number once they've been exported.</p>
        {pieces && total > 0 && (
          <div className="sh-tally" aria-label="What's on your shelf">
            <span><b>{total}</b>{total === 1 ? "piece" : "pieces"}</span>
            {(["board", "analysis", "report", "tree"] as Kind[]).filter(k => counts(k)).map(k => <span key={k}><b>{counts(k)}</b>{counts(k) === 1 ? KIND_NAME[k].toLowerCase() : k === "analysis" ? "analyses" : KIND_NAME[k].toLowerCase() + "s"}</span>)}
          </div>
        )}
        <div className="sh-bar">
          <div className="sh-seg" role="group" aria-label="Show">
            {KINDS.map(k => <button key={k.id} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
          </div>
          <label className="sh-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a piece" aria-label="Find a piece" />{q && <button className="sh-icon" style={{ width: 24, height: 24 }} aria-label="Clear search" onClick={() => setQ("")}><X size={13} /></button>}</label>
        </div>
        {pieces && total > 1 && <p className="sh-hint">{canMove ? "Drag a card to put it where you want it, or use its arrows." : "Show everything to change the order."}</p>}
        {pieces === null ? (
          <div className="sh-grid" aria-busy="true">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="sh-skel" />)}</div>
        ) : total === 0 ? (
          <div className="sh-empty">
            <b>Your shelf is waiting</b>
            Every board, analysis, report and tree you make lands here, ready to put in your order.
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
              <button className="sh-btn pri" onClick={() => navigate("/board")}>Make a board</button>
              <button className="sh-btn" onClick={() => navigate("/report")}>Start a report</button>
            </div>
          </div>
        ) : shown.length === 0 ? (
          <p className="sh-sub">Nothing here matches. Try another word, or show everything.</p>
        ) : (
          <div className="sh-grid">
            {shown.map(p => {
              const i = ordered.findIndex(x => x.key === p.key)
              return (
                <div key={p.key} data-piece={p.key} className={`sh-card${drag?.key === p.key ? " lifted" : ""}${drag && drag.over === p.key && drag.key !== p.key ? " target" : ""}`}>
                  <button className="sh-face" aria-label={`Open ${p.name}`}
                    onPointerDown={e => { if (!canMove || e.button !== 0 || e.pointerType === "touch") return; e.preventDefault(); press.current = { key: p.key, x: e.clientX, y: e.clientY, on: false } }}
                    onClick={e => { if (e.detail === 0 || !canMove || (e.nativeEvent as PointerEvent).pointerType === "touch") navigate(p.href) }}>
                    <div className="sh-pic">{p.thumb}</div>
                    <div className="sh-meta">
                      <div className="sh-name">{p.name}</div>
                      <div className="sh-row"><span className="sh-kind">{KIND_ICON[p.kind]} {KIND_NAME[p.kind]}</span>{p.no > 0 && <span className="sh-no">{issueLabel(p.no)}</span>}<span style={{ marginLeft: "auto" }}>{relTime(p.updated)}</span></div>
                    </div>
                  </button>
                  {canMove && <span className="sh-grip" aria-hidden="true"><GripVertical size={16} /></span>}
                  {canMove && (
                    <div className="sh-tools">
                      <button aria-label={`Move ${p.name} earlier`} title="Move earlier" disabled={i === 0} onClick={() => move(p.key, i - 1)}><ArrowLeft size={15} /></button>
                      <button aria-label={`Move ${p.name} later`} title="Move later" disabled={i === ordered.length - 1} onClick={() => move(p.key, i + 1)}><ArrowRight size={15} /></button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
      <div aria-live="polite">{toast && <div className="sh-toast">{toast}</div>}</div>
    </div>
  )
}
