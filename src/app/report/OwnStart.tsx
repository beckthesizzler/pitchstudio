import { useEffect, useMemo, useState } from "react"
import { ArrowRight, LayoutGrid, Image as ImageIcon, Star, Type, X } from "lucide-react"
import { ReportView } from "./Draw"
import { Near } from "./Library"
import { BoardThumb, ShotThumb, loadLibrary, type LibItem } from "./Side"
import { boardMarks } from "./fromBoard"
import { LAYOUTS, LOOKS, SHAPE_OPTS, lookPage, makeOwn, type LayoutId } from "./own"
import { SIZES, newId, pitchBox, type LookId, type PhotoBlock, type PitchBlock, type Report, type RFormat } from "./model"
import type { Brand } from "../brand/brand"
import { ACCENT_SOLID, ACCENT_INK, ACCENT_TEXT, TEXT_MUTED, TEXT_PRIMARY, SURFACE_1, SURFACE_2, SURFACE_BASE, DS_BORDER, DS_BORDER_STRONG } from "../theme"

/* Create your own, at the top of Match reports: pick a shape, a layout and a look, and Start creating opens a page that
   already looks good (own.ts). The previews are real pages in your colours. Or start from your notes, one of your
   Tactics Boards, a Live Analysis freeze-frame, or one of your templates. */

const MONO = "'JetBrains Mono', ui-monospace, monospace"
export type OwnStartProps = {
  userId: string | null; brand: Brand; handle: string; logo: string | null; say: (t: string) => void
  mine: number // how many templates of your own
  onStart: (r: Report, how: string) => void
  onShot: (r: Report, slotId: string, item: Extract<LibItem, { type: "shot" }>) => void // the page, then the freeze-frame goes into its photo spot
  onNotes: () => void; onMine: () => void
}

/** The page for a board: your layout's first pitch becomes the board, as large as fits where the pitch was */
function withBoard(r: Report, row: Extract<LibItem, { type: "board" }>["row"]): Report {
  const i = r.blocks.findIndex(b => b.kind === "pitch")
  if (i < 0) return r
  const old = r.blocks[i] as PitchBlock, box = pitchBox(old)
  const { marks, teams, vertical } = boardMarks(row)
  const base: PitchBlock = { ...old, view: "full", dir: vertical ? "up" : "right", marks, teams, crest: false, half: undefined }
  const one = pitchBox({ ...base, w: 1 }), w = Math.min(box.w / one.w, box.h / one.h)
  const p: PitchBlock = { ...base, w, x: old.x + (box.w - w * one.w) / 2, y: old.y }
  return { ...r, blocks: r.blocks.map((b, k) => (k === i ? p : b)) }
}
/** The page for a freeze-frame: its pitch becomes a photo spot the picture fills, in the picture's own shape */
function withShotSpot(r: Report, s: Extract<LibItem, { type: "shot" }>): { r: Report; slotId: string } {
  const i = r.blocks.findIndex(b => b.kind === "pitch"), id = newId()
  if (i < 0) return { r, slotId: id }
  const old = r.blocks[i] as PitchBlock, box = pitchBox(old), f = Math.min(box.w / s.w, box.h / s.h), w = s.w * f, h = s.h * f
  const spot: PhotoBlock = { id, kind: "photo", x: old.x + (box.w - w) / 2, y: old.y, w, h, rot: 0, src: "", nw: w, nh: h, ix: 0, iy: 0, iw: w, shape: "rect", edge: "hard", border: "none", shadow: false, flip: false }
  return { r: { ...r, blocks: r.blocks.map((b, k) => (k === i ? spot : b)) }, slotId: id }
}

