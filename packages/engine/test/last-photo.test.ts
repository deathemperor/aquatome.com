import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { holdForSecondLook, lastPhotos, looks, readSecondLook } from '../src/last-photo'

// A page's last photo doesn't come off on an automatic check's word alone (the chief of staff, 2026-11-14).

test('a page is left with nothing when its own photos would all go, or, with none of its own, its album would', () => {
  const pages = [
    { ref: 'species/one', own: ['a'], album: ['x'] }, // its only own photo goes: held, though the album stays
    { ref: 'species/two', own: ['a', 'b'], album: [] }, // keeps b: nothing held
    { ref: 'species/album', own: [], album: ['c', 'd'] }, // none of its own, its album would go whole: both held
    { ref: 'species/half', own: [], album: ['c', 'e'] }, // keeps e
    { ref: 'species/empty', own: [], album: [] },
  ]
  const off = new Set(['a', 'c', 'd', 'x'])
  expect(Object.fromEntries(lastPhotos(pages, u => off.has(u)))).toEqual({ a: ['species/one'], c: ['species/album'], d: ['species/album'] })
  // What goes may differ by page.
  expect(Object.fromEntries(lastPhotos(pages, (u, ref) => u === 'b' && ref === 'species/two'))).toEqual({})
})

test('the record: an entry already there keeps its look; a look that is not well formed is no answer; one that cannot be read stops the step', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-second-look-'))
  await holdForSecondLook(root, new Map([['u1', { why: 'dead: a model note', pages: ['species/a'] }]]), 'the dead-fish screen', '2026-11-14')
  const file = join(root, 'engine-state/_photo-second-look.json')
  const first = JSON.parse(await readFile(file, 'utf8'))
  expect(first.u1).toEqual({ why: expect.stringMatching(/^dead: withheld \[sha256:[0-9a-f]{64}\]$/), step: 'the dead-fish screen', pages: ['species/a'], at: '2026-11-14' })
  expect(JSON.stringify(first)).not.toContain('a model note')
  first.u1.look = { said: 'clear', by: 'Photo sourcing', on: '2026-11-14' }
  first.u2 = { ...first.u1, look: { said: 'yes', by: 'Photo sourcing', on: '2026-11-14' } }
  first.u3 = { ...first.u1, look: { said: 'agree', by: '', on: '2026-11-14' } }
  await writeFile(file, JSON.stringify(first))
  await holdForSecondLook(root, new Map([['u1', { why: 'watermark: logo', pages: ['species/b'] }]]), 'the watermark screen')
  const sl = await readSecondLook(root)
  expect(sl.u1!.look).toEqual({ said: 'clear', by: 'Photo sourcing', on: '2026-11-14' })
  const l = looks(sl)
  expect([l.cleared('u1'), l.waiting('u2'), l.waiting('u3'), l.open('u2'), l.open('u4')]).toEqual([true, true, true, false, true])
  await writeFile(file, '{"u1": ')
  await expect(readSecondLook(root)).rejects.toThrow()
})
