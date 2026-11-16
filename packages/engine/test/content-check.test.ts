import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { checkContent } from '../src/content-check'

const FIXTURE = new URL('../../../apps/site/test/fixture-content', import.meta.url)
const fresh = async () => {
  const root = join(await mkdtemp(join(tmpdir(), 'content-check-')), 'content')
  await cp(FIXTURE, root, { recursive: true })
  return root
}
const edit = async (file: string, change: (json: Record<string, unknown>) => void) => {
  const json = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
  change(json)
  await writeFile(file, JSON.stringify(json))
}

// The chief of staff, 15 Nov 2026: a sweep that changed only the pages' dates is pushed without the tests once the merged
// content loads through the site's loader (swept_clean, cycle-checks.sh).
test('the content check passes content that loads in every language, and fails what the loader refuses', async () => {
  expect(await checkContent(await fresh())).toBeGreaterThan(0)
  // What a merge could leave: a page's file off its format, in Vietnamese and in a language after it; a breed at a
  // species' address; no dates, which the loader takes and a sweep never leaves.
  const breaks: [string, (root: string) => Promise<unknown>, RegExp][] = [
    ['an entity', r => writeFile(join(r, 'species/apistogramma-cacatuoides/entity.json'), '{}'), /Invalid content file/],
    ['a Malay page', r => writeFile(join(r, 'species/apistogramma-cacatuoides/ms.json'), '{}'), /Invalid content file .*ms\.json/],
    ['a breed at a species\' address', r => edit(join(r, 'breeds/flowerhorn-cichlid/vi.json'), j => { j.slug = 'ca-apisto-cacatuoides' }), /is already a species/],
    ['no dates', r => rm(join(r, 'page-dates.json')), /page-dates\.json/],
  ]
  for (const [what, make, why] of breaks) {
    const root = await fresh()
    await make(root)
    await expect(checkContent(root), what).rejects.toThrow(why)
  }
})
