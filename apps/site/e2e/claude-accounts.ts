import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync } from 'node:fs'
import { usageLimit } from './claude-limit'

/**
 * Headless Claude Code on the owner's Claude subscription accounts, as the engine uses them
 * (packages/engine/src/claude-accounts.ts, copied: the site doesn't import from the engine). One OAuth token an account,
 * one a line in CLAUDE_CODE_OAUTH_TOKENS, then the single CLAUDE_CODE_OAUTH_TOKEN; with neither, the CLI's own login. A call goes to
 * the first account not set aside; out of its usage limit, or with its token rejected, the account is set aside for the
 * rest of this process (a Playwright worker) and the same call goes to the next. A token is never printed: the log names
 * it by its number in the list and the first 8 hex of its SHA-256.
 */

/**
 * The tokens: CLAUDE_CODE_OAUTH_TOKENS one a line (blank lines, spaces and CRLF ignored), then the single
 * CLAUDE_CODE_OAUTH_TOKEN at the end when it isn't already listed (the owner's first account stays in the turn); each once.
 */
export function parseTokens(list?: string, single?: string): string[] {
  return [...new Set([...(list ?? '').split(/\r?\n/), single ?? ''].map(t => t.trim()).filter(Boolean))]
}

const AUTH = /Failed to authenticate|Invalid bearer token/i
type Account = { n: number; token: string; hash: string; out?: { why: 'usage' | 'auth'; message: string } }
let accounts: Account[] | undefined
const list = (): Account[] => (accounts ??= parseTokens(process.env.CLAUDE_CODE_OAUTH_TOKENS, process.env.CLAUDE_CODE_OAUTH_TOKEN)
  .map((token, i) => ({ n: i + 1, token, hash: createHash('sha256').update(token).digest('hex').slice(0, 8) })))

/** Forget the accounts and what they did (tests). */
export function resetAccounts() { accounts = undefined }

/**
 * On CI a workflow names its step (CLAUDE_COST_STEP), the file its cost lines go to (CLAUDE_COST_LOG) and the dollars
 * the step had left of its day when the run started (CLAUDE_SPEND_LEFT, from scripts/claude-spend.mjs; `none`: no
 * ceiling). Before each call, what this run has logged is set against that: a runner starts empty, so the log is this
 * run's alone, and Playwright's workers share it. A call is logged when it ends, so a run passes what was left by
 * the calls its workers had in the air, one each at most. Nothing when the call may go; else why not, in words
 * claude-limit.ts turns into a skip. With no step named (a run by hand) nothing is counted.
 */
export function ceilingStop(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const step = env.CLAUDE_COST_STEP
  if (!step || env.CLAUDE_SPEND_LEFT === 'none') return
  const name = step.replaceAll('-', ' ')
  const left = env.CLAUDE_SPEND_LEFT?.trim() ? Number(env.CLAUDE_SPEND_LEFT) : Number.NaN
  let spent = 0
  try {
    if (!Number.isFinite(left)) throw new Error('nothing says what is left of the day')
    appendFileSync(env.CLAUDE_COST_LOG ?? '', '')
    for (const line of readFileSync(env.CLAUDE_COST_LOG!, 'utf8').split('\n')) {
      if (!line) continue
      const row = JSON.parse(line) as { step?: string; usd?: number }
      if (row.step === step && typeof row.usd === 'number') spent += row.usd
    }
  } catch (e) {
    return `claude failed: today's spend for the ${name} could not be counted (${(e as Error).message.slice(0, 120)}), so the call was not made`
  }
  if (spent >= left) return `claude failed: today's ceiling for the ${name} is reached ($${spent.toFixed(2)} spent by this run, of the $${left.toFixed(2)} left for today), so the call was not made`
}

/**
 * A call's line in the cost log: when, the step, the account by the hash it is named by everywhere, the model, how
 * long, the CLI's own estimate of the dollars, the tokens. Nothing of the prompt, the page or the answer: the
 * repository is public, and so is a run's artifact.
 */
function logCost(r: { total_cost_usd?: number; is_error?: boolean; usage?: Record<string, number | undefined> }, args: string[], started: number, token?: string) {
  const step = process.env.CLAUDE_COST_STEP
  const log = process.env.CLAUDE_COST_LOG
  // Numbers only from what the CLI printed: anything else there is left out, never copied.
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : undefined)
  const usd = num(r.total_cost_usd)
  if (!step || !log || usd === undefined) return
  const u = typeof r.usage === 'object' && r.usage ? r.usage : {}
  const model = args.includes('--model') ? args[args.indexOf('--model') + 1] : undefined
  appendFileSync(log, `${JSON.stringify({
    at: new Date().toISOString(), step, account: token ? createHash('sha256').update(token).digest('hex').slice(0, 8) : 'login', model, ms: Date.now() - started,
    usd, in: num(u.input_tokens), cacheWrite: num(u.cache_creation_input_tokens), cacheRead: num(u.cache_read_input_tokens), out: num(u.output_tokens), ...(r.is_error ? { error: true } : {}),
  })}\n`)
}

/**
 * `claude` with these arguments, the input on stdin, from this folder: its structured output. With every account set
 * aside it fails, without calling, with what the last one out of its limit said (so the review is skipped, claude-limit.ts),
 * else the last rejection.
 */
export async function claude<T>(args: string[], cwd: string, input: string): Promise<T> {
  // Our own ceiling is no account's fault: it goes straight up, and no account is set aside for it. Asked again before
  // each account's try, since a try that ends on a limit may have been paid for.
  const capped = () => { const stop = ceilingStop(); if (stop) throw new Error(stop) }
  const all = list()
  if (!all.length) { capped(); return once<T>(args, cwd, input) }
  for (;;) {
    capped()
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
    const started = Date.now()
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], ...(token ? { env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: token } } : {}) })
    let out = ''
    let err = ''
    // Decoded across chunks, as the engine's runner is (packages/engine/src/claude.ts): a chunk decoded by itself turns a
    // character the pipe cut in two into U+FFFD, and a finding would quote a word the page doesn't have.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (err += d))
    child.on('error', reject)
    child.on('close', code => {
      try {
        const r = JSON.parse(out) as { is_error?: boolean; result?: string; structured_output?: T; total_cost_usd?: number; usage?: Record<string, number | undefined> }
        // Before anything is made of the answer: a call that failed part way was paid for too.
        logCost(r, args, started, token)
        if (r.is_error || code !== 0 || !r.structured_output) return reject(new Error(`claude failed (${code}): ${(r.result ?? err).slice(0, 300)}`))
        resolve(r.structured_output)
      } catch { reject(new Error(`claude returned non-JSON (${code}): ${(out || err).slice(0, 300)}`)) }
    })
    child.stdin.end(input)
  })
}