export function OwnStart(P: OwnStartProps) {
  const [shape, setShape] = useState<RFormat>(() => { try { const v = localStorage.getItem("ps-own-shape"); return SHAPE_OPTS.some(s => s.id === v) ? v as RFormat : "4:5" } catch { return "4:5" } })
  const [layout, setLayout] = useState<LayoutId>(() => { try { const v = localStorage.getItem("ps-own-layout"); return LAYOUTS.some(l => l.id === v) ? v as LayoutId : "points" } catch { return "points" } })
  const [look, setLook] = useState<LookId>(() => { try { const v = localStorage.getItem("ps-own-look"); return LOOKS.some(l => l.id === v) ? v as LookId : "paper" } catch { return "paper" } })
  useEffect(() => { try { localStorage.setItem("ps-own-shape", shape); localStorage.setItem("ps-own-layout", layout); localStorage.setItem("ps-own-look", look) } catch { /* fine */ } }, [shape, layout, look])
  const [pick, setPick] = useState<"board" | "shot" | null>(null)
  const [items, setItems] = useState<LibItem[] | null>(null)
  useEffect(() => {
    if (!pick || items || !P.userId) return
    let off = false
    loadLibrary(P.userId, P.say).then(x => { if (!off) setItems(x) }).catch(() => { if (!off) setItems([]) })
    return () => { off = true }
  }, [pick, items, P.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const [W, H] = SIZES[shape]
  const pages = useMemo(() => Object.fromEntries(LAYOUTS.map(l => [l.id, makeOwn(l.id, shape, look, P.brand, P.handle)])) as Record<LayoutId, Report>, [shape, look, P.brand, P.handle])
  const lookPages = useMemo(() => Object.fromEntries(LOOKS.map(l => [l.id, makeOwn(layout, shape, l.id, P.brand, P.handle)])) as Record<LookId, Report>, [shape, layout, P.brand, P.handle])
  const how = `own:${layout}:${shape}:${look}`
  const go = () => P.onStart(makeOwn(layout, shape, look, P.brand, P.handle), how)
  const pitchLayout: LayoutId = LAYOUTS.find(l => l.id === layout && l.id !== "free" && l.id !== "player") ? layout : "points"
  const shown = (items ?? []).filter(i => i.type === pick)

  const view = (r: Report) => <ReportView report={r} brand={P.brand} handle={P.handle} logo={P.logo} media={{}} editing />
  return (
    <section className="ow" aria-labelledby="ow-h">
      <style>{`
        .ow { position: relative; margin-top: 22px; border: 1.5px solid ${ACCENT_SOLID}; border-radius: 20px; background: ${SURFACE_1}; padding: 24px 26px 22px; max-width: 1240px; }
        .ow-hd { display: flex; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
        .ow-k { font: 600 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${ACCENT_TEXT}; }
        .ow h2 { margin: 8px 0 0; font: 400 46px/1 Anton, 'Bebas Neue', sans-serif; text-transform: uppercase; letter-spacing: .005em; }
        .ow-sub { margin: 8px 0 0; color: ${TEXT_MUTED}; font-size: 15px; line-height: 1.5; max-width: 640px; }
        .ow-go { margin-left: auto; margin-top: 18px; height: 52px; padding: 0 24px; border: 0; border-radius: 13px; background: ${ACCENT_SOLID}; color: ${ACCENT_INK}; font: 700 16px 'Inter', sans-serif; display: inline-flex; align-items: center; gap: 9px; cursor: pointer; }
        .ow-go:focus-visible { outline: 3px solid ${TEXT_PRIMARY}; outline-offset: 3px; }
        .ow-steps { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.5fr) minmax(0, 1.5fr); gap: 14px; margin-top: 20px; align-items: stretch; }
        .ow-step { background: ${SURFACE_2}; border-radius: 14px; padding: 14px 14px 16px; min-width: 0; }
        .ow-step > p { margin: 0 0 12px; font: 600 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; }
        .ow-step > p b { color: ${ACCENT_TEXT}; font-weight: 600; }
        .ow-opts { display: grid; gap: 9px; }
        .ow-opt { border: 1.5px solid ${DS_BORDER_STRONG}; border-radius: 10px; background: none; color: ${TEXT_PRIMARY}; padding: 7px; text-align: center; cursor: pointer; font: 600 12.5px 'Inter', sans-serif; min-width: 0; }
        .ow-opt[aria-pressed="true"] { border-color: ${ACCENT_SOLID}; background: rgba(215,255,60,.07); }
        .ow-opt:focus-visible { outline: 2px solid ${ACCENT_SOLID}; outline-offset: 2px; }
        .ow-opt small { display: block; font: 500 11px ${MONO}; color: ${TEXT_MUTED}; margin-top: 2px; }
        .ow-opt[aria-pressed="true"] small { color: ${TEXT_PRIMARY}; }
        .ow-shape i { display: block; margin: 4px auto 8px; border: 2px solid ${TEXT_MUTED}; border-radius: 3px; }
        .ow-shape[aria-pressed="true"] i { border-color: ${ACCENT_SOLID}; }
        .ow-thw { height: 112px; display: flex; justify-content: center; align-items: center; margin-bottom: 7px; }
        .ow-th { display: block; height: 100%; max-width: 100%; border-radius: 4px; overflow: hidden; background: ${SURFACE_BASE}; box-shadow: 0 6px 14px -8px rgba(0,0,0,.8); }
        .ow-th svg { display: block; width: 100%; height: 100%; }
        .ow-ways { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 18px; }
        .ow-ways > span { font: 600 12px ${MONO}; letter-spacing: .16em; text-transform: uppercase; color: ${TEXT_MUTED}; margin-right: 4px; }
        .ow-chip { height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid ${DS_BORDER_STRONG}; background: ${SURFACE_2}; color: ${TEXT_PRIMARY}; font: 600 13.5px 'Inter', sans-serif; display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
        .ow-chip:hover { border-color: ${ACCENT_SOLID}; }
        .ow-chip small { color: ${TEXT_MUTED}; font-weight: 500; }
        .ow-pick { margin-top: 16px; padding: 14px; border-radius: 14px; background: ${SURFACE_2}; border: 1px solid ${DS_BORDER}; }
        .ow-pick header { display: flex; align-items: center; gap: 10px; font: 600 14px 'Inter', sans-serif; margin-bottom: 12px; }
        .ow-pick header button { margin-left: auto; width: 32px; height: 32px; border-radius: 9px; border: 0; background: none; color: ${TEXT_MUTED}; display: grid; place-items: center; cursor: pointer; }
        .ow-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
        .ow-it { border: 0; padding: 0; background: none; color: ${TEXT_PRIMARY}; text-align: left; cursor: pointer; min-width: 0; font: 600 13px 'Inter', sans-serif; }
        .ow-it .th { display: block; aspect-ratio: 4 / 3; border-radius: 8px; overflow: hidden; border: 1.5px solid ${DS_BORDER}; background: #16181d; margin-bottom: 6px; }
        .ow-it:hover .th, .ow-it:focus-visible .th { border-color: ${ACCENT_SOLID}; } .ow-it:focus-visible { outline: none; }
        .ow-it span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (max-width: 1000px) { .ow-steps { grid-template-columns: 1fr; } }
        @media (max-width: 700px) { .ow { padding: 18px 14px; } .ow h2 { font-size: 36px; } .ow-go { margin-left: 0; width: 100%; justify-content: center; } }
      `}</style>
      <div className="ow-hd">
        <div>
          <span className="ow-k">Your report, your way</span>
          <h2 id="ow-h">Create your own</h2>
          <p className="ow-sub">Pick a shape, a layout and a look, and you start on a page that already looks good. Every block can be changed, moved or deleted after.</p>
        </div>
        <button className="ow-go" data-own-go onClick={go}>Start creating <ArrowRight size={18} /></button>
      </div>
      <div className="ow-steps">
        <div className="ow-step"><p><b>1</b> · Shape</p>
          <div className="ow-opts" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", alignItems: "end" }} role="group" aria-label="Shape">
            {SHAPE_OPTS.map(s => { const [w, h] = SIZES[s.id], k = 40 / Math.max(w, h)
              return <button key={s.id} className="ow-opt ow-shape" aria-pressed={shape === s.id} data-own-shape={s.id} onClick={() => setShape(s.id)}><i style={{ width: w * k, height: h * k }} />{s.name}<small>{s.id}</small></button> })}
          </div></div>
        <div className="ow-step"><p><b>2</b> · Layout</p>
          <div className="ow-opts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} role="group" aria-label="Layout">
            {LAYOUTS.map(l => <button key={l.id} className="ow-opt" aria-pressed={layout === l.id} data-own-layout={l.id} title={l.note} onClick={() => setLayout(l.id)}>
              <span className="ow-thw"><span className="ow-th" style={{ aspectRatio: `${W} / ${H}` }}><Near>{view(pages[l.id])}</Near></span></span>{l.name}</button>)}
          </div></div>
        <div className="ow-step"><p><b>3</b> · Look</p>
          <div className="ow-opts" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }} role="group" aria-label="Look">
            {LOOKS.map(l => { const pg = lookPage(l.id, P.brand)
              return <button key={l.id} className="ow-opt" aria-pressed={look === l.id} data-own-look={l.id} title={l.note} onClick={() => setLook(l.id)}
                style={{ padding: 6 }}><span className="ow-thw"><span className="ow-th" style={{ aspectRatio: `${W} / ${H}`, background: pg.paper ?? (pg.mode === "night" ? "#111317" : "#f4f1ea") }}><Near>{view(lookPages[l.id])}</Near></span></span>{l.name}</button> })}
          </div></div>
      </div>
      <div className="ow-ways">
        <span>Or start from</span>
        <button className="ow-chip" onClick={P.onNotes}><Type size={15} /> Paste your notes</button>
        {P.userId && <button className="ow-chip" aria-expanded={pick === "board"} onClick={() => setPick(p => (p === "board" ? null : "board"))}><LayoutGrid size={15} /> One of my boards</button>}
        {P.userId && <button className="ow-chip" aria-expanded={pick === "shot"} onClick={() => setPick(p => (p === "shot" ? null : "shot"))}><ImageIcon size={15} /> A freeze-frame</button>}
        <button className="ow-chip" onClick={P.onMine}><Star size={15} /> My templates <small>· {P.mine}</small></button>
      </div>
      {pick && (
        <div className="ow-pick" role="region" aria-label={pick === "board" ? "Your boards" : "Your freeze-frames"}>
          <header>{pick === "board" ? "Pick a board: it becomes the pitch on your page" : "Pick a freeze-frame: it goes on your page with its drawings"}<button aria-label="Close" onClick={() => setPick(null)}><X size={16} /></button></header>
          {items === null ? <p style={{ color: TEXT_MUTED, margin: 0 }}>Loading…</p>
            : !shown.length ? <p style={{ color: TEXT_MUTED, margin: 0 }}>{pick === "board" ? "No boards with players on them yet. Draw one on the Tactics Board and it shows here." : "No freeze-frames yet. Make one in Live Analysis and it shows here."}</p>
              : <div className="ow-grid">
                {shown.map((it, k) => (
                  <button key={k} className="ow-it" onClick={() => {
                    const r = makeOwn(pitchLayout, shape, look, P.brand, P.handle)
                    if (it.type === "board") P.onStart(withBoard(r, it.row), `board:${pitchLayout}:${shape}:${look}`)
                    else if (it.type === "shot") { const x = withShotSpot(r, it); P.onShot(x.r, x.slotId, it) }
                  }}>
                    <span className="th"><Near>{it.type === "board" ? <BoardThumb row={it.row} brand={P.brand} /> : it.type === "shot" ? <ShotThumb s={it} /> : null}</Near></span>
                    <span>{it.name}</span>
                  </button>
                ))}
              </div>}
        </div>
      )}
    </section>
  )
}
