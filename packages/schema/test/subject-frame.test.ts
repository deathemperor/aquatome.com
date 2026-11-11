import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll, PHOTO_BOXES_FILE, SUBJECT_CUT, SUBJECT_FRAMES, subjectFrame, subjectPixels, type PixelBox, type SubjectFrame } from '../src/index'

const fixture = fileURLToPath(new URL('./fixtures/store', import.meta.url))
const centred = { fit: 'cover', x: 0.5, y: 0.5 }
const at = (f: SubjectFrame, x: number, y: number) => {
  expect(f.fit).toBe('cover')
  if (f.fit === 'cover') { expect(f.x).toBeCloseTo(x, 6); expect(f.y).toBeCloseTo(y, 6) }
}
const wide = (subject?: PixelBox) => ({ width: 1600, height: 900, subject })

test('a photo with no box is centred, as today, never whole; so is one whose box does not fit it', () => {
  expect(subjectFrame(wide(), 4 / 3)).toEqual(centred)
  expect(subjectFrame(wide({ x0: 0, y0: 0, x1: 1700, y1: 900 }), 4 / 3)).toEqual(centred)
  expect(subjectFrame(wide({ x0: 10, y0: 0, x1: 10, y1: 900 }), 4 / 3)).toEqual(centred)
})

test('a fish the centred window holds stays centred; a frame of the photo\'s own shape cuts nothing', () => {
  // 1600×900 at 4:3: the window is 1200 wide, 200 to 1400.
  expect(subjectFrame(wide({ x0: 300, y0: 100, x1: 1300, y1: 800 }), 4 / 3)).toEqual(centred)
  at(subjectFrame({ width: 1200, height: 900, subject: { x0: 0, y0: 0, x1: 1200, y1: 900 } }, 4 / 3), 0.5, 0.5)
})

test('up to SUBJECT_CUT of the fish lost reads as whole: exactly that stays centred, a little more moves onto the fish', () => {
  expect(SUBJECT_CUT).toBe(0.05)
  // 1000×1000 at 2:1: the window is 500 tall, 250 to 750. A fish 500 tall starting 25 above it loses 25/500, 5%.
  expect(subjectFrame({ width: 1000, height: 1000, subject: { x0: 0, y0: 225, x1: 1000, y1: 725 } }, 2)).toEqual(centred)
  // 26 above loses 5.2%: the window moves to 224 to 724, and loses none.
  at(subjectFrame({ width: 1000, height: 1000, subject: { x0: 0, y0: 224, x1: 1000, y1: 724 } }, 2), 0.5, 224 / 500)
})

test('a crop moved onto the fish mends what the centred one cuts, held inside the photo', () => {
  // A fish from 100 to 1150 loses 100 of 1050 (9.5%) centred; a window from 25 to 1225 holds it: 25 of the 400 it can move.
  at(subjectFrame(wide({ x0: 100, y0: 200, x1: 1150, y1: 700 }), 4 / 3), 25 / 400, 0.5)
  // A fish at the photo's left edge: the window goes as far left as it can.
  at(subjectFrame(wide({ x0: 0, y0: 200, x1: 1000, y1: 700 }), 4 / 3), 0, 0.5)
  // A tall photo, 600×900 at 4:3: the window is 450 tall; a fish near the top takes it to the top.
  at(subjectFrame({ width: 600, height: 900, subject: { x0: 100, y0: 50, x1: 500, y1: 300 } }, 4 / 3), 0.5, 0)
})

test('a fish longer than the frame by more than SUBJECT_CUT shows whole', () => {
  // The banner, about 1.13: 1017 of the 1600 across. A fish 1,400 long loses 27% wherever the window goes.
  expect(subjectFrame(wide({ x0: 100, y0: 300, x1: 1500, y1: 600 }), 1.13)).toEqual({ fit: 'whole' })
  // The same fish in a 16:9 frame isn't cut at all.
  expect(subjectFrame(wide({ x0: 100, y0: 300, x1: 1500, y1: 600 }), 16 / 9)).toEqual(centred)
})

test('the record\'s fractions become the photo\'s pixels, rounded outward and kept inside it', () => {
  expect(subjectPixels({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, 1000, 600)).toEqual({ x0: 100, y0: 120, x1: 600, y1: 360 })
  expect(subjectPixels({ x: 0.1234, y: 0, w: 0.5, h: 1 }, 1000, 600)).toEqual({ x0: 123, y0: 0, x1: 624, y1: 600 })
  expect(subjectPixels({ x: 0.9, y: 0, w: 0.2, h: 1 }, 1000, 600)).toEqual({ x0: 900, y0: 0, x1: 1000, y1: 600 })
  expect(subjectPixels({ x: 0.5, y: 0.5, w: 0, h: 0.2 }, 1000, 600)).toBeUndefined()
})

test('the loader gives a photo its box only with the switch on, from the record alone', async () => {
  const site = await mkdtemp(join(tmpdir(), 'aq-boxes-'))
  const store = join(site, 'content')
  await cp(fixture, store, { recursive: true })
  const file = join(store, 'species', 'alpha', 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  // Content never carries a box: one written there is dropped.
  e.photos[0].subject = { x0: 1, y0: 1, x1: 2, y1: 2 }
  await writeFile(file, JSON.stringify(e))
  const album = { url: 'https://media.test/commons/album.webp', width: 1200, height: 800, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://x/album' }
  await mkdir(join(store, 'gallery'))
  await writeFile(join(store, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', seen: 1, updatedAt: '2026-11-12', photos: [album] }))
  await mkdir(join(site, 'engine-state'))
  await writeFile(join(site, 'engine-state', PHOTO_BOXES_FILE), JSON.stringify({
    'https://x/ok.jpg': { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    'https://media.test/seriouslyfish/a.webp': null,
    [album.url]: { x: 0, y: 0.1, w: 1, h: 0.8 },
  }))
  const boxes = async (on?: boolean) => {
    const c = await loadAll({ root: store, lang: 'vi', publicBuild: false, ...(on === undefined ? {} : { subjectFrames: on }) })
    return [...c.species.find(s => s.id === 'alpha')!.photos, ...c.galleries.alpha!].map(p => [p.url, p.subject])
  }
  // Off by default, until the owner has seen the Design Lead's "whole".
  expect(SUBJECT_FRAMES).toBe(false)
  for (const off of [await boxes(), await boxes(false)]) expect(off.every(([, s]) => s === undefined)).toBe(true)
  // On: the page's and the album's photos in their own pixels; none where it found no animal or hasn't boxed the photo.
  expect(await boxes(true)).toEqual([
    ['https://x/ok.jpg', { x0: 240, y0: 160, x1: 720, y1: 480 }],
    ['https://media.test/seriouslyfish/a.webp', undefined],
    ['https://media.test/glaser/b.webp', undefined],
    [album.url, { x0: 0, y0: 80, x1: 1200, y1: 720 }],
  ])
})
