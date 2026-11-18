import { useEffect, useMemo, useState, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { flushSync } from "react-dom"
import { LayoutGrid, Search } from "lucide-react"
import { supabase } from "../lib/supabase"
import { reportError } from "../lib/telemetry"
import { ReportView } from "./Draw"
import { ITEM } from "./Canvas"
import { Near } from "./Library"
import { KIND_ICON, NAMES, bigName } from "./Panel"
import { boardCounts, boardMarks, type BoardRow } from "./fromBoard"
import { svgToCanvas } from "./media"
import { newId, type Block, type Report } from "./model"
import { downloadShot, type Mark as ShotMark } from "../analysis/model"
import { Marks } from "../analysis/Marks"
import { hex, plain, type Color } from "../braindump/notes"
import type { Brand } from "../brand/brand"
import { TEXT_MUTED, TEXT_PRIMARY, SURFACE_BASE, SURFACE_2, DS_BORDER, DS_BORDER_STRONG, ACCENT_SOLID, ACCENT_SOFT, ACCENT_TEXT } from "../theme"

/* The left side of the Design view: the blocks on this page, and your Library (Tactics Boards, freeze-frames from
   Live Analysis and Dump & Arrange notes) to drag onto the page, or click to drop in the middle. */

const MONO = "'JetBrains Mono', ui-monospace, monospace"
export type LibItem =
  | { type: "board"; name: string; row: BoardRow }
  | { type: "shot"; name: string; path: string; w: number; h: number; dim: number; items: ShotMark[] }
  | { type: "note"; name: string; text: string; color: string }

/** A freeze-frame with its drawings, as a picture file: the photo block gets exactly what Live Analysis shows */
export async function shotFile(s: Extract<LibItem, { type: "shot" }>): Promise<File | null> {
  const src = await downloadShot(s.path)
  if (!src) return null
  const host = document.createElement("div"), root = createRoot(host)
  try {
    flushSync(() => root.render(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${s.w} ${s.h}`} width={s.w} height={s.h}>
        <image href={src} width={s.w} height={s.h} preserveAspectRatio="none" />
        {s.dim > 0 && <rect width={s.w} height={s.h} fill="#000" fillOpacity={s.dim} />}
        <Marks items={s.items} w={s.w} h={s.h} />
      </svg>))
    const svg = host.querySelector("svg")
    if (!svg) return null
    const cv = await svgToCanvas(svg, s.w, s.h, true)
    const blob = await new Promise<Blob | null>(ok => cv.toBlob(ok, "image/jpeg", 0.92))
    return blob ? new File([blob], "freeze-frame.jpg", { type: "image/jpeg" }) : null
  } catch (e) { reportError(e, "report_shot_file"); return null } finally { root.unmount() }
}

function ShotThumb({ s }: { s: Extract<LibItem, { type: "shot" }> }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { let off = false; downloadShot(s.path).then(d => { if (!off) setSrc(d) }); return () => { off = true } }, [s.path])
  return (
    <svg viewBox={`0 0 ${s.w} ${s.h}`} width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: "block", background: "#16181d" }} aria-hidden="true">
      {src && <image href={src} width={s.w} height={s.h} preserveAspectRatio="none" />}
      {src && s.dim > 0 && <rect width={s.w} height={s.h} fill="#000" fillOpacity={s.dim} />}
      {src && <Marks items={s.items} w={s.w} h={s.h} />}
    </svg>
  )
}

function BoardThumb({ row, brand }: { row: BoardRow; brand: Brand }) {
  const rep = useMemo((): Report => {
    const { marks, teams } = boardMarks(row)
    return { v: 2, format: "16:9", mode: "bright", paper: "#2f6b3f", story: null, glow: false, seal: "br",
      blocks: [{ id: newId(), kind: "pitch", x: 100, y: 23, w: 1314, view: "full", dir: "right", look: "grass", teams, marks, crest: false, ms: 1.4, legend: false }] }
  }, [row])
  return <ReportView report={rep} brand={{ ...brand, madeWith: false }} handle="" logo={null} media={{}} />
}

export function Side({ userId, report, selId, brand, onSelect, onAdd, say }: {
  userId: string | null; report: Report; selId: string | null; brand: Brand
  onSelect: (bid: string) => void; onAdd: (item: LibItem) => void; say: (t: string) => void
}) {
  const [tab, setTab] = useState<"blocks" | "library">(() => { try { return localStorage.getItem("ps-report-side") === "library" ? "library" : "blocks" } catch { return "blocks" } })
  const [items, setItems] = useState<LibItem[] | null>(null)
  const [q, setQ] = useState("")
  useEffect(() => { try { localStorage.setItem("ps-report-side", tab) } catch { /* fine */ } }, [tab])

  // the Library loads the first time it's opened, so the editor itself opens as fast as before
  useEffect(() => {
    if (tab !== "library" || items || !userId) return
    let off = false
    ;(async () => {
      const db = supabase as any
      const [b, a, n] = await Promise.all([
        db.from("boards").select("id, title, updated_at, players:canvas_data->players, arrows:canvas_data->arrows, zones:canvas_data->customZones, settings:canvas_data->settings").eq("user_id", userId).order("updated_at", { ascending: false }).limit(40),
        db.from("analyses").select("id, title, updated_at, shots:data->shots").eq("user_id", userId).order("updated_at", { ascending: false }).limit(20),
        db.from("notes").select("id, kind, title, color, updated_at, first:body->0->>html").eq("user_id", userId).neq("kind", "tree").order("updated_at", { ascending: false }).limit(40),
      ])
      if (off) return
      const out: LibItem[] = []
      for (const r of b.data ?? []) if (boardCounts(r).players + boardCounts(r).lines > 0) out.push({ type: "board", name: (r.title || "").trim() || "Untitled board", row: r })
      for (const r of a.data ?? []) {
        const shots = (Array.isArray(r.shots) ? r.shots : []).filter((s: any) => s && typeof s.path === "string" && s.w > 0 && s.h > 0)
        shots.slice(0, 4).forEach((s: any, i: number) => out.push({ type: "shot", name: `${(r.title || "").trim() || "Analysis"}${shots.length > 1 ? ` · ${i + 1}` : ""}`, path: s.path, w: s.w, h: s.h, dim: Number(s.dim) || 0, items: Array.isArray(s.items) ? s.items : [] }))
      }
      for (const r of n.data ?? []) {
        const text = plain(String(r.first ?? "")).slice(0, 400), name = String(r.title ?? "").trim()
        if (name || text) out.push({ type: "note", name: name || text.split(String.fromCharCode(10))[0].slice(0, 40), text, color: hex(String(r.color || "yellow") as Color) })
      }
      if (b.error || a.error || n.error) { reportError(b.error || a.error || n.error, "report_library"); say("Some of your Library didn't load.") }
      setItems(out)
    })().catch(e => { reportError(e, "report_library"); if (!off) setItems([]) })
    return () => { off = true }
  }, [tab, items, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = (items ?? []).filter(i => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()))
  const blocks = [...report.blocks].map((b, i) => ({ b, i })).sort((x, y) => ("y" in x.b ? x.b.y : 0) - ("y" in y.b ? y.b.y : 0))
  const kindLabel = { board: "Board", shot: "Freeze-frame", note: "Note" } as const

  return (
    <aside className="sd" aria-label="Blocks and Library">
      <style>{`
        .sd { border-right: 1px solid ${DS_BORDER}; display: flex; flex-direction: column; min-height: 0; background: ${SURFACE_BASE}; color: ${TEXT_PRIMARY}; }
        .sd-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 14px 14px 12px; padding: 4px; border-radius: 12px; background: ${SURFACE_2}; }
        .sd-tabs button { height: 34px; border: 0; border-radius: 9px; background: transparent; color: ${TEXT_MUTED}; font: 600 13.5px 'Inter', sans-serif; cursor: pointer; }
        .sd-tabs button[aria-selected="true"] { background: ${DS_BORDER_STRONG}; color: ${TEXT_PRIMARY}; }
        .sd-k { font: 600 11px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; margin: 6px 14px 10px; }
        .sd-scroll { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 20px; }
        .sd-row { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 8px; width: calc(100% - 16px); margin: 0 8px; padding: 7px 8px; border: 0; border-radius: 9px; background: transparent; color: ${TEXT_PRIMARY}; text-align: left; cursor: pointer; font: 500 13.5px 'Inter', sans-serif; }
        .sd-row:hover { background: ${SURFACE_2}; }
        .sd-row[aria-current="true"] { background: ${ACCENT_SOFT}; color: ${ACCENT_TEXT}; }
        .sd-row .i { width: 30px; height: 30px; border-radius: 8px; background: ${SURFACE_2}; display: grid; place-items: center; color: ${TEXT_MUTED}; }
        .sd-row[aria-current="true"] .i { color: ${ACCENT_TEXT}; }
        .sd-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sd-row small { color: ${TEXT_MUTED}; margin-left: 6px; }
        .sd-search { position: relative; margin: 0 14px 14px; }
        .sd-search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: ${TEXT_MUTED}; }
        .sd-search input { width: 100%; height: 38px; padding: 0 12px 0 34px; border-radius: 10px; border: 1px solid ${DS_BORDER_STRONG}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font: 14px 'Inter', sans-serif; outline: none; }
        .sd-search input:focus { border-color: ${ACCENT_SOLID}; }
        .sd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 10px; padding: 0 14px; }
        .sd-it { border: 0; padding: 0; background: none; color: ${TEXT_PRIMARY}; text-align: left; cursor: grab; min-width: 0; }
        .sd-it .th { aspect-ratio: 4 / 3; border-radius: 8px; overflow: hidden; border: 1px solid ${DS_BORDER}; display: block; background: #16181d; }
        .sd-it:hover .th, .sd-it:focus-visible .th { border-color: ${ACCENT_SOLID}; }
        .sd-it:focus-visible { outline: none; }
        .sd-it b { display: block; font: 600 13px 'Inter', sans-serif; margin-top: 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sd-it small { display: block; font: 600 10px ${MONO}; letter-spacing: .14em; text-transform: uppercase; color: ${TEXT_MUTED}; margin-top: 2px; }
        .sd-note { display: block; width: 100%; height: 100%; padding: 9px 10px; color: #1b1308; font: 600 13px/1.3 'Inter', sans-serif; overflow: hidden; }
        .sd-empty { color: ${TEXT_MUTED}; font-size: 13.5px; line-height: 1.5; padding: 0 14px; }
      `}</style>
      <div className="sd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "blocks"} onClick={() => setTab("blocks")}>Blocks</button>
        <button role="tab" aria-selected={tab === "library"} onClick={() => setTab("library")}>Library</button>
      </div>
      {tab === "blocks" ? (
        <div className="sd-scroll" role="tabpanel" aria-label="Blocks">
          <p className="sd-k">On this page · {report.blocks.length}</p>
          {blocks.map(({ b, i }) => (
            <button key={b.id} className="sd-row" aria-current={b.id === selId} onClick={() => onSelect(b.id)}>
              <span className="i" aria-hidden="true">{(KIND_ICON as Record<string, ReactNode>)[b.kind] ?? <LayoutGrid size={17} />}</span>
              <span>{bigName(b as Block) || NAMES[b.kind]}<small>{bigName(b as Block) ? NAMES[b.kind] : `Block ${i + 1}`}</small></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="sd-scroll" role="tabpanel" aria-label="Library">
          <div className="sd-search"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Boards, shots, notes" aria-label="Search your Library" /></div>
          <p className="sd-k">Drag onto the page</p>
          {!userId ? <p className="sd-empty">Sign in to see your boards, shots and notes here.</p>
            : items === null ? <p className="sd-empty">Loading your Library…</p>
              : !shown.length ? <p className="sd-empty">{items.length ? "Nothing matches that." : "Your Tactics Boards, Live Analysis freeze-frames and Dump & Arrange notes show here, ready to drop in."}</p>
                : <div className="sd-grid">
                  {shown.map((it, k) => (
                    <button key={k} className="sd-it" draggable title={`${it.name}: drag onto the page, or click to drop it in`}
                      onDragStart={e => { e.dataTransfer.setData(ITEM, JSON.stringify(it)); e.dataTransfer.effectAllowed = "copy" }}
                      onClick={() => onAdd(it)}>
                      <span className="th">
                        {it.type === "note" ? <span className="sd-note" style={{ background: it.color }}>{it.name}</span>
                          : <Near>{it.type === "board" ? <BoardThumb row={it.row} brand={brand} /> : <ShotThumb s={it} />}</Near>}
                      </span>
                      <b>{it.name}</b><small>{kindLabel[it.type]}</small>
                    </button>
                  ))}
                </div>}
        </div>
      )}
    </aside>
  )
}
