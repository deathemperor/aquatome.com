import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { breedGroup, type AppIndex } from '../src/lib/app-index'
import { LANGS } from '../src/lib/i18n'
import { DIST, page } from './dist'

// The native app searches these files and opens each item's page: every item must lead to a page that was built.
const index = (lang: string): AppIndex => JSON.parse(readFileSync(`${DIST}/app/${lang}.json`, 'utf8'))

test('one index per language, every item a built page of that language', () => {
  for (const lang of LANGS) {
    const ix = index(lang)
    expect(ix.version).toBe(1)
    expect(ix.lang).toBe(lang)
    expect(ix.items.length).toBeGreaterThan(0)
    for (const i of ix.items) {
      expect(i.path, i.name).toMatch(new RegExp(`^/${lang}/.+/$`))
      expect(() => page(i.path), i.path).not.toThrow()
      expect(i.name.trim(), i.path).not.toBe('')
      if (i.img) expect(i.img, i.path).toMatch(/^https:\/\//)
    }
  }
})

test('the Vietnamese index has fish with scientific names, plants, guides, glossary and the tools', () => {
  const items = index('vi').items
  const kinds = new Set(items.map(i => i.kind))
  for (const k of ['fish', 'plant', 'guide', 'glossary', 'tool'] as const) expect(kinds, k).toContain(k)
  expect(items.filter(i => i.kind === 'fish').every(i => i.sub || i.path)).toBe(true)
  expect(items.find(i => i.path === '/vi/cong-cu/den-chihiros/')?.name).toBe('Đèn Chihiros')
})

test('other languages list their own names and addresses', () => {
  const tool = index('id').items.find(i => i.kind === 'tool' && i.path.includes('lampu-chihiros'))
  expect(tool?.name).toBe('Lampu Chihiros')
})

test('fish and plants carry their content id (the page folder), so a saved tank can name them; every index has the tanks page', () => {
  for (const lang of LANGS) {
    for (const i of index(lang).items.filter(x => x.kind === 'fish' || x.kind === 'plant')) expect(i.id, i.path).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  }
  const vi = index('vi').items.find(i => i.id === 'paracheirodon-axelrodi')
  expect(vi?.path).toMatch(/^\/vi\/ca\//)
  expect(index('vi').items.filter(i => i.kind === 'plant').every(i => i.id)).toBe(true)
  expect(index('vi').items.some(i => i.kind === 'plant')).toBe(true)
  for (const [lang, path] of [['vi', '/vi/cong-cu/be-cua-toi/'], ['id', '/id/alat/akuarium-saya/'], ['th', '/th/tools/my-tanks/']]) {
    expect(index(lang!).items.some(i => i.path === path), path).toBe(true)
  }
})

test('a thin page (out of search engines) is still in the app: its translation passed, it is only short', () => {
  expect(page('/vi/ca/ca-ong-tien/').html).toMatch(/noindex/)
  expect(index('vi').items.find(i => i.id === 'pterophyllum-scalare')?.path).toBe('/vi/ca/ca-ong-tien/')
  // A low score still keeps a page out (Cá boraras đỏ: 0.5).
  expect(index('vi').items.some(i => i.id === 'boraras-brigittae')).toBe(false)
})

// The fixture build has fish pages in Vietnamese only (the other languages' indexes hold the tools).
test('fish carry the tank-mates tool\'s figures and behaviour under the tool\'s names; missing ones are left out', () => {
  const vi = index('vi').items
  const cardinal = vi.find(i => i.id === 'paracheirodon-axelrodi')!
  expect(cardinal).toMatchObject({ ph: { min: 4, max: 6 }, gh: { min: 1, max: 6 }, sizeCm: 5, tankCm: 60, difficulty: 3, temperament: 'peaceful', schoolMin: 8 })
  expect(cardinal.tempC).toEqual({ min: expect.any(Number), max: expect.any(Number) })
  expect('finNipper' in cardinal, 'false is left out').toBe(false)
  // No traits file: its figures, no behaviour.
  const discus = vi.find(i => i.id === 'symphysodon-aequifasciatus')!
  expect(discus).toMatchObject({ sizeCm: 15, tankCm: 120, ph: { min: 4.5, max: 6.5 } })
  expect(discus.temperament).toBeUndefined()
  expect(discus.gh).toBeUndefined()
  // Guides, plants and breeds have none.
  for (const i of vi.filter(x => x.kind !== 'fish' || !x.sub)) expect(Object.keys(i).filter(k => ['tempC', 'ph', 'sizeCm', 'temperament'].includes(k)), i.path).toEqual([])
})

test('guides carry their subject and the fish and plants they name, as their pages link them', () => {
  const guides = index('vi').items.filter(i => i.kind === 'guide')
  expect(guides.every(g => typeof g.section === 'string')).toBe(true)
  const first = guides.find(g => g.path === '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')!
  expect(first.section).toBe('setup')
  expect(first.about).toEqual(expect.arrayContaining(['paracheirodon-innesi', 'anubias-barteri-nana']))
  // A fish its text names, with no tag from the engine (entity.json `mentions` is empty): from the page's own links.
  expect(guides.find(g => g.path === '/vi/huong-dan/thay-nuoc-dung-cach/')?.about).toEqual(['paracheirodon-axelrodi'])
  // A video guide names what it shows, even when its text doesn't.
  const video = guides.find(g => g.about?.includes('neocaridina-davidi') && g.section === 'plantCare')
  expect(video, 'the shrimp a plant video shows').toBeDefined()
  // Content ids, as a saved tank lists its fish: one whose page isn't in the app (too thin) still matches a tank that has it.
  for (const g of guides) for (const id of g.about ?? []) expect(id, g.path).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  expect(guides.find(g => g.section === 'discovery')?.about).toContain('boraras-brigittae')
  // Fish and plants have neither.
  expect(index('vi').items.filter(i => i.kind !== 'guide').some(i => 'section' in i || 'about' in i)).toBe(false)
})

test('fish come in the site\'s list order with their group, a breed with its parent\'s; plants with their care', () => {
  const vi = index('vi').items
  const fish = vi.filter(i => i.kind === 'fish')
  // The well-known fish first, in the site's order (STAPLE_SPECIES), as the fish list page has them.
  expect(fish.slice(0, 3).map(i => i.id)).toEqual(['paracheirodon-innesi', 'paracheirodon-axelrodi', 'symphysodon-aequifasciatus'])
  expect(fish.find(i => i.id === 'paracheirodon-axelrodi')?.group).toBe('tetras')
  expect(fish.filter(i => i.sub).every(i => typeof i.group === 'string'), 'every species has its group').toBe(true)
  // A colour form takes the group of the species it's a form of (as its page links it).
  expect(fish.find(i => i.id === 'pigeon-blood-discus')?.group).toBe('cichlids')
  expect(vi.find(i => i.id === 'anubias-barteri-nana')?.plant).toEqual({ difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['foreground', 'epiphyte'] })
  expect(vi.filter(i => i.kind !== 'plant').some(i => 'plant' in i)).toBe(false)
  expect(vi.filter(i => i.kind !== 'fish').some(i => 'group' in i)).toBe(false)
})

test('every index carries the site\'s words for groups, subjects and plant care in its language', () => {
  const vi = index('vi').labels
  expect(vi.group).toMatchObject({ tetras: 'Cá tetra', other: 'Loài khác' })
  expect(vi.section.plantCare).toBe('Chăm cây')
  expect(vi.placement.epiphyte).toBe('Bám đá, lũa')
  expect(vi.difficulty).toEqual({ 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' })
  expect(index('id').labels.group.tetras).toBe('Ikan tetra')
  // Every key an item carries has its word.
  for (const lang of LANGS) {
    const { items, labels } = index(lang)
    for (const i of items) {
      if (i.group) expect(labels.group[i.group], i.path).toBeDefined()
      if (i.section) expect(labels.section[i.section], i.path).toBeDefined()
      for (const p of i.plant?.placement ?? []) expect(labels.placement[p], i.path).toBeDefined()
    }
  }
})

test('the home picks are the site home\'s, of what the index lists: groups with a photo, then fish, easy plants and the beginner guides', () => {
  const { items, home } = index('vi')
  const byPath = new Map(items.map(i => [i.path, i]))
  // Biggest group first, as on the site's home; one the index lists nothing of (Rasbora: a page below the bar) isn't there.
  expect(home.groups.map(g => g.id)).toEqual(['cichlids', 'tetras', 'danios', 'shrimp'])
  for (const g of home.groups) expect(g.img, g.id).toMatch(/^https:\/\//)
  expect(home.fish[0]).toBe('/vi/ca/ca-neon-xanh/')
  expect(home.fish.every(p => byPath.get(p)?.kind === 'fish')).toBe(true)
  // Neither strong light nor CO2 needed; one with no photo is left out.
  expect(home.plants.map(p => byPath.get(p)?.id)).toEqual(['cryptocoryne-wendtii', 'anubias-barteri-nana', 'micranthemum-monte-carlo'])
  expect(home.guides[0]).toBe('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
  expect(home.guides.every(p => byPath.get(p)?.kind === 'guide')).toBe(true)
  // The fixture lists no fish or plants in Indonesian: no picks for them.
  expect(index('id').home).toMatchObject({ groups: [], fish: [], plants: [] })
})

test('a breed\'s group: what it\'s a form of first (a species, or a breed in turn), else a parent species', () => {
  const groups = new Map([['betta-splendens', 'labyrinth'], ['symphysodon-aequifasciatus', 'cichlids'], ['carassius-auratus', 'other']])
  const breeds = [{ id: 'halfmoon-betta', basedOn: 'betta-splendens', parents: [] }, { id: 'loop-a', basedOn: 'loop-b', parents: [] }, { id: 'loop-b', basedOn: 'loop-a', parents: [] }]
  expect(breedGroup({ basedOn: 'halfmoon-betta', parents: [] }, groups, breeds)).toBe('labyrinth')
  expect(breedGroup({ parents: [{ name: 'Amphilophus trimaculatus', certain: true }, { name: 'Cá đĩa', species: 'symphysodon-aequifasciatus', certain: false }] }, groups, breeds)).toBe('cichlids')
  expect(breedGroup({ basedOn: 'unknown', parents: [{ name: 'x', species: 'carassius-auratus', certain: true }] }, groups, breeds)).toBe('other')
  expect(breedGroup({ basedOn: 'loop-a', parents: [] }, groups, breeds), 'a loop ends').toBeUndefined()
})
