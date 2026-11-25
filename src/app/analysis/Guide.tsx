/* Teaching: the first breakdown, step by step, and each tool explaining itself the first time you pick it.
   Progress is kept on this device; nothing here blocks you, and every step can be skipped. */

const KEY = "la-guide"
export type GuideStep = "drop" | "calib" | "mark" | "notes" | "render" | "moment"
export const GUIDE: { id: GuideStep; title: string; sub: string }[] = [
  { id: "drop", title: "Drop a frame or a clip", sub: "Screenshot, MP4, MOV, up to 10 min" },
  { id: "calib", title: "Calibrate", sub: "Click 4 pitch points you can see" },
  { id: "mark", title: "Mark it", sub: "Rings, ties, zones, measure in metres" },
  { id: "notes", title: "Tell the story", sub: "Headline and notes under the shot" },
  { id: "render", title: "Render", sub: "Picture or video, ready to post" },
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
