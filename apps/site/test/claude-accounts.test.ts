import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ceilingStop, claude, parseTokens, resetAccounts } from '../e2e/claude-accounts'
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
  'tok-paid': [0, { structured_output: { findings: ['paid'] }, result: 'the answer, never logged', total_cost_usd: 0.3, usage: { input_tokens: 12, output_tokens: 34, cache_creation_input_tokens: 5, cache_read_input_tokens: 6 } }],
  'tok-paid-limit': [1, { is_error: true, result: WEEKLY, total_cost_usd: 0.6 }],
  'tok-broke': [1, { is_error: true, result: 'the schema was not met, never logged', total_cost_usd: 0.2, usage: { input_tokens: 1, output_tokens: 2 } }],
  'tok-weekly': [1, { is_error: true, result: WEEKLY }],
  'tok-session': [1, { is_error: true, result: 'Claude AI usage limit reached|1762300800' }],
  'tok-bad': [1, { is_error: true, result: 'Failed to authenticate. API Error: 401 Invalid bearer token' }],
}
let dir = ''
const saved = { path: process.env.PATH, list: process.env.CLAUDE_CODE_OAUTH_TOKENS, one: process.env.CLAUDE_CODE_OAUTH_TOKEN }
const COST = ['CLAUDE_COST_STEP', 'CLAUDE_COST_LOG', 'CLAUDE_SPEND_LEFT'] as const
const savedCost = COST.map(k => process.env[k])
/** A workflow's step, with `left` dollars of its day when the run starts; the cost log beside the stand-in. */
const onCi = (left: string | undefined, step = 'page-review') => { process.env.CLAUDE_COST_STEP = step; process.env.CLAUDE_COST_LOG = join(dir, 'cost.jsonl'); restore('CLAUDE_SPEND_LEFT', left) }
const costLines = () => { try { return readFileSync(join(dir, 'cost.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>) } catch { return [] } }
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
  for (const k of COST) delete process.env[k]
  resetAccounts()
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})
afterEach(() => {
  restore('PATH', saved.path)
  tokens(saved.list, saved.one)
  COST.forEach((k, i) => restore(k, savedCost[i]))
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

// The cloud's list begins with the Mac's two sign-ins; the chief of staff (2026-11-12): the cloud starts on its third.
test('CLAUDE_FIRST_ACCOUNT: a review starts at that position and goes round to the start when it is out; no position, the first', async () => {
  const saved = process.env.CLAUDE_FIRST_ACCOUNT
  try {
    tokens('tok-ok\ntok-paid\ntok-weekly\n')
    process.env.CLAUDE_FIRST_ACCOUNT = '2'
    expect(await ask()).toEqual({ findings: ['paid'] })
    resetAccounts()
    process.env.CLAUDE_FIRST_ACCOUNT = '3'
    expect(await ask()).toEqual({ findings: ['ok'] })
    expect(logs).toEqual([expect.stringMatching(/^claude: token 3 \([0-9a-f]{8}\) set aside: usage limit$/)])
    for (const v of ['', '0', '4', 'third']) {
      resetAccounts()
      process.env.CLAUDE_FIRST_ACCOUNT = v
      await ask()
    }
    expect(calls()).toEqual(['tok-paid', 'tok-weekly', 'tok-ok', 'tok-ok', 'tok-ok', 'tok-ok', 'tok-ok'])
  } finally {
    restore('CLAUDE_FIRST_ACCOUNT', saved)
  }
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

test('on CI each call leaves a cost line: when, the step, the account by its hash, the model, dollars and tokens, and nothing of the prompt or the answer', async () => {
  tokens(undefined, 'tok-paid')
  onCi('1')
  expect(await claude<{ findings: string[] }>(['-p', '--model', 'opus'], dir, 'the prompt, never logged')).toEqual({ findings: ['paid'] })
  const lines = costLines()
  expect(lines).toHaveLength(1)
  expect(Object.keys(lines[0]!).sort()).toEqual(['account', 'at', 'cacheRead', 'cacheWrite', 'in', 'model', 'ms', 'out', 'step', 'usd'])
  expect(lines[0]).toMatchObject({ step: 'page-review', model: 'opus', usd: 0.3, in: 12, out: 34, cacheWrite: 5, cacheRead: 6 })
  expect(lines[0]!.account).toMatch(/^[0-9a-f]{8}$/)
  expect(Number.isNaN(Date.parse(lines[0]!.at as string))).toBe(false)
  const text = readFileSync(join(dir, 'cost.jsonl'), 'utf8')
  expect(text).not.toMatch(/tok-|never logged|findings|paid/)
})

test('a call that failed after it was paid for is logged too, with no word of its error', async () => {
  tokens(undefined, 'tok-broke')
  onCi('1')
  await expect(ask()).rejects.toThrow(/^claude failed \(1\): the schema was not met/)
  expect(costLines()).toEqual([expect.objectContaining({ step: 'page-review', usd: 0.2, error: true })])
  expect(readFileSync(join(dir, 'cost.jsonl'), 'utf8')).not.toMatch(/schema|never logged/)
})

test('once a run has spent what its step had left of the day, the next call is not made: no CLI started, no account set aside, and the review skips in plain words', async () => {
  tokens('tok-paid\ntok-ok')
  onCi('0.5')
  await ask()
  await ask() // $0.60 by now: the call that crosses the line still ran
  const e: Error = await ask().catch(e => e)
  expect(calls()).toEqual(['tok-paid', 'tok-paid'])
  expect(e.message).toBe("claude failed: today's ceiling for the page review is reached ($0.60 spent by this run, of the $0.50 left for today), so the call was not made")
  expect(usageLimit(e.message)).toBe("Today's ceiling for the page review is reached ($0.60 spent by this run, of the $0.50 left for today), so the call was not made")
  expect(logs).toEqual([]) // no account was set aside
  // Another step's lines in the same file don't count against this one.
  onCi('0.5', 'nightly-review')
  expect(ceilingStop()).toBeUndefined()
})

test('nothing left when the run starts, or nothing to say what is left: no call at all', async () => {
  tokens(undefined, 'tok-paid')
  onCi('0')
  await expect(ask()).rejects.toThrow("today's ceiling for the page review is reached ($0.00 spent by this run, of the $0.00 left for today)")
  for (const left of [undefined, '', 'soon']) {
    onCi(left)
    const e: Error = await ask().catch(e => e)
    expect(usageLimit(e.message)).toMatch(/^Today's spend for the page review could not be counted \(nothing says what is left of the day\)/)
  }
  expect(calls()).toEqual([])
  expect(costLines()).toEqual([])
})

test('a cost log that cannot be written stops the call: what it spent would never be counted', async () => {
  tokens(undefined, 'tok-paid')
  onCi('1')
  process.env.CLAUDE_COST_LOG = join(dir, 'no-such-folder', 'cost.jsonl')
  const e: Error = await ask().catch(e => e)
  expect(usageLimit(e.message)).toMatch(/^Today's spend for the page review could not be counted/)
  expect(calls()).toEqual([])
})

test('a step with no ceiling still logs, and a run by hand (no step named) neither logs nor stops', async () => {
  tokens(undefined, 'tok-paid')
  onCi('none')
  await ask()
  await ask()
  expect(costLines()).toHaveLength(2)
  for (const k of COST) delete process.env[k]
  await ask()
  expect(calls()).toHaveLength(3)
  expect(costLines()).toHaveLength(2)
})

test('a try that ended on a usage limit but was paid for counts before the next account is tried', async () => {
  tokens('tok-paid-limit\ntok-ok')
  onCi('0.5')
  const e: Error = await ask().catch(e => e)
  expect(usageLimit(e.message)).toMatch(/^Today's ceiling for the page review is reached \(\$0\.60 spent by this run/)
  expect(calls()).toEqual(['tok-paid-limit']) // the second account was not called
})

test("numbers only reach the line: an odd value in the CLI's usage is left out, not copied", async () => {
  writeFileSync(join(dir, 'tok-odd.json'), JSON.stringify({ structured_output: { findings: ['odd'] }, total_cost_usd: 0.1, usage: { input_tokens: 'page text', output_tokens: -3, cache_read_input_tokens: 7 } }))
  writeFileSync(join(dir, 'tok-odd.code'), '0')
  tokens(undefined, 'tok-odd')
  onCi('1')
  await ask()
  expect(Object.keys(costLines()[0]!).sort()).toEqual(['account', 'at', 'cacheRead', 'ms', 'step', 'usd'])
  expect(readFileSync(join(dir, 'cost.jsonl'), 'utf8')).not.toContain('page text')
})
