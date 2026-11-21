#!/usr/bin/env node
// git merge driver for the engine's keyed records (engine-state/_photo-*.json, _wanted.json, _gbif-names.json,
// _sources.json): the parallel jobs of one engine run all add to them, so a plain merge conflicts on the last lines.
// Per key, the side that changed it (added, edited, removed) wins; ours first.
// .gitattributes: engine-state/_photo-*.json merge=jsonmap (and the others; also the UI translations, which parallel PRs all add to)
// git config merge.jsonmap.driver 'node scripts/merge-json-map.mjs %O %A %B'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// A second-look record (engine-state/_photo-second-look.json, packages/engine/src/last-photo.ts), told by its shape since
// the driver isn't told the file's name. Where both sides changed one: one taken out (an agree moves it to the never-again
// list) stays out; else a person's answer (a well-formed look) is never dropped, and where the other side marked the
// record off at its first verdict, the answer goes on that marked record, so the waiting entry its run wrote keeps a
// record marked for it and a clear can lift it (the independent reader, 21 Nov 2026); else the record marked off wins over
// one that isn't, so that waiting entry keeps its record (two runs met so on 20 Nov, and main's unmarked records won: the
// chief of staff, 20 Nov 2026); else ours.
const record = v => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.why === 'string' && typeof v.step === 'string' && Array.isArray(v.pages) && typeof v.at === 'string'
const answered = v => !!v.look && (v.look.said === 'agree' || v.look.said === 'clear') && typeof v.look.by === 'string' && v.look.by.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(v.look.on ?? '')
function bothChanged(base, ours, theirs, k) {
  if (!(k in ours) || !(k in theirs)) return k in base ? undefined : (k in ours ? ours : theirs)
  const [o, t] = [ours[k], theirs[k]]
  if (answered(o) !== answered(t)) {
    const [a, m] = answered(o) ? [o, t] : [t, o]
    return { [k]: m.off === true && a.off !== true ? { ...m, look: a.look } : a }
  }
  if ((o.off === true) !== (t.off === true)) return o.off === true ? ours : theirs
  return ours
}

export function mergeMaps(base, ours, theirs) {
  const same = (side, k) => (k in side) === (k in base) && JSON.stringify(side[k]) === JSON.stringify(base[k])
  const out = {}
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])) {
    const both = !same(ours, k) && !same(theirs, k) && [base[k], ours[k], theirs[k]].some(record) && [base[k], ours[k], theirs[k]].every(v => v === undefined || record(v))
    const side = both ? bothChanged(base, ours, theirs, k) : !same(ours, k) ? ours : !same(theirs, k) ? theirs : base
    if (side && k in side) out[k] = side[k]
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return {} } }
  writeFileSync(ours, `${JSON.stringify(mergeMaps(read(base), read(ours), read(theirs)), null, 2)}\n`)
}
