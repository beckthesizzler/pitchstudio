import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"

/* Night and day. Every colour in the app comes from the variables below, so one switch changes everything.
   PS_VOLT is the brand green: it is only a colour for the pitch, exports and badges, never a theme colour. */
export const PS_VOLT = "#d7ff3c"

export const SURFACE_BASE = "var(--ps-base)"
export const SURFACE_1 = "var(--ps-s1)"
export const SURFACE_2 = "var(--ps-s2)"
export const ACCENT_GRADIENT = "var(--ps-accent)"
export const ACCENT_SOLID = "var(--ps-accent)"
export const ACCENT_INK = "var(--ps-ink)"
export const ACCENT_SOFT = "var(--ps-accent-soft)"
export const ACCENT_TEXT = "var(--ps-em)"
export const TEXT_PRIMARY = "var(--ps-tx)"
export const TEXT_MUTED = "var(--ps-mu)"
export const DS_ERROR = "var(--ps-err)"
export const DS_ERROR_SOFT = "var(--ps-err-soft)"
export const DS_BORDER = "var(--ps-bd)"
export const DS_BORDER_STRONG = "var(--ps-bd2)"
export const GLASS = "var(--ps-glass)"
export const SCRIM = "var(--ps-scrim)"

const CSS = `
:root, :root[data-theme="night"] {
  color-scheme: dark;
  --ps-base: #242529; --ps-s1: #2C2D32; --ps-s2: #35363C;
  --ps-tx: #F5F5F7; --ps-mu: #A3A3AD;
  --ps-bd: rgba(255,255,255,0.08); --ps-bd2: rgba(255,255,255,0.14);
  --ps-accent: #d7ff3c; --ps-ink: #0a0c0f; --ps-em: #d7ff3c; --ps-accent-soft: rgba(215,255,60,0.15);
  --ps-err: #f85149; --ps-err-soft: rgba(248,81,73,0.13);
  --ps-hover: rgba(255,255,255,0.10); --ps-glass: rgba(44,45,50,0.94); --ps-scrim: rgba(0,0,0,0.75);
  --ps-glow: rgba(215,255,60,0.13);
}
:root[data-theme="day"] {
  color-scheme: light;
  --ps-base: #F3F1EC; --ps-s1: #FFFFFF; --ps-s2: #ECE9E2;
  --ps-tx: #121316; --ps-mu: #5F6068;
  --ps-bd: rgba(0,0,0,0.10); --ps-bd2: rgba(0,0,0,0.18);
  --ps-accent: #121316; --ps-ink: #FFFFFF; --ps-em: #4d7c0f; --ps-accent-soft: rgba(18,19,22,0.07);
  --ps-err: #c62828; --ps-err-soft: rgba(198,40,40,0.10);
  --ps-hover: rgba(0,0,0,0.06); --ps-glass: rgba(255,255,255,0.95); --ps-scrim: rgba(20,20,24,0.45);
  --ps-glow: rgba(77,124,15,0.10);
}
body { background: var(--ps-base); }
`

export type ThemeChoice = "auto" | "night" | "day"
const KEY = "ps_theme"
const read = (): ThemeChoice => { try { const v = localStorage.getItem(KEY); return v === "night" || v === "day" ? v : "auto" } catch { return "auto" } }
const systemTheme = (): "night" | "day" => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "day" : "night")
export const resolveTheme = (c: ThemeChoice): "night" | "day" => (c === "auto" ? systemTheme() : c)

let choice: ThemeChoice = "auto"
const listeners = new Set<() => void>()
function apply() {
  if (typeof document === "undefined") return
  document.documentElement.setAttribute("data-theme", resolveTheme(choice))
  listeners.forEach(l => l())
}
if (typeof document !== "undefined") {
  if (!document.getElementById("ps-theme")) { const s = document.createElement("style"); s.id = "ps-theme"; s.textContent = CSS; document.head.appendChild(s) }
  choice = read()
  apply()
  try { window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => { if (choice === "auto") apply() }) } catch { /* old browsers */ }
}

export function setThemeChoice(c: ThemeChoice) {
  choice = c
  try { if (c === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, c) } catch { /* private mode: still works this visit */ }
  apply()
}

/** The theme in use ("night" or "day"), the saved choice, and a setter. */
export function useTheme() {
  const [, force] = useState(0)
  useEffect(() => { const l = () => force(n => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return { theme: resolveTheme(choice), choice, setChoice: setThemeChoice, toggle: () => setThemeChoice(resolveTheme(choice) === "night" ? "day" : "night") }
}

/** The sun / moon button. */
export function ThemeToggle({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} aria-label={theme === "night" ? "Switch to day mode" : "Switch to night mode"} title={theme === "night" ? "Day mode" : "Night mode"}
      className="rounded-lg transition-colors hover:bg-[var(--ps-hover)]"
      style={{ width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: TEXT_MUTED, ...style }}>
      {theme === "night" ? <Sun size={size} /> : <Moon size={size} />}
    </button>
  )
}
