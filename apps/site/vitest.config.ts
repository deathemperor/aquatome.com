import { defineConfig } from 'vitest/config'
// AQ_TEST_TIME_SCALE: the engine's cycle sets it on the owner's Mac while heat has taken cores away, and on a check's
// second try (scripts/cycle-checks.sh): the default limits, and each test's own (@aq/schema/test-time), that many times.
const scale = Math.max(1, Number(process.env.AQ_TEST_TIME_SCALE) || 1)
// testTimeout: the engine's cycle runs every package's tests on the owner's Mac (packages/engine/vitest.config.ts says why).
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'worker/test/**/*.test.ts'], testTimeout: 30_000 * scale, hookTimeout: 10_000 * scale } })
