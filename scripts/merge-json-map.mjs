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
const placeKey = p => `${p.file}:${JSON.stringify(p.path ?? [])}`
const placesOf = (r, field = 'left') => Array.isArray(r?.[field]) ? r[field].filter(p => typeof p?.file === 'string' && Number.isSafeInteger(p.index) && (p.index >= 0 || p.index === -1 && p.path?.[3] === 'photo')) : []
function mergePlaces(chosen, base, ours, theirs) {
  if (ours.off !== true || theirs.off !== true || ours.why !== theirs.why) return chosen
  const other = chosen === ours ? theirs : ours
  const at = ours.at < theirs.at ? ours.at : theirs.at
  const datedPlaces = (mark, field) => placesOf(mark, field).map(p => {
    const { captureDay, ...place } = p
    const captured = captureDay ?? mark.at
    return captured === at ? place : { ...place, captureDay: captured }
  })
  const settled = new Map([...datedPlaces(other, 'settled'), ...datedPlaces(chosen, 'settled')].map(p => [placeKey(p), p]))
  const original = new Map(datedPlaces(base).map(p => [placeKey(p), p]))
  const pending = new Map(datedPlaces(chosen).map(p => [placeKey(p), p]))
  const sameCapture = (p, q) => !!p && !!q && p.capture === q.capture && p.index === q.index && p.captureDay === q.captureDay
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
    if (m.off === true && a.look.said === 'clear' && a.why !== m.why) return { [k]: m }
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

// Part-photo exclusions can be cleared for a guide while another run adds a guide. Keep each membership change
// relative to the base. A human agreement keeps its guide excluded even when a different held photo is cleared.
const partFields = ['why', 'guides', 'seconds', 'agreedGuides', 'manualGuides']
const guideHolds = v => v === undefined || (!!v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v).every(Array.isArray))
const partOff = v => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.why === 'string' &&
  Object.keys(v).every(k => partFields.includes(k) || k === 'holds') && guideHolds(v.holds) &&
  partFields.slice(1).every(k => v[k] === undefined || Array.isArray(v[k]))
function partsOff(base, ours, theirs) {
  const entries = [base, ours, theirs]
  return entries.every(v => v === undefined || partOff(v)) &&
    entries.some(v => v && partFields.slice(1).some(k => Array.isArray(v[k])))
}
function mergePartOff(base, ours, theirs) {
  const mergeMembers = (a = [], o = [], t = []) => [...new Set([
    ...a.filter(value => o.includes(value) && t.includes(value)),
    ...o.filter(value => !a.includes(value)),
    ...t.filter(value => !a.includes(value)),
  ])]
  const winner = ours ?? theirs
  if (!winner) return undefined
  const urls = new Set([base, ours, theirs].flatMap(mark => Object.keys(mark?.holds ?? {})))
  const holds = Object.fromEntries([...urls].flatMap(url => {
    const guides = mergeMembers(base?.holds?.[url], ours?.holds?.[url], theirs?.holds?.[url]).sort()
    return guides.length ? [[url, guides]] : []
  }))
  if ([ours, theirs].some(v => v && !v.guides && !v.seconds)) return { why: winner.why, ...(Object.keys(holds).length ? { holds } : {}) }
  const seconds = mergeMembers(base?.seconds, ours?.seconds, theirs?.seconds).sort((a, b) => a - b)
  const agreedGuides = mergeMembers(base?.agreedGuides, ours?.agreedGuides, theirs?.agreedGuides).sort()
  const tracksHolds = [base, ours, theirs].some(v => v?.holds || v?.manualGuides || v?.agreedGuides)
  const manual = v => {
    if (!tracksHolds || !v) return v?.manualGuides
    const attributed = new Set([...(v.agreedGuides ?? []), ...Object.values(v.holds ?? {}).flat()])
    return [...new Set([...(v.manualGuides ?? []), ...(v.guides ?? []).filter(g => !attributed.has(g))])]
  }
  const manualGuides = mergeMembers(manual(base), manual(ours), manual(theirs)).sort()
  const guides = [...new Set([
    ...mergeMembers(base?.guides, ours?.guides, theirs?.guides), ...agreedGuides, ...manualGuides, ...Object.values(holds).flat(),
  ])].sort()
  if (!guides.length) return undefined
  return { why: winner.why, guides, ...(seconds.length ? { seconds } : {}),
    ...(agreedGuides.length ? { agreedGuides } : {}), ...(manualGuides.length ? { manualGuides } : {}),
    ...(Object.keys(holds).length ? { holds } : {}) }

}

export function mergeMaps(base, ours, theirs) {
  const same = (side, k) => (k in side) === (k in base) && JSON.stringify(side[k]) === JSON.stringify(base[k])
  const out = {}
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs), ...Object.keys(base)])) {
    const changed = !same(ours, k) && !same(theirs, k)
    const both = changed && [base[k], ours[k], theirs[k]].some(record) && [base[k], ours[k], theirs[k]].every(v => v === undefined || record(v))
    const side = both ? bothChanged(base, ours, theirs, k)
      : changed && k in ours && k in theirs && waitingAndFinal(ours[k], theirs[k]) ? (WAITING.test(ours[k]) ? theirs : ours)
      : changed && k in ours && k in theirs && listedDays(k, ours[k], theirs[k]) ? (theirs[k] < ours[k] ? theirs : ours)
      : changed && partsOff(base[k], ours[k], theirs[k]) ? { [k]: mergePartOff(base[k], ours[k], theirs[k]) }
      : !same(ours, k) ? ours : !same(theirs, k) ? theirs : base
    if (side && k in side && side[k] !== undefined) out[k] = side[k]
  }
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return {} } }
  writeFileSync(ours, `${JSON.stringify(mergeMaps(read(base), read(ours), read(theirs)), null, 2)}\n`)
}
