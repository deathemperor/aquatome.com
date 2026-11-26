import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { SourceId } from '@aq/schema'
import type { PageImage } from './outline'
import { creditKind } from './photo-credit'
import { snapshotName } from './snapshot'
import { alnum, dedupeKey, photoKey, refusedCredit, SOURCE_PHOTO_LICENCE, type CreditTerms } from './source-photos'

/**
 * The photographer a publisher names under each of its pictures, in our credit: "<the line as printed> / <publisher>"
 * (the chief of staff's rulings: Seriously Fish's credits name the photographer, 10 Nov 2026; a handle, a person with an
 * organisation or a business gets the line as printed too, 17 Nov). Until then a photo from a publisher's page was
 * credited to the publisher alone, though the engine had read the line under it (source-photos.ts used it only to decide
 * whether the permission covers the photo), and a photo already stored never had its credit written again.
 *
 * `CAPTION_CREDITS`: the publishers whose stored copy (sources/<source>/<page>.md) prints each picture's credit right
 * after its caption, on the caption's own line ("<caption> <name>", "<caption> © <name>"), so a photo of ours from that
 * page is tied to its line by the caption we keep with it. Nothing is asked of the publisher: only the stored copy is read.
 */
export const CAPTION_CREDITS: readonly SourceId[] = ['seriouslyfish']

/**
 * `PAGE_CREDITS`: the publishers whose stored copy prints one line for every picture on its page, so each photo of ours
 * from that page is the person the line names (the chief of staff, 17 Nov 2026: Aquarium Glaser's "Text & photos: <name>",
 * on 1,650 of its 2,175 stored pages, 20 Nov). The guard, the chief of staff's: a page whose lines name different people, a
 * line that names more than one person or goes on past a name, and a photo whose own caption prints a credit of its own
 * keep the publisher alone, listed with why.
 */
export const PAGE_CREDITS: Readonly<Partial<Record<SourceId, RegExp>>> = { glaser: /(?:^|[.!?]\s+)text\s*(?:&|and)\s*photos?\s*:\s*(.*)$/i }

/** Why a photo credited to its publisher alone keeps that credit: its line can't be told for certain. */
export type Untied = 'no caption' | 'caption cut' | 'no stored copy' | 'caption not in the stored copy' | 'two lines for its caption' | 'two credits in its line' | 'not a credit' | 'two lines across its copies'
  | 'no line for its page' | 'two lines for its page' | 'more than one person' | 'its own line differs'
export type CreditMend = { named: Record<string, number>; files: number; untied: { file: string; url: string; why: Untied }[] }

/** Photo captions are cut at 200 characters when stored (source-photos.ts), so one that long may be cut. */
const CAPTION_CUT = 200
const lettersOf = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/**
 * The credit a line gives after a photo's caption, as printed: what follows the copyright sign where the line has one,
 * else the rest of the line, which must read as a credit (a person, an organisation, a business, or one word, a handle)
 * and not as more of the caption. Two different credits after two signs: none. Words between the caption and the sign,
 * or a space between the caption and a credit with no sign, are a longer caption that starts with this one: another
 * picture's ("Male" in "Male in colour"), whose credit this photo doesn't take. Seriously Fish's copy prints a credit
 * with no sign right after the caption, with no space (every one of the 1,503 so tied on main, 19 Nov), and a credit
 * with a sign after nothing but spaces and stops (all 64).
 */
export function creditAfter(rest: string): { name: string } | { why: 'two credits in its line' | 'not a credit' } {
  const parts = rest.split(/©|\(c\)/i)
  // What sits between the caption and the name (a full stop, the sign) isn't the name; a full stop that ends it ("et al.") is.
  const clean = (s: string) => lettersOf(s).replace(/^[^\p{L}\p{N}]+/u, '').replace(/[\s,;:·-]+$/u, '').trim()
  if (parts.length > 1) {
    if (/[\p{L}\p{N}]/u.test(parts[0]!)) return { why: 'not a credit' }
    const names = [...new Set(parts.slice(1).map(clean).filter(Boolean))]
    if (names.length > 1) return { why: 'two credits in its line' }
    return names[0] && !sentence(names[0]) ? { name: names[0] } : { why: 'not a credit' }
  }
  const name = clean(rest)
  if (/^\s/.test(rest) || !name || sentence(name)) return { why: 'not a credit' }
  return creditKind(name) !== 'unclear' || !/\s/.test(name) ? { name } : { why: 'not a credit' }
}

