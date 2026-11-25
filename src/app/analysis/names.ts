import { supabase } from "../lib/supabase"

/* Player names for tags: the squads of the two teams on the Game Shot (football-data.org's squads, kept in squad_cache
   once its token is set), then every name you've typed before, on boards or here. */

const NAMES_KEY = "ps-recent-names" // shared with the Tactics Board
type SquadMan = { n: string; f?: string; num?: number | null; pos?: string | null }
const ALIASES: Record<string, string> = {
  barca: "barcelona", "man utd": "manchester united", "man united": "manchester united", "man city": "manchester city", spurs: "tottenham",
  atleti: "atletico", inter: "internazionale", "inter milan": "internazionale", psg: "paris saint-germain", juve: "juventus", bayern: "bayern munchen",
  bvb: "dortmund", real: "real madrid", madrid: "real madrid", wolves: "wolverhampton", milan: "ac milan", "athletic club": "athletic", "athletic bilbao": "athletic",
}
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim()
const seen = new Map<string, Promise<SquadMan[]>>()
function findSquad(name: string): Promise<SquadMan[]> {
  let q = plain(name)
  q = ALIASES[q] ?? q.replace(/^(fc|cf|afc|ac|as|ssc|sc|rc|cd|ud|sl|sv|vfb|vfl|1 fc) /, "").replace(/ (fc|cf|afc)$/, "")
  if (q.length < 3 || q === "us" || q === "them") return Promise.resolve([])
  if (!seen.has(q)) seen.set(q, (async () => {
    try {
      const { data } = await (supabase as any).from("squad_cache").select("name, search, squad").ilike("search", `%${q}%`).limit(8)
      const rows = ((data ?? []) as { name: string; search: string; squad: SquadMan[] }[]).filter(r => Array.isArray(r.squad) && r.squad.length)
      rows.sort((a, b) => Number(!a.search.startsWith(q) && !a.search.includes(" " + q)) - Number(!b.search.startsWith(q) && !b.search.includes(" " + q)) || a.name.length - b.name.length)
      return rows[0]?.squad ?? []
    } catch { seen.delete(q); return [] }
  })())
  return seen.get(q)!
}
export function recentNames(): string[] {
  try { const v = JSON.parse(localStorage.getItem(NAMES_KEY) || "[]"); return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, 300) : [] } catch { return [] }
}
/** Remembers tag names as you use them (newest first, 300 at most) */
export function rememberNames(names: string[]) {
  const fresh = names.map(n => n.trim()).filter(n => n.length > 1 && n.length <= 40)
  if (!fresh.length) return
  const have = recentNames(), out: string[] = [], keys = new Set<string>()
  for (const n of [...fresh, ...have]) { const k = n.toLowerCase(); if (!keys.has(k)) { keys.add(k); out.push(n) } }
  if (out.slice(0, fresh.length).join("\n") === have.slice(0, fresh.length).join("\n") && out.length === have.length) return
  try { localStorage.setItem(NAMES_KEY, JSON.stringify(out.slice(0, 300))) } catch { /* full: suggestions just won't grow */ }
}
export type NameHint = { value: string; label: string }
/** Suggestions for a Game Shot whose teams are called a and b */
export async function nameHints(a: string, b: string): Promise<NameHint[]> {
  const [sa, sb] = await Promise.all([findSquad(a), findSquad(b)])
  const out: NameHint[] = [], keys = new Set<string>()
  const add = (value: string, label: string) => { const k = value.toLowerCase(); if (value && !keys.has(k)) { keys.add(k); out.push({ value, label }) } }
  for (const [team, sq] of [[a, sa], [b, sb]] as const) for (const m of sq) add(m.n.toUpperCase(), `${m.num ? `#${m.num} · ` : ""}${team}${m.pos ? ` · ${m.pos}` : ""}`)
  for (const n of recentNames()) add(n, "You used this")
  return out.slice(0, 400)
}
