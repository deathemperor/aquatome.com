import { afterEach, expect, test } from 'vitest'
import { AUTH, failureMessage, usageLimit } from '../e2e/claude-limit'

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

const saved = process.env.GITHUB_ACTIONS
afterEach(() => { if (saved === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = saved })

test("failureMessage: on GitHub a failed call says its kind in our words, decided from the CLI's and never copied; elsewhere the CLI's text (the chief of staff, 19 Nov)", () => {
  const words = ['TEST', 'ONLY', 'WORDS'].join('_')
  const m = (text: string, r?: Parameters<typeof failureMessage>[2]) => failureMessage('claude failed (1)', text, r)
  process.env.GITHUB_ACTIONS = 'true'
  expect(m(`You've hit your weekly limit · resets Nov 5, 6am (UTC) ${words}`)).toBe('claude failed (1): usage limit')
  expect(m(`Failed to authenticate. API Error: 401 ${words}`)).toBe('claude failed (1): credential rejected')
  expect(m(`Prompt is too long ${words}`)).toBe('claude failed (1): prompt too long')
  expect(m(`API Error: the model's safeguards flagged this message ${words}`)).toBe("claude failed (1): refused by the model's safeguards")
  expect(m(words, { is_error: false })).toBe('claude failed (1): answer failed its schema') // it answered, but not to the schema
  expect(m(words, { is_error: true, subtype: 'error_max_turns' })).toBe('claude failed (1): stopped at its turn limit')
  expect(m(`API Error: 529 ${words}`)).toBe('claude failed (1): overloaded')
  expect(m(`API Error: 502 ${words}`)).toBe('claude failed (1): server error (502)')
  expect(m(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"${words}"}}`)).toBe('claude failed (1): other (400 invalid_request_error)')
  expect(m(words)).toBe('claude failed (1): other')
  expect(failureMessage('claude returned non-JSON (1)', `<html>${words}`)).toBe('claude returned non-JSON (1): answer not JSON')
  expect(failureMessage('claude returned non-JSON (null)', '')).toBe('claude returned non-JSON (null): other (killed)')
  // What the code here reads off a failure still reads: the limit, and a rejected credential.
  expect([usageLimit(m("You've hit your weekly limit")), AUTH.test(m('Invalid bearer token'))]).toEqual(['Claude usage limit', true])
  delete process.env.GITHUB_ACTIONS
  expect(m(`API Error: 529 ${words}`)).toBe(`claude failed (1): API Error: 529 ${words}`)
})
