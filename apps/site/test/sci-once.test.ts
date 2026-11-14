import { expect, test } from 'vitest'
import { checkPage, loadFacts } from '../scripts/page-check'
import { LANGS } from '../src/lib/i18n'
import { plantTitle, speciesDescription, speciesTitle } from '../src/lib/meta'
import { nameAndSci, sciBeside } from '../src/lib/sci'
import { breedParents } from '../src/lib/breed-page'
import type { Breed } from '../src/lib/breeds'
import type { Content } from '@aq/schema'

// The chief of staff, 13 November: aquatome.com's title for the South American frogbit read "Cách trồng bèo tây Nam Mỹ
// (Limnobium laevigatum) (Limnobium laevigatum)", its name saying its scientific name already. 1,337 fish and plant
// titles did, in every language: fish named "Cá Abbottina rivularis", and pages whose name is the scientific name (the
// Indonesian and Thai ones, with no common name), which also lost the genus's capital ("acrossocheilus iridescens").
const times = (s: string, sci: string) => s.split(sci).length - 1
const NAMES = [
  ['Bèo tây Nam Mỹ (Limnobium laevigatum)', 'Limnobium laevigatum'],
  ['Cá Abbottina rivularis', 'Abbottina rivularis'],
  ['Acrossocheilus iridescens', 'Acrossocheilus iridescens'],
  ["Bacopa monnieri 'Compact'", 'Bacopa monnieri'],
  ['Cá chạch Paracanthocobitis rubidipinnis', 'Acanthocobitis rubidipinnis'], // another genus: both said
  ['ปลาAbbottina rivularis', 'Abbottina rivularis'], // Thai right up to it
  ['Cá neon vua', 'Paracheirodon axelrodi'],
] as const

test.each(LANGS)('%s: a title and a description say the scientific name once, its genus with its capital', lang => {
  for (const [name, sci] of NAMES) {
    for (const said of [speciesTitle(lang, name, sci), plantTitle(lang, name, sci), speciesDescription(lang, name, sci, {})]) expect(times(said, sci), said).toBe(1)
  }
})

test('a name without its scientific name reads as before', () => {
  expect(speciesTitle('vi', 'Cá neon vua', 'Paracheirodon axelrodi')).toBe('Cách nuôi cá neon vua (Paracheirodon axelrodi): bể, nước, nuôi chung')
  expect(plantTitle('id', 'Rumput air', 'Vallisneria spiralis')).toBe('Cara menanam rumput air (Vallisneria spiralis): cahaya, CO₂, posisi')
})

// The page check holds every page the browser checks sample to it, on the live site too (invariants.spec.ts).
test("the page check finds a fish's scientific name twice in its title or description", async () => {
  const facts = await loadFacts(process.env.CONTENT_ROOT ?? 'test/fixture-content')
  const page = (title: string, description: string) => `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body></body></html>`
  const twice = checkPage('/ca/ca-neon-vua/', page('Cách nuôi cá Paracheirodon axelrodi (Paracheirodon axelrodi): bể', 'Cá Paracheirodon axelrodi (Paracheirodon axelrodi): pH 5–6.'), facts)
  expect(twice.map(p => p.check)).toEqual(['name-twice', 'name-twice'])
  expect(checkPage('/ca/ca-neon-vua/', page(speciesTitle('vi', 'Cá neon vua', 'Paracheirodon axelrodi'), 'Cá neon vua (Paracheirodon axelrodi): pH 5–6.'), facts)).toEqual([])
})

// The chief of staff, 13 November, after the titles: 820 Vietnamese names hold their scientific name ("Cá lóc Channa
// andrao"), so wherever the pair is printed together it said it twice: the page's heading and the line under it, the
// cards, the head photo's text, the gallery page, the structured data, the pickers. The page check finds each on a built
// page; on the fixture build, the plant Cryptocoryne wendtii is named by its scientific name alone.
test('beside a name that says it, the scientific name is left out', () => {
  expect(sciBeside('Cá lóc Channa andrao', 'Channa andrao')).toBeUndefined()
  expect(sciBeside('Cryptocoryne wendtii', 'Cryptocoryne wendtii')).toBeUndefined()
  expect(sciBeside('Cá neon vua', 'Paracheirodon axelrodi')).toBe('Paracheirodon axelrodi')
  expect(nameAndSci('Cá lóc Channa andrao', 'Channa andrao')).toBe('Cá lóc Channa andrao')
  expect(nameAndSci('Cá neon vua', 'Paracheirodon axelrodi')).toBe('Cá neon vua, Paracheirodon axelrodi')
})

