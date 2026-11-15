import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { FIRST_GUIDES, FIRST_PLANTS, POPULAR, slugify, STAPLE_SPECIES, type Content } from '@aq/schema'
import { pageShard, PageShard } from '@aq/schema/app-page'
import { isVietnamese } from '@aq/schema/text'
import { appBreeds, appIndex, appPlants, appSpecies, breedGroup, type AppIndex, type AppItem } from '../src/lib/app-index'
import { glossaryParts } from '../src/lib/glossary-page'
import { easyPlants, leadGuides } from '../src/lib/home'
import { getContent } from '../src/lib/content'
import { appPath, LANGS, localizePath, OTHER_LANGS } from '../src/lib/i18n'
import { appHref, appPage, DIST, page } from './dist'
import { slow } from '@aq/schema/test-time'

// The native app searches these files and opens each item's page: every item must lead to a page that was built.
const index = (lang: string): AppIndex => JSON.parse(readFileSync(`${DIST}/app/${lang}.json`, 'utf8'))

test('one index per language, every item a built page of that language', () => {
  for (const lang of LANGS) {
    const ix = index(lang)
    expect(ix.version).toBe(1)
    expect(ix.lang).toBe(lang)
    expect(ix.items.length).toBeGreaterThan(0)
    for (const i of ix.items) {
      expect(i.path, i.name).toMatch(new RegExp(`^${appPath(lang, '/vi/')}.+/$`))
      expect(() => appPage(i.path), i.path).not.toThrow()
      expect(i.name.trim(), i.path).not.toBe('')
      if (i.img) expect(i.img, i.path).toMatch(/^https:\/\//)
    }
  }
})

test('the Vietnamese index has fish with scientific names, plants, guides, glossary and the tools', () => {
  const items = index('vi').items
  const kinds = new Set(items.map(i => i.kind))
  for (const k of ['fish', 'plant', 'guide', 'glossary', 'tool', 'material'] as const) expect(kinds, k).toContain(k)
  expect(items.filter(i => i.kind === 'fish').every(i => i.sub || i.path)).toBe(true)
  expect(items.find(i => i.path === '/vi/cong-cu/den-chihiros/')?.name).toBe('Đèn Chihiros')
})

test('material index items open web pages and add no native page shard kind', () => {
  const vi = index('vi')
  expect(vi.items.filter(i => i.kind === 'material').map(i => i.path).sort()).toEqual([
    '/vi/vat-lieu/lua-mopani/', '/vi/vat-lieu/lua-sa-tung/', '/vi/vat-lieu/lua/',
  ])
  expect(vi.shards).not.toHaveProperty('material')
  expect(vi.pages).not.toHaveProperty('material')
  for (const lang of OTHER_LANGS) expect(index(lang).items.some(i => i.kind === 'material')).toBe(false)
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
  expect(vi.filter(i => i.kind === 'fish' && !i.sub).map(i => i.path).sort()).toEqual(page('/ca/').dom.querySelectorAll('section.breeds li a').map(a => appHref(a.getAttribute('href')!)).sort())
  // A thin page (its translation passed, it is only short), a translation that scored low (Cá boraras đỏ: 0.61) and a
  // breed's that did (Cá la hán: 0.6) are out of search engines, not off the site's lists, nor the app's.
  const shards = index('vi').shards!
  for (const [id, path] of [['pterophyllum-scalare', '/vi/ca/ca-ong-tien/'], ['boraras-brigittae', '/vi/ca/ca-boraras-do/'], ['flowerhorn-cichlid', '/vi/ca/ca-la-han/']]) {
    expect(appPage(path!).html, path).toMatch(/noindex/)
    expect(vi.find(i => i.id === id)?.path).toBe(path)
  }
  // A species' copy and a breed's are in the shard its path names.
  for (const path of ['/vi/ca/ca-boraras-do/', '/vi/ca/ca-la-han/']) {
    const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/vi/fish-${pageShard(path, shards.fish!.n)}.json`, 'utf8')))
    expect(shard.pages[path], path).toMatchObject({ kind: 'fish', path })
  }
})

test('the index lists every guide the site lists, a page out of search engines too, each with its copy in a shard', () => {
  for (const lang of LANGS) {
    const { items } = index(lang)
    // Every guide page built: the guide list's, the discovery notes and the video guides, each listed on the site.
    const dir = `${DIST}${localizePath(lang, '/vi/huong-dan/')}`
    const built = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'trang').map(d => appPath(lang, `/vi/huong-dan/${d.name}/`)) : []
    expect(items.filter(i => i.kind === 'guide').map(i => i.path).sort(), lang).toEqual(built.sort())
  }
  // A translation that scored low (Thay nước đúng cách: 0.6) is out of search engines, not off the guide list, nor the app's.
  const ix = index('vi')
  const path = '/vi/huong-dan/thay-nuoc-dung-cach/'
  expect(appPage(path).html).toMatch(/noindex/)
  expect((JSON.parse(readFileSync(`${DIST}/data/vi/guides.json`, 'utf8')) as { slug: string }[]).map(g => g.slug)).toContain('thay-nuoc-dung-cach')
  expect(ix.items.find(i => i.path === path)).toMatchObject({ kind: 'guide', name: 'Thay nước đúng cách', section: 'care' })
  const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/vi/guide-${pageShard(path, ix.shards!.guide!.n)}.json`, 'utf8')))
  expect(shard.pages[path]).toMatchObject({ kind: 'guide', path, title: 'Thay nước đúng cách' })
})

