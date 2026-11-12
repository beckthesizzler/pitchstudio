import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, Folder, FolderOpen, FolderPlus, Images, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { supabase } from "../lib/supabase"
import { SHOT_BUCKET, newId, readAnalysis, type Shot } from "./model"
import { Marks } from "./Marks"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_1, SURFACE_2, DS_BORDER, DS_ERROR, ACCENT_SOLID, ACCENT_TEXT } from "../theme"

/* The Library: every shot you've kept, with its drawings, in folders (and folders inside folders).
   Drag a shot from the strip onto a folder to keep it there; drag a kept shot onto the strip (or press Use) to work on it.
   A kept shot is its own copy, so deleting an analysis never deletes it, and the other way round. */

export type LibFolder = { id: string; parent_id: string | null; name: string; created_at?: string }
export type LibShot = { id: string; folder_id: string | null; path: string; w: number; h: number; dim: number; items: unknown; title: string; created_at: string }
export const DRAG_SHOT = "application/x-ps-shot" // a shot from the strip
export const DRAG_LIB = "application/x-ps-libshot" // a kept shot from the Library
const MAX_DEPTH = 3

/** Keeps a shot (picture and drawings) in the Library */
export async function keepShot(userId: string, shot: Shot, folderId: string | null, title: string): Promise<LibShot> {
  if (!shot.path) throw new Error("not uploaded")
  const id = newId(), path = `${userId}/library/${id}.jpg`
  const { error: e1 } = await supabase.storage.from(SHOT_BUCKET).copy(shot.path, path)
  if (e1) throw e1
  const row = { id, folder_id: folderId, path, w: shot.w, h: shot.h, dim: shot.dim, items: shot.items, title: title.slice(0, 80) }
  const { data, error } = await (supabase as any).from("library_shots").insert(row).select("id, folder_id, path, w, h, dim, items, title, created_at").single()
  if (error) { supabase.storage.from(SHOT_BUCKET).remove([path]).catch(() => {}); throw error }
  return data as LibShot
}
/** A kept shot, copied into an analysis to work on */
export async function copyKept(userId: string, analysisId: string, k: LibShot): Promise<Shot> {
  const id = newId(), path = `${userId}/${analysisId}/${id}.jpg`
  const { error } = await supabase.storage.from(SHOT_BUCKET).copy(k.path, path)
  if (error) throw error
  const s = readAnalysis({ shots: [{ id, path, w: k.w, h: k.h, dim: k.dim, items: k.items }] }, userId).shots[0]
  if (!s) throw new Error("unreadable")
  return s
}

