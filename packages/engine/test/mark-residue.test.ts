import { expect, test } from 'vitest'
import sharp from 'sharp'
import { measureMarkResidue, residuePass } from '../src/mark-residue'

test('a faint original outline cannot pass just because a vision judge misses it', async () => {
  const width = 160, height = 80, a = Buffer.alloc(width * height * 3, 120), clean = Buffer.from(a), faint = Buffer.from(a)
  for (let y = 10; y < 65; y++) for (let x = 8; x < 60; x++) if (x % 9 < 2 || y === 20 || y === 50) for (let c = 0; c < 3; c++) a[(y * width + x) * 3 + c] = 0
  // Different background detail supplies a measurable clean control, independently of the removed mark's shape.
  for (let y = 0; y < height; y++) for (let x = 105; x < 155; x++) for (let c = 0; c < 3; c++) clean[(y * width + x) * 3 + c] = clean[(y * width + x) * 3 + c]! + (x % 5 === 0 ? 1 : 0)
  for (let i = 0; i < faint.length; i++) faint[i] = Math.round(clean[i]! * 0.98 + a[i]! * 0.02)
  const png = (b: Buffer) => sharp(b, { raw: { width, height, channels: 3 } }).png().toBuffer()
  const box = { x0: 0, y0: 0, x1: width, y1: height }, original = await png(a)
  expect(residuePass(await measureMarkResidue(original, await png(clean), box))).toBe(true)
  expect(residuePass(await measureMarkResidue(original, await png(faint), box))).toBe(false)
  expect(residuePass(await measureMarkResidue(original, original, box))).toBe(false)
  const flat = await png(Buffer.alloc(a.length, 120))
  expect(residuePass(await measureMarkResidue(flat, flat, box))).toBe(false)
  expect(residuePass(await measureMarkResidue(original, flat, box))).toBe(true)
})
