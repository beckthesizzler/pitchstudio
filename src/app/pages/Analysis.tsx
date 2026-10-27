import { useEffect, useRef, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router"
import { ChevronLeft, ChevronRight, Copy, Download, FolderOpen, ImagePlus, Loader2, Maximize, MousePointer2, MoveUpRight, Pentagon, Plus, Redo2, Slash, Tag as TagIcon, Trash2, Type, Undo2, X, Flashlight, ZoomIn, ZoomOut } from "lucide-react"
import { supabase } from "../lib/supabase"
import { stripHandleSuffix } from "../lib/account"
import { relTime } from "../lib/time"
import { Mark as PSMark } from "../brand/Mark"
import { CreatorSeal } from "../brand/Signature"
import { DEFAULT_BRAND, logoToDataUrl, readBrand, type Brand } from "../brand/brand"
import { Stage, START_DEFAULTS, type Defaults, type Tool } from "../analysis/Stage"
import { Inspector } from "../analysis/Inspector"
import { MAX_MARKS, MAX_SHOTS, downloadShot, exportFontCSS, moveMark, newId, prepareShot, readAnalysis, removeShots, unit, uploadShot, type Mark, type Shot } from "../analysis/model"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, DS_ERROR, ACCENT_SOLID, ACCENT_INK, ACCENT_SOFT, ACCENT_TEXT, SCRIM } from "../theme"

/* Live Game Analysis ("/analysis"): draw on up to 4 match shots (tags, spotlights, perspective zones, arrows, lines, text),
   saved to your account as you go, exported at full size with your seal, ready to post (an X post takes 4 pictures). */

const TOOLS: { id: Tool; name: string; key: string; icon: ReactNode }[] = [
  { id: "select", name: "Select", key: "V", icon: <MousePointer2 size={18} /> },
  { id: "tag", name: "Tag", key: "T", icon: <TagIcon size={18} /> },
  { id: "spot", name: "Spotlight", key: "S", icon: <Flashlight size={18} /> },
  { id: "zone", name: "Zone", key: "Z", icon: <Pentagon size={18} /> },
  { id: "arrow", name: "Arrow", key: "A", icon: <MoveUpRight size={18} /> },
  { id: "line", name: "Line", key: "L", icon: <Slash size={18} /> },
  { id: "text", name: "Text", key: "X", icon: <Type size={18} /> },
]
const HINTS: Record<Tool, string> = {
  select: "Click a mark to change it. Drag to move it.",
  tag: "Click a player's feet to tag them, then type the name.",
  spot: "Click a player's feet to put them in the spotlight.",
  zone: "Drag a box, then pull its corners onto the pitch lines. Or click 4 corners.",
  arrow: "Drag from where the move starts to where it ends. Pull the diamond to curve it.",
  line: "Drag from one player to another to link them.",
  text: "Click where your note should go, then type it.",
}
const BY_KEY: Record<string, Tool> = { v: "select", t: "tag", s: "spot", z: "zone", a: "arrow", l: "line", x: "text" }
type Row = { id: string; title: string; updated_at: string; data: unknown }

