import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test, vi } from 'vitest'

// The return step's own record and the album files it changes are written whole or not at all, through the writer that
// writes a temporary file and renames it (image-cache-write.ts), so a run stopped mid-write leaves the last whole copy.

const writes: string[] = []
vi.mock('../src/image-cache-write', async original => {
  const real = await original<typeof import('../src/image-cache-write')>()
  return { ...real, writeImageCache: async (file: string, bytes: string | Uint8Array) => { writes.push(file); return real.writeImageCache(file, bytes) } }
})
const { returnShopPhotos, RETURNS_FILE } = await import('../src/shop-return')

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const SHOP = 'https://www.aquariumglaser.de/en/fish/betta_x_en/'

test("the step's record, the list and the album are each written through the writer that writes a whole file or none", async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-shop-return-writes-'))
  const own = 'https://media.aquatome.com/glaser/own.webp'
  await mkdir(join(r, 'content/species/betta-x'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await writeFile(join(r, 'content/species/betta-x/entity.json'), JSON.stringify({ id: 'betta-x', photos: [{ url: 'https://media.example/clean.webp', width: 960, height: 720, licence: 'CC BY', author: 'x', sourceUrl: 'https://example.org/clean' }] }))
  await writeFile(join(r, 'content/gallery/betta-x.json'), JSON.stringify({ id: 'betta-x', photos: [], seen: 0, updatedAt: '' }))
  await writeFile(join(r, 'content/sources.json'), JSON.stringify({ glaser: { name: 'Sampletown Glaser', homepage: 'https://glaser.example.org' } }))
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [own]: { ocr: [], watermark: true, kind: 'logo', locations: ['bottom centre'] } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [own]: `watermark: withheld [sha256:${'a'.repeat(64)}]` }))
  const photo = { url: own, width: 960, height: 720, licence: 'used with permission', author: 'Aquarium Glaser', sourceUrl: SHOP, source: 'glaser' as const }
  const report = await returnShopPhotos(r, [{ page: 'species/betta-x', photo }], {
    get: async () => new Uint8Array(await jpeg),
    look: async (_sheet, prompt) => ({ photos: [...prompt.matchAll(/^(\d+): /gm)].map(([, n]) => ({ n: Number(n), watermark: true, kind: 'logo' as const, locations: ['bottom centre'], own: true })) }),
  }, { today: '2026-11-20', limit: 5 })
  expect(report.returned).toEqual([`species/betta-x: ${own}`])
  for (const f of [`engine-state/${RETURNS_FILE}`, 'engine-state/_photo-rejected.json', 'engine-state/_photo-watermarks.json', 'content/gallery/betta-x.json']) expect(writes).toContain(join(r, f))
})
