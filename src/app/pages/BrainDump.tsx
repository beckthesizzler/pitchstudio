import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router"
import { ArrowLeft, Bold, Check, GitFork, Heading, Highlighter, Italic, Link2, List, ListOrdered, Loader2, MoreHorizontal, Layers, Palette, PenLine, Plus, Search, Sprout, Trash2, Type, Unlink, X } from "lucide-react"
import { supabase } from "../lib/supabase"
import { reportError, track } from "../lib/telemetry"
import { listName, type PieceKind } from "../lib/names"
import { Mark as PSMark } from "../brand/Mark"
import { MindMap, newMap } from "../braindump/MindMap"
import { Diagram, newDiagram } from "../braindump/Diagram"
import { HAND, loadHand } from "../braindump/sketch"
import { COLORS, COLS, STATUSES, clean, col, firstLine, hex, madeLabel, nameOf, newText, nid, plain, readNote, type Block, type Color, type Kind, type Note, type Status, type TextBlock } from "../braindump/notes"
import { Banner, PIN, Popover, STACK_W, THREAD, TILTS, Threads, layoutColumn, plantStage, type Row } from "../braindump/Wall"
import { PLANT_CSS, Plant, TreeView, type Stage } from "../braindump/Plant"
import { GROW_CSS, GrowPanel } from "../braindump/Grow"
import { FREE_CSS, FreeWall, NOTE_H, NOTE_W, type Centre, type Move, type Rect } from "../braindump/Canvas"
import { LOOK_CSS, LookPanel } from "../braindump/Look"
import { TREE_CSS, WallTree } from "../braindump/WallTree"
import { DEFAULT_LOOK, WALL_COLS, mainWall, photoUrl, readWall, uploadPhoto, wallSurface, type Look, type View, type Wall } from "../braindump/walls"
import { AllWalls } from "../braindump/AllWalls"
import { ACCENT_SOLID, ACCENT_INK, TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, DS_ERROR } from "../theme"

const MONO = "'JetBrains Mono', ui-monospace, monospace"

/* Dump & Arrange ("/braindump"): your wall of ideas. Pin a note as fast as it comes. On the Wall every note sits where
   you put it; piles (notes of kind "tree") are frames you move and resize. Columns shows the same notes as one column
   per pile. Drag a note onto another and a red thread ties them; every tie grows the pile's plant from seed to tree,
   and the plant opens the tree view (/braindump?tree=ID&view=tree). Open any note and it's a page to think on: writing
   with a highlighter, and mind maps and diagrams drawn as if by hand. Each wall keeps its own look. */

const MARKS = [["#fff27a", "Yellow"], ["#ffc2dc", "Pink"], ["#c9f5b6", "Green"], ["#bfe3ff", "Blue"]] as const
const STATUS_CAPS: Record<Status, string> = { idea: "IDEA", making: "MAKING", made: "MADE" }
const STAGE_WORD: Record<Stage, string> = { seed: "a seed", sprout: "a sprout", sapling: "a sapling", tree: "a tree" }
const LONG_PRESS = 420
const PHONE = () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches // a phone has no room for the panel: a tap opens the note

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

type Column = { id: string; pile: Note | null; rows: Row[]; height: number; ties: number }
type Menu = { kind: "note" | "pile"; id: string; x: number; y: number; sub?: "made" | "delete" }
type Piece = { ref: string; kind: PieceKind; title: string; updated: string }

/** "/braindump" is All walls; "/braindump/w/:wallId" is one wall ("main": your main wall) */
export default function BrainDumpPage() {
  const { wallId } = useParams()
  return wallId ? <WallPage key={wallId} wallId={wallId} /> : <AllWalls />
}

type Crumb = { id: string; title: string }
type Inside = { wall: string; notes: number } // a note that opens into a wall: which one, and how many notes it holds

