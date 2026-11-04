import { defineConfig } from 'vitest/config'
// testTimeout: the engine's cycle runs every package's tests on the owner's Mac (packages/engine/vitest.config.ts says why).
export default defineConfig({ test: { include: ['test/**/*.test.ts', 'worker/test/**/*.test.ts'], testTimeout: 30_000 } })
