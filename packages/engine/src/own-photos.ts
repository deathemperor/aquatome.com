import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import type { Photo } from '@aq/schema'
import { SOURCE_PHOTO_LICENCE, type Media } from './source-photos'

/** Photos people gave the site owner for the site (content/sources.json, "aquatome", has the permission). */
export type OwnPhoto = { file: string; page: string; crop?: { left: number; top: number; right: number; bottom: number } }
const ABOUT = 'https://aquatome.com/vi/gioi-thieu/'

/**
 * Each listed photo added to its page (`plants/<id>`, `species/<id>`), after the page's own photos, credited to AquaTome.
 * `crop`: fractions of the width/height to keep (labels and edges cut off). `file` is relative to the list.
 * A photo already on its page is skipped, so the list can grow and be run again.
 */
export async function ownPhotos(root: string, list: string, media: Media) {
  const items = JSON.parse(await readFile(list, 'utf8')) as OwnPhoto[]
  const added: string[] = []
  for (const it of items) {
    const file = join(root, 'content', it.page, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8')) as { photos: Photo[] }
    const key = `aquatome/${it.page.replace('/', '-')}-${basename(it.file).replace(/\.[a-z]+$/i, '')}.webp`
    if (e.photos.some(p => p.url === media.urlFor(key))) continue
    let img = sharp(await readFile(resolve(dirname(list), it.file))).rotate()
    if (it.crop) {
      const { width = 0, height = 0 } = await img.metadata()
      const c = it.crop
      img = img.extract({ left: Math.round(c.left * width), top: Math.round(c.top * height), width: Math.round((c.right - c.left) * width), height: Math.round((c.bottom - c.top) * height) })
    }
    const stored = await media.put(key, new Uint8Array(await img.jpeg({ quality: 92 }).toBuffer()))
    e.photos.push({ ...stored, licence: SOURCE_PHOTO_LICENCE, author: 'AquaTome', sourceUrl: ABOUT, source: 'aquatome' })
    await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
    added.push(`${it.page}: ${it.file}`)
  }
  return added
}
