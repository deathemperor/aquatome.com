import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { claude, parseTokens, resetAccounts } from '../e2e/claude-accounts'
import { usageLimit } from '../e2e/claude-limit'

// A stand-in `claude` first on PATH: it answers by the token it runs on (`login`: none, the CLI's own login), from
// <token>.json and <token>.code beside it, and notes each call's token and whether it saw the list.
const STUB = `#!/bin/sh
cat > /dev/null
d="$(dirname "$0")"
t="\${CLAUDE_CODE_OAUTH_TOKEN:-login}"
echo "$t\${CLAUDE_CODE_OAUTH_TOKENS:+ +list}" >> "$d/calls"
cat "$d/$t.json"
exit "$(cat "$d/$t.code")"
`
const WEEKLY = "You've hit your weekly limit · resets Nov 5 at 6am (UTC)"
const ANSWERS: Record<string, [number, object]> = {
  login: [0, { structured_output: { findings: ['login'] } }],
  'tok-ok': [0, { structured_output: { findings: ['ok'] } }],
  'tok-weekly': [1, { is_error: true, result: WEEKLY }],
  'tok-session': [1, { is_error: true, result: 'Claude AI usage limit reached|1762300800' }],
  'tok-bad': [1, { is_error: true, result: 'Failed to authenticate. API Error: 401 Invalid bearer token' }],
}
let dir = ''
const saved = { path: process.env.PATH, list: process.env.CLAUDE_CODE_OAUTH_TOKENS, one: process.env.CLAUDE_CODE_OAUTH_TOKEN }
const restore = (k: string, v?: string) => { if (v === undefined) delete process.env[k]; else process.env[k] = v }
const tokens = (list?: string, one?: string) => { restore('CLAUDE_CODE_OAUTH_TOKENS', list); restore('CLAUDE_CODE_OAUTH_TOKEN', one) }
const calls = () => { try { return readFileSync(join(dir, 'calls'), 'utf8').trim().split('\n') } catch { return [] } }
const ask = () => claude<{ findings: string[] }>(['-p'], dir, 'the prompt')
let logs: string[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aq-claude-'))
  writeFileSync(join(dir, 'claude'), STUB)
  chmodSync(join(dir, 'claude'), 0o755)
  for (const [t, [code, json]] of Object.entries(ANSWERS)) {
    writeFileSync(join(dir, `${t}.json`), JSON.stringify(json))
    writeFileSync(join(dir, `${t}.code`), String(code))
  }
  process.env.PATH = `${dir}:${saved.path}`
  resetAccounts()
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  restore('PATH', saved.path)
  tokens(saved.list, saved.one)
  vi.restoreAllMocks()
})

test('parseTokens: the list one a line (blank lines, spaces and CRLF ignored), then the single secret; each once', () => {
  expect(parseTokens(' tok-a \r\n\r\n  \ntok-b\r\n', 'tok-x')).toEqual(['tok-a', 'tok-b', 'tok-x'])
  expect(parseTokens('tok-a\ntok-x\n', 'tok-x')).toEqual(['tok-a', 'tok-x'])
  expect(parseTokens('tok-a\ntok-b', undefined)).toEqual(['tok-a', 'tok-b'])
  expect(parseTokens('', 'tok-x')).toEqual(['tok-x'])
  expect(parseTokens(undefined, '')).toEqual([])
})

test('token 1 out of its weekly limit: the same review runs on token 2, and later reviews start there', async () => {
  tokens('tok-weekly\r\ntok-ok\r\n')
  expect(await ask()).toEqual({ findings: ['ok'] })
  expect(await ask()).toEqual({ findings: ['ok'] })
  expect(calls()).toEqual(['tok-weekly', 'tok-ok', 'tok-ok']) // and no call saw the list
  expect(logs).toHaveLength(1)
  expect(logs[0]).toMatch(/^claude: token 1 \([0-9a-f]{8}\) set aside: usage limit$/)
})

test('every token out of its limit: skipped as the usage limit, and later reviews fail without calling', async () => {
  tokens('tok-weekly\ntok-session')
  const e: Error = await ask().catch(e => e)
  expect(usageLimit(e.message)).toBe('Claude usage limit: Claude AI usage limit reached|1762300800')
  await expect(ask()).rejects.toThrow(e.message)
  expect(calls()).toEqual(['tok-weekly', 'tok-session'])
})

test('a rejected token is skipped; every token rejected fails the review (not a skip)', async () => {
  tokens('tok-bad\ntok-ok')
  expect(await ask()).toEqual({ findings: ['ok'] })
  expect(logs.join('\n')).toMatch(/token 1 \([0-9a-f]{8}\) set aside: credential rejected/)
  resetAccounts()
  tokens(undefined, 'tok-bad')
  const e: Error = await ask().catch(e => e)
  expect(e.message).toMatch(/^claude failed \(1\): Failed to authenticate/)
  expect(usageLimit(e.message)).toBeUndefined()
  expect(logs.join('\n')).not.toMatch(/tok-/)
})

test('no token at all: the CLI on its own login, as before', async () => {
  tokens(undefined, undefined)
  expect(await ask()).toEqual({ findings: ['login'] })
  expect(calls()).toEqual(['login'])
})
