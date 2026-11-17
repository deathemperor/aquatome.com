import { expect, test } from 'vitest'
import { parse } from 'node-html-parser'
import { kindAiLabel, kindLargeFallback } from '../src/lib/glossary-kind-image'
import { LANGS, loadAll, type Photo } from '@aq/schema'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { appIndex } from '../src/lib/app-index'
import { glossaryDoc, listedPaths } from '../src/lib/app-page'
import { glossaryParts, kindCardImage, kindCredit } from '../src/lib/glossary-page'
import { translator } from '../src/lib/i18n'
import { buildCatalog } from '../worker/fishid/catalog'
import { buildFacts } from '../worker/fishid/facts'

const caption = 'Hình minh họa do AI tạo, không phải ảnh chụp sản phẩm: lớp cốt nền nằm dưới lớp phân nền.'
const p: Photo = { url: 'https://media.aquatome.com/generated/glossary/fixture.webp', width: 1448, height: 1086, author: 'AI', licence: 'AI-generated', sourceUrl: 'https://aquatome.com/thuat-ngu/nen-be/', caption, generated: { model: 'unreported', driverModel: 'gpt-6.1-sol', date: '2026-11-17', prompt: 'Two layers.', referenceHash: 'a'.repeat(64), pixelHash: 'b'.repeat(64) } }
const crop = { x0: 240, y0: 360, x1: 1208, y1: 1086 }

test('the kind card frames the lower layers and the full image address stays available for the large view', () => {
  const card = kindCardImage(p, crop)
  expect(card.src).toBe(p.url)
  expect(card.style).toContain('width:149.58678%')
  expect(card.style).toContain('height:149.58678%')
  expect(card.style).toContain('top:-49.58678%')
  expect(card.style).toContain('left:-24.79339%')
  expect(kindCardImage(p, { ...crop, y1: 2000 }).style).toBeUndefined()
  const { generated: _, ...real } = p
  expect(kindCardImage(real, crop)).toEqual({ src: real.url })
})

for (const lang of LANGS) test(`${lang}: a generated kind is credited as AI without a misleading original-photo link`, () => {
  const credit = kindCredit(lang, p).html
  expect(credit).toBe(translator(lang)('Ảnh do AI tạo'))
  expect(credit).not.toContain('<a')
  expect(credit).not.toContain('AI-generated')
})

for (const lang of LANGS) test(`${lang}: a kind's stand-in uses its position caption and changes no app page or index data`, async () => {
  const c = await loadAll({ root: fileURLToPath(new URL('./fixture-content', import.meta.url)), lang: 'vi', publicBuild: false })
  const original = c.glossary.find(g => g.id === 'lua')!
  const g = { ...original, photos: [], kinds: [], t: { ...original.t, body: '<h3>Các loại nền</h3><ul><li><strong>Cốt nền</strong>: Có loại hạt nâu 1–3 mm, có loại xốp.</li></ul>' } }
  const before = { ...c, glossary: c.glossary.map(x => x.id === g.id ? g : x) }
  const generated = { ...g, kinds: [{ id: 'cot-nen', photo: p, cardCrop: crop }] }
  const after = { ...c, glossary: c.glossary.map(x => x.id === g.id ? generated : x) }
  const item = glossaryParts(lang, after, generated).kinds!.items.find(k => k.id === 'cot-nen')!
  expect(item.line).toBe(caption)
  expect(item.cardCrop).toEqual(crop)
  expect(glossaryParts(lang, after, generated).photo).toBeUndefined()
  const priorIndex = appIndex(lang, before), nextIndex = appIndex(lang, after)
  expect(nextIndex).toEqual(priorIndex)
  expect(glossaryDoc(lang, after, generated, listedPaths(lang, after))).toEqual(glossaryDoc(lang, before, g, listedPaths(lang, before)))
  const catalog = (pages: typeof c) => buildCatalog([{ lang: 'vi', pages, at: path => path }], (photo: Photo) => photo.url)
  const oldCatalog = catalog(before), newCatalog = catalog(after)
  expect(newCatalog.entries.length).toBeGreaterThan(0)
  expect(newCatalog).toEqual(oldCatalog)
  expect(buildFacts(newCatalog, after, (photo: Photo) => photo.url)).toEqual(buildFacts(oldCatalog, before, (photo: Photo) => photo.url))
  expect(JSON.stringify(newCatalog)).not.toContain(p.url)
  expect(JSON.stringify(nextIndex)).not.toContain(p.url)
  expect(JSON.stringify(glossaryDoc(lang, after, generated, listedPaths(lang, after)))).not.toContain(p.url)
})

for (const lang of LANGS) test(`${lang}: the actual card and large-view markup labels a stand-in in Design's top corner, even without script`, () => {
  for (const view of ['card', 'large'] as const) {
    const label = parse(kindAiLabel(lang, p, view)).querySelector('[data-ai-kind-label]')!
    expect(label.text).toBe(translator(lang)('Ảnh do AI tạo'))
    expect(label.getAttribute('data-ai-kind-label')).toBe(view)
    const inset = view === 'card' ? '8pt' : '16pt'
    expect(label.getAttribute('style')).toContain(`top:${inset};left:${inset}`)
    expect(label.getAttribute('style')).not.toContain('bottom:')
    const right = parse(kindAiLabel(lang, p, view, 'top-right')).querySelector('span')!
    expect(right.getAttribute('style')).toContain(`top:${inset};right:${inset}`)
    expect(right.getAttribute('style')).not.toContain('left:')
  }
  const fallback = parse(kindLargeFallback(p, 'Fixture'))
  expect(fallback.querySelector('noscript img')?.getAttribute('src')).toBe(p.url)
  expect(fallback.querySelector('img')?.getAttribute('alt')).toBe(caption)
  const { generated: _, ...real } = p
  expect(kindAiLabel(lang, real, 'card')).toBe('')
  expect(kindAiLabel(lang, real, 'large')).toBe('')
  expect(kindLargeFallback(real, 'Fixture')).toBe('')
})

// Counts/hashes only: a failure must not print the real content's personal credit names.
for (const lang of LANGS) test(`${lang}: the glossary-only switch with no approval changes neither real content nor app data`, async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const before = await loadAll({ root, lang, publicBuild: true, glossaryKindImages: false })
  const after = await loadAll({ root, lang, publicBuild: true, glossaryKindImages: true })
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
  expect(hash(after)).toBe(hash(before))
  expect(hash(appIndex(lang, after))).toBe(hash(appIndex(lang, before)))
  const docs = (c: typeof before) => c.glossary.map(g => glossaryDoc(lang, c, g, listedPaths(lang, c)))
  expect(hash(docs(after))).toBe(hash(docs(before)))
})