export function Library({ userId, getShot, onUse, say, onKept }: {
  userId: string; getShot: (id: string) => Shot | null; onUse: (k: LibShot) => void; say: (t: string) => void; onKept: (list: LibShot[]) => void
}) {
  const [folders, setFolders] = useState<LibFolder[] | null>(null)
  const [kept, setKept] = useState<LibShot[]>([])
  const [at, setAt] = useState<string | null>(null) // the folder open (null: all shots)
  const [openSet, setOpenSet] = useState<Set<string>>(new Set())
  const [naming, setNaming] = useState<{ id: string | null; parent: string | null; name: string } | null>(null)
  const [over, setOver] = useState<string | null | undefined>(undefined) // the folder a drag is over ("" = All shots)
  const [busy, setBusy] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let off = false
    Promise.all([
      (supabase as any).from("library_folders").select("id, parent_id, name, created_at").eq("user_id", userId).order("created_at", { ascending: true }),
      (supabase as any).from("library_shots").select("id, folder_id, path, w, h, dim, items, title, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000),
    ]).then(([f, s]) => {
      if (off) return
      setFolders(f.error ? [] : f.data ?? [])
      setKept(s.error ? [] : s.data ?? [])
    })
    return () => { off = true }
  }, [userId])
  useEffect(() => { onKept(kept) }, [kept]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (naming) { nameRef.current?.focus(); nameRef.current?.select() } }, [naming?.id, naming?.parent]) // eslint-disable-line react-hooks/exhaustive-deps

  const kids = (pid: string | null) => (folders ?? []).filter(f => f.parent_id === pid).sort((a, b) => a.name.localeCompare(b.name))
  const depthOf = (id: string | null): number => { let d = 0, f = (folders ?? []).find(x => x.id === id); while (f) { d++; f = (folders ?? []).find(x => x.id === f!.parent_id) } return d }
  const under = (id: string): Set<string> => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const f of folders ?? []) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true } } return out }
  const count = (id: string | null) => (id === null ? kept.length : kept.filter(k => k.folder_id && under(id).has(k.folder_id)).length)
  const shown = useMemo(() => (at === null ? kept : kept.filter(k => k.folder_id === at)), [kept, at])
  const drawn = useMemo(() => new Map(kept.map(k => [k.id, readAnalysis({ shots: [{ id: k.id, path: `${userId}/x`, w: k.w, h: k.h, items: k.items }] }, userId).shots[0]?.items ?? []])), [kept, userId])

  // pictures for the kept shots on show (links that last an hour)
  useEffect(() => {
    const need = shown.map(k => k.path).filter(p => !urls[p]).slice(0, 100)
    if (!need.length) return
    supabase.storage.from(SHOT_BUCKET).createSignedUrls(need, 3600).then(({ data }) => {
      const add: Record<string, string> = {}
      for (const d of data ?? []) if (d.signedUrl && d.path) add[d.path] = d.signedUrl
      setUrls(u => ({ ...u, ...add }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  const saveName = async () => {
    if (!naming) return
    const name = naming.name.trim().slice(0, 60)
    const n = naming
    setNaming(null)
    if (!name) return
    if (n.id) {
      const { error } = await (supabase as any).from("library_folders").update({ name }).eq("id", n.id)
      if (error) { say("Couldn't rename it. Try again."); return }
      setFolders(fs => (fs ?? []).map(f => (f.id === n.id ? { ...f, name } : f)))
    } else {
      const id = newId()
      const { error } = await (supabase as any).from("library_folders").insert({ id, parent_id: n.parent, name })
      if (error) { say(/limit/.test(error.message || "") ? "You've reached 500 folders." : "Couldn't make the folder. Try again."); return }
      setFolders(fs => [...(fs ?? []), { id, parent_id: n.parent, name }])
      if (n.parent) setOpenSet(s => new Set(s).add(n.parent!))
      setAt(id)
    }
  }
  const removeFolder = async (f: LibFolder) => {
    setConfirm(null)
    const gone = under(f.id)
    const { error } = await (supabase as any).from("library_folders").delete().eq("id", f.id)
    if (error) { say("Couldn't delete the folder. Try again."); return }
    setFolders(fs => (fs ?? []).filter(x => !gone.has(x.id)))
    setKept(ks => ks.map(k => (k.folder_id && gone.has(k.folder_id) ? { ...k, folder_id: null } : k)))
    if (at && gone.has(at)) setAt(null)
  }
  const removeKept = async (k: LibShot) => {
    setConfirm(null)
    const { error } = await (supabase as any).from("library_shots").delete().eq("id", k.id)
    if (error) { say("Couldn't delete it. Try again."); return }
    supabase.storage.from(SHOT_BUCKET).remove([k.path]).catch(() => {})
    setKept(ks => ks.filter(x => x.id !== k.id))
  }
  // a drop on a folder: a shot from the strip is kept there; a kept shot moves there
  const drop = async (e: React.DragEvent, folder: string | null) => {
    e.preventDefault(); setOver(undefined)
    const fromStrip = e.dataTransfer.getData(DRAG_SHOT), fromLib = e.dataTransfer.getData(DRAG_LIB)
    if (fromLib) {
      const k = kept.find(x => x.id === fromLib)
      if (!k || k.folder_id === folder) return
      const { error } = await (supabase as any).from("library_shots").update({ folder_id: folder }).eq("id", k.id)
      if (error) { say("Couldn't move it. Try again."); return }
      setKept(ks => ks.map(x => (x.id === k.id ? { ...x, folder_id: folder } : x)))
      return
    }
    if (!fromStrip) return
    const s = getShot(fromStrip)
    if (!s) return
    if (!s.path) { say("That shot is still uploading. Try again in a moment."); return }
    setBusy(b => b + 1)
    try {
      const fname = folder ? (folders ?? []).find(f => f.id === folder)?.name ?? "" : ""
      const k = await keepShot(userId, s, folder, fname)
      setKept(ks => [k, ...ks])
      say(folder ? `Kept in ${fname}.` : "Kept in your Library.")
      ;(window as any).posthog?.capture("library_shot_kept")
    } catch (err) {
      say(/limit/.test((err as Error)?.message || "") ? "Your Library is full (5,000 shots)." : "Couldn't keep it. Try again.")
    } finally { setBusy(b => b - 1) }
  }
  const dropProps = (folder: string | null) => ({
    onDragOver: (e: React.DragEvent) => { const t = [...e.dataTransfer.types]; if (t.includes(DRAG_SHOT) || t.includes(DRAG_LIB)) { e.preventDefault(); e.stopPropagation(); setOver(folder ?? "") } },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(undefined) },
    onDrop: (e: React.DragEvent) => { e.stopPropagation(); drop(e, folder) },
  })

  const row = (f: LibFolder | null, depth: number) => {
    const id = f?.id ?? null, open = id ? openSet.has(id) : true, sub = kids(id)
    const on = at === id, hot = over === (id ?? "")
    if (f && naming?.id === f.id) return <div key={f.id} style={{ paddingLeft: 10 + depth * 14 }}>{nameBox()}</div>
    return (
      <div key={id ?? "all"}>
        <div className={`lb-row${on ? " on" : ""}${hot ? " hot" : ""}`} style={{ paddingLeft: 8 + depth * 14 }} role="treeitem" aria-selected={on} aria-expanded={f && sub.length ? open : undefined}
          onClick={() => setAt(id)} {...dropProps(id)}>
          {f && sub.length ? (
            <button className="lb-tw" aria-label={open ? "Close folder" : "Open folder"} onClick={e => { e.stopPropagation(); setOpenSet(s => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n }) }}>
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : <span className="lb-tw" />}
          {f ? (on ? <FolderOpen size={15} /> : <Folder size={15} />) : <Images size={15} />}
          <span className="lb-name">{f ? f.name : "All shots"}</span>
          <span className="lb-n">{count(id)}</span>
          {f && (
            <span className="lb-acts" onClick={e => e.stopPropagation()}>
              {depthOf(f.id) < MAX_DEPTH && <button aria-label={`New folder inside ${f.name}`} title="New folder inside" onClick={() => { setOpenSet(o => new Set(o).add(f.id)); setNaming({ id: null, parent: f.id, name: "New folder" }) }}><Plus size={13} /></button>}
              <button aria-label={`Rename ${f.name}`} title="Rename" onClick={() => setNaming({ id: f.id, parent: f.parent_id, name: f.name })}><Pencil size={12} /></button>
              <button aria-label={`Delete ${f.name}`} title="Delete" onClick={() => setConfirm("f" + f.id)}><Trash2 size={12} /></button>
            </span>
          )}
        </div>
        {f && confirm === "f" + f.id && (
          <div className="lb-confirm" style={{ marginLeft: 8 + depth * 14 }}>
            Delete “{f.name}”{sub.length ? " and the folders in it" : ""}? Its shots stay in All shots.
            <div><button className="danger" onClick={() => removeFolder(f)}>Delete</button><button onClick={() => setConfirm(null)}>Keep</button></div>
          </div>
        )}
        {(open || !f) && sub.map(c => row(c, depth + 1))}
        {naming && !naming.id && naming.parent === id && f && open && <div style={{ paddingLeft: 10 + (depth + 1) * 14 }}>{nameBox()}</div>}
      </div>
    )
  }
  const nameBox = () => (
    <input ref={nameRef} className="lb-inp" aria-label="Folder name" maxLength={60} value={naming?.name ?? ""}
      onChange={e => setNaming(n => n && { ...n, name: e.target.value })}
      onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setNaming(null) }} onBlur={saveName} />
  )

  const here = at === null ? "All shots" : (folders ?? []).find(f => f.id === at)?.name ?? ""
  return (
    <aside className="lb" aria-label="Library">
      <style>{`
        .lb { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; }
        .lb-head { display: flex; align-items: center; gap: 8px; padding: 14px 12px 8px 16px; }
        .lb-head h2 { margin: 0; font: 700 15px 'Inter', sans-serif; letter-spacing: -.01em; flex: 1; }
        .lb-icon { width: 30px; height: 30px; border-radius: 9px; border: none; background: transparent; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
        .lb-icon:hover { background: var(--ps-hover); color: ${TEXT_PRIMARY}; }
        .lb-tree { padding: 2px 8px 10px; overflow-y: auto; max-height: 42%; flex-shrink: 0; }
        .lb-row { position: relative; display: flex; align-items: center; gap: 7px; height: 32px; padding-right: 8px; border-radius: 9px; cursor: pointer; color: ${TEXT_MUTED}; font: 500 13px 'Inter', sans-serif; outline: 2px solid transparent; outline-offset: -2px; transition: background .14s, outline-color .14s; }
        .lb-row:hover { background: var(--ps-hover); color: ${TEXT_PRIMARY}; }
        .lb-row.on { background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font-weight: 600; }
        .lb-row.hot { outline-color: ${ACCENT_SOLID}; background: var(--ps-accent-soft); color: ${TEXT_PRIMARY}; }
        .lb-tw { width: 16px; height: 16px; display: grid; place-items: center; border: none; background: none; color: inherit; padding: 0; cursor: pointer; flex-shrink: 0; }
        .lb-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lb-n { font-size: 12px; color: ${TEXT_MUTED}; font-variant-numeric: tabular-nums; }
        .lb-acts { display: none; gap: 1px; position: absolute; right: 4px; background: inherit; border-radius: 7px; }
        .lb-row:hover .lb-acts { display: flex; } .lb-row:hover .lb-n { visibility: hidden; }
        .lb-acts button { width: 24px; height: 24px; border: none; border-radius: 6px; background: ${SURFACE_2}; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
        .lb-acts button:hover { color: ${TEXT_PRIMARY}; }
        .lb-inp { width: calc(100% - 8px); height: 30px; border-radius: 8px; border: 1px solid ${ACCENT_SOLID}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; padding: 0 9px; outline: none; margin: 1px 0; }
        .lb-confirm { font: 500 12px 'Inter', sans-serif; color: ${TEXT_MUTED}; background: ${SURFACE_2}; border-radius: 10px; padding: 9px 10px; margin: 3px 0 6px; line-height: 1.45; }
        .lb-confirm div { display: flex; gap: 6px; margin-top: 7px; }
        .lb-confirm button { border: none; border-radius: 7px; padding: 5px 10px; font: 600 12px 'Inter', sans-serif; cursor: pointer; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; }
        .lb-confirm button.danger { background: ${DS_ERROR}; color: #fff; }
        .lb-sub { display: flex; align-items: center; gap: 8px; padding: 10px 16px 8px; border-top: 1px solid ${DS_BORDER}; font: 600 12px 'Inter', sans-serif; color: ${TEXT_MUTED}; }
        .lb-grid { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 12px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-content: start; }
        .lb-card { position: relative; aspect-ratio: 16 / 10; border-radius: 10px; overflow: hidden; background: #0f1013; cursor: grab; box-shadow: 0 0 0 1px ${DS_BORDER}; transition: transform .16s cubic-bezier(.2,.8,.2,1), box-shadow .16s; }
        .lb-card:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px ${DS_BORDER}, 0 8px 18px -8px rgba(0,0,0,.6); }
        .lb-card svg { width: 100%; height: 100%; display: block; }
        .lb-card .lb-use { position: absolute; left: 6px; bottom: 6px; border: none; border-radius: 999px; padding: 4px 10px; font: 700 12px 'Inter', sans-serif; background: ${ACCENT_SOLID}; color: #0a0c0f; cursor: pointer; opacity: 0; transition: opacity .14s; }
        .lb-card .lb-del { position: absolute; right: 6px; top: 6px; width: 24px; height: 24px; border: none; border-radius: 7px; background: rgba(0,0,0,.66); color: #fff; display: grid; place-items: center; cursor: pointer; opacity: 0; transition: opacity .14s; }
        .lb-card:hover .lb-use, .lb-card:hover .lb-del, .lb-card:focus-within .lb-use, .lb-card:focus-within .lb-del { opacity: 1; }
        .lb-empty { grid-column: 1 / -1; border: 1.5px dashed ${DS_BORDER}; border-radius: 12px; padding: 18px 14px; text-align: center; font: 500 12.5px 'Inter', sans-serif; color: ${TEXT_MUTED}; line-height: 1.5; }
        .lb-empty.hot { border-color: ${ACCENT_SOLID}; color: ${TEXT_PRIMARY}; background: var(--ps-accent-soft); }
        @media (pointer: coarse) { .lb-acts { display: flex; } .lb-row .lb-n { visibility: hidden; } .lb-card .lb-use, .lb-card .lb-del { opacity: 1; } }
      `}</style>
      <div className="lb-head">
        <h2>Library</h2>
        {busy > 0 && <Loader2 size={15} className="an-spin" style={{ color: TEXT_MUTED }} aria-label="Keeping" />}
        <button className="lb-icon" aria-label="New folder" title="New folder" onClick={() => setNaming({ id: null, parent: null, name: "New folder" })}><FolderPlus size={17} /></button>
      </div>
      <div className="lb-tree" role="tree" aria-label="Folders">
        {folders === null ? <p style={{ font: "500 12.5px 'Inter', sans-serif", color: TEXT_MUTED, padding: "6px 8px" }}>Loading…</p> : <>
          {row(null, 0)}
          {naming && !naming.id && naming.parent === null && <div style={{ paddingLeft: 24 }}>{nameBox()}</div>}
        </>}
      </div>
      <div className="lb-sub"><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: TEXT_PRIMARY }}>{here}</span>{shown.length > 0 && <span>{shown.length}</span>}</div>
      <div className="lb-grid" {...dropProps(at)}>
        {shown.length === 0 && (
          <div className={`lb-empty${over === (at ?? "") ? " hot" : ""}`}>
            {kept.length === 0 ? <>Drag a shot from the strip onto a folder to keep it, drawings and all.<br /><span style={{ color: ACCENT_TEXT }}>Then use it in any analysis.</span></> : "Drag shots here to keep them in this folder."}
          </div>
        )}
        {shown.map(k => (
          <div key={k.id} className="lb-card" draggable tabIndex={0} aria-label={k.title || "Kept shot"}
            onDragStart={e => { e.dataTransfer.setData(DRAG_LIB, k.id); e.dataTransfer.effectAllowed = "copyMove" }}
            onKeyDown={e => { if (e.key === "Enter") onUse(k) }}>
            <svg viewBox={`0 0 ${k.w} ${k.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
              {urls[k.path] && <image href={urls[k.path]} width={k.w} height={k.h} preserveAspectRatio="xMidYMid slice" />}
              {k.dim > 0 && <rect width={k.w} height={k.h} fill="#000" opacity={k.dim} />}
              <Marks items={drawn.get(k.id) ?? []} w={k.w} h={k.h} />
            </svg>
            <button className="lb-use" onClick={() => onUse(k)}>Use</button>
            <button className="lb-del" aria-label="Delete from the Library" onClick={() => setConfirm("k" + k.id)}><Trash2 size={12} /></button>
            {confirm === "k" + k.id && (
              <div className="an-confirm" onClick={e => e.stopPropagation()}>
                Delete from the Library?
                <div><button style={{ background: "#f85149", color: "#fff" }} onClick={() => removeKept(k)}>Delete</button><button onClick={() => setConfirm(null)}>Keep</button></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
}
