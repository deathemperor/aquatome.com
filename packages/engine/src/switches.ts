/**
 * Three steps the chief of staff turned off on 20 Nov 2026, after the night of 19 Nov took from live guides what had to
 * stay: the cutter (video-cut.ts), the topic check (topic-check.ts) and the reader-fit rewrite on guides (fit-rewrite.ts).
 * The command holds each switch, not only the cycle script, so a step run by hand is off by default as well.
 */
type Env = Record<string, string | undefined>
/**
 * A variable exported empty counts as unset, as the cycle script's `${X:-default}` reads it; so does a flag the script
 * passed blank (`--kind "${X:-…}"` with X a space).
 */
const given = (v: string | undefined) => (v === undefined || v.trim() === '' ? undefined : v)

/** The cutter runs only with VIDEO_CUT=on. */
export const videoCutOn = (env: Env) => env.VIDEO_CUT === 'on'

/**
 * How many guides the topic check reads: TOPIC_CHECK_LIMIT (0 when unset or empty), or fewer when `--limit` asks for
 * fewer; a flag alone never turns it on. Anything that isn't a whole number of 0 or more, short of overflowing, is refused.
 */
export function topicCheckLimit(env: Env, flag?: string): number {
  const whole = (s: string, name: string) => {
    const n = Number(s.trim())
    if (!/^\d+$/.test(s.trim()) || !Number.isSafeInteger(n)) throw new Error(`topic-check: ${name} must be a whole number of 0 or more, not "${s}"`)
    return n
  }
  const allowed = whole(given(env.TOPIC_CHECK_LIMIT) ?? '0', 'TOPIC_CHECK_LIMIT')
  const asked = given(flag)
  return asked === undefined ? allowed : Math.min(allowed, whole(asked, '--limit'))
}

/** The kinds the rewrite may take: FIT_REWRITE_KINDS (fish, plants and breeds when unset or empty), narrowed by `--kind`. */
export const FIT_REWRITE_DEFAULT = ['species', 'plants', 'breeds'] as const
export function fitRewriteKinds(env: Env, flag?: string): string[] {
  const allowed = (given(env.FIT_REWRITE_KINDS) ?? FIT_REWRITE_DEFAULT.join(',')).split(',').map(s => s.trim()).filter(Boolean)
  const asked = given(flag)?.split(',').map(s => s.trim()).filter(Boolean)
  return asked ? allowed.filter(k => asked.includes(k)) : allowed
}
