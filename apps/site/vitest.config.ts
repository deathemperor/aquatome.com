import { defineConfig } from 'vitest/config'
import { testRunScratch } from '../../packages/schema/src/test-scratch.ts'
// AQ_TEST_TIME_SCALE: the engine's cycle sets it on the owner's Mac while heat has taken cores away, and on a check's
// second try (scripts/cycle-checks.sh): the default limits, and each test's own (@aq/schema/test-time), that many times.
const scale = Math.max(1, Number(process.env.AQ_TEST_TIME_SCALE) || 1)
// testTimeout: the engine's cycle runs every package's tests on the owner's Mac (packages/engine/vitest.config.ts says why).
// The run's scratch, one folder removed when it ends (@aq/schema/test-scratch): tests never leave theirs in the temp folder.
testRunScratch()
// setupFiles: which test files read the real content, when AQ_CONTENT_TRACE asks (@aq/schema's test-content-trace.ts).
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'worker/test/**/*.test.ts'], setupFiles: ['../../packages/schema/src/test-content-trace.ts'], testTimeout: 30_000 * scale, hookTimeout: 10_000 * scale } })
