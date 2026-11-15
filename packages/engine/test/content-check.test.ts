import { cp, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { checkContent } from '../src/content-check'

// The chief of staff, 15 Nov 2026: a sweep that changed only the pages' dates is pushed without the tests once the merged
// content loads as the tests that load the real content load it (swept_clean, cycle-checks.sh).
test('the content check passes content that loads in every language, and fails what the loader refuses', async () => {
  const root = join(await mkdtemp(join(tmpdir(), 'content-check-')), 'content')
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), root, { recursive: true })
  expect(await checkContent(root)).toBeGreaterThan(0)
  // A page's file off its format, as a merge could leave it.
  const [id = ''] = await readdir(join(root, 'species'))
  await writeFile(join(root, 'species', id, 'entity.json'), '{}')
  await expect(checkContent(root)).rejects.toThrow(/Invalid content file/)
  // No dates, which the loader takes and a sweep never leaves.
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), root, { recursive: true })
  expect(await checkContent(root)).toBeGreaterThan(0)
  await rm(join(root, 'page-dates.json'))
  await expect(checkContent(root)).rejects.toThrow()
})
