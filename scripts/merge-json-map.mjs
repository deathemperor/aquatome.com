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
// list) stays out; else a person's answer (a well-formed look) is kept, and where the other side marked the record off at
// its first verdict, the answer goes on that marked record, so the waiting entry its run wrote keeps a record marked for
// it and a clear can lift it (the independent reader, 21 Nov 2026). A clear for another reason than the mark's is the one
// answer dropped: the mark and its waiting entry stay, for a look of their own, since no mismatch loosens the never-again
// list (the chief of staff's rule, 20 Nov) and the entry the merge keeps is the mark's (the independent reader, 21 Nov).
// Else the record marked off wins over one that isn't, so that waiting entry keeps its record (two runs met so on 20 Nov,
// and main's unmarked records won: the chief of staff, 20 Nov 2026); else ours.
const record = v => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.why === 'string' && typeof v.step === 'string' && Array.isArray(v.pages) && typeof v.at === 'string'
const answered = v => !!v.look && (v.look.said === 'agree' || v.look.said === 'clear') && typeof v.look.by === 'string' && v.look.by.trim() !== '' && /^\d{4}-\d{2}-\d{2}$/.test(v.look.on ?? '')
const placesOf = (r, field = 'left') => Array.isArray(r?.[field]) ? r[field].filter(p => typeof p?.file === 'string' && Number.isSafeInteger(p.index) && p.index >= 0) : []
const placeKey = p => p.occurrence ? `${p.file}#${p.occurrence}` : p.file
function mergePlaces(chosen, base, ours, theirs) {
  if (ours.off !== true || theirs.off !== true) return chosen
  const other = chosen === ours ? theirs : ours
  const at = ours.at < theirs.at ? ours.at : theirs.at
  const datedPlaces = (mark, field) => placesOf(mark, field).map(p => {
    const { captureDay, captureWhy, ...place } = p
    const captured = captureDay ?? mark.at
    const reason = captureWhy ?? mark.why
    return { ...place, ...(captured === at ? {} : { captureDay: captured }), ...(reason === chosen.why ? {} : { captureWhy: reason }) }
  })
  const settled = new Map([...datedPlaces(other, 'settled'), ...datedPlaces(chosen, 'settled')].map(p => [placeKey(p), p]))
  const original = new Map(datedPlaces(base).map(p => [placeKey(p), p]))
  const pending = new Map(datedPlaces(chosen).map(p => [placeKey(p), p]))
  const sameCapture = (p, q) => !!p && !!q && p.capture === q.capture && p.index === q.index && p.captureDay === q.captureDay && p.captureWhy === q.captureWhy
  for (const place of datedPlaces(other)) {
    const before = original.get(placeKey(place))
    const selected = pending.get(placeKey(place))
    if (chosen.back && sameCapture(place, before)) continue
    if (!selected || (sameCapture(selected, before) && !sameCapture(place, before))) pending.set(placeKey(place), place)
  }
  for (const [file, receipt] of settled) {
    const next = pending.get(file)
    if (!next) continue
    // The completed receipt wins over a competing first capture. Only a replacement of that receipt reopens it.
    if (sameCapture(receipt, original.get(file)) && !sameCapture(receipt, next)) settled.delete(file)
    else pending.delete(file)
  }
  const { back, left, settled: _settled, ...merged } = chosen
  merged.at = at
  if ((settled.size || pending.size) && record(ours) && record(theirs)) merged.pages = [...new Set([...ours.pages, ...theirs.pages])].sort()
  if (settled.size) merged.settled = [...settled.values()]
  if (pending.size) return { ...merged, left: [...pending.values()] }
  const completed = back ?? other.back
  return completed ? { ...merged, back: completed } : merged
}

function bothChanged(base, ours, theirs, k) {
  if (!(k in ours) || !(k in theirs)) return k in base ? undefined : (k in ours ? ours : theirs)
  const [o, t] = [ours[k], theirs[k]]
  if (answered(o) !== answered(t)) {
    const [a, m] = answered(o) ? [o, t] : [t, o]
    if (m.off === true && a.look.said === 'clear' && a.why !== m.why) return { [k]: mergePlaces(m, base[k], o, t) }
    return { [k]: m.off === true && a.off !== true ? { ...m, look: a.look } : mergePlaces(a, base[k], o, t) }
  }
  if ((o.off === true) !== (t.off === true)) return o.off === true ? ours : theirs
  return { [k]: mergePlaces(o, base[k], o, t) }
}

// A never-again entry (engine-state/_photo-rejected.json) both sides changed, one a waiting entry (last-photo.ts
// waitingEntry) and the other a reason for good: the reason for good wins. A run's first verdict and an agree's sweep met
// so in a merge, and the waiting entry that won stood with no record for it, for good (the independent reader, 21 Nov
// 2026). Told by its exact shape: no other file the driver merges holds one.
const WAITING = /^waiting: withheld \[sha256:[0-9a-f]{64}\]$/
const waitingAndFinal = (o, t) => typeof o === 'string' && typeof t === 'string' && WAITING.test(o) !== WAITING.test(t)

// An emptied fish page's entry (engine-state/_priority-emptied.json, packages/engine/src/emptied-pages.ts): `species/id`
// or `breeds/id` to the day it went on the list. Told by its shape: no other file the driver merges holds one (a test in
// emptied-pages.test.ts holds that). Where both sides gave it a day, the earlier wins, so the page keeps its first day:
// two runs that each emptied one page list it on their own day, and in a run's rebase ours is main's, so the later run's
// day stood (the independent reader, 21 Nov 2026).
const LISTED = /^(species|breeds)\/[a-z0-9-]+$/, DAY = /^\d{4}-\d{2}-\d{2}$/
const listedDays = (k, o, t) => LISTED.test(k) && typeof o === 'string' && typeof t === 'string' && DAY.test(o) && DAY.test(t)

export function mergeMaps(base, ours, theirs) {
  const same = (side, k) => (k in side) === (k in base) && JSON.stringify(side[k]) === JSON.stringify(base[k])
  const out = {}
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])) {
    const changed = !same(ours, k) && !same(theirs, k)
    const both = changed && [base[k], ours[k], theirs[k]].some(record) && [base[k], ours[k], theirs[k]].every(v => v === undefined || record(v))
    const side = both ? bothChanged(base, ours, theirs, k)
      : changed && k in ours && k in theirs && waitingAndFinal(ours[k], theirs[k]) ? (WAITING.test(ours[k]) ? theirs : ours)
      : changed && k in ours && k in theirs && listedDays(k, ours[k], theirs[k]) ? (theirs[k] < ours[k] ? theirs : ours)
      : !same(ours, k) ? ours : !same(theirs, k) ? theirs : base
    if (side && k in side) out[k] = side[k]
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return {} } }
  writeFileSync(ours, `${JSON.stringify(mergeMaps(read(base), read(ours), read(theirs)), null, 2)}\n`)
}
