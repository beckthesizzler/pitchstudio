import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Maximize, Plus, Search, Trash2, X, ZoomIn, ZoomOut } from "lucide-react"
import { supabase } from "../lib/supabase"
import { relTime } from "../lib/time"
import { listName } from "../lib/names"
import { reportError, track } from "../lib/telemetry"
import { Mark as PSMark } from "../brand/Mark"
import type { Brand } from "../brand/brand"
import { ReportView } from "./Draw"
import { mediaLinks, removeFolder } from "./media"
import { mediaOf, readReport, type Report } from "./model"
import { CH, CW, GAP, HEAD, LIBRARY_CSS, PAD } from "./libraryCss"
import { TEXT_MUTED, DS_ERROR, ACCENT_SOLID } from "../theme"

/* Match reports: every report you've made on one canvas. Zoom from a few big cards out to hundreds (Ctrl or ⌘ and the
   wheel, a trackpad pinch, or the buttons), and drag reports into groups you name: a season, a competition, Drafts.
   Groups are frames you can move anywhere. The layout is kept in your profile (report_board), so it's the same on every
   device. A List view is there for scanning rows. Starting something new is the slim row on top. */

type Row = { id: string; title: string; updated_at: string; data: unknown }
type Group = { id: string; name: string; x: number; y: number; ids: string[] }
type Board = { v: 1; groups: Group[] }
const UNSORTED = "unsorted"
const gid = () => Math.random().toString(36).slice(2, 10)

// on a phone the smallest zoom still leaves every report a 24-pixel target
const minZoom = () => (typeof window !== "undefined" && window.innerWidth <= 700 ? 0.2 : 0.12)
const colsFor = (n: number) => Math.min(16, Math.max(3, Math.ceil(Math.sqrt(Math.max(1, n) * 1.6))))
const sizeOf = (n: number) => { const c = colsFor(n), r = Math.max(1, Math.ceil(n / c)); return { w: PAD * 2 + c * CW + (c - 1) * GAP, h: HEAD + PAD + r * CH + (r - 1) * GAP + PAD } }

/** The saved layout, tidied: one Unsorted group, no reports that are gone, nothing twice */
function readBoard(raw: unknown, rows: Row[]): Board {
  const have = new Set(rows.map(r => r.id)), seen = new Set<string>()
  const src = (raw && typeof raw === "object" && Array.isArray((raw as Board).groups) ? (raw as Board).groups : []) as Group[]
  const groups: Group[] = src.filter(g => g && typeof g.id === "string").slice(0, 60).map(g => ({
    id: g.id, name: String(g.name ?? "").slice(0, 40) || "Group", x: Number(g.x) || 0, y: Number(g.y) || 0,
    ids: g.id === UNSORTED ? [] : (Array.isArray(g.ids) ? g.ids : []).filter(id => typeof id === "string" && have.has(id) && !seen.has(id) && (seen.add(id), true)),
  }))
  if (!groups.some(g => g.id === UNSORTED)) groups.unshift({ id: UNSORTED, name: "Unsorted", x: NaN, y: NaN, ids: [] })
  return { v: 1, groups }
}
/** Groups with no place yet (new, or first time) go in a row after the others */
function placeNew(groups: Group[], counts: Record<string, number>): Group[] {
  const placed = groups.filter(g => Number.isFinite(g.x) && Number.isFinite(g.y))
  const bottomOf = (gs: Group[]) => Math.max(0, ...gs.map(g => g.y + sizeOf(counts[g.id] ?? 0).h))
  let x = placed.length ? Math.max(...placed.map(g => g.x + sizeOf(counts[g.id] ?? 0).w)) + 60 : 0, y = 0
  let bottom = bottomOf(placed)
  return groups.map(g => {
    if (placed.includes(g)) return g
    const s = sizeOf(counts[g.id] ?? 0)
    if (x > 0 && x + s.w > 2600) { x = 0; y = bottom + 60 } // no room on the right: start a row under everything
    const out = { ...g, x, y }
    x += s.w + 60; bottom = Math.max(bottom, y + s.h)
    return out
  })
}

/** Draws a report's picture only once it is near the screen */
export function Near({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === "undefined") { setNear(true); return }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setNear(true); io.disconnect() } }, { rootMargin: "400px" })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return <div ref={ref} style={{ width: "100%", height: "100%" }}>{near ? children : null}</div>
}

