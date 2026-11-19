import { createHash } from 'node:crypto'

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
const SUBTYPES: Record<string, string> = { error_max_structured_output_retries: 'answer failed its schema', error_max_turns: 'stopped: out of turns', error_max_budget_usd: 'stopped: out of budget' }

/**
 * A failed call's message. On GitHub, whose logs and pull request comments are public, its kind in our words, decided by
 * code from what the CLI said and never copied from it; elsewhere the CLI's text, as before (the chief of staff, 19 Nov).
 * The engine's packages/engine/src/call-failure.ts, copied: the site doesn't import from the engine. Each kind keeps what
 * the code here reads: "usage limit" (usageLimit) and "credential rejected" (AUTH).
 */
export function failureMessage(head: string, text: string, r?: { is_error?: boolean; subtype?: unknown; stop_reason?: unknown; structured_output?: unknown }): string {
  if (!process.env.GITHUB_ACTIONS) return `${head}: ${text}`
  if (/\(null\)$/.test(head)) return `${head}: other (killed)`
  if (head.startsWith('claude returned non-JSON')) return `${head}: ${AUTH.test(text) ? 'credential rejected' : text.trim() ? 'answer not JSON' : 'no answer'}`
  const raw = `${head}: ${text}`
  const kind = (): string => {
    if (USAGE.test(raw)) return 'usage limit'
    if (AUTH.test(raw)) return 'credential rejected'
    if (typeof r?.subtype === 'string' && SUBTYPES[r.subtype]) return SUBTYPES[r.subtype]!
    // The answer stopped at the most it may write, and an image the API couldn't take: kinds of their own (the Site lead).
    if (r?.stop_reason === 'max_tokens' || /output token maximum|stop_reason"?\s*[:=]\s*"?max_tokens|(?:response|answer|output) (?:was )?(?:cut off|truncated)/i.test(raw)) return 'answer cut off'
    if (/(?:could not|cannot|can't|unable to|failed to) (?:process|download|fetch|read|decode|load) (?:the |this |an )?(?:image|photo)|\bimage\b[^."]{0,60}\b(?:exceeds|too large|does not match|not supported|unsupported|is invalid|corrupt)/i.test(raw)) return 'image refused'
    if (/prompt is too long|input is too long|exceeds? (?:the )?(?:model'?s? )?(?:maximum )?context (?:window|length)|context (?:window|length) exceeded|too many (?:input )?tokens/i.test(raw)) return 'prompt too long'
    if (/safeguards flagged|flagged (?:this|the|your) (?:message|request|content)|violat\w* (?:our |the )?usage polic/i.test(raw)) return "refused by the model's safeguards"
    if (/(?:did not|does not|doesn't|failed to) (?:match|conform to|satisfy) (?:the |its )?(?:json )?(?:output )?schema/i.test(raw) || (r && !r.is_error && !r.structured_output)) return 'answer failed its schema'
    const status = /\bAPI Error:?\s*([1-5]\d\d)\b/.exec(raw)?.[1]
    const type = /"error"\s*:\s*\{\s*"type"\s*:\s*"([a-z_]+)"/.exec(raw)?.[1]
    const cls = API_ERRORS.includes(type ?? '') ? type : undefined
    if (cls === 'overloaded_error' || status === '529') return 'overloaded'
    const net = /\b(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE|ETIMEDOUT)\b|(socket hang up|fetch failed)|\bHTTP (408|429|5\d\d)\b/i.exec(raw)
    if (net) return `network (${net[1] ?? net[2] ?? `HTTP ${net[3]}`})`
    if (status?.startsWith('5') || cls === 'api_error') return `server error${status ? ` (${status})` : ''}`
    const told = [status, cls].filter(Boolean)
    return told.length ? `other (${told.join(' ')})` : 'other'
  }
  return `${head}: ${kind()}`
}

/**
 * The tool's sentence as a short hash: the first 8 hex of the SHA-256 of its text with each run of digits as one 9 and its
 * spaces as one, so the same error with another request id gives the same hash, and a Mac log line gives the cloud's.
 */
export const sentenceHash = (text: string) => createHash('sha256').update(text.replace(/\d+/g, '9').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 8)

/**
 * The place in our request that an API refused as malformed (400, invalid_request_error) names before the colon of its
 * message: kept only if it is letters, digits, dots and underscores, 80 at most, else nothing (the chief of staff, 19 Nov).
 */
export function refusedAt(text: string): string | undefined {
  if (!/\bAPI Error:?\s*400\b/.test(text) || !/"type"\s*:\s*"invalid_request_error"/.test(text)) return undefined
  const place = /"message"\s*:\s*"([^":]*):/.exec(text)?.[1]
  return place && /^[A-Za-z0-9_.]{1,80}$/.test(place) ? place : undefined
}

/**
 * Beside a review's failed call on GitHub, a line of ours (the Site lead, 19 Nov): the kind, the model asked for, the step,
 * the try (each account tried is one), the exit code or signal, for "other" the hash of the tool's sentence, and the place
 * a malformed request names. The page is the Playwright test's own title beside it.
 */
export function failureDetail(o: { message: string; text?: string; model?: string; step?: string; attempt: number; code: number | null; signal: string | null }): string {
  const kind = /^claude (?:failed|returned non-JSON) \([^)]*\): (.*)$/s.exec(o.message)?.[1] ?? 'other'
  const at = o.text ? refusedAt(o.text) : undefined
  return [`claude: a call failed: ${kind}`, `model ${o.model ?? 'default'}`, `step ${o.step ?? 'none'}`, `try ${o.attempt}`, o.signal ? `signal ${o.signal}` : `exit ${o.code}`, ...(kind.startsWith('other') && o.text?.trim() ? [`sentence ${sentenceHash(o.text)}`] : []), ...(at ? [`at ${at}`] : [])].join('; ')
}
