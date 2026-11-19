import { afterEach, expect, test } from 'vitest'
import { failureDetail, failureKind, failureMessage, refusedAt, sentenceHash } from '../src/call-failure'
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
  const k = (text: string, subtype?: string) => failureKind(`claude failed (1): ${text}`, subtype ? { subtype } : undefined)
  expect(k(`You've hit your weekly limit · resets Nov 25 at 6am (UTC) ${words}`)).toMatch(/^usage limit until \d{4}-11-25T06:00:00\.000Z$/)
  expect(k(`You've hit your weekly limit · resets ${words}`)).toBe('usage limit')
  expect(k(`API Error: 429 rate_limit_error ${words}`)).toBe('limit reached')
  expect(k(`Failed to authenticate. API Error: 401 ${words}`)).toBe('credential refused')
  expect(k(`quota exceeded ${words}`)).toBe('quota exceeded')
  expect(k(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: ${words}"}}`)).toBe('prompt too long')
  expect(k(`API Error: the model's safeguards flagged this message ${words}`)).toBe("refused by the model's safeguards")
  expect(k(words, 'error_max_structured_output_retries')).toBe('answer failed its schema')
  expect(k(`the answer did not match the JSON schema ${words}`)).toBe('answer failed its schema')
  expect(k(words, 'error_max_budget_usd')).toBe('stopped: out of budget')
  expect(k(words, 'error_max_turns')).toBe('stopped: out of turns')
  expect(k(words, words)).toBe('other') // a subtype the code doesn't know isn't kept
  expect(k(`API Error: 529 ${words}`)).toBe('overloaded')
  expect(k(`API Error: 500 ${words}`)).toBe('server error (500)')
  expect(k(`fetch failed ${words}`)).toBe('network (fetch failed)')
  expect(k(`connect ECONNRESET ${words}`)).toBe('network (ECONNRESET)')
  expect(k(`HTTP 503 ${words}`)).toBe('network (HTTP 503)')
  expect(k(`API Error: 418 {"type":"error","error":{"type":"${words.toLowerCase()}"}}`)).toBe('other (418)')
  expect(k(words)).toBe('other')
  expect(failureKind(`claude failed (null): ${words}`)).toBe('other (killed)')
  expect(failureKind('claude timed out after 600 s')).toBe('timed out')
  // Words that name no failure of their own: a request turned away for its schema isn't an answer that failed one, and a
  // context window or safeguards merely named aren't a prompt too long or a refusal.
  expect(k(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Invalid JSON schema ${words}"}}`)).toBe('other (400 invalid_request_error)')
  expect(k(`the context window is 200k ${words}`)).toBe('other')
  expect(k(`see the model's safeguards ${words}`)).toBe('other')
})

test("a CLI message that only looks like ours keeps none of its words: our kinds are fixed words and numbers", () => {
  expect(failureKind(`claude failed (1): other (${words})`)).toBe('other')
  expect(failureKind(`claude failed (1): network (${words})`)).toBe('other')
  expect(failureKind(`claude failed (1): server error (${words})`)).toBe('other')
  expect(failureKind(`claude failed (1): usage limit until ${words}`)).toBe('usage limit')
  expect(failureKind('claude failed (1): other (400 invalid_request_error)')).toBe('other (400 invalid_request_error)')
})

test("on GitHub a failed call says its kind in our words; on the Mac the CLI's text as before", () => {
  process.env.GITHUB_ACTIONS = 'true'
  expect(failureMessage('claude failed (1)', `API Error: 500 ${words}`)).toBe('claude failed (1): server error (500)')
  expect(failureMessage('claude failed (1)', `prompt is too long ${words}`)).toBe('claude failed (1): prompt too long')
  expect(failureMessage('claude failed (1)', `other (${words})`)).toBe('claude failed (1): other')
  expect(failureMessage('claude returned non-JSON (1)', `<html>${words}`)).toBe('claude returned non-JSON (1): answer not JSON')
  expect(failureMessage('claude returned non-JSON (1)', `Invalid bearer token ${words}`)).toBe('claude returned non-JSON (1): credential refused')
  expect(failureMessage('claude returned non-JSON (143)', '')).toBe('claude returned non-JSON (143): no answer')
  expect(failureMessage('claude returned non-JSON (null)', words)).toBe('claude returned non-JSON (null): other (killed)')
  delete process.env.GITHUB_ACTIONS
  expect(failureMessage('claude failed (1)', `API Error: 500 ${words}`)).toBe(`claude failed (1): API Error: 500 ${words}`)
})

test('every reader of a failure reads ours on GitHub as it reads the CLI\'s on the Mac', () => {
  // What each reads off a failure: the steps' kind; the accounts' set-aside and reset, and the reset on its own; the cycle's
  // check for a rejected credential; the gate's and the fit step's stop (accountsOut); the photo steps' stop; the photo check's kind.
  const read = (m: string) => [errorKind(m), outOf(m), resetOf(m), credentialRejected(`https://example.org/a: ${m}`), accountsOut(new LlmError(m)), photoModelStop(new LlmError(m)) === 'usage limit']
  const cases: [string, string, string?][] = [
    ['claude failed (1)', "You've hit your weekly limit · resets Nov 25 at 6am (UTC)"],
    ['claude failed (1)', "You've hit your limit · resets 3pm (Asia/Ho_Chi_Minh)"],
    ['claude failed (1)', 'Claude AI usage limit reached|1762300800'],
    ['claude failed (1)', 'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}'],
    ['claude failed (1)', 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}'],
    ['claude failed (1)', 'quota exceeded'],
    ['claude failed (1)', 'API Error: 503 Service Unavailable'],
    ['claude failed (1)', 'HTTP 503 Service Unavailable'],
    ['claude failed (1)', 'fetch failed'],
    ['claude failed (1)', 'connect ECONNRESET 10.0.0.1:443'],
    ['claude failed (1)', 'socket hang up'],
    ['claude failed (1)', 'API Error: 529 {"type":"error","error":{"type":"overloaded_error"}}'],
    ['claude failed (1)', 'API Error: 500 {"type":"error","error":{"type":"api_error"}}'],
    ['claude failed (1)', 'API Error: 400 prompt is too long: 210000 tokens > 200000 maximum'],
    ['claude failed (1)', 'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Invalid JSON schema"}}'],
    ['claude failed (1)', "API Error: the model's safeguards flagged this message"],
    ['claude failed (1)', 'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.image.source.base64: image exceeds 5 MB maximum"}}'],
    ['claude failed (1)', "API Error: Claude's response exceeded the 32000 output token maximum."],
    ['claude failed (1)', '', 'error_max_turns'],
    ['claude failed (1)', '', 'error_max_budget_usd'],
    ['claude failed (1)', words],
    ['claude returned non-JSON (1)', 'Invalid bearer token'],
    ['claude returned non-JSON (1)', "You've hit your weekly limit"],
    ['claude returned non-JSON (1)', "You've hit your weekly limit · resets Nov 25 at 6am (UTC)"],
    ['claude returned non-JSON (1)', 'Claude AI usage limit reached|1762300800'],
    ['claude returned non-JSON (1)', 'limit reached|1762300800'],
    ['claude failed (1)', "You've hit your weekly limit · resets Nov 25 at 6am (UTC); Invalid bearer token"],
    ['claude returned non-JSON (1)', '<html>'],
    ['claude returned non-JSON (1)', 'fetch failed'],
    ['claude failed (1)', 'Failed to fetch image: HTTP 503'],
    ['claude failed (1)', 'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long"}} after HTTP 503'],
    ['claude failed (1)', 'Failed to authenticate; fetch failed'],
    ['claude failed (1)', 'quota exceeded; HTTP 503'],
    ['claude returned non-JSON (1)', 'fetch failed: EHOSTUNREACH'],
    ['claude failed (1)', 'connect EHOSTUNREACH 10.0.0.1:443'],
    ['claude failed (1)', "You've hit your weekly limit; Invalid bearer token"],
    ['claude failed (1)', 'API Error: 403 request rejected'],
    ['claude failed (1)', 'Reached max turns limit', 'error_max_turns'],
    ['claude returned non-JSON (143)', ''],
    ['claude returned non-JSON (null)', ''],
  ]
  for (const [head, text, subtype] of cases) {
    const mac = `${head}: ${text}`
    process.env.GITHUB_ACTIONS = 'true'
    const ours = failureMessage(head, text, subtype ? { subtype } : undefined)
    delete process.env.GITHUB_ACTIONS
    expect(read(ours), `${mac} -> ${ours}`).toEqual(read(mac))
    // The photo check's kind and the photo steps' stop line, the same on both, but where the subtype, which only the call
    // itself sees, names it more closely on GitHub.
    if (!subtype) expect([modelFailureKind(new LlmError(ours)), photoModelStop(new LlmError(ours))], ours).toEqual([modelFailureKind(new LlmError(mac)), photoModelStop(new LlmError(mac))])
    expect(ours).not.toContain(words)
    expect(ours).not.toMatch(/10\.0\.0\.1|Invalid bearer|hit your|Service Unavailable/)
  }
  // The reset survives in our words: the accounts set the account aside with the same time.
  process.env.GITHUB_ACTIONS = 'true'
  expect(resetOf(failureMessage('claude failed (1)', "You've hit your weekly limit · resets Nov 25 at 6am (UTC)"))).toBe(resetOf('resets Nov 25 at 6am (UTC)'))
})

test("the Site lead's kinds of its own: an image the API couldn't take, and an answer cut off at the most it may write (19 Nov)", () => {
  const k = (text: string, result?: { stop_reason?: string }) => failureKind(`claude failed (1): ${text}`, result)
  expect(k(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.0.content.0.image.source.base64: image exceeds 5 MB maximum ${words}"}}`)).toBe('image refused')
  expect(k(`Could not process image ${words}`)).toBe('image refused')
  expect(k(`API Error: Claude's response exceeded the 32000 output token maximum. ${words}`)).toBe('answer cut off')
  expect(k(words, { stop_reason: 'max_tokens' })).toBe('answer cut off')
  // A request that asked to write too much is ours to fix, not an answer cut off; output that isn't JSON is apart too.
  expect(k(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"max_tokens: 64000 > 32000 ${words}"}}`)).toBe('other (400 invalid_request_error)')
  expect(failureKind(`claude returned non-JSON (1): {"type":"res ${words}`)).toBe('answer not JSON')
})

test("beside a failed call on GitHub, a line of ours: the kind, the model, the step, the page, the try, the exit code or signal, the sentence's hash for \"other\", and the place a malformed request names (the Site lead, 19 Nov)", () => {
  const base = { model: 'sonnet', step: 'rewrite', attempt: 2, code: 1, signal: null }
  const other = `API Error: 418 something odd happened, request 1234 ${words}`
  expect(failureDetail({ ...base, page: 'danio-rerio', message: `claude failed (1): other (418)`, text: other })).toBe(`claude: a call failed: other (418); model sonnet; step rewrite; page danio-rerio; try 2; exit 1; sentence ${sentenceHash(other)}`)
  expect(failureDetail({ ...base, code: null, signal: 'SIGTERM', message: 'claude timed out after 600 s' })).toBe('claude: a call failed: timed out; model sonnet; step rewrite; try 2; signal SIGTERM')
  // The hash: the same sentence with another number is the same error; another sentence isn't. Only for "other".
  expect(sentenceHash(other.replace('1234', '98765'))).toBe(sentenceHash(other))
  expect(sentenceHash(`${other} again`)).not.toBe(sentenceHash(other))
  expect(failureDetail({ ...base, message: 'claude failed (1): server error (500)', text: `API Error: 500 ${words}` })).not.toMatch(/sentence/)
  // The place a malformed request names: letters, digits, dots and underscores, 80 at most, or nothing at all.
  const refused = (message: string) => `API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"${message}"}}`
  expect(refusedAt(refused(`messages.0.content.0.source: ${words} is not valid`))).toBe('messages.0.content.0.source')
  expect(failureDetail({ ...base, message: 'claude failed (1): other (400 invalid_request_error)', text: refused(`messages.0.content.0.source: ${words}`) })).toMatch(/; at messages\.0\.content\.0\.source$/)
  for (const m of [`messages[0] content: ${words}`, `${words} and more: x`, `a/b: x`, `${'a'.repeat(81)}: x`, `no place named here ${words}`]) expect(refusedAt(refused(m)), m).toBeUndefined()
  expect(refusedAt(`API Error: 500 {"type":"error","error":{"type":"api_error","message":"messages.0: x"}}`)).toBeUndefined() // only a malformed request's
  // The status, the type and the message of one error object: another error's type elsewhere in the text doesn't count.
  expect(refusedAt(`API Error: 400 {"type":"error","error":{"type":"permission_error","message":"other.field: ${words}"},"meta":{"type":"invalid_request_error"}}`)).toBeUndefined()
  expect(refusedAt(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"no place ${words}"}} "message":"other.field: x"`)).toBeUndefined()
  expect(refusedAt(`${refused('messages.1.content: x')} and then ${words}`)).toBe('messages.1.content')
  // The object read whole: an escaped quote or a nested object inside it, and one cut short (the review keeps 300 characters) is nothing.
  expect(refusedAt(`API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"messages.2.text: a \\"quoted\\" {brace}"},"x":{"y":{}}}`)).toBe('messages.2.text')
  expect(refusedAt(refused('messages.3.text: x').slice(0, 60))).toBeUndefined()
  // None of the tool's words but that place.
  expect(failureDetail({ ...base, message: 'claude failed (1): other', text: other })).not.toContain(words)
})
