import { expect, test } from 'vitest'
import { processPage } from '../src/process'
import type { Llm } from '../src/claude'

const species = {
  kind: 'species', scientificName: 'Paracheirodon axelrodi', enCommonNames: ['Cardinal Tetra'], viName: 'Cá neon vua', viAltNames: [],
  group: 'tetras', places: [{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }],
  dataCard: { tempC: { min: 23, max: 29 }, ph: { min: 3.5, max: 7.5 }, difficulty: 3 },
  sections: [
    { key: 'habitat', en: '<p>Blackwater streams.</p>', vi: '<p>Suối nước đen.</p>' },
    { key: 'history', en: '<p>x</p>', vi: '<p>y</p>' },
    { key: 'diet', en: '<p>Small foods.</p>', vi: '<script>alert(1)</script><p onclick="x">Thức ăn nhỏ.</p>' },
  ],
  productSlots: [{ category: 'thuc-an', keywords: ['thức ăn cá tetra'] }],
}
const input = { source: 'seriouslyfish' as const, url: 'https://x', title: 'T', outline: 'O', glossary: [] }
const fake = (...replies: unknown[]): Llm & { calls: number } => {
  const f = (async () => { f.calls++; const r = replies.shift(); if (r instanceof Error) throw r; return r }) as unknown as Llm & { calls: number }
  f.calls = 0
  return f
}

test('valid species passes, unknown section keys are dropped, html is sanitised', async () => {
  const p = await processPage(fake(structuredClone(species)), input)
  expect(p.kind).toBe('species')
  expect(p.sections.map(s => s.key)).toEqual(['habitat', 'diet'])
  expect(p.sections[1]!.vi).toBe('<p>Thức ăn nhỏ.</p>')
})
test('species without a scientific name becomes skip', async () => {
  const { scientificName: _, ...noName } = structuredClone(species)
  expect((await processPage(fake(noName), input)).kind).toBe('skip')
})
test('invalid output is retried once', async () => {
  const llm = fake({ kind: 'banana' }, structuredClone(species))
  expect((await processPage(llm, input)).kind).toBe('species')
  expect(llm.calls).toBe(2)
})
test('invalid output twice throws', async () => {
  await expect(processPage(fake({ kind: 'banana' }, { kind: 'banana' }), input)).rejects.toThrow()
})
test('guide body is sanitised', async () => {
  const g = { kind: 'guide', enCommonNames: [], viName: 'Setup', viAltNames: [], places: [], dataCard: {}, sections: [], productSlots: [], guide: { kind: 'setup', viTitle: 'Setup bể', viBody: '<p>Ok</p><iframe src=x></iframe>' } }
  expect((await processPage(fake(g), input)).guide?.viBody).toBe('<p>Ok</p>')
})

test('implausible data-card numbers are dropped, swapped ranges fixed', async () => {
  const bad = structuredClone(species) as Record<string, unknown>
  bad.dataCard = { tempC: { min: 75, max: 82 }, ph: { min: 7.5, max: 6 }, gh: { min: 2, max: 400 }, sizeCm: 4, tankCm: 0 }
  const p = await processPage(fake(bad), input)
  expect(p.dataCard).toEqual({ ph: { min: 6, max: 7.5 }, sizeCm: 4 })
})
test('a tank length that is the page\'s tank volume is dropped from the card', async () => {
  const volume = { ...structuredClone(species), dataCard: { ...species.dataCard, tankCm: 75 },
    sections: [{ key: 'aquariumSize', en: '<p>Minimum tank size: 75 litres (20 gallons).</p>', vi: '<p>Bể tối thiểu: 75 lít.</p>' }] }
  expect((await processPage(fake(volume), input)).dataCard.tankCm).toBeUndefined()
  const length = { ...volume, sections: [{ key: 'aquariumSize', en: '<p>A tank 75 cm long (75 litres).</p>', vi: '<p>Bể dài 75 cm.</p>' }] }
  expect((await processPage(fake(length), input)).dataCard.tankCm).toBe(75)
})
