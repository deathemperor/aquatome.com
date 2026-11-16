import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { awaitsScreen, glossaryKinds, isAllowedLicence, thumbOf, vnDate } from '@aq/schema'
import { asStored } from './media'
import { mirrorPlan } from './mirror-photos'
import { openversePage, type OpenverseApi } from './openverse'
import { compactScreen } from './photo-observations'
import { assertPhotoPrivacy } from './photo-privacy'
import { writePhotoState } from './photo-state'
import type { Media } from './source-photos'
import { judgeSheet, ocrOf, type WatermarkDeps, type WatermarkEntry } from './watermarks'
import { authorText } from './wiki-author'

export type GlossaryPhotoDeps = {
  /** Commons' API: the CLI's `http`, on the fetch that rests after a refusal. */
  http: (url: string) => Promise<unknown>
  /** Openverse's API, for an Openverse candidate. */
  openverse?: OpenverseApi
  /** A photo's bytes, downloaded as the engine (its user agent). */
  bytes: (url: string) => Promise<Uint8Array>
  /** Whether our media host already serves an address. */
  exists: (url: string) => Promise<boolean>
  media: Media
  /** Faces per image file (macOS Vision); -1 = unreadable. */
  faces: (files: string[]) => Promise<number[]>
  read: WatermarkDeps['read']
  look: WatermarkDeps['look']
  now: () => Date
}
export type GlossaryPhotoSource = { file: string } | { openverse: string; flickr: string }
/**
 * A candidate photo for one kind of a glossary term. `url`, `thumb`, `width`, `height`: our stored copy; `key`: the
 * Commons file title or `flickr:<id>`; `openverse`: Openverse's record id; `off`: what a screen found on our copy.
 */
export type GlossaryPhotoRecord = {
  url: string; thumb?: string; width: number; height: number; licence: string; author: string; sourceUrl: string; key: string
  openverse?: string; at: string; off?: 'people' | 'mark'
}

/** `"<term>/<kind>"` → its candidates. No page reads it: Curation picks one by hand, in a content change. */
export const GLOSSARY_PHOTOS = 'engine-state/_glossary-photos.json'
const WATERMARKS = 'engine-state/_photo-watermarks.json'
const OPENVERSE_PAGES = 5
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

type Found = { key: string; url: string; licence: string; author: string; sourceUrl: string; openverse?: string }
type Info = { query?: { pages?: Record<string, { title: string; imageinfo?: { width: number; mime: string; thumburl: string; descriptionurl: string; extmetadata?: Record<string, { value: string }> }[] }> } }

const refuse = (why: string) => new Error(`glossary-photo: ${why}`)
/** A JSON map the engine keeps; none yet is an empty one. Any other failure to read it stops the run, so it is never written over. */
const readMap = async <T>(file: string): Promise<Record<string, T>> =>
  JSON.parse(await readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e }))

/** The kinds the term's entry lists (its "Các loại …" list, glossaryKinds), as the term page reads them. */
async function termKinds(root: string, term: string): Promise<string[]> {
  if (!ID.test(term)) throw refuse(`"${term}" is not a glossary term id`)
  const raw = await readFile(join(root, 'content/glossary', term, 'vi.json'), 'utf8').catch((e: NodeJS.ErrnoException) => {
    if (e.code === 'ENOENT') throw refuse(`no glossary term "${term}"`)
    throw e
  })
  return glossaryKinds((JSON.parse(raw) as { body?: string }).body ?? '').map(k => k.id)
}

