import { useEffect, useRef, useState } from "react"
import { ArrowRight, Link2, Loader2, Plus, X } from "lucide-react"
import { firstLine, nameOf, type Note } from "./notes"

/* "Grow this idea": the tree, asked for in three steps. The question is the root, every point is a branch and the
   proof under a point is a twig; the tree beside it draws itself as you type. What you make from it is the fruit. */
export function GrowPanel({ pile, kids, onQuestion, onAdd, onTitle, onRemove, onMake, onLink, onClose, making }: {
  pile: Note
  kids: (id: string) => Note[]
  onQuestion: (text: string) => void
  onAdd: (parent: string) => Promise<Note | null>
  onTitle: (id: string, title: string) => void
  onRemove: (id: string) => void
  onMake: () => void
  onLink: () => void
  onClose: () => void
  making: boolean
}) {
  const [fresh, setFresh] = useState<string | null>(null) // the item just added: it takes the cursor
  const [q, setQ] = useState(() => firstLine(pile))
  useEffect(() => { setQ(firstLine(pile)) }, [pile.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const points = kids(pile.id).filter(n => n.kind === "note")
  const add = async (parent: string) => { const n = await onAdd(parent); if (n) setFresh(n.id) }
  const box = useRef<HTMLElement>(null)
  useEffect(() => { // the line just added takes the cursor, once it's on the page
    if (fresh) box.current?.querySelector<HTMLInputElement>(`[data-gid="${fresh}"]`)?.focus()
  }, [fresh])
  const done = [q.trim() !== "", points.some(p => p.title.trim()), !!pile.made_ref]
  const leave = (n: Note) => { if (!n.title.trim() && !kids(n.id).length) onRemove(n.id) } // an empty line left behind goes away
  const field = (n: Note, cls: string, ph: string, label: string) => (
    <div className={`bd-gr-item ${cls}`} key={n.id}>
      <input data-gid={n.id} value={n.title} maxLength={120} placeholder={ph} aria-label={label}
        onChange={e => onTitle(n.id, e.target.value)} onBlur={() => leave(n)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(cls === "proof" ? n.parent_id ?? pile.id : pile.id) } }} />
      <button className="bd-gr-x" onClick={() => onRemove(n.id)} aria-label={`Remove ${nameOf(n)}`}><X size={14} /></button>
    </div>
  )
  return (
    <aside className="bd-gr" aria-label="Grow this idea" ref={box}>
      <div className="bd-gr-top"><b>Grow this idea</b><button className="bd-gr-x" onClick={onClose} aria-label="Close Grow this idea"><X size={16} /></button></div>
      <p className="bd-gr-lead">Three steps. The tree beside this draws itself as you go.</p>

      <section className={done[0] ? "on" : ""}>
        <h3><i>1</i>The question</h3>
        <textarea rows={2} value={q} maxLength={200} placeholder="What is this idea trying to answer?" aria-label="The question"
          onChange={e => { setQ(e.target.value); onQuestion(e.target.value) }} />
        <small>The root of the tree. One question, in your words.</small>
      </section>

      <section className={done[1] ? "on" : ""}>
        <h3><i>2</i>Your points</h3>
        {points.map(p => (
          <div className="bd-gr-point" key={p.id}>
            {field(p, "point", "A point that answers it", "Point")}
            {kids(p.id).filter(n => n.kind === "note").map(k => field(k, "proof", "Proof: a clip, a stat, a moment", "Proof"))}
            <button className="bd-gr-add small" onClick={() => add(p.id)}><Plus size={13} /> Add proof</button>
          </div>
        ))}
        <button className="bd-gr-add" onClick={() => add(pile.id)}><Plus size={15} /> Add a point</button>
        <small>Points are the branches. Proof hangs off them as twigs. Press Enter for the next line.</small>
      </section>

      <section className={done[2] ? "on" : ""}>
        <h3><i>3</i>What will you make?</h3>
        <button className="bd-gr-make" onClick={onMake} disabled={making || (!q.trim() && !points.length)}>
          {making ? <Loader2 size={15} className="bd-spin" /> : <ArrowRight size={15} />} Make a match report from it
        </button>
        <button className="bd-gr-add" onClick={onLink}><Link2 size={14} /> Link a board or report you made</button>
        <small>{pile.made_ref ? "It's on the tree as fruit. Tap it to open." : "Your question becomes the headline, your points the story."}</small>
      </section>
    </aside>
  )
}

