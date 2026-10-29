import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { backfillThumbs } from '../src/thumbs'

test('makes missing thumbs for R2 photos, records them on every page, leaves failures unmarked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'th-'))
  await mkdir(join(root, 'species', 'a'), { recursive: true })
  await mkdir(join(root, 'guides', 'g'), { recursive: true })
  const M = 'https://media.aquatome.com/seriouslyfish/'
  await writeFile(join(root, 'species', 'a', 'entity.json'), JSON.stringify({ photos: [{ url: `${M}1.webp` }, { url: `${M}2.webp` }, { url: 'https://thumb.wikimedia.org/x/960px-F.jpg' }] }))
  await writeFile(join(root, 'guides', 'g', 'entity.json'), JSON.stringify({ photos: [{ url: `${M}1.webp` }, { url: `${M}3.webp` }] }))
  const put: string[] = []
  const r = await backfillThumbs(root, {
    exists: async u => u.endsWith('2-480.webp'),
    get: async u => { if (u.endsWith('3.webp')) throw new Error('404'); return new Uint8Array([1]) },
    putThumb: async k => { put.push(k) },
  })
  expect(r).toMatchObject({ checked: 3, made: 1 })
  expect(put).toEqual(['seriouslyfish/1.webp'])
  expect(r.failed[0]).toContain('3.webp')
  const a = JSON.parse(await readFile(join(root, 'species', 'a', 'entity.json'), 'utf8'))
  expect(a.photos.map((p: { thumb?: string }) => p.thumb)).toEqual([`${M}1-480.webp`, `${M}2-480.webp`, 'https://thumb.wikimedia.org/x/500px-F.jpg'])
  const g = JSON.parse(await readFile(join(root, 'guides', 'g', 'entity.json'), 'utf8'))
  expect(g.photos.map((p: { thumb?: string }) => p.thumb)).toEqual([`${M}1-480.webp`, undefined])
})
