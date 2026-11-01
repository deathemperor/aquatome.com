import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { hashDistance, PictureSet, SAME_PICTURE } from '@aq/schema'
import { hashPictures } from '../src/picture-hashes'

const M = 'https://media.aquatome.com/aquariumcoop/'
const picture = (cx: number, width = 400) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#246"/><circle cx="${cx}" cy="150" r="90" fill="#fc6"/><rect x="${400 - cx}" y="40" width="60" height="200" fill="#9cf"/></svg>`)).resize(width).webp().toBuffer()

// 2026-11-01: the 5-gallon guide's own pea puffer and the pea puffer page's photo were one picture in two files, shown
// one after the other: two addresses, so only the image tells them apart.
test('hashes every picture in content once: one picture in two files hashes alike, so a page knows it already shows it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ph-'))
  const w = async (path: string, o: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(o)) }
  const photo = (name: string) => ({ url: `${M}${name}.webp`, thumb: `${M}${name}-480.webp`, width: 1000, height: 667 })
  await w('content/guides/g/entity.json', { photos: [photo('guide-puffer')], video: { thumb: { url: 'https://i.ytimg.com/vi/abc/maxresdefault.jpg', width: 1280, height: 720 } } })
  await w('content/species/s/entity.json', { photos: [photo('page-puffer'), photo('other'), photo('broken')] })
  await w('content/gallery/s.json', { id: 's', photos: [photo('known')] })
  await w('engine-state/gallery/s.json', { hashes: { [`${M}known.webp`]: '00000000000000ff' } })
  await w('content/picture-hashes.json', { [`${M}gone.webp`]: '0000000000000001' })
  const got: string[] = []
  const bytes: Record<string, Buffer> = { 'guide-puffer': await picture(120, 1000), 'page-puffer': await picture(120, 480), other: await picture(260) }
  const r = await hashPictures(root, { get: async u => { got.push(u); const b = bytes[u.slice(M.length).replace('-480.webp', '')]; if (!b) throw new Error('HTTP 404'); return b } })
  expect(got.sort()).toEqual([`${M}broken-480.webp`, `${M}guide-puffer-480.webp`, `${M}other-480.webp`, `${M}page-puffer-480.webp`]) // card thumbs; the gallery's hash reused, no video thumbnail
  expect(r).toMatchObject({ pictures: 6, hashed: 3, dropped: 1 })
  expect(r.failed[0]).toContain('broken.webp')
  const raw = await readFile(join(root, 'content/picture-hashes.json'), 'utf8')
  const hashes = JSON.parse(raw) as Record<string, string>
  expect(Object.keys(hashes)).toEqual([`${M}guide-puffer.webp`, `${M}known.webp`, `${M}other.webp`, `${M}page-puffer.webp`]) // sorted; the gone one dropped, the broken one tried next run
  expect(raw).toMatch(/^\{\n {2}"/)
  expect(hashDistance(hashes[`${M}guide-puffer.webp`]!, hashes[`${M}page-puffer.webp`]!)).toBeLessThanOrEqual(SAME_PICTURE)
  expect(hashDistance(hashes[`${M}guide-puffer.webp`]!, hashes[`${M}other.webp`]!)).toBeGreaterThan(SAME_PICTURE)
  const page = new PictureSet(hashes)
  page.add(`${M}guide-puffer.webp`)
  expect(page.has(`${M}page-puffer-480.webp`)).toBe(true) // a card's thumb of the same picture
  expect(page.take([{ url: `${M}page-puffer.webp` }, { url: `${M}other.webp` }])?.url).toBe(`${M}other.webp`)
  expect(page.has('https://i.ytimg.com/vi/abc/hqdefault.jpg')).toBe(false)
  page.add('https://i.ytimg.com/vi/abc/maxresdefault.jpg')
  expect(page.has('https://i.ytimg.com/vi_webp/abc/mqdefault.webp')).toBe(true) // one video, whichever thumbnail
})
