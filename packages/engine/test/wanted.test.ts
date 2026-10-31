import { expect, test } from 'vitest'
import { acceptedNames, addSourceNames, binomials, POPULAR, resolveWanted, wantedFirst, wantedIn, withPopular, type Wanted } from '../src/wanted'

const english = new Set(['max', 'size', 'standard', 'length', 'appear', 'basin', 'clade', 'the', 'fish'])
const isWord = (w: string) => english.has(w)

test('binomials: scientific-looking pairs only, not English words, families or inflections', () => {
  const html = '<p>Max size 12 cm. Synodontis lucipinnis and <em>Colisa lalia</em>; Botia appears in Geophaginae contained basins; Anubias spp; The fish.</p>'
  expect(binomials(html, isWord)).toEqual(['Synodontis lucipinnis', 'Colisa lalia'])
})

test('resolveWanted: GBIF-exact species we lack, synonyms under the accepted name, a lookup budget for new names', async () => {
  const gbif = async (n: string) => ({
    'Synodontis lucipinnis': { canonicalName: 'Synodontis lucipinnis', matchType: 'EXACT' },
    'Colisa lalia': { canonicalName: 'Trichogaster lalius', matchType: 'EXACT' },
    'Betta splendens': { canonicalName: 'Betta splendens', matchType: 'EXACT' },
    'Satanoperca clade': { canonicalName: 'Satanoperca', matchType: 'HIGHERRANK' },
  } as Record<string, { canonicalName: string; matchType: string }>)[n] ?? null
  const cands = new Map([['Synodontis lucipinnis', ['guides/a', 'guides/b']], ['Colisa lalia', ['species/x']], ['Betta splendens', ['guides/a']], ['Satanoperca clade', ['guides/c']]])
  const w = await resolveWanted(cands, new Set(['betta-splendens']), gbif, () => false)
  expect([...w.keys()]).toEqual(['synodontis-lucipinnis', 'trichogaster-lalius'])
  expect(w.get('trichogaster-lalius')).toEqual({ name: 'Trichogaster lalius', names: ['trichogaster-lalius', 'colisa-lalia'], mentionedIn: ['species/x'] })
  expect((await resolveWanted(cands, new Set(), gbif, () => false, 1)).size).toBe(1) // most-mentioned name looked up first
})

test('source addresses name the species: Seriously Fish and Glaser styles, synonyms too; wanted pages go first', () => {
  const w = new Map([['synodontis-lucipinnis', { name: 'Synodontis lucipinnis', names: ['synodontis-lucipinnis'], mentionedIn: [] }], ['trichogaster-lalius', { name: 'Trichogaster lalius', names: ['trichogaster-lalius', 'colisa-lalia'], mentionedIn: [] }]])
  expect(wantedIn('https://www.seriouslyfish.com/species/synodontis-lucipinnis/', w)).toBe('synodontis-lucipinnis')
  expect(wantedIn('https://www.aquariumglaser.de/en/02-catfish/synodontis_lucipinnis_en/', w)).toBe('synodontis-lucipinnis')
  expect(wantedIn('https://www.seriouslyfish.com/species/colisa-lalia/', w)).toBe('trichogaster-lalius')
  expect(wantedIn('https://www.seriouslyfish.com/species/synodontis-eupterus/', w)).toBeUndefined()
  const found = [{ url: 'https://x/species/a-b/' }, { url: 'https://x/species/colisa-lalia/' }, { url: 'https://x/species/c-d/' }]
  expect(wantedFirst(found, w).map(f => f.url)).toEqual(['https://x/species/colisa-lalia/', 'https://x/species/a-b/', 'https://x/species/c-d/'])
})

test('popular fish we lack are wanted even unmentioned; wanted pages go popular first, then most-mentioned, then discovery order', () => {
  const w = withPopular(new Map([['a-b', { name: 'A b', names: ['a-b'], mentionedIn: ['guides/x'] }], ['c-d', { name: 'C d', names: ['c-d'], mentionedIn: ['guides/x', 'guides/y'] }]]), new Set(['betta-splendens']), ['Danio rerio', 'Betta splendens', 'Pterophyllum scalare'])
  expect([...w.keys()]).toEqual(['a-b', 'c-d', 'danio-rerio', 'pterophyllum-scalare']) // had betta: not wanted
  const found = ['e-f', 'a-b', 'pterophyllum-scalare', 'c-d', 'danio-rerio'].map(s => ({ url: `https://x/species/${s}/` }))
  expect(wantedFirst(found, w, ['Danio rerio', 'Betta splendens', 'Pterophyllum scalare']).map(f => f.url.split('/')[4])).toEqual(['danio-rerio', 'pterophyllum-scalare', 'c-d', 'a-b', 'e-f'])
})

