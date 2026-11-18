/* Crash reporting and product events, sent to PostHog (the analytics already on the site).
   Never sends an email address: anything that looks like one is replaced before it leaves the browser.
   Errors show up in PostHog under Error tracking; product events under Activity. */

type Props = Record<string, string | number | boolean | null | undefined>

const ph = () => (typeof window === "undefined" ? undefined : (window as any).posthog)

/** Hides email addresses and keeps text short. */
export function clean(s: unknown, max = 300): string {
  return String(s ?? "").replace(/[^ @<>()"',;:]+@[^ @<>()"',;:]+[.][a-z]{2,}/gi, "[email]").slice(0, max)
}

/** A product event (sign_in, password_reset_done…). Safe to call when analytics is blocked. */
export function track(event: string, props?: Props) {
  try { ph()?.capture?.(event, props) } catch { /* analytics must never break the app */ }
}

/* The scoreboard: how long from opening a tool to its first export. tool_opened when a tool opens, export_started when you
   export, carrying the seconds since that tool opened, and first_export the first time you ever export from that tool
   (kept in this browser). In PostHog: a funnel tool_opened → export_started, and the median of seconds_since_open. */
const openedAt = new Map<string, number>()
export function toolOpened(tool: string) {
  openedAt.set(tool, Date.now())
  track("tool_opened", { tool })
}
export function exportStarted(tool: string, format: string) {
  const t0 = openedAt.get(tool), seconds = t0 ? Math.round((Date.now() - t0) / 1000) : null
  track("export_started", { tool, format, seconds_since_open: seconds })
  try {
    const key = `ps-exported-${tool}`
    if (!localStorage.getItem(key)) { localStorage.setItem(key, "1"); track("first_export", { tool, format, seconds_since_open: seconds }) }
  } catch { /* private mode: no first-export marker */ }
}

const seen = new Map<string, number>()
let sent = 0
const LIMIT = 20 // per page load, so one broken loop cannot flood your analytics

/** Reports an error once per message (at most 3 repeats, 20 in all per page load). */
export function reportError(err: unknown, where: string, extra?: Props) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : clean(JSON.stringify(err)))
    const msg = clean(e.message)
    if (/ResizeObserver loop|^Script error[.]?$/i.test(msg)) return // harmless browser noise
    const n = (seen.get(msg) ?? 0) + 1
    seen.set(msg, n)
    if (n > 3 || sent >= LIMIT) return
    sent++
    const props = { where, path: window.location.pathname, ...extra }
    const p = ph()
    if (p?.captureException) {
      const safe = new Error(msg)
      safe.name = e.name
      safe.stack = clean(e.stack, 4000)
      p.captureException(safe, props)
    } else {
      p?.capture?.("app_error", { ...props, name: e.name, message: msg, stack: clean(e.stack, 1500) })
    }
  } catch { /* reporting must never break the app */ }
}

/** Auth failures by code only (never the email), so stuck sign-ups show up as numbers. */
export function trackAuthError(stage: string, err: { code?: string; status?: number; message?: string } | null) {
  if (!err) return
  track("auth_failed", { stage, code: err.code ?? "none", status: err.status ?? 0, message: clean(err.message, 120) })
}

// Errors nothing else catches: a crash in a click handler, a failed promise
if (typeof window !== "undefined" && !(window as any).__psCrashReporting) {
  ;(window as any).__psCrashReporting = true
  window.addEventListener("error", ev => {
    const file = ev.filename ?? ""
    if (/^(chrome|moz|safari)(-web)?-extension:/.test(file)) return // a browser extension, not PitchStudio
    reportError(ev.error ?? ev.message, "window", { line: ev.lineno ?? 0 })
  })
  window.addEventListener("unhandledrejection", ev => reportError(ev.reason, "promise"))
}
