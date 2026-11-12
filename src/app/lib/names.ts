/* Names for work that hasn't been given one yet. Nothing is ever called "Untitled": a piece takes its name from its
   headline (or first line), and until it has one, from its kind and the day it was made, like "Report · 12 Nov". */

export type PieceKind = "Board" | "Analysis" | "Report"

/** "Board · 12 Nov": the kind and the day it was made */
export function dayName(kind: PieceKind, made?: string | number | Date | null): string {
  const d = made ? new Date(made) : new Date()
  return `${kind} · ${(isNaN(d.getTime()) ? new Date() : d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
}

const AUTO = /^(Board|Analysis|Report) · [0-9]{1,2} [A-Za-z]{3,4}$/
const OLD = /^Untitled (board|analysis|report)$/i
/** A name the app made (or an old "Untitled …"): the piece has no name of its own yet */
export const isAutoName = (t: string | null | undefined) => !!t && (AUTO.test(t.trim()) || OLD.test(t.trim()))

/** The name a piece shows and saves: the one you gave it, else its headline, else its kind and day */
export function pieceName(kind: PieceKind, own: string, headline = "", made?: string | number | Date | null): string {
  const o = own.trim()
  if (o && !isAutoName(o)) return o.slice(0, 80)
  const h = headline.replace(/[ ]+/g, " ").trim()
  return h ? h.slice(0, 80) : dayName(kind, made)
}

/** A saved name as it shows in a list: an old "Untitled …" becomes the kind and the day */
export const listName = (kind: PieceKind, saved: string | null | undefined, made?: string | null) => (saved && !OLD.test(saved.trim()) ? saved : dayName(kind, made))
