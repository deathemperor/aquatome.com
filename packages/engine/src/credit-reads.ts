import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Photo, SourceId } from '@aq/schema'
import { holdForSecondLook, lastPhotos, looks, pagesShowing, readSecondLook } from './last-photo'
import type { PageImage } from './outline'
import { creditKind } from './photo-credit'
import { compactRejection } from './photo-observations'
import { writePhotoState } from './photo-state'
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
export const CREDIT_HOLDS = 'engine-state/_credit-holds.json'
export type CreditRead = { source: SourceId; at: string; by: string }
export type CreditReadKind = 'own' | 'agency' | 'other' | 'none'
export type PhotoCredit = { page: string; kind: CreditReadKind; line?: string; at: string }
/** Where a held photo was: its file, its place in that file's `photos`, and the photo as it was there. */
export type HeldPlace = { file: string; at: number; photo: Photo }
/** A photo a person took off readers' pages until its source page's credit read: who, when, why, and where it was. */
export type CreditHold = { page: string; by: string; on: string; why: string; places: HeldPlace[]; calendar?: string[] }

const REJECTED = 'engine-state/_photo-rejected.json'
/** The never-again note a credit hold puts there, the same for every held photo: how a release knows its own. */
export const HOLD_NOTE = compactRejection('rejected: held for a credit read')
const readMap = async <T>(file: string): Promise<Record<string, T>> => JSON.parse(await readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e })) as Record<string, T>
const writeMap = (file: string, v: Record<string, unknown>) => writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
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
    const credit = img.credit ?? img.author
    if (credit) p.credits.push(credit)
  }
  const out: Record<string, PhotoCredit> = {}
  for (const p of pictures.values()) {
    const lines = p.credits.map(c => ({ c: c.trim(), k: creditReadKind(c, sourceName, terms) })).sort((a, b) => RANK[b.k] - RANK[a.k])
    const top = lines[0]
    const record: PhotoCredit = { page, kind: top?.k ?? 'none', ...(top && top.k !== 'none' ? { line: sha(top.c) } : {}), at }
    for (const src of p.srcs) out[media.urlFor(photoKey(source, src))] = record
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
  const off = (u: string) => (credits[u]?.kind === 'agency' || credits[u]?.kind === 'other') && sl.open(u)
  const content = join(root, 'content')
  const held = new Map([...lastPhotos(await pagesShowing(content), u => off(u) || u in rejected)].filter(([u]) => off(u) && !(u in rejected)))
  await holdForSecondLook(root, new Map([...held].map(([u, pages]) => [u, { why: `rejected: ${credits[u]!.kind} credit ${credits[u]!.line ?? ''}`, pages }])), step)
  const gone = (u: string) => off(u) && !held.has(u)
  for (const u of Object.keys(credits)) if (gone(u) && !(u in rejected)) rejected[u] = compactRejection(`rejected: ${credits[u]!.kind} credit ${credits[u]!.line ?? ''}`)
  const removed: string[] = []
  for (const f of (await readdir(content, { recursive: true })).filter(f => f.endsWith('.json')).map(f => join(content, f))) {
    const raw = await readFile(f, 'utf8')
    if (!Object.keys(credits).some(u => raw.includes(u))) continue
    const data = JSON.parse(raw) as unknown, here: string[] = []
    stripPhotos(data, gone, here, [])
    if (!here.length) continue
    removed.push(...here.map(u => `${relative(root, f)}: ${u}`))
    await writeFile(f, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  await writePhotoState(rejectedFile, rejected)
  return { removed, held: [...held.keys()] }
}

const contentFiles = async (content: string) => (await readdir(content, { recursive: true })).filter(f => f.endsWith('.json')).map(f => join(content, f))
const writeJson = (f: string, raw: string, data: unknown) => writeFile(f, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)

/**
 * A rights hold (the chief of staff, 14 Nov 2026): photos a person takes off readers' pages until their source page's
 * credit read says whose they are. Each leaves every page, album and calendar card now, a page's last photo too: this is a
 * person's decision on rights, not an automatic check's verdict, so the last-photo guard (last-photo.ts), which stands
 * between a step's verdict and a page's last photo, has no say here. Nothing is deleted: each photo is kept in
 * `CREDIT_HOLDS` with every place it held, and goes on the never-again list (`HOLD_NOTE`), which every step respects, so no
 * rewrite, sweep or photo step brings it back. Only the credit read does (`releaseCreditHolds`).
 */
export async function holdForCreditRead(root: string, urls: readonly string[], by: string, on: string, why: string): Promise<{ held: string[]; places: number; calendar: number }> {
  const want = new Set(urls), content = join(root, 'content')
  const holds = await readMap<CreditHold>(join(root, CREDIT_HOLDS)), rejected = await readMap<string>(join(root, REJECTED))
  const places = new Map<string, HeldPlace[]>(), calendar = new Map<string, string[]>()
  for (const f of await contentFiles(content)) {
    const raw = await readFile(f, 'utf8')
    if (![...want].some(u => raw.includes(u))) continue
    const data = JSON.parse(raw) as { photos?: Photo[]; days?: { date: string; guideImg?: string }[] }
    const file = relative(root, f)
    if (Array.isArray(data.photos)) data.photos.forEach((p, at) => { if (want.has(p?.url)) places.set(p.url, [...(places.get(p.url) ?? []), { file, at, photo: p }]) })
    // A calendar day's guide card names its picture: it shows nothing held either.
    let cards = 0
    for (const d of Array.isArray(data.days) ? data.days : []) if (d.guideImg && want.has(d.guideImg)) { calendar.set(d.guideImg, [...(calendar.get(d.guideImg) ?? []), `${file}: ${d.date}`]); delete d.guideImg; cards++ }
    const removed: string[] = []
    stripPhotos(data, u => want.has(u), removed, [])
    if (removed.length || cards) await writeJson(f, raw, data)
  }
  for (const u of want) {
    if (!places.has(u) && !calendar.has(u)) continue
    const page = places.get(u)?.[0]?.photo.sourceUrl ?? ''
    holds[u] = { page, by, on, why, places: places.get(u) ?? [], ...(calendar.has(u) ? { calendar: calendar.get(u) } : {}) }
    rejected[u] ??= HOLD_NOTE
  }
  await writeMap(join(root, CREDIT_HOLDS), holds)
  await writePhotoState(join(root, REJECTED), rejected)
  return { held: [...want].filter(u => holds[u]), places: [...places.values()].reduce((n, p) => n + p.length, 0), calendar: [...calendar.values()].reduce((n, c) => n + c.length, 0) }
}

/**
 * A credit read's answer for held photos: the site's own photographer's or illustrator's go back to every place they
 * held (as near their old place as the list now allows) and leave the never-again list, if the hold put them there; the
 * rest stay off for good. A held photo the read didn't find stays held for the page's next turn.
 */
export async function releaseCreditHolds(root: string, credits: Record<string, PhotoCredit>): Promise<{ back: string[]; off: string[] }> {
  const holds = await readMap<CreditHold>(join(root, CREDIT_HOLDS)), rejected = await readMap<string>(join(root, REJECTED))
  const back: string[] = [], off: string[] = []
  for (const [u, h] of Object.entries(holds)) {
    const c = credits[u]
    if (!c) continue
    delete holds[u]
    if (c.kind !== 'own') { off.push(u); continue }
    back.push(u)
    if (rejected[u] === HOLD_NOTE) delete rejected[u]
    for (const p of h.places) {
      const f = join(root, p.file), raw = await readFile(f, 'utf8').catch(() => undefined)
      if (!raw) continue
      const data = JSON.parse(raw) as { photos?: Photo[] }
      if (!Array.isArray(data.photos) || data.photos.some(x => x.url === u)) continue
      data.photos.splice(Math.min(p.at, data.photos.length), 0, p.photo)
      await writeJson(f, raw, data)
    }
  }
  await writeMap(join(root, CREDIT_HOLDS), holds)
  await writePhotoState(join(root, REJECTED), rejected)
  return { back, off }
}

/** The source pages a credit read still has to read: on the list, or with a photo still held for it. */
export async function creditPagesWaiting(root: string): Promise<Set<string>> {
  return new Set([...Object.keys(await readCreditReads(root)), ...Object.values(await readMap<CreditHold>(join(root, CREDIT_HOLDS))).map(h => h.page)])
}
