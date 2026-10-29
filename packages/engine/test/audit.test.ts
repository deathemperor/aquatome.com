import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { auditPictures } from '../src/audit'

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
