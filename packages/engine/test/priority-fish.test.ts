import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { galleryPlan } from '../src/gallery-plan'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'
import { PRIORITY_UNTIL, priorityFish } from '../src/priority-fish'

const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string, o: object = {}) => ({ url: url(n), thumb: url(`${n}-480`), width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x', ...o })

/** Two staples and a fish no list names, each with one photo of its own; `album` photos for the last. */
async function root(album: object[] = [], list: Record<string, unknown> = { 'species/zzz-liked': '2026-11-14' }) {
  const r = await mkdtemp(join(tmpdir(), 'aq-priority-'))
  for (const id of ['betta-splendens', 'danio-rerio', 'zzz-liked']) {
    await mkdir(join(r, 'content/species', id), { recursive: true })
    await writeFile(join(r, 'content/species', id, 'entity.json'), JSON.stringify({ id, scientificName: id.replace('-', ' '), photos: [photo(id)], sections: [{ source: 'seriouslyfish' }] }))
    await writeFile(join(r, 'content/species', id, 'vi.json'), JSON.stringify({ name: id }))
  }
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await writeFile(join(r, 'content/gallery/zzz-liked.json'), JSON.stringify({ id: 'zzz-liked', photos: album, seen: 0, updatedAt: '' }))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await writeFile(join(r, 'engine-state/_priority-fish.json'), JSON.stringify(list))
  return r
}
const ids = async (r: string) => (await galleryPlan(r)).map(p => p.id)
const checked = (n: number) => Array.from({ length: n }, (_, i) => photo(`a${i}`))

test('the album step takes a priority fish first, ahead of the staples, until its album holds six checked photos', async () => {
  expect(await ids(await root())).toEqual(['zzz-liked', 'betta-splendens', 'danio-rerio'])
  expect(await ids(await root(checked(PRIORITY_UNTIL - 1)))).toEqual(['zzz-liked', 'betta-splendens', 'danio-rerio'])
  // Photos waiting for the photo check and AI pictures don't count.
  expect(await ids(await root([...checked(PRIORITY_UNTIL - 1), photo('waits', { unchecked: true }), photo('ai', { generated: { by: 'x', on: '2026-11-15' } })]))).toEqual(['zzz-liked', 'betta-splendens', 'danio-rerio'])
  // Six checked: back in its own place.
  expect(await ids(await root(checked(PRIORITY_UNTIL)))).toEqual(['betta-splendens', 'danio-rerio', 'zzz-liked'])
})

test('oldest day first; a malformed line is left out; no list, no change', async () => {
  const r = await root([], { 'species/zzz-liked': '2026-11-14', 'species/danio-rerio': '2026-11-10', 'species/Bad Id': '2026-11-01', 'species/betta-splendens': 'yesterday' })
  expect(await priorityFish(r)).toEqual(['species/danio-rerio', 'species/zzz-liked'])
  expect(await ids(r)).toEqual(['danio-rerio', 'zzz-liked', 'betta-splendens'])
  expect(await ids(await root([], {}))).toEqual(['betta-splendens', 'danio-rerio', 'zzz-liked'])
})

test('the photo check judges a priority fish first', async () => {
  const r = await root()
  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
  const sheets: string[][] = []
  let fetched: string[] = []
  const d: PhotoCheckDeps = {
    get: async u => { fetched.push(u.split('/').pop()!.replace('.webp', '')); return new Uint8Array(jpeg) },
    look: async () => { sheets.push(fetched); const photos = fetched.map((_, i) => ({ n: i + 1, ok: 'yes', typical: true, note: 'x' }) as { n: number } & PhotoVerdict); fetched = []; return { photos } },
  }
  await checkPagePhotos(r, d, { limit: 1, emptyCap: 99 })
  expect(sheets[0]![0]).toBe('zzz-liked')
})

test('the committed list holds only pages that exist, each with a day', async () => {
  const list = JSON.parse(await readFile(new URL('../../../engine-state/_priority-fish.json', import.meta.url), 'utf8')) as Record<string, string>
  for (const [ref, day] of Object.entries(list)) {
    expect(ref).toMatch(/^(species|plants|breeds)\/[a-z0-9-]+$/)
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await access(new URL(`../../../content/${ref}/entity.json`, import.meta.url))
  }
})
