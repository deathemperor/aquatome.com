#!/usr/bin/env node
// git merge driver for content/changelog.json: the GitHub engine and the Mac's video job both prepend to it, so a plain
// merge conflicts on every pair of runs. Keeps every entry from both sides, newest date first, capped like the engine.
// .gitattributes: content/changelog.json merge=changelog
// git config merge.changelog.driver 'node scripts/merge-changelog.mjs %O %A %B'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MAX = 500

/** Entries new on either side first (ours, then theirs), then the common ones; one copy each; stable newest-first by date. */
export function mergeChangelogs(base, ours, theirs) {
  const key = e => JSON.stringify(e)
  const old = new Set(base.map(key))
  const fresh = e => !old.has(key(e))
  const seen = new Set()
  const out = []
  for (const e of [...ours.filter(fresh), ...theirs.filter(fresh), ...ours, ...theirs]) if (!seen.has(key(e))) { seen.add(key(e)); out.push(e) }
  return out.map((e, i) => ({ e, i })).sort((a, b) => (b.e.date ?? '').localeCompare(a.e.date ?? '') || a.i - b.i).map(x => x.e).slice(0, MAX)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return [] } }
  writeFileSync(ours, `${JSON.stringify(mergeChangelogs(read(base), read(ours), read(theirs)), null, 2)}\n`)
}
