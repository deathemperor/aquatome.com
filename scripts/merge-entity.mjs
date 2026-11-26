#!/usr/bin/env node
// git merge driver for the page files two engine jobs can both write (content/species/*/*.json, content/plants/*/*.json).
// The jobs run in parallel from the same commit. When one makes a page from Glaser while the other makes it from
// Seriously Fish, both add the file, and the push fallback (`git pull --rebase -X theirs`) kept one job's whole file:
// 32 species lost Seriously Fish's figures, places and sections that way. This merges by meaning instead:
// - lists of records are matched by what identifies them: a figure or section by its source, a photo by its address,
//   a video by its id, a shop slot by its category; lists of names (places, other names) add up
// - any other value: the side that changed it; if both did, the later date, else this job's (theirs, as before)
// - a name a person or the place-names step fixed (`nameFixed`), on either side: kept. A job that started before the fix
//   wrote the source's name over it otherwise ("Lam" over "sông Lam", 2026-11-07, which stopped the job's publish)
// .gitattributes: content/species/*/*.json merge=entity (and plants and places)
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

function mergeLists(base, ours, theirs, field) {
  const lists = [base, ours, theirs]
  const repeated = new Set()
  if (field === 'photos') for (const list of lists) {
    const seen = new Set()
    for (const it of list) {
      const id = idOf(it)
      if (seen.has(id)) repeated.add(id)
      seen.add(id)
    }
  }
  const key = it => {
    const id = idOf(it)
    return repeated.has(id) ? JSON.stringify([id, it?.altered ?? null]) : id
  }
  const pairs = list => {
    const counts = new Map()
    return list.map(it => {
      const k = key(it)
      if (!repeated.has(idOf(it))) return [k, it]
      const occurrence = counts.get(k) ?? 0
      counts.set(k, occurrence + 1)
      return [JSON.stringify([k, occurrence]), it]
    })
  }
  const [before, main, local] = lists.map(pairs)
  const [b, o, t] = [new Map(before), new Map(main), new Map(local)]
  const untouched = (id, it) => b.has(id) && eq(b.get(id), it) // left as it was by one side, so the other's removal stands
  const out = []
  for (const [id, it] of main) {
    if (t.has(id)) out.push([id, merge3(b.get(id), it, t.get(id))])
    else if (!untouched(id, it)) out.push([id, it])
  }
  for (const [id, it] of local) {
    if (!o.has(id) && !untouched(id, it)) out.push([id, it])
  }
  if (field === 'photos') {
    const at = id => out.findIndex(([k]) => k === id)
    const order = local.map(([id]) => id).filter(id => at(id) >= 0)
    let previous
    for (const [i, id] of order.entries()) {
      if (!b.has(id)) {
        const position = at(id)
        const after = previous === undefined ? -1 : at(previous)
        const later = order.slice(i + 1)
        const next = later.find(id => b.has(id)) ?? (after < 0 ? later.find(id => o.has(id)) : undefined)
        const before = next === undefined ? out.length : at(next)
        if (position >= before || position <= after || !o.has(id) && next !== undefined) {
          const [photo] = out.splice(position, 1)
          const insert = next !== undefined
            ? at(next)
            : at(previous) + 1
          out.splice(insert, 0, photo)
        }
      }
      previous = id
    }
  }
  return out.map(([, item]) => item)
}

/** Three-way merge of two versions of a JSON value against their common base (undefined: both sides added it). */
export function merge3(base, ours, theirs, field) {
  if (eq(ours, theirs)) return ours
  if (base !== undefined && eq(base, ours)) return theirs
  if (base !== undefined && eq(base, theirs)) return ours
  if (Array.isArray(ours) && Array.isArray(theirs)) return mergeLists(Array.isArray(base) ? base : [], ours, theirs, field)
  if (isObj(ours) && isObj(theirs)) {
    const b = isObj(base) ? base : {}
    const out = {}
    for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
      if (k in ours && k in theirs) out[k] = merge3(b[k], ours[k], theirs[k], k)
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

/** A file's merge: merge3, and a name one side fixed (`nameFixed`) stays that side's, as the engine leaves such a name. */
export function mergeFile(base, ours, theirs) {
  const out = merge3(base, ours, theirs)
  const fixed = [ours, theirs].filter(v => isObj(v) && v.nameFixed === true)
  return fixed.length === 1 && isObj(out) ? { ...out, name: fixed[0].name, nameFixed: true } : out
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [base, ours, theirs] = process.argv.slice(2)
  const read = f => { const s = (() => { try { return readFileSync(f, 'utf8') } catch { return '' } })(); return s.trim() ? JSON.parse(s) : undefined }
  try {
    writeFileSync(ours, `${JSON.stringify(mergeFile(read(base), read(ours), read(theirs)), null, 2)}\n`)
  } catch (e) {
    console.error(`merge-entity: ${e.message}`)
    process.exit(1) // not JSON: leave the conflict to git
  }
}
