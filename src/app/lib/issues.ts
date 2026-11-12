import { supabase } from "./supabase"

/* Issue numbers: one series per creator, across boards, analyses and reports, kept in your account so every browser
   agrees. A piece takes its number the first time it's exported and keeps it. When the number can't be fetched, the
   export carries none rather than a wrong one. */

const KEY = "ps-edition" // the count this browser kept before numbers lived in your account
const local = () => { try { const n = parseInt(localStorage.getItem(KEY) || "0", 10); return Number.isFinite(n) && n > 0 ? n : 0 } catch { return 0 } }

/** Takes the next number from your account. Your browser's old count goes along, so nobody's numbers go backwards. */
export async function takeIssue(): Promise<number | null> {
  try {
    const { data, error } = await (supabase as any).rpc("take_issue_number", { seed: local() })
    if (error || typeof data !== "number" || data < 1) return null
    try { localStorage.setItem(KEY, String(Math.max(local(), data))) } catch { /* storage blocked */ }
    return data
  } catch { return null }
}

/** The number the next export will take, to show ahead ("next is No. 08"); null when it isn't known */
export async function peekIssue(userId: string): Promise<number | null> {
  try {
    const { data, error } = await (supabase as any).from("profiles").select("issue_count").eq("id", userId).maybeSingle()
    if (error || !data || typeof data.issue_count !== "number") return null
    return Math.max(data.issue_count, local()) + 1
  } catch { return null }
}

/** "No. 07" (the series runs past 99 as "No. 142") */
export const issueLabel = (n: number) => `No. ${String(n).padStart(2, "0")}`
/** The day a piece took its number, as the stamp shows it: 12.11.26 */
export const issueDay = (d = new Date()) => { const two = (x: number) => String(x).padStart(2, "0"); return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${two(d.getFullYear() % 100)}` }
