/* Teaching: the first breakdown, step by step, and each tool explaining itself the first time you pick it.
   Progress is kept on this device; nothing here blocks you, and every step can be skipped. */

const KEY = "la-guide"
export type GuideStep = "drop" | "mark" | "notes" | "render" | "moment"
export const GUIDE: { id: GuideStep; title: string; sub: string }[] = [
  { id: "drop", title: "Bring in a shot or a clip", sub: "A screenshot, or a clip up to 10 min" },
  { id: "mark", title: "Mark the shape", sub: "Rings, ties, zones, cover shadows" },
  { id: "notes", title: "Write what it shows", sub: "A headline and a few lines under it. Optional: switch it off any time" },
  { id: "render", title: "Render and post", sub: "Picture or video, cropped for X, Instagram or TikTok" },
]
const read = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]")) } catch { return new Set() } }
export function guideDone(): Set<string> { return read() }
export function markGuide(step: GuideStep) {
  try { const s = read(); if (s.has(step)) return; s.add(step); localStorage.setItem(KEY, JSON.stringify([...s])) } catch { /* not kept */ }
}
export function skipGuide() { try { localStorage.setItem(KEY, JSON.stringify([...GUIDE.map(g => g.id), "skipped"])) } catch { /* not kept */ } }
/** True the first time something is seen on this device (then never again) */
export function firstUse(what: string) {
  try { const k = "la-seen-" + what; if (localStorage.getItem(k)) return false; localStorage.setItem(k, "1"); return true } catch { return false }
}
