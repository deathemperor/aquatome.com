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
// - a picture is whole from one side. Both changed it: the side that keeps it off the page (a still with no verdict of
//   its own, `stillShown`), else the side whose address the other didn't take off, else main's;
// - a list of pictures, or of a video's figures (found by heading, or a renamed one by a picture it shares), merges item
//   by item: one either side put in goes in whole, after the item it follows on that side; stills stay in order of their
//   second;
// - any other list both changed is main's, whole;
// - a picture's address either side took off the whole file is off everywhere in it, whatever the other side did to it,
//   and a figure that leaves with no still and no photo goes, as stripPhotos (watermarks.ts) drops it: a face, a person
//   held for a second look, a mark. Nothing else puts those back off (the sweep re-applies only the never-again list).
// A summary card (content/summaries/) is one text with its review: main's whole file, unless main's card is the
// approved one the run started from, the same text, and the run took it back to pending; then the run's whole file. An
// approval never goes onto text it didn't read.
// Anything that isn't JSON (the review page, rewritten whole each run): main's.
// git config merge.main-whole.driver 'node scripts/merge-main-whole.mjs %O %A %B %P'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isPicture = v => isObj(v) && typeof v.url === 'string'
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const DATE = /^\d{4}-\d{2}-\d{2}/
/** A still the page doesn't show: none of its own verdict yet, or a person in it. */
const offPage = p => typeof p.t === 'number' && p.person !== false
/** What finds an item of a list on the other sides: a picture by its address, a figure by its heading. */
const keyOf = x => (isPicture(x) ? `url:${x.url}` : isObj(x) && typeof x.heading === 'string' ? `heading:${x.heading}` : undefined)
const keyed = (...lists) => lists.every(l => l.every(x => keyOf(x) !== undefined))
/** Each item's key in its list, with its count among items of the same key (a guide can repeat a heading). */
const keysOf = list => { const n = new Map(); return list.map(x => { const k = keyOf(x), i = n.get(k) ?? 0; n.set(k, i + 1); return `${k}#${i}` }) }

/** Three-way merge of a value: `base` undefined when both sides added it. `gone`: addresses either side took off the file. */
export function merge3(base, ours, theirs, gone = new Set()) {
  if (eq(ours, theirs)) return ours
  if (base !== undefined && eq(base, theirs)) return ours
  if (base !== undefined && eq(base, ours)) return theirs
  if (isPicture(ours) && isPicture(theirs)) {
    if (offPage(ours) !== offPage(theirs)) return offPage(ours) ? ours : theirs
    if (gone.has(ours.url) !== gone.has(theirs.url)) return gone.has(ours.url) ? theirs : ours // a hero the run replaced
  }
  if (isPicture(ours) || isPicture(theirs)) return ours
  if (Array.isArray(ours) && Array.isArray(theirs)) {
    const b = Array.isArray(base) ? base : []
    return keyed(b, ours, theirs) ? mergeList(b, ours, theirs, gone) : ours
  }
  if (isObj(ours) && isObj(theirs)) return mergeObject(isObj(base) ? base : {}, ours, theirs, gone)
  if (typeof ours === 'string' && typeof theirs === 'string' && DATE.test(ours) && DATE.test(theirs)) return ours > theirs ? ours : theirs
  return ours
}

/** A list of pictures or figures, item by item. */
function mergeList(base, ours, theirs, gone) {
  const kb = keysOf(base), inBase = new Set(kb)
  // A figure under a heading new on one side is the base figure it shares a picture with, if that side has no figure
  // under the base one's heading: the heading was renamed.
  const renamed = (list, ks) => {
    const free = kb.map((k, j) => j).filter(j => !isPicture(base[j]) && !ks.includes(kb[j]))
    return ks.map((k, i) => {
      if (inBase.has(k) || isPicture(list[i])) return k
      const has = addresses(list[i])
      const j = free.find(j => [...addresses(base[j])].some(u => has.has(u)))
      if (j === undefined) return k
      free.splice(free.indexOf(j), 1)
      return kb[j]
    })
  }
  const [ko, kt] = [renamed(ours, keysOf(ours)), renamed(theirs, keysOf(theirs))]
  const b = new Map(base.map((x, i) => [kb[i], x])), t = new Map(theirs.map((x, i) => [kt[i], x])), o = new Set(ko)
  const out = [], at = []
  ours.forEach((x, i) => {
    const k = ko[i]
    if (t.has(k)) out.push(merge3(b.get(k), x, t.get(k), gone))
    else if (!b.has(k)) out.push(x) // main put it in
    else if (!isPicture(x) && !eq(b.get(k), x)) out.push(x) // a figure the run took off and main changed: main's
    else return // the run took it off: off
    at.push(k)
  })
  // What the run put in: after the item it follows in the run's list, or first.
  theirs.forEach((x, i) => {
    const k = kt[i]
    if (b.has(k) || o.has(k)) return // there already, or main took it off
    let pos = 0
    for (let j = i - 1; j >= 0; j--) {
      const before = at.indexOf(kt[j])
      if (before >= 0) { pos = before + 1; break }
    }
    out.splice(pos, 0, x)
    at.splice(pos, 0, k)
  })
  return out.every(x => isPicture(x) && typeof x.t === 'number') ? out.sort((p, q) => p.t - q.t) : out
}

