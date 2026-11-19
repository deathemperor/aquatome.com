import { createHash } from 'node:crypto'
import { AUTH, resetOf } from './claude-accounts'
import { BROWSER_GONE, errorKind } from './state'

/** The API's own error types, the only class names a kind keeps. */
export const API_ERRORS = ['invalid_request_error', 'authentication_error', 'billing_error', 'permission_error', 'not_found_error', 'request_too_large', 'rate_limit_error', 'timeout_error', 'api_error', 'overloaded_error'] as const
/** The CLI's names for a run it ended short (its result's `subtype`), and ours: none says "limit", which stops a step. */
const SUBTYPES: Record<string, string> = { error_max_structured_output_retries: 'answer failed its schema', error_max_turns: 'stopped: out of turns', error_max_budget_usd: 'stopped: out of budget' }
/** A network failure, by the fixed word each is known by: the ones errorKind reads as passing (state.ts NETWORK). */
const NETWORK: [RegExp, (m: RegExpExecArray) => string][] = [
  [/\b(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|ETIMEDOUT)\b/, m => m[1]!],
  [/socket hang up/, () => 'socket hang up'],
  [/fetch failed/, () => 'fetch failed'],
  [/\bHTTP (408|429|5\d\d)\b/i, m => `HTTP ${m[1]}`],
  [/net::ERR_/, () => 'net::ERR_'],
  [/Timeout \d+ ?ms exceeded|Navigation timeout/i, () => 'Navigation timeout'],
  [BROWSER_GONE, () => 'Target closed'],
]
const NET_WORDS = 'ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|ETIMEDOUT|socket hang up|fetch failed|HTTP (?:408|429|5\\d\\d)|net::ERR_|Navigation timeout|Target closed'
const TYPES = API_ERRORS.join('|')
/**
 * Every kind below, from fixed words and numbers only: a failed call's message that ends in one is ours already and is
 * read back as it is. A CLI message that happens to read the same says nothing of its own.
 */
const KIND = new RegExp(`^(?:(?:usage limit|limit reached)(?: until \\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d\\.\\d{3}Z)?|credential refused|quota exceeded|answer cut off|image refused|prompt too long|refused by the model's safeguards|answer failed its schema|answer not JSON|no answer|stopped: out of (?:turns|budget)|timed out|overloaded|network \\((?:${NET_WORDS})\\)|server error(?: \\([1-5]\\d\\d\\))?|other(?: \\((?:killed|[1-5]\\d\\d(?: (?:${TYPES}))?|${TYPES}|ENOENT|EACCES|EPERM|EMFILE)\\))?)$`)

/**
 * What a failed model call was, in the engine's own words, decided by code from what the CLI said (and the subtype of its
 * result) and never copied from it (the chief of staff, 19 Nov). On GitHub, whose logs are public, it is all a failed call
 * says (claude.ts); on the Mac the CLI's own text stays. The photo check keeps the same kinds for each try
 * (modelFailureKind).
 *
 * The code that reads a failure reads ours as it reads the CLI's (call-failure.test.ts holds each reader to it): errorKind's
 * limit ("usage limit", or "limit reached" for another, as a rate limit) and its passing network failures (the word each is known by);
 * the accounts' reset, as a UTC time after "until", and a rejected credential ("credential refused", which the gate's stop
 * on a limit or a rejection doesn't read, as it doesn't the CLI's words for it); the photo steps' stop on a limit or a quota
 * ("quota exceeded"). No other kind says "limit", "rejected" or "quota".
 */
