import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Search, X, Plus, FolderPlus, LayoutGrid, List, ChevronLeft, MoreHorizontal, Copy, Trash2, FolderInput, Check, Clock, AlertCircle, Folder, Pencil } from "lucide-react"
import { supabase } from "../lib/supabase"
import { SURFACE_BASE, SURFACE_1, SURFACE_2, ACCENT_SOLID, ACCENT_INK, TEXT_PRIMARY, TEXT_MUTED, DS_ERROR, DS_BORDER, DS_BORDER_STRONG, SCRIM } from "../theme"

/* The Library: every board you've saved, in folders you make.
   Wall: folders float where you put them, as small stacks of their newest boards; boards in no folder wait in the Unsorted tray.
   List: the folders down the side and the boards as cards you can tick (shift-click ticks a run) to move, duplicate or delete together.
   Drag any card (or the ticked ones) onto a folder to file it. Deleting a folder never deletes its boards: they go back to Unsorted. */

type Card = { id: string; title: string; updated_at: string; thumb: any; folder_id: string | null; empty: boolean }
type FolderRow = { id: string; name: string; x: number | null; y: number | null; created_at: string }
type Place = "all" | "unsorted" | string

const STACK_W = 200, STACK_H = 172, TRAY_H = 118
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const readView = (): "wall" | "list" => { try { const v = localStorage.getItem("ps-lib-view"); if (v === "wall" || v === "list") return v } catch { /* no storage */ } return window.innerWidth >= 900 ? "wall" : "list" }

