/** Claude's usage limit (the owner's subscription): a failure of the claude CLI that says so. The engine's pattern (packages/engine/src/state.ts USAGE). */
const USAGE = /^claude failed\b.*(hit your .*limit|usage limit|limit reached|rate.?limit)/i

/**
 * A review that hit the limit did not run: the reason to skip it, "Claude usage limit: <the CLI's text>"
 * (scripts/site-watch.mjs puts it in the PR comment). Any other failure: undefined, and the review fails as before.
 */
export const usageLimit = (error: string) => (USAGE.test(error) ? `Claude usage limit: ${error.replace(/^claude failed \(\w+\): /i, '')}` : undefined)
