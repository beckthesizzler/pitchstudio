import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleDot, Copy, Crosshair, Eraser, Flashlight, FolderInput, Images, Library as LibraryIcon, Loader2, MousePointer2, MoveUpRight, Pentagon, Plus, Redo2, Ruler, ScanEye, Spline, Tag as TagIcon, Trash2, Triangle, Type, Undo2, Clapperboard, X, Film } from "lucide-react"
import { Mark as PSMark } from "../brand/Mark"
import { Stage, START_DEFAULTS, type Defaults, type Tool } from "./Stage"
import { Inspector, inOrder } from "./Inspector"
import { CalibratePanel, pitchOf } from "./Calibrate"
import { VideoStudio, useClipFrames, stripTimes, fmtTime, stepsOf } from "./Video"
import { FilterDefs, DEFAULT_OPTS, RenderPanel, renderShot, canvasBlob, pictureFilter, type RenderOpts } from "./Render"
import { SUITE_CSS } from "./suiteCss"
import { fitCalib, type CalPoint } from "./calib"
import { findVideo, keepVideo, probeVideo, videoKey, videoProblem } from "./videoStore"
import { MAX_MARKS, downloadShot, exportFontCSS, moveMark, newId, prepareShot, unit, type Mark, type Notes, type Shot, type VideoProject } from "./model"
import { createItem, deleteItems, folderItems, itemPicPath, itemThumbPath, loadItem, moveItems, readShotData, readVideoData, reorder, saveItem, shotPayload, signed, uploadPic, videoPayload, withMatch, loadFolders, applyMatch, matchLine, DEFAULT_TEAMS, type Folder, type ItemRow, type ShotData, type Teams, type VideoData } from "./items"
import { firstUse, markGuide } from "./Guide"
import { PatternCoach, PatternStrip, PATTERN_CSS, type Pattern } from "./patterns"
import { nameHints, rememberNames, type NameHint } from "./names"

/* The edit suite: one shot or one video of a folder, with the folder's reel along the bottom.
   Library on the left (folded to a strip), the picture in the middle with its notes underneath, the mark panel on the right.
   Every panel folds away, and the panel widths are remembered. Everything saves itself a moment after each change. */

export type Who = { id: string; email: string }
const TOOLS: { id: Tool; name: string; key: string; icon: ReactNode }[] = [
  { id: "select", name: "Select", key: "V", icon: <MousePointer2 size={17} /> },
  { id: "tag", name: "Tag", key: "T", icon: <TagIcon size={17} /> },
  { id: "ring", name: "Ring", key: "R", icon: <CircleDot size={17} /> },
  { id: "tie", name: "Tie", key: "J", icon: <Spline size={17} /> },
  { id: "spot", name: "Spot", key: "S", icon: <Flashlight size={17} /> },
  { id: "zone", name: "Zone", key: "Z", icon: <Pentagon size={17} /> },
  { id: "arrow", name: "Arrow", key: "A", icon: <MoveUpRight size={17} /> },
  { id: "measure", name: "Measure", key: "M", icon: <Ruler size={17} /> },
  { id: "shadow", name: "Shadow", key: "H", icon: <Triangle size={17} /> },
  { id: "focus", name: "Focus", key: "F", icon: <ScanEye size={17} /> },
  { id: "text", name: "Text", key: "X", icon: <Type size={17} /> },
]
const GROUPS: Tool[][] = [["select"], ["tag", "ring", "tie", "spot"], ["zone", "arrow", "measure"], ["shadow", "focus", "text"]]
const BY_KEY: Record<string, Tool> = { v: "select", t: "tag", r: "ring", j: "tie", s: "spot", z: "zone", o: "oval", a: "arrow", l: "line", m: "measure", h: "shadow", f: "focus", x: "text", c: "calib" }
const TOUCH = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches
const HINTS: Record<Tool, string> = {
  select: "Click a mark to change it. Drag to move it.",
  tag: "Click a player's feet, then type the name.",
  ring: "Click a player's feet to put a ring on the grass.",
  tie: "Drag from one player to another to tie them. Ties follow the players.",
  spot: "Click a player's feet to light them up.",
  zone: "Drag a box, then pull its corners onto the pitch lines. Or click 4 corners.",
  oval: "Drag over a player or an area to circle it.",
  arrow: "Drag from where the move starts to where it ends. Pull the diamond to curve it.",
  line: "Drag from one player to another to link them.",
  measure: "Drag between two points to measure the distance on the grass.",
  shadow: "Drag from the ball to the presser: the shadow is the lane he takes away.",
  focus: "Drag over the area that matters. Everything else goes dark.",
  text: "Click where your note should go, then type it.",
  calib: "Pick a point on the little pitch, then click it on your Game Shot.",
}
const hintFor = (t: Tool) => (TOUCH ? HINTS[t].split("Click").join("Tap").split("click").join("tap") : HINTS[t])
const KEYS: [string, string][] = [["V", "Select"], ["T", "Tag"], ["R", "Ring"], ["J", "Tie"], ["S", "Spotlight"], ["Z", "Zone"], ["O", "Oval"], ["A", "Arrow"], ["L", "Line"], ["M", "Measure"], ["H", "Cover shadow"], ["F", "Focus"], ["X", "Text"], ["C", "Calibrate"],
  ["Del", "Remove the mark"], ["⌘Z", "Undo"], ["⌘⇧Z", "Redo"], ["⌘D", "Duplicate"], ["⌘S", "Save now"], ["Arrows", "Nudge"], ["+ / −", "Zoom"], ["Space drag", "Pan"], ["[ ]", "Previous / next shot"], ["⌘\\", "Hide the panels"], ["?", "These keys"]]
const store = { get: (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* not kept */ } } }

/** Files dropped or picked: kept here so a new video item can open its file straight away */
export const pendingFiles = new Map<string, File>()

