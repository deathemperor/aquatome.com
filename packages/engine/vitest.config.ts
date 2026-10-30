import { defineConfig } from 'vitest/config'
// The engine workflow sets YOUTUBE_API_KEY for the whole cycle, tests included; with it set, tests would call YouTube.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], env: { YOUTUBE_API_KEY: '' } } })
