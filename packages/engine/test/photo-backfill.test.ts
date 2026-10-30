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
  // A video guide has no web page with photos: skipped, not a crash on the unknown source.
  await mkdir(join(root, 'content', 'guides', 'youtube-abc'), { recursive: true })
  await writeFile(join(root, 'content', 'guides', 'youtube-abc', 'entity.json'), JSON.stringify({ source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=abc', photos: [] }))
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

test('archive-read sources are left out; ScotCat photos come from their own pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const sp = (id: string, sections: object[]) => mkdir(join(root, 'content', 'species', id), { recursive: true }).then(() => writeFile(join(root, 'content', 'species', id, 'entity.json'), JSON.stringify({ scientificName: id, photos: [], sections })))
  await sp('pc', [{ source: 'planetcatfish', sourceUrl: 'https://www.planetcatfish.com/common/species.php?species_id=1' }])
  const SC = 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai.htm'
  await sp('hoplisoma-sterbai', [{ source: 'scotcat', sourceUrl: SC }])
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ scotcat: { name: 'ScotCat' } }))
  const gets: string[] = []
  const r = await backfillPhotos(root, {
    get: async (u: string) => {
      gets.push(u)
      return { status: 200, html: u === SC ? '<div class="top-padding-10">Hoplisoma sterbai</div><a href="hoplisoma_sterbai1.htm"><img src="../Thumbnails/c_sterbai.jpg" width="100"></a>' : '<img src="../images/c_sterbai.jpg" alt="Hoplisoma sterbai" width="500" height="316"> &copy; <strong>Helen Burns</strong>' }
    },
    bytes: async (u: string) => new TextEncoder().encode(u),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 500, height: 316 }) },
    now: () => new Date('2026-10-29T12:00:00Z'),
    sleep: async () => {},
  })
  expect(gets).toEqual([SC, 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai1.htm'])
  expect(r).toMatchObject({ pages: 1, added: 1, errors: [] })
  const e = JSON.parse(await readFile(join(root, 'content', 'species', 'hoplisoma-sterbai', 'entity.json'), 'utf8'))
  expect(e.photos[0]).toMatchObject({ author: 'Helen Burns / ScotCat', source: 'scotcat' })
})
