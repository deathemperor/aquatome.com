import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MEDIA_HOST, thumbOf } from '@aq/schema'

export type ThumbDeps = { exists: (url: string) => Promise<boolean>; get: (url: string) => Promise<Uint8Array>; putThumb: (key: string, bytes: Uint8Array) => Promise<void> }
type Photo = { url: string; thumb?: string }

/** R2 photos in content without a `thumb`: make the -480 file if missing, then record it on the photo. */
export async function backfillThumbs(contentRoot: string, d: ThumbDeps): Promise<{ checked: number; made: number; failed: string[] }> {
  const done = new Map<string, boolean>() // photo url → thumb now exists (a photo can appear on several pages)
  let checked = 0
  let made = 0
  const failed: string[] = []
  for (const kind of ['species', 'plants', 'guides']) {
    for (const id of await readdir(join(contentRoot, kind)).catch(() => [] as string[])) {
      const file = join(contentRoot, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const e = JSON.parse(raw) as { photos?: Photo[] }
      let changed = false
      for (const p of e.photos ?? []) {
        const t = new URL(p.url).host === MEDIA_HOST && !p.thumb ? thumbOf(p.url) : undefined
        if (!t) continue
        if (!done.has(p.url)) {
          checked++
          try {
            if (!(await d.exists(t))) { await d.putThumb(new URL(p.url).pathname.slice(1), await d.get(p.url)); made++ }
            done.set(p.url, true)
          } catch (err) {
            done.set(p.url, false)
            failed.push(`${p.url}: ${(err as Error).message.slice(0, 120)}`)
          }
        }
        if (done.get(p.url)) { p.thumb = t; changed = true }
      }
      if (changed) await writeFile(file, `${JSON.stringify(e, null, 2)}\n`)
    }
  }
  return { checked, made, failed }
}
