import { expect, test } from 'vitest'
import { buildCatalog, type Catalog, type CatalogEntry } from '../fishid/catalog'
import type { Guess } from '../fishid/claude'
import { matchGuesses, plain, sciKey } from '../fishid/match'
import { readAnswer } from '../fishid/claude'

const species = (id: string, sci: string, vi: string): CatalogEntry => ({ id, kind: 'species', sci, name: { vi }, url: { vi: `/vi/ca/${id}/` } })
const breed = (id: string, vi: string, alt: string[], basedOn?: string): CatalogEntry => ({ id, kind: 'breed', name: { vi }, alt, url: { vi: `/vi/ca/${id}/` }, ...(basedOn ? { basedOn } : {}) })
const CATALOG: Catalog = {
  version: 1,
  entries: ([
    species('betta-splendens', 'Betta splendens', 'Cá betta'),
    species('pterophyllum-scalare', 'Pterophyllum scalare', 'Cá thần tiên'),
    species('poecilia-reticulata', 'Poecilia reticulata', 'Cá bảy màu'),
    species('amphilophus-citrinellus', 'Amphilophus citrinellus', 'Cá hồng két Midas'),
    species('xiphophorus-maculatus', 'Xiphophorus maculatus', 'Cá hà lan'),
    breed('halfmoon-betta', 'Cá betta Halfmoon (Halfmoon betta)', ['Betta HM', 'Half moon betta', 'HM betta']),
    breed('plakat-betta', 'Cá Betta Plakat (Plakat betta)', ['Halfmoon plakat (HMPK)', 'HMPK', 'Cá xiêm']),
    breed('koi-betta', 'Betta Koi (Koi betta)', ['Cá betta koi', 'Koi Galaxy']),
    breed('koi-guppy', 'Bảy màu Koi (Koi guppy)', ['Guppy Koi', 'Kohaku guppy']),
    breed('koi', 'Cá Koi (Nishikigoi)', ['Koi Nhật', 'Japanese koi']),
    breed('koi-angelfish', 'Cá thần tiên Koi (Koi angelfish)', ['Cá ông tiên Koi']),
    breed('platinum-angelfish', 'Cá thần tiên platinum (Platinum angelfish)', ['White angel']),
    breed('flowerhorn-cichlid', 'Cá La Hán (Flowerhorn)', ['Flowerhorn cichlid', 'Luohan']),
    breed('blood-parrot-cichlid', 'Cá hồng két (Blood parrot cichlid)', ['Cá két đỏ', 'Bloody parrot']),
    breed('mickey-mouse-platy', 'Cá mỏ vịt Chuột Mickey (Mickey Mouse platy)', ['Mickey platy', 'Moon platy']),
    { id: 'alternanthera-reineckii', kind: 'plant', sci: 'Alternanthera reineckii', name: { vi: 'Rau dừa đỏ' }, url: { vi: '/vi/cay/rau-dua-do/' } },
    { id: 'alternanthera-reineckii-mini', kind: 'plant', sci: "Alternanthera reineckii 'Mini'", name: { vi: 'Rau dừa đỏ mini' }, url: { vi: '/vi/cay/rau-dua-do-mini/' } },
    { id: 'aegagropila-linnaei', kind: 'plant', sci: 'Aegagropila linnaei', syn: ['Cladophora aegagropila'], name: { vi: 'Rong cầu' }, url: { vi: '/vi/cay/rong-cau/' } },
  ] as CatalogEntry[]).map(e => e.id.endsWith('-betta') ? { ...e, basedOn: 'betta-splendens' } : e.id === 'koi-guppy' ? { ...e, basedOn: 'poecilia-reticulata' } : e),
}
const g = (scientificName: string, commonName: string, variety: string | null = null): Guess => ({ scientificName, commonName, variety, confidence: 0.8, reason: '' })
const pageOf = (guess: Guess) => matchGuesses([guess], CATALOG, 'vi')[0]!.page?.id

