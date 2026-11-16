#!/usr/bin/env node
// The test files a content run's checks leave out: those that read none of the real content. A content run takes the
// short path (scripts/cycle-checks.sh, `checks_for`) when main's code was already proven on GitHub, and then runs every
// test file but these (`pnpm test:content`: each package's vitest config reads this list when AQ_CONTENT_ONLY is set).
//
// The list is written from a trace of the whole suite (@aq/schema's test-content-trace.ts, AQ_CONTENT_TRACE): a file is
// on it when the trace saw it run and read nothing under content/, engine-state/, sources/ or docs/review/. A file that
// starts a process inside the repository may read the content through it, where the trace can't see, and one GitHub's
// runner skips isn't seen at all: either stays in the short path until a person has read it and named it, with why,
// under `readByHand`. ci.yml runs every test with the trace on and fails if a listed file read the content, or started a
// process or didn't run and isn't named there: a stale list only costs time, it never skips a content check.
//
//   node scripts/content-tests.mjs check <trace>   fails, naming them, if a listed file read the content
//   node scripts/content-tests.mjs write <trace>   writes the list: every test file the trace didn't see read any
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

/** The test files the trace saw run, what each read and the processes each started: test file → its first three. */
function traced(file) {
  const ran = new Map()
  const reads = new Map()
  const spawns = new Map()
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const [test, kind, what] = line.split('\t')
    if (!test || !['ran', 'read', 'spawn'].includes(kind)) continue
    const t = test.startsWith('/') ? relative(ROOT, test) : test
    const by = kind === 'ran' ? ran : kind === 'read' ? reads : spawns
    const seen = by.get(t) ?? []
    if (seen.length < 3) seen.push(what)
    by.set(t, seen)
  }
  return { ran, reads, spawns }
}

const list = () => JSON.parse(readFileSync(LIST, 'utf8'))
export const leftOut = () => list().leaveOut

const [cmd, trace] = process.argv.slice(2)
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!trace || !['check', 'write'].includes(cmd)) {
    console.error('usage: node scripts/content-tests.mjs check|write <trace>')
    process.exit(2)
  }
  const { ran, reads, spawns } = traced(trace)
  const { readByHand } = list()
  const read = new Set(Object.keys(readByHand).filter(f => !f.startsWith('$')))
  // Left out: seen to run and read nothing, and either started no process or a person read it.
  const out = f => !reads.has(f) && (read.has(f) || (ran.has(f) && !spawns.has(f)))
  // A read the trace couldn't put to a test file could be any file's, a listed one's too: neither command goes on.
  if (reads.has('unknown') || spawns.has('unknown')) {
    console.error(`reads or processes no test file was named for: ${[...(reads.get('unknown') ?? []), ...(spawns.get('unknown') ?? [])].join('; ')}`)
    process.exit(1)
  }
  if (cmd === 'write') {
    const all = testFiles()
    const leaveOut = all.filter(out)
    const comment = 'Test files a content run leaves out: none read the real content in the trace (scripts/content-tests.mjs). leaveOut is written, not edited by hand; readByHand is.'
    writeFileSync(LIST, `${JSON.stringify({ $comment: comment, leaveOut, readByHand }, null, 2)}\n`)
    console.log(`${leaveOut.length} of ${all.length} test files left out of a content run's checks; ${reads.size} read the content`)
    for (const f of all.filter(f => !out(f) && !reads.has(f))) {
      console.log(`kept: ${f} ${spawns.has(f) ? `starts processes no one has read (${spawns.get(f).join('; ')})` : "wasn't seen to run"}`)
    }
  } else {
    let bad = 0
    for (const f of leftOut()) {
      if (reads.has(f)) console.error(`${f} reads the real content, but a content run leaves it out: ${reads.get(f).join('; ')}`)
      else if (spawns.has(f) && !read.has(f)) console.error(`${f} starts processes no one has read, but a content run leaves it out: ${spawns.get(f).join('; ')}`)
      else if (!ran.has(f) && !read.has(f)) console.error(`${f} wasn't seen to run, but a content run leaves it out`)
      else continue
      bad++
    }
    if (bad) {
      console.error('Write the list again: node scripts/content-tests.mjs write <the trace>, from a run of every test with AQ_CONTENT_TRACE set (ci.yml keeps it as the content-trace artifact).')
      process.exit(1)
    }
    console.log(`the ${leftOut().length} test files a content run leaves out read none of the real content`)
  }
}