export const GROW_CSS = `
  .bd-tv-body { flex: 1; min-height: 0; display: flex; }
  .bd-tv-body > .bd-tv-scroll { flex: 1; min-width: 0; }
  .bd-gr { width: 340px; flex-shrink: 0; overflow-y: auto; padding: 16px 16px 24px; background: #F4EEDC; color: #1b1a17; border-right: 1px solid rgba(27,26,23,.14); display: flex; flex-direction: column; gap: 18px; }
  .bd-gr-top { display: flex; align-items: center; justify-content: space-between; }
  .bd-gr-top b { font: 700 13px 'JetBrains Mono', ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; }
  .bd-gr-lead { margin: -10px 0 0; font-size: 13px; color: rgba(27,26,23,.65); }
  .bd-gr section { display: flex; flex-direction: column; gap: 8px; }
  .bd-gr h3 { margin: 0; display: flex; align-items: center; gap: 9px; font: 700 15px 'Inter', sans-serif; }
  .bd-gr h3 i { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font: 700 12px 'JetBrains Mono', monospace; font-style: normal; background: rgba(27,26,23,.1); }
  .bd-gr section.on h3 i { background: #1b1a17; color: #d7ff3c; }
  .bd-gr small { font-size: 12px; color: rgba(27,26,23,.6); line-height: 1.4; }
  .bd-gr textarea, .bd-gr input { width: 100%; border: 1px solid rgba(27,26,23,.2); border-radius: 8px; background: #fffdf6; color: #1b1a17; font: 500 15px 'Inter', sans-serif; padding: 9px 10px; outline: none; resize: vertical; }
  .bd-gr textarea:focus, .bd-gr input:focus { border-color: #1b1a17; box-shadow: 0 0 0 2px rgba(27,26,23,.12); }
  .bd-gr-point { display: flex; flex-direction: column; gap: 6px; padding-bottom: 6px; border-bottom: 1px dashed rgba(27,26,23,.18); }
  .bd-gr-item { display: flex; align-items: center; gap: 6px; }
  .bd-gr-item.point input { font-weight: 600; }
  .bd-gr-item.proof { padding-left: 18px; position: relative; }
  .bd-gr-item.proof:before { content: ""; position: absolute; left: 6px; top: 50%; width: 8px; border-top: 2px solid #8A7A62; }
  .bd-gr-item.proof input { font-size: 14px; padding: 7px 9px; }
  .bd-gr-x { width: 32px; height: 32px; flex-shrink: 0; border: none; border-radius: 8px; background: none; color: rgba(27,26,23,.55); display: grid; place-items: center; cursor: pointer; }
  .bd-gr-x:hover { background: rgba(27,26,23,.08); color: #1b1a17; }
  .bd-gr-add { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border: 1px dashed rgba(27,26,23,.35); border-radius: 8px; background: none; color: #1b1a17; font: 600 13px 'Inter', sans-serif; cursor: pointer; }
  .bd-gr-add.small { min-height: 30px; margin-left: 18px; font-size: 12px; border-style: dotted; }
  .bd-gr-add:hover { background: rgba(255,255,255,.5); }
  .bd-gr-make { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border: none; border-radius: 10px; background: #1b1a17; color: #fff; font: 700 14px 'Inter', sans-serif; cursor: pointer; }
  .bd-gr-make:disabled { opacity: .4; cursor: default; }
  .bd-spin { animation: bd-spin 1s linear infinite; } @keyframes bd-spin { to { transform: rotate(360deg); } }
  .bd-tv-fruit { position: absolute; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: none; border-radius: 999px; background: #1b1a17; color: #d7ff3c; font: 700 13px 'Inter', sans-serif; cursor: pointer; white-space: nowrap; box-shadow: 0 8px 18px -8px rgba(0,0,0,.6); }
  @media (max-width: 700px) {
    .bd-tv-body { flex-direction: column; }
    .bd-gr { width: auto; max-height: 52%; border-right: none; border-bottom: 1px solid rgba(27,26,23,.14); }
    .bd-gr textarea, .bd-gr input { font-size: 16px; }
    .bd-gr-x { width: 40px; height: 40px; }
  }
`
