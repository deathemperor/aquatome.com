import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { expect, test } from 'vitest'

const file = (path: string) => fileURLToPath(new URL(path, import.meta.url))
const FAVICON = file('../public/favicon.png')
const TOUCH = file('../public/apple-touch-icon.png')
// The app's fish as the project uses it: the app icon's 1024, cut to 800 px at (112, 22), so the fish fills a small tile.
const FISH = file('../../../assets/app-icon.png')

const pixels = (img: string | Buffer) => sharp(img).flatten({ background: '#fff' }).resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer()
/** How far apart two pictures are, 0 to 255 a channel on average, leaving out the rows and columns the rounded corners touch. */
async function apart(a: string | Buffer, b: string | Buffer) {
  const [x, y] = await Promise.all([pixels(a), pixels(b)])
  let sum = 0
  let n = 0
  for (let row = 8; row < 24; row++) for (let col = 8 * 3; col < 24 * 3; col++, n++) sum += Math.abs(x[row * 32 * 3 + col]! - y[row * 32 * 3 + col]!)
  return sum / n
}

test("the site's tab icon is the app's fish, on a tile with rounded corners", async () => {
  expect(await apart(FAVICON, FISH)).toBeLessThan(6)
  const { width, height } = await sharp(FAVICON).metadata()
  expect([width, height]).toEqual([512, 512])
  const { data, info } = await sharp(FAVICON).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
  for (const [x, y] of [[0, 0], [511, 0], [0, 511], [511, 511]] as const) expect(alpha(x, y), `corner ${x},${y}`).toBe(0)
  expect(alpha(256, 0)).toBe(255)
})

test("the home-screen icon is the app icon's whole tile, opaque, for iOS to round", async () => {
  const { width, height, hasAlpha } = await sharp(TOUCH).metadata()
  expect([width, height]).toEqual([180, 180])
  expect(hasAlpha).toBe(false)
  // The part of the whole tile that the fish's cut shows.
  const cut = await sharp(TOUCH).extract({ left: 20, top: 4, width: 141, height: 141 }).png().toBuffer()
  expect(await apart(cut, FISH)).toBeLessThan(6)
})

test('/favicon.ico holds the sizes browsers ask for', () => {
  const ico = readFileSync(file('../public/favicon.ico'))
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16]!)
  expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48])
})
