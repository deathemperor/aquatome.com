import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { capFor, leftOf, linesOn, ownArtifacts, recentArtifacts, spent, tableInForce, vnDay } from '../../../scripts/claude-spend.mjs'

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

test("a step's artifacts are this repository's own runs', by the step's name and the run's attempt: a fork's pull request can name an artifact anything", () => {
  const now = at('2026-11-12T08:00:00Z')
  const run = (repository_id: number, head_repository_id: number) => ({ id: 1, repository_id, head_repository_id })
  const made = '2026-11-12T07:00:00Z'
  const artifacts = [
    { id: 1, name: 'cost-log-page-review-1', expired: false, created_at: made, workflow_run: run(7, 7) },
    { id: 2, name: 'cost-log-page-review-2', expired: false, created_at: made, workflow_run: run(7, 7) }, // the job run again: both attempts count
    { id: 3, name: 'cost-log-page-review-1', expired: false, created_at: made, workflow_run: run(7, 99) }, // a fork's branch
    { id: 4, name: 'cost-log-page-review-1', expired: true, created_at: made, workflow_run: run(7, 7) },
    { id: 5, name: 'cost-log-page-review-1', expired: false, created_at: '2026-11-09T07:00:00Z', workflow_run: run(7, 7) }, // three days old
    { id: 6, name: 'cost-log-page-review-1', expired: false, created_at: made }, // no run named
    { id: 7, name: 'cost-log-page-review', expired: false, created_at: made, workflow_run: run(7, 7) }, // no attempt
    { id: 8, name: 'cost-log-page-review-1-old', expired: false, created_at: made, workflow_run: run(7, 7) },
    { id: 9, name: 'cost-log-page-1', expired: false, created_at: made, workflow_run: run(7, 7) }, // another step's
    { id: 10, name: 'e2e-report', expired: false, created_at: made, workflow_run: run(7, 7) },
  ]
  expect(ownArtifacts(artifacts, 7, now, 'page-review').map((a: { id: number }) => a.id)).toEqual([1, 2])
  expect(ownArtifacts(artifacts, 7, now, 'page').map((a: { id: number }) => a.id)).toEqual([9])
})

