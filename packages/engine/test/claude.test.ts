import { EventEmitter } from 'node:events'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, expect, test, vi } from 'vitest'

// A `claude` that answers at once with what the CLI prints: the structured output, its cost and tokens.
vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: () => true })
    child.stdin.on('finish', () => {
      child.stdout.end(JSON.stringify({ structured_output: { ok: true }, total_cost_usd: 0.12, usage: { input_tokens: 3, output_tokens: 40 } }))
      setImmediate(() => child.emit('close', 0))
    })
    return child
  },
}))
const { claudeCli } = await import('../src/claude')
const { resetAccounts, tokenHash } = await import('../src/claude-accounts')
const call = () => claudeCli<{ ok: boolean }>({ system: 's', prompt: 'p', schema: {}, model: 'opus' })

afterEach(() => { delete process.env.ENGINE_COST_LOG; delete process.env.CLAUDE_CODE_OAUTH_TOKENS; resetAccounts() })

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
