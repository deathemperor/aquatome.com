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
const { accountReport, outOf, parseTokens, rejectedTokens, resetAccounts, resetOf, tokenHash } = await import('../src/claude-accounts')
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
beforeEach(() => {
  spawned.length = 0
  logs = []
  resetAccounts()
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  setTokens(saved.list, saved.one)
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
