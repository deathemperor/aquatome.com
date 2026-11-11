import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { boxPhotos, type Found } from '../src/photo-boxes'

const page = async (root: string, kind: string, id: string, photos: string[], album: { url: string; unchecked?: boolean }[] = []) => {
  await mkdir(join(root, kind, id), { recursive: true })
  await writeFile(join(root, kind, id, 'entity.json'), JSON.stringify({ id, photos: photos.map(url => ({ url })) }))
  if (album.length) await mkdir(join(root, 'gallery'), { recursive: true }).then(() => writeFile(join(root, 'gallery', `${id}.json`), JSON.stringify({ id, photos: album })))
}

test('boxes heads first, then pages\' other photos, then albums; records none as null; retries what failed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boxes-'))
  const record = join(root, 'boxes.json')
  await page(root, 'species', 'a', ['a-head', 'a-2'], [{ url: 'a-album' }, { url: 'a-waits', unchecked: true }])
  await page(root, 'breeds', 'b', ['b-head'])
  await page(root, 'plants', 'p', ['plant'])
  const box = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }
  const asked: string[] = []
  const deps = {
    get: async (u: string) => { if (u === 'a-2') throw new Error('HTTP 404'); return new TextEncoder().encode(u) },
    find: async (files: string[]): Promise<Found[]> => Promise.all(files.map(async f => {
      const u = await readFile(f, 'utf8'); asked.push(u)
      return u === 'b-head' ? null : u === 'a-album' ? 'unreadable' : box
    })),
  }
  // Two a run: the heads, in page order.
  expect(await boxPhotos(root, record, deps, { limit: 2 })).toEqual({ boxed: 1, none: 1, left: 2, failed: [] })
  expect(asked).toEqual(['a-head', 'b-head'])
  expect(JSON.parse(await readFile(record, 'utf8'))).toEqual({ 'a-head': box, 'b-head': null })
  // Then the rest: a photo that can't be fetched or read isn't recorded, so the next run tries it again. A plant's photo
  // and one the photo check hasn't judged are never asked.
  const r = await boxPhotos(root, record, deps, { limit: 10 })
  expect(r).toMatchObject({ boxed: 0, none: 0, left: 0 })
  expect(r.failed).toEqual(['a-2: HTTP 404', 'a-album: unreadable'])
  expect(asked).toEqual(['a-head', 'b-head', 'a-album'])
  expect(Object.keys(JSON.parse(await readFile(record, 'utf8')))).toEqual(['a-head', 'b-head'])
})
