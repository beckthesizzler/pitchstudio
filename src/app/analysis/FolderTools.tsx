import { useEffect, useState } from "react"
import { Check, Copy, Download, ExternalLink, Film, Link2, Loader2, X } from "lucide-react"
import { canvasBlob, postText, renderSaved, stampNumber, type Seal } from "./batch"
import { EMPTY_MATCH, loadItem, matchLine, type Folder, type ItemRow, type Match } from "./items"
import { readNotes } from "./model"
import { shareFolder, shareUrl, stopSharing } from "./share"
import { zipFiles } from "../lib/zip"
import { TEXT_MUTED } from "../theme"

/* The three tools on a folder's own page: its match, a thread of the whole folder, and its share link. */

const Dialog = ({ label, width = 520, onClose, children }: { label: string; width?: number; onClose: () => void; children: React.ReactNode }) => (
  <div className="la-keys" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div role="dialog" aria-label={label} style={{ width, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100vh - 60px)", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}><h3 style={{ margin: 0 }}>{label}</h3><button className="an-x" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
      {children}
    </div>
  </div>
)
const fieldCss: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: TEXT_MUTED, minWidth: 0 }

/* ── match ── */
export function MatchDialog({ match, count, onSave, onClose }: { match: Match | null; count: number; onSave: (m: Match | null) => Promise<void>; onClose: () => void }) {
  const [m, setM] = useState<Match>(match ?? EMPTY_MATCH)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Match) => (e: React.ChangeEvent<HTMLInputElement>) => setM({ ...m, [k]: e.target.value })
  const team = (k: "home" | "away", c: "homeColor" | "awayColor", ph: string) => (
    <label style={fieldCss}>{k === "home" ? "Team 1 · the one you're analysing" : "Team 2"}
      <span style={{ display: "flex", gap: 8 }}>
        <input type="color" value={m[c]} onChange={set(c)} aria-label={`${k === "home" ? "Team 1" : "Team 2"} colour`} style={{ width: 42, height: 40, padding: 2, border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, background: "none" }} />
        <input className="an-inp" value={m[k]} onChange={set(k)} maxLength={30} placeholder={ph} style={{ flex: 1 }} />
      </span>
    </label>
  )
  const save = async (v: Match | null) => { setBusy(true); try { await onSave(v); onClose() } finally { setBusy(false) } }
  return (
    <Dialog label="Match details" onClose={onClose}>
      <p style={{ color: "#c9ccd2", fontSize: 13.5, lineHeight: 1.5, margin: "4px 0 14px" }}>Set once for the folder. Every Game Shot and Game Film in it takes the teams, their colours, and this line above the headline.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {team("home", "homeColor", "Barça")}{team("away", "awayColor", "Madrid")}
        <label style={fieldCss}>Competition<input className="an-inp" value={m.comp} onChange={set("comp")} maxLength={40} placeholder="LaLiga" /></label>
        <label style={fieldCss}>Date<input className="an-inp" value={m.date} onChange={set("date")} maxLength={30} placeholder="26 Oct" /></label>
        <label style={fieldCss}>Score<input className="an-inp" value={m.score} onChange={set("score")} maxLength={12} placeholder="2-1" /></label>
      </div>
      <div style={{ margin: "14px 0 0", padding: "10px 12px", borderRadius: 8, background: "rgba(215,255,60,.08)", border: "1px solid rgba(215,255,60,.22)", fontSize: 13 }}>
        <span style={{ color: TEXT_MUTED }}>Above each headline: </span><b style={{ color: "#d7ff3c", letterSpacing: ".08em", textTransform: "uppercase", fontSize: 12 }}>{matchLine(m) || "—"}</b>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        {match && <button className="an-btn" style={{ marginRight: "auto" }} disabled={busy} onClick={() => save(null)}>Clear</button>}
        <button className="an-btn" onClick={onClose}>Cancel</button>
        <button className="an-btn pri" disabled={busy} onClick={() => save(m)}>{busy ? <Loader2 size={15} className="an-spin" /> : <Check size={15} />} Save{count ? ` for ${count}` : ""}</button>
      </div>
    </Dialog>
  )
}

