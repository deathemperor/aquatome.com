import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import sharp from 'sharp'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { backfillPhotos } from '../src/photo-backfill'

const URL_ = 'https://www.seriouslyfish.com/species/acanthopsoides-robertsi/'
const page = `<html><head><title>Acanthopsoides robertsi</title></head><body><main><h1>Acanthopsoides robertsi</h1><p>${'A small sand-diving loach. '.repeat(20)}</p>
<img src="/images/robertsi.jpg" alt="Acanthopsoides robertsi" width="600" height="233"><img src="/images/robertsi-2.jpg" alt="Acanthopsoides robertsi" width="550" height="236"></main></body></html>`

test('re-reads the source page of a photo-less species once, adds the photos, then waits a month', async () => {
  const root = await mkdtemp(join(homedir(), '.cache/aquatome/photo-intake-real-size/pb-'))
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
    bytes: async () => sharp({ create: { width: 600, height: 233, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
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
  const root = await mkdtemp(join(homedir(), '.cache/aquatome/photo-intake-real-size/pb-'))
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
      return { status: 200, html: u === SC ? '<div class="top-padding-10">Hoplisoma sterbai</div><a href="hoplisoma_sterbai1.htm"><img src="../Thumbnails/c_sterbai.jpg" width="100"></a>' : '<img src="../images/c_sterbai.jpg" alt="Hoplisoma sterbai" width="500" height="316"> &copy; <strong>Photographer A</strong>' }
    },
    bytes: async () => sharp({ create: { width: 600, height: 233, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 500, height: 316 }) },
    now: () => new Date('2026-10-29T12:00:00Z'),
    sleep: async () => {},
  })
  expect(gets).toEqual([SC, 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai1.htm'])
  expect(r).toMatchObject({ pages: 1, added: 1, errors: [] })
  const e = JSON.parse(await readFile(join(root, 'content', 'species', 'hoplisoma-sterbai', 'entity.json'), 'utf8'))
  expect(e.photos[0]).toMatchObject({ author: 'Photographer A / ScotCat', source: 'scotcat' })
})

test('catfish from other sources get ScotCat photos at its guessed factsheet address; a 404 waits a month; 10 s between ScotCat requests', async () => {
  const root = await mkdtemp(join(homedir(), '.cache/aquatome/photo-intake-real-size/pb-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const SF = 'https://www.seriouslyfish.com/species/x/'
  const sp = (id: string, scientificName: string, family: string) => mkdir(join(root, 'content', 'species', id), { recursive: true }).then(() => writeFile(join(root, 'content', 'species', id, 'entity.json'), JSON.stringify({ scientificName, family, photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: SF }] })))
  await sp('hoplisoma-sterbai', 'Hoplisoma sterbai', 'Callichthyidae')
  await sp('hoplisoma-paleatum', 'Hoplisoma paleatum', 'Callichthyidae')
  await sp('apistogramma-borellii', 'Apistogramma borellii', 'Cichlidae') // not a catfish: no guess
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ scotcat: { name: 'ScotCat' } }))
  const SC = 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai.htm'
  let clock = Date.parse('2026-10-29T12:00:00Z')
  const gets: [string, number][] = []
  const deps = {
    get: async (u: string) => {
      gets.push([u, clock])
      if (u === SF) return { status: 200, html: '<main><h1>x</h1></main>' }
      if (u === SC) return { status: 200, html: '<div class="top-padding-10">Hoplisoma sterbai</div><a href="hoplisoma_sterbai1.htm"><img src="../Thumbnails/c_sterbai.jpg" width="100"></a>' }
      if (u.endsWith('hoplisoma_sterbai1.htm')) return { status: 200, html: '<img src="../images/c_sterbai.jpg" alt="Hoplisoma sterbai" width="500" height="316"> &copy; <strong>Photographer A</strong>' }
      return { status: 404, html: 'Not found' }
    },
    bytes: async () => sharp({ create: { width: 600, height: 233, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 500, height: 316 }) },
    now: () => new Date(clock),
    sleep: async (ms: number) => { clock += ms },
  }
  const r = await backfillPhotos(root, deps)
  const scotcat = gets.filter(([u]) => u.includes('scotcat'))
  expect(scotcat.map(([u]) => u)).toEqual(['https://www.scotcat.com/callichthyidae/hoplisoma_paleatum.htm', SC, 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai1.htm'])
  for (let i = 1; i < scotcat.length; i++) expect(scotcat[i]![1] - scotcat[i - 1]![1]).toBeGreaterThanOrEqual(10_000)
  expect(r.errors).toEqual([])
  const e = JSON.parse(await readFile(join(root, 'content', 'species', 'hoplisoma-sterbai', 'entity.json'), 'utf8'))
  expect(e.photos[0]).toMatchObject({ author: 'Photographer A / ScotCat', source: 'scotcat', sourceUrl: SC })
  expect(e.sections).toEqual([{ source: 'seriouslyfish', sourceUrl: SF }]) // a photo, not a ScotCat section
  gets.length = 0
  await backfillPhotos(root, deps)
  expect(gets.filter(([u]) => u.includes('scotcat'))).toEqual([]) // the 404 is not asked again this month
})


test('recently tried empty source pages get one intake retry, paced by the existing page limit', async () => {
  const root = await mkdtemp(join(homedir(), '.cache/aquatome/photo-intake-real-size/retry-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const urls = ['https://www.aquariumglaser.de/en/fish/a/', 'https://www.aquariumglaser.de/en/fish/b/', 'https://www.seriouslyfish.com/species/c/']
  for (const [i, url] of urls.entries()) {
    const dir = join(root, 'content/species', String(i))
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'entity.json'), JSON.stringify({ photos: [], sections: [{ source: i < 2 ? 'glaser' : 'seriouslyfish', sourceUrl: url }] }))
  }
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify(Object.fromEntries(urls.map(u => [u, '2026-11-11T00:00:00.000Z']))))
  const gets: string[] = []
  const deps = {
    get: async (u: string) => { gets.push(u); return { status: 200, html: '<main><p>No images.</p></main>' } },
    bytes: async () => { throw new Error('no image requests') },
    media: { urlFor: (k: string) => k, put: async () => { throw new Error('no uploads') } },
    now: () => new Date('2026-11-11T12:00:00.000Z'), sleep: async () => {},
  }
  expect(await backfillPhotos(root, deps, { limit: 1 })).toMatchObject({ pages: 1, errors: [] })
  expect(gets).toEqual([urls[0]])
  expect(await backfillPhotos(root, deps, { limit: 1 })).toMatchObject({ pages: 1, errors: [] })
  expect(gets).toEqual(urls.slice(0, 2))
  expect(await backfillPhotos(root, deps, { limit: 1 })).toMatchObject({ pages: 0, errors: [] })
  expect(gets).toEqual(urls.slice(0, 2))
})


