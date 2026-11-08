import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { seedGalleries } from '../src/gallery-seed'

const cand = (key: string, o: Record<string, unknown> = {}) => ({ key, url: `https://x.test/${key}.jpg`, width: 2000, height: 1500, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x.test/page/${key}`, ...o })

test("candidates found by hand go to the front of a page's gallery queue; known, shown, rejected or unlicensed ones don't", async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-seed-'))
  for (const d of ['content/species/a-fish', 'content/breeds/a-breed', 'content/gallery', 'engine-state/gallery']) await mkdir(join(root, d), { recursive: true })
  await writeFile(join(root, 'content/species/a-fish/entity.json'), JSON.stringify({ id: 'a-fish', photos: [{ url: 'https://x.test/shown.jpg', sourceUrl: 'https://x.test/page/shown' }] }))
  await writeFile(join(root, 'content/breeds/a-breed/entity.json'), JSON.stringify({ id: 'a-breed', photos: [] }))
  await writeFile(join(root, 'engine-state/gallery/a-fish.json'), JSON.stringify({ queue: [cand('inat:9')], judged: ['inat:1'], hashes: {}, exhausted: '2026-11-01' }))
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ 'https://x.test/inat:4.jpg': 'a person' }))
  const r = await seedGalleries(root, {
    'a-fish': [cand('inat:1'), cand('inat:2'), cand('inat:9'), cand('shown'), cand('inat:4'), cand('inat:5', { licence: 'CC BY-NC 4.0' }), { key: 'bad' }, cand('File:A.jpg'), cand('inat:2')],
    'a-breed': [cand('File:B.jpg')],
    'no-such-page': [cand('inat:7')],
  })
  expect(r).toEqual({ pages: 2, added: 3, skipped: 6, unknown: ['no-such-page'], invalid: 1 })
  const st = JSON.parse(await readFile(join(root, 'engine-state/gallery/a-fish.json'), 'utf8'))
  expect(st.queue.map((c: { key: string }) => c.key)).toEqual(['inat:2', 'File:A.jpg', 'inat:9'])
  // Its sources ran dry before: tried again now it has something to screen.
  expect(st.exhausted).toBeUndefined()
  expect(JSON.parse(await readFile(join(root, 'engine-state/gallery/a-breed.json'), 'utf8'))).toMatchObject({ queue: [{ key: 'File:B.jpg' }], judged: [] })
  // Again: nothing new.
  expect((await seedGalleries(root, { 'a-fish': [cand('inat:2')] })).added).toBe(0)
})
