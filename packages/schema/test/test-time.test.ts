import { afterEach, expect, test } from 'vitest'
import { slow, testTimeScale } from '../src/test-time'

const before = process.env.AQ_TEST_TIME_SCALE
afterEach(() => { if (before === undefined) delete process.env.AQ_TEST_TIME_SCALE; else process.env.AQ_TEST_TIME_SCALE = before })

// A test's own limit, scaled as the engine's cycle asks on a hot Mac (scripts/cycle-checks.sh), else as written.
test('a test keeps its own limit unless the run scales it, and never gets less', () => {
  delete process.env.AQ_TEST_TIME_SCALE
  expect([testTimeScale(), slow(60_000)]).toEqual([1, 60_000])
  process.env.AQ_TEST_TIME_SCALE = '6'
  expect(slow(60_000)).toBe(360_000)
  for (const v of ['', 'x', '0', '0.5', '-3']) {
    process.env.AQ_TEST_TIME_SCALE = v
    expect(slow(30_000), v).toBe(30_000)
  }
})
