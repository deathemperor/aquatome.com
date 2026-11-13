import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isAllowedLicence, PhotoSchema } from '@aq/schema'
import { z } from 'zod'
import type { Candidate, GalleryState } from './gallery'
import { isRejected } from './photos'

const CandidateSchema = PhotoSchema.extend({ key: z.string().min(1) })
const KINDS = ['species', 'plants', 'breeds'] as const

/**
 * Candidates someone found for a page by hand (the Curation & Media Lead's photo fill: `from`, { <page id>: Candidate[] },
 * keyed as the gallery step keys its own, "File:…", "inat:<id>"), put at the front of the page's gallery queue
 * (engine-state/gallery/<id>.json), where the gallery step screens them next, as it screens what it finds itself
 * (gallery.ts). Left out: one the step judged or queued already, one the page or its gallery shows, a rejected photo, a
 * licence the site may not show, and a page that doesn't exist. A page its sources ran dry for is tried again, and a full
 * album is read for these alone, growing at most gallery.ts SEED_OVER past its target.
 */
export async function seedGalleries(root: string, from: Record<string, unknown[]>) {
  const report = { pages: 0, added: 0, skipped: 0, unknown: [] as string[], invalid: 0 }
  const rejected = isRejected(JSON.parse(await readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>)
  const read = async <T>(path: string) => JSON.parse(await readFile(join(root, path), 'utf8').catch(() => 'null')) as T | null
  for (const [id, raw] of Object.entries(from)) {
    let kind: (typeof KINDS)[number] | undefined
    for (const k of KINDS) if (!kind && (await read(`content/${k}/${id}/entity.json`))) kind = k
    if (!/^[a-z0-9-]+$/.test(id) || !kind) { report.unknown.push(id); continue }
    const page = (await read<{ photos?: { url: string; sourceUrl: string }[] }>(`content/${kind}/${id}/entity.json`))!
    const gallery = (await read<{ photos: { url: string; sourceUrl: string }[] }>(`content/gallery/${id}.json`))?.photos ?? []
    const shown = new Set([...(page.photos ?? []), ...gallery].flatMap(p => [p.url, p.sourceUrl]))
    const file = `engine-state/gallery/${id}.json`
    const st: GalleryState = (await read<GalleryState>(file)) ?? { queue: [], judged: [], hashes: {} }
    const known = new Set([...st.judged, ...st.queue.map(q => q.key)])
    const add: Candidate[] = []
    for (const x of raw) {
      const c = CandidateSchema.safeParse(x)
      if (!c.success) { report.invalid++; continue }
      const k = c.data
      if (known.has(k.key) || shown.has(k.url) || shown.has(k.sourceUrl) || rejected(k.url) || !isAllowedLicence(k.licence)) { report.skipped++; continue }
      known.add(k.key)
      add.push(k)
    }
    if (!add.length) continue
    st.queue = [...add, ...st.queue]
    // Marked as a person's finds: a full album is read again for these alone (gallery.ts SEED_OVER).
    st.seeded = [...new Set([...st.seeded ?? [], ...add.map(c => c.key)])]
    delete st.exhausted
    await mkdir(join(root, 'engine-state/gallery'), { recursive: true })
    await writeFile(join(root, file), `${JSON.stringify(st, null, 1)}\n`)
    report.pages++
    report.added += add.length
  }
  return report
}
