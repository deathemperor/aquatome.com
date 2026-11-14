import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll } from '@aq/schema'
import { appIndex } from '../src/lib/app-index'
import { PAGES, served } from '../src/lib/i18n'
import { dropHidden } from '../src/lib/hidden'
import { linkTargets } from '../src/lib/mentions'
import { materialSections } from '../src/lib/materials'

const root = fileURLToPath(new URL('./fixture-content', import.meta.url))
const content = () => loadAll({ root, lang: 'vi', publicBuild: false })

test('material sections keep their reading order, skip absent text and turn marks into cited sources', async () => {
  const m = (await content()).materials.find(m => m.id === 'lua-sa-tung')!
  const sections = materialSections({ ...m, t: { ...m.t, sections: { buy: m.t.sections.buy!, about: m.t.sections.about!, water: '' } } })
  expect(sections.map(s => s.key)).toEqual(['about', 'buy'])
  expect(sections.map(s => s.heading)).toEqual(['Là gì', 'Mua ở đâu, chọn thế nào'])
  expect(sections[0]!.html).toContain(`href="${m.sources[0]!.url}"`)
  expect(sections[1]!.html).toContain(`href="${m.sources[2]!.url}"`)
  expect(sections[1]!.html).toContain('class="cite"')
  expect(sections[1]!.html).not.toContain('[3]')
  expect(sections[1]!.html).not.toContain('dịch từ nguồn')
})

test('materials enter the app index without changing automatic guide link targets', async () => {
  const c = await content()
  expect(c.materials.length).toBe(3)
  const without = { ...c, materials: [] }
  expect(appIndex('vi', c).items.filter(i => i.kind !== 'material')).toEqual(appIndex('vi', without).items)
  expect(linkTargets(c)).toEqual(linkTargets(without))
})

test('no material routes are mounted in other languages, even if translations arrive', () => {
  for (const lang of ['id', 'th', 'ms'] as const) {
    expect(PAGES[lang].some(p => p.startsWith('vat-lieu/'))).toBe(false)
    expect(served(lang, '/vi/vat-lieu/lua/')).toBe(false)
  }
})

test('the owner can hide a material by its current or old Vietnamese address', async () => {
  const c = await content()
  for (const path of ['/vat-lieu/lua/', '/vi/vat-lieu/lua/']) {
    // readHidden normalizes the old form before dropHidden, as it does for every other kind.
    const hidden = new Set([path.replace(/^\/vi\//, '/')])
    expect(dropHidden(c, hidden).materials.map(m => m.id)).toEqual(['lua-mopani', 'lua-sa-tung'])
  }
})
