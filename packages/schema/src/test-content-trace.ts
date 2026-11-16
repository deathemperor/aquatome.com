import childProcess from 'node:child_process'
import fs, { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect } from 'vitest'

/**
 * Which test files read the repository's real content: a setup file in each package's vitest config, idle unless
 * AQ_CONTENT_TRACE names a file to write to. A content run's checks take the short path (scripts/cycle-checks.sh): main's
 * code was already proven on GitHub, so they run the tests that read what the run changed and leave out the files listed
 * in scripts/content-tests.json as reading none of it. ci.yml runs every test with this on and fails if a listed file read
 * any, so the list can only cost time, never skip a content check.
 *
 * A line per read: the test file, then `read` and the path, or `spawn` and the command for a child process started inside
 * the repository (it may read the content where this can't see), both from the repository's root.
 */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const WATCHED = ['content', 'engine-state', 'sources', 'docs/review'].map(d => `${ROOT}/${d}`)
const out = process.env.AQ_CONTENT_TRACE

const rel = (p: string) => p.slice(ROOT.length + 1)
const testFile = () => { const t = expect.getState().testPath; return t ? rel(t) : 'unknown' }
const pathOf = (p: unknown): string | undefined => {
  if (p instanceof URL) return p.protocol === 'file:' ? fileURLToPath(p) : undefined
  if (typeof p === 'string') return p.startsWith('/') ? p : `${process.cwd()}/${p}`
  if (Buffer.isBuffer(p)) return pathOf(p.toString())
  return undefined
}
const write = (kind: string, what: string) => { appendFileSync(out!, `${testFile()}\t${kind}\t${what}\n`) }
const read = (p: unknown) => {
  const s = pathOf(p)
  if (s && WATCHED.some(w => s === w || s.startsWith(`${w}/`))) write('read', rel(s))
}
const wrap = (o: Record<string, unknown>, names: string[], seen: (args: unknown[]) => void) => {
  for (const name of names) {
    const orig = o[name]
    if (typeof orig !== 'function') continue
    o[name] = function (this: unknown, ...args: unknown[]) { seen(args); return orig.apply(this, args) }
  }
}

if (out) {
  const opens = ['readFile', 'readdir', 'stat', 'lstat', 'access', 'open', 'opendir', 'exists', 'createReadStream', 'readlink', 'realpath']
  wrap(fs as unknown as Record<string, unknown>, [...opens, ...opens.map(n => `${n}Sync`)], a => read(a[0]))
  wrap(fs.promises as unknown as Record<string, unknown>, opens, a => read(a[0]))
  // A child process inside the repository: its cwd, or this process's when it names none.
  const inRepo = (o: unknown) => {
    const cwd = (o && typeof o === 'object' && 'cwd' in o ? pathOf((o as { cwd: unknown }).cwd) : undefined) ?? process.cwd()
    return cwd === ROOT || cwd.startsWith(`${ROOT}/`)
  }
  const started = (args: unknown[]) => {
    const [cmd, second, third] = args
    const opts = Array.isArray(second) ? third : second
    if (inRepo(opts)) write('spawn', [cmd, ...(Array.isArray(second) ? second : [])].map(String).join(' ').slice(0, 200))
  }
  wrap(childProcess as unknown as Record<string, unknown>, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], started)
  syncBuiltinESMExports()
}
