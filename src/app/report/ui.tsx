import type { ReactNode } from "react"

/* Small controls the panel pieces share */

export function Seg<T extends string | number | boolean>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return <div className="rp-seg" role="group" aria-label={label}>{options.map(([v, t]) => <button key={String(v)} className={value === v ? "on" : ""} aria-pressed={value === v} onClick={() => set(v)}>{t}</button>)}</div>
}
export const Row = ({ label, children }: { label: string; children: ReactNode }) => <div className="rp-row"><span className="rp-lab">{label}</span>{children}</div>
export function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return <button className={`rp-toggle${on ? " on" : ""}`} role="switch" aria-checked={on} onClick={() => set(!on)}><span>{label}</span><i /></button>
}