function WallPage({ wallId }: { wallId: string }) {
  const navigate = useNavigate()
  const loc = useLocation()
  const params = new URLSearchParams(loc.search)
  const treeView = params.get("view") === "tree" ? params.get("tree") : null
  const [user, setUser] = useState<{ id: string } | null>(null)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<"" | "saving" | "saved" | "error">("")
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [toast, setToast] = useState("")
  const [quick, setQuick] = useState("")
  const [menu, setMenu] = useState<Menu | null>(null)
  const [growing, setGrowing] = useState(true) // "Grow this idea" beside the tree (closed until the next tree once you close it)
  const [makingFor, setMakingFor] = useState<string | null>(null) // the pile a report is being made from
  const [renaming, setRenaming] = useState<string | null>(null) // a pile whose name tag is being typed into
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [popped, setPopped] = useState<Set<string>>(new Set()) // piles whose plant just grew
  const [pieces, setPieces] = useState<Piece[] | null>(null) // your recent boards, reports and analyses, for "what it became"
  const [loadFailed, setLoadFailed] = useState(false)
  const [sel, setSel] = useState<string | null>(null) // the note picked on the wall: it shows in the panel on the right
  const [selDel, setSelDel] = useState(false) // the panel's delete waiting for a yes
  const [tries, setTries] = useState(0)
  const [wall, setWall] = useState<Wall | null>(null)
  useEffect(() => { if (wall?.id) try { localStorage.setItem("ps-last-wall", wall.id) } catch { /* storage blocked */ } }, [wall?.id]) // Dump & Arrange opens here next time
  const [lookOpen, setLookOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null) // the link to see this wall's photo
  const [moving, setMoving] = useState(false) // something is being dragged on the free wall
  const centre = useRef<Centre>({ x: 200, y: 200 }) // the middle of what you're looking at, on the free wall
  const showOnWall = useRef<((id: string) => void) | null>(null)
  const wallTimer = useRef(0)
  const [treeEdit, setTreeEdit] = useState<string | null>(null) // a step being typed on the Tree
  const here = `/braindump/w/${wall?.id ?? wallId}` // this wall's address
  const [crumbs, setCrumbs] = useState<Crumb[]>([]) // the walls above this one, top first
  const [inside, setInside] = useState<Map<string, Inside>>(new Map())
  /** The path up to All walls, and which notes on this wall open into walls of their own */
  const loadAround = async (w: Wall) => {
    const db = supabase as any
    const [path, ws, cards] = await Promise.all([
      w.main ? Promise.resolve({ data: [] }) : db.rpc("wall_path", { w: w.id }),
      db.from("walls").select("id, note_id").limit(1000),
      db.rpc("wall_cards"),
    ])
    if (Array.isArray(path.data)) setCrumbs((path.data as any[]).filter(x => x.id !== w.id).map(x => ({ id: String(x.id), title: String(x.title ?? "") })))
    const count = new Map<string, number>(((cards.data ?? []) as any[]).map(c => [String(c.wall_id), Number(c.notes) || 0]))
    setInside(new Map(((ws.data ?? []) as any[]).filter(x => x.note_id).map(x => [String(x.note_id), { wall: String(x.id), notes: count.get(String(x.id)) ?? 0 }])))
  }
  /** A note's page, or (for a note that's a wall) the wall itself */
  const openNote = (id: string) => { const w = inside.get(id); if (w) navigate(`/braindump/w/${w.wall}`); else setOpen(id) }
  /** Turns a note into a wall of its own (named after the note, looking like this one) and goes in */
  const makeWall = async (noteId: string, made?: Note) => {
    const n = made ?? notesRef.current.find(x => x.id === noteId)
    if (!n || !wall) return
    if (inside.has(noteId)) { openNote(noteId); return }
    const id = nid()
    const { error } = await (supabase as any).from("walls").insert({ id, title: (n.title.trim() || nameOf(n)).slice(0, 80), note_id: noteId, look: { ...wall.look, photo: null, bg: wall.look.bg === "photo" ? DEFAULT_LOOK.bg : wall.look.bg } })
    if (error) { setToast(/limit/.test(error.message || "") ? "You have 1,000 walls. Delete a few to make another." : "Couldn't make the wall. Try again."); return }
    track("wall_made", { from: "note" })
    navigate(`/braindump/w/${id}`)
  }
  const newWallInside = async () => {
    const n = await add("note", null, "New wall", false, view === "wall" ? spot() : null)
    if (n) makeWall(n.id, n)
  }
  const failed = useRef(new Set<string>())
  const focused = useRef<HTMLDivElement | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const wallRef = useRef<HTMLDivElement>(null)
  const timers = useRef(new Map<string, number>())
  const notesRef = useRef<Note[]>([])
  notesRef.current = notes ?? []
  const press = useRef<{ id: string; x: number; y: number; on: boolean; touch: boolean; armed: boolean; timer: number } | null>(null)
  const dragged = useRef(false) // a drag (or a long-press) just ended: the click that follows doesn't open the page
  const stagesRef = useRef<Map<string, number> | null>(null)

  useEffect(() => { loadHand() }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t) }, [toast])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1400); return () => clearTimeout(t) }, [flash])
  useEffect(() => { if (!popped.size) return; const t = setTimeout(() => setPopped(new Set()), 600); return () => clearTimeout(t) }, [popped])
  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/", { replace: true }); return }
      setUser({ id: session.user.id })
      let w: Wall | null = null
      try {
        if (wallId === "main") w = await mainWall()
        else { const r = await (supabase as any).from("walls").select(WALL_COLS).eq("id", wallId).maybeSingle(); if (r.error) throw r.error; w = r.data ? readWall(r.data) : null }
      } catch (e) { reportError(e, "wall_load") }
      if (off) return
      if (!w) { if (wallId !== "main") { navigate("/braindump", { replace: true }); return } setLoadFailed(true); setNotes(n => n ?? []); return }
      if (wallId === "main") window.history.replaceState(window.history.state, "", `/braindump/w/${w.id}${window.location.search}`) // the address names the wall
      setWall(w)
      loadAround(w)
      const q = (supabase as any).from("notes").select(COLS).eq("user_id", session.user.id)
      const { data, error } = await (w.main ? q.or(`wall_id.is.null,wall_id.eq.${w.id}`) : q.eq("wall_id", w.id)).order("pos", { ascending: true }).limit(20000)
      if (off) return
      if (error) { reportError(error, "notes_load"); setLoadFailed(true); setNotes(n => n ?? []); return }
      setLoadFailed(false)
      setNotes((data ?? []).map(readNote))
      const sp = new URLSearchParams(window.location.search), want = sp.get("tree"), pick = sp.get("note")
      if (want && sp.get("view") !== "tree") setTimeout(() => showPile(want), 160) // opened from your shelf: that frame, lit up
      if (pick) setTimeout(() => { setSel(pick); showOnWall.current?.(pick); setFlash(pick) }, 200) // found by search on All walls
    })
    return () => { off = true }
  }, [navigate, tries]) // eslint-disable-line react-hooks/exhaustive-deps
  // leaving with something unsaved: the browser asks first
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (timers.current.size) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [])

  /* ── the shape of everything: what hangs off what (a note whose parent has gone is just pinned) ── */
  const all = notes ?? []
  const ids = useMemo(() => new Set(all.map(n => n.id)), [all])
  const byId = useMemo(() => new Map(all.map(n => [n.id, n])), [all])
  const parentOf = (n: Note) => (n.parent_id && ids.has(n.parent_id) ? n.parent_id : null)
  const kidsMap = useMemo(() => {
    const m = new Map<string | null, Note[]>()
    for (const n of all) { const p = n.parent_id && ids.has(n.parent_id) ? n.parent_id : null; m.set(p, [...(m.get(p) ?? []), n]) }
    for (const l of m.values()) l.sort((a, b) => a.pos - b.pos)
    return m
  }, [all, ids])
  const kids = useMemo(() => (id: string | null) => kidsMap.get(id) ?? [], [kidsMap])
  const under = useMemo(() => {
    const f = (id: string, seen = new Set<string>()): Note[] => kids(id).flatMap(k => (seen.has(k.id) ? [] : (seen.add(k.id), [k, ...f(k.id, seen)])))
    return (id: string) => f(id)
  }, [kids])
  const piles = kids(null).filter(n => n.kind === "tree")
  /** The pile a note sits in (following its threads up), or null when it's just pinned */
  const pileOf = (n: Note | undefined): Note | null => { let c = n; for (let i = 0; c && i < 60; i++) { if (c.kind === "tree") return c; const p = parentOf(c); c = p ? byId.get(p) : undefined } return null }
  const term = q.trim().toLowerCase()
  const hit = (n: Note) => !term || n.title.toLowerCase().includes(term) || n.body.some(b => b.type === "text" && plain(b.html).toLowerCase().includes(term))

  /** The wall: one column per pile in pos order, then Just pinned (with anything that lost its way) */
  const columns = useMemo<Column[]>(() => {
    const seen = new Set<string>(), out: Column[] = []
    const tally = (rows: Row[]) => rows.filter(r => r.depth > 0).length + rows.filter(r => !!r.note.made_ref).length
    for (const p of piles) { const L = layoutColumn(kids(p.id), kids, seen); out.push({ id: p.id, pile: p, rows: L.rows, height: L.height, ties: tally(L.rows) }) }
    const L = layoutColumn(kids(null).filter(n => n.kind === "note"), kids, seen)
    const lost = all.filter(n => n.kind === "note" && !seen.has(n.id)) // only a loop of threads ends up here
    const M = layoutColumn(lost, () => [], seen)
    const rows = [...L.rows, ...M.rows.map(r => ({ ...r, y: r.y + (L.rows.length ? L.height + 12 : 0) }))]
    out.push({ id: "pinned", pile: null, rows, height: L.height + (M.rows.length ? M.height + (L.rows.length ? 12 : 0) : 0), ties: 0 })
    return out
  }, [all, piles, kids]) // eslint-disable-line react-hooks/exhaustive-deps
  const stageOf = (c: Column) => plantStage(c.ties)

  // a pile that reaches a bigger plant pops, and says so
  useEffect(() => {
    if (notes === null) return
    const now = new Map(columns.filter(c => c.pile).map(c => [c.id, stageOf(c).rank as number]))
    const before = stagesRef.current
    stagesRef.current = now
    if (!before) return
    const grew = columns.filter(c => c.pile && before.has(c.id) && now.get(c.id)! > before.get(c.id)!)
    if (!grew.length) return
    setPopped(new Set(grew.map(c => c.id)))
    const g = grew[0]
    setToast(`${nameOf(g.pile!)} grew into ${STAGE_WORD[stageOf(g).id as Stage]}.`)
    track("pile_grew", { stage: stageOf(g).id })
  }, [columns]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── saving: a moment after every change ── */
  const inFlight = useRef(0)
  const save = async (id: string) => {
    timers.current.delete(id)
    const n = notesRef.current.find(x => x.id === id)
    if (!n) return
    setStatus("saving")
    if (inFlight.current >= 6) { timers.current.set(id, window.setTimeout(() => save(id), 120)); return } // a few at a time: laying out a big wall saves hundreds of spots
    inFlight.current++
    let error: any = null
    try { ({ error } = await (supabase as any).from("notes").update({ title: n.title.slice(0, 120), color: n.color, pos: n.pos, parent_id: n.parent_id, body: n.body, status: n.status, made_ref: n.made_ref, x: n.x, y: n.y, w: n.w, h: n.h }).eq("id", id)) }
    catch (e) { error = e }
    finally { inFlight.current-- }
    if (error) { failed.current.add(id); setStatus("error"); reportError(error, "note_save"); return }
    failed.current.delete(id)
    if (!timers.current.size && !failed.current.size) setStatus("saved")
  }
  /** Sends every note whose save didn't go through again */
  const retry = () => { for (const id of [...failed.current]) save(id) }
  const change = (id: string, fn: (n: Note) => Note, wait = 700) => {
    setNotes(ns => (ns ?? []).map(n => (n.id === id ? fn(n) : n)))
    setStatus("saving")
    window.clearTimeout(timers.current.get(id)); timers.current.set(id, window.setTimeout(() => save(id), wait))
  }
  /** Puts things where they were dropped on the free wall (and saves them a moment later) */
  const place = (moves: Move[], wait = 300) => {
    if (!moves.length) return
    const m = new Map(moves.map(x => [x.id, x]))
    setNotes(ns => (ns ?? []).map(n => { const v = m.get(n.id); return v ? { ...n, x: v.x, y: v.y, ...(v.w !== undefined ? { w: v.w, h: v.h ?? n.h } : {}) } : n }))
    setStatus("saving")
    for (const id of m.keys()) { window.clearTimeout(timers.current.get(id)); timers.current.set(id, window.setTimeout(() => save(id), wait)) }
  }
  /** A spot for a new note (or frame) on the free wall: the empty place nearest the middle of the view. Spots handed out in the
      last two seconds count as taken too, in case the wall hasn't drawn those yet. Before the wall is drawn: the middle, a little lower each time */
  const nextSpot = useRef(0), lent = useRef<{ r: Rect; t: number }[]>([])
  const spot = (w = NOTE_W, h = NOTE_H) => {
    const now = Date.now(), k = nextSpot.current++ % 6
    lent.current = lent.current.filter(l => now - l.t < 2000)
    const at = centre.current.free?.(w, h, lent.current.map(l => l.r)) ?? { x: Math.round(centre.current.x + k * 18), y: Math.round(centre.current.y + k * 22), off: false }
    lent.current.push({ r: { x: at.x, y: at.y, w, h }, t: now })
    return at
  }
  /** Adds a note or frame at a spot on the free wall; one that had to go past the edge of the view is brought into view */
  const addAt = async (kind: Kind, title: string, at: { x: number; y: number; off: boolean } | null) => {
    const n = await add(kind, null, title, true, at && { x: at.x, y: at.y })
    if (n && at?.off) setTimeout(() => showOnWall.current?.(n.id), 40)
    return n
  }
  const add = async (kind: Kind, parent: string | null, title = "", front = false, at: { x: number; y: number } | null = null): Promise<Note | null> => {
    if (!user || !wall) return null
    const sib = notesRef.current.filter(n => (n.parent_id ?? null) === parent && n.kind === kind)
    const pos = front ? Math.min(0, ...sib.map(n => n.pos)) - 1 : Math.max(0, ...sib.map(n => n.pos)) + 1
    const used = notesRef.current.filter(n => n.kind === kind).length
    const color = kind === "tree" ? (["lime", "aqua", "pink", "orange", "lilac", "yellow"] as Color[])[used % 6] : COLORS[used % COLORS.length].id
    const size = kind === "tree" && at ? { w: NOTE_W + 44, h: 190 } : { w: null, h: null }
    const n: Note = { id: nid(), kind, parent_id: parent, title, color, pos, body: [newText()], updated_at: new Date().toISOString(), status: "idea", made_ref: null, wall_id: wall.id, x: at?.x ?? null, y: at?.y ?? null, ...size }
    setNotes(ns => [...(ns ?? []), n])
    const { error } = await (supabase as any).from("notes").insert({ id: n.id, kind, parent_id: parent, title, color, pos, body: n.body, wall_id: wall.id, x: n.x, y: n.y, w: n.w, h: n.h })
    if (error) {
      setNotes(ns => (ns ?? []).filter(x => x.id !== n.id))
      setToast(/limit/.test(error.message || "") ? "You've reached 20,000 notes. Delete a few to add more." : kind === "tree" ? "Couldn't start the frame. Try again." : "Couldn't pin that note. Try again.")
      return null
    }
    track(kind === "tree" ? "tree_planted" : "note_created")
    return n
  }
  const dump = async () => {
    const t = quick.trim()
    if (!t) return
    setQuick("")
    const n = await addAt("note", t.slice(0, 120), view === "wall" ? spot() : null)
    quickRef.current?.focus()
    if (n && view !== "wall") document.querySelector('[data-col="pinned"]')?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })
  }
  const newPile = async () => {
    const t = await addAt("tree", "", view === "wall" ? spot(NOTE_W + 44, 190) : null)
    if (t) { setRenaming(t.id); setTimeout(() => showPile(t.id, false), 40) }
  }
  /** Scrolls the wall to a pile's column, and lights it up */
  const showPile = (id: string, light = true) => {
    if (view === "wall" && !treeView) showOnWall.current?.(id)
    else document.querySelector(`[data-col="${id}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
    if (light) setFlash(id)
  }
  /* ── the wall itself: its name, its look, the view it opens in ── */
  const view: View = wall?.view ?? "wall"
  const changeWall = (patch: Partial<Wall>, wait = 500) => {
    setWall(w => (w ? { ...w, ...patch } : w))
    window.clearTimeout(wallTimer.current)
    wallTimer.current = window.setTimeout(async () => {
      const w = wallRef2.current
      if (!w) return
      const { error } = await (supabase as any).from("walls").update({ title: w.title.slice(0, 80), look: w.look, view: w.view }).eq("id", w.id)
      if (error) { reportError(error, "wall_save"); setToast("Couldn't save the wall's look. Try again.") }
    }, wait)
  }
  const wallRef2 = useRef<Wall | null>(null)
  wallRef2.current = wall
  const [tried, setTried] = useState<Set<View>>(() => { try { return new Set(JSON.parse(localStorage.getItem("ps-wall-tried") || "[]")) } catch { return new Set() } }) // the views you've opened at least once
  const [startHidden, setStartHidden] = useState(() => { try { return localStorage.getItem("ps-wall-start") === "hidden" } catch { return false } })
  const setView = (v: View) => {
    if (treeView) navigate(here)
    if (!tried.has(v)) { const t = new Set(tried).add(v); setTried(t); try { localStorage.setItem("ps-wall-tried", JSON.stringify([...t])) } catch { /* not kept */ } }
    if (v !== view) { changeWall({ view: v }, 0); track("wall_view", { view: v }) }
  }
  useEffect(() => {
    let off = false
    const path = wall?.look.bg === "photo" ? wall.look.photo : null
    if (!path) { setPhoto(null); return }
    photoUrl(path).then(u => { if (!off) setPhoto(u) })
    return () => { off = true }
  }, [wall?.look.bg, wall?.look.photo])
  const addPhoto = async (f: File) => {
    if (!user || !wall) return
    const path = await uploadPhoto(user.id, f)
    changeWall({ look: { ...wall.look, bg: "photo", photo: path } }, 0)
    track("wall_photo")
  }
  /** Moves a note (and everything tied under it) to hang off a pile, another note, or nothing (Just pinned). To the end of that list. */
  const moveTo = (id: string, parent: string | null) => {
    const n = notesRef.current.find(x => x.id === id)
    if (!n || n.kind === "tree") return false
    if (parent === id || (parent && under(id).some(k => k.id === parent))) return false
    if ((n.parent_id ?? null) === parent) return true
    const sib = notesRef.current.filter(x => (x.parent_id ?? null) === parent && x.kind === "note" && x.id !== id)
    const pos = Math.max(0, ...sib.map(x => x.pos)) + 1
    change(id, x => ({ ...x, parent_id: parent, pos }), 0)
    return true
  }
  const tie = (id: string, to: string) => {
    const a = byId.get(id), b = byId.get(to)
    if (!a || !b) return
    if (!moveTo(id, to)) { setToast("A note can't hang off itself, or off something tied under it."); return }
    setToast(`Tied. “${nameOf(a)}” now hangs off “${nameOf(b)}”.`)
    track("note_tied")
  }
  const file = (id: string, pileId: string | null) => {
    const a = byId.get(id)
    if (!a || !moveTo(id, pileId)) return
    const p = pileId ? byId.get(pileId) : null
    setToast(p ? `Moved to “${nameOf(p)}”.` : "Back in Just pinned.")
    track("note_moved", { to: pileId ? "pile" : "pinned" })
  }
  /** Untie: the note goes back to sitting in its pile (or Just pinned), with what hangs off it */
  const untie = (id: string) => {
    const n = byId.get(id)
    if (!n) return
    const p = pileOf(n)
    if (!moveTo(id, p?.id ?? null)) return
    setToast("Untied.")
    track("note_untied")
  }
  /** Deleting: a note's own tied notes move up to where it hung; a pile's notes go back to Just pinned, threads kept */
  const remove = async (id: string) => {
    setConfirmDel(null); setMenu(null)
    const n = notesRef.current.find(x => x.id === id)
    if (!n) return
    window.clearTimeout(timers.current.get(id)); timers.current.delete(id)
    const moved = kids(id)
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
    if (treeView === id) navigate(here, { replace: true })
    if (n.kind === "tree" && moved.length) setToast(`${moved.length} note${moved.length === 1 ? "" : "s"} back in Just pinned`)
  }
  /** A pile you started but never named or filled goes away when you leave its name tag */
  const doneNaming = (id: string) => {
    setRenaming(null)
    const p = notesRef.current.find(x => x.id === id)
    if (p && p.kind === "tree" && !p.title.trim() && !kids(id).length && !firstLine(p)) remove(id)
  }
  const close = () => {
    const n = notesRef.current.find(x => x.id === open)
    // a note left empty goes away
    if (n && n.kind === "note" && !n.title.trim() && n.body.every(b => b.type === "text" && !plain(b.html)) && !kids(n.id).length) remove(n.id)
    else if (open && timers.current.has(open)) { window.clearTimeout(timers.current.get(open)); save(open) }
    setOpen(null); setConfirmDel(null)
  }
  const setStatusOf = (id: string, s: Status) => change(id, n => ({ ...n, status: s }), 0)
  const setMade = (id: string, p: Piece | null) => {
    change(id, n => ({ ...n, made_ref: p ? p.ref : null, status: p ? "made" : n.status === "made" ? "making" : n.status }), 0)
    const n = byId.get(id)
    setToast(p ? `“${n ? nameOf(n) : "That note"}” became a ${p.kind}.` : "Link removed.")
    if (p) track("note_made", { kind: p.kind })
  }
  /** A pile's question is the first line of its page */
  const setQuestion = (id: string, q: string) => change(id, n => {
    const html = q.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const i = n.body.findIndex(b => b.type === "text")
    if (i < 0) return { ...n, body: [{ ...newText(), html } as TextBlock, ...n.body] }
    return { ...n, body: n.body.map((b, j) => (j === i ? { ...(b as TextBlock), html } : b)) }
  })
  /** The fruit: a match report made from the idea (its question as the headline, its points as the story), linked to the pile and opened */
  const makeReport = async (pileId: string) => {
    const p = byId.get(pileId)
    if (!p || !user || makingFor) return
    setMakingFor(pileId)
    try {
      const { makeShape } = await import("../report/templates")
      const { pieceName } = await import("../lib/names")
      const q = firstLine(p).trim(), pts = kids(pileId).filter(n => n.kind === "note" && n.title.trim()).slice(0, 5).map(n => n.title.trim())
      const base = makeShape("story")
      const headline = (q || nameOf(p)).toUpperCase().slice(0, 90)
      const report = { ...base, blocks: base.blocks.map((b: any, i: number) => (i === 0 && b.kind === "text" ? { ...b, text: headline } : b.kind === "story" ? { ...b, title: "The points", points: pts.length ? pts : b.points } : b)) }
      const id = crypto.randomUUID()
      const { error } = await (supabase as any).from("reports").insert({ id, user_id: user.id, title: pieceName("Report", "", headline, new Date().toISOString()), data: report })
      if (error) { setToast(/limit/.test(error.message || "") ? "You have 500 reports. Delete a few to make another." : "Couldn't make the report. Try again."); return }
      change(pileId, n => ({ ...n, made_ref: `report:${id}`, status: "making" }), 0)
      track("pile_made_report", { points: pts.length })
      navigate(`/report?open=${id}`)
    } catch (e) { reportError(e, "pile_make_report"); setToast("Couldn't make the report. Try again.") }
    finally { setMakingFor(null) }
  }
  /** Your 20 most recent boards, reports and analyses, asked for once, when you first link a note to one */
  const loadPieces = async () => {
    if (pieces || !user) return
    const ask = async (table: string, kind: PieceKind, k: string) => {
      const { data } = await (supabase as any).from(table).select("id, title, updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(20)
      return ((data ?? []) as any[]).map(x => ({ ref: `${k}:${x.id}`, kind, title: listName(kind, x.title, x.updated_at), updated: String(x.updated_at ?? "") }))
    }
    const lists = await Promise.all([ask("boards", "Board", "board"), ask("reports", "Report", "report"), ask("analysis_items", "Analysis", "analysis")])
    setPieces(lists.flat().filter(p => /^(board|report|analysis):[0-9a-fA-F-]{36}$/.test(p.ref)).sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 20))
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if (menu) { setMenu(null); return }
      if (drag) { press.current = null; setDrag(null); return }
      if (lookOpen && !open) { setLookOpen(false); return }
      if (open) { if (!(e.target as HTMLElement)?.closest?.(".bd-map, .bd-dia")) close(); return }
      if (treeView) { navigate(here); return }
      if (sel) { setSel(null); setSelDel(false) }
    }
    window.addEventListener("keydown", k)
    return () => window.removeEventListener("keydown", k)
  })

  /* ── dragging a slip: mouse and pen after a few pixels, touch after a long press (a long press let go is the menu) ── */
  const dropAt = (x: number, y: number) => ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-drop]") as HTMLElement | null)?.dataset.drop ?? null
  const banned = useMemo(() => (drag ? new Set([drag.id, ...under(drag.id).map(k => k.id)]) : new Set<string>()), [drag?.id, under]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const edge = (x: number, y: number) => { // near the wall's edges, the wall (or the column) scrolls along
      const w = wallRef.current
      if (w) { const r = w.getBoundingClientRect(); if (x < r.left + 48) w.scrollLeft -= 14; else if (x > r.right - 48) w.scrollLeft += 14 }
      const colBody = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest(".bd-col-body") as HTMLElement | null
      if (colBody) { const r = colBody.getBoundingClientRect(); if (y < r.top + 36) colBody.scrollTop -= 12; else if (y > r.bottom - 36) colBody.scrollTop += 12 }
    }
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      const far = Math.hypot(e.clientX - p.x, e.clientY - p.y)
      if (p.touch && !p.armed) { if (far > 10) { window.clearTimeout(p.timer); press.current = null } return } // a swipe: let it scroll
      if (!p.on && far < (p.touch ? 6 : 7)) return
      p.on = true
      setDrag({ id: p.id, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY) })
      edge(e.clientX, e.clientY)
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      press.current = null
      if (!p) return
      window.clearTimeout(p.timer)
      if (p.touch && p.armed && !p.on) { // a long press, let go where it was: the slip's menu
        dragged.current = true; setTimeout(() => { dragged.current = false }, 350)
        setDrag(null)
        setMenu({ kind: "note", id: p.id, x: e.clientX, y: e.clientY })
        return
      }
      if (!p.on) return
      dragged.current = true; setTimeout(() => { dragged.current = false }, 0)
      setDrag(null)
      const t = dropAt(e.clientX, e.clientY)
      if (!t) return
      if (t === "pinned") file(p.id, null)
      else if (t.startsWith("pile:")) file(p.id, t.slice(5))
      else if (t.startsWith("note:") && t.slice(5) !== p.id) tie(p.id, t.slice(5))
    }
    const cancel = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; setDrag(null) }
    const hold = (e: TouchEvent) => { if (press.current?.armed) e.preventDefault() } // once a long press has picked a slip up, the page doesn't scroll
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel)
    window.addEventListener("touchmove", hold, { passive: false })
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("touchmove", hold) }
  })
  const slipDown = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return
    const touch = e.pointerType === "touch"
    if (!touch) e.preventDefault()
    const p = { id, x: e.clientX, y: e.clientY, on: false, touch, armed: false, timer: 0 }
    if (touch) p.timer = window.setTimeout(() => {
      if (press.current !== p) return
      p.armed = true
      try { navigator.vibrate?.(12) } catch { /* no buzz here */ }
      setDrag({ id, x: p.x, y: p.y, over: null })
    }, LONG_PRESS)
    press.current = p
  }

  const note = open ? byId.get(open) ?? null : null
  const notePile = note ? pileOf(note) : null
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

  const nIdeas = all.filter(n => n.kind === "note").length
  const nThreads = all.filter(n => n.kind === "note" && n.parent_id && byId.get(n.parent_id)?.kind === "note").length
  const dragOverCol = drag?.over ? (drag.over === "pinned" ? "pinned" : drag.over.startsWith("pile:") ? drag.over.slice(5) : (() => { const t = byId.get(drag.over!.slice(5)); return t ? (pileOf(t)?.id ?? "pinned") : null })()) : null
  const tvPile = treeView ? byId.get(treeView) : undefined
  const tvCol = tvPile ? columns.find(c => c.id === tvPile.id) : undefined

  const slip = (r: Row, i: number) => {
    const n = r.note, c = col(n.color)
    const canTake = !!drag && drag.id !== n.id && !banned.has(n.id)
    const over = drag?.over === `note:${n.id}`
    return (
      <div key={n.id} className={`bd-slip d${Math.min(r.depth, 2)}${drag?.id === n.id ? " lifted" : ""}${canTake ? " can" : ""}${over && canTake ? " over" : ""}${term && !hit(n) ? " dim" : ""}`}
        data-drop={`note:${n.id}`} style={{ left: r.x, top: r.y, width: r.w, height: r.h, transform: `rotate(${TILTS[i % 3]}deg)`, transformOrigin: `${PIN.x}px ${PIN.y}px`, ["--paper" as any]: c.c, ["--pin" as any]: c.root }}>
        <button className="bd-slip-face" onPointerDown={e => slipDown(e, n.id)} aria-pressed={sel === n.id}
          onClick={() => { if (dragged.current) return; if (PHONE()) openNote(n.id); else { setSel(n.id); setSelDel(false) } }} onDoubleClick={() => { if (!dragged.current) openNote(n.id) }}
          onContextMenu={e => { e.preventDefault(); if (press.current?.touch || dragged.current) return; setMenu({ kind: "note", id: n.id, x: e.clientX, y: e.clientY }) }}
          onKeyDown={e => { if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); const b = e.currentTarget.getBoundingClientRect(); setMenu({ kind: "note", id: n.id, x: b.left + 20, y: b.bottom }) } }}
          aria-label={`${nameOf(n)}, ${n.status}${n.made_ref ? `, became a ${madeLabel(n.made_ref)}` : ""}`}>
          <span className="t">{nameOf(n)}</span>
          <span className="m">{inside.has(n.id) ? <b>▤ Wall · {inside.get(n.id)!.notes}</b> : <>{STATUS_CAPS[n.status]}{n.made_ref && <b>{madeLabel(n.made_ref)}</b>}</>}</span>
        </button>
        <span className="bd-slip-pin" aria-hidden="true" />
      </div>
    )
  }

  /** A frame's name tag: type straight into it to rename */
  const pileName = (p: Note) => renaming === p.id
    ? <input className="bd-tag-name" value={p.title} maxLength={120} autoFocus placeholder="Name this frame" aria-label="Frame name"
        onChange={e => change(p.id, y => ({ ...y, title: e.target.value }))} onBlur={() => doneNaming(p.id)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); doneNaming(p.id) } }} />
    : <button className="bd-tag-name" onClick={() => setRenaming(p.id)} title="Rename the frame">{nameOf(p)}</button>
  const wallSurfaceOf = (l: Look) => wallSurface(l, photo).background
  const column = (c: Column) => {
    const p = c.pile, st = stageOf(c), over = !!drag && dragOverCol === c.id
    const drop = p ? `pile:${p.id}` : "pinned"
    return (
      <section key={c.id} className={`bd-col${over ? " over" : ""}${flash === c.id ? " flash" : ""}`} data-col={c.id} aria-label={p ? nameOf(p) : "Just pinned"}>
        <div className="bd-head">
        <div className="bd-tag" data-drop={drop} style={{ ["--dot" as any]: p ? col(p.color).root : "#8a8378" }}
          onContextMenu={e => { if (!p) return; e.preventDefault(); setMenu({ kind: "pile", id: p.id, x: e.clientX, y: e.clientY }) }}>
          <span className="bd-tag-pin" aria-hidden="true" />
          {p ? pileName(p) : <span className="bd-tag-name">Just pinned <em>{c.rows.length || ""}</em></span>}
          {p && <button className="bd-tag-more" aria-label={`More for ${nameOf(p)}`} onClick={e => { const b = e.currentTarget.getBoundingClientRect(); setMenu({ kind: "pile", id: p.id, x: b.left, y: b.bottom + 4 }) }}><MoreHorizontal size={15} /></button>}
        </div>
        {p && (
          <button className="bd-grow" onClick={() => { setGrowing(true); navigate(`${here}?tree=${p.id}&view=tree`) }} aria-label={`${st.label}, ${c.ties} tie${c.ties === 1 ? "" : "s"}. Grow this idea`} title="Grow this idea">
            <Plant stage={st.id as Stage} pop={popped.has(c.id)} />
            <span><b>{st.label}</b><small>{c.ties} tie{c.ties === 1 ? "" : "s"}</small></span>
          </button>
        )}
        </div>
        <div className="bd-col-body" data-drop={drop}>
          {c.rows.length === 0
            ? <div className="bd-empty" data-drop={drop}>{p ? "Drop a note here" : notes === null ? "Loading…" : "Pin a note. It lands here."}</div>
            : <div className="bd-stack" data-drop={drop} style={{ width: STACK_W, height: c.height + 18 }}>
                <Threads rows={c.rows} height={c.height + 18} />
                {c.rows.map(slip)}
              </div>}
        </div>
      </section>
    )
  }

  /* ── the panel: the picked note, its thread, and one next step ── */
  const sNote = sel ? byId.get(sel) : undefined
  useEffect(() => { if (sel && notes && !byId.get(sel)) setSel(null) }, [sel, notes, byId])
  const sPile = sNote ? pileOf(sNote) : null
  const sTie = sNote?.parent_id ? byId.get(sNote.parent_id) : undefined
  const treeTarget = sPile?.id ?? piles[0]?.id ?? null
  const step = nIdeas === 0 ? 0 : nThreads === 0 ? 1 : 2
  /* ── getting started: five steps, ticked off as you do them, gone once they're all done (or you hide them) ── */
  const steps = [
    { done: nIdeas >= 1, t: "Pin a note", d: "Type it on the left, or double-click the wall." },
    { done: nIdeas >= 3, t: "Pin two more", d: "Ideas are easier to see in a group." },
    { done: nThreads >= 1, t: "Tie two notes", d: "Drag one note onto another.", go: () => setToast("Drag one note and drop it on another: a red thread ties them.") },
    { done: tried.has("columns") && tried.has("tree"), t: "Switch to Columns, then Tree", d: "Same notes, seen two more ways.", go: () => setView(tried.has("columns") ? "tree" : "columns"), label: "Try" },
    { done: inside.size > 0 || !!wall?.note_id, t: "Turn a note into a wall", d: "Right-click a note (long-press on a phone), then Turn into a wall.", go: () => setToast("Right-click a note (long-press on a phone), then pick Turn into a wall.") },
  ]
  const nDone = steps.filter(x => x.done).length, nextStep = steps.findIndex(x => !x.done)
  const hideStart = () => { setStartHidden(true); try { localStorage.setItem("ps-wall-start", "hidden") } catch { /* not kept */ } }
  const startPanel = !startHidden && nDone < steps.length && notes !== null && wall && !treeView ? (
    <aside className="bd-panel bd-start" aria-label="Get started">
      <div className="bd-ph"><div style={{ flex: 1 }}><p className="bd-k" style={{ marginTop: 2 }}>Get started</p></div>
        <span className="bd-note" style={{ alignSelf: "center" }}>{nDone} of {steps.length}</span>
        <button className="bd-link" style={{ marginLeft: 10, alignSelf: "center" }} onClick={hideStart}>Hide</button></div>
      <div className="bar"><u style={{ width: `${(nDone / steps.length) * 100}%` }} /></div>
      {steps.map((x, i) => (
        <div key={x.t} className={`ck${x.done ? " done" : ""}${i === nextStep ? " next" : ""}`}>
          <i aria-hidden="true">{x.done ? "✓" : ""}</i>
          <div style={{ minWidth: 0 }}><b>{x.t}</b>{!x.done && <span>{x.d}</span>}</div>
          {!x.done && x.go && <button onClick={x.go}>{x.label ?? "Show me"}</button>}
          <span className="sr-only">{x.done ? "Done" : "Not done yet"}</span>
        </div>
      ))}
      <p className="bd-k">Make it yours</p>
      <div className="looks">{(["cork", "felt", "paper", "night"] as const).map(bg => (
        <button key={bg} aria-label={`${bg} wall`} aria-pressed={wall.look.bg === bg} style={{ background: wallSurface({ ...wall.look, bg }, null).background }} onClick={() => changeWall({ look: { ...wall.look, bg } })} />
      ))}<button aria-label="More looks" onClick={() => setLookOpen(true)} style={{ background: "none", color: TEXT_MUTED, font: "600 16px Inter" }}>…</button></div>
      <p className="bd-note" style={{ marginTop: "auto", paddingTop: 18 }}>This list goes away by itself once you've done it all.</p>
    </aside>
  ) : null
  const panel = sNote && sNote.kind === "note" && !treeView ? (
    <aside className="bd-panel" aria-label={`Note: ${nameOf(sNote)}`}>
      <div className="bd-ph">
        <span className="bd-pico" style={{ background: hex(sNote.color) }} aria-hidden="true" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="bd-k">Note · {sPile ? nameOf(sPile) : "Just pinned"}</p>
          <h2 className="bd-big">{nameOf(sNote)}</h2>
        </div>
        <button className="bd-icon" aria-label="Close the panel" title="Close (Esc)" onClick={() => setSel(null)}><X size={16} /></button>
      </div>
      <p className="bd-k">Status</p>
      <div className="bd-seg" role="group" aria-label="Status">
        {STATUSES.map(st => <button key={st.id} aria-pressed={sNote.status === st.id} onClick={() => setStatusOf(sNote.id, st.id)}>{st.label}</button>)}
      </div>
      <p className="bd-k">Thread</p>
      {sTie && sTie.kind === "note"
        ? <div className="bd-tie"><span className="bd-tie-dot" aria-hidden="true" /><span style={{ flex: 1, minWidth: 0 }}>Tied to <b>{nameOf(sTie)}</b></span><button className="bd-link" onClick={() => untie(sNote.id)}>Untie</button></div>
        : <p className="bd-note">Drag it onto another note to tie a thread.</p>}
      <p className="bd-k">Colour</p>
      <div className="bd-sw" style={{ padding: 0 }}>{COLORS.map(c => <button key={c.id} className="bd-swatch" aria-label={`Colour ${c.id}`} aria-pressed={sNote.color === c.id} style={{ background: c.c }} onClick={() => change(sNote.id, n => ({ ...n, color: c.id }), 300)} />)}</div>
      <p className="bd-k">Words</p>
      <p className="bd-words2">{sNote.body.filter((b): b is TextBlock => b.type === "text").map(b => plain(b.html)).join(" ").trim().slice(0, 220) || "Nothing written yet."}</p>
      <button className="bd-link" style={{ marginTop: 6 }} onClick={() => setOpen(sNote.id)}>Open the note to write more ›</button>
      <p className="bd-k">What it became</p>
      <button className="bd-link" onClick={e => { const b = e.currentTarget.getBoundingClientRect(); loadPieces(); setMenu({ kind: "note", id: sNote.id, x: Math.min(b.left, window.innerWidth - 260), y: b.bottom + 4, sub: "made" }) }}>
        {sNote.made_ref ? `${madeLabel(sNote.made_ref)}: change` : "Link what it became"}</button>
      <div className="bd-pacts">
        {sPile
          ? <button className="bd-go" onClick={() => { setGrowing(true); navigate(`${here}?tree=${sPile.id}&view=tree`) }}><Sprout size={17} /> Grow this idea</button>
          : <p className="bd-note">Drag it into a frame to grow it into a question, your points and a report.</p>}
        {inside.has(sNote.id) && <button className="bd-go" style={{ background: "#2b2c31", color: "#D7FF3C" }} onClick={() => openNote(sNote.id)}><Layers size={17} /> Open this wall · {inside.get(sNote.id)!.notes} notes</button>}
        <div className="bd-two">
          <button className="bd-act" onClick={() => setOpen(sNote.id)}><PenLine size={15} /> Open note</button>
          {selDel
            ? <button className="bd-act bad on" onClick={() => { remove(sNote.id); setSel(null); setSelDel(false) }}>Yes, delete</button>
            : <button className="bd-act bad" onClick={() => setSelDel(true)}><Trash2 size={15} /> Delete</button>}
        </div>
      </div>
    </aside>
  ) : null

  const mNote = menu?.kind === "note" ? byId.get(menu.id) : undefined
  const mPile = menu?.kind === "pile" ? byId.get(menu.id) : undefined
  return (
    <div className={`bd${drag ? " dragging" : ""}${moving ? " moving" : ""}`}>
      <style>{`
        .bd { height: 100vh; height: 100dvh; display: grid; grid-template-columns: 280px minmax(0, 1fr) auto; grid-template-rows: 60px minmax(0, 1fr); background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; overflow: hidden; }
        .bd * { box-sizing: border-box; }
        .bd.dragging, .bd.dragging * { cursor: grabbing !important; user-select: none; -webkit-user-select: none; }
        .bd.moving .bd-panel { pointer-events: none; }
        .bd-side { display: flex; flex-direction: column; gap: 22px; min-height: 0; padding: 18px 16px 0; border-right: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; overflow-y: auto; }
        .bd-top { grid-column: 1 / -1; position: relative; display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid ${DS_BORDER}; min-width: 0; }
        .bd-top-name b { display: block; font-size: 15px; font-weight: 600; } .bd-top-name > span { display: flex; align-items: center; gap: 6px; font-size: 12px; color: ${TEXT_MUTED}; }
        .bd-top-name { min-width: 0; }
        .bd-path { display: flex; align-items: center; gap: 2px; min-width: 0; max-width: 34vw; overflow: hidden; white-space: nowrap; font: 500 13px 'Inter', sans-serif; color: ${TEXT_MUTED}; }
        .bd-path span { display: inline-flex; align-items: center; gap: 2px; min-width: 0; }
        .bd-path i { font-style: normal; padding: 0 3px; opacity: .6; }
        .bd-path button { border: none; background: none; padding: 2px 3px; border-radius: 6px; color: inherit; font: inherit; cursor: pointer; overflow: hidden; text-overflow: ellipsis; max-width: 140px; }
        .bd-path button:hover { color: ${TEXT_PRIMARY}; background: ${SURFACE_2}; }
        .bd-path b { display: inline; font: 600 15px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; overflow: hidden; text-overflow: ellipsis; }
        .bd-path span:not(:last-child) { flex-shrink: 1; }
        .bd-dot2 { width: 7px; height: 7px; border-radius: 50%; background: ${TEXT_MUTED}; } .bd-dot2.ok { background: #3fb950; } .bd-dot2.busy { background: #e3b341; } .bd-dot2.bad { background: ${DS_ERROR}; }
        .bd-modes { display: flex; padding: 3px; gap: 2px; border-radius: 12px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; }
        .bd-modes button { height: 32px; padding: 0 16px; border: none; border-radius: 9px; background: none; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
        .bd-modes button[aria-pressed="true"] { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        .bd-modes button:disabled { opacity: .4; cursor: default; }
        .bd-modes button.new { position: relative; } .bd-modes button.new::after { content: ""; position: absolute; right: 6px; top: 6px; width: 6px; height: 6px; border-radius: 50%; background: ${ACCENT_SOLID}; }
        .bd-start .ck { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: ${SURFACE_2}; margin-bottom: 8px; }
        .bd-start .ck i { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid ${DS_BORDER_STRONG}; display: grid; place-items: center; font: 700 11px 'Inter', sans-serif; font-style: normal; margin-top: 1px; }
        .bd-start .ck.done i { background: ${ACCENT_SOLID}; border-color: ${ACCENT_SOLID}; color: ${ACCENT_INK}; }
        .bd-start .ck.done b { color: ${TEXT_MUTED}; text-decoration: line-through; font-weight: 500; }
        .bd-start .ck b { display: block; font: 600 13.5px 'Inter', sans-serif; } .bd-start .ck span { display: block; font: 500 12px/1.4 'Inter', sans-serif; color: ${TEXT_MUTED}; margin-top: 2px; }
        .bd-start .ck.next { box-shadow: inset 0 0 0 1.5px ${ACCENT_SOLID}; background: rgba(215,255,60,.06); }
        .bd-start .ck button { margin-left: auto; align-self: center; border: none; background: none; padding: 4px 0 4px 6px; font: 600 12.5px 'Inter', sans-serif; color: ${ACCENT_SOLID}; cursor: pointer; white-space: nowrap; }
        .bd-start .bar { height: 6px; border-radius: 3px; background: ${SURFACE_2}; overflow: hidden; margin: 0 0 12px; } .bd-start .bar u { display: block; height: 100%; background: ${ACCENT_SOLID}; }
        .bd-start .looks { display: flex; gap: 7px; flex-wrap: wrap; } .bd-start .looks button { width: 40px; height: 30px; border-radius: 6px; border: 1px solid ${DS_BORDER_STRONG}; cursor: pointer; padding: 0; }
        .bd-start .looks button[aria-pressed="true"] { box-shadow: 0 0 0 2px ${ACCENT_SOLID}; }
        @media (min-width: 1000px) { .bd-modes { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); } }
        .bd-top .bd-search { width: 260px; height: 38px; background: ${SURFACE_1}; }
        .bd-panel { width: 320px; min-height: 0; overflow-y: auto; border-left: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; padding: 20px; display: flex; flex-direction: column; }
        .bd-ph { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
        .bd-pico { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); }
        .bd-k { margin: 18px 0 9px; font: 500 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .bd-ph .bd-k { margin: 2px 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .bd-big { margin: 0; font: 400 24px/1.08 Anton, 'Bebas Neue', sans-serif; letter-spacing: .01em; text-transform: uppercase; overflow-wrap: anywhere; }
        .bd-seg { display: flex; padding: 3px; gap: 2px; border-radius: 10px; background: ${SURFACE_2}; }
        .bd-seg button { flex: 1; height: 34px; border: none; border-radius: 8px; background: none; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
        .bd-seg button[aria-pressed="true"] { background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; box-shadow: 0 1px 3px rgba(0,0,0,.25); }
        .bd-tie { display: flex; align-items: center; gap: 9px; padding: 10px 12px; border-radius: 10px; background: ${SURFACE_2}; font-size: 13px; line-height: 1.35; }
        .bd-tie b { font-weight: 600; }
        .bd-tie-dot { width: 8px; height: 8px; border-radius: 50%; background: ${THREAD}; flex-shrink: 0; }
        .bd-link { align-self: flex-start; border: none; background: none; padding: 4px 0; color: ${TEXT_MUTED}; font: 600 13px 'Inter', sans-serif; cursor: pointer; text-align: left; }
        .bd-link:hover { color: ${TEXT_PRIMARY}; }
        .bd-note { margin: 0; font-size: 13px; line-height: 1.5; color: ${TEXT_MUTED}; }
        .bd-words2 { margin: 0; font-size: 13.5px; line-height: 1.55; color: ${TEXT_PRIMARY}; opacity: .85; overflow-wrap: anywhere; }
        .bd-pacts { margin-top: auto; padding-top: 22px; display: grid; gap: 10px; }
        .bd-go { height: 48px; border: none; border-radius: 12px; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 700 14.5px 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; }
        .bd-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .bd-act { height: 42px; border-radius: 10px; border: 1px solid ${DS_BORDER_STRONG}; background: none; color: ${TEXT_PRIMARY}; font: 600 13.5px 'Inter', sans-serif; display: flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; }
        .bd-act:hover { background: ${SURFACE_2}; } .bd-act.bad { color: ${DS_ERROR}; } .bd-act.bad.on { background: ${DS_ERROR}; color: #fff; border-color: ${DS_ERROR}; }
        .bd-steps { margin: 0; padding: 0; list-style: none; display: grid; gap: 11px; }
        .bd-steps li { display: flex; gap: 11px; font-size: 13px; line-height: 1.4; color: ${TEXT_MUTED}; }
        .bd-steps li b { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font: 700 12px 'Inter', sans-serif; margin-top: -2px; }
        .bd-steps li.on { color: ${TEXT_PRIMARY}; font-weight: 600; } .bd-steps li.on b { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; }
        .bd-slip-face[aria-pressed="true"] { outline: 3px solid #7cc4ff; outline-offset: 3px; }
        .bd-icon { width: 34px; height: 34px; border-radius: 10px; border: none; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
        .bd-icon:hover { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; }
        .bd-cap { font: 500 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; margin-bottom: 9px; display: flex; justify-content: space-between; }
        .bd-pin-in { width: 100%; height: 44px; border-radius: 4px; border: none; outline: none; padding: 0 12px; background: #F4EEDC; color: #1b1a17; font: 700 18px ${HAND}; box-shadow: 0 8px 16px -10px rgba(0,0,0,.6); }
        .bd-pin-in:focus { box-shadow: 0 0 0 3px ${ACCENT_SOLID}; }
        .bd-pin-in::placeholder { color: rgba(27,26,23,.45); }
        .bd-hint { font-size: 12px; color: ${TEXT_MUTED}; margin-top: 6px; }
        .bd-how { display: grid; gap: 12px; }
        .bd-side .bd-phone-search { display: none; }
        .bd-search { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border-radius: 10px; background: ${SURFACE_BASE}; border: 1px solid ${DS_BORDER}; color: ${TEXT_MUTED}; }
        .bd-search input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; }
        .bd-piles { display: grid; gap: 2px; }
        .bd-row { width: 100%; display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 5px 8px; border-radius: 9px; border: none; background: none; color: ${TEXT_PRIMARY}; font: 500 13.5px 'Inter', sans-serif; text-align: left; cursor: pointer; }
        .bd-row:hover { background: ${SURFACE_2}; }
        .bd-row:disabled { opacity: .4; cursor: default; background: none; }
        .bd-row .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .bd-row em { font-style: normal; font: 500 12px ${MONO}; letter-spacing: .12em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .bd-row small { font: 500 12px 'Inter', sans-serif; color: ${TEXT_MUTED}; }
        .bd-row.add { color: ${ACCENT_SOLID}; font-weight: 600; }
        .bd-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .bd-none { margin: 2px 8px; font-size: 12.5px; color: ${TEXT_MUTED}; line-height: 1.5; }
        .bd-foot { margin-top: auto; padding: 10px 2px 14px; border-top: 1px solid ${DS_BORDER}; font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .08em; color: ${TEXT_MUTED}; display: flex; gap: 8px; align-items: center; justify-content: space-between; }
        .bd-saved { display: inline-flex; align-items: center; gap: 5px; text-transform: none; letter-spacing: 0; font: 500 12px 'Inter', sans-serif; }
        .bd-retry { border: none; background: none; padding: 0; cursor: pointer; color: ${DS_ERROR}; font: 600 12px 'Inter', sans-serif; text-decoration: underline; text-underline-offset: 3px; }
        .bd-btn { height: 38px; border-radius: 11px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font: 600 13px 'Inter', sans-serif; cursor: pointer; padding: 0 12px; white-space: nowrap; }
        .bd-main { min-width: 0; min-height: 0; position: relative; padding: 18px; display: flex; flex-direction: column; background: #141518; }
        .bd-failed { display: flex; align-items: center; gap: 14px; padding: 12px 14px; margin-bottom: 10px; border-radius: 12px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; font-size: 14px; }
        .bd-failed span { flex: 1; color: ${TEXT_MUTED}; }
        .bd-wall { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; background: #CBC6BC; border: 10px solid #3A332D; border-radius: 6px; box-shadow: inset 0 0 40px rgba(0,0,0,.18), 0 20px 40px -24px rgba(0,0,0,.8);
          background-image: radial-gradient(rgba(0,0,0,.05) 1px, transparent 1px); background-size: 5px 5px; }
        .bd-banner-row { display: flex; justify-content: center; padding: 14px 12px 4px; flex-shrink: 0; }
        .bd-banner { min-width: 220px; max-width: 70%; padding: 8px 28px 9px; border: none; border-radius: 2px; background: #F4EEDC; color: #1b1a17; font: 700 22px ${HAND}; letter-spacing: .32em; text-transform: uppercase; text-align: center; transform: rotate(-1.5deg); box-shadow: 0 10px 18px -10px rgba(0,0,0,.55); cursor: text; outline: none; }
        .bd-banner:focus-visible { box-shadow: 0 0 0 3px #1b1a17; }
        .bd-cols { flex: 1; min-height: 0; display: flex; gap: 18px; padding: 10px 16px 14px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; scrollbar-width: thin; }
        .bd-col { flex-shrink: 0; width: ${STACK_W + 28}px; display: flex; flex-direction: column; min-height: 0; border-radius: 10px; padding: 8px 6px 0 8px; scroll-snap-align: start; transition: box-shadow .16s, background .16s; }
        .bd-col.over { box-shadow: inset 0 0 0 2px rgba(27,26,23,.45); background: rgba(255,255,255,.12); outline: 2px dashed rgba(27,26,23,.5); outline-offset: -2px; }
        .bd-col.flash { box-shadow: 0 0 0 3px ${ACCENT_SOLID}; }
        .bd-tag { position: relative; display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 6px 0 22px; border-radius: 3px; background: #F4EEDC; color: #1b1a17; box-shadow: 0 6px 12px -8px rgba(0,0,0,.6); }
        .bd-tag-pin { position: absolute; left: 7px; top: 50%; width: 10px; height: 10px; margin-top: -5px; border-radius: 50%; background: var(--dot); box-shadow: inset -1.5px -1.5px 0 rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.4); }
        .bd-tag-name { flex: 1; min-width: 0; border: none; background: none; padding: 0; color: #1b1a17; font: 700 18px ${HAND}; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: text; outline: none; }
        .bd-tag-name em { font: 600 12px 'JetBrains Mono', monospace; font-style: normal; opacity: .55; margin-left: 4px; }
        input.bd-tag-name { cursor: text; border-bottom: 1.5px dashed rgba(27,26,23,.4); }
        .bd-tag-more { width: 28px; height: 28px; border-radius: 7px; border: none; background: none; color: #1b1a17; display: grid; place-items: center; cursor: pointer; opacity: .6; }
        .bd-tag-more:hover { opacity: 1; background: rgba(27,26,23,.08); }
        .bd-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .bd-head .bd-tag { flex: 1; min-width: 0; height: auto; min-height: 42px; padding-top: 4px; padding-bottom: 4px; }
        .bd-head button.bd-tag-name { white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-height: 1.15; font-size: 16.5px; overflow-wrap: anywhere; }
        .bd-head .bd-tag-more { width: 24px; flex-shrink: 0; }
        .bd-grow { flex-shrink: 0; display: flex; align-items: center; gap: 6px; height: 42px; padding: 0 9px 0 2px; border: none; border-radius: 9px; background: #1d1e22; color: #fff; cursor: pointer; text-align: left; box-shadow: 0 6px 14px -8px rgba(0,0,0,.55); transition: transform .14s, background .14s; }
        .bd-grow:hover { background: #2a2b31; transform: translateY(-1px); }
        .bd-grow:focus-visible { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .bd-grow b { display: block; font: 700 12.5px 'Inter', sans-serif; line-height: 1.1; }
        .bd-grow small { display: block; font: 500 12px 'Inter', sans-serif; opacity: .62; white-space: nowrap; }
        .bd-col-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 14px 0 20px 2px; scrollbar-width: thin; }
        .bd-stack { position: relative; }
        .bd-threads { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 2; overflow: visible; }
        .bd-empty { height: 64px; border: 2px dashed rgba(27,26,23,.3); border-radius: 6px; display: grid; place-items: center; text-align: center; padding: 8px; color: rgba(27,26,23,.55); font: 700 16px ${HAND}; width: ${STACK_W}px; }
        .bd-slip { position: absolute; transition: opacity .18s, filter .18s; }
        .bd-slip.dim { opacity: .3; }
        .bd-slip.lifted { opacity: .3; }
        .bd-slip.can .bd-slip-face { outline: 2px dashed ${THREAD}; outline-offset: 2px; }
        .bd-slip.over .bd-slip-face { outline-style: solid; outline-width: 3px; transform: translateY(-2px); }
        .bd-slip-face { width: 100%; height: 100%; border: none; border-radius: 2px; padding: 6px 10px 5px 26px; text-align: left; cursor: grab; color: #1b1a17; background: var(--paper); display: flex; flex-direction: column; justify-content: space-between; gap: 2px; overflow: hidden;
          box-shadow: 0 1px 1px rgba(0,0,0,.14), 0 8px 14px -8px rgba(0,0,0,.5); transition: transform .16s, box-shadow .16s; touch-action: manipulation; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
        .bd-slip-face:hover { box-shadow: 0 1px 1px rgba(0,0,0,.14), 0 14px 20px -10px rgba(0,0,0,.6); }
        .bd-slip-face:focus-visible { outline: 3px solid #1b1a17; outline-offset: 2px; }
        .bd-slip-face .t { font: 700 16px/1.12 ${HAND}; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .bd-slip.d1 .bd-slip-face .t, .bd-slip.d2 .bd-slip-face .t { font-size: 14.5px; line-height: 1.08; }
        .bd-slip-face .m { display: flex; align-items: center; gap: 6px; font: 600 12px 'JetBrains Mono', monospace; letter-spacing: .14em; opacity: .7; }
        .bd-slip-face .m b { font: 600 12px 'Inter', sans-serif; letter-spacing: 0; background: #1b1a17; color: #fff; padding: 1px 7px; border-radius: 999px; opacity: 1; }
        .bd-slip-pin { position: absolute; left: ${PIN.x - 5}px; top: ${PIN.y - 5}px; width: 10px; height: 10px; border-radius: 50%; background: var(--pin); box-shadow: inset -1.5px -1.5px 0 rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.45); pointer-events: none; z-index: 3; }
        .bd-ghost { position: fixed; z-index: 80; width: 170px; min-height: 52px; padding: 9px 12px; border-radius: 2px; color: #1b1a17; font: 700 16px/1.12 ${HAND}; pointer-events: none; transform: translate(-50%, -60%) rotate(-4deg); box-shadow: 0 22px 36px -12px rgba(0,0,0,.6); overflow: hidden; }
        .bd-menu-back { position: fixed; inset: 0; z-index: 65; }
        .bd-menu { position: fixed; z-index: 70; width: 248px; max-height: min(440px, calc(100vh - 16px)); overflow-y: auto; padding: 6px; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; box-shadow: 0 22px 50px -18px rgba(0,0,0,.7); }
        .bd-menu p { margin: 8px 8px 4px; font: 600 12px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .12em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .bd-menu .bd-row[aria-checked="true"] { color: ${ACCENT_SOLID}; }
        .bd-sw { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 8px 6px; }
        .bd-swatch { width: 22px; height: 22px; border-radius: 6px; border: 2px solid rgba(27,26,23,.25); cursor: pointer; padding: 0; }
        .bd-swatch[aria-pressed="true"] { border-color: ${TEXT_PRIMARY}; box-shadow: 0 0 0 2px ${SURFACE_2}, 0 0 0 4px ${TEXT_PRIMARY}; }
        .bd-menu .warn { font-size: 12.5px; color: ${TEXT_MUTED}; padding: 4px 8px 8px; line-height: 1.45; }
        .bd-menu .del { color: ${DS_ERROR}; }
        ${PLANT_CSS}
        ${GROW_CSS}
        ${FREE_CSS}
        ${TREE_CSS}
        ${LOOK_CSS}
        .bd-lookbtn[aria-pressed="true"] { border-color: ${ACCENT_SOLID}; }
        @keyframes bd-in { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
        .bd-sheet { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: var(--bd-paper); color: #1b1a17; animation: bd-in .32s cubic-bezier(.2,.8,.2,1) both; }
        .bd-sheet .bd-swatch[aria-pressed="true"] { border-color: #1b1a17; box-shadow: 0 0 0 2px var(--bd-paper), 0 0 0 4px #1b1a17; }
        .bd-sheet-top { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid rgba(27,26,23,.1); flex-wrap: wrap; }
        .bd-tb { height: 34px; min-width: 34px; padding: 0 9px; border-radius: 9px; border: none; background: transparent; color: #1b1a17; display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: 600 12.5px 'Inter', sans-serif; cursor: pointer; }
        .bd-tb:hover { background: rgba(27,26,23,.08); }
        .bd-tb.pill { background: rgba(27,26,23,.88); color: #fff; padding: 0 13px; border-radius: 999px; }
        .bd-tb.on { background: #1b1a17; color: #fff; }
        .bd-crumb { font: 600 12px 'Inter', sans-serif; color: rgba(27,26,23,.6); display: inline-flex; align-items: center; gap: 5px; }
        .bd-sep { width: 1px; height: 20px; background: rgba(27,26,23,.15); margin: 0 4px; display: inline-block; }
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
        .bd-page .bd-hint { margin: 4px 0 0; text-align: center; font: 500 12px 'Inter', sans-serif; color: rgba(27,26,23,.5); }
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
        .bd-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: calc(100vw - 32px); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; padding: 10px 16px; border-radius: 999px; font: 500 13px 'Inter', sans-serif; z-index: 90; text-align: center; }
        .bd-phone-only { display: none; }
        .bd-live { position: fixed; left: 0; bottom: 0; width: 0; height: 0; }
        @media (max-width: 700px) {
          .bd-icon { width: 44px; height: 44px; } .bd-tag-name { min-height: 40px; } .bd-tag-more { width: 40px; height: 40px; }
          .bd { grid-template-columns: minmax(0, 1fr); grid-template-rows: 56px auto minmax(0, 1fr); }
          .bd-top { padding: 0 8px; gap: 6px; } .bd-top .bd-search, .bd-top-name, .bd-panel { display: none; }
          .bd-modes button { padding: 0 11px; height: 36px; } .bd-lookbtn { width: 40px; padding: 0; } .bd-lookbtn span { display: none; }
          .bd-side { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-right: none; border-bottom: 1px solid ${DS_BORDER}; overflow: visible; }
          .bd-side > .bd-pinbox { flex: 1; min-width: 0; } .bd-side .bd-cap, .bd-side .bd-hint, .bd-how, .bd-piles-box, .bd-foot { display: none; }
          .bd-side.search .bd-phone-search { display: flex; width: 100%; order: 5; }
          .bd-phone-only { display: grid; }
          .bd-pin-in { height: 40px; font-size: 17px; }
          .bd-main { padding: 8px; }
          .bd-wall { border-width: 6px; }
          .bd-banner { font-size: 17px; letter-spacing: .22em; min-width: 0; padding: 6px 18px 7px; }
          .bd-cols { gap: 10px; padding: 8px 8px 10px; scroll-snap-type: x mandatory; }
          .bd-col { width: calc(100vw - 48px); max-width: ${STACK_W + 60}px; }
          .bd-title { font-size: 34px; } .bd-inner { padding: 22px 16px 100px; }
          .bd-sheet-top { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; padding: 8px 10px; } .bd-sheet-top::-webkit-scrollbar { display: none; } .bd-sheet-top > * { flex-shrink: 0; }
        }
        @media (prefers-reduced-motion: reduce) { .bd-sheet, .bd-slip, .bd-slip-face, .bd-col { animation: none; transition: none; } }
      `}</style>

      <header className="bd-top">
        <button className="bd-icon" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color={ACCENT_SOLID} /></button>
        <div className="bd-top-name">
          <nav className="bd-path" aria-label="Where you are">
            <button onClick={() => navigate("/braindump")}>All walls</button>
            {crumbs.map(c => <span key={c.id}><i aria-hidden="true">›</i><button onClick={() => navigate(`/braindump/w/${c.id}`)}>{c.title || "Wall"}</button></span>)}
            <span><i aria-hidden="true">›</i><b aria-current="page">{wall?.title || "My ideas"}</b></span>
          </nav>
          <span aria-live="polite"><i className={`bd-dot2${status === "error" ? " bad" : status === "saving" ? " busy" : status === "saved" ? " ok" : ""}`} aria-hidden="true" />
            {status === "saving" ? "Saving…" : status === "error" ? <button className="bd-retry" onClick={retry}>Not saved · Retry</button> : notes === null ? "Loading…" : "Saved"}</span>
        </div>
        <span style={{ flex: 1 }} />
        <div className="bd-modes" role="group" aria-label="View">
          <button aria-pressed={!treeView && view === "wall"} onClick={() => setView("wall")}>Wall</button>
          <button aria-pressed={!treeView && view === "columns"} onClick={() => setView("columns")} className={tried.has("columns") || view === "columns" ? "" : "new"}>Columns</button>
          <button aria-pressed={!treeView && view === "tree"} onClick={() => setView("tree")} className={tried.has("tree") || view === "tree" ? "" : "new"}>Tree</button>
        </div>
        <label className="bd-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your notes" aria-label="Search your notes" />{q && <button className="bd-icon" style={{ width: 22, height: 22 }} aria-label="Clear search" onClick={() => setQ("")}><X size={13} /></button>}</label>
        <button className="bd-btn bd-lookbtn" aria-label="Look of this wall" aria-pressed={lookOpen} disabled={!wall} onClick={() => { setLookOpen(o => !o); setSel(null) }}><Palette size={15} /><span>Look</span></button>
      </header>
      <aside className={`bd-side${q ? " search" : ""}`} aria-label="Pin and find">
        <div className="bd-pinbox">
          <div className="bd-cap"><span>Pin a note</span></div>
          <input ref={quickRef} className="bd-pin-in" value={quick} maxLength={120} placeholder="An idea, quick…" aria-label="Pin a note" disabled={!user}
            onChange={e => setQuick(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); dump() } }} />
          <div className="bd-hint">Enter pins it. Keep typing for the next.</div>
        </div>
        <button className="bd-icon bd-phone-only" aria-label="Search your notes" onClick={() => setQ(v => v || " ")}><Search size={17} /></button>
        <button className="bd-icon bd-phone-only" aria-label="New frame" onClick={newPile} disabled={!user}><Plus size={18} /></button>
        <label className="bd-search bd-phone-search"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search your notes" aria-label="Search your notes (phone)" />{q && <button className="bd-icon" style={{ width: 22, height: 22 }} aria-label="Clear search" onClick={() => setQ("")}><X size={13} /></button>}</label>
        <div className="bd-piles-box">
          <div className="bd-cap"><span>Frames · {piles.length}</span></div>
          <div className="bd-piles">
            {notes !== null && piles.length === 0 && <p className="bd-none">No frames yet. Start one for notes that belong together.</p>}
            {columns.filter(c => c.pile).map(c => (
              <button key={c.id} className="bd-row" onClick={() => { if (treeView) navigate(here); setTimeout(() => showPile(c.id), treeView ? 80 : 0) }}>
                <span className="bd-dot" style={{ background: hex(c.pile!.color) }} /><span className="t">{nameOf(c.pile!)}</span><small>{c.rows.length}</small><em>{stageOf(c).label}</em>
              </button>
            ))}
            <button className="bd-row add" onClick={newPile} disabled={!user}><Plus size={15} /><span className="t">New frame</span></button>
            <button className="bd-row add" onClick={newWallInside} disabled={!user || !wall}><Layers size={15} /><span className="t">New wall inside this one</span></button>
          </div>
        </div>
        <div className="bd-how" aria-label="How it grows">
          <div className="bd-cap" style={{ margin: 0 }}><span>How it grows</span></div>
          <ol className="bd-steps">
            {["Pin it the moment you think it.", "Drag one note onto another to tie a thread.", "Every thread grows the frame, from seed to tree.", "Grow it into a question, your points, then a report."].map((t, i) => <li key={i} className={i === step ? "on" : ""}><b>{i + 1}</b>{t}</li>)}
          </ol>
        </div>
        <div className="bd-foot">
          <span>{notes === null ? "Loading…" : `${nIdeas} note${nIdeas === 1 ? "" : "s"} · ${nThreads} thread${nThreads === 1 ? "" : "s"}`}</span>
        </div>
      </aside>

      <main className="bd-main">
        <h1 className="sr-only">Dump &amp; Arrange</h1>
        {loadFailed && <div className="bd-failed" role="alert"><b>Your notes didn't load.</b><span>Nothing is lost. They're kept in your account.</span><button className="bd-btn" onClick={() => setTries(t => t + 1)}>Try again</button></div>}
        {tvPile && tvPile.kind === "tree" && tvCol
          ? <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
              <TreeView pile={tvPile} kids={kids} under={under} stage={stageOf(tvCol).id as Stage} onBack={() => navigate(here)} onOpen={setOpen} onNavigate={to => navigate(to)}
                onGrow={growing ? undefined : () => setGrowing(true)}
                aside={growing ? <GrowPanel key={tvPile.id} pile={tvPile} kids={kids} making={makingFor === tvPile.id}
                  onQuestion={t => setQuestion(tvPile.id, t)} onAdd={parent => add("note", parent)} onTitle={(id, t) => change(id, n => ({ ...n, title: t }))}
                  onRemove={remove} onMake={() => makeReport(tvPile.id)} onClose={() => setGrowing(false)}
                  onLink={() => { loadPieces(); setMenu({ kind: "note", id: tvPile.id, x: 380, y: 160, sub: "made" }) }} /> : undefined} />
            </div>
          : view === "tree"
          ? (notes !== null
              ? <WallTree notes={all} kids={kids} sel={sel} dim={n => !!term && !hit(n)} editing={treeEdit} onEdit={setTreeEdit}
                  onTitle={(id, t) => change(id, n => ({ ...n, title: t }))}
                  onDoneEdit={async (id, next) => {
                    setTreeEdit(null)
                    const n = notesRef.current.find(x => x.id === id)
                    if (!n) return
                    if (!n.title.trim() && !kids(n.id).length) { remove(id); return }
                    if (next === "sibling") { const m = await add("note", n.parent_id); if (m) setTreeEdit(m.id) }
                  }}
                  onGrowFrom={async parent => { const m = await add("note", parent); if (m) { setTreeEdit(m.id); track("tree_grew") } }}
                  slipDown={slipDown} dragId={drag?.id ?? null} overId={drag?.over ?? null}
                  onSelect={id => { if (dragged.current) return; setLookOpen(false); if (PHONE()) openNote(id); else { setSel(id); setSelDel(false) } }}
                  onOpen={id => { if (!dragged.current) openNote(id) }} inside={inside}
                  onMenu={(kind, id, x, y) => setMenu({ kind, id, x, y })} />
              : <div className="bd-wall"><div className="bd-empty" style={{ margin: "auto" }}>Loading…</div></div>)
          : view === "wall"
          ? (notes !== null && wall
              ? <FreeWall wallKey={wall.id} notes={all} look={wall.look} photo={photo} kids={kids} pileOf={pileOf} under={under}
                  banner={<Banner name={wall.title} onName={t => changeWall({ title: t })} />}
                  sel={sel} dim={n => !!term && !hit(n)} flash={flash} popped={popped}
                  stat={id => { const c = columns.find(x => x.id === id); const st = c ? stageOf(c) : plantStage(0); return { id: st.id as Stage, label: st.label, ties: c?.ties ?? 0 } }}
                  name={pileName} statusCaps={n => <>{STATUS_CAPS[n.status]}{n.made_ref && <b>{madeLabel(n.made_ref)}</b>}</>}
                  centre={centre} show={showOnWall} onDragging={setMoving}
                  onPlace={m => place(m)}
                  onFile={(id, pile, m) => { place(m, 0); file(id, pile) }}
                  onTie={(id, to, m) => { place(m, 0); tie(id, to) }}
                  onSelect={id => { if (!id) { setSel(null); return } setLookOpen(false); if (PHONE()) openNote(id); else { setSel(id); setSelDel(false) } }}
                  onOpen={openNote} inside={inside}
                  onMenu={(kind, id, x, y) => setMenu({ kind, id, x, y })}
                  onAddAt={async (x, y, pile) => { const n = await add("note", pile, "", false, { x, y }); if (n) setOpen(n.id) }}
                  onGrow={id => { setGrowing(true); navigate(`${here}?tree=${id}&view=tree`) }} />
              : <div className="bd-wall"><div className="bd-empty" style={{ margin: "auto" }}>Loading…</div></div>)
          : <div className="bd-wall" style={wall ? { background: wallSurfaceOf(wall.look) } : undefined}>
              <Banner name={wall?.title ?? ""} onName={t => changeWall({ title: t })} />
              <div className="bd-cols" ref={wallRef}>{notes !== null && columns.map(column)}</div>{/* drawn once the notes are in: on a phone the wall snaps to its first column, so it must not open on an empty Just pinned that the piles then push aside */}
            </div>}
      </main>
      {lookOpen && wall && !treeView
        ? <LookPanel look={wall.look} title={wall.title} photo={photo} onLook={(l: Look) => changeWall({ look: l })} onTitle={t => changeWall({ title: t })} onPhoto={addPhoto} onClose={() => setLookOpen(false)} />
        : panel ?? startPanel}

      {drag && (() => { const n = byId.get(drag.id); return n ? <div className="bd-ghost" style={{ left: drag.x, top: drag.y, background: hex(n.color) }}>{nameOf(n)}</div> : null })()}

      {menu && mNote && (
        <Popover x={menu.x} y={menu.y} label={`${nameOf(mNote)} menu`} onClose={() => setMenu(null)}>
          {menu.sub === "made" ? <>
            <p>What it became</p>
            {pieces === null && <div className="warn">Loading your work…</div>}
            {pieces?.length === 0 && <div className="warn">Nothing made yet. Make a board, report or analysis first.</div>}
            {pieces?.map(p => (
              <button key={p.ref} role="menuitemradio" aria-checked={mNote.made_ref === p.ref} className="bd-row" onClick={() => { setMade(mNote.id, p); setMenu(null) }}>
                <em style={{ width: 54 }}>{p.kind}</em><span className="t">{p.title}</span>
              </button>
            ))}
            <button className="bd-row" onClick={() => setMenu({ ...menu, sub: undefined })}><ArrowLeft size={14} /><span className="t">Back</span></button>
          </> : menu.sub === "delete" ? <>
            <p>Delete “{nameOf(mNote)}”?</p>
            <div className="warn">{inside.has(mNote.id) ? `It's a wall with ${inside.get(mNote.id)!.notes} note${inside.get(mNote.id)!.notes === 1 ? "" : "s"} (and any walls inside it). They're deleted too. This can't be undone.` : kids(mNote.id).length ? "What hangs off it moves up to where it hung." : "This can't be undone."}</div>
            <button className="bd-row del" onClick={() => remove(mNote.id)}><Trash2 size={14} /><span className="t">Delete note</span></button>
            <button className="bd-row" onClick={() => setMenu({ ...menu, sub: undefined })}><span className="t">Keep it</span></button>
          </> : <>
            <button className="bd-row" onClick={() => { setOpen(mNote.id); setMenu(null) }}><PenLine size={14} /><span className="t">Open its page</span></button>
            <button className="bd-row" onClick={() => { setMenu(null); makeWall(mNote.id) }}><Layers size={14} /><span className="t">{inside.has(mNote.id) ? "Open its wall" : "Turn into a wall"}</span></button>
            <p>Status</p>
            {STATUSES.map(s => <button key={s.id} role="menuitemradio" aria-checked={mNote.status === s.id} className="bd-row" onClick={() => { setStatusOf(mNote.id, s.id); setMenu(null) }}>{mNote.status === s.id ? <Check size={14} /> : <span style={{ width: 14 }} />}<span className="t">{s.label}</span></button>)}
            <p>Became</p>
            <button className="bd-row" onClick={() => { loadPieces(); setMenu({ ...menu, sub: "made" }) }}><Link2 size={14} /><span className="t">{mNote.made_ref ? `${madeLabel(mNote.made_ref)}: change…` : "Link what it became…"}</span></button>
            {mNote.made_ref && <button className="bd-row" onClick={() => { setMade(mNote.id, null); setMenu(null) }}><Unlink size={14} /><span className="t">Remove the link</span></button>}
            <p>Thread</p>
            <button className="bd-row" disabled={byId.get(mNote.parent_id ?? "")?.kind !== "note"} onClick={() => { untie(mNote.id); setMenu(null) }}><span style={{ width: 14 }} /><span className="t">Untie</span></button>
            <p>Colour</p>
            <div className="bd-sw">{COLORS.map(c => <button key={c.id} className="bd-swatch" aria-label={`Colour ${c.id}`} aria-pressed={mNote.color === c.id} style={{ background: c.c }} onClick={() => change(mNote.id, n => ({ ...n, color: c.id }), 300)} />)}</div>
            <button className="bd-row del" onClick={() => setMenu({ ...menu, sub: "delete" })}><Trash2 size={14} /><span className="t">Delete…</span></button>
          </>}
        </Popover>
      )}
      {menu && mPile && (
        <Popover x={menu.x} y={menu.y} label={`${nameOf(mPile)} menu`} onClose={() => setMenu(null)}>
          {menu.sub === "delete" ? <>
            <p>Delete the frame “{nameOf(mPile)}”?</p>
            <div className="warn">Its notes go back to Just pinned, still tied together.</div>
            <button className="bd-row del" onClick={() => remove(mPile.id)}><Trash2 size={14} /><span className="t">Delete frame</span></button>
            <button className="bd-row" onClick={() => setMenu({ ...menu, sub: undefined })}><span className="t">Keep it</span></button>
          </> : <>
            <button className="bd-row" onClick={() => { setRenaming(mPile.id); setMenu(null) }}><Type size={14} /><span className="t">Rename</span></button>
            <button className="bd-row" onClick={() => { setOpen(mPile.id); setMenu(null) }}><PenLine size={14} /><span className="t">Write its question</span></button>
            <button className="bd-row" onClick={() => { setGrowing(true); navigate(`${here}?tree=${mPile.id}&view=tree`); setMenu(null) }}><Sprout size={14} /><span className="t">Grow this idea</span></button>
            <button className="bd-row" onClick={() => { setGrowing(false); navigate(`${here}?tree=${mPile.id}&view=tree`); setMenu(null) }}><GitFork size={14} /><span className="t">See the tree</span></button>
            <button className="bd-row" onClick={async () => { setMenu(null); const n = await add("note", mPile.id); if (n) setOpen(n.id) }}><Plus size={14} /><span className="t">New note in this frame</span></button>
            <p>Colour</p>
            <div className="bd-sw">{COLORS.map(c => <button key={c.id} className="bd-swatch" aria-label={`Frame colour ${c.id}`} aria-pressed={mPile.color === c.id} style={{ background: c.c }} onClick={() => change(mPile.id, n => ({ ...n, color: c.id }), 300)} />)}</div>
            <button className="bd-row del" onClick={() => setMenu({ ...menu, sub: "delete" })}><Trash2 size={14} /><span className="t">Delete frame…</span></button>
          </>}
        </Popover>
      )}

      {note && (
        <div className="bd-sheet" role="dialog" aria-label={nameOf(note)} style={{ ["--bd-paper" as any]: `color-mix(in srgb, ${hex(note.color)} 22%, #fbfaf6)` }}>
          <div className="bd-sheet-top" onPointerDown={e => { if ((e.target as HTMLElement).closest("button")) e.preventDefault() }}>
            <button className="bd-tb" onClick={close} aria-label="Back to Dump & Arrange"><ArrowLeft size={17} /> Dump &amp; Arrange</button>
            <span className="bd-crumb">{note.kind === "tree" ? "The frame's page · first line is its question" : notePile ? <><span className="bd-dot" style={{ background: hex(notePile.color) }} /> {nameOf(notePile)}</> : "Just pinned"}</span>
            <span className="bd-status" aria-live="polite">{status === "saving" ? <><Loader2 size={12} className="an-spin" /> Saving</> : status === "saved" ? <><Check size={12} /> Saved</> : status === "error" ? <button className="bd-retry" onClick={retry}>Not saved yet · Try again</button> : ""}</span>
            <span style={{ flex: 1 }} />
            {note.kind === "note" && <>
              {STATUSES.map(s => <button key={s.id} className={`bd-tb${note.status === s.id ? " on" : ""}`} aria-pressed={note.status === s.id} onClick={() => setStatusOf(note.id, s.id)}>{s.label}</button>)}
              <span className="bd-sep" />
            </>}
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
              ? <><button className="bd-tb pill" style={{ background: DS_ERROR }} onClick={() => remove(note.id)}>{note.kind === "tree" ? "Delete frame" : "Delete note"}</button><button className="bd-tb" onClick={() => setConfirmDel(null)}>Keep</button></>
              : <button className="bd-tb" aria-label={note.kind === "tree" ? "Delete frame" : "Delete note"} title="Delete" onClick={() => setConfirmDel(note.id)}><Trash2 size={16} /></button>}
          </div>
          <div className="bd-page">
            <div className="bd-inner">
              <input className="bd-title" value={note.title} maxLength={120} placeholder={note.kind === "tree" ? "Name this frame" : "Title"} aria-label="Title" autoFocus={!note.title}
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
      <div className="bd-live" aria-live="polite">{toast && <div className="bd-toast">{toast}</div>}</div>
    </div>
  )
}
