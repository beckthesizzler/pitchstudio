import { useEffect, useMemo, useRef, useState } from "react"
import { HAND, INKS, sketchBox } from "./sketch"

/* A mind map inside a note. Click an idea to pick it, then:
   Tab adds an idea under it, Enter adds one beside it, type (or double-click) to change its words, Delete removes it.
   It lays itself out: the main idea on the left, every branch growing to the right, each branch in its own colour. */

export type MapNode = { id: string; text: string; kids: MapNode[] }
export type MapBlock = { type: "map"; id: string; root: MapNode }
const NH = 42, GAPY = 14, GAPX = 64
const nid = () => { try { return crypto.randomUUID() } catch { return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) } }
const widthOf = (t: string, root: boolean) => Math.max(root ? 120 : 72, Math.min(280, (t || " ").length * (root ? 10.5 : 9) + 34))

type Laid = { n: MapNode; x: number; y: number; w: number; depth: number; branch: number; parent: Laid | null }
function layout(root: MapNode): { nodes: Laid[]; W: number; H: number } {
  const nodes: Laid[] = []
  const colW: number[] = []
  const walkW = (n: MapNode, d: number) => { colW[d] = Math.max(colW[d] ?? 0, widthOf(n.text, d === 0)); n.kids.forEach(k => walkW(k, d + 1)) }
  walkW(root, 0)
  const colX = colW.map((_, d) => colW.slice(0, d).reduce((a, w) => a + w + GAPX, 0))
  const height = (n: MapNode): number => (n.kids.length ? Math.max(NH, n.kids.reduce((a, k) => a + height(k), 0) + GAPY * (n.kids.length - 1)) : NH)
  const place = (n: MapNode, d: number, top: number, branch: number, parent: Laid | null) => {
    const h = height(n), me: Laid = { n, x: colX[d], y: top + h / 2 - NH / 2, w: widthOf(n.text, d === 0), depth: d, branch, parent }
    nodes.push(me)
    let t = top + (h - (n.kids.reduce((a, k) => a + height(k), 0) + GAPY * Math.max(0, n.kids.length - 1))) / 2
    n.kids.forEach((k, i) => { place(k, d + 1, t, d === 0 ? i : branch, me); t += height(k) + GAPY })
  }
  place(root, 0, 0, -1, null)
  const W = colX[colX.length - 1] + colW[colW.length - 1], H = height(root)
  return { nodes, W, H }
}
const find = (n: MapNode, id: string, parent: MapNode | null = null): { n: MapNode; parent: MapNode | null } | null => {
  if (n.id === id) return { n, parent }
  for (const k of n.kids) { const r = find(k, id, n); if (r) return r }
  return null
}
const mapTree = (n: MapNode, fn: (n: MapNode) => MapNode): MapNode => fn({ ...n, kids: n.kids.map(k => mapTree(k, fn)) })

