import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { ArrowLeft, Bold, Check, ChevronDown, ChevronRight, GitFork, Heading, Highlighter, Italic, List, ListOrdered, Loader2, Menu, MoveRight, PenLine, Plus, Search, Shapes, Sprout, Trash2, Type, X } from "lucide-react"
import { supabase } from "../lib/supabase"
import { reportError, track } from "../lib/telemetry"
import { Mark as PSMark } from "../brand/Mark"
import { MindMap, newMap, type MapBlock } from "../braindump/MindMap"
import { Diagram, newDiagram, type DiagramBlock } from "../braindump/Diagram"
import { HAND, loadHand, rng } from "../braindump/sketch"
import { ACCENT_SOLID, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_ERROR } from "../theme"

/* Brain Dump ("/braindump"): your studio for ideas. Dump them onto one straight line of sticky pads as fast as you can type.
   When some start to belong together, plant a tree: a roof with a name, and the ideas hang under it on roots (an idea can
   hang under another idea too). The list down the side works like a chat list. Open any pad and it's a page to think on:
   writing with a highlighter, and mind maps and diagrams drawn as if by hand. Saved to your account as you go. */

type TextBlock = { type: "text"; id: string; html: string }
type Block = TextBlock | MapBlock | DiagramBlock
type Kind = "note" | "tree"
type Note = { id: string; kind: Kind; parent_id: string | null; title: string; color: Color; pos: number; body: Block[]; updated_at: string }
type Color = "yellow" | "pink" | "peach" | "orange" | "lime" | "aqua" | "teal" | "lilac"
const COLORS: { id: Color; c: string; root: string }[] = [
  { id: "yellow", c: "#f7e36a", root: "#c9a92a" }, { id: "pink", c: "#f58cb4", root: "#d4588a" }, { id: "peach", c: "#f9b27e", root: "#d9814a" },
  { id: "orange", c: "#f6a04a", root: "#d2781c" }, { id: "lime", c: "#c8e86c", root: "#93b832" }, { id: "aqua", c: "#88dde0", root: "#3fb2b7" },
  { id: "teal", c: "#5ec6cb", root: "#2f9aa0" }, { id: "lilac", c: "#c6b6fb", root: "#8f78e8" },
]
const col = (c: Color) => COLORS.find(x => x.id === c) ?? COLORS[0]
const hex = (c: Color) => col(c).c
const MARKS = [["#fff27a", "Yellow"], ["#ffc2dc", "Pink"], ["#c9f5b6", "Green"], ["#bfe3ff", "Blue"]] as const
const nid = () => { try { return crypto.randomUUID() } catch { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) } }
const newText = (html = ""): TextBlock => ({ type: "text", id: nid(), html })
const COLS = "id, kind, parent_id, title, color, pos, body, updated_at"

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
const readNote = (n: any): Note => ({
  id: String(n.id), kind: n.kind === "tree" ? "tree" : "note", parent_id: n.parent_id ?? null, title: String(n.title ?? ""),
  color: COLORS.some(c => c.id === n.color) ? n.color : "yellow", pos: Number(n.pos) || 0, body: readBody(n.body), updated_at: String(n.updated_at ?? new Date().toISOString()),
})
const firstLine = (n: Note) => { const t = n.body.find((b): b is TextBlock => b.type === "text" && !!plain(b.html)); return t ? plain(t.html) : "" }
const drawings = (n: Note) => n.body.filter(b => b.type !== "text").length

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

/* ── a tree's shape: each idea's place under the roof, and the roots between them ── */
const PAD_W = 172, PAD_H = 150, GAP_X = 22, GAP_Y = 58, ROOF_H = 66
type Placed = { id: string; x: number; y: number }
function layoutTree(treeId: string, kids: (id: string) => Note[]) {
  const width = new Map<string, number>()
  const measure = (id: string): number => {
    const k = kids(id), w = k.length ? Math.max(PAD_W, k.reduce((s, c) => s + measure(c.id), 0) + GAP_X * (k.length - 1)) : PAD_W
    width.set(id, w); return w
  }
  const top = kids(treeId), inner = top.length ? top.reduce((s, c) => s + measure(c.id), 0) + GAP_X * (top.length - 1) : 0
  const roofW = Math.max(300, Math.min(560, inner || 300)), W = Math.max(roofW, inner), placed: Placed[] = []
  const roots: { from: [number, number]; to: [number, number]; id: string }[] = []
  const place = (list: Note[], left: number, y: number, from: [number, number]) => {
    const total = list.reduce((s, c) => s + width.get(c.id)!, 0) + GAP_X * (list.length - 1)
    let x = left - total / 2
    for (const c of list) {
      const w = width.get(c.id)!, cx = x + w / 2
      placed.push({ id: c.id, x: cx - PAD_W / 2, y }); roots.push({ from, to: [cx, y], id: c.id })
      place(kids(c.id), cx, y + PAD_H + GAP_Y, [cx, y + PAD_H])
      x += w + GAP_X
    }
  }
  place(top, W / 2, ROOF_H + GAP_Y, [W / 2, ROOF_H])
  const H = placed.length ? Math.max(...placed.map(p => p.y)) + PAD_H : ROOF_H + GAP_Y + 96
  return { W, H, roofW, placed, roots }
}
/** A root: a slightly wobbly curve down from the roof (or an idea) to the idea under it */
function rootPath(a: [number, number], b: [number, number], seed: string) {
  const R = rng(seed), dy = b[1] - a[1], w = () => (R() - 0.5) * 14
  return `M${a[0].toFixed(1)},${a[1].toFixed(1)} C${(a[0] + w()).toFixed(1)},${(a[1] + dy * 0.55).toFixed(1)} ${(b[0] + w()).toFixed(1)},${(b[1] - dy * 0.6).toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`
}

