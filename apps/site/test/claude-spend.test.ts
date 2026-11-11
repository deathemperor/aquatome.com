import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
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

// fix.yml's `cost` job: the inline script that makes the auto-fix's cost line, run as the workflow runs it. It runs in a
// job the agent was never in, and takes one thing from the agent's job: the dollars the CLI said the session cost.
const FIX = readFileSync(new URL('../../../.github/workflows/fix.yml', import.meta.url), 'utf8')
const SCRIPT = (() => {
  const cost = FIX.slice(FIX.indexOf('\n  cost:\n'))
  const body = /node - <<'JS'\n([\s\S]*?)\n\s*JS\n/.exec(cost)![1]!
  return body.split('\n').map(l => l.replace(/^ {10}/, '')).join('\n')
})()
function costLine(env: { USD?: string; LEFT?: string; STARTED?: string; REPORTED?: string }) {
  const out = join(mkdtempSync(join(tmpdir(), 'aq-fix-')), 'aquatome-cost-autofix.jsonl')
  execFileSync('node', ['-'], { input: SCRIPT, env: { PATH: process.env.PATH, COST_LINE: out, ...env }, stdio: ['pipe', 'pipe', 'pipe'] })
  return existsSync(out) ? readFileSync(out, 'utf8') : undefined
}

test("the auto-fix's cost line is the time, the step and the dollars to the cent: one plain number crosses from the agent's job, and nothing else can", () => {
  const text = costLine({ USD: '1.234567', LEFT: '4', STARTED: '1', REPORTED: '1' })!
  const line = JSON.parse(text)
  expect(Object.keys(line).sort()).toEqual(['at', 'step', 'usd'])
  expect(line).toMatchObject({ step: 'autofix', usd: 1.23 })
  expect(Number.isNaN(Date.parse(line.at))).toBe(false)
  // What the agent's job hands on is not trusted: anything but a plain number of dollars is not copied, and the session
  // is counted at the whole of what it was allowed.
  const SECRET = 'sk-ant-oat01-not-a-real-token'
  for (const usd of [SECRET, `1.5 ${SECRET}`, `1.5\n${SECRET}`, '-1', '1e3', '0x10', '1.2.3', ' 2', '12345', '1.1234567', 'NaN', 'Infinity']) {
    const odd = costLine({ USD: usd, LEFT: '2.5', STARTED: '1', REPORTED: '1' })!
    expect(JSON.parse(odd), usd).toMatchObject({ step: 'autofix', usd: 2.5, assumed: true })
    expect(Object.keys(JSON.parse(odd)).sort()).toEqual(['assumed', 'at', 'step', 'usd'])
    expect(odd).not.toContain(SECRET)
  }
})

test("a session that left no cost to read is counted at the whole of what it was allowed, a lost runner's too; only a job that said it was there and started no session writes no line", () => {
  // The session ran out of time, or was stopped: its step failed and nothing says what it cost.
  expect(JSON.parse(costLine({ USD: '', LEFT: '3.2', STARTED: '1', REPORTED: '1' })!)).toMatchObject({ usd: 3.2, assumed: true })
  // The runner was lost, or the job was cut off before it could hand anything on: nothing arrives, not even that the
  // job was there, so a session is assumed.
  expect(JSON.parse(costLine({ LEFT: '3.2' })!)).toMatchObject({ usd: 3.2, assumed: true })
  expect(JSON.parse(costLine({ USD: '', LEFT: '3.2', STARTED: '', REPORTED: '' })!)).toMatchObject({ usd: 3.2, assumed: true })
  // An install failed before any session, and the job said so by saying it was there and no more: nothing was spent.
  expect(costLine({ USD: '', LEFT: '3.2', STARTED: '', REPORTED: '1' })).toBeUndefined()
  // Only the runner's own word counts for that: anything else there is not "it was there".
  expect(JSON.parse(costLine({ LEFT: '3.2', REPORTED: 'true' })!)).toMatchObject({ usd: 3.2, assumed: true })
  // No ceiling (`none`): nothing to count a missing cost at, and a cost that is there is still logged.
  expect(costLine({ USD: '', LEFT: 'none', STARTED: '1', REPORTED: '1' })).toBeUndefined()
  expect(JSON.parse(costLine({ USD: '0.500000', LEFT: 'none', STARTED: '1', REPORTED: '1' })!)).toMatchObject({ usd: 0.5 })
  // A session stopped at its cap still printed its cost, a response past it: that is what is logged.
  expect(JSON.parse(costLine({ USD: '4.070000', LEFT: '4', STARTED: '1', REPORTED: '1' })!)).toEqual({ at: expect.any(String), step: 'autofix', usd: 4.07 })
  // What the budget job hands on as left is a form the cost job reads, awkward sums too (4 - 1.1 - 2.2).
  for (const [cap, spentToday] of [[4, 1.1 + 2.2], [8, 0.1 + 0.2], [12, 11.99995], [4, 0]] as const) {
    const left = leftOf(cap, spentToday)!
    expect(String(left), String(left)).toMatch(/^\d{1,4}(\.\d{1,6})?$/)
    if (left > 0) expect(JSON.parse(costLine({ LEFT: String(left) })!)).toMatchObject({ usd: Math.round(left * 100) / 100, assumed: true })
  }
})

test("the auto-fix's public line is made where the agent never ran, and the session runs under the cap with its sign-in kept out of the agent's commands", () => {
  const job = (id: string) => { const from = FIX.indexOf(`\n  ${id}:\n`); const next = FIX.slice(from + 1).search(/\n  [a-z]+:\n/); return FIX.slice(from, next < 0 ? undefined : from + 1 + next) }
  const [budget, agent, cost] = [job('budget'), job('agent'), job('cost')]
  // The cost job: no checkout, no token, no permission, and it runs whatever became of the agent's job.
  expect(cost).not.toMatch(/actions\/checkout|secrets\.|GH_TOKEN/)
  expect(cost).toContain('permissions: {}')
  expect(cost).toContain("if: always() && needs.budget.outputs.go == 'true' && needs.agent.result != 'skipped'")
  expect(cost).toContain('name: cost-log-autofix-${{ github.run_attempt }}')
  // The agent's job uploads no cost file of its own, and hands on three things only.
  expect(agent).not.toContain('cost-log-')
  expect(/\n    outputs:\n((?: {6}.*\n)+)/.exec(agent)![1]!.trim().split('\n').map(l => l.trim().split(':')[0])).toEqual(['reported', 'started', 'usd'])
  // "This job's runner is here" is its first step, before the checkout; "a session is about to start" is said before
  // the agent runs. Neither is something the agent can have touched.
  expect(agent.indexOf('echo reported=1')).toBeGreaterThan(0)
  expect(agent.indexOf('echo reported=1')).toBeLessThan(agent.indexOf('actions/checkout'))
  expect(agent.indexOf('echo started=1')).toBeGreaterThan(0)
  expect(agent.indexOf('echo started=1')).toBeLessThan(agent.indexOf('claude -p '))
  // The session: the CLI's own cap, what the budget job counted; the token kept out of the commands it runs.
  expect(agent).toContain('budget=(--max-budget-usd "$LEFT")')
  expect(agent).toContain('"${budget[@]}"')
  expect(agent).toContain("CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: '1'")
  expect(agent).toContain('needs: budget')
  // The budget job counts with no token of Claude's, and only reads.
  expect(budget).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
  expect(budget).toMatch(/permissions:\n {6}contents: read\n {6}actions: read\n/)
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
