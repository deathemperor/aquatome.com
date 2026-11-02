import type { Catalog, CatalogEntry, Lang } from './catalog'
import type { Guess } from './claude'

/** A handbook page as a result shows it, in the reader's language (no `url`: that language has no page for it yet). */
export type Linked = { id: string; kind: CatalogEntry['kind']; name: string; sci?: string; url?: string; img?: string }
/**
 * A guess with the handbook's pages for it: `page` the breed its variety names, else the species or plant; `species`
 * the species beside a breed; `sameGenus` (only when nothing matched) pages of its genus, never shown as a match.
 */
export type Result = Guess & { page?: Linked; species?: Linked; sameGenus?: Linked[] }

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

type Index = { full: Map<string, CatalogEntry[]>; binomial: Map<string, CatalogEntry[]>; genus: Map<string, CatalogEntry[]>; breeds: { e: CatalogEntry; root?: string; names: string[] }[] }
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
      ix.breeds.push({ e, root, names: namesOf(e) })
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
  return same.find(e => sciKey(e.sci ?? '').full === k.binomial) ?? same[0]
}

/**
 * The breed a guess names. Breeds of its species come first, matched by the variety anywhere in a name ("halfmoon" in
 * "Cá betta Halfmoon"); a breed with no species of record (hybrids, colour forms) only when the rest of its name is in
 * the guess's own names ("koi" + "angelfish" for "Koi angelfish", never "koi" alone for a koi betta), or its common
 * name is the breed's ("Flowerhorn", "Blood parrot" for "Blood parrot cichlid").
 */
function breedFor(ix: Index, g: Guess, species: CatalogEntry | undefined): CatalogEntry | undefined {
  const v = g.variety ? compact(g.variety) : ''
  const common = compact(g.commonName)
  const own = common + compact(g.scientificName)
  let best: { e: CatalogEntry; rank: number[] } | undefined
  for (const b of ix.breeds) {
    const specific = Boolean(species && b.root === species.id)
    if (!specific && b.root) continue
    for (const n of b.names) {
      let rank: number[] | undefined
      if (common && common === n) rank = [specific ? 1 : 0, 2, common.length, -n.length]
      else if (v && n.includes(v) && (specific ? v.length >= 3 : (rest => rest.length >= 3 && own.includes(rest))(n.replace(v, '')))) rank = [specific ? 1 : 0, 1, v.length, -n.length]
      else if (!specific && common.length >= 6 && n.startsWith(common)) rank = [0, 0, common.length, -n.length]
      if (rank && (!best || compareRank(rank, best.rank) > 0)) best = { e: b.e, rank }
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
    if (page) return { ...g, page: link(page, lang), ...(breed && species ? { species: link(species, lang) } : {}) }
    const genus = (ix.genus.get(sciKey(g.scientificName).genus) ?? []).filter(e => e.kind !== 'breed').slice(0, 3)
    return genus.length ? { ...g, sameGenus: genus.map(e => link(e, lang)) } : { ...g }
  })
}
