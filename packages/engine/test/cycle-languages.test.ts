import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { LANG, OTHER_LANGS, WRITTEN_OTHER_LANGS } from '@aq/schema/langs'

const script = readFileSync(new URL('../../../scripts/engine-cycle.sh', import.meta.url), 'utf8')
const loops = (lang: string) => [...script.matchAll(/for lang in ([a-z -]+); do/g)].map(m => m[1]!.split(' ')).filter(l => l.includes(lang))
const ahead = WRITTEN_OTHER_LANGS.filter(l => !LANG[l].served)

test('the cycle writes every language in the table: the served ones in their loops, the others ahead of them', () => {
  // Written out, as the script has no imports: a row added or flipped in the table fails here until the cycle says how it runs.
  for (const l of OTHER_LANGS) expect(loops(l).length, l).toBeGreaterThan(0)
  for (const l of ahead) expect(loops(l), l).toEqual([[...ahead]])
})

test("Malay's steps: at 10 species a cycle, at the others' pace for the rest, each behind the time gate", () => {
  const from = script.indexOf('for lang in ms; do')
  const block = script.slice(from, script.indexOf('\n  done\n', from))
  expect(block).toContain('localize --lang "$lang" --limit "${LOCALIZE_AHEAD_LIMIT:-10}"')
  for (const step of ['--kind plants --limit "${LOCALIZE_PLANTS_LIMIT:-4}"', 'localize-guides --lang "$lang" --limit "${LOCALIZE_GUIDES_LIMIT:-2}"', 'localize-breeds --lang "$lang" --limit "${LOCALIZE_BREEDS_LIMIT:-2}"', 'localize-captions --lang "$lang" --limit "${LOCALIZE_CAPTIONS_LIMIT:-10}"']) expect(block, step).toContain(step)
  for (const step of ['localize-glossary', 'localize-places', 'localize-equipment', 'wikidata-names', 'shop-names']) expect(block, step).toContain(step)
  for (const line of block.split('\n').filter(l => l.includes('pnpm'))) expect(line.trim(), line).toMatch(/^ahead pnpm /)
})

test('they give first: after everything readers see, before the checks; the gate leaves room for the longest step inside the slot', () => {
  const at = (s: string) => { const i = script.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i }
  expect(at('write-ideas --limit')).toBeLessThan(at('for lang in ms; do'))
  expect(at('scripts/translate-ui.ts /tmp/aq-i18n-missing.json')).toBeLessThan(at('for lang in ms; do'))
  expect(at('for lang in ms; do')).toBeLessThan(at('pnpm engine metric'))
  const gate = Number(/AHEAD_BEFORE_MINUTES:-(\d+)/.exec(script)![1])
  // engine.yml's job `due`: ENGINE_EVERY_MINUTES since the last cycle started, 170 when unset. A longer one leaves more room.
  const nextCycle = 170
  const longestStep = 20
  const buildTestPush = 6
  expect(gate + longestStep + buildTestPush).toBeLessThanOrEqual(nextCycle)
  expect(readFileSync(new URL('../../../.github/workflows/engine.yml', import.meta.url), 'utf8')).toContain(`\${EVERY:-${nextCycle}} * 60`)
})

test("a cycle that changed only UI text still publishes it, or the next would drop it and pay for it again", () => {
  expect(script).toContain('git status --porcelain -- content sources apps/site/src/i18n)" ]; then\n  # Only the engine\'s own records')
  expect(script).toContain('git add content sources engine-state docs/review apps/site/src/i18n')
})

test('their UI text goes first in the block, 500 strings a cycle: it decides when a language can go live, and last it was skipped', () => {
  // Cycles past the gate skipped it from 2026-11-06 23:19, with Malay's UI text at 360 of 1,298 strings.
  const ui = script.indexOf('ahead pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts --unserved --limit "${UI_AHEAD_LIMIT:-500}"')
  expect(ui).toBeGreaterThan(script.indexOf('ahead() {'))
  expect(ui).toBeLessThan(script.indexOf('for lang in ms; do'))
})
