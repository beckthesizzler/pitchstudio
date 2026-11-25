/* MP4 files made in the browser: frames encoded by the browser's own encoders (WebCodecs), put in an MP4 container here.
   One video track, and optionally one sound track (AAC, or Opus where AAC can't be made). The index is at the front,
   so the file starts playing straight away. */

export type AudioTrack = { codec: "aac" | "opus"; rate: number; channels: number; config: Uint8Array | null; frames: { data: Uint8Array; dur: number }[] }

export function mp4File(o: { w: number; h: number; fps: number; codec: string; config: Uint8Array | null; frames: { data: Uint8Array; key: boolean }[]; audio?: AudioTrack | null }): Blob {
  const u32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]
  const u16 = (v: number) => [(v >> 8) & 255, v & 255]
  const str = (t: string) => Array.from(t, c => c.charCodeAt(0))
  const zeros = (n: number) => new Array(n).fill(0)
  const box = (type: string, ...parts: ArrayLike<number>[]) => {
    const len = 8 + parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(len)
    out.set(u32(len)); out.set(str(type), 4)
    let at = 8
    for (const p of parts) { out.set(p, at); at += p.length }
    return out
  }
  const full = (type: string, version: number, flags: number, ...parts: ArrayLike<number>[]) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts)
  const avc = o.codec.startsWith("avc1"), n = o.frames.length, scale = o.fps * 1000, ms = Math.round((n * 1000) / o.fps)
  const a = o.audio && o.audio.frames.length ? o.audio : null
  const aDur = a ? a.frames.reduce((t, f) => t + f.dur, 0) : 0
  const aMs = a ? Math.round((aDur * 1000) / a.rate) : 0
  const matrix = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32)
  const ftyp = box("ftyp", str("isom"), u32(512), str("isom"), str("iso2"), str(avc ? "avc1" : "mp42"), str("mp41"))
  const mvhd = full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(Math.max(ms, aMs)), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(a ? 3 : 2))
  const dinf = box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1)))

  // ── video ──
  const tkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(ms), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(o.w * 65536), u32(o.h * 65536))
  const mdhd = full("mdhd", 0, 0, u32(0), u32(0), u32(scale), u32(n * 1000), u16(0x55c4), u16(0))
  const hdlr = full("hdlr", 0, 0, u32(0), str("vide"), zeros(12), str("PitchStudio"), [0])
  const vmhd = full("vmhd", 0, 1, zeros(8))
  const colr = box("colr", str("nclx"), u16(1), u16(1), u16(1), [0]) // BT.709, limited range
  const conf = avc ? box("avcC", o.config ?? []) : full("vpcC", 1, 0, [0, 40, 0x82, 1, 1, 1], u16(0))
  const entry = box(avc ? "avc1" : "vp09", zeros(6), u16(1), zeros(16), u16(o.w), u16(o.h), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), conf, colr)
  const keys = o.frames.flatMap((f, i) => (f.key ? [i + 1] : []))
  const vTable = [
    full("stsd", 0, 0, u32(1), entry),
    full("stts", 0, 0, u32(1), u32(n), u32(1000)),
    full("stss", 0, 0, u32(keys.length), keys.flatMap(u32)),
    full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
    full("stsz", 0, 0, u32(0), u32(n), o.frames.flatMap(f => u32(f.data.length))),
  ]
  const vSize = o.frames.reduce((t, f) => t + f.data.length, 0)

  // ── sound ──
  const desc = (tag: number, body: number[]) => [tag, 0x80, 0x80, 0x80, body.length, ...body]
  const aTrak = (offset: number) => {
    if (!a) return new Uint8Array(0)
    const m = a.frames.length
    const atkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(2), u32(0), u32(aMs), zeros(8), u16(0), u16(1), u16(0x100), u16(0), matrix, u32(0), u32(0))
    const amdhd = full("mdhd", 0, 0, u32(0), u32(0), u32(a.rate), u32(aDur), u16(0x55c4), u16(0))
    const ahdlr = full("hdlr", 0, 0, u32(0), str("soun"), zeros(12), str("PitchStudio"), [0])
    const smhd = full("smhd", 0, 0, u16(0), u16(0))
    const cfg = Array.from(a.config ?? [])
    let sample: Uint8Array
    const base = [...zeros(6), ...u16(1), ...zeros(8), ...u16(a.channels), ...u16(16), ...zeros(4), ...u32(a.rate * 65536)]
    if (a.codec === "aac") {
      const dec = desc(0x04, [0x40, 0x15, 0, 0, 0, ...u32(160000), ...u32(160000), ...desc(0x05, cfg)])
      const esds = full("esds", 0, 0, desc(0x03, [...u16(2), 0, ...dec, ...desc(0x06, [0x02])]))
      sample = box("mp4a", base, esds)
    } else {
      // Opus in MP4: the dOps box (from the OpusHead the encoder gave, or a plain one)
      const pre = cfg.length >= 19 ? cfg[10] | (cfg[11] << 8) : 312
      const dOps = box("dOps", [0, a.channels, ...u16(pre), ...u32(a.rate), ...u16(0), 0])
      sample = box("Opus", base, dOps)
    }
    // runs of the same duration
    const stts: number[][] = []
    for (const f of a.frames) { const last = stts[stts.length - 1]; if (last && last[1] === f.dur) last[0]++; else stts.push([1, f.dur]) }
    const table = [
      full("stsd", 0, 0, u32(1), sample),
      full("stts", 0, 0, u32(stts.length), stts.flatMap(([c, d]) => [...u32(c), ...u32(d)])),
      full("stsc", 0, 0, u32(1), u32(1), u32(m), u32(1)),
      full("stsz", 0, 0, u32(0), u32(m), a.frames.flatMap(f => u32(f.data.length))),
      full("stco", 0, 0, u32(1), u32(offset)),
    ]
    return box("trak", atkhd, box("mdia", amdhd, ahdlr, box("minf", smhd, dinf, box("stbl", ...table))))
  }
  const aSize = a ? a.frames.reduce((t, f) => t + f.data.length, 0) : 0

  const moov = (vOff: number) => box("moov", mvhd,
    box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", vmhd, dinf, box("stbl", ...vTable, full("stco", 0, 0, u32(1), u32(vOff)))))),
    aTrak(vOff + vSize))
  const head = moov(ftyp.length + moov(0).length + 8)
  return new Blob([ftyp, head, new Uint8Array([...u32(vSize + aSize + 8), ...str("mdat")]), ...o.frames.map(f => f.data), ...(a ? a.frames.map(f => f.data) : [])] as BlobPart[], { type: "video/mp4" })
}
