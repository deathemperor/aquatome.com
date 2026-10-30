import { expect, test } from 'vitest'
import { binomials, POPULAR, resolveWanted, wantedFirst, wantedIn, withPopular } from '../src/wanted'

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

test('the popular list names real binomials, no repeats', () => {
  expect(POPULAR.every(n => /^[A-Z][a-z]+ [a-z]+$/.test(n))).toBe(true)
  expect(new Set(POPULAR).size).toBe(POPULAR.length)
})
