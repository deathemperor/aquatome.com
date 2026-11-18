import { expect, test } from 'vitest'
import { retryPause } from '../e2e/lighthouse-flags'

test('a retry on the live site waits a minute before it measures again; a first try, and the local build, never wait', () => {
  expect(retryPause(true, 0)).toBe(0)
  expect(retryPause(true, 1)).toBe(60_000)
  expect(retryPause(true, 2)).toBe(60_000)
  expect(retryPause(false, 1)).toBe(0)
})
