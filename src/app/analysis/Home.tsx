import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import { Check, ChevronLeft, Clock, FolderInput, FolderPlus, ImagePlus, LayoutGrid, Library as LibraryIcon, List as ListIcon, Loader2, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, X, Clapperboard, Copy } from "lucide-react"
import { Mark as PSMark } from "../brand/Mark"
import { createFolder, createItem, deleteFolder, deleteItems, duplicateItem, itemPicPath, loadLibrary, moveItems, signed, updateFolder, uploadPic, type Folder, type ItemRow } from "./items"
import { prepareShot, newId } from "./model"
import { keepVideo, probeVideo, videoKey, videoProblem } from "./videoStore"
import { pendingFiles, type Who } from "./Suite"
import { GUIDE, guideDone, markGuide, skipGuide } from "./Guide"
import { openExample, EXAMPLES } from "./examples"
import { SUITE_CSS } from "./suiteCss"
import { SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, TEXT_MUTED, TEXT_PRIMARY } from "../theme"

/* The Live Analysis Library. New here: a drop zone, three examples to take apart, and your first breakdown step by step.
   Coming back: pick up where you left off, your folders floating on a wall (drag them anywhere, drop shots on them),
   and new shots waiting in Unsorted. A folder is an analysis: open it and every shot and video in it is there. */

type Place = "all" | "recent" | "unsorted" | string
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 172800) return "yesterday"
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })
}
const STACK_W = 230, STACK_H = 196
const DRAG_ITEM = "application/x-la-item"

