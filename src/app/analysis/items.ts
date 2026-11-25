import { supabase } from "../lib/supabase"
import { EMPTY_NOTES, SHOT_BUCKET, newId, readCalib, readMarks, readNotes, readVideo, type Mark, type Notes, type VideoProject } from "./model"
import type { Calib } from "./calib"

/* Live Analysis data: folders are your analyses, and every shot and every video is its own item inside one.
   Items in no folder are Unsorted. Pictures live in the private analysis-shots bucket under your own folder. */

const db = supabase as any

export type Folder = { id: string; parent_id: string | null; name: string; x: number | null; y: number | null; created_at: string }
/** An item as the Library lists it (no marks: those load when you open it) */
export type ItemRow = { id: string; folder_id: string | null; kind: "shot" | "video"; title: string; cover_path: string | null; sort: number; created_at: string; updated_at: string; head: string | null }
export type Teams = { us: { name: string; color: string }; them: { name: string; color: string } }
export const DEFAULT_TEAMS: Teams = { us: { name: "Us", color: "#d7ff3c" }, them: { name: "Them", color: "#ffffff" } }
export type ShotData = { path: string | null; w: number; h: number; dim: number; items: Mark[]; notes: Notes; calib: Calib | null; teams: Teams }
export type VideoData = { video: VideoProject | null; notes: Notes; teams: Teams }

const LIST_COLS = "id, folder_id, kind, title, cover_path, sort, created_at, updated_at, head:data->notes->>head"

const HEX = /^#[0-9a-fA-F]{6}$/
function readTeams(v: any): Teams {
  const one = (o: any, d: { name: string; color: string }) => ({ name: typeof o?.name === "string" ? o.name.slice(0, 20) : d.name, color: typeof o?.color === "string" && HEX.test(o.color) ? o.color.toLowerCase() : d.color })
  return { us: one(v?.us, DEFAULT_TEAMS.us), them: one(v?.them, DEFAULT_TEAMS.them) }
}
export function readShotData(d: any, userId: string): ShotData {
  const w = Math.round(typeof d?.w === "number" && d.w > 15 && d.w < 8001 ? d.w : 1920), h = Math.round(typeof d?.h === "number" && d.h > 15 && d.h < 8001 ? d.h : 1080)
  const path = typeof d?.path === "string" && d.path.startsWith(userId + "/") && !d.path.includes("..") && d.path.length < 300 ? d.path : null
  return { path, w, h, dim: typeof d?.dim === "number" ? Math.max(0, Math.min(0.7, d.dim)) : 0, items: readMarks(d?.items, w, h), notes: readNotes(d?.notes), calib: readCalib(d?.calib, w, h), teams: readTeams(d?.teams) }
}
export function readVideoData(d: any): VideoData {
  return { video: readVideo(d?.video), notes: readNotes(d?.notes), teams: readTeams(d?.teams) }
}
export const shotPayload = (s: ShotData) => ({ v: 2, path: s.path, w: s.w, h: s.h, dim: s.dim, items: s.items, notes: s.notes, calib: s.calib, teams: s.teams })
export const videoPayload = (v: VideoData) => ({ v: 2, video: v.video, notes: v.notes, teams: v.teams })

