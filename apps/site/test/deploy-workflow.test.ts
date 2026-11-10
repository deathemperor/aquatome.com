import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const yml = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8')

// 10 Nov: three deploys in a row reached the job's 30 minutes with every check passed and the upload still to do. GitHub
// calls a job over its limit "cancelled", as it does a run replaced in the queue, so nothing was reported and nothing went
// live for hours. A step over its own limit fails the run, and a failed run is reported.
test('a deploy that runs too long fails rather than being cancelled: its long step has its own limit, inside the job\'s', () => {
  const job = Number(/^ {4}timeout-minutes: (\d+)/m.exec(yml)?.[1])
  const step = Number(/name: Build the real site[^\n]*\n\s+timeout-minutes: (\d+)/.exec(yml)?.[1])
  expect(step, 'the step\'s limit; a deploy took 30 minutes on 10 Nov').toBeGreaterThanOrEqual(45)
  expect(job, 'the job\'s limit leaves the steps before it their time').toBeGreaterThanOrEqual(step + 15)
})
