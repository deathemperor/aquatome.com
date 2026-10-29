import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { GROUP_LABELS } from '../src/lib/format'

test('every species group the engine can assign has a Vietnamese label', () => {
  const prompt = readFileSync(new URL('../../../packages/engine/src/prompts/process.md', import.meta.url).pathname, 'utf8')
  const groups = prompt.match(/group: one of ([a-z, ]+)\./)![1]!.split(/,\s*/)
  expect(groups.length).toBeGreaterThan(10)
  expect(groups.filter(g => !GROUP_LABELS[g])).toEqual([])
})
