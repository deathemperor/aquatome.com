import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { OTHER_LANGS } from '@aq/schema/langs'
import { APP_GROUP_LABELS, GROUP_LABELS, groupOptions } from '../src/lib/format'

const read = (path: string) => readFileSync(new URL(path, import.meta.url).pathname, 'utf8')

// The chief of staff, 22 Nov 2026: every group the engine accepts has a name in every language the site serves. The
// model's list (its prompt) and the engine's order table (gbif.ts GROUP_ORDERS) both: on 14 Nov the table took three
// groups the list doesn't have, and the site printed "characins: 8 loài, cách nuôi" as their pages' titles.
test('every species group the engine can assign has a name in Vietnamese and in each served language', () => {
  const prompt = read('../../../packages/engine/src/prompts/process.md')
  const listed = prompt.match(/group: one of ([a-z, ]+)\./)![1]!.split(/,\s*/)
  const table = [...read('../../../packages/engine/src/gbif.ts').split('export const GROUP_ORDERS')[1]!.split('\n}')[0]!.matchAll(/(\w+): \[/g)].map(m => m[1]!)
  expect(listed.length).toBeGreaterThan(10)
  expect(table).toContain('tetras')
  const groups = [...new Set([...listed, ...table])]
  expect(groups.filter(g => !GROUP_LABELS[g])).toEqual([])
  for (const lang of OTHER_LANGS) {
    const words = JSON.parse(read(`../src/i18n/${lang}.json`)) as Record<string, string>
    expect(groups.filter(g => !words[GROUP_LABELS[g] ?? '']?.trim()), lang).toEqual([])
  }
})

// The Writing Lead, 22 Nov 2026: no honest pair of names tells characins from characoids, so they share one, and a reader
// must be able to tell the fish list's options apart: groups with one name are one option (ca/index.astro).
test("every option in the fish list's group filter reads differently, in each served language", () => {
  const options = groupOptions(Object.keys(GROUP_LABELS).sort())
  expect(options).toContainEqual(['characins', 'characoids'])
  // The app has words only for the model's list (app-index.ts): the three groups' fish stay under "other" there, and its
  // "Nhóm cá" row gains no chip, until the owner settles the fold (the chief of staff, 22 Nov 2026).
  const listed = read('../../../packages/engine/src/prompts/process.md').match(/group: one of ([a-z, ]+)\./)![1]!.split(/,\s*/)
  expect(Object.keys(APP_GROUP_LABELS).sort()).toEqual([...listed].sort())
  const names = options.map(gs => GROUP_LABELS[gs[0]!]!)
  expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
  for (const lang of OTHER_LANGS) {
    const words = JSON.parse(read(`../src/i18n/${lang}.json`)) as Record<string, string>
    const shown = names.map(n => words[n])
    expect(shown.filter((n, i) => shown.indexOf(n) !== i), lang).toEqual([])
  }
})
