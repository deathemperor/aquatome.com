import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { checkPage, loadFacts } from '../scripts/page-check'
import { getContent } from '../src/lib/content'
import { farFromCard, sectionParts } from '../src/lib/section-parts'

test('a note only for a figure as far from the card as its dot asks', () => {
  const temp = { min: 24, max: 28 }
  expect(farFromCard([{ field: 'tempC', own: { min: 24, max: 30 }, card: { min: 22, max: 30 } }])).toEqual([]) // the betta's: it overlaps
  expect(farFromCard([{ field: 'tempC', own: { min: 18, max: 22 }, card: temp }])).toEqual([{ field: 'tempC', card: temp }])
  expect(farFromCard([{ field: 'sizeCm', own: 4, card: 3.5 }])).toEqual([]) // rounding
  expect(farFromCard([{ field: 'sizeCm', own: 20, card: 8 }])).toEqual([{ field: 'sizeCm', card: 8 }])
})

test('a tank in litres is read as the ready-made tank that holds it, and the card\'s tank is given once', () => {
  expect(farFromCard([{ field: 'tankL', own: 8, card: 45 }])).toEqual([{ field: 'tankCm', card: 45 }]) // a 30 cm tank
  expect(farFromCard([{ field: 'tankL', own: 19, card: 45 }])).toEqual([]) // a 40 cm tank: near enough
  expect(farFromCard([{ field: 'tankL', own: 8, card: 45 }, { field: 'tankL', own: { min: 5, max: 10 }, card: 45 }])).toEqual([{ field: 'tankCm', card: 45 }])
})

test('the plant page and the app\'s copy both give the sections the plant\'s CO₂, so the row that reads against the card goes from both', () => {
  const page = readFileSync(new URL('../src/pages/cay/[slug].astro', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/lib/app-page.ts', import.meta.url), 'utf8')
  expect(page).toContain('co2={p.co2}')
  expect(app).toContain('co2: p.co2')
})

test('extra fish photos wait for the first care section on the web page', async () => {
  const content = await getContent('vi')
  const fish = content.species.find(s => s.id === 'paracheirodon-innesi')!
  const keys = ['quickFacts', 'beforeYouBuy', 'waterConditions', 'diet', 'habitat'] as const
  const sections = keys.map(key => ({ ...fish.sections[0]!, key }))
  const t = { ...fish.t, sections: Object.fromEntries(sections.map(s => [`${s.key}:${s.source}`, '<p>Fish care.</p>'])) }
  const figures = keys.slice(1).map((key, i) => ({ photo: { ...fish.photos[0]!, url: `https://example.com/${key}-${i}.webp` } }))
  const props = { sections, t, figures }
  const web = sectionParts('vi', content, props, { figuresAfterCare: true })
  expect([...web.figAfter.keys()]).toEqual([2, 3])
  expect([...web.figAfter.values()].flat()).toEqual(figures)
  expect([...sectionParts('vi', content, props).figAfter.keys()]).toEqual([0, 1, 2, 3])
})

test('the built-page check catches an inline photo before the first care section', async () => {
  const facts = await loadFacts(fileURLToPath(new URL('./fixture-content', import.meta.url)))
  const intro = '<section id="muc-quickFacts"></section><section id="muc-beforeYouBuy"></section>'
  const photo = '<figure class="inl"></figure>'
  const care = '<section id="muc-waterConditions"></section>'
  const problems = (body: string) => checkPage('/ca/ca-neon-xanh/', `<main><div class="body">${body}</div></main>`, facts)
  expect(problems(intro + photo + care)).toEqual([{ check: 'early-figure', detail: 'photo before #muc-waterConditions' }])
  expect(problems(intro + care + photo)).toEqual([])
  expect(problems(intro + photo)).toEqual([])
})
