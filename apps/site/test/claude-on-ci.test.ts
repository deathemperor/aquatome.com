import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// CLAUDE_ON_CI=off pauses every workflow step or job that passes Claude's token, except comment and photo moderation.
// The check reads the workflow files, so taking a gate off, or adding a new use without one, fails it.

const DIR = new URL('../../../.github/workflows/', import.meta.url)
const GATE = "vars.CLAUDE_ON_CI != 'off'"
// The rewrite alone has a second switch: ENGINE_ON_CI=on runs it while CLAUDE_ON_CI is off. It is the rewrite's own, so
// no other workflow may have it.
const ENGINE_GATE = `(${GATE} || vars.ENGINE_ON_CI == 'on')`
const TOKEN = /secrets\.CLAUDE_CODE_OAUTH_TOKEN(?![A-Za-z0-9_])/
const EXEMPT = new Set(['moderate.yml'])

type Step = { name: string; if: string | null; passesToken: boolean }
type Job = { id: string; if: string | null; passesToken: boolean; steps: Step[] }
type Use = { file: string; job: string; step: string | null; behind: boolean }

const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8')

/** Drop a trailing comment, and one pair of quotes around the whole value. */
function scalar(value: string): string {
  let s = value.trim()
  const q = s[0]
  if ((q === '"' || q === "'") && s.endsWith(q) && s.length >= 2) s = s.slice(1, -1)
  else s = s.replace(/\s+#.*$/, '')
  return s.trim()
}

/** True when every top-level alternative requires the switch to be on. `a || gate` does not. `(a || b) && gate` does. */
function behindSwitch(expr: string | null): boolean {
  if (!expr?.includes(GATE)) return false
  const parts: string[] = []
  let depth = 0
  let start = 0
  let quote = ''
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]!
    if (quote) {
      if (c === quote) quote = ''
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && expr.startsWith('||', i)) {
      parts.push(expr.slice(start, i))
      i++
      start = i + 1
    }
  }
  parts.push(expr.slice(start))
  return parts.every(part => part.includes(GATE))
}

