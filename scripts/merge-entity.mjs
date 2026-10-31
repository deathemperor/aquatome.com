#!/usr/bin/env node
// git merge driver for the page files two engine jobs can both write (content/species/*/*.json, content/plants/*/*.json).
// The jobs run in parallel from the same commit. When one makes a page from Glaser while the other makes it from
// Seriously Fish, both add the file, and the push fallback (`git pull --rebase -X theirs`) kept one job's whole file:
// 32 species lost Seriously Fish's figures, places and sections that way. This merges by meaning instead:
// - lists of records are matched by what identifies them: a figure or section by its source, a photo by its address,
//   a video by its id, a shop slot by its category; lists of names (places, other names) add up
// - any other value: the side that changed it; if both did, the later date, else this job's (theirs, as before)
// .gitattributes: content/species/*/*.json merge=entity (and plants)
// git config merge.entity.driver 'node scripts/merge-entity.mjs %O %A %B'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y)
const isObj = v => typeof v === 'object' && v !== null && !Array.isArray(v)
const DATE = /^\d{4}-\d{2}-\d{2}/

/** What identifies an item of a list: a section (key + source), a figure (source), a photo, a video, a shop slot, a name. */
function idOf(it) {
  if (!isObj(it)) return JSON.stringify(it)
  if (it.key !== undefined && it.source !== undefined) return `section:${it.key}:${it.source}`
  if (it.source !== undefined && 'value' in it) return `figure:${it.source}`
  for (const k of ['url', 'youtubeId', 'category']) if (it[k] !== undefined) return `${k}:${it[k]}`
  return JSON.stringify(it)
}

function mergeLists(base, ours, theirs) {
  const index = list => new Map(list.map(it => [idOf(it), it]))
  const [b, o, t] = [index(base), index(ours), index(theirs)]
  const untouched = (id, it) => b.has(id) && eq(b.get(id), it) // left as it was by one side, so the other's removal stands
  const out = []
  for (const it of ours) {
    const id = idOf(it)
    if (t.has(id)) out.push(merge3(b.get(id), it, t.get(id)))
    else if (!untouched(id, it)) out.push(it)
  }
  for (const it of theirs) {
    const id = idOf(it)
    if (!o.has(id) && !untouched(id, it)) out.push(it)
  }
  return out
}

/** Three-way merge of two versions of a JSON value against their common base (undefined: both sides added it). */
export function merge3(base, ours, theirs) {
  if (eq(ours, theirs)) return ours
  if (base !== undefined && eq(base, ours)) return theirs
  if (base !== undefined && eq(base, theirs)) return ours
  if (Array.isArray(ours) && Array.isArray(theirs)) return mergeLists(Array.isArray(base) ? base : [], ours, theirs)
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {}
    const out = {}
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      if (k in ours && k in theirs) out[k] = merge3(b[k], ours[k], theirs[k])
      else {
        const v = k in ours ? ours[k] : theirs[k]
        if (!(k in b && eq(b[k], v))) out[k] = v // else the other side removed it
      }
    }
    return out
  }
  if (typeof ours === 'string' && typeof theirs === 'string' && DATE.test(ours) && DATE.test(theirs)) return ours > theirs ? ours : theirs
  return theirs
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { const s = (() => { try { return readFileSync(f, 'utf8') } catch { return '' } })(); return s.trim() ? JSON.parse(s) : undefined }
  try {
    writeFileSync(ours, `${JSON.stringify(merge3(read(base), read(ours), read(theirs)), null, 2)}\n`)
  } catch (e) {
    console.error(`merge-entity: ${e.message}`)
    process.exit(1) // not JSON: leave the conflict to git
  }
}