test('the one-time retry caps a guide at four photos and consumes a failed page attempt too', async () => {
  const root = await mkdtemp(join(homedir(), '.cache/aquatome/photo-intake-real-size/retry-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const url = 'https://www.aquariumglaser.de/en/fish/guide/'
  const dir = join(root, 'content/guides/fish')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ photos: [], source: 'glaser', sourceUrl: url }))
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [url]: '2026-11-11T00:00:00.000Z' }))
  let status = 404
  let fetches = 0
  const deps = {
    get: async () => { fetches++; return { status, html: `<main>${Array.from({ length: 10 }, (_, n) => `<img src="/fish-${n}.jpg" srcset="/fish-${n}.jpg 800w">`).join('')}</main>` } },
    bytes: async () => sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
    media: { urlFor: (k: string) => k, put: async (k: string) => ({ url: k, width: 800, height: 600 }) },
    now: () => new Date('2026-11-11T12:00:00.000Z'), sleep: async () => {},
  }
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 1, added: 0, errors: [expect.stringContaining('HTTP 404')] })
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 0 })
  expect(fetches).toBe(1)
  // A separate source address has its own single attempt.
  const next = `${url}other/`
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ photos: [], source: 'glaser', sourceUrl: next }))
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [next]: '2026-11-11T00:00:00.000Z' }))
  status = 200
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 1, added: 4, errors: [] })
})
