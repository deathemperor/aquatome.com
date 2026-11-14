import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { boxPhotos, parseSubjects, type Found } from '../src/photo-boxes'

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
    // What the step asks for, in the order it asks: the reads finish last first, as reads side by side may, and `asked`
    // doesn't follow them (2026-11-12, it recorded them as they finished and failed a cycle's tests once).
    find: async (files: string[]): Promise<Found[]> => {
      const urls = await Promise.all(files.map(async (f, i) => {
        await new Promise(r => setTimeout(r, (files.length - i) * 20))
        return readFile(f, 'utf8')
      }))
      asked.push(...urls)
      return urls.map(u => u === 'b-head' ? null : u === 'a-album' ? 'unreadable' : box)
    },
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

test('a batch of Vision\'s answers is taken only whole: a line per image, each a box, null or "unreadable"', () => {
  expect(parseSubjects('{"x":0.1,"y":0.2,"w":0.5,"h":0.4}\nnull\n"unreadable"\n', 3)).toEqual([{ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, null, 'unreadable'])
  // A batch a line short (or long) would put one photo's answer on the next: it throws, and the run records nothing.
  expect(() => parseSubjects('null\nnull', 3)).toThrow(/2 lines for 3 images/)
  expect(() => parseSubjects('null\nnull\nnull\nnull', 3)).toThrow(/4 lines for 3 images/)
  for (const bad of ['false', '{"x":0.1,"y":0.2,"w":0.5}', '{"x":-0.1,"y":0,"w":0.5,"h":0.5}', '{"x":0,"y":0,"w":0,"h":0.5}', '{"x":0,"y":0,"w":1.2,"h":0.5}', '"cat"'])
    expect(() => parseSubjects(bad, 1)).toThrow(/no box/)
})
