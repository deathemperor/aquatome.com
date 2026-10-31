#!/usr/bin/env node
// git merge driver for the engine's keyed records (engine-state/_photo-*.json, _wanted.json, _gbif-names.json,
// _sources.json): the parallel jobs of one engine run all add to them, so a plain merge conflicts on the last lines.
// Per key, the side that changed it (added, edited, removed) wins; ours first.
// .gitattributes: engine-state/_photo-*.json merge=jsonmap (and the others; also the UI translations, which parallel PRs all add to)
// git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function mergeMaps(base, ours, theirs) {
  const same = (side, k) => (k in side) === (k in base) && JSON.stringify(side[k]) === JSON.stringify(base[k])
  const out = {}
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])) {
    const side = !same(ours, k) ? ours : !same(theirs, k) ? theirs : base
    if (k in side) out[k] = side[k]
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return {} } }
  writeFileSync(ours, `${JSON.stringify(mergeMaps(read(base), read(ours), read(theirs)), null, 2)}\n`)
}
