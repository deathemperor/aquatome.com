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
//   A photo the mirror copied to our media on one side (mirror-photos.ts) is the same photo at its new address;
// - a breed's sources and its care figures, which point into them by place, are one value: both changed, main's.
// Lines both sides changed, which until now clashed and were checked again in full, are noted for swept_clean
// (cycle-checks.sh), which has them checked again in full the same way.
// A summary card (content/summaries/) is one text with its review: main's whole file, unless main's card is the
// approved one the run started from, the same text, and the run took it back to pending; then the run's whole file. An
// approval never goes onto text it didn't read.
// Anything that isn't JSON (the review page, rewritten whole each run): main's.
// git config merge.main-whole.driver 'node scripts/merge-main-whole.mjs %O %A %B %P'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isPicture = v => isObj(v) && typeof v.url === 'string'
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const DATE = /^\d{4}-\d{2}-\d{2}/
const sha16 = s => createHash('sha256').update(s).digest('hex').slice(0, 16)
/** The address the photo mirror gives a copy of `url` on our media (mirrorPlan, packages/engine/src/mirror-photos.ts). */
export function mirrored(url) {
  let u
  try { u = new URL(url) } catch { return undefined }
  const at = key => `https://media.aquatome.com/${key}`
  let m
  if (u.host === 'upload.wikimedia.org' || u.host === 'thumb.wikimedia.org')
    return (m = u.pathname.match(/^\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/)) ? at(`commons/${sha16(decodeURIComponent(m[1]))}.webp`) : undefined
  if (u.host === 'inaturalist-open-data.s3.amazonaws.com' || u.host === 'static.inaturalist.org')
    return (m = u.pathname.match(/^\/photos\/(\d+)\/(square|small|medium|large|original)\.\w*$/)) ? at(`inaturalist/${m[1]}.webp`) : undefined
  if (/^(live|farm\d+)\.staticflickr\.com$/.test(u.host))
    return (m = u.pathname.match(/^\/\d+\/(\d+)_[0-9a-f]+(?:_[a-z0-9])?\.jpg$/)) ? at(`flickr/${m[1]}.webp`) : undefined
  if (u.host === 'api.gbif.org')
    return (m = u.pathname.match(/^\/v1\/image\/cache\/(?:fit-in\/)?[\dx]+\/occurrence\/(\d+)\/media\/([0-9a-f]{32})$/)) ? at(`gbif/${m[1]}-${m[2].slice(0, 16)}.webp`) : undefined
  return undefined
}
/** A still the page doesn't show: none of its own verdict yet, or a person in it. */
const offPage = p => typeof p.t === 'number' && p.person !== false
/** What finds an item of a list on the other sides: a picture by its address, a figure by its heading. */
const keyOf = x => (isPicture(x) ? `url:${x.url}` : isObj(x) && typeof x.heading === 'string' ? `heading:${x.heading}` : undefined)
const keyed = (...lists) => lists.every(l => l.every(x => keyOf(x) !== undefined))
/** Each item's key in its list, with its count among items of the same key (a guide can repeat a heading). */
const pictureVariant = p => JSON.stringify([p.altered ?? null, p.original?.url ?? null, p.ownerCrop !== undefined])
function keysOf(list, variants, repeatedAdditions) {
  const seen = new Map()
  return list.map(x => {
    const id = keyOf(x)
    const key = repeatedAdditions.has(id) ? JSON.stringify([id, x])
      : variants.has(id) && isPicture(x) ? JSON.stringify([id, pictureVariant(x)]) : id
    const occurrence = seen.get(key) ?? 0
    seen.set(key, occurrence + 1)
    return `${key}#${occurrence}`
  })
}

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
  const variants = new Set()
  const before = new Set(base.map(keyOf))
  const repeatedAdditions = new Set()
  for (const list of [base, ours, theirs]) {
    const seen = new Map()
    for (const p of list.filter(isPicture)) {
      const id = keyOf(p), variant = pictureVariant(p)
      if (seen.has(id)) {
        if (seen.get(id) !== variant) variants.add(id)
        else if (!before.has(id)) repeatedAdditions.add(id)
      }
      seen.set(id, variant)
    }
  }
  const local = new Map(theirs.filter(isPicture).map(p => [keyOf(p), p]))
  for (const p of ours.filter(isPicture)) {
    const id = keyOf(p), other = local.get(id)
    if (!before.has(id) && other && pictureVariant(p) !== pictureVariant(other)) variants.add(id)
  }
  const kb = keysOf(base, variants, repeatedAdditions), inBase = new Set(kb)
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
  const [ko, kt] = [renamed(ours, keysOf(ours, variants, repeatedAdditions)), renamed(theirs, keysOf(theirs, variants, repeatedAdditions))]
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
  // What the run put in: after the item it follows in the run's list (or first), and after what main put in there, so a
  // place main's records point to (a breed's care figure to its source) stays where it was.
  const mains = new Set(ko.filter(k => !inBase.has(k) && !t.has(k)))
  theirs.forEach((x, i) => {
    const k = kt[i]
    if (b.has(k) || (o.has(k) && !isPicture(x))) return
    // Both sides put this picture back. Use the run's position and keep the picture already merged.
    const existing = at.indexOf(k)
    const picture = existing < 0 ? x : out.splice(existing, 1)[0]
    if (existing >= 0) at.splice(existing, 1)
    let pos = 0
    for (let j = i - 1; j >= 0; j--) {
      const before = at.indexOf(kt[j])
      if (before >= 0) { pos = before + 1; break }
    }
    while (pos < at.length && mains.has(at[pos])) pos++
    out.splice(pos, 0, picture)
    at.splice(pos, 0, k)
  })
  return out.every(x => isPicture(x) && typeof x.t === 'number') ? out.sort((p, q) => p.t - q.t) : out
}

