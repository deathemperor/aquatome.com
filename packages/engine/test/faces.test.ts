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
