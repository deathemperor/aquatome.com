import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { dropFacePhotos } from '../src/faces'

test('drops photos with a face from every page, checks each URL once, retries download failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fa-'))
  const cache = join(root, 'faces.json')
  await mkdir(join(root, 'species', 'a'), { recursive: true })
  await mkdir(join(root, 'guides', 'g'), { recursive: true })
  await writeFile(join(root, 'species', 'a', 'entity.json'), JSON.stringify({ id: 'a', photos: [{ url: 'fish' }, { url: 'person' }, { url: 'down' }] }))
  await writeFile(join(root, 'guides', 'g', 'entity.json'), JSON.stringify({ id: 'g', photos: [{ url: 'person' }] }))
  const fetched: string[] = []
  const deps = {
    get: async (u: string) => { fetched.push(u); if (u === 'down') throw new Error('404'); return new TextEncoder().encode(u) },
    detect: async (files: string[]) => Promise.all(files.map(async f => ((await readFile(f, 'utf8')) === 'person' ? 2 : 0))),
  }
  const r = await dropFacePhotos(root, cache, deps)
  expect(r).toMatchObject({ checked: 2, removed: ['species/a/entity.json: person', 'guides/g/entity.json: person'] })
  expect(r.failed[0]).toContain('down')
  expect(JSON.parse(await readFile(join(root, 'species', 'a', 'entity.json'), 'utf8')).photos).toEqual([{ url: 'fish' }, { url: 'down' }])
  expect(JSON.parse(await readFile(join(root, 'guides', 'g', 'entity.json'), 'utf8')).photos).toEqual([])
  expect(JSON.parse(await readFile(cache, 'utf8'))).toEqual({ fish: 0, person: 2 })

  // Next cycle: the engine re-adds the face photo; it is dropped again from the cache without re-downloading.
  await writeFile(join(root, 'guides', 'g', 'entity.json'), JSON.stringify({ id: 'g', photos: [{ url: 'person' }] }))
  fetched.length = 0
  const r2 = await dropFacePhotos(root, cache, deps)
  expect(fetched).toEqual(['down'])
  expect(r2.removed).toEqual(['guides/g/entity.json: person'])
})

test('photos the owner rejected are dropped every cycle without being screened', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fr-'))
  await mkdir(join(root, 'guides', 'g'), { recursive: true })
  const page = join(root, 'guides', 'g', 'entity.json')
  await writeFile(page, JSON.stringify({ id: 'g', photos: [{ url: 'fish' }, { url: 'packshot' }] }))
  await writeFile(join(root, 'rejected.json'), JSON.stringify({ packshot: 'product packshot' }))
  const fetched: string[] = []
  const deps = { get: async (u: string) => { fetched.push(u); return new TextEncoder().encode(u) }, detect: async (fs: string[]) => fs.map(() => 0) }
  const r = await dropFacePhotos(root, join(root, 'faces.json'), deps, join(root, 'rejected.json'))
  expect(r.removed).toEqual(['guides/g/entity.json: packshot'])
  expect(fetched).toEqual(['fish'])
  expect(JSON.parse(await readFile(page, 'utf8')).photos).toEqual([{ url: 'fish' }])
})

test("a video section's photo the owner rejected leaves its section every cycle; the section's stills stay", async () => {
  const root = await mkdtemp(join(tmpdir(), 'fv-'))
  await mkdir(join(root, 'guides', 'v'), { recursive: true })
  const page = join(root, 'guides', 'v', 'entity.json')
  const figures = [{ heading: 'A', moments: [{ t: 1 }], photo: { url: 'statue' } }, { heading: 'B', moments: [], photo: { url: 'tank' } }]
  await writeFile(page, JSON.stringify({ id: 'v', photos: [], video: { figures } }))
  await writeFile(join(root, 'rejected.json'), JSON.stringify({ statue: 'a human figure' }))
  const deps = { get: async (u: string) => new TextEncoder().encode(u), detect: async (fs: string[]) => fs.map(() => 0) }
  const r = await dropFacePhotos(root, join(root, 'faces.json'), deps, join(root, 'rejected.json'))
  expect(r.removed).toEqual(['guides/v/entity.json: statue'])
  expect(JSON.parse(await readFile(page, 'utf8')).video.figures).toEqual([{ heading: 'A', moments: [{ t: 1 }] }, { heading: 'B', moments: [], photo: { url: 'tank' } }])
})

test("a face on a page's last photo: it stays, held for a second look (last-photo.ts); one the look cleared stays though the page gains another", async () => {
  // The chief of staff, 2026-11-14: a page's last photo doesn't come off on an automatic check's word alone.
  const root = await mkdtemp(join(tmpdir(), 'fl-'))
  const content = join(root, 'content')
  await mkdir(join(content, 'species', 'a'), { recursive: true })
  await mkdir(join(content, 'species', 'b'), { recursive: true })
  await writeFile(join(content, 'species', 'a', 'entity.json'), JSON.stringify({ id: 'a', photos: [{ url: 'person' }] }))
  await writeFile(join(content, 'species', 'b', 'entity.json'), JSON.stringify({ id: 'b', photos: [{ url: 'fish' }, { url: 'hand' }] }))
  const deps = { get: async (u: string) => new TextEncoder().encode(u), detect: async (files: string[]) => Promise.all(files.map(async f => (['person', 'hand'].includes(await readFile(f, 'utf8')) ? 1 : 0))) }
  const r = await dropFacePhotos(content, join(root, 'faces.json'), deps, undefined, root)
  expect(r.removed).toEqual(['species/b/entity.json: hand'])
  expect(r.held).toEqual(['person: species/a'])
  expect(JSON.parse(await readFile(join(content, 'species', 'a', 'entity.json'), 'utf8')).photos).toEqual([{ url: 'person' }])
  const file = join(root, 'engine-state', '_photo-second-look.json')
  const look = JSON.parse(await readFile(file, 'utf8'))
  expect(look.person).toMatchObject({ step: 'face detection', pages: ['species/a'] })
  look.person.look = { said: 'clear', by: 'Photo sourcing', on: '2026-11-14' }
  await writeFile(file, JSON.stringify(look))
  await writeFile(join(content, 'species', 'a', 'entity.json'), JSON.stringify({ id: 'a', photos: [{ url: 'person' }, { url: 'fish' }] }))
  const again = await dropFacePhotos(content, join(root, 'faces.json'), deps, undefined, root)
  expect(again.removed).toEqual([])
  expect(JSON.parse(await readFile(join(content, 'species', 'a', 'entity.json'), 'utf8')).photos).toEqual([{ url: 'person' }, { url: 'fish' }])
})
