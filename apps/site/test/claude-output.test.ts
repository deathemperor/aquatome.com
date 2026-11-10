import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, expect, test, vi } from 'vitest'

// A `claude` that prints what the test gives it, in those chunks, as the pipe hands a long answer over: cut at any byte.
// The engine's runner lost a letter this way on 40 pages (2026-11-10); this one reads the browser checks' reviewer.
const printed = vi.hoisted(() => ({ stream: 'stdout', chunks: [] as Buffer[] }))
vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough() })
    child.stdin.on('finish', () => {
      const stream = printed.stream === 'stdout' ? child.stdout : child.stderr
      for (const chunk of printed.chunks) stream.write(chunk)
      stream.end()
      setImmediate(() => child.emit('close', printed.stream === 'stdout' ? 0 : 1))
    })
    return child
  },
}))
import { claude, resetAccounts } from '../e2e/claude-accounts'

afterEach(() => { vi.unstubAllEnvs(); resetAccounts() })

test.each(['stdout', 'stderr'])('a character cut between %s chunks is read whole', async stream => {
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKENS', '')
  vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN', '')
  resetAccounts()
  const text = 'ที่เพาะ, cá bảy màu'
  const bytes = Buffer.from(stream === 'stdout' ? JSON.stringify({ structured_output: { text } }) : text)
  const thai = bytes.indexOf(Buffer.from('เ')) + 1, viet = bytes.indexOf(Buffer.from('ả')) + 1
  printed.stream = stream
  printed.chunks = [bytes.subarray(0, thai), bytes.subarray(thai, viet), bytes.subarray(viet)]
  const answer = claude([], '.', 'test')
  if (stream === 'stdout') expect(await answer).toEqual({ text })
  else await expect(answer).rejects.toThrow(`claude returned non-JSON (1): ${text}`)
})
