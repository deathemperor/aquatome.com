import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { LANG, OTHER_LANGS, WRITTEN_OTHER_LANGS } from '@aq/schema/langs'
import { RECHECK_LANGS } from '../src/localize-recheck'

const script = readFileSync(new URL('../../../scripts/engine-cycle.sh', import.meta.url), 'utf8')
const loops = (lang: string) => [...script.matchAll(/for lang in ([a-z -]+); do/g)].map(m => m[1]!.split(' ')).filter(l => l.includes(lang))
const ahead = WRITTEN_OTHER_LANGS.filter(l => !LANG[l].served)

test('the cycle writes every language in the table: the served ones in their loops, the others ahead of them', () => {
  // Written out, as the script has no imports: a row added or flipped in the table fails here until the cycle says how it runs.
  for (const l of OTHER_LANGS) expect(loops(l).length, l).toBeGreaterThan(0)
  for (const l of ahead) expect(loops(l), l).toEqual([[...ahead]])
})

test("Malay's steps: 10 species a cycle right after Indonesian and Thai, never gated; the rest at the others' pace, each behind the time gate", () => {
  // The chief of staff, 2026-11-11: Malay's ten are not skipped. Behind the gate after an hour of Indonesian and Thai,
  // they would be on most days.
  const species = 'pnpm engine localize --lang ms --limit "${LOCALIZE_AHEAD_LIMIT:-10}" || log "localize ms: failed"'
  const idth = script.indexOf('for lang in id th; do pnpm engine localize --lang "$lang" --limit "${LOCALIZE_LIMIT:-20}"')
  expect(script.indexOf(species)).toBeGreaterThan(idth)
  // Nothing but comments between them.
  expect(script.slice(idth, script.indexOf(species)).split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))).toHaveLength(1)
  const from = script.indexOf('for lang in ms; do')
  const block = script.slice(from, script.indexOf('\n  done\n', from))
  expect(block).not.toContain('localize --lang "$lang" --limit')
  for (const step of ['--kind plants --limit "${LOCALIZE_PLANTS_LIMIT:-4}"', 'localize-guides --lang "$lang" --limit "${LOCALIZE_GUIDES_LIMIT:-2}"', 'localize-breeds --lang "$lang" --limit "${LOCALIZE_BREEDS_LIMIT:-2}"', 'localize-captions --lang "$lang" --limit "${LOCALIZE_CAPTIONS_LIMIT:-10}"']) expect(block, step).toContain(step)
  for (const step of ['localize-glossary', 'localize-places', 'localize-equipment', 'wikidata-names', 'shop-names']) expect(block, step).toContain(step)
  for (const line of block.split('\n').filter(l => l.includes('pnpm'))) expect(line.trim(), line).toMatch(/^ahead pnpm /)
})

test('the pages out of search for their score are read again on two models, Indonesian and Thai, after the other translations and gated as they are', () => {
  // The chief of staff, 16 Nov 2026: a page comes back on two fresh reads on two models, Indonesian and Thai fish pages
  // only. Up to six model calls a page: a long cycle gives it first, and it starts no page after 15 minutes, inside the
  // 20 a gated step is allowed (the test below).
  const from = script.indexOf('for lang in ms; do')
  const malay = script.indexOf('\n  done\n', from)
  const recheck = script.indexOf('do ahead pnpm engine recheck --lang "$lang" --limit "${RECHECK_LIMIT:-15}" --max-minutes "${RECHECK_MINUTES:-15}"')
  expect(from).toBeGreaterThan(-1)
  expect(recheck).toBeGreaterThan(malay)
  expect(recheck).toBeLessThan(script.indexOf('pnpm engine judge-places'))
  // Nothing but comments between Malay's steps and it, and the two languages its rule was measured on.
  const line = script.lastIndexOf('\n', recheck)
  expect(script.slice(malay + '\n  done\n'.length, line).split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))).toEqual([])
  expect(script.slice(line + 1, recheck).trim()).toBe(`for lang in ${RECHECK_LANGS.join(' ')};`)
})