/* ── a thread of the whole folder ── */
type Post = { id: string; kind: "shot" | "video"; title: string; head: string; body: string }
const FORMATS = [["16:9", "X"], ["4:5", "Instagram"], ["1:1", "Square"]] as const

export function ThreadDialog({ userId, folder, items, urls, seal, onClose }: { userId: string; folder: Folder; items: ItemRow[]; urls: Record<string, string>; seal: Seal; onClose: () => void }) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [format, setFormat] = useState<"16:9" | "4:5" | "1:1">("16:9")
  const [notesIn, setNotesIn] = useState(false)
  const [numbers, setNumbers] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)
  const line = matchLine(folder.match)
  useEffect(() => {
    let off = false
    Promise.all(items.map(async i => {
      const r = await loadItem(i.id, userId).catch(() => null)
      const n = readNotes(r?.data?.notes)
      return { id: i.id, kind: i.kind, title: i.title, head: n.head || i.title, body: n.body }
    })).then(p => { if (!off) setPosts(p) })
    return () => { off = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const total = posts?.length ?? items.length
  const textOf = (p: Post, k: number) => postText(k + 1, total, p.head || (k === 0 ? folder.name : ""), p.body) + (p.kind === "video" ? `\n[Attach the Game Film: ${p.title || p.head || "render it from its editor"}]` : "")
  const thread = (posts ?? []).map(textOf).join("\n\n———\n\n")
  const shots = items.filter(i => i.kind === "shot").length

  const make = async () => {
    if (!posts) return
    setErr("")
    const files: { name: string; data: Blob | string }[] = []
    try {
      let k = 0
      for (const p of posts) {
        k++
        if (p.kind !== "shot") continue
        setBusy(`Rendering ${k} of ${total}…`)
        const { canvas } = await renderSaved(userId, p.id, seal, { format, notes: notesIn }, 1920, line)
        if (numbers && total > 1) stampNumber(canvas, k, total)
        files.push({ name: `${String(k).padStart(2, "0")}.jpg`, data: await canvasBlob(canvas, "image/jpeg", 0.92) })
      }
      files.push({ name: "thread.txt", data: thread + "\n" })
      setBusy("Packing…")
      const zip = await zipFiles(files)
      const a = document.createElement("a")
      a.href = URL.createObjectURL(zip); a.download = `${folder.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 _.()-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Thread"} thread.zip`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 10000)
      ;(window as any).posthog?.capture("analysis_thread_rendered", { posts: total, format })
      setBusy(null)
      onClose()
    } catch (e) { console.error(e); setBusy(null); setErr("Couldn't render the thread. Check your connection and try again.") }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(thread); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setErr("Couldn't copy. Your browser blocked it.") } }

  return (
    <Dialog label="Render as a thread" width={640} onClose={onClose}>
      <p style={{ color: "#c9ccd2", fontSize: 13.5, lineHeight: 1.5, margin: "4px 0 12px" }}>Every Game Shot in this folder, in this order, as numbered pictures in one style, plus the text for each post from your notes. Drag Game Shots in the folder to change the order.</p>
      <div className="rn-row"><div><b>Format</b></div><div className="rn-seg" role="group" aria-label="Format">{FORMATS.map(([v, t]) => <button key={v} className={format === v ? "on" : ""} aria-pressed={format === v} onClick={() => setFormat(v)}>{t} · {v}</button>)}</div></div>
      <div className="rn-row"><div><b>Notes</b><small>Under each picture, or only in the post</small></div><div className="rn-seg" role="group" aria-label="Notes"><button className={!notesIn ? "on" : ""} onClick={() => setNotesIn(false)}>In the post</button><button className={notesIn ? "on" : ""} onClick={() => setNotesIn(true)}>On the picture too</button></div></div>
      <div className="rn-row"><div><b>Numbers</b><small>"2/5" in the corner</small></div><div className="rn-seg" role="group" aria-label="Numbers"><button className={numbers ? "on" : ""} onClick={() => setNumbers(true)}>On</button><button className={!numbers ? "on" : ""} onClick={() => setNumbers(false)}>Off</button></div></div>
      <ol className="lt-posts">
        {(posts ?? items.map(i => ({ id: i.id, kind: i.kind, title: i.title, head: i.head ?? "", body: "" }))).map((p, k) => {
          const it = items.find(i => i.id === p.id), pic = it?.cover_path ? urls[it.cover_path] : undefined, t = posts ? textOf(p as Post, k) : "Loading…"
          return (
            <li key={p.id}>
              <span className="pic" style={pic ? { backgroundImage: `url(${pic})` } : undefined}>{p.kind === "video" && <Film size={16} />}<b>{k + 1}/{total}</b></span>
              <span className="txt">{p.kind === "video" && <em>Game Film · render it from its editor and attach it here</em>}<span>{t}</span>{posts && <small style={{ color: t.length > 270 ? "#ffb35c" : TEXT_MUTED }}>{t.length}/280</small>}</span>
            </li>
          )
        })}
      </ol>
      {err && <p role="alert" style={{ color: "#ff8fa3", fontSize: 13 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", marginTop: 14 }}>
        {busy && <span style={{ color: "#d7ff3c", fontSize: 13, marginRight: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}><Loader2 size={14} className="an-spin" /> {busy}</span>}
        <button className="an-btn" onClick={copy} disabled={!posts}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy the text"}</button>
        <button className="an-btn pri" onClick={make} disabled={!posts || !!busy || !shots}><Download size={15} /> Render {shots} {shots === 1 ? "picture" : "pictures"}</button>
      </div>
    </Dialog>
  )
}

/* ── the share link ── */
export function ShareDialog({ userId, folder, items, seal, onClose, onChange }: { userId: string; folder: Folder; items: ItemRow[]; seal: Seal; onClose: () => void; onChange: (shared: boolean) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState("")
  const [copied, setCopied] = useState(false)
  const shots = items.filter(i => i.kind === "shot").length, films = items.length - shots
  const link = shareUrl(folder.id)
  const go = async () => {
    setErr("")
    try {
      await shareFolder(userId, folder, items, seal, (d, t) => setBusy(d < t ? `Rendering ${d + 1} of ${t}…` : "Publishing…"))
      ;(window as any).posthog?.capture("analysis_folder_shared", { shots })
      onChange(true); setBusy(null)
    } catch (e) { console.error(e); setBusy(null); setErr("Couldn't share it. Check your connection and try again.") }
  }
  const stop = async () => { setBusy("Stopping…"); try { await stopSharing(folder); onChange(false) } catch { setErr("Couldn't stop sharing. Try again.") } finally { setBusy(null) } }
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { setErr("Couldn't copy. Select the link and copy it.") } }
  return (
    <Dialog label={folder.is_public ? "Shared" : "Share this folder"} onClose={onClose}>
      <p style={{ color: "#c9ccd2", fontSize: 13.5, lineHeight: 1.5, margin: "4px 0 14px" }}>
        Anyone with the link sees your {shots} rendered {shots === 1 ? "Game Shot" : "Game Shots"} with your notes and your name, and can remix them into their own Library. {films > 0 && `Game Films stay private. `}Changed something? Update the link.
      </p>
      {folder.is_public && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="an-inp" readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label="Share link" style={{ flex: 1 }} />
          <button className="an-btn" onClick={copy}>{copied ? <Check size={15} /> : <Link2 size={15} />} {copied ? "Copied" : "Copy"}</button>
          <a className="an-btn" href={link} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open</a>
        </div>
      )}
      {err && <p role="alert" style={{ color: "#ff8fa3", fontSize: 13 }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {busy && <span style={{ color: "#d7ff3c", fontSize: 13, marginRight: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}><Loader2 size={14} className="an-spin" /> {busy}</span>}
        {folder.is_public && <button className="an-btn" disabled={!!busy} onClick={stop} style={{ color: "#ff8fa3" }}>Stop sharing</button>}
        <button className="an-btn pri" disabled={!!busy || !shots} onClick={go}><Link2 size={15} /> {folder.is_public ? "Update the link" : "Make the link"}</button>
      </div>
      {!shots && <p style={{ color: TEXT_MUTED, fontSize: 12.5, marginTop: 10 }}>Add a Game Shot to this folder first.</p>}
    </Dialog>
  )
}
