import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, Bold, Check, GitFork, Heading, Highlighter, Italic, List, ListOrdered, Loader2, PenLine, Plus, Search, Shapes, Trash2, Type, X } from "lucide-react"
import { supabase } from "../lib/supabase"
import { reportError, track } from "../lib/telemetry"
import { Mark as PSMark } from "../brand/Mark"
import { MindMap, newMap, type MapBlock } from "../braindump/MindMap"
import { Diagram, newDiagram, type DiagramBlock } from "../braindump/Diagram"
import { HAND, loadHand, rng } from "../braindump/sketch"
import { ACCENT_SOLID, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, DS_BORDER, DS_ERROR } from "../theme"

/* Brain Dump ("/braindump"): your head, emptied onto a wall of sticky notes. Each note has a title and a colour;
   open it and it's a page to think on: writing with a highlighter, and mind maps and diagrams drawn as if by hand.
   Saved to your account as you go. */

type TextBlock = { type: "text"; id: string; html: string }
type Block = TextBlock | MapBlock | DiagramBlock
type Note = { id: string; title: string; color: Color; pos: number; body: Block[]; updated_at: string }
type Color = "yellow" | "pink" | "peach" | "orange" | "lime" | "aqua" | "teal" | "lilac"
const COLORS: { id: Color; c: string }[] = [
  { id: "yellow", c: "#f7e36a" }, { id: "pink", c: "#f58cb4" }, { id: "peach", c: "#f9b27e" }, { id: "orange", c: "#f6a04a" },
  { id: "lime", c: "#c8e86c" }, { id: "aqua", c: "#88dde0" }, { id: "teal", c: "#5ec6cb" }, { id: "lilac", c: "#c6b6fb" },
]
const hex = (c: Color) => COLORS.find(x => x.id === c)?.c ?? "#f7e36a"
const MARKS = [["#fff27a", "Yellow"], ["#ffc2dc", "Pink"], ["#c9f5b6", "Green"], ["#bfe3ff", "Blue"]] as const
const nid = () => { try { return crypto.randomUUID() } catch { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) } }
const newText = (html = ""): TextBlock => ({ type: "text", id: nid(), html })

/* ── words: only plain formatting survives (no scripts, no styles but a highlight) ── */
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "MARK", "BR", "DIV", "P", "H2", "H3", "UL", "OL", "LI", "SPAN"])
function clean(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html"), root = doc.body.firstElementChild!
  const walk = (el: Element) => {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) continue
      if (n.nodeType !== 1) { n.remove(); continue }
      const c = n as HTMLElement
      if (!KEEP.has(c.tagName)) { c.replaceWith(...[...c.childNodes]); continue }
      const bg = c.style?.backgroundColor
      for (const a of [...c.attributes]) c.removeAttribute(a.name)
      if (bg && (c.tagName === "SPAN" || c.tagName === "MARK")) c.setAttribute("style", `background-color: ${bg}`)
      walk(c)
    }
  }
  walk(root)
  return root.innerHTML.slice(0, 200000)
}
const plain = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return (d.innerText || d.textContent || "").trim() }
function readBody(raw: unknown): Block[] {
  const out: Block[] = []
  for (const b of Array.isArray(raw) ? raw.slice(0, 200) : []) {
    if (!b || typeof b !== "object") continue
    const x = b as any
    if (x.type === "text" && typeof x.html === "string") out.push({ type: "text", id: String(x.id || nid()), html: clean(x.html) })
    else if (x.type === "map" && x.root && typeof x.root === "object") out.push(x as MapBlock)
    else if (x.type === "diagram" && Array.isArray(x.shapes)) out.push({ ...(x as DiagramBlock), h: Math.max(220, Math.min(1400, Number(x.h) || 360)), links: Array.isArray(x.links) ? x.links : [] })
  }
  return out.length ? out : [newText()]
}

