import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test, vi } from 'vitest'

// The photo check's list of sheets set aside is written whole or not at all, through the writer that writes a temporary
// file and renames it (image-cache-write.ts): a run stopped mid-write leaves the last whole list for the next run to read.

const writes: string[] = []
vi.mock('../src/image-cache-write', async original => {
  const real = await original<typeof import('../src/image-cache-write')>()
  return { ...real, writeImageCache: async (file: string, bytes: string | Uint8Array) => { writes.push(file); return real.writeImageCache(file, bytes) } }
})
const { LlmError } = await import('../src/claude')
const { ASIDE_FILE, checkPagePhotos } = await import('../src/photo-check')

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()

test('the list of sheets set aside is written through the writer that writes a whole file or none', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-pc-aside-'))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'content/species/danio-rerio'), { recursive: true })
  const photo = { url: 'https://media.example/a.webp', width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x' }
  await writeFile(join(r, 'content/species/danio-rerio/entity.json'), JSON.stringify({ id: 'danio-rerio', scientificName: 'Danio rerio', photos: [photo] }))
  await writeFile(join(r, 'content/species/danio-rerio/vi.json'), JSON.stringify({ name: 'danio-rerio' }))
  const report = await checkPagePhotos(r, { get: async () => new Uint8Array(await jpeg), look: async () => { throw new LlmError('claude failed (1): API Error: 500') } }, { limit: 10, retryAfterMs: 0 })
  expect(report.aside).toEqual(['danio-rerio: server error (500)'])
  expect(writes).toContain(join(r, 'engine-state', ASIDE_FILE))
})
