import type { Catalog, CatalogEntry, Lang } from './catalog'
import type { Guess } from './claude'

/** A handbook page as a result shows it, in the reader's language (no `url`: that language has no page for it yet). */
export type Linked = { id: string; kind: CatalogEntry['kind']; name: string; sci?: string; url?: string; img?: string }
/**
 * A guess with the handbook's pages for it: `page` the breed its variety names, else the species or plant; `species`
 * the species beside a breed; `sameGenus` the genus's other species and plant pages (no breeds), for "not this one?":
 * a photo often gets the genus right and the species wrong. Never shown as a match.
 */
export type Result = Guess & { page?: Linked; species?: Linked; sameGenus?: Linked[] }
/** A genus's pages a guess lists at most (Betta has 59 on the live site, about 11 KB with their photos). */
export const SAME_GENUS_MAX = 60

const QUALIFIERS = new Set(['cf', 'aff', 'sp', 'spp', 'var', 'subsp', 'ssp', 'x', 'f', 'hybrid'])
/** "Alternanthera reineckii 'Mini'" → full "alternanthera reineckii mini", binomial "alternanthera reineckii", genus. */
export function sciKey(s: string): { full: string; binomial: string; genus: string } {
  const words = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(w => w && !QUALIFIERS.has(w))
  return { full: words.join(' '), binomial: words.slice(0, 2).join(' '), genus: words[0] ?? '' }
}

/** A name to compare: no marks, lowercase, letters and digits, without a leading "cá"/"tép"/"cây". */
export function plain(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^(ca|tep|cay) /, '')
}
const compact = (s: string) => plain(s).replace(/ /g, '')
/** "Cá tai tượng albino (Albino oscar)" → itself, "tai tuong albino", "albino oscar", compacted. */
const namesOf = (e: CatalogEntry) => [...new Set([e.name.vi, ...(e.alt ?? [])].flatMap(n => [n, ...n.split(/[()]/)]).map(compact).filter(Boolean))]

type Index = { full: Map<string, CatalogEntry[]>; binomial: Map<string, CatalogEntry[]>; genus: Map<string, CatalogEntry[]>; breeds: { e: CatalogEntry; root?: string; names: string[]; words: string[][]; whole: string[][] }[] }
const built = new WeakMap<Catalog, Index>()
function indexOf(c: Catalog): Index {
  let ix = built.get(c)
  if (ix) return ix
  ix = { full: new Map(), binomial: new Map(), genus: new Map(), breeds: [] }
  const add = (m: Map<string, CatalogEntry[]>, k: string, e: CatalogEntry) => { if (k) m.set(k, [...(m.get(k) ?? []), e]) }
  const byId = new Map(c.entries.map(e => [e.id, e]))
  for (const e of c.entries) {
    for (const name of [e.sci, ...(e.syn ?? [])]) {
      if (!name) continue
      const k = sciKey(name)
      add(ix.full, k.full, e)
      add(ix.binomial, k.binomial, e)
      if (name === e.sci) add(ix.genus, k.genus, e)
    }
    if (e.kind === 'breed') {
      // What it is a form of, through other breeds, down to a species.
      let root = e.basedOn
      for (let i = 0; root && byId.get(root)?.kind === 'breed' && i < 5; i++) root = byId.get(root)!.basedOn
      const all = [e.name.vi, ...(e.alt ?? [])]
      ix.breeds.push({ e, root, names: namesOf(e), words: [...new Set(all.flatMap(n => [n, ...n.split(/[()]/)]))].map(words).filter(w => w.length), whole: [...new Set([e.name.vi, ...e.name.vi.split(/[()]/), ...(e.alt ?? []).flatMap(n => n.split(/[()]/).filter(p => words(p).length >= 2))])].map(words).filter(w => w.length) })
    }
  }
  built.set(c, ix)
  return ix
}

/** The page a scientific name is: the exact name (a plant's cultivar), else its binomial's page that has no cultivar. */
function pageFor(ix: Index, sci: string): CatalogEntry | undefined {
  const k = sciKey(sci)
  const exact = ix.full.get(k.full)?.[0]
  if (exact) return exact
  const same = ix.binomial.get(k.binomial) ?? []
  const page = same.find(e => sciKey(e.sci ?? '').full === k.binomial) ?? same[0]
  if (page) return page
  // A misspelt or re-gendered epithet ("temminkii" for "temminckii", "-us" for "-a"): the one page of the genus within 2 edits.
  const epithet = k.binomial.split(' ')[1] ?? ''
  if (epithet.length < 5) return undefined
  const close = new Set((ix.genus.get(k.genus) ?? []).filter(e => e.kind !== 'breed' && within(sciKey(e.sci ?? '').binomial.split(' ')[1] ?? '', epithet, 2)))
  return close.size === 1 ? [...close][0] : undefined
}

