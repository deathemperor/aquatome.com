/**
 * What a photo's own source calls its subject, for one page: the species (or nothing against it), "cf." (the source isn't
 * sure of the species), or only the genus, an undescribed form or another fish. Read from the source's own words each
 * time (the photo's address, a Commons file's name, and its caption), so the photos already on pages are held as well
 * as new ones, with no mark to keep. The chief of staff, 2026-11-14: on main, 9 fish pages led with a photo their source
 * names only to its genus or as another fish (the Colossoma's was a Commons file titled "Piaractus sp."), and 13 with a
 * "cf." one.
 *
 * - `GENUS` (2), named only to the genus, as an undescribed form ("sp. 'Upper Brahmaputra'", "sp. CW010") or as another
 *   fish ("Piaractus sp." on the Colossoma's page, a file named for another species the site has a page for, "aff."):
 *   never leads while a photo named to the species or "cf." passes as a head; it may stay on the page and in
 *   its album, behind them, and leads only by a person's pick (engine-state/_photo-head-picks.json). Where it is all a
 *   page has that passes, it stays, and the photo check lists it for the chief of staff.
 * - `CF` (1): behind every photo named to the species, and never leads while one of those passes.
 * - `SPECIES` (0): the rest.
 *
 * Not counted: "sp." before the page's own epithet (ScotCat's "Akysis sp. varius"), a name the source gives as the fish's
 * trade name ("traded as B. sp. 'micros'", "sold as R. wilpita"), "spp." in a sentence about the genus ("Vaillantella spp.
 * are easily told apart"), a file code in capitals ("SP A0154"), and a plant page's own form ("Bucephalandra sp. 'Red'").
 */
import { photoFitsHead, type Photo } from '@aq/schema'
import { cardWorthy, type Verdicts } from './curation'

export const SPECIES = 0
export const CF = 1
export const GENUS = 2
export type Named = typeof SPECIES | typeof CF | typeof GENUS

/**
 * `latin`: the page's synonyms. `known`: every species' and plant's Latin names, lower case, first two words ("betta
 * anabatoides"; knownNames), for a file named as another. `codes`: the fish's own L, LDA, C or CW numbers (`lNumber`).
 */
export type NamedPage = { sci: string; latin?: string[]; known?: Set<string>; codes?: string[] }
export type NamedPhoto = { sourceUrl?: string; caption?: string }

/** The source's name for the photo: a Commons file's name, or the last part of the source page's address. */
export function sourceTitle(sourceUrl: string | undefined): string {
  let path: string
  try { path = decodeURIComponent(new URL(sourceUrl ?? '').pathname) } catch { return '' }
  const last = path.split('/').filter(Boolean).at(-1) ?? ''
  if (/^File:/i.test(last)) return last.replace(/^File:/i, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ')
  return last.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_]+/g, ' ')
}

