import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
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
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish' } }))
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Acanthopsoides robertsi', photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: URL_ }, { source: 'seriouslyfish', sourceUrl: URL_ }] }))
  // A video guide has no web page with photos: skipped, not a crash on the unknown source.
  await mkdir(join(root, 'content', 'guides', 'youtube-abc'), { recursive: true })
  await writeFile(join(root, 'content', 'guides', 'youtube-abc', 'entity.json'), JSON.stringify({ source: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=abc', photos: [] }))
  const gets: string[] = []
  const deps = {
    get: async (u: string) => { gets.push(u); return { status: 200, html: page } },
    bytes: async (u: string) => sharp({ create: { width: u.includes('robertsi-2') ? 550 : 600, height: 233, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
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

test('--only reads those pages alone, now, though one was read a week ago (first in line, 14 Nov)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(join(root, 'content'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish' } }))
  const other = 'https://www.seriouslyfish.com/species/aaa-other/'
  for (const [id, url] of [['acanthopsoides-robertsi', URL_], ['aaa-other', other]] as const) {
    await mkdir(join(root, 'content', 'species', id), { recursive: true })
    await writeFile(join(root, 'content', 'species', id, 'entity.json'), JSON.stringify({ scientificName: 'Acanthopsoides robertsi', photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: url }] }))
  }
  await writeFile(join(root, 'engine-state', '_photo-backfill.json'), JSON.stringify({ [URL_]: '2026-10-22T12:00:00.000Z' }))
  const gets: string[] = []
  const deps = {
    get: async (u: string) => { gets.push(u); return { status: 200, html: page } },
    bytes: async (u: string) => sharp({ create: { width: u.includes('robertsi-2') ? 550 : 600, height: 233, channels: 3, background: 'gray' } }).jpeg().toBuffer(),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 600, height: 233 }) },
    now: () => new Date('2026-10-29T12:00:00Z'),
    sleep: async () => {},
  }
  expect((await backfillPhotos(root, deps, { only: ['acanthopsoides-robertsi'] })).pages).toBe(1)
  expect(gets).toEqual([URL_])
  expect(JSON.parse(await readFile(join(root, 'content', 'species', 'acanthopsoides-robertsi', 'entity.json'), 'utf8')).photos).toHaveLength(1)
  // Without it, the page read a week ago waits its month, and the other, never read, is due.
  gets.length = 0
  await writeFile(join(root, 'content', 'species', 'acanthopsoides-robertsi', 'entity.json'), JSON.stringify({ scientificName: 'Acanthopsoides robertsi', photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: URL_ }] }))
  await backfillPhotos(root, deps)
  expect(gets).toEqual([other])
})

test('archive-read sources are left out; ScotCat photos come from their own pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const sp = (id: string, sections: object[]) => mkdir(join(root, 'content', 'species', id), { recursive: true }).then(() => writeFile(join(root, 'content', 'species', id, 'entity.json'), JSON.stringify({ scientificName: id, photos: [], sections })))
  await sp('pc', [{ source: 'planetcatfish', sourceUrl: 'https://www.planetcatfish.com/common/species.php?species_id=1' }])
  const SC = 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai.htm'
  await sp('hoplisoma-sterbai', [{ source: 'scotcat', sourceUrl: SC }])
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ scotcat: { publish: true, name: 'ScotCat' } }))
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
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const SF = 'https://www.seriouslyfish.com/species/x/'
  const sp = (id: string, scientificName: string, family: string) => mkdir(join(root, 'content', 'species', id), { recursive: true }).then(() => writeFile(join(root, 'content', 'species', id, 'entity.json'), JSON.stringify({ scientificName, family, photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: SF }] })))
  await sp('hoplisoma-sterbai', 'Hoplisoma sterbai', 'Callichthyidae')
  await sp('hoplisoma-paleatum', 'Hoplisoma paleatum', 'Callichthyidae')
  await sp('apistogramma-borellii', 'Apistogramma borellii', 'Cichlidae') // not a catfish: no guess
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ scotcat: { publish: true, name: 'ScotCat' } }))
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
  const root = await mkdtemp(join(tmpdir(), 'pb-retry-'))
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


