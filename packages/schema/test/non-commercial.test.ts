import { createHash } from 'node:crypto'
import { afterEach, expect, test } from 'vitest'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APPROVED_GENERATED_GATE, IMAGE_SWITCHES, isAllowedLicence, isInatNonCommercial, isNonCommercial, loadAll, type GeneratedRecord, type ImageSwitches, type Photo } from '../src/index'

/**
 * iNaturalist album photos under CC BY-NC or CC BY-NC-SA (the owner's yes, 10 Nov): one switch, off. Off, the site shows
 * none, as before; on, its albums show them, and nothing else does.
 */
const dirs: string[] = []
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
const inat = (id: number, licence: string, o: Partial<Photo> = {}): Photo => ({ url: `https://media.aquatome.com/inaturalist/${id}.webp`, width: 1024, height: 768, licence, author: 'Sampletown observer', sourceUrl: `https://www.inaturalist.org/photos/${id}`, ...o })
const url = (id: number) => inat(id, '').url
const hash = 'a'.repeat(64)
const generated: GeneratedRecord = { model: 'gpt-image-2', driverModel: 'gpt-5.6-sol', date: '2026-11-10', prompt: 'fish', referenceHash: hash, check: { passes: 2, judgments: ['a'.repeat(64), 'b'.repeat(64)], verdict: 'pass', version: APPROVED_GENERATED_GATE, model: 'gpt-5.6-sol', at: '2026-11-10', referenceHash: hash, pixelHash: hash, calibrationHash: hash } }
const ai: Photo = { url: 'https://media.aquatome.com/ai.webp', width: 800, height: 600, licence: 'AI-generated', author: 'AI', sourceUrl: 'https://example.org/ai', generated }

async function fixture(photos: Photo[], gallery: Photo[]) {
  const root = await mkdtemp(join(tmpdir(), 'non-commercial-')); dirs.push(root)
  await cp(fileURLToPath(new URL('./fixtures/store', import.meta.url)), root, { recursive: true })
  const file = join(root, 'species/alpha/entity.json'), entity = JSON.parse(await readFile(file, 'utf8'))
  entity.photos = photos; await writeFile(file, JSON.stringify(entity))
  await mkdir(join(root, 'gallery'), { recursive: true })
  await writeFile(join(root, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', photos: [...gallery, ...photos.filter(p => p.generated)], seen: gallery.length, updatedAt: '2026-11-16' }))
  await writeFile(join(root, 'image-approvals.json'), JSON.stringify({ calibrationHash: hash, photos: Object.fromEntries(photos.filter(p => p.generated).map(p => [p.url, { page: 'species/alpha', recordHash: createHash('sha256').update(JSON.stringify([entity.scientificName, entity.sections])).digest('hex'), check: p.generated!.check }])) }))
  return root
}
const load = (root: string, on: Partial<ImageSwitches> = {}) => loadAll({ root, lang: 'vi', publicBuild: true, wholeBoxes: false, imageSwitches: { ...IMAGE_SWITCHES, ...on } })

test('the switch is on (the chief of staff, 16 Nov); turning it off is this one value', () => {
  expect(IMAGE_SWITCHES.inatNonCommercial).toBe(true)
})

test('the mark is the photo\'s own licence text: NC in any spelling, whatever else it says', () => {
  for (const l of ['CC BY-NC', 'CC BY-NC 4.0', 'CC BY-NC-SA', 'CC BY-NC-SA 2.0', 'cc-by-nc-nd', 'CC BY-NC-ND 4.0', 'Attribution-NonCommercial 4.0'])
    expect(isNonCommercial(l), l).toBe(true)
  for (const l of ['CC BY', 'CC BY-SA 4.0', 'CC0', 'CC BY-ND 4.0', 'All rights reserved', '', 'dùng với sự cho phép', 'Unsplash License', 'Public domain'])
    expect(isNonCommercial(l), l).toBe(false)
})

test('the switch lets in iNaturalist\'s CC BY-NC and CC BY-NC-SA, any version: never ND, all rights reserved, no licence, another site or a source', () => {
  for (const l of ['CC BY-NC', 'CC BY-NC 4.0', 'CC BY-NC-SA', 'CC BY-NC-SA 3.0']) expect(isInatNonCommercial(inat(1, l)), l).toBe(true)
  for (const l of ['CC BY-NC-ND', 'CC BY-NC-ND 4.0', 'CC BY-ND', 'CC BY-ND 4.0', 'All rights reserved', '', 'CC BY', 'CC BY-SA', 'CC0'])
    expect(isInatNonCommercial(inat(1, l)), l).toBe(false)
  expect(isInatNonCommercial(inat(1, 'CC BY-NC', { sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sampletown.jpg' }))).toBe(false)
  expect(isInatNonCommercial(inat(1, 'CC BY-NC', { sourceUrl: 'https://www.flickr.com/photos/sampletown/1' }))).toBe(false)
  expect(isInatNonCommercial(inat(1, 'CC BY-NC', { source: 'seriouslyfish' }))).toBe(false)
  // Every other path asks isAllowedLicence, which the switch doesn't reach.
  for (const l of ['CC BY-NC', 'CC BY-NC-SA', 'CC BY-NC 4.0']) expect(isAllowedLicence(l), l).toBe(false)
})

test('the site\'s albums: off, no non-commercial photo; on, iNaturalist\'s BY-NC and BY-NC-SA with their licence, and none of the others; never a page\'s own photo', async () => {
  const album = [inat(2, 'CC BY-NC'), inat(1, 'CC BY 4.0'), inat(3, 'CC BY-NC-SA'), inat(4, 'CC BY-ND'), inat(5, 'CC BY-NC-ND'), inat(6, 'All rights reserved'), inat(7, ''),
    { ...inat(9, 'CC BY-NC 2.0'), sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sampletown.jpg' }]
  const root = await fixture([inat(8, 'CC BY-NC'), inat(10, 'CC BY-SA')], album)
  const off = await load(root, { inatNonCommercial: false })
  expect(off.galleries.alpha!.map(p => p.url)).toEqual([url(1)])
  expect(off.species[0]!.photos.map(p => p.url)).toEqual([url(10)])
  const on = await load(root, { inatNonCommercial: true })
  expect(on.galleries.alpha!.map(p => [p.url, p.licence])).toEqual([[url(2), 'CC BY-NC'], [url(1), 'CC BY 4.0'], [url(3), 'CC BY-NC-SA']])
  expect(on.species[0]!.photos.map(p => p.url)).toEqual([url(10)])
})

test('a head that gives way to an album photo takes an open one, never a non-commercial one, the switch on', async () => {
  const root = await fixture([ai], [inat(2, 'CC BY-NC'), inat(1, 'CC BY 4.0')])
  const on = await load(root, { publishGenerated: true, inatNonCommercial: true })
  expect(on.species[0]!.photos[0]!.url).toBe(url(1))
  expect(on.galleries.alpha!.map(p => p.url)).toContain(url(2))
  const only = await fixture([ai], [inat(2, 'CC BY-NC')])
  expect((await load(only, { publishGenerated: true, inatNonCommercial: true })).species[0]!.photos.map(p => p.url)).not.toContain(url(2))
})