export function Suite({ user, itemId, sealFor }: { user: Who; itemId: string; sealFor: (w: number, h: number) => ReactNode }) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading")
  const [row, setRow] = useState<{ id: string; folder_id: string | null; kind: "shot" | "video"; title: string; cover_path: string | null } | null>(null)
  const [title, setTitle] = useState("")
  const [shot, setShotS] = useState<ShotData | null>(null)
  const shotRef = useRef<ShotData | null>(null)
  const [vd, setVdS] = useState<VideoData | null>(null)
  const vdRef = useRef<VideoData | null>(null)
  const [src, setSrc] = useState<string | undefined>(undefined)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [momentSrc, setMomentSrc] = useState<Record<string, string>>({})
  const [sibs, setSibs] = useState<ItemRow[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [folders, setFolders] = useState<Folder[]>([])
  const [tool, setTool] = useState<Tool>("select")
  const [sel, setSel] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [calPick, setCalPick] = useState<string | null>(null)
  const [team, setTeam] = useState<"us" | "them">("us")
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [toast, setToast] = useState("")
  const [busy, setBusy] = useState("")
  const [keysOpen, setKeysOpen] = useState(false)
  const [renderOpen, setRenderOpen] = useState(false)
  const [ropts, setRopts] = useState<RenderOpts>(() => { try { return { ...DEFAULT_OPTS, ...JSON.parse(store.get("ps-render", "{}")) } } catch { return DEFAULT_OPTS } })
  const [rprev, setRprev] = useState<{ after: string | null; before: string | null }>({ after: null, before: null })
  const [voice, setVoice] = useState<AudioBuffer | null>(null)
  const [recording, setRecording] = useState(false)
  const [leftOpen, setLeftOpen] = useState(() => store.get("la-left", "0") === "1")
  const [rightOpen, setRightOpen] = useState(() => store.get("la-right", "1") === "1")
  const [rw, setRw] = useState(() => Math.max(260, Math.min(440, +store.get("la-rw", "300") || 300)))
  const [reelOpen, setReelOpen] = useState(() => store.get("la-reel", "1") === "1")
  const [picking, setPicking] = useState(false) // ticking shots in the reel
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [confirmDel, setConfirmDel] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [dragTile, setDragTile] = useState<string | null>(null)
  const [overTile, setOverTile] = useState<string | null>(null)
  const [dropOver, setDropOver] = useState(false)
  const [, force] = useState(0)
  const defaults = useRef<Defaults>(JSON.parse(JSON.stringify(START_DEFAULTS)))
  const stageRef = useRef<SVGSVGElement>(null)
  const textRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const exportVideo = useRef<((o?: RenderOpts, voice?: AudioBuffer | null) => Promise<void>) | null>(null)
  const frameRef = useRef<(() => Promise<string | null>) | null>(null)
  const openMomentRef = useRef<((id: string) => void) | null>(null)
  const savedJson = useRef(""), saving = useRef(false), again = useRef(false)
  const titleRef = useRef(title); titleRef.current = title
  const say = (t: string) => setToast(t)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3600); return () => clearTimeout(t) }, [toast])
  const setShot = (s: ShotData | null) => { shotRef.current = s; setShotS(s) }
  const setVd = (v: VideoData | null) => { vdRef.current = v; setVdS(v) }
  const kind = row?.kind ?? "shot"

  /* ── open ── */
  useEffect(() => {
    let off = false
    ;(async () => {
      let r
      try { r = await loadItem(itemId, user.id) } catch { r = null }
      if (off) return
      if (!r) { setPhase("missing"); return }
      setRow({ id: r.id, folder_id: r.folder_id, kind: r.kind, title: r.title, cover_path: r.cover_path })
      setTitle(r.title)
      if (r.kind === "shot") {
        const d = readShotData(r.data, user.id)
        setShot(d)
        savedJson.current = JSON.stringify({ t: r.title, d: shotPayload(d) })
        if (d.path) downloadShot(d.path).then(x => { if (!off) setSrc(x ?? "") })
        else setSrc("")
        setTeamColours(d.teams, "us")
      } else {
        const d = readVideoData(r.data)
        setVd(d)
        savedJson.current = JSON.stringify({ t: r.title, d: videoPayload(d) })
        const pend = pendingFiles.get(r.id)
        if (pend) setVideoFile(pend)
        else if (d.video) findVideo(d.video.key, d.video.size).then(f => { if (!off && f) setVideoFile(f) })
      }
      setStatus("saved")
      setPhase("ready")
      refreshReel(r.folder_id)
      ;(supabase_folders(user.id)).then(f => { if (!off) setFolders(f) })
      firstUse("suite")
    })()
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId])
  const refreshReel = async (folderId: string | null) => {
    try {
      const list = await folderItems(user.id, folderId)
      setSibs(list)
      const urls = await signed(list.map(x => x.cover_path).filter(Boolean) as string[])
      setThumbs(t => ({ ...t, ...urls }))
    } catch { /* the reel stays as it was */ }
  }

  /* ── saving ── */
  const payload = () => JSON.stringify({ t: titleRef.current, d: kind === "shot" ? (shotRef.current ? shotPayload(shotRef.current) : null) : (vdRef.current ? videoPayload(vdRef.current) : null) })
  const save = async (): Promise<boolean> => {
    if (!row || phase !== "ready") return true
    if (saving.current) { again.current = true; return true }
    const json = payload()
    if (json === savedJson.current) { setStatus("saved"); return true }
    saving.current = true; setStatus("saving")
    const p = JSON.parse(json)
    try { await saveItem(row.id, { data: p.d, title: p.t }) } catch { saving.current = false; setStatus("error"); return false }
    saving.current = false
    savedJson.current = json
    if (again.current) { again.current = false; return save() }
    setStatus(payload() === json ? "saved" : "saving")
    thumbSoon()
    return true
  }
  useEffect(() => {
    if (phase !== "ready") return
    if (payload() === savedJson.current) return
    setStatus("saving")
    const t = setTimeout(save, 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot, vd, title, phase])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (payload() !== savedJson.current || busy) { e.preventDefault(); e.returnValue = "" } }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  })
  /** Saves, then goes somewhere else */
  const go = async (to: string) => { await save(); navigate(to) }

  // The picture on the Library card: the shot with its marks, small, made a few seconds after a change
  const thumbTimer = useRef(0)
  const thumbSoon = () => { clearTimeout(thumbTimer.current); thumbTimer.current = window.setTimeout(makeThumb, 2500) }
  const makeThumb = async () => {
    if (!row) return
    try {
      let blob: Blob | null = null
      if (kind === "shot" && stageRef.current && src && shotRef.current) {
        const s = shotRef.current
        const cv = await renderShot({ svg: stageRef.current, src, w: s.w, h: s.h, notes: s.notes, opts: { ...DEFAULT_OPTS, notes: false, sharpen: false, clean: "off", look: "natural" }, maxW: 640 })
        blob = await canvasBlob(cv, "image/jpeg", 0.8)
      } else if (kind === "video" && frameRef.current && !row.cover_path) {
        const f = await frameRef.current()
        if (f) blob = await (await fetch(f)).blob().then(async b => { const img = await createImageBitmap(b); const c = document.createElement("canvas"); const k = 640 / img.width; c.width = 640; c.height = Math.round(img.height * k); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); return canvasBlob(c, "image/jpeg", 0.8) })
      }
      if (!blob) return
      const path = itemThumbPath(user.id, row.id)
      await uploadPic(path, blob)
      if (row.cover_path !== path) { await saveItem(row.id, { cover_path: path }); setRow(r => (r ? { ...r, cover_path: path } : r)) }
      const u = await signed([path]); setThumbs(t => ({ ...t, ...u, [row.id]: URL.createObjectURL(blob!) }))
    } catch { /* the card keeps its old picture */ }
  }

  /* ── undo and redo ── */
  const past = useRef<string[]>([]), future = useRef<string[]>([]), pending = useRef<string | null>(null)
  const snap = () => JSON.stringify(kind === "shot" ? shotRef.current : vdRef.current?.video ?? null)
  const begin = () => { if (pending.current === null) pending.current = snap() }
  const end = () => {
    const p = pending.current
    pending.current = null
    if (p !== null && p !== snap()) { past.current.push(p); if (past.current.length > 150) past.current.shift(); future.current = []; force(n => n + 1) }
  }
  const restore = (j: string) => {
    const v = JSON.parse(j)
    if (kind === "shot") setShot(v)
    else if (vdRef.current) { setVd({ ...vdRef.current, video: v }); if (editing && !(v as VideoProject | null)?.moments.some(m => m.id === editing)) setEditing(null) }
  }
  const undo = () => { end(); const prev = past.current.pop(); if (prev === undefined) return; future.current.push(snap()); restore(prev); setSel(null); force(n => n + 1) }
  const redo = () => { end(); const next = future.current.pop(); if (next === undefined) return; past.current.push(snap()); restore(next); setSel(null); force(n => n + 1) }

  /* ── the picture being drawn on: the shot, or the open moment of the video ── */
  const video = vd?.video ?? null
  const moment = kind === "video" && video && editing ? video.moments.find(m => m.id === editing) ?? null : null
  const stageShot: Shot | null = kind === "shot" ? (shot ? { id: row?.id ?? "shot", path: shot.path, w: shot.w, h: shot.h, dim: shot.dim, items: shot.items, calib: shot.calib } : null)
    : moment && video ? { id: moment.id, path: "video", w: video.w, h: video.h, dim: moment.dim, items: moment.items, calib: moment.calib ?? null } : null
  const stageSrc = kind === "shot" ? src || undefined : moment ? momentSrc[moment.id] : undefined
  const fit = useMemo(() => fitCalib(stageShot?.calib), [stageShot?.calib]) // eslint-disable-line react-hooks/exhaustive-deps
  const selMark = stageShot && sel ? stageShot.items.find(m => m.id === sel) ?? null : null
  const teams: Teams = (kind === "shot" ? shot?.teams : vd?.teams) ?? DEFAULT_TEAMS

  const setVideo = (fn: (p: VideoProject) => VideoProject) => { const v = vdRef.current; if (v?.video) setVd({ ...v, video: fn(v.video) }) }
  const editMoment = (fn: (m: VideoProject["moments"][number]) => VideoProject["moments"][number]) => { if (editing) setVideo(p => ({ ...p, moments: p.moments.map(x => (x.id === editing ? fn(x) : x)) })) }
  const applyItems = (fn: (items: Mark[]) => Mark[]) => {
    if (kind === "shot") { const s = shotRef.current; if (s) setShot({ ...s, items: fn(s.items) }) }
    else editMoment(m => ({ ...m, items: fn(m.items) }))
  }
  const setCalibPts = (pts: CalPoint[]) => {
    const c = pts.length ? { pts: pts.map(q => ({ ...q, pitch: pitchOf(q.id) ?? q.pitch })) } : null
    if (kind === "shot") { const s = shotRef.current; if (s) setShot({ ...s, calib: c }) } else editMoment(m => ({ ...m, calib: c }))
  }
  const setTeams = (t: Teams) => {
    if (kind === "shot") { const s = shotRef.current; if (s) setShot({ ...s, teams: t }) } else { const v = vdRef.current; if (v) setVd({ ...v, teams: t }) }
    setTeamColours(t, team)
  }
  function setTeamColours(t: Teams, which: "us" | "them") {
    const c = t[which].color, d = defaults.current
    d.tag.color = c; d.ring.color = c; d.spot.color = c; d.tie.color = which === "us" ? c : t.them.color
  }
  const pickTeam = (which: "us" | "them") => { setTeam(which); setTeamColours(teams, which) }
  useEffect(() => { setTeamColours(teams, team) }, [teams.us.color, teams.them.color]) // eslint-disable-line react-hooks/exhaustive-deps

  const create = (m: Mark) => {
    if (!stageShot) return
    if (stageShot.items.length >= MAX_MARKS) { say(`A Game Shot holds ${MAX_MARKS} marks.`); return }
    const next = Math.max(0, ...stageShot.items.map((x, i) => x.step ?? i + 1)) + 1
    begin(); applyItems(items => [...items, { ...m, step: next } as Mark]); end(); setSel(m.id)
    markGuide("mark")
  }
  const kindKey = (m: Mark): keyof Defaults => (m.kind === "arrow" ? (m.head === "none" ? "line" : "arrow") : m.kind === "zone" && m.round ? "oval" : m.kind)
  const setMark = (patch: Partial<Mark>, live?: boolean) => {
    if (!selMark) return
    if (!live) begin()
    applyItems(items => items.map(x => (x.id === selMark.id ? ({ ...x, ...patch } as Mark) : x)))
    if (!live) end()
    const d = defaults.current[kindKey(selMark)] as Record<string, unknown>
    for (const k of Object.keys(patch)) if (k in d && k !== "color") d[k] = (patch as Record<string, unknown>)[k]
  }
  const del = () => { if (!selMark) return; begin(); applyItems(items => items.filter(x => x.id !== selMark.id).map(x => (x.kind === "tie" ? { ...x, ra: x.ra === selMark.id ? null : x.ra, rb: x.rb === selMark.id ? null : x.rb } : x))); end(); setSel(null) }
  const dup = () => { if (!selMark || !stageShot) return; create({ ...moveMark(selMark, 24 * unit(stageShot.w), 24 * unit(stageShot.w)), id: newId() } as Mark) }
  const restack = (front: boolean) => { if (!selMark) return; begin(); applyItems(items => { const rest = items.filter(x => x.id !== selMark.id); return front ? [...rest, selMark] : [selMark, ...rest] }); end() }
  const setDim = (v: number) => { if (kind === "shot") { const s = shotRef.current; if (s) setShot({ ...s, dim: v }) } else editMoment(m => ({ ...m, dim: v })) }
  const clearShot = () => { if (!stageShot?.items.length) return; begin(); applyItems(() => []); end(); setSel(null); say("Cleared. ⌘Z brings it all back.") }
  const [focusReq, setFocusReq] = useState(0)
  const focusText = () => setFocusReq(n => n + 1)
  useEffect(() => { if (focusReq) { textRef.current?.focus(); textRef.current?.select() } }, [focusReq])
  const pickTool = (t: Tool, quiet = false) => {
    setTool(cur => (t === "calib" && cur === "calib" && !quiet ? "select" : t))
    if (t !== "select") setSel(null)
    if (t === "calib") { setRightOpen(true); markGuide("calib") }
    if (!quiet && t !== "calib" && t !== "select" && firstUse("tool-" + t)) say(hintFor(t))
  }

  /* ── pattern starters: one step, one tool, moving on by itself once its mark is made ── */
  const [pattern, setPattern] = useState<{ p: Pattern; step: number } | null>(null)
  const kindsOf = (t: Tool) => (t === "zone" ? ["zone"] : t === "arrow" ? ["arrow"] : [t])
  const countFor = (t: Tool) => (t === "calib" ? (fitCalib(stageShot?.calib ?? { pts: [] }) ? 1 : 0) : (stageShot?.items ?? []).filter(m => kindsOf(t).includes(m.kind)).length)
  const patBase = useRef(0)
  const goStep = (step: number) => {
    if (!pattern) return
    const t = pattern.p.steps[step].tool
    patBase.current = countFor(t)
    setPattern({ ...pattern, step })
    pickTool(t, true)
  }
  const startPattern = (p: Pattern) => {
    patBase.current = 0
    setPattern({ p, step: 0 })
    pickTool(p.steps[0].tool, true)
    patBase.current = countFor(p.steps[0].tool)
    if (notes && !notes.head.trim() && !notes.body.trim()) setNotes({ ...notes, head: p.head, body: p.body })
    ;(window as any).posthog?.capture("analysis_pattern_started", { pattern: p.id })
  }
  useEffect(() => {
    if (!pattern) return
    const t = pattern.p.steps[pattern.step].tool
    if (countFor(t) <= patBase.current) return
    const t0 = setTimeout(() => {
      if (pattern.step < pattern.p.steps.length - 1) goStep(pattern.step + 1)
      else { setPattern(null); pickTool("select", true); say(`${pattern.p.name}: done. Fill in the __ in your notes.`) }
    }, t === "calib" ? 400 : 700)
    return () => clearTimeout(t0)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPattern(null) }, [row?.id, moment?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── player names for tags ── */
  const [hints, setHints] = useState<NameHint[]>([])
  useEffect(() => { let off = false; nameHints(teams.us.name, teams.them.name).then(h => { if (!off) setHints(h) }); return () => { off = true } }, [teams.us.name, teams.them.name, row?.id])
  useEffect(() => { if (status === "saved") rememberNames((stageShot?.items ?? []).flatMap(m => (m.kind === "tag" && m.label.trim() ? [m.label] : []))) }, [status]) // eslint-disable-line react-hooks/exhaustive-deps
  // a note left empty is removed when you move on
  const prevSel = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevSel.current; prevSel.current = sel
    if (!prev || prev === sel || !stageShot) return
    const m = stageShot.items.find(x => x.id === prev)
    if (m && m.kind === "text" && !m.text.trim()) { begin(); applyItems(items => items.filter(x => x.id !== prev)); end() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  /* ── notes ── */
  const notes: Notes | null = kind === "shot" ? shot?.notes ?? null : moment?.caption ?? null
  const setNotes = (n: Notes) => {
    if (kind === "shot") { const s = shotRef.current; if (s) setShot({ ...s, notes: n }) } else editMoment(m => ({ ...m, caption: n }))
    if (n.head.trim()) markGuide("notes")
  }

  /* ── adding shots and videos to this folder ── */
  const addFiles = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/")), vids = files.filter(f => f.type.startsWith("video/") || /\.(mov|mp4|m4v|webm)$/i.test(f.name))
    if (!imgs.length && !vids.length) { say("Use a screenshot (PNG, JPG, WebP) or a clip (MP4, MOV, WebM)."); return }
    await save()
    const made: string[] = []
    let n = Math.max(0, ...sibs.map(x => x.sort)) + 1
    const match = folders.find(f => f.id === row?.folder_id)?.match ?? null
    for (const f of imgs) {
      setBusy(`Adding ${made.length + 1} of ${imgs.length}…`)
      let prep
      try { prep = await prepareShot(f) } catch (e) { say((e as Error).message === "too big" ? "That picture is over 25 MB." : "That picture couldn't be opened. Try a PNG or JPG."); continue }
      const id = newId(), path = itemPicPath(user.id, id)
      try {
        await uploadPic(path, prep.blob)
        await createItem(user.id, row?.folder_id ?? null, "shot", withMatch({ v: 2, path, w: prep.w, h: prep.h, dim: 0, items: [] }, match), { id, sort: n++, cover: path })
        made.push(id)
      } catch { say("Couldn't add a Game Shot. Check your connection and try again.") }
    }
    for (const f of vids.slice(0, 1)) {
      setBusy("Opening the clip…")
      try {
        const info = await probeVideo(f), key = videoKey(f), id = newId()
        await createItem(user.id, row?.folder_id ?? null, "video", withMatch({ v: 2, video: { name: f.name.slice(0, 200), key, size: f.size, dur: info.dur, w: info.w, h: info.h, inT: 0, outT: info.dur, moments: [] } }, match), { id, sort: n++, title: f.name.replace(/\.[^.]+$/, "").slice(0, 80) })
        pendingFiles.set(id, f)
        keepVideo(f, key)
        made.push(id)
        ;(window as any).posthog?.capture("video_imported", { seconds: Math.round(info.dur) })
      } catch (e) { say(videoProblem(e)) }
    }
    setBusy("")
    if (made.length) { (window as any).posthog?.capture("analysis_shot_added", { n: made.length }); markGuide("drop"); navigate(`/analysis?item=${made[0]}`) }
  }
  /** The video's file found again (or picked on another computer) */
  const chooseVideoFile = async (f: File) => {
    const v = vdRef.current
    if (!v?.video) return
    try { await probeVideo(f) } catch (e) { say(videoProblem(e)); return }
    if (videoKey(f) !== v.video.key && f.size !== v.video.size) { say("That's a different clip. Add it as a new Game Film instead."); return }
    setVideoFile(f); keepVideo(f, v.video.key)
  }

  /* ── the reel ── */
  const here = sibs.findIndex(s => s.id === row?.id)
  const step = (by: number) => { const n = sibs[here + by]; if (n) go(`/analysis?item=${n.id}`) }
  const dropTile = async (onto: string) => {
    if (!dragTile || dragTile === onto) return
    const ids = sibs.map(s => s.id).filter(id => id !== dragTile)
    ids.splice(ids.indexOf(onto), 0, dragTile)
    setSibs(ids.map(id => sibs.find(s => s.id === id)!))
    reorder(ids).catch(() => say("Couldn't save the new order."))
  }
  const deleteTicked = async () => {
    const ids = [...ticked]
    setConfirmDel(false)
    try { await deleteItems(ids.map(id => ({ id })), user.id) } catch { say("Couldn't delete them. Try again."); return }
    setTicked(new Set()); setPicking(false)
    if (row && ids.includes(row.id)) {
      const rest = sibs.filter(s => !ids.includes(s.id))
      savedJson.current = payload() // nothing left to save
      navigate(rest[0] ? `/analysis?item=${rest[0].id}` : row.folder_id ? `/analysis?folder=${row.folder_id}` : "/analysis?view=library")
    } else refreshReel(row?.folder_id ?? null)
  }
  const moveTicked = async (folder: string | null) => {
    const ids = picking ? [...ticked] : row ? [row.id] : []
    setMoveOpen(false)
    try { await moveItems(ids, folder) } catch { say("Couldn't move them. Try again."); return }
    // the folder's match: on the open one here (so the next save keeps it), on the others in the database
    const m = folder ? folders.find(f => f.id === folder)?.match ?? null : null
    if (m && folder) {
      const others = ids.filter(id => id !== row?.id)
      if (others.length) applyMatch(user.id, folder, m, others).catch(() => {})
      if (row && ids.includes(row.id)) {
        const teams = { us: { name: (m.home || "Us").slice(0, 20), color: m.homeColor }, them: { name: (m.away || "Them").slice(0, 20), color: m.awayColor } }
        const fill = (n: Notes): Notes => ({ ...n, kicker: n.kicker.trim() ? n.kicker : matchLine(m) })
        if (kind === "shot") { const s0 = shotRef.current; if (s0) setShot({ ...s0, teams, notes: fill(s0.notes) }) } else { const v0 = vdRef.current; if (v0) setVd({ ...v0, teams }) }
      }
    }
    const name = folder ? folders.find(f => f.id === folder)?.name ?? "the folder" : "Unsorted"
    say(`Moved ${ids.length === 1 ? "it" : ids.length} to ${name}.`)
    setTicked(new Set()); setPicking(false)
    if (row && ids.includes(row.id)) setRow({ ...row, folder_id: folder })
    refreshReel(row && ids.includes(row.id) ? folder : row?.folder_id ?? null)
  }

  /* ── render ── */
  const fileBase = (title.trim() || notes?.head.trim() || "Analysis").replace(/[^A-Za-z0-9 _.()-]+/g, "").trim().slice(0, 60) || "Analysis"
  const save1 = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 60000) }
  const shotCanvas = async (o: RenderOpts, maxW?: number) => {
    const s = shotRef.current
    if (!s || !stageRef.current || !src) throw new Error("not loaded")
    const keep = sel; setSel(null); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    try { return await renderShot({ svg: stageRef.current, src, w: s.w, h: s.h, notes: s.notes, opts: o, maxW }) } finally { setSel(keep) }
  }
  // the preview in the Render panel follows its options
  useEffect(() => {
    if (!renderOpen) return
    store.set("ps-render", JSON.stringify(ropts))
    let off = false
    const t = setTimeout(async () => {
      try {
        if (kind === "shot") { const cv = await shotCanvas(ropts, 1100); if (!off) setRprev({ after: cv.toDataURL("image/jpeg", 0.86), before: null }) }
        else {
          const f = await frameRef.current?.()
          if (!f || off) return
          const img = await new Promise<HTMLImageElement>(ok => { const i = new Image(); i.onload = () => ok(i); i.src = f })
          const c = document.createElement("canvas"); c.width = img.width; c.height = img.height
          const x = c.getContext("2d")!; x.filter = pictureFilter(ropts); x.drawImage(img, 0, 0)
          if (!off) setRprev({ after: c.toDataURL("image/jpeg", 0.88), before: f })
        }
      } catch { /* the preview waits */ }
    }, 220)
    return () => { off = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderOpen, ropts, editing])
  const doRender = async () => {
    if (kind === "shot") {
      setBusy("Rendering…")
      try {
        const cv = await shotCanvas(ropts)
        save1(await canvasBlob(cv, ropts.file === "jpg" ? "image/jpeg" : "image/png", 0.93), `${fileBase}.${ropts.file}`)
        ;(window as any).posthog?.capture("analysis_exported", { format: ropts.file, crop: ropts.format, look: ropts.look })
        markGuide("render"); setRenderOpen(false); say("Your picture is downloading.")
      } catch (e) { console.error(e); say("Couldn't make the picture. Try again.") } finally { setBusy("") }
    } else {
      setRenderOpen(false)
      await exportVideo.current?.(ropts, voice)
      markGuide("render")
    }
  }
  const doCopy = async () => {
    setBusy("Copying…")
    try { const cv = await shotCanvas(ropts); await navigator.clipboard.write([new ClipboardItem({ "image/png": await canvasBlob(cv, "image/png") })]); say("Copied. Paste it into your post.") }
    catch { say("Couldn't copy here. Render the picture instead.") } finally { setBusy("") }
  }
  // the voice-over: the clip plays while you talk
  const recRef = useRef<MediaRecorder | null>(null)
  const recordVoice = async () => {
    if (recording) { recRef.current?.stop(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream), parts: Blob[] = []
      rec.ondataavailable = e => parts.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop()); setRecording(false)
        try { const ac = new OfflineAudioContext(2, 48000, 48000); setVoice(await ac.decodeAudioData(await new Blob(parts).arrayBuffer())); say("Voice-over ready. It plays over the sound.") } catch { say("Couldn't use that recording.") }
      }
      recRef.current = rec; rec.start(); setRecording(true)
      say("Recording. Talk over your clip, then press Stop.")
    } catch { say("PitchStudio needs your microphone for a voice-over.") }
  }

  /* ── keys, paste, drop ── */
  useEffect(() => {
    const typing = (t: EventTarget | null) => { const e = t as HTMLElement | null; return !!e && (e.tagName === "INPUT" || e.tagName === "TEXTAREA" || e.tagName === "SELECT" || e.isContentEditable) }
    const down = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save().then(ok => say(ok ? "Saved." : "Not saved. Check your connection.")); return }
      if (mod && e.key === "\\") { e.preventDefault(); const open = !(rightOpen || reelOpen); setRightOpen(open); setReelOpen(open); return }
      if (renderOpen || keysOpen) { if (e.key === "Escape" && keysOpen) setKeysOpen(false); return }
      if (typing(e.target)) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return }
      if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); dup(); return }
      if (mod || e.altKey) return
      if (e.key === "?") { setKeysOpen(true); return }
      if (e.key === "[") { step(-1); return }
      if (e.key === "]") { step(1); return }
      if (!stageShot) return
      if (e.key === "Delete" || e.key === "Backspace") { if (selMark) { e.preventDefault(); del() } return }
      if (e.key === "Escape") { if (sel) setSel(null); else if (tool === "calib") { setTool("select"); setCalPick(null) } else setTool("select"); return }
      if (e.key.startsWith("Arrow") && selMark) {
        e.preventDefault()
        const st = (e.shiftKey ? 10 : 1) * 2 * unit(stageShot.w)
        const [dx, dy] = e.key === "ArrowLeft" ? [-st, 0] : e.key === "ArrowRight" ? [st, 0] : e.key === "ArrowUp" ? [0, -st] : [0, st]
        begin(); applyItems(items => items.map(x => (x.id === selMark.id ? moveMark(x, dx, dy) : x)))
        return
      }
      if (e.key === "+" || e.key === "=") { setZoom(z => Math.min(6, z * 1.25)); return }
      if (e.key === "-" || e.key === "_") { setZoom(z => Math.max(1, z / 1.25)); return }
      if (e.key === "0") { setZoom(1); return }
      const t = BY_KEY[e.key.toLowerCase()]
      if (t) pickTool(t)
    }
    const up = (e: KeyboardEvent) => { if (e.key.startsWith("Arrow")) end() }
    const paste = (e: ClipboardEvent) => {
      if (typing(e.target)) return
      const files = [...(e.clipboardData?.files ?? [])].filter(f => f.type.startsWith("image/"))
      if (!files.length) return
      e.preventDefault(); addFiles(files)
    }
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("paste", paste)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("paste", paste) }
  })
  const dragDepth = useRef(0)
  const onDragEnter = (e: React.DragEvent) => { if ([...e.dataTransfer.types].includes("Files")) { dragDepth.current++; setDropOver(true) } }
  const onDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropOver(false) }
  const onDrop = (e: React.DragEvent) => { if (![...e.dataTransfer.types].includes("Files")) return; e.preventDefault(); dragDepth.current = 0; setDropOver(false); addFiles([...e.dataTransfer.files]) }

  /* ── panels ── */
  const setRight = (v: boolean) => { setRightOpen(v); store.set("la-right", v ? "1" : "0") }
  const setReel = (v: boolean) => { setReelOpen(v); store.set("la-reel", v ? "1" : "0") }
  const setLeft = (v: boolean) => { setLeftOpen(v); store.set("la-left", v ? "1" : "0") }
  const edge = useRef<{ x: number; w: number } | null>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => { const d = edge.current; if (!d) return; setRw(Math.max(260, Math.min(440, d.w - (e.clientX - d.x)))) }
    const up = () => { if (edge.current) { edge.current = null; store.set("la-rw", String(rw)) } }
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up) }
  }, [rw])

  /* ── what it says at the top ── */
  const folderPath = (() => {
    const out: Folder[] = []
    let f = folders.find(x => x.id === row?.folder_id)
    while (f && out.length < 6) { out.unshift(f); f = folders.find(x => x.id === f!.parent_id) }
    return out
  })()
  const kindNo = sibs.filter(s => s.kind === kind).findIndex(s => s.id === row?.id) + 1
  const placeholder = notes?.head.trim() || (kind === "shot" ? `Game Shot ${kindNo || 1}` : video?.name.replace(/\.[^.]+$/, "") || "Game Film")
  const clipFrames = useClipFrames(kind === "video" ? videoFile : null, video ? stripTimes(video.dur) : [], 160)

  if (phase === "missing") return (
    <div className="la-page" style={{ display: "grid", placeItems: "center", gridTemplateColumns: "1fr", gridTemplateRows: "1fr" }}>
      <style>{SUITE_CSS}</style>
      <div className="la-empty"><h2>This isn't here</h2><p>It may have been deleted, or it belongs to another account.</p><button className="an-btn pri" onClick={() => navigate("/analysis?view=library")}>Back to Your Library</button></div>
    </div>
  )

  const calPanel = tool === "calib" && stageShot
  const momentPanel = kind === "video" && moment ? (
    <div className="an-moment">
      <p className="an-cap">Moment · {fmtTime(moment.t)}</p>
      <div className="an-row"><span className="an-lab">Lead-in</span>
        <div className="an-seg" role="group" aria-label="Lead-in">{(["off", "slow"] as const).map(v => <button key={v} className={(moment.lead ?? "off") === v ? "on" : ""} aria-pressed={(moment.lead ?? "off") === v} onClick={() => { begin(); editMoment(m => ({ ...m, lead: v })); end() }}>{v === "off" ? "Off" : "Slow 0.4×"}</button>)}</div>
      </div>
      <div className="an-row"><span className="an-lab">Caption</span>
        <div className="an-seg" role="group" aria-label="Where the caption sits">{(["auto", "top", "bottom"] as const).map(v => <button key={v} className={(moment.capAt ?? "auto") === v ? "on" : ""} aria-pressed={(moment.capAt ?? "auto") === v} title={v === "auto" ? "Top or bottom, whichever covers fewer marks" : undefined} onClick={() => { begin(); editMoment(m => ({ ...m, capAt: v === "auto" ? undefined : v })); end() }}>{v === "auto" ? "Auto" : v === "top" ? "Top" : "Bottom"}</button>)}</div>
      </div>
      <div className="an-row"><span className="an-lab">Hold</span>
        <div className="an-slide"><input type="range" min={1} max={15} step={0.5} value={moment.hold} aria-label="How long it freezes" onPointerDown={begin} onChange={e => editMoment(m => ({ ...m, hold: +e.target.value }))} onPointerUp={end} /><span>{moment.hold.toFixed(1)} s</span></div>
      </div>
      <p className="an-cap" style={{ marginTop: 6 }}>Build steps</p>
      {stepsOf(moment).length ? stepsOf(moment).map((s, k) => (
        <div key={s.step} className="an-buildstep">
          <input type="number" min={0} max={14} step={0.1} value={+s.at.toFixed(1)} aria-label={`Step ${k + 1} appears after`}
            onFocus={begin} onBlur={end} onChange={e => { const v = Math.max(0, Math.min(14, +e.target.value || 0)); editMoment(m => ({ ...m, steps: { ...(m.steps ?? {}), [String(s.step)]: v } })) }} />
          <span>s</span><b>{s.marks.map(x => (x.kind === "tag" && x.label.trim()) || (x.kind === "zone" && x.label.trim()) || x.kind).slice(0, 3).join(", ")}{s.marks.length > 3 ? ` +${s.marks.length - 3}` : ""}</b>
        </div>
      )) : <p className="an-note">Draw on the frozen frame: each mark becomes a step that appears in turn.</p>}
      <div className="an-sep" />
    </div>
  ) : null

  return (
    <div className={`la-page${dropOver ? " over" : ""}`} style={{ ["--lw" as any]: leftOpen ? "248px" : "52px", ["--rw" as any]: rightOpen && stageShot ? `${rw}px` : "0px", ["--rh" as any]: reelOpen ? "128px" : "44px" }}
      onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault() }} onDrop={onDrop}>
      <style>{SUITE_CSS + MOMENT_CSS + PATTERN_CSS}</style>
      <FilterDefs />
      <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime,video/webm,.mov,.mp4,.m4v,.webm" multiple hidden onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) addFiles(f) }} />
      <input ref={videoInput} type="file" accept="video/mp4,video/quicktime,video/webm,.mov,.mp4,.m4v,.webm" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) chooseVideoFile(f) }} />

      {/* ── the top ── */}
      <header className="la-top">
        <button className="la-home" aria-label="Back to the folder" title={row?.folder_id ? "Back to the folder" : "Your Library"} onClick={() => go(row?.folder_id ? `/analysis?folder=${row.folder_id}` : "/analysis?view=library")}><PSMark size={28} color="#d7ff3c" /></button>
        <div className="la-crumb">
          <input className="la-title" aria-label="Title" value={title} maxLength={120} placeholder={placeholder} onChange={e => setTitle(e.target.value)} />
          <div className="la-sub">
            {status === "error" ? <span className="la-err">Not saved <button onClick={() => save()} style={{ color: "#ff8fa3", textDecoration: "underline" }}>Retry</button></span>
              : status === "saving" ? <span className="la-saving">Saving…</span> : <span className="la-saved">✓ Saved</span>}
            <span>·</span>
            <button onClick={() => go("/analysis?view=library")}>Your Library</button>
            {folderPath.map(f => <span key={f.id} style={{ display: "contents" }}><span>›</span><button onClick={() => go(`/analysis?folder=${f.id}`)}>{f.name}</button></span>)}
            {!row?.folder_id && <><span>›</span><button onClick={() => go("/analysis?folder=unsorted")}>Unsorted</button></>}
            {kindNo > 0 && <span>· {kind === "shot" ? "Game Shot" : "Game Film"} {kindNo} of {sibs.filter(s => s.kind === kind).length}</span>}
          </div>
        </div>
        <div className="la-sp" />
        <div className="la-seg" role="group" aria-label="Game Shots or Game Films">
          <button className={kind === "shot" ? "on" : ""} aria-pressed={kind === "shot"} onClick={() => { if (kind !== "shot") { const s = sibs.find(x => x.kind === "shot"); if (s) go(`/analysis?item=${s.id}`); else fileRef.current?.click() } }}><Images size={14} /> Game Shot</button>
          <button className={kind === "video" ? "on" : ""} aria-pressed={kind === "video"} onClick={() => { if (kind !== "video") { const s = sibs.find(x => x.kind === "video"); if (s) go(`/analysis?item=${s.id}`); else fileRef.current?.click() } }}><Clapperboard size={14} /> Game Film</button>
        </div>
        <div className="la-sp" />
        <button className="an-icon ghost" onClick={undo} disabled={!past.current.length} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={16} /></button>
        <button className="an-icon ghost" onClick={redo} disabled={!future.current.length} aria-label="Redo" title="Redo (⌘⇧Z)"><Redo2 size={16} /></button>
        {kind === "shot" && <button className="an-btn" onClick={doCopy} disabled={!src || !!busy} title="Copy the picture to paste into a post"><Copy size={15} /> Copy</button>}
        <button className="an-btn pri" onClick={() => { setRprev({ after: null, before: null }); setRenderOpen(true) }} disabled={kind === "shot" ? !src : !(video && videoFile)}><Film size={15} /> Render</button>
      </header>

      {/* ── the Library, folded to a strip ── */}
      <aside className="la-left" aria-label="Library">
        {leftOpen ? (
          <div className="la-tree">
            <h4>Your Library <button className="an-x" aria-label="Fold the Library" onClick={() => setLeft(false)}><ChevronLeft size={15} /></button></h4>
            <button className="la-fi" onClick={() => go("/analysis")}><Plus size={15} /> New analysis</button>
            <button className="la-fi" onClick={() => go("/analysis?view=library")}><LibraryIcon size={15} /> Your Library</button>
            {folders.filter(f => !f.parent_id).map(f => (
              <div key={f.id}>
                <button className={`la-fi${row?.folder_id === f.id ? " on" : ""}`} onClick={() => go(`/analysis?folder=${f.id}`)}><FolderGlyph /> {f.name}</button>
                {folders.filter(c => c.parent_id === f.id).map(c => <button key={c.id} className={`la-fi${row?.folder_id === c.id ? " on" : ""}`} style={{ paddingLeft: 30 }} onClick={() => go(`/analysis?folder=${c.id}`)}><FolderGlyph /> {c.name}</button>)}
              </div>
            ))}
            <button className={`la-fi${!row?.folder_id ? " on" : ""}`} onClick={() => go("/analysis?folder=unsorted")}><FolderGlyph dashed /> Unsorted</button>
          </div>
        ) : (
          <div className="la-strip">
            <button className="an-icon" aria-label="Open the Library" title="Library" onClick={() => setLeft(true)} style={{ borderColor: "rgba(215,255,60,.4)", color: "#d7ff3c" }}><LibraryIcon size={16} /></button>
            <button className="la-vert" onClick={() => setLeft(true)}>LIBRARY ›</button>
          </div>
        )}
      </aside>

      {/* ── the picture ── */}
      <main className="la-main">
        {stageShot && (
          <div className="la-chips">
            <button className={`la-chip${fit ? " v" : ""}${tool === "calib" ? " on" : ""}`} onClick={() => pickTool("calib")} title="Calibrate (C)">
              <Crosshair size={14} /> {fit ? `Calibrated · ${stageShot.calib?.pts.length} points` : stageShot.calib?.pts.length ? `Calibrate · ${stageShot.calib.pts.length} of 4` : "Calibrate"}
            </button>
            {(["us", "them"] as const).map(k => (
              <button key={k} className={`la-chip${team === k ? " on" : ""}`} aria-pressed={team === k} onClick={() => pickTeam(k)} title={`New marks in ${teams[k].name}'s colour`}>
                {teams[k].name} <i style={{ background: teams[k].color }} />
              </button>
            ))}
            <span className="la-sp" />
            {stageShot.items.length > 0 && <button className="la-chip" onClick={clearShot} title="Take every mark off (⌘Z brings them back)"><Eraser size={14} /> Clear {kind === "shot" ? "shot" : "moment"}</button>}
            <span className="la-chip" style={{ cursor: "default" }}>{Math.round(zoom * 100)}%</span>
          </div>
        )}
        <div className="la-stagebox">
          {kind === "video" ? (
            <VideoStudio project={video} file={videoFile} missing={!!video && !videoFile} editing={editing}
              onChoose={() => videoInput.current?.click()}
              onSet={fn => { begin(); setVideo(fn); end() }}
              onOpenMoment={(id, frame) => { if (id && frame) setMomentSrc(x => ({ ...x, [id]: frame })); setEditing(id); setSel(null); setZoom(1); if (id) markGuide("moment") }}
              onCapture={async blob => { await addFiles([new File([blob], "frame.jpg", { type: "image/jpeg" })]) }}
              seal={sealFor} fileBase={fileBase} exportRef={exportVideo} frameRef={frameRef} openRef={openMomentRef} frames={clipFrames} say={say}>
              {stageShot && <Stage shot={stageShot} src={stageSrc} tool={tool} sel={sel} zoom={zoom} setZoom={setZoom} defaults={defaults.current}
                onSelect={setSel} onCreate={create} apply={applyItems} begin={begin} end={end} onFocusText={focusText} seal={null} stageRef={stageRef}
                hint={hintFor(tool)} fit={fit} calPts={stageShot.calib?.pts} calPick={calPick} onCalib={(p, live) => { if (!live) begin(); setCalibPts(p); if (!live) end(); setCalPick(null) }} />}
            </VideoStudio>
          ) : stageShot ? (
            <Stage shot={stageShot} src={stageSrc} tool={tool} sel={sel} zoom={zoom} setZoom={setZoom} defaults={defaults.current}
              onSelect={setSel} onCreate={create} apply={applyItems} begin={begin} end={end} onFocusText={focusText} seal={sealFor(stageShot.w, stageShot.h)} stageRef={stageRef}
              hint={src === "" ? "This Game Shot couldn't be loaded. Check your connection and reopen it." : src ? hintFor(tool) : "Loading the Game Shot…"}
              fit={fit} calPts={stageShot.calib?.pts} calPick={calPick} onCalib={(p, live) => { if (!live) begin(); setCalibPts(p); if (!live) end(); setCalPick(null) }} />
          ) : <div className="la-empty"><Loader2 className="an-spin" size={22} color="#d7ff3c" /></div>}
          {kind === "shot" && stageShot && src && !stageShot.items.length && !pattern && <PatternStrip onPick={startPattern} />}
          {pattern && <PatternCoach p={pattern.p} step={pattern.step} setStep={goStep} onClose={() => { setPattern(null); pickTool("select", true) }} toolName={t => { const x = TOOLS.find(y => y.id === t); return t === "calib" ? "Calibrate · C" : x ? `${x.name} · ${x.key}` : t }} />}
          <datalist id="la-names">{hints.map(h => <option key={h.value} value={h.value} label={h.label} />)}</datalist>
          {stageShot && (kind === "shot" || moment) && (
            <div className="la-dock" role="toolbar" aria-label="Tools" style={kind === "video" ? { bottom: 92 } : undefined}>
              {GROUPS.map((g, gi) => (
                <span key={gi} style={{ display: "contents" }}>
                  {gi > 0 && <span className="sep" />}
                  {g.map(id => { const t = TOOLS.find(x => x.id === id)!; return (
                    <button key={id} className={`la-tool${tool === id || (id === "zone" && tool === "oval") || (id === "arrow" && tool === "line") ? " on" : ""}`} aria-pressed={tool === id} title={`${t.name} (${t.key})`} onClick={() => pickTool(id)}>{t.icon}<span>{t.name}</span></button>
                  ) })}
                </span>
              ))}
            </div>
          )}
        </div>
        {notes && stageShot && (kind === "shot" || moment) && (
          <div className={`la-notes${notes.show ? "" : " off"}`} aria-label={kind === "shot" ? "Notes under the shot" : "Caption"}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input className="la-kick" value={notes.kicker} maxLength={80} placeholder={kind === "shot" ? "BARÇA V MADRID · BUILD-UP" : "CAPTION · SHOWS IN THE FREEZE"} aria-label="Kicker" onFocus={begin} onBlur={end} onChange={e => setNotes({ ...notes, kicker: e.target.value })} />
              <input className="la-head" value={notes.head} maxLength={90} placeholder="Your headline" aria-label="Headline" onFocus={begin} onBlur={end} onChange={e => setNotes({ ...notes, head: e.target.value })} />
              <textarea className="la-body" rows={Math.min(6, Math.max(2, Math.ceil(notes.body.length / 80) + (notes.body.match(/\n/g)?.length ?? 0)))} value={notes.body} maxLength={600} placeholder="What it shows, in a line or two. It goes under the picture when you render." aria-label="What it shows" onFocus={begin} onBlur={end} onChange={e => setNotes({ ...notes, body: e.target.value })} />
            </div>
            {kind === "shot" && (
              <div className="la-stats">
                {notes.stats.map((s, i) => (
                  <span key={i} className="la-stat"><input value={s} maxLength={24} aria-label={`Stat ${i + 1}`} placeholder="12 m · lines" onFocus={begin} onBlur={end} onChange={e => setNotes({ ...notes, stats: notes.stats.map((x, j) => (j === i ? e.target.value : x)) })} />
                    <button className="an-x" aria-label="Remove this stat" onClick={() => setNotes({ ...notes, stats: notes.stats.filter((_, j) => j !== i) })}><X size={12} /></button></span>
                ))}
                {notes.stats.length < 4 && <button className="la-tiny" onClick={() => setNotes({ ...notes, stats: [...notes.stats, ""] })} title="A number and what it is, e.g. 12 m · between lines"><Plus size={13} /> stat</button>}
                <button className={`la-tiny${notes.show ? " on" : ""}`} onClick={() => setNotes({ ...notes, show: !notes.show })} title="Put the notes under the picture when you render">{notes.show ? <Check size={13} /> : null} In render</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── the panel ── */}
      {stageShot && rightOpen && (
        <aside className="la-right" aria-label="Mark settings">
          <div className="la-edge" role="separator" aria-orientation="vertical" aria-label="Resize the panel" tabIndex={0}
            onPointerDown={e => { e.preventDefault(); edge.current = { x: e.clientX, w: rw } }} onDoubleClick={() => { setRw(300); store.set("la-rw", "300") }}
            onKeyDown={e => { if (e.key === "ArrowLeft") setRw(w => Math.min(440, w + 16)); if (e.key === "ArrowRight") setRw(w => Math.max(260, w - 16)) }} />
          <div className="la-rhead"><span className="an-cap" style={{ margin: 0 }}>{calPanel ? "Calibrate" : selMark ? "Mark" : kind === "shot" ? "This shot" : "This moment"}</span>
            <button className="an-x" aria-label="Fold the panel" title="Fold the panel (⌘\)" onClick={() => setRight(false)}><ChevronRight size={15} /></button></div>
          {calPanel ? (
            <CalibratePanel pts={stageShot.calib?.pts ?? []} pick={calPick} setPick={setCalPick} fit={fit}
              onRemove={id => { begin(); setCalibPts((stageShot.calib?.pts ?? []).filter(q => q.id !== id)); end() }}
              onClear={() => { begin(); setCalibPts([]); end() }} onDone={() => { setTool("select"); setCalPick(null) }} />
          ) : (
            <Inspector mark={selMark} shot={stageShot} set={setMark} begin={begin} end={end} textRef={textRef} onDuplicate={dup} onDelete={del} onFront={() => restack(true)} onBack={() => restack(false)}
              onDim={v => setDim(v)} where={kind === "shot" ? undefined : "Moment"} teams={teams} onTeams={t => setTeams(t)}
              onOrder={next => { begin(); applyItems(() => next); end() }} onSelect={id => setSel(id)} calibrated={!!fit} extra={momentPanel} />
          )}
        </aside>
      )}
      {stageShot && !rightOpen && <button className="la-unfold" aria-label="Open the panel" title="Open the panel" onClick={() => setRight(true)}><ChevronLeft size={15} /></button>}

      {/* ── the reel ── */}
      <section className="la-reel" aria-label="This folder">
        <div className="la-reelbar">
          <span className="lab">{folderPath.length ? folderPath[folderPath.length - 1].name : "Unsorted"} · {sibs.length}</span>
          {busy && <span style={{ color: "#d7ff3c", fontSize: 12.5, display: "inline-flex", gap: 6, alignItems: "center" }}><Loader2 size={13} className="an-spin" /> {busy}</span>}
          <span className="la-sp" />
          {picking ? <>
            <span style={{ fontSize: 12.5, color: "#c9ccd2" }}>{ticked.size} ticked</span>
            <button className="la-tiny" onClick={() => setTicked(ticked.size === sibs.length ? new Set() : new Set(sibs.map(s => s.id)))}>{ticked.size === sibs.length ? "None" : "All"}</button>
            <span style={{ position: "relative" }}>
              <button className="la-tiny" disabled={!ticked.size} onClick={() => setMoveOpen(o => !o)}><FolderInput size={13} /> Move to…</button>
              {moveOpen && <MoveMenu folders={folders} onPick={moveTicked} onClose={() => setMoveOpen(false)} />}
            </span>
            {confirmDel ? <>
              <span style={{ fontSize: 12.5, color: "#ff8fa3" }}>Delete {ticked.size}? This can't be undone.</span>
              <button className="la-tiny bad" onClick={deleteTicked}>Delete</button><button className="la-tiny" onClick={() => setConfirmDel(false)}>Keep</button>
            </> : <button className="la-tiny bad" disabled={!ticked.size} onClick={() => setConfirmDel(true)}><Trash2 size={13} /> Delete</button>}
            <button className="la-tiny" onClick={() => { setPicking(false); setTicked(new Set()); setConfirmDel(false) }}>Done</button>
          </> : <>
            <span style={{ position: "relative" }}>
              <button className="la-tiny" onClick={() => setMoveOpen(o => !o)} title="Move this to another folder"><FolderInput size={13} /> Move</button>
              {moveOpen && <MoveMenu folders={folders} onPick={moveTicked} onClose={() => setMoveOpen(false)} />}
            </span>
            <button className="la-tiny" onClick={() => setPicking(true)}>Select</button>
          </>}
          <button className="la-tiny" aria-label="Keys" title="Keys (?)" onClick={() => setKeysOpen(true)} style={{ width: 28, padding: 0, justifyContent: "center", border: `1px solid rgba(255,255,255,.14)` }}>?</button>
          <button className="la-tiny" aria-label={reelOpen ? "Fold the reel" : "Open the reel"} onClick={() => setReel(!reelOpen)}>{reelOpen ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
        </div>
        {reelOpen && (
          <div className="la-tiles" role="list">
            {sibs.map((s, i) => {
              const pic = thumbs[s.id] ?? (s.cover_path ? thumbs[s.cover_path] : undefined)
              return (
                <button key={s.id} role="listitem" className={`la-tile${s.id === row?.id ? " on" : ""}${overTile === s.id ? " over" : ""}`} style={pic ? { backgroundImage: `url(${pic})` } : undefined}
                  draggable={!picking} onDragStart={e => { setDragTile(s.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.id) }} onDragEnd={() => { setDragTile(null); setOverTile(null) }}
                  onDragOver={e => { if (dragTile) { e.preventDefault(); setOverTile(s.id) } }} onDrop={e => { if (dragTile) { e.preventDefault(); e.stopPropagation(); setOverTile(null); dropTile(s.id) } }}
                  aria-label={`${s.kind === "video" ? "Game Film" : "Game Shot"} ${i + 1}${s.title || s.head ? `: ${s.title || s.head}` : ""}`} aria-current={s.id === row?.id}
                  onClick={() => { if (picking) setTicked(t => { const n = new Set(t); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n }); else if (s.id !== row?.id) go(`/analysis?item=${s.id}`) }}>
                  <b>{i + 1}</b>
                  {s.kind === "video" && <span className="vid">▶ Game Film</span>}
                  {picking && <span className={`tick${ticked.has(s.id) ? " on" : ""}`}>{ticked.has(s.id) && <Check size={12} strokeWidth={3} />}</span>}
                </button>
              )
            })}
            <button className="la-add" onClick={() => fileRef.current?.click()} aria-label="Add Game Shots or a Game Film to this folder" title="Add Game Shots or a Game Film (or drop them anywhere)"><Plus size={20} /></button>
          </div>
        )}
      </section>

      {keysOpen && (
        <div className="la-keys" onPointerDown={e => { if (e.target === e.currentTarget) setKeysOpen(false) }}>
          <div role="dialog" aria-label="Keys">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h3>Keys</h3><button className="an-x" aria-label="Close" onClick={() => setKeysOpen(false)}><X size={16} /></button></div>
            <div className="grid">{KEYS.map(([k, t]) => <div key={k + t}><kbd>{k}</kbd>{t}</div>)}</div>
          </div>
        </div>
      )}
      {renderOpen && (
        <RenderPanel kind={kind} title={title.trim() || placeholder} w={kind === "shot" ? shot?.w ?? 1920 : video?.w ?? 1920} h={kind === "shot" ? shot?.h ?? 1080 : video?.h ?? 1080}
          opts={ropts} setOpts={setRopts} preview={rprev.after} before={rprev.before} busy={busy || null}
          onRender={doRender} onCopy={kind === "shot" ? doCopy : undefined} onClose={() => setRenderOpen(false)}
          voice={!!voice} onVoice={kind === "video" ? recordVoice : undefined} recording={recording} />
      )}
      {toast && <div className="an-toast" role="status">{toast}</div>}
    </div>
  )
}

const MOMENT_CSS = `
  .la-unfold { position: fixed; right: 0; top: 50%; z-index: 8; width: 22px; height: 54px; border-radius: 8px 0 0 8px; border: 1px solid rgba(255,255,255,.14); border-right: none; background: #1c1d21; color: #a3a3ad; display: grid; place-items: center; cursor: pointer; }
  .la-unfold:hover { color: #fff; }
  .an-buildstep { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,.04); margin-bottom: 5px; font-size: 12.5px; color: #c9ccd2; }
  .an-buildstep input { width: 52px; background: #d7ff3c; color: #0a0c0f; border: none; border-radius: 6px; font: 700 12px Inter, sans-serif; padding: 4px 6px; }
  .an-buildstep b { font-weight: 600; color: #fff; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: capitalize; margin-left: 4px; }
`

function FolderGlyph({ dashed }: { dashed?: boolean }) {
  return <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" style={{ flex: "none" }}><path d="M1.5 3.2 a1.2 1.2 0 0 1 1.2-1.2 h3.3 l1.5 1.6 h5.8 a1.2 1.2 0 0 1 1.2 1.2 v6.8 a1.2 1.2 0 0 1-1.2 1.2 H2.7 a1.2 1.2 0 0 1-1.2-1.2 Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={dashed ? "2 2" : undefined} /></svg>
}
function MoveMenu({ folders, onPick, onClose }: { folders: Folder[]; onPick: (id: string | null) => void; onClose: () => void }) {
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement)?.closest?.(".la-pop")) onClose() }
    setTimeout(() => window.addEventListener("pointerdown", away), 0)
    return () => window.removeEventListener("pointerdown", away)
  }, [onClose])
  return (
    <div className="la-pop" style={{ bottom: 34, left: 0 }} role="menu">
      {folders.filter(f => !f.parent_id).flatMap(f => [f, ...folders.filter(c => c.parent_id === f.id)]).map(f => (
        <button key={f.id} role="menuitem" onClick={() => onPick(f.id)} style={f.parent_id ? { paddingLeft: 26 } : undefined}><FolderGlyph /> {f.name}</button>
      ))}
      <button role="menuitem" onClick={() => onPick(null)}><FolderGlyph dashed /> Unsorted</button>
    </div>
  )
}

/** The folders, for the Library strip and Move */
async function supabase_folders(userId: string): Promise<Folder[]> {
  try { return await loadFolders(userId) } catch { return [] }
}
void exportFontCSS
