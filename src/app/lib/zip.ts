/* A plain zip (stored, not compressed: the files going in are JPEGs and text, already as small as they get).
   Enough for "download the whole thread" without another library. */

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(b: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export async function zipFiles(files: { name: string; data: Blob | string }[]): Promise<Blob> {
  const enc = new TextEncoder(), parts: BlobPart[] = [], central: BlobPart[] = []
  let offset = 0
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  for (const f of files) {
    const body = typeof f.data === "string" ? enc.encode(f.data) : new Uint8Array(await f.data.arrayBuffer())
    const name = enc.encode(f.name), crc = crc32(body)
    const head = new DataView(new ArrayBuffer(30))
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true)
    head.setUint16(10, time, true); head.setUint16(12, date, true); head.setUint32(14, crc, true)
    head.setUint32(18, body.length, true); head.setUint32(22, body.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true)
    parts.push(head.buffer, name as BlobPart, body as BlobPart)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, time, true); c.setUint16(14, date, true); c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, body.length, true)
    c.setUint16(28, name.length, true); c.setUint32(42, offset, true)
    central.push(c.buffer, name as BlobPart)
    offset += 30 + name.length + body.length
  }
  const size = central.reduce<number>((n, b) => n + (b as ArrayBuffer | Uint8Array).byteLength, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true)
  end.setUint32(12, size, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" })
}
