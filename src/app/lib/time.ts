/** "just now", "5 minutes ago", "3 days ago" */
export function relTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 2) return "just now"
  if (diffMin < 60) return `${diffMin} minutes ago`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`
  const mo = Math.floor(d / 30)
  return `${mo} month${mo > 1 ? "s" : ""} ago`
}
