import { readFileSync } from 'node:fs'
import { configDefaults } from 'vitest/config'

/**
 * A package's test excludes: vitest's own, and with AQ_CONTENT_ONLY set (a content run's short checks,
 * scripts/cycle-checks.sh), the package's files listed in scripts/content-tests.json as reading none of the real content.
 * `pkg` is the package's folder from the repository's root, as "packages/engine".
 */
export function testExclude(pkg: string): string[] {
  if (!process.env.AQ_CONTENT_ONLY) return configDefaults.exclude
  const list: string[] = JSON.parse(readFileSync(new URL('../../../scripts/content-tests.json', import.meta.url), 'utf8')).leaveOut
  return [...configDefaults.exclude, ...list.filter(f => f.startsWith(`${pkg}/`)).map(f => f.slice(pkg.length + 1))]
}
