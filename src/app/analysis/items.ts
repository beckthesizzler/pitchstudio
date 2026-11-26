import { supabase } from "../lib/supabase"
import { EMPTY_NOTES, SHOT_BUCKET, newId, readCalib, readMarks, readNotes, readVideo, type Mark, type Notes, type VideoProject } from "./model"
import { apply as project, fitCalib, type Calib } from "./calib"

/* Live Analysis data: folders are your analyses, and every shot and every video is its own item inside one.
   Items in no folder are Unsorted. Pictures live in the private analysis-shots bucket under your own folder. */

const db = supabase as any

/** A folder's match: set once, every Game Shot and Game Film in the folder takes the teams, colours and the line above the headline */
export type Match = { home: string; away: string; homeColor: string; awayColor: string; comp: string; date: string; score: string }
export const EMPTY_MATCH: Match = { home: "", away: "", homeColor: "#d7ff3c", awayColor: "#ffffff", comp: "", date: "", score: "" }
export type Folder = { id: string; parent_id: string | null; name: string; x: number | null; y: number | null; sort: number | null; created_at: string; match: Match | null; is_public: boolean; deleted_at: string | null }
export function readMatch(v: any): Match | null {
  if (!v || typeof v !== "object") return null
  const t = (k: string, n: number) => (typeof v[k] === "string" ? v[k].slice(0, n) : "")
  const c = (k: string, d: string) => (typeof v[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(v[k]) ? v[k].toLowerCase() : d)
  const m = { home: t("home", 30), away: t("away", 30), homeColor: c("homeColor", "#d7ff3c"), awayColor: c("awayColor", "#ffffff"), comp: t("comp", 40), date: t("date", 30), score: t("score", 12) }
  return m.home || m.away || m.comp || m.date || m.score ? m : null
}
/** "Barça v Madrid · LaLiga · 26 Oct · 2-1" */
export function matchLine(m: Match | null) {
  if (!m) return ""
  const teams = m.home && m.away ? `${m.home} v ${m.away}` : m.home || m.away
  return [teams, m.comp, m.date, m.score].filter(Boolean).join(" · ")
}
const FOLDER_COLS = "id, parent_id, name, x, y, sort, created_at, match, is_public, deleted_at"
const tidyFolder = (f: any): Folder => ({ ...f, sort: f.sort ?? null, deleted_at: f.deleted_at ?? null, match: readMatch(f.match), is_public: !!f.is_public })
/** An item as the Library lists it (no marks: those load when you open it) */
export type ItemRow = { id: string; folder_id: string | null; kind: "shot" | "video"; title: string; cover_path: string | null; sort: number; created_at: string; updated_at: string; head: string | null; deleted_at?: string | null }
export type Teams = { us: { name: string; color: string }; them: { name: string; color: string } }
export const DEFAULT_TEAMS: Teams = { us: { name: "Us", color: "#d7ff3c" }, them: { name: "Them", color: "#ffffff" } }
export type ShotData = { path: string | null; w: number; h: number; dim: number; items: Mark[]; notes: Notes; calib: Calib | null; teams: Teams }
export type VideoData = { video: VideoProject | null; notes: Notes; teams: Teams }

const LIST_COLS = "id, folder_id, kind, title, cover_path, sort, created_at, updated_at, deleted_at, head:data->notes->>head"

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
/** Every mark's points on the pitch, in metres from the left goal line (x, 0 to 105) and the far touchline (y, 0 to 68).
    Only when the picture is pinned to the pitch. Saved alongside the marks so each breakdown is also data. */
export function geoOf(items: Mark[], calib: Calib | null): Record<string, number[][]> | undefined {
  const fit = calib ? fitCalib(calib) : null
  if (!fit) return undefined
  const out: Record<string, number[][]> = {}
  const r = (p: number[]) => { const q = project(fit.Hi, p as [number, number]); return [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10] }
  for (const m of items as any[]) {
    const pts: number[][] = []
    if (typeof m.x === "number" && typeof m.y === "number") pts.push([m.x, m.y])
    if (typeof m.bx === "number") pts.push([m.bx, m.by])
    for (const k of ["a", "c", "b"]) if (Array.isArray(m[k])) pts.push(m[k])
    if (Array.isArray(m.pts)) pts.push(...m.pts)
    const g = pts.map(r).filter(q => q.every(Number.isFinite) && q[0] > -30 && q[0] < 135 && q[1] > -30 && q[1] < 98)
    if (g.length) out[m.id] = g
  }
  return out
}
export const shotPayload = (s: ShotData) => ({ v: 2, path: s.path, w: s.w, h: s.h, dim: s.dim, items: s.items, notes: s.notes, calib: s.calib, teams: s.teams, geo: geoOf(s.items, s.calib) })
export const videoPayload = (v: VideoData) => ({ v: 2, video: v.video ? { ...v.video, moments: v.video.moments.map(m => ({ ...m, geo: geoOf(m.items, m.calib ?? null) })) } : null, notes: v.notes, teams: v.teams })

export const BIN_DAYS = 30
export type Library = { folders: Folder[]; items: ItemRow[]; bin: { folders: Folder[]; items: ItemRow[] } }
/** Everything of one user. What sat in the Bin longer than BIN_DAYS is deleted for good on the way. */
export async function loadLibrary(userId: string): Promise<Library | null> {
  const [f, i] = await Promise.all([
    db.from("library_folders").select(FOLDER_COLS).eq("user_id", userId).order("created_at"),
    db.from("analysis_items").select(LIST_COLS).eq("user_id", userId).order("updated_at", { ascending: false }).range(0, 2999),
  ])
  if (f.error || i.error) return null
  let folders: Folder[] = (f.data ?? []).map(tidyFolder), items: ItemRow[] = i.data ?? []
  const old = (d?: string | null) => !!d && Date.now() - Date.parse(d) > BIN_DAYS * 864e5
  const oldF = folders.filter(x => old(x.deleted_at)), oldI = items.filter(x => old(x.deleted_at) || (x.folder_id && oldF.some(o => o.id === x.folder_id)))
  if (oldF.length || oldI.length) {
    try { await eraseForGood(userId, oldF.map(x => x.id), oldI) } catch { /* try again next time */ }
    folders = folders.filter(x => !oldF.includes(x)); items = items.filter(x => !oldI.includes(x))
  }
  return { folders: folders.filter(x => !x.deleted_at), items: items.filter(x => !x.deleted_at), bin: { folders: folders.filter(x => x.deleted_at), items: items.filter(x => x.deleted_at) } }
}
/** Days until something in the Bin is deleted for good */
export const daysLeft = (deletedAt: string) => Math.max(0, Math.ceil(BIN_DAYS - (Date.now() - Date.parse(deletedAt)) / 864e5))
const withKids = (ids: string[], all: Folder[]) => {
  const out = new Set(ids)
  let grew = true
  while (grew) { grew = false; for (const f of all) if (f.parent_id && out.has(f.parent_id) && !out.has(f.id)) { out.add(f.id); grew = true } }
  return [...out]
}
/** To the Bin: these items, and these folders with every folder and item inside them. One time stamp, so they come back together. */
export async function toBin(itemIds: string[], folderIds: string[], all: Folder[]) {
  const at = new Date().toISOString(), fids = withKids(folderIds, all)
  if (fids.length) {
    const { error: e1 } = await db.from("analysis_items").update({ deleted_at: at }).in("folder_id", fids).is("deleted_at", null)
    if (e1) throw e1
    const { error: e2 } = await db.from("library_folders").update({ deleted_at: at, is_public: false }).in("id", fids)
    if (e2) throw e2
  }
  if (itemIds.length) {
    const { error } = await db.from("analysis_items").update({ deleted_at: at }).in("id", itemIds)
    if (error) throw error
  }
}
/** Back from the Bin. A folder brings back what was binned with it. Anything whose folder is gone lands in Unsorted, top level. */
export async function fromBin(itemIds: string[], folderIds: string[], all: Folder[], binItems: ItemRow[]) {
  const live = new Set(all.filter(f => !f.deleted_at).map(f => f.id))
  for (const id of folderIds) {
    const f = all.find(x => x.id === id)
    if (!f?.deleted_at) continue
    const fids = withKids([id], all).filter(k => all.find(x => x.id === k)?.deleted_at === f.deleted_at)
    const { error: e1 } = await db.from("library_folders").update({ deleted_at: null }).in("id", fids)
    if (e1) throw e1
    if (f.parent_id && !live.has(f.parent_id)) await db.from("library_folders").update({ parent_id: null }).eq("id", id)
    const { error: e2 } = await db.from("analysis_items").update({ deleted_at: null }).in("folder_id", fids).eq("deleted_at", f.deleted_at)
    if (e2) throw e2
    fids.forEach(k => live.add(k))
  }
  for (const id of itemIds) {
    const it = binItems.find(x => x.id === id)
    const { error } = await db.from("analysis_items").update({ deleted_at: null, ...(it?.folder_id && !live.has(it.folder_id) ? { folder_id: null } : {}) }).eq("id", id)
    if (error) throw error
  }
}
/** Deleted for good: the items (and their pictures) and the folders with everything inside them */
export async function eraseForGood(userId: string, folderIds: string[], items: { id: string }[], all: Folder[] = []) {
  const fids = withKids(folderIds, all)
  let rows = [...items]
  if (fids.length) {
    const { data } = await db.from("analysis_items").select("id").in("folder_id", fids)
    rows = [...rows, ...(data ?? [])]
  }
  if (rows.length) await deleteItems([...new Map(rows.map(r => [r.id, r])).values()], userId)
  if (fids.length) {
    const { error } = await db.from("library_folders").delete().in("id", fids)
    if (error) throw error
  }
}
export async function loadItem(id: string, userId: string) {
  const { data, error } = await db.from("analysis_items").select("id, folder_id, kind, title, data, cover_path, sort, created_at, updated_at").eq("id", id).eq("user_id", userId).maybeSingle()
  if (error) throw error
  return data as (ItemRow & { data: any }) | null
}
export async function folderItems(userId: string, folderId: string | null): Promise<ItemRow[]> {
  let q = db.from("analysis_items").select(LIST_COLS).eq("user_id", userId).is("deleted_at", null)
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
  const { data, error } = await db.from("library_folders").insert({ user_id: userId, name: name.trim().slice(0, 60) || "New folder", parent_id: parent, x, y }).select(FOLDER_COLS).single()
  if (error) throw error
  return tidyFolder(data)
}
export async function updateFolder(id: string, patch: Partial<Pick<Folder, "name" | "x" | "y" | "sort" | "parent_id" | "match" | "is_public">> & { share?: object | null }) {
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

export const freshShot = (w: number, h: number, path: string | null): ShotData => ({ path, w, h, dim: 0, items: [], notes: { ...EMPTY_NOTES }, calib: null, teams: { ...DEFAULT_TEAMS } })

/** A new item's data with the folder's match on it: teams, colours, and the line above the headline */
export function withMatch<T extends object>(d: T, m: Match | null): T {
  if (!m) return d
  return { ...d, teams: { us: { name: (m.home || "Us").slice(0, 20), color: m.homeColor }, them: { name: (m.away || "Them").slice(0, 20), color: m.awayColor } }, notes: { kicker: matchLine(m), head: "", body: "", show: true } }
}
export async function loadFolders(userId: string): Promise<Folder[]> {
  const { data, error } = await db.from("library_folders").select(FOLDER_COLS).eq("user_id", userId).is("deleted_at", null).order("created_at")
  if (error) throw error
  return (data ?? []).map(tidyFolder)
}
/** Puts a folder's match on items: the teams and colours always, the line above the headline where it is empty
    (or still the folder's old line). Only items in that folder. Gives back how many changed. */
export async function applyMatch(userId: string, folderId: string, m: Match | null, ids: string[], before: Match | null = null): Promise<number> {
  if (!m || !ids.length) return 0
  const line = matchLine(m), old = matchLine(before)
  const teams = { us: { name: (m.home || "Us").slice(0, 20), color: m.homeColor }, them: { name: (m.away || "Them").slice(0, 20), color: m.awayColor } }
  const { data, error } = await db.from("analysis_items").select("id, kind, data").eq("user_id", userId).eq("folder_id", folderId).in("id", ids)
  if (error) throw error
  let n = 0
  for (const r of data ?? []) {
    const d = r.data && typeof r.data === "object" ? r.data : {}
    const notes = readNotes(d.notes)
    const kicker = !notes.kicker.trim() || (old && notes.kicker === old) ? line : notes.kicker
    const next = { ...d, teams, notes: { ...notes, kicker } }
    const { error: e } = await db.from("analysis_items").update({ data: next }).eq("id", r.id)
    if (!e) n++
  }
  return n
}
