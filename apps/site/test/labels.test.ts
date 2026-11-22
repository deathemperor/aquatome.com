import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { OTHER_LANGS } from '@aq/schema/langs'
import { FORMER_GROUPS, GROUP_LABELS } from '../src/lib/format'

test('every species group the engine can assign has a Vietnamese label', () => {
  const prompt = readFileSync(new URL('../../../packages/engine/src/prompts/process.md', import.meta.url).pathname, 'utf8')
  const groups = prompt.match(/group: one of ([a-z, ]+)\./)![1]!.split(/,\s*/)
  expect(groups.length).toBeGreaterThan(10)
  expect(groups.filter(g => !GROUP_LABELS[g])).toEqual([])
})

// The chief of staff, 22 Nov 2026: every group the engine may assign (its list is the prompt's, gbif.test.ts) has a name in
// every language the site serves, and a page whose group has none fails before it publishes (real-content.test.ts).
test("every group's name is in each served language's words, and each former group forwards to a named one", () => {
  for (const lang of OTHER_LANGS) {
    const words = JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8')) as Record<string, string>
    expect(Object.values(GROUP_LABELS).filter(name => !words[name]?.trim()), lang).toEqual([])
  }
  for (const [from, to] of Object.entries(FORMER_GROUPS)) {
    expect(GROUP_LABELS[from], from).toBeUndefined()
    expect(GROUP_LABELS[to], to).toBeDefined()
  }
})