/**
 * More words of the page, not a credit: a line of the text that starts with the caption's words (a caption that is only
 * the fish's name, and a paragraph that opens with it: "<name> is a small cichlid from…"). A credit doesn't start in
 * lower case, holds no full stop after a word that ends a sentence, and is short. One that ends with a stop holds no
 * word in lower case but a name's particles ("van der", "et al."): "These fish swim together." is a sentence, a name
 * with a stop after it, initials, or a paper's authors are not.
 */
const PARTICLES = new Set(['van', 'der', 'den', 'von', 'de', 'del', 'della', 'di', 'da', 'dos', 'das', 'du', 'le', 'la', 'ter', 'ten', 'y', 'e', 'et', 'al'])
const sentence = (s: string) => /^\p{Ll}/u.test(s) || /\p{Ll}{2}[.!?]\s/u.test(s) || s.length > 80
  || (/[.!?]$/.test(s) && (s.match(/\p{L}+/gu) ?? []).some(w => /^\p{Ll}/u.test(w) && !PARTICLES.has(w)))

/** The credit a stored copy prints after this caption: the one line that starts with the caption and goes on. */
export function tiedCredit(caption: string | undefined, lines: readonly string[] | undefined): { name: string } | { why: Untied } {
  const cap = lettersOf(caption ?? '')
  if (!cap) return { why: 'no caption' }
  if ((caption ?? '').length >= CAPTION_CUT) return { why: 'caption cut' }
  if (!lines) return { why: 'no stored copy' }
  const rests = [...new Set(lines.filter(l => l.startsWith(cap) && l.length > cap.length).map(l => l.slice(cap.length)))]
  if (!rests.length) return { why: 'caption not in the stored copy' }
  // The caption alone on a line too: another picture's caption, or this one's with its credit on another line.
  if (rests.length > 1 || lines.includes(cap)) return { why: 'two lines for its caption' }
  return creditAfter(rests[0]!)
}

