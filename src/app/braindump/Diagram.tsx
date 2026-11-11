import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Circle, MousePointer2, Square, Trash2, Type } from "lucide-react"
import { HAND, INKS, arrowHead, edgePoint, ink, sketchBox, sketchEllipse, sketchLine } from "./sketch"

/* A diagram inside a note, drawn as if by hand: boxes, ovals, words and arrows between them.
   Pick a tool and click to place it; drag to move; pull the corner to resize; double-click to write in it;
   with the arrow, drag from one shape to another to join them. Delete removes what's picked. */

export type DShape = { id: string; kind: "box" | "oval" | "text"; x: number; y: number; w: number; h: number; text: string; color: string }
export type DLink = { id: string; a: string; b: string }
export type DiagramBlock = { type: "diagram"; id: string; h: number; shapes: DShape[]; links: DLink[] }
type Tool = "select" | "box" | "oval" | "text" | "arrow"
const nid = () => { try { return crypto.randomUUID() } catch { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) } }
const MAX = 120

export function Diagram({ block, onChange }: { block: DiagramBlock; onChange: (b: DiagramBlock) => void }) {
  const [tool, setTool] = useState<Tool>("box")
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [drag, setDrag] = useState<null | { kind: "move" | "size" | "link" | "height"; id: string; ox: number; oy: number; sx: number; sy: number; sw: number; sh: number; x: number; y: number }>(null)
  const svg = useRef<SVGSVGElement>(null), wrap = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null)
  const [color, setColor] = useState("blue")
  useEffect(() => { if (editing) { input.current?.focus({ preventScroll: true }); input.current?.select() } }, [editing])

  const at = (e: { clientX: number; clientY: number }) => { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const shapeAt = (x: number, y: number) => [...block.shapes].reverse().find(s => x >= s.x - 4 && x <= s.x + s.w + 4 && y >= s.y - 4 && y <= s.y + s.h + 4)
  const put = (shapes: DShape[], links = block.links) => onChange({ ...block, shapes, links })
  const patch = (id: string, p: Partial<DShape>) => put(block.shapes.map(s => (s.id === id ? { ...s, ...p } : s)))
  const remove = (id: string) => {
    if (block.links.some(l => l.id === id)) { onChange({ ...block, links: block.links.filter(l => l.id !== id) }); setSel(null); return }
    put(block.shapes.filter(s => s.id !== id), block.links.filter(l => l.a !== id && l.b !== id)); setSel(null)
  }

  const down = (e: React.PointerEvent) => {
    if (editing) { setEditing(null); wrap.current?.focus({ preventScroll: true }); return }
    const p = at(e), hit = shapeAt(p.x, p.y)
    if (tool === "arrow" || tool === "select" || hit) wrap.current?.focus({ preventScroll: true })
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (tool === "arrow") { if (hit) setDrag({ kind: "link", id: hit.id, ox: 0, oy: 0, sx: p.x, sy: p.y, sw: 0, sh: 0, x: p.x, y: p.y }); return }
    if (tool === "select" || hit) {
      if (!hit) { setSel(null); return }
      setSel(hit.id)
      const corner = p.x > hit.x + hit.w - 14 && p.y > hit.y + hit.h - 14
      setDrag({ kind: corner ? "size" : "move", id: hit.id, ox: p.x - hit.x, oy: p.y - hit.y, sx: hit.x, sy: hit.y, sw: hit.w, sh: hit.h, x: p.x, y: p.y })
      return
    }
    if (block.shapes.length >= MAX) return
    const w = tool === "text" ? 150 : tool === "oval" ? 150 : 170, h = tool === "text" ? 44 : tool === "oval" ? 84 : 70
    const s: DShape = { id: nid(), kind: tool, x: Math.max(4, p.x - w / 2), y: Math.max(4, p.y - h / 2), w, h, text: "", color }
    put([...block.shapes, s]); setSel(s.id); setEditing(s.id); setTool("select")
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const p = at(e)
    if (drag.kind === "move") patch(drag.id, { x: Math.max(0, p.x - drag.ox), y: Math.max(0, p.y - drag.oy) })
    else if (drag.kind === "size") patch(drag.id, { w: Math.max(50, drag.sw + p.x - drag.x), h: Math.max(32, drag.sh + p.y - drag.y) })
    else if (drag.kind === "link") setDrag({ ...drag, x: p.x, y: p.y })
  }
  const up = (e: React.PointerEvent) => {
    if (drag?.kind === "link") {
      const p = at(e), hit = shapeAt(p.x, p.y)
      if (hit && hit.id !== drag.id && !block.links.some(l => (l.a === drag.id && l.b === hit.id))) onChange({ ...block, links: [...block.links, { id: nid(), a: drag.id, b: hit.id }] })
    }
    setDrag(null)
  }
  // the canvas grows with the drawing: pull its bottom edge to make room
  useEffect(() => {
    if (drag?.kind !== "height") return
    const mv = (e: PointerEvent) => onChange({ ...block, h: Math.max(220, Math.min(1400, drag.sh + e.clientY - drag.y)) })
    const u = () => setDrag(null)
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", u)
    return () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", u) }
  })
  const key = (e: React.KeyboardEvent) => {
    if (editing) return
    if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); remove(sel) }
    else if (e.key === "Escape") { setSel(null); setTool("select") }
    else if (e.key === "Enter" && sel && block.shapes.some(s => s.id === sel)) { e.preventDefault(); setEditing(sel) }
  }
  const selShape = block.shapes.find(s => s.id === sel)
  const ed = block.shapes.find(s => s.id === editing)
  const src = drag?.kind === "link" ? block.shapes.find(s => s.id === drag.id) : null
  const tools: [Tool, string, React.ReactNode][] = [["select", "Select", <MousePointer2 size={15} />], ["box", "Box", <Square size={15} />], ["oval", "Oval", <Circle size={15} />], ["text", "Words", <Type size={15} />], ["arrow", "Arrow", <ArrowUpRight size={15} />]]
  return (
    <div className="bd-dia" ref={wrap} tabIndex={0} onKeyDown={key} aria-label="Diagram">
      <div className="bd-dia-bar" onPointerDown={e => e.stopPropagation()}>
        {tools.map(([t, name, icon]) => <button key={t} aria-pressed={tool === t} aria-label={name} title={name} onClick={() => setTool(t)}>{icon}</button>)}
        <span className="bd-sep" />
        {INKS.map(i => (
          <button key={i.id} aria-label={`Colour ${i.id}`} aria-pressed={(selShape?.color ?? color) === i.id} onClick={() => { setColor(i.id); if (selShape) patch(selShape.id, { color: i.id }) }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: i.fill, border: `1.5px solid ${i.stroke}`, display: "block" }} />
          </button>
        ))}
        {sel && <><span className="bd-sep" /><button aria-label="Delete" title="Delete" onClick={() => remove(sel)}><Trash2 size={15} /></button></>}
      </div>
      <div style={{ position: "relative" }}>
        <svg ref={svg} width="100%" height={block.h} style={{ display: "block", touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
          onMouseDown={e => e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={e => { const p = at(e), hit = shapeAt(p.x, p.y); if (hit) setEditing(hit.id) }}>
          <defs>
            <pattern id={"dots" + block.id} width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="rgba(27,26,23,0.12)" /></pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#dots${block.id})`} />
          {block.links.map(l => {
            const a = block.shapes.find(s => s.id === l.a), b = block.shapes.find(s => s.id === l.b)
            if (!a || !b) return null
            const p1 = edgePoint(a, b.x + b.w / 2, b.y + b.h / 2, a.kind === "oval"), p2 = edgePoint(b, a.x + a.w / 2, a.y + a.h / 2, b.kind === "oval")
            return (
              <g key={l.id} onPointerDown={e => { if (tool === "select") { e.stopPropagation(); setSel(l.id) } }} style={{ cursor: "pointer" }}>
                <path d={`M${p1.x},${p1.y} L${p2.x},${p2.y}`} stroke="transparent" strokeWidth={14} />
                <path d={sketchLine(p1.x, p1.y, p2.x, p2.y, l.id)} fill="none" stroke={sel === l.id ? "#d9483b" : "#1b1a17"} strokeWidth={1.6} strokeLinecap="round" />
                <path d={arrowHead(p1.x, p1.y, p2.x, p2.y)} fill="none" stroke={sel === l.id ? "#d9483b" : "#1b1a17"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )
          })}
          {block.shapes.map(s => {
            const c = ink(s.color), d = s.kind === "oval" ? sketchEllipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, s.h / 2, s.id) : sketchBox(s.x, s.y, s.w, s.h, s.id, 12)
            const lines = (s.text || "").split(String.fromCharCode(10)).slice(0, 6)
            return (
              <g key={s.id} style={{ cursor: tool === "select" ? "move" : undefined }}>
                {s.kind !== "text" && <path d={d} fill={c.fill} />}
                {s.kind !== "text" && <path d={d} fill="none" stroke={c.stroke} strokeWidth={1.7} strokeLinejoin="round" />}
                {s.kind === "text" && sel === s.id && <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="none" stroke="#1b1a17" strokeDasharray="4 4" />}
                {editing !== s.id && (
                  <text x={s.x + s.w / 2} y={s.y + s.h / 2 - ((lines.length - 1) * 20) / 2} textAnchor="middle" dominantBaseline="central" fill={s.text ? (s.kind === "text" ? c.stroke : "#1b1a17") : "#9a958a"}
                    fontSize={s.kind === "text" ? 20 : 17} fontWeight={s.kind === "text" ? 700 : 400} style={{ fontFamily: HAND, pointerEvents: "none" }}>
                    {(s.text ? lines : ["Write here"]).map((t, i) => <tspan key={i} x={s.x + s.w / 2} dy={i ? 20 : 0}>{t}</tspan>)}
                  </text>
                )}
                {sel === s.id && s.kind !== "text" && <path d={sketchBox(s.x - 6, s.y - 6, s.w + 12, s.h + 12, s.id + "s", 16, 0.8)} fill="none" stroke="#1b1a17" strokeWidth={1.1} strokeDasharray="5 4" />}
                {sel === s.id && <rect x={s.x + s.w - 9} y={s.y + s.h - 9} width={12} height={12} rx={3} fill="#ffffff" stroke="#1b1a17" strokeWidth={1.4} style={{ cursor: "nwse-resize" }} />}
              </g>
            )
          })}
          {src && drag && <path d={`M${src.x + src.w / 2},${src.y + src.h / 2} L${drag.x},${drag.y}`} stroke="#1b1a17" strokeWidth={1.5} strokeDasharray="5 5" />}
        </svg>
        {ed && (
          <textarea ref={input} className="bd-dia-inp" value={ed.text} maxLength={200} aria-label="Words"
            style={{ left: ed.x, top: ed.y, width: ed.w, height: ed.h, fontSize: ed.kind === "text" ? 20 : 17, fontWeight: ed.kind === "text" ? 700 : 400 }}
            onChange={e => patch(ed.id, { text: e.target.value })} onBlur={() => setEditing(null)}
            onKeyDown={e => { if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); setEditing(null); wrap.current?.focus({ preventScroll: true }) } }} />
        )}
        {block.shapes.length === 0 && <p className="bd-dia-empty">Click to draw a box. Join two with the arrow tool.</p>}
        <div className="bd-dia-grow" title="Drag to make room" onPointerDown={e => { e.preventDefault(); setDrag({ kind: "height", id: "", ox: 0, oy: 0, sx: 0, sy: 0, sw: 0, sh: block.h, x: e.clientX, y: e.clientY }) }} />
      </div>
    </div>
  )
}

export const newDiagram = (): DiagramBlock => ({ type: "diagram", id: nid(), h: 360, shapes: [], links: [] })