export function Library({ userId, currentId, cols, cardOf, Thumb, ago, settle, onOpen, onNew, onClose, onDeleted, onRenamed }: {
  userId: string; currentId: string | null
  cols: string // the board columns a card's picture needs
  cardOf: (row: any) => { id: string; title: string; updated_at: string; thumb: any }
  Thumb: (p: { data: any }) => React.ReactElement
  ago: (iso: string) => string
  settle: (id?: string) => Promise<unknown> // saves still on their way land first
  onOpen: (id: string) => Promise<void> | void
  onNew: (folderId: string | null) => void
  onClose: () => void
  onDeleted: (id: string) => void
  onRenamed: (id: string, title: string) => void
}) {
  const [boards, setBoards] = useState<Card[] | null>(null)
  const [folders, setFolders] = useState<FolderRow[]>([])
  const [note, setNote] = useState("")
  const [view, setViewState] = useState<"wall" | "list">(readView)
  const [place, setPlace] = useState<Place>("all")
  const [q, setQ] = useState("")
  const [sel, setSel] = useState<Set<string>>(new Set())
  const lastPick = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; kind: "board" | "folder" } | null>(null)
  const [moveMenu, setMoveMenu] = useState(false)
  const [renaming, setRenaming] = useState<{ id: string; kind: "board" | "folder"; text: string } | null>(null)
  const [confirm, setConfirm] = useState<{ boards?: string[]; folder?: string } | null>(null)
  const [busy, setBusy] = useState("")
  const [over, setOver] = useState<string | null>(null) // the folder (or "unsorted") a card is being dragged over
  const [opening, setOpening] = useState<string | null>(null)
  const wallRef = useRef<HTMLDivElement>(null)
  const [wallSize, setWallSize] = useState({ w: 900, h: 520 })
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)

  const setView = (v: "wall" | "list") => { setViewState(v); setSel(new Set()); try { localStorage.setItem("ps-lib-view", v) } catch { /* fine */ } }
  const fail = (text: string) => setNote(text)

  const load = async () => {
    setNote("")
    await settle()
    const [b, f] = await Promise.all([
      (supabase as any).from("boards").select(`${cols}, folder_id, texts:canvas_data->texts`).eq("user_id", userId).order("updated_at", { ascending: false }).range(0, 999),
      (supabase as any).from("board_folders").select("id, name, x, y, created_at").eq("user_id", userId).order("created_at"),
    ])
    if (b.error) { fail("Couldn't load your boards. Check your connection."); setBoards(x => x ?? []); return }
    setBoards((b.data ?? []).map((r: any) => {
      const c = cardOf(r), t = c.thumb, n = (v: unknown) => (Array.isArray(v) ? v.length : 0)
      return { ...c, folder_id: r.folder_id ?? null, empty: !n(t.players) && !n(t.arrows) && !n(t.shapes) && !n(t.customZones) && !n(r.texts) }
    }))
    if (!f.error) setFolders(f.data ?? [])
  }
  useEffect(() => { load() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 6000); return () => clearTimeout(t) }, [note])
  useEffect(() => {
    const el = wallRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWallSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view, boards === null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc closes the innermost thing first: a dialog, a menu, the ticks, then the Library
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input")) { if (e.key === "Escape") { e.stopImmediatePropagation(); (e.target as HTMLElement).blur() } return }
      e.stopImmediatePropagation() // the board underneath doesn't hear keys while the Library is open
      if (e.key === "Escape") {
        e.preventDefault()
        if (confirm) setConfirm(null)
        else if (menu || moveMenu) { setMenu(null); setMoveMenu(false) }
        else if (sel.size) setSel(new Set())
        else onClose()
      } else if ((e.key === "a" || e.key === "A") && (e.metaKey || e.ctrlKey) && shownList) {
        e.preventDefault(); setSel(new Set(shownList.map(b => b.id)))
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.size) {
        e.preventDefault(); setConfirm({ boards: [...sel] })
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  /* ── What's on show ── */
  const inFolder = (id: string | null) => (boards ?? []).filter(b => b.folder_id === id)
  const searching = q.trim().length > 0
  const shownList = useMemo(() => {
    if (!boards) return null
    if (searching) { const k = plain(q.trim()); return boards.filter(b => plain(b.title).includes(k)) }
    return place === "all" ? boards : place === "unsorted" ? boards.filter(b => !b.folder_id) : boards.filter(b => b.folder_id === place)
  }, [boards, q, place, searching])
  const placeName = searching ? `Results for “${q.trim()}”` : place === "all" ? "All boards" : place === "unsorted" ? "Unsorted" : folders.find(f => f.id === place)?.name ?? "Folder"
  const emptyHere = (shownList ?? []).filter(b => b.empty && b.id !== currentId)

  /** Where each folder sits on the wall: where you left it, or the next free spot of a tidy grid */
  const spots = useMemo(() => {
    const perRow = Math.max(1, Math.floor((wallSize.w - 32) / (STACK_W + 36)))
    const tidy = (i: number) => ({ x: 24 + (i % perRow) * (STACK_W + 36), y: 20 + Math.floor(i / perRow) * (STACK_H + 34) })
    const maxX = Math.max(8, wallSize.w - STACK_W - 8), maxY = Math.max(8, wallSize.h - TRAY_H - STACK_H - 16)
    const out = new Map<string, { x: number; y: number }>()
    const clamp = (p: { x: number; y: number }) => ({ x: Math.min(maxX, Math.max(8, p.x)), y: Math.min(maxY, Math.max(8, p.y)) })
    const clash = (p: { x: number; y: number }) => [...out.values()].some(o => Math.abs(o.x - p.x) < STACK_W && Math.abs(o.y - p.y) < STACK_H)
    let k = 0
    const next = () => { let p = clamp(tidy(k++)); for (let n = 0; n < 200 && clash(p); n++) p = clamp(tidy(k++)); return p } // the next tidy spot nothing stands on
    folders.forEach(f => { if (f.x != null && f.y != null) out.set(f.id, clamp({ x: f.x, y: f.y })) })
    folders.forEach(f => { if (!out.has(f.id)) out.set(f.id, next()) })
    return { at: out, tidy, free: next }
  }, [folders, wallSize])

  /* ── Ticking boards ── */
  const tick = (b: Card, e: React.MouseEvent) => {
    const list = shownList ?? [], from = lastPick.current
    setSel(prev => {
      const next = new Set(prev)
      if (e.shiftKey && from) {
        const a = list.findIndex(x => x.id === from), z = list.findIndex(x => x.id === b.id)
        if (a >= 0 && z >= 0) { for (const x of list.slice(Math.min(a, z), Math.max(a, z) + 1)) next.add(x.id); return next }
      }
      if (next.has(b.id)) next.delete(b.id); else next.add(b.id)
      return next
    })
    lastPick.current = b.id
  }
  const open = async (b: Card) => {
    if (opening) return
    setOpening(b.id)
    try { await onOpen(b.id) } finally { setOpening(null) }
  }

  /* ── Changes (each one shows at once, and comes back if the database says no) ── */
  const moveTo = async (ids: string[], folder: string | null) => {
    if (!ids.length) return
    const before = boards
    setBoards(list => (list ?? []).map(b => (ids.includes(b.id) ? { ...b, folder_id: folder } : b)))
    setSel(new Set()); setMoveMenu(false); setMenu(null)
    const { error } = await (supabase as any).from("boards").update({ folder_id: folder }).in("id", ids).eq("user_id", userId)
    if (error) { setBoards(before); fail("Couldn't move those boards. Try again.") }
  }
  const duplicate = async (ids: string[]) => {
    setBusy("Duplicating…"); setMenu(null)
    const made: Card[] = []
    for (const id of ids) {
      const b = boards?.find(x => x.id === id)
      if (!b) continue
      await settle(id)
      const { data: src } = await (supabase as any).from("boards").select("canvas_data, narrative").eq("id", id).single()
      const cd = src?.canvas_data, title = `${b.title} (copy)`.slice(0, 80)
      // a copy is a new piece: it takes its own issue number when it's first exported
      const copy = cd && typeof cd === "object" && cd.settings ? { ...cd, settings: { ...cd.settings, issueNo: 0, issueDay: "" } } : cd
      const res = src ? await (supabase as any).from("boards").insert({ user_id: userId, title, canvas_data: copy, narrative: src.narrative ?? "", folder_id: b.folder_id }).select("id, updated_at").single() : null
      if (!res || res.error || !res.data?.id) { fail(`Couldn't duplicate “${b.title}”. Try again.`); break }
      made.push({ ...b, id: res.data.id, title, updated_at: res.data.updated_at ?? new Date().toISOString() })
    }
    setBusy(""); setSel(new Set(made.map(m => m.id)))
    if (made.length) setBoards(list => [...made, ...(list ?? [])])
  }
  const removeBoards = async (ids: string[]) => {
    setBusy("Deleting…"); setConfirm(null)
    const { error } = await (supabase as any).from("boards").delete().in("id", ids).eq("user_id", userId)
    setBusy("")
    if (error) { fail("Couldn't delete those boards. Check your connection and try again."); return }
    setBoards(list => (list ?? []).filter(b => !ids.includes(b.id)))
    setSel(new Set())
    ids.forEach(onDeleted)
  }
  const rename = async () => {
    if (!renaming) return
    const r = renaming, text = r.text.trim().slice(0, r.kind === "board" ? 80 : 60)
    setRenaming(null)
    if (!text) return
    if (r.kind === "board") {
      const b = boards?.find(x => x.id === r.id)
      if (!b || text === b.title) return
      setBoards(list => (list ?? []).map(x => (x.id === r.id ? { ...x, title: text } : x)))
      const { error } = await (supabase as any).from("boards").update({ title: text }).eq("id", r.id).eq("user_id", userId)
      if (error) { setBoards(list => (list ?? []).map(x => (x.id === r.id ? { ...x, title: b.title } : x))); fail(`Couldn't rename “${b.title}”.`); return }
      onRenamed(r.id, text)
    } else {
      const f = folders.find(x => x.id === r.id)
      if (!f || text === f.name) return
      setFolders(list => list.map(x => (x.id === r.id ? { ...x, name: text } : x)))
      const { error } = await (supabase as any).from("board_folders").update({ name: text }).eq("id", r.id).eq("user_id", userId)
      if (error) { setFolders(list => list.map(x => (x.id === r.id ? { ...x, name: f.name } : x))); fail("Couldn't rename that folder.") }
    }
  }
  const newFolder = async (then?: string[]) => {
    const i = folders.length, p = spots.free()
    const name = `Folder ${i + 1}`
    const { data, error } = await (supabase as any).from("board_folders").insert({ user_id: userId, name, x: view === "wall" ? p.x : null, y: view === "wall" ? p.y : null }).select("id, name, x, y, created_at").single()
    if (error || !data) { fail("Couldn't make a folder. Try again."); return }
    setFolders(list => [...list, data])
    setRenaming({ id: data.id, kind: "folder", text: name })
    if (then?.length) moveTo(then, data.id)
  }
  const removeFolder = async (id: string) => {
    setConfirm(null)
    const { error } = await (supabase as any).from("board_folders").delete().eq("id", id).eq("user_id", userId)
    if (error) { fail("Couldn't delete that folder."); return }
    setFolders(list => list.filter(f => f.id !== id))
    setBoards(list => (list ?? []).map(b => (b.folder_id === id ? { ...b, folder_id: null } : b)))
    if (place === id) setPlace("all")
  }
  const saveSpot = async (id: string, x: number, y: number) => {
    setFolders(list => list.map(f => (f.id === id ? { ...f, x, y } : f)))
    await (supabase as any).from("board_folders").update({ x, y }).eq("id", id).eq("user_id", userId)
  }
  const tidyUp = () => { folders.forEach((f, i) => { const p = spots.tidy(i); saveSpot(f.id, p.x, p.y) }) }

  /* ── Dragging cards onto folders ── */
  const dragIds = (b: Card) => (sel.has(b.id) ? [...sel] : [b.id])
  const cardDrag = (b: Card) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/ps-boards", JSON.stringify(dragIds(b))); e.dataTransfer.effectAllowed = "move" },
    onDragEnd: () => setOver(null),
  })
  const dropOn = (target: string) => ({
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes("text/ps-boards")) { e.preventDefault(); setOver(target) } },
    onDragLeave: () => setOver(o => (o === target ? null : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setOver(null)
      try { const ids = JSON.parse(e.dataTransfer.getData("text/ps-boards")); if (Array.isArray(ids)) moveTo(ids, target === "unsorted" ? null : target) } catch { /* not ours */ }
    },
  })

  /* ── Dragging folders around the wall ── */
  const folderDown = (f: FolderRow, e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, input")) return
    const p = spots.at.get(f.id)!
    drag.current = { id: f.id, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const folderMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    setDragPos({ id: d.id, x: Math.min(wallSize.w - STACK_W - 8, Math.max(8, d.x + dx)), y: Math.min(wallSize.h - TRAY_H - STACK_H - 16, Math.max(8, d.y + dy)) })
  }
  const folderUp = (f: FolderRow) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved && dragPos) { saveSpot(f.id, Math.round(dragPos.x), Math.round(dragPos.y)); setDragPos(null); return }
    setDragPos(null); setPlace(f.id); setView("list")
  }

  /* ── Pieces ── */
  const chip = (on: boolean): React.CSSProperties => ({ height: 30, padding: "0 10px", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    background: on ? SURFACE_2 : "transparent", color: on ? TEXT_PRIMARY : TEXT_MUTED, border: `1px solid ${on ? DS_BORDER_STRONG : "transparent"}` })
  const menuItem = (label: string, icon: React.ReactNode, run: () => void, danger = false) => (
    <button key={label} onClick={e => { e.stopPropagation(); setMenu(null); run() }} className="lib-mi" style={{ color: danger ? DS_ERROR : TEXT_PRIMARY }}>{icon}{label}</button>
  )
  const moveList = (ids: string[], currentFolder: string | null | undefined) => (
    <>
      {currentFolder !== null && menuItem("Unsorted", <Folder size={13} />, () => moveTo(ids, null))}
      {folders.filter(f => f.id !== currentFolder).map(f => menuItem(f.name, <Folder size={13} />, () => moveTo(ids, f.id)))}
      {menuItem("New folder…", <FolderPlus size={13} />, () => newFolder(ids))}
    </>
  )
  const nameField = (id: string, kind: "board" | "folder", style?: React.CSSProperties) => (
    <input autoFocus onFocus={e => e.currentTarget.select()} value={renaming!.text} maxLength={kind === "board" ? 80 : 60} aria-label={kind === "board" ? "Board name" : "Folder name"}
      onChange={e => setRenaming({ id, kind, text: e.target.value })} onBlur={rename} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null) }} className="lib-name" style={style} />
  )

  const card = (b: Card, small = false) => {
    const ticked = sel.has(b.id), here = b.id === currentId
    return (
      <div key={b.id} className={`lib-card${ticked ? " on" : ""}${small ? " small" : ""}`} {...cardDrag(b)} style={{ borderColor: ticked ? ACCENT_SOLID : here ? "rgba(215,255,60,.5)" : DS_BORDER }}>
        <button className="lib-thumb" aria-label={sel.size ? `Tick ${b.title}` : `Open ${b.title}`} onClick={e => (sel.size || e.shiftKey || e.metaKey || e.ctrlKey ? tick(b, e) : open(b))}>
          <Thumb data={b.thumb} />
          {opening === b.id && <span className="lib-opening"><Clock size={13} className="animate-spin" /> Opening…</span>}
        </button>
        {!small && (
          <button className="lib-tick" role="checkbox" aria-checked={ticked} aria-label={`Select ${b.title}`} onClick={e => tick(b, e)}
            style={{ background: ticked ? ACCENT_SOLID : "rgba(0,0,0,.45)", borderColor: ticked ? ACCENT_SOLID : "#fff" }}>{ticked && <Check size={12} color={ACCENT_INK} strokeWidth={3} />}</button>
        )}
        <div className="lib-cap">
          <div style={{ flex: 1, minWidth: 0 }}>
            {renaming?.id === b.id ? nameField(b.id, "board") : <p className="lib-t" title={b.title}>{b.title}</p>}
            <p className="lib-s" style={{ color: here ? ACCENT_SOLID : TEXT_MUTED }}>{here ? "Open now" : `${b.empty ? "Empty · " : ""}${ago(b.updated_at)}`}</p>
          </div>
          {!small && (
            <div style={{ position: "relative" }}>
              <button className="lib-dots" aria-label={`More for ${b.title}`} aria-expanded={menu?.id === b.id} onClick={e => { e.stopPropagation(); setMenu(m => (m?.id === b.id ? null : { id: b.id, kind: "board" })) }}><MoreHorizontal size={15} /></button>
              {menu?.id === b.id && (
                <div className="lib-menu" style={{ background: SURFACE_1, borderColor: DS_BORDER }} onClick={e => e.stopPropagation()}>
                  {menuItem("Rename", <Pencil size={13} />, () => setRenaming({ id: b.id, kind: "board", text: b.title }))}
                  {menuItem("Duplicate", <Copy size={13} />, () => duplicate([b.id]))}
                  <p className="lib-mh">Move to</p>
                  {moveList([b.id], b.folder_id)}
                  {menuItem("Delete…", <Trash2 size={13} />, () => setConfirm({ boards: [b.id] }), true)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const stack = (f: FolderRow) => {
    const mine = inFolder(f.id), top = mine.slice(0, 3).reverse()
    const p = dragPos?.id === f.id ? dragPos : spots.at.get(f.id)!
    const tilt = [-7, 5, 0]
    return (
      <div key={f.id} className={`lib-stack${over === f.id ? " over" : ""}${dragPos?.id === f.id ? " lift" : ""}`} style={{ left: p.x, top: p.y }}
        onPointerDown={e => folderDown(f, e)} onPointerMove={folderMove} onPointerUp={() => folderUp(f)} {...dropOn(f.id)}
        onContextMenu={e => { e.preventDefault(); setMenu({ id: f.id, kind: "folder" }) }}
        role="button" tabIndex={0} aria-label={`${f.name}, ${mine.length} board${mine.length === 1 ? "" : "s"}. Drag to move, click to open`}
        onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) { setPlace(f.id); setView("list") } }}>
        <div className="lib-pile">
          {top.length ? top.map((b, i) => (
            <div key={b.id} className="lib-sheet" style={{ transform: `rotate(${tilt[i + 3 - top.length]}deg)` }}><Thumb data={b.thumb} /></div>
          )) : <div className="lib-sheet empty">Drop boards here</div>}
        </div>
        <div className="lib-label">
          {renaming?.id === f.id ? nameField(f.id, "folder", { textAlign: "center" }) : <b title={f.name}>{f.name}</b>}
          <span>{mine.length} board{mine.length === 1 ? "" : "s"}</span>
        </div>
        <button className="lib-dots lib-fdots" aria-label={`More for ${f.name}`} onClick={e => { e.stopPropagation(); setMenu(m => (m?.id === f.id ? null : { id: f.id, kind: "folder" })) }}><MoreHorizontal size={15} /></button>
        {menu?.id === f.id && folderMenu(f)}
      </div>
    )
  }
  const folderMenu = (f: FolderRow) => (
    <div className="lib-menu" style={{ background: SURFACE_1, borderColor: DS_BORDER, top: 28, right: 0 }} onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      {menuItem("Open", <Folder size={13} />, () => { setPlace(f.id); setView("list") })}
      {menuItem("New board here", <Plus size={13} />, () => onNew(f.id))}
      {menuItem("Rename", <Pencil size={13} />, () => setRenaming({ id: f.id, kind: "folder", text: f.name }))}
      {menuItem("Delete folder…", <Trash2 size={13} />, () => setConfirm({ folder: f.id }), true)}
    </div>
  )

  const unsorted = inFolder(null)
  const placeFolder = place !== "all" && place !== "unsorted" ? place : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: SCRIM }} onClick={onClose}>
      <style>{LIB_CSS}</style>
      <div className="lib" style={{ background: SURFACE_BASE, borderColor: DS_BORDER_STRONG }} onClick={e => { e.stopPropagation(); setMenu(null); setMoveMenu(false) }} role="dialog" aria-label="Library">
        {/* Top: search, Wall or List, and the two ways to add */}
        <div className="lib-top" style={{ borderColor: DS_BORDER, background: SURFACE_1 }}>
          <span className="lib-h">LIBRARY</span>
          <label className="lib-search" style={{ borderColor: DS_BORDER, background: SURFACE_2 }}>
            <Search size={14} style={{ color: TEXT_MUTED }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search every board" aria-label="Search every board" />
            {q && <button onClick={() => setQ("")} aria-label="Clear the search"><X size={13} /></button>}
          </label>
          <div className="lib-seg" style={{ borderColor: DS_BORDER }} role="group" aria-label="View">
            <button style={chip(view === "wall")} aria-pressed={view === "wall"} onClick={() => setView("wall")}><LayoutGrid size={13} /> Wall</button>
            <button style={chip(view === "list")} aria-pressed={view === "list"} onClick={() => setView("list")}><List size={13} /> List</button>
          </div>
          {view === "wall" && !searching && folders.length > 1 && <button className="lib-btn" style={{ borderColor: DS_BORDER, color: TEXT_PRIMARY }} onClick={tidyUp} title="Line the folders up neatly">Tidy up</button>}
          <button className="lib-btn" style={{ borderColor: DS_BORDER, color: TEXT_PRIMARY }} onClick={() => newFolder()}><FolderPlus size={14} /> Folder</button>
          <button className="lib-new" style={{ background: ACCENT_SOLID, color: ACCENT_INK }} onClick={() => onNew(view === "list" ? placeFolder : null)}><Plus size={14} /> New board</button>
          <button className="lib-x" onClick={onClose} aria-label="Close the Library"><X size={16} /></button>
        </div>

        {note && (
          <div className="lib-note" role="alert"><AlertCircle size={13} style={{ color: DS_ERROR }} /> <span style={{ flex: 1 }}>{note}</span><button onClick={load}>Reload</button></div>
        )}

        {boards === null ? (
          <div className="lib-wait" style={{ color: TEXT_MUTED }}><Clock size={14} className="animate-spin" /> Loading your boards…</div>
        ) : view === "wall" && !searching ? (
          /* ── The wall ── */
          <div className="lib-wall" ref={wallRef}>
            {folders.map(stack)}
            {!folders.length && (
              <div className="lib-hint" style={{ color: TEXT_MUTED }}>
                <FolderPlus size={22} />
                <p>Make a folder, then drag boards from Unsorted onto it.</p>
                <button className="lib-btn" style={{ borderColor: DS_BORDER, color: TEXT_PRIMARY }} onClick={() => newFolder()}>Make a folder</button>
              </div>
            )}
            <div className={`lib-tray${over === "unsorted" ? " over" : ""}`} style={{ borderColor: DS_BORDER, background: SURFACE_1 }} {...dropOn("unsorted")}>
              <div className="lib-tray-h"><b>Unsorted</b><span>{unsorted.length}</span></div>
              <div className="lib-tray-row">
                {unsorted.length ? unsorted.map(b => card(b, true)) : <p style={{ color: TEXT_MUTED, fontSize: 12, margin: 0 }}>Everything's in a folder.</p>}
              </div>
            </div>
          </div>
        ) : (
          /* ── The list ── */
          <div className="lib-body">
            <nav className="lib-rail" style={{ borderColor: DS_BORDER }} aria-label="Folders">
              {view === "list" && placeFolder && <button className="lib-back" onClick={() => setView("wall")}><ChevronLeft size={14} /> Wall</button>}
              {([["all", "All boards", boards.length], ["unsorted", "Unsorted", unsorted.length]] as const).map(([k, label, n]) => (
                <button key={k} className={`lib-rl${place === k && !searching ? " on" : ""}${over === k ? " over" : ""}`} onClick={() => { setPlace(k); setQ(""); setSel(new Set()) }} {...(k === "unsorted" ? dropOn("unsorted") : {})}>
                  {label}<span>{n}</span>
                </button>
              ))}
              <p className="lib-mh" style={{ marginTop: 10 }}>Folders</p>
              {folders.map(f => (
                <div key={f.id} style={{ position: "relative" }}>
                  <button className={`lib-rl${place === f.id && !searching ? " on" : ""}${over === f.id ? " over" : ""}`} onClick={() => { setPlace(f.id); setQ(""); setSel(new Set()) }} {...dropOn(f.id)}
                    onContextMenu={e => { e.preventDefault(); setMenu({ id: f.id, kind: "folder" }) }} onDoubleClick={() => setRenaming({ id: f.id, kind: "folder", text: f.name })}>
                    <Folder size={13} style={{ flexShrink: 0 }} />
                    {renaming?.id === f.id ? nameField(f.id, "folder") : <span className="lib-rn">{f.name}</span>}
                    <span>{inFolder(f.id).length}</span>
                  </button>
                  {menu?.id === f.id && folderMenu(f)}
                </div>
              ))}
              <button className="lib-rl" style={{ color: TEXT_MUTED }} onClick={() => newFolder()}><FolderPlus size={13} /> New folder</button>
            </nav>
            <div className="lib-main">
              <div className="lib-mainh">
                <b>{placeName}</b><span style={{ color: TEXT_MUTED }}>{shownList?.length ?? 0}</span>
                {emptyHere.length > 0 && !sel.size && (
                  <button className="lib-link" onClick={() => setSel(new Set(emptyHere.map(b => b.id)))}>Select the {emptyHere.length} with nothing on {emptyHere.length === 1 ? "it" : "them"}</button>
                )}
                <span style={{ flex: 1 }} />
                {!!shownList?.length && <span style={{ color: TEXT_MUTED, fontSize: 12 }}>Tick to select · Shift-click a run · Drag onto a folder</span>}
              </div>
              {shownList?.length === 0 ? (
                <div className="lib-hint" style={{ color: TEXT_MUTED, position: "static", margin: "40px auto" }}>
                  <p>{searching ? "No board has that in its name." : place === "unsorted" ? "Everything's in a folder." : place === "all" ? "No saved boards yet. Press Save on a board to keep it." : "This folder's empty. Drag boards here, or start one."}</p>
                  {!searching && place !== "unsorted" && <button className="lib-new" style={{ background: ACCENT_SOLID, color: ACCENT_INK }} onClick={() => onNew(placeFolder)}><Plus size={14} /> New board</button>}
                </div>
              ) : (
                <div className="lib-grid">{(shownList ?? []).map(b => card(b))}</div>
              )}
            </div>
          </div>
        )}

        {/* Ticked boards: what you can do with all of them at once */}
        {sel.size > 0 && (
          <div className="lib-bar st-glass" onClick={e => e.stopPropagation()}>
            <b>{sel.size} selected</b>
            <div style={{ position: "relative" }}>
              <button onClick={() => setMoveMenu(m => !m)} aria-expanded={moveMenu}><FolderInput size={14} /> Move to</button>
              {moveMenu && <div className="lib-menu up" style={{ background: SURFACE_1, borderColor: DS_BORDER }}>{moveList([...sel], undefined)}</div>}
            </div>
            <button onClick={() => duplicate([...sel])}><Copy size={14} /> Duplicate</button>
            <button onClick={() => setConfirm({ boards: [...sel] })} style={{ color: "#f87171" }}><Trash2 size={14} /> Delete</button>
            <button onClick={() => setSel(new Set())} aria-label="Clear the selection"><X size={14} /></button>
          </div>
        )}
        {busy && <div className="lib-busy st-glass"><Clock size={13} className="animate-spin" /> {busy}</div>}

        {/* Are you sure? */}
        {confirm && (
          <div className="lib-confirm" onClick={() => setConfirm(null)}>
            <div style={{ background: SURFACE_1, borderColor: DS_BORDER_STRONG }} onClick={e => e.stopPropagation()} role="alertdialog" aria-label="Confirm">
              {confirm.boards ? (() => {
                const names = confirm.boards.map(id => boards?.find(b => b.id === id)?.title).filter(Boolean) as string[]
                return <>
                  <b>Delete {names.length === 1 ? `“${names[0]}”` : `${names.length} boards`}?</b>
                  {names.length > 1 && <p className="lib-names">{names.slice(0, 6).join(", ")}{names.length > 6 ? ` and ${names.length - 6} more` : ""}</p>}
                  <p>This can't be undone.</p>
                  <div><button onClick={() => setConfirm(null)} autoFocus>Cancel</button><button className="danger" onClick={() => removeBoards(confirm.boards!)}>Delete</button></div>
                </>
              })() : (() => {
                const f = folders.find(x => x.id === confirm.folder), n = inFolder(confirm.folder ?? null).length
                return <>
                  <b>Delete the folder “{f?.name}”?</b>
                  <p>{n ? `Its ${n} board${n === 1 ? "" : "s"} go back to Unsorted. No board is deleted.` : "It's empty."}</p>
                  <div><button onClick={() => setConfirm(null)} autoFocus>Cancel</button><button className="danger" onClick={() => removeFolder(confirm.folder!)}>Delete folder</button></div>
                </>
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const LIB_CSS = `
  .lib { position: relative; width: min(1180px, 100%); height: min(820px, 100%); display: flex; flex-direction: column; border: 1px solid; border-radius: 16px; overflow: hidden; color: var(--ps-tx); }
  .lib-top { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid; flex-wrap: wrap; }
  .lib-h { font: 700 16px 'Barlow Condensed', sans-serif; letter-spacing: .08em; margin-right: 4px; }
  .lib-search { flex: 1 1 200px; min-width: 160px; height: 34px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 1px solid; border-radius: 9px; }
  .lib-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: 500 13px Inter, system-ui, sans-serif; }
  .lib-search button { border: 0; background: transparent; color: inherit; opacity: .6; cursor: pointer; display: grid; place-items: center; }
  .lib-seg { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid; border-radius: 10px; }
  .lib-btn { height: 34px; padding: 0 12px; border-radius: 9px; border: 1px solid; background: transparent; display: inline-flex; align-items: center; gap: 6px; font: 600 12.5px Inter, system-ui, sans-serif; cursor: pointer; }
  .lib-btn:hover { background: var(--ps-hover); }
  .lib-new { height: 34px; padding: 0 14px; border-radius: 9px; border: 0; display: inline-flex; align-items: center; gap: 6px; font: 700 12.5px Inter, system-ui, sans-serif; cursor: pointer; }
  .lib-x { width: 34px; height: 34px; border-radius: 9px; border: 0; background: transparent; color: inherit; display: grid; place-items: center; cursor: pointer; }
  .lib-x:hover { background: var(--ps-hover); }
  .lib-note { display: flex; align-items: center; gap: 8px; margin: 8px 12px 0; padding: 8px 12px; border-radius: 8px; font-size: 12.5px; background: rgba(248,81,73,.12); }
  .lib-note button { border: 0; background: transparent; color: inherit; font-weight: 700; cursor: pointer; }
  .lib-wait { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; }
  .lib-wall { position: relative; flex: 1; min-height: 0; overflow: hidden; background-image: radial-gradient(var(--ps-bd2) 1px, transparent 1px); background-size: 20px 20px; }
  .lib-stack { position: absolute; width: ${STACK_W}px; height: ${STACK_H}px; cursor: grab; touch-action: none; border-radius: 12px; transition: transform .15s, filter .15s; outline: none; }
  .lib-stack:focus-visible { box-shadow: 0 0 0 2px #d7ff3c; }
  .lib-stack:hover { transform: translateY(-2px); }
  .lib-stack.lift { cursor: grabbing; transform: scale(1.04); filter: drop-shadow(0 18px 24px rgba(0,0,0,.45)); z-index: 5; transition: none; }
  .lib-stack.over .lib-pile { outline: 3px dashed #d7ff3c; outline-offset: 6px; border-radius: 8px; }
  .lib-pile { position: relative; width: 180px; height: 118px; margin: 0 auto; }
  .lib-sheet { position: absolute; inset: 0; border-radius: 7px; overflow: hidden; border: 2px solid #fff; box-shadow: 0 6px 14px rgba(0,0,0,.35); background: #1a472a; }
  .lib-sheet svg { width: 100%; height: 100%; object-fit: cover; }
  .lib-sheet.empty { display: grid; place-items: center; border: 2px dashed var(--ps-bd2); background: transparent; box-shadow: none; font: 600 11.5px Inter, sans-serif; color: var(--ps-mu); }
  .lib-label { margin-top: 10px; text-align: center; display: flex; flex-direction: column; gap: 1px; }
  .lib-label b { font: 600 13px Inter, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lib-label span { font-size: 11.5px; color: var(--ps-mu); }
  .lib-fdots { position: absolute; top: -6px; right: 0; opacity: 0; }
  .lib-stack:hover .lib-fdots, .lib-stack:focus-within .lib-fdots { opacity: 1; }
  .lib-tray { position: absolute; left: 10px; right: 10px; bottom: 10px; height: ${TRAY_H - 20}px; border: 1px solid; border-radius: 12px; display: flex; align-items: center; gap: 12px; padding: 0 12px; }
  .lib-tray.over { outline: 3px dashed #d7ff3c; outline-offset: 2px; }
  .lib-tray-h { display: flex; flex-direction: column; font-size: 12px; min-width: 64px; }
  .lib-tray-h span { color: var(--ps-mu); }
  .lib-tray-row { flex: 1; min-width: 0; display: flex; gap: 10px; overflow-x: auto; align-items: center; padding: 6px 2px; }
  .lib-card { position: relative; border: 1px solid; border-radius: 10px; background: var(--ps-s1); overflow: visible; transition: border-color .12s, transform .12s; }
  .lib-card:hover { transform: translateY(-1px); }
  .lib-card.small { flex: 0 0 116px; }
  .lib-card.small .lib-cap { padding: 4px 6px 5px; }
  .lib-card.small .lib-t { font-size: 11px; }
  .lib-card.small .lib-s { display: none; }
  .lib-thumb { position: relative; display: block; width: 100%; padding: 0; border: 0; border-radius: 9px 9px 0 0; overflow: hidden; cursor: pointer; background: transparent; }
  .lib-opening { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(0,0,0,.55); color: #fff; font: 600 12px Inter, sans-serif; }
  .lib-tick { position: absolute; top: 8px; left: 8px; width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid; display: grid; place-items: center; cursor: pointer; opacity: 0; transition: opacity .12s; }
  .lib-card:hover .lib-tick, .lib-card.on .lib-tick, .lib-grid:has(.lib-card.on) .lib-tick, .lib-tick:focus-visible { opacity: 1; }
  .lib-cap { display: flex; align-items: flex-start; gap: 6px; padding: 8px 8px 9px 10px; }
  .lib-t { margin: 0; font: 600 13px Inter, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lib-s { margin: 2px 0 0; font-size: 11.5px; }
  .lib-dots { width: 26px; height: 26px; border-radius: 7px; border: 0; background: transparent; color: var(--ps-mu); display: grid; place-items: center; cursor: pointer; }
  .lib-dots:hover { background: var(--ps-hover); color: var(--ps-tx); }
  .lib-menu { position: absolute; right: 0; top: 100%; margin-top: 4px; min-width: 176px; max-height: 300px; overflow-y: auto; border: 1px solid; border-radius: 10px; box-shadow: 0 16px 36px rgba(0,0,0,.45); z-index: 30; padding: 4px; }
  .lib-menu.up { top: auto; bottom: 100%; margin: 0 0 6px; left: 0; right: auto; }
  .lib-mi { width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; font: 500 12.5px Inter, sans-serif; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lib-mi:hover { background: var(--ps-hover); }
  .lib-mh { margin: 6px 9px 2px; font: 700 10.5px Inter, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: var(--ps-mu); }
  .lib-name { width: 100%; height: 26px; border-radius: 6px; border: 1px solid #d7ff3c; background: var(--ps-s2); color: inherit; font: 600 12.5px Inter, sans-serif; padding: 0 6px; outline: none; }
  .lib-body { flex: 1; min-height: 0; display: flex; }
  .lib-rail { width: 200px; flex-shrink: 0; border-right: 1px solid; padding: 10px 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .lib-rl { width: 100%; display: flex; align-items: center; gap: 8px; padding: 7px 9px; border-radius: 8px; border: 0; background: transparent; color: inherit; font: 500 13px Inter, sans-serif; text-align: left; cursor: pointer; }
  .lib-rl > span:last-child { margin-left: auto; font-size: 11.5px; color: var(--ps-mu); }
  .lib-rl:hover { background: var(--ps-hover); }
  .lib-rl.on { background: var(--ps-s2); font-weight: 600; }
  .lib-rl.over { outline: 2px dashed #d7ff3c; outline-offset: -2px; }
  .lib-rn { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lib-back { display: flex; align-items: center; gap: 4px; padding: 6px 8px; margin-bottom: 6px; border: 0; border-radius: 8px; background: transparent; color: var(--ps-mu); font: 600 12.5px Inter, sans-serif; cursor: pointer; }
  .lib-back:hover { color: var(--ps-tx); background: var(--ps-hover); }
  .lib-main { flex: 1; min-width: 0; overflow-y: auto; padding: 12px 14px 80px; }
  .lib-mainh { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 14px; flex-wrap: wrap; }
  .lib-link { border: 0; background: transparent; color: #d7ff3c; font: 600 12.5px Inter, sans-serif; cursor: pointer; padding: 0 0 0 6px; }
  .lib-link:hover { text-decoration: underline; }
  .lib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .lib-hint { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; font-size: 13px; max-width: 320px; }
  .lib-hint p { margin: 0; }
  .lib-bar { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 14px; border-radius: 12px; font-size: 13px; z-index: 20; white-space: nowrap; }
  .lib-bar b { margin-right: 8px; }
  .lib-bar > button, .lib-bar > div > button { height: 32px; padding: 0 10px; border-radius: 8px; border: 0; background: transparent; color: inherit; display: inline-flex; align-items: center; gap: 6px; font: 600 12.5px Inter, sans-serif; cursor: pointer; }
  .lib-bar > button:hover, .lib-bar > div > button:hover { background: var(--ps-hover); }
  .lib-busy { position: absolute; right: 16px; bottom: 16px; padding: 8px 12px; border-radius: 10px; display: flex; gap: 6px; align-items: center; font-size: 12.5px; z-index: 21; }
  .lib-confirm { position: absolute; inset: 0; background: rgba(0,0,0,.45); display: grid; place-items: center; z-index: 40; }
  .lib-confirm > div { width: min(380px, 90%); border: 1px solid; border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 8px; }
  .lib-confirm b { font-size: 15px; }
  .lib-confirm p { margin: 0; font-size: 13px; color: var(--ps-mu); }
  .lib-confirm .lib-names { color: var(--ps-tx); }
  .lib-confirm div div { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
  .lib-confirm button { height: 34px; padding: 0 14px; border-radius: 9px; border: 1px solid var(--ps-bd); background: transparent; color: inherit; font: 600 13px Inter, sans-serif; cursor: pointer; }
  .lib-confirm button.danger { background: #e5484d; border-color: #e5484d; color: #fff; }
  @media (max-width: 700px) { .lib-rail { display: none } .lib-bar { left: 8px; right: 8px; transform: none; overflow-x: auto } }
  @media (prefers-reduced-motion: reduce) { .lib-stack, .lib-card { transition: none } }
`
