import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { CREDIT_HOLD_FILE, CREDIT_HOLD_REJECTION, creditHoldAddresses, creditHoldPhotoUrls, deadScreenPhotoUrls, isVersionRejection, PHOTO_SCREEN_FILE, photoAddressSet, photoPlacements, photoRejections, type Photo, type PhotoScreenEntry, type SourceId } from '@aq/schema'
import { holdForSecondLook, listAgreed, looks, readSecondLook } from './last-photo'
import type { PageImage } from './outline'
import { creditKind } from './photo-credit'
import { recordPhotoRefusals, writePhotoState } from './photo-state'
import { writeImageCache } from './image-cache-write'
import { holdablePhotoVerdicts } from './photo-visibility'
import { dedupeKey, photoKey, refusedCredit, type CreditTerms, type Media } from './source-photos'
import { stripPhotos } from './watermarks'

/**
 * Credit reads (the chief of staff, 14 Nov 2026): source pages whose pictures on our pages no stored copy ties to a credit
 * (The Spruce Pets' 27 pages, 96 photos). A re-read of a page whose text hasn't changed stops before it picks photos, and
 * the stored copy keeps the text, not the line under each picture, so the page's own turn would teach us nothing.
 *
 * A page on `CREDIT_READS` is read only when the cycle reads it anyway: on its own turn, in its place, at its source's pace.
 * Nothing here makes a page due, orders the queue or asks for anything; the run's read of the page is the only request.
 * From that read's pictures, each photo of ours from it gets its credit's kind in `PHOTO_CREDITS`, with a hash of the
 * line and no name. Photos credited to a picture agency or another party come off (`applyCreditReads`), and a page's
 * only photo is held for a person's second look (last-photo.ts) instead.
 */
export const CREDIT_READS = 'engine-state/_credit-reads.json'
export const PHOTO_CREDITS = 'engine-state/_photo-credits.json'
export const CREDIT_HOLDS = `engine-state/${CREDIT_HOLD_FILE}`
export type CreditRead = { source: SourceId; at: string; by: string }
export type CreditReadKind = 'own' | 'agency' | 'other' | 'none'
export type PhotoCredit = { page: string; kind: CreditReadKind; line?: string; at: string }
/**
 * Where a held photo was: its file, the way to the `photos` list it sat in (a list's items by what names them, a section's
 * key and source, not by their place), its place there, the photo just before it and the first one after it that wasn't
 * held with it, and the photo as it was.
 */
export type HeldPlace = { file: string; path: string[]; at: number; prev?: string; next?: string; photo: Photo }
/** A calendar day whose guide card showed a held photo. */
export type CalendarPlace = { file: string; date: string; guide?: string }
/** A photo a person took off readers' pages until its source page's credit read: who, when, why, and where it was. */
export type CreditHold = { page: string; by: string; on: string; why: string; places: HeldPlace[]; calendar?: CalendarPlace[]; released?: true; originals?: string[] }

const REJECTED = 'engine-state/_photo-rejected.json'
/** The never-again note a credit hold puts there, the same for every held photo: how a release knows its own. */
export const HOLD_NOTE = CREDIT_HOLD_REJECTION
const mayReplaceWithCreditRefusal = (reason: string | undefined) =>
  !reason || reason === HOLD_NOTE || reason.startsWith('watermark:') || isVersionRejection(reason)