/** One person's name and nothing more: two to five words, each capitalised, an initial or a name's particle. */
const onePerson = (s: string) => {
  const words = s.split(' ')
  return words.length >= 2 && words.length <= 5 && words.every(w => /^\p{Lu}[\p{L}'’-]*\.?$/u.test(w) || PARTICLES.has(w)) && creditKind(s) === 'person'
}
/** A name as a line prints it: what sits around it (spaces, a closing stop or comma) isn't the name; an initial's stop is. */
const nameOf = (s: string) => lettersOf(s).replace(/[\s,;:·-]+$/u, '').replace(/(\p{L}{2,})\.$/u, '$1')

/**
 * The credit a publisher's page-wide line gives a photo from that page (`PAGE_CREDITS`): the one person every such line in
 * the page's stored copy names, unless the photo's own caption prints a credit of its own that isn't that person.
 */
export function pageCredit(caption: string | undefined, lines: readonly string[] | undefined, line: RegExp): { name: string } | { why: Untied } {
  if (!lines) return { why: 'no stored copy' }
  const found = [...new Set(lines.flatMap(l => { const m = line.exec(l); return m ? [nameOf(m[1]!)] : [] }))]
  if (!found.length) return { why: 'no line for its page' }
  if (found.length > 1) return { why: 'two lines for its page' }
  const name = found[0]!
  if (!onePerson(name)) {
    const people = name.split(/\s+(?:&|and|und|\+)\s+|\s*[,/]\s*/)
    return { why: people.length > 1 && people.every(onePerson) ? 'more than one person' : 'not a credit' }
  }
  const own = /(?:©|\(c\)|\bphoto(?:graph)?s?\s*(?:by|:))\s*(.+)$/i.exec(caption ?? '')
  if (own && nameOf(own[1]!) !== name) return { why: 'its own line differs' }
  return { name }
}

/**
 * A copy that shows another credit, or a line the guard refuses, keeps every copy of its photo with the publisher alone,
 * not itself only: one photo is one picture, and a copy with nothing to say can't outvote one that says otherwise. For a
 * page-wide line, "not a credit" is the guard's line that goes on past a name; for a caption's line it says only that no
 * credit follows, and another copy may still tie.
 */
const CONFLICT: ReadonlySet<Untied> = new Set(['two credits in its line', 'its own line differs', 'two lines for its page', 'more than one person'])
const vetoes = (why: Untied, pageWide: boolean) => CONFLICT.has(why) || (pageWide && why === 'not a credit')

type PhotoLike = { url: string; author: string; licence?: string; source?: string; sourceUrl?: string; caption?: string }
const isPhoto = (o: Record<string, unknown>): o is PhotoLike & Record<string, unknown> => typeof o.url === 'string' && typeof o.author === 'string'

/** Where a publisher's photos sit: each page's entity (fish, plants, breeds, guides, glossary terms) and each album. */
async function photoFiles(content: string): Promise<string[]> {
  const out: string[] = []
  for (const kind of ['species', 'plants', 'breeds', 'guides', 'glossary']) {
    for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) out.push(join(content, kind, id, 'entity.json'))
  }
  for (const f of await readdir(join(content, 'gallery')).catch(() => [] as string[])) if (f.endsWith('.json')) out.push(join(content, 'gallery', f))
  return out
}

/**
 * Every photo credited to its publisher alone, from a publisher on `CAPTION_CREDITS`, gets the line its page's stored
 * copy prints after its caption, and one from a publisher on `PAGE_CREDITS` the person its page's line names for every
 * picture: on pages, in albums and in the glossary alike (`photoFiles`), the same name wherever
 * the photo is. A photo whose line can't be told for certain keeps the publisher alone and is listed with why (`untied`),
 * by file and address, never a name. Only `author` changes; a file is written only when one of its photos changes.
 */
export async function namePublisherCredits(root: string, sources: readonly SourceId[] = [...CAPTION_CREDITS, ...(Object.keys(PAGE_CREDITS) as SourceId[])]): Promise<CreditMend> {
  const registry = JSON.parse(await readFile(join(root, 'content', 'sources.json'), 'utf8')) as Record<string, { name?: string }>
  const names = new Map(sources.flatMap(s => (registry[s]?.name ? [[s, registry[s]!.name!] as const] : [])))
  const copies = new Map<string, string[] | undefined>()
  const stored = async (source: string, url: string) => {
    const key = `${source} ${url}`
    if (!copies.has(key)) {
      let file: string | undefined
      try { file = join(root, 'sources', source, `${snapshotName(url)}.md`) } catch { file = undefined }
      const text = file ? await readFile(file, 'utf8').catch(() => undefined) : undefined
      copies.set(key, text?.split('\n').map(lettersOf).filter(Boolean))
    }
    return copies.get(key)
  }
  const files = await photoFiles(join(root, 'content'))
  // First every copy of each photo, tied where its own caption ties it: one photo (one address in our store) is one
  // picture, credited one way wherever it is. A copy that can't tie by itself (an album copy with no caption) takes the
  // line its other copies tie to; copies that tie to different lines keep the publisher alone.
  const found: { file: string; data: unknown; photos: { p: PhotoLike & Record<string, unknown>; t: ReturnType<typeof tiedCredit> }[] }[] = []
  const lines = new Map<string, Set<string>>()
  const vetoed = new Map<string, Untied>()
  for (const file of files) {
    const raw = await readFile(file, 'utf8').catch(() => '')
    // A publisher's name at the end of a credit: its photos alone, and those already named.
    if (![...names.values()].some(n => raw.includes(`${n}"`))) continue
    const data = JSON.parse(raw) as unknown
    const photos: (PhotoLike & Record<string, unknown>)[] = []
    const visit = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(visit)
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      const publisher = isPhoto(o) && typeof o.source === 'string' && o.licence === SOURCE_PHOTO_LICENCE ? names.get(o.source as SourceId) : undefined
      if (publisher && o.author === publisher) photos.push(o as PhotoLike & Record<string, unknown>)
      // A copy named already is one of its picture's copies too: a copy that ties to another line keeps the publisher alone.
      else if (publisher && (o.author as string).endsWith(` / ${publisher}`)) lines.set(o.url as string, (lines.get(o.url as string) ?? new Set()).add((o.author as string).slice(0, -` / ${publisher}`.length)))
      Object.values(o).forEach(visit)
    }
    visit(data)
    if (!photos.length) continue
    const tied = []
    for (const p of photos) {
      const copy = p.sourceUrl ? await stored(p.source!, p.sourceUrl) : undefined
      const pageLine = PAGE_CREDITS[p.source as SourceId]
      const t = pageLine ? pageCredit(p.caption, copy, pageLine) : tiedCredit(p.caption, copy)
      if ('name' in t) lines.set(p.url, (lines.get(p.url) ?? new Set()).add(t.name))
      else if (vetoes(t.why, !!pageLine) && !vetoed.has(p.url)) vetoed.set(p.url, t.why)
      tied.push({ p, t })
    }
    found.push({ file, data, photos: tied })
  }
  const named: Record<string, number> = {}
  const untied: CreditMend['untied'] = []
  let changed = 0
  for (const f of found) {
    let any = false
    for (const { p, t } of f.photos) {
      const one = lines.get(p.url), veto = vetoed.get(p.url)
      if (veto) { untied.push({ file: relative(root, f.file), url: p.url, why: veto }); continue }
      if (!one || one.size > 1) { untied.push({ file: relative(root, f.file), url: p.url, why: one ? 'two lines across its copies' : 'why' in t ? t.why : 'not a credit' }); continue }
      p.author = `${[...one][0]} / ${p.author}`
      named[p.source!] = (named[p.source!] ?? 0) + 1
      any = true
    }
    if (!any) continue
    await writeFile(f.file, `${JSON.stringify(f.data, null, 2)}\n`)
    changed++
  }
  return { named, files: changed, untied }
}

