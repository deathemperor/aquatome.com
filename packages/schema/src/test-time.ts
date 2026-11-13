/**
 * How many times its usual limits a test gets on this run: AQ_TEST_TIME_SCALE, which the engine's cycle sets on the
 * owner's Mac while heat has taken cores away, and on a check's second try (scripts/cycle-checks.sh). 1 anywhere it isn't
 * set: a hand run, GitHub's checks. The vitest configs scale their default limits by it; a test with its own limit gives
 * it as `slow(ms)`.
 */
export const testTimeScale = (): number => Math.max(1, Number(process.env.AQ_TEST_TIME_SCALE) || 1)

/** A test's or a hook's own time limit, scaled for this run (testTimeScale). */
export const slow = (ms: number): number => Math.round(ms * testTimeScale())
