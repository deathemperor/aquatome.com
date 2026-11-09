import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { GuideSchema, STILL_MIN_SIDE, type GuideEntity } from '@aq/schema'
import { asStored } from './media'

const WIDTH = 960
const CELL = 80

/**
 * How sharp a stored still is: the variance of the Laplacian, in 80 px cells of the picture scaled to 960 px across, at
 * the cells' 95th percentile, so it reads the sharpest part of the frame: a sharp fish on a plain background scores as
 * sharp, where the whole frame's variance doesn't. The bar is the schema's STILL_MIN_SHARPNESS.
 */
export async function sharpnessOf(stored: Uint8Array): Promise<number> {
  const { data, info } = await sharp(stored).greyscale().resize({ width: WIDTH }).raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const cols = Math.floor(w / CELL), rows = Math.floor(h / CELL)
  const sum = new Float64Array(cols * rows), sq = new Float64Array(cols * rows), n = new Float64Array(cols * rows)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
    if (cx >= cols || cy >= rows) continue
    const i = y * w + x
    const v = data[i - w]! + data[i + w]! + data[i - 1]! + data[i + 1]! - 4 * data[i]!
    const k = cy * cols + cx
    sum[k] += v; sq[k] += v * v; n[k]++
  }
  const vars = Array.from(sum, (s, k) => sq[k]! / n[k]! - (s / n[k]!) ** 2).sort((a, b) => a - b)
  return Math.round(vars[Math.min(vars.length - 1, Math.floor(0.95 * vars.length))]! * 10) / 10
}

/** A frame just grabbed, measured as it will be stored. */
export const frameSharpness = async (frame: Uint8Array) => sharpnessOf(await asStored(frame).toBuffer())

/** Gives every full-size still that has none its sharpness, from the stored picture. One that can't be fetched waits for the next run. */
export async function scoreStills(root: string, get: (url: string) => Promise<Uint8Array>) {
  const report = { scored: 0, guides: 0, failed: 0 }
  const dir = join(root, 'content', 'guides')
  for (const id of (await readdir(dir).catch(() => [] as string[])).filter(x => x.startsWith('youtube-')).sort()) {
    const file = join(dir, id, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8')) as GuideEntity
    let changed = false
    for (const m of (e.video?.figures ?? []).flatMap(f => f.moments)) {
      if (Math.min(m.width, m.height) < STILL_MIN_SIDE || m.sharpness !== undefined) continue
      try {
        m.sharpness = await sharpnessOf(await get(m.url))
        report.scored++
        changed = true
      } catch { report.failed++ }
    }
    if (changed) { await writeFile(file, `${JSON.stringify(GuideSchema.parse(e), null, 2)}\n`); report.guides++ }
  }
  return report
}