test('the rewrite part spends on the Vietnamese rewrite and every translation first, Malay inside them, then the rest; a gated step started at the gate ends inside the job', () => {
  const at = (s: string) => { const i = script.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i }
  // The chief of staff, 2026-11-11: the rewrites and translations go before any other step spends, so a sign-in that runs
  // out part way, or a step's ceiling, takes the steps after them; Malay's ten species run ungated (the test above).
  const part = script.slice(at('if part rewrite; then'), at('pnpm engine ungarble'))
  const steps = [...part.matchAll(/^\s*(?:for [^;]+; do )?(?:ahead )?pnpm engine ([a-z-]+)/gm)].map(m => m[1]!)
  expect(steps[0]).toBe('rewrite-vi')
  const lastTranslation = steps.lastIndexOf('localize-cards')
  expect(steps.slice(1, lastTranslation + 1).every(s => /^(localize|wikidata-names|shop-names|name-places-vi)/.test(s)), steps.join(' ')).toBe(true)
  for (const later of ['forum', 'ideas', 'range', 'water', 'breed-care', 'planting', 'review-backfill', 'topic-check', 'reader', 'write-ideas']) expect(steps.indexOf(later), later).toBeGreaterThan(lastTranslation)
  expect(at('scripts/translate-ui.ts /tmp/aq-i18n-missing.json')).toBeLessThan(at('for lang in ms; do'))
  expect(at('for lang in ms; do')).toBeLessThan(at('pnpm engine range'))
  expect(at('for lang in ms; do')).toBeLessThan(at('pnpm engine metric'))
  // The gate's default, and the 300 the chief set (the repository variable, 2026-11-11, for 350-minute cycles), each leave
  // the longest gated step (a buying guide, a few minutes; 20 allowed) and the build, tests and push (about 6) inside the
  // job's limit. A cycle that runs past its slot waits for the last (engine.yml's concurrency group), never overlaps it.
  const workflow = readFileSync(new URL('../../../.github/workflows/engine.yml', import.meta.url), 'utf8')
  const jobLimit = Math.max(...[...workflow.matchAll(/timeout-minutes: (\d+)/g)].map(m => Number(m[1])))
  for (const gate of [Number(/AHEAD_BEFORE_MINUTES:-(\d+)/.exec(script)![1]), 300]) expect(gate + 20 + 6, String(gate)).toBeLessThanOrEqual(jobLimit)
})

test("a cycle that changed only UI text still publishes it, or the next would drop it and pay for it again", () => {
  expect(script).toContain('git status --porcelain -- content sources apps/site/src/i18n)" ]; then\n  # Only the engine\'s own records')
  expect(script).toContain('git add content sources engine-state docs/review apps/site/src/i18n')
})

test("the cycle's own site build for new UI strings says so in one line when it fails, so a run that translated none is never silent", () => {
  // The chief of staff, 21 Nov 2026: the build fails when the face finder's record is lost or past its limit (load.ts),
  // and its output goes nowhere. The block, run with pnpm, node and the log stood in for.
  const from = script.indexOf('  # UI text those pages need that src/i18n lacks')
  const to = script.indexOf('\n  fi\n', from) + '\n  fi\n'.length
  expect(from).toBeGreaterThan(-1)
  const run = (build: number, missing: number) => {
    const r = spawnSync('bash', ['-c', `set -euo pipefail\nlog() { echo "LOG $*"; }\npnpm() { if [ "$3" = build ]; then return ${build}; fi; echo "RAN $*"; }\nnode() { return ${missing}; }\n${script.slice(from, to)}`], { encoding: 'utf8', env: { PATH: process.env.PATH } })
    expect(r.status, r.stderr).toBe(0)
    return r.stdout.trim().split('\n').filter(Boolean)
  }
  expect(run(1, 0)).toEqual(["LOG ui strings: the site's build failed, so this run translated no new UI strings"])
  expect(run(1, 1)).toEqual(["LOG ui strings: the site's build failed, so this run translated no new UI strings"])
  expect(run(0, 0)).toEqual(['RAN --filter @aq/engine exec tsx scripts/translate-ui.ts /tmp/aq-i18n-missing.json'])
  expect(run(0, 1)).toEqual([])
})

test('their UI text goes first in the block, 500 strings a cycle: it decides when a language can go live, and last it was skipped', () => {
  // Cycles past the gate skipped it from 2026-11-06 23:19, with Malay's UI text at 360 of 1,298 strings.
  const ui = script.indexOf('ahead pnpm --filter @aq/engine exec tsx scripts/translate-ui.ts --unserved --limit "${UI_AHEAD_LIMIT:-500}"')
  expect(ui).toBeGreaterThan(script.indexOf('ahead() {'))
  expect(ui).toBeLessThan(script.indexOf('for lang in ms; do'))
})

test("the photos part plans the app's calendar after its photo steps, and before the commit that publishes it", () => {
  const curate = script.indexOf('pnpm engine curate || log "curate: failed"')
  expect(curate).toBeGreaterThan(script.indexOf('pnpm engine sweep'))
  expect(script.lastIndexOf('if part photos; then', curate)).toBeGreaterThan(script.indexOf('pnpm engine sweep'))
  expect(curate).toBeLessThan(script.indexOf('git add content sources engine-state docs/review apps/site/src/i18n'))
})
