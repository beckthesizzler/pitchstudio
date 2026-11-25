import { useEffect, useRef, useState } from "react"

/* Drag and drop for Game Shots and Game Films, with the pointer (mouse, pen or finger), so it works the same
   from every thumbnail onto every folder: on the wall, in the list, in a folder, in the left rail.
   Anything with data-drop="<folder id | unsorted>" takes items; data-before="<item id>" puts them in front of that item.
   A press that never moves stays a click. */

export type DropAt = { folder?: string; before?: string }
type Live = { ids: string[]; pic?: string; sx: number; sy: number; moved: boolean; ghost: HTMLDivElement | null }

export function useItemDrag(onDrop: (ids: string[], at: DropAt) => void) {
  const live = useRef<Live | null>(null)
  const [dragging, setDragging] = useState<string[] | null>(null)
  const [over, setOver] = useState<DropAt | null>(null)
  const cb = useRef(onDrop); cb.current = onDrop

  const targetAt = (x: number, y: number): DropAt | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    const before = el?.closest("[data-before]") as HTMLElement | null
    if (before && !live.current?.ids.includes(before.dataset.before!)) return { before: before.dataset.before! }
    const f = el?.closest("[data-drop]") as HTMLElement | null
    return f ? { folder: f.dataset.drop! } : null
  }
  const finish = (x: number, y: number, drop: boolean) => {
    const l = live.current
    live.current = null
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel)
    window.removeEventListener("keydown", esc, true)
    if (!l) return
    l.ghost?.remove()
    setDragging(null); setOver(null)
    if (!l.moved) return
    // the click that follows a drag is not a click
    const swallow = (e: MouseEvent) => { e.stopPropagation(); e.preventDefault() }
    window.addEventListener("click", swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 50)
    if (drop) { const t = targetAt(x, y); if (t) cb.current(l.ids, t) }
  }
  function move(e: PointerEvent) {
    const l = live.current
    if (!l) return
    if (!l.moved) {
      if (Math.hypot(e.clientX - l.sx, e.clientY - l.sy) < 6) return
      l.moved = true
      const g = document.createElement("div")
      g.setAttribute("aria-hidden", "true")
      g.style.cssText = `position:fixed;left:0;top:0;width:120px;height:68px;border-radius:8px;pointer-events:none;z-index:9999;box-shadow:0 12px 30px rgba(0,0,0,.5);border:2px solid #d7ff3c;background:#2a2c31 center/cover;${l.pic ? `background-image:url("${l.pic}");` : ""}`
      if (l.ids.length > 1) { const b = document.createElement("span"); b.textContent = String(l.ids.length); b.style.cssText = "position:absolute;right:-8px;top:-8px;min-width:24px;height:24px;border-radius:12px;background:#d7ff3c;color:#0a0c0f;font:700 12px Inter,sans-serif;display:grid;place-items:center;padding:0 6px"; g.appendChild(b) }
      document.body.appendChild(g)
      l.ghost = g
      setDragging(l.ids)
    }
    l.ghost!.style.transform = `translate(${e.clientX - 60}px, ${e.clientY - 34}px) rotate(-3deg)`
    const t = targetAt(e.clientX, e.clientY)
    setOver(o => (o?.folder === t?.folder && o?.before === t?.before ? o : t))
  }
  function up(e: PointerEvent) { finish(e.clientX, e.clientY, true) }
  function cancel() { finish(0, 0, false) }
  function esc(e: KeyboardEvent) { if (e.key === "Escape" && live.current?.moved) { e.stopPropagation(); finish(0, 0, false) } }
  useEffect(() => () => { if (live.current) finish(0, 0, false) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Spread on anything that can be dragged */
  const handle = (ids: string[] | (() => string[]), pic?: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || live.current) return
      if ((e.target as HTMLElement).closest("[data-nodrag]")) return
      live.current = { ids: typeof ids === "function" ? ids() : ids, pic, sx: e.clientX, sy: e.clientY, moved: false, ghost: null }
      window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel)
      window.addEventListener("keydown", esc, true)
    },
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
  })
  return { handle, dragging, over }
}