/** An object, key by key. A key one side took off is off, unless the other side put a new value there: another picture
 * (a swapped photo), or any other value changed. */
function mergeObject(base, ours, theirs, gone) {
  const out = {}
  const kept = (b, x) => (isPicture(b) ? isPicture(x) && x.url !== b.url : !eq(b, x))
  for (const k of new Set([...Object.keys(ours), ...Object.keys(theirs)])) {
    const inO = k in ours, inT = k in theirs, inB = k in base
    if (inO && inT) out[k] = merge3(inB ? base[k] : undefined, ours[k], theirs[k], gone)
    else if (inO) { if (!inB || kept(base[k], ours[k])) out[k] = ours[k] }
    else if (!inB || kept(base[k], theirs[k])) out[k] = theirs[k]
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
  if (path.startsWith('content/breeds/')) {
    const unit = v => ({ sources: v?.sources, care: v?.care })
    if (!eq(unit(base), unit(ours)) && !eq(unit(base), unit(theirs)) && !eq(unit(ours), unit(theirs))) {
      theirs = { ...theirs }
      for (const k of ['sources', 'care']) if (k in ours) theirs[k] = ours[k]; else delete theirs[k]
    }
  }
  const before = addresses(ours), run = addresses(theirs)
  const kept = (on, u) => on.has(u) || on.has(mirrored(u))
  const gone = new Set([...addresses(base)].filter(u => !kept(before, u) || !kept(run, u)).flatMap(u => [u, mirrored(u)]).filter(Boolean))
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
  // Lines both changed: noted with the commit the pull replays onto (rebase-merge/onto), for swept_clean. Not in a
  // repository (a test calling the script on its own), nothing to note in.
  const gitPath = p => spawnSync('git', ['rev-parse', '--git-path', p], { encoding: 'utf8' }).stdout?.trim() ?? ''
  const notes = gitPath('main-whole-clashes')
  if (notes && spawnSync('git', ['merge-file', '-p', '-q', ours, base, theirs], { stdio: 'ignore' }).status !== 0) {
    const onto = ['rebase-merge/onto', 'rebase-apply/onto'].map(p => text(gitPath(p)).trim()).find(Boolean) || 'unknown'
    const kept = text(notes).split('\n').filter(l => l.startsWith(`${onto} `))
    writeFileSync(notes, [...kept, `${onto} ${path}`, ''].join('\n'))
  }
  const said = {}
  const out = mergeMainWhole(parsed[0], parsed[1], parsed[2], said, path)
  if (!eq(out, parsed[1])) writeFileSync(ours, `${JSON.stringify(out, null, 2)}\n`)
  console.error(`merge-main-whole: ${path}: ${said.card ? "the run's card, back to pending"
    : eq(out, parsed[1]) ? "main's file" : `merged${said.off ? `, ${said.off} of main's pictures off` : ''}${said.in ? `, ${said.in} of the run's in` : ''}`}`)
}
