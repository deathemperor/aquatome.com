import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// The trace's own test (test/content-trace.test.ts) runs probe.ts through the setup file every package's config has.
export default defineConfig({ test: { root: fileURLToPath(new URL('.', import.meta.url)), include: ['probe.ts'], setupFiles: ['../../../src/test-content-trace.ts'] } })