test('the last two days of artifacts are read a page at a time until one is older, however many a fork adds under one name', () => {
  const now = at('2026-11-12T08:00:00Z')
  const made = (hoursAgo: number, id: number) => ({ id, name: 'x', created_at: new Date(now.getTime() - hoursAgo * 3600_000).toISOString() })
  // 250 artifacts, newest first, an hour apart from 0 to 249 hours ago: pages of 100.
  const all = Array.from({ length: 250 }, (_, i) => made(i, i))
  const asked: number[] = []
  const page = (n: number) => { asked.push(n); return all.slice((n - 1) * 100, n * 100) }
  expect(recentArtifacts(page, now).map((a: { id: number }) => a.id)).toEqual(Array.from({ length: 48 }, (_, i) => i))
  expect(asked).toEqual([1]) // the first page already reaches an older one
  // 230 in the last two days: three pages, the last not full.
  const busy = Array.from({ length: 230 }, (_, i) => made(i / 10, i))
  asked.length = 0
  expect(recentArtifacts((n: number) => { asked.push(n); return busy.slice((n - 1) * 100, n * 100) }, now)).toHaveLength(230)
  expect(asked).toEqual([1, 2, 3])
  // More than the day can be counted from: it says so, and the caller stops.
  expect(() => recentArtifacts(() => Array.from({ length: 100 }, (_, i) => made(1, i)), now, 3)).toThrow(/can't be counted/)
})

// fix.yml's inline script for the auto-fix's cost line, run as the workflow runs it. The agent has had Bash in that job.
const SCRIPT = (() => {
  const yml = readFileSync(new URL('../../../.github/workflows/fix.yml', import.meta.url), 'utf8')
  const body = /node - <<'JS'\n([\s\S]*?)\n\s*JS\n/.exec(yml)![1]!
  return body.split('\n').map(l => l.replace(/^ {10}/, '')).join('\n')
})()
function costLine(agent: unknown, env: { STARTED?: string; LEFT?: string }, before?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'aq-fix-'))
  const out = join(dir, 'aquatome-cost-autofix.jsonl')
  if (agent !== undefined) writeFileSync(join(dir, 'agent.json'), typeof agent === 'string' ? agent : JSON.stringify(agent))
  if (before !== undefined) writeFileSync(out, before)
  let failed = false
  try {
    execFileSync('node', ['-'], { input: SCRIPT, env: { PATH: process.env.PATH, AGENT_JSON: join(dir, 'agent.json'), COST_LINE: out, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  } catch { failed = true }
  return { failed, text: existsSync(out) ? readFileSync(out, 'utf8') : undefined }
}

test("the auto-fix's cost line takes numbers only from what the CLI printed: no word the agent could have put there reaches the artifact", () => {
  const SECRET = 'sk-ant-oat01-not-a-real-token'
  const { text } = costLine({
    total_cost_usd: 1.23456789, duration_ms: 61234, is_error: false, result: `the issue's text and ${SECRET}`, subtype: SECRET, session_id: SECRET,
    usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: SECRET, cache_read_input_tokens: 4.5, extra: SECRET },
    structured_output: { status: 'fixed', summary: SECRET },
  }, { STARTED: '1', LEFT: '4' })
  const line = JSON.parse(text!)
  expect(Object.keys(line).sort()).toEqual(['at', 'in', 'ms', 'out', 'step', 'usd'])
  expect(line).toMatchObject({ step: 'autofix', usd: 1.2346, ms: 61234, in: 10, out: 20 })
  expect(text).not.toContain(SECRET)
  // A cost that is no number, or out of bounds, is not copied: the session is counted at what it was allowed.
  for (const usd of [SECRET, -1, 1e9, null]) {
    const odd = costLine({ total_cost_usd: usd, duration_ms: SECRET }, { STARTED: '1', LEFT: '2.5' })
    expect(JSON.parse(odd.text!)).toMatchObject({ step: 'autofix', usd: 2.5, assumed: true })
    expect(odd.text).not.toContain(SECRET)
  }
})

test('a session that started and left no cost to read is counted at the whole of what it was allowed; one that never started leaves no line', () => {
  for (const agent of [undefined, '', '{"total_cost_usd": 0.4', 'null']) {
    const cut = costLine(agent, { STARTED: '1', LEFT: '3.2' })
    expect(JSON.parse(cut.text!)).toMatchObject({ step: 'autofix', usd: 3.2, assumed: true })
  }
  // The day's ceiling was already spent, so no session started: the stand-in result has no cost, and nothing is counted.
  expect(costLine({ structured_output: { status: 'needs-person', summary: 'No fix was tried' } }, { STARTED: '', LEFT: '0' }).text).toBeUndefined()
  // No ceiling (`none`) or an allowance that is no plain number: nothing to assume.
  expect(costLine(undefined, { STARTED: '1', LEFT: 'none' }).text).toBeUndefined()
  expect(costLine(undefined, { STARTED: '1', LEFT: '4; echo x' }).text).toBeUndefined()
  // A session stopped at its cap still printed its cost: that is what is logged, marked as an error.
  expect(JSON.parse(costLine({ subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 4.07 }, { STARTED: '1', LEFT: '4' }).text!)).toMatchObject({ usd: 4.07, error: true })
})

test("the line goes to a new file: one already there (the agent's) is not added to, and the step fails", () => {
  const planted = costLine({ total_cost_usd: 1 }, { STARTED: '1', LEFT: '4' }, 'planted text\n')
  expect(planted.failed).toBe(true)
  expect(planted.text).toBe('planted text\n') // and in the workflow the file is in a folder made that moment, which the agent never saw
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
