import { expect, test } from 'vitest'
import { checkPage, loadFacts } from '../scripts/page-check'
import { LANGS } from '../src/lib/i18n'
import { plantTitle, speciesDescription, speciesTitle } from '../src/lib/meta'

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