export default function BrainDumpPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("")
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [toast, setToast] = useState("")
  const [quick, setQuick] = useState("")
  const [side, setSide] = useState(false) // the side list on a phone
  const [shut, setShut] = useState<Set<string>>(new Set()) // trees folded away
  const [moving, setMoving] = useState<{ id: string; x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const focused = useRef<HTMLDivElement | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const timers = useRef(new Map<string, number>())
  const notesRef = useRef<Note[]>([])
  notesRef.current = notes ?? []
  const press = useRef<{ id: string; x: number; y: number; on: boolean } | null>(null)
  const dragged = useRef(false) // a drag just ended: the click that follows doesn't open the pad

  useEffect(() => { loadHand() }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t) }, [toast])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(t) }, [flash])
  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/", { replace: true }); return }
      setUser({ id: session.user.id })
      const { data, error } = await (supabase as any).from("notes").select(COLS).eq("user_id", session.user.id).order("pos", { ascending: true }).limit(2000)
      if (off) return
      if (error) { setNotes([]); setToast("Your ideas couldn't be loaded. Check your connection."); return }
      setNotes((data ?? []).map(readNote))
    })
    return () => { off = true }
  }, [navigate])
  // leaving with something unsaved: the browser asks first
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timers.current.size) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])

  /* ── the shape of everything: what hangs under what (an idea whose roof has gone sits on the line) ── */
  const all = notes ?? []
  const ids = useMemo(() => new Set(all.map(n => n.id)), [all])
  const parentOf = (n: Note) => (n.parent_id && ids.has(n.parent_id) ? n.parent_id : null)
  const kidsMap = useMemo(() => {
    const m = new Map<string | null, Note[]>()
    for (const n of all) { const p = n.parent_id && ids.has(n.parent_id) ? n.parent_id : null; m.set(p, [...(m.get(p) ?? []), n]) }
    for (const l of m.values()) l.sort((a, b) => a.pos - b.pos)
    return m
  }, [all, ids])
  const kids = (id: string | null) => kidsMap.get(id) ?? []
  const trees = kids(null).filter(n => n.kind === "tree")
  const line = kids(null).filter(n => n.kind === "note")
  const under = (id: string): Note[] => kids(id).flatMap(k => [k, ...under(k.id)])
  const treeOf = (n: Note | undefined): Note | null => { let c = n; for (let i = 0; c && i < 50; i++) { if (c.kind === "tree") return c; const p = parentOf(c); c = p ? all.find(x => x.id === p) : undefined } return null }
  const term = q.trim().toLowerCase()
  const hit = (n: Note) => !term || n.title.toLowerCase().includes(term) || n.body.some(b => b.type === "text" && plain(b.html).toLowerCase().includes(term))

  /* ── saving: a moment after every change ── */
  const save = async (id: string) => {
    timers.current.delete(id)
    const n = notesRef.current.find(x => x.id === id)
    if (!n) return
    setStatus("saving")
    const { error } = await (supabase as any).from("notes").update({ title: n.title.slice(0, 120), color: n.color, pos: n.pos, parent_id: n.parent_id, body: n.body, updated_at: new Date().toISOString() }).eq("id", id)
    if (error) { setStatus("error"); reportError(error, "note_save"); return }
    if (!timers.current.size) setStatus("saved")
  }
  const change = (id: string, fn: (n: Note) => Note, wait = 700) => {
    setNotes(ns => (ns ?? []).map(n => (n.id === id ? fn(n) : n)))
    setStatus("saving")
    window.clearTimeout(timers.current.get(id)); timers.current.set(id, window.setTimeout(() => save(id), wait))
  }
  const add = async (kind: Kind, parent: string | null, title = "", front = false): Promise<Note | null> => {
    if (!user) return null
    if (notesRef.current.length >= 2000) { setToast("You've reached 2,000 ideas. Delete a few to add more."); return null }
    const sib = notesRef.current.filter(n => (n.parent_id ?? null) === parent && n.kind === kind)
    const pos = front ? Math.min(0, ...sib.map(n => n.pos)) - 1 : Math.max(0, ...sib.map(n => n.pos)) + 1
    const used = notesRef.current.filter(n => n.kind === kind).length
    const color = kind === "tree" ? (["lime", "aqua", "pink", "orange", "lilac", "yellow"] as Color[])[used % 6] : COLORS[used % COLORS.length].id
    const n: Note = { id: nid(), kind, parent_id: parent, title, color, pos, body: [newText()], updated_at: new Date().toISOString() }
    setNotes(ns => [...(ns ?? []), n])
    const { error } = await (supabase as any).from("notes").insert({ id: n.id, kind, parent_id: parent, title, color, pos, body: n.body })
    if (error) {
      setNotes(ns => (ns ?? []).filter(x => x.id !== n.id))
      setToast(/limit/.test(error.message || "") ? "You've reached 2,000 ideas." : kind === "tree" ? "Couldn't plant the tree. Try again." : "Couldn't save that idea. Try again.")
      return null
    }
    track(kind === "tree" ? "tree_planted" : "note_created")
    return n
  }
  const dump = async () => {
    const t = quick.trim()
    if (!t) return
    setQuick("")
    await add("note", null, t.slice(0, 120), true)
    quickRef.current?.focus()
  }
  const plant = async () => {
    const t = await add("tree", null, "", true)
    if (t) { setShut(s => { const c = new Set(s); c.delete(t.id); return c }); setTimeout(() => (document.querySelector(`[data-roof="${t.id}"] input`) as HTMLInputElement | null)?.focus(), 60) }
  }
  const addUnder = async (parent: string) => { const n = await add("note", parent); if (n) setOpen(n.id) }
  /** Hangs an idea somewhere else: under a tree's roof, under another idea, or back on the line. Ideas under it come along. */
  const moveTo = (id: string, parent: string | null) => {
    const n = notesRef.current.find(x => x.id === id)
    if (!n || n.kind === "tree" || n.parent_id === parent) return
    if (parent === id || under(id).some(k => k.id === parent)) return // not under itself
    const sib = notesRef.current.filter(x => (x.parent_id ?? null) === parent && x.kind === "note" && x.id !== id)
    const pos = parent === null ? Math.min(0, ...sib.map(x => x.pos)) - 1 : Math.max(0, ...sib.map(x => x.pos)) + 1
    change(id, x => ({ ...x, parent_id: parent, pos }), 0)
    const t = parent ? treeOf(notesRef.current.find(x => x.id === parent)) : null
    setToast(t ? `Filed under “${t.title || "Untitled tree"}”` : "Back on the line")
    track("note_moved", { to: parent ? "tree" : "line" })
  }
  /** Deleting: an idea's own ideas move up to where it hung; a tree's ideas all go back on the line */
  const remove = async (id: string) => {
    setConfirmDel(null)
    const n = notesRef.current.find(x => x.id === id)
    if (!n) return
    window.clearTimeout(timers.current.get(id)); timers.current.delete(id)
    const moved = n.kind === "tree" ? under(id) : kids(id)
    const to = n.kind === "tree" ? null : (n.parent_id ?? null)
    for (const k of moved) {
      const { error } = await (supabase as any).from("notes").update({ parent_id: to }).eq("id", k.id)
      if (error) { setToast("Couldn't delete it. Try again."); return }
    }
    const { error } = await (supabase as any).from("notes").delete().eq("id", id)
    if (error) { setToast("Couldn't delete it. Try again."); return }
    const keep = new Set(moved.map(k => k.id))
    setNotes(ns => (ns ?? []).filter(x => x.id !== id).map(x => (keep.has(x.id) ? { ...x, parent_id: to } : x)))
    if (open === id) setOpen(null)
    if (n.kind === "tree" && moved.length) setToast(`${moved.length} idea${moved.length === 1 ? "" : "s"} back on the line`)
  }
  const close = () => {
    const n = notesRef.current.find(x => x.id === open)
    // an idea left empty goes away
    if (n && !n.title.trim() && n.body.every(b => b.type === "text" && !plain(b.html)) && !kids(n.id).length) remove(n.id)
    else if (open && timers.current.has(open)) { window.clearTimeout(timers.current.get(open)); save(open) }
    setOpen(null); setConfirmDel(null)
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (moving) { setMoving(null); return }
      if (open && !(e.target as HTMLElement)?.closest?.(".bd-map, .bd-dia")) close()
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  })

  /* ── dragging a pad (mouse or pen; on a phone, the Move button does it) ── */
  const dropAt = (x: number, y: number) => {
    const el = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-drop]") as HTMLElement | null
    return el?.dataset.drop ?? null
  }
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.on && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 7) return
      p.on = true
      setDrag({ id: p.id, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY) })
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      press.current = null
      if (!p || !p.on) return
      dragged.current = true; setTimeout(() => { dragged.current = false }, 0)
      setDrag(null)
      const t = dropAt(e.clientX, e.clientY)
      if (t === "line") moveTo(p.id, null)
      else if (t?.startsWith("tree:")) moveTo(p.id, t.slice(5))
      else if (t?.startsWith("note:") && t.slice(5) !== p.id) moveTo(p.id, t.slice(5))
    }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
  })
  const padDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || e.pointerType === "touch" || (e.target as HTMLElement).closest(".bd-pad-move")) return
    e.preventDefault()
    press.current = { id, x: e.clientX, y: e.clientY, on: false }
  }

  const note = all.find(n => n.id === open) ?? null
  const noteTree = note ? treeOf(note) : null
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
  const goTo = (id: string) => {
    setSide(false)
    const n = all.find(x => x.id === id)
    if (!n) return
    if (n.kind === "note") { setOpen(id); return }
    setShut(s => { const c = new Set(s); c.delete(id); return c })
    setFlash(id)
    setTimeout(() => document.querySelector(`[data-roof="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 40)
  }

  const pad = (n: Note, inTree = false) => {
    const c = col(n.color), d = drawings(n), sub = kids(n.id).length, words = firstLine(n)
    return (
      <div key={n.id} className={`bd-pad${drag?.id === n.id ? " lifted" : ""}${drag && drag.over === `note:${n.id}` && drag.id !== n.id ? " target" : ""}${term && !hit(n) ? " dim" : ""}`}
        data-drop={inTree ? `note:${n.id}` : "line"} data-pad={n.id} style={{ ["--pad" as any]: c.c, ["--pin" as any]: c.root }}>
        {!inTree && <span className="bd-pin" aria-hidden="true" />}
        <button className="bd-pad-face" onPointerDown={e => padDown(e, n.id)} onClick={() => { if (!dragged.current) setOpen(n.id) }} aria-label={`Open ${n.title || "Untitled idea"}`}>
          <h3>{n.title || "Untitled"}</h3>
          {words && <p>{words}</p>}
          <small>{new Date(n.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}{d > 0 && <><span>·</span><Shapes size={12} /> {d}</>}{sub > 0 && <><span>·</span><GitFork size={12} /> {sub}</>}</small>
        </button>
        <button className="bd-pad-move" aria-label={`Move ${n.title || "this idea"}`} title="Move to a tree, under an idea, or back on the line"
          onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMoving({ id: n.id, x: Math.min(r.left, window.innerWidth - 290), y: r.bottom + 6 }) }}><MoveRight size={14} /></button>
      </div>
    )
  }

  const nIdeas = all.filter(n => n.kind === "note").length
  return (
    <div className={`bd${drag ? " dragging" : ""}`}>
      <style>{`
        .bd { height: 100vh; display: grid; grid-template-columns: 276px minmax(0, 1fr); background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; overflow: hidden; }
        .bd * { box-sizing: border-box; }
        .bd.dragging, .bd.dragging * { cursor: grabbing !important; user-select: none; }
        .bd-side { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; }
        .bd-side-top { display: flex; align-items: center; gap: 10px; padding: 14px 14px 10px; }
        .bd-side-top b { font: 800 15px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase; }
        .bd-icon { width: 34px; height: 34px; border-radius: 10px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
        .bd-icon:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        .bd-acts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 4px 14px 12px; }
        .bd-btn { height: 38px; border-radius: 11px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: 600 13px 'Inter', sans-serif; cursor: pointer; padding: 0 12px; white-space: nowrap; }
        .bd-btn:hover { border-color: ${TEXT_MUTED}; }
        .bd-btn.pri { background: ${ACCENT_SOLID}; color: #0a0c0f; border-color: transparent; font-weight: 700; }
        .bd-search { margin: 0 14px 10px; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 11px; border-radius: 10px; background: ${SURFACE_BASE}; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; }
        .bd-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 500 13.5px 'Inter', sans-serif; }
        .bd-list { flex: 1; overflow-y: auto; padding: 4px 8px 16px; }
        .bd-cap { display: flex; align-items: center; justify-content: space-between; margin: 14px 8px 6px; font: 600 10.5px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .bd-row { width: 100%; display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 6px 8px; border-radius: 9px; border: none; background: none; color: ${TEXT_PRIMARY}; font: 500 13.5px 'Inter', sans-serif; text-align: left; cursor: pointer; }
        .bd-row:hover, .bd-row[aria-current="true"] { background: ${SURFACE_2}; }
        .bd-row:disabled { opacity: .4; cursor: default; background: none; }
        .bd-row span.t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bd-row em { font-style: normal; font-size: 11.5px; color: ${TEXT_MUTED}; }
        .bd-row.sub { padding-left: 30px; font-size: 13px; color: ${TEXT_MUTED}; position: relative; }
        .bd-row.sub::before { content: ""; position: absolute; left: 17px; top: 0; bottom: 50%; width: 9px; border-left: 1.5px solid ${DS_BORDER}; border-bottom: 1.5px solid ${DS_BORDER}; border-bottom-left-radius: 6px; }
        .bd-dot { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
        .bd-none { margin: 4px 8px; font-size: 12.5px; color: ${TEXT_MUTED}; line-height: 1.5; }
        .bd-foot { padding: 10px 16px 14px; border-top: 1px solid ${DS_BORDER}; font-size: 12px; color: ${TEXT_MUTED}; display: flex; gap: 8px; align-items: center; }
        .bd-main { min-width: 0; overflow-y: auto; position: relative; }
        .bd-bar { display: none; }
        .bd-head { padding: 40px 44px 8px; display: flex; align-items: flex-end; gap: 20px; }
        .bd-kick { font: 600 11px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .2em; text-transform: uppercase; color: ${ACCENT_SOLID}; }
        .bd-head h1 { margin: 8px 0 0; font: 700 50px/1.02 ${HAND}; letter-spacing: -.01em; }
        .bd-head p { margin: 10px 0 0; max-width: 620px; color: ${TEXT_MUTED}; font-size: 15px; line-height: 1.55; }
        .bd-saved { margin-left: auto; font-size: 12px; color: ${TEXT_MUTED}; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; padding-bottom: 6px; }
        .bd-sec { padding: 26px 44px 6px; }
        .bd-sec-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
        .bd-sec-head h2 { margin: 0; font: 800 22px 'Barlow Condensed', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
        .bd-sec-head span { font-size: 12.5px; color: ${TEXT_MUTED}; }
        .bd-sec-head .bd-btn { margin-left: auto; }
        .bd-line { position: relative; display: flex; gap: 20px; overflow-x: auto; padding: 26px 6px 26px; scroll-snap-type: x proximity; border-radius: 18px; transition: background .16s, box-shadow .16s; scrollbar-width: thin; }
        .bd-line::before { content: ""; position: absolute; left: 0; right: 0; top: 23px; height: 2px; background: repeating-linear-gradient(90deg, ${DS_BORDER} 0 10px, transparent 10px 16px); pointer-events: none; }
        .bd.dragging .bd-line.over { background: rgba(215,255,60,.06); box-shadow: inset 0 0 0 2px ${ACCENT_SOLID}; }
        .bd-pad { position: relative; flex-shrink: 0; width: ${PAD_W}px; height: ${PAD_H}px; scroll-snap-align: start; transition: transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s; }
        .bd-pad.dim { opacity: .28; }
        .bd-pad.lifted { opacity: .35; }
        .bd-pad.target .bd-pad-face { box-shadow: 0 0 0 3px ${ACCENT_SOLID}, 0 18px 30px -12px rgba(0,0,0,.6); transform: translateY(-3px); }
        .bd-pad-face { width: 100%; height: 100%; border: none; border-radius: 3px 3px 16px 3px; padding: 18px 16px 12px; text-align: left; cursor: grab; color: #1b1a17; background: var(--pad);
          box-shadow: 0 1px 1px rgba(0,0,0,.12), 0 12px 22px -10px rgba(0,0,0,.45); display: flex; flex-direction: column; gap: 6px; overflow: hidden; position: relative; transition: transform .2s cubic-bezier(.2,.8,.2,1), box-shadow .2s; touch-action: pan-x pan-y; }
        .bd-pad-face::after { content: ""; position: absolute; right: 0; bottom: 0; width: 24px; height: 24px; background: linear-gradient(135deg, rgba(0,0,0,.14), rgba(255,255,255,.35) 55%, transparent 56%); border-top-left-radius: 14px; }
        .bd-pad-face:hover { transform: translateY(-3px); box-shadow: 0 2px 2px rgba(0,0,0,.12), 0 20px 30px -14px rgba(0,0,0,.55); }
        .bd-pad-face:focus-visible { outline: 3px solid ${ACCENT_SOLID}; outline-offset: 3px; }
        .bd-pad-face h3 { margin: 0; font: 700 21px/1.1 ${HAND}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
        .bd-pad-face p { margin: 0; font: 400 12.5px/1.4 'Inter', sans-serif; opacity: .75; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .bd-pad-face small { margin-top: auto; font: 600 10.5px 'Inter', sans-serif; opacity: .55; display: flex; gap: 6px; align-items: center; }
        .bd-pin { position: absolute; z-index: 2; pointer-events: none; top: -9px; left: 50%; width: 14px; height: 14px; margin-left: -7px; border-radius: 50%; background: var(--pin); box-shadow: inset -2px -2px 0 rgba(0,0,0,.2), 0 2px 3px rgba(0,0,0,.35); }
        .bd-pad-move { position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; border-radius: 8px; border: none; background: rgba(27,26,23,.1); color: #1b1a17; display: grid; place-items: center; cursor: pointer; opacity: 0; transition: opacity .15s; }
        .bd-pad:hover .bd-pad-move, .bd-pad:focus-within .bd-pad-move { opacity: 1; }
        .bd-pad-move:hover { background: rgba(27,26,23,.2); }
        @media (hover: none) { .bd-pad-move { opacity: .9; } }
        .bd-quick { flex-shrink: 0; width: ${PAD_W}px; height: ${PAD_H}px; border-radius: 16px; border: 2px dashed ${DS_BORDER}; display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 14px; transition: border-color .16s; background: ${SURFACE_BASE}; position: relative; }
        .bd-quick:focus-within { border-color: ${ACCENT_SOLID}; border-style: solid; }
        .bd-quick input { border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 700 20px ${HAND}; width: 100%; }
        .bd-quick input::placeholder { color: ${TEXT_MUTED}; }
        .bd-quick small { font-size: 11px; color: ${TEXT_MUTED}; }
        .bd-tree { margin: 0 0 22px; border-radius: 20px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; overflow: hidden; transition: box-shadow .3s; }
        .bd-tree.flash { box-shadow: 0 0 0 3px ${ACCENT_SOLID}; }
        .bd-tree-top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 12px; border-bottom: 1px solid ${DS_BORDER}; }
        .bd-tree-top .grow { flex: 1; }
        .bd-tree-top em { font-style: normal; font-size: 12px; color: ${TEXT_MUTED}; }
        .bd-canvas { position: relative; overflow-x: auto; padding: 22px 26px 30px; }
        .bd-roof { position: absolute; height: ${ROOF_H}px; border-radius: 18px 18px 10px 10px; display: flex; align-items: center; gap: 10px; padding: 0 18px; color: #121316; box-shadow: 0 14px 26px -16px rgba(0,0,0,.6); transition: box-shadow .16s, transform .16s; }
        .bd-roof::before { content: ""; position: absolute; left: 14px; right: 14px; top: -9px; height: 12px; border-radius: 12px 12px 0 0; background: inherit; filter: brightness(.86); z-index: -1; }
        .bd-roof input { flex: 1; min-width: 0; border: none; outline: none; background: none; font: 700 26px ${HAND}; color: #121316; }
        .bd-roof input::placeholder { color: rgba(18,19,22,.45); }
        .bd.dragging .bd-roof.target { box-shadow: 0 0 0 3px ${ACCENT_SOLID}, 0 14px 26px -12px rgba(0,0,0,.6); transform: translateY(-2px); }
        .bd-roots { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
        .bd-empty-tree { position: absolute; border: 2px dashed ${DS_BORDER}; border-radius: 16px; display: grid; place-items: center; text-align: center; color: ${TEXT_MUTED}; font-size: 13px; padding: 10px; line-height: 1.5; }
        .bd-plant { border: 2px dashed ${DS_BORDER}; border-radius: 20px; padding: 26px; display: flex; align-items: center; gap: 18px; color: ${TEXT_MUTED}; }
        .bd-plant b { display: block; color: ${TEXT_PRIMARY}; font: 700 22px ${HAND}; margin-bottom: 2px; }
        .bd-confirm { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: ${TEXT_MUTED}; }
        .bd-confirm .bd-btn { height: 30px; font-size: 12px; }
        .bd-menu { position: fixed; z-index: 70; width: 280px; max-height: 360px; overflow-y: auto; padding: 6px; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; box-shadow: 0 22px 50px -18px rgba(0,0,0,.7); }
        .bd-menu p { margin: 6px 8px 4px; font: 600 10.5px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .bd-ghost { position: fixed; z-index: 80; width: 132px; height: 112px; border-radius: 3px 3px 14px 3px; padding: 12px; color: #1b1a17; font: 700 17px/1.1 ${HAND}; pointer-events: none; transform: translate(-50%, -60%) rotate(-4deg); box-shadow: 0 26px 40px -14px rgba(0,0,0,.6); overflow: hidden; }
        .bd-scrim { display: none; }
        @keyframes bd-in { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        .bd-sheet { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: var(--bd-paper); color: #1b1a17; animation: bd-in .32s cubic-bezier(.2,.8,.2,1) both; }
        .bd-sheet-top { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid rgba(27,26,23,.1); flex-wrap: wrap; }
        .bd-tb { height: 34px; min-width: 34px; padding: 0 9px; border-radius: 9px; border: none; background: transparent; color: #1b1a17; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; }
        .bd-tb:hover { background: rgba(27,26,23,.08); }
        .bd-tb.pill { background: rgba(27,26,23,.88); color: #fff; padding: 0 13px; border-radius: 999px; }
        .bd-crumb { font: 600 12px 'Inter', sans-serif; color: rgba(27,26,23,.6); display: inline-flex; align-items: center; gap: 5px; }
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
        .bd-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; padding: 10px 16px; border-radius: 999px; font: 500 13px 'Inter', sans-serif; z-index: 90; }
        @media (max-width: 860px) {
          .bd { grid-template-columns: minmax(0, 1fr); }
          .bd-side { position: fixed; z-index: 50; left: 0; top: 0; bottom: 0; width: min(300px, 86vw); transform: translateX(-102%); transition: transform .26s cubic-bezier(.2,.8,.2,1); }
          .bd-side.on { transform: none; box-shadow: 0 0 60px rgba(0,0,0,.5); }
          .bd-scrim { display: block; position: fixed; inset: 0; z-index: 45; background: rgba(0,0,0,.45); }
          .bd-bar { display: flex; align-items: center; gap: 8px; position: sticky; top: 0; z-index: 6; padding: 10px 12px; background: var(--ps-frost, ${SURFACE_BASE}); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); border-bottom: 1px solid ${DS_BORDER}; }
          .bd-bar b { flex: 1; font: 800 15px 'Barlow Condensed', sans-serif; letter-spacing: .14em; text-transform: uppercase; }
          .bd-head { padding: 22px 16px 4px; display: block; }
          .bd-head h1 { font-size: 36px; }
          .bd-saved { padding: 8px 0 0; }
          .bd-sec { padding: 20px 16px 4px; }
          .bd-title { font-size: 34px; } .bd-inner { padding: 22px 16px 100px; }
          .bd-sheet-top { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 8px 10px; } .bd-sheet-top::-webkit-scrollbar { display: none; } .bd-sheet-top > * { flex-shrink: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .bd-sheet, .bd-pad, .bd-pad-face, .bd-side { animation: none; transition: none; } }
      `}</style>

      {side && <div className="bd-scrim" onClick={() => setSide(false)} />}
      <aside className={`bd-side${side ? " on" : ""}`} aria-label="Your trees and ideas">
        <div className="bd-side-top">
          <button className="bd-icon" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={26} color={ACCENT_SOLID} /></button>
          <b>Brain Dump</b>
        </div>
        <div className="bd-acts">
          <button className="bd-btn pri" onClick={() => { setSide(false); quickRef.current?.focus() }} disabled={!user}><Plus size={15} /> New idea</button>
          <button className="bd-btn" onClick={() => { setSide(false); plant() }} disabled={!user}><Sprout size={15} /> Plant a tree</button>
        </div>
        <label className="bd-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your ideas" aria-label="Search your ideas" />{q && <button className="bd-icon" style={{ width: 22, height: 22 }} aria-label="Clear search" onClick={() => setQ("")}><X size={13} /></button>}</label>
        <nav className="bd-list">
          <div className="bd-cap"><span>Trees</span><span>{trees.length || ""}</span></div>
          {trees.length === 0 && <p className="bd-none">No trees yet. Plant one to give a group of ideas a roof.</p>}
          {trees.map(t => {
            const inside = under(t.id).filter(hit), isShut = shut.has(t.id)
            if (term && !hit(t) && !inside.length) return null
            return (
              <div key={t.id}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <button className="bd-row" onClick={() => goTo(t.id)}>
                    <span className="bd-dot" style={{ background: hex(t.color) }} />
                    <span className="t">{t.title || "Untitled tree"}</span><em>{under(t.id).length}</em>
                  </button>
                  <button className="bd-icon" style={{ width: 28, height: 28 }} aria-label={isShut ? "Show its ideas" : "Hide its ideas"}
                    onClick={() => setShut(s => { const c = new Set(s); if (c.has(t.id)) c.delete(t.id); else c.add(t.id); return c })}>
                    {isShut ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>
                {!isShut && (term ? inside : under(t.id)).map(n => (
                  <button key={n.id} className="bd-row sub" aria-current={open === n.id} onClick={() => goTo(n.id)}><span className="t">{n.title || "Untitled"}</span></button>
                ))}
              </div>
            )
          })}
          <div className="bd-cap"><span>On the line</span><span>{line.length || ""}</span></div>
          {line.length === 0 && <p className="bd-none">Every idea you dump lands here first.</p>}
          {line.filter(hit).map(n => (
            <button key={n.id} className="bd-row" aria-current={open === n.id} onClick={() => goTo(n.id)}>
              <span className="bd-dot" style={{ background: hex(n.color) }} /><span className="t">{n.title || "Untitled"}</span>
              <em>{new Date(n.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</em>
            </button>
          ))}
        </nav>
        <div className="bd-foot">{notes === null ? "Loading…" : `${nIdeas} idea${nIdeas === 1 ? "" : "s"} · ${trees.length} tree${trees.length === 1 ? "" : "s"}`}</div>
      </aside>

      <main className="bd-main">
        <div className="bd-bar">
          <button className="bd-icon" aria-label="Your trees and ideas" onClick={() => setSide(true)}><Menu size={18} /></button>
          <b>Brain Dump</b>
          <button className="bd-icon" aria-label="Plant a tree" onClick={plant}><Sprout size={17} /></button>
        </div>
        <header className="bd-head">
          <div>
            <div className="bd-kick">Brain Dump · your ideas studio</div>
            <h1>Dump it. Then give it roots.</h1>
            <p>Throw every idea onto the line as fast as it comes. When a few belong together, plant a tree and hang them under its roof.</p>
          </div>
          <span className="bd-saved" aria-live="polite">{status === "saving" ? <><Loader2 size={12} className="an-spin" /> Saving</> : status === "saved" ? <><Check size={12} /> Saved</> : status === "error" ? <span style={{ color: DS_ERROR }}>Not saved. Check your connection.</span> : ""}</span>
        </header>

        <section className="bd-sec" aria-label="On the line">
          <div className="bd-sec-head"><h2>On the line</h2><span>{line.length ? `${line.length} idea${line.length === 1 ? "" : "s"} · drag one onto a tree to file it` : "Type an idea and press Enter"}</span></div>
          <div className={`bd-line${drag?.over === "line" ? " over" : ""}`} data-drop="line">
            <div className="bd-quick">
              <input ref={quickRef} value={quick} maxLength={120} placeholder="Dump an idea…" aria-label="Dump an idea" disabled={!user}
                onChange={e => setQuick(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); dump() } }} />
              <small>Enter adds it. Keep typing for the next.</small>
            </div>
            {line.filter(hit).map(n => pad(n))}
          </div>
        </section>

        <section className="bd-sec" aria-label="Trees">
          <div className="bd-sec-head"><h2>Trees</h2><span>{trees.length ? "Ideas under a roof" : ""}</span>{trees.length > 0 && <button className="bd-btn" onClick={plant}><Sprout size={15} /> Plant a tree</button>}</div>
          {notes !== null && trees.length === 0 && (
            <div className="bd-plant">
              <Sprout size={34} color={ACCENT_SOLID} />
              <div style={{ flex: 1 }}><b>Plant your first tree</b>A roof for ideas that belong together: “Pressing triggers”, “Next video”, “Barça build-up”. Drag pads under it and they grow roots.</div>
              <button className="bd-btn pri" onClick={plant}><Sprout size={15} /> Plant a tree</button>
            </div>
          )}
          {trees.map(t => {
            const L = layoutTree(t.id, kids), c = col(t.color), isShut = shut.has(t.id), n = under(t.id).length
            return (
              <div key={t.id} className={`bd-tree${flash === t.id ? " flash" : ""}`}>
                <div className="bd-tree-top">
                  <button className="bd-icon" aria-label={isShut ? "Show the tree" : "Fold the tree"} onClick={() => setShut(s => { const x = new Set(s); if (x.has(t.id)) x.delete(t.id); else x.add(t.id); return x })}>{isShut ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
                  <em>{n} idea{n === 1 ? "" : "s"}</em>
                  <span className="grow" />
                  {COLORS.slice(0, 8).map(x => <button key={x.id} className="bd-swatch" style={{ width: 16, height: 16, borderRadius: 5, background: x.c, borderWidth: t.color === x.id ? 2 : 1, borderColor: t.color === x.id ? TEXT_PRIMARY : "rgba(0,0,0,.25)" }} aria-label={`Tree colour ${x.id}`} aria-pressed={t.color === x.id} onClick={() => change(t.id, y => ({ ...y, color: x.id }))} />)}
                  <button className="bd-btn" style={{ height: 32 }} onClick={() => addUnder(t.id)}><Plus size={14} /> Idea</button>
                  {confirmDel === t.id
                    ? <span className="bd-confirm">Its ideas go back on the line. <button className="bd-btn" style={{ background: DS_ERROR, color: "#fff", borderColor: "transparent" }} onClick={() => remove(t.id)}>Delete tree</button><button className="bd-btn" onClick={() => setConfirmDel(null)}>Keep</button></span>
                    : <button className="bd-icon" aria-label="Delete tree" title="Delete tree" onClick={() => setConfirmDel(t.id)}><Trash2 size={15} /></button>}
                </div>
                {!isShut && (
                  <div className="bd-canvas">
                    <div style={{ position: "relative", width: L.W, height: L.H, margin: "0 auto" }}>
                      <svg className="bd-roots" width={L.W} height={L.H} aria-hidden="true">
                        {L.roots.map(r => <path key={r.id} d={rootPath(r.from, r.to, r.id)} fill="none" stroke={c.root} strokeWidth={3} strokeLinecap="round" opacity={0.85} />)}
                        {L.roots.map(r => <circle key={"k" + r.id} cx={r.to[0]} cy={r.to[1] - 2} r={4} fill={c.root} />)}
                      </svg>
                      <div className={`bd-roof${drag && drag.over === `tree:${t.id}` ? " target" : ""}`} data-drop={`tree:${t.id}`} data-roof={t.id}
                        style={{ left: (L.W - L.roofW) / 2, top: 0, width: L.roofW, background: c.c }}>
                        <Sprout size={20} />
                        <input value={t.title} maxLength={120} placeholder="Name this tree" aria-label="Tree name" onChange={e => change(t.id, y => ({ ...y, title: e.target.value }))} />
                      </div>
                      {L.placed.length === 0 && (
                        <div className="bd-empty-tree" data-drop={`tree:${t.id}`} style={{ left: (L.W - 280) / 2, top: ROOF_H + GAP_Y, width: 280, height: 96 }}>Drag ideas from the line onto the roof, or press “+ Idea”.</div>
                      )}
                      {L.placed.map(p => { const x = all.find(y => y.id === p.id)!; return <div key={p.id} style={{ position: "absolute", left: p.x, top: p.y }}>{pad(x, true)}</div> })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <div style={{ height: 60 }} />
        </section>
      </main>

      {moving && (() => {
        const n = all.find(x => x.id === moving.id)
        if (!n) return null
        const no = new Set([n.id, ...under(n.id).map(k => k.id)])
        return (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 65 }} onClick={() => setMoving(null)} />
            <div className="bd-menu" role="menu" aria-label="Move to" style={{ left: Math.max(8, moving.x), top: Math.min(moving.y, window.innerHeight - 370) }}>
              <p>Move “{n.title || "Untitled"}” to</p>
              <button role="menuitem" className="bd-row" disabled={!n.parent_id} onClick={() => { moveTo(n.id, null); setMoving(null) }}><span className="bd-dot" style={{ background: "transparent", border: `1.5px dashed ${TEXT_MUTED}` }} /><span className="t">On the line</span></button>
              {trees.map(t => (
                <div key={t.id}>
                  <button role="menuitem" className="bd-row" disabled={n.parent_id === t.id} onClick={() => { moveTo(n.id, t.id); setMoving(null) }}><span className="bd-dot" style={{ background: hex(t.color) }} /><span className="t">{t.title || "Untitled tree"}</span></button>
                  {under(t.id).filter(k => !no.has(k.id)).map(k => (
                    <button key={k.id} role="menuitem" className="bd-row sub" disabled={n.parent_id === k.id} onClick={() => { moveTo(n.id, k.id); setMoving(null) }}><span className="t">under “{k.title || "Untitled"}”</span></button>
                  ))}
                </div>
              ))}
              {trees.length === 0 && <button role="menuitem" className="bd-row" onClick={async () => { setMoving(null); const t = await add("tree", null, "", true); if (t) { moveTo(n.id, t.id); setTimeout(() => (document.querySelector(`[data-roof="${t.id}"] input`) as HTMLInputElement | null)?.focus(), 60) } }}><Sprout size={14} /><span className="t">Plant a new tree for it</span></button>}
            </div>
          </>
        )
      })()}
      {drag && (() => { const n = all.find(x => x.id === drag.id); return n ? <div className="bd-ghost" style={{ left: drag.x, top: drag.y, background: hex(n.color) }}>{n.title || "Untitled"}</div> : null })()}

      {note && (
        <div className="bd-sheet" role="dialog" aria-label={note.title || "Idea"} style={{ ["--bd-paper" as any]: `color-mix(in srgb, ${hex(note.color)} 22%, #fbfaf6)` }}>
          <div className="bd-sheet-top" onPointerDown={e => { if ((e.target as HTMLElement).closest("button")) e.preventDefault() }}>
            <button className="bd-tb" onClick={close} aria-label="Back to Brain Dump"><ArrowLeft size={17} /> Brain Dump</button>
            <span className="bd-crumb">{noteTree ? <><Sprout size={13} /> {noteTree.title || "Untitled tree"}</> : "On the line"}</span>
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
            {confirmDel === note.id
              ? <><button className="bd-tb pill" style={{ background: DS_ERROR }} onClick={() => remove(note.id)}>Delete idea</button><button className="bd-tb" onClick={() => setConfirmDel(null)}>Keep</button></>
              : <button className="bd-tb" aria-label="Delete idea" title="Delete idea" onClick={() => setConfirmDel(note.id)}><Trash2 size={16} /></button>}
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
