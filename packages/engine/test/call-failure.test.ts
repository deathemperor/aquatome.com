import { afterEach, expect, test } from 'vitest'
import { failureKind, failureMessage } from '../src/call-failure'
import { LlmError } from '../src/claude'
import { credentialRejected, outOf, resetOf } from '../src/claude-accounts'
import { accountsOut } from '../src/gate'
import { modelFailureKind, photoModelStop } from '../src/photo-observations'
import { errorKind } from '../src/state'

// On GitHub, whose logs are public, a failed call says what it was in our words, decided by code from what the CLI said
// and never copied from it; on the Mac the CLI's text stays (the chief of staff, 19 Nov).
const words = ['TEST', 'ONLY', 'WORDS'].join('_')
const saved = process.env.GITHUB_ACTIONS
afterEach(() => {
  if (saved === undefined) delete process.env.GITHUB_ACTIONS
  else process.env.GITHUB_ACTIONS = saved
})

test("a failed call's kind is decided by code from what the CLI said, never copied from it", () => {
  const k = (text: string, subtype?: string) => failureKind(`claude failed (1): ${text}`, subtype)
  expect(k(`You've hit your weekly limit · resets Nov 25 at 6am (UTC) ${words}`)).toMatch(/^usage limit until \d{4}-11-25T06:00:00\.000Z$/)
  expect(k(`You've hit your weekly limit · resets ${words}`)).toBe('usage limit')
  expect(k(`Failed to authenticate. API Error: 401 ${words}`)).toBe('credential rejected')
  expect(k(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: ${words}"}}`)).toBe('prompt too long')
  expect(k(`API Error: the model's safeguards flagged this message ${words}`)).toBe("refused by the model's safeguards")
  expect(k(words, 'error_max_structured_output_retries')).toBe('answer failed its schema')
  expect(k(`the answer did not match the JSON schema ${words}`)).toBe('answer failed its schema')
  expect(k(words, 'error_max_budget_usd')).toBe('stopped at its budget')
  expect(k(words, 'error_max_turns')).toBe('stopped at its turn limit')
  expect(k(words, words)).toBe('other') // a subtype the code doesn't know isn't kept
  expect(k(`API Error: 529 ${words}`)).toBe('overloaded')
  expect(k(`API Error: 500 ${words}`)).toBe('server error (500)')
  expect(k(`fetch failed ${words}`)).toBe('network (fetch failed)')
  expect(k(`connect ECONNRESET ${words}`)).toBe('network (ECONNRESET)')
  expect(k(`API Error: 418 {"type":"error","error":{"type":"${words.toLowerCase()}"}}`)).toBe('other (418)')
  expect(k(words)).toBe('other')
  expect(failureKind(`claude failed (null): ${words}`)).toBe('other (killed)')
  expect(failureKind('claude timed out after 600 s')).toBe('timed out')
})

test("on GitHub a failed call says its kind in our words; on the Mac the CLI's text as before", () => {
  process.env.GITHUB_ACTIONS = 'true'
  expect(failureMessage('claude failed (1)', `API Error: 500 ${words}`)).toBe('claude failed (1): server error (500)')
  expect(failureMessage('claude failed (1)', `prompt is too long ${words}`)).toBe('claude failed (1): prompt too long')
  expect(failureMessage('claude returned non-JSON (1)', `<html>${words}`)).toBe('claude returned non-JSON (1): answer not JSON')
  expect(failureMessage('claude returned non-JSON (143)', '')).toBe('claude returned non-JSON (143): no answer')
  expect(failureMessage('claude returned non-JSON (null)', words)).toBe('claude returned non-JSON (null): other (killed)')
  delete process.env.GITHUB_ACTIONS
  expect(failureMessage('claude failed (1)', `API Error: 500 ${words}`)).toBe(`claude failed (1): API Error: 500 ${words}`)
})

test('a failure in our words keeps what the code that reads a failure looks for', () => {
  process.env.GITHUB_ACTIONS = 'true'
  const limit = failureMessage('claude failed (1)', "You've hit your weekly limit · resets Nov 25 at 6am (UTC)")
  const auth = failureMessage('claude failed (1)', 'Failed to authenticate. API Error: 401')
  // The steps' kind, the accounts (with when the limit lifts), the photo steps' stop, the cycle's check, the gate's stop.
  expect(errorKind(limit)).toBe('usage')
  expect(outOf(limit)).toEqual({ why: 'usage', reset: resetOf('resets Nov 25 at 6am (UTC)') })
  expect(photoModelStop(new LlmError(limit))).toBe('usage limit')
  expect([outOf(auth)?.why, credentialRejected(`https://example.org/a: ${auth}`)]).toEqual(['auth', true])
  expect([accountsOut(new LlmError(limit)), accountsOut(new LlmError(auth))]).toEqual([true, true])
  expect(errorKind(failureMessage('claude failed (1)', 'fetch failed'))).toBe('transient')
  // Read back, a kind is itself: the photo check keeps the same kinds on GitHub as on the Mac.
  for (const t of [`API Error: 500 ${words}`, `fetch failed ${words}`, `prompt is too long ${words}`, `API Error: 400 {"type":"error","error":{"type":"invalid_request_error"}}`, `API Error: 529 ${words}`]) {
    expect(modelFailureKind(new LlmError(failureMessage('claude failed (1)', t)))).toBe(modelFailureKind(new LlmError(`claude failed (1): ${t}`)))
  }
  for (const m of [limit, auth]) expect(m).not.toMatch(/hit your|Failed to authenticate/)
})
