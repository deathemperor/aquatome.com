import { expect, test } from 'vitest'
import { judgeQuality, nearEmptyKeys, speciesDepth, type SectionKey, type SourceId } from '../src/index'

const s = (key: SectionKey, source: SourceId, text: string) => ({ key, source, html: `<p>${text}</p>` })
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')

// Betta macrostoma on aquatome.com (2026-10-31): one BW Aquatics listing, its whole breeding section "Mouthbrooder."
const listing = [
  s('quickFacts', 'bwaquatics', 'Wild-caught Betta macrostoma from Marudi. Maximum size: 4.5 inches. Breeding: mouthbrooder'),
  s('beforeYouBuy', 'bwaquatics', 'This is one of the largest bettas and is highly sought after for its size and beauty. It turns red on the body.'),
  s('waterConditions', 'bwaquatics', 'TDS ~60–100; pH 5.0–7.0; temperature 72–82°F. Cooler temperatures are preferred.'),
  s('diet', 'bwaquatics', 'Carnivorous. Fed on live, frozen and dry foods, such as blackworms, frozen bloodworms and pellets.'),
  s('behaviour', 'bwaquatics', 'Like many species in this complex, they can be aggressive. Best kept in a species-only tank.'),
  s('reproduction', 'bwaquatics', 'Mouthbrooder.'),
]

test('a shop listing alone is thin: short, and its one-word breeding section covers no topic', () => {
  const d = speciesDepth(listing)
  expect(d).toMatchObject({ deep: false, topics: ['behaviour', 'food', 'water'] })
  expect(d.chars).toBeLessThan(1500)
  expect(d.profile).toBeUndefined()
})

test('an in-depth source makes the page deep, however long it is', () => {
  expect(speciesDepth([...listing, s('habitat', 'seriouslyfish', 'Peat swamp streams in Brunei.')])).toMatchObject({ deep: true, profile: 'seriouslyfish' })
  for (const src of ['loachesonline', 'scotcat'] as const) expect(speciesDepth([s('notes', src, 'A short factsheet.')]).deep).toBe(true)
})

test('PlanetCatfish counts only for a full profile; its stubs are shallow', () => {
  const stub = [s('quickFacts', 'planetcatfish', 'Asia: Indonesia.'), s('distribution', 'planetcatfish', words(30)), s('reproduction', 'planetcatfish', 'Unreported.')]
  expect(speciesDepth(stub)).toMatchObject({ deep: false, topics: [] })
  const full = [...stub, s('diet', 'planetcatfish', words(20)), s('behaviour', 'planetcatfish', words(20)), s('reproduction', 'planetcatfish', words(20))]
  expect(speciesDepth(full)).toMatchObject({ deep: true, profile: 'planetcatfish', topics: ['behaviour', 'breeding', 'food'] })
  // Another source's care sections don't make PlanetCatfish's stub a profile (the page may still reach the bar on its own).
  expect(speciesDepth([...stub, s('diet', 'glaser', words(20)), s('behaviour', 'glaser', words(20))]).profile).toBeUndefined()
})

test('shallow sources reach the bar with enough text on three care topics', () => {
  const long = [s('notes', 'glaser', words(150)), s('diet', 'glaser', words(40)), s('behaviour', 'bwaquatics', words(40))]
  expect(speciesDepth(long)).toMatchObject({ deep: false, topics: ['behaviour', 'food'] })
  expect(speciesDepth([...long, s('aquariumSize', 'bwaquatics', words(20))])).toMatchObject({ deep: true, topics: ['behaviour', 'food', 'tank'] })
  expect(speciesDepth([...long, s('aquariumSize', 'bwaquatics', words(20))]).chars).toBeGreaterThanOrEqual(1500)
})

test('references are no part of the text', () => {
  const page = [s('diet', 'glaser', words(40)), s('behaviour', 'glaser', words(40)), s('maintenance', 'glaser', words(40))]
  expect(speciesDepth([...page, s('references', 'glaser', words(400))]).chars).toBe(speciesDepth(page).chars)
  expect(speciesDepth([...page, s('references', 'glaser', words(400))]).deep).toBe(false)
})

test('near-empty headings: a few words under them from every source together', () => {
  expect([...nearEmptyKeys(listing)]).toEqual(['reproduction'])
  expect(nearEmptyKeys([...listing, s('reproduction', 'seriouslyfish', words(30))]).size).toBe(0)
  // Quick facts are where the folded facts go; references are a list.
  expect(nearEmptyKeys([s('quickFacts', 'glaser', 'Peaceful.'), s('references', 'glaser', 'Ref.')]).size).toBe(0)
})

test('the indexable decision: score and depth, and the reason when out', () => {
  const q = { score: 0.82, indexable: true, bySource: { bwaquatics: 0.82 } }
  expect(judgeQuality(q, true, true)).toEqual(q)
  expect(judgeQuality(q, true, false)).toEqual({ ...q, indexable: false, reason: 'thin' })
  expect(judgeQuality(q, false, true)).toEqual({ ...q, indexable: false, reason: 'score' })
  expect(judgeQuality(q, false, false)).toMatchObject({ indexable: false, reason: 'thin' })
  expect(judgeQuality({ ...q, indexable: false, reason: 'thin' }, true, true)).toEqual(q)
})
