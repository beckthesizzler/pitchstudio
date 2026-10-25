import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { LayoutDashboard, Image as ImageIcon, FileText, StickyNote, User, BookOpen } from "lucide-react"
import { supabase } from "../lib/supabase"
import { stripHandleSuffix } from "../lib/account"
import { relTime } from "../lib/time"
import { Mark } from "../brand/Mark"
import { StudioScene } from "../brand/StudioScene"
import { ThemeToggle, PS_VOLT, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, ACCENT_SOLID, ACCENT_INK } from "../theme"

/* Home ("/" when you are signed in): a menu to everything in the studio. The board is one step away at "/board". */

interface LastBoard { id: string; title: string; updated_at: string }
interface Item { id: string; name: string; desc: string; icon: React.ReactNode; soon?: boolean; run?: () => void; extra?: { label: string; run: () => void } }

export default function HomePage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [first, setFirst] = useState("")
  const [handle, setHandle] = useState("")
  const [isNew, setIsNew] = useState(false)
  const [last, setLast] = useState<LastBoard | null>(null)
  const [sel, setSel] = useState(0)
  const [toast, setToast] = useState("")
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user
      if (!u) { navigate("/", { replace: true }); return }
      setIsNew(Date.now() - new Date(u.created_at).getTime() < 15 * 60 * 1000)
      const [{ data: prof }, { data: boards }] = await Promise.all([
        supabase.from("profiles").select("display_name, handle").eq("id", u.id).maybeSingle(),
        supabase.from("boards").select("id, title, updated_at").eq("user_id", u.id).order("updated_at", { ascending: false }).limit(1),
      ])
      if (off) return
      const raw = (prof as any)?.display_name || (prof as any)?.handle || u.email?.split("@")[0] || ""
      const name = stripHandleSuffix(raw, u.id, u.email)
      setFirst(name.trim().split(" ")[0] || "")
      const h = (prof as any)?.handle ? stripHandleSuffix((prof as any).handle, u.id, u.email) : ""
      setHandle(h)
      const b = (boards as any[] | null)?.[0]
      setLast(b ? { id: b.id, title: b.title || "Untitled board", updated_at: b.updated_at } : null)
      setReady(true)
    })
    return () => { off = true }
  }, [])

  useEffect(() => { if (ready && window.matchMedia?.("(pointer: fine)").matches) menuRef.current?.focus({ preventScroll: true }) }, [ready])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t) }, [toast])

  const items: Item[] = [
    { id: "board", name: "Tactics Board", icon: <LayoutDashboard size={20} />,
      desc: last ? `Continue: ${last.title} · ${relTime(last.updated_at)}` : "Draw a full match idea on the pitch",
      run: () => navigate(last ? `/board?open=${last.id}` : "/board"),
      extra: last ? { label: "New", run: () => navigate("/board") } : undefined },
    { id: "live", name: "Live Game Analysis", desc: "Draw on up to 4 match shots", icon: <ImageIcon size={20} />, soon: true },
    { id: "report", name: "Match Report", desc: "Your template, your logo", icon: <FileText size={20} />, soon: true },
    { id: "braindump", name: "Brain Dump", desc: "A blank page to think on", icon: <StickyNote size={20} />, run: () => navigate("/braindump") },
    { id: "profile", name: "Creator Profile", desc: "Your handle, signature and look", icon: <User size={20} />, run: () => navigate("/profile") },
    { id: "learn", name: "Learn Football", desc: "The best threads, picked for you", icon: <BookOpen size={20} />, soon: true },
  ]
  const activate = (i: number) => {
    const it = items[i]
    if (it.soon) { setToast(`${it.name} is coming soon.`); return }
    it.run?.()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => (s + 1) % items.length) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => (s + items.length - 1) % items.length) }
    else if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); activate(sel) }
  }

  if (!ready) return <div style={{ minHeight: "100vh", background: SURFACE_BASE }} />
  const initials = (first || handle || "PS").slice(0, 2).toUpperCase()

  return (
    <div className="hm" style={{ background: SURFACE_BASE, color: TEXT_PRIMARY, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .hm * { box-sizing: border-box; }
        .hm-top { height: 64px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; border-bottom: 1px solid ${DS_BORDER}; }
        .hm-brand { display: flex; align-items: center; gap: 12px; }
        .hm-word { font-family: 'Cormorant Garamond', Georgia, serif; letter-spacing: .24em; font-size: 17px; font-weight: 600; }
        .hm-me { display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${TEXT_MUTED}; }
        .hm-me b { color: ${TEXT_PRIMARY}; font-weight: 600; }
        .hm-av { width: 34px; height: 34px; border-radius: 50%; background: ${PS_VOLT}; color: #121316; display: grid; place-items: center; font-weight: 800; font-size: 12px; border: 2px solid ${ACCENT_SOLID}; cursor: pointer; padding: 0; }
        .hm-main > * { min-width: 0; }
        .hm-main { display: grid; grid-template-columns: minmax(420px, 560px) 1fr; min-height: calc(100vh - 64px); }
        .hm-menu { padding: 52px 44px 32px 56px; display: flex; flex-direction: column; border-right: 1px solid ${DS_BORDER}; outline: none; }
        .hm-hi { font-size: 12px; letter-spacing: .2em; font-weight: 700; color: ${ACCENT_SOLID}; }
        .hm-h1 { font-size: clamp(28px, 3vw, 38px); line-height: 1.1; letter-spacing: -.03em; font-weight: 700; margin: 12px 0 30px; }
        .hm-lab { font-size: 11px; letter-spacing: .2em; font-weight: 700; color: ${TEXT_MUTED}; margin-bottom: 12px; }
        .hm-it { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-radius: 12px; margin-bottom: 6px; position: relative; cursor: pointer; border: 1px solid transparent; }
        .hm-it.sel { background: ${SURFACE_1}; border-color: ${ACCENT_SOLID}; }
        .hm-it.sel:before { content: ""; position: absolute; left: -14px; top: 12px; bottom: 12px; width: 4px; border-radius: 4px; background: ${ACCENT_SOLID}; }
        .hm-ic { width: 40px; height: 40px; border-radius: 11px; background: ${SURFACE_2}; display: grid; place-items: center; flex: none; color: ${TEXT_PRIMARY}; }
        .hm-it.sel .hm-ic { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; }
        .hm-n { font-size: 19px; font-weight: 650; letter-spacing: -.01em; }
        .hm-it.soon .hm-n { color: ${TEXT_MUTED}; }
        .hm-d { font-size: 12.5px; color: ${TEXT_MUTED}; margin-top: 3px; }
        .hm-grow { min-width: 0; flex: 1; } .hm-grow .hm-d { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hm-pill { font-size: 13px; font-weight: 700; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; padding: 8px 14px; border-radius: 99px; border: 0; cursor: pointer; white-space: nowrap; }
        .hm-pill.alt { background: transparent; color: ${TEXT_PRIMARY}; border: 1px solid ${DS_BORDER}; margin-right: 6px; }
        .hm-tag { font-size: 10px; letter-spacing: .14em; color: ${TEXT_MUTED}; border: 1px solid ${DS_BORDER}; padding: 4px 9px; border-radius: 99px; }
        .hm-foot { margin-top: auto; padding-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
        .hm-tagline { font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 24px; } .hm-tagline em { color: ${ACCENT_SOLID}; }
        .hm-keys { font-size: 11.5px; color: ${TEXT_MUTED}; }
        .hm-k { display: inline-block; border: 1px solid ${DS_BORDER}; border-radius: 5px; padding: 1px 6px; margin: 0 2px; }
        .hm-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; padding: 10px 16px; border-radius: 99px; font-size: 13px; z-index: 30; }
        .hm-art { position: relative; overflow: hidden; background: ${SURFACE_BASE}; min-height: 420px; }
        .hm-learn { position: absolute; right: 28px; bottom: 26px; width: 340px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 14px; padding: 14px 16px; opacity: .96; }
        .hm-learn .t { font-size: 11px; letter-spacing: .18em; font-weight: 700; color: ${ACCENT_SOLID}; } .hm-learn .q { font-size: 13.5px; line-height: 1.45; margin-top: 8px; }
        @media (max-width: 880px) {
          .hm-top { padding: 0 16px; height: 56px; } .hm-word { display: none; } .hm-me .hm-hide { display: none; }
          .hm-main { grid-template-columns: 1fr; min-height: 0; }
          .hm-art { order: -1; min-height: 0; height: 220px; }
          .hm-learn { display: none; }
          .hm-menu { padding: 22px 16px 28px; border-right: 0; }
          .hm-h1 { font-size: 25px; margin: 8px 0 18px; }
          .hm-it { padding: 11px 12px; gap: 12px; } .hm-it.sel:before { left: -8px; } .hm-ic { width: 34px; height: 34px; } .hm-n { font-size: 16px; } .hm-d { font-size: 11.5px; }
          .hm-pill { padding: 6px 11px; font-size: 12px; }
          .hm-pills { flex-basis: 100%; padding-left: 46px; margin-top: 4px; }
          .hm-it { flex-wrap: wrap; } .hm-keys { display: none; } .hm-tagline { font-size: 20px; }
        }
      `}</style>
      <header className="hm-top">
        <div className="hm-brand"><Mark size={30} color={ACCENT_SOLID} /><span className="hm-word">PITCHSTUDIO</span></div>
        <div className="hm-me">
          <ThemeToggle />
          {handle && <span className="hm-hide"><b>@{handle}</b></span>}
          <button className="hm-av" onClick={() => navigate("/profile")} aria-label="Creator profile" title="Creator profile">{initials}</button>
        </div>
      </header>
      <div className="hm-main">
        <div className="hm-menu" role="menu" aria-label="Creator hub" tabIndex={0} ref={menuRef} onKeyDown={onKey}>
          <div className="hm-hi">{isNew ? "WELCOME" : "WELCOME BACK"}{first ? `, ${first.toUpperCase()}` : ""}</div>
          <h1 className="hm-h1">What do you want to<br />work on today?</h1>
          <div className="hm-lab">CREATOR HUB</div>
          {items.map((it, i) => (
            <div key={it.id} role="menuitem" aria-disabled={it.soon || undefined} data-home={it.id}
              className={`hm-it${sel === i ? " sel" : ""}${it.soon ? " soon" : ""}`}
              onMouseEnter={() => setSel(i)} onClick={() => activate(i)}>
              <div className="hm-ic">{it.icon}</div>
              <div className="hm-grow"><div className="hm-n">{it.name}</div><div className="hm-d">{it.desc}</div></div>
              {it.soon ? <span className="hm-tag">SOON</span> : sel === i ? (
                <span className="hm-pills" style={{ display: "flex", alignItems: "center" }}>
                  {it.extra && <button className="hm-pill alt" onClick={e => { e.stopPropagation(); it.extra!.run() }}>{it.extra.label}</button>}
                  <button className="hm-pill" onClick={e => { e.stopPropagation(); activate(i) }}>Open</button>
                </span>
              ) : null}
            </div>
          ))}
          <div className="hm-foot">
            <div className="hm-tagline">Enable your <em>creativity.</em></div>
            <div className="hm-keys"><span className="hm-k">↑</span><span className="hm-k">↓</span> move &nbsp;<span className="hm-k">Enter</span> open</div>
          </div>
        </div>
        <div className="hm-art">
          <StudioScene />
          <div className="hm-learn"><div className="t">LEARN FOOTBALL · COMING SOON</div><div className="q">Hand-picked football threads from X, always credited to the people who wrote them.</div></div>
        </div>
      </div>
      <div aria-live="polite">{toast && <div className="hm-toast">{toast}</div>}</div>
    </div>
  )
}