const readMap = async <T>(file: string): Promise<Record<string, T>> => JSON.parse(await readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e })) as Record<string, T>
const writeMap = (file: string, v: Record<string, unknown>) => writeImageCache(file, `${JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
export const readCreditReads = (root: string) => readMap<CreditRead>(join(root, CREDIT_READS))
export const writeCreditReads = (root: string, v: Record<string, CreditRead>) => writeMap(join(root, CREDIT_READS), v)

const alnum = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const LABEL = /^\s*(?:credit|photo(?:graph)?|image|illustration)s?\s*(?:by)?\s*:\s*/i

/**
 * Whose a picture is, by the line its source prints under it: the site's own photographer or illustrator (credited under
 * the site's name, "<site> / <name>", or the site alone), a picture agency (one the source's permission record names), another
 * party, or none (no line).
 */
export function creditReadKind(credit: string | undefined, sourceName: string, terms: CreditTerms = {}): CreditReadKind {
  const line = (credit ?? '').replace(LABEL, '').trim()
  if (!line) return 'none'
  if (refusedCredit(line, terms.refusedCredits) || creditKind(line, terms.refusedCredits) === 'agency') return 'agency'
  const first = alnum(line.split('/')[0]!), site = alnum(sourceName)
  return first.length >= 6 && site.startsWith(first) ? 'own' : 'other'
}

const RANK: Record<CreditReadKind, number> = { none: 0, own: 1, other: 2, agency: 3 }
const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`

/**
 * Each photo of ours a read page shows, by the address we store it under (`photoKey`), with its credit's kind. A
 * picture's copies (sizes, a srcset) are one picture, and a credit is the picture's, whichever copy carries it, as the
 * picker reads them; where its copies carry different lines, the one furthest from the site's own counts.
 */
export function pageCredits(images: PageImage[], page: string, source: SourceId, sourceName: string, terms: CreditTerms, media: Pick<Media, 'urlFor'>, at: string): Record<string, PhotoCredit> {
  const pictures = new Map<string, { srcs: string[]; credits: string[] }>()
  for (const img of images) {
    let src: string
    try { src = new URL(img.src, page).href } catch { continue }
    const key = dedupeKey(src), p = pictures.get(key) ?? { srcs: [], credits: [] }
    pictures.set(key, p)
    p.srcs.push(src)
    for (const rendition of img.renditions ?? []) {
      try { p.srcs.push(new URL(rendition, page).href) } catch { continue }
    }
    const credit = img.credit ?? img.author
    if (credit) p.credits.push(credit)
  }
  const out: Record<string, PhotoCredit> = {}
  for (const p of pictures.values()) {
    const lines = p.credits.map(c => ({ c: c.trim(), k: creditReadKind(c, sourceName, terms) })).sort((a, b) => RANK[b.k] - RANK[a.k])
    const top = lines[0]
    const record: PhotoCredit = { page, kind: top?.k ?? 'none', ...(top && top.k !== 'none' ? { line: sha(top.c) } : {}), at }
    for (const src of p.srcs) {
      const address = media.urlFor(photoKey(source, src))
      const prior = out[address]
      if (!prior || RANK[record.kind] >= RANK[prior.kind]) out[address] = record
    }
  }
  return out
}

/** Adds a read page's records to `PHOTO_CREDITS`; a later read of a photo replaces its earlier one. */
export async function recordCredits(root: string, credits: Record<string, PhotoCredit>) {
  if (!Object.keys(credits).length) return
  const file = join(root, PHOTO_CREDITS)
  await writeMap(file, { ...await readMap<PhotoCredit>(file), ...credits })
}

/**
 * Takes the photos `PHOTO_CREDITS` credits to a picture agency or another party off every page and album, onto the
 * never-again list (the line kept as a hash). One whose going would leave a species, plant or breed page with nothing stays
 * where it is, held for a second look, and one the second look cleared stays.
 */
export async function applyCreditReads(root: string, step = 'the credit read'): Promise<{ removed: string[]; held: string[] }> {
  const credits = await readMap<PhotoCredit>(join(root, PHOTO_CREDITS))
  const rejectedFile = join(root, 'engine-state/_photo-rejected.json')
  const rejected = await readMap<string>(rejectedFile)
  const sl = looks(await readSecondLook(root))
  const content = join(root, 'content')
  const refusals = new Map(Object.entries(credits).flatMap(([url, credit]) =>
    credit.kind === 'agency' || credit.kind === 'other' ? [[url, `rejected: ${credit.kind} credit ${credit.line ?? ''}`] as const] : []))
  if (!refusals.size) return { removed: [], held: [] }
  // A selection of different pixels cannot change the publisher's credit. Include an approved crop of the refused original.
  for await (const photo of photoPlacements(content)) {
    const reason = photo.original?.url && refusals.get(photo.original.url)
    if (reason && !refusals.has(photo.url)) refusals.set(photo.url, reason)
  }
  for (const url of refusals.keys()) if (!sl.open(url)) refusals.delete(url)
  const held = await holdablePhotoVerdicts(root, rejected, new Set(refusals.keys()), () => true)
  await holdForSecondLook(root, new Map([...held].map(([url, pages]) => [url, { why: refusals.get(url)!, pages }])), step)
  const heldAddress = photoAddressSet(held.keys())
  const gone = (url: string) => refusals.has(url) && !heldAddress(url)
  const next = new Map([...refusals].filter(([url]) => gone(url)))
  for (const [url, reason] of next) if (mayReplaceWithCreditRefusal(rejected[url])) rejected[url] = reason
  await recordPhotoRefusals(rejectedFile, rejected, next)
  await writePhotoState(rejectedFile, rejected)
  const removed: string[] = []
  for (const f of (await readdir(content, { recursive: true })).filter(f => f.endsWith('.json')).map(f => join(content, f))) {
    const raw = await readFile(f, 'utf8')
    if (![...next.keys()].some(url => raw.includes(url))) continue
    const data = JSON.parse(raw) as unknown, here: string[] = []
    stripPhotos(data, gone, here, [])
    if (!here.length) continue
    removed.push(...here.map(u => `${relative(root, f)}: ${u}`))
    await writeFile(f, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  return { removed, held: [...held.keys()] }
}

const contentFiles = async (content: string) => (await readdir(content, { recursive: true })).filter(f => f.endsWith('.json')).map(f => join(content, f))
const writeJson = (f: string, raw: string, data: unknown) => writeFile(f, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
type Node = Record<string, unknown>
const isNode = (x: unknown): x is Node => !!x && typeof x === 'object' && !Array.isArray(x)

const named = (list: unknown[], name: Record<string, string>) => list.filter(v => isNode(v) && Object.entries(name).every(([f, s]) => v[f] === s))
/**
 * An item of a list by what names it (its id, or its key and source), so a list put in another order still finds it; else
 * its place. A name another item of the list shares is recorded as one never to be matched (`?`): which of them it was
 * can't be known later, even once the other has gone, so a photo held from it stays held.
 */
const step = (list: unknown[], v: unknown, i: number) => {
  const name = isNode(v) ? Object.fromEntries((['id', 'key', 'source'] as const).filter(k => typeof v[k] === 'string').map(k => [k, v[k] as string])) : {}
  if (!Object.keys(name).length) return String(i)
  return `${named(list, name).length === 1 ? '@' : '?'}${JSON.stringify(name)}`
}
/** Takes the wanted photos out of every `photos` list in a content file, at any depth, noting where each was. */
function takeOut(x: unknown, want: Set<string>, file: string, path: string[], out: HeldPlace[]) {
  if (Array.isArray(x)) { x.forEach((v, i) => takeOut(v, want, file, [...path, step(x, v, i)], out)); return }
  if (!isNode(x)) return
  if (Array.isArray(x.photos)) {
    const list = x.photos as Photo[], held = (p: unknown) => isNode(p) && want.has((p as Photo).url)
    list.forEach((p, at) => {
      if (!held(p)) return
      const prev = list[at - 1]?.url, next = list.slice(at + 1).find(q => !held(q))?.url
      out.push({ file, path: [...path, 'photos'], at, ...(prev ? { prev } : {}), ...(next ? { next } : {}), photo: p })
    })
    x.photos = list.filter(p => !held(p))
  }
  for (const [k, v] of Object.entries(x)) if (k !== 'photos') takeOut(v, want, file, [...path, k], out)
}
/** Whether a wanted photo is still shown somewhere a hold couldn't put it back (a figure, a video still, a hero). */
function leftOver(x: unknown, want: Set<string>): boolean {
  if (Array.isArray(x)) return x.some(v => leftOver(v, want))
  if (!isNode(x)) return false
  if (typeof x.url === 'string' && want.has(x.url)) return true
  return Object.values(x).some(v => leftOver(v, want))
}
const at = (data: unknown, path: string[]) => path.reduce<unknown>((n, k) => {
  if (Array.isArray(n)) {
    if (k.startsWith('?')) return undefined
    if (!k.startsWith('@')) return n[Number(k)]
    // Two items with the same name now: no telling which it was, so the photo stays held.
    const m = named(n, JSON.parse(k.slice(1)) as Record<string, string>)
    return m.length === 1 ? m[0] : undefined
  }
  return isNode(n) ? n[k] : undefined
}, data)
/** Where a returning photo goes in its list: after the photo it followed, else before the one it preceded, else its old place. */
const placeIn = (list: unknown[], p: HeldPlace) => {
  const find = (u?: string) => (u === undefined ? -1 : list.findIndex(x => isNode(x) && x.url === u))
  const prev = find(p.prev), next = find(p.next)
  return prev >= 0 ? prev + 1 : next >= 0 ? next : Math.min(p.at, list.length)
}

/**
 * A rights hold (the chief of staff, 14 Nov 2026): photos a person takes off readers' pages until their source page's
 * credit read says whose they are. Each leaves every page, album and calendar card now, a page's last photo too: this is a
 * person's decision on rights, not an automatic check's verdict, so the last-photo guard (last-photo.ts), which stands
 * between a step's verdict and a page's last photo, has no say here. Nothing is deleted: each photo is kept in
 * `CREDIT_HOLDS` with every place it held, and goes on the never-again list (`HOLD_NOTE`), which keeps it off through a
 * rewrite, the sweep and the photo steps. Only the credit read puts it back (`releaseCreditHolds`). The hold takes a photo
 * only from where it can put it back (`photos` lists, a calendar day's guide card): if one is shown anywhere else, it
 * writes nothing and says where.
 */
export async function holdForCreditRead(root: string, urls: readonly string[], by: string, on: string, why: string): Promise<{ held: string[]; places: number; calendar: number }> {
  const want = new Set(urls), content = join(root, 'content')
  const holds = await readMap<CreditHold>(join(root, CREDIT_HOLDS)), rejected = await readMap<string>(join(root, REJECTED))
  const places: HeldPlace[] = [], calendar = new Map<string, CalendarPlace[]>(), edits: { f: string; raw: string; data: unknown }[] = []
  for (const f of await contentFiles(content)) {
    const raw = await readFile(f, 'utf8')
    if (![...want].some(u => raw.includes(u))) continue
    const data = JSON.parse(raw) as unknown, file = relative(root, f), before = places.length
    takeOut(data, want, file, [], places)
    let cards = 0
    const days = isNode(data) && Array.isArray(data.days) ? (data.days as { date: string; guide?: string; guideImg?: string }[]) : []
    for (const d of days) if (d.guideImg && want.has(d.guideImg)) { calendar.set(d.guideImg, [...(calendar.get(d.guideImg) ?? []), { file, date: d.date, ...(d.guide ? { guide: d.guide } : {}) }]); delete d.guideImg; cards++ }
    if (leftOver(data, want)) throw new Error(`a held photo is shown in ${file} where a hold can't put it back: nothing held`)
    if (places.length > before || cards) edits.push({ f, raw, data })
  }
  for (const u of want) {
    const mine = places.filter(p => p.photo.url === u), cards = calendar.get(u) ?? [], had = holds[u]
    if (!mine.length && !cards.length) continue
    // A hold run again (after a failure halfway) adds to what it recorded the first time.
    const all = [...(had?.places ?? []), ...mine], days = [...(had?.calendar ?? []), ...cards]
    holds[u] = { page: all[0]?.photo.sourceUrl ?? had?.page ?? '', by, on, why, places: all, ...(days.length ? { calendar: days } : {}) }
    rejected[u] ??= HOLD_NOTE
  }
  // Recorded first, then barred, then taken off: a failure at any point leaves nothing shown that isn't recorded.
  await writeMap(join(root, CREDIT_HOLDS), holds)
  await writePhotoState(join(root, REJECTED), rejected)
  for (const e of edits) await writeJson(e.f, e.raw, e.data)
  return { held: [...want].filter(u => holds[u]), places: places.length, calendar: [...calendar.values()].reduce((n, c) => n + c.length, 0) }
}

/**
 * A credit read's answer for held photos. The site's own photographer's or illustrator's go back to every place they
 * held: after the photo each followed, else before the one it preceded, else its old place. They leave the never-again list.
 * One with a final independent refusal stays off. A pending review keeps its own waiting entry, and every other credit kind stays off. A held photo the read didn't find stays
 * held for the page's next turn, and so does any place of a returning photo that is gone (its file, or its list), no longer
 * told apart (two lists of the same name) or taken (its calendar card shows another picture): it is `stuck`, to be said.
 * The never-again list is written first, then the pages, then the holds, so a failure at any point leaves no photo both
 * shown and barred, and a state the next read's release finishes.
 */
export async function releaseCreditHolds(root: string, credits: Record<string, PhotoCredit>): Promise<{ back: string[]; off: string[]; stuck: string[] }> {
  const holds = await readMap<CreditHold>(join(root, CREDIT_HOLDS))
  const matched = Object.entries(holds).flatMap(([url, hold]) => {
    const addresses = creditHoldAddresses(url, hold)
    const credit = addresses.flatMap(address => credits[address] ?? []).sort((a, b) => RANK[b.kind] - RANK[a.kind])[0]
    return credit && credit.kind !== 'none' ? [{ url, hold, addresses, credit }] : []
  })
  if (!matched.length) return { back: [], off: [], stuck: [] }
  // A curator's completed review stands even when the publisher credit read runs before the next sweep.
  await listAgreed(root, photoAddressSet(matched.flatMap(({ addresses }) => addresses)))
  const rejected = await readMap<string>(join(root, REJECTED))
  const marks = await readMap<PhotoScreenEntry>(join(root, 'engine-state', PHOTO_SCREEN_FILE))
  const listed = photoRejections(rejected, marks)
  const back: string[] = [], off: string[] = [], places: HeldPlace[] = [], cards: { url: string; c: CalendarPlace }[] = []
  const left = new Map<string, { places: HeldPlace[]; calendar: CalendarPlace[] }>()
  for (const { url: u, hold: h, addresses, credit: c } of matched) {
    if (c.kind !== 'own') {
      const why = `rejected: ${c.kind} credit ${c.line ?? ''}`
      for (const url of addresses) {
        const prior = listed(url)?.[1]
        if (mayReplaceWithCreditRefusal(prior)) rejected[url] = why
      }
      off.push(u)
      continue
    }
    const reason = listed(u)?.[1]
    const independent = reason && reason !== HOLD_NOTE && !reason.startsWith('waiting:') ? reason : undefined
    const originalBarred = (url: string) => {
      const prior = listed(url)?.[1]
      return !!prior && prior !== HOLD_NOTE && !prior.startsWith('watermark:') && !isVersionRejection(prior)
    }
    const barredOriginal = addresses.some(url => url !== u && originalBarred(url))
    const returning = h.places.filter(({ photo }) =>
      (!photo.original || !originalBarred(photo.original.url)) &&
      (!independent || (isVersionRejection(independent) && deadScreenPhotoUrls(photo).length > 1)),
    )
    if ((independent || barredOriginal) && !returning.length) {
      off.push(u)
      continue
    }
    back.push(u)
    places.push(...returning)
    if (!independent && !barredOriginal) cards.push(...(h.calendar ?? []).map(c => ({ url: u, c })))
  }
  const stay = (u: string) => left.get(u) ?? (left.set(u, { places: [], calendar: [] }), left.get(u)!)
  // Off the never-again list first, then back on the pages, then out of the holds: a failure at any point leaves no
  // photo shown while barred, and the hold still names what the next read's release finishes.
  const lifted = photoAddressSet(back.flatMap(url => creditHoldAddresses(url, holds[url]!)))
  for (const url of back) holds[url]!.released = true
  const stillHeld = photoAddressSet(creditHoldPhotoUrls(holds))
  for (const url of Object.keys(rejected)) {
    if (rejected[url] === HOLD_NOTE && lifted(url) && !stillHeld(url)) delete rejected[url]
  }
  await writePhotoState(join(root, REJECTED), rejected)
  if (back.length) await writeMap(join(root, CREDIT_HOLDS), holds)
  for (const file of new Set([...places.map(p => p.file), ...cards.map(x => x.c.file)])) {
    const f = join(root, file), raw = await readFile(f, 'utf8').catch(() => undefined)
    const mine = places.filter(p => p.file === file).sort((a, b) => a.at - b.at), days = cards.filter(x => x.c.file === file)
    if (!raw) { for (const p of mine) stay(p.photo.url).places.push(p); for (const x of days) stay(x.url).calendar.push(x.c); continue }
    const data = JSON.parse(raw) as unknown
    for (const p of mine) {
      const list = at(data, p.path)
      if (!Array.isArray(list)) { stay(p.photo.url).places.push(p); continue }
      if (!list.some(x => isNode(x) && x.url === p.photo.url)) list.splice(placeIn(list, p), 0, p.photo)
    }
    const calendarDays = isNode(data) && Array.isArray(data.days) ? (data.days as { date: string; guide?: string; guideImg?: string }[]) : []
    for (const { url, c } of days) {
      const d = calendarDays.find(d => d.date === c.date && d.guide === c.guide)
      if (!d || (d.guideImg && d.guideImg !== url)) stay(url).calendar.push(c)
      else d.guideImg = url
    }
    await writeJson(f, raw, data)
  }
  for (const u of [...off, ...back]) {
    const l = left.get(u)
    if (!l || (!l.places.length && !l.calendar.length)) { delete holds[u]; continue }
    const { calendar: _, ...h } = holds[u]!
    const originals = creditHoldAddresses(u, h).filter(url => url !== u)
    holds[u] = { ...h, places: l.places, ...(originals.length ? { originals } : {}), ...(l.calendar.length ? { calendar: l.calendar } : {}) }
  }
  await writeMap(join(root, CREDIT_HOLDS), holds)
  return { back, off, stuck: [...left.keys()] }
}

/** The source pages a credit read still has to read: on the list, or with a photo still held for it. */
export async function creditPagesWaiting(root: string): Promise<Set<string>> {
  return new Set([...Object.keys(await readCreditReads(root)), ...Object.values(await readMap<CreditHold>(join(root, CREDIT_HOLDS))).map(h => h.page)])
}
