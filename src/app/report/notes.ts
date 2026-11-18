/* Paste your notes: a thread, bullet points or a voice note typed up, read for the parts of a report. Plain pattern
   matching (the same idea as Paste a line-up), so it costs nothing and works offline. What it finds is shown before
   anything is made, and everything can be changed afterwards. */

export type Notes = {
  home: string; away: string; score: string // "Barça", "Madrid", "2–1"; empty when there is no score
  headline: string
  idea: string // the first paragraph that isn't the headline or a list
  points: string[] // up to five, from bullets or numbered lines
  players: string[] // names you've used before, or capitalised names that come up in the notes
  potm: string // player of the match
}

const DASH = "[-–—:]"
const SCORE = new RegExp(`([\\p{L}][\\p{L}.' ]{1,28}?)\\s+(\\d{1,2})\\s*${DASH}\\s*(\\d{1,2})\\s+([\\p{L}][\\p{L}.' ]{1,28})`, "u")
const BULLET = /^\s*(?:[-•*·▪︎►]|\d{1,2}[.)])\s+/
const POTM = /^\s*(?:player of the match|man of the match|potm|motm|star man)\s*[:\-–]\s*(.+)$/i
const HEADER = /^[^.!?]{0,40}:\s*$/ // "3 things:" introduces a list
// words that start with a capital but aren't players
const STOP = new Set(("The A An And But Or So If When Then That This These Those It Its We Our Us They Their He His She Her I My You Your " +
  "First Second Third Half Second-half Champions League Liga Cup Copa Premier Serie Bundesliga Ligue Europa UCL VAR XI Player Match Goal Goals " +
  "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December " +
  "Madrid Barça Barca Barcelona City United Real Atlético Atletico Bayern Inter Milan Juventus Arsenal Chelsea Liverpool Tottenham Villa PSG Dortmund Napoli Roma " +
  "MOTM POTM Man Star One Two Three Four Five Six Seven Eight Nine Ten Yes No Not Why How What Who Where Still Just After Before Every Each Both Also").split(" "))

const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t)
const sentence = (t: string) => t.replace(/\s+/g, " ").trim()
// whole sentences up to n characters; one long sentence is cut at a word
const sentences = (t: string, n: number) => {
  if (t.length <= n) return t
  let out = ""
  for (const p of t.split(/(?<=[.!?])\s+/)) { if ((out + " " + p).trim().length > n) break; out = (out + " " + p).trim() }
  return out || clip(t, n)
}
// a headline: a long first sentence is cut where a clause ends ("…, and", "but", "so"), never mid-thought
const headlineOf = (t: string) => {
  t = t.replace(/[.!]+$/, "")
  if (t.length <= 64) return { head: t, cut: false }
  const m = [...t.slice(0, 64).matchAll(/,\s|\s(?:and|but|so|because|while|as)\s|\s[–—-]\s/g)].pop()
  return m && m.index! >= 12 ? { head: t.slice(0, m.index!), cut: true } : { head: clip(t, 64), cut: true }
}

export function readNotes(text: string, known: string[] = []): Notes {
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trim())
  const out: Notes = { home: "", away: "", score: "", headline: "", idea: "", points: [], players: [], potm: "" }
  const used = new Set<number>()

  // player of the match
  lines.forEach((l, i) => { const m = l.match(POTM); if (m && !out.potm) { out.potm = clip(sentence(m[1]).replace(/[.!]+$/, ""), 32); used.add(i) } })
  // points: bullets and numbered lines (and the "3 things:" line before them)
  lines.forEach((l, i) => {
    if (used.has(i)) return
    if (BULLET.test(l)) { if (out.points.length < 5) out.points.push(clip(sentence(l.replace(BULLET, "")), 120)); used.add(i) }
    else if (HEADER.test(l) && lines.slice(i + 1).some(x => BULLET.test(x))) used.add(i)
  })
  // the first line: a score and a headline
  let cutFirst = "" // a first sentence too long for a headline still belongs in the idea
  const firstAt = lines.findIndex((l, i) => l && !used.has(i))
  if (firstAt >= 0) {
    used.add(firstAt)
    const first = sentence(lines[firstAt]), parts = first.split(/(?<=[.!?])\s+/).filter(Boolean)
    const at = parts.findIndex(p => SCORE.test(p))
    if (at >= 0) {
      const m = parts[at].match(SCORE)!
      out.home = m[1].trim(); out.away = m[4].replace(/[.!?,]+$/, "").trim(); out.score = `${m[2]}–${m[3]}`
      const left = parts[at].replace(m[0], "").replace(/^[\s,.;:–—-]+/, "").trim() // "…, dull game but Rice was everywhere."
      if (left.length > 3) parts[at] = left[0].toUpperCase() + left.slice(1); else parts.splice(at, 1)
    }
    const hd = headlineOf(parts[0] ?? "")
    out.headline = hd.head
    if (hd.cut) cutFirst = parts[0]
  }
  // the idea: the first paragraph left
  const rest = lines.map((l, i) => (used.has(i) ? "" : l)).join("\n").split(/\n\s*\n/).map(sentence).filter(Boolean)
  if (!out.headline && rest.length) out.headline = headlineOf(rest.shift()!.split(/(?<=[.!?])\s+/)[0]).head
  out.idea = sentences(rest[0] ?? cutFirst, 260)
  if (!out.headline && out.score) out.headline = `${out.home} ${out.score} ${out.away}`

  // players: names you've used before, then capitalised words that aren't the start of a sentence (or that come up twice)
  const all = text.replace(/\r/g, "")
  const knownHit = known.filter(n => n && new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "iu").test(all))
  const counts = new Map<string, number>(), mid = new Set<string>()
  for (const m of all.matchAll(/(^|[\s(“"'])(\p{Lu}[\p{L}'’-]{2,})/gu)) {
    const w = m[2].replace(/['’]s$/, "")
    if (STOP.has(w) || w === out.home || w === out.away || /^\d/.test(w)) continue
    counts.set(w, (counts.get(w) ?? 0) + 1)
    const at = m.index! + m[1].length, lineStart = all.lastIndexOf("\n", at - 1) + 1, lead = all.slice(lineStart, at)
    const before = all.slice(0, at).trimEnd()
    if (BULLET.test(lead) && !lead.replace(BULLET, "").trim()) mid.add(w) // the first word of a point: lists of players start this way
    else if (before && !/[.!?:\n]$/.test(before)) mid.add(w) // in the middle of a sentence
  }
  const guessed = [...counts.keys()].filter(w => mid.has(w) || (counts.get(w) ?? 0) > 1)
  const seen = new Set<string>()
  const names = [...knownHit, ...(out.potm ? [out.potm] : []), ...guessed].filter(n => { const k = n.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  // "Declan Rice" and "Rice" are one player: keep the short name, it reads better on a pitch
  const word = (a: string, b: string) => a !== b && new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i").test(b)
  out.players = names.filter(n => !names.some(o => word(o, n))).slice(0, 6)
  return out
}

/** What was found, as chips: shown before you commit */
export function foundOf(n: Notes): string[] {
  return [n.headline && "Headline", n.score && `Score ${n.score}`, n.idea && "The idea", n.points.length && `${n.points.length} point${n.points.length === 1 ? "" : "s"}`,
    n.players.length && `${n.players.length} player${n.players.length === 1 ? "" : "s"}`, n.potm && "Player of the match"].filter(Boolean) as string[]
}
