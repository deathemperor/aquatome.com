import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { SourceId } from '@aq/schema'
import { creditKind } from './photo-credit'
import { snapshotName } from './snapshot'
import { SOURCE_PHOTO_LICENCE } from './source-photos'

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

/** Why a photo credited to its publisher alone keeps that credit: its line can't be told for certain. */
export type Untied = 'no caption' | 'caption cut' | 'no stored copy' | 'caption not in the stored copy' | 'two lines for its caption' | 'two credits in its line' | 'not a credit' | 'two lines across its copies'
export type CreditMend = { named: Record<string, number>; files: number; untied: { file: string; url: string; why: Untied }[] }

/** Photo captions are cut at 200 characters when stored (source-photos.ts), so one that long may be cut. */
const CAPTION_CUT = 200
const lettersOf = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim()

/**
 * The credit a line gives after a photo's caption, as printed: what follows the copyright sign where the line has one (the
 * caption may run on before it), else the rest of the line, which must read as a credit (a person, an organisation, a
 * business, or one word, a handle) and not as more of the caption. Two different credits after two signs: none.
 */
export function creditAfter(rest: string): { name: string } | { why: 'two credits in its line' | 'not a credit' } {
  const parts = rest.split(/©|\(c\)/i)
  // What sits between the caption and the name (a full stop, the sign) isn't the name; a full stop that ends it ("et al.") is.
  const clean = (s: string) => lettersOf(s).replace(/^[^\p{L}\p{N}]+/u, '').replace(/[\s,;:·-]+$/u, '').trim()
  if (parts.length > 1) {
    const names = [...new Set(parts.slice(1).map(clean).filter(Boolean))]
    if (names.length > 1) return { why: 'two credits in its line' }
    return names[0] && !sentence(names[0]) ? { name: names[0] } : { why: 'not a credit' }
  }
  const name = clean(rest)
  if (!name || sentence(name)) return { why: 'not a credit' }
  return creditKind(name) !== 'unclear' || !/\s/.test(name) ? { name } : { why: 'not a credit' }
}

/**
 * More words of the page, not a credit: a line of the text that starts with the caption's words (a caption that is only
 * the fish's name, and a paragraph that opens with it: "<name> is a small cichlid from…"). A credit doesn't start in
 * lower case, holds no full stop after a word that ends a sentence, and is short.
 */
const sentence = (s: string) => /^\p{Ll}/u.test(s) || /\p{Ll}{2}[.!?]\s/u.test(s) || s.length > 80

/** The credit a stored copy prints after this caption: the one line that starts with the caption and goes on. */
export function tiedCredit(caption: string | undefined, lines: readonly string[] | undefined): { name: string } | { why: Untied } {
  const cap = lettersOf(caption ?? '')
  if (!cap) return { why: 'no caption' }
  if ((caption ?? '').length >= CAPTION_CUT) return { why: 'caption cut' }
  if (!lines) return { why: 'no stored copy' }
  const rests = [...new Set(lines.filter(l => l.startsWith(cap) && l.length > cap.length).map(l => l.slice(cap.length)))]
  if (!rests.length) return { why: 'caption not in the stored copy' }
  if (rests.length > 1) return { why: 'two lines for its caption' }
  return creditAfter(rests[0]!)
}

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
 * copy prints after its caption: on pages, in albums and in the glossary alike (`photoFiles`), the same name wherever
 * the photo is. A photo whose line can't be told for certain keeps the publisher alone and is listed with why (`untied`),
 * by file and address, never a name. Only `author` changes; a file is written only when one of its photos changes.
 */
export async function namePublisherCredits(root: string, sources: readonly SourceId[] = CAPTION_CREDITS): Promise<CreditMend> {
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
  for (const file of files) {
    const raw = await readFile(file, 'utf8').catch(() => '')
    if (![...names.values()].some(n => raw.includes(JSON.stringify(n)))) continue
    const data = JSON.parse(raw) as unknown
    const photos: (PhotoLike & Record<string, unknown>)[] = []
    const visit = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(visit)
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (isPhoto(o) && typeof o.source === 'string' && names.get(o.source as SourceId) === o.author && o.licence === SOURCE_PHOTO_LICENCE) photos.push(o)
      Object.values(o).forEach(visit)
    }
    visit(data)
    if (!photos.length) continue
    const tied = []
    for (const p of photos) {
      const t = tiedCredit(p.caption, p.sourceUrl ? await stored(p.source!, p.sourceUrl) : undefined)
      if ('name' in t) lines.set(p.url, (lines.get(p.url) ?? new Set()).add(t.name))
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
      const one = lines.get(p.url)
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
