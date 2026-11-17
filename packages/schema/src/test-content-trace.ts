import childProcess from 'node:child_process'
import fs, { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect } from 'vitest'

/**
 * Which test files read the repository's real content: a setup file in each package's vitest config, idle unless
 * AQ_CONTENT_TRACE names a file to write to. A content run's checks take the short path (scripts/cycle-checks.sh): main's
 * code was already proven on GitHub, so they run the tests that read what the run changed and leave out the files listed
 * in scripts/content-tests.json as reading none of it. ci.yml runs every test with this on and fails if a listed file read
 * any, so the list can only cost time, never skip a content check.
 *
 * A line per test file and what it read: the test file, then `read` and the folder (content/species), `spawn` and the
 * command for a child process started inside the repository (it may read the content where this can't see), or `ran`,
 * from the repository's root.
 */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const WATCHED = ['content', 'engine-state', 'sources', 'docs/review'].map(d => `${ROOT}/${d}`)
const out = process.env.AQ_CONTENT_TRACE

const rel = (p: string) => p.slice(ROOT.length + 1)
const testFile = () => { const t = expect.getState().testPath; return t ? rel(t) : 'unknown' }
// Absolute and normalised (`..`, `.`), a relative one from this process's working folder.
const pathOf = (p: unknown): string | undefined => {
  if (p instanceof URL) return p.protocol === 'file:' ? resolve(fileURLToPath(p)) : undefined
  if (typeof p === 'string') return resolve(p)
  if (Buffer.isBuffer(p)) return pathOf(p.toString())
  return undefined
}
// Each line once a test file: a read by its folder (content/species), a command on one line.
const written = new Set<string>()
const write = (kind: string, what: string) => {
  const line = `${testFile()}\t${kind}\t${what.replace(/\s+/g, ' ')}\n`
  if (written.has(line)) return
  written.add(line)
  appendFileSync(out!, line)
}
const read = (p: unknown) => {
  const s = pathOf(p)
  if (s && WATCHED.some(w => s === w || s.startsWith(`${w}/`))) write('read', rel(s).split('/').slice(0, s.startsWith(`${ROOT}/docs/`) ? 3 : 2).join('/'))
}
const wrap = (o: Record<string, unknown>, names: string[], seen: (args: unknown[]) => void) => {
  for (const name of names) {
    const orig = o[name]
    if (typeof orig !== 'function') continue
    const wrapped = function (this: unknown, ...args: unknown[]) { seen(args); return orig.apply(this, args) }
    // Its own properties too: execFile's and exists's promise forms (util.promisify.custom) live on the function.
    for (const key of Reflect.ownKeys(orig)) {
      if (key === 'length' || key === 'name' || key === 'prototype' || key === promisify.custom) continue
      Object.defineProperty(wrapped, key, Object.getOwnPropertyDescriptor(orig, key)!)
    }
    // The promise form calls the original underneath, so it is watched as well.
    const custom = (orig as unknown as Record<symbol, unknown>)[promisify.custom]
    if (typeof custom === 'function') {
      Object.defineProperty(wrapped, promisify.custom, { value(this: unknown, ...args: unknown[]) { seen(args); return custom.apply(this, args) } })
    }
    o[name] = wrapped
  }
}

if (out) {
  // That the file ran at all: a file the trace never saw run (skipped on this machine) is never left out.
  beforeAll(() => write('ran', '-'))
  // Each with the path it reads first; a copy's is its source (alt-names.test.ts copies the real content/sources.json).
  const opens = ['readFile', 'readdir', 'stat', 'lstat', 'access', 'open', 'opendir', 'exists', 'createReadStream', 'readlink', 'realpath', 'copyFile', 'cp', 'glob', 'openAsBlob']
  wrap(fs as unknown as Record<string, unknown>, [...opens, ...opens.map(n => `${n}Sync`)], a => read(a[0]))
  wrap(fs.promises as unknown as Record<string, unknown>, opens, a => read(a[0]))
  // A child process inside the repository (its cwd, or this process's when it names none), or one whose command names a
  // watched folder by its full path from anywhere (`cat <repo>/content/x` from the temp folder).
  const inRepo = (o: unknown) => {
    const cwd = (o && typeof o === 'object' && 'cwd' in o ? pathOf((o as { cwd: unknown }).cwd) : undefined) ?? process.cwd()
    return cwd === ROOT || cwd.startsWith(`${ROOT}/`)
  }
  const started = (args: unknown[]) => {
    const [cmd, second, third] = args
    const words = [cmd, ...(Array.isArray(second) ? second : [])].map(String)
    const opts = Array.isArray(second) ? third : second
    if (inRepo(opts) || words.some(w => WATCHED.some(d => w.includes(d)))) write('spawn', words.join(' ').slice(0, 200))
  }
  wrap(childProcess as unknown as Record<string, unknown>, ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'], started)
  syncBuiltinESMExports()
}
