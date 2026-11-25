import { supabase } from "../lib/supabase"
import { canvasBlob, renderSaved, type Seal } from "./batch"
import { createFolder, createItem, itemPicPath, matchLine, readShotData, updateFolder, uploadPic, type Folder, type ItemRow } from "./items"
import { newId } from "./model"

/* A folder's share link ("/a/:id"). Sharing renders each Game Shot (the picture people see) and keeps a copy of the
   untouched still with its marks, so Remix can rebuild it in someone else's Library. Everything sits in the public
   analysis-shares bucket under the folder's id; stopping sharing deletes it. Game Films stay private for now. */

const BUCKET = "analysis-shares"
export type SharedItem = { n: number; img: string; raw: string; w: number; h: number; kicker: string; head: string; body: string; data: object }
export type SharePack = { at: string; items: SharedItem[] }

export const shareUrl = (folderId: string) => `${location.origin}/a/${folderId}`
export const sharedPic = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

async function jpeg(blob: Blob, maxW = 2560): Promise<Blob> {
  const bmp = await createImageBitmap(blob)
  const s = Math.min(1, maxW / bmp.width), cv = document.createElement("canvas")
  cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s)
  cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height)
  bmp.close?.()
  return canvasBlob(cv, "image/jpeg", 0.88)
}
async function put(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "300" })
  if (error) throw error
}
async function clear(folderId: string) {
  const { data } = await supabase.storage.from(BUCKET).list(folderId, { limit: 1000 })
  const paths = (data ?? []).map(f => `${folderId}/${f.name}`)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

/** Shares (or refreshes) a folder. progress(done, total) as each Game Shot goes up */
export async function shareFolder(userId: string, folder: Folder, items: ItemRow[], seal: Seal, progress: (d: number, t: number) => void): Promise<number> {
  const shots = items.filter(i => i.kind === "shot")
  if (!shots.length) throw new Error("no shots")
  await clear(folder.id)
  const stamp = Date.now().toString(36), out: SharedItem[] = [], line = matchLine(folder.match)
  for (let k = 0; k < shots.length; k++) {
    progress(k, shots.length)
    const { canvas, data } = await renderSaved(userId, shots[k].id, seal, { format: "orig", notes: false }, 1920, line)
    const img = `${folder.id}/${stamp}-${k + 1}.jpg`, raw = `${folder.id}/${stamp}-${k + 1}-raw.jpg`
    await put(img, await canvasBlob(canvas, "image/jpeg", 0.9))
    const src = await supabase.storage.from("analysis-shots").download(data.path!)
    if (src.error || !src.data) throw src.error ?? new Error("still")
    await put(raw, await jpeg(src.data))
    const n = data.notes, on = n.show !== false
    out.push({ n: k + 1, img, raw, w: data.w, h: data.h, kicker: on ? n.kicker || line : line, head: on ? n.head : "", body: on ? n.body : "", data: { v: 2, w: data.w, h: data.h, dim: data.dim, items: data.items, notes: on ? n : { kicker: "", head: "", body: "", show: false }, calib: data.calib, teams: data.teams } })
  }
  progress(shots.length, shots.length)
  await updateFolder(folder.id, { share: { at: new Date().toISOString(), items: out }, is_public: true })
  return out.length
}

export async function stopSharing(folder: Folder) {
  await updateFolder(folder.id, { share: null, is_public: false })
  await clear(folder.id).catch(() => {})
}

/** Remix: a new folder in your Library with every shared Game Shot in it, marks and all */
export async function remix(userId: string, name: string, match: any, pack: SharePack): Promise<string> {
  const f = await createFolder(userId, `Remix · ${name}`.slice(0, 60), null)
  if (match) await updateFolder(f.id, { match }).catch(() => {})
  for (const it of pack.items) {
    const blob = await (await fetch(sharedPic(it.raw))).blob()
    const id = newId(), path = itemPicPath(userId, id)
    await uploadPic(path, blob)
    const d = readShotData({ ...it.data, path }, userId)
    await createItem(userId, f.id, "shot", { v: 2, path, w: d.w, h: d.h, dim: d.dim, items: d.items, notes: d.notes, calib: d.calib, teams: d.teams }, { id, sort: it.n, cover: path, title: d.notes.head.slice(0, 120) })
  }
  return f.id
}
