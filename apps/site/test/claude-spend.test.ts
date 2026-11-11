import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { capFor, leftOf, linesOn, ownArtifacts, spent, tableInForce, vnDay } from '../../../scripts/claude-spend.mjs'

// The workflows that call Claude outside the engine count their day from the cost lines their runs kept
// (scripts/claude-spend.mjs), against the engine's ceilings file, GitHub's side.

const place = (steps: Record<string, number | null>, small = 1) => ({ default: small, backstop: 60, steps })
const CEILINGS = {
  clock: 'Asia/Saigon',
  tables: [
    { from: '2026-11-13T08:00:00+07:00', mac: place({}), github: place({ 'page-review': 8, gate: null }, 2) },
    { from: '2026-11-12T13:00:00+07:00', mac: place({ 'page-review': 99 }), github: place({ 'page-review': 4, gate: null }) },
  ],
}
const at = (iso: string) => new Date(iso)
const line = (step: string, usd: unknown, when: string, more: object = {}) => JSON.stringify({ at: when, step, usd, ...more })

test("a step's dollars a day are GitHub's side of the table in force: its own line, the small ceiling when it has none, no ceiling, and nothing before the first table", () => {
  const noon = at('2026-11-12T08:00:00Z') // 15:00 in Vietnam on 12 Nov
  expect(tableInForce(CEILINGS.tables, noon)?.from).toBe('2026-11-12T13:00:00+07:00')
  expect(capFor(CEILINGS, 'page-review', noon)).toBe(4)
  expect(capFor(CEILINGS, 'a-new-step', noon)).toBe(1)
  expect(capFor(CEILINGS, 'gate', noon)).toBeNull()
  expect(capFor(CEILINGS, 'page-review', at('2026-11-13T01:00:00Z'))).toBe(8) // 08:00 on 13 Nov: the next table, though it is listed first
  expect(capFor(CEILINGS, 'page-review', at('2026-11-12T05:59:00Z'))).toBe(0) // 12:59 on 12 Nov: no table yet
})

test("the day's lines are the step's own, on Vietnam's day, with a real cost: another step's, another day's, a broken or a negative one count for nothing", () => {
  const now = at('2026-11-12T18:00:00Z') // 01:00 on 13 Nov in Vietnam
  expect(vnDay(now)).toBe('2026-11-13')
  const text = [
    line('page-review', 0.25, '2026-11-12T17:30:00Z'), // 00:30 on the 13th
    line('page-review', 0.5, '2026-11-12T16:59:00Z'), // 23:59 on the 12th
    line('nightly-review', 3, '2026-11-12T17:40:00Z'),
    line('page-review', -5, '2026-11-12T17:41:00Z'),
    line('page-review', '9', '2026-11-12T17:42:00Z'),
    line('page-review', 0.1, 'soon'),
    '{"at":"2026-11-12T17:43:00Z","step":"page-review","usd":0.4', // cut short
    '',
    line('page-review', 0.05, '2026-11-12T17:50:00Z', { account: '3c4c560a', model: 'opus' }),
  ].join('\n')
  const lines = linesOn(text, 'page-review', now)
  expect(lines).toHaveLength(2)
  expect(spent(lines)).toBeCloseTo(0.3)
  expect(spent([])).toBe(0)
})

test('what is left is never under zero, and a step with no ceiling has none to run out of', () => {
  expect(leftOf(4, 1.25)).toBe(2.75)
  expect(leftOf(4, 4)).toBe(0)
  expect(leftOf(4, 9.5)).toBe(0)
  expect(leftOf(0, 0)).toBe(0)
  expect(leftOf(null, 100)).toBeNull()
})

test("only this repository's own runs' artifacts count: a fork's pull request can name an artifact anything", () => {
  const now = at('2026-11-12T08:00:00Z')
  const run = (repository_id: number, head_repository_id: number) => ({ id: 1, repository_id, head_repository_id })
  const artifacts = [
    { id: 1, expired: false, created_at: '2026-11-12T07:00:00Z', workflow_run: run(7, 7) },
    { id: 2, expired: false, created_at: '2026-11-12T07:00:00Z', workflow_run: run(7, 99) }, // a fork's branch
    { id: 3, expired: true, created_at: '2026-11-12T07:00:00Z', workflow_run: run(7, 7) },
    { id: 4, expired: false, created_at: '2026-11-09T07:00:00Z', workflow_run: run(7, 7) }, // three days old
    { id: 5, expired: false, created_at: '2026-11-12T07:00:00Z' }, // no run named
  ]
  expect(ownArtifacts(artifacts, 7, now).map(a => a.id)).toEqual([1])
})

test('the real ceilings file has a line for each of the three on GitHub from 12 Nov 13:00, and none on the Mac', () => {
  const real = JSON.parse(readFileSync(new URL('../../../packages/engine/src/ceilings.json', import.meta.url), 'utf8'))
  const lines = (when: string) => ['page-review', 'nightly-review', 'autofix'].map(s => capFor(real, s, at(when)))
  expect(lines('2026-11-12T12:00:00+07:00')).toEqual([0, 0, 0])
  expect(lines('2026-11-12T13:00:00+07:00')).toEqual([4, 2, 4])
  expect(lines('2026-11-13T08:00:00+07:00')).toEqual([8, 3, 8])
  expect(lines('2026-11-14T08:00:00+07:00')).toEqual([12, 4, 12])
  for (const t of real.tables) for (const s of ['page-review', 'nightly-review', 'autofix']) expect(Object.hasOwn(t.mac.steps, s), `${t.from} mac ${s}`).toBe(false)
})