test('names compared without marks, case or a leading "cá"; scientific names without qualifiers or punctuation', () => {
  expect(plain('Cá Thần Tiên (Koi)')).toBe('than tien koi')
  expect(plain('Tép ong đỏ')).toBe('ong do')
  expect(sciKey("Alternanthera reineckii 'Mini'")).toEqual({ full: 'alternanthera reineckii mini', binomial: 'alternanthera reineckii', genus: 'alternanthera' })
  expect(sciKey('Corydoras cf. paleatus')).toMatchObject({ binomial: 'corydoras paleatus' })
  expect(sciKey('Amphilophus hybrid')).toEqual({ full: 'amphilophus', binomial: 'amphilophus', genus: 'amphilophus' })
})

test('species by scientific name, a subspecies or "cf." included; plants by cultivar, else the plain plant, and by a former name', () => {
  expect(pageOf(g('Betta splendens', 'Siamese fighting fish'))).toBe('betta-splendens')
  expect(pageOf(g('Betta splendens splendens', 'Siamese fighting fish'))).toBe('betta-splendens')
  expect(pageOf(g('Pterophyllum cf. scalare', 'Angelfish'))).toBe('pterophyllum-scalare')
  expect(pageOf(g("Alternanthera reineckii 'Mini'", 'Dwarf Alternanthera'))).toBe('alternanthera-reineckii-mini')
  expect(pageOf(g('Alternanthera reineckii', 'Scarlet temple'))).toBe('alternanthera-reineckii')
  expect(pageOf(g('Alternanthera reineckii var. roseafolia', 'Scarlet temple'))).toBe('alternanthera-reineckii')
  expect(pageOf(g('Cladophora aegagropila', 'Marimo'))).toBe('aegagropila-linnaei')
})

test('a variety names its species\' breed, the species alongside; the closest name wins', () => {
  const [r] = matchGuesses([g('Betta splendens', 'Siamese fighting fish', 'Halfmoon')], CATALOG, 'vi')
  expect(r!.page!.id).toBe('halfmoon-betta')
  expect(r!.species!.id).toBe('betta-splendens')
  expect(pageOf(g('Betta splendens', 'Siamese fighting fish', 'half-moon plakat'))).toBe('plakat-betta')
  expect(pageOf(g('Betta splendens', 'Betta', 'HMPK'))).toBe('plakat-betta')
  // A breed named in the common name, with no variety given.
  expect(pageOf(g('Betta splendens', 'Halfmoon betta'))).toBe('halfmoon-betta')
  // No variety, or one the handbook has no breed for: the species.
  expect(pageOf(g('Betta splendens', 'Siamese fighting fish'))).toBe('betta-splendens')
  expect(pageOf(g('Betta splendens', 'Siamese fighting fish', 'Red'))).toBe('betta-splendens')
})

test('"koi" names the koi of its own species, never the koi carp or another fish\'s koi', () => {
  expect(pageOf(g('Betta splendens', 'Siamese fighting fish', 'Koi'))).toBe('koi-betta')
  expect(pageOf(g('Poecilia reticulata', 'Guppy', 'Koi'))).toBe('koi-guppy')
  expect(pageOf(g('Pterophyllum scalare', 'Freshwater angelfish', 'Koi'))).toBe('koi-angelfish')
  expect(pageOf(g('Cyprinus rubrofuscus', 'Koi'))).toBe('koi')
  // A breed with no species of record matches only when the rest of its name is the guess's: not a platinum betta.
  expect(pageOf(g('Betta splendens', 'Siamese fighting fish', 'Platinum'))).toBe('betta-splendens')
  expect(pageOf(g('Pterophyllum scalare', 'Angelfish', 'Platinum'))).toBe('platinum-angelfish')
  expect(pageOf(g('Xiphophorus maculatus', 'Southern platyfish', 'Mickey Mouse'))).toBe('mickey-mouse-platy')
})

test('hybrids by their trade name; a plain common name is never taken for a breed', () => {
  const [flower] = matchGuesses([g('Amphilophus hybrid', 'Flowerhorn')], CATALOG, 'vi')
  expect(flower!.page!.id).toBe('flowerhorn-cichlid')
  expect(flower!.species).toBeUndefined()
  expect(flower!.sameGenus).toBeUndefined()
  expect(pageOf(g('Amphilophus hybrid', 'Blood parrot'))).toBe('blood-parrot-cichlid')
  expect(pageOf(g('Pterophyllum scalare', 'Angelfish'))).toBe('pterophyllum-scalare')
})

