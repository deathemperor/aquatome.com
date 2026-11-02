import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { pageShard, PageShard } from '@aq/schema/app-page'
import { isVietnamese } from '@aq/schema/text'
import { appIndex, appPlants, appSpecies, breedGroup, type AppIndex, type AppItem } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'
import { LANGS, localizePath } from '../src/lib/i18n'
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

/** The species a built list page shows (the cards of PagedSpecies and SpeciesGrid), by slug, in its order. */
const listed = (path: string) => page(path).dom.querySelectorAll('[data-slug]').map(e => e.getAttribute('data-slug')!).filter(Boolean)
const slugOf = (i: AppItem) => i.path.split('/').at(-2)!

test('the index lists every fish and plant the site\'s lists show, a page out of search engines too, each with its copy in a shard', () => {
  for (const lang of LANGS) {
    const { items } = index(lang)
    const data = (kind: string): { slug: string }[] => (existsSync(`${DIST}/data/${lang}/${kind}.json`) ? JSON.parse(readFileSync(`${DIST}/data/${lang}/${kind}.json`, 'utf8')) : [])
    // The fish list's species and the plant list's plants, in the lists' order (their data files hold every one).
    expect(items.filter(i => i.kind === 'fish' && i.sub).map(slugOf), lang).toEqual(data('species').map(s => s.slug))
    expect(items.filter(i => i.kind === 'plant').map(slugOf), lang).toEqual(data('plants').map(p => p.slug))
  }
  // The breeds above the fish list.
  const vi = index('vi').items
  expect(vi.filter(i => i.kind === 'fish' && !i.sub).map(i => i.path).sort()).toEqual(page('/vi/ca/').dom.querySelectorAll('section.breeds li a').map(a => a.getAttribute('href')).sort())
  // A thin page (its translation passed, it is only short), a translation that scored low (Cá boraras đỏ: 0.61) and a
  // breed's that did (Cá la hán: 0.6) are out of search engines, not off the site's lists, nor the app's.
  const shards = index('vi').shards!
  for (const [id, path] of [['pterophyllum-scalare', '/vi/ca/ca-ong-tien/'], ['boraras-brigittae', '/vi/ca/ca-boraras-do/'], ['flowerhorn-cichlid', '/vi/ca/ca-la-han/']]) {
    expect(page(path!).html, path).toMatch(/noindex/)
    expect(vi.find(i => i.id === id)?.path).toBe(path)
  }
  // A species' copy is in the shard its path names (breeds have no copy yet).
  const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/vi/fish-${pageShard('/vi/ca/ca-boraras-do/', shards.fish!.n)}.json`, 'utf8')))
  expect(shard.pages['/vi/ca/ca-boraras-do/']).toMatchObject({ kind: 'fish', path: '/vi/ca/ca-boraras-do/' })
})

test('a plant or a species whose translation scored low is still listed, as the site\'s lists show it', async () => {
  const c = await getContent('vi')
  const low = { indexable: false, score: 0.2, reason: 'low' as const }
  const off = { ...c, species: c.species.map((s, n) => (n ? s : { ...s, t: { ...s.t, quality: { ...s.t.quality, ...low } } })), plants: c.plants.map((p, n) => (n ? p : { ...p, t: { ...p.t, quality: { ...p.t.quality, ...low } } })) } as Content
  expect(appSpecies('vi', off)).toHaveLength(c.species.length)
  expect(appPlants('vi', off)).toEqual(off.plants)
  const paths = appIndex('vi', off).items.map(i => i.path)
  expect(paths).toContain(`/vi/ca/${c.species[0]!.t.slug}/`)
  expect(paths).toContain(`/vi/cay/${c.plants[0]!.t.slug}/`)
})

/** A page's line, its placeholders filled as t() fills them. */
const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
const RANK_KEYS = ['order', 'family', 'genus'] as const

test('a species\' taxa are the taxon pages that list it: each page lists the species whose tax leads to it, with its rank\'s words', () => {
  const { items, labels } = index('vi')
  const species = items.filter(i => i.kind === 'fish' && i.sub)
  expect(species.find(i => i.id === 'paracheirodon-axelrodi')?.tax).toEqual(['Characiformes', 'Characidae', 'Paracheirodon'])
  // Each level's path: the names lowercased and joined with "/", as the taxon pages are addressed.
  const under = (i: AppItem, depth: number) => i.tax!.slice(0, depth).map(x => x.toLowerCase()).join('/')
  const taxa = new Set(species.flatMap(i => [1, 2, 3].map(d => under(i, d))))
  // The pages built are the taxonomy index and those the species lead to, no other.
  const built = (readdirSync(`${DIST}/vi/phan-loai`, { recursive: true }) as string[]).filter(f => f.endsWith('index.html')).map(f => f.replace(/\/?index\.html$/, ''))
  expect(built.sort()).toEqual(['', ...taxa].sort())
  expect(page('/vi/phan-loai/').dom.querySelector('h1')?.text.trim()).toBe(labels.taxon.title)
  for (const k of taxa) {
    const depth = k.split('/').length
    const on = species.filter(i => under(i, depth) === k)
    const { dom } = page(`/vi/phan-loai/${k}/`)
    // The same species in the same order: the fish list's.
    expect(listed(`/vi/phan-loai/${k}/`), k).toEqual(on.map(slugOf))
    const name = on[0]!.tax![depth - 1]!
    expect(dom.querySelector('h1')?.text.trim(), k).toBe(name)
    expect(dom.querySelector('p.intro')?.text.trim(), k).toBe(fill(labels.taxon.intro!, { level: labels.taxon[RANK_KEYS[depth - 1]]!, name, n: on.length }))
  }
})

test('a species\' places are the origin pages that list it: only places with a page, and each page lists those that name it', () => {
  const { items, places, labels } = index('vi')
  const species = items.filter(i => i.kind === 'fish' && i.sub)
  // Rio Negro is a river: named on Brazil's page, with no page of its own.
  expect(species.find(i => i.id === 'paracheirodon-axelrodi')?.from).toEqual(['south-america', 'brazil'])
  // Breeds have neither: taxon and origin pages list species only.
  const breed = items.find(i => i.id === 'pigeon-blood-discus')!
  expect('tax' in breed || 'from' in breed).toBe(false)
  for (const i of items.filter(x => x.kind !== 'fish' || !x.sub)) expect(Object.keys(i).filter(k => k === 'tax' || k === 'from'), i.path).toEqual([])
  const pathOf = (id: string) => { const p = places.find(x => x.id === id)!; return p.parent ? `/vi/nguon-goc/${p.parent}/${id}/` : `/vi/nguon-goc/${id}/` }
  // The pages built are the origin index and one for each place, no other.
  const built = (readdirSync(`${DIST}/vi/nguon-goc`, { recursive: true }) as string[]).filter(f => f.endsWith('index.html')).map(f => `/vi/nguon-goc/${f.replace(/index\.html$/, '')}`)
  expect(built.sort()).toEqual(['/vi/nguon-goc/', ...places.map(p => pathOf(p.id))].sort())
  for (const i of species) for (const id of i.from ?? []) expect(places.some(p => p.id === id), `${i.id}: ${id}`).toBe(true)
  for (const p of places) {
    const on = species.filter(i => i.from?.includes(p.id))
    const { dom } = page(pathOf(p.id))
    expect(listed(pathOf(p.id)), p.id).toEqual(on.map(slugOf))
    const name = labels.placeTitle[p.id] ?? p.name
    expect(dom.querySelector('h1')?.text.trim(), p.id).toBe(name)
    expect(dom.querySelector('p.intro')?.text.trim(), p.id).toBe(labels.placeIntro[p.id] ?? fill(labels.origin.intro!, { n: on.length, place: p.name }))
  }
})

test('places are the origin pages\' places, in their order: continents, each country under its continent with its regions and rivers', () => {
  const { places, labels } = index('vi')
  expect(places.filter(p => p.kind === 'continent').map(p => p.id)).toEqual(['asia', 'south-america'])
  expect(places.find(p => p.id === 'brazil')).toEqual({ id: 'brazil', name: 'Brazil', kind: 'country', parent: 'south-america', kids: ['Rio Negro'] })
  expect(places.find(p => p.id === 'asia')).toEqual({ id: 'asia', name: 'Châu Á', kind: 'continent' })
  // Rio Negro is a river: on Brazil's page, not a place of the index's own.
  expect(places.some(p => p.id === 'rio-negro')).toBe(false)
  const kids = (path: string) => page(path).dom.querySelectorAll('ul.kids li').map(li => li.text.trim())
  const { dom } = page('/vi/nguon-goc/')
  expect(dom.querySelector('h1')?.text.trim()).toBe(labels.origin.title)
  expect(kids('/vi/nguon-goc/')).toEqual(places.filter(p => p.kind === 'continent').map(p => p.name))
  for (const p of places) {
    if (p.kind === 'continent') expect(kids(`/vi/nguon-goc/${p.id}/`), p.id).toEqual(places.filter(x => x.parent === p.id).map(x => x.name))
    else expect(kids(`/vi/nguon-goc/${p.parent}/${p.id}/`), p.id).toEqual(p.kids ?? [])
  }
  expect(labels.placeTitle.vietnam).toBe('Cá Việt Nam')
  expect(page('/vi/nguon-goc/asia/vietnam/').dom.querySelector('p.intro')?.text.trim()).toBe(labels.placeIntro.vietnam)
})

test('an id a species names with no place, or a place with no page of its own, is in no `from`', async () => {
  const c = await getContent('vi')
  const off = { ...c, species: c.species.map(s => (s.id === 'paracheirodon-axelrodi' ? { ...s, places: ['atlantis', 'rio-negro', 'south-america', 'brazil', 'brazil'] } : s)) } as Content
  expect(appIndex('vi', off).items.find(i => i.id === 'paracheirodon-axelrodi')?.from).toEqual(['south-america', 'brazil'])
})

test('the taxon and origin pages\' words are in every language\'s labels, as its pages say them, placeholders kept', () => {
  expect(index('id').labels).toMatchObject({
    taxon: { title: 'Klasifikasi', order: 'Ordo', family: 'Famili', genus: 'Genus', intro: '{level} {name}: {n} spesies.' },
    origin: { title: 'Asal', intro: '{n} spesies berasal dari {place}.' },
    placeTitle: { vietnam: 'Ikan Vietnam' },
  })
  expect(index('th').labels.taxon).toMatchObject({ title: 'อนุกรมวิธาน', order: 'อันดับ', family: 'วงศ์', genus: 'สกุล' })
  const marks = (s: string) => [...s.matchAll(/\{\w+\}/g)].map(m => m[0]).sort()
  for (const lang of LANGS) {
    const { labels } = index(lang)
    // Each section's index page, built in every language, has the section's title as its heading.
    expect(page(localizePath(lang, '/vi/phan-loai/')).dom.querySelector('h1')?.text.trim(), lang).toBe(labels.taxon.title)
    expect(page(localizePath(lang, '/vi/nguon-goc/')).dom.querySelector('h1')?.text.trim(), lang).toBe(labels.origin.title)
    expect(marks(labels.taxon.intro!), lang).toEqual(['{level}', '{name}', '{n}'])
    expect(marks(labels.origin.intro!), lang).toEqual(['{n}', '{place}'])
    expect(Object.keys(labels.placeTitle), lang).toEqual(['vietnam'])
    expect(Object.keys(labels.placeIntro), lang).toEqual(['vietnam'])
    if (lang === 'vi') continue
    for (const words of [labels.taxon, labels.origin, labels.placeTitle, labels.placeIntro]) for (const w of Object.values(words)) expect(isVietnamese(w), `${lang}: ${w}`).toBe(false)
  }
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
  // Content ids, as a saved tank lists its fish.
  for (const g of guides) for (const id of g.about ?? []) expect(id, g.path).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  expect(guides.some(g => g.section === 'discovery' && g.about?.includes('boraras-brigittae'))).toBe(true)
  // Fish and plants have neither.
  expect(index('vi').items.filter(i => i.kind !== 'guide').some(i => 'section' in i || 'about' in i)).toBe(false)
})

test('a video series is an item (Vietnamese only, as its page is), and a video guide carries its length', () => {
  const series = index('vi').items.filter(i => i.kind === 'video')
  // The empty playlist has no guides, so it isn't listed.
  expect(series.map(i => i.path)).toEqual(['/vi/video/reu-hai-tu-a-den-z/'])
  expect(series[0]).toMatchObject({ name: 'Rêu hại từ A đến Z', sub: 'MJ Aquascaping', parts: 1 })
  expect(series[0]!.img).toMatch(/^https:\/\//)
  for (const lang of ['id', 'th']) expect(index(lang).items.some(i => i.kind === 'video'), lang).toBe(false)
  const guides = index('vi').items.filter(i => i.kind === 'guide')
  expect(guides.find(g => g.path === '/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')?.video).toBe(1755)
  expect(guides.find(g => g.path === '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')).not.toHaveProperty('video')
  expect(index('vi').items.filter(i => i.kind !== 'guide').some(i => 'video' in i)).toBe(false)
})

test('a series none of whose guides is in the index isn\'t listed (its page is out of search engines); the biggest series first', async () => {
  // The repository's content (the built site above is the fixture's): a series the index lists, its guides then left out.
  const c = await getContent('vi')
  const listed = appIndex('vi', c).items.filter(i => i.kind === 'video')
  const s = c.series.find(x => listed.some(i => i.path === `/vi/video/${x.vi.slug}/`))
  expect(s, 'a series in the index').toBeDefined()
  const thin = { ...c, guides: c.guides.map(g => (g.video?.series?.id === s!.id ? { ...g, t: { ...g.t, quality: { ...g.t.quality, indexable: false } } } : g)) }
  const after = appIndex('vi', thin).items.filter(i => i.kind === 'video')
  expect(after.map(i => i.path)).toEqual(listed.map(i => i.path).filter(p => p !== `/vi/video/${s!.vi.slug}/`))
  // As /vi/video/ lists them.
  const parts = listed.map(i => i.parts!)
  expect(parts).toEqual([...parts].sort((a, b) => b - a))
}, 60_000) // reading the content and two indexes of it: seconds, more beside the other tests

test('a tool carries its page\'s own title, the line under its heading and its description, all of them, so a search finds it by them', () => {
  for (const lang of LANGS) {
    for (const tool of index(lang).items.filter(i => i.kind === 'tool')) {
      const { dom } = page(tool.path)
      const said = [
        dom.querySelector('title')?.text.replace(/ — AquaTome$/, ''),
        dom.querySelector('p.intro')?.text,
        dom.querySelector('meta[name="description"]')?.getAttribute('content'),
      ]
      // Each once, and not the name it's listed by.
      expect(tool.words, tool.path).toEqual([...new Set(said.filter((s): s is string => !!s && s !== tool.name))])
    }
  }
  expect(index('vi').items.find(i => i.path === '/vi/cong-cu/the-tich-be/')?.words).toContain('Tính thể tích bể cá: lít, gallon, độ dày kính')
  expect(index('vi').items.filter(i => i.kind !== 'tool').some(i => 'words' in i)).toBe(false)
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
  expect(vi.find(i => i.id === 'anubias-barteri-nana')?.aka).toContain('Anubias nana') // its former scientific name, as the site's search has it
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
  // Biggest group first, as on the site's home (Rasbora's one fish too: the index lists every fish the site's lists show).
  expect(home.groups.map(g => g.id)).toEqual(['cichlids', 'tetras', 'danios', 'rasboras', 'shrimp'])
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
