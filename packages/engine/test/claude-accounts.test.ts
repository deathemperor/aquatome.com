import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// A `claude` that answers by the token it runs on, as the CLI does: the structured output, or an error result.
const WEEKLY = "You've hit your weekly limit · resets Nov 5 at 6am (UTC)" // what the engine got on 2026-11-02
const ANSWERS: Record<string, { code: number; json: object }> = {
  'tok-ok': { code: 0, json: { structured_output: { ok: true } } },
  'tok-ok-2': { code: 0, json: { structured_output: { ok: true } } },
  'tok-weekly': { code: 1, json: { is_error: true, result: WEEKLY } },
  'tok-session': { code: 1, json: { is_error: true, result: 'Claude AI usage limit reached|1762300800' } },
  'tok-bad': { code: 1, json: { is_error: true, result: 'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token"}}' } },
  'tok-broken': { code: 1, json: { is_error: true, result: 'API Error: 400 prompt is too long' } },
}
/** Each spawn: the token it ran on (none: the CLI's own login), and whether the child saw the list. */
const spawned: { token?: string; list: boolean }[] = []
vi.mock('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
    const token = opts.env?.CLAUDE_CODE_OAUTH_TOKEN
    spawned.push({ token: opts.env ? token : undefined, list: !!opts.env?.CLAUDE_CODE_OAUTH_TOKENS })
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true })
    const a = token ? ANSWERS[token]! : ANSWERS['tok-ok']!
    child.stdin.on('finish', () => {
      child.stdout.end(JSON.stringify(a.json))
      setImmediate(() => child.emit('close', a.code))
    })
    return child
  },
}))
const { LlmError, claudeCli } = await import('../src/claude')
const { accountReport, envFor, NotTheAccount, onAccounts, outOf, parseTokens, rejectedTokens, resetAccounts, resetOf, tokenHash } = await import('../src/claude-accounts')
const { errorKind } = await import('../src/state')
const call = () => claudeCli<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {} })
const h = (t: string) => tokenHash(t)