/** An object, key by key. A picture under a key that either side took off is off; any other value that side left as it was. */
function mergeObject(base, ours, theirs, gone) {
  const out = {}
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const inO = k in ours, inT = k in theirs, inB = k in base
    if (inO && inT) out[k] = merge3(inB ? base[k] : undefined, ours[k], theirs[k], gone)
    else if (inO) { if (!inB || (!isPicture(base[k]) && !eq(base[k], ours[k]))) out[k] = ours[k] }
    else if (!inB || (!isPicture(base[k]) && !eq(base[k], theirs[k]))) out[k] = theirs[k]
  }
  return out
}

/** A summary card, whole: the run's only when it took the approved card main still has, the same text, back to pending. */
export const mergeSummary = (base, ours, theirs) =>
  (base?.review === 'approved' && ours.review === 'approved' && ours.summary === base.summary && theirs.review !== 'approved' ? theirs : ours)

/** Every address a picture has anywhere in `v`. Pictures aren't looked into. */
function addresses(v, out = new Set()) {
  if (isPicture(v)) out.add(v.url)
  else if (Array.isArray(v)) v.forEach(x => addresses(x, out))
  else if (isObj(v)) Object.values(v).forEach(x => addresses(x, out))
  return out
}

/** `v` without the pictures at `gone`; a figure that loses its last still and photo to that goes too (stripPhotos). */
function strip(v, gone) {
  if (Array.isArray(v)) return v.filter(x => !(isPicture(x) && gone.has(x.url))).map(x => strip(x, gone))
  if (!isObj(v) || isPicture(v)) return v
  const out = {}
  for (const [k, x] of Object.entries(v)) {
    if (isPicture(x) && gone.has(x.url)) continue
    out[k] = k === 'figures' && Array.isArray(x)
      ? x.map(f => [f, strip(f, gone)]).filter(([f, s]) => !(isObj(s) && addresses(s).size < addresses(f).size && !s.moments?.length && !s.photo)).map(([, s]) => s)
      : strip(x, gone)
  }
  return out
}

/** The merged file at `path`. `said`: pictures of main's it took off, pictures it put in, and whether it is the run's card. */
export function mergeMainWhole(base, ours, theirs, said = {}, path = '') {
  if (!isObj(ours) || !isObj(theirs)) return ours
  if (path.startsWith('content/summaries/')) {
    const out = mergeSummary(isObj(base) ? base : undefined, ours, theirs)
    said.card = out === theirs && out !== ours
    return out
  }
  const before = addresses(ours), run = addresses(theirs)
  const gone = new Set([...addresses(base)].filter(u => !before.has(u) || !run.has(u)))
  const out = strip(merge3(isObj(base) ? base : undefined, ours, theirs, gone), gone)
  const after = addresses(out)
  said.off = [...before].filter(u => !after.has(u)).length
  said.in = [...after].filter(u => !before.has(u)).length
  return out
}

// Run as a script, also through a symlinked folder (a quiet exit here would leave main's whole file, with no line said).
const real = f => { try { return realpathSync(f) } catch { return f } }
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
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
  const out = mergeMainWhole(parsed[0], parsed[1], parsed[2], said, path)
  if (!eq(out, parsed[1])) writeFileSync(ours, `${JSON.stringify(out, null, 2)}\n`)
  console.error(`merge-main-whole: ${path}: ${said.card ? "the run's card, back to pending"
    : eq(out, parsed[1]) ? "main's file" : `merged${said.off ? `, ${said.off} of main's pictures off` : ''}${said.in ? `, ${said.in} of the run's in` : ''}`}`)
}
