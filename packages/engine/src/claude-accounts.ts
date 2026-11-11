import { createHash } from 'node:crypto'
import { errorKind } from './state'

/**
 * The owner's Claude subscription accounts for headless `claude -p`: one OAuth token each (`claude setup-token` signed in
 * to that account), one a line in CLAUDE_CODE_OAUTH_TOKENS, then the single CLAUDE_CODE_OAUTH_TOKEN; with neither, none (the CLI's
 * own login, as on the owner's Mac). A call goes to the first account not set aside, in list order, so one account is
 * used up before the next. An account out of its usage limit, or whose token Claude rejects, is set aside for the rest of
 * the process and the same call goes to the next one (like the fish-ID tool's keys, apps/site/worker/fishid/keys.ts).
 *
 * A token is never printed: reports name it by its number in the list and the first 8 hex of its SHA-256.
 */

/**
 * The tokens: CLAUDE_CODE_OAUTH_TOKENS one a line (blank lines, spaces and CRLF ignored), then the single
 * CLAUDE_CODE_OAUTH_TOKEN at the end when it isn't already listed (the owner's first account stays in the turn); each once.
 */
export function parseTokens(list?: string, single?: string): string[] {
  return [...new Set([...(list ?? '').split(/\r?\n/), single ?? ''].map(t => t.trim()).filter(Boolean))]
}

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 8)

/** Why an account was set aside: its usage limit (and when it lifts, as the CLI said), or its token rejected. */
export type Out = { why: 'usage' | 'auth'; reset?: string; message: string }
const AUTH = /Failed to authenticate|Invalid bearer token/i

/** When the limit lifts, as the CLI says it: "resets Nov 5 at 6am (UTC)", or "…usage limit reached|1762300800" (seconds). */
export function resetOf(message: string): string | undefined {
  const text = /\bresets\s+([^()\n]*\([^)\n]*\)|[^\n]+)/i.exec(message)?.[1]?.trim()
  if (text) return text
  const epoch = /limit reached\|(\d{10})\b/i.exec(message)?.[1]
  return epoch ? new Date(Number(epoch) * 1000).toISOString() : undefined
}

/** What a failed call says about its account: out of its limit, rejected, or neither (the call's own failure). */
export function outOf(message: string): Out | undefined {
  if (errorKind(message) === 'usage') return { why: 'usage', reset: resetOf(message), message }
  if (AUTH.test(message)) return { why: 'auth', message }
  return undefined
}

type Account = { n: number; token: string; hash: string; answered: number; out?: Out }
let accounts: Account[] | undefined
let listed = new Set<string>()

/** This process's accounts, read from the environment on first use. */
function list(): Account[] {
  if (!accounts) {
    listed = new Set(parseTokens(process.env.CLAUDE_CODE_OAUTH_TOKENS))
    accounts = parseTokens(process.env.CLAUDE_CODE_OAUTH_TOKENS, process.env.CLAUDE_CODE_OAUTH_TOKEN).map((token, i) => ({ n: i + 1, token, hash: tokenHash(token), answered: 0 }))
  }
  return accounts
}

/** Forget the accounts and what they did (tests). */
export function resetAccounts() { accounts = undefined }

const name = (a: Account) => `token ${a.n} (${a.hash})`
const why = (o: Out) => (o.why === 'usage' ? `usage limit${o.reset ? ` until ${o.reset}` : ''}` : 'credential rejected')

/**
 * The child's environment. A step run by hand from a session and a scheduled run call the model the same way
 * (2026-11-11): every name starting with CLAUDE or ANTHROPIC is dropped, and MAX_THINKING_TOKENS, then this call's
 * token is set when there is one. PATH, HOME and the rest pass through.
 */
export function envFor(token?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('CLAUDE') || name.startsWith('ANTHROPIC') || name === 'MAX_THINKING_TOKENS') continue
    env[name] = value
  }
  if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token
  return env
}

/**
 * A call stopped before it was made, for a reason that isn't its account's: the engine's own ceiling for the day
 * (ceiling.ts). Its message reads as a usage limit to the steps, so it is told apart here by its class.
 */
export class NotTheAccount extends Error {}

/**
 * One call on the first account not set aside. Out of its limit or rejected, that account is set aside and the same call
 * goes to the next. With every account set aside it fails, without calling, with what the last one out of its limit said
 * (so errorKind still says 'usage'), else the last rejection. No accounts: the call as it is, on the CLI's own login.
 */
export async function onAccounts<T>(call: (token?: string) => Promise<T>, fail: (message: string) => Error): Promise<T> {
  const all = list()
  // A stop that isn't the account's goes straight up: no account is set aside for it, and the next isn't tried.
  const stopped = (e: unknown) => (e instanceof NotTheAccount ? fail(e.message) : undefined)
  if (!all.length) {
    try {
      return await call()
    } catch (e) {
      throw stopped(e) ?? e
    }
  }
  for (;;) {
    const a = all.find(x => !x.out)
    if (!a) throw fail((all.findLast(x => x.out?.why === 'usage') ?? all.at(-1)!).out!.message)
    try {
      const r = await call(a.token)
      a.answered++
      return r
    } catch (e) {
      const stop = stopped(e)
      if (stop) throw stop
      const out = outOf((e as Error).message)
      if (!out) throw e
      if (!a.out) {
        a.out = out
        console.log(`claude: ${name(a)} set aside: ${why(out)}`)
      }
    }
  }
}

/** Per account: its number and hash, calls answered, and why it was set aside. Empty with no accounts or no call made. */
export function accountReport(): string[] {
  if (!accounts?.some(a => a.answered || a.out)) return []
  return accounts.map(a => `${name(a)}: ${a.answered} answered${a.out ? `; set aside: ${why(a.out)}` : ''}`)
}

/** The tokens Claude rejected, as the owner replaces them: "token 2 (ab12cd34) in CLAUDE_CODE_OAUTH_TOKENS", or the single secret's. */
export function rejectedTokens(): string {
  const rejected = (accounts ?? []).filter(a => a.out?.why === 'auth')
  if (!rejected.length) return 'CLAUDE_CODE_OAUTH_TOKEN'
  return rejected.map(a => `${name(a)} in ${listed.has(a.token) ? 'CLAUDE_CODE_OAUTH_TOKENS' : 'CLAUDE_CODE_OAUTH_TOKEN'}`).join(', ')
}