const flat = (s: string) => s.replace(/[‘’“”]/g, "'").replace(/\s+/g, ' ').trim()
const word = (s: string) => s.toLowerCase().replace(/^['"(]+|['".,;:)]+$/g, '')

/**
 * The words a trade name follows: what comes after them, to a semicolon or the end ("B. sp." has its own full stops), names
 * this fish as it's sold ("traded as B. sp. 'micros'", "appeared in the ornamental trade as C. sp. 'real blue'").
 */
const TRADE = /\b(?:traded|sold|exported|imported|offered|marketed|known) as\b[^;]*|\btrade as\b[^;]*|\btrade names?\b[^;]*/gi
/** "Genus sp." or "spp.", lower case: "SP A0154" is a file code. */
const SP = /(?:^|[\s(,;:])([A-Za-z][a-z]*\.?)\s+(spp?)\b\.?/g
const CF_ = /(?:^|[\s(,;:])cf\b\.?\s*['"]?[a-z]/
/** "aff.": by convention another fish, close to this one (none on main, 2026-11-14). */
const AFF = /(?:^|[\s(,;:])aff\b\.?\s*['"]?[a-z]/
/** A sentence about the genus: "Vaillantella spp. are easily told apart", "Erromyzon spp. typically possess four barbels". */
const GENERAL = /^(?:(?:typically|usually|often|generally|normally|also|all|commonly|mostly)\s+)?(?:are|is|have|has|possess|include|includes|can|do|does|occur|differ|grow|live|need|prefer|require|feed|tend)\b/
/** A pleco's or a cory's number after "sp.": "Peckoltia sp. (L 134)". */
const TAG = /^\(?\s*((?:LDA|L|CW|C|A)[\s-]?\d{1,4}[a-dA-D]?)(?![\p{L}\p{N}])/iu
const code = (s: string) => s.toUpperCase().replace(/[\s-]+/g, '').replace(/^([A-Z]+)0+(?=\d)/, '$1')

/** The page's own form after "sp." or in quotes, lower case ("bucephalandra sp. 'red'" → "red"); '' for none. */
function pageForm(sci: string): { genus: string; epithet: string; form: string; spPage: boolean } {
  const parts = flat(sci).split(' ')
  const sp = parts.findIndex(p => /^spp?\.?$/.test(p))
  const quoted = /'([^']+)'/.exec(sci)?.[1] ?? ''
  const form = sp >= 0 ? (quoted || parts.slice(sp + 1).join(' ')) : quoted
  // A genus's own page ("Azolla", "Puntius") is named by "Azolla sp." as much as by any of its species.
  return { genus: word(parts[0] ?? ''), epithet: sp === 1 ? '' : word(parts[1] ?? ''), form: word(form), spPage: sp === 1 || parts.length === 1 }
}

/**
 * Where a caption names its photo's subject: in its first words, or just after "of" ("Adult male of B. sp. 'Teesta'").
 * Further on, a name is another fish the sentence brings in ("among shoals of smaller Puntius spp.", "separates this
 * species from S. sp. 'SEW01'"). A file's name names its subject throughout.
 */
function subjectAt(t: string, at: number, caption: boolean): boolean {
  if (!caption) return true
  const pre = t.slice(0, at).trim().split(' ').filter(Boolean)
  return pre.length <= 5 || word(pre.at(-1) ?? '') === 'of'
}

/** Class of what one stretch of the source's words (a file's name, or a caption) calls the subject. */
function classOf(text: string, page: NamedPage, caption: boolean): Named {
  const t = flat(text).replace(TRADE, ' ')
  const { genus, epithet, form, spPage } = pageForm(page.sci)
  const codes = new Set((page.codes ?? []).map(code))
  let named: Named = SPECIES
  for (const m of t.matchAll(SP)) {
    const at = m.index! + m[0].indexOf(m[1]!)
    if (!subjectAt(t, at, caption)) continue
    const rest = t.slice(m.index! + m[0].length).trim()
    if (/^cf\b/.test(rest) || GENERAL.test(rest)) continue
    const next = rest.split(/[\s,;]+/).map(word).filter(Boolean)
    // "Akysis sp. varius" (ScotCat's way), and this species' own form, "Apistogramma hongsloi sp. 'Red'" (its genus or the
    // genus's initial before the epithet: "Tropheops spp." is the genus, on the Tropheops tropheops page).
    const before = word(t.slice(0, at).trim().split(' ').at(-1) ?? '')
    const own = word(m[1]!) === epithet && (before === genus || before === genus[0])
    if (epithet && (next[0] === epithet || own)) continue
    if (form && next.join(' ').startsWith(form)) continue
    if (spPage && !form) continue
    // The fish's own number on record (entity.json `lNumber`): "Peckoltia sp. (L 134)" on Peckoltia compta's page.
    const tag = TAG.exec(rest)?.[1]
    if (tag && codes.has(code(tag))) continue
    named = GENUS
  }
  const at = (m: RegExpExecArray | null) => { if (!m) return -1; const b = t.slice(0, m.index).trimEnd(); return b.lastIndexOf(' ') + 1 }
  const aff = AFF.exec(t)
  if (aff && subjectAt(t, at(aff), caption)) return GENUS
  const cf = CF_.exec(t)
  if (named === SPECIES && cf && subjectAt(t, at(cf), caption)) named = CF
  return named
}

/** Doubt in the source's own words that the fish is this species (the Geophagus: "bars which this species should not have"). */
const DOUBT = /\b(?:should not|shouldn'?t) (?:have|be)\b|\bI am unsure\b|\bnot sure (?:of|that|it)\b/i

/**
 * A file named as another species the site has a page for (Betta raja's three photos, "Betta anabatoides"): its name's
 * first two words, unless the page is a genus's, the name has this page's epithet too ("Apteronotus leptorhynchus A.
 * macrostomus"), or only the genus differs (an old name).
 */
function namesAnother(title: string, page: NamedPage): boolean {
  const mine = flat(page.sci).toLowerCase().split(' ')
  if (!page.known || mine.length < 2 || !/^[a-z]+$/.test(mine[1]!)) return false
  // "Heros_notatus01": the digits a file's name runs on with go.
  const words = title.toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean)
  const two = words.slice(0, 2)
  if (two.length < 2 || !page.known.has(two.join(' '))) return false
  const own = [page.sci, ...(page.latin ?? [])].map(n => flat(n).toLowerCase().split(' '))
  return !own.some(n => n[1] === two[1] || (!!n[1] && words.includes(n[1])))
}

/** A caption in Vietnamese is ours (the album step writes them), not the source's words: its letters only Vietnamese has. */
const OURS = /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i

/**
 * Words that keep a caption from plainly naming its photo's subject: a hedge ("cf.", "aff.", "sp.", "possibly", "?"), a
 * denial ("not", "unlike", "misidentified"), a choice ("or", "vs"), or another fish beside it ("with", "and", "among").
 */
const HEDGE = /\b(?:cf|aff|spp?|not|unlike|misidentified|mislabell?ed|possibly|probably|perhaps|maybe|likely|presumably|apparently|uncertain|unsure|unclear|doubtful|questionable|or|vs|versus|think|hybrids?|with|and|among|beside|alongside|plus)\b|[?&]/i

/** The site's other fish (or plants) as a caption may write them: genera, and "x. epithet" initials to their full names. */
const shapes = new WeakMap<Set<string>, { genera: Set<string>; initials: Map<string, Set<string>> }>()
function shapesOf(known: Set<string>) {
  let s = shapes.get(known)
  if (!s) {
    s = { genera: new Set(), initials: new Map() }
    for (const n of known) {
      const [g, e] = n.split(' ')
      if (!g || !e) continue
      s.genera.add(g)
      const k = `${g[0]}. ${e}`
      s.initials.set(k, new Set([...(s.initials.get(k) ?? []), n]))
    }
    shapes.set(known, s)
  }
  return s
}

/**
 * Whether the source's description plainly names this species (or a synonym) as the photo's subject, for the order of
 * trust: "Schwarzer Pacu (Colossoma macropomum), Tierpark Hellabrunn". The name stands in the first five words, by its
 * genus as written or by an initial no other fish on the site shares with that epithet. Nothing beside it hedges, denies
 * or offers a choice (HEDGE, DOUBT), no other fish the site has a page for is named, and a trade name doesn't count
 * ("sold as …"). Anything less leaves the file's name to decide, as before.
 */
function plainlyThis(caption: string, page: NamedPage): boolean {
  const t = flat(caption.replace(TRADE, ' '))
  if (!t || HEDGE.test(t) || DOUBT.test(t)) return false
  const own = [page.sci, ...(page.latin ?? [])].map(n => flat(n).toLowerCase().split(' ')).filter(([g, e]) => !!g && !!e && /^[a-z]+$/.test(e))
  const ownGenera = new Set(own.map(([g]) => g!))
  const { genera, initials } = shapesOf(page.known ?? new Set())
  const words = t.split(' ').map(w => w.replace(/^['"(]+|[)'",;:]+$/g, ''))
  let mine = -1
  for (let i = 0; i < words.length; i++) {
    const a = words[i]!, b = (words[i + 1] ?? '').toLowerCase().replace(/\.$/, '')
    const g = a.toLowerCase().replace(/\.$/, '')
    const initial = /^[A-Z]\.$/.test(a)
    if (initial) {
      const ours = own.some(([og, oe]) => og![0] === g && oe === b)
      const others = [...(initials.get(`${g}. ${b}`) ?? [])].filter(n => !own.some(o => o.join(' ') === n))
      if (others.length) return false
      if (ours && mine < 0) mine = i
      continue
    }
    if (!/^[A-Z][a-z]+\.?$/.test(a) || !/^[a-z]+$/.test(b)) continue
    if (own.some(([og, oe]) => og === g && oe === b)) { if (mine < 0) mine = i; continue }
    if (genera.has(g) && !ownGenera.has(g)) return false
    if ((page.known ?? new Set()).has(`${g} ${b}`)) return false
  }
  return mine >= 0 && mine <= 5
}

/**
 * What the photo's source calls its subject, for this page. The source's description outranks the file's name: one that
 * names this species as the subject, with no "sp.", "cf." or doubt beside it, makes the photo named to the species
 * whatever the file's name says (the chief of staff, 2026-11-14: the Colossoma's new head is described as "Schwarzer Pacu
 * (Colossoma macropomum), Tierpark Hellabrunn", in a file whose name says Piaractus).
 */
export function namedAs(p: NamedPhoto, page: NamedPage): Named {
  const caption = OURS.test(p.caption ?? '') ? '' : (p.caption ?? '')
  const said = classOf(caption, page, true)
  if (said === SPECIES && plainlyThis(caption, page)) return SPECIES
  if (namesAnother(sourceTitle(p.sourceUrl), page)) return GENUS
  const named = Math.max(classOf(sourceTitle(p.sourceUrl), page, false), said) as Named
  if (named === CF && DOUBT.test(caption)) return GENUS
  return named
}

/**
 * Photos with each the rule ranks down moved behind the rest, the order otherwise as it was: the lowest class (`cls`)
 * among the photos that pass as a head is the bar, and a photo named worse than it goes behind, the worse the later. When
 * no photo passes, nothing moves (a rule doesn't empty or reorder a page with nothing better). AI pictures stay last.
 */
export function namedOrder<P extends { url: string; generated?: unknown }>(photos: P[], cls: (p: P) => Named, passes: (p: P) => boolean): P[] {
  const c = new Map(photos.map(p => [p.url, p.generated ? SPECIES : cls(p)]))
  const bar = Math.min(...photos.filter(p => !p.generated && passes(p)).map(p => c.get(p.url)!))
  if (!Number.isFinite(bar)) return photos
  const key = (p: P) => (p.generated ? GENUS + 1 : c.get(p.url)! > bar ? c.get(p.url)! : 0)
  return photos.map((p, i) => ({ p, i })).sort((a, b) => key(a.p) - key(b.p) || a.i - b.i).map(({ p }) => p)
}

/** Every species' and plant's Latin names (its scientific name and synonyms), lower case, first two words. */
export const knownNames = (pages: { scientificName?: string; synonyms?: string[] }[]): Set<string> =>
  new Set(pages.flatMap(e => [e.scientificName, ...(e.synonyms ?? [])]).filter((n): n is string => !!n).map(n => flat(n).toLowerCase().split(' ').slice(0, 2).join(' ')).filter(n => n.includes(' ')))

/**
 * Whether a photo passes as this page's head: the lead step's test (curation.ts cardWorthy) in the head's frame. Any photo
 * read from a page has its size; photo-check.ts types its photos narrower.
 */
export const passesHead = (v: Verdicts) => (p: { url: string; caption?: string; generated?: unknown }, page: string): boolean =>
  !p.generated && photoFitsHead(p as unknown as Photo) && cardWorthy(p, page, v, {})

type Names = { scientificName?: string; synonyms?: string[]; lNumber?: string }
/**
 * For each page (species, plant or breed, by id; an album shares its page's id), what each photo's source calls its
 * subject there: namedAs with the page's names, and every species' or plant's for a file named as another, each kind its
 * own (a fish's photo may name a plant in its tank).
 */
export async function namedOn(content: string): Promise<(id: string) => (p: NamedPhoto) => Named> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const pages = new Map<string, { kind: string; e: Names }>()
  for (const kind of ['species', 'plants', 'breeds']) {
    for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) {
      const e = JSON.parse(await readFile(join(content, kind, id, 'entity.json'), 'utf8').catch(() => '{}')) as Names
      if (!pages.has(id)) pages.set(id, { kind, e })
    }
  }
  const of = (kind: string) => knownNames([...pages.values()].filter(p => p.kind === kind).map(p => p.e))
  const known = { species: of('species'), plants: of('plants') }
  return id => {
    const p = pages.get(id)
    if (!p?.e.scientificName) return () => SPECIES
    const page = { sci: p.e.scientificName, latin: p.e.synonyms, known: p.kind === 'plants' ? known.plants : known.species, codes: (p.e.lNumber ?? '').split(/\s*[,;]\s*/).filter(Boolean) }
    return photo => namedAs(photo, page)
  }
}
