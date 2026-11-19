import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// The reader-fit rewrite writes a guide again whole, checked only for its old digit figures appearing somewhere in the
// new text. The cycle leaves guides out of it until that check is stronger; fish, plant and breed parts, mended
// cut-only, go on.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))

test("the cycle's reader-fit rewrite leaves guides out, unless FIT_REWRITE_KINDS names them", () => {
  const cycle = readFileSync(join(ROOT, 'scripts/engine-cycle.sh'), 'utf8')
  const calls = cycle.split('\n').filter(l => /^\s*pnpm engine fit-rewrite\b/.test(l))
  expect(calls).toHaveLength(1)
  const kinds = /--kind "\$\{FIT_REWRITE_KINDS:-([a-z,]+)\}"/.exec(calls[0]!)?.[1]?.split(',')
  expect(kinds?.sort()).toEqual(['breeds', 'plants', 'species'])
  // The command matches a page by its content folder's name (cli.ts fit-rewrite, `--kind`).
  for (const k of [...kinds!, 'guides']) expect(existsSync(join(ROOT, 'apps/site/test/fixture-content', k)), k).toBe(true)
})
