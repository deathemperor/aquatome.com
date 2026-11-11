/** Claude's usage limit (the owner's subscription): a failure of the claude CLI that says so. The engine's pattern (packages/engine/src/state.ts USAGE). */
const USAGE = /^claude failed\b.*(hit your .*limit|usage limit|limit reached|rate.?limit)/i
/** Our own stop (claude-accounts.ts ceilingStop): the step's daily ceiling is reached, or its day couldn't be counted. */
const OURS = /^claude failed: (today's (?:ceiling|spend) for .+)$/s

/**
 * A review that hit the limit did not run: the reason to skip it, "Claude usage limit: <the CLI's text>", or our own
 * ceiling's words as they are (scripts/site-watch.mjs puts it in the PR comment). Any other failure: undefined, and the
 * review fails as before.
 */
export const usageLimit = (error: string) => {
  const ours = OURS.exec(error)?.[1]
  if (ours) return `${ours[0]!.toUpperCase()}${ours.slice(1)}`
  return USAGE.test(error) ? `Claude usage limit: ${error.replace(/^claude failed \(\w+\): /i, '')}` : undefined
}
