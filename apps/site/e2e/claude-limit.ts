/** Claude's usage limit (the owner's subscription): a failure of the claude CLI that says so. The engine's pattern (packages/engine/src/state.ts USAGE). */
const USAGE = /^claude failed\b.*(hit your .*limit|usage limit|limit reached|rate.?limit)/i
/** Our own stop (claude-accounts.ts ceilingStop): the step's daily ceiling is reached, or its day couldn't be counted. */
const OURS = /^claude failed: (today's (?:ceiling|spend) for .+)$/s

/**
 * A review that hit the limit did not run: the reason to skip it, "Claude usage limit" and none of the CLI's words, or our
 * own ceiling's words as they are (scripts/site-watch.mjs puts it in the PR comment, which is public; the chief of staff,
 * 19 Nov). Any other failure: undefined, and the review fails as before.
 */
export const usageLimit = (error: string) => {
  const ours = OURS.exec(error)?.[1]
  if (ours) return `${ours[0]!.toUpperCase()}${ours.slice(1)}`
  return USAGE.test(error) ? 'Claude usage limit' : undefined
}

/** A credential Claude rejected: the CLI's words, or ours (failureMessage below, and every account's, claude-accounts.ts). */
export const AUTH = /Failed to authenticate|Invalid bearer token|\bcredential rejected\b/i
const API_ERRORS = ['invalid_request_error', 'authentication_error', 'billing_error', 'permission_error', 'not_found_error', 'request_too_large', 'rate_limit_error', 'timeout_error', 'api_error', 'overloaded_error']
const SUBTYPES: Record<string, string> = { error_max_structured_output_retries: 'answer failed its schema', error_max_turns: 'stopped at its turn limit', error_max_budget_usd: 'stopped at its budget' }

/**
 * A failed call's message. On GitHub, whose logs and pull request comments are public, its kind in our words, decided by
 * code from what the CLI said and never copied from it; elsewhere the CLI's text, as before (the chief of staff, 19 Nov).
 * The engine's packages/engine/src/call-failure.ts, copied: the site doesn't import from the engine. Each kind keeps what
 * the code here reads: "usage limit" (usageLimit) and "credential rejected" (AUTH).
 */
export function failureMessage(head: string, text: string, r?: { is_error?: boolean; subtype?: unknown; structured_output?: unknown }): string {
  if (!process.env.GITHUB_ACTIONS) return `${head}: ${text}`
  if (/\(null\)$/.test(head)) return `${head}: other (killed)`
  if (head.startsWith('claude returned non-JSON')) return `${head}: ${text.trim() ? 'answer not JSON' : 'no answer'}`
  const raw = `${head}: ${text}`
  const kind = (): string => {
    if (USAGE.test(raw)) return 'usage limit'
    if (AUTH.test(raw)) return 'credential rejected'
    if (typeof r?.subtype === 'string' && SUBTYPES[r.subtype]) return SUBTYPES[r.subtype]!
    if (/prompt is too long|prompt too long|input is too long|context (?:length|window)|too many (?:input )?tokens/i.test(raw)) return 'prompt too long'
    if (/safeguards|usage polic(?:y|ies)|content (?:filter|policy)/i.test(raw)) return "refused by the model's safeguards"
    if (/json[ _-]?schema|structured output|schema validation/i.test(raw) || (r && !r.is_error && !r.structured_output)) return 'answer failed its schema'
    const status = /\bAPI Error:?\s*([1-5]\d\d)\b/.exec(raw)?.[1]
    const type = /"error"\s*:\s*\{\s*"type"\s*:\s*"([a-z_]+)"/.exec(raw)?.[1]
    const cls = API_ERRORS.includes(type ?? '') ? type : undefined
    if (cls === 'overloaded_error' || status === '529') return 'overloaded'
    const net = /\b(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|ETIMEDOUT)\b|(socket hang up|fetch failed)/.exec(raw)
    if (net) return `network (${net[1] ?? net[2]})`
    if (status?.startsWith('5') || cls === 'api_error') return `server error${status ? ` (${status})` : ''}`
    const told = [status, cls].filter(Boolean)
    return told.length ? `other (${told.join(' ')})` : 'other'
  }
  return `${head}: ${kind()}`
}
