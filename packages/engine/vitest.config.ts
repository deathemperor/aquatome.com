import { defineConfig } from 'vitest/config'
// The engine workflow sets YOUTUBE_API_KEY for the whole cycle, tests included; with it set, tests would call YouTube.
// testTimeout: the cycle's tests run on the owner's Mac beside the other parts, the iOS simulator and builds. At a load
// of 130–260 (16 cores, 2026-11-03), tests that take 1 s alone went past vitest's 5 s and stopped the sf cycle from
// publishing; a hung test still fails, after 30 s. The schema's and the site's tests run in the cycle too, with the same.
// ENGINE_COST_LOG: a cycle exports it and then runs these tests. With it set, a test's stand-in model call would be
// written to the real cost log and counted against a step's ceiling for the day (ceiling.ts), and at a ceiling of $0 it
// would fail. A test that needs a log names its own.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], env: { YOUTUBE_API_KEY: '', UNSPLASH_ACCESS_KEY: '', ENGINE_COST_LOG: '' }, testTimeout: 30_000 } })