export default function AnalysisPage() {
  const navigate = useNavigate()
  const loc = useLocation()
  const openId = new URLSearchParams(loc.search).get("open")
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading")
  const [aid] = useState(() => openId ?? newId())
  const [title, setTitle] = useState("Untitled analysis")
  const [shots, setShotsState] = useState<Shot[]>([])
  const shotsRef = useRef<Shot[]>([])
  const titleRef = useRef(title)
  titleRef.current = title
  const [srcs, setSrcs] = useState<Record<string, string>>({}) // each shot's picture ("" = it couldn't be loaded)
  const [uploads, setUploads] = useState<Record<string, "up" | "fail">>({})
  const blobs = useRef(new Map<string, Blob>()) // pictures still to upload
  const [cur, setCur] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>("select")
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [toast, setToast] = useState("")
  const [list, setList] = useState<Row[] | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [handle, setHandle] = useState("")
  const [logo, setLogo] = useState<string | null>(null)
  const defaults = useRef<Defaults>(JSON.parse(JSON.stringify(START_DEFAULTS)))
  const stageRef = useRef<SVGSVGElement>(null)
  const textRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const savedJson = useRef("")
  const savedOnce = useRef(false)
  const saving = useRef(false), again = useRef(false)
  const [, force] = useState(0)

  const setShots = (next: Shot[]) => { shotsRef.current = next; setShotsState(next) }
  const applyShots = (fn: (s: Shot[]) => Shot[]) => setShots(fn(shotsRef.current))
  const say = (t: string) => setToast(t)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t) }, [toast])

  /* ── open: who you are, your seal, and the analysis in the address (if any) ── */
  useEffect(() => {
    let off = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const u = session?.user
      if (!u) { navigate("/", { replace: true }); return }
      setUser({ id: u.id, email: u.email ?? "" })
      supabase.from("profiles").select("handle, brand").eq("id", u.id).maybeSingle().then(({ data }) => {
        if (off) return
        const h: string = (data as any)?.handle || ""
        setHandle(h && stripHandleSuffix(h, u.id, u.email) === h ? h : "")
        setBrand(readBrand((data as any)?.brand))
      })
      if (!openId) { setPhase("ready"); return }
      const { data, error } = await supabase.from("analyses").select("id, title, data, updated_at").eq("id", openId).eq("user_id", u.id).maybeSingle()
      if (off) return
      if (error || !data) { setPhase("missing"); return }
      const a = readAnalysis((data as any).data, u.id)
      const t = (data as any).title || "Untitled analysis"
      setTitle(t); titleRef.current = t; setShots(a.shots)
      savedJson.current = payload(t, a.shots); savedOnce.current = true; setStatus("saved")
      setPhase("ready")
      for (const s of a.shots) downloadShot(s.path!).then(d => { if (!off) setSrcs(x => ({ ...x, [s.id]: d ?? "" })) })
    })
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    let off = false
    setLogo(null)
    if (brand.logo) logoToDataUrl(brand.logo).then(d => { if (!off) setLogo(d) })
    return () => { off = true }
  }, [brand.logo])

  /* ── saving: a moment after every change, only shots that finished uploading ── */
  function payload(t: string, s: Shot[]) {
    return JSON.stringify({ title: t.trim().slice(0, 80) || "Untitled analysis", data: { v: 1, shots: s.filter(x => x.path).map(x => ({ id: x.id, path: x.path, w: x.w, h: x.h, dim: x.dim, items: x.items })) } })
  }
  const save = async () => {
    if (!user) return
    if (saving.current) { again.current = true; return }
    const json = payload(titleRef.current, shotsRef.current)
    if (json === savedJson.current) { setStatus(Object.values(uploads).includes("fail") ? "error" : "saved"); return }
    saving.current = true; setStatus("saving")
    const p = JSON.parse(json)
    const { error } = await supabase.from("analyses").upsert({ id: aid, user_id: user.id, title: p.title, data: p.data, updated_at: new Date().toISOString() })
    saving.current = false
    if (error) { setStatus("error"); return }
    savedJson.current = json; savedOnce.current = true
    if (!window.location.search.includes(aid)) window.history.replaceState(null, "", `/analysis?open=${aid}`)
    if (again.current) { again.current = false; save(); return }
    setStatus(payload(titleRef.current, shotsRef.current) === json ? "saved" : "saving")
  }
  useEffect(() => {
    if (phase !== "ready" || !user) return
    const json = payload(title, shots)
    if (json === savedJson.current) return
    if (!savedOnce.current && !shots.some(s => s.path)) return // nothing worth saving yet
    setStatus("saving")
    const t = setTimeout(save, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, shots, phase, user])
  // Leaving while something is still on its way: the browser asks first
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status === "saving" || Object.keys(uploads).length) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [status, uploads])

  /* ── undo and redo (the marks and darkening of every shot) ── */
  const past = useRef<string[]>([]), future = useRef<string[]>([]), pending = useRef<string | null>(null)
  const snap = () => JSON.stringify(shotsRef.current.map(s => [s.id, s.dim, s.items]))
  const begin = () => { if (pending.current === null) pending.current = snap() }
  const end = () => {
    const p = pending.current
    pending.current = null
    if (p !== null && p !== snap()) { past.current.push(p); if (past.current.length > 150) past.current.shift(); future.current = []; force(n => n + 1) }
  }
  const restore = (j: string) => {
    const m = new Map((JSON.parse(j) as [string, number, Mark[]][]).map(a => [a[0], a]))
    applyShots(s => s.map(sh => { const a = m.get(sh.id); return a ? { ...sh, dim: a[1], items: a[2] } : sh }))
  }
  const undo = () => { end(); const prev = past.current.pop(); if (prev === undefined) return; future.current.push(snap()); restore(prev); setSel(null); force(n => n + 1) }
  const redo = () => { end(); const next = future.current.pop(); if (next === undefined) return; past.current.push(snap()); restore(next); setSel(null); force(n => n + 1) }

  /* ── the current shot and its marks ── */
  const shot: Shot | null = shots[cur] ?? null
  const selMark = shot && sel ? shot.items.find(m => m.id === sel) ?? null : null
  const applyItems = (fn: (items: Mark[]) => Mark[]) => applyShots(s => s.map((sh, i) => (i === cur ? { ...sh, items: fn(sh.items) } : sh)))
  const create = (m: Mark) => {
    if (!shot) return
    if (shot.items.length >= MAX_MARKS) { say(`A shot holds ${MAX_MARKS} marks.`); return }
    begin(); applyItems(items => [...items, m]); end(); setSel(m.id)
  }
  const kindKey = (m: Mark): keyof Defaults => (m.kind === "arrow" ? (m.head === "none" ? "line" : "arrow") : m.kind)
  const setMark = (patch: Partial<Mark>, live?: boolean) => {
    if (!selMark) return
    if (!live) begin()
    applyItems(items => items.map(x => (x.id === selMark.id ? ({ ...x, ...patch } as Mark) : x)))
    if (!live) end()
    // the next mark of this kind starts with the same look
    const d = defaults.current[kindKey(selMark)] as Record<string, unknown>
    for (const k of Object.keys(patch)) if (k in d) d[k] = (patch as Record<string, unknown>)[k]
  }
  const del = () => { if (!selMark) return; begin(); applyItems(items => items.filter(x => x.id !== selMark.id)); end(); setSel(null) }
  const dup = () => {
    if (!selMark || !shot) return
    const c = { ...moveMark(selMark, 24 * unit(shot.w), 24 * unit(shot.w)), id: newId() } as Mark
    create(c)
  }
  const restack = (front: boolean) => {
    if (!selMark) return
    begin(); applyItems(items => { const rest = items.filter(x => x.id !== selMark.id); return front ? [...rest, selMark] : [selMark, ...rest] }); end()
  }
  const setDim = (v: number) => applyShots(s => s.map((sh, i) => (i === cur ? { ...sh, dim: v } : sh)))
  // A new tag, zone label or note: its words open for typing as soon as the panel shows them
  const [focusReq, setFocusReq] = useState(0)
  const focusText = () => setFocusReq(n => n + 1)
  useEffect(() => { if (focusReq) { textRef.current?.focus(); textRef.current?.select() } }, [focusReq])
  const pickTool = (t: Tool) => { setTool(t); if (t !== "select") setSel(null) }

  /* ── shots: add (files, drop, paste), upload, move, delete ── */
  const upload = async (id: string, path: string) => {
    const blob = blobs.current.get(id)
    if (!blob) return
    setUploads(x => ({ ...x, [id]: "up" }))
    try {
      await uploadShot(path, blob)
      blobs.current.delete(id)
      setUploads(x => { const n = { ...x }; delete n[id]; return n })
      if (!shotsRef.current.some(s => s.id === id)) { removeShots([path]); return } // deleted while it uploaded
      applyShots(s => s.map(sh => (sh.id === id ? { ...sh, path } : sh)))
    } catch {
      setUploads(x => ({ ...x, [id]: "fail" })); setStatus("error")
    }
  }
  const addFiles = async (files: File[]) => {
    if (!user) return
    const imgs = files.filter(f => f.type.startsWith("image/"))
    if (!imgs.length) { say("That isn't a picture. Use a PNG, JPG or WebP screenshot."); return }
    const room = MAX_SHOTS - shotsRef.current.length
    if (room <= 0) { say("An analysis holds 4 shots. Start a new one for more."); return }
    if (imgs.length > room) say(`Added ${room} of ${imgs.length}: an analysis holds 4 shots.`)
    for (const f of imgs.slice(0, room)) {
      let prep
      try { prep = await prepareShot(f) } catch (e) { say((e as Error).message === "too big" ? "That picture is over 25 MB." : "That picture couldn't be opened. Try a PNG or JPG."); continue }
      if (shotsRef.current.length >= MAX_SHOTS) break
      const id = newId(), path = `${user.id}/${aid}/${id}.jpg`
      blobs.current.set(id, prep.blob)
      setSrcs(x => ({ ...x, [id]: prep.data }))
      applyShots(s => [...s, { id, path: null, w: prep.w, h: prep.h, dim: 0, items: [] }])
      setCur(shotsRef.current.length - 1); setSel(null); setZoom(1)
      ;(window as any).posthog?.capture("analysis_shot_added")
      upload(id, path)
    }
  }
  const retry = () => {
    if (!user) return
    for (const [id, st] of Object.entries(uploads)) if (st === "fail") upload(id, `${user.id}/${aid}/${id}.jpg`)
    save()
  }
  const deleteShot = (id: string) => {
    const s = shotsRef.current.find(x => x.id === id)
    if (!s) return
    const i = shotsRef.current.indexOf(s)
    applyShots(list => list.filter(x => x.id !== id))
    blobs.current.delete(id)
    setUploads(x => { const n = { ...x }; delete n[id]; return n })
    if (s.path) removeShots([s.path])
    setCur(c => Math.max(0, Math.min(c > i ? c - 1 : c, shotsRef.current.length - 1)))
    setSel(null); setConfirmDel(null)
  }
  const moveShot = (i: number, by: number) => {
    const j = i + by
    if (j < 0 || j >= shotsRef.current.length) return
    applyShots(s => { const n = [...s]; [n[i], n[j]] = [n[j], n[i]]; return n })
    setCur(j)
  }

  /* ── keys, paste and drop ── */
  useEffect(() => {
    const typing = (t: EventTarget | null) => { const e = t as HTMLElement | null; return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable) }
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return }
      if (listOpen) { if (e.key === "Escape") setListOpen(false); return }
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dup(); return }
      if (mod || e.altKey) return
      if (e.key === "Delete" || e.key === "Backspace") { if (selMark) { e.preventDefault(); del() } return }
      if (e.key === "Escape") { if (exportOpen) setExportOpen(false); else if (sel) setSel(null); else setTool("select"); return }
      if (e.key.startsWith("Arrow") && selMark && shot) {
        e.preventDefault()
        const st = (e.shiftKey ? 10 : 1) * 2 * unit(shot.w)
        const [dx, dy] = e.key === "ArrowLeft" ? [-st, 0] : e.key === "ArrowRight" ? [st, 0] : e.key === "ArrowUp" ? [0, -st] : [0, st]
        begin(); applyItems(items => items.map(x => (x.id === selMark.id ? moveMark(x, dx, dy) : x)))
        return
      }
      if (shot && (e.key === "+" || e.key === "=")) { setZoom(z => Math.min(6, z * 1.25)); return }
      if (shot && (e.key === "-" || e.key === "_")) { setZoom(z => Math.max(1, z / 1.25)); return }
      if (shot && e.key === "0") { setZoom(1); return }
      const t = BY_KEY[e.key.toLowerCase()]
      if (t && shot) { pickTool(t); return }
      if (/^[1-4]$/.test(e.key) && +e.key <= shotsRef.current.length) { setCur(+e.key - 1); setSel(null) }
    }
    const up = (e: KeyboardEvent) => { if (e.key.startsWith("Arrow")) end() }
    const paste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"))
      if (!files.length) return
      e.preventDefault(); addFiles(files)
    }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("paste", paste)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("paste", paste) }
  })

  // The export menu closes when you click anywhere else
  useEffect(() => {
    if (!exportOpen) return
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.("[data-export]")) setExportOpen(false) }
    window.addEventListener("pointerdown", away)
    return () => window.removeEventListener("pointerdown", away)
  }, [exportOpen])
  // A note left empty is removed when you move on, so no empty box is left on the shot
  const prevSel = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevSel.current
    prevSel.current = sel
    if (!prev || prev === sel) return
    const m = shotsRef.current.flatMap(s => s.items).find(x => x.id === prev)
    if (m && m.kind === "text" && !m.text.trim()) { begin(); applyShots(s => s.map(sh => ({ ...sh, items: sh.items.filter(x => x.id !== prev) }))); end() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  /* ── export: the shot at its full size, with your seal ── */
  const fileBase = (title.trim() || "Analysis").replace(/[^A-Za-z0-9 _.()-]+/g, "").trim().slice(0, 60) || "Analysis"
  const renderShot = async (type: "image/png" | "image/jpeg"): Promise<Blob> => {
    const svg = stageRef.current, s = shotsRef.current[curRef.current]
    if (!svg || !s) throw new Error("no shot")
    const css = await exportFontCSS()
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    clone.setAttribute("width", String(s.w)); clone.setAttribute("height", String(s.h)); clone.removeAttribute("style")
    if (css) { const st = document.createElementNS("http://www.w3.org/2000/svg", "style"); st.textContent = css; clone.insertBefore(st, clone.firstChild) }
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }))
    try {
      const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("draw")); i.src = url })
      const cv = document.createElement("canvas"); cv.width = s.w; cv.height = s.h
      const ctx = cv.getContext("2d")!
      if (type === "image/jpeg") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, s.w, s.h) }
      ctx.drawImage(img, 0, 0, s.w, s.h)
      const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, type, 0.92))
      if (!blob) throw new Error("draw")
      return blob
    } finally { URL.revokeObjectURL(url) }
  }
  const curRef = useRef(cur)
  curRef.current = cur
  const frames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60))))
  const save1 = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }
  const doExport = async (what: "png" | "jpg" | "all" | "copy") => {
    setExportOpen(false)
    if (!shot || busy) return
    const keep = cur, keepSel = sel
    setSel(null)
    try {
      if (what === "all") {
        const n = shotsRef.current.length
        for (let i = 0; i < n; i++) {
          setBusy(`Exporting ${i + 1} of ${n}…`); setCur(i); await frames(); await document.fonts?.ready
          if (!srcs[shotsRef.current[i].id]) { say(`Shot ${i + 1} isn't loaded yet, so it was skipped.`); continue }
          save1(await renderShot("image/png"), `${fileBase} ${i + 1}.png`)
        }
        setCur(keep)
      } else {
        if (!srcs[shot.id]) { say("This shot isn't loaded yet."); return }
        setBusy("Exporting…"); await frames()
        const blob = await renderShot(what === "jpg" ? "image/jpeg" : "image/png")
        const name = shotsRef.current.length > 1 ? `${fileBase} ${cur + 1}` : fileBase
        if (what === "copy") { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); say("Copied. Paste it into your post.") }
        else save1(blob, `${name}.${what}`)
      }
      ;(window as any).posthog?.capture("analysis_exported", { format: what, shots: shotsRef.current.length })
    } catch (e) {
      console.error(e); say(what === "copy" ? "Couldn't copy here. Download the PNG instead." : "Couldn't make the picture. Try again.")
    } finally { setBusy(""); setSel(keepSel) }
  }

  /* ── my analyses ── */
  const openList = async () => {
    setListOpen(true); setList(null)
    if (!user) return
    const { data, error } = await supabase.from("analyses").select("id, title, updated_at, data").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(60)
    setList(error ? [] : ((data as Row[] | null) ?? []))
  }
  const deleteAnalysis = async (r: Row) => {
    if (!user) return
    const { error } = await supabase.from("analyses").delete().eq("id", r.id).eq("user_id", user.id)
    if (error) { say("Couldn't delete it. Try again."); return }
    removeShots(readAnalysis(r.data, user.id).shots.map(s => s.path!).filter(Boolean))
    setList(l => (l ?? []).filter(x => x.id !== r.id)); setConfirmDel(null)
    if (r.id === aid) navigate("/analysis", { replace: true })
  }

  const U = shot ? unit(shot.w) : 1
  const sealNode = shot ? (
    <g transform={`translate(${shot.w - 8 * U},${shot.h - 8 * U}) scale(${1.25 * U})`} style={{ pointerEvents: "none" }}>
      <CreatorSeal brand={brand} handle={handle} logo={logo} pill="rgba(0,0,0,0.62)" />
    </g>
  ) : null
  const failed = Object.values(uploads).includes("fail")
  const upCount = Object.values(uploads).filter(v => v === "up").length

  if (phase === "loading") return <div className="an-page" style={{ minHeight: "100vh", background: SURFACE_BASE }} />

  return (
    <div className="an-page" onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
      onDrop={e => { e.preventDefault(); setDragOver(false); addFiles([...e.dataTransfer.files]) }}>
      <style>{`
        .an-page { height: 100vh; display: grid; grid-template-rows: 56px 1fr auto; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; overflow: hidden; }
        .an-page * { box-sizing: border-box; }
        .an-top { display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid ${DS_BORDER}; min-width: 0; }
        .an-home { background: none; border: none; padding: 4px; cursor: pointer; display: flex; border-radius: 8px; }
        .an-title { flex: 0 1 300px; min-width: 80px; height: 36px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: ${TEXT_PRIMARY}; font: 600 15px 'Inter', sans-serif; padding: 0 10px; }
        .an-title:hover { border-color: ${DS_BORDER}; } .an-title:focus { outline: none; border-color: ${ACCENT_SOLID}; background: ${SURFACE_1}; }
        .an-status { font-size: 12px; color: ${TEXT_MUTED}; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
        .an-status.bad { color: ${DS_ERROR}; }
        .an-status button { background: none; border: 1px solid ${DS_ERROR}; color: ${DS_ERROR}; border-radius: 999px; padding: 3px 10px; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .an-sp { flex: 1; }
        .an-icon { width: 36px; height: 36px; display: inline-grid; place-items: center; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; cursor: pointer; flex-shrink: 0; }
        .an-icon:disabled { opacity: .4; cursor: default; }
        .an-icon.bad { color: ${DS_ERROR}; }
        .an-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 13px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        .an-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
        .an-btn:disabled { opacity: .45; cursor: default; }
        .an-menu { position: absolute; right: 0; top: 42px; z-index: 30; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 12px; padding: 6px; min-width: 230px; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
        .an-menu button { display: flex; width: 100%; align-items: center; gap: 10px; background: none; border: none; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; padding: 9px 10px; border-radius: 8px; cursor: pointer; text-align: left; }
        .an-menu button:hover { background: ${SURFACE_2}; } .an-menu small { color: ${TEXT_MUTED}; margin-left: auto; }
        .an-body { display: grid; grid-template-columns: 78px 1fr 290px; min-height: 0; }
        .an-rail { border-right: 1px solid ${DS_BORDER}; padding: 10px 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
        .an-tool { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 2px 7px; border-radius: 10px; border: 1px solid transparent; background: none; color: ${TEXT_MUTED}; font: 600 11px 'Inter', sans-serif; cursor: pointer; position: relative; }
        .an-tool:hover { color: ${TEXT_PRIMARY}; background: ${SURFACE_1}; }
        .an-tool.on { color: ${ACCENT_INK}; background: ${ACCENT_SOLID}; }
        .an-tool kbd { position: absolute; top: 3px; right: 5px; font: 600 9px 'Inter', sans-serif; opacity: .6; }
        .an-tool:disabled { opacity: .35; cursor: default; }
        .an-mid { display: grid; grid-template-rows: 1fr auto; min-width: 0; min-height: 0; background: #101114; }
        .an-view { position: relative; min-width: 0; min-height: 0; display: flex; padding: 12px; }
        .an-wrap { position: relative; margin: auto; flex-shrink: 0; box-shadow: 0 10px 40px rgba(0,0,0,.45); } /* auto margins centre it, and still let a zoomed shot scroll to every edge */
        .an-hint { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); background: rgba(12,14,18,.82); color: #f5f5f7; font: 500 12.5px 'Inter', sans-serif; padding: 7px 12px; border-radius: 999px; pointer-events: none; white-space: nowrap; max-width: calc(100% - 20px); overflow: hidden; text-overflow: ellipsis; }
        .an-zoom { display: flex; align-items: center; gap: 6px; justify-content: flex-end; padding: 6px 12px; color: #c9ccd2; font: 500 12px 'Inter', sans-serif; }
        .an-zoom button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #f5f5f7; display: grid; place-items: center; cursor: pointer; }
        .an-empty { margin: auto; text-align: center; color: #c9ccd2; max-width: 460px; padding: 30px; border: 2px dashed rgba(255,255,255,.18); border-radius: 18px; }
        .an-empty.over, .an-page.over .an-empty { border-color: #d7ff3c; background: rgba(215,255,60,.06); }
        .an-empty h2 { color: #f5f5f7; font-size: 22px; margin: 14px 0 6px; letter-spacing: -.02em; }
        .an-empty p { font-size: 14px; line-height: 1.55; margin: 0 0 18px; }
        .an-empty small { display: block; margin-top: 16px; font-size: 12px; color: #8b8f98; }
        .an-insp { border-left: 1px solid ${DS_BORDER}; padding: 16px; overflow-y: auto; min-height: 0; }
        .an-cap { font-size: 11px; letter-spacing: .14em; font-weight: 700; color: ${TEXT_MUTED}; margin: 0 0 12px; }
        .an-row { display: flex; flex-direction: column; gap: 7px; margin-bottom: 15px; }
        .an-lab { font-size: 12px; color: ${TEXT_MUTED}; }
        .an-inp { width: 100%; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 10px; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; padding: 9px 11px; resize: vertical; }
        .an-inp:focus { outline: none; border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 3px ${ACCENT_SOFT}; }
        .an-cols { display: flex; flex-wrap: wrap; gap: 7px; }
        .an-sw { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(128,128,128,.4); cursor: pointer; padding: 0; }
        .an-sw.on { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .an-any { background: none; overflow: hidden; }
        .an-seg { display: inline-flex; background: ${SURFACE_2}; border-radius: 10px; padding: 3px; gap: 2px; flex-wrap: wrap; }
        .an-seg button { border: none; background: none; color: ${TEXT_MUTED}; font: 500 12.5px 'Inter', sans-serif; padding: 6px 11px; border-radius: 8px; cursor: pointer; }
        .an-seg button.on { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .an-slide { display: flex; align-items: center; gap: 10px; } .an-slide input { flex: 1; accent-color: ${ACCENT_TEXT}; } .an-slide span { font-size: 12px; color: ${TEXT_MUTED}; width: 38px; text-align: right; }
        .an-note { font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.5; margin: 0 0 12px; }
        .an-acts { display: flex; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid ${DS_BORDER}; }
        .an-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; font-size: 12px; color: ${TEXT_MUTED}; }
        .an-keys div { display: flex; align-items: center; gap: 6px; } .an-keys kbd { font: 600 10.5px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; border-radius: 5px; padding: 2px 5px; white-space: nowrap; }
        .an-steps { margin: 0; padding-left: 18px; color: ${TEXT_MUTED}; font-size: 13px; line-height: 1.9; }
        .an-strip { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-top: 1px solid ${DS_BORDER}; background: ${SURFACE_BASE}; overflow-x: auto; }
        .an-thumb { position: relative; width: 132px; height: 74px; border-radius: 9px; overflow: hidden; border: 2px solid transparent; cursor: pointer; flex-shrink: 0; background: #16181c; padding: 0; }
        .an-thumb.on { border-color: ${ACCENT_SOLID}; }
        .an-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .an-num { position: absolute; left: 5px; top: 5px; background: rgba(0,0,0,.72); color: #fff; font: 700 11px 'Inter', sans-serif; border-radius: 6px; padding: 2px 6px; }
        .an-over { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.55); color: #fff; font: 600 11px 'Inter', sans-serif; text-align: center; padding: 4px; }
        .an-tbtn { position: absolute; top: 4px; width: 22px; height: 22px; border-radius: 6px; border: none; background: rgba(0,0,0,.72); color: #fff; display: grid; place-items: center; cursor: pointer; padding: 0; }
        .an-add { width: 132px; height: 74px; border-radius: 9px; border: 1.5px dashed ${DS_BORDER_STRONG}; background: none; color: ${TEXT_MUTED}; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font: 600 12px 'Inter', sans-serif; cursor: pointer; flex-shrink: 0; }
        .an-strip-note { font-size: 12px; color: ${TEXT_MUTED}; margin-left: 6px; white-space: nowrap; }
        .an-confirm { position: absolute; inset: 0; background: rgba(0,0,0,.82); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #fff; font: 600 12px 'Inter', sans-serif; }
        .an-confirm div { display: flex; gap: 6px; } .an-confirm button { border: none; border-radius: 6px; padding: 4px 10px; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .an-scrim { position: fixed; inset: 0; background: ${SCRIM}; z-index: 50; display: grid; place-items: center; padding: 20px; }
        .an-modal { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 18px; width: min(560px, 100%); max-height: 80vh; display: flex; flex-direction: column; }
        .an-modal header { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid ${DS_BORDER}; font-weight: 700; }
        .an-list { overflow-y: auto; padding: 8px; }
        .an-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; }
        .an-item:hover { background: ${SURFACE_2}; }
        .an-item .t { font-weight: 600; font-size: 14px; } .an-item .d { font-size: 12px; color: ${TEXT_MUTED}; margin-top: 2px; }
        .an-toast { position: fixed; left: 50%; bottom: 110px; transform: translateX(-50%); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; font: 500 13px 'Inter', sans-serif; padding: 10px 16px; border-radius: 999px; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: calc(100vw - 32px); }
        .an-busy { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 55; display: grid; place-items: center; color: #fff; font: 600 14px 'Inter', sans-serif; }
        .an-spin { animation: anSpin 1s linear infinite; } @keyframes anSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .an-spin { animation: none; } }
        @media (max-width: 860px) {
          .an-page { height: auto; min-height: 100vh; overflow: visible; grid-template-rows: auto auto auto; }
          .an-top { flex-wrap: wrap; padding: 8px 12px; row-gap: 8px; }
          .an-title { flex: 1 1 160px; }
          .an-hide-sm { display: none; }
          .an-body { grid-template-columns: 1fr; }
          .an-rail { flex-direction: row; border-right: none; border-bottom: 1px solid ${DS_BORDER}; overflow-x: auto; padding: 6px 8px; }
          .an-tool { min-width: 62px; }
          .an-mid { height: 62vw; min-height: 240px; max-height: 70vh; }
          .an-insp { border-left: none; border-top: 1px solid ${DS_BORDER}; }
          .an-empty { padding: 18px; margin: 12px; } .an-empty h2 { font-size: 18px; }
          .an-hint { font-size: 11px; top: 6px; padding: 5px 10px; white-space: normal; text-align: center; width: max-content; max-width: 92%; }
          .an-keysbox { display: none; }
        }
      `}</style>

      <header className="an-top">
        <button className="an-home" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color={ACCENT_SOLID} /></button>
        <input className="an-title" aria-label="Analysis title" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} onBlur={() => { if (!title.trim()) setTitle("Untitled analysis") }} />
        <span className={`an-status${failed || status === "error" ? " bad" : ""}`} aria-live="polite">
          {failed || status === "error" ? <>Not saved <button onClick={retry}>Retry</button></>
            : upCount ? <><Loader2 size={13} className="an-spin" /> Uploading {upCount === 1 ? "shot" : `${upCount} shots`}…</>
              : status === "saving" ? "Saving…" : status === "saved" ? "Saved" : shots.length ? "" : "Not saved yet"}
        </span>
        <span className="an-sp" />
        <button className="an-icon" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl Z)"><Undo2 size={16} /></button>
        <button className="an-icon" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl Shift Z)"><Redo2 size={16} /></button>
        <button className="an-btn" onClick={openList}><FolderOpen size={15} /><span className="an-hide-sm">My analyses</span></button>
        <button className="an-btn" onClick={() => navigate("/analysis")} aria-label="New analysis"><Plus size={15} /><span className="an-hide-sm">New</span></button>
        <div style={{ position: "relative" }} data-export>
          <button className="an-btn pri" disabled={!shot || !!busy} onClick={() => setExportOpen(o => !o)} aria-expanded={exportOpen}><Download size={15} /> Export</button>
          {exportOpen && (
            <div className="an-menu" role="menu">
              <button role="menuitem" onClick={() => doExport("png")}>PNG<small>this shot, full size</small></button>
              <button role="menuitem" onClick={() => doExport("jpg")}>JPG<small>smaller file</small></button>
              {shots.length > 1 && <button role="menuitem" onClick={() => doExport("all")}>All {shots.length} shots<small>PNG, ready for one post</small></button>}
              <button role="menuitem" onClick={() => doExport("copy")}><Copy size={14} /> Copy image</button>
            </div>
          )}
        </div>
      </header>

      {phase === "missing" ? (
        <div style={{ display: "grid", placeItems: "center", textAlign: "center", padding: 30 }}>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>That analysis isn't here</h2>
            <p style={{ color: TEXT_MUTED, margin: "0 0 18px" }}>It may have been deleted, or it belongs to another account.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="an-btn pri" onClick={() => navigate("/analysis", { replace: true })}><Plus size={15} /> New analysis</button>
              <button className="an-btn" onClick={openList}><FolderOpen size={15} /> My analyses</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="an-body">
          <nav className="an-rail" aria-label="Tools">
            {TOOLS.map(t => (
              <button key={t.id} className={`an-tool${tool === t.id ? " on" : ""}`} aria-pressed={tool === t.id} disabled={!shot} title={`${t.name} (${t.key})`} onClick={() => pickTool(t.id)}>
                <kbd>{t.key}</kbd>{t.icon}{t.name}
              </button>
            ))}
          </nav>

          <div className="an-mid">
            {shot ? (
              <Stage shot={shot} src={srcs[shot.id] || undefined} tool={tool} sel={sel} zoom={zoom} setZoom={setZoom} defaults={defaults.current}
                onSelect={setSel} onCreate={create} apply={applyItems} begin={begin} end={end} onFocusText={focusText} seal={sealNode} stageRef={stageRef}
                hint={srcs[shot.id] === "" ? "This shot couldn't be loaded. Check your connection and reopen." : srcs[shot.id] ? HINTS[tool] : "Loading the shot…"} />
            ) : (
              <div className={`an-empty${dragOver ? " over" : ""}`} data-empty="drop">
                <ImagePlus size={34} color="#d7ff3c" style={{ margin: "0 auto", display: "block" }} />
                <h2>Add your match shots</h2>
                <p>Up to 4 screenshots from the game. Drop them here, paste one with Ctrl V, or pick them.</p>
                <button className="an-btn pri" style={{ margin: "0 auto" }} onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> Choose pictures</button>
                <small>Your shots stay private to your account. Only what you export is shared.</small>
              </div>
            )}
            {shot && (
              <div className="an-zoom">
                <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z / 1.25))} disabled={zoom <= 1}><ZoomOut size={14} /></button>
                <span style={{ width: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
                <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(6, z * 1.25))}><ZoomIn size={14} /></button>
                <button aria-label="Fit" title="Fit the shot" onClick={() => setZoom(1)}><Maximize size={14} /></button>
              </div>
            )}
          </div>

          <Inspector mark={selMark} shot={shot} set={setMark} begin={begin} end={end} textRef={textRef}
            onDuplicate={dup} onDelete={del} onFront={() => restack(true)} onBack={() => restack(false)}
            onDim={(v, live) => { if (!live) begin(); setDim(v); if (!live) end() }} />
        </div>
      )}

      {phase !== "missing" && (
        <div className="an-strip" aria-label="Shots">
          {shots.map((s, i) => (
            <div key={s.id} className={`an-thumb${i === cur ? " on" : ""}`} role="button" tabIndex={0} aria-label={`Shot ${i + 1}`} aria-pressed={i === cur}
              onClick={() => { setCur(i); setSel(null) }} onKeyDown={e => { if (e.key === "Enter") { setCur(i); setSel(null) } }}>
              {srcs[s.id] ? <img src={srcs[s.id]} alt="" /> : null}
              <span className="an-num">{i + 1}</span>
              {uploads[s.id] === "up" && <span className="an-over"><Loader2 size={16} className="an-spin" /></span>}
              {uploads[s.id] === "fail" && <span className="an-over">Upload failed</span>}
              {srcs[s.id] === undefined && !uploads[s.id] && <span className="an-over">Loading…</span>}
              {srcs[s.id] === "" && <span className="an-over">Couldn't load</span>}
              {i === cur && <>
                <button className="an-tbtn" style={{ right: 4 }} aria-label={`Delete shot ${i + 1}`} onClick={e => { e.stopPropagation(); setConfirmDel(s.id) }}><Trash2 size={12} /></button>
                {i > 0 && <button className="an-tbtn" style={{ right: 56 }} aria-label="Move left" onClick={e => { e.stopPropagation(); moveShot(i, -1) }}><ChevronLeft size={13} /></button>}
                {i < shots.length - 1 && <button className="an-tbtn" style={{ right: 30 }} aria-label="Move right" onClick={e => { e.stopPropagation(); moveShot(i, 1) }}><ChevronRight size={13} /></button>}
              </>}
              {confirmDel === s.id && (
                <div className="an-confirm" onClick={e => e.stopPropagation()}>
                  Delete this shot?
                  <div><button style={{ background: "#f85149", color: "#fff" }} onClick={() => deleteShot(s.id)}>Delete</button><button onClick={() => setConfirmDel(null)}>Keep</button></div>
                </div>
              )}
            </div>
          ))}
          {shots.length < MAX_SHOTS && (
            <button className="an-add" onClick={() => fileRef.current?.click()}><ImagePlus size={18} />{shots.length ? "Add shot" : "Add shots"}</button>
          )}
          <span className="an-strip-note">{shots.length}/{MAX_SHOTS} shots{shots.length ? " · numbered in post order" : ""}</span>
        </div>
      )}

      <input ref={fileRef} id="an-files" type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: "none" }}
        onChange={e => { addFiles([...(e.target.files ?? [])]); e.target.value = "" }} />

      {listOpen && (
        <div className="an-scrim" onClick={() => setListOpen(false)}>
          <div className="an-modal" role="dialog" aria-label="My analyses" onClick={e => e.stopPropagation()}>
            <header>My analyses<span className="an-sp" /><button className="an-icon" aria-label="Close" onClick={() => setListOpen(false)}><X size={16} /></button></header>
            <div className="an-list">
              {list === null ? <p style={{ padding: 14, color: TEXT_MUTED }}>Loading…</p>
                : list.length === 0 ? <p style={{ padding: 14, color: TEXT_MUTED }}>Nothing saved yet. Add a shot and it saves by itself.</p>
                  : list.map(r => {
                    const n = user ? readAnalysis(r.data, user.id).shots.length : 0
                    return (
                      <div key={r.id} className="an-item">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="t" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || "Untitled analysis"}{r.id === aid ? " (open)" : ""}</div>
                          <div className="d">{n} shot{n === 1 ? "" : "s"} · {relTime(r.updated_at)}</div>
                        </div>
                        {confirmDel === "row" + r.id ? <>
                          <button className="an-btn" style={{ borderColor: DS_ERROR, color: DS_ERROR }} onClick={() => deleteAnalysis(r)}>Delete</button>
                          <button className="an-btn" onClick={() => setConfirmDel(null)}>Keep</button>
                        </> : <>
                          <button className="an-btn" onClick={() => { setListOpen(false); if (r.id !== aid) navigate(`/analysis?open=${r.id}`) }}>Open</button>
                          <button className="an-icon bad" aria-label={`Delete ${r.title}`} onClick={() => setConfirmDel("row" + r.id)}><Trash2 size={15} /></button>
                        </>}
                      </div>
                    )
                  })}
            </div>
          </div>
        </div>
      )}
      {busy && <div className="an-busy" role="status"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><Loader2 size={18} className="an-spin" /> {busy}</span></div>}
      <div aria-live="polite">{toast && <div className="an-toast">{toast}</div>}</div>
    </div>
  )
}