export async function loadLibrary(userId: string): Promise<{ folders: Folder[]; items: ItemRow[] } | null> {
  const [f, i] = await Promise.all([
    db.from("library_folders").select("id, parent_id, name, x, y, created_at").eq("user_id", userId).order("created_at"),
    db.from("analysis_items").select(LIST_COLS).eq("user_id", userId).order("updated_at", { ascending: false }).range(0, 1999),
  ])
  if (f.error || i.error) return null
  return { folders: f.data ?? [], items: i.data ?? [] }
}
export async function loadItem(id: string, userId: string) {
  const { data, error } = await db.from("analysis_items").select("id, folder_id, kind, title, data, cover_path, sort, created_at, updated_at").eq("id", id).eq("user_id", userId).maybeSingle()
  if (error) throw error
  return data as (ItemRow & { data: any }) | null
}
export async function folderItems(userId: string, folderId: string | null): Promise<ItemRow[]> {
  let q = db.from("analysis_items").select(LIST_COLS).eq("user_id", userId)
  q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null)
  const { data, error } = await q.order("sort").order("created_at")
  if (error) throw error
  return data ?? []
}
export async function createItem(userId: string, folderId: string | null, kind: "shot" | "video", data: object, o: { id?: string; title?: string; sort?: number; cover?: string | null } = {}): Promise<ItemRow> {
  const id = o.id ?? newId(), title = o.title ?? "", sort = o.sort ?? Date.now() / 1000, cover = o.cover ?? null
  const { data: row, error } = await db.from("analysis_items").insert({ id, user_id: userId, folder_id: folderId, kind, title: title.slice(0, 120), data, sort, cover_path: cover }).select(LIST_COLS).single()
  if (error) throw error
  return row
}
export async function saveItem(id: string, patch: { data?: object; title?: string; cover_path?: string | null; folder_id?: string | null; sort?: number }) {
  const { error } = await db.from("analysis_items").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
}
/** Moves items to a folder (null: Unsorted) without touching when they were last changed */
export async function moveItems(ids: string[], folderId: string | null) {
  const { error } = await db.from("analysis_items").update({ folder_id: folderId }).in("id", ids)
  if (error) throw error
}
export async function reorder(ids: string[]) {
  await Promise.all(ids.map((id, i) => db.from("analysis_items").update({ sort: i }).eq("id", id)))
}
/** Deletes items and their pictures */
export async function deleteItems(rows: { id: string; data?: any; cover_path?: string | null }[], userId: string) {
  const ids = rows.map(r => r.id)
  const { data: full } = await db.from("analysis_items").select("id, cover_path, path:data->>path").in("id", ids)
  const { error } = await db.from("analysis_items").delete().in("id", ids)
  if (error) throw error
  const paths = new Set<string>()
  for (const r of full ?? []) for (const p of [r.cover_path, r.path]) if (typeof p === "string" && p.startsWith(userId + "/items/")) paths.add(p)
  if (paths.size) supabase.storage.from(SHOT_BUCKET).remove([...paths]).catch(() => {})
}
export async function duplicateItem(userId: string, id: string): Promise<ItemRow> {
  const src = await loadItem(id, userId)
  if (!src) throw new Error("gone")
  const nid = newId()
  let data = src.data, cover = src.cover_path
  if (src.kind === "shot" && typeof data?.path === "string") {
    const np = `${userId}/items/${nid}.jpg`
    const { error } = await supabase.storage.from(SHOT_BUCKET).copy(data.path, np)
    if (error) throw error
    data = { ...data, path: np }
    cover = np
  }
  const { data: row, error } = await db.from("analysis_items").insert({ id: nid, user_id: userId, folder_id: src.folder_id, kind: src.kind, title: src.title ? `${src.title} (copy)`.slice(0, 120) : "", data, cover_path: cover, sort: src.sort + 0.5 }).select(LIST_COLS).single()
  if (error) throw error
  return row
}

/* ── folders ── */
export async function createFolder(userId: string, name: string, parent: string | null, x: number | null = null, y: number | null = null): Promise<Folder> {
  const { data, error } = await db.from("library_folders").insert({ user_id: userId, name: name.trim().slice(0, 60) || "New folder", parent_id: parent, x, y }).select("id, parent_id, name, x, y, created_at").single()
  if (error) throw error
  return data
}
export async function updateFolder(id: string, patch: Partial<Pick<Folder, "name" | "x" | "y" | "parent_id">>) {
  const { error } = await db.from("library_folders").update(patch).eq("id", id)
  if (error) throw error
}
/** Deletes a folder: what was inside it (and in the folders inside it) goes to Unsorted first, never deleted */
export async function deleteFolder(id: string, all: Folder[]) {
  const ids = new Set([id])
  let grew = true
  while (grew) { grew = false; for (const f of all) if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); grew = true } }
  const { error: e1 } = await db.from("analysis_items").update({ folder_id: null }).in("folder_id", [...ids])
  if (e1) throw e1
  const { error } = await db.from("library_folders").delete().eq("id", id)
  if (error) throw error
}

/* ── pictures ── */
const urlCache = new Map<string, { url: string; until: number }>()
/** Short-lived links to private pictures, many at once */
export async function signed(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now(), out: Record<string, string> = {}, need: string[] = []
  for (const p of new Set(paths)) { const c = urlCache.get(p); if (c && c.until > now) out[p] = c.url; else need.push(p) }
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100)
    const { data } = await supabase.storage.from(SHOT_BUCKET).createSignedUrls(chunk, 3600)
    for (const d of data ?? []) if (d.signedUrl && d.path) { out[d.path] = d.signedUrl; urlCache.set(d.path, { url: d.signedUrl, until: now + 50 * 60 * 1000 }) }
  }
  return out
}
export async function uploadPic(path: string, blob: Blob) {
  const { error } = await supabase.storage.from(SHOT_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "60" })
  if (error) throw error
  urlCache.delete(path)
}
export const itemPicPath = (userId: string, id: string) => `${userId}/items/${id}.jpg`
export const itemThumbPath = (userId: string, id: string) => `${userId}/items/${id}-thumb.jpg`

export const freshShot = (w: number, h: number, path: string | null): ShotData => ({ path, w, h, dim: 0, items: [], notes: { ...EMPTY_NOTES, stats: [] }, calib: null, teams: { ...DEFAULT_TEAMS } })
