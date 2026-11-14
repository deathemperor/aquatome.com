/**
 * A test run's scratch: one folder of its own in the system temp folder, removed when the run ends. Every test's
 * `mkdtemp(join(tmpdir(), …))`, and every program a test starts, lands in it (the chief of staff, 15 Nov 2026: tests had
 * left 718,000 folders there, about 78 GB, and it grew by 1.5 GB an hour). Each package's vitest.config.ts makes it once,
 * in vitest's own process before any worker starts, so the workers and what they run take their TMPDIR from it. A run
 * that's killed leaves its folder to the hourly sweep (scripts/machine-sweep.mjs `scratch`), after six hours.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The start of a run's folder's name, which the sweep knows it by. */
export const RUN_SCRATCH = 'aq-tests-'

/** Makes the run's folder in `parent` and points `env`'s temp folder at it; `end` removes it with all it holds. */
export function runScratch(parent = tmpdir(), env: NodeJS.ProcessEnv = process.env): { dir: string; end: () => void } {
  const dir = mkdtempSync(join(parent, RUN_SCRATCH))
  for (const k of ['TMPDIR', 'TMP', 'TEMP']) env[k] = dir
  return { dir, end: () => rmSync(dir, { recursive: true, force: true }) }
}

/**
 * For a package's vitest.config.ts: the run's folder, removed as vitest's process exits, and on a hang-up, which ends
 * vitest without its exit (a closed terminal; Grok's read). A run killed outright leaves it to the sweep.
 */
export function testRunScratch(): string {
  const { dir, end } = runScratch()
  process.once('exit', end)
  process.once('SIGHUP', () => { end(); process.kill(process.pid, 'SIGHUP') })
  return dir
}
