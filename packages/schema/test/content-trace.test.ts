import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { slow } from '../src/test-time'

const FIXTURE = fileURLToPath(new URL('./fixtures/content-trace/', import.meta.url))
const VITEST = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url))

// The trace (src/test-content-trace.ts) decides which test files a content run's checks leave out (scripts/content-tests.mjs),
// so a read it doesn't see is a test the short path could skip. A reader of #1484 (16 Nov 2026) found three it missed: a
// path through "..", a process started outside the repository that names a content folder, and a copy.
test('the trace sees a read through "..", a copy, and a process from elsewhere naming a content folder', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'aq-trace-')), 'trace.tsv')
  const r = spawnSync(process.execPath, [VITEST, 'run', '--config', join(FIXTURE, 'vitest.config.ts')], { cwd: FIXTURE, env: { ...process.env, AQ_CONTENT_TRACE: out }, encoding: 'utf8' })
  expect(r.status, r.stdout + r.stderr).toBe(0)
  const lines = readFileSync(out, 'utf8').trim().split('\n').map(l => l.split('\t'))
  const probe = 'packages/schema/test/fixtures/content-trace/probe.ts'
  expect(lines.filter(l => l[0] !== probe)).toEqual([])
  expect(lines.filter(l => l[1] === 'read').map(l => l[2]).sort()).toEqual(['content/curation.json', 'content/sources.json'])
  expect(lines.find(l => l[1] === 'spawn')?.[2]).toMatch(/^ls \S+\/sources$/)
  expect(lines.some(l => l[1] === 'ran')).toBe(true)
}, slow(60_000))
