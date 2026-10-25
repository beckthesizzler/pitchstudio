import { useId } from "react"
import { PS_VOLT } from "../theme"

/* The PitchStudio mark: a solid block with a pitch's halfway line and centre circle cut out of it.
   One colour, so it can be volt, ink or white. It is one component so the mark can change in one place. */

export function Mark({ size = 28, color = "currentColor", title = "PitchStudio" }: { size?: number; color?: string; title?: string }) {
  const id = "psm" + useId().replace(/[^a-zA-Z0-9]/g, "")
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} style={{ display: "block", flexShrink: 0 }}>
      <mask id={id}>
        <rect width="100" height="100" fill="white" />
        <path d="M50 8 V92" stroke="black" strokeWidth="8" />
        <circle cx="50" cy="50" r="17" fill="none" stroke="black" strokeWidth="8" />
      </mask>
      <rect x="8" y="8" width="84" height="84" rx="22" fill={color} mask={`url(#${id})`} />
    </svg>
  )
}

/** The browser-tab icon: the mark in volt. Set when the app loads. */
export function installFavicon() {
  if (typeof document === "undefined") return
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><mask id="m"><rect width="100" height="100" fill="white"/><path d="M50 8V92" stroke="black" stroke-width="8"/><circle cx="50" cy="50" r="17" fill="none" stroke="black" stroke-width="8"/></mask><rect x="8" y="8" width="84" height="84" rx="22" fill="${PS_VOLT}" mask="url(#m)"/></svg>`
  const href = "data:image/svg+xml," + encodeURIComponent(svg)
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link) }
  link.type = "image/svg+xml"
  link.href = href
}
installFavicon()
