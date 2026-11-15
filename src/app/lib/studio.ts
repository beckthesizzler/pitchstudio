import { supabase } from "./supabase"

/* Your studio number: given once by the database, the same one every time you ask. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Your studio number, or null if it can't be had right now. Never throws. */
export async function openStudio(): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("open_studio")
    return !error && typeof data === "number" && Number.isInteger(data) && data > 0 ? data : null
  } catch { return null }
}

/** "Nº 001": at least three digits */
export const studioLabel = (n: number) => `Nº ${String(Math.max(0, Math.trunc(n))).padStart(3, "0")}`

/** "Since Jun 2026", or "" when there's no good date */
export function sinceLabel(iso: string | null | undefined): string {
  if (typeof iso !== "string" || !iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : `Since ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
