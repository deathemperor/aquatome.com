import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { checkPagePhotos, type PhotoCheckDeps } from '../src/photo-check'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const photo = (n: string) => ({ url: `https://media.example/${n}.webp`, thumb: `https://media.example/${n}-480.webp`, width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x' })

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-pc-'))
  await mkdir(join(r, 'content/species/trigonostigma-heteromorpha'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await writeFile(join(r, 'content/species/trigonostigma-heteromorpha/entity.json'), JSON.stringify({ scientificName: 'Trigonostigma heteromorpha', photos: ['pale', 'platy', 'typical', 'tank', 'rare'].map(photo) }))
  await writeFile(join(r, 'content/species/trigonostigma-heteromorpha/vi.json'), JSON.stringify({ name: 'Cá tam giác', altNames: ['Harlequin rasbora', 'Cá rasbora hề'] }))
  return r
}
const files = (r: string) => [join(r, 'content'), join(r, 'engine-state/_photo-check.json'), join(r, 'engine-state/_photo-rejected.json')] as const

test('photos of another species or of no single subject are rejected; a typical photo leads; each photo is judged once', async () => {
  const r = await root()
  const prompts: string[] = []
  const d: PhotoCheckDeps = {
    get: async () => new Uint8Array(await jpeg),
    look: async (_sheet, prompt) => {
      prompts.push(prompt)
      return { photos: [
        { n: 1, ok: 'yes', typical: false, note: 'albino form' },
        { n: 2, ok: 'no', typical: false, note: 'a platy' },
        { n: 3, ok: 'yes', typical: true, note: 'adult' },
        { n: 4, ok: 'no', typical: false, note: 'whole tank' },
        { n: 5, ok: 'unsure', typical: false, note: 'too small to tell' },
      ] }
    },
  }
  const out = await checkPagePhotos(...files(r), d, { limit: 10 })
  expect(prompts[0]).toContain('Trigonostigma heteromorpha (Cá tam giác, Harlequin rasbora)')
  expect(out.removed.map(x => x.split(' (')[1])).toEqual(['a platy)', 'whole tank)'])
  const e = JSON.parse(await readFile(join(r, 'content/species/trigonostigma-heteromorpha/entity.json'), 'utf8'))
  // Unsure stays; the typical photo first, the rest in their order.
  expect(e.photos.map((p: { url: string }) => p.url.split('/').pop())).toEqual(['typical.webp', 'pale.webp', 'rare.webp'])
  const rejected = JSON.parse(await readFile(join(r, 'engine-state/_photo-rejected.json'), 'utf8'))
  expect(rejected['https://media.example/platy.webp']).toBe('not Trigonostigma heteromorpha: a platy')

  // Judged once: the next run makes no vision call.
  const again = await checkPagePhotos(...files(r), { ...d, look: async () => { throw new Error('judged twice') } }, { limit: 10 })
  expect(again.judged).toEqual([])
})

test('a usage limit stops the run with nothing lost', async () => {
  const r = await root()
  const out = await checkPagePhotos(...files(r), { get: async () => new Uint8Array(await jpeg), look: async () => { throw new LlmError('usage limit') } }, { limit: 10 })
  expect(out.stopped).toMatch(/usage limit/)
  const e = JSON.parse(await readFile(join(r, 'content/species/trigonostigma-heteromorpha/entity.json'), 'utf8'))
  expect(e.photos).toHaveLength(5)
})