const saved = { list: process.env.CLAUDE_CODE_OAUTH_TOKENS, one: process.env.CLAUDE_CODE_OAUTH_TOKEN }
const setTokens = (list?: string, one?: string) => {
  if (list === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKENS
  else process.env.CLAUDE_CODE_OAUTH_TOKENS = list
  if (one === undefined) delete process.env.CLAUDE_CODE_OAUTH_TOKEN
  else process.env.CLAUDE_CODE_OAUTH_TOKEN = one
}
let logs: string[] = []
// A starting position set in the shell that runs the tests would move every default-order case (the cycles set it as
// a repository variable): none here but a test's own.
const savedFirst = process.env.CLAUDE_FIRST_ACCOUNT
beforeEach(() => {
  // A stand-in call must not be written to a real cost log (vitest.config.ts): `off` is no log.
  process.env.ENGINE_COST_LOG = 'off'
  delete process.env.CLAUDE_FIRST_ACCOUNT
  spawned.length = 0
  logs = []
  resetAccounts()
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  setTokens(saved.list, saved.one)
  if (savedFirst === undefined) delete process.env.CLAUDE_FIRST_ACCOUNT
  else process.env.CLAUDE_FIRST_ACCOUNT = savedFirst
  vi.restoreAllMocks()
})

test('parseTokens: the list one a line (blank lines, spaces and CRLF ignored), then the single secret; each once', () => {
  expect(parseTokens(' tok-a \r\n\r\n   \ntok-b\r\ntok-a\n', 'tok-x')).toEqual(['tok-a', 'tok-b', 'tok-x'])
  expect(parseTokens('tok-a\ntok-x\n', 'tok-x')).toEqual(['tok-a', 'tok-x']) // the single secret already listed
  expect(parseTokens('tok-a\ntok-b', undefined)).toEqual(['tok-a', 'tok-b'])
  expect(parseTokens('', 'tok-x')).toEqual(['tok-x'])
  expect(parseTokens('\r\n \n', ' tok-x\n')).toEqual(['tok-x'])
  expect(parseTokens(undefined, '')).toEqual([])
  expect(parseTokens(undefined, undefined)).toEqual([])
})

test('outOf: the usage limit (with when it resets) and a rejected credential set an account aside; nothing else does', () => {
  expect(outOf(`claude failed (1): ${WEEKLY}`)).toMatchObject({ why: 'usage', reset: 'Nov 5 at 6am (UTC)' })
  expect(outOf("claude failed (1): You've hit your weekly limit · resets Nov 5, 6am (UTC)")?.reset).toBe('Nov 5, 6am (UTC)')
  expect(outOf('claude failed (1): Claude AI usage limit reached|1762300800')).toMatchObject({ why: 'usage', reset: new Date(1762300800_000).toISOString() })
  expect(outOf('claude failed (1): API Error: 429 rate_limit_error')).toMatchObject({ why: 'usage', reset: undefined })
  expect(outOf('claude failed (1): Failed to authenticate. API Error: 401')?.why).toBe('auth')
  expect(outOf('claude returned non-JSON (1): Invalid bearer token')?.why).toBe('auth')
  expect(outOf('claude failed (1): API Error: 400 prompt is too long')).toBeUndefined()
  expect(outOf('spawn claude ENOENT')).toBeUndefined()
  expect(resetOf('limit reached')).toBeUndefined()
})

test('token 1 out of its weekly limit: the same call answers on token 2, and later calls start there', async () => {
  setTokens('tok-weekly\ntok-ok\n')
  expect(await call()).toEqual({ ok: true })
  expect(spawned.map(s => s.token)).toEqual(['tok-weekly', 'tok-ok'])
  expect(await call()).toEqual({ ok: true })
  expect(spawned.map(s => s.token)).toEqual(['tok-weekly', 'tok-ok', 'tok-ok'])
  expect(spawned.every(s => !s.list)).toBe(true) // the child gets its own token, not the list
  expect(accountReport()).toEqual([
    `token 1 (${h('tok-weekly')}): 0 answered; set aside: usage limit until Nov 5 at 6am (UTC)`,
    `token 2 (${h('tok-ok')}): 2 answered`,
  ])
  expect(logs).toEqual([`claude: token 1 (${h('tok-weekly')}) set aside: usage limit until Nov 5 at 6am (UTC)`])
})

// The cloud's list begins with the Mac's two sign-ins; the chief of staff (2026-11-12): the cloud starts on its third and
// leaves those to the Mac until the third is out.
test('CLAUDE_FIRST_ACCOUNT: a call starts at that position, goes round to the start when it is out, and reports keep the list\'s numbers', async () => {
  const saved = process.env.CLAUDE_FIRST_ACCOUNT
  try {
    setTokens('tok-ok\ntok-ok-2\ntok-weekly\n')
    process.env.CLAUDE_FIRST_ACCOUNT = '2'
    expect(await call()).toEqual({ ok: true })
    expect(spawned.map(s => s.token)).toEqual(['tok-ok-2'])
    // The third, out of its limit: the call goes on to the first, round the list, never back to the third.
    resetAccounts()
    spawned.length = 0
    process.env.CLAUDE_FIRST_ACCOUNT = '3'
    expect(await call()).toEqual({ ok: true })
    expect(await call()).toEqual({ ok: true })
    expect(spawned.map(s => s.token)).toEqual(['tok-weekly', 'tok-ok', 'tok-ok'])
    expect(accountReport()).toEqual([
      `token 3 (${h('tok-weekly')}): 0 answered; set aside: usage limit until Nov 5 at 6am (UTC)`,
      `token 1 (${h('tok-ok')}): 2 answered`,
      `token 2 (${h('tok-ok-2')}): 0 answered`,
    ])
    // Unset, empty, or no position in the list: the first, as before.
    for (const v of [undefined, '', '0', '4', '-1', '1.5', 'third']) {
      resetAccounts()
      spawned.length = 0
      if (v === undefined) delete process.env.CLAUDE_FIRST_ACCOUNT
      else process.env.CLAUDE_FIRST_ACCOUNT = v
      await call()
      expect(spawned.map(s => s.token), String(v)).toEqual(['tok-ok'])
    }
    // The child never sees it: every CLAUDE name is dropped from its environment.
    expect(envFor('tok-ok').CLAUDE_FIRST_ACCOUNT).toBeUndefined()
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_FIRST_ACCOUNT
    else process.env.CLAUDE_FIRST_ACCOUNT = saved
  }
})

test('every token out: the usage limit as before (errorKind usage), and later calls fail without calling', async () => {
  setTokens('tok-weekly\r\ntok-session\r\n')
  const e = await call().catch(e => e)
  expect(e).toBeInstanceOf(LlmError)
  expect(e.message).toBe('claude failed (1): Claude AI usage limit reached|1762300800')
  expect(errorKind(e.message)).toBe('usage')
  expect(spawned).toHaveLength(2)
  await expect(call()).rejects.toThrow(e.message)
  expect(spawned).toHaveLength(2)
  expect(accountReport()).toEqual([
    `token 1 (${h('tok-weekly')}): 0 answered; set aside: usage limit until Nov 5 at 6am (UTC)`,
    `token 2 (${h('tok-session')}): 0 answered; set aside: usage limit until ${new Date(1762300800_000).toISOString()}`,
  ])
})

test('one out of its limit, the other rejected: the call fails with the usage limit, so the page is retried first next run', async () => {
  setTokens('tok-weekly\ntok-bad')
  const e = await call().catch(e => e)
  expect(errorKind(e.message)).toBe('usage')
  expect(rejectedTokens()).toBe(`token 2 (${h('tok-bad')}) in CLAUDE_CODE_OAUTH_TOKENS`)
})

test('a rejected credential is skipped and named by number and hash', async () => {
  setTokens('tok-bad\ntok-ok')
  expect(await call()).toEqual({ ok: true })
  expect(spawned.map(s => s.token)).toEqual(['tok-bad', 'tok-ok'])
  expect(accountReport()).toEqual([`token 1 (${h('tok-bad')}): 0 answered; set aside: credential rejected`, `token 2 (${h('tok-ok')}): 1 answered`])
  expect(rejectedTokens()).toBe(`token 1 (${h('tok-bad')}) in CLAUDE_CODE_OAUTH_TOKENS`)
})

test('every token rejected: the rejection, which fails the cycle (cli.ts)', async () => {
  setTokens(undefined, 'tok-bad')
  const e = await call().catch(e => e)
  expect(e).toBeInstanceOf(LlmError)
  expect(e.message).toMatch(/Failed to authenticate/)
  expect(rejectedTokens()).toBe(`token 1 (${h('tok-bad')}) in CLAUDE_CODE_OAUTH_TOKEN`) // the single secret: that is what to replace
})

test('the list, then the single secret: the first account takes its turn last, and a rejection names its secret', async () => {
  setTokens('tok-weekly', 'tok-bad')
  const e = await call().catch(e => e)
  expect(spawned.map(s => s.token)).toEqual(['tok-weekly', 'tok-bad'])
  expect(errorKind(e.message)).toBe('usage')
  expect(rejectedTokens()).toBe(`token 2 (${h('tok-bad')}) in CLAUDE_CODE_OAUTH_TOKEN`)
})

// The engine's own ceiling for the day (ceiling.ts) reads as a usage limit to the steps. It is not the account's: the
// account stays in use and the next one isn't tried, before the first try or between two.
test('a stop that is not the account\'s goes straight up: no account is set aside and the next is not tried', async () => {
  const ceiling = 'claude failed: the engine\'s daily limit reached for run ($30.00 of $30 today)'
  const fail = (m: string) => new LlmError(m)
  setTokens('tok-one\ntok-two')
  const tried: (string | undefined)[] = []
  const first = await onAccounts(async t => { tried.push(t); throw new NotTheAccount(ceiling) }, fail).catch((e: unknown) => e)
  expect(first).toBeInstanceOf(LlmError)
  expect((first as Error).message).toBe(ceiling)
  expect(errorKind((first as Error).message)).toBe('usage')
  expect(tried).toEqual(['tok-one'])
  // The first account runs out for real, and by the time the second would be tried the step is at its ceiling.
  tried.length = 0
  const second = await onAccounts(async t => {
    tried.push(t)
    throw t === 'tok-one' ? new LlmError("claude failed (1): You've hit your weekly limit · resets Nov 14 at 8am (Asia/Saigon)") : new NotTheAccount(ceiling)
  }, fail).catch((e: unknown) => e)
  expect((second as Error).message).toBe(ceiling)
  expect(tried).toEqual(['tok-one', 'tok-two'])
  const report = accountReport()
  expect(report).toHaveLength(2)
  expect(report[0]).toContain('usage limit')
  expect(report[1]).toBe(`token 2 (${tokenHash('tok-two')}): 0 answered`)
  // With no account at all (the CLI's own login), the same.
  setTokens()
  resetAccounts()
  const none = await onAccounts(async () => { throw new NotTheAccount(ceiling) }, fail).catch((e: unknown) => e)
  expect(none).toBeInstanceOf(LlmError)
  expect((none as Error).message).toBe(ceiling)
})

test('any other failure fails the call on its own account, which stays in use', async () => {
  setTokens('tok-broken\ntok-ok')
  await expect(call()).rejects.toThrow('prompt is too long')
  expect(spawned.map(s => s.token)).toEqual(['tok-broken'])
  expect(accountReport()).toEqual([])
})

test('no list: the single secret; neither: the CLI as it is, on its own login, with no report', async () => {
  setTokens('', 'tok-ok')
  expect(await call()).toEqual({ ok: true })
  expect(spawned.map(s => s.token)).toEqual(['tok-ok'])
  resetAccounts()
  setTokens(undefined, undefined)
  expect(await call()).toEqual({ ok: true })
  expect(spawned[1]).toEqual({ token: undefined, list: false })
  expect(accountReport()).toEqual([])
})

test('the report and the log name tokens by number and hash, never the token', async () => {
  setTokens('tok-weekly\ntok-bad\ntok-ok-2')
  await call()
  const text = [...accountReport(), ...logs, rejectedTokens()].join('\n')
  expect(text).toContain(`token 3 (${h('tok-ok-2')}): 1 answered`)
  expect(text).not.toMatch(/tok-/)
})
