import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash } from 'node:crypto'
import { errorKind } from './state'

/**
 * The owner's Claude subscription accounts for headless `claude -p`: one OAuth token each (`claude setup-token` signed in
 * to that account), one a line in CLAUDE_CODE_OAUTH_TOKENS, then the single CLAUDE_CODE_OAUTH_TOKEN; with neither, none (the CLI's
 * own login, as on the owner's Mac). A call goes to the first account not set aside, in list order, so one account is
 * used up before the next. An account out of its usage limit, or whose token Claude rejects, is set aside for the rest of
 * the process and the same call goes to the next one (like the fish-ID tool's keys, apps/site/worker/fishid/keys.ts).
 *
 * A token is never printed: reports name it by its number in the list and the first 8 hex of its SHA-256, and on GitHub,
 * where a run's log and its summary page are public, by its number alone (the chief of staff, 19 Nov).
 */

/**
 * The tokens: CLAUDE_CODE_OAUTH_TOKENS one a line (blank lines, spaces and CRLF ignored), then the single
 * CLAUDE_CODE_OAUTH_TOKEN at the end when it isn't already listed (the owner's first account stays in the turn); each once.
 */
export function parseTokens(list?: string, single?: string): string[] {
  return [...new Set([...(list ?? '').split(/\r?\n/), single ?? ''].map(t => t.trim()).filter(Boolean))]
}

/**
 * Where a process starts in the list: CLAUDE_FIRST_ACCOUNT, a position in it (unset, or no position in the list: 1, the
 * first, as before), then on in order and round to the start. The cloud's list begins with the Mac's own sign-ins, so the
 * cloud starts on the one after them and leaves those to the Mac until its own is out (the chief of staff, 2026-11-12).
 * Reports still name each account by its number in the list as given.
 */