test('the page check finds a scientific name printed under a name that says it, in photo text and structured data', async () => {
  const facts = await loadFacts(process.env.CONTENT_ROOT ?? 'test/fixture-content')
  const ld = (headline: string, alt?: string) => `<script type="application/ld+json">${JSON.stringify([{ '@type': 'Article', headline, ...(alt ? { alternativeHeadline: alt } : {}) }])}</script>`
  const html = (body: string, head = '') => `<html><head><title>x</title>${head}</head><body><main>${body}</main></body></html>`
  const twice = checkPage('/ca/ca-neon-vua/', html(
    '<div class="id"><h1>Cá Paracheirodon axelrodi</h1><p class="sci binomial">Paracheirodon axelrodi</p></div>'
    + '<img src="/a.webp" width="4" height="3" alt="Cá Paracheirodon axelrodi, Paracheirodon axelrodi">'
    + '<article class="sc"><a><h3>Cá lóc Channa andrao</h3><p class="sci">Channa andrao</p></a></article>',
    ld('Cá Paracheirodon axelrodi', 'Paracheirodon axelrodi')), facts).filter(p => p.check === 'name-twice')
  expect(twice.map(p => p.detail.split(':')[0]!.split('"')[0])).toEqual(['photo text', 'structured data', '', ''])
  const once = checkPage('/ca/ca-neon-vua/', html(
    '<div class="id"><h1>Cá neon vua</h1><p class="sci binomial">Paracheirodon axelrodi</p></div>'
    + '<img src="/a.webp" width="4" height="3" alt="Cá neon vua, Paracheirodon axelrodi">'
    + '<article class="sc"><a><h3>Cá lóc Channa andrao</h3></a></article>'
    // A card's template keeps its .sci for the cards made from it, and shows nothing.
    + '<template><article class="sc"><a><h3>Cá lóc Channa andrao</h3><p class="sci">Channa andrao</p></a></article></template>'
    + '<p class="parents">Lai từ: <a href="/ca/ca-loc/">Cá lóc <span class="sci">(Channa andrao)</span></a></p>',
    ld('Cá neon vua', 'Paracheirodon axelrodi')), facts)
  expect(once.filter(p => p.check === 'name-twice')).toEqual([])
  // A hybrid's parent, linked with its scientific name in brackets after a name that says it.
  const parent = checkPage('/ca/ca-neon-vua/', html('<p class="parents">Lai từ: <a href="/ca/ca-loc-channa-andrao/">Cá lóc Channa andrao <span class="sci">(Channa andrao)</span></a></p>'), facts)
  expect(parent.filter(p => p.check === 'name-twice').map(p => p.detail)).toEqual(['"Cá lóc Channa andrao" over "Channa andrao"'])
  // A picker's option, the name in the span before it, and a photo page's lead, its link back naming the fish.
  const picker = checkPage('/ca/ca-neon-vua/', html('<ul><li role="option"><span class="nm"><span>Cá lóc Channa andrao</span> <i class="sci">Channa andrao</i></span></li><li role="option"><span class="nm"><span>Cá lóc vảy rồng</span> <i class="sci">Channa asiatica</i></span></li></ul>'), facts)
  expect(picker.filter(p => p.check === 'name-twice').map(p => p.detail)).toEqual(['"Cá lóc Channa andrao" over "Channa andrao"'])
  const lead = (sci: string) => checkPage('/ca/ca-neon-vua/', html(`<p class="lead">${sci}Ảnh từ nhiều nguồn. <a href="/ca/ca-loc-channa-andrao/">Cách nuôi Cá lóc Channa andrao →</a></p>`), facts)
  expect(lead('<span class="sci">Channa andrao</span> · ').filter(p => p.check === 'name-twice')).toHaveLength(1)
  expect(lead('').filter(p => p.check === 'name-twice')).toEqual([])
  // A species page's crumbs end in its genus, in italics: not a name said twice.
  const crumbs = checkPage('/ca/ca-neon-vua/', html('<nav class="crumb"><a href="/ca/">Loài cá</a> / <a href="/ca/ho/channidae/">Channidae</a> / <a class="sci" href="/ca/chi/channa/">Channa</a></nav>'), facts)
  expect(crumbs.filter(p => p.check === 'name-twice')).toEqual([])
})

test("a hybrid's parents give the scientific name beside a name only when the name doesn't say it", () => {
  const species = [
    { id: 'channa-andrao', scientificName: 'Channa andrao', t: { name: 'Cá lóc Channa andrao', slug: 'ca-loc-channa-andrao' } },
    { id: 'channa-asiatica', scientificName: 'Channa asiatica', t: { name: 'Cá lóc vảy rồng', slug: 'ca-loc-vay-rong' } },
  ] as unknown as Content['species']
  const b = { t: {}, parents: [{ species: 'channa-andrao', name: 'Channa andrao', certain: true }, { species: 'channa-asiatica', name: 'Channa asiatica', certain: true }] } as unknown as Breed
  expect(breedParents('vi', { species }, b)).toEqual([
    { name: 'Cá lóc Channa andrao', sci: undefined, path: '/vi/ca/ca-loc-channa-andrao/', certain: true },
    { name: 'Cá lóc vảy rồng', sci: 'Channa asiatica', path: '/vi/ca/ca-loc-vay-rong/', certain: true },
  ])
})
