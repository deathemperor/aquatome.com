#!/usr/bin/env node
// git merge driver for the files two engine jobs both write that no other driver merges (.gitattributes, merge=main-whole):
// a guide's or a breed's pictures, an album, a playlist, a page's summary card, the photo review page. Only the engine's
// job scripts set it, in the engine's clones, where every merge is a pull that replays the run's commit onto main: %A is
// main's side, %B the run's.
// Until 16 Nov these merged line by line, and the push fallback (`git pull --rebase -X theirs`) took the run's lines where
// both changed and main's elsewhere: a part photo kept its address with another photo's credit, a still main's new frame
// with the run's caption and "no one in it" mark (8, 9, 15 and 16 Nov 2026). So no record is ever built from two versions:
// - the file is main's, every record whole as main has it;
// - a picture the run took off (an address in the base and not in the run's) comes off main's too: a face, a person held
//   for a second look, a mark. Nothing else puts those back off (the sweep re-applies only the never-again list);
// - a picture the run put in that main doesn't have goes in whole, where the run put it: in the same list, a video's
//   figure found by its heading. One whose place main no longer has stays out;
// - the run's edits to a record main has too are dropped (a still it judged gets its verdict again from its address).
// A summary card: main's whole file, unless the run took main's approved card back to pending (its own check found a
// problem); then the run's whole file. An approval never goes onto text it didn't read.
// Anything that isn't JSON (the review page, rewritten whole each run): main's.
// git config merge.main-whole.driver 'node scripts/merge-main-whole.mjs %O %A %B %P'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isRecord = v => isObj(v) && typeof v.url === 'string'

/** Every address a record has anywhere in `v`. Records aren't looked into. */
function addresses(v, out = new Set()) {
  if (isRecord(v)) out.add(v.url)
  else if (Array.isArray(v)) v.forEach(x => addresses(x, out))
  else if (isObj(v)) Object.values(v).forEach(x => addresses(x, out))
  return out
}

/** `v` without the records whose address is in `gone`: out of their lists, or the key that holds one. */
function without(v, gone) {
  if (Array.isArray(v)) return v.filter(x => !(isRecord(x) && gone.has(x.url))).map(x => without(x, gone))
  if (isRecord(v)) return v
  if (isObj(v)) return Object.fromEntries(Object.entries(v).filter(([, x]) => !(isRecord(x) && gone.has(x.url))).map(([k, x]) => [k, without(x, gone)]))
  return v
}

/** Each record of `v` with its place: the keys down to it, a list item that isn't a record found by its `heading`. */
function placed(v, path = [], out = []) {
  if (Array.isArray(v)) {
    for (const x of v) {
      if (isRecord(x)) out.push({ record: x, path, inList: true })
      else if (isObj(x) && typeof x.heading === 'string') placed(x, [...path, { heading: x.heading }], out)
    }
  } else if (isObj(v) && !isRecord(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (isRecord(x)) out.push({ record: x, path: [...path, { key: k }], inList: false })
      else placed(x, [...path, { key: k }], out)
    }
  }
  return out
}

/** The value at `path` in `v`, or undefined. */
function at(v, path) {
  for (const step of path) {
    if ('key' in step) v = isObj(v) ? v[step.key] : undefined
    else v = Array.isArray(v) ? v.find(x => isObj(x) && x.heading === step.heading) : undefined
    if (v === undefined) return undefined
  }
  return v
}

/** The merge of a picture file: main's, less what the run took off, with what the run put in. Counts in `said`. */
export function mergePictures(base, ours, theirs, said = { off: 0, in: 0 }) {
  const before = addresses(base), run = addresses(theirs)
  const gone = new Set([...before].filter(u => !run.has(u)))
  const out = without(structuredClone(ours), gone)
  said.off = [...addresses(ours)].filter(u => gone.has(u)).length
  const has = addresses(out)
  for (const { record, path, inList } of placed(theirs)) {
    if (before.has(record.url) || has.has(record.url)) continue
    if (inList) {
      const list = at(out, path)
      if (!Array.isArray(list)) continue
      list.push(structuredClone(record))
    } else {
      const parent = at(out, path.slice(0, -1)), key = path[path.length - 1].key
      if (!isObj(parent) || key in parent) continue
      parent[key] = structuredClone(record)
    }
    has.add(record.url)
    said.in++
  }
  return out
}

/** A summary card: main's whole, unless the run took main's approved card back to pending. */
export const mergeSummary = (ours, theirs) => (ours.review === 'approved' && theirs.review !== 'approved' ? theirs : ours)

/** The merged file, or `ours` itself when main's whole file stands. */
export function mergeMainWhole(base, ours, theirs, said = { off: 0, in: 0 }) {
  if (!isObj(ours) || !isObj(theirs)) return ours
  if (typeof ours.review === 'string' && typeof theirs.review === 'string' && 'summary' in ours) return mergeSummary(ours, theirs)
  return mergePictures(isObj(base) ? base : {}, ours, theirs, said)
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
  const said = { off: 0, in: 0 }
  const out = mergeMainWhole(parsed[0], parsed[1], parsed[2], said)
  const runs = out === parsed[2] && out !== parsed[1]
  if (runs || said.off || said.in) writeFileSync(ours, `${JSON.stringify(out, null, 2)}\n`)
  console.error(`merge-main-whole: ${path}: ${runs ? "the run's card, back to pending" : `main's file${said.off ? `, less ${said.off} the run took off` : ''}${said.in ? `, with ${said.in} the run put in` : ''}`}`)
}
