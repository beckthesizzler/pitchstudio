/* The crest icons a creator can pick for their card. All drawn with code, in a 24 by 24 box, one colour. */

export const CREST_IDS = ["bolt", "star", "eye", "ball", "crown", "brain", "flame", "target"] as const
export type CrestId = (typeof CREST_IDS)[number]
export const CREST_LABELS: Record<CrestId, string> = { bolt: "Lightning", star: "Star", eye: "Eye", ball: "Ball", crown: "Crown", brain: "Brain", flame: "Flame", target: "Target" }

/** The inside of a crest icon, to be placed inside any svg (24 by 24 units). */
export function Glyph({ id, color }: { id: CrestId; color: string }) {
  switch (id) {
    case "bolt": return <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill={color} />
    case "star": return <path d="m12 2 3 7 7 .6-5.3 4.7L18.2 22 12 18l-6.2 4 1.5-7.7L2 9.6 9 9z" fill={color} />
    case "eye": return <g><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" /><circle cx="12" cy="12" r="3.6" fill={color} /></g>
    case "ball": return <g><circle cx="12" cy="12" r="10" fill="none" stroke={color} strokeWidth="2.4" /><path d="M12 6.5 16.6 9.8 14.8 15.2H9.2L7.4 9.8z" fill={color} /></g>
    case "crown": return <path d="M3 18 2 7l6 5 4-8 4 8 6-5-1 11z" fill={color} />
    case "brain": return <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4a3 3 0 0 0-3 0zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1V4a3 3 0 0 1 3 0z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
    case "flame": return <path d="M12 2c1 4.5 6 6.5 6 12a6 6 0 0 1-12 0c0-2.4 1-3.8 2.4-5 .2 1.8 1 2.8 2 3.2C10.2 8.6 10.6 5 12 2z" fill={color} />
    case "target": return <g><circle cx="12" cy="12" r="9.5" fill="none" stroke={color} strokeWidth="2.2" /><circle cx="12" cy="12" r="5" fill="none" stroke={color} strokeWidth="2.2" /><circle cx="12" cy="12" r="1.9" fill={color} /></g>
  }
}

/** A crest icon as its own small svg, for buttons and menus. */
export function CrestIcon({ id, size = 24, color = "currentColor" }: { id: CrestId; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}><Glyph id={id} color={color} /></svg>
}
