/* Match videos stay on this device: kept in the browser's private storage for this site, never uploaded.
   An analysis only remembers which video it was made from (name, size, length), so it can find it again here,
   or ask you to choose the same file on another computer. */

export const VIDEO_MAX_SECONDS = 600
export const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024

/** The name a video is kept under */
export const videoKey = (f: { name: string; size: number }) => `v-${f.size}-${f.name}`.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 140)

async function dir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage?.getDirectory?.()
    if (!root) return null
    return await root.getDirectoryHandle("videos", { create: true })
  } catch { return null }
}

/** Keeps a copy of the video on this device. False if the browser can't (the video still works until the page is closed). */
export async function keepVideo(file: File, key: string): Promise<boolean> {
  try {
    const d = await dir()
    if (!d) return false
    navigator.storage?.persist?.().catch(() => {})
    const h = await d.getFileHandle(key, { create: true })
    const existing = await h.getFile().catch(() => null)
    if (existing && existing.size === file.size) return true
    const w = await (h as any).createWritable()
    await file.stream().pipeTo(w)
    return true
  } catch { return false }
}

/** The kept video, if this device has it */
export async function findVideo(key: string, size: number): Promise<File | null> {
  try {
    const d = await dir()
    if (!d) return null
    const f = await (await d.getFileHandle(key)).getFile()
    return f.size === size ? f : null
  } catch { return null }
}

/** Removes a kept video (when nothing uses it any more) */
export async function forgetVideo(key: string) {
  try { await (await dir())?.removeEntry(key) } catch { /* already gone */ }
}

/** Reads a video's length and size, or says why it can't be used */
export function probeVideo(file: File): Promise<{ dur: number; w: number; h: number }> {
  return new Promise((ok, no) => {
    if (!file.type.startsWith("video/") && ![".mp4", ".mov", ".m4v", ".webm"].some(x => file.name.toLowerCase().endsWith(x))) { no(new Error("not a video")); return }
    if (file.size > VIDEO_MAX_BYTES) { no(new Error("too big")); return }
    const v = document.createElement("video"), url = URL.createObjectURL(file)
    const done = () => { URL.revokeObjectURL(url); v.removeAttribute("src"); v.load() }
    v.preload = "metadata"; v.muted = true
    v.onloadedmetadata = () => {
      const r = { dur: v.duration, w: v.videoWidth, h: v.videoHeight }
      done()
      if (!r.w || !r.h || !Number.isFinite(r.dur)) no(new Error("unplayable"))
      else if (r.dur > VIDEO_MAX_SECONDS + 0.5) no(new Error("too long"))
      else ok(r)
    }
    v.onerror = () => { done(); no(new Error("unplayable")) }
    v.src = url
  })
}

export function videoProblem(e: unknown, dur?: number): string {
  const m = e instanceof Error ? e.message : ""
  if (m === "not a video") return "That isn't a video. Use an MP4, MOV or WebM file."
  if (m === "too big") return "That video is over 4 GB."
  if (m === "too long") return `Videos can be up to 10 minutes${dur ? ` (this one is ${Math.round(dur / 60)})` : ""}. Trim it first.`
  return "This browser can't play that video. Save it as an H.264 MP4 and try again."
}
