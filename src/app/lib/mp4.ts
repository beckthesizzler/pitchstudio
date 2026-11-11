/* MP4 files made in the browser: frames encoded by the browser's own video encoder (WebCodecs), put in an MP4 container here. */

/** An MP4 file around encoded video frames (one track, frames in order, the index at the front so it starts playing straight away) */
export function mp4File(o: { w: number; h: number; fps: number; codec: string; config: Uint8Array | null; frames: { data: Uint8Array; key: boolean }[] }): Blob {
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
  const matrix = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].flatMap(u32)
  const ftyp = box("ftyp", str("isom"), u32(512), str("isom"), str("iso2"), str(avc ? "avc1" : "mp42"), str("mp41"))
  const mvhd = full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(ms), u32(0x10000), u16(0x100), zeros(10), matrix, zeros(24), u32(2))
  const tkhd = full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(ms), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(o.w * 65536), u32(o.h * 65536))
  const mdhd = full("mdhd", 0, 0, u32(0), u32(0), u32(scale), u32(n * 1000), u16(0x55c4), u16(0))
  const hdlr = full("hdlr", 0, 0, u32(0), str("vide"), zeros(12), str("PitchStudio"), [0])
  const vmhd = full("vmhd", 0, 1, zeros(8))
  const dinf = box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1)))
  const colr = box("colr", str("nclx"), u16(1), u16(1), u16(1), [0]) // BT.709, limited range
  const conf = avc ? box("avcC", o.config ?? []) : full("vpcC", 1, 0, [0, 40, 0x82, 1, 1, 1], u16(0))
  const entry = box(avc ? "avc1" : "vp09", zeros(6), u16(1), zeros(16), u16(o.w), u16(o.h), u32(0x480000), u32(0x480000), u32(0), u16(1), zeros(32), u16(0x18), u16(0xffff), conf, colr)
  const keys = o.frames.flatMap((f, i) => (f.key ? [i + 1] : []))
  const table = [
    full("stsd", 0, 0, u32(1), entry),
    full("stts", 0, 0, u32(1), u32(n), u32(1000)),
    full("stss", 0, 0, u32(keys.length), keys.flatMap(u32)),
    full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
    full("stsz", 0, 0, u32(0), u32(n), o.frames.flatMap(f => u32(f.data.length))),
  ]
  const moov = (offset: number) => box("moov", mvhd, box("trak", tkhd, box("mdia", mdhd, hdlr, box("minf", vmhd, dinf, box("stbl", ...table, full("stco", 0, 0, u32(1), u32(offset)))))))
  const head = moov(ftyp.length + moov(0).length + 8)
  const size = o.frames.reduce((a, f) => a + f.data.length, 0)
  return new Blob([ftyp, head, new Uint8Array([...u32(size + 8), ...str("mdat")]), ...o.frames.map(f => f.data)] as BlobPart[], { type: "video/mp4" })
}