test('the name anywhere in the address counts, not only at its start', () => {
  const w = new Map([['hyphessobrycon-sweglesi', { name: 'Hyphessobrycon sweglesi', names: ['hyphessobrycon-sweglesi'], mentionedIn: [] }], ['peckoltia-compta', { name: 'Peckoltia compta', names: ['peckoltia-compta'], mentionedIn: [] }]])
  expect(wantedIn('https://www.aquariumglaser.de/en/09-characoids/red_phantom_tetra_hyphessobrycon_sweglesi_en/', w)).toBe('hyphessobrycon-sweglesi')
  expect(wantedIn('https://www.aquariumglaser.de/en/10-catfishes/l134-peckoltia-compta-2/', w)).toBe('peckoltia-compta')
})

test('a wanted species a source keeps under a synonym, another ending, a misspelling or a newer Corydoras genus is found there too; nothing else is', async () => {
  const gbif = async (n: string) => ({
    'Megalamphodus eques': { canonicalName: 'Hyphessobrycon eques', matchType: 'EXACT' }, // a synonym
    'Epalzeorhynchos kalopterum': { canonicalName: 'Epalzeorhynchos kalopterus', matchType: 'FUZZY' }, // another ending
    'Coyrdoras paleatus': { canonicalName: 'Corydoras paleatus', matchType: 'FUZZY' }, // misspelt
    'Nannostomus eques': { canonicalName: 'Nannostomus eques', matchType: 'EXACT' }, // another fish, same epithet
    'Neolebias trilineatus': { canonicalName: 'Neolebias trilineatus', matchType: 'EXACT' },
  } as Record<string, { canonicalName: string; matchType: string }>)[n] ?? null // Hoplisoma: GBIF knows only the genus
  const w: Wanted = new Map(['Hyphessobrycon eques', 'Epalzeorhynchos kalopterus', 'Corydoras paleatus', 'Corydoras trilineatus', 'Corydoras adolfoi'].map(n => [n.toLowerCase().replace(' ', '-'), { name: n, names: [n.toLowerCase().replace(' ', '-')], mentionedIn: [] }]))
  const urls = ['megalamphodus-eques', 'nannostomus-eques', 'epalzeorhynchos-kalopterum', 'neolebias-trilineatus', 'hoplisoma-trilineatum', 'synodontis-adolfoi'].map(s => `https://www.seriouslyfish.com/species/${s}`)
  await addSourceNames([...urls, 'https://www.aquariumglaser.de/en/10-catfishes/coyrdoras-paleatus-wild-2/'], w, gbif, () => false)
  expect(Object.fromEntries([...w].map(([k, v]) => [k, v.names.slice(1)]))).toEqual({
    'hyphessobrycon-eques': ['megalamphodus-eques'], 'epalzeorhynchos-kalopterus': ['epalzeorhynchos-kalopterum'], 'corydoras-paleatus': ['coyrdoras-paleatus'],
    'corydoras-trilineatus': ['hoplisoma-trilineatum'], 'corydoras-adolfoi': [], // Synodontis is no Corydoras genus
  })
  expect(wantedIn(urls[0]!, w)).toBe('hyphessobrycon-eques')
  // New names are looked up only within the budget.
  const fresh: Wanted = new Map([['hyphessobrycon-eques', { name: 'Hyphessobrycon eques', names: ['hyphessobrycon-eques'], mentionedIn: [] }]])
  await addSourceNames(urls, fresh, gbif, () => false, 0)
  expect(fresh.get('hyphessobrycon-eques')!.names).toEqual(['hyphessobrycon-eques'])
})

test('shop names under the name GBIF accepts, as pages are kept; a name GBIF cannot place stays', async () => {
  const gbif = async (n: string) => ({
    'Chindongo demasoni': { canonicalName: 'Pseudotropheus demasoni', matchType: 'EXACT' },
    'Barbonymus schwanenfeldii': { canonicalName: 'Barbonymus schwanefeldii', matchType: 'FUZZY' },
    'Danio rerio': { canonicalName: 'Danio rerio', matchType: 'EXACT' },
  } as Record<string, { canonicalName: string; matchType: string }>)[n] ?? null
  const names = await acceptedNames(['Chindongo demasoni', 'Barbonymus schwanenfeldii', 'Hoplisoma sterbai', 'Danio rerio', 'Pseudotropheus demasoni'], gbif)
  expect(names).toEqual(['Pseudotropheus demasoni', 'Barbonymus schwanefeldii', 'Hoplisoma sterbai', 'Danio rerio'])
  // A shop species we have under the accepted name is not wanted.
  expect([...withPopular(new Map(), new Set(['pseudotropheus-demasoni']), names).keys()]).toEqual(['barbonymus-schwanefeldii', 'hoplisoma-sterbai', 'danio-rerio'])
})

test('the popular list names real binomials, no repeats', () => {
  expect(POPULAR.every(n => /^[A-Z][a-z]+ [a-z]+$/.test(n))).toBe(true)
  expect(new Set(POPULAR).size).toBe(POPULAR.length)
})
