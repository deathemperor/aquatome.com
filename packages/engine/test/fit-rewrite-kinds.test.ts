import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// The cycle's three steps that changed live guides' words on 15-19 Nov leave guides alone until Monday's change to how a
// guide is mended, and come back only on the chief of staff's word (20 Nov 2026), not by date. The reader-fit rewrite
// writes a guide again whole, checked only for its old digit figures appearing somewhere in the new text: guides are left
// out, and fish, plant and breed parts, mended cut-only, go on. The cutter (video-cut) is off. The topic check, which reads
// guides alone, checks none.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const scripts = () => [
  ...readdirSync(join(ROOT, 'scripts')).filter(f => f.endsWith('.sh')).map(f => join('scripts', f)),
  ...readdirSync(join(ROOT, '.github/workflows')).map(f => join('.github/workflows', f)),
].map(f => [f, readFileSync(join(ROOT, f), 'utf8')] as const)

test("the cycle's reader-fit rewrite leaves guides out, unless FIT_REWRITE_KINDS names them", () => {
  const cycle = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
  const calls = cycle.split('\n').filter(l => /^\s*pnpm engine fit-rewrite\b/.test(l))
  expect(calls).toHaveLength(1)
  const kinds = /--kind "\$\{FIT_REWRITE_KINDS:-([a-z,]+)\}"/.exec(calls[0]!)?.[1]?.split(',')
  expect(kinds?.sort()).toEqual(['breeds', 'plants', 'species'])
  // The command matches a page by its content folder's name (cli.ts fit-rewrite, `--kind`).
  for (const k of [...kinds!, 'guides']) expect(existsSync(join(ROOT, 'apps/site/test/fixture-content', k)), k).toBe(true)
})

test("the cycle's cutter is off unless VIDEO_CUT=on, and nothing else calls it", () => {
  const calls = scripts().flatMap(([f, t]) => t.split('\n').map((l, i, ls) => ({ f, l, before: ls[i - 1] ?? '' })).filter(x => /\bengine video-cut\b/.test(x.l) && !/^\s*#/.test(x.l)))
  expect(calls.map(c => c.f)).toEqual(['scripts/engine-cycle.sh'])
  expect(calls[0]!.before).toMatch(/^\s*if \[ "\$\{VIDEO_CUT:-off\}" = on \]; then$/)
})

test("the cycle's topic check reads no guide unless TOPIC_CHECK_LIMIT says how many", () => {
  const calls = scripts().flatMap(([f, t]) => t.split('\n').filter(l => /\bengine topic-check\b/.test(l) && !/^\s*#/.test(l)).map(l => ({ f, l })))
  expect(calls.map(c => c.f)).toEqual(['scripts/engine-cycle.sh'])
  expect(calls[0]!.l).toMatch(/ --limit "\$\{TOPIC_CHECK_LIMIT:-0\}"/)
})
