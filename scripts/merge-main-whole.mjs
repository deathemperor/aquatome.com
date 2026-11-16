#!/usr/bin/env node
// git merge driver for the files two engine jobs both write that no other driver merges (.gitattributes, merge=main-whole):
// a guide's or a breed's pictures, an album, a playlist, a page's summary card, the photo review page. Only the engine's
// job scripts set it, in the engine's clones, where every merge is a pull that replays the run's commit onto main: %A is
// main's side, %B the run's.
// Until 16 Nov these merged line by line, and the push fallback (`git pull --rebase -X theirs`) took the run's lines where
// both changed and main's elsewhere: a part photo kept its address with another photo's credit, a still main's new frame
// with the run's caption and "no one in it" mark (8, 9, 15 and 16 Nov 2026). So a picture (an object with a `url`) is
// never built from two versions. The file merges three ways, value by value:
// - a value one side changed is that side's; one both changed is main's, a date the later;
// - a list of pictures, or of a video's figures (found by heading), merges item by item: a picture is whole from one
//   side, main's if both changed it. One either side took off is off, whatever the other did to it: a face, a person held
//   for a second look, a mark (nothing else puts those back off; the sweep re-applies only the never-again list). One
//   either side put in goes in whole, after the item it follows on that side; stills stay in order of their second;
// - any other list both changed is main's, whole.
// A summary card is one text with its review: main's whole file, unless main's card is the approved one the run started
// from and the run took it back to pending; then the run's whole file. An approval never goes onto text it didn't read.
// Anything that isn't JSON (the review page, rewritten whole each run): main's.
// git config merge.main-whole.driver 'node scripts/merge-main-whole.mjs %O %A %B %P'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isPicture = v => isObj(v) && typeof v.url === 'string'
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const DATE = /^\d{4}-\d{2}-\d{2}/
/** What finds an item of a list on the other sides: a picture by its address, a figure by its heading. */
const keyOf = x => (isPicture(x) ? `url:${x.url}` : isObj(x) && typeof x.heading === 'string' ? `heading:${x.heading}` : undefined)
const keyed = (...lists) => lists.every(l => l.every(x => keyOf(x) !== undefined))

/** Three-way merge of a value: `base` undefined when both sides added it. */
export function merge3(base, ours, theirs) {
  if (eq(ours, theirs)) return ours
  if (base !== undefined && eq(base, theirs)) return ours
  if (base !== undefined && eq(base, ours)) return theirs
  if (isPicture(ours) || isPicture(theirs)) return ours
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : []
    return keyed(b, ours, theirs) ? mergeList(b, ours, theirs) : ours
  }
  if (isObj(ours) && isObj(theirs)) return mergeObject(isObj(base) ? base : {}, ours, theirs)
  if (typeof ours === 'string' && typeof theirs === 'string' && DATE.test(ours) && DATE.test(theirs)) return ours > theirs ? ours : theirs
  return ours
}

/** A list of pictures or figures, item by item. */
function mergeList(base, ours, theirs) {
  const map = list => { const m = new Map(); for (const x of list) if (!m.has(keyOf(x))) m.set(keyOf(x), x); return m }
  const [b, o, t] = [map(base), map(ours), map(theirs)]
  const out = []
  for (const x of ours) {
    const k = keyOf(x)
    if (t.has(k)) out.push(merge3(b.get(k), x, t.get(k)))
    else if (!b.has(k)) out.push(x) // main put it in
    else if (!isPicture(x) && !eq(b.get(k), x)) out.push(x) // a figure the run took off and main changed: main's
    // else the run took it off: off
  }
  // What the run put in: after the item it follows in the run's list, or first.
  theirs.forEach((x, i) => {
    const k = keyOf(x)
    if (b.has(k) || o.has(k) || out.some(y => keyOf(y) === k)) return // there already, or main took it off
    let at = 0
    for (let j = i - 1; j >= 0; j--) {
      const before = out.findIndex(y => keyOf(y) === keyOf(theirs[j]))
      if (before >= 0) { at = before + 1; break }
    }
    out.splice(at, 0, x)
  })
  return out.every(x => isPicture(x) && typeof x.t === 'number') ? out.sort((p, q) => p.t - q.t) : out
}

/** An object, key by key. A picture under a key that either side took off is off; any other value that side left as it was. */
function mergeObject(base, ours, theirs) {
  const out = {}
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const inO = k in ours, inT = k in theirs, inB = k in base
    if (inO && inT) out[k] = merge3(inB ? base[k] : undefined, ours[k], theirs[k])
    else if (inO) { if (!inB || (!isPicture(base[k]) && !eq(base[k], ours[k]))) out[k] = ours[k] }
    else if (!inB || (!isPicture(base[k]) && !eq(base[k], theirs[k]))) out[k] = theirs[k]
  }
  return out
}

/** A summary card, whole: the run's only when it took the approved card main still has back to pending. */
export const mergeSummary = (base, ours, theirs) =>
  (base?.review === 'approved' && ours.review === 'approved' && theirs.review !== 'approved' ? theirs : ours)
const isSummary = v => isObj(v) && typeof v.review === 'string' && typeof v.summary === 'string'

/** Every address a picture has anywhere in `v`. Pictures aren't looked into. */
function addresses(v, out = new Set()) {
  if (isPicture(v)) out.add(v.url)
  else if (Array.isArray(v)) v.forEach(x => addresses(x, out))
  else if (isObj(v)) Object.values(v).forEach(x => addresses(x, out))
  return out
}

/** The merged file. `said`: pictures of main's it took off, pictures it put in, and whether it is the run's card. */
export function mergeMainWhole(base, ours, theirs, said = {}) {
  if (!isObj(ours) || !isObj(theirs)) return ours
  if (isSummary(ours) && isSummary(theirs)) {
    const out = mergeSummary(isObj(base) ? base : undefined, ours, theirs)
    said.card = out === theirs && out !== ours
    return out
  }
  const out = merge3(isObj(base) ? base : undefined, ours, theirs)
  const before = addresses(ours), after = addresses(out)
  said.off = [...before].filter(u => !after.has(u)).length
  said.in = [...after].filter(u => !before.has(u)).length
  return out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs, path = ''] = process.argv.slice(2)
  const text = f => { try { return readFileSync(f, 'utf8') } catch { return '' } }
  let parsed
  try {
    parsed = [base, ours, theirs].map(f => { const s = text(f); return s.trim() ? JSON.parse(s) : undefined })
  } catch (e) {
    if (!path.endsWith('.json')) process.exit(0) // the review page: main's whole, as it stands in %A
    console.error(`merge-main-whole: ${path}: ${e.message}`)
    process.exit(1) // JSON that doesn't read: left to git, and the run keeps its work back
  }
  const said = {}
  const out = mergeMainWhole(parsed[0], parsed[1], parsed[2], said)
  if (!eq(out, parsed[1])) writeFileSync(ours, `${JSON.stringify(out, null, 2)}\n`)
  console.error(`merge-main-whole: ${path}: ${said.card ? "the run's card, back to pending"
    : eq(out, parsed[1]) ? "main's file" : `merged${said.off ? `, ${said.off} of main's pictures off` : ''}${said.in ? `, ${said.in} of the run's in` : ''}`}`)
}
