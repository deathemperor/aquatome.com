import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { mirrorPhotos, mirrorPlan, type MirrorDeps } from '../src/mirror-photos'

const C1280 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Oscar_%281%29.jpg/1280px-Oscar_%281%29.jpg?utm_source=commons.wikimedia.org'
const C500 = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Oscar_%281%29.jpg/500px-Oscar_%281%29.jpg'
const CO2 = 'https://upload.wikimedia.org/wikipedia/commons/3/32/BioCo2.png'
const INAT = 'https://inaturalist-open-data.s3.amazonaws.com/photos/617421644/medium.jpg'
const OURS = 'https://media.aquatome.com/seriouslyfish/3f28df94d5975f39.webp'
const photo = (url: string, extra: object = {}) => ({ url, width: 1280, height: 960, licence: 'CC BY-SA 4.0', author: 'Ann', sourceUrl: `https://commons.wikimedia.org/wiki/File:${url.length}`, ...extra })

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-mirror-'))
  await mkdir(join(r, 'content/species/astronotus-ocellatus'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'content/equipment'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await writeFile(join(r, 'content/species/astronotus-ocellatus/entity.json'), JSON.stringify({ id: 'astronotus-ocellatus', photos: [photo(C1280, { caption: 'Oscar' }), photo(OURS)] }, null, 2) + '\n')
  await writeFile(join(r, 'content/gallery/astronotus-ocellatus.json'), JSON.stringify({ id: 'astronotus-ocellatus', photos: [photo(C500), photo(INAT)] }, null, 2) + '\n')
  await writeFile(join(r, 'content/equipment/co2.json'), JSON.stringify({ category: 'co2', types: [{ id: 'mini', photo: photo(CO2) }] }, null, 1) + '\n')
  await writeFile(join(r, 'engine-state/_photo-faces.json'), JSON.stringify({ [C1280]: 0 }))
  return r
}

function deps() {
  const fetched: string[] = [], put: string[] = []
  const d: MirrorDeps = {
    bytes: async u => { fetched.push(u); if (u.includes('/large.')) throw new Error('404'); return new Uint8Array([1]) },
    media: { urlFor: k => `https://media.aquatome.com/${k}`, put: async k => { put.push(k); return { url: `https://media.aquatome.com/${k}`, thumb: `https://media.aquatome.com/${k.replace('.webp', '-480.webp')}`, width: 1200, height: 900 } } },
    sleep: async () => {},
  }
  return { d, fetched, put }
}
const read = async (r: string, f: string) => readFile(join(r, 'content', f), 'utf8')

test('mirrorPlan: one key per Commons file whatever the size or query; iNaturalist asks for the large size first; our own photos are left alone', () => {
  expect(mirrorPlan(C1280)!.key).toBe(mirrorPlan(C500)!.key)
  expect(mirrorPlan(C1280)!.key).toMatch(/^commons\/[0-9a-f]{16}\.webp$/)
  expect(mirrorPlan(INAT)).toEqual({ key: 'inaturalist/617421644.webp', fetch: [INAT.replace('/medium.', '/large.'), INAT] })
  // iNaturalist's oldest photos have no extension after the dot
  expect(mirrorPlan('https://inaturalist-open-data.s3.amazonaws.com/photos/1244973/large.')?.key).toBe('inaturalist/1244973.webp')
  expect(mirrorPlan(OURS)).toBeUndefined()
})

test('mirrorPlan: Flickr (from Openverse) one key per photo id; GBIF one per occurrence photo, fetched at 1200 px; Unsplash stays hot-linked', () => {
  expect(mirrorPlan('https://live.staticflickr.com/8518/8600709463_7a79b898cf_b.jpg')).toEqual({ key: 'flickr/8600709463.webp', fetch: ['https://live.staticflickr.com/8518/8600709463_7a79b898cf_b.jpg'] })
  expect(mirrorPlan('https://live.staticflickr.com/139/326984998_c9d1e0f570.jpg')!.key).toBe('flickr/326984998.webp')
  const g = 'https://api.gbif.org/v1/image/cache/fit-in/500x/occurrence/5008826009/media/8ef0275f1615a4c2927b22de444ec6a0'
  expect(mirrorPlan(g)).toEqual({ key: 'gbif/5008826009-8ef0275f1615a4c2.webp', fetch: [g.replace('500x', '1200x')] })
  expect(mirrorPlan('https://api.gbif.org/v1/occurrence/search?taxonKey=1')).toBeUndefined()
  expect(mirrorPlan('https://images.unsplash.com/photo-1?w=1280&q=80&fm=jpg&fit=max')).toBeUndefined()
})

test('hot-linked photos move to our bucket once each; credit, licence, source link and file formatting are kept; caches follow the new URL', async () => {
  const r = await root()
  const { d, fetched, put } = deps()
  const out = await mirrorPhotos(r, d)
  // The Commons file used by the species page and its gallery is stored once.
  expect(put.sort()).toEqual([mirrorPlan(C1280)!.key, mirrorPlan(CO2)!.key, 'inaturalist/617421644.webp'].sort())
  expect(out).toMatchObject({ mirrored: 3, files: 3, failed: [] })
  // iNaturalist's large size failed: the medium one was used.
  expect(fetched).toContain(INAT)

  const sp = JSON.parse(await read(r, 'species/astronotus-ocellatus/entity.json'))
  expect(sp.photos[0]).toEqual({ ...photo(C1280, { caption: 'Oscar' }), url: `https://media.aquatome.com/${mirrorPlan(C1280)!.key}`, thumb: `https://media.aquatome.com/${mirrorPlan(C1280)!.key.replace('.webp', '-480.webp')}`, width: 1200, height: 900 })
  expect(sp.photos[1].url).toBe(OURS)
  expect(await read(r, 'gallery/astronotus-ocellatus.json')).toMatch(/^\{\n {2}"id"/)
  const co2 = await read(r, 'equipment/co2.json')
  expect(co2).toMatch(/^\{\n "category"/)
  expect(JSON.parse(co2).types[0].photo.url).toContain('media.aquatome.com/commons/')

  const faces = JSON.parse(await readFile(join(r, 'engine-state/_photo-faces.json'), 'utf8'))
  expect(faces[sp.photos[0].url]).toBe(0)
  expect(faces[C1280]).toBe(0)

  // A second run has nothing to do.
  const again = deps()
  expect(await mirrorPhotos(r, again.d)).toMatchObject({ mirrored: 0, files: 0, pending: 0 })
  expect(again.put).toEqual([])
})

test('dry run counts what would move; limit caps the uploads in one run', async () => {
  const r = await root()
  const dry = deps()
  expect(await mirrorPhotos(r, dry.d, { dryRun: true })).toMatchObject({ mirrored: 0, pending: 4 })
  expect(dry.put).toEqual([])
  const one = deps()
  expect(await mirrorPhotos(r, one.d, { limit: 1 })).toMatchObject({ mirrored: 1 })
  expect(one.put).toHaveLength(1)
})
