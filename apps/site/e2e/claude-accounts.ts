import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { usageLimit } from './claude-limit'

/**
 * Headless Claude Code on the owner's Claude subscription accounts, as the engine uses them
 * (packages/engine/src/claude-accounts.ts, copied: the site doesn't import from the engine). One OAuth token an account,
 * one a line in CLAUDE_CODE_OAUTH_TOKENS; else the single CLAUDE_CODE_OAUTH_TOKEN; else the CLI's own login. A call goes to
 * the first account not set aside; out of its usage limit, or with its token rejected, the account is set aside for the
 * rest of this process (a Playwright worker) and the same call goes to the next. A token is never printed: the log names
 * it by its number in the list and the first 8 hex of its SHA-256.
 */

/** The tokens, one a line (blank lines, spaces and CRLF ignored); with none, the single secret; with neither, none. */
export function parseTokens(list?: string, single?: string): string[] {
  const tokens = [...new Set((list ?? '').split(/\r?\n/).map(t => t.trim()).filter(Boolean))]
  if (tokens.length) return tokens
  const one = single?.trim()
  return one ? [one] : []
}

const AUTH = /Failed to authenticate|Invalid bearer token/i
type Account = { n: number; token: string; hash: string; out?: { why: 'usage' | 'auth'; message: string } }
let accounts: Account[] | undefined
const list = (): Account[] => (accounts ??= parseTokens(process.env.CLAUDE_CODE_OAUTH_TOKENS, process.env.CLAUDE_CODE_OAUTH_TOKEN)
  .map((token, i) => ({ n: i + 1, token, hash: createHash('sha256').update(token).digest('hex').slice(0, 8) })))

/** Forget the accounts and what they did (tests). */
export function resetAccounts() { accounts = undefined }

/**
 * `claude` with these arguments, the input on stdin, from this folder: its structured output. With every account set
 * aside it fails, without calling, with what the last one out of its limit said (so the review is skipped, claude-limit.ts),
 * else the last rejection.
 */
export async function claude<T>(args: string[], cwd: string, input: string): Promise<T> {
  const all = list()
  if (!all.length) return once<T>(args, cwd, input)
  for (;;) {
    const a = all.find(x => !x.out)
    if (!a) throw new Error((all.findLast(x => x.out?.why === 'usage') ?? all.at(-1)!).out!.message)
    try {
      return await once<T>(args, cwd, input, a.token)
    } catch (e) {
      const message = (e as Error).message
      const why = usageLimit(message) ? 'usage' : AUTH.test(message) ? 'auth' : undefined
      if (!why) throw e
      if (!a.out) {
        a.out = { why, message }
        console.log(`claude: token ${a.n} (${a.hash}) set aside: ${why === 'usage' ? 'usage limit' : 'credential rejected'}`)
      }
    }
  }
}

function once<T>(args: string[], cwd: string, input: string, token?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    // This account's token, and not the list: the call needs only its own.
    const { CLAUDE_CODE_OAUTH_TOKENS: _, ...env } = process.env
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], ...(token ? { env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: token } } : {}) })
    let out = ''
    let err = ''
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', reject)
    child.on('close', code => {
      try {
        const r = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: T }
        if (r.is_error || code !== 0 || !r.structured_output) return reject(new Error(`claude failed (${code}): ${(r.result ?? err).slice(0, 300)}`))
        resolve(r.structured_output)
      } catch { reject(new Error(`claude returned non-JSON (${code}): ${(out || err).slice(0, 300)}`)) }
    })
    child.stdin.end(input)
  })
}
