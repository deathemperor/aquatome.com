import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { backfillPhotos } from '../src/photo-backfill'

const URL_ = 'https://www.seriouslyfish.com/species/acanthopsoides-robertsi/'
const page = `<html><head><title>Acanthopsoides robertsi</title></head><body><main><h1>Acanthopsoides robertsi</h1><p>${'A small sand-diving loach. '.repeat(20)}</p>
<img src="/images/robertsi.jpg" alt="Acanthopsoides robertsi" width="600" height="233"><img src="/images/robertsi-2.jpg" alt="Acanthopsoides robertsi" width="550" height="236"></main></body></html>`

test('re-reads the source page of a photo-less species once, adds the photos, then waits a month', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  const dir = join(root, 'content', 'species', 'acanthopsoides-robertsi')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { name: 'Seriously Fish' } }))
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Acanthopsoides robertsi', photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: URL_ }, { source: 'seriouslyfish', sourceUrl: URL_ }] }))
  const gets: string[] = []
  const deps = {
    get: async (u: string) => { gets.push(u); return { status: 200, html: page } },
    bytes: async (u: string) => new TextEncoder().encode(u),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 600, height: 233 }) },
    now: () => new Date('2026-10-29T12:00:00Z'),
    sleep: async () => {},
  }
  const r = await backfillPhotos(root, deps)
  expect(r).toMatchObject({ pages: 1, added: 1, errors: [] }) // the 550px one stays out
  expect(gets).toEqual([URL_]) // one fetch per distinct source page
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(e.photos[0]).toMatchObject({ author: 'Seriously Fish', sourceUrl: URL_, source: 'seriouslyfish' })
  const again = await backfillPhotos(root, deps)
  expect(again.pages).toBe(0)
  expect(gets).toHaveLength(1)
})
