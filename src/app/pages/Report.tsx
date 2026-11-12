import { useEffect, useRef, useState, type ReactNode } from "react"
import { useLocation, useNavigate } from "react-router"
import { BarChart3, Circle as CircleIcon, Copy, Download, FolderOpen, Heading1, ImagePlus, ListOrdered, Loader2, Maximize, MousePointer2, MoveUpRight, Plus, Redo2, Spline, Square, Type, Undo2, UserPlus, UserRound, X, ZoomIn, ZoomOut, MapPin, LayoutTemplate } from "lucide-react"
import { supabase } from "../lib/supabase"
import { stripHandleSuffix } from "../lib/account"
import { relTime } from "../lib/time"
import { pieceName, isAutoName, listName } from "../lib/names"
import { Mark as PSMark } from "../brand/Mark"
import { DEFAULT_BRAND, cardColours, logoToDataUrl, readBrand, type Brand } from "../brand/brand"
import { Canvas, clampCrop, moveBlock, type Mode, type PitchTool, type Sel } from "../report/Canvas"
import { Panel, PITCH_HINTS } from "../report/Panel"
import { ReportView, blockBox } from "../report/Draw"
import { TEMPLATES, makeTemplate, type TemplateId } from "../report/templates"
import { DEFAULT_TEAMS, MAX_BLOCKS, MAX_MARKS, SIZES, mediaOf, newId, pitchBox, projector, readReport, type Block, type Mark, type PhotoBlock, type PitchBlock, type Pt, type Report, type Shape, type Team } from "../report/model"
import { applyLineup, formationOf, lineupOf, lineupText, placeFormation, type Squad } from "../report/team"
import { downloadMedia, mediaLinks, preparePhoto, removeFolder, svgToCanvas, tidyFolder, uploadMedia } from "../report/media"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_1, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, DS_ERROR, ACCENT_SOLID, ACCENT_INK, ACCENT_SOFT, ACCENT_TEXT, SCRIM } from "../theme"

/* Match Report ("/report"): one picture built from blocks you place freely (headline, text, a pitch, key stats, the story, photos),
   in Night or Bright, told in your colour, signed with your seal. Saved to your account as you go; every save carries a revision,
   so two tabs can never quietly overwrite each other. "/report?open=ID" opens a saved one. */

type Row = { id: string; title: string; updated_at: string; data: unknown }
type AddKind = "title" | "text" | "pitch" | "stats" | "story" | "photo"
const ADD: { id: AddKind; name: string; icon: ReactNode }[] = [
  { id: "title", name: "Headline", icon: <Heading1 size={18} /> }, { id: "text", name: "Text", icon: <Type size={18} /> },
  { id: "pitch", name: "Pitch", icon: <Square size={18} /> }, { id: "stats", name: "Key stats", icon: <BarChart3 size={18} /> },
  { id: "story", name: "Story", icon: <ListOrdered size={18} /> }, { id: "photo", name: "Photo", icon: <ImagePlus size={18} /> },
]
const TOOLS: { id: PitchTool; name: string; key: string; icon: ReactNode }[] = [
  { id: "select", name: "Select", key: "V", icon: <MousePointer2 size={18} /> }, { id: "player", name: "Player", key: "P", icon: <UserPlus size={18} /> },
  { id: "opp", name: "Opponent", key: "O", icon: <UserRound size={18} /> }, { id: "pass", name: "Pass", key: "A", icon: <MoveUpRight size={18} /> },
  { id: "run", name: "Run", key: "R", icon: <Spline size={18} /> }, { id: "pin", name: "Pin", key: "N", icon: <MapPin size={18} /> },
  { id: "zone", name: "Zone", key: "Z", icon: <Square size={18} /> }, { id: "ball", name: "Ball", key: "B", icon: <CircleIcon size={18} /> },
]
const TOOL_KEYS: Record<string, PitchTool> = { v: "select", p: "player", o: "opp", a: "pass", r: "run", n: "pin", z: "zone", b: "ball" }
const EMPTY: Report = { v: 2, format: "1:1", mode: "night", paper: null, story: null, glow: false, seal: "br", blocks: [] }

/** Every block made bigger or smaller by s and moved by (ox, oy): used when the page changes size */
function scaleBlock(b: Block, s: number, ox: number, oy: number): Block {
  const x = ox + b.x * s, y = oy + b.y * s
  switch (b.kind) {
    case "text": return { ...b, x, y, w: b.w * s, size: b.size * s }
    case "pitch": return { ...b, x, y, w: b.w * s }
    case "stats": case "story": return { ...b, x, y, w: b.w * s, s: b.s * s }
    case "photo": return { ...b, x, y, w: b.w * s, h: b.h * s, ix: b.ix * s, iy: b.iy * s, iw: b.iw * s }
  }
}
const withNewIds = (b: Block): Block => (b.kind === "pitch" ? { ...b, id: newId(), marks: b.marks.map(m => ({ ...m, id: newId() })) } : { ...b, id: newId() })

/** A report's headline, which names it until you give it a name: its biggest title text, first line */
const headlineOf = (r: Report) => {
  const t = (r.blocks as any[]).filter(b => b.kind === "text" && b.style === "title").sort((a, b) => b.size - a.size)[0]
  return t ? String(t.text).split(String.fromCharCode(10))[0] : ""
}