function jobsIn(yml: string): Job[] {
  const jobs: Job[] = []
  let inJobs = false
  let job: Job | null = null
  let step: Step | null = null
  let blockFloor = -1
  const openBlock = (floor: number, value: string) => {
    if (/[|>][-+]?\s*(?:#.*)?$/.test(value)) blockFloor = floor
  }
  for (const line of yml.split('\n')) {
    if (blockFloor >= 0) {
      if (line.trim() === '') continue
      const indent = /^ */.exec(line)![0].length
      if (indent > blockFloor) {
        if (TOKEN.test(line)) {
          if (step) step.passesToken = true
          else if (job) job.passesToken = true
        }
        continue
      }
      blockFloor = -1
    }
    if (/^jobs:\s*(?:#.*)?$/.test(line)) {
      inJobs = true
      continue
    }
    if (!inJobs) continue
    if (/^\S/.test(line)) {
      inJobs = false
      continue
    }
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (TOKEN.test(line)) {
      if (step) step.passesToken = true
      else if (job) job.passesToken = true
    }
    const jobHead = /^ {2}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (jobHead && !line.startsWith('    ')) {
      job = { id: jobHead[1]!, if: null, passesToken: false, steps: [] }
      jobs.push(job)
      step = null
      openBlock(2, jobHead[2] ?? '')
      continue
    }
    const stepHead = /^ {6}- (.*)$/.exec(line)
    if (stepHead && job) {
      const rest = stepHead[1]!
      const named = /^name:\s*(.*)$/.exec(rest)
      step = { name: named ? scalar(named[1]!) : '', if: null, passesToken: TOKEN.test(rest) }
      job.steps.push(step)
      openBlock(6, rest)
      continue
    }
    const deeper = /^ {8,}(\S.*)$/.exec(line)
    if (deeper && step) {
      const name = /^name:\s*(.*)$/.exec(deeper[1]!)
      if (name && !step.name) step.name = scalar(name[1]!)
      const iff = /^if:\s*(.*)$/.exec(deeper[1]!)
      if (iff) step.if = scalar(iff[1]!)
      openBlock(8, deeper[1]!)
      continue
    }
    const jobProp = /^ {4}([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (jobProp && job) {
      if (jobProp[1] === 'if') job.if = scalar(jobProp[2] ?? '')
      step = null
      openBlock(4, jobProp[2] ?? '')
    }
  }
  return jobs
}

function usesIn(file: string, yml: string): Use[] {
  const uses: Use[] = []
  for (const job of jobsIn(yml)) {
    if (job.passesToken) uses.push({ file, job: job.id, step: null, behind: behindSwitch(job.if) })
    for (const step of job.steps) {
      if (!step.passesToken) continue
      uses.push({ file, job: job.id, step: step.name, behind: behindSwitch(step.if) || behindSwitch(job.if) })
    }
  }
  return uses
}

const files = readdirSync(DIR).filter(f => f.endsWith('.yml'))
const uses = files.flatMap(file => usesIn(file, read(file)))

test('every step or job that passes CLAUDE_CODE_OAUTH_TOKEN is behind CLAUDE_ON_CI, except moderation', () => {
  const moderated = uses.filter(u => EXEMPT.has(u.file))
  const gated = uses.filter(u => !EXEMPT.has(u.file))
  expect(moderated.length, 'moderate.yml still passes the token, and the switch does not cover it').toBeGreaterThan(0)
  expect(moderated.every(u => !u.behind), 'moderation stays on when CLAUDE_ON_CI is off').toBe(true)
  const want = [
    ['ci.yml', 'checks', 'AI page review'],
    ['watch.yml', 'checks', 'with the AI review'],
    ['fix.yml', 'agent', 'Claude reproduces the problem'],
    ['engine.yml', 'cycle', 'Run this part'],
  ]
  for (const [file, job, step] of want) {
    expect(gated.some(u => u.file === file && u.job === job && u.step?.includes(step)), `${file} ${job} ${step}`).toBe(true)
  }
  const open = gated.filter(u => !u.behind)
  expect(open, open.map(u => `${u.file} job ${u.job}${u.step ? ` step ${u.step}` : ''}`).join('\n')).toEqual([])
})

test('taking the condition off a workflow leaves that Claude step ungated', () => {
  for (const file of ['ci.yml', 'watch.yml', 'fix.yml', 'engine.yml']) {
    const stripped = read(file).replaceAll(` && ${ENGINE_GATE}`, '').replaceAll(` && ${GATE}`, '').replaceAll(`${GATE} && `, '')
    const open = usesIn(file, stripped).filter(u => !u.behind)
    expect(open.length, file).toBeGreaterThan(0)
  }
})

test('ENGINE_ON_CI=on runs the rewrite alone while CLAUDE_ON_CI is off: no other workflow has that switch', () => {
  const cycle = jobsIn(read('engine.yml')).find(j => j.id === 'cycle')!
  expect(cycle.if).toBe(`needs.due.outputs.run == 'true' && ${ENGINE_GATE}`)
  for (const file of files.filter(f => f !== 'engine.yml')) expect(read(file), file).not.toContain('ENGINE_ON_CI')
})

test('an or in front of the condition does not count as a gate', () => {
  expect(behindSwitch(`github.event_name == 'schedule' || ${GATE}`)).toBe(false)
  expect(behindSwitch(`(github.event_name == 'workflow_dispatch' || github.event.label.name == 'autofix') && ${GATE}`)).toBe(true)
  expect(behindSwitch(null)).toBe(false)
})

test("watch.yml still checks the live site when Claude is paused, and a deploy never takes the review's token", () => {
  const checks = jobsIn(read('watch.yml')).find(j => j.id === 'checks')!
  const plain = checks.steps.find(s => s.name === "Browser checks, today's sample of pages")!
  const review = checks.steps.find(s => s.name.includes('with the AI review'))!
  const install = checks.steps.find(s => s.name.startsWith('Install Claude'))!
  expect(plain.passesToken).toBe(false)
  expect(plain.if).toContain("github.event_name == 'workflow_run'")
  expect(plain.if).toContain("vars.CLAUDE_ON_CI == 'off'")
  expect(behindSwitch(plain.if)).toBe(false)
  expect(behindSwitch(review.if)).toBe(true)
  expect(review.if).toContain("github.event_name != 'workflow_run'")
  expect(behindSwitch(install.if)).toBe(true)
  expect(read('watch.yml')).toContain("E2E_REVIEW: ''")
})

test('a fix started while the switch is off says Claude is paused, and the jobs that follow the agent stay gated', () => {
  const jobs = jobsIn(read('fix.yml'))
  const job = (id: string) => jobs.find(j => j.id === id)!
  expect(behindSwitch(job('agent').if)).toBe(true)
  expect(behindSwitch(job('verify').if)).toBe(true)
  expect(behindSwitch(job('publish').if)).toBe(true)
  expect(job('paused').if).toContain("vars.CLAUDE_ON_CI == 'off'")
  expect(job('paused').steps.some(s => s.name.toLowerCase().includes('paused'))).toBe(true)
  expect(read('fix.yml')).toContain('echo "CLAUDE_ON_CI is off, so Claude is paused."')
})

test('the engine still asks whether a cycle is due when the rewrite is paused', () => {
  const yml = read('engine.yml')
  const due = yml.slice(yml.indexOf('\n  due:'), yml.indexOf('\n  cycle:'))
  expect(due).not.toContain('CLAUDE_ON_CI')
  const cycle = jobsIn(yml).find(j => j.id === 'cycle')!
  expect(behindSwitch(cycle.if)).toBe(true)
})

test('moderation says the switch leaves it on, and the review comment still waits for the review step', () => {
  expect(read('moderate.yml')).toContain('CLAUDE_ON_CI does not pause this')
  expect(read('ci.yml')).toContain("steps.review.outputs.ran == '1'")
})