test('the index lists every glossary term the glossary list shows, a page out of search engines too, each with its copy in a shard', async () => {
  for (const lang of LANGS) {
    const ix = index(lang)
    const terms = ix.items.filter(i => i.kind === 'glossary').map(i => i.path)
    const shown = page(localizePath(lang, '/vi/thuat-ngu/')).dom.querySelectorAll('dl.terms dt a').map(a => appHref(a.getAttribute('href')!))
    expect([...terms].sort(), lang).toEqual(shown.sort())
    for (const path of terms) {
      const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/${lang}/glossary-${pageShard(path, ix.shards!.glossary!.n)}.json`, 'utf8')))
      expect(shard.pages[path], path).toMatchObject({ kind: 'glossary', path })
    }
  }
  // A translation that scored low (GH: 0.6) is out of search engines, not off the glossary list, nor the app's.
  const path = '/vi/thuat-ngu/gh/'
  expect(appPage(path).html).toMatch(/noindex/)
  expect(index('vi').items.find(i => i.path === path)).toMatchObject({ kind: 'glossary', name: 'GH' })
  // The fixture has no Indonesian or Thai term: its Vietnamese ones, listed as those languages' glossary lists them.
  const c = await getContent('vi')
  for (const lang of OTHER_LANGS) expect(appIndex(lang, c).items.filter(i => i.kind === 'glossary').map(slugOf), lang).toEqual(c.glossary.map(g => g.t.slug))
  // A term's English name is among its other names, in every language: the chat's search and the app's read them from here.
  expect(c.glossary.some(g => g.en !== g.t.name), 'the fixture has a term whose English name differs').toBe(true)
  for (const lang of LANGS) {
    const items = appIndex(lang, c).items.filter(i => i.kind === 'glossary')
    expect(items.map(slugOf), lang).toEqual(c.glossary.map(g => g.t.slug))
    for (const g of c.glossary) {
      const item = items.find(i => slugOf(i) === g.t.slug)!
      expect([item.name, ...(item.aka ?? [])], `${lang} ${g.t.slug}`).toContain(g.en)
    }
  }
})

// The app's glossary list (the chief of staff and the Site lead, 14 Nov 2026): each term's meaning and how many pages use
// it, as its own page gives them. The meaning is the definition the page leads with, its links taken out; the count is
// the number under "Dùng trong", none where the page has no such section.
test('a glossary term carries its meaning and the number of pages that use it, as its built page gives them', () => {
  let used = 0
  for (const lang of LANGS) {
    for (const i of index(lang).items.filter(x => x.kind === 'glossary')) {
      const { dom } = appPage(i.path)
      expect(i.def, `${lang} ${i.path}`).toBe(dom.querySelector('p.def')?.text.trim())
      const heading = dom.querySelector('#dung-trong')?.text
      expect(i.uses, `${lang} ${i.path}`).toBe(heading ? Number(heading.replace(/\D/g, '')) : undefined)
      if (i.uses) used++
    }
  }
  expect(used, 'the fixture has terms other pages use').toBeGreaterThan(0)
})

// Codex, 14 Nov 2026: the fixture's Indonesian and Thai indexes hold no glossary term, so the test above can't see theirs.
// Each language's index takes a term's meaning from its own text, as it stands (a "<" or "&" in it too), and its count
// from the page's own code.
test('in every language, a glossary term\'s meaning is its own text and its count is its page\'s', async () => {
  const vi = await getContent('vi')
  const own = 'Nước có pH < 7 & mềm, theo bản dịch.'
  const c: Content = { ...vi, glossary: vi.glossary.map((g, i) => (i ? g : { ...g, t: { ...g.t, definition: own } })) }
  for (const lang of LANGS) {
    const items = appIndex(lang, c).items.filter(i => i.kind === 'glossary')
    expect(items.length, lang).toBe(c.glossary.length)
    expect(items.find(i => slugOf(i) === c.glossary[0]!.t.slug)?.def, lang).toBe(own)
    for (const g of c.glossary) {
      const item = items.find(i => slugOf(i) === g.t.slug)!
      expect(item.def, `${lang} ${g.t.slug}`).toBe(g.t.definition?.trim() || undefined)
      expect(item.uses, `${lang} ${g.t.slug}`).toBe(glossaryParts(lang, c, g).total || undefined)
    }
    expect(items.some(i => i.uses), `${lang}: the fixture has terms other pages use`).toBe(true)
  }
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
  const built = (readdirSync(`${DIST}/phan-loai`, { recursive: true }) as string[]).filter(f => f.endsWith('index.html')).map(f => f.replace(/\/?index\.html$/, ''))
  expect(built.sort()).toEqual(['', ...taxa].sort())
  expect(page('/phan-loai/').dom.querySelector('h1')?.text.trim()).toBe(labels.taxon.title)
  for (const k of taxa) {
    const depth = k.split('/').length
    const on = species.filter(i => under(i, depth) === k)
    const { dom } = page(`/phan-loai/${k}/`)
    // The same species in the same order: the fish list's.
    expect(listed(`/phan-loai/${k}/`), k).toEqual(on.map(slugOf))
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
  const pathOf = (id: string) => { const p = places.find(x => x.id === id)!; return p.parent ? `/nguon-goc/${p.parent}/${id}/` : `/nguon-goc/${id}/` }
  // The pages built are the origin index and one for each place, no other.
  const built = (readdirSync(`${DIST}/nguon-goc`, { recursive: true }) as string[]).filter(f => f.endsWith('index.html')).map(f => `/nguon-goc/${f.replace(/index\.html$/, '')}`)
  expect(built.sort()).toEqual(['/nguon-goc/', ...places.map(p => pathOf(p.id))].sort())
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
  const { dom } = page('/nguon-goc/')
  expect(dom.querySelector('h1')?.text.trim()).toBe(labels.origin.title)
  expect(kids('/nguon-goc/')).toEqual(places.filter(p => p.kind === 'continent').map(p => p.name))
  for (const p of places) {
    if (p.kind === 'continent') expect(kids(`/nguon-goc/${p.id}/`), p.id).toEqual(places.filter(x => x.parent === p.id).map(x => x.name))
    else expect(kids(`/nguon-goc/${p.parent}/${p.id}/`), p.id).toEqual(p.kids ?? [])
  }
  expect(labels.placeTitle.vietnam).toBe('Cá Việt Nam')
  expect(page('/nguon-goc/asia/vietnam/').dom.querySelector('p.intro')?.text.trim()).toBe(labels.placeIntro.vietnam)
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
  // A lifespan, as its card resolves it, always a range; none where no source gives one.
  expect(vi.find(i => i.id === 'paracheirodon-innesi')?.lifeYears).toEqual({ min: 5, max: 10 })
  expect('lifeYears' in cardinal).toBe(false)
  // No traits file: its figures, no behaviour.
  const discus = vi.find(i => i.id === 'symphysodon-aequifasciatus')!
  expect(discus).toMatchObject({ sizeCm: 15, tankCm: 120, ph: { min: 4.5, max: 6.5 } })
  expect(discus.temperament).toBeUndefined()
  expect(discus.gh).toBeUndefined()
  // Guides, plants and these breeds have none (a breed's, below; the Oranda, linked to no species, has its own).
  for (const i of vi.filter(x => x.kind !== 'fish' || (!x.sub && x.id !== 'oranda-goldfish'))) expect(Object.keys(i).filter(k => ['tempC', 'ph', 'sizeCm', 'temperament'].includes(k)), i.path).toEqual([])
})

test('a breed that is a form of a species is checked as it (`of`), its own figures for its card; any other breed is a fish of its own', async () => {
  const vi = index('vi').items
  // A colour form of the discus: counted as the discus, so none of the tank-mates figures of its own; its card's figures
  // as its page's card resolves them (the two sources' temperatures: the span they give between them).
  const pigeon = vi.find(i => i.id === 'pigeon-blood-discus')!
  expect(pigeon.of).toBe('symphysodon-aequifasciatus')
  expect(pigeon.card).toEqual({ tempC: { min: 27, max: 31 }, sizeCm: 15 })
  const card = appPage(pigeon.path).dom.querySelectorAll('.datacard dl.card > div')
  expect(card.map(r => r.getAttribute('data-field'))).toEqual(Object.keys(pigeon.card!))
  expect(card.map(r => r.querySelector('.v')!.getAttribute('data-c') ?? r.querySelector('.v')!.getAttribute('data-cm'))).toEqual(['27,31', '15,15'])
  // A hybrid with no figures: neither.
  const flowerhorn = vi.find(i => i.id === 'flowerhorn-cichlid')!
  expect(['of', 'card', 'tempC', 'sizeCm', 'temperament'].filter(k => k in flowerhorn)).toEqual([])
  // A line linked to no species: a fish of its own, its difficulty and lifespan its page's card's, as a species' are.
  const oranda = vi.find(i => i.id === 'oranda-goldfish')!
  expect(oranda).toMatchObject({ difficulty: 3, card: { difficulty: 3, lifeYears: { min: 10, max: 15 } } })
  expect('of' in oranda).toBe(false)
  // Every breed's card is its page's card.
  const c = await getContent('vi')
  for (const b of appBreeds('vi', c)) {
    const item = vi.find(i => i.id === b.id)!
    expect(Object.keys(item.card ?? {}), item.path).toEqual(appPage(item.path).dom.querySelectorAll('.datacard dl.card > div').map(r => r.getAttribute('data-field')))
  }
  const breed = c.breeds.find(b => b.id === 'pigeon-blood-discus')!
  const with_ = (breeds: Content['breeds'], species = c.species) => appIndex('vi', { ...c, breeds, species } as Content).items
  const own = { tempC: { min: 27, max: 31 }, sizeCm: 15, card: { tempC: { min: 27, max: 31 }, sizeCm: 15 } }
  // Linked to no species, or a hybrid: a fish of its own, with its figures and no behaviour (the check says "unsure").
  for (const b of [{ ...breed, basedOn: undefined }, { ...breed, kind: 'hybrid' as const }]) {
    const item = with_([b]).find(i => i.id === b.id)!
    expect(item, b.kind).toMatchObject(own)
    expect(['of', 'temperament', 'finNipper', 'schoolMin'].filter(k => k in item), b.kind).toEqual([])
  }
  // A form of a species with a difficulty: on its card, the figure the app's facts card shows for it.
  const rated = with_([{ ...breed, care: { ...breed.care, difficulty: [{ source: 0, value: 6 }] } }]).find(i => i.id === breed.id)!
  expect(rated).toMatchObject({ of: 'symphysodon-aequifasciatus', card: { difficulty: 6 } })
  expect('difficulty' in rated).toBe(false)
  // A form of a form: up to the species. A species the index doesn't list: a fish of its own.
  const line = { ...breed, id: 'pigeon-line', basedOn: 'pigeon-blood-discus', t: { ...breed.t, slug: 'pigeon-line' } }
  expect(with_([breed, line]).find(i => i.id === 'pigeon-line')?.of).toBe('symphysodon-aequifasciatus')
  const alone = with_([breed], c.species.filter(s => s.id !== 'symphysodon-aequifasciatus')).find(i => i.id === breed.id)!
  expect(alone).toMatchObject(own)
  expect('of' in alone).toBe(false)
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

test("a guide's picture is its card's on the site: a video guide shows a photo from its sections, never its video's thumbnail", async () => {
  const c = await getContent('vi')
  const guides = new Map(index('vi').items.filter(i => i.kind === 'guide').map(i => [i.path, i]))
  const videos = c.guides.filter(g => g.video && !g.photos.length).map(g => guides.get(`/vi/huong-dan/${g.t.slug}/`)).filter(i => i !== undefined)
  expect(videos.length).toBeGreaterThan(0)
  for (const v of videos) expect(v.img ?? '', v.path).not.toMatch(/ytimg/)
  expect(videos.filter(v => v.img).length, 'a video guide with a photo in its sections shows it').toBeGreaterThan(0)
})

test('a video series is an item (Vietnamese only, as its page is), and a video guide carries its length', () => {
  const series = index('vi').items.filter(i => i.kind === 'video')
  // The empty playlist has no guides, so it isn't listed.
  expect(series.map(i => i.path)).toEqual(['/vi/video/reu-hai-tu-a-den-z/'])
  expect(series[0]).toMatchObject({ name: 'Rêu hại từ A đến Z', sub: 'MJ Aquascaping', parts: 1 })
  expect(series[0]!.img).toMatch(/^https:\/\//)
  for (const lang of OTHER_LANGS) expect(index(lang).items.some(i => i.kind === 'video'), lang).toBe(false)
  const guides = index('vi').items.filter(i => i.kind === 'guide')
  expect(guides.find(g => g.path === '/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')?.video).toBe(1755)
  expect(guides.find(g => g.path === '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')).not.toHaveProperty('video')
  expect(index('vi').items.filter(i => i.kind !== 'guide').some(i => 'video' in i)).toBe(false)
})

test('every series /video/ lists is listed, one whose guides are all out of search engines too; the biggest series first', async () => {
  const c = await getContent('vi')
  const listed = appIndex('vi', c).items.filter(i => i.kind === 'video')
  // The series /video/ links (not its channels'), in its order.
  const rows = page('/video/').dom.querySelectorAll('a[href^="/video/"]').map(a => a.getAttribute('href')!).filter(h => /^\/video\/[^/]+\/$/.test(h) && h !== '/video/kenh/').map(appHref)
  expect(listed.map(i => i.path)).toEqual([...new Set(rows)])
  // A series whose guides are all out of search engines: its page is too, and /video/ still lists it.
  const s = c.series.find(x => listed.some(i => i.path === `/vi/video/${x.vi.slug}/`))!
  const off = { ...c, guides: c.guides.map(g => (g.video?.series?.id === s.id ? { ...g, t: { ...g.t, quality: { ...g.t.quality, indexable: false } } } : g)) }
  expect(appIndex('vi', off).items.filter(i => i.kind === 'video')).toEqual(listed)
  // As /video/ lists them.
  const parts = listed.map(i => i.parts!)
  expect(parts).toEqual([...parts].sort((a, b) => b - a))
}, slow(60_000)) // reading the content and two indexes of it: seconds, more beside the other tests

test('a tool carries its page\'s own title, the line under its heading and its description, all of them, so a search finds it by them', () => {
  for (const lang of LANGS) {
    for (const tool of index(lang).items.filter(i => i.kind === 'tool')) {
      const { dom } = appPage(tool.path)
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

test('a tool with a card on the tools page carries that card\'s name as its short name, the app\'s tiles\' word; the tools page itself none', () => {
  for (const lang of LANGS) {
    const tools = index(lang).items.filter(i => i.kind === 'tool')
    const root = tools.find(i => i.path.split('/').filter(Boolean).length <= 2)!
    const { dom } = appPage(root.path)
    const cards = new Map(dom.querySelectorAll('.tools a').map(a => [appHref(a.getAttribute('href')!), a.querySelector('strong')?.text]))
    expect(root.short, lang).toBeUndefined()
    for (const tool of tools.filter(i => i !== root)) expect(tool.short, tool.path).toBe(cards.get(tool.path))
  }
  // The tile order the app shows: the index's.
  expect(index('vi').items.filter(i => i.kind === 'tool').map(i => i.short)).toEqual(
    [undefined, 'Nuôi chung', 'Thể tích bể', 'Dự toán chi phí', 'Đèn Chihiros', 'Nhận diện cá', 'Bể của tôi'])
  expect(index('vi').items.filter(i => i.kind !== 'tool').some(i => 'short' in i)).toBe(false)
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

test('Khám phá\'s lists: the fish start with the home\'s row and go on with those hobbyists keep most; the plants and guides are Curation\'s, in order', async () => {
  // The built index: the fish start with the row Tìm and Hôm nay read; the plants and guides are Curation's lists, as
  // far as this language lists them, then the home's ranking; at most seven columns (24 fish, the top taking 3 of them;
  // 21 plants; 7 guides), every page once, each one the index lists.
  for (const lang of LANGS) {
    const { items, home } = index(lang)
    const listed = new Set(items.map(i => i.path))
    expect(home.browse!.fish.slice(0, home.fish.length), lang).toEqual(home.fish)
    expect(home.browse!.fish.length, lang).toBeLessThanOrEqual(24)
    // Plants never fewer than the home's row; guides, 7 when the row has as many (its 8 show as 6 under the top's two).
    expect(home.browse!.plants.length, lang).toBeGreaterThanOrEqual(home.plants.length)
    expect(home.browse!.plants.length, lang).toBeLessThanOrEqual(21)
    expect(home.browse!.guides.length, lang).toBeGreaterThanOrEqual(Math.min(7, home.guides.length))
    expect(home.browse!.guides.length, lang).toBeLessThanOrEqual(7)
    for (const k of ['fish', 'plants', 'guides'] as const) {
      const list = home.browse![k]
      expect(new Set(list).size, `${lang} ${k}`).toBe(list.length)
      expect(list.every(p => listed.has(p)), `${lang} ${k}`).toBe(true)
    }
  }
  // Content with more of each than a shelf holds: 40 of the hobbyists' fish (the first of them with no photo); every
  // curated plant and guide but one each, which stopped passing reader fit, in the reverse of Curation's order; and more
  // easy plants and beginner guides than the home's row.
  const c = await getContent('vi')
  const fish = c.species.find(s => s.id === 'paracheirodon-innesi')!
  const popular = [...new Set([...STAPLE_SPECIES, ...POPULAR.map(slugify)])]
  const added = popular.filter(id => !c.species.some(s => s.id === id)).slice(0, 40)
  const species = [...c.species, ...added.map((id, n) => ({ ...fish, id, t: { ...fish.t, slug: id }, ...(n === 0 ? { photos: [] } : {}) }))]
  const gonePlant = FIRST_PLANTS[2]!
  const goneGuide = FIRST_GUIDES[4]!
  const plant = c.plants.find(p => p.photos.length && p.light !== 'high' && p.co2 !== 'required')!
  const addedPlants = FIRST_PLANTS.filter(id => id !== gonePlant && !c.plants.some(p => p.id === id)).toReversed()
  const plants = [...c.plants.filter(p => p.id !== gonePlant), ...[...addedPlants, ...Array.from({ length: 10 }, (_, n) => `cay-${n}`)].map(id => ({ ...plant, id, t: { ...plant.t, slug: id } }))]
  const lead = leadGuides(c)[0]!
  const addedGuides = FIRST_GUIDES.filter(id => id !== goneGuide && !c.guides.some(g => g.id === id)).toReversed()
  const guides = [...c.guides.filter(g => g.id !== goneGuide), ...[...addedGuides, ...Array.from({ length: 12 }, (_, n) => `${lead.id}-${n}`)].map(id => ({ ...lead, id, t: { ...lead.t, slug: id } }))]
  const many = appIndex('vi', { ...c, species, plants, guides } as Content)
  const { home } = many
  // The hobbyists' fish with no photo is listed, but not on the shelf.
  const bare = many.items.find(i => i.id === added[0])
  expect(bare && !bare.img).toBe(true)
  expect(home.browse!.fish).not.toContain(bare!.path)
  expect(home.browse!.fish).toHaveLength(24)
  expect(home.browse!.fish.slice(0, 8)).toEqual(home.fish)
  // After the row, the hobbyists' fish in their order, each with a photo, none of the row again.
  const byPath = new Map(many.items.map(i => [i.path, i]))
  const after = home.browse!.fish.slice(8).map(p => byPath.get(p)!)
  expect(after.every(i => i.img && !home.fish.includes(i.path))).toBe(true)
  const pictured = new Map(many.items.filter(i => i.kind === 'fish' && i.img).map(i => [i.id!, i.path]))
  expect(home.browse!.fish).toEqual([...new Set([...home.fish, ...popular.flatMap(id => pictured.get(id) ?? [])])].slice(0, 24))
  // Plants: Curation's first 21 in its order, less the one that dropped out, whose place goes to its 22nd.
  const plantPath = new Map(many.items.filter(i => i.kind === 'plant').map(i => [i.id!, i.path]))
  const curatedPlants = FIRST_PLANTS.filter(id => id !== gonePlant).map(id => plantPath.get(id)!)
  expect(home.browse!.plants).toEqual(curatedPlants.slice(0, 21))
  expect(home.browse!.plants).toContain(plantPath.get(FIRST_PLANTS[21]!))
  expect(home.plants).toHaveLength(6)
  // Guides: Curation's first 7 in its order, less the one that dropped out, whose place goes to its 8th.
  const slugOf = new Map(guides.map(g => [g.id, g.t.slug]))
  const curatedGuides = FIRST_GUIDES.filter(id => id !== goneGuide).map(id => `/vi/huong-dan/${slugOf.get(id)}/`)
  expect(home.browse!.guides).toEqual(curatedGuides.slice(0, 7))
  expect(home.browse!.guides).toContain(`/vi/huong-dan/${slugOf.get(FIRST_GUIDES[7]!)}/`)
  expect(home.guides).toHaveLength(8)
})

test('a language with few of Curation\'s pages fills Khám phá\'s plants and guides from the home\'s ranking, to seven columns', async () => {
  // As Malay today: 6 of Curation's plants and 1 of its guides, among more easy plants and lead guides than a shelf holds.
  const c = await getContent('vi')
  const plant = c.plants.find(p => p.photos.length && p.light !== 'high' && p.co2 !== 'required')!
  const lead = leadGuides(c)[0]!
  const keptPlants = FIRST_PLANTS.slice(10, 16)
  const keptGuide = FIRST_GUIDES[13]!
  const clone = <T extends { id: string; t: { slug: string } }>(of: T, id: string): T => ({ ...of, id, t: { ...of.t, slug: id } })
  const plants = [
    ...c.plants.filter(p => !FIRST_PLANTS.includes(p.id) || keptPlants.includes(p.id)),
    ...[...keptPlants.filter(id => !c.plants.some(p => p.id === id)), ...Array.from({ length: 40 }, (_, n) => `cay-${n}`)].map(id => clone(plant, id)),
  ]
  const guides = [
    ...c.guides.filter(g => !FIRST_GUIDES.includes(g.id) || g.id === keptGuide),
    ...[...(c.guides.some(g => g.id === keptGuide) ? [] : [keptGuide]), ...Array.from({ length: 20 }, (_, n) => `${lead.id}-${n}`)].map(id => clone(lead, id)),
  ]
  const content = { ...c, plants, guides } as Content
  const { home, items } = appIndex('vi', content)
  const listed = new Set(items.map(i => i.path))
  const plantAt = new Map(items.filter(i => i.kind === 'plant').map(i => [i.id!, i.path]))
  const guideAt = (id: string) => `/vi/huong-dan/${guides.find(g => g.id === id)!.t.slug}/`
  // Plants: Curation's 6 in its order, then the easy plants in the home's order, 21 in all; the home's row unchanged.
  const curatedPlants = keptPlants.map(id => plantAt.get(id)!)
  const easy = easyPlants(content, plants.length).map(p => `/vi/cay/${p.t.slug}/`).filter(p => listed.has(p))
  expect(home.browse!.plants).toHaveLength(21)
  expect(home.browse!.plants).toEqual([...curatedPlants, ...easy.filter(p => !curatedPlants.includes(p))].slice(0, 21))
  expect(home.plants).toEqual(easy.slice(0, 6))
  // Guides: Curation's one, then the lead guides in the home's order, 7 in all; the home's row of 8 unchanged.
  const leads = leadGuides(content).map(g => guideAt(g.id)).filter(p => listed.has(p))
  expect(home.browse!.guides).toHaveLength(7)
  expect(home.browse!.guides).toEqual([guideAt(keptGuide), ...leads.filter(p => p !== guideAt(keptGuide))].slice(0, 7))
  expect(home.guides).toEqual(leads.slice(0, 8))
})

test('a breed\'s group: what it\'s a form of first (a species, or a breed in turn), else a parent species', () => {
  const groups = new Map([['betta-splendens', 'labyrinth'], ['symphysodon-aequifasciatus', 'cichlids'], ['carassius-auratus', 'other']])
  const breeds = [{ id: 'halfmoon-betta', basedOn: 'betta-splendens', parents: [] }, { id: 'loop-a', basedOn: 'loop-b', parents: [] }, { id: 'loop-b', basedOn: 'loop-a', parents: [] }]
  expect(breedGroup({ basedOn: 'halfmoon-betta', parents: [] }, groups, breeds)).toBe('labyrinth')
  expect(breedGroup({ parents: [{ name: 'Amphilophus trimaculatus', certain: true }, { name: 'Cá đĩa', species: 'symphysodon-aequifasciatus', certain: false }] }, groups, breeds)).toBe('cichlids')
  expect(breedGroup({ basedOn: 'unknown', parents: [{ name: 'x', species: 'carassius-auratus', certain: true }] }, groups, breeds)).toBe('other')
  expect(breedGroup({ basedOn: 'loop-a', parents: [] }, groups, breeds), 'a loop ends').toBeUndefined()
})