test('no page: the same genus\'s pages, apart; nothing at all for an unknown genus', () => {
  const [r] = matchGuesses([g('Amphilophus labiatus', 'Red devil')], CATALOG, 'vi')
  expect(r!.page).toBeUndefined()
  expect(r!.sameGenus!.map(x => x.id)).toEqual(['amphilophus-citrinellus'])
  const [none] = matchGuesses([g('Trichogaster lalius', 'Dwarf gourami')], CATALOG, 'vi')
  expect(none).toEqual(g('Trichogaster lalius', 'Dwarf gourami'))
})

test('the catalog: every species, breed and plant page with its address and name in each language that has it', () => {
  const photo = { url: 'https://media.aquatome.com/x.webp' }
  const page = (id: string, slug: string, name: string, extra: object = {}) => ({ id, photos: [photo], t: { name, altNames: ['Other'], slug }, ...extra })
  const vi = { species: [page('betta-splendens', 'ca-betta', 'Cá betta', { scientificName: 'Betta splendens' })], breeds: [page('halfmoon-betta', 'ca-betta-halfmoon', 'Halfmoon', { basedOn: 'betta-splendens' })], plants: [page('rong', 'rong-cau', 'Rong cầu', { scientificName: 'Aegagropila linnaei', synonyms: ['Cladophora aegagropila'] })] }
  const th = { species: [page('betta-splendens', 'betta', 'ปลากัด', { scientificName: 'Betta splendens' })], breeds: [], plants: [] }
  const c = buildCatalog([
    { lang: 'vi', pages: vi, at: p => p },
    { lang: 'th', pages: th, at: p => p.replace('/vi/ca/', '/th/fish/') },
  ], p => `${p.url}?480`)
  expect(c.entries).toEqual([
    { id: 'betta-splendens', kind: 'species', sci: 'Betta splendens', name: { vi: 'Cá betta', th: 'ปลากัด' }, url: { vi: '/vi/ca/ca-betta/', th: '/th/fish/betta/' }, img: 'https://media.aquatome.com/x.webp?480' },
    { id: 'halfmoon-betta', kind: 'breed', basedOn: 'betta-splendens', alt: ['Other'], name: { vi: 'Halfmoon' }, url: { vi: '/vi/ca/ca-betta-halfmoon/' }, img: 'https://media.aquatome.com/x.webp?480' },
    { id: 'rong', kind: 'plant', sci: 'Aegagropila linnaei', syn: ['Cladophora aegagropila'], name: { vi: 'Rong cầu' }, url: { vi: '/vi/cay/rong-cau/' }, img: 'https://media.aquatome.com/x.webp?480' },
  ])
})

test('Claude\'s answer read with the limits the schema can\'t state: 3 guesses at most, most likely first, confidence within 0–1', () => {
  const msg = (text: string, stop: 'end_turn' | 'max_tokens' | 'refusal' = 'end_turn') => ({ content: [{ type: 'text' as const, text, citations: null }], stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } }) as unknown as Parameters<typeof readAnswer>[0]
  const guesses = [0.2, 1.7, -1, 0.5].map((c, i) => ({ scientificName: `Genus s${i}`, commonName: 'x', variety: '', confidence: c, reason: 'r' }))
  const a = readAnswer(msg(JSON.stringify({ verdict: 'fish', guesses })))
  expect(a.refused).toBe(false)
  if (a.refused) return
  expect(a.id.guesses.map(x => [x.scientificName, x.confidence, x.variety])).toEqual([['Genus s1', 1, null], ['Genus s3', 0.5, null], ['Genus s0', 0.2, null]])
  expect(readAnswer(msg('no', 'refusal'))).toEqual({ refused: true, usage: { input: 10, output: 5 } })
  expect(() => readAnswer(msg('{"verdict":"fi', 'max_tokens'))).toThrow()
  expect(() => readAnswer(msg('{"verdict":"maybe","guesses":[]}'))).toThrow()
})
