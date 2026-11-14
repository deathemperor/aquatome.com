import { fileURLToPath } from 'node:url'
import { loadAll } from '@aq/schema'
import { expect, test } from 'vitest'
import { appIndex } from '../src/lib/app-index'
import { smallSrc } from '../src/lib/img'

const root = fileURLToPath(new URL('./fixture-content', import.meta.url))

test('the Vietnamese app index finds every material by its local and other-language names, with its own photo or none', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  const items = appIndex('vi', c).items.filter(i => i.kind === 'material')
  expect(items).toHaveLength(3)
  for (const m of c.materials) {
    const item = items.find(i => i.path === `/vi/vat-lieu/${m.t.slug}/`)!
    expect(item).toMatchObject({ kind: 'material', name: m.t.name, aka: [...m.t.altNames, ...m.names] })
    if (m.photos[0]) expect(item.img).toBe(smallSrc(m.photos[0]))
    else expect(item).not.toHaveProperty('img')
  }
  const noindex = { ...c, materials: c.materials.map(m => ({ ...m, t: { ...m.t, quality: { score: 0.2, indexable: false } } })) }
  expect(appIndex('vi', noindex).items.filter(i => i.kind === 'material')).toEqual(items)
})

test.each(['id', 'th', 'ms'] as const)('%s never lists materials, even with Vietnamese content supplied', async lang => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(c.materials.length).toBeGreaterThan(0)
  expect(appIndex(lang, c).items.some(i => i.kind === 'material' || i.path.includes('vat-lieu'))).toBe(false)
})