/** "Photo: ", "Credit: " and the like before a picture's line are no part of the name. */
const LABEL = /^\s*(?:credit|photo(?:graph)?|image|illustration)s?\s*(?:by)?\s*:\s*/i

/**
 * The name a publisher's picture gets from the line its page prints with it (a figure's credit, ScotCat's ©): the line as
 * printed, but for the publisher's own photographer ("<site> / <name>"), who is the name after the slash. None for no
 * line, the publisher alone, a picture agency the source's permission names, or words that read as a sentence.
 */
export function pictureCredit(line: string | undefined, sourceName: string, terms: CreditTerms = {}): string | undefined {
  const s = lettersOf((line ?? '').replace(LABEL, ''))
  if (!s || refusedCredit(s, terms.refusedCredits) || creditKind(s, terms.refusedCredits) === 'agency') return undefined
  const parts = s.split(/\s*\/\s*/), first = alnum(parts[0]!)
  const own = first.length >= 6 && alnum(sourceName).startsWith(first)
  const name = own ? parts.slice(1).join(' / ') : s
  if (!name || alnum(name) === alnum(sourceName)) return undefined
  const c = creditAfter(name)
  return 'name' in c ? c.name : undefined
}

/**
 * Line reads (the chief of staff, 17 Nov 2026): source pages whose pictures on our pages are credited to the publisher
 * alone though the page prints a line with each, which the stored copy keeps without its place (The Spruce Pets, Aquarium
 * Breeder, ScotCat, Loaches Online). The cycle reads each page on the list once: one marked `turn` on its own turn, as it
 * would anyway, and the rest the next time the cycle reads its source, at its pace and with its own client, asked for by
 * this list alone. From that read's pictures, each photo of ours credited to the publisher alone takes its picture's line
 * (`namePictureLines`), and the page leaves the list.
 */