test('a recent failed bypass keeps its cooldown; a guide keeps normal photos plus four extra requests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-retry-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const url = 'https://www.aquariumglaser.de/en/fish/guide/'
  const dir = join(root, 'content/guides/fish')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ photos: [], source: 'glaser', sourceUrl: url }))
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [url]: '2026-11-11T00:00:00.000Z' }))
  let status = 404
  let fetches = 0
  const imageFetches: string[] = []
  const deps = {
    get: async () => { fetches++; return { status, html: `<main>${Array.from({ length: 4 }, (_, n) => `<img src="/new-${n}.jpg" width="350" height="233">`).join('')}${Array.from({ length: 10 }, (_, n) => `<img src="/fish-${n}.jpg" width="800" height="600">`).join('')}</main>` } },
    bytes: async (u: string) => { imageFetches.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
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
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 1, added: 14, errors: [] })
  expect(imageFetches).toEqual([...Array.from({ length: 10 }, (_, n) => `https://www.aquariumglaser.de/fish-${n}.jpg`), ...Array.from({ length: 4 }, (_, n) => `https://www.aquariumglaser.de/new-${n}.jpg`)])
})


test('backfill fixtures work in a clean home without a pre-existing private cache', async () => {
  const home = await mkdtemp(join(tmpdir(), 'pb-home-'))
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)), 'run', 'test/photo-backfill.test.ts', '--maxWorkers=1', '-t', '^re-reads the source page'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, HOME: home }, encoding: 'utf8',
  })
  expect(result.status, result.stdout + result.stderr).toBe(0)
  await expect(readdir(join(home, '.cache/aquatome/photo-intake-real-size'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test.each([200, 404])('the one-time attempt survives a later malformed entity after HTTP %i', async status => {
  const root = await mkdtemp(join(tmpdir(), 'pb-durable-'))
  const url = 'https://www.aquariumglaser.de/en/fish/example/'
  const now = '2026-11-11T12:00:00.000Z'
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await mkdir(join(root, 'content/species/z'), { recursive: true })
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ photos: [], sections: [{ source: 'glaser', sourceUrl: url }] }))
  await writeFile(join(root, 'content/species/z/entity.json'), '{')
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [url]: '2026-11-11T00:00:00.000Z' }))
  let reads = 0
  const deps = {
    get: async () => { reads++; return { status, html: '<main>No photos.</main>' } },
    bytes: async () => { throw new Error('no images') },
    media: { urlFor: (k: string) => k, put: async () => { throw new Error('no uploads') } },
    now: () => new Date(now), sleep: async () => {},
  }
  await expect(backfillPhotos(root, deps)).rejects.toThrow()
  expect(JSON.parse(await readFile(join(root, 'engine-state/_photo-intake-retry.json'), 'utf8'))).toEqual({ [url]: now })
  await writeFile(join(root, 'content/species/z/entity.json'), JSON.stringify({ photos: [], sections: [] }))
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 0 })
  expect(reads).toBe(1)
})

test('an overdue guide keeps all seven ordinary photos during recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-guide-'))
  const url = 'https://www.aquariumglaser.de/en/fish/guide/'
  const dir = join(root, 'content/guides/a')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ photos: [], source: 'glaser', sourceUrl: url }))
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [url]: '2026-10-01T00:00:00.000Z' }))
  const fetched: string[] = []
  const result = await backfillPhotos(root, {
    get: async () => ({ status: 200, html: `<main>${Array.from({ length: 7 }, (_, n) => `<img src="/ordinary-${n}.jpg" width="800" height="600">`).join('')}</main>` }),
    bytes: async u => { fetched.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 600 }) },
    now: () => new Date('2026-11-11T12:00:00.000Z'), sleep: async () => {},
  })
  expect(result).toMatchObject({ pages: 1, added: 7, errors: [] })
  expect(fetched).toHaveLength(7)
})

test('failed overdue monthly reads remain due each cycle after the one-time record is kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pb-monthly-'))
  const url = 'https://www.aquariumglaser.de/en/fish/example/'
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ photos: [], sections: [{ source: 'glaser', sourceUrl: url }] }))
  await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [url]: '2026-10-01T00:00:00.000Z' }))
  let reads = 0
  const deps = {
    get: async () => { reads++; return { status: 404, html: '' } },
    bytes: async () => { throw new Error('no images') },
    media: { urlFor: (k: string) => k, put: async () => { throw new Error('no uploads') } },
    now: () => new Date('2026-11-11T12:00:00.000Z'), sleep: async () => {},
  }
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 1, errors: [expect.stringContaining('HTTP 404')] })
  expect(await backfillPhotos(root, deps)).toMatchObject({ pages: 1, errors: [expect.stringContaining('HTTP 404')] })
  expect(reads).toBe(2)
})