export type LibraryProps = {
  userId: string; brand: Brand; handle: string; logo: string | null
  onOpen: (id: string) => void
  start: ReactNode // the Start new row
  empty: ReactNode // shown when there are no reports yet
  onNew: () => void
  say: (t: string) => void
  onKnown?: (names: string[]) => void // the player names on your pitches, most used first (Paste your notes reads them)
}

export function Library(P: LibraryProps) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [board, setBoard] = useState<Board>({ v: 1, groups: [] })
  const [links, setLinks] = useState<Record<string, string>>({})
  const [view, setView] = useState<"canvas" | "list">(() => { try { return localStorage.getItem("ps-reports-view") === "list" ? "list" : "canvas" } catch { return "canvas" } })
  const [q, setQ] = useState("")
  const [zoom, setZoom] = useState(0.8)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: string | null } | null>(null)
  const [, setTick] = useState(0) // the minimap follows the scroll
  const press = useRef<{ kind: "card" | "group"; id: string; x: number; y: number; gx: number; gy: number; on: boolean } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const saveT = useRef(0)
  const loaded = useRef(false)

  useEffect(() => { try { localStorage.setItem("ps-reports-view", view) } catch { /* private mode */ } }, [view])

  /* ── load your reports and your layout ── */
  useEffect(() => {
    let off = false
    ;(async () => {
      const [r, p] = await Promise.all([
        supabase.from("reports").select("id, title, updated_at, data").eq("user_id", P.userId).order("updated_at", { ascending: false }).limit(500),
        (supabase as any).from("profiles").select("report_board").eq("id", P.userId).maybeSingle(),
      ])
      if (off) return
      if (r.error) { reportError(r.error, "reports_load"); P.say("Your reports didn't load. Try again."); setRows([]); return }
      const list = (r.data as Row[] | null) ?? []
      setRows(list)
      setBoard(readBoard(p.data?.report_board, list))
      if (P.onKnown) {
        const seen = new Map<string, number>()
        for (const x of list) for (const b of readReport(x.data, P.userId).blocks)
          if (b.kind === "pitch") for (const m of b.marks) if (m.kind === "player" && m.name.trim().length > 2) seen.set(m.name.trim(), (seen.get(m.name.trim()) ?? 0) + 1)
        P.onKnown([...seen].sort((a, b) => b[1] - a[1]).slice(0, 300).map(e => e[0]))
      }
      loaded.current = true
      const want = list.flatMap(x => mediaOf(readReport(x.data, P.userId)))
      if (want.length) mediaLinks([...new Set(want)].slice(0, 400)).then(m => { if (!off) setLinks(m) }).catch(() => { /* pictures stay blank */ })
    })().catch(e => { reportError(e, "reports_load"); setRows([]) })
    return () => { off = true }
  }, [P.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const reports = useMemo(() => new Map((rows ?? []).map(r => [r.id, readReport(r.data, P.userId)] as [string, Report])), [rows, P.userId])
  const inGroup = useMemo(() => new Set(board.groups.flatMap(g => g.ids)), [board])
  const idsOf = (g: Group) => (g.id === UNSORTED ? (rows ?? []).filter(r => !inGroup.has(r.id)).map(r => r.id) : g.ids)
  const counts = Object.fromEntries(board.groups.map(g => [g.id, idsOf(g).length]))
  const groups = useMemo(() => placeNew(board.groups, counts), [board, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const shown = groups.filter(g => g.id !== UNSORTED || counts[UNSORTED] > 0 || groups.length === 1)
  const bounds = shown.reduce((b, g) => { const s = sizeOf(counts[g.id]); return { w: Math.max(b.w, g.x + s.w), h: Math.max(b.h, g.y + s.h) } }, { w: 400, h: 300 })
  const term = q.trim().toLowerCase()
  const nameOf = (r: Row) => listName("Report", r.title, r.updated_at)
  const hit = (r: Row) => !term || nameOf(r).toLowerCase().includes(term)
  const rowOf = useMemo(() => new Map((rows ?? []).map(r => [r.id, r])), [rows])

  /* ── keep the layout ── */
  const save = (b: Board) => {
    setBoard(b)
    if (!loaded.current) return
    window.clearTimeout(saveT.current)
    saveT.current = window.setTimeout(async () => {
      const keep: Board = { v: 1, groups: placeNew(b.groups, counts).map(g => ({ ...g, ids: g.id === UNSORTED ? [] : g.ids })) }
      const { error } = await (supabase as any).from("profiles").update({ report_board: keep }).eq("id", P.userId)
      if (error) { reportError(error, "report_board_save"); P.say("Your layout didn't save. Try again.") }
    }, 600)
  }
  const moveTo = (id: string, to: string, before: string | null) => {
    const gs = placeNew(board.groups, counts).map(g => ({ ...g, ids: g.ids.filter(x => x !== id) }))
    const t = gs.find(g => g.id === to)
    if (t && t.id !== UNSORTED) { const i = before ? t.ids.indexOf(before) : -1; if (i >= 0) t.ids.splice(i, 0, id); else t.ids.push(id) }
    save({ v: 1, groups: gs })
    track("report_grouped")
  }
  const newGroup = () => {
    const placed = placeNew(board.groups, counts), id = gid()
    const g: Group = { id, name: "New group", x: NaN, y: NaN, ids: [] }
    save({ v: 1, groups: [...placed, g] })
    setRenaming(id)
    setTimeout(() => { const el = scroller.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }) }, 60)
  }
  const removeGroup = (id: string) => save({ v: 1, groups: board.groups.filter(g => g.id !== id) })
  const rename = (id: string, name: string) => save({ v: 1, groups: board.groups.map(g => (g.id === id ? { ...g, name: name.slice(0, 40) } : g)) })
  const del = async (r: Row) => {
    const { error } = await supabase.from("reports").delete().eq("id", r.id).eq("user_id", P.userId)
    if (error) { P.say("Couldn't delete it. Try again."); return }
    removeFolder(P.userId, r.id)
    setRows(x => (x ?? []).filter(y => y.id !== r.id)); setConfirm(null)
  }

  /* ── zoom: Ctrl or ⌘ and the wheel (a trackpad pinch arrives the same way), around the pointer ── */
  const zoomAt = (z: number, cx?: number, cy?: number) => {
    const el = scroller.current, nz = Math.min(1.6, Math.max(minZoom(), z))
    if (!el) { setZoom(nz); return }
    const r = el.getBoundingClientRect(), px = (cx ?? r.left + r.width / 2) - r.left, py = (cy ?? r.top + r.height / 2) - r.top
    const wx = (el.scrollLeft + px) / zoom, wy = (el.scrollTop + py) / zoom
    setZoom(nz)
    requestAnimationFrame(() => { el.scrollLeft = wx * nz - px; el.scrollTop = wy * nz - py })
  }
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomAt(zoom * Math.exp(-e.deltaY * 0.004), e.clientX, e.clientY) }
    el.addEventListener("wheel", wheel, { passive: false })
    return () => el.removeEventListener("wheel", wheel)
  })
  const fit = () => {
    const el = scroller.current
    if (!el) return
    const z = Math.min(1, Math.max(minZoom(), Math.min((el.clientWidth - 80) / bounds.w, (el.clientHeight - 120) / bounds.h)))
    setZoom(z); requestAnimationFrame(() => el.scrollTo({ left: 0, top: 0 }))
  }
  const fitted = useRef(false)
  useEffect(() => { if (rows && rows.length && !fitted.current && view === "canvas") { fitted.current = true; requestAnimationFrame(fit) } }) // first look: everything in view

  /* ── dragging: a report into a group, or a group's name row to move the frame ── */
  useEffect(() => {
    const over = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      return { g: el?.closest("[data-group]")?.getAttribute("data-group") ?? null, c: el?.closest("[data-card]")?.getAttribute("data-card") ?? null }
    }
    const mv = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.on && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      p.on = true
      if (p.kind === "card") setDrag({ id: p.id, x: e.clientX, y: e.clientY, over: over(e.clientX, e.clientY).g })
      else setBoard(b => ({ ...b, groups: placeNew(b.groups, counts).map(g => (g.id === p.id ? { ...g, x: Math.max(0, p.gx + (e.clientX - p.x) / zoom), y: Math.max(0, p.gy + (e.clientY - p.y) / zoom) } : g)) }))
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      press.current = null
      if (!p) return
      if (!p.on) { if (p.kind === "card") P.onOpen(p.id); return }
      if (p.kind === "card") {
        setDrag(null)
        const o = over(e.clientX, e.clientY)
        if (o.g) moveTo(p.id, o.g, o.c && o.c !== p.id ? o.c : null)
      } else save(board)
    }
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up)
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up) }
  })

  const card = (id: string) => {
    const r = rowOf.get(id), rep = reports.get(id)
    if (!r || !rep) return null
    const small = zoom < 0.42 // far out: a light stand-in, so hundreds stay fast
    return (
      <div key={id} className={`lb-card${drag?.id === id ? " lifted" : ""}${hit(r) ? "" : " dim"}`} data-card={id}>
        <button className="lb-face" aria-label={`Open ${nameOf(r)}`} title={nameOf(r)}
          onPointerDown={e => { if (e.button !== 0) return; if (e.pointerType === "touch") return; e.preventDefault(); press.current = { kind: "card", id, x: e.clientX, y: e.clientY, gx: 0, gy: 0, on: false } }}
          onClick={e => { if (e.detail === 0 || (e.nativeEvent as PointerEvent).pointerType === "touch") P.onOpen(id) }}>
          {small
            ? <div className="lb-stub" style={{ background: rep.mode === "bright" ? "#f4f1ea" : "#16181d", color: rep.mode === "bright" ? "#141414" : "#f5f5f7" }}><b>{nameOf(r)}</b></div>
            : <Near><ReportView report={rep} brand={P.brand} handle={P.handle} logo={P.logo} media={links} /></Near>}
        </button>
        {!small && <span className="lb-name">{nameOf(r)}</span>}
        {!small && (confirm === id
          ? <span className="lb-ask"><button className="bad" onClick={() => del(r)}>Delete</button><button onClick={() => setConfirm(null)}>Keep</button></span>
          : <button className="lb-x" aria-label={`Delete ${nameOf(r)}`} title="Delete" onClick={() => setConfirm(id)}><X size={13} /></button>)}
      </div>
    )
  }

  const css = <style>{LIBRARY_CSS}</style>

  const top = (
    <header className="rp-top">
      <a className="rp-home" href="/" aria-label="Home" title="Home"><PSMark size={28} color={ACCENT_SOLID} /></a>
      <div className="rp-name">
        <h1 style={{ fontSize: 15, fontWeight: 600, padding: "0 6px", margin: 0, lineHeight: 1.3 }}>Match reports</h1>
        <span className="rp-status"><i className="rp-dot ok" aria-hidden="true" />{rows === null ? "Loading…" : `${rows.length} report${rows.length === 1 ? "" : "s"} · Saved`}</span>
      </div>
      <span className="rp-sp" />
      {rows && rows.length > 0 && <div className="lb-modes" role="group" aria-label="View">
        <button aria-pressed={view === "canvas"} onClick={() => setView("canvas")}>Canvas</button>
        <button aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
      </div>}
      {rows && rows.length > 0 && <label className="lb-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reports" aria-label="Search reports" /></label>}
      <button className="lb-new" aria-label="New report" onClick={P.onNew}><Plus size={16} /><span>New report</span></button>
    </header>
  )

  if (rows && rows.length === 0) return <>{css}{top}<div style={{ overflowY: "auto", minHeight: 0 }}>{P.empty}</div></>
  const sel = (g: Group) => (drag && drag.over === g.id ? " over" : "")
  const vw = scroller.current?.clientWidth ?? 1200, vh = scroller.current?.clientHeight ?? 700
  const mapK = Math.min(144 / Math.max(bounds.w, 1), 84 / Math.max(bounds.h, 1))
  return (
    <>{css}{top}
      <div className="lb-body">
        <div className="lb-start" aria-label="Start new"><p className="lb-k">Start new</p>{P.start}</div>
        {view === "list" ? (
          <div className="lb-list">
            {(rows ?? []).filter(hit).map(r => {
              const g = groups.find(x => x.id !== UNSORTED && x.ids.includes(r.id))
              return (
                <div key={r.id} className="lb-row">
                  <div className="th" onClick={() => P.onOpen(r.id)}><Near><ReportView report={reports.get(r.id)!} brand={P.brand} handle={P.handle} logo={P.logo} media={links} /></Near></div>
                  <span className="t" onClick={() => P.onOpen(r.id)}>{nameOf(r)}</span>
                  <select aria-label={`Group for ${nameOf(r)}`} value={g?.id ?? UNSORTED} onChange={e => moveTo(r.id, e.target.value, null)}>
                    {groups.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <span className="m">{relTime(r.updated_at)}</span>
                  {confirm === r.id
                    ? <span style={{ display: "flex", gap: 6 }}><button className="rp-btn sm" style={{ borderColor: DS_ERROR, color: DS_ERROR }} onClick={() => del(r)}>Delete</button><button className="rp-btn sm" onClick={() => setConfirm(null)}>Keep</button></span>
                    : <button className="lb-icon" aria-label={`Delete ${nameOf(r)}`} onClick={() => setConfirm(r.id)}><Trash2 size={15} /></button>}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ position: "relative", minHeight: 0, display: "grid" }}>
            <div className="lb-scroll" ref={scroller} onScroll={() => setTick(t => t + 1)}>
              {rows === null ? <p style={{ padding: 24, color: TEXT_MUTED }}>Loading your reports…</p> : (
                <div style={{ width: (bounds.w + 120) * zoom, height: (bounds.h + 160) * zoom, position: "relative" }}>
                  <div className="lb-world" style={{ transform: `scale(${zoom})`, width: bounds.w + 120, height: bounds.h + 160, padding: 40 }}>
                    {shown.map(g => {
                      const ids = idsOf(g), c = colsFor(ids.length), s = sizeOf(ids.length)
                      return (
                        <section key={g.id} className={`lb-group${sel(g)}`} data-group={g.id} aria-label={`${g.name}, ${ids.length} reports`} style={{ left: g.x + 40, top: g.y + 40, width: s.w, minHeight: s.h }}>
                          <div className="lb-gh" onPointerDown={e => { if ((e.target as HTMLElement).closest("button, input") || e.button !== 0) return; e.preventDefault(); press.current = { kind: "group", id: g.id, x: e.clientX, y: e.clientY, gx: g.x, gy: g.y, on: false } }}>
                            {renaming === g.id
                              ? <input autoFocus defaultValue={g.name} aria-label="Group name" maxLength={40} onFocus={e => e.currentTarget.select()} onBlur={e => { rename(g.id, e.target.value.trim() || g.name); setRenaming(null) }} onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur() }} />
                              : <b role={g.id === UNSORTED ? undefined : "button"} tabIndex={g.id === UNSORTED ? undefined : 0} onClick={() => { if (g.id !== UNSORTED) setRenaming(g.id) }} onKeyDown={e => { if (e.key === "Enter" && g.id !== UNSORTED) setRenaming(g.id) }} title={g.id === UNSORTED ? undefined : "Rename"}>{g.name}</b>}
                            <small>{ids.length}</small>
                            {g.id !== UNSORTED && <button className="lb-gx" aria-label={`Remove the group ${g.name} (its reports go to Unsorted)`} title="Remove the group" onClick={() => removeGroup(g.id)}><X size={14} /></button>}
                          </div>
                          <div className="lb-grid" style={{ gridTemplateColumns: `repeat(${c}, ${CW}px)` }}>
                            {ids.length ? ids.map(card) : <div className="lb-drop">Drag reports here</div>}
                          </div>
                        </section>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="lb-dock" role="toolbar" aria-label="Canvas">
              <button aria-label="Zoom out" onClick={() => zoomAt(zoom / 1.25)}><ZoomOut size={17} /></button>
              <span className="z" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button aria-label="Zoom in" onClick={() => zoomAt(zoom * 1.25)}><ZoomIn size={17} /></button>
              <i />
              <button onClick={fit}><Maximize size={15} /> Fit all</button>
              <i />
              <button onClick={newGroup}><Plus size={15} /> New group</button>
            </div>
            <div className="lb-map" aria-hidden="true" onClick={e => {
              const r = (e.currentTarget.firstChild as HTMLElement).getBoundingClientRect(), el = scroller.current
              if (el) el.scrollTo({ left: ((e.clientX - r.left) / mapK) * zoom - vw / 2, top: ((e.clientY - r.top) / mapK) * zoom - vh / 2, behavior: "smooth" })
            }}>
              <div>
                {shown.map(g => { const s = sizeOf(counts[g.id]); return <b key={g.id} style={{ left: g.x * mapK, top: g.y * mapK, width: s.w * mapK, height: s.h * mapK }} /> })}
                <em style={{ left: ((scroller.current?.scrollLeft ?? 0) / zoom) * mapK, top: ((scroller.current?.scrollTop ?? 0) / zoom) * mapK, width: Math.min(144, (vw / zoom) * mapK), height: Math.min(84, (vh / zoom) * mapK) }} />
              </div>
            </div>
          </div>
        )}
      </div>
      {drag && (() => { const rep = reports.get(drag.id); return rep ? <div className="lb-ghost" style={{ left: drag.x, top: drag.y }}><ReportView report={rep} brand={P.brand} handle={P.handle} logo={P.logo} media={links} /></div> : null })()}
    </>
  )
}
