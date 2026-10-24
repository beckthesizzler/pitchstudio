/** Same rule as the database: lowercase letters, numbers and underscores, max 30. */
export const normalizeHandle = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30)

export const IDENTITY_OPTIONS = [
  { label: "Content creator", value: "creator", hint: "I post football breakdowns" },
  { label: "Coach", value: "coach", hint: "I train players" },
  { label: "Analyst", value: "analyst", hint: "I study the game" },
  { label: "Just here to play", value: "fan", hint: "For fun" },
] as const

/** Names the system made from the email look like email-name, underscore, first 4 of the user id (beckhamng07_826b): shown without the suffix. Names people chose (tiki_taka, messi_8f2a) are always shown in full. */
export function stripHandleSuffix(name: string, userId?: string | null, email?: string | null): string {
  if (!userId || !email) return name
  const short = userId.slice(0, 4)
  const emailName = email.split("@")[0]
  const auto = [`${emailName}_${short}`, `${normalizeHandle(emailName).slice(0, 25)}_${short}`]
  return auto.includes(name) ? name.slice(0, -(short.length + 1)) : name
}

/** Turns Supabase auth errors into plain words. */
export function friendlyAuthError(err: { message?: string; code?: string } | null): string {
  const code = err?.code ?? ""
  const msg = (err?.message ?? "").toLowerCase()
  if (code === "invalid_credentials" || msg.includes("invalid login")) return "That email or password isn't right. Try again."
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "Confirm your email first. The link is in your inbox."
  if (code === "email_address_invalid" || msg.includes("invalid format")) return "Enter a valid email address."
  if (code.includes("rate_limit") || msg.includes("rate limit")) return "Too many attempts. Wait a minute and try again."
  if (msg.includes("not authorized") || msg.includes("sending confirmation")) return "We couldn't send your confirmation email. Try again later."
  if (msg.includes("failed to fetch") || msg.includes("network")) return "Can't reach PitchStudio. Check your connection and try again."
  return err?.message || "Something went wrong. Try again."
}
