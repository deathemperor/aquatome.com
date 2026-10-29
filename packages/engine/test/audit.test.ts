import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { auditPictures, sameName } from '../src/audit'

test('lists pages with no photo, photos without thumbs, and a single photo', async () => {
  const root = await mkdtemp(join(tmpdir(), 'au-'))
  const page = async (kind: string, id: string, photos: object[]) => {
    await mkdir(join(root, kind, id), { recursive: true })
    await writeFile(join(root, kind, id, 'entity.json'), JSON.stringify({ photos }))
    await writeFile(join(root, kind, id, 'vi.json'), JSON.stringify({ name: `Tên ${id}` }))
  }
  await page('species', 'a', [])
  await page('species', 'b', [{ url: 'x' }, { url: 'y', thumb: 't' }])
  await page('guides', 'g', [{ url: 'z', thumb: 't' }])
  const { rows, markdown } = await auditPictures(root)
  expect(rows).toHaveLength(3)
  expect(markdown).toContain('## No photo (1)\n\n- species/a — Tên a')
  expect(markdown).toContain('## Photos without a card thumbnail (1)\n\n- species/b — Tên b')
  expect(markdown).toContain('## Only one photo (no pictures inside the text) (1)\n\n- guides/g — Tên g')
})

test('lists species our pages name without a page: queued on a source first, then those no source has', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aw-'))
  await writeFile(join(root, 'wanted.json'), JSON.stringify({
    'synodontis-lucipinnis': { name: 'Synodontis lucipinnis', mentions: 2, mentionedIn: ['guides/a', 'guides/b'], onSource: 'https://www.seriouslyfish.com/species/synodontis-lucipinnis/' },
    'garra-rara': { name: 'Garra rara', mentions: 1, mentionedIn: ['species/x'] },
  }))
  const { markdown } = await auditPictures(root, join(root, 'wanted.json'))
  expect(markdown).toContain('queued on a source (1)\n\n- Synodontis lucipinnis — named on 2 pages (guides/a, guides/b) — queued first: https://www.seriouslyfish.com/species/synodontis-lucipinnis/')
  expect(markdown).toContain('no source has it (1)\n\n- Garra rara — named on 1 page (species/x)')
})

test('flags species sharing a Vietnamese name, not guides', () => {
  const row = (page: string, name: string) => ({ page, name, photos: 1, missingThumbs: 0 })
  const rows = [row('species/a', 'Cá neon xanh'), row('species/b', 'cá neon xanh'), row('species/c', 'Cá đĩa'), row('plants/a', 'Cá neon xanh'), row('guides/x', 'Cá đĩa'), row('guides/y', 'Cá đĩa')]
  expect(sameName(rows).map(r => r.page)).toEqual(['species/a', 'species/b'])
})
