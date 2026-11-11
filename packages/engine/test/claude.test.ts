import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { mkdtemp, readdir, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// A `claude` that answers at once with what the CLI prints: the structured output, its cost and tokens.
const spawned = vi.hoisted(() => [] as { cwd: string; env?: NodeJS.ProcessEnv }[])
// What the next `claude` prints instead, as the pipe hands it over: in these chunks.
const printed = vi.hoisted(() => ({ chunks: undefined as Buffer[] | undefined }))
vi.mock('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }) => {
    spawned.push(opts)
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true })
    child.stdin.on('finish', () => {
      const chunks = printed.chunks
      printed.chunks = undefined
      if (chunks) { for (const c of chunks) child.stdout.write(c); child.stdout.end() }
      else child.stdout.end(JSON.stringify({ structured_output: { ok: true }, total_cost_usd: 0.12, usage: { input_tokens: 3, output_tokens: 40 } }))
      setImmediate(() => child.emit('close', 0))
    })
    return child
  },
}))
const { LlmError, claudeCli, claudeResearch } = await import('../src/claude')
const { CEILINGS, tableInForce } = await import('../src/ceiling')
const { accountReport, resetAccounts, tokenHash } = await import('../src/claude-accounts')
const { errorKind } = await import('../src/state')
const call = () => claudeCli<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {}, model: 'opus' })

// No account but a test's own: the engine's runs have theirs in the environment (on 8 November GitHub's
// CLAUDE_CODE_OAUTH_TOKEN made a line name it, and the rewrite part's cycle didn't publish).
const noAccounts = () => { delete process.env.CLAUDE_CODE_OAUTH_TOKEN; delete process.env.CLAUDE_CODE_OAUTH_TOKENS; resetAccounts() }
// The cycles export ENGINE_COST_LOG and then run these tests. A mocked call must not append to that file.
beforeEach(() => { delete process.env.ENGINE_COST_LOG; noAccounts() })
afterEach(() => { delete process.env.ENGINE_COST_LOG; noAccounts() })

test('a call that reads no files runs from an empty folder, not /tmp, whose every checkout the CLI would list', async () => {
  spawned.length = 0
  await call()
  await claudeResearch<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {} })
  expect(spawned).toHaveLength(2)
  for (const { cwd } of spawned) {
    expect(await realpath(cwd)).not.toBe(await realpath('/tmp'))
    expect(await readdir(cwd)).toEqual([])
  }
})

test('a call that reads no files runs from an empty folder, not /tmp, whose every checkout the CLI would list', async () => {
  spawned.length = 0
  await call()
  await claudeResearch<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {} })
  expect(spawned).toHaveLength(2)
  for (const { cwd } of spawned) {
    expect(await realpath(cwd)).not.toBe(await realpath('/tmp'))
    expect(await readdir(cwd)).toEqual([])
  }
})

// The pipe hands a long answer over in chunks, cut at any byte. Each chunk decoded by itself turned a character cut in two
// into "\uFFFD\uFFFD": 40 pages had one on 2026-11-10, 38 of them Thai, whose every letter is three bytes ("ที่\uFFFD\uFFFDพาะ"
// for "ที่เพาะ" on the guppy's page), and the translation reviewer marked each page down for it.
test('a character the pipe cuts in two between chunks of the answer is read whole', async () => {
  const text = 'มีสายพันธุ์ที่เพาะในตู้ปลา, cá bảy màu'
  const bytes = Buffer.from(JSON.stringify({ structured_output: { text }, total_cost_usd: 0, usage: {} }))
  // Cut inside "เ" (three bytes), and inside "ả" further on.
  const thai = bytes.indexOf(Buffer.from('เ')) + 1, viet = bytes.indexOf(Buffer.from('ả')) + 1
  printed.chunks = [bytes.subarray(0, thai), bytes.subarray(thai, viet), bytes.subarray(viet)]
  expect(await claudeCli<{ text: string }>({ system: 's', prompt: 'p', schema: {} })).toEqual({ text })
})

test('ENGINE_COST_LOG gets a line a call; a log it cannot write never fails the call', async () => {
  const log = join(await mkdtemp(join(tmpdir(), 'cost-')), 'cost.jsonl')
  process.env.ENGINE_COST_LOG = log
  expect(await call()).toEqual({ ok: true })
  expect(JSON.parse(await readFile(log, 'utf8'))).toMatchObject({ model: 'opus', usd: 0.12, in: 3, out: 40, error: false, account: 'login' })
  process.env.ENGINE_COST_LOG = join(log, 'not-a-folder', 'cost.jsonl')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(await call()).toEqual({ ok: true })
})