function Words({ block, onChange, onFocus }: { block: TextBlock; onChange: (b: TextBlock) => void; onFocus: (el: HTMLDivElement) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current && ref.current.innerHTML !== block.html) ref.current.innerHTML = block.html }, [block.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="bd-words" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Your notes"
      data-placeholder="Dump it here…" onFocus={() => ref.current && onFocus(ref.current)}
      onInput={() => onChange({ ...block, html: clean(ref.current!.innerHTML) })}
      onPaste={e => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")) }} />
  )
}

export default function BrainDumpPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("")
  const [confirmDel, setConfirmDel] = useState(false)
  const [toast, setToast] = useState("")
  const focused = useRef<HTMLDivElement | null>(null)
  const timers = useRef(new Map<string, number>())
  const notesRef = useRef<Note[]>([])
  notesRef.current = notes ?? []

  useEffect(() => { loadHand() }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/", { replace: true }); return }
      setUser({ id: session.user.id })
      const { data, error } = await (supabase as any).from("notes").select("id, title, color, pos, body, updated_at").eq("user_id", session.user.id).order("pos", { ascending: false }).limit(2000)
      if (off) return
      if (error) { setNotes([]); setToast("Your notes couldn't be loaded. Check your connection."); return }
      setNotes((data ?? []).map((n: any) => ({ ...n, body: readBody(n.body) })))
    })
    return () => { off = true }
  }, [navigate])
  // leaving with something unsaved: the browser asks first
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timers.current.size) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])

  const save = async (id: string) => {
    timers.current.delete(id)
    const n = notesRef.current.find(x => x.id === id)
    if (!n) return
    setStatus("saving")
    const { error } = await (supabase as any).from("notes").update({ title: n.title.slice(0, 120), color: n.color, pos: n.pos, body: n.body, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) { setStatus("error"); reportError(error, "note_save"); return }
    if (!timers.current.size) setStatus("saved")
  }
  const change = (id: string, fn: (n: Note) => Note) => {
    setNotes(ns => (ns ?? []).map(n => (n.id === id ? fn(n) : n)))
    setStatus("saving")
    window.clearTimeout(timers.current.get(id)); timers.current.set(id, window.setTimeout(() => save(id), 700))
  }
  const create = async () => {
    if (!user) return
    const pos = Math.max(0, ...notesRef.current.map(n => n.pos)) + 1
    const color = COLORS[notesRef.current.length % COLORS.length].id
    const n: Note = { id: nid(), title: "", color, pos, body: [newText()], updated_at: new Date().toISOString() }
    const { error } = await (supabase as any).from("notes").insert({ id: n.id, title: "", color, pos, body: n.body })
    if (error) { setToast(/limit/.test(error.message || "") ? "You've reached 2,000 notes." : "Couldn't make a note. Try again."); return }
    setNotes(ns => [n, ...(ns ?? [])]); setOpen(n.id); track("note_created")
  }
  const remove = async (id: string) => {
    setConfirmDel(false)
    window.clearTimeout(timers.current.get(id)); timers.current.delete(id)
    const { error } = await (supabase as any).from("notes").delete().eq("id", id)
    if (error) { setToast("Couldn't delete it. Try again."); return }
    setNotes(ns => (ns ?? []).filter(n => n.id !== id)); setOpen(null)
  }
  const close = () => {
    const n = notesRef.current.find(x => x.id === open)
    // a note left empty goes away
    if (n && !n.title.trim() && n.body.every(b => b.type === "text" && !plain(b.html))) remove(n.id)
    else if (open && timers.current.has(open)) { window.clearTimeout(timers.current.get(open)); save(open) }
    setOpen(null); setConfirmDel(false)
  }
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !e.defaultPrevented && !(e.target as HTMLElement)?.closest?.(".bd-map, .bd-dia")) close() }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  })

  const note = notes?.find(n => n.id === open) ?? null
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (notes ?? []).filter(n => !t || n.title.toLowerCase().includes(t) || n.body.some(b => b.type === "text" && plain(b.html).toLowerCase().includes(t)))
  }, [notes, q])
  const fmt = (cmd: string, arg?: string) => { focused.current?.focus(); document.execCommand(cmd, false, arg) }
  const insert = (b: Block, atEnd = false) => {
    if (!note) return
    const i = !atEnd && focused.current ? note.body.findIndex(x => x.id === focused.current!.dataset.bid) : -1
    change(note.id, n => {
      const body = [...n.body], last = body[body.length - 1]
      // at the end, a blank line already waiting there stays the last thing on the page
      if (i < 0 && last?.type === "text" && !last.html.replace(/<[^>]*>/g, "").trim()) body.splice(body.length - 1, 0, b)
      else body.splice(i >= 0 ? i + 1 : body.length, 0, b, newText())
      return { ...n, body }
    })
    track(b.type === "map" ? "note_map_added" : "note_diagram_added")
  }

  return (
    <div className="bd">
      <style>{`
        .bd { min-height: 100vh; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; }
        .bd * { box-sizing: border-box; }
        .bd-top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: var(--ps-frost, ${SURFACE_BASE}); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); border-bottom: 1px solid ${DS_BORDER}; }
        .bd-home { background: none; border: none; padding: 4px; cursor: pointer; display: flex; border-radius: 8px; }
        .bd-search { flex: 1; min-width: 0; max-width: 360px; margin-left: auto; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border-radius: 11px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; }
        .bd-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; }
        .bd-new { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; height: 38px; padding: 0 16px; border-radius: 999px; border: none; background: ${ACCENT_SOLID}; color: #0a0c0f; font: 700 13.5px 'Inter', sans-serif; cursor: pointer; }
        .bd-head { max-width: 1240px; margin: 0 auto; padding: 34px 24px 6px; }
        .bd-head h1 { margin: 0; font: 700 44px ${HAND}; letter-spacing: -.01em; }
        .bd-head p { margin: 4px 0 0; color: ${TEXT_MUTED}; font-size: 14.5px; }
        .bd-wall { max-width: 1240px; margin: 0 auto; padding: 26px 24px 80px; display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 30px 26px; }
        .bd-sticky { position: relative; aspect-ratio: 1; border: none; border-radius: 3px 3px 16px 3px; padding: 18px 18px 16px; text-align: left; cursor: pointer; color: #1b1a17;
          box-shadow: 0 1px 1px rgba(0,0,0,.12), 0 12px 22px -10px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 8px; overflow: hidden;
          transition: transform .22s cubic-bezier(.2,.8,.2,1), box-shadow .22s; }
        .bd-sticky::after { content: ""; position: absolute; right: 0; bottom: 0; width: 26px; height: 26px; background: linear-gradient(135deg, rgba(0,0,0,.14), rgba(255,255,255,.35) 55%, transparent 56%); border-top-left-radius: 14px; }
        .bd-sticky:hover { transform: translateY(-4px) rotate(0deg) !important; box-shadow: 0 2px 2px rgba(0,0,0,.12), 0 22px 34px -14px rgba(0,0,0,.55); }
        .bd-sticky:focus-visible { outline: 3px solid ${ACCENT_SOLID}; outline-offset: 4px; }
        .bd-sticky h2 { margin: 0; font: 700 23px/1.12 ${HAND}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .bd-sticky p { margin: 0; font: 400 13.5px/1.45 'Inter', sans-serif; opacity: .78; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; }
        .bd-sticky small { margin-top: auto; font: 600 11px 'Inter', sans-serif; opacity: .55; display: flex; gap: 8px; align-items: center; }
        .bd-add { aspect-ratio: 1; border-radius: 16px; border: 2px dashed ${DS_BORDER}; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; font: 600 14px 'Inter', sans-serif; transition: border-color .16s, color .16s; }
        .bd-add:hover { border-color: ${ACCENT_SOLID}; color: ${TEXT_PRIMARY}; }
        .bd-empty { grid-column: 1 / -1; text-align: center; color: ${TEXT_MUTED}; padding: 40px 0; }
        @keyframes bd-in { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        .bd-sheet { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: var(--bd-paper); color: #1b1a17; animation: bd-in .32s cubic-bezier(.2,.8,.2,1) both; }
        .bd-sheet-top { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid rgba(27,26,23,.1); flex-wrap: wrap; }
        .bd-tb { height: 34px; min-width: 34px; padding: 0 9px; border-radius: 9px; border: none; background: transparent; color: #1b1a17; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; }
        .bd-tb:hover { background: rgba(27,26,23,.08); }
        .bd-tb.pill { background: rgba(27,26,23,.88); color: #fff; padding: 0 13px; border-radius: 999px; }
        .bd-sep { width: 1px; height: 20px; background: rgba(27,26,23,.15); margin: 0 4px; display: inline-block; }
        .bd-swatch { width: 22px; height: 22px; border-radius: 6px; border: 2px solid rgba(27,26,23,.25); cursor: pointer; padding: 0; }
        .bd-swatch[aria-pressed="true"] { border-color: #1b1a17; box-shadow: 0 0 0 2px var(--bd-paper), 0 0 0 4px #1b1a17; }
        .bd-page { flex: 1; overflow-y: auto; }
        .bd-inner { max-width: 860px; margin: 0 auto; padding: 34px 28px 120px; }
        .bd-title { width: 100%; border: none; outline: none; background: none; font: 700 44px/1.1 ${HAND}; color: #1b1a17; padding: 0; margin: 0 0 14px; }
        .bd-title::placeholder { color: rgba(27,26,23,.35); }
        .bd-words { outline: none; font: 400 17.5px/1.7 'Inter', sans-serif; min-height: 1.7em; padding: 2px 0; }
        .bd-words:empty::before { content: attr(data-placeholder); color: rgba(27,26,23,.38); }
        .bd-words h2, .bd-words h3 { font: 700 26px/1.25 ${HAND}; margin: 18px 0 6px; }
        .bd-words ul, .bd-words ol { padding-left: 24px; margin: 6px 0; }
        .bd-words span[style], .bd-words mark { border-radius: 3px; padding: 0 2px; }
        .bd-block { position: relative; margin: 16px 0; border-radius: 16px; background: rgba(255,255,255,.62); box-shadow: 0 0 0 1px rgba(27,26,23,.08), 0 10px 26px -18px rgba(0,0,0,.4); }
        .bd-block > .bd-x { position: absolute; top: 8px; right: 8px; z-index: 2; opacity: 0; transition: opacity .15s; }
        .bd-block:hover > .bd-x, .bd-block:focus-within > .bd-x { opacity: 1; }
        .bd-map { outline: none; padding: 18px 10px 8px; overflow-x: auto; }
        .bd-map-inp, .bd-dia-inp { position: absolute; border: 2px solid #1b1a17; border-radius: 12px; background: #fff; text-align: center; font-family: ${HAND}; color: #1b1a17; outline: none; padding: 4px 8px; resize: none; }
        .bd-hint { margin: 4px 0 0; text-align: center; font: 500 12px 'Inter', sans-serif; color: rgba(27,26,23,.5); }
        .bd-dia { outline: none; overflow: hidden; border-radius: 16px; }
        .bd-dia-bar { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-bottom: 1px solid rgba(27,26,23,.08); flex-wrap: wrap; }
        .bd-dia-bar button { width: 32px; height: 30px; border-radius: 8px; border: none; background: none; color: #1b1a17; display: grid; place-items: center; cursor: pointer; }
        .bd-dia-bar button[aria-pressed="true"] { background: rgba(27,26,23,.12); }
        .bd-dia-empty { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; pointer-events: none; font: 500 15px ${HAND}; color: rgba(27,26,23,.45); }
        .bd-dia-grow { position: absolute; left: 0; right: 0; bottom: 0; height: 10px; cursor: ns-resize; }
        .bd-dia-grow::after { content: ""; position: absolute; left: 50%; bottom: 3px; width: 38px; height: 4px; margin-left: -19px; border-radius: 2px; background: rgba(27,26,23,.2); }
        .bd-adds { display: flex; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
        .bd-adds button { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; border: 1.5px dashed rgba(27,26,23,.3); background: none; color: #1b1a17; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
        .bd-adds button:hover { border-style: solid; background: rgba(255,255,255,.5); }
        .bd-status { font: 500 12px 'Inter', sans-serif; color: rgba(27,26,23,.55); margin-left: 6px; display: inline-flex; align-items: center; gap: 5px; }
        .bd-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; padding: 10px 16px; border-radius: 999px; font: 500 13px 'Inter', sans-serif; z-index: 60; }
        @media (max-width: 640px) { .bd-head h1 { font-size: 34px; } .bd-wall { grid-template-columns: repeat(2, 1fr); gap: 18px; padding: 18px 16px 60px; } .bd-search { max-width: none; } .bd-title { font-size: 34px; } .bd-inner { padding: 22px 16px 100px; } .bd-sheet-top { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 8px 10px; } .bd-sheet-top::-webkit-scrollbar { display: none; } .bd-sheet-top > * { flex-shrink: 0; } .bd-sheet-top > .bd-tb:first-child { position: sticky; left: -10px; z-index: 1; background: var(--bd-paper); box-shadow: 8px 0 10px -6px var(--bd-paper); } }
        @media (prefers-reduced-motion: reduce) { .bd-sheet, .bd-sticky { animation: none; transition: none; } }
      `}</style>

      <header className="bd-top">
        <button className="bd-home" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color={ACCENT_SOLID} /></button>
        <label className="bd-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your notes" aria-label="Search your notes" /></label>
        <button className="bd-new" onClick={create} disabled={!user}><Plus size={16} /> New note</button>
      </header>
      <div className="bd-head">
        <h1>Brain Dump</h1>
        <p>{notes === null ? "Loading…" : notes.length ? `${notes.length} note${notes.length === 1 ? "" : "s"}. Everything in your head, in one place.` : "Everything in your head, in one place. Start with a note."}</p>
      </div>
      <div className="bd-wall">
        {notes !== null && !q && <button className="bd-add" onClick={create}><span style={{ display: "grid", placeItems: "center", gap: 8 }}><Plus size={26} />New note</span></button>}
        {shown.map(n => {
          const r = rng(n.id), tilt = (r() - 0.5) * 3.2
          const first = n.body.find((b): b is TextBlock => b.type === "text" && !!plain(b.html))
          const maps = n.body.filter(b => b.type !== "text").length
          return (
            <button key={n.id} className="bd-sticky" style={{ background: hex(n.color), transform: `rotate(${tilt.toFixed(2)}deg)` }} onClick={() => setOpen(n.id)} aria-label={`Open ${n.title || "Untitled note"}`}>
              <h2>{n.title || "Untitled"}</h2>
              {first && <p>{plain(first.html)}</p>}
              <small>{new Date(n.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}{maps > 0 && <><span>·</span><Shapes size={12} /> {maps}</>}</small>
            </button>
          )
        })}
        {notes !== null && q && !shown.length && <p className="bd-empty">Nothing matches “{q}”.</p>}
      </div>

      {note && (
        <div className="bd-sheet" role="dialog" aria-label={note.title || "Note"} style={{ ["--bd-paper" as any]: `color-mix(in srgb, ${hex(note.color)} 22%, #fbfaf6)` }}>
          <div className="bd-sheet-top" onPointerDown={e => { if ((e.target as HTMLElement).closest("button")) e.preventDefault() }}>
            <button className="bd-tb" onClick={close} aria-label="Back to the wall"><ArrowLeft size={17} /> Wall</button>
            <span className="bd-status" aria-live="polite">{status === "saving" ? <><Loader2 size={12} className="an-spin" /> Saving</> : status === "saved" ? <><Check size={12} /> Saved</> : status === "error" ? <span style={{ color: DS_ERROR }}>Not saved</span> : ""}</span>
            <span style={{ flex: 1 }} />
            <button className="bd-tb" aria-label="Bold" title="Bold" onClick={() => fmt("bold")}><Bold size={16} /></button>
            <button className="bd-tb" aria-label="Italic" title="Italic" onClick={() => fmt("italic")}><Italic size={16} /></button>
            <button className="bd-tb" aria-label="Heading" title="Heading" onClick={() => fmt("formatBlock", "h2")}><Heading size={16} /></button>
            <button className="bd-tb" aria-label="Plain text" title="Plain text" onClick={() => fmt("formatBlock", "div")}><Type size={16} /></button>
            <button className="bd-tb" aria-label="List" title="List" onClick={() => fmt("insertUnorderedList")}><List size={16} /></button>
            <button className="bd-tb" aria-label="Numbered list" title="Numbered list" onClick={() => fmt("insertOrderedList")}><ListOrdered size={16} /></button>
            <span className="bd-sep" />
            <Highlighter size={15} aria-hidden="true" />
            {MARKS.map(([c, name]) => <button key={c} className="bd-tb" aria-label={`Highlight ${name}`} title={`Highlight ${name}`} onClick={() => fmt("hiliteColor", c)}><span style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid rgba(0,0,0,.2)" }} /></button>)}
            <span className="bd-sep" />
            <button className="bd-tb" onClick={() => insert(newMap())}><GitFork size={15} /> Mind map</button>
            <button className="bd-tb" onClick={() => insert(newDiagram())}><PenLine size={15} /> Diagram</button>
            <span className="bd-sep" />
            {COLORS.map(c => <button key={c.id} className="bd-swatch" aria-label={`Note colour ${c.id}`} aria-pressed={note.color === c.id} style={{ background: c.c }} onClick={() => change(note.id, n => ({ ...n, color: c.id }))} />)}
            <span className="bd-sep" />
            {confirmDel
              ? <><button className="bd-tb pill" style={{ background: DS_ERROR }} onClick={() => remove(note.id)}>Delete note</button><button className="bd-tb" onClick={() => setConfirmDel(false)}>Keep</button></>
              : <button className="bd-tb" aria-label="Delete note" title="Delete note" onClick={() => setConfirmDel(true)}><Trash2 size={16} /></button>}
          </div>
          <div className="bd-page">
            <div className="bd-inner">
              <input className="bd-title" value={note.title} maxLength={120} placeholder="Title" aria-label="Title" autoFocus={!note.title}
                onChange={e => change(note.id, n => ({ ...n, title: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); (document.querySelector(".bd-words") as HTMLElement | null)?.focus() } }} />
              {note.body.map(b => b.type === "text" ? (
                <div key={b.id} data-wrap={b.id}>
                  <Words block={b} onFocus={el => { el.dataset.bid = b.id; focused.current = el }} onChange={nb => change(note.id, n => ({ ...n, body: n.body.map(x => (x.id === nb.id ? nb : x)) }))} />
                </div>
              ) : (
                <div key={b.id} className="bd-block">
                  <button className="bd-tb bd-x" aria-label={b.type === "map" ? "Delete mind map" : "Delete diagram"} onClick={() => change(note.id, n => ({ ...n, body: n.body.filter(x => x.id !== b.id) }))}><X size={15} /></button>
                  {b.type === "map"
                    ? <MindMap block={b} onChange={nb => change(note.id, n => ({ ...n, body: n.body.map(x => (x.id === nb.id ? nb : x)) }))} />
                    : <Diagram block={b} onChange={nb => change(note.id, n => ({ ...n, body: n.body.map(x => (x.id === nb.id ? nb : x)) }))} />}
                </div>
              ))}
              <div className="bd-adds">
                <button onClick={() => insert(newMap(), true)}><GitFork size={15} /> Add a mind map</button>
                <button onClick={() => insert(newDiagram(), true)}><PenLine size={15} /> Add a diagram</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div aria-live="polite">{toast && <div className="bd-toast">{toast}</div>}</div>
    </div>
  )
}