export function startAt<T>(all: T[], first?: string): T[] {
  const k = Number(first)
  const i = Number.isInteger(k) && k >= 1 && k <= all.length ? k - 1 : 0
  return [...all.slice(i), ...all.slice(0, i)]
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex').slice(0, 8)

/** Why an account was set aside: its usage limit (and when it lifts, as a UTC time), or its token rejected. */
export type Out = { why: 'usage' | 'auth'; reset?: string }
/** A credential Claude rejected: the CLI's words, or ours (one call's, call-failure.ts; every account's, below). */
export const AUTH = /Failed to authenticate|Invalid bearer token|\bcredential (?:rejected|refused)\b/i

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** A moment's date and time on the clocks of a time zone. */
function clock(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(at)
  const n = (type: string) => Number(parts.find(p => p.type === type)!.value)
  return { y: n('year'), mo: n('month') - 1, d: n('day'), h: n('hour'), mi: n('minute') }
}
/** The moment a date and time on a time zone's clocks names. */
function inZone(y: number, mo: number, d: number, h: number, mi: number, zone: string) {
  const guess = Date.UTC(y, mo, d, h, mi), c = clock(guess, zone)
  return guess - (Date.UTC(c.y, c.mo, c.d, c.h, c.mi) - guess)
}

/**
 * When the limit lifts, as a UTC time the code reads from what the CLI says: "resets Nov 5 at 6am (UTC)", "resets 3pm
 * (Asia/Ho_Chi_Minh)", or "…usage limit reached|1762300800" (seconds). Anything else, nothing: none of the CLI's words
 * reach a log line or a run's summary (the chief of staff, 19 Nov). With no date, the first such time not past.
 */
export function resetOf(message: string, now = Date.now()): string | undefined {
  // A failure already in our words (call-failure.ts) says it as a UTC time after "until".
  const ours = /\b(?:usage limit|limit reached) until (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)/.exec(message)?.[1]
  if (ours && !Number.isNaN(Date.parse(ours))) return new Date(ours).toISOString()
  const epoch = /limit reached\|(\d{10})\b/i.exec(message)?.[1]
  if (epoch) return new Date(Number(epoch) * 1000).toISOString()
  const m = /\bresets\s+(?:([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(([\w+\-/]+)\)/i.exec(message)
  if (!m) return undefined
  const [, month, day, hour, minute, half, zone] = m
  const mo = month ? MONTHS.indexOf(month.toLowerCase()) : 0, h = Number(hour), mi = Number(minute ?? 0)
  if (mo < 0 || h < 1 || h > 12 || mi > 59 || Number(day ?? 1) > 31) return undefined
  const h24 = (h % 12) + (half!.toLowerCase() === 'pm' ? 12 : 0)
  try {
    const today = clock(now, zone!)
    for (const next of [0, 1]) {
      const at = month ? inZone(today.y + next, mo, Number(day), h24, mi, zone!) : inZone(today.y, today.mo, today.d + next, h24, mi, zone!)
      if (at > now - 60 * 60_000) return new Date(at).toISOString()
    }
  } catch { /* a time zone the clock doesn't know: nothing */ }
  return undefined
}

/** What a failed call says about its account: out of its limit, rejected, or neither (the call's own failure). */
export function outOf(message: string): Out | undefined {
  if (errorKind(message) === 'usage') return { why: 'usage', reset: resetOf(message) }
  if (AUTH.test(message)) return { why: 'auth' }
  return undefined
}

type Account = { n: number; token: string; hash: string; answered: number; out?: Out }
let accounts: Account[] | undefined
let listed = new Set<string>()

/** This process's accounts, read from the environment on first use. */
function list(): Account[] {
  if (!accounts) {
    listed = new Set(parseTokens(process.env.CLAUDE_CODE_OAUTH_TOKENS))
    accounts = startAt(parseTokens(process.env.CLAUDE_CODE_OAUTH_TOKENS, process.env.CLAUDE_CODE_OAUTH_TOKEN).map((token, i) => ({ n: i + 1, token, hash: tokenHash(token), answered: 0 })), process.env.CLAUDE_FIRST_ACCOUNT)
  }
  return accounts
}

/** Forget the accounts and what they did (tests). */
export function resetAccounts() { accounts = undefined }

// On GitHub the run's log and its summary page are public: an account is named by its number alone there.
const name = (a: Account) => (process.env.GITHUB_ACTIONS ? `token ${a.n}` : `token ${a.n} (${a.hash})`)
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

/** A call no account took, in the engine's own words and none of the CLI's; errorKind still reads a limit as 'usage'. */
const noAccount = (who: string, o: Out) => `claude failed (accounts): ${who} ${o.why === 'usage' ? `out of its usage limit${o.reset ? ` until ${o.reset}` : ''}` : 'with its credential rejected'}`
/** A failure that says Claude rejected a credential: the CLI's words, with no accounts listed, or ours (cli.ts fails the cycle on it). */
export const credentialRejected = (error: string) => AUTH.test(error)

/**
 * One call on the first account not set aside. Out of its limit or rejected, that account is set aside and the same call
 * goes to the next. With every account set aside it fails, without calling, in the engine's own words: out of its usage
 * limit if one was (so errorKind still says 'usage'), else rejected. No accounts: the call as it is, on the CLI's own login.
 */
export async function onAccounts<T>(call: (token?: string) => Promise<T>, fail: (message: string) => Error): Promise<T> {
  const all = list()
  // A stop that isn't the account's goes straight up: no account is set aside for it, and the next isn't tried.
  const stopped = (e: unknown) => (e instanceof NotTheAccount ? fail(e.message) : undefined)
  if (onNextAccount.getStore()) {
    const [first, next] = all.filter(x => !x.out)
    if (!next) throw fail('no other account to ask')
    try {
      const r = await call(next.token)
      next.answered++
      console.log(`claude: ${name(next)} answered for ${name(first!)}`)
      return r
    } catch (e) {
      const stop = stopped(e)
      if (stop) throw stop
      const out = outOf((e as Error).message)
      if (!out) throw e
      if (!next.out) { next.out = out; console.log(`claude: ${name(next)} set aside: ${why(out)}`) }
      throw fail(noAccount('the next account', out))
    }
  }
  if (!all.length) {
    try {
      return await call()
    } catch (e) {
      throw stopped(e) ?? e
    }
  }
  for (;;) {
    const a = all.find(x => !x.out)
    if (!a) throw fail(noAccount('every account', (all.findLast(x => x.out?.why === 'usage') ?? all.at(-1)!).out!))
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

/**
 * A call made inside this goes once to the account after the one calls go to now, and nowhere else: the photo check's
 * last try for a sheet the first account failed twice, for a reason not its limit (the chief of staff, 19 Nov). Out of
 * its limit or rejected, that account is set aside as any other. No other account: it fails without calling.
 */
export const onNextAccount = new AsyncLocalStorage<true>()

/** Per account: its name (above), calls answered, and why it was set aside. Empty with no accounts or no call made. */
export function accountReport(): string[] {
  if (!accounts?.some(a => a.answered || a.out)) return []
  return accounts.map(a => `${name(a)}: ${a.answered} answered${a.out ? `; set aside: ${why(a.out)}` : ''}`)
}

/** The tokens Claude rejected, as the owner replaces them: "token 2 (ab12cd34) in CLAUDE_CODE_OAUTH_TOKENS" ("token 2" on GitHub), or the single secret's. */
export function rejectedTokens(): string {
  const rejected = (accounts ?? []).filter(a => a.out?.why === 'auth')
  if (!rejected.length) return 'CLAUDE_CODE_OAUTH_TOKEN'
  return rejected.map(a => `${name(a)} in ${listed.has(a.token) ? 'CLAUDE_CODE_OAUTH_TOKENS' : 'CLAUDE_CODE_OAUTH_TOKEN'}`).join(', ')
}
