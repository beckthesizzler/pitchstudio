import type { MapBlock } from "./MindMap"
import type { DiagramBlock } from "./Diagram"

/* Dump & Arrange's data: one row per note. A note with kind "tree" is a pile (its title is the pile's name, the first
   line of its page is the pile's question). An idea whose parent is a pile sits in it; an idea whose parent is another
   idea is tied to it by a thread; an idea with no parent (or whose parent has gone) sits in Just pinned. */

export type TextBlock = { type: "text"; id: string; html: string }
export type Block = TextBlock | MapBlock | DiagramBlock
export type Kind = "note" | "tree"
export type Color = "yellow" | "pink" | "peach" | "orange" | "lime" | "aqua" | "teal" | "lilac"
export type Status = "idea" | "making" | "made"
export type Note = { id: string; kind: Kind; parent_id: string | null; title: string; color: Color; pos: number; body: Block[]; updated_at: string; status: Status; made_ref: string | null }

export const COLORS: { id: Color; c: string; root: string }[] = [
  { id: "yellow", c: "#f7e36a", root: "#c9a92a" }, { id: "pink", c: "#f58cb4", root: "#d4588a" }, { id: "peach", c: "#f9b27e", root: "#d9814a" },
  { id: "orange", c: "#f6a04a", root: "#d2781c" }, { id: "lime", c: "#c8e86c", root: "#93b832" }, { id: "aqua", c: "#88dde0", root: "#3fb2b7" },
  { id: "teal", c: "#5ec6cb", root: "#2f9aa0" }, { id: "lilac", c: "#c6b6fb", root: "#8f78e8" },
]
export const col = (c: Color) => COLORS.find(x => x.id === c) ?? COLORS[0]
export const hex = (c: Color) => col(c).c
export const nid = () => { try { return crypto.randomUUID() } catch { return "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) } }
export const newText = (html = ""): TextBlock => ({ type: "text", id: nid(), html })
export const COLS = "id, kind, parent_id, title, color, pos, body, updated_at, status, made_ref"

export const STATUSES: { id: Status; label: string }[] = [{ id: "idea", label: "Idea" }, { id: "making", label: "Making" }, { id: "made", label: "Made" }]
const MADE_REF = /^(board|report|analysis):[0-9a-fA-F-]{36}$/
const MADE_NAME: Record<string, string> = { board: "Board", report: "Report", analysis: "Analysis" }
/** What an idea became: "Board", "Report" or "Analysis" */
export const madeLabel = (ref: string) => MADE_NAME[ref.split(":")[0]] ?? ""

/* ── words: only plain formatting survives (no scripts, no styles but a highlight) ── */
const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "MARK", "BR", "DIV", "P", "H2", "H3", "UL", "OL", "LI", "SPAN"])
export function clean(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html"), root = doc.body.firstElementChild!
  const walk = (el: Element) => {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) continue
      if (n.nodeType !== 1) { n.remove(); continue }
      const c = n as HTMLElement
      if (!KEEP.has(c.tagName)) { c.replaceWith(...[...c.childNodes]); continue }
      const bg = c.style?.backgroundColor
      for (const a of [...c.attributes]) c.removeAttribute(a.name)
      if (bg && (c.tagName === "SPAN" || c.tagName === "MARK")) c.setAttribute("style", `background-color: ${bg}`)
      walk(c)
    }
  }
  walk(root)
  return root.innerHTML.slice(0, 200000)
}
export const plain = (html: string) => { const d = document.createElement("div"); d.innerHTML = html; return (d.innerText || d.textContent || "").trim() }
function readBody(raw: unknown): Block[] {
  const out: Block[] = []
  for (const b of Array.isArray(raw) ? raw.slice(0, 200) : []) {
    if (!b || typeof b !== "object") continue
    const x = b as any
    if (x.type === "text" && typeof x.html === "string") out.push({ type: "text", id: String(x.id || nid()), html: clean(x.html) })
    else if (x.type === "map" && x.root && typeof x.root === "object") out.push(x as MapBlock)
    else if (x.type === "diagram" && Array.isArray(x.shapes)) out.push({ ...(x as DiagramBlock), h: Math.max(220, Math.min(1400, Number(x.h) || 360)), links: Array.isArray(x.links) ? x.links : [] })
  }
  return out.length ? out : [newText()]
}
export const readNote = (n: any): Note => ({
  id: String(n.id), kind: n.kind === "tree" ? "tree" : "note", parent_id: n.parent_id ?? null, title: String(n.title ?? ""),
  color: COLORS.some(c => c.id === n.color) ? n.color : "yellow", pos: Number(n.pos) || 0, body: readBody(n.body), updated_at: String(n.updated_at ?? new Date().toISOString()),
  status: STATUSES.some(s => s.id === n.status) ? n.status : "idea",
  made_ref: typeof n.made_ref === "string" && MADE_REF.test(n.made_ref) ? n.made_ref : null,
})
export const firstLine = (n: Note) => { const t = n.body.find((b): b is TextBlock => b.type === "text" && !!plain(b.html)); return t ? plain(t.html) : "" }
/** What an idea or a pile is called before it's named: an idea by its first line, a pile by the name it's waiting for */
export const nameOf = (n: Note) => n.title.trim() || (n.kind === "tree" ? "Name this pile" : firstLine(n).split(String.fromCharCode(10))[0].slice(0, 60) || "New idea")
