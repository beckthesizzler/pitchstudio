import { supabase } from "../lib/supabase"
import { nid } from "./notes"

/* A wall: what your notes sit on. Everyone has one main wall ("My ideas"); any note can open into a wall of its own.
   Each wall keeps its own look: cork, felt, paper, night, a colour wash, or a photo seen through a treatment so the
   notes on top always stay readable. */

export type View = "wall" | "columns" | "tree"
export type Bg = "cork" | "felt" | "paper" | "night" | "wash" | "photo"
export type Treat = "wash" | "duo" | "blur"
export type NoteStyle = "sticky" | "card" | "plain"
export type PinStyle = "pin" | "tape" | "none"
export type Look = { bg: Bg; wash: string; photo: string | null; treat: Treat; note: NoteStyle; pin: PinStyle }
export type Wall = { id: string; title: string; main: boolean; note_id: string | null; folder: string | null; pinned: boolean; look: Look; view: View; pos: number; updated_at: string }

export const WALL_COLS = "id, title, main, note_id, folder, pinned, look, view, pos, updated_at"
export const DEFAULT_LOOK: Look = { bg: "cork", wash: "#d9ecef", photo: null, treat: "wash", note: "sticky", pin: "pin" }
/** The washes you can pick: soft colours a note still reads well on */
export const WASHES = ["#d9ecef", "#f1e3d3", "#e4ead3", "#ece0f0", "#e9e4da", "#d8dde8"] as const

const BGS: Bg[] = ["cork", "felt", "paper", "night", "wash", "photo"]
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
export function readLook(raw: unknown): Look {
  const x = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const photo = typeof x.photo === "string" && /^[0-9a-f-]{36}\/[\w.-]{1,80}$/i.test(x.photo) ? x.photo : null
  const bg = pick(x.bg, BGS, "cork")
  return {
    bg: bg === "photo" && !photo ? "cork" : bg,
    wash: typeof x.wash === "string" && /^#[0-9a-f]{6}$/i.test(x.wash) ? x.wash : DEFAULT_LOOK.wash,
    photo, treat: pick(x.treat, ["wash", "duo", "blur"] as const, "wash"),
    note: pick(x.note, ["sticky", "card", "plain"] as const, "sticky"), pin: pick(x.pin, ["pin", "tape", "none"] as const, "pin"),
  }
}
export const readWall = (w: any): Wall => ({
  id: String(w.id), title: String(w.title ?? "My ideas"), main: !!w.main, note_id: w.note_id ?? null, folder: w.folder ?? null, pinned: !!w.pinned,
  look: readLook(w.look), view: pick(w.view, ["wall", "columns", "tree"] as const, "wall"), pos: Number(w.pos) || 0, updated_at: String(w.updated_at ?? ""),
})

/** Your main wall, made the first time you need it. Its name starts as the banner you gave the old wall. */
export async function mainWall(): Promise<Wall | null> {
  const db = supabase as any
  const got = await db.from("walls").select(WALL_COLS).eq("main", true).maybeSingle()
  if (got.error) throw got.error
  if (got.data) return readWall(got.data)
  let title = "My ideas"
  try { const t = localStorage.getItem("ps-wall-name")?.trim(); if (t && t !== "MY IDEAS") title = t.slice(0, 80) } catch { /* storage blocked */ }
  const made = await db.from("walls").insert({ id: nid(), title, main: true, look: DEFAULT_LOOK }).select(WALL_COLS).single()
  if (!made.error) return readWall(made.data)
  const again = await db.from("walls").select(WALL_COLS).eq("main", true).maybeSingle() // opened in two tabs at once: the other one made it
  if (again.error) throw again.error
  return again.data ? readWall(again.data) : null
}

/* ── what the wall looks like ── */
export const LOOKS: { id: Bg; label: string; swatch: string }[] = [
  { id: "cork", label: "Cork", swatch: "#CBC6BC" },
  { id: "felt", label: "Felt", swatch: "#1f3b33" },
  { id: "paper", label: "Paper", swatch: "#efe9dc" },
  { id: "night", label: "Night", swatch: "#1c1d22" },
  { id: "wash", label: "Wash", swatch: "#d9ecef" },
]
export const TREATS: { id: Treat; label: string; note: string }[] = [
  { id: "wash", label: "Wash", note: "Faded right back, so notes stand out" },
  { id: "duo", label: "Duotone", note: "Two colours, like a poster" },
  { id: "blur", label: "Blur", note: "Soft and out of focus" },
]
/** Is this look dark (light writing on the wall itself: banner shadow, frame labels, threads)? */
export const darkLook = (l: Look) => l.bg === "felt" || l.bg === "night" || (l.bg === "photo" && l.treat === "duo")

/** The wall's own surface, as CSS for the wall element. photoUrl: the signed link to the photo, once it's been asked for. */
export function wallSurface(l: Look, photoUrl: string | null): Record<string, string> {
  const dots = (c: string, s: number) => `radial-gradient(${c} 1px, transparent 1px) 0 0 / ${s}px ${s}px`
  switch (l.bg) {
    case "felt": return { background: `${dots("rgba(255,255,255,.05)", 4)}, #1f3b33`, borderColor: "#16261f" }
    case "paper": return { background: `${dots("rgba(0,0,0,.035)", 7)}, #efe9dc`, borderColor: "#cfc6b4" }
    case "night": return { background: `${dots("rgba(255,255,255,.07)", 9)}, #1c1d22`, borderColor: "#0f1013" }
    case "wash": return { background: l.wash, borderColor: "rgba(27,26,23,.25)" }
    case "photo": return { background: "#2a2c31", borderColor: "#16171a" } // the photo itself is a layer under the notes (see PhotoLayer)
    default: return { background: `${dots("rgba(0,0,0,.05)", 5)}, #CBC6BC`, borderColor: "#3A332D" }
  }
}
/** The photo under a "photo" wall, seen through its treatment */
export function photoLayer(l: Look, url: string): Record<string, string> {
  const base = { backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" }
  if (l.treat === "blur") return { ...base, filter: "blur(14px) saturate(.9) brightness(.92)", transform: "scale(1.08)" }
  if (l.treat === "duo") return { ...base, filter: "grayscale(1) contrast(1.15) brightness(.85)" }
  return { ...base, filter: "saturate(.6)", opacity: ".38" }
}

/** A link to see a wall photo (the bucket is private): good for a day, kept for the visit */
const photoLinks = new Map<string, string>()
export async function photoUrl(path: string): Promise<string | null> {
  if (photoLinks.has(path)) return photoLinks.get(path)!
  const { data, error } = await supabase.storage.from("wall-photos").createSignedUrl(path, 86400)
  if (error || !data?.signedUrl) return null
  photoLinks.set(path, data.signedUrl)
  return data.signedUrl
}
/** Puts a photo in your wall photos, shrunk to 2400px on its long side first. Returns its path. */
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP photo.")
  const img = await createImageBitmap(file)
  const k = Math.min(1, 2400 / Math.max(img.width, img.height))
  const c = document.createElement("canvas")
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
  const blob: Blob = await new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error("Couldn't read that photo."))), "image/jpeg", 0.86))
  if (blob.size > 8 * 1024 * 1024) throw new Error("That photo is too big. Try a smaller one.")
  const path = `${userId}/${nid()}.jpg`
  const { error } = await supabase.storage.from("wall-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false })
  if (error) throw error
  return path
}
