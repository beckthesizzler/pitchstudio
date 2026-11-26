import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, Clapperboard, Copy, FolderInput, FolderPlus, ImagePlus, LayoutGrid, Library as LibraryIcon, Link2, List as ListIcon, Loader2, MoreHorizontal, Pencil, Play, Plus, Search, Stars, Trash2, X, ZoomIn } from "lucide-react"
import { Mark as PSMark } from "../brand/Mark"
import { applyMatch, withMatch, createFolder, createItem, daysLeft, eraseForGood, fromBin, toBin, BIN_DAYS, duplicateItem, itemPicPath, loadLibrary, matchLine, moveItems, reorder, saveItem, signed, updateFolder, uploadPic, type Folder, type ItemRow, type Match } from "./items"
import { prepareShot, newId } from "./model"
import { keepVideo, probeVideo, videoKey, videoProblem } from "./videoStore"
import { pendingFiles, type Who } from "./Suite"
import { GUIDE, guideDone, markGuide, skipGuide } from "./Guide"
import { openExample, EXAMPLES } from "./examples"
import { SUITE_CSS } from "./suiteCss"
import { useItemDrag, type DropAt } from "./dnd"
import { MatchDialog, ShareDialog, ThreadDialog } from "./FolderTools"
import type { Seal } from "./batch"
import { DS_BORDER, DS_BORDER_STRONG, SURFACE_1, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* Live Analysis outside the editor.
   New analysis ("/analysis"): what everyone lands on, every time, like a new chat. Drop a screenshot or a clip and it
   opens as its own Game Shot or Game Film. The guide sits on the right and hides.
   Your Library ("?view=library"): every folder on a wall (or in a list), zoomable; drag any Game Shot or Game Film
   onto any folder. A folder ("?folder=ID") is one analysis: its match, its order, a thread of it, its share link. */

export type HomeView = "new" | "library" | "folder" | "bin"
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 172800) return "yesterday"
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}
/** "3 Game Shots · 1 Game Film" */
export function tally(list: ItemRow[]) {
  const s = list.filter(i => i.kind === "shot").length, v = list.length - s
  if (!list.length) return "Empty"
  return [s && `${s} Game ${s === 1 ? "Shot" : "Shots"}`, v && `${v} Game ${v === 1 ? "Film" : "Films"}`].filter(Boolean).join(" · ")
}
const nameOf = (i: ItemRow) => i.title.trim() || i.head?.trim() || (i.kind === "video" ? "Game Film" : "Game Shot")
const bySort = (a: ItemRow, b: ItemRow) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)
const STACK_W = 230, STACK_H = 200, RAIL_SHOW = 6
const store = { get: (k: string) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* fine */ } } }

