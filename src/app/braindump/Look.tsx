import { useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { LOOKS, TREATS, WASHES, photoLayer, type Look } from "./walls"
import { HAND } from "./sketch"

/* "Look": how this wall looks. A surface (cork, felt, paper, night, a colour wash or your own photo, always seen
   through a treatment so notes stay readable), the banner, how notes are drawn and how they're held up. */
export function LookPanel({ look, title, photo, onLook, onTitle, onPhoto, onClose }: {
  look: Look; title: string; photo: string | null
  onLook: (l: Look) => void; onTitle: (t: string) => void
  onPhoto: (f: File) => Promise<void>; onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const file = useRef<HTMLInputElement>(null)
  const set = (patch: Partial<Look>) => onLook({ ...look, ...patch })
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return
    setBusy(true); setErr("")
    try { await onPhoto(f) } catch (e: any) { setErr(e?.message && /photo|JPG|big/i.test(e.message) ? e.message : "Couldn't add that photo. Try another.") }
    finally { setBusy(false); if (file.current) file.current.value = "" }
  }
  return (
    <aside className="bd-panel lk" aria-label="Look of this wall">
      <div className="bd-ph"><div style={{ flex: 1 }}><p className="bd-k" style={{ marginTop: 2 }}>Look of this wall</p></div>
        <button className="bd-icon" aria-label="Close Look" title="Close (Esc)" onClick={onClose}><X size={16} /></button></div>
      <div className="lk-grid" role="radiogroup" aria-label="Surface">
        {LOOKS.map(l => (
          <button key={l.id} role="radio" aria-checked={look.bg === l.id} className="lk-sw" onClick={() => set({ bg: l.id })}>
            <i style={{ background: l.id === "wash" ? look.wash : l.swatch }} /><small>{l.label}</small>
          </button>
        ))}
        <button role="radio" aria-checked={look.bg === "photo"} className="lk-sw" disabled={busy} onClick={() => (look.photo ? set({ bg: "photo" }) : file.current?.click())}>
          <i className="ph" style={look.photo && photo ? photoLayer({ ...look, treat: "wash" }, photo) : undefined}>{busy ? <Loader2 size={15} className="bd-spin" /> : !look.photo && <ImagePlus size={15} />}</i><small>Photo</small>
        </button>
      </div>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => pickPhoto(e.target.files?.[0])} />
      {err && <p className="lk-err" role="alert">{err}</p>}
      {look.bg === "wash" && <>
        <p className="bd-k">Wash colour</p>
        <div className="bd-sw" style={{ padding: 0 }}>{WASHES.map(c => <button key={c} className="bd-swatch" aria-label={`Wash ${c}`} aria-pressed={look.wash === c} style={{ background: c, width: 28, height: 28 }} onClick={() => set({ wash: c })} />)}</div>
      </>}
      {look.bg === "photo" && <>
        <p className="bd-k">Photo, seen through</p>
        <div className="lk-treats">
          {TREATS.map(t => <button key={t.id} aria-pressed={look.treat === t.id} onClick={() => set({ treat: t.id })}><b>{t.label}</b><small>{t.note}</small></button>)}
        </div>
        <button className="bd-link" onClick={() => file.current?.click()} disabled={busy}>Use a different photo</button>
        <p className="bd-note">A photo always sits behind a treatment, so your notes never get lost in it.</p>
      </>}
      <p className="bd-k">Banner</p>
      <input className="lk-title" value={title} maxLength={40} aria-label="Banner" onChange={e => onTitle(e.target.value)} placeholder="MY IDEAS" />
      <p className="bd-k">Notes</p>
      <div className="bd-seg" role="group" aria-label="Note style">
        {(["sticky", "card", "plain"] as const).map(s => <button key={s} aria-pressed={look.note === s} onClick={() => set({ note: s })}>{s[0].toUpperCase() + s.slice(1)}</button>)}
      </div>
      <p className="bd-k">Held up with</p>
      <div className="bd-seg" role="group" aria-label="Pins">
        {(["pin", "tape", "none"] as const).map(s => <button key={s} aria-pressed={look.pin === s} onClick={() => set({ pin: s })}>{s === "none" ? "Nothing" : s[0].toUpperCase() + s.slice(1)}</button>)}
      </div>
      <p className="bd-note" style={{ marginTop: "auto", paddingTop: 18 }}>Each wall keeps its own look.</p>
    </aside>
  )
}

export const LOOK_CSS = `
  .lk-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 8px; margin-top: 4px; }
  .lk-sw { border: none; background: none; padding: 0; cursor: pointer; color: inherit; display: flex; flex-direction: column; align-items: stretch; gap: 5px; }
  .lk-sw i { height: 46px; border-radius: 9px; border: 1px solid rgba(255,255,255,.14); display: grid; place-items: center; color: #b9bbc2; overflow: hidden; }
  .lk-sw i.ph { border-style: dashed; }
  .lk-sw[aria-checked="true"] i { box-shadow: 0 0 0 2px #D7FF3C; }
  .lk-sw small { font: 500 12px 'Inter', sans-serif; text-align: center; color: #b9bbc2; }
  .lk-sw[aria-checked="true"] small { color: #fff; }
  .lk-sw:focus-visible { outline: 2px solid #fff; outline-offset: 3px; border-radius: 9px; }
  .lk-treats { display: grid; gap: 6px; }
  .lk-treats button { text-align: left; border: 1px solid rgba(255,255,255,.12); border-radius: 10px; padding: 9px 11px; background: none; color: inherit; cursor: pointer; }
  .lk-treats button[aria-pressed="true"] { border-color: #D7FF3C; background: rgba(215,255,60,.06); }
  .lk-treats b { display: block; font: 600 13.5px 'Inter', sans-serif; } .lk-treats small { display: block; font: 500 12px 'Inter', sans-serif; color: #9a9ca4; margin-top: 2px; }
  .lk-title { width: 100%; height: 42px; border-radius: 4px; border: none; outline: none; padding: 0 12px; background: #F4EEDC; color: #1b1a17; font: 700 17px ${HAND}; letter-spacing: .2em; text-transform: uppercase; }
  .lk-title:focus { box-shadow: 0 0 0 3px #D7FF3C; }
  .lk-err { margin: 8px 0 0; font-size: 13px; color: #ff8a80; }
  @media (max-width: 700px) { .bd .bd-panel.lk { display: flex; position: fixed; left: 0; right: 0; bottom: 0; width: auto; max-height: 72vh; z-index: 45; border-left: none; border-top: 1px solid rgba(255,255,255,.12); border-radius: 18px 18px 0 0; box-shadow: 0 -20px 40px -10px rgba(0,0,0,.6); } }
`