export function Home({ user, folderParam }: { user: Who; folderParam: string | null }) {
  const navigate = useNavigate()
  const [folders, setFolders] = useState<Folder[]>([])
  const [items, setItems] = useState<ItemRow[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [view, setViewS] = useState<"wall" | "list">(() => { try { return (localStorage.getItem("la-view") as "wall" | "list") || "wall" } catch { return "wall" } })
  const place: Place = folderParam ?? "all"
  const [q, setQ] = useState("")
  const [picking, setPicking] = useState(false)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | { items?: string[]; folder?: string }>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [naming, setNaming] = useState<{ id: string | null; parent: string | null; name: string } | null>(null)
  const [menu, setMenu] = useState<string | null>(null) // the folder whose menu is open
  const [busy, setBusy] = useState("")
  const [toast, setToast] = useState("")
  const [over, setOver] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState(false)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null)
  const dragRef = useRef<{ id: string; sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null)
  const wallRef = useRef<HTMLDivElement>(null)
  const [wallW, setWallW] = useState(1000)
  const fileRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const done = guideDone()
  const say = (t: string) => setToast(t)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3600); return () => clearTimeout(t) }, [toast])
  const setView = (v: "wall" | "list") => { setViewS(v); try { localStorage.setItem("la-view", v) } catch { /* fine */ } }

  const load = async () => {
    const r = await loadLibrary(user.id)
    if (!r) { say("Couldn't load your Library. Check your connection."); setItems(x => x ?? []); return }
    setFolders(r.folders); setItems(r.items)
    const u = await signed(r.items.map(i => i.cover_path).filter(Boolean) as string[])
    setUrls(u)
  }
  useEffect(() => { load() }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = wallRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWallW(el.clientWidth)); ro.observe(el)
    return () => ro.disconnect()
  }, [view, items === null, place]) // eslint-disable-line react-hooks/exhaustive-deps

  const byFolder = useMemo(() => {
    const m = new Map<string | null, ItemRow[]>()
    for (const i of items ?? []) m.set(i.folder_id, [...(m.get(i.folder_id) ?? []), i])
    return m
  }, [items])
  const countIn = (id: string): number => (byFolder.get(id)?.length ?? 0) + folders.filter(f => f.parent_id === id).reduce((n, c) => n + countIn(c.id), 0)
  const top = folders.filter(f => !f.parent_id)
  const cover = (i: ItemRow) => (i.cover_path ? urls[i.cover_path] : undefined)
  const nameOf = (i: ItemRow, k?: number) => i.title.trim() || i.head?.trim() || (i.kind === "video" ? "Video" : `Shot${k ? " " + k : ""}`)
  const fresh = !!items && items.length === 0
  const curFolder = folders.find(f => f.id === place) ?? null

  // the wall: folders where you put them, or in rows until you move them
  const spot = (f: Folder, i: number) => {
    if (f.x != null && f.y != null) return { x: f.x, y: f.y }
    const cols = Math.max(1, Math.floor((wallW - 20) / (STACK_W + 40)))
    return { x: 24 + (i % cols) * (STACK_W + 40), y: 26 + Math.floor(i / cols) * (STACK_H + 30) }
  }
  const wallH = Math.max(420, ...top.map((f, i) => spot(f, i).y + STACK_H + 30))
  const onStackDown = (e: React.PointerEvent, f: Folder, i: number) => {
    if ((e.target as HTMLElement).closest("button")) return
    const p = spot(f, i)
    dragRef.current = { id: f.id, sx: e.clientX, sy: e.clientY, x: p.x, y: p.y, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onStackMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 5) return
    d.moved = true
    setDrag({ id: d.id, x: Math.max(0, Math.min(wallW - STACK_W, d.x + dx)), y: Math.max(0, d.y + dy) })
  }
  const onStackUp = async () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (!d.moved) { navigate(`/analysis?folder=${d.id}`); return }
    const p = drag
    setDrag(null)
    if (!p) return
    setFolders(fs => fs.map(f => (f.id === d.id ? { ...f, x: p.x, y: p.y } : f)))
    updateFolder(d.id, { x: p.x, y: p.y }).catch(() => say("Couldn't keep it there. Check your connection."))
  }
  const tidy = async () => {
    const cols = Math.max(1, Math.floor((wallW - 20) / (STACK_W + 40)))
    const next = top.map((f, i) => ({ ...f, x: 24 + (i % cols) * (STACK_W + 40), y: 26 + Math.floor(i / cols) * (STACK_H + 30) }))
    setFolders(fs => fs.map(f => next.find(n => n.id === f.id) ?? f))
    await Promise.all(next.map(f => updateFolder(f.id, { x: f.x, y: f.y }))).catch(() => say("Couldn't keep the new places."))
  }

  /* ── adding ── */
  const targetFolder = curFolder?.id ?? null
  const addFiles = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/")), vids = files.filter(f => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name))
    if (!imgs.length && !vids.length) { say("Use a screenshot (PNG, JPG, WebP) or a clip (MP4, MOV, WebM)."); return }
    const made: string[] = []
    let n = (byFolder.get(targetFolder) ?? []).length
    for (const f of imgs) {
      setBusy(`Adding ${made.length + 1} of ${imgs.length + vids.length}…`)
      try {
        const prep = await prepareShot(f), id = newId(), path = itemPicPath(user.id, id)
        await uploadPic(path, prep.blob)
        await createItem(user.id, targetFolder, "shot", { v: 2, path, w: prep.w, h: prep.h, dim: 0, items: [] }, { id, sort: n++, cover: path })
        made.push(id)
      } catch (e) { say((e as Error).message === "too big" ? "A picture is over 25 MB." : "Couldn't add a picture. Try a PNG or JPG.") }
    }
    for (const f of vids.slice(0, 1)) {
      setBusy("Opening the clip…")
      try {
        const info = await probeVideo(f), key = videoKey(f), id = newId()
        await createItem(user.id, targetFolder, "video", { v: 2, video: { name: f.name.slice(0, 200), key, size: f.size, dur: info.dur, w: info.w, h: info.h, inT: 0, outT: info.dur, moments: [] } }, { id, sort: n++, title: f.name.replace(/\.[^.]+$/, "").slice(0, 80) })
        pendingFiles.set(id, f); keepVideo(f, key); made.push(id)
      } catch (e) { say(videoProblem(e)) }
    }
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === "Escape") { if (confirm) setConfirm(null); else if (naming) setNaming(null); else if (picking) { setPicking(false); setTicked(new Set()) } else if (q) setQ("") }
    }
    window.addEventListener("paste", paste); window.addEventListener("keydown", key)
    return () => { window.removeEventListener("paste", paste); window.removeEventListener("keydown", key) }
  })
  const depth = useRef(0)

  /* ── folders and items ── */
  const saveName = async () => {
    if (!naming) return
    const name = naming.name.trim()
    setNaming(null)
    if (!name) return
    try {
      if (naming.id) { await updateFolder(naming.id, { name }); setFolders(fs => fs.map(f => (f.id === naming.id ? { ...f, name } : f))) }
      else { const f = await createFolder(user.id, name, naming.parent); setFolders(fs => [...fs, f]); if (!naming.parent) say(`${name} is on your wall. Drop shots on it.`) }
    } catch { say("Couldn't save the folder. Try again.") }
  }
  const moveTo = async (ids: string[], folder: string | null) => {
    if (!ids.length) return
    setItems(list => (list ?? []).map(i => (ids.includes(i.id) ? { ...i, folder_id: folder } : i)))
    try { await moveItems(ids, folder) } catch { say("Couldn't move them. Try again."); load() }
    const name = folder ? folders.find(f => f.id === folder)?.name ?? "the folder" : "Unsorted"
    say(`Moved ${ids.length === 1 ? "it" : ids.length} to ${name}.`)
    setTicked(new Set()); setPicking(false); setMoveOpen(false)
  }
  const doDelete = async () => {
    const c = confirm
    setConfirm(null)
    if (!c) return
    try {
      if (c.items) { await deleteItems(c.items.map(id => ({ id })), user.id); setItems(list => (list ?? []).filter(i => !c.items!.includes(i.id))); setTicked(new Set()); setPicking(false); say(`Deleted ${c.items.length === 1 ? "it" : c.items.length}.`) }
      if (c.folder) { await deleteFolder(c.folder, folders); if (place === c.folder) navigate("/analysis"); await load(); say("Folder deleted. What was in it is in Unsorted.") }
    } catch { say("Couldn't delete. Try again.") }
  }
  const dup = async (id: string) => {
    try { const r = await duplicateItem(user.id, id); setItems(list => [r, ...(list ?? [])]); if (r.cover_path) { const u = await signed([r.cover_path]); setUrls(x => ({ ...x, ...u })) } say("Duplicated.") }
    catch { say("Couldn't duplicate it.") }
  }
  const takeApart = async (k: number) => {
    setBusy("Opening the example…")
    try { const id = await openExample(user.id, k, folders); markGuide("drop"); navigate(`/analysis?item=${id}`) }
    catch (e) { console.error(e); say("Couldn't open the example. Check your connection.") } finally { setBusy("") }
  }

  /* ── what's showing ── */
  const qn = plain(q.trim())
  const shown: ItemRow[] = (() => {
    const all = items ?? []
    if (qn) return all.filter(i => plain(`${i.title} ${i.head ?? ""}`).includes(qn) || plain(folders.find(f => f.id === i.folder_id)?.name ?? "").includes(qn))
    if (place === "recent") return all.slice(0, 48)
    if (place === "unsorted") return byFolder.get(null) ?? []
    if (curFolder) return [...(byFolder.get(curFolder.id) ?? [])].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at))
    return []
  })()
  const showGrid = !!qn || place !== "all" || view === "list"

  const Card = ({ i, k }: { i: ItemRow; k: number }) => (
    <div className={`lh-card${ticked.has(i.id) ? " on" : ""}`} draggable={!picking}
      onDragStart={e => { e.dataTransfer.setData(DRAG_ITEM, JSON.stringify(ticked.has(i.id) ? [...ticked] : [i.id])); e.dataTransfer.effectAllowed = "move" }}>
      <button className="lh-pic" style={cover(i) ? { backgroundImage: `url(${cover(i)})` } : undefined} aria-label={`Open ${nameOf(i, k)}`}
        onClick={() => { if (picking) setTicked(t => { const n = new Set(t); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n }); else navigate(`/analysis?item=${i.id}`) }}>
        {!cover(i) && (i.kind === "video" ? <Clapperboard size={22} /> : <ImagePlus size={22} />)}
        {i.kind === "video" && <span className="lh-vid"><Play size={10} fill="currentColor" /> Video</span>}
        {picking && <span className={`lh-tick${ticked.has(i.id) ? " on" : ""}`}>{ticked.has(i.id) && <Check size={13} strokeWidth={3} />}</span>}
      </button>
      <div className="lh-meta">
        <b title={nameOf(i, k)}>{nameOf(i, k)}</b>
        <span>{(qn || place === "recent") && (folders.find(f => f.id === i.folder_id)?.name ?? "Unsorted") + " · "}{ago(i.updated_at)}</span>
      </div>
      {!picking && <div className="lh-acts">
        <button className="an-x" aria-label="Duplicate" title="Duplicate" onClick={() => dup(i.id)}><Copy size={13} /></button>
        <button className="an-x" aria-label="Delete" title="Delete" onClick={() => setConfirm({ items: [i.id] })}><Trash2 size={13} /></button>
      </div>}
    </div>
  )

  const Rail = () => (
    <aside className="lh-rail" aria-label="Folders">
      <h4>Library <button className="an-x" aria-label="New folder" title="New folder" onClick={() => setNaming({ id: null, parent: null, name: "" })}><Plus size={15} /></button></h4>
      <button className={`la-fi${place === "all" && !qn ? " on" : ""}`} onClick={() => { setQ(""); navigate("/analysis") }}><LibraryIcon size={15} /> Everything<em>{items?.length ?? ""}</em></button>
      <button className={`la-fi${place === "recent" ? " on" : ""}`} onClick={() => navigate("/analysis?folder=recent")}><Clock size={15} /> Recent</button>
      <h4 style={{ marginTop: 16 }}>Folders</h4>
      {top.map(f => (
        <div key={f.id}>
          <button className={`la-fi${place === f.id ? " on" : ""}${over === f.id ? " drop" : ""}`} onClick={() => navigate(`/analysis?folder=${f.id}`)}
            onDragOver={e => { if ([...e.dataTransfer.types].includes(DRAG_ITEM)) { e.preventDefault(); setOver(f.id) } }} onDragLeave={() => setOver(null)}
            onDrop={e => { const raw = e.dataTransfer.getData(DRAG_ITEM); setOver(null); if (raw) { e.preventDefault(); moveTo(JSON.parse(raw), f.id) } }}>
            <Glyph /> {f.name}<em>{countIn(f.id)}</em></button>
          {folders.filter(c => c.parent_id === f.id).map(c => (
            <button key={c.id} className={`la-fi${place === c.id ? " on" : ""}${over === c.id ? " drop" : ""}`} style={{ paddingLeft: 30 }} onClick={() => navigate(`/analysis?folder=${c.id}`)}
              onDragOver={e => { if ([...e.dataTransfer.types].includes(DRAG_ITEM)) { e.preventDefault(); setOver(c.id) } }} onDragLeave={() => setOver(null)}
              onDrop={e => { const raw = e.dataTransfer.getData(DRAG_ITEM); setOver(null); if (raw) { e.preventDefault(); moveTo(JSON.parse(raw), c.id) } }}>
              <Glyph /> {c.name}<em>{countIn(c.id)}</em></button>
          ))}
        </div>
      ))}
      <button className={`la-fi${place === "unsorted" ? " on" : ""}${over === "unsorted" ? " drop" : ""}`} onClick={() => navigate("/analysis?folder=unsorted")}
        onDragOver={e => { if ([...e.dataTransfer.types].includes(DRAG_ITEM)) { e.preventDefault(); setOver("unsorted") } }} onDragLeave={() => setOver(null)}
        onDrop={e => { const raw = e.dataTransfer.getData(DRAG_ITEM); setOver(null); if (raw) { e.preventDefault(); moveTo(JSON.parse(raw), null) } }}>
        <Glyph dashed /> Unsorted<em>{byFolder.get(null)?.length ?? 0}</em></button>
      <button className="la-fi" style={{ color: TEXT_MUTED }} onClick={() => setNaming({ id: null, parent: null, name: "" })}><FolderPlus size={15} /> New folder</button>
    </aside>
  )

  return (
    <div className={`lh${dropOver ? " over" : ""}`}
      onDragEnter={e => { if ([...e.dataTransfer.types].includes("Files")) { depth.current++; setDropOver(true) } }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDropOver(false) }}
      onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault() }}
      onDrop={e => { if (![...e.dataTransfer.types].includes("Files")) return; e.preventDefault(); depth.current = 0; setDropOver(false); addFiles([...e.dataTransfer.files]) }}>
      <style>{SUITE_CSS + HOME_CSS}</style>
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.mp4,.m4v,.webm" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) addFiles(f) }} />
      <header className="la-top">
        <button className="la-home" aria-label="PitchStudio home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color="#d7ff3c" /></button>
        <div className="la-crumb"><b style={{ fontSize: 15 }}>Live Analysis</b><span className="la-sub">{items ? `${items.length} ${items.length === 1 ? "piece" : "pieces"} · ${folders.length} ${folders.length === 1 ? "folder" : "folders"}` : "Loading…"}</span></div>
        <div className="la-sp" />
        {!fresh && <label className="lh-search"><Search size={15} /><input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search shots, players, notes…" aria-label="Search" />{q ? <button className="an-x" aria-label="Clear the search" onClick={() => setQ("")}><X size={13} /></button> : <kbd>⌘K</kbd>}</label>}
        <div className="la-sp" />
        {busy && <span style={{ color: "#d7ff3c", fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}><Loader2 size={14} className="an-spin" /> {busy}</span>}
        {!fresh && place === "all" && !qn && <div className="la-seg" role="group" aria-label="View"><button className={view === "wall" ? "on" : ""} onClick={() => setView("wall")}><LayoutGrid size={14} /> Wall</button><button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><ListIcon size={14} /> List</button></div>}
        {!fresh && showGrid && shown.length > 0 && <button className={`an-btn${picking ? " pri" : ""}`} onClick={() => { setPicking(p => !p); setTicked(new Set()) }}>{picking ? "Done" : "Select"}</button>}
        <span style={{ position: "relative" }}>
          <button className="an-btn pri" onClick={() => setNewOpen(o => !o)}><Plus size={15} /> New</button>
          {newOpen && <div className="la-pop" style={{ right: 0, top: 42 }} onPointerLeave={() => setNewOpen(false)}>
            <button onClick={() => { setNewOpen(false); fileRef.current?.click() }}><ImagePlus size={15} /> Add shots or a clip<small>{curFolder ? `to ${curFolder.name}` : "to Unsorted"}</small></button>
            <button onClick={() => { setNewOpen(false); setNaming({ id: null, parent: curFolder?.id ?? null, name: "" }) }}><FolderPlus size={15} /> {curFolder ? "New folder inside" : "New folder"}</button>
          </div>}
        </span>
      </header>

      {items === null ? <div className="lh-load"><Loader2 className="an-spin" size={24} color="#d7ff3c" /></div> : fresh ? (
        /* ── new here ── */
        <div className="lh-fresh">
          <Rail />
          <main className="lh-welcome">
            <div className="lh-k">Welcome to the edit suite</div>
            <h1 className="lh-h1">Freeze it. Mark it. Make it yours.</h1>
            <div className="lh-drop" onClick={() => fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") fileRef.current?.click() }}>
              <b>Drop a match shot or a clip here</b>
              <span>Screenshots, MP4, MOV or WebM, up to 10 minutes · or paste with <kbd>⌘V</kbd></span>
              <div style={{ display: "flex", gap: 10 }}><span className="an-btn pri" style={{ height: 42 }}><ImagePlus size={16} /> Add shots</span><span className="an-btn" style={{ height: 42 }}><Clapperboard size={16} /> Open a video</span></div>
              <small>Your frames stay private. Only what you render is shared.</small>
            </div>
            <div className="lh-k" style={{ margin: "26px 0 12px", color: TEXT_MUTED }}>See what you can make · open one and take it apart</div>
            <div className="lh-ex">
              {EXAMPLES.map((x, k) => (
                <button key={x.title} className="lh-excard" onClick={() => takeApart(k)}>
                  <span className="pic" style={{ backgroundImage: `url(${x.thumb})` }}>{x.kind === "video" && <span className="play"><Play size={18} fill="currentColor" /></span>}</span>
                  <span className="t">{x.title}</span><span className="s">{x.sub}</span><span className="go">Open and take it apart →</span>
                </button>
              ))}
            </div>
          </main>
          <aside className="lh-guide" aria-label="Your first breakdown">
            <div className="lh-k">Your first breakdown · about 3 minutes</div>
            <h2>We'll do it together</h2>
            <p>Each step lights up when you reach it. Skip any time.</p>
            <ol>{GUIDE.map((g, i) => { const d = done.has(g.id), now = !d && GUIDE.findIndex(x => !done.has(x.id)) === i; return (
              <li key={g.id} className={d ? "done" : now ? "now" : ""}><i>{d ? <Check size={13} strokeWidth={3} /> : i + 1}</i><div><b>{g.title}</b><span>{g.sub}</span></div></li>
            ) })}</ol>
            <video className="lh-film" src="/examples/man-for-man.mp4" muted loop playsInline autoPlay poster="/examples/man-for-man.jpg" aria-label="What a directed moment looks like" />
            <button className="la-tiny" style={{ marginTop: 10 }} onClick={() => { skipGuide(); say("Guide skipped. The keys are under ? in the editor.") }}>Skip the guide</button>
          </aside>
        </div>
      ) : (
        <div className="lh-body">
          <Rail />
          <main className="lh-main">
            {/* a folder's own bar */}
            {curFolder && !qn && (
              <div className="lh-fbar">
                <button className="an-x" aria-label="Back" onClick={() => navigate(curFolder.parent_id ? `/analysis?folder=${curFolder.parent_id}` : "/analysis")}><ChevronLeft size={16} /></button>
                <h2>{curFolder.name}</h2><span className="lh-count">{shown.length} {shown.length === 1 ? "piece" : "pieces"}</span>
                <span className="la-sp" />
                <button className="la-tiny" onClick={() => setNaming({ id: curFolder.id, parent: curFolder.parent_id, name: curFolder.name })}><Pencil size={13} /> Rename</button>
                {!curFolder.parent_id && <button className="la-tiny" onClick={() => setNaming({ id: null, parent: curFolder.id, name: "" })}><FolderPlus size={13} /> Folder inside</button>}
                <button className="la-tiny bad" onClick={() => setConfirm({ folder: curFolder.id })}><Trash2 size={13} /> Delete folder</button>
              </div>
            )}
            {(place === "unsorted" || place === "recent") && !qn && <div className="lh-fbar"><h2>{place === "unsorted" ? "Unsorted" : "Recent"}</h2><span className="lh-count">{place === "unsorted" ? "New shots land here. Drag them onto a folder." : "What you worked on last"}</span></div>}
            {qn && <div className="lh-fbar"><h2>Search</h2><span className="lh-count">{shown.length} found for “{q}”</span></div>}

            {picking && (
              <div className="lh-bulk">
                <b>{ticked.size} ticked</b>
                <button className="la-tiny" onClick={() => setTicked(ticked.size === shown.length ? new Set() : new Set(shown.map(s => s.id)))}>{ticked.size === shown.length ? "None" : "All"}</button>
                <span style={{ position: "relative" }}>
                  <button className="la-tiny" disabled={!ticked.size} onClick={() => setMoveOpen(o => !o)}><FolderInput size={13} /> Move to…</button>
                  {moveOpen && <div className="la-pop" style={{ top: 32, left: 0 }}>
                    {top.flatMap(f => [f, ...folders.filter(c => c.parent_id === f.id)]).map(f => <button key={f.id} style={f.parent_id ? { paddingLeft: 26 } : undefined} onClick={() => moveTo([...ticked], f.id)}><Glyph /> {f.name}</button>)}
                    <button onClick={() => moveTo([...ticked], null)}><Glyph dashed /> Unsorted</button>
                  </div>}
                </span>
                <button className="la-tiny bad" disabled={!ticked.size} onClick={() => setConfirm({ items: [...ticked] })}><Trash2 size={13} /> Delete</button>
              </div>
            )}

            {!showGrid ? <>
              {/* ── coming back: pick up where you left off, the wall ── */}
              <div className="lh-k" style={{ color: TEXT_MUTED }}>Pick up where you left off</div>
              <div className="lh-cont">
                {(items ?? []).slice(0, 3).map((i, k) => (
                  <button key={i.id} className="lh-ccard" onClick={() => navigate(`/analysis?item=${i.id}`)}>
                    <span className="pic" style={cover(i) ? { backgroundImage: `url(${cover(i)})` } : undefined}>{i.kind === "video" && <span className="lh-vid"><Play size={10} fill="currentColor" /> Video</span>}</span>
                    <span className="txt"><b>{nameOf(i, k + 1)}</b><span className={`chip${i.kind === "video" ? " v" : ""}`}>{i.kind === "video" ? "Video" : "Shot"}</span><small>{folders.find(f => f.id === i.folder_id)?.name ?? "Unsorted"} · {ago(i.updated_at)}</small></span>
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 22 }}><div className="lh-k" style={{ color: TEXT_MUTED, margin: 0 }}>Your folders · drag them anywhere, drop shots on them</div><span className="la-sp" />{top.length > 1 && <button className="la-tiny" onClick={tidy}>Tidy up</button>}</div>
              <div className="lh-wall" ref={wallRef} style={{ height: wallH + 120 }}>
                {!top.length && <div className="lh-nofolders"><b>No folders yet</b><span>A folder is an analysis: one match, one idea, one player.</span><button className="an-btn pri" onClick={() => setNaming({ id: null, parent: null, name: "" })}><FolderPlus size={15} /> New folder</button></div>}
                {top.map((f, i) => {
                  const p = drag?.id === f.id ? drag : spot(f, i)
                  const kids = (byFolder.get(f.id) ?? []).slice(0, 3)
                  return (
                    <div key={f.id} className={`lh-stack${over === f.id ? " drop" : ""}${drag?.id === f.id ? " lift" : ""}`} style={{ left: p.x, top: p.y, transform: `rotate(${((i * 37) % 5) - 2}deg)` }}
                      onPointerDown={e => onStackDown(e, f, i)} onPointerMove={onStackMove} onPointerUp={onStackUp}
                      onDragOver={e => { if ([...e.dataTransfer.types].includes(DRAG_ITEM)) { e.preventDefault(); setOver(f.id) } }} onDragLeave={() => setOver(null)}
                      onDrop={e => { const raw = e.dataTransfer.getData(DRAG_ITEM); setOver(null); if (raw) { e.preventDefault(); moveTo(JSON.parse(raw), f.id) } }}
                      role="button" tabIndex={0} aria-label={`${f.name}, ${countIn(f.id)} pieces. Open`} onKeyDown={e => { if (e.key === "Enter") navigate(`/analysis?folder=${f.id}`) }}>
                      <div className="pile">
                        {(kids.length ? [...kids].reverse() : [null]).map((it, j, arr) => (
                          <span key={j} className="card" style={{ left: (arr.length - 1 - j) * 8, top: -(arr.length - 1 - j) * 8, backgroundImage: it && cover(it) ? `url(${cover(it)})` : undefined }} />
                        ))}
                      </div>
                      <div className="name"><b>{f.name}</b>
                        <button className="an-x" aria-label={`More for ${f.name}`} onClick={e => { e.stopPropagation(); setMenu(m => (m === f.id ? null : f.id)) }}><MoreHorizontal size={15} /></button></div>
                      <small>{(() => { const its = byFolder.get(f.id) ?? []; const s = its.filter(x => x.kind === "shot").length, v = its.length - s; const sub = folders.filter(c => c.parent_id === f.id).length; return [s && `${s} ${s === 1 ? "shot" : "shots"}`, v && `${v} ${v === 1 ? "video" : "videos"}`, sub && `${sub} inside`].filter(Boolean).join(" · ") || "Empty" })()}</small>
                      {menu === f.id && <div className="la-pop" style={{ top: 160, left: 10 }} onPointerDown={e => e.stopPropagation()} onPointerLeave={() => setMenu(null)}>
                        <button onClick={() => { setMenu(null); navigate(`/analysis?folder=${f.id}`) }}>Open</button>
                        <button onClick={() => { setMenu(null); setNaming({ id: f.id, parent: null, name: f.name }) }}><Pencil size={14} /> Rename</button>
                        <button onClick={() => { setMenu(null); setConfirm({ folder: f.id }) }} style={{ color: "#ff8fa3" }}><Trash2 size={14} /> Delete folder</button>
                      </div>}
                    </div>
                  )
                })}
                <div className={`lh-tray${over === "unsorted" ? " drop" : ""}`}
                  onDragOver={e => { if ([...e.dataTransfer.types].includes(DRAG_ITEM)) { e.preventDefault(); setOver("unsorted") } }} onDragLeave={() => setOver(null)}
                  onDrop={e => { const raw = e.dataTransfer.getData(DRAG_ITEM); setOver(null); if (raw) { e.preventDefault(); moveTo(JSON.parse(raw), null) } }}>
                  <div><div className="lh-k" style={{ margin: 0, color: TEXT_MUTED }}>Unsorted</div><small>New shots land here · drag them onto a folder</small></div>
                  {(byFolder.get(null) ?? []).slice(0, 8).map(i => (
                    <button key={i.id} className="lh-mini" draggable onDragStart={e => { e.dataTransfer.setData(DRAG_ITEM, JSON.stringify([i.id])); e.dataTransfer.effectAllowed = "move" }}
                      style={cover(i) ? { backgroundImage: `url(${cover(i)})` } : undefined} aria-label={`Open ${nameOf(i)}`} onClick={() => navigate(`/analysis?item=${i.id}`)} />
                  ))}
                  {(byFolder.get(null)?.length ?? 0) > 8 && <button className="la-tiny" onClick={() => navigate("/analysis?folder=unsorted")}>All {byFolder.get(null)!.length} →</button>}
                </div>
              </div>
            </> : (
              <>
                {place === "all" && !qn && view === "list" && (
                  <div className="lh-grid" style={{ marginBottom: 20 }}>
                    {top.map(f => (
                      <button key={f.id} className="lh-fcard" onClick={() => navigate(`/analysis?folder=${f.id}`)}
                        onDragOver={e => { if ([...e.dataTransfer.types].includes(DRAG_ITEM)) { e.preventDefault(); setOver(f.id) } }} onDragLeave={() => setOver(null)}
                        onDrop={e => { const raw = e.dataTransfer.getData(DRAG_ITEM); setOver(null); if (raw) { e.preventDefault(); moveTo(JSON.parse(raw), f.id) } }}>
                        <span className="pic" style={(byFolder.get(f.id) ?? [])[0] && cover((byFolder.get(f.id) ?? [])[0]) ? { backgroundImage: `url(${cover((byFolder.get(f.id) ?? [])[0])})` } : undefined}><Glyph /></span>
                        <b>{f.name}</b><small>{countIn(f.id)} pieces</small>
                      </button>
                    ))}
                  </div>
                )}
                {curFolder && folders.some(c => c.parent_id === curFolder.id) && !qn && (
                  <div className="lh-sub">{folders.filter(c => c.parent_id === curFolder.id).map(c => <button key={c.id} className="la-chip" onClick={() => navigate(`/analysis?folder=${c.id}`)}><Glyph /> {c.name} <span style={{ color: TEXT_MUTED }}>{countIn(c.id)}</span></button>)}</div>
                )}
                <div className="lh-grid">
                  {(place === "all" && !qn ? (items ?? []) : shown).map((i, k) => <Card key={i.id} i={i} k={k + 1} />)}
                  {curFolder && !qn && <button className="lh-addcard" onClick={() => fileRef.current?.click()}><Plus size={22} /><b>Add shots or a clip</b><small>or drop them anywhere</small></button>}
                </div>
                {shown.length === 0 && (place === "unsorted" || qn) && <p className="lh-none">{qn ? "Nothing matches. Try a player, a word from your notes, or a folder." : "Nothing waiting here."}</p>}
              </>
            )}
          </main>
        </div>
      )}

      {naming && (
        <div className="la-keys" onPointerDown={e => { if (e.target === e.currentTarget) setNaming(null) }}>
          <div role="dialog" aria-label={naming.id ? "Rename the folder" : "New folder"} style={{ width: 420 }}>
            <h3>{naming.id ? "Rename" : naming.parent ? "Folder inside" : "New folder"}</h3>
            <input className="an-inp" autoFocus value={naming.name} maxLength={60} placeholder="El Clásico" onChange={e => setNaming({ ...naming, name: e.target.value })} onKeyDown={e => { if (e.key === "Enter") saveName() }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}><button className="an-btn" onClick={() => setNaming(null)}>Cancel</button><button className="an-btn pri" onClick={saveName} disabled={!naming.name.trim()}>{naming.id ? "Rename" : "Make it"}</button></div>
          </div>
        </div>
      )}
      {confirm && (
        <div className="la-keys" onPointerDown={e => { if (e.target === e.currentTarget) setConfirm(null) }}>
          <div role="alertdialog" aria-label="Delete" style={{ width: 440 }}>
            <h3>{confirm.folder ? "Delete the folder?" : `Delete ${confirm.items!.length === 1 ? "it" : confirm.items!.length}?`}</h3>
            <p style={{ color: "#c9ccd2", fontSize: 14, lineHeight: 1.5, margin: "0 0 16px" }}>{confirm.folder ? "The folder goes. What was in it moves to Unsorted, so nothing is lost." : "Shots and their marks are deleted for good. This can't be undone."}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button className="an-btn" onClick={() => setConfirm(null)}>Keep</button><button className="an-btn" style={{ background: "#ff4d6d", borderColor: "#ff4d6d", color: "#fff" }} onClick={doDelete}>Delete</button></div>
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
  .lh > .lh-body, .lh > .lh-fresh, .lh > .lh-load { grid-area: 2 / 1; }
  .lh.over::after { content: "Drop to add"; position: fixed; inset: 10px; border: 2px dashed #d7ff3c; border-radius: 16px; background: rgba(215,255,60,.06); display: grid; place-items: center; font: 800 30px 'Barlow Condensed', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: #d7ff3c; z-index: 60; pointer-events: none; }
  .lh-load { display: grid; place-items: center; }
  .lh-search { height: 38px; width: min(420px, 36vw); border-radius: 10px; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 12px; color: ${TEXT_MUTED}; }
  .lh-search:focus-within { border-color: #d7ff3c; }
  .lh-search input { flex: 1; min-width: 0; background: none; border: none; outline: none; color: ${TEXT_PRIMARY}; font: 500 14px Inter, sans-serif; }
  .lh-search kbd { font: 600 11px Inter; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 5px; padding: 1px 6px; }
  .lh-body, .lh-fresh { display: grid; grid-template-columns: 248px minmax(0,1fr); min-height: 0; }
  .lh-fresh { grid-template-columns: 248px minmax(0,1fr) 340px; }
  .lh-rail { border-right: 1px solid ${DS_BORDER}; background: #1c1d21; padding: 14px 10px; overflow-y: auto; }
  .lh-rail h4 { margin: 4px 8px 8px; font: 600 12px 'Barlow Condensed', sans-serif; letter-spacing: .26em; text-transform: uppercase; color: ${TEXT_MUTED}; display: flex; justify-content: space-between; align-items: center; }
  .la-fi.drop { outline: 2px dashed #d7ff3c; outline-offset: -2px; }
  .lh-main { overflow-y: auto; padding: 22px 28px 40px; min-width: 0; }
  .lh-k { font: 600 13px 'Barlow Condensed', sans-serif; letter-spacing: .28em; text-transform: uppercase; color: #d7ff3c; margin-bottom: 10px; }
  .lh-cont { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px; }
  .lh-ccard { display: flex; gap: 12px; padding: 10px; border-radius: 12px; border: 1px solid ${DS_BORDER}; background: #222327; color: inherit; cursor: pointer; text-align: left; min-width: 0; }
  .lh-ccard:hover { border-color: ${DS_BORDER_STRONG}; background: #26272c; }
  .lh-ccard .pic { position: relative; width: 136px; height: 78px; border-radius: 8px; background: #0e0f12 center/cover; flex: none; }
  .lh-ccard .txt { display: flex; flex-direction: column; gap: 5px; min-width: 0; align-items: flex-start; }
  .lh-ccard b { font: 800 18px/1.05 'Barlow Condensed', sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .lh-ccard small { color: ${TEXT_MUTED}; font-size: 12px; }
  .chip { display: inline-flex; height: 22px; align-items: center; padding: 0 8px; border-radius: 6px; font: 600 11.5px Inter; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; color: #c9c9d0; }
  .chip.v { background: rgba(215,255,60,.14); color: #d7ff3c; border-color: rgba(215,255,60,.3); }
  .lh-vid { position: absolute; right: 6px; bottom: 6px; display: inline-flex; align-items: center; gap: 4px; font: 700 10px Inter; color: #d7ff3c; background: rgba(10,12,15,.82); padding: 2px 6px; border-radius: 4px; }
  .lh-wall { position: relative; margin-top: 8px; border-radius: 16px; background: radial-gradient(circle at 1px 1px, rgba(255,255,255,.06) 1px, transparent 0) 0 0 / 22px 22px; }
  .lh-stack { position: absolute; width: ${STACK_W}px; cursor: grab; touch-action: none; user-select: none; transition: transform .15s; border-radius: 12px; }
  .lh-stack:hover { transform: rotate(0deg) translateY(-3px) !important; }
  .lh-stack.lift { cursor: grabbing; z-index: 10; transform: rotate(0deg) scale(1.03) !important; transition: none; }
  .lh-stack.drop .pile .card:last-child { outline: 3px solid #d7ff3c; }
  .lh-stack:focus-visible { outline: 2px solid #fff; outline-offset: 6px; }
  .lh-stack .pile { position: relative; height: 130px; margin-top: 16px; }
  .lh-stack .card { position: absolute; width: 214px; height: 122px; border-radius: 10px; background: #2a2c31 center/cover; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 8px 22px rgba(0,0,0,.38); }
  .lh-stack .name { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
  .lh-stack .name b { font: 800 20px 'Barlow Condensed', sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-stack small { color: ${TEXT_MUTED}; font-size: 12px; }
  .lh-tray { position: absolute; left: 0; right: 0; bottom: 0; min-height: 100px; border-top: 1px dashed rgba(255,255,255,.16); display: flex; align-items: center; gap: 12px; padding: 12px 18px; overflow-x: auto; }
  .lh-tray small { color: ${TEXT_MUTED}; font-size: 12px; display: block; margin-top: 3px; white-space: nowrap; }
  .lh-tray.drop { background: rgba(215,255,60,.06); border-top-color: #d7ff3c; }
  .lh-mini { flex: none; width: 118px; height: 68px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: #0e0f12 center/cover; cursor: pointer; }
  .lh-nofolders { position: absolute; left: 24px; top: 30px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; color: ${TEXT_MUTED}; }
  .lh-nofolders b { color: #fff; font: 800 22px 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .lh-fbar { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
  .lh-fbar h2 { margin: 0; font: 800 32px/1 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .lh-count { color: ${TEXT_MUTED}; font-size: 13px; }
  .lh-bulk { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 14px; border-radius: 10px; background: rgba(215,255,60,.08); border: 1px solid rgba(215,255,60,.25); }
  .lh-bulk b { font-size: 13px; margin-right: 4px; }
  .lh-sub { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
  .lh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
  .lh-card { position: relative; border-radius: 12px; background: #222327; border: 1px solid ${DS_BORDER}; overflow: hidden; }
  .lh-card.on { outline: 2px solid #d7ff3c; }
  .lh-card:hover { border-color: ${DS_BORDER_STRONG}; }
  .lh-pic { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 16/9; border: none; background: #0e0f12 center/cover; color: ${TEXT_MUTED}; cursor: pointer; padding: 0; }
  .lh-tick { position: absolute; right: 8px; top: 8px; width: 22px; height: 22px; border-radius: 6px; border: 2px solid #fff; background: rgba(10,12,15,.55); display: grid; place-items: center; color: #0a0c0f; }
  .lh-tick.on { background: #d7ff3c; border-color: #d7ff3c; }
  .lh-meta { padding: 9px 12px 11px; display: flex; flex-direction: column; gap: 2px; }
  .lh-meta b { font: 800 17px 'Barlow Condensed', sans-serif; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .lh-meta span { font-size: 12px; color: ${TEXT_MUTED}; }
  .lh-acts { position: absolute; right: 6px; bottom: 8px; display: flex; gap: 2px; opacity: 0; transition: opacity .12s; }
  .lh-card:hover .lh-acts, .lh-card:focus-within .lh-acts { opacity: 1; }
  .lh-fcard { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding: 0 0 12px; border-radius: 12px; border: 1px solid ${DS_BORDER}; background: #222327; color: inherit; cursor: pointer; overflow: hidden; text-align: left; }
  .lh-fcard .pic { width: 100%; aspect-ratio: 16/8; background: #2a2c31 center/cover; display: grid; place-items: center; color: ${TEXT_MUTED}; margin-bottom: 6px; }
  .lh-fcard b { padding: 0 12px; font: 800 18px 'Barlow Condensed', sans-serif; text-transform: uppercase; } .lh-fcard small { padding: 0 12px; color: ${TEXT_MUTED}; font-size: 12px; }
  .lh-addcard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 180px; border-radius: 12px; border: 1.5px dashed rgba(255,255,255,.2); background: none; color: ${TEXT_MUTED}; cursor: pointer; font: inherit; }
  .lh-addcard:hover { border-color: #d7ff3c; color: #d7ff3c; } .lh-addcard b { font-size: 14px; color: inherit; } .lh-addcard small { font-size: 12px; }
  .lh-none { color: ${TEXT_MUTED}; margin-top: 20px; }
  .lh-welcome { overflow-y: auto; padding: 32px 40px; min-width: 0; }
  .lh-h1 { font: 800 clamp(40px, 4.4vw, 60px)/0.95 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 4px 0 22px; }
  .lh-drop { height: 250px; border: 2px dashed rgba(215,255,60,.45); border-radius: 18px; background: rgba(215,255,60,.04); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; cursor: pointer; text-align: center; padding: 0 20px; }
  .lh-drop:hover, .lh-drop:focus-visible { background: rgba(215,255,60,.08); outline: none; border-color: #d7ff3c; }
  .lh-drop b { font: 800 30px 'Barlow Condensed', sans-serif; letter-spacing: .02em; text-transform: uppercase; }
  .lh-drop > span { color: ${TEXT_MUTED}; } .lh-drop small { color: #8b8b95; font-size: 12px; }
  .lh-drop kbd { font: 600 11px Inter; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 5px; padding: 1px 6px; color: #fff; }
  .lh-ex { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 16px; }
  .lh-excard { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 0 0 14px; border-radius: 14px; border: 1px solid ${DS_BORDER}; background: #26272c; color: inherit; cursor: pointer; overflow: hidden; text-align: left; font: inherit; }
  .lh-excard:hover { border-color: rgba(215,255,60,.5); }
  .lh-excard .pic { position: relative; width: 100%; aspect-ratio: 16/9; background: #0e0f12 center/cover; margin-bottom: 9px; display: grid; place-items: center; }
  .lh-excard .play { width: 46px; height: 46px; border-radius: 50%; background: rgba(10,12,15,.75); color: #d7ff3c; display: grid; place-items: center; }
  .lh-excard .t { padding: 0 14px; font: 800 20px 'Barlow Condensed', sans-serif; text-transform: uppercase; }
  .lh-excard .s { padding: 0 14px; color: ${TEXT_MUTED}; font-size: 13px; }
  .lh-excard .go { padding: 6px 14px 0; color: #d7ff3c; font-weight: 600; font-size: 13.5px; }
  .lh-guide { border-left: 1px solid ${DS_BORDER}; background: #1c1d21; padding: 26px 22px; overflow-y: auto; }
  .lh-guide h2 { font: 800 28px 'Barlow Condensed', sans-serif; text-transform: uppercase; margin: 6px 0 6px; }
  .lh-guide > p { color: ${TEXT_MUTED}; line-height: 1.5; margin: 0 0 10px; font-size: 14px; }
  .lh-guide ol { list-style: none; padding: 0; margin: 0; }
  .lh-guide li { display: flex; gap: 12px; padding: 11px 0; border-bottom: 1px solid rgba(255,255,255,.06); }
  .lh-guide li i { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,.2); color: ${TEXT_MUTED}; display: grid; place-items: center; font: 700 12px Inter; font-style: normal; flex: none; }
  .lh-guide li.now i { background: #d7ff3c; color: #0a0c0f; border-color: #d7ff3c; }
  .lh-guide li.done i { background: rgba(215,255,60,.18); color: #d7ff3c; border-color: transparent; }
  .lh-guide li b { display: block; font-weight: 600; } .lh-guide li span { display: block; color: #8b8b95; font-size: 12px; margin-top: 2px; }
  .lh-guide li.done b { color: ${TEXT_MUTED}; text-decoration: line-through; }
  .lh-film { width: 100%; border-radius: 12px; margin-top: 18px; border: 1px solid ${DS_BORDER}; display: block; background: #000; }
  @media (max-width: 1250px) { .lh-fresh { grid-template-columns: 220px minmax(0,1fr); } .lh-guide { display: none; } .lh-cont { grid-template-columns: repeat(2, minmax(0,1fr)); } .lh-cont > :nth-child(3) { display: none; } }
  @media (max-width: 900px) { .lh-body, .lh-fresh { grid-template-columns: 1fr; } .lh-rail { display: none; } .lh-ex { grid-template-columns: 1fr; } .lh-cont { grid-template-columns: 1fr; } }
`
void SURFACE_2