test("a re-read doesn't take a photo whose credit the source's permission record refuses", async () => {
  const url = 'https://www.seriouslyfish.com/species/imaginichthys-testi/'
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  const dir = join(root, 'content', 'species', 'imaginichthys-testi')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish', permission: { refusedCredits: ['Example Picture Agency'] } } }))
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Imaginichthys testi', photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: url }] }))
  const fig = (n: number, credit: string) => `<figure><a href="/images/testi-${n}.jpg"><img src="/images/testi-${n}.jpg" alt="Imaginichthys testi, view ${n}." width="800" height="600"></a><figcaption>Imaginichthys testi, view ${n}.<span class="_credit_x"><b>${credit}</b></span></figcaption></figure>`
  const html = `<html><head><title>Imaginichthys testi</title></head><body><main><h1>Imaginichthys testi</h1><p>${'A made-up fish. '.repeat(20)}</p>${fig(1, 'Example Picture Agency')}${fig(2, 'Imaginary Person')}</main></body></html>`
  const fetched: string[] = []
  const r = await backfillPhotos(root, {
    get: async () => ({ status: 200, html }),
    bytes: async (u: string) => { fetched.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 800, height: 600 }) },
    now: () => new Date('2026-11-13T12:00:00Z'),
    sleep: async () => {},
  })
  expect(r).toMatchObject({ pages: 1, added: 1, errors: [] })
  expect(fetched).toEqual(['https://www.seriouslyfish.com/images/testi-2.jpg'])
})

// Paraphanius mento (2026-11-13): its source page's top four photos were taken off for a mark, and they kept all four of
// the page's places at every re-read, so its six other photos were never tried and the page stayed empty.
test("photos taken off the site before don't hold a page's places: the source page's next photos are tried", async () => {
  const { createHash } = await import('node:crypto')
  const url = 'https://www.seriouslyfish.com/species/imaginichthys-testi/'
  const src = (n: number) => `https://www.seriouslyfish.com/images/testi-${n}.jpg`
  const key = (n: number) => `https://m/seriouslyfish/${createHash('sha256').update(src(n)).digest('hex').slice(0, 16)}.webp`
  const root = await mkdtemp(join(tmpdir(), 'pb-'))
  const dir = join(root, 'content', 'species', 'imaginichthys-testi')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish' } }))
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Imaginichthys testi', photos: [], sections: [{ source: 'seriouslyfish', sourceUrl: url }] }))
  await writeFile(join(root, 'engine-state', '_photo-rejected.json'), JSON.stringify(Object.fromEntries([1, 2, 3, 4].map(n => [key(n), 'watermark: withheld']))))
  const html = `<html><head><title>Imaginichthys testi</title></head><body><main><h1>Imaginichthys testi</h1><p>${'A made-up fish. '.repeat(20)}</p>${[1, 2, 3, 4, 5, 6].map(n => `<img src="/images/testi-${n}.jpg" alt="Imaginichthys testi, view ${n}" width="800" height="600">`).join('')}</main></body></html>`
  const fetched: string[] = []
  const r = await backfillPhotos(root, {
    get: async () => ({ status: 200, html }),
    bytes: async (u: string) => { fetched.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 800, height: 600 }) },
    now: () => new Date('2026-11-13T12:00:00Z'),
    sleep: async () => {},
  })
  expect(r).toMatchObject({ pages: 1, added: 2, errors: [] })
  expect(fetched).toEqual([src(5), src(6)]) // no request for a blocked photo
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(e.photos.map((p: { url: string }) => p.url)).toEqual([key(5), key(6)])
})