/** Whether `a` becomes `b` in at most `max` single-letter edits. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = row
  }
  return prev[b.length]! <= max
}

/** A name's words, compared as `plain` compares names. */
const words = (s: string) => plain(s).split(' ').filter(Boolean)
/** One word for another: the same, or one the start of the other, both of 4 letters or more ("tail" for "tailed"). */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a)))
const hasWord = (ws: string[], w: string) => ws.some(x => sameWord(x, w))

/**
 * The breed a guess names.
 * - Breeds of its species: every word of a breed's name that isn't the species' (its scientific name, the guess's common
 *   name) is in the variety. "white platinum halfmoon" is the Halfmoon betta, "Full Red delta tail" the Full Red guppy;
 *   "tiger" is not the "Albino tiger oscar". The breed whose name has most such words wins (HMPK over halfmoon).
 * - A breed with no species of record (hybrids, colour forms, GloFish): the rest of its name is in the guess's own
 *   names ("koi" + "angelfish" for "Koi angelfish", never "koi" alone for a koi betta), its common name is the breed's
 *   ("Flowerhorn", "Blood parrot" for "Blood parrot cichlid"), or all of a full name of it of 5 letters or more is in
 *   the variety and common name, the variety giving some ("GloFish" in "GloFish / long-fin", "Red Tail Golden").
 */
function breedFor(ix: Index, g: Guess, species: CatalogEntry | undefined): CatalogEntry | undefined {
  const v = g.variety ? compact(g.variety) : ''
  const common = compact(g.commonName)
  const own = common + compact(g.scientificName)
  const vw = g.variety ? words(g.variety) : []
  const cw = words(g.commonName)
  // The species' own words: its scientific name, and the common name's words the variety doesn't repeat.
  const plainWords = [...words(g.scientificName), ...cw.filter(w => !hasWord(vw, w)), 'fish']
  let best: { e: CatalogEntry; rank: number[] } | undefined
  const offer = (e: CatalogEntry, rank: number[]) => { if (!best || compareRank(rank, best.rank) > 0) best = { e, rank } }
  for (const b of ix.breeds) {
    const specific = Boolean(species && b.root === species.id)
    if (!specific && b.root) continue
    for (const n of b.names) {
      if (common && common === n) offer(b.e, [specific ? 1 : 0, 2, common.length, -n.length])
      else if (!specific && v && n.includes(v) && (rest => rest.length >= 3 && own.includes(rest))(n.replace(v, ''))) offer(b.e, [0, 1, v.length, -n.length])
      else if (!specific && common.length >= 6 && n.startsWith(common)) offer(b.e, [0, 0, common.length, -n.length])
    }
    if (!vw.length) continue
    if (specific) {
      for (const ws of b.words) {
        const marks = [...new Set(ws.filter(w => !hasWord(plainWords, w)))] // "Cá betta Halfmoon (Halfmoon betta)" counts halfmoon once
        const size = marks.join('').length
        if (size >= 2 && marks.every(w => hasWord(vw, w))) offer(b.e, [1, 1, size, -ws.join('').length])
      }
    } else {
      for (const ws of b.whole) {
        const size = [...new Set(ws)].join('').length
        if (size >= 5 && ws.every(w => hasWord(vw, w) || hasWord(cw, w)) && ws.some(w => hasWord(vw, w))) offer(b.e, [0, 1, size, -size])
      }
    }
  }
  return best?.e
}
const compareRank = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!; return 0 }

const link = (e: CatalogEntry, lang: Lang): Linked => ({ id: e.id, kind: e.kind, name: e.name[lang] ?? e.name.vi, ...(e.sci ? { sci: e.sci } : {}), ...(e.url[lang] ? { url: e.url[lang] } : {}), ...(e.img ? { img: e.img } : {}) })

/** Each guess with the handbook's pages for it, in the reader's language. */
export function matchGuesses(guesses: Guess[], c: Catalog, lang: Lang): Result[] {
  const ix = indexOf(c)
  return guesses.map(g => {
    const species = pageFor(ix, g.scientificName)
    const breed = breedFor(ix, g, species)
    const page = breed ?? species
    // The genus of the page it matched (a synonym or a renamed genus finds the page's own), else of Claude's name.
    const genus = (ix.genus.get(sciKey(species?.sci ?? page?.sci ?? g.scientificName).genus) ?? []).filter(e => e.kind !== 'breed' && e !== page && e !== species).slice(0, SAME_GENUS_MAX)
    return {
      ...g,
      ...(page ? { page: link(page, lang) } : {}),
      ...(breed && species ? { species: link(species, lang) } : {}),
      ...(genus.length ? { sameGenus: genus.map(e => link(e, lang)) } : {}),
    }
  })
}