export const LINE_READS = 'engine-state/_credit-lines.json'
export type LineRead = { source: SourceId; at: string; by: string; turn?: true }
export const readLineReads = async (root: string): Promise<Record<string, LineRead>> => JSON.parse(await readFile(join(root, LINE_READS), 'utf8').catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return '{}'; throw e })) as Record<string, LineRead>
export const writeLineReads = (root: string, v: Record<string, LineRead>) => writeFile(join(root, LINE_READS), `${JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)

/**
 * Each photo of ours a read page shows, credited to the publisher alone, gets "<its picture's line> / <publisher>"
 * (`pictureCredit`) wherever it is: on pages, in albums and in the glossary. A picture's copies (sizes, a srcset) are one
 * picture; copies that print different lines name none, and a photo of ours one of whose copies is named already by
 * another line keeps its other copies with the publisher alone. Returns how many places were named.
 */
export async function namePictureLines(root: string, source: SourceId, sourceName: string, images: readonly PageImage[], page: string, urlFor: (key: string) => string, terms: CreditTerms = {}): Promise<number> {
  const pictures = new Map<string, { urls: Set<string>; names: Set<string> }>()
  for (const img of images) {
    let src: string
    try { src = new URL(img.src, page).href } catch { continue }
    const p = pictures.get(dedupeKey(src)) ?? { urls: new Set<string>(), names: new Set<string>() }
    pictures.set(dedupeKey(src), p)
    p.urls.add(urlFor(photoKey(source, src)))
    const name = pictureCredit(img.author ?? img.credit, sourceName, terms)
    if (name) p.names.add(name)
  }
  const named = new Map<string, string>()
  for (const p of pictures.values()) if (p.names.size === 1) for (const u of p.urls) named.set(u, [...p.names][0]!)
  if (!named.size) return 0
  // A photo one of whose copies is named already, by another line: its copies credited to the publisher alone stay so.
  const files: { file: string; raw: string; data: unknown }[] = []
  const already = (o: Record<string, unknown>) => isPhoto(o) && o.source === source && o.licence === SOURCE_PHOTO_LICENCE && named.has(o.url) && o.author.endsWith(` / ${sourceName}`) ? o.author.slice(0, -` / ${sourceName}`.length) : undefined
  for (const file of await photoFiles(join(root, 'content'))) {
    const raw = await readFile(file, 'utf8').catch(() => '')
    if (![...named.keys()].some(u => raw.includes(u))) continue
    const data = JSON.parse(raw) as unknown
    files.push({ file, raw, data })
    const visit = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(visit)
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      const name = already(o)
      if (name !== undefined && name !== named.get(o.url as string)) named.delete(o.url as string)
      Object.values(o).forEach(visit)
    }
    visit(data)
  }
  let places = 0
  for (const { file, raw, data } of files) {
    let here = 0
    const visit = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(visit)
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isPhoto(o) && o.source === source && o.licence === SOURCE_PHOTO_LICENCE && o.author === sourceName && named.has(o.url)) { o.author = `${named.get(o.url)} / ${sourceName}`; here++ }
      Object.values(o).forEach(visit)
    }
    visit(data)
    if (!here) continue
    await writeFile(file, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
    places += here
  }
  return places
}

/** Publisher photos (by permission) on our pages, albums and glossary, by publisher: credited with a line, or to the publisher alone. */
export async function creditCounts(root: string): Promise<Record<string, { named: number; alone: number }>> {
  const registry = JSON.parse(await readFile(join(root, 'content', 'sources.json'), 'utf8')) as Record<string, { name?: string }>
  const out: Record<string, { named: number; alone: number }> = {}
  for (const file of await photoFiles(join(root, 'content'))) {
    const visit = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(visit)
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      const name = typeof o.source === 'string' ? registry[o.source]?.name : undefined
      if (name && isPhoto(o) && o.licence === SOURCE_PHOTO_LICENCE) {
        const c = (out[o.source as string] ??= { named: 0, alone: 0 })
        if (o.author === name) c.alone++
        else if (o.author.endsWith(` / ${name}`)) c.named++
      }
      Object.values(o).forEach(visit)
    }
    visit(JSON.parse(await readFile(file, 'utf8').catch(() => 'null')))
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}