// The chief of staff, 2026-11-13: photos credited to a business, an organisation or a person with an organisation that
// are already on a page stay. Only new ones wait for the source's word, so a re-read keeps them.
test("a re-read keeps a photo already on the page whose credit's kind the permission doesn't list, and adds a person's", async () => {
  const { createHash } = await import('node:crypto')
  const url = 'https://www.seriouslyfish.com/species/imaginichthys-testi/'
  const src = (n: number) => `https://www.seriouslyfish.com/images/testi-${n}.jpg`
  const key = (n: number) => `https://m/seriouslyfish/${createHash('sha256').update(src(n)).digest('hex').slice(0, 16)}.webp`
  const root = await mkdtemp(join(tmpdir(), 'pb-kept-'))
  const dir = join(root, 'content', 'species', 'imaginichthys-testi')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish' } }))
  const shown = { url: key(1), width: 800, height: 600, licence: 'dùng với sự cho phép', author: 'Seriously Fish', sourceUrl: url, source: 'seriouslyfish' }
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Imaginichthys testi', photos: [shown], sections: [{ source: 'seriouslyfish', sourceUrl: url }] }))
  const fig = (n: number, credit: string) => `<figure><a href="/images/testi-${n}.jpg"><img src="/images/testi-${n}.jpg" alt="Imaginichthys testi, view ${n}." width="800" height="600"></a><figcaption>Imaginichthys testi, view ${n}.<span class="_credit_x"><b>${credit}</b></span></figcaption></figure>`
  const html = `<html><head><title>Imaginichthys testi</title></head><body><main><h1>Imaginichthys testi</h1><p>${'A made-up fish. '.repeat(20)}</p>${fig(1, 'Example Aquatics')}${fig(2, 'Example Fish Society')}${fig(3, 'Imaginary Person')}</main></body></html>`
  const fetched: string[] = []
  const r = await backfillPhotos(root, {
    get: async () => ({ status: 200, html }),
    bytes: async (u: string) => { fetched.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 800, height: 600 }) },
    now: () => new Date('2026-11-13T12:00:00Z'),
    sleep: async () => {},
  })
  expect(r).toMatchObject({ pages: 1, added: 1, errors: [] })
  expect(fetched).toEqual([src(3)]) // none for the one shown, none for the new organisation's
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(e.photos.map((p: { url: string }) => p.url).sort()).toEqual([key(1), key(3)].sort())
})

// A reader's case (13 Nov): four photos a re-read takes rank above the one the page shows under a credit we take no more.
// The page keeps that one; the four others share what's left of the four places.
test("a re-read keeps a photo the page shows under a credit we take no more, though four photos rank above it", async () => {
  const { createHash } = await import('node:crypto')
  const url = 'https://www.seriouslyfish.com/species/imaginichthys-testi/'
  const src = (n: number) => `https://www.seriouslyfish.com/images/testi-${n}.jpg`
  const key = (n: number) => `https://m/seriouslyfish/${createHash('sha256').update(src(n)).digest('hex').slice(0, 16)}.webp`
  const root = await mkdtemp(join(tmpdir(), 'pb-fifth-'))
  const dir = join(root, 'content', 'species', 'imaginichthys-testi')
  await mkdir(dir, { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish' } }))
  const shown = { url: key(5), width: 800, height: 600, licence: 'dùng với sự cho phép', author: 'Example Aquatics / Seriously Fish', sourceUrl: url, source: 'seriouslyfish' }
  await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Imaginichthys testi', photos: [shown], sections: [{ source: 'seriouslyfish', sourceUrl: url }] }))
  const fig = (n: number, credit: string) => `<figure><a href="/images/testi-${n}.jpg"><img src="/images/testi-${n}.jpg" alt="Imaginichthys testi, view ${n}." width="800" height="600"></a><figcaption>Imaginichthys testi, view ${n}.<span class="_credit_x"><b>${credit}</b></span></figcaption></figure>`
  const credits = ['Imaginary Person', 'Another Person', 'Third Person', 'Fourth Person', 'Example Aquatics']
  const html = `<html><head><title>Imaginichthys testi</title></head><body><main><h1>Imaginichthys testi</h1><p>${'A made-up fish. '.repeat(20)}</p>${credits.map((c, i) => fig(i + 1, c)).join('')}</main></body></html>`
  const fetched: string[] = []
  const r = await backfillPhotos(root, {
    get: async () => ({ status: 200, html }),
    bytes: async (u: string) => { fetched.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 800, height: 600 }) },
    now: () => new Date('2026-11-13T12:00:00Z'),
    sleep: async () => {},
  })
  expect(r.errors).toEqual([])
  expect(fetched).toEqual([src(1), src(2), src(3)])
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
  expect(e.photos.map((p: { url: string }) => p.url).sort()).toEqual([key(1), key(2), key(3), key(5)].sort())
})

