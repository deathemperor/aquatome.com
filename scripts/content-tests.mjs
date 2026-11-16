#!/usr/bin/env node
// The test files a content run's checks leave out: those that read none of the real content. A content run takes the
// short path (scripts/cycle-checks.sh, `checks_for`) when main's code was already proven on GitHub, and then runs every
// test file but these (each package's vitest config reads this list when AQ_CONTENT_ONLY is set).
//
// The list is written from a trace of the whole suite (@aq/schema's test-content-trace.ts, AQ_CONTENT_TRACE): a file is
// on it when it read nothing under content/, engine-state/, sources/ or docs/review/ and started no process inside the
// repository. ci.yml runs every test with the trace on and fails if a file on the list read any: a stale list only costs
// time, it never skips a content check.
//
//   node scripts/content-tests.mjs check <trace>   fails, naming them, if a listed file read the content
//   node scripts/content-tests.mjs write <trace>   writes the list: every test file the trace didn't name
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const LIST = join(ROOT, 'scripts/content-tests.json')
// Each package's tests, from the repository's root.
const DIRS = ['packages/schema/test', 'packages/engine/test', 'apps/site/test', 'apps/site/worker/test']

function testFiles() {
  const out = []
  const walk = d => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.test.ts')) out.push(p)
    }
  }
  for (const d of DIRS) walk(d)
  return out.sort()
}

/** The test files the trace names, each with what it read or started (its first three). */
function traced(file) {
  const by = new Map()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const [test, kind, what] = line.split('\t')
    if (!test || !kind) continue
    const t = test.startsWith('/') ? relative(ROOT, test) : test
    const seen = by.get(t) ?? []
    if (seen.length < 3) seen.push(`${kind} ${what}`)
    by.set(t, seen)
  }
  return by
}

export const leftOut = () => JSON.parse(readFileSync(LIST, 'utf8')).leaveOut

const [cmd, trace] = process.argv.slice(2)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!trace || !['check', 'write'].includes(cmd)) {
    console.error('usage: node scripts/content-tests.mjs check|write <trace>')
    process.exit(2)
  }
  const by = traced(trace)
  if (by.has('unknown')) console.error(`reads no test file was named for: ${by.get('unknown').join('; ')}`)
  if (cmd === 'write') {
    const leaveOut = testFiles().filter(f => !by.has(f))
    const comment = 'Test files a content run leaves out: none read the real content in the trace (scripts/content-tests.mjs). Written, not edited by hand.'
    writeFileSync(LIST, `${JSON.stringify({ $comment: comment, leaveOut }, null, 2)}\n`)
    console.log(`${leaveOut.length} of ${testFiles().length} test files left out of a content run's checks; ${by.size} read the content`)
  } else {
    const bad = leftOut().filter(f => by.has(f))
    for (const f of bad) console.error(`${f} reads the real content, but a content run leaves it out: ${by.get(f).join('; ')}`)
    if (bad.length) {
      console.error('Write the list again: node scripts/content-tests.mjs write <the trace>, from a run of every test with AQ_CONTENT_TRACE set.')
      process.exit(1)
    }
    console.log(`the ${leftOut().length} test files a content run leaves out read none of the real content`)
  }
}