export function MindMap({ block, onChange }: { block: MapBlock; onChange: (b: MapBlock) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const box = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null)
  const { nodes, W, H } = useMemo(() => layout(block.root), [block.root])
  const pad = 24, vw = W + 2 * pad, vh = H + 2 * pad
  const typed = useRef(false) // editing began with a keypress: keep that letter and carry on after it
  useEffect(() => {
    const el = input.current
    if (!editing || !el) return
    el.focus({ preventScroll: true })
    if (typed.current) el.setSelectionRange(el.value.length, el.value.length); else el.select()
    typed.current = false
  }, [editing])
  // a brand-new map opens with its main idea ready to type into
  useEffect(() => { if (!block.root.text && !block.root.kids.length) edit(block.root.id) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (root: MapNode) => onChange({ ...block, root })
  const edit = (id: string) => { const f = find(block.root, id); if (!f) return; setSel(id); setDraft(f.n.text); setEditing(id) }
  const commit = (then?: "child" | "sibling", refocus = true) => {
    if (!editing) return
    const text = draft.trim().slice(0, 120), id = editing
    let root = mapTree(block.root, n => (n.id === id ? { ...n, text } : n))
    setEditing(null)
    if (!text && !then) { drop(id, root, refocus); return } // a new idea left blank is not kept
    if (then) root = add(root, id, then)
    set(root)
    if (!then && refocus) box.current?.focus({ preventScroll: true })
  }
  const add = (root: MapNode, id: string, how: "child" | "sibling"): MapNode => {
    const fresh: MapNode = { id: nid(), text: "", kids: [] }
    const f = find(root, id)
    const target = how === "child" || !f?.parent ? id : f.parent.id
    const out = mapTree(root, n => {
      if (n.id !== target) return n
      if (how === "sibling" && f?.parent) { const i = n.kids.findIndex(k => k.id === id); const kids = [...n.kids]; kids.splice(i + 1, 0, fresh); return { ...n, kids } }
      return { ...n, kids: [...n.kids, fresh] }
    })
    setSel(fresh.id); setDraft(""); setEditing(fresh.id) // the same box stays focused, so typing straight on goes into the new idea
    return out
  }
  const drop = (id: string, root: MapNode, refocus: boolean) => {
    const f = find(root, id)
    if (id !== root.id && f && !f.n.kids.length) { const strip = (n: MapNode): MapNode => ({ ...n, kids: n.kids.filter(k => k.id !== id).map(strip) }); set(strip(root)); setSel(f.parent?.id ?? null) }
    else set(root)
    if (refocus) box.current?.focus({ preventScroll: true })
  }
  const remove = (id: string) => {
    if (id === block.root.id) return
    const f = find(block.root, id)
    const strip = (n: MapNode): MapNode => ({ ...n, kids: n.kids.filter(k => k.id !== id).map(strip) })
    set(strip(block.root)); setSel(f?.parent?.id ?? null)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (editing) return
    if (!sel) return
    if (e.key === "Tab") { e.preventDefault(); set(add(block.root, sel, "child")) }
    else if (e.key === "Enter") { e.preventDefault(); set(add(block.root, sel, "sibling")) }
    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(sel) }
    else if (e.key === "F2") { e.preventDefault(); edit(sel) }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { e.preventDefault(); typed.current = true; setDraft(e.key); setEditing(sel) }
  }
  const ed = nodes.find(l => l.n.id === editing)
  return (
    <div ref={box} className="bd-map" tabIndex={0} onKeyDown={onKey} aria-label="Mind map: Tab adds an idea under, Enter beside, Delete removes"
      onPointerDown={e => { if (e.target === e.currentTarget || (e.target as Element).tagName === "svg") { setSel(null); if (editing) commit(undefined, false) } }}>
      <div style={{ position: "relative", width: vw, height: vh, margin: "0 auto" }}>
        <svg width={vw} height={vh} viewBox={`${-pad} ${-pad} ${vw} ${vh}`} style={{ display: "block", overflow: "visible" }}>
          {nodes.filter(l => l.parent).map(l => {
            const p = l.parent!, c = INKS[(l.branch < 0 ? 0 : l.branch) % 5]
            const x1 = p.x + p.w, y1 = p.y + NH / 2, x2 = l.x, y2 = l.y + NH / 2
            return <path key={"l" + l.n.id} d={`M${x1},${y1} C${x1 + GAPX * 0.55},${y1} ${x2 - GAPX * 0.55},${y2} ${x2},${y2}`} fill="none" stroke={c.stroke} strokeWidth={2} strokeLinecap="round" opacity={0.85} />
          })}
          {nodes.map(l => {
            const root = l.depth === 0, c = root ? { fill: "#fff8d6", stroke: "#1b1a17" } : INKS[l.branch % 5], on = sel === l.n.id
            return (
              <g key={l.n.id} style={{ cursor: "pointer" }} onPointerDown={e => { e.stopPropagation(); if (editing && editing !== l.n.id) commit(undefined, false); setSel(l.n.id); box.current?.focus({ preventScroll: true }) }}
                onDoubleClick={() => edit(l.n.id)}>
                <path d={sketchBox(l.x, l.y, l.w, NH, l.n.id, 14)} fill={c.fill} stroke="none" />
                <path d={sketchBox(l.x, l.y, l.w, NH, l.n.id, 14)} fill="none" stroke={c.stroke} strokeWidth={root ? 2.2 : 1.6} strokeLinejoin="round" />
                {on && <path d={sketchBox(l.x - 5, l.y - 5, l.w + 10, NH + 10, l.n.id + "s", 18, 1)} fill="none" stroke="#1b1a17" strokeWidth={1.2} strokeDasharray="5 4" />}
                {editing !== l.n.id && (
                  <text x={l.x + l.w / 2} y={l.y + NH / 2 + 1} textAnchor="middle" dominantBaseline="central" fill={l.n.text ? "#1b1a17" : "#9a958a"}
                    fontSize={root ? 19 : 16.5} fontWeight={root ? 700 : 400} style={{ fontFamily: HAND }}>{l.n.text || (root ? "Main idea" : "New idea")}</text>
                )}
              </g>
            )
          })}
        </svg>
        {ed && (
          <input ref={input} className="bd-map-inp" value={draft} maxLength={120} aria-label="Idea"
            style={{ left: ed.x + pad, top: ed.y + pad, width: Math.max(ed.w, widthOf(draft, ed.depth === 0)), height: NH, fontSize: ed.depth === 0 ? 19 : 16.5, fontWeight: ed.depth === 0 ? 700 : 400 }}
            onChange={e => setDraft(e.target.value)} onBlur={e => { if (e.relatedTarget !== input.current) commit(undefined, !!(e.relatedTarget && box.current?.contains(e.relatedTarget as Node))) }}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); commit(ed.depth === 0 ? "child" : "sibling") }
              else if (e.key === "Tab") { e.preventDefault(); commit("child") }
              else if (e.key === "Escape") { e.preventDefault(); commit() }
            }} />
        )}
      </div>
      <p className="bd-hint">{sel ? "Tab: an idea under it · Enter: one beside it · type to change it · Delete removes" : "Click an idea to grow the map from it"}</p>
    </div>
  )
}

export const newMap = (): MapBlock => ({ type: "map", id: nid(), root: { id: nid(), text: "", kids: [] } })