// The reader's next case (13 Nov): the shown photo is one the page lays out small (no file width), which the picker
// tries after the others. It keeps its place all the same, on a fish's page and on a guide, under the address it has.
test("a re-read keeps a shown photo the page lays out small, on a fish's page and on a guide with two addresses for it", async () => {
  const { createHash } = await import('node:crypto')
  const key = (src: string, source = 'seriouslyfish') => `https://m/${source}/${createHash('sha256').update(src).digest('hex').slice(0, 16)}.webp`
  const fetchedFish: string[] = []
  // A fish's page: four photos we take rank above the shown one, which the page lays out at 400 px.
  {
    const url = 'https://www.seriouslyfish.com/species/imaginichthys-testi/'
    const src = (n: number) => `https://www.seriouslyfish.com/images/testi-${n}.jpg`
    const root = await mkdtemp(join(tmpdir(), 'pb-small-'))
    const dir = join(root, 'content', 'species', 'imaginichthys-testi')
    await mkdir(dir, { recursive: true })
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ seriouslyfish: { publish: true, name: 'Seriously Fish' } }))
    const shown = { url: key(src(5)), width: 800, height: 600, licence: 'dùng với sự cho phép', author: 'Example Aquatics / Seriously Fish', sourceUrl: url, source: 'seriouslyfish' }
    await writeFile(join(dir, 'entity.json'), JSON.stringify({ scientificName: 'Imaginichthys testi', photos: [shown], sections: [{ source: 'seriouslyfish', sourceUrl: url }] }))
    const fig = (n: number, credit: string, size: string) => `<figure><img src="/images/testi-${n}.jpg" alt="Imaginichthys testi, view ${n}." ${size}><figcaption>Imaginichthys testi, view ${n}.<span class="_credit_x"><b>${credit}</b></span></figcaption></figure>`
    const credits = ['Imaginary Person', 'Another Person', 'Third Person', 'Fourth Person']
    const html = `<html><head><title>Imaginichthys testi</title></head><body><main><h1>Imaginichthys testi</h1><p>${'A made-up fish. '.repeat(20)}</p>${credits.map((c, i) => fig(i + 1, c, 'srcset="/images/testi-' + (i + 1) + '.jpg 800w"')).join('')}${fig(5, 'Example Aquatics', 'width="400" height="300"')}</main></body></html>`
    const r = await backfillPhotos(root, {
      get: async () => ({ status: 200, html }),
      bytes: async (u: string) => { fetchedFish.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
      media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 800, height: 600 }) },
      now: () => new Date('2026-11-13T12:00:00Z'), sleep: async () => {},
    })
    expect(r.errors).toEqual([])
    expect(fetchedFish).toEqual([src(1), src(2), src(3)])
    const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
    expect(e.photos.map((p: { url: string }) => p.url).sort()).toEqual([key(src(1)), key(src(2)), key(src(3)), key(src(5))].sort())
  }
  // A guide that shows a business's photo at /old/: the source now shows it at /new/ first. The guide keeps /old/ and
  // fetches neither copy.
  {
    const url = 'https://www.aquariumglaser.de/en/fish/guide/'
    const root = await mkdtemp(join(tmpdir(), 'pb-guide-shown-'))
    const dir = join(root, 'content/guides/a')
    await mkdir(dir, { recursive: true })
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(join(root, 'content', 'sources.json'), JSON.stringify({ glaser: { publish: true, name: 'Aquarium Glaser' } }))
    const old = 'https://www.aquariumglaser.de/old/fish.jpg'
    const shown = { url: key(old, 'glaser'), width: 800, height: 600, licence: 'dùng với sự cho phép', author: 'Example Aquatics / Aquarium Glaser', sourceUrl: url, source: 'glaser' }
    await writeFile(join(dir, 'entity.json'), JSON.stringify({ photos: [shown], source: 'glaser', sourceUrl: url }))
    await writeFile(join(root, 'engine-state/_photo-backfill.json'), JSON.stringify({ [url]: '2026-10-01T00:00:00.000Z' }))
    const fetched: string[] = []
    const fig = (path: string) => `<figure><img src="${path}" alt="A fish." width="800" height="600"><figcaption>A fish.<span class="_credit_x"><b>Example Aquatics</b></span></figcaption></figure>`
    const r = await backfillPhotos(root, {
      get: async () => ({ status: 200, html: `<main>${fig('/new/fish.jpg')}${fig('/old/fish.jpg')}</main>` }),
      bytes: async (u: string) => { fetched.push(u); return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
      media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => ({ url: `https://m/${k}`, width: 800, height: 600 }) },
      now: () => new Date('2026-11-13T12:00:00Z'), sleep: async () => {},
    })
    expect(r.errors).toEqual([])
    expect(fetched).toEqual([])
    const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8'))
    expect(e.photos.map((p: { url: string }) => p.url)).toEqual([shown.url])
  }
})