export function Home({ user, view, folderParam, sealFor }: { user: Who; view: HomeView; folderParam: string | null; sealFor: Seal }) {
  const navigate = useNavigate()
  const [folders, setFolders] = useState<Folder[]>([])
  const [items, setItems] = useState<ItemRow[] | null>(null)
  const [loadErr, setLoadErr] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [bin, setBin] = useState<{ folders: Folder[]; items: ItemRow[] }>({ folders: [], items: [] })
  const [zoom, setZoomS] = useState(() => Math.min(1.2, Math.max(0.5, Number(store.get("la-zoom")) || 1)))
  const [guideHidden, setGuideHidden] = useState(false) // the guide is back on every visit; Hide is for this visit only
  const [railAll, setRailAll] = useState(false)
  const [exOpen, setExOpen] = useState(false)
  const [q, setQ] = useState("")
  const [picking, setPicking] = useState(false)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [tickedF, setTickedF] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | { items: string[]; folders: string[] }>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [naming, setNaming] = useState<{ id: string | null; parent: string | null; name: string } | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [tool, setTool] = useState<null | "match" | "thread" | "share">(null)
  const [busy, setBusy] = useState("")
  const [toast, setToast] = useState("")
  const [fileOver, setFileOver] = useState(false)
  const [stackDrag, setStackDrag] = useState<{ id: string; x: number; y: number; to: number } | null>(null)
  const stackRef = useRef<{ id: string; sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null)
  const wallRef = useRef<HTMLDivElement>(null)
  const [wallW, setWallW] = useState(1000)
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [, setTick] = useState(0)
  /** background look: try one with ?bg=flood, ?bg=chalk, ?bg=flood+chalk or ?bg=mown (remembered), ?bg=off to go back */
  const bgLook = useMemo(() => {
    const q = new URLSearchParams(window.location.search).get("bg")
    if (q != null) store.set("la-bg", q === "off" ? "" : q.replace(/[^a-z ]/g, " ").trim())
    return store.get("la-bg") || undefined
  }, [])
  const done = guideDone()
  const say = (t: string) => setToast(t)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3800); return () => clearTimeout(t) }, [toast])
  const setZoom = (z: number) => { const v = Math.round(Math.min(1.2, Math.max(0.5, z)) * 100) / 100; setZoomS(v); store.set("la-zoom", String(v)) }
  const hideGuide = (h: boolean) => setGuideHidden(h)

  const load = async () => {
    const r = await loadLibrary(user.id)
    if (!r) { setLoadErr(true); return }
    setLoadErr(false); setFolders(r.folders); setItems(r.items); setBin(r.bin)
    setUrls(await signed([...r.items, ...r.bin.items].map(i => i.cover_path).filter(Boolean) as string[]))
  }
  useEffect(() => { load() }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPicking(false); setTicked(new Set()); setTickedF(new Set()); setMoveOpen(false); setMenu(null); setTool(null); setNewOpen(false) }, [view, folderParam])
  useEffect(() => {
    const el = wallRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWallW(el.clientWidth)); ro.observe(el)
    return () => ro.disconnect()
  }, [view, items === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const byFolder = useMemo(() => {
    const m = new Map<string | null, ItemRow[]>()
    for (const i of items ?? []) m.set(i.folder_id, [...(m.get(i.folder_id) ?? []), i])
    for (const l of m.values()) l.sort(bySort)
    return m
  }, [items])
  const inFolder = (id: string | null) => byFolder.get(id) ?? []
  /** folders on the wall, in the order they were put in (new ones at the end) */
  const top = useMemo(() => folders.filter(f => !f.parent_id).map((f, i) => ({ f, k: f.sort ?? (f.y != null && f.x != null ? 1e6 + f.y * 10 + f.x / 100 : 2e6 + i) })).sort((a, b) => a.k - b.k).map(x => x.f), [folders])
  const cover = (i?: ItemRow) => (i?.cover_path ? urls[i.cover_path] : undefined)
  const curFolder = view === "folder" && folderParam && folderParam !== "unsorted" ? folders.find(f => f.id === folderParam) ?? null : null
  const unsortedPage = view === "folder" && folderParam === "unsorted"
  /** folders by when something in them last changed, newest first */
  const railFolders = useMemo(() => {
    const last = (f: Folder) => Math.max(new Date(f.created_at).getTime(), ...inFolder(f.id).map(i => new Date(i.updated_at).getTime()))
    return [...top].sort((a, b) => last(b) - last(a))
  }, [folders, items]) // eslint-disable-line react-hooks/exhaustive-deps
  const railShown = railAll ? railFolders : railFolders.slice(0, RAIL_SHOW)
  if (curFolder && !curFolder.parent_id && !railShown.some(f => f.id === curFolder.id)) railShown.push(curFolder)

  /* ── moving things ── */
  const moveTo = async (ids: string[], folder: string | null) => {
    ids = ids.filter(id => (items ?? []).some(i => i.id === id && i.folder_id !== folder))
    if (!ids.length) return
    const max = Math.max(0, ...inFolder(folder).map(i => i.sort))
    setItems(list => (list ?? []).map(i => (ids.includes(i.id) ? { ...i, folder_id: folder, sort: max + 1 + ids.indexOf(i.id) } : i)))
    try {
      await moveItems(ids, folder)
      await Promise.all(ids.map((id, k) => saveItem(id, { sort: max + 1 + k }).catch(() => {})))
      const f = folder ? folders.find(x => x.id === folder) : null
      if (f?.match) await applyMatch(user.id, f.id, f.match, ids).catch(() => {})
    } catch { say("Couldn't move them. Try again."); load(); return }
    const name = folder ? folders.find(f => f.id === folder)?.name ?? "the folder" : "Unsorted"
    say(`Moved ${ids.length === 1 ? "it" : ids.length} to ${name}.`)
    setTicked(new Set()); setPicking(false); setMoveOpen(false)
  }
  /** puts ids in front of another item (and into its folder, if they came from elsewhere) */
  const placeBefore = async (ids: string[], beforeId: string) => {
    const target = (items ?? []).find(i => i.id === beforeId)
    if (!target) return
    const folder = target.folder_id
    const order = inFolder(folder).map(i => i.id).filter(id => !ids.includes(id))
    order.splice(order.indexOf(beforeId), 0, ...ids)
    const moving = ids.filter(id => (items ?? []).find(i => i.id === id)?.folder_id !== folder)
    setItems(list => (list ?? []).map(i => (order.includes(i.id) ? { ...i, folder_id: folder, sort: order.indexOf(i.id) } : i)))
    try {
      if (moving.length) await moveItems(moving, folder)
      await reorder(order)
      const f = folder ? folders.find(x => x.id === folder) : null
      if (moving.length && f?.match) await applyMatch(user.id, f.id, f.match, moving).catch(() => {})
    } catch { say("Couldn't change the order. Try again."); load() }
    setTicked(new Set()); setPicking(false)
  }
  const onDrop = (ids: string[], at: DropAt) => {
    if (at.before) { placeBefore(ids, at.before); return }
    if (at.folder) moveTo(ids, at.folder === "unsorted" ? null : at.folder)
  }
  const { handle: dragHandle, dragging, over } = useItemDrag(onDrop)
  const dragIds = (id: string) => () => (ticked.has(id) ? [...ticked] : [id])
  const isOver = (id: string) => !!dragging && over?.folder === id

  /* ── the wall: always in neat rows; dragging a folder moves it to another place in the rows ── */
  const cols = Math.max(1, Math.floor((wallW / zoom - 20) / (STACK_W + 40)))
  const slot = (k: number) => ({ x: 24 + (k % cols) * (STACK_W + 40), y: 26 + Math.floor(k / cols) * (STACK_H + 34) })
  const slotAt = (x: number, y: number) => Math.max(0, Math.min(top.length - 1, Math.round((y - 26) / (STACK_H + 34)) * cols + Math.max(0, Math.min(cols - 1, Math.round((x - 24) / (STACK_W + 40))))))
  /** where each folder sits now: while one is dragged, the others make room for it */
  const order = useMemo(() => {
    const ids = top.map(f => f.id)
    if (!stackDrag) return ids
    const rest = ids.filter(id => id !== stackDrag.id)
    rest.splice(stackDrag.to, 0, stackDrag.id)
    return rest
  }, [top, stackDrag])
  const spot = (f: Folder) => slot(Math.max(0, order.indexOf(f.id)))
  const wallH = Math.max(380, slot(Math.max(0, top.length - 1)).y + STACK_H + 40)
  const tickF = (id: string) => setTickedF(t => { const n = new Set(t); n.has(id) ? n.delete(id) : n.add(id); return n })
  const onStackDown = (e: React.PointerEvent, f: Folder) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return
    const p = spot(f)
    stackRef.current = { id: f.id, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onStackMove = (e: React.PointerEvent) => {
    const d = stackRef.current
    if (!d || picking) return
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    const x = Math.max(0, Math.min(wallW / zoom - STACK_W, d.x + dx)), y = Math.max(0, d.y + dy)
    setStackDrag({ id: d.id, x, y, to: slotAt(x, y) })
  }
  const onStackUp = () => {
    const d = stackRef.current
    stackRef.current = null
    if (!d) return
    if (!d.moved) { if (picking) tickF(d.id); else navigate(`/analysis?folder=${d.id}`); return }
    const p = stackDrag
    setStackDrag(null)
    if (!p) return
    const ids = top.map(f => f.id).filter(id => id !== p.id)
    ids.splice(p.to, 0, p.id)
    const changed = ids.filter((id, k) => folders.find(f => f.id === id)?.sort !== k)
    setFolders(fs => fs.map(f => (ids.includes(f.id) ? { ...f, sort: ids.indexOf(f.id) } : f)))
    Promise.all(changed.map(id => updateFolder(id, { sort: ids.indexOf(id) }))).catch(() => say("Couldn't keep the new order. Check your connection."))
  }

  /* ── adding ── */
  const targetFolder = curFolder?.id ?? null
  const addFiles = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/")), vids = files.filter(f => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name))
    if (!imgs.length && !vids.length) { say("Use a screenshot (PNG, JPG, WebP) or a clip (MP4, MOV, WebM)."); return }
    const made: string[] = []
    let n = Math.max(0, ...inFolder(targetFolder).map(i => i.sort)) + 1
    const match = curFolder?.match ?? null
    for (const f of imgs) {
      setBusy(`Adding ${made.length + 1} of ${imgs.length + Math.min(1, vids.length)}…`)
      try {
        const prep = await prepareShot(f), id = newId(), path = itemPicPath(user.id, id)
        await uploadPic(path, prep.blob)
        await createItem(user.id, targetFolder, "shot", withMatch({ v: 2, path, w: prep.w, h: prep.h, dim: 0, items: [] }, match), { id, sort: n++, cover: path })
        made.push(id)
      } catch (e) {
        const m = (e as Error).message; console.error(e)
        say(m === "too big" ? "That picture is over 25 MB." : /decode|image|load/i.test(m) ? "That file didn't open as a picture. Try a PNG or JPG." : "Couldn't save it to your Library. Check your connection and try again.")
      }
    }
    for (const f of vids.slice(0, 1)) {
      setBusy("Opening the clip…")
      try {
        const info = await probeVideo(f), key = videoKey(f), id = newId()
        await createItem(user.id, targetFolder, "video", withMatch({ v: 2, video: { name: f.name.slice(0, 200), key, size: f.size, dur: info.dur, w: info.w, h: info.h, inT: 0, outT: info.dur, moments: [] } }, match), { id, sort: n++, title: f.name.replace(/\.[^.]+$/, "").slice(0, 80) })
        pendingFiles.set(id, f); keepVideo(f, key); made.push(id)
      } catch (e) { say(videoProblem(e)) }
    }
    if (vids.length > 1) say("One clip at a time: the first one is open.")
    setBusy("")
    if (made.length) { markGuide("drop"); (window as any).posthog?.capture("analysis_shot_added", { n: made.length }); navigate(`/analysis?item=${made[0]}`) }
  }
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return
      const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"))
      if (files.length) { e.preventDefault(); addFiles(files) }
    }
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea")
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (view !== "library") navigate("/analysis?view=library"); setTimeout(() => searchRef.current?.focus(), 60) }
      if (view === "library" && !typing && (e.metaKey || e.ctrlKey) && (e.key === "=" || e.key === "+" || e.key === "-")) { e.preventDefault(); setZoom(zoom + (e.key === "-" ? -0.1 : 0.1)) }
      if (e.key === "Escape") { if (tool) setTool(null); else if (confirm) setConfirm(null); else if (naming) setNaming(null); else if (picking) { setPicking(false); setTicked(new Set()); setTickedF(new Set()) } else if (q) setQ("") }
    }
    window.addEventListener("paste", paste); window.addEventListener("keydown", key)
    return () => { window.removeEventListener("paste", paste); window.removeEventListener("keydown", key) }
  })

  /* ── folders and items ── */
  const saveName = async () => {
    if (!naming) return
    const name = naming.name.trim()
    setNaming(null)
    if (!name) return
    try {
      if (naming.id) { await updateFolder(naming.id, { name }); setFolders(fs => fs.map(f => (f.id === naming.id ? { ...f, name } : f))) }
      else { const f = await createFolder(user.id, name, naming.parent); setFolders(fs => [...fs, f]); say(naming.parent ? `${name} is inside.` : `${name} is in Your Library. Drag Game Shots onto it.`) }
    } catch { say("Couldn't save the folder. Try again.") }
  }
  /** to the Bin: nothing is erased for BIN_DAYS days */
  const binIt = async (itemIds: string[], folderIds: string[]) => {
    if (!itemIds.length && !folderIds.length) return
    try { await toBin(itemIds, folderIds, folders) } catch { say("Couldn't delete. Try again."); return }
    setTicked(new Set()); setTickedF(new Set()); setPicking(false)
    if (folderParam && (folderIds.includes(folderParam) || folderIds.includes(folders.find(f => f.id === folderParam)?.parent_id ?? ""))) navigate("/analysis?view=library")
    await load()
    const n = itemIds.length + folderIds.length
    say(`${n === 1 ? (folderIds.length ? "Folder" : "It") : n} moved to the Bin. You can bring ${n === 1 ? "it" : "them"} back for ${BIN_DAYS} days.`)
  }
  const restore = async (itemIds: string[], folderIds: string[]) => {
    try { await fromBin(itemIds, folderIds, [...folders, ...bin.folders], bin.items) } catch { say("Couldn't bring it back. Try again."); return }
    await load(); say("Back where it was.")
  }
  /** for good, only from the Bin, after asking */
  const doErase = async () => {
    const c = confirm
    setConfirm(null)
    if (!c) return
    try { await eraseForGood(user.id, c.folders, c.items.map(id => ({ id })), [...folders, ...bin.folders]) } catch { say("Couldn't delete. Try again."); return }
    await load(); say("Deleted for good.")
  }
  const dup = async (id: string) => {
    try { const r = await duplicateItem(user.id, id); setItems(list => [r, ...(list ?? [])]); if (r.cover_path) { const u = await signed([r.cover_path]); setUrls(x => ({ ...x, ...u })) } say("Duplicated.") }
    catch { say("Couldn't duplicate it.") }
  }
  const takeApart = async (k: number) => {
    if (busy) return
    setBusy("Opening the example…")
    try { const id = await openExample(user.id, k, folders); markGuide("drop"); navigate(`/analysis?item=${id}`) }
    catch (e) { console.error(e); say("Couldn't open the example. Check your connection.") } finally { setBusy("") }
  }
  const saveMatch = async (m: Match | null) => {
    if (!curFolder) return
    const before = curFolder.match
    try {
      await updateFolder(curFolder.id, { match: m })
      setFolders(fs => fs.map(f => (f.id === curFolder.id ? { ...f, match: m } : f)))
      if (m) { const n = await applyMatch(user.id, curFolder.id, m, inFolder(curFolder.id).map(i => i.id), before); if (n) say(n === 1 ? "Match details are on it." : `Match details are on all ${n}.`) }
    } catch (e) { say("Couldn't save the match details. Try again."); throw e }
  }

  /* ── what's showing ── */
  const qn = plain(q.trim())
  const found = qn ? (items ?? []).filter(i => plain(`${i.title} ${i.head ?? ""} ${folders.find(f => f.id === i.folder_id)?.name ?? ""}`).includes(qn)) : []
  const pageItems = curFolder ? inFolder(curFolder.id) : unsortedPage ? inFolder(null) : []
  const tick = (id: string) => setTicked(t => { const n = new Set(t); n.has(id) ? n.delete(id) : n.add(id); return n })

  const card = (i: ItemRow, order?: number) => {
    const pic = cover(i), on = ticked.has(i.id)
    return (
      <div key={i.id} className={`lh-card${on ? " on" : ""}${dragging?.includes(i.id) ? " lifting" : ""}${dragging && over?.before === i.id ? " before" : ""}`} data-before={order != null ? i.id : undefined}
        {...(picking ? {} : dragHandle(dragIds(i.id), pic))}>
        <button className="lh-pic" style={pic ? { backgroundImage: `url(${pic})` } : undefined} aria-label={`Open ${nameOf(i)}`}
          onClick={() => { if (picking) tick(i.id); else navigate(`/analysis?item=${i.id}`) }}>
          {!pic && (i.kind === "video" ? <Clapperboard size={22} /> : <ImagePlus size={22} />)}
          {order != null && <span className="lh-no">{order}</span>}
          {i.kind === "video" && <span className="lh-vid"><Play size={10} fill="currentColor" /> Game Film</span>}
        </button>
        <div className="lh-meta">
          <b title={nameOf(i)}>{nameOf(i)}</b>
          <span>{qn && `${folders.find(f => f.id === i.folder_id)?.name ?? "Unsorted"} · `}{ago(i.updated_at)}</span>
        </div>
        {!picking && <div className="lh-acts" data-nodrag="1">
          <button className="an-x" aria-label="Duplicate" title="Duplicate" onClick={() => dup(i.id)}><Copy size={13} /></button>
          <button className="an-x" aria-label="Delete" title="Move to the Bin" onClick={() => binIt([i.id], [])}><Trash2 size={13} /></button>
        </div>}
      </div>
    )
  }
  const thumb = (i: ItemRow) => (
    <button key={i.id} className={`lh-mini${ticked.has(i.id) ? " on" : ""}${dragging?.includes(i.id) ? " lifting" : ""}`} style={cover(i) ? { backgroundImage: `url(${cover(i)})` } : undefined} aria-label={`Open ${nameOf(i)}`} title={nameOf(i)}
      {...(picking ? {} : dragHandle(dragIds(i.id), cover(i)))}
      onClick={() => { if (picking) tick(i.id); else navigate(`/analysis?item=${i.id}`) }}>
      {!cover(i) && (i.kind === "video" ? <Clapperboard size={16} /> : <ImagePlus size={16} />)}
      {i.kind === "video" && cover(i) && <span className="lh-vid" style={{ right: 4, bottom: 4 }}><Play size={9} fill="currentColor" /></span>}
    </button>
  )

  const rail = (
    <aside className="lh-rail" aria-label="Live Analysis">
      <button className={`la-fi${view === "new" ? " on" : ""}`} onClick={() => navigate("/analysis")}><Plus size={15} /> New analysis</button>
      <button className={`la-fi${view === "library" ? " on" : ""}`} onClick={() => navigate("/analysis?view=library")}><LibraryIcon size={15} /> Your Library<em>{items?.length ?? ""}</em></button>
      <h4>Folders <button className="an-x" aria-label="New folder" title="New folder" onClick={() => setNaming({ id: null, parent: null, name: "" })}><Plus size={15} /></button></h4>
      {railShown.map(f => (
        <button key={f.id} className={`la-fi${curFolder?.id === f.id ? " on" : ""}${isOver(f.id) ? " drop" : ""}`} data-drop={f.id} onClick={() => navigate(`/analysis?folder=${f.id}`)}>
          <Glyph /> <span className="nm">{f.name}</span>{f.is_public && <Link2 size={12} style={{ color: "#d7ff3c", flex: "none" }} aria-label="Shared" />}<em>{inFolder(f.id).length}</em></button>
      ))}
      {railFolders.length > RAIL_SHOW && <button className="lh-more" onClick={() => setRailAll(a => !a)}>{railAll ? <>Show less <ChevronDown size={13} style={{ transform: "rotate(180deg)" }} /></> : <>Show {railFolders.length - RAIL_SHOW} more <ChevronDown size={13} /></>}</button>}
      <button className={`la-fi${unsortedPage ? " on" : ""}${isOver("unsorted") ? " drop" : ""}`} data-drop="unsorted" onClick={() => navigate("/analysis?folder=unsorted")}><Glyph dashed /> <span className="nm">Unsorted</span><em>{inFolder(null).length}</em></button>
      {!top.length && <button className="la-fi" style={{ color: TEXT_MUTED }} onClick={() => setNaming({ id: null, parent: null, name: "" })}><FolderPlus size={15} /> New folder</button>}
      <button className={`la-fi${view === "bin" ? " on" : ""}`} onClick={() => navigate("/analysis?view=bin")}><Trash2 size={15} /> <span className="nm">Bin</span><em>{bin.folders.filter(f => !bin.folders.some(p => p.id === f.parent_id)).length + bin.items.filter(i => !bin.folders.some(f => f.id === i.folder_id)).length || ""}</em></button>
      <h4 style={{ cursor: "pointer" }} onClick={() => setExOpen(o => !o)} role="button" aria-expanded={exOpen}>Examples <ChevronRight size={14} style={{ transform: exOpen ? "rotate(90deg)" : undefined, transition: "transform .15s" }} /></h4>
      {exOpen && EXAMPLES.map((x, k) => (
        <button key={x.key} className="la-fi" title="Copies it into an Examples folder for you to change" onClick={() => takeApart(k)}>
          {x.kind === "video" ? <Clapperboard size={15} /> : <ImagePlus size={15} />} <span className="nm">{x.title}</span></button>
      ))}
    </aside>
  )

  const nSel = ticked.size + tickedF.size
  const bulkBar = () => !picking ? null : (
    <div className="lh-bulk">
      <b>{nSel ? `${nSel} selected` : "Click what you want to select"}</b>
      {nSel > 0 && !tickedF.size && <span style={{ position: "relative" }}>
        <button className="la-tiny" onClick={() => setMoveOpen(o => !o)}><FolderInput size={13} /> Move to…</button>
        {moveOpen && <div className="la-pop" style={{ top: 32, left: 0, maxHeight: 320, overflowY: "auto" }}>
          {top.flatMap(f => [f, ...folders.filter(c => c.parent_id === f.id)]).map(f => <button key={f.id} style={f.parent_id ? { paddingLeft: 26 } : undefined} onClick={() => moveTo([...ticked], f.id)}><Glyph /> {f.name}</button>)}
          <button onClick={() => moveTo([...ticked], null)}><Glyph dashed /> Unsorted</button>
        </div>}
      </span>}
      {nSel > 0 && <button className="la-tiny bad" onClick={() => binIt([...ticked], [...tickedF])}><Trash2 size={13} /> Delete</button>}
    </div>
  )
  const selectBtn = (show: boolean) => show || picking ? <button className={`an-btn${picking ? " pri" : ""}`} onClick={() => { setPicking(p => !p); setTicked(new Set()); setTickedF(new Set()); setMoveOpen(false) }}>{picking ? "Cancel" : "Select"}</button> : null

  /* ── the pages ── */
  const newPage = () => (
    <div className={`lh-new${guideHidden ? " noguide" : ""}`}>
      <main className="lh-welcome">
        <div className="lh-k">Live Analysis</div>
        <h1 className="lh-h1">Show what the broadcast missed.</h1>
        <p className="lh-lede">Bring in a still or a clip from the match, mark the shape and render it with your name on it.</p>
        <div className="lh-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") fileRef.current?.click() }}>
          <b>Drop a screenshot or a clip</b>
          <span>PNG, JPG or WebP · MP4, MOV or WebM up to 10 min · or paste with <kbd>⌘V</kbd></span>
          <div style={{ display: "flex", gap: 10 }}><span className="an-btn pri" style={{ height: 42 }}><ImagePlus size={16} /> Add a Game Shot</span><span className="an-btn" style={{ height: 42 }}><Clapperboard size={16} /> Add a Game Film</span></div>
          <small>Private to you until you render it. Clips stay on this computer.</small>
        </div>
        <div className="lh-k" style={{ margin: "26px 0 12px", color: TEXT_MUTED }}>Or start from a finished breakdown · open one and change anything</div>
        <div className="lh-ex">
          {EXAMPLES.map((x, k) => (
            <button key={x.title} className="lh-excard" onClick={() => takeApart(k)}>
              <span className="pic" style={{ backgroundImage: `url(${x.thumb})` }}>{x.kind === "video" && <span className="play"><Play size={18} fill="currentColor" /></span>}</span>
              <span className="t">{x.title}</span><span className="s">{x.sub}</span><span className="go">Open it →</span>
            </button>
          ))}
        </div>
      </main>
      {!guideHidden && (
        <aside className="lh-guide" aria-label="Your first breakdown">
          <div style={{ display: "flex", alignItems: "center" }}><div className="lh-k" style={{ margin: 0 }}>Your first breakdown</div><span className="la-sp" /><button className="la-tiny" onClick={() => hideGuide(true)} aria-label="Hide the guide"><X size={13} /> Hide</button></div>
          <h2>{["", "One", "Two", "Three", "Four", "Five", "Six"][GUIDE.length]} steps to your first post</h2>
          <p>Each one ticks off as you do it.</p>
          <ol>{GUIDE.map((g, i) => { const d = done.has(g.id), now = !d && GUIDE.findIndex(x => !done.has(x.id)) === i; return (
            <li key={g.id} className={d ? "done" : now ? "now" : ""}><i>{d ? <Check size={13} strokeWidth={3} /> : i + 1}</i><div><b>{g.title}</b><span>{g.sub}</span></div></li>
          ) })}</ol>
          <video className="lh-film" src="/examples/man-for-man.mp4" muted loop playsInline autoPlay poster="/examples/man-for-man.jpg" aria-label="What a finished Game Film looks like" />
          <button className="la-tiny" style={{ marginTop: 10 }} onClick={() => { skipGuide(); setTick(t => t + 1); say("All ticked. Press ? in the editor for every key.") }}>I know my way around</button>
        </aside>
      )}
    </div>
  )

  const stack = (f: Folder, i: number) => {
    const p = stackDrag?.id === f.id ? stackDrag : spot(f)
    const kids = inFolder(f.id).slice(0, 3), sub = folders.filter(c => c.parent_id === f.id).length
    return (
      <div key={f.id} className={`lh-stack${isOver(f.id) ? " drop" : ""}${stackDrag?.id === f.id ? " lift" : ""}${tickedF.has(f.id) ? " on" : ""}${picking ? " picking" : ""}`} data-drop={f.id} style={{ left: p.x, top: p.y }}
        onPointerDown={e => onStackDown(e, f)} onPointerMove={onStackMove} onPointerUp={onStackUp}
        role="button" tabIndex={0} aria-label={`${f.name}, ${tally(inFolder(f.id))}. Open`} onKeyDown={e => { if (e.key === "Enter") navigate(`/analysis?folder=${f.id}`) }}>
        <div className="pile">
          {(kids.length ? kids : [undefined]).map((it, j, arr) => (
            <span key={j} className={`card${j === 0 ? " front" : ""}`} style={{ left: j * 8, top: -j * 8, zIndex: arr.length - j, backgroundImage: cover(it) ? `url(${cover(it)})` : undefined }}>
              {j === 0 && !cover(it) && (it?.kind === "video" ? <Clapperboard size={22} /> : it ? <ImagePlus size={22} /> : <span className="empty">Drop Game Shots here</span>)}
            </span>
          ))}
        </div>
        <div className="name"><b>{f.name}</b>{f.is_public && <Link2 size={14} style={{ color: "#d7ff3c", flex: "none" }} aria-label="Shared" />}
          <button className="an-x" aria-label={`More for ${f.name}`} onClick={e => { e.stopPropagation(); setMenu(m => (m === f.id ? null : f.id)) }}><MoreHorizontal size={15} /></button></div>
        <small>{[tally(inFolder(f.id)), sub && `${sub} inside`, f.match && matchLine(f.match)].filter(Boolean).join(" · ")}</small>
        {menu === f.id && <div className="la-pop" style={{ top: 176, left: 10 }} onPointerDown={e => e.stopPropagation()} onPointerLeave={() => setMenu(null)}>
          <button onClick={() => { setMenu(null); navigate(`/analysis?folder=${f.id}`) }}>Open</button>
          <button onClick={() => { setMenu(null); setNaming({ id: f.id, parent: null, name: f.name }) }}><Pencil size={14} /> Rename</button>
          <button onClick={() => { setMenu(null); binIt([], [f.id]) }} style={{ color: "#ff8fa3" }}><Trash2 size={14} /> Delete folder</button>
        </div>}
      </div>
    )
  }

  const libraryPage = () => {
    return (
      <main className="lh-main">
        <div className="lh-bar">
          <h2>Your Library</h2><span className="lh-count">{tally(items ?? [])} · {folders.length} {folders.length === 1 ? "folder" : "folders"}</span>
          <span className="la-sp" />
          <label className="lh-search"><Search size={15} /><input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search" aria-label="Search" />{q ? <button className="an-x" aria-label="Clear the search" onClick={() => setQ("")}><X size={13} /></button> : <kbd>⌘K</kbd>}</label>
          {!qn && <label className="lh-zoom" title="Zoom (⌘+ and ⌘−)"><ZoomIn size={14} /><input type="range" min={0.5} max={1.2} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} aria-label="Zoom the wall" /><span>{Math.round(zoom * 100)}%</span></label>}
          {selectBtn(top.length + inFolder(null).length + found.length > 0)}
        </div>
        {bulkBar()}
        {qn ? (
          found.length ? <div className="lh-grid">{found.map(i => card(i))}</div> : <p className="lh-none">Nothing matches. Try a player, a word from your notes, or a folder.</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "2px 0 8px" }}><span className="lh-hint">{picking ? "Click folders and Game Shots to select them." : "Drag a Game Shot onto a folder to file it."}</span><span className="la-sp" /><button className="la-tiny" onClick={() => setNaming({ id: null, parent: null, name: "" })}><FolderPlus size={13} /> New folder</button></div>
            <div className="lh-wallbox" ref={wallRef} style={{ height: (wallH + 20) * zoom }}>
              <div className="lh-wall" style={{ transform: `scale(${zoom})`, width: `${100 / zoom}%`, height: wallH + 20 }}>
                {!top.length && <div className="lh-nofolders"><b>No folders yet</b><span>One folder per match, idea or player, with every Game Shot and Game Film for it inside.</span><button className="an-btn pri" onClick={() => setNaming({ id: null, parent: null, name: "" })}><FolderPlus size={15} /> New folder</button></div>}
                {top.map((f, i) => stack(f, i))}
              </div>
            </div>
            <div className={`lh-tray${isOver("unsorted") ? " drop" : ""}`} data-drop="unsorted">
              <div style={{ flex: "none" }}><div className="lh-k" style={{ margin: 0, color: TEXT_MUTED }}>Unsorted · {inFolder(null).length}</div><small>Not in a folder yet</small></div>
              {inFolder(null).map(thumb)}
              {!inFolder(null).length && <small style={{ color: TEXT_MUTED }}>Everything is filed.</small>}
            </div>
          </>
        )}
      </main>
    )
  }

  const binPage = () => {
    const shownF = bin.folders.filter(f => !f.parent_id || !bin.folders.some(p => p.id === f.parent_id && p.deleted_at === f.deleted_at))
    const shownI = bin.items.filter(i => !(i.folder_id && bin.folders.some(f => f.id === i.folder_id && f.deleted_at === i.deleted_at)))
    const inBinFolder = (f: Folder) => bin.items.filter(i => i.folder_id === f.id && i.deleted_at === f.deleted_at)
    const rows = [...shownF.map(f => ({ f, at: f.deleted_at! })), ...shownI.map(i => ({ i, at: i.deleted_at! }))].sort((a, b) => b.at.localeCompare(a.at))
    return (
      <main className="lh-main">
        <div className="lh-bar">
          <h2>Bin</h2><span className="lh-count">Kept for {BIN_DAYS} days, then deleted for good</span>
          <span className="la-sp" />
          {rows.length > 0 && <button className="an-btn" onClick={() => setConfirm({ items: shownI.map(i => i.id), folders: shownF.map(f => f.id) })}><Trash2 size={15} /> Empty the Bin</button>}
        </div>
        {!rows.length ? <p className="lh-none">The Bin is empty.</p> : (
          <div className="lh-binlist">
            {rows.map(r => {
              const pic = "f" in r && r.f ? cover(inBinFolder(r.f)[0]) : cover((r as any).i)
              const name = "f" in r && r.f ? r.f.name : nameOf((r as any).i)
              const what = "f" in r && r.f ? `Folder · ${tally(inBinFolder(r.f))}` : (r as any).i.kind === "video" ? "Game Film" : "Game Shot"
              const left = daysLeft(r.at)
              const id = "f" in r && r.f ? r.f.id : (r as any).i.id
              return (
                <div key={id} className="lh-binrow">
                  <span className="pic" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>{!pic && ("f" in r ? <Glyph /> : <ImagePlus size={16} />)}</span>
                  <div className="nm"><b>{name}</b><span>{what} · {left <= 1 ? "deleted for good tomorrow" : `deleted for good in ${left} days`}</span></div>
                  <button className="an-btn" onClick={() => "f" in r && r.f ? restore([], [r.f.id]) : restore([id], [])}>Restore</button>
                  <button className="an-btn" onClick={() => setConfirm("f" in r && r.f ? { items: [], folders: [r.f.id] } : { items: [id], folders: [] })}>Delete now</button>
                </div>
              )
            })}
          </div>
        )}
      </main>
    )
  }

  const folderPage = () => {
    const f = curFolder, list = pageItems, subs = f ? folders.filter(c => c.parent_id === f.id) : []
    if (!f && !unsortedPage) return <main className="lh-main"><p className="lh-none">This folder isn't here any more. <button className="la-tiny" onClick={() => navigate("/analysis?view=library")}>Your Library</button></p></main>
    return (
      <main className="lh-main">
        <div className="lh-bar">
          <button className="an-x" aria-label="Back" onClick={() => navigate(f?.parent_id ? `/analysis?folder=${f.parent_id}` : "/analysis?view=library")}><ChevronLeft size={18} /></button>
          <h2 title={f?.name}>{f?.name ?? "Unsorted"}</h2><span className="lh-count">{tally(list)}</span>
          <span className="la-sp" />
          {f && <>
            <button className="an-btn" onClick={() => setTool("thread")} disabled={!list.some(i => i.kind === "shot")} title="Every Game Shot here as numbered pictures, plus the text for each post"><Stars size={15} /> Render as a thread</button>
            <button className={`an-btn${f.is_public ? " shared" : ""}`} onClick={() => setTool("share")}><Link2 size={15} /> {f.is_public ? "Shared" : "Share"}</button>
          </>}
          {selectBtn(list.length > 0)}
          <span style={{ position: "relative" }}>
            <button className="an-btn pri" onClick={() => setNewOpen(o => !o)}><Plus size={15} /> Add</button>
            {newOpen && <div className="la-pop" style={{ right: 0, top: 42 }} onPointerLeave={() => setNewOpen(false)}>
              <button onClick={() => { setNewOpen(false); fileRef.current?.click() }}><ImagePlus size={15} /> Game Shots or a Game Film<small>{f ? `into ${f.name}` : "into Unsorted"}</small></button>
              {f && !f.parent_id && <button onClick={() => { setNewOpen(false); setNaming({ id: null, parent: f.id, name: "" }) }}><FolderPlus size={15} /> A folder inside</button>}
              {f && <button onClick={() => { setNewOpen(false); setNaming({ id: f.id, parent: f.parent_id, name: f.name }) }}><Pencil size={15} /> Rename this folder</button>}
              {f && <button onClick={() => { setNewOpen(false); binIt([], [f.id]) }} style={{ color: "#ff8fa3" }}><Trash2 size={15} /> Delete this folder</button>}
            </div>}
          </span>
        </div>
        {f && (
          <button className="lh-match" onClick={() => setTool("match")}>
            {f.match ? <>
              <span className="dot" style={{ background: f.match.homeColor }} /><b>{f.match.home || "Team 1"}</b><span style={{ color: TEXT_MUTED }}>v</span><span className="dot" style={{ background: f.match.awayColor }} /><b>{f.match.away || "Team 2"}</b>
              {[f.match.comp, f.match.date, f.match.score].filter(Boolean).map(x => <span key={x} className="chip">{x}</span>)}
              <span className="edit"><Pencil size={13} /> Edit</span>
            </> : <><Plus size={14} /> Match details<span style={{ color: TEXT_MUTED, fontWeight: 400 }}>· teams, colours and the line above every headline, set once</span></>}
          </button>
        )}
        {subs.length > 0 && <div className="lh-sub">{subs.map(c => <button key={c.id} className={`la-chip${isOver(c.id) ? " drop" : ""}`} data-drop={c.id} onClick={() => navigate(`/analysis?folder=${c.id}`)}><Glyph /> {c.name} <span style={{ color: TEXT_MUTED }}>{inFolder(c.id).length}</span></button>)}</div>}
        {bulkBar()}
        {list.length > 1 && f && <p className="lh-hint" style={{ margin: "0 0 10px" }}>This is the thread order: drag a Game Shot in front of another to change it.</p>}
        <div className="lh-grid">
          {list.map((i, k) => card(i, f ? k + 1 : undefined))}
          <button className="lh-addcard" onClick={() => fileRef.current?.click()}><Plus size={22} /><b>Add Game Shots or a Game Film</b><small>or drop files anywhere on this page</small></button>
        </div>
      </main>
    )
  }

  return (
    <div className={`lh${fileOver ? " over" : ""}${dragging ? " dragging" : ""}`} data-bg={bgLook}
      onDragEnter={e => { if ([...e.dataTransfer.types].includes("Files")) { depth.current++; setFileOver(true) } }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setFileOver(false) }}
      onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault() }}
      onDrop={e => { if (![...e.dataTransfer.types].includes("Files")) return; e.preventDefault(); depth.current = 0; setFileOver(false); addFiles([...e.dataTransfer.files]) }}>
      <style>{SUITE_CSS + HOME_CSS}</style>
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.mp4,.m4v,.webm" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) addFiles(f) }} />
      <header className="la-top">
        <button className="la-home" aria-label="PitchStudio home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color="#d7ff3c" /></button>
        <div className="la-crumb"><b style={{ fontSize: 15 }}>Live Analysis</b></div>
        <div className="la-sp" />
        {busy && <span style={{ color: "#d7ff3c", fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}><Loader2 size={14} className="an-spin" /> {busy}</span>}
        {view === "new" && guideHidden && <button className="an-btn" onClick={() => hideGuide(false)}><BookOpen size={15} /> Guide</button>}
      </header>
      {loadErr && items === null ? (
        <div className="lh-load"><div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <b style={{ font: "800 26px 'Barlow Condensed', sans-serif", textTransform: "uppercase" }}>Your Library didn't load</b>
          <span style={{ color: TEXT_MUTED }}>Nothing is lost. Check your connection and try again.</span>
          <button className="an-btn pri" onClick={() => { setLoadErr(false); load() }}>Try again</button></div></div>
      ) : (
        <div className="lh-body">
          {rail}
          {view === "new" ? newPage() : items === null ? <div className="lh-load"><Loader2 className="an-spin" size={24} color="#d7ff3c" /></div> : view === "library" ? libraryPage() : view === "bin" ? binPage() : folderPage()}
        </div>
      )}

      {tool === "match" && curFolder && <MatchDialog match={curFolder.match} count={inFolder(curFolder.id).length} onSave={saveMatch} onClose={() => setTool(null)} />}
      {tool === "thread" && curFolder && <ThreadDialog userId={user.id} folder={curFolder} items={inFolder(curFolder.id)} urls={urls} seal={sealFor} onClose={() => setTool(null)} />}
      {tool === "share" && curFolder && <ShareDialog userId={user.id} folder={curFolder} items={inFolder(curFolder.id)} seal={sealFor} onClose={() => setTool(null)}
        onChange={shared => setFolders(fs => fs.map(f => (f.id === curFolder.id ? { ...f, is_public: shared } : f)))} />}
      {naming && (
        <div className="la-keys" onPointerDown={e => { if (e.target === e.currentTarget) setNaming(null) }}>
          <div role="dialog" aria-label={naming.id ? "Rename the folder" : "New folder"} style={{ width: 420 }}>
            <h3>{naming.id ? "Rename" : naming.parent ? "A folder inside" : "New folder"}</h3>
            <input className="an-inp" autoFocus value={naming.name} maxLength={60} placeholder="El Clásico" onChange={e => setNaming({ ...naming, name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") saveName() }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}><button className="an-btn" onClick={() => setNaming(null)}>Cancel</button><button className="an-btn pri" onClick={saveName} disabled={!naming.name.trim()}>{naming.id ? "Rename" : "Make it"}</button></div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="la-keys" onPointerDown={e => { if (e.target === e.currentTarget) setConfirm(null) }}>
          <div role="alertdialog" aria-label="Delete for good" style={{ width: 440 }}>
            <h3>Delete for good?</h3>
            <p style={{ color: "#c9ccd2", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{confirm.items.length + confirm.folders.length === 1 ? "It's" : "They're"} gone for good, with everything inside. This can't be undone.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button className="an-btn" onClick={() => setConfirm(null)}>Keep</button><button className="an-btn" style={{ background: "#ff4d6d", borderColor: "#ff4d6d", color: "#fff" }} onClick={doErase}>Delete for good</button></div>
          </div>
        </div>
      )}
      {toast && <div className="an-toast" role="status">{toast}</div>}
    </div>
  )
}

function Glyph({ dashed }: { dashed?: boolean }) {
  return <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" style={{ flex: "none" }}><path d="M1.5 3.2 a1.2 1.2 0 0 1 1.2-1.2 h3.3 l1.5 1.6 h5.8 a1.2 1.2 0 0 1 1.2 1.2 v6.8 a1.2 1.2 0 0 1-1.2 1.2 H2.7 a1.2 1.2 0 0 1-1.2-1.2 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dashed ? "2 2" : undefined} /></svg>
}

const HOME_CSS = `
  .lh { height: 100vh; display: grid; grid-template-rows: 56px minmax(0,1fr); background: #17181b; color: ${TEXT_PRIMARY}; font-family: Inter, sans-serif; overflow: hidden; }
  .lh * { box-sizing: border-box; }
  .lh > .la-top { grid-area: 1 / 1; height: 56px; }
  .lh > .lh-body, .lh > .lh-load { grid-area: 2 / 1; min-height: 0; }
  .lh.dragging, .lh.dragging * { cursor: grabbing !important; user-select: none; }
  .lh.over::after { content: "Drop to add"; position: fixed; inset: 10px; border: 2px dashed #d7ff3c; border-radius: 16px; background: rgba(215,255,60,.06); display: grid; place-items: center; font: 800 30px 'Barlow Condensed', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: #d7ff3c; z-index: 60; pointer-events: none; }
  .lh-load { display: grid; place-items: center; }
  /* backgrounds: data-bg on .lh holds any of flood, chalk, mown */
  .lh[data-bg~="flood"] .lh-welcome, .lh[data-bg~="flood"] .lh-main { background-color: #111215; background-image: radial-gradient(1200px 620px at 22% -220px, rgba(215,255,60,.30), rgba(215,255,60,.08) 45%, transparent 70%), radial-gradient(900px 520px at 105% -160px, rgba(140,200,255,.14), transparent 62%); }
  .lh[data-bg~="flood"] .lh-welcome::before, .lh[data-bg~="flood"] .lh-main::before { content: ""; position: absolute; inset: 0; pointer-events: none; opacity: .09; mix-blend-mode: overlay; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
  .lh[data-bg] .lh-welcome, .lh[data-bg] .lh-main { position: relative; isolation: isolate; }
  .lh[data-bg] .lh-welcome > *, .lh[data-bg] .lh-main > * { position: relative; z-index: 1; }
  .lh[data-bg~="chalk"] .lh-welcome::after, .lh[data-bg~="chalk"] .lh-main::after { content: ""; position: absolute; left: 50%; top: 40px; width: 1500px; height: 980px; transform: translateX(-50%); pointer-events: none; z-index: 0; background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1050 680' fill='none' stroke='%23d7ff3c' stroke-opacity='.15' stroke-width='2'><rect x='1' y='1' width='1048' height='678'/><line x1='525' y1='1' x2='525' y2='679'/><circle cx='525' cy='340' r='91.5'/><circle cx='525' cy='340' r='3' fill='%23d7ff3c' fill-opacity='.2'/><rect x='1' y='138' width='165' height='404'/><rect x='1' y='248' width='55' height='184'/><rect x='884' y='138' width='165' height='404'/><rect x='994' y='248' width='55' height='184'/><path d='M166 267 A91.5 91.5 0 0 1 166 413'/><path d='M884 267 A91.5 91.5 0 0 0 884 413'/><circle cx='110' cy='340' r='3' fill='%23d7ff3c' fill-opacity='.2'/><circle cx='940' cy='340' r='3' fill='%23d7ff3c' fill-opacity='.2'/></svg>") center / contain no-repeat; -webkit-mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,.55) 55%, transparent 92%); mask-image: linear-gradient(180deg, #000 0%, rgba(0,0,0,.55) 55%, transparent 92%); }
  .lh[data-bg~="chalk"]:not([data-bg~="flood"]) .lh-welcome, .lh[data-bg~="chalk"]:not([data-bg~="flood"]) .lh-main { background: #121315; }
  .lh[data-bg~="mown"] .lh-welcome, .lh[data-bg~="mown"] .lh-main { background: radial-gradient(900px 420px at 50% 110%, rgba(215,255,60,.09), transparent 70%), repeating-linear-gradient(90deg, #121614 0 120px, #0e1110 120px 240px); }
  .lh[data-bg] .lh-guide { background: rgba(22,23,27,.78); backdrop-filter: blur(6px); }
  .lh[data-bg] .lh-drop { background: rgba(18,19,22,.72); }
  .lh-body { display: grid; grid-template-columns: 248px minmax(0,1fr); min-height: 0; }
  .lh-body > * { min-height: 0; }
  .lh-rail { border-right: 1px solid ${DS_BORDER}; background: #1c1d21; padding: 12px 10px 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 1px; }
  .lh-rail h4 { margin: 16px 8px 6px; font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .26em; text-transform: uppercase; color: ${TEXT_MUTED}; display: flex; justify-content: space-between; align-items: center; user-select: none; }
  .lh-rail .la-fi .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
  .la-fi.drop, .la-chip.drop { outline: 2px solid #d7ff3c; outline-offset: -2px; background: rgba(215,255,60,.1) !important; }
  .lh-more { display: flex; align-items: center; gap: 4px; border: none; background: none; color: ${TEXT_MUTED}; font: 500 12.5px Inter, sans-serif; padding: 6px 10px; cursor: pointer; border-radius: 8px; }
  .lh-more:hover { color: #fff; background: rgba(255,255,255,.05); }
  .lh-main { overflow-y: auto; padding: 20px 28px 48px; min-width: 0; }
  .lh-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
  .lh-bar h2 { margin: 0; font: 800 32px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw; }
  .lh-count { color: ${TEXT_MUTED}; font-size: 13px; }
  .lh-hint { color: ${TEXT_MUTED}; font-size: 12.5px; }
  .an-btn.shared { border-color: rgba(215,255,60,.5); color: #d7ff3c; }
  .lh-search { height: 38px; width: min(340px, 30vw); border-radius: 10px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 12px; color: ${TEXT_MUTED}; }
  .lh-search:focus-within { border-color: #d7ff3c; }
  .lh-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: ${TEXT_PRIMARY}; font: 500 14px Inter, sans-serif; }
  .lh-search kbd, .lh-drop kbd { font: 600 11px Inter; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 5px; padding: 1px 6px; }
  .lh-zoom { display: inline-flex; align-items: center; gap: 6px; color: ${TEXT_MUTED}; font-size: 12px; } .lh-zoom input { width: 96px; accent-color: #d7ff3c; } .lh-zoom span { width: 34px; }
  .lh-k { font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: .28em; text-transform: uppercase; color: #d7ff3c; margin-bottom: 10px; }
  .lh-vid { position: absolute; right: 6px; bottom: 6px; display: inline-flex; align-items: center; gap: 4px; font: 700 10px Inter; color: #d7ff3c; background: rgba(10,12,15,.82); padding: 2px 6px; border-radius: 4px; }
  .lh-wallbox { position: relative; border-radius: 16px; overflow: hidden; background: radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0) 0 0 / 22px 22px; }
  .lh-wall { position: relative; transform-origin: 0 0; }
  .lh-stack { position: absolute; width: ${STACK_W}px; cursor: grab; touch-action: none; user-select: none; border-radius: 12px; transition: transform .12s; }
  .lh-stack:hover { transform: translateY(-3px); }
  .lh-stack.lift { cursor: grabbing; z-index: 10; transform: scale(1.03); transition: none; }
  .lh-stack.drop .card.front { outline: 3px solid #d7ff3c; outline-offset: 2px; }
  .lh-stack.drop .name b { color: #d7ff3c; }
  .lh-stack:focus-visible { outline: 2px solid #fff; outline-offset: 6px; }
  .lh-stack .pile { position: relative; height: 132px; margin-top: 18px; }
  .lh-stack .card { position: absolute; width: 214px; height: 122px; border-radius: 10px; background: #2a2c31 center/cover; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 8px 22px rgba(0,0,0,.38); display: grid; place-items: center; color: ${TEXT_MUTED}; }
  .lh-stack .card .empty { font: 600 12px Inter; color: ${TEXT_MUTED}; border: 1.5px dashed rgba(255,255,255,.18); border-radius: 8px; padding: 10px 12px; }
  .lh-stack .name { display: flex; align-items: center; gap: 6px; margin-top: 12px; }
  .lh-stack .name b { font: 800 20px 'Barlow Condensed', sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
  .lh-stack small { color: ${TEXT_MUTED}; font-size: 12px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-tray { margin-top: 12px; min-height: 96px; border: 1px dashed rgba(255,255,255,.16); border-radius: 14px; display: flex; align-items: center; gap: 10px; padding: 12px 16px; overflow-x: auto; }
  .lh-tray small { color: ${TEXT_MUTED}; font-size: 12px; display: block; margin-top: 3px; white-space: nowrap; }
  .lh-tray.drop, .lh-row.drop { background: rgba(215,255,60,.06); border-color: #d7ff3c; }
  .lh-mini { position: relative; flex: none; width: 118px; height: 68px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: #0e0f12 center/cover; cursor: grab; display: grid; place-items: center; color: ${TEXT_MUTED}; touch-action: none; }
  .lh-mini.on { outline: 2px solid #d7ff3c; } .lh-mini.lifting, .lh-card.lifting { opacity: .35; }
  .lh-nofolders { position: absolute; left: 24px; top: 30px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; color: ${TEXT_MUTED}; max-width: 420px; }
  .lh-nofolders b { color: #fff; font: 800 22px 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .lh-list { display: flex; flex-direction: column; gap: 10px; }
  .lh-row { border: 1px solid ${DS_BORDER}; border-radius: 12px; background: #1e1f23; padding: 6px 8px 10px; }
  .lh-rowhead { display: flex; align-items: center; gap: 8px; width: 100%; border: none; background: none; color: inherit; padding: 6px 6px 8px; cursor: pointer; text-align: left; font: inherit; }
  .lh-rowhead b { font: 800 18px 'Barlow Condensed', sans-serif; text-transform: uppercase; } .lh-rowhead span { color: ${TEXT_MUTED}; font-size: 12.5px; }
  .lh-strip { display: flex; gap: 8px; overflow-x: auto; padding: 0 6px; min-height: 68px; align-items: center; }
  .lh-bulk { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 14px; border-radius: 10px; background: rgba(215,255,60,.08); border: 1px solid rgba(215,255,60,.25); }
  .lh-bulk b { font-size: 13px; margin-right: 4px; }
  .lh-sub { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .lh-match { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; border: 1px solid ${DS_BORDER}; background: #1e1f23; color: inherit; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px; cursor: pointer; font: 600 14px Inter, sans-serif; width: 100%; text-align: left; }
  .lh-match:hover { border-color: rgba(215,255,60,.4); }
  .lh-match .dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,.3); }
  .lh-match .chip { font: 500 12.5px Inter; padding: 3px 9px; border-radius: 6px; background: rgba(255,255,255,.06); color: #c9ccd2; }
  .lh-match .edit { margin-left: auto; color: ${TEXT_MUTED}; font: 500 12.5px Inter; display: inline-flex; gap: 5px; align-items: center; }
  .lh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
  .lh-card { position: relative; border-radius: 12px; background: #222327; border: 1px solid ${DS_BORDER}; overflow: hidden; touch-action: none; }
  .lh-card.on { outline: 2px solid #d7ff3c; }
  .lh-card.before { box-shadow: -7px 0 0 -2px #d7ff3c; overflow: visible; }
  .lh-card:hover { border-color: ${DS_BORDER_STRONG}; }
  .lh-pic { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 16/9; border: none; background: #0e0f12 center/cover; color: ${TEXT_MUTED}; cursor: pointer; padding: 0; }
  .lh-no { position: absolute; left: 8px; top: 8px; min-width: 24px; height: 24px; padding: 0 7px; border-radius: 6px; background: rgba(10,12,15,.82); color: #d7ff3c; font: 800 14px 'Barlow Condensed', sans-serif; display: grid; place-items: center; }
  .lh-stack.picking { cursor: pointer; }
  .lh-stack.on .card.front { outline: 3px solid #d7ff3c; outline-offset: 2px; } .lh-stack.on .card.front::after { content: ""; position: absolute; inset: 0; border-radius: 9px; background: rgba(215,255,60,.16); } .lh-stack.on .name b { color: #d7ff3c; }
  .lh-card.on .lh-pic { box-shadow: inset 0 0 0 999px rgba(215,255,60,.14); } .lh-mini.on { box-shadow: inset 0 0 0 999px rgba(215,255,60,.18); }
  .lh-binlist { display: flex; flex-direction: column; max-width: 860px; }
  .lh-binrow { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid ${DS_BORDER}; }
  .lh-binrow .pic { width: 96px; height: 56px; border-radius: 8px; background: #2a2c31 center/cover; flex: none; display: grid; place-items: center; color: ${TEXT_MUTED}; }
  .lh-binrow .nm { flex: 1; min-width: 0; } .lh-binrow .nm b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .lh-binrow .nm span { font-size: 12.5px; color: ${TEXT_MUTED}; }
  .lh-tick { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; border-radius: 6px; border: 2px solid #fff; background: rgba(10,12,15,.55); display: grid; place-items: center; color: #0a0c0f; }
  .lh-tick.on { background: #d7ff3c; border-color: #d7ff3c; }
  .lh-meta { padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 2px; }
  .lh-meta b { font: 800 17px 'Barlow Condensed', sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-meta span { font-size: 12px; color: ${TEXT_MUTED}; }
  .lh-acts { position: absolute; right: 6px; bottom: 8px; display: flex; gap: 2px; opacity: 0; transition: opacity .12s; }
  .lh-card:hover .lh-acts, .lh-card:focus-within .lh-acts { opacity: 1; }
  .lh-addcard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 180px; border-radius: 12px; border: 1.5px dashed rgba(255,255,255,.2); background: none; color: ${TEXT_MUTED}; cursor: pointer; font: inherit; }
  .lh-addcard:hover { border-color: #d7ff3c; color: #d7ff3c; } .lh-addcard b { font-size: 14px; color: inherit; } .lh-addcard small { font-size: 12px; }
  .lh-none { color: ${TEXT_MUTED}; margin-top: 20px; }
  .lh-new { display: grid; grid-template-columns: minmax(0,1fr) 340px; min-height: 0; }
  .lh-new.noguide { grid-template-columns: minmax(0,1fr); }
  .lh-welcome { overflow-y: auto; padding: 32px 40px; min-width: 0; }
  .lh-new.noguide .lh-welcome { max-width: 1100px; }
  .lh-h1 { font: 800 clamp(34px, 3.4vw, 50px)/1 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 4px 0 10px; }
  .lh-lede { color: #b9bcc4; font-size: 16px; line-height: 1.5; max-width: 620px; margin: 0 0 22px; }
  .lh-drop { height: 250px; border: 2px dashed rgba(215,255,60,.45); border-radius: 18px; background: rgba(215,255,60,.04); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; cursor: pointer; text-align: center; padding: 0 20px; }
  .lh-drop:hover, .lh-drop:focus-visible { background: rgba(215,255,60,.08); outline: none; border-color: #d7ff3c; }
  .lh-drop b { font: 800 30px 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; }
  .lh-drop > span { color: ${TEXT_MUTED}; } .lh-drop small { color: #8b8b95; font-size: 12px; }
  .lh-ex { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }
  .lh-excard { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 0 0 14px; border-radius: 14px; border: 1px solid ${DS_BORDER}; background: #26272c; color: inherit; cursor: pointer; overflow: hidden; text-align: left; font: inherit; }
  .lh-excard:hover { border-color: rgba(215,255,60,.5); }
  .lh-excard .pic { position: relative; width: 100%; aspect-ratio: 16/9; background: #0e0f12 center/cover; margin-bottom: 9px; display: grid; place-items: center; }
  .lh-excard .play { width: 46px; height: 46px; border-radius: 50%; background: rgba(10,12,15,.75); color: #d7ff3c; display: grid; place-items: center; }
  .lh-excard .t { padding: 0 14px; font: 800 20px 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .lh-excard .s { padding: 0 14px; color: ${TEXT_MUTED}; font-size: 13px; }
  .lh-excard .go { padding: 6px 14px 0; color: #d7ff3c; font-weight: 600; font-size: 13.5px; }
  .lh-guide { border-left: 1px solid ${DS_BORDER}; background: #1c1d21; padding: 24px 22px; overflow-y: auto; }
  .lh-guide h2 { font: 800 28px 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 10px 0 6px; }
  .lh-guide > p { color: ${TEXT_MUTED}; line-height: 1.5; margin: 0 0 10px; font-size: 14px; }
  .lh-guide ol { list-style: none; padding: 0; margin: 0; }
  .lh-guide li { display: flex; gap: 12px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
  .lh-guide li i { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,.2); color: ${TEXT_MUTED}; display: grid; place-items: center; font: 700 12px Inter; font-style: normal; flex: none; }
  .lh-guide li.now i { background: #d7ff3c; color: #0a0c0f; border-color: #d7ff3c; }
  .lh-guide li.done i { background: rgba(215,255,60,.18); color: #d7ff3c; border-color: transparent; }
  .lh-guide li b { display: block; font-weight: 600; } .lh-guide li span { display: block; color: #8b8b95; font-size: 12px; margin-top: 2px; }
  .lh-guide li.done b { color: ${TEXT_MUTED}; text-decoration: line-through; }
  .lh-film { width: 100%; border-radius: 12px; margin-top: 18px; border: 1px solid ${DS_BORDER}; display: block; background: #000; }
  .rn-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
  .rn-row b { display: block; font-weight: 600; font-size: 14px; } .rn-row small { display: block; color: ${TEXT_MUTED}; font-size: 11.5px; margin-top: 2px; }
  .rn-seg { display: inline-flex; padding: 3px; border-radius: 9px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; flex: none; white-space: nowrap; }
  .rn-seg button { border: none; background: none; color: ${TEXT_MUTED}; font: 600 12.5px Inter, sans-serif; padding: 5px 10px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
  .rn-seg button.on { background: #d7ff3c; color: #0a0c0f; }
  .lt-posts { list-style: none; padding: 0; margin: 14px 0 0; display: flex; flex-direction: column; gap: 8px; max-height: 42vh; overflow-y: auto; }
  .lt-posts li { display: flex; gap: 12px; padding: 8px; border-radius: 10px; background: rgba(255,255,255,.03); border: 1px solid ${DS_BORDER}; }
  .lt-posts .pic { position: relative; flex: none; width: 128px; height: 72px; border-radius: 7px; background: #0e0f12 center/cover; display: grid; place-items: center; color: ${TEXT_MUTED}; }
  .lt-posts .pic b { position: absolute; left: 5px; top: 5px; background: #d7ff3c; color: #0a0c0f; font: 800 12px 'Barlow Condensed', sans-serif; padding: 1px 6px; border-radius: 4px; }
  .lt-posts .txt { display: flex; flex-direction: column; gap: 4px; min-width: 0; font-size: 13px; line-height: 1.45; white-space: pre-wrap; color: #d7d9de; }
  .lt-posts .txt em { color: #d7ff3c; font-style: normal; font-size: 12px; } .lt-posts .txt small { font-size: 11px; }
  a.an-btn { text-decoration: none; }
  @media (max-width: 1250px) { .lh-new { grid-template-columns: minmax(0,1fr); } .lh-guide { display: none; } }
  @media (max-width: 900px) { .lh-body { grid-template-columns: 1fr; } .lh-rail { display: none; } .lh-ex { grid-template-columns: 1fr; } }
`
