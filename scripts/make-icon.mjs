// Generates resources/icon.png (1024²): a flat charcoal tile with Cast's white "C" stroke mark.
// Pure Node (zlib) so no image tooling is required.  Run: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const N = 1024
const px = Buffer.alloc(N * N * 4)
const lerp = (a, b, t) => a + (b - a) * t
const clamp01 = (x) => Math.min(1, Math.max(0, x))

// signed distance to a rounded square centered in the canvas
const sdRoundRect = (x, y, half, r) => {
  const qx = Math.abs(x - N / 2) - half + r
  const qy = Math.abs(y - N / 2) - half + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

// The mark: one stroked "C" (open to the right, round caps) — see arcCoverage().
const MARK = { cx: N / 2 - 14, cy: N / 2, R: 214, T: 112, gap: 0.72 }
const TILE = [17, 24, 39] // #111827
const INK = [255, 255, 255]

function arcCoverage(x, y, { cx, cy, R, T, gap }, feather = 1) {
  const dx = x - cx
  const dy = y - cy
  const r = Math.hypot(dx, dy)
  const ang = Math.abs(Math.atan2(dy, dx)) // 0 on the right, π on the left
  let dist
  if (ang >= gap) dist = Math.abs(r - R)
  else {
    // inside the opening: distance to the nearer round cap
    const ex = cx + R * Math.cos(gap)
    const ey = cy + R * Math.sin(gap)
    dist = Math.min(Math.hypot(x - ex, y - ey), Math.hypot(x - ex, y + (ey - cy) - cy))
  }
  return clamp01((T / 2 - dist) / feather + 0.5)
}

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4
    const inside = clamp01(0.5 - sdRoundRect(x, y, 412, 190))
    if (inside === 0) continue
    const mark = arcCoverage(x, y, MARK)
    for (let k = 0; k < 3; k++) px[i + k] = lerp(TILE[k], INK[k], mark)
    px[i + 3] = Math.round(255 * inside)
  }
}

// --- minimal PNG encoder ---------------------------------------------------------------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const raw = Buffer.alloc((N * 4 + 1) * N)
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0
  px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4)
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])
mkdirSync('resources', { recursive: true })
writeFileSync('resources/icon.png', png)
console.log('wrote resources/icon.png', png.length, 'bytes')