export function failureKind(message: string, result?: { subtype?: unknown; stop_reason?: unknown }): string {
  if (/^claude timed out after \d+ s$/.test(message)) return 'timed out'
  if (/^claude (?:failed|returned non-JSON) \(null\)/.test(message)) return 'other (killed)'
  const ours = /^claude (?:failed|returned non-JSON) \([^)]*\): (.*)$/s.exec(message)?.[1]
  if (ours && KIND.test(ours)) return ours
  // As errorKind reads it first: a usage limit, then a failure that passes (the network, the browser), whatever else the
  // message says, so the steps try it again as they would on the Mac.
  if (errorKind(message) === 'usage') {
    const at = resetOf(message)
    return `${/usage limit|quota|weekly limit/i.test(message) ? 'usage limit' : 'limit reached'}${at ? ` until ${at}` : ''}`
  }
  if (errorKind(message) === 'transient') {
    for (const [re, word] of NETWORK) {
      const m = re.exec(message)
      if (m) return `network (${word(m)})`
    }
  }
  // Output that wasn't JSON: what the code reads off it, a rejected credential (the accounts), a limit or a quota (the
  // gate's and the photo steps' stop); else whether there was any.
  const text = /^claude returned non-JSON \([^)]*\): (.*)$/s.exec(message)?.[1]
  if (text !== undefined) return AUTH.test(text) ? 'credential refused' : /usage limit|weekly limit/i.test(text) ? 'usage limit' : /quota/i.test(text) ? 'quota exceeded' : /limit/i.test(text) ? 'limit reached' : text.trim() ? 'answer not JSON' : 'no answer'
  if (AUTH.test(message)) return 'credential refused'
  if (/quota/i.test(message)) return 'quota exceeded'
  if (typeof result?.subtype === 'string' && SUBTYPES[result.subtype]) return SUBTYPES[result.subtype]
  // The answer stopped at the most it may write (the Site lead, 19 Nov): not the same fix as an answer that isn't JSON.
  if (result?.stop_reason === 'max_tokens' || /output token maximum|stop_reason"?\s*[:=]\s*"?max_tokens|(?:response|answer|output) (?:was )?(?:cut off|truncated)/i.test(message)) return 'answer cut off'
  // The API couldn't read or fetch an image it was given (the Site lead, 19 Nov).
  if (/(?:could not|cannot|can't|unable to|failed to) (?:process|download|fetch|read|decode|load) (?:the |this |an )?(?:image|photo)|\bimage\b[^."]{0,60}\b(?:exceeds|too large|does not match|not supported|unsupported|is invalid|corrupt)/i.test(message)) return 'image refused'
  if (/prompt is too long|input is too long|exceeds? (?:the )?(?:model'?s? )?(?:maximum )?context (?:window|length)|context (?:window|length) exceeded|too many (?:input )?tokens/i.test(message)) return 'prompt too long'
  if (/safeguards flagged|flagged (?:this|the|your) (?:message|request|content)|violat\w* (?:our |the )?usage polic/i.test(message)) return "refused by the model's safeguards"
  if (/(?:did not|does not|doesn't|failed to) (?:match|conform to|satisfy) (?:the |its )?(?:json )?(?:output )?schema/i.test(message)) return 'answer failed its schema'
  const status = /\bAPI Error:?\s*([1-5]\d\d)\b/.exec(message)?.[1]
  const type = /"error"\s*:\s*\{\s*"type"\s*:\s*"([a-z_]+)"/.exec(message)?.[1]
  const cls = (API_ERRORS as readonly string[]).includes(type ?? '') ? type : undefined
  if (cls === 'overloaded_error' || status === '529') return 'overloaded'
  for (const [re, word] of NETWORK) {
    const m = re.exec(message)
    if (m) return `network (${word(m)})`
  }
  if (status?.startsWith('5') || cls === 'api_error') return `server error${status ? ` (${status})` : ''}`
  const errno = /\b(ENOENT|EACCES|EPERM|EMFILE)\b/.exec(message)?.[1]
  const told = [status, cls ?? errno].filter(Boolean)
  return told.length ? `other (${told.join(' ')})` : 'other'
}

/**
 * A failed call's message: on GitHub the kind in our words after the CLI's exit code, on the Mac the CLI's text as before.
 * `head` is "claude failed (<code>)" or "claude returned non-JSON (<code>)".
 */
export function failureMessage(head: string, text: string, result?: { subtype?: unknown; stop_reason?: unknown }): string {
  const raw = `${head}: ${text}`
  return process.env.GITHUB_ACTIONS ? `${head}: ${failureKind(raw, result)}` : raw
}

/**
 * The tool's sentence as a short hash: the first 8 hex of the SHA-256 of its text with each run of digits as one 9 and
 * its spaces as one, so the same error with another request id or count gives the same hash, and a line of the Mac's log
 * through this function gives the one a cloud run printed.
 */
export const sentenceHash = (text: string) => createHash('sha256').update(text.replace(/\d+/g, '9').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8)

/**
 * The place in our request that an API refused as malformed (400, invalid_request_error) names, before the colon of its
 * message, as "messages.0.content.0.source": kept only if it is letters, digits, dots and underscores, 80 at most, else
 * nothing (the chief of staff, 19 Nov). It describes our request, not the account.
 */
export function refusedAt(text: string): string | undefined {
  // The status, the type and the message of one error: the object the API sent after "API Error: 400", read whole.
  const e = (apiError(text, '400') as { error?: { type?: unknown; message?: unknown } } | undefined)?.error
  if (e?.type !== 'invalid_request_error' || typeof e.message !== 'string') return undefined
  const place = /^([^:]*):/.exec(e.message)?.[1]
  return place && /^[A-Za-z0-9_.]{1,80}$/.test(place) ? place : undefined
}

/** The JSON object right after "API Error: <status>" in the CLI's text, parsed whole, or nothing. */
function apiError(text: string, status: string): unknown {
  const at = new RegExp(`\\bAPI Error:?\\s*${status}\\s*\\{`).exec(text)
  if (!at) return undefined
  const start = at.index + at[0].length - 1
  let depth = 0, inString = false, escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(text.slice(start, i + 1)) } catch { return undefined }
    }
  }
  return undefined
}

/**
 * Beside a failed call on GitHub, a line of ours for whoever debugs a cloud run (the Site lead, 19 Nov): the kind, the
 * model asked for, the step, the page or guide the call was for (a step that works in pieces), the try (each account
 * tried is one), the tool's exit code or the signal that stopped it, for "other" the hash of the tool's sentence, and for
 * a request refused as malformed the place it names. Nothing copied from the tool's text but that place, as refusedAt
 * keeps it. The tool's sentence itself is kept nowhere for a cloud run: a failure needed in full is run again on the Mac.
 */
export function failureDetail(o: { message: string; text?: string; result?: { subtype?: unknown; stop_reason?: unknown }; model: string; step: string; page?: string; attempt: number; code: number | null; signal: string | null }): string {
  const kind = failureKind(o.message, o.result)
  const at = o.text ? refusedAt(o.text) : undefined
  return [`claude: a call failed: ${kind}`, `model ${o.model}`, `step ${o.step}`, ...(o.page ? [`page ${o.page}`] : []), `try ${o.attempt}`, o.signal ? `signal ${o.signal}` : `exit ${o.code}`, ...(kind.startsWith('other') && o.text?.trim() ? [`sentence ${sentenceHash(o.text)}`] : []), ...(at ? [`at ${at}`] : [])].join('; ')
}
