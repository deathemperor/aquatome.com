import { AUTH, resetOf } from './claude-accounts'
import { errorKind } from './state'

/** The API's own error types, the only class names a kind keeps. */
export const API_ERRORS = ['invalid_request_error', 'authentication_error', 'billing_error', 'permission_error', 'not_found_error', 'request_too_large', 'rate_limit_error', 'timeout_error', 'api_error', 'overloaded_error'] as const
/** The CLI's names for a run it ended short (its result's `subtype`), and ours. */
const SUBTYPES: Record<string, string> = { error_max_structured_output_retries: 'answer failed its schema', error_max_turns: 'stopped at its turn limit', error_max_budget_usd: 'stopped at its budget' }
const NETWORK = /\b(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|ETIMEDOUT)\b|(socket hang up|fetch failed)/
/** Every kind below, as a failed call's message ends with it: one already in our words is read back as it is. */
const KIND = /^(?:usage limit(?: until \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)?|credential rejected|prompt too long|refused by the model's safeguards|answer failed its schema|answer not JSON|no answer|stopped at its (?:turn limit|budget)|timed out|overloaded|network \([a-zA-Z ]+\)|server error(?: \(\d{3}\))?|other(?: \([\w ]+\))?)$/

/**
 * What a failed model call was, in the engine's own words, decided by code from what the CLI said (and the subtype of its
 * result) and never copied from it (the chief of staff, 19 Nov). On GitHub, whose logs are public, it is all a failed call
 * says (claude.ts); on the Mac the CLI's own text stays. The photo check keeps the same kinds for each try
 * (modelFailureKind).
 *
 * Each kind keeps what the code that reads a failure looks for: "usage limit" (errorKind, the accounts, the steps that stop
 * on a limit) and, after "until", when it lifts as a UTC time (resetOf); "credential rejected" (the accounts, the cycle's
 * check); the status number and the API's error type, only one of API_ERRORS; a network failure's code (errorKind).
 */
export function failureKind(message: string, subtype?: unknown): string {
  if (/^claude timed out after \d+ s$/.test(message)) return 'timed out'
  if (/^claude (?:failed|returned non-JSON) \(null\)/.test(message)) return 'other (killed)'
  const ours = /^claude (?:failed|returned non-JSON) \([^)]*\): (.*)$/s.exec(message)?.[1]
  if (ours && KIND.test(ours)) return ours
  if (errorKind(message) === 'usage') {
    const at = resetOf(message)
    return `usage limit${at ? ` until ${at}` : ''}`
  }
  if (AUTH.test(message)) return 'credential rejected'
  if (typeof subtype === 'string' && SUBTYPES[subtype]) return SUBTYPES[subtype]
  if (/prompt is too long|prompt too long|input is too long|context (?:length|window)|too many (?:input )?tokens/i.test(message)) return 'prompt too long'
  if (/safeguards|usage polic(?:y|ies)|content (?:filter|policy)/i.test(message)) return "refused by the model's safeguards"
  if (/json[ _-]?schema|structured output|schema validation/i.test(message)) return 'answer failed its schema'
  const status = /\bAPI Error:?\s*([1-5]\d\d)\b/.exec(message)?.[1]
  const type = /"error"\s*:\s*\{\s*"type"\s*:\s*"([a-z_]+)"/.exec(message)?.[1]
  const cls = (API_ERRORS as readonly string[]).includes(type ?? '') ? type : undefined
  if (cls === 'overloaded_error' || status === '529') return 'overloaded'
  const net = NETWORK.exec(message)
  if (net) return `network (${net[1] ?? net[2]})`
  if (status?.startsWith('5') || cls === 'api_error') return `server error${status ? ` (${status})` : ''}`
  const errno = /\b(ENOENT|EACCES|EPERM|EMFILE)\b/.exec(message)?.[1]
  const told = [status, cls ?? errno].filter(Boolean)
  return told.length ? `other (${told.join(' ')})` : 'other'
}

/**
 * A failed call's message: on GitHub the kind in our words after the CLI's exit code, on the Mac the CLI's text as before.
 * `head` is "claude failed (<code>)" or "claude returned non-JSON (<code>)".
 */
export function failureMessage(head: string, text: string, subtype?: unknown): string {
  const raw = `${head}: ${text}`
  if (!process.env.GITHUB_ACTIONS) return raw
  if (head.startsWith('claude returned non-JSON') && !/\(null\)$/.test(head)) return `${head}: ${text.trim() ? 'answer not JSON' : 'no answer'}`
  return `${head}: ${failureKind(raw, subtype)}`
}
