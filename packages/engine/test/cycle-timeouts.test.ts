import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

test('every package the engine cycle tests gives a test 30 s, so a busy Mac doesn\'t stop a cycle from publishing', async () => {
  // The cycle runs the root `pnpm test`: every package's vitest run (scripts/engine-cycle.sh).
  const configs = ['packages', 'apps'].flatMap(dir => readdirSync(join(ROOT, dir)).map(p => join(ROOT, dir, p, 'vitest.config.ts')))
    .filter(existsSync)
  expect(configs.length).toBeGreaterThanOrEqual(3)
  for (const f of configs) {
    const { default: c } = (await import(f)) as { default: { test?: { testTimeout?: number } } }
    expect(c.test?.testTimeout, f.slice(ROOT.length)).toBeGreaterThanOrEqual(30_000)
  }
})
