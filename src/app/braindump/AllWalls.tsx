import { useEffect, useMemo, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { ArrowRight, Clock, FolderPlus, Layers, Loader2, MoreHorizontal, Pin, Plus, Search, Star, Trash2, Type, X } from "lucide-react"
import { supabase } from "../lib/supabase"
import { reportError, track } from "../lib/telemetry"
import { Mark as PSMark } from "../brand/Mark"
import { nid } from "./notes"
import { Popover } from "./Wall"
import { DEFAULT_LOOK, WALL_COLS, mainWall, readWall, type Look, type View, type Wall } from "./walls"
import { ACCENT_SOLID } from "../theme"
import { ALL_WALLS_CSS } from "./allWallsCss"
import { MiniWall, STARTERS, ago, hexOf, type Card, type Starter } from "./wallCard"

/* All walls ("/braindump"): every wall you have, as cards you can open, pin, put in folders and search. A wall with
   walls inside it has a stacked edge. Search looks through every note on every wall. A new member lands here with
   their first wall already made, the four ways a wall works, and ready-made walls to start from. */

type Hit = { id: string; title: string; wall: string | null }
type Shelf = "all" | "pinned" | "recent" | `folder:${string}`
const FOLDER_KEY = "ps-wall-folders"
export function AllWalls() {
  const navigate = useNavigate()
  const [walls, setWalls] = useState<Wall[] | null>(null)
  const [cards, setCards] = useState<Map<string, Card>>(new Map())
  const [placed, setPlaced] = useState<Map<string, string | null>>(new Map()) // a nested wall: the wall its note sits on
  const [failed, setFailed] = useState(false)
  const [shelf, setShelf] = useState<Shelf>("all")
  const [q, setQ] = useState("")
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; sub?: "folder" | "delete" } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [extraFolders, setExtraFolders] = useState<string[]>(() => { try { const a = JSON.parse(localStorage.getItem(FOLDER_KEY) || "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string").slice(0, 60) : [] } catch { return [] } })
  const [naming, setNaming] = useState<string | null>(null) // a new folder's name being typed
  const [toast, setToast] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t) }, [toast])
  useEffect(() => { try { localStorage.setItem(FOLDER_KEY, JSON.stringify(extraFolders)) } catch { /* not kept */ } }, [extraFolders])

  const search = useLocation().search
  useEffect(() => { // an old link to a frame (/braindump?tree=ID): the wall it's on
    const tree = new URLSearchParams(search).get("tree")
    if (!tree) return
    let off = false
    ;(supabase as any).from("notes").select("id, wall_id").eq("id", tree).maybeSingle().then(({ data }: any) => {
      if (!off) navigate(`/braindump/w/${data?.wall_id ?? "main"}?tree=${encodeURIComponent(tree)}`, { replace: true })
    })
    return () => { off = true }
  }, [search, navigate])
  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) { navigate("/", { replace: true }); return }
      const db = supabase as any
      if (new URLSearchParams(window.location.search).get("tree")) return
      try {
        let [ws, cs] = await Promise.all([db.from("walls").select(WALL_COLS).order("pos", { ascending: true }).limit(1000), db.rpc("wall_cards")])
        if (ws.error) throw ws.error
        let list = ((ws.data ?? []) as any[]).map(readWall)
        if (!list.some(w => w.main)) { // the first visit: your main wall is made now (with any notes you already had), then counted
          const m = await mainWall()
          if (m) { list = [m, ...list]; cs = await db.rpc("wall_cards") }
        }
        const m = new Map<string, Card>()
        for (const c of ((cs.data ?? []) as any[])) m.set(String(c.wall_id), { notes: Number(c.notes) || 0, inside: Number(c.inside) || 0, last: String(c.last ?? ""), preview: Array.isArray(c.preview) ? c.preview : [] })
        const nested = list.filter(w => w.note_id)
        if (nested.length) {
          const { data } = await db.from("notes").select("id, wall_id").in("id", nested.map(w => w.note_id)).limit(1000)
          const main = list.find(w => w.main)?.id ?? null
          const at = new Map<string, string | null>(((data ?? []) as any[]).map(n => [String(n.id), n.wall_id ?? main]))
          if (!off) setPlaced(new Map(nested.map(w => [w.id, at.get(w.note_id!) ?? null])))
        }
        if (off) return
        setCards(m); setWalls(list); setFailed(false)
      } catch (e) { reportError(e, "walls_load"); if (!off) { setFailed(true); setWalls(w => w ?? []) } }
    })
    return () => { off = true }
  }, [navigate, tries])

  // search: wall names here, notes on every wall from the server
  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setHits(null); return }
    let off = false
    const k = setTimeout(async () => {
      const like = `%${t.replace(/[%_\\]/g, m => "\\" + m)}%`
      const { data, error } = await (supabase as any).from("notes").select("id, title, wall_id, kind").eq("kind", "note").ilike("title", like).limit(30)
      if (off) return
      if (error) { reportError(error, "walls_search"); setHits([]); return }
      setHits(((data ?? []) as any[]).map(n => ({ id: String(n.id), title: String(n.title), wall: n.wall_id ?? null })))
    }, 220)
    return () => { off = true; clearTimeout(k) }
  }, [q])

  const all = walls ?? []
  const main = all.find(w => w.main)
  const byId = useMemo(() => new Map(all.map(w => [w.id, w])), [all])
  const last = (w: Wall) => cards.get(w.id)?.last || w.updated_at
  const folders = useMemo(() => [...new Set([...all.map(w => w.folder).filter((f): f is string => !!f), ...extraFolders])].sort((a, b) => a.localeCompare(b)), [all, extraFolders])
  const shown = useMemo(() => {
    const byLast = (a: Wall, b: Wall) => last(b).localeCompare(last(a))
    if (shelf === "pinned") return all.filter(w => w.pinned).sort(byLast)
    if (shelf === "recent") return [...all].sort(byLast).slice(0, 24)
    if (shelf.startsWith("folder:")) return all.filter(w => w.folder === shelf.slice(7)).sort(byLast)
    return all.filter(w => !w.note_id || !!w.folder).sort((a, b) => (a.main === b.main ? byLast(a, b) : a.main ? -1 : 1))
  }, [all, shelf, cards]) // eslint-disable-line react-hooks/exhaustive-deps
  const pinned = shelf === "all" ? all.filter(w => w.pinned) : []
  const term = q.trim().toLowerCase()
  const wallHits = term.length >= 2 ? all.filter(w => w.title.toLowerCase().includes(term)).slice(0, 8) : []
  const fresh = !!walls && all.length <= 1 && (cards.get(main?.id ?? "")?.notes ?? 0) <= 1 // a new member

  const save = async (id: string, patch: Partial<Pick<Wall, "title" | "pinned" | "folder">>) => {
    setWalls(ws => (ws ?? []).map(w => (w.id === id ? { ...w, ...patch } : w)))
    const { error } = await (supabase as any).from("walls").update(patch).eq("id", id)
    if (error) { reportError(error, "wall_card_save"); setToast("Couldn't save that. Try again.") }
  }
  const newWall = async (title = "New wall", look: Partial<Look> = {}, view: View = "wall") => {
    const id = nid()
    const { error } = await (supabase as any).from("walls").insert({ id, title, look: { ...DEFAULT_LOOK, ...look }, view, folder: shelf.startsWith("folder:") ? shelf.slice(7) : null })
    if (error) { setToast(/limit/.test(error.message || "") ? "You have 1,000 walls. Delete a few to make another." : "Couldn't make the wall. Try again."); return null }
    track("wall_made", { from: "home" })
    return id
  }
  const startFrom = async (s: Starter) => {
    if (busy) return
    setBusy(s.id)
    try {
      const id = await newWall(s.title, s.look, s.view)
      if (!id) return
      const rows: any[] = []
      s.frames.forEach((f, i) => {
        const fid = nid()
        rows.push({ id: fid, kind: "tree", parent_id: null, title: f.t, color: f.c, pos: i + 1, body: [{ type: "text", id: nid(), html: "" }], wall_id: id })
        f.notes.forEach((t, j) => rows.push({ id: nid(), kind: "note", parent_id: s.id === "tactic" && j > 0 ? rows[rows.length - 1].id : fid, title: t, color: (["yellow", "peach", "aqua", "pink", "lime"] as const)[(i + j) % 5], pos: j + 1, body: [{ type: "text", id: nid(), html: "" }], wall_id: id }))
      })
      for (const r of rows) { const { error } = await (supabase as any).from("notes").insert(r); if (error) throw error }
      track("wall_starter", { which: s.id })
      navigate(`/braindump/w/${id}`)
    } catch (e) { reportError(e, "wall_starter"); setToast("Couldn't set that wall up. Try again.") }
    finally { setBusy(null) }
  }
  const remove = async (w: Wall) => {
    setMenu(null)
    if (w.main) return
    const db = supabase as any
    // a wall that's a note goes with its note; any other wall goes by itself (its notes, and the walls inside them, go too)
    const { error } = w.note_id ? await db.from("notes").delete().eq("id", w.note_id) : await db.from("walls").delete().eq("id", w.id)
    if (error) { setToast("Couldn't delete it. Try again."); return }
    setWalls(ws => (ws ?? []).filter(x => x.id !== w.id))
    setToast(`“${w.title}” deleted.`)
  }
  const addFolder = (name: string) => { const n = name.trim().slice(0, 60); setNaming(null); if (!n) return; if (!folders.includes(n)) setExtraFolders(f => [...f, n]); setShelf(`folder:${n}`) }

  const card = (w: Wall) => {
    const c = cards.get(w.id), up = w.note_id ? byId.get(placed.get(w.id) ?? "") : undefined
    return (
      <article key={w.id} className={`aw-card${(c?.inside ?? 0) > 0 ? " stack" : ""}`} draggable={!w.main} onDragStart={e => { e.dataTransfer.setData("text/x-wall", w.id); e.dataTransfer.effectAllowed = "move" }}>
        <button className="aw-open" onClick={() => navigate(`/braindump/w/${w.id}`)} aria-label={`Open ${w.title}`}>
          <MiniWall look={w.look} card={c} />
        </button>
        {w.pinned && <span className="aw-pinb" aria-label="Pinned"><Star size={11} /></span>}
        <div className="aw-t">
          {renaming === w.id
            ? <input autoFocus defaultValue={w.title} maxLength={80} aria-label="Wall name" onBlur={e => { setRenaming(null); const v = e.target.value.trim(); if (v && v !== w.title) save(w.id, { title: v }) }}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); else if (e.key === "Escape") setRenaming(null) }} />
            : <b>{w.title || "Wall"}</b>}
          <span>{ago(last(w))}</span>
          <button className="aw-more" aria-label={`More for ${w.title}`} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ id: w.id, x: r.left - 200, y: r.bottom + 4 }) }}><MoreHorizontal size={16} /></button>
        </div>
        <div className="aw-m">{c?.notes ?? 0} note{c?.notes === 1 ? "" : "s"}{(c?.inside ?? 0) > 0 && <em><Layers size={11} /> {c!.inside} inside</em>}{up && <small>in {up.title}</small>}{w.folder && shelf === "all" && <small>{w.folder}</small>}</div>
      </article>
    )
  }
  const mWall = menu ? byId.get(menu.id) : undefined

  return (
    <div className="aw">
      <style>{ALL_WALLS_CSS}</style>
      <header className="aw-top">
        <button className="aw-icon" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color={ACCENT_SOLID} /></button>
        <div className="aw-name"><b>Dump &amp; Arrange</b><span>{walls === null ? "Loading…" : `${all.length} wall${all.length === 1 ? "" : "s"}`}</span></div>
        <label className="aw-search"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search every wall and every note" aria-label="Search every wall and every note" />{q && <button className="aw-icon s" aria-label="Clear search" onClick={() => setQ("")}><X size={14} /></button>}
          {term.length >= 2 && (
            <div className="aw-hits" role="listbox" aria-label="Search results">
              {wallHits.map(w => <button key={w.id} role="option" aria-selected="false" onClick={() => navigate(`/braindump/w/${w.id}`)}><Layers size={14} /><span>{w.title}</span><small>Wall</small></button>)}
              {hits === null ? <p>Looking…</p> : hits.map(h => <button key={h.id} role="option" aria-selected="false" onClick={() => navigate(`/braindump/w/${h.wall ?? main?.id ?? "main"}?note=${h.id}`)}><i aria-hidden="true" /><span>{h.title}</span><small>{byId.get(h.wall ?? main?.id ?? "")?.title ?? "My ideas"}</small></button>)}
              {hits !== null && !hits.length && !wallHits.length && <p>Nothing called that yet.</p>}
            </div>
          )}
        </label>
        <button className={fresh ? "aw-btn" : "aw-btn lime"} onClick={async () => { const id = await newWall(); if (id) navigate(`/braindump/w/${id}`) }} disabled={!walls}><Plus size={16} /> New wall</button>
      </header>
      <aside className="aw-side" aria-label="Walls and folders">
        <p className="aw-k">Walls</p>
        {([["all", "All walls", all.length, <Layers size={15} key="a" />], ["pinned", "Pinned", all.filter(w => w.pinned).length, <Star size={15} key="p" />], ["recent", "Recent", Math.min(24, all.length), <Clock size={15} key="r" />]] as const).map(([k, label, n, ico]) => (
          <button key={k} className="aw-row" aria-pressed={shelf === k} onClick={() => setShelf(k)}>{ico}<span>{label}</span><small>{n}</small></button>
        ))}
        <p className="aw-k">Folders</p>
        {!folders.length && <p className="aw-none">Make a folder, then drag walls onto it (or use a wall's ⋯ menu).</p>}
        {folders.map(f => (
          <button key={f} className={`aw-row${dropOn === f ? " drop" : ""}`} aria-pressed={shelf === `folder:${f}`} onClick={() => setShelf(`folder:${f}`)}
            onDragOver={e => { if (e.dataTransfer.types.includes("text/x-wall")) { e.preventDefault(); setDropOn(f) } }} onDragLeave={() => setDropOn(null)}
            onDrop={e => { e.preventDefault(); setDropOn(null); const id = e.dataTransfer.getData("text/x-wall"); if (id) { save(id, { folder: f }); setToast(`Moved to ${f}.`) } }}>
            <i className="aw-fdot" aria-hidden="true" /><span>{f}</span><small>{all.filter(w => w.folder === f).length}</small>
          </button>
        ))}
        {naming !== null
          ? <input className="aw-fin" autoFocus maxLength={60} placeholder="Folder name" aria-label="New folder name" onBlur={e => addFolder(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addFolder((e.target as HTMLInputElement).value); else if (e.key === "Escape") setNaming(null) }} />
          : <button className="aw-row add" onClick={() => setNaming("")}><FolderPlus size={15} /><span>New folder</span></button>}
        <p className="aw-foot">{walls === null ? "" : `${all.length} wall${all.length === 1 ? "" : "s"} · ${[...cards.values()].reduce((s, c) => s + c.notes, 0)} notes`}</p>
      </aside>
      <main className="aw-main">
        <h1 className="sr-only">All walls</h1>
        {failed && <div className="aw-failed" role="alert"><b>Your walls didn't load.</b><span>Nothing is lost.</span><button className="aw-btn" onClick={() => setTries(t => t + 1)}>Try again</button></div>}
        {walls === null && <p className="aw-none" style={{ margin: 30 }}><Loader2 size={15} className="aw-spin" /> Loading your walls…</p>}
        {fresh && main && (
          <section className="aw-hero" aria-label="Your first wall">
            <button className="aw-hero-pv" onClick={() => navigate(`/braindump/w/${main.id}`)} aria-label="Open My ideas"><MiniWall look={main.look} card={cards.get(main.id)} /><b className="aw-hero-banner">{main.title}</b></button>
            <div className="aw-hero-t">
              <p className="aw-k lime">Your first wall is ready</p>
              <h2>One wall, three ways to see it</h2>
              <p>Pin ideas anywhere, sort them into columns, or grow them into a tree. Any note can open into a wall of its own.</p>
              <div className="aw-hero-acts"><button className="aw-btn lime big" onClick={() => navigate(`/braindump/w/${main.id}`)}>Open {main.title} <ArrowRight size={16} /></button></div>
            </div>
          </section>
        )}
        {fresh && (
          <div className="aw-ways">
            {[["Wall", "Pin anything anywhere"], ["Columns", "Sort into frames"], ["Tree", "Grow ideas step by step"], ["Walls inside walls", "A note can open into a wall"]].map(([t, d], i) => (
              <div key={t} className="aw-way"><div className={`aw-way-pic w${i}`} aria-hidden="true"><i /><i /><i /><i /><i /></div><b>{t}</b><span>{d}</span></div>
            ))}
          </div>
        )}
        {fresh && <>
          <div className="aw-h"><h2>Or start from a ready wall</h2><span>Each one opens in the view it suits best</span></div>
          <div className="aw-grid">
            {STARTERS.map(s => (
              <button key={s.id} className="aw-starter" onClick={() => startFrom(s)} disabled={!!busy}>
                <div className={`aw-st-pic ${s.id}`} aria-hidden="true">{s.frames.map(f => <span key={f.t}><u>{f.t}</u>{f.notes.slice(0, 2).map((n, j) => <i key={j} style={{ background: hexOf((["yellow", "peach", "aqua", "pink", "lime"] as const)[j % 5]) }} />)}</span>)}</div>
                <b>{busy === s.id ? <><Loader2 size={14} className="aw-spin" /> Setting it up…</> : s.title}</b><span>{s.note}</span><em>{s.view === "wall" ? "Wall" : s.view === "columns" ? "Columns" : "Tree"}</em>
              </button>
            ))}
          </div>
        </>}
        {!fresh && walls !== null && <>
          {pinned.length > 0 && <><div className="aw-h"><h2>Pinned</h2><span>{pinned.length}</span></div><div className="aw-grid">{pinned.map(card)}</div></>}
          <div className="aw-h"><h2>{shelf === "all" ? (pinned.length ? "Everything" : "All walls") : shelf === "pinned" ? "Pinned" : shelf === "recent" ? "Recent" : shelf.slice(7)}</h2><span>{shown.length} wall{shown.length === 1 ? "" : "s"}</span></div>
          {shown.length ? <div className="aw-grid">{shown.filter(w => shelf !== "all" || !w.pinned).map(card)}</div> : <p className="aw-none">{shelf === "pinned" ? "Pin a wall from its ⋯ menu to keep it at the top." : shelf.startsWith("folder:") ? "Drag a wall onto this folder, or make a new one while it's open." : "Nothing here yet."}</p>}
        </>}
      </main>

      {menu && mWall && (
        <Popover x={Math.max(8, menu.x)} y={menu.y} label={`${mWall.title} menu`} onClose={() => setMenu(null)}>
          {menu.sub === "folder" ? <>
            <p>Move to folder</p>
            {folders.map(f => <button key={f} className="aw-row" aria-pressed={mWall.folder === f} onClick={() => { save(mWall.id, { folder: f }); setMenu(null) }}><i className="aw-fdot" /><span>{f}</span></button>)}
            {mWall.folder && <button className="aw-row" onClick={() => { save(mWall.id, { folder: null }); setMenu(null) }}><X size={14} /><span>Out of {mWall.folder}</span></button>}
            <button className="aw-row add" onClick={() => { setMenu(null); setNaming("") }}><FolderPlus size={14} /><span>New folder…</span></button>
          </> : menu.sub === "delete" ? <>
            <p>Delete “{mWall.title}”?</p>
            <div className="aw-warn">Its {cards.get(mWall.id)?.notes ?? 0} notes{(cards.get(mWall.id)?.inside ?? 0) ? " and the walls inside it" : ""} go too. This can't be undone.</div>
            <button className="aw-row del" onClick={() => remove(mWall)}><Trash2 size={14} /><span>Delete wall</span></button>
            <button className="aw-row" onClick={() => setMenu({ ...menu, sub: undefined })}><span>Keep it</span></button>
          </> : <>
            <button className="aw-row" onClick={() => navigate(`/braindump/w/${mWall.id}`)}><Layers size={14} /><span>Open</span></button>
            <button className="aw-row" onClick={() => { setRenaming(mWall.id); setMenu(null) }}><Type size={14} /><span>Rename</span></button>
            <button className="aw-row" onClick={() => { save(mWall.id, { pinned: !mWall.pinned }); setMenu(null) }}><Pin size={14} /><span>{mWall.pinned ? "Unpin" : "Pin to the top"}</span></button>
            <button className="aw-row" onClick={() => setMenu({ ...menu, sub: "folder" })}><FolderPlus size={14} /><span>Move to folder…</span></button>
            {!mWall.main && <button className="aw-row del" onClick={() => setMenu({ ...menu, sub: "delete" })}><Trash2 size={14} /><span>Delete…</span></button>}
          </>}
        </Popover>
      )}
      <div className="aw-live" aria-live="polite">{toast && <div className="aw-toast">{toast}</div>}</div>
    </div>
  )
}
