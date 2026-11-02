import { expect, test } from 'vitest'
import { usageLimit } from '../e2e/claude-limit'

test("usageLimit: Claude's usage limit is a reason to skip, with the CLI's text", () => {
  // What the review's ask() threw on 2026-11-02, every page.
  expect(usageLimit("claude failed (1): You've hit your weekly limit · resets Nov 5, 6am (UTC)")).toBe("Claude usage limit: You've hit your weekly limit · resets Nov 5, 6am (UTC)")
  expect(usageLimit('claude failed (1): Claude AI usage limit reached|1762300800')).toBe('Claude usage limit: Claude AI usage limit reached|1762300800')
  expect(usageLimit('claude failed (1): API Error: 429 rate_limit_error')).toBe('Claude usage limit: API Error: 429 rate_limit_error')
})

test('usageLimit: any other failure is not the limit', () => {
  expect(usageLimit('claude failed (1): Invalid API key · Please run /login')).toBeUndefined()
  expect(usageLimit('claude returned non-JSON (1): You have hit your limit')).toBeUndefined()
  expect(usageLimit('page.goto: Timeout 30000ms exceeded')).toBeUndefined()
  expect(usageLimit('')).toBeUndefined()
})
