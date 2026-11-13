import { defineConfig } from 'vitest/config'
// AQ_TEST_TIME_SCALE: the engine's cycle sets it on the owner's Mac while heat has taken cores away, and on a check's
// second try (scripts/cycle-checks.sh): the default limits, and each test's own (@aq/schema/test-time), that many times.
const scale = Math.max(1, Number(process.env.AQ_TEST_TIME_SCALE) || 1)
// The engine workflow sets YOUTUBE_API_KEY for the whole cycle, tests included; with it set, tests would call YouTube.
// testTimeout: the cycle's tests run on the owner's Mac beside the other parts, the iOS simulator and builds. At a load
// of 130–260 (16 cores, 2026-11-03), tests that take 1 s alone went past vitest's 5 s and stopped the sf cycle from
// publishing; a hung test still fails, after 30 s. The schema's and the site's tests run in the cycle too, with the same.
// ENGINE_COST_LOG: a cycle exports it and then runs these tests, and with none named a call logs to the hand runs' file.
// Either way a test's stand-in model call would be written to a real cost log and counted against a step's ceiling for
// the day (ceiling.ts), and at a ceiling of $0 it would fail. `off` is no log and no ceiling; a test that needs a log
// names its own.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], env: { YOUTUBE_API_KEY: '', UNSPLASH_ACCESS_KEY: '', ENGINE_COST_LOG: 'off', ENGINE_CLI_VERSION: '' }, testTimeout: 30_000 * scale, hookTimeout: 10_000 * scale } })