/** One Commons file, from its own page's file details: an open licence, ≥ 800 px, a JPEG, PNG or WebP; credited as the album step credits it. */
export async function commonsCandidate(file: string, http: GlossaryPhotoDeps['http']): Promise<Found> {
  if (!/^File:./.test(file)) throw refuse(`--file takes a Commons file title, "File:<name>"`)
  const q = new URLSearchParams({ format: 'json', action: 'query', titles: file, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280', iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|Categories' })
  const r = (await http(`https://commons.wikimedia.org/w/api.php?${q.toString().replace(/\+/g, '%20')}`)) as Info
  const p = Object.values(r.query?.pages ?? {})[0]
  const ii = p?.imageinfo?.[0]
  if (!p || !ii) throw refuse(`${file} is not on Commons`)
  const licence = ii.extmetadata?.LicenseShortName?.value ?? ''
  if (!isAllowedLicence(licence)) throw refuse(`${p.title}: its licence (${licence || 'none given'}) is not one the site may use`)
  if (ii.width < 800) throw refuse(`${p.title}: ${ii.width} px wide, under 800`)
  if (!/jpeg|png|webp/.test(ii.mime)) throw refuse(`${p.title}: ${ii.mime}, not a JPEG, PNG or WebP`)
  return {
    key: p.title, url: ii.thumburl.replace(/\?.*$/, ''), // without Commons' utm tracking query
    licence, author: authorText(ii.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: ii.descriptionurl,
  }
}

/** One Flickr photo found through Openverse's search, on its first five pages; openversePage's filter is the licence standard. */
export async function openverseCandidate(query: string, flickr: string, api: OpenverseApi): Promise<Found> {
  if (!/^\d+$/.test(flickr)) throw refuse(`--flickr takes a Flickr photo id (digits), not "${flickr}"`)
  const key = `flickr:${flickr}`
  let page: number | null = 1
  for (let n = 0; n < OPENVERSE_PAGES && page !== null; n++) {
    const p = await openversePage(query, page, api)
    const c = p.cands.find(x => x.key === key)
    if (c) return { key, url: c.url, licence: c.licence, author: c.author, sourceUrl: c.sourceUrl, ...(c.openverse ? { openverse: c.openverse } : {}) }
    page = p.next
    // Openverse's requests left today: the day's last ten are left alone, as the album step leaves them (gallery.ts).
    if (page !== null && p.remaining < 10) throw refuse(`Openverse's requests for today are used up, at page ${n + 1} of "${query}"`)
  }
  throw refuse(`${key} is not among Openverse's open-licence Flickr photos of 800 px or more for "${query}" (first ${OPENVERSE_PAGES} pages)`)
}

/**
 * Our copy of the photo: a ≤1200 px WebP and its 480 px thumb on our media host, as mirror-photos stores them. One our
 * host serves already is left alone, and its copy there is what the screens see; a new one is screened as `put` stores
 * it (asStored), so a just-stored address is never read back.
 */
async function store(found: Found, d: GlossaryPhotoDeps) {
  const plan = mirrorPlan(found.url)
  if (!plan) throw refuse(`${found.url} is not a Commons or Flickr photo address`)
  const ours = d.media.urlFor(plan.key)
  if (await d.exists(ours)) {
    const copy = Buffer.from(await d.bytes(ours))
    const { width, height } = await sharp(copy).metadata()
    if (!width || !height) throw refuse(`${ours}: our copy has no size`)
    const thumb = thumbOf(ours)
    return { url: ours, ...(thumb ? { thumb } : {}), width, height, copy }
  }
  let bytes: Uint8Array | undefined
  let failure: unknown
  for (const u of plan.fetch) {
    try { bytes = await d.bytes(u); break } catch (e) { failure = e }
  }
  if (!bytes) throw failure
  const stored = await d.media.put(plan.key, bytes)
  return { ...stored, copy: await asStored(bytes).toBuffer() }
}

/**
 * The watermark screen on our copy, as the cycle's runs it (watermarks.ts): macOS Vision's text read, then, for text the
 * intake rule picks (or a logo source), the model's look. Our copy is always read: a record already under our address may
 * be the source file's, which the mirror copies there (mirror-photos.ts). Its record goes into the screen's own file under
 * our address, so the cycle's screen doesn't read the photo again; a person's kept-mark record there stays.
 */
async function screenMarks(root: string, url: string, copy: Buffer, file: string, dir: string, d: GlossaryPhotoDeps): Promise<WatermarkEntry> {
  const path = join(root, WATERMARKS)
  const marks = await readMap<unknown>(path)
  const [lines] = await d.read([file])
  if (!lines) throw refuse(`${url}: macOS Vision could not read our copy`)
  let entry: WatermarkEntry = { ocr: ocrOf(lines) }
  if (awaitsScreen(url, entry)) {
    const [verdict] = await judgeSheet([{ b: copy, ocr: entry.ocr }], join(dir, 'sheet.jpg'), d.look)
    if (!verdict) throw refuse(`${url}: the watermark screen gave no verdict`)
    entry = { ...entry, ...verdict }
  }
  const kept = marks[url] ? compactScreen(marks[url]).retainedOwnMark : undefined
  if (kept) entry = { ...entry, retainedOwnMark: kept }
  marks[url] = entry
  // In the file's own order: a new photo's record goes last and every other stays where it is, as main's file is kept
  // (the merge driver keeps main's order; a sorted write turned five records into a 3,800-line change on 16 Nov).
  await writePhotoState(path, marks)
  return entry
}

/** The candidate stored, both screens run on our copy, and its record; nothing written but our copy and the mark screen's record. */
async function screened(root: string, found: Found, d: GlossaryPhotoDeps): Promise<GlossaryPhotoRecord> {
  const dir = await mkdtemp(join(tmpdir(), 'aq-glossary-photo-'))
  try {
    const { copy, ...stored } = await store(found, d)
    const file = join(dir, 'copy.webp')
    await writeFile(file, copy)
    const [faces] = await d.faces([file])
    if (typeof faces !== 'number' || !Number.isInteger(faces) || faces < 0) throw refuse(`${stored.url}: face detection could not read our copy`)
    const mark = await screenMarks(root, stored.url, copy, file, dir, d)
    const off = faces > 0 ? 'people' : mark.watermark === true ? 'mark' : undefined
    return {
      ...stored, licence: found.licence, author: found.author, sourceUrl: found.sourceUrl, key: found.key,
      ...(found.openverse ? { openverse: found.openverse } : {}), at: vnDate(d.now()), ...(off ? { off } : {}),
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * A candidate photo for one kind of a glossary term, for Curation to look at and pick by hand in a later content change:
 * nothing here shows on a page, and content/ is only read. The kind must be one the term's entry lists, checked before any
 * request. The photo (a Commons file, or a Flickr photo Openverse finds) is read with its licence and credit, stored on our
 * media host, and both screens run on our copy: a face makes it "off: people", a mark "off: mark". Each screen must
 * finish: a copy one can't read, or a look with no verdict, stops the run with no record. The record goes into
 * GLOSSARY_PHOTOS, replacing that kind's record of the same photo.
 */
export async function glossaryPhoto(root: string, o: { term: string; kind: string } & GlossaryPhotoSource, d: GlossaryPhotoDeps): Promise<GlossaryPhotoRecord> {
  const kinds = await termKinds(root, o.term)
  if (!kinds.includes(o.kind)) throw refuse(`"${o.kind}" is not one of ${o.term}'s kinds (${kinds.join(', ') || 'its entry lists none'})`)
  let found: Found
  if ('file' in o) found = await commonsCandidate(o.file, d.http)
  else if (d.openverse) found = await openverseCandidate(o.openverse, o.flickr, d.openverse)
  else throw refuse('no Openverse client')

  const record = await screened(root, found, d)
  const path = join(root, GLOSSARY_PHOTOS)
  const all = await readMap<GlossaryPhotoRecord[]>(path)
  const at = `${o.term}/${o.kind}`
  const list = all[at] ?? []
  const i = list.findIndex(r => r.key === record.key)
  if (i >= 0) list[i] = record
  else list.push(record)
  all[at] = list
  const before = await readFile(path, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return undefined; throw e })
  await writeFile(path, `${JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), null, 2)}\n`)
  // A run the privacy guard stops leaves no record that reads as ready: the file goes back as it was.
  await assertPhotoPrivacy(root).catch(async e => { await (before === undefined ? unlink(path) : writeFile(path, before)); throw e })
  return record
}