// 2026-11-08: a week's use couldn't be split by job or account, as the log didn't say which account a call went to.
test('each line names the account the call went to, by its token\'s hash, never the token', async () => {
  const log = join(await mkdtemp(join(tmpdir(), 'cost-')), 'cost.jsonl')
  process.env.ENGINE_COST_LOG = log
  process.env.CLAUDE_CODE_OAUTH_TOKENS = 'tok-first\ntok-second'
  resetAccounts()
  await call()
  const text = await readFile(log, 'utf8')
  expect(JSON.parse(text)).toMatchObject({ account: tokenHash('tok-first'), model: 'opus' })
  expect(text).not.toContain('tok-first')
})

// A hand run from inside a session carried these into the child; a scheduled run has none of them. Both must call the
// model the same way (2026-11-11).
const SESSION = ['CLAUDE_EFFORT', 'CLAUDECODE', 'CLAUDE_AGENT_SDK_VERSION', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH', 'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ATTENDED', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID', 'ANTHROPIC_MODEL', 'MAX_THINKING_TOKENS']
const setSession = () => { for (const name of SESSION) process.env[name] = 'from-session'; process.env.AQ_TEST_KEEP = 'keep' }
const clearSession = () => { for (const name of SESSION) delete process.env[name]; delete process.env.AQ_TEST_KEEP }
const dropped = (env: NodeJS.ProcessEnv) => { for (const name of SESSION) expect(env[name]).toBeUndefined() }

test('a call with an account drops the session variables and keeps only that account\'s token', async () => {
  setSession()
  // The list is set so the child must not see it; the account the call uses is tok-a.
  process.env.CLAUDE_CODE_OAUTH_TOKENS = 'tok-a'
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'tok-a'
  resetAccounts()
  spawned.length = 0
  try {
    await call()
    const env = spawned[0]?.env
    expect(env).toBeDefined()
    dropped(env!)
    expect(env!.CLAUDE_CODE_OAUTH_TOKENS).toBeUndefined()
    expect(env!.CLAUDE_CODE_OAUTH_TOKEN).toBe('tok-a')
    expect(env!.AQ_TEST_KEEP).toBe('keep')
    expect(env!.PATH).toBe(process.env.PATH)
  } finally {
    clearSession()
  }
})

test('a call with no account still gets a cleaned env, and so does claudeResearch', async () => {
  setSession()
  spawned.length = 0
  try {
    await call()
    const env = spawned[0]?.env
    expect(env).toBeDefined()
    dropped(env!)
    expect(env!.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    expect(env!.CLAUDE_CODE_OAUTH_TOKENS).toBeUndefined()
    expect(env!.AQ_TEST_KEEP).toBe('keep')
    expect(env!.PATH).toBe(process.env.PATH)
    spawned.length = 0
    await claudeResearch<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {} })
    const research = spawned[0]?.env
    expect(research).toBeDefined()
    dropped(research!)
    expect(research!.AQ_TEST_KEEP).toBe('keep')
  } finally {
    clearSession()
  }
})

// The ceiling is the engine's own limit. At it, the call fails the way a usage limit does, and the account stays in use.
test('under its ceiling the call is made; at the ceiling no claude is spawned and no account is set aside', async () => {
  const log = join(await mkdtemp(join(tmpdir(), 'cost-')), 'cost.jsonl')
  process.env.ENGINE_COST_LOG = log
  const now = new Date(Math.max(Date.now(), ...CEILINGS.map(t => new Date(t.from).getTime())))
  const table = tableInForce(CEILINGS, now)
  expect(table).toBeDefined()
  const found = Object.entries(table!.steps).find(([, n]) => typeof n === 'number' && n > 0)
  const step = found?.[0] ?? 'ceiling-unlisted'
  const cap = typeof found?.[1] === 'number' ? found[1] : table!.default
  expect(cap).toBeGreaterThan(0)
  const argv2 = process.argv[2]
  process.argv[2] = step
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  process.env.CLAUDE_CODE_OAUTH_TOKENS = 'tok-ceiling'
  resetAccounts()
  spawned.length = 0
  try {
    expect(await call()).toEqual({ ok: true })
    expect(spawned).toHaveLength(1)
    writeFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), step, usd: cap })}\n`)
    spawned.length = 0
    const e = await call().catch((err: unknown) => err)
    expect(spawned).toHaveLength(0)
    expect(e).toBeInstanceOf(LlmError)
    expect(errorKind((e as Error).message)).toBe('usage')
    expect(accountReport()).toEqual([`token 1 (${tokenHash('tok-ceiling')}): 1 answered`])
  } finally {
    vi.useRealTimers()
    if (argv2 === undefined) process.argv.splice(2, 1)
    else process.argv[2] = argv2
    delete process.env.CLAUDE_CODE_OAUTH_TOKENS
    resetAccounts()
  }
})
