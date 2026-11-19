import { expect, test } from 'vitest'
import { usageLimit } from '../e2e/claude-limit'

test("usageLimit: Claude's usage limit is a reason to skip, in our words and none of the CLI's, since the PR comment is public (the chief of staff, 19 Nov)", () => {
  // What the review's ask() threw on 2026-11-02, every page.
  expect(usageLimit("claude failed (1): You've hit your weekly limit · resets Nov 5, 6am (UTC)")).toBe('Claude usage limit')
  expect(usageLimit('claude failed (1): Claude AI usage limit reached|1762300800')).toBe('Claude usage limit')
  expect(usageLimit('claude failed (1): API Error: 429 rate_limit_error')).toBe('Claude usage limit')
  expect(usageLimit('claude failed (accounts): every account out of its usage limit')).toBe('Claude usage limit')
})

test('usageLimit: any other failure is not the limit', () => {
  expect(usageLimit('claude failed (1): Invalid API key · Please run /login')).toBeUndefined()
  expect(usageLimit('claude returned non-JSON (1): You have hit your limit')).toBeUndefined()
  expect(usageLimit('page.goto: Timeout 30000ms exceeded')).toBeUndefined()
  expect(usageLimit('')).toBeUndefined()
})