export default function ReportPage() {
  const navigate = useNavigate()
  const loc = useLocation()
  const openId = new URLSearchParams(loc.search).get("open")
  const [user, setUser] = useState<{ id: string; email: string } | null>(null)
  const [phase, setPhase] = useState<"loading" | "start" | "ready" | "missing">("loading")
  const [rid] = useState(() => openId ?? newId())
  const [title, setTitle] = useState("") // the name you gave it ("" = none: it's named after its headline, or its day)
  const made = useRef<string | null>(null) // when it was started: an unnamed report with no headline is called after that day
  const titleRef = useRef(title); titleRef.current = title
  const [report, setReportState] = useState<Report>(EMPTY)
  const repRef = useRef<Report>(EMPTY)
  const [media, setMedia] = useState<Record<string, string>>({})
  const [uploads, setUploads] = useState<Record<string, "up" | "fail">>({})
  const blobs = useRef(new Map<string, Blob>())
  const [sel, setSelState] = useState<Sel>({ bid: null, mid: null })
  const [mode, setModeState] = useState<Mode>({ kind: "page" })
  const [tool, setTool] = useState<PitchTool>("select")
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error" | "offline" | "conflict">("idle")
  const [toast, setToast] = useState("")
  const [list, setList] = useState<Row[] | null>(null)
  const [more, setMore] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState("")
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND)
  const [handle, setHandle] = useState("")
  const [logo, setLogo] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileFor = useRef<string | null>(null) // the photo block a picked file goes into (null: a new photo)
  const clip = useRef<Block | null>(null), clipTag = useRef("")
  const catcher = useRef<HTMLTextAreaElement>(null) // Ctrl V lands here, so a paste arrives in every browser
  const [links, setLinks] = useState<Record<string, string>>({})
  const savedJson = useRef(""), rev = useRef<number | null>(null)
  const saving = useRef(false), again = useRef(false)
  const [, force] = useState(0)

  const setReport = (r: Report) => { repRef.current = r; setReportState(r) }
  const apply = (fn: (r: Report) => Report) => setReport(fn(repRef.current))
  const say = (t: string) => setToast(t)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3400); return () => clearTimeout(t) }, [toast])
  const setSel = (s: Sel) => setSelState(s)
  const setMode = (m: Mode) => { setModeState(m); if (m.kind === "pitch") { setTool("select"); setSelState({ bid: m.bid, mid: null }) } }

  /* ── open: who you are, your seal, and the report in the address (if any) ── */
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
      if (!openId) { setPhase("start"); return }
      const { data, error } = await supabase.from("reports").select("id, title, data, rev, created_at").eq("id", openId).eq("user_id", u.id).maybeSingle()
      if (off) return
      if (error || !data) { setPhase("missing"); return }
      const r = readReport((data as any).data, u.id), saved: string = (data as any).title || ""
      made.current = (data as any).created_at ?? null
      // a name the app made (from the headline or the day) stays automatic; only a name you typed is kept as yours
      const t = isAutoName(saved) || saved === pieceName("Report", "", headlineOf(r), made.current) ? "" : saved
      setTitle(t); titleRef.current = t; setReport(r); rev.current = (data as any).rev ?? 1
      savedJson.current = payload(t, r); setStatus("saved"); setPhase("ready")
      const paths = mediaOf(r)
      for (const pth of paths) downloadMedia(pth).then(d => { if (!off) setMedia(x => ({ ...x, [pth]: d ?? "" })) })
      tidyFolder(u.id, rid, paths) // photos removed in an earlier visit leave no files behind
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
  const start = (id: TemplateId) => {
    // a template isn't saved until you change something: leave without editing and nothing new appears in My reports
    const tpl = makeTemplate(id)
    made.current = new Date().toISOString(); setTitle(""); titleRef.current = ""
    savedJson.current = payload("", tpl); setStatus("idle")
    setReport(tpl); setPhase("ready"); setSel({ bid: null, mid: null })
    ;(window as any).posthog?.capture("report_started", { template: id })
  }

  /* ── saving: a moment after every change. A photo is saved once its file has arrived. ── */
  function payload(t: string, r: Report) {
    const up = uploadsRef.current
    return JSON.stringify({ title: pieceName("Report", t, headlineOf(r), made.current), data: { ...r, blocks: r.blocks.filter(b => !(b.kind === "photo" && b.src && up[b.src])) } })
  }
  const uploadsRef = useRef(uploads); uploadsRef.current = uploads
  const save = async (): Promise<void> => {
    if (!user) return
    if (saving.current) { again.current = true; return }
    const json = payload(titleRef.current, repRef.current)
    if (json === savedJson.current) { setStatus(Object.values(uploadsRef.current).includes("fail") ? "error" : "saved"); return }
    saving.current = true; setStatus("saving")
    const p = JSON.parse(json)
    let newRev: number | null = null, failed = false
    try {
      if (rev.current === null) {
        const { data, error } = await (supabase as any).from("reports").insert({ id: rid, user_id: user.id, title: p.title, data: p.data }).select("rev").single()
        if (error && (error as any).code === "23505") {
          // it was made already (an answer lost on the way back): carry on from the saved revision
          const cur = await supabase.from("reports").select("rev").eq("id", rid).maybeSingle()
          if (cur.data) { rev.current = (cur.data as any).rev; saving.current = false; return save() }
        }
        if (error && String((error as any).message).includes("report limit")) say("You have 500 reports. Delete a few in My reports to save this one.")
        if (error) failed = true; else newRev = (data as any)?.rev ?? 1
      } else {
        const { data, error } = await (supabase as any).from("reports").update({ title: p.title, data: p.data }).eq("id", rid).eq("rev", rev.current).select("rev")
        if (error) failed = true
        else if (!data || !(data as any[]).length) { saving.current = false; setStatus("conflict"); return } // changed somewhere else since
        else newRev = (data as any[])[0].rev
      }
    } catch { failed = true }
    saving.current = false
    if (failed || newRev === null) { setStatus(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error"); return }
    rev.current = newRev; savedJson.current = json
    if (!window.location.search.includes(rid)) window.history.replaceState(null, "", `/report?open=${rid}`)
    if (again.current) { again.current = false; return save() }
    setStatus(payload(titleRef.current, repRef.current) === json ? (Object.values(uploadsRef.current).includes("fail") ? "error" : "saved") : "saving")
  }
  useEffect(() => {
    if (phase !== "ready" || !user || status === "conflict") return
    if (payload(title, report) === savedJson.current) return
    setStatus("saving")
    const t = setTimeout(save, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, report, phase, user, uploads])
  useEffect(() => {
    const back = () => { if (status === "offline" || status === "error") save() }
    window.addEventListener("online", back)
    return () => window.removeEventListener("online", back)
  })
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (status === "saving" || status === "conflict" || Object.keys(uploads).length) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [status, uploads])
  const keepMine = async () => {
    const { data } = await supabase.from("reports").select("rev").eq("id", rid).maybeSingle()
    rev.current = data ? (data as any).rev : null // gone elsewhere: it is made again
    savedJson.current = ""; setStatus("saving"); save()
  }

  /* ── undo and redo ── */
  const past = useRef<string[]>([]), future = useRef<string[]>([]), pending = useRef<string | null>(null)
  const snap = () => JSON.stringify(repRef.current)
  const begin = () => { if (pending.current === null) pending.current = snap() }
  const end = () => {
    const p = pending.current
    pending.current = null
    if (p !== null && p !== snap()) { past.current.push(p); if (past.current.length > 200) past.current.shift(); future.current = []; force(n => n + 1) }
  }
  const undo = () => { end(); const prev = past.current.pop(); if (prev === undefined) return; future.current.push(snap()); setReport(JSON.parse(prev)); force(n => n + 1) }
  const redo = () => { end(); const next = future.current.pop(); if (next === undefined) return; past.current.push(snap()); setReport(JSON.parse(next)); force(n => n + 1) }
  const change = (fn: (r: Report) => Report) => { begin(); apply(fn); end() }

  /* ── the selection ── */
  const [W, H] = SIZES[report.format]
  const block = sel.bid ? report.blocks.find(b => b.id === sel.bid) ?? null : null
  const pitch = mode.kind === "pitch" ? (report.blocks.find(b => b.id === mode.bid && b.kind === "pitch") as PitchBlock | undefined) ?? null : null
  const mark = pitch && sel.mid ? pitch.marks.find(m => m.id === sel.mid) ?? null : null
  useEffect(() => { if (mode.kind !== "page" && !report.blocks.some(b => b.id === mode.bid)) setModeState({ kind: "page" }) }, [report, mode])
  const setBlock = (patch: Partial<Block>, live?: boolean) => {
    if (!block) return
    if (!live) begin()
    apply(r => ({ ...r, blocks: r.blocks.map(b => (b.id === block.id ? ({ ...b, ...patch } as Block) : b)) }))
    if (!live) end()
  }
  const setMark = (patch: Partial<Mark>, live?: boolean) => {
    if (!pitch || !mark) return
    if (!live) begin()
    apply(r => ({ ...r, blocks: r.blocks.map(b => (b.id === pitch.id && b.kind === "pitch" ? { ...b, marks: b.marks.map(m => (m.id === mark.id ? ({ ...m, ...patch } as Mark) : m)) } : b)) }))
    if (!live) end()
  }
  const [focusReq, setFocusReq] = useState<"text" | "name" | null>(null)
  useEffect(() => {
    if (!focusReq) return
    const el = focusReq === "name" ? nameRef.current : textRef.current
    el?.focus(); el?.select()
    setFocusReq(null)
  }, [focusReq])
  const onEditText = (bid: string, mid?: string) => { setSel({ bid, mid: mid ?? null }); setFocusReq(mid ? "name" : "text") }

  /* ── adding blocks ── */
  const addBlock = (b: Block, focus = false) => {
    if (repRef.current.blocks.length >= MAX_BLOCKS) { say(`A report holds ${MAX_BLOCKS} blocks.`); return }
    change(r => ({ ...r, blocks: [...r.blocks, b] }))
    setModeState({ kind: "page" }); setSel({ bid: b.id, mid: null })
    if (focus) setFocusReq("text")
  }
  const add = (kind: AddKind) => {
    const k = W / 1600
    if (kind === "photo") { fileFor.current = null; fileRef.current?.click(); return }
    if (kind === "title") return addBlock({ id: newId(), kind: "text", x: W * 0.1, y: H * 0.42, w: W * 0.8, rot: 0, text: "YOUR HEADLINE", style: "title", size: 110 * k, align: "center", color: report.mode === "bright" ? "story" : "ink", plate: null }, true)
    if (kind === "text") return addBlock({ id: newId(), kind: "text", x: W * 0.25, y: H * 0.46, w: W * 0.5, rot: 0, text: "Write what happened.", style: "text", size: 24 * k, align: "left", color: "ink", plate: null }, true)
    if (kind === "stats") return addBlock({ id: newId(), kind: "stats", x: W * 0.15, y: H * 0.42, w: W * 0.7, s: k, type: "team", player: "", num: "", rows: [{ value: "", label: "Possession" }, { value: "", label: "xG" }, { value: "", label: "Shots" }] })
    if (kind === "story") return addBlock({ id: newId(), kind: "story", x: W * 0.3, y: H * 0.36, w: 420 * k, s: k, title: "The story", points: ["Your first point.", "Your second point."] }, true)
    const w = Math.min(W * 0.62, H * 0.62 * (68 / 52.5))
    addBlock({ id: newId(), kind: "pitch", x: (W - w) / 2, y: (H - w * (52.5 / 68)) / 2, w, view: "half", dir: "up", look: "flat", teams: DEFAULT_TEAMS(), marks: [], crest: true, ms: 1, legend: false })
  }

  /* ── photos: picked, pasted or dropped; into an empty slot, or as a new photo ── */
  const upload = async (path: string) => {
    const blob = blobs.current.get(path)
    if (!blob) return
    setUploads(x => ({ ...x, [path]: "up" }))
    try {
      await uploadMedia(path, blob)
      blobs.current.delete(path)
      setUploads(x => { const n = { ...x }; delete n[path]; return n })
    } catch { setUploads(x => ({ ...x, [path]: "fail" })); setStatus("error") }
  }
  const addPhotos = async (files: File[], at?: Pt, into?: string | null) => {
    if (!user) return
    const imgs = files.filter(f => f.type.startsWith("image/")).slice(0, 6)
    if (!imgs.length) { say("That isn't a picture. Use a PNG, JPG or WebP."); return }
    for (const f of imgs) {
      let prep
      try { prep = await preparePhoto(f) } catch (e) { say((e as Error).message === "too big" ? "That picture is over 25 MB." : "That picture couldn't be opened. Try a PNG or JPG."); continue }
      const path = `${user.id}/${rid}/${newId()}.${prep.ext}`
      blobs.current.set(path, prep.blob)
      setMedia(x => ({ ...x, [path]: prep.data }))
      setUploads(x => ({ ...x, [path]: "up" }))
      const slot = into ? (repRef.current.blocks.find(b => b.id === into && b.kind === "photo") as PhotoBlock | undefined) : undefined
      if (slot) {
        // the slot is only a place to start: the picture keeps all of itself, in its own proportions, as large as fits there. A cut-out stands on the bottom of the slot, a photo sits in the middle. Nothing is cropped; size it however you like after.
        const f = Math.min(slot.w / prep.w, slot.h / prep.h), w = prep.w * f, h = prep.h * f
        const next: PhotoBlock = { ...slot, src: path, nw: prep.w, nh: prep.h, x: slot.x + (slot.w - w) / 2, y: prep.ext === "png" ? slot.y + slot.h - h : slot.y + (slot.h - h) / 2, w, h, ix: 0, iy: 0, iw: w }
        change(r => ({ ...r, blocks: r.blocks.map(b => (b.id === slot.id ? next : b)) }))
        setSel({ bid: slot.id, mid: null })
        into = null // a second picture becomes its own photo
      } else {
        const w = Math.min(W * 0.4, (H * 0.5 * prep.w) / prep.h), h = w * (prep.h / prep.w)
        const cx = at ? at[0] : W / 2, cy = at ? at[1] : H / 2
        addBlock({ id: newId(), kind: "photo", x: Math.min(W - w, Math.max(0, cx - w / 2)), y: Math.min(H - h, Math.max(0, cy - h / 2)), w, h, rot: 0, src: path, nw: prep.w, nh: prep.h, ix: 0, iy: 0, iw: w,
          shape: "rect", edge: "hard", border: "none", shadow: false, flip: false })
      }
      ;(window as any).posthog?.capture("report_photo_added", { cutout: prep.ext === "png" })
      upload(path)
    }
  }
  const retry = () => { for (const [pth, st] of Object.entries(uploads)) if (st === "fail") upload(pth); save() }

  /* ── arranging ── */
  const act = (what: string, arg?: string) => {
    const b = block
    if (what === "done") { setModeState({ kind: "page" }); return }
    if (what === "pitch" && b?.kind === "pitch") { setMode({ kind: "pitch", bid: b.id }); return }
    if (what === "crop" && b?.kind === "photo" && b.src) { setModeState({ kind: "crop", bid: b.id }); return }
    if (what === "photo" && b) { fileFor.current = b.id; fileRef.current?.click(); return }
    if (what === "delmark" && pitch && mark) { change(r => ({ ...r, blocks: r.blocks.map(x => (x.id === pitch.id && x.kind === "pitch" ? { ...x, marks: x.marks.filter(m => m.id !== mark.id) } : x)) })); setSel({ bid: pitch.id, mid: null }); return }
    if (!b) return
    if (what === "dup") { const c = moveBlock(withNewIds(b), 40 * (W / 1600), 40 * (W / 1600)); addBlock(c); return }
    if (what === "del") { change(r => ({ ...r, blocks: r.blocks.filter(x => x.id !== b.id) })); setSel({ bid: null, mid: null }); setModeState({ kind: "page" }); return }
    if (what === "front" || what === "back") { change(r => { const rest = r.blocks.filter(x => x.id !== b.id); return { ...r, blocks: what === "front" ? [...rest, b] : [b, ...rest] } }); return }
    const B = blockBox(b)
    if (what === "centre") { setBlock({ x: b.x + (W - B.w) / 2 - B.x }); return }
    if (what === "middle") { setBlock({ y: b.y + (H - B.h) / 2 - B.y }); return }
    if (what === "fitphoto" && b.kind === "photo") { const h = b.w * (b.nh / b.nw); setBlock({ h, iw: b.w, ix: 0, iy: 0, y: b.y + (b.h - h) / 2 }); return }
    if (b.kind === "pitch" && (what === "view" || what === "look" || what === "dir")) {
      // the pitch turns or changes view where it stands, and its marks keep their place on the pitch
      const before = pitchBox(b), c: Pt = [b.x + before.w / 2, b.y + before.h / 2]
      let n: PitchBlock = { ...b }
      if (what === "view" && arg !== b.view) {
        const f = arg === "half" ? 2 : 0.5
        const mv = (q: Pt): Pt => [q[0], q[1] * f]
        n = { ...n, view: arg as PitchBlock["view"], marks: b.marks.map(m => (m.kind === "pass" ? { ...m, a: mv(m.a), b: mv(m.b), c: m.c ? mv(m.c) : null } : m.kind === "zone" ? { ...m, p: mv(m.p), r: [m.r[0], m.r[1] * f] } : { ...m, p: mv(m.p) })) }
      }
      if (what === "dir") n = { ...n, dir: arg as PitchBlock["dir"] }
      if (what === "look") n = { ...n, look: arg as PitchBlock["look"], w: arg === b.look ? b.w : arg === "stadium" ? b.w * 1.6 : b.w / 1.6 }
      // a flat pitch that changes shape fits inside the space the old one had, so nothing else on the page moves
      if (n.look === "flat" && b.look === "flat") { const one = pitchBox({ ...n, w: 1 }); n = { ...n, w: Math.min(before.w / one.w, before.h / one.h) } }
      const after = pitchBox(n)
      n = { ...n, x: c[0] - after.w / 2, y: c[1] - after.h / 2 }
      change(r => ({ ...r, blocks: r.blocks.map(x => (x.id === b.id ? n : x)) }))
    }
  }
  /* ── teams on the pitch that is selected (or being edited): formation, kit, names ── */
  const tp = pitch ?? (block?.kind === "pitch" ? block : null)
  const patchPitch = (fn: (b: PitchBlock) => PitchBlock, live = false) => {
    if (!tp) return
    const run = (r: Report): Report => ({ ...r, blocks: r.blocks.map(x => (x.id === tp.id && x.kind === "pitch" ? fn(x) : x)) })
    if (live) apply(run); else change(run)
  }
  const setTeam = (i: 0 | 1, patch: Partial<Team>, live = false) => patchPitch(x => ({ ...x, teams: (i === 0 ? [{ ...x.teams[0], ...patch }, x.teams[1]] : [x.teams[0], { ...x.teams[1], ...patch }]) as [Team, Team] }), live)
  const placeTeam = (i: 0 | 1, formation: string, shape?: Shape) => {
    if (!tp) return
    const sh = shape ?? tp.teams[i].shape
    const T = tp.teams[i], prev = T.formation && formationOf(T.formation) ? { name: T.formation, shape: T.shape } : null
    const marks = placeFormation(tp.marks, i, formation, sh, tp.view, prev)
    if (marks.length > MAX_MARKS) { say("This pitch is full."); return }
    patchPitch(x => ({ ...x, marks, teams: (i === 0 ? [{ ...x.teams[0], formation, shape: sh }, x.teams[1]] : [x.teams[0], { ...x.teams[1], formation, shape: sh }]) as [Team, Team] }))
  }
  /** Who has the ball: both teams that have a formation move into their shape for that moment */
  const setMoment = (m: "base" | "me" | "them") => {
    if (!tp) return
    const shapes: [Shape, Shape] = m === "me" ? ["in", "out"] : m === "them" ? ["out", "in"] : ["base", "base"]
    let marks = tp.marks
    for (const i of [0, 1] as const) {
      const T = tp.teams[i]
      if (T.formation && formationOf(T.formation)) marks = placeFormation(marks, i, T.formation, shapes[i], tp.view, { name: T.formation, shape: T.shape })
    }
    patchPitch(x => ({ ...x, marks, teams: x.teams.map((t, i) => (t.formation && formationOf(t.formation) ? { ...t, shape: shapes[i] } : t)) as [Team, Team] }))
  }
  const countTeam = (i: 0 | 1) => (tp ? tp.marks.filter(m => m.kind === "player" && m.team === i).length : 0)
  const teamNames = (i: 0 | 1) => (tp ? lineupText(tp.marks, i, tp.teams[i].formation, tp.teams[i].shape, tp.view) : "")
  const teamRoster = (i: 0 | 1) => (tp ? lineupOf(tp.marks, i, tp.teams[i].formation, tp.teams[i].shape, tp.view).map(({ m, pos, num }) => ({ name: m ? m.name : pos, num: m ? m.num : num })) : [])
  const teamLineup = (i: 0 | 1, entries: { name: string; num?: string }[], squad?: Squad) => {
    if (!tp || !entries.length) return
    const T = tp.teams[i]
    patchPitch(x => ({
      ...x, marks: applyLineup(x.marks, i, entries, T.formation, T.shape, x.view),
      teams: (squad ? x.teams.map((t, j) => (j === i ? { ...t, name: squad.teamName || t.name, color: squad.kit.c1, pat: squad.kit.pat, c2: squad.kit.c2, num: squad.kit.num } : t)) : x.teams) as [Team, Team],
    }))
  }
  const reformat = (f: Report["format"]) => {
    if (f === report.format) return
    const [W1, H1] = SIZES[report.format], [W2, H2] = SIZES[f], s = Math.min(W2 / W1, H2 / H1), ox = (W2 - W1 * s) / 2, oy = (H2 - H1 * s) / 2
    change(r => ({ ...r, format: f, blocks: r.blocks.map(b => scaleBlock(b, s, ox, oy)) }))
  }

  /* ── keys, copy and paste ── */
  useEffect(() => {
    const typing = (t: EventTarget | null) => { const e = t as HTMLElement | null; return !!e && e !== catcher.current && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable) }
    const copy = (b: Block) => {
      clip.current = JSON.parse(JSON.stringify(b)); clipTag.current = `PitchStudio block ${newId()}`
      navigator.clipboard?.writeText(clipTag.current).catch(() => {}) // so a later copy from elsewhere wins the next paste
    }
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) { if (e.key === "Escape" || (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT")) (e.target as HTMLElement).blur(); return }
      if (listOpen) { if (e.key === "Escape") setListOpen(false); return }
      if (phase !== "ready") return
      const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase()
      if (mod && key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && key === "y") { e.preventDefault(); redo(); return }
      if (mod && key === "d") { e.preventDefault(); if (mode.kind === "pitch" && mark && pitch) { const c: Mark = mark.kind === "pass" ? { ...mark, id: newId(), a: [mark.a[0] + 0.03, mark.a[1] + 0.03], b: [mark.b[0] + 0.03, mark.b[1] + 0.03], c: mark.c ? [mark.c[0] + 0.03, mark.c[1] + 0.03] : null } : { ...mark, id: newId(), p: [mark.p[0] + 0.03, mark.p[1] + 0.03] } as Mark; change(r => ({ ...r, blocks: r.blocks.map(b => (b.id === pitch.id && b.kind === "pitch" ? { ...b, marks: [...b.marks, c] } : b)) })); setSel({ bid: pitch.id, mid: c.id }) } else act("dup"); return }
      if (mod && key === "c" && block && mode.kind === "page") { copy(block); say("Copied. Ctrl V pastes it."); return }
      if (mod && key === "x" && block && mode.kind === "page") { e.preventDefault(); copy(block); act("del"); return }
      if (mod && key === "v") { const c = catcher.current; if (c) { c.value = ""; c.focus({ preventScroll: true }); setTimeout(() => { if (document.activeElement === c) c.blur() }, 120) } return }
      if (mod && key === "a") { e.preventDefault(); return }
      if (mod || e.altKey) return
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); if (mode.kind === "pitch") { if (mark) act("delmark") } else if (block) act("del"); return }
      if (e.key === "Escape") {
        if (exportOpen) setExportOpen(false)
        else if (mode.kind === "pitch" && sel.mid) setSel({ bid: sel.bid, mid: null })
        else if (mode.kind !== "page") setModeState({ kind: "page" })
        else setSel({ bid: null, mid: null })
        return
      }
      if (e.key === "Enter" && block && mode.kind === "page") { e.preventDefault(); if (block.kind === "pitch") act("pitch"); else if (block.kind === "photo") act(block.src ? "crop" : "photo"); else onEditText(block.id); return }
      if (e.key.startsWith("Arrow")) {
        const st = (e.shiftKey ? 20 : 2) * (W / 1600)
        const [dx, dy] = e.key === "ArrowLeft" ? [-st, 0] : e.key === "ArrowRight" ? [st, 0] : e.key === "ArrowUp" ? [0, -st] : [0, st]
        if (mode.kind === "pitch" && pitch && mark) {
          e.preventDefault(); begin()
          const pr = projector(pitch), mv = (q: Pt): Pt => { const s = pr.fwd(q[0], q[1]); return pr.inv(s[0] + dx, s[1] + dy) }
          apply(r => ({ ...r, blocks: r.blocks.map(b => (b.id === pitch.id && b.kind === "pitch" ? { ...b, marks: b.marks.map(m => (m.id !== mark.id ? m : m.kind === "pass" ? { ...m, a: mv(m.a), b: mv(m.b), c: m.c ? mv(m.c) : null } : { ...m, p: mv(m.p) })) } : b)) }))
          return
        }
        if (block && mode.kind === "page") { e.preventDefault(); begin(); apply(r => ({ ...r, blocks: r.blocks.map(b => (b.id === block.id ? moveBlock(b, dx, dy) : b)) })) }
        return
      }
      if (e.key === "+" || e.key === "=") { setZoom(z => Math.min(4, z * 1.2)); return }
      if (e.key === "-" || e.key === "_") { setZoom(z => Math.max(0.5, z / 1.2)); return }
      if (e.key === "0") { setZoom(1); return }
      if (mode.kind === "pitch" && TOOL_KEYS[key]) { setTool(TOOL_KEYS[key]); return }
    }
    const up = (e: KeyboardEvent) => { if (e.key.startsWith("Arrow")) end() }
    const paste = (e: ClipboardEvent) => {
      if (e.target === catcher.current) { e.preventDefault(); catcher.current?.blur() }
      if (typing(e.target) || phase !== "ready") return
      const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"))
      if (files.length) {
        // into the selected empty slot; with nothing else chosen, into the first empty slot; otherwise a new photo
        e.preventDefault()
        const empty = repRef.current.blocks.find(b => b.kind === "photo" && !b.src)
        addPhotos(files, undefined, block?.kind === "photo" ? (block.src ? null : block.id) : empty?.id ?? null)
        return
      }
      const text = (e.clipboardData?.getData("text/plain") ?? "").trim()
      if (clip.current && (!text || text === clipTag.current)) { e.preventDefault(); const c = moveBlock(withNewIds(clip.current), 40 * (W / 1600), 40 * (W / 1600)); clip.current = c; addBlock(c); return }
      if (text && mode.kind === "page") {
        // pasted words become a text block: a short line a headline, anything longer body text
        e.preventDefault()
        const k = W / 1600, short = text.length <= 42 && !text.includes(String.fromCharCode(10))
        addBlock(short ? { id: newId(), kind: "text", x: W * 0.1, y: H * 0.42, w: W * 0.8, rot: 0, text: text.toUpperCase(), style: "title", size: 104 * k, align: "center", color: "ink", plate: null }
          : { id: newId(), kind: "text", x: W * 0.25, y: H * 0.4, w: W * 0.5, rot: 0, text: text.slice(0, 600), style: "text", size: 24 * k, align: "left", color: "ink", plate: null })
      }
    }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("paste", paste)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("paste", paste) }
  })
  useEffect(() => {
    if (!exportOpen) return
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.("[data-export]")) setExportOpen(false) }
    window.addEventListener("pointerdown", away)
    return () => window.removeEventListener("pointerdown", away)
  }, [exportOpen])

  /* ── export: the page at full size, with your seal ── */
  const fileBase = (title.trim() || "Match report").split("").filter(ch => /[A-Za-z0-9 _.()-]/.test(ch)).join("").trim().slice(0, 60) || "Match report"
  const doExport = async (what: "png" | "jpg" | "copy") => {
    setExportOpen(false)
    const svg = svgRef.current
    if (!svg || busy) return
    if (mediaOf(report).some(pth => !media[pth])) { say("A photo is still loading. Try again in a moment."); return }
    setBusy("Exporting…")
    try {
      await document.fonts?.ready
      const cv = await svgToCanvas(svg, W, H, what === "jpg")
      const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, what === "jpg" ? "image/jpeg" : "image/png", 0.92))
      if (!blob) throw new Error("draw")
      if (what === "copy") { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); say("Copied. Paste it into your post.") }
      else {
        const url = URL.createObjectURL(blob), a = document.createElement("a")
        a.href = url; a.download = `${fileBase}.${what}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000)
      }
      ;(window as any).posthog?.capture("report_exported", { format: what, size: report.format, mode: report.mode })
    } catch (e) { console.error(e); say(what === "copy" ? "Couldn't copy here. Download the PNG instead." : "Couldn't make the picture. Try again.") } finally { setBusy("") }
  }

  /* ── my reports ── */
  const PAGE = 36
  const fetchList = async (from: number): Promise<Row[]> => {
    if (!user) return []
    const { data, error } = await supabase.from("reports").select("id, title, updated_at, data").eq("user_id", user.id).order("updated_at", { ascending: false }).range(from, from + PAGE - 1)
    const rows = error ? [] : ((data as Row[] | null) ?? [])
    setMore(rows.length === PAGE)
    const want = rows.filter(r => r.id !== rid).flatMap(r => mediaOf(readReport(r.data, user.id))).filter(pth => !links[pth])
    if (want.length) mediaLinks(want).then(m => setLinks(x => ({ ...x, ...m })))
    return rows
  }
  const openList = async () => { setListOpen(true); setList(null); setMore(false); setList(await fetchList(0)) }
  const loadMore = async () => { const cur = list ?? []; const rows = await fetchList(cur.length); setList([...cur, ...rows.filter(r => !cur.some(c => c.id === r.id))]) }
  const deleteReport = async (r: Row) => {
    if (!user) return
    const { error } = await supabase.from("reports").delete().eq("id", r.id).eq("user_id", user.id)
    if (error) { say("Couldn't delete it. Try again."); return }
    removeFolder(user.id, r.id)
    setList(l => (l ?? []).filter(x => x.id !== r.id)); setConfirmDel(null)
    if (r.id === rid) { setListOpen(false); navigate("/report", { replace: true }) }
  }

  const failed = Object.values(uploads).includes("fail")
  const upCount = Object.values(uploads).filter(v => v === "up").length
  const hint = mode.kind === "pitch" ? PITCH_HINTS[tool] : mode.kind === "crop" ? "Drag the photo inside its frame. Scroll to zoom. Esc when you're done."
    : block?.kind === "pitch" ? "Double-click the pitch to add players, passes and pins." : block ? "" : "Click anything to change it. Double-click to go inside. Drag to move."

  if (phase === "loading") return <div className="rp-page" style={{ minHeight: "100vh", background: SURFACE_BASE }} />

  return (
    <div className="rp-page">
      <style>{`
        .rp-page { height: 100vh; display: grid; grid-template-rows: 56px 1fr; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; overflow: hidden; }
        .rp-page * { box-sizing: border-box; }
        .rp-top { display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid ${DS_BORDER}; min-width: 0; }
        .rp-home { background: none; border: none; padding: 4px; cursor: pointer; display: flex; border-radius: 8px; }
        .rp-title { flex: 0 1 300px; min-width: 80px; height: 36px; background: transparent; border: 1px solid transparent; border-radius: 8px; color: ${TEXT_PRIMARY}; font: 600 15px 'Inter', sans-serif; padding: 0 10px; }
        .rp-title:hover { border-color: ${DS_BORDER}; } .rp-title:focus { outline: none; border-color: ${ACCENT_SOLID}; background: ${SURFACE_1}; }
        .rp-status { font-size: 12px; color: ${TEXT_MUTED}; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
        .rp-status.bad { color: ${DS_ERROR}; }
        .rp-status button { background: none; border: 1px solid currentColor; color: inherit; border-radius: 999px; padding: 3px 10px; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .rp-sp { flex: 1; }
        .rp-icon { width: 36px; height: 36px; display: inline-grid; place-items: center; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; cursor: pointer; flex-shrink: 0; padding: 0; }
        .rp-icon.sm { width: 30px; height: 30px; border-radius: 8px; }
        .rp-icon:disabled { opacity: .4; cursor: default; } .rp-icon.bad { color: ${DS_ERROR}; }
        .rp-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 13px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
        .rp-btn.sm { height: 30px; padding: 0 11px; font-size: 12.5px; }
        .rp-btn.wide { width: 100%; margin-bottom: 6px; }
        .rp-btn.pri { background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; border-color: ${ACCENT_SOLID}; }
        .rp-btn:disabled { opacity: .45; cursor: default; }
        .rp-menu { position: absolute; right: 0; top: 42px; z-index: 30; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 12px; padding: 6px; min-width: 230px; box-shadow: 0 14px 40px rgba(0,0,0,.35); }
        .rp-menu button { display: flex; width: 100%; align-items: center; gap: 10px; background: none; border: none; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; padding: 9px 10px; border-radius: 8px; cursor: pointer; text-align: left; }
        .rp-menu button:hover { background: ${SURFACE_2}; } .rp-menu small { color: ${TEXT_MUTED}; margin-left: auto; }
        .rp-body { display: grid; grid-template-columns: 84px 1fr 304px; min-height: 0; }
        .rp-rail { border-right: 1px solid ${DS_BORDER}; padding: 10px 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
        .rp-rail-cap { font: 700 9.5px 'Inter', sans-serif; letter-spacing: .16em; color: ${TEXT_MUTED}; text-align: center; margin: 4px 0 4px; }
        .rp-tool { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 8px 2px 7px; border-radius: 10px; border: 1px solid transparent; background: none; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; position: relative; }
        .rp-tool:hover { color: ${TEXT_PRIMARY}; background: ${SURFACE_1}; }
        .rp-tool.on { color: ${ACCENT_INK}; background: ${ACCENT_SOLID}; }
        .rp-tool kbd { position: absolute; top: 3px; right: 5px; font: 600 12px 'Inter', sans-serif; opacity: .6; }
        .rp-mid { position: relative; display: grid; grid-template-rows: 1fr auto; min-width: 0; min-height: 0; background: #101114; }
        .rp-view { position: relative; min-width: 0; min-height: 0; display: flex; padding: 28px; }
        .rp-wrap { position: relative; margin: auto; flex-shrink: 0; box-shadow: 0 12px 48px rgba(0,0,0,.5); }
        .rp-hint { position: absolute; left: 50%; top: -22px; transform: translate(-50%, -50%); background: rgba(12,14,18,.86); color: #f5f5f7; font: 500 12.5px 'Inter', sans-serif; padding: 6px 12px; border-radius: 999px; pointer-events: none; white-space: nowrap; max-width: 92%; overflow: hidden; text-overflow: ellipsis; }
        .rp-zoom { display: flex; align-items: center; gap: 6px; justify-content: flex-end; padding: 6px 12px; color: #c9ccd2; font: 500 12px 'Inter', sans-serif; }
        .rp-zoom button { width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: #f5f5f7; display: grid; place-items: center; cursor: pointer; }
        .rp-insp { border-left: 1px solid ${DS_BORDER}; padding: 16px; overflow-y: auto; min-height: 0; }
        .rp-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; } .rp-head .rp-cap { margin: 0; }
        .rp-cap { font-size: 12px; letter-spacing: .14em; font-weight: 700; color: ${TEXT_MUTED}; margin: 0 0 12px; }
        .rp-row { display: flex; flex-direction: column; gap: 7px; margin-bottom: 14px; min-width: 0; }
        .rp-lab { font-size: 12px; color: ${TEXT_MUTED}; }
        .rp-two { display: grid; grid-template-columns: 76px 1fr; gap: 10px; }
        .rp-line { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
        .rp-line select { width: auto; flex: 1; min-width: 80px; }
        .rp-inp { width: 100%; background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 10px; color: ${TEXT_PRIMARY}; font: 500 14px 'Inter', sans-serif; padding: 9px 11px; resize: vertical; }
        .rp-inp:focus { outline: none; border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 3px ${ACCENT_SOFT}; }
        .rp-statrow { display: flex; gap: 6px; align-items: flex-start; margin-bottom: 8px; }
        .rp-statrow .rp-inp:first-child { width: 86px; flex: none; } .rp-statrow .rp-inp { padding: 7px 9px; font-size: 13px; }
        .rp-num { width: 24px; height: 24px; flex: none; border-radius: 50%; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 800 12px 'Inter', sans-serif; display: grid; place-items: center; margin-top: 6px; }
        .rp-cols { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
        .rp-sw { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(128,128,128,.4); cursor: pointer; padding: 0; font: 800 12px 'Inter', sans-serif; color: #111; }
        .rp-sw.rp-paper { border-radius: 7px; border: 1px solid rgba(128,128,128,.45); }
        .rp-sw.on { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .rp-any { background: none; overflow: hidden; }
        .rp-chip { border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font: 600 12px 'Inter', sans-serif; padding: 6px 10px; border-radius: 999px; cursor: pointer; }
        .rp-chip.on { border-color: ${ACCENT_SOLID}; box-shadow: 0 0 0 2px ${ACCENT_SOFT}; }
        .rp-seg { display: inline-flex; background: ${SURFACE_2}; border-radius: 10px; padding: 3px; gap: 2px; flex-wrap: wrap; }
        .rp-seg button { border: none; background: none; color: ${TEXT_MUTED}; font: 500 12.5px 'Inter', sans-serif; padding: 6px 10px; border-radius: 8px; cursor: pointer; }
        .rp-seg button.on { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .rp-toggle { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; background: none; border: none; color: ${TEXT_PRIMARY}; font: 500 13px 'Inter', sans-serif; padding: 6px 0; margin-bottom: 10px; cursor: pointer; text-align: left; }
        .rp-toggle i { width: 36px; height: 20px; border-radius: 999px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; position: relative; flex: none; transition: background .15s; }
        .rp-toggle i:after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: ${TEXT_MUTED}; transition: transform .15s, background .15s; }
        .rp-toggle.on i { background: ${ACCENT_SOLID}; border-color: ${ACCENT_SOLID}; } .rp-toggle.on i:after { transform: translateX(16px); background: ${ACCENT_INK}; }
        .rp-slide { display: flex; align-items: center; gap: 10px; } .rp-slide input { flex: 1; accent-color: ${ACCENT_TEXT}; } .rp-slide span { font-size: 12px; color: ${TEXT_MUTED}; width: 40px; text-align: right; }
        .rp-note { font-size: 12px; color: ${TEXT_MUTED}; line-height: 1.5; margin: 0 0 12px; }
        .rp-acts { display: flex; gap: 6px; margin-top: 18px; padding-top: 14px; border-top: 1px solid ${DS_BORDER}; }
        .rp-keysbtn { margin-top: 22px; display: inline-flex; align-items: center; gap: 8px; height: 32px; padding: 0 12px 0 6px; border-radius: 999px; border: 1px solid ${DS_BORDER}; background: none; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .rp-keysbtn span { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font-weight: 700; }
        .rp-keysbtn:hover, .rp-keysbtn[aria-expanded="true"] { color: ${TEXT_PRIMARY}; border-color: ${TEXT_MUTED}; }
        .rp-keysbtn + .rp-keys { margin-top: 12px; }
        .rp-keys { display: grid; grid-template-columns: 1fr; gap: 6px; font-size: 12px; color: ${TEXT_MUTED}; }
        .rp-keys div { display: flex; align-items: center; gap: 8px; } .rp-keys kbd { font: 600 12px 'Inter', sans-serif; color: ${TEXT_PRIMARY}; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; border-radius: 5px; padding: 2px 6px; white-space: nowrap; min-width: 86px; text-align: center; }
        .tm-tabs { display: flex; gap: 4px; background: ${SURFACE_2}; border-radius: 10px; padding: 3px; margin-bottom: 14px; }
        .tm-tabs button { flex: 1; border: none; background: none; color: ${TEXT_MUTED}; font: 600 12.5px 'Inter', sans-serif; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
        .tm-tabs button.on { background: ${SURFACE_1}; color: ${TEXT_PRIMARY}; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .tm-wrap { margin-bottom: 6px; }
        .tm-lab { font-size: 12px; color: ${TEXT_MUTED}; margin: 14px 0 7px; }
        .tm { border: 1px solid ${DS_BORDER}; border-radius: 14px; margin-bottom: 10px; background: ${SURFACE_BASE}; overflow: hidden; }
        .tm.open { border-color: ${DS_BORDER_STRONG}; }
        .tm-head { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: none; padding: 10px 12px; color: ${TEXT_PRIMARY}; cursor: pointer; text-align: left; font-family: 'Inter', sans-serif; }
        .tm-name { flex: 1; min-width: 0; display: flex; flex-direction: column; } .tm-name b { font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tm-name small { font-size: 12px; color: ${TEXT_MUTED}; }
        .tm-chev { color: ${TEXT_MUTED}; transition: transform .15s; flex: none; } .tm.open .tm-chev { transform: rotate(180deg); }
        .tm-body { padding: 2px 12px 12px; }
        .tm-forms { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .tm-form { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 7px 4px 6px; border-radius: 10px; border: 1px solid ${DS_BORDER}; background: ${SURFACE_1}; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; }
        .tm-form:hover { color: ${TEXT_PRIMARY}; } .tm-form.on { border-color: ${ACCENT_SOLID}; color: ${TEXT_PRIMARY}; box-shadow: 0 0 0 2px ${ACCENT_SOFT}; }
        .tm-kits { display: flex; flex-wrap: wrap; gap: 3px; }
        .tm-kit { padding: 2px; border-radius: 50%; border: 2px solid transparent; background: none; cursor: pointer; } .tm-kit.on { border-color: ${ACCENT_SOLID}; } .tm-kit:hover { transform: scale(1.1); }
        .tm-links { display: flex; align-items: center; gap: 7px; margin-top: 8px; color: ${TEXT_MUTED}; font-size: 12px; }
        .tm-link { background: none; border: none; padding: 0; margin-top: 8px; color: ${TEXT_MUTED}; font: 600 12px 'Inter', sans-serif; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; } .tm-link:hover { color: ${TEXT_PRIMARY}; }
        .tm-links .tm-link { margin-top: 0; }
        .tm-own { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
        .tm-cols { display: flex; gap: 14px; } .tm-cols label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: ${TEXT_MUTED}; }
        .tm-cols input { width: 44px; height: 30px; padding: 0; border: 1px solid ${DS_BORDER}; border-radius: 8px; background: none; cursor: pointer; }
        .tm-acts { display: flex; margin-top: 12px; }
        .tm-names { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; align-items: flex-start; } .tm-names .rp-inp { font-size: 13px; }
        .tm-squad { display: flex; gap: 6px; align-items: center; width: 100%; } .tm-squad select { flex: 1; }
        .rp-start { overflow-y: auto; padding: 40px 32px; }
        .rp-start h1 { font-size: 30px; letter-spacing: -.03em; margin: 0 0 6px; } .rp-start > p { color: ${TEXT_MUTED}; margin: 0 0 26px; }
        .rp-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 18px; max-width: 1180px; }
        .rp-tpl { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER}; border-radius: 16px; padding: 10px; cursor: pointer; text-align: left; color: ${TEXT_PRIMARY}; font-family: 'Inter', sans-serif; transition: transform .15s, border-color .15s; }
        .rp-tpl:hover, .rp-tpl:focus-visible { transform: translateY(-3px); border-color: ${ACCENT_SOLID}; outline: none; }
        .rp-tpl .th { aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: #0f1114; }
        .rp-tpl b { display: block; font-size: 15px; margin: 12px 4px 4px; } .rp-tpl span { display: block; font-size: 12.5px; color: ${TEXT_MUTED}; margin: 0 4px 6px; line-height: 1.45; }
        .rp-banner { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); z-index: 20; background: ${SURFACE_1}; border: 1px solid ${DS_ERROR}; border-radius: 12px; padding: 10px 12px; display: flex; gap: 10px; align-items: center; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.4); max-width: calc(100% - 24px); }
        .rp-scrim { position: fixed; inset: 0; background: ${SCRIM}; z-index: 50; display: grid; place-items: center; padding: 20px; }
        .rp-modal { background: ${SURFACE_1}; border: 1px solid ${DS_BORDER_STRONG}; border-radius: 18px; width: min(860px, 100%); max-height: 82vh; display: flex; flex-direction: column; }
        .rp-modal header { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid ${DS_BORDER}; font-weight: 700; }
        .rp-list { overflow-y: auto; padding: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
        .rp-card { border: 1px solid ${DS_BORDER}; border-radius: 12px; overflow: hidden; background: ${SURFACE_BASE}; display: flex; flex-direction: column; }
        .rp-card .th { aspect-ratio: 1; cursor: pointer; background: #0f1114; display: grid; place-items: center; overflow: hidden; }
        .rp-card .meta { padding: 9px 10px; display: flex; align-items: center; gap: 6px; } .rp-card .t { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .rp-card .d { font-size: 12px; color: ${TEXT_MUTED}; }
        .rp-toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); background: ${TEXT_PRIMARY}; color: ${SURFACE_BASE}; font: 500 13px 'Inter', sans-serif; padding: 10px 16px; border-radius: 999px; z-index: 60; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: calc(100vw - 32px); }
        .rp-busy { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 55; display: grid; place-items: center; color: #fff; font: 600 14px 'Inter', sans-serif; }
        .rp-spin { animation: rpSpin 1s linear infinite; } @keyframes rpSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .rp-spin { animation: none; } .rp-tpl { transition: none; } }
        @media (max-width: 1100px) { .rp-body { grid-template-columns: 76px 1fr 270px; } .rp-hide-md { display: none; } }
        @media (max-width: 860px) {
          .rp-page { height: auto; min-height: 100vh; overflow: visible; grid-template-rows: auto auto; }
          .rp-top { flex-wrap: wrap; padding: 8px 12px; row-gap: 8px; } .rp-title { flex: 1 1 0; min-width: 0; } .rp-top .rp-sp { flex: 0 0 100%; height: 0; }
          .rp-body { grid-template-columns: 1fr; } .rp-rail { flex-direction: row; border-right: none; border-bottom: 1px solid ${DS_BORDER}; overflow-x: auto; } .rp-tool { min-width: 64px; } .rp-rail-cap { display: none; }
          .rp-mid { height: 92vw; max-height: 72vh; } .rp-insp { border-left: none; border-top: 1px solid ${DS_BORDER}; } .rp-hide-sm { display: none; }
        }
        @media (pointer: coarse) { .rp-tool kbd { display: none; } }
      `}</style>

      <header className="rp-top">
        <button className="rp-home" aria-label="Home" title="Home" onClick={() => navigate("/")}><PSMark size={28} color={ACCENT_SOLID} /></button>
        <input className="rp-title" aria-label="Report title" value={title} maxLength={80} placeholder={pieceName("Report", "", headlineOf(report), made.current)} onChange={e => setTitle(e.target.value)} />
        <span className={`rp-status${failed || status === "error" || status === "conflict" || status === "offline" ? " bad" : ""}`} aria-live="polite">
          {status === "conflict" ? "Changed in another tab"
            : status === "offline" ? <>Offline: kept here <button onClick={() => save()}>Retry</button></>
              : failed || status === "error" ? <>Not saved <button onClick={retry}>Retry</button></>
                : upCount ? <><Loader2 size={13} className="rp-spin" /> Uploading {upCount === 1 ? "photo" : `${upCount} photos`}…</>
                  : status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </span>
        <span className="rp-sp" />
        <button className="rp-icon" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (Ctrl Z)"><Undo2 size={16} /></button>
        <button className="rp-icon" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (Ctrl Shift Z)"><Redo2 size={16} /></button>
        <button className="rp-btn" onClick={openList}><FolderOpen size={15} /><span className="rp-hide-sm">My reports</span></button>
        <button className="rp-btn" onClick={() => navigate("/report")} aria-label="New report"><Plus size={15} /><span className="rp-hide-sm">New</span></button>
        <div style={{ position: "relative" }} data-export>
          <button className="rp-btn pri" disabled={phase !== "ready" || !!busy} onClick={() => setExportOpen(o => !o)} aria-expanded={exportOpen}><Download size={15} /> Export</button>
          {exportOpen && (
            <div className="rp-menu" role="menu">
              <button role="menuitem" onClick={() => doExport("png")}>PNG<small>{W} × {H}</small></button>
              <button role="menuitem" onClick={() => doExport("jpg")}>JPG<small>smaller file</small></button>
              <button role="menuitem" onClick={() => doExport("copy")}><Copy size={14} /> Copy image</button>
            </div>
          )}
        </div>
      </header>

      {phase === "missing" ? (
        <div style={{ display: "grid", placeItems: "center", textAlign: "center", padding: 30 }}>
          <div>
            <h2 style={{ margin: "0 0 8px" }}>That report isn't here</h2>
            <p style={{ color: TEXT_MUTED, margin: "0 0 18px" }}>It may have been deleted, or it belongs to another account.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="rp-btn pri" onClick={() => navigate("/report", { replace: true })}><Plus size={15} /> New report</button>
              <button className="rp-btn" onClick={openList}><FolderOpen size={15} /> My reports</button>
            </div>
          </div>
        </div>
      ) : phase === "start" ? (
        <div className="rp-start">
          <h1>Start a match report</h1>
          <p>Pick a starting point. Every word, block and colour can be changed, moved or deleted.</p>
          <div className="rp-tpls">
            {TEMPLATES.map(t => (
              <button key={t.id} className="rp-tpl" data-template={t.id} onClick={() => start(t.id)}>
                <div className="th"><ReportView report={makeTemplate(t.id)} brand={brand} handle={handle} logo={logo} media={{}} /></div>
                <b>{t.name}</b><span>{t.note}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="rp-body">
          <nav className="rp-rail" aria-label={mode.kind === "pitch" ? "Pitch tools" : "Add"}>
            {mode.kind === "pitch" ? <>
              <div className="rp-rail-cap">PITCH</div>
              {TOOLS.map(t => (
                <button key={t.id} className={`rp-tool${tool === t.id ? " on" : ""}`} aria-pressed={tool === t.id} title={`${t.name} (${t.key})`} onClick={() => { setTool(t.id); if (t.id !== "select") setSel({ bid: sel.bid, mid: null }) }}>
                  <kbd>{t.key}</kbd>{t.icon}{t.name}
                </button>
              ))}
            </> : <>
              <div className="rp-rail-cap">ADD</div>
              {ADD.map(a => <button key={a.id} className="rp-tool" data-add={a.id} onClick={() => add(a.id)} title={`Add ${a.name.toLowerCase()}`}>{a.icon}{a.name}</button>)}
              <span className="rp-sp" />
              <button className="rp-tool" onClick={() => navigate("/report")} title="A new report from a template (this one stays in My reports)"><LayoutTemplate size={18} />New</button>
            </>}
          </nav>
          <div className="rp-mid">
            {status === "conflict" && (
              <div className="rp-banner" role="alert">
                This report was changed in another tab or device.
                <button className="rp-btn sm" onClick={() => window.location.reload()}>Load that version</button>
                <button className="rp-btn sm pri" onClick={keepMine}>Keep mine</button>
              </div>
            )}
            <Canvas report={report} brand={brand} handle={handle} logo={logo} media={media} sel={sel} setSel={setSel} mode={mode} setMode={setMode} tool={tool}
              apply={apply} begin={begin} end={end} zoom={zoom} setZoom={setZoom} svgRef={svgRef} onEditText={onEditText}
              onPickPhoto={bid => { fileFor.current = bid; fileRef.current?.click() }} onDropFiles={(files, at) => {
                const slot = report.blocks.find(b => b.kind === "photo" && !b.src && at[0] >= b.x && at[0] <= b.x + (b as PhotoBlock).w && at[1] >= b.y && at[1] <= b.y + (b as PhotoBlock).h)
                addPhotos(files, at, slot?.id ?? null)
              }} hint={hint} />
            <div className="rp-zoom">
              <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, z / 1.2))}><ZoomOut size={14} /></button>
              <span style={{ width: 44, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
              <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z * 1.2))}><ZoomIn size={14} /></button>
              <button aria-label="Fit" title="Fit the page" onClick={() => setZoom(1)}><Maximize size={14} /></button>
            </div>
          </div>
          <Panel report={report} block={pitch ?? block} mark={mark} mode={mode} tool={tool} setReport={patch => change(r => ({ ...r, ...patch }))} setBlock={setBlock} setMark={setMark}
            begin={begin} end={end} textRef={textRef} nameRef={nameRef} act={act} reformat={reformat}
            team={{ setTeam, place: (i, f) => placeTeam(i, f), moment: setMoment, count: countTeam, namesText: teamNames, roster: teamRoster, lineup: teamLineup }}
            storyAuto={cardColours(brand).disc} />
        </div>
      )}

      <textarea ref={catcher} aria-hidden="true" tabIndex={-1} style={{ position: "fixed", left: -9999, top: 0, width: 1, height: 1, opacity: 0 }} />
      <input ref={fileRef} id="rp-files" type="file" accept="image/png,image/jpeg,image/webp" multiple style={{ display: "none" }}
        onChange={e => { addPhotos([...(e.target.files ?? [])], undefined, fileFor.current); fileFor.current = null; e.target.value = "" }} />

      {listOpen && (
        <div className="rp-scrim" onClick={() => setListOpen(false)}>
          <div className="rp-modal" role="dialog" aria-label="My reports" onClick={e => e.stopPropagation()}>
            <header>My reports<span className="rp-sp" /><button className="rp-icon" aria-label="Close" onClick={() => setListOpen(false)}><X size={16} /></button></header>
            {list === null ? <p style={{ padding: 18, color: TEXT_MUTED }}>Loading…</p>
              : list.length === 0 ? <p style={{ padding: 18, color: TEXT_MUTED }}>Nothing saved yet. Pick a template and it saves by itself.</p>
                : <div className="rp-list">
                  {list.map(r => {
                    const rep = user ? readReport(r.data, user.id) : EMPTY
                    const go = () => { setListOpen(false); if (r.id !== rid) navigate(`/report?open=${r.id}`) }
                    return (
                      <div key={r.id} className="rp-card">
                        <div className="th" onClick={go} role="button" aria-label={`Open ${r.title}`}><ReportView report={rep} brand={brand} handle={handle} logo={logo} media={r.id === rid ? media : links} /></div>
                        <div className="meta">
                          <div style={{ flex: 1, minWidth: 0 }}><div className="t">{listName("Report", r.title, r.updated_at)}{r.id === rid ? " (open)" : ""}</div><div className="d">{relTime(r.updated_at)}</div></div>
                          {confirmDel === r.id ? <>
                            <button className="rp-btn sm" style={{ borderColor: DS_ERROR, color: DS_ERROR }} onClick={() => deleteReport(r)}>Delete</button>
                            <button className="rp-btn sm" onClick={() => setConfirmDel(null)}>Keep</button>
                          </> : <button className="rp-icon sm bad" aria-label={`Delete ${r.title}`} onClick={() => setConfirmDel(r.id)}><X size={14} /></button>}
                        </div>
                      </div>
                    )
                  })}
                  {more && <button className="rp-btn" style={{ gridColumn: "1 / -1", justifySelf: "center" }} onClick={loadMore}>Show more</button>}
                </div>}
          </div>
        </div>
      )}
      {busy && <div className="rp-busy" role="status"><span style={{ display: "flex", alignItems: "center", gap: 10 }}><Loader2 size={18} className="rp-spin" /> {busy}</span></div>}
      <div aria-live="polite">{toast && <div className="rp-toast">{toast}</div>}</div>
    </div>
  )
}
