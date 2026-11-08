import { EventEmitter } from 'node:events'
import { mkdtemp, readdir, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// A `claude` that answers at once with what the CLI prints: the structured output, its cost and tokens.
const spawned = vi.hoisted(() => [] as { cwd: string }[])
vi.mock('node:child_process', () => ({
  spawn: (_cmd: string, _args: string[], opts: { cwd: string }) => {
    spawned.push(opts)
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true })
    child.stdin.on('finish', () => {
      child.stdout.end(JSON.stringify({ structured_output: { ok: true }, total_cost_usd: 0.12, usage: { input_tokens: 3, output_tokens: 40 } }))
      setImmediate(() => child.emit('close', 0))
    })
    return child
  },
}))
const { claudeCli, claudeResearch } = await import('../src/claude')
const { resetAccounts, tokenHash } = await import('../src/claude-accounts')
const call = () => claudeCli<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {}, model: 'opus' })

// No account but a test's own: the engine's runs have theirs in the environment (on 8 November GitHub's
// CLAUDE_CODE_OAUTH_TOKEN made a line name it, and the rewrite part's cycle didn't publish).
const noAccounts = () => { delete process.env.CLAUDE_CODE_OAUTH_TOKEN; delete process.env.CLAUDE_CODE_OAUTH_TOKENS; resetAccounts() }
beforeEach(noAccounts)
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
