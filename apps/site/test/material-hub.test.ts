import { fileURLToPath } from 'node:url'
import { loadAll } from '@aq/schema'
import { expect, test } from 'vitest'
import { materialCrumbs, materialGroups, materialPath } from '../src/lib/materials'
import { glossaryParts } from '../src/lib/glossary-page'
import { glossaryDoc } from '../src/lib/app-page'
import { dropHidden } from '../src/lib/hidden'

const root = fileURLToPath(new URL('./fixture-content', import.meta.url))
const content = () => loadAll({ root, lang: 'vi', publicBuild: false })

test('hub groups have their own page, in editorial order then Vietnamese name order, and count only their kinds', async () => {
  const c = await content()
  const base = c.materials.find(m => m.id === 'lua')!
  const other = (id: string, name: string) => ({ ...base, id, t: { ...base.t, slug: id, name } })
  const groups = materialGroups([other('z', 'Vỏ sò'), other('nen', 'Nền'), ...c.materials.slice().reverse(), other('da', 'Đá'), other('a', 'Cát'), other('la-qua-kho', 'Lá và quả khô')])
  expect(groups.map(g => g.material.id)).toEqual(['lua', 'da', 'nen', 'la-qua-kho', 'a', 'z'])
  expect(groups[0]!.kinds.map(m => m.id)).toEqual(['lua-mopani', 'lua-sa-tung'])
  expect(groups[0]!.kinds.map(materialPath)).toEqual(['/vi/vat-lieu/lua-mopani/', '/vi/vat-lieu/lua-sa-tung/'])
  expect(groups.slice(1).every(g => g.kinds.length === 0)).toBe(true)
  const hidden = dropHidden(c, new Set(['/vat-lieu/lua/']))
  expect(materialGroups(hidden.materials)).toEqual([])
})

test('every material has the home and hub crumbs, then its parent when it has a page', async () => {
  const c = await content()
  for (const m of c.materials) {
    expect(materialCrumbs(m, c.materials)).toEqual([
      ['/vi/', 'Trang chủ'], ['/vi/vat-lieu/', 'Vật liệu'], ...(m.parent ? [['/vi/vat-lieu/lua/', 'Lũa']] : []),
    ])
  }
})

test('a glossary term links only its matching material, and its app copy carries the same link and words', async () => {
  const c = await content()
  const term = c.glossary.find(g => g.id === 'lua')!
  const link = { href: '/vi/vat-lieu/lua/', text: 'Xem trang Lũa: cách chọn, xử lý và các loại lũa →' }
  expect(glossaryParts('vi', term, c).material).toEqual(link)
  expect(glossaryDoc('vi', term, c).blocks.at(-1)).toEqual({ t: 'p', c: [link] })
  expect(glossaryParts('vi', c.glossary.find(g => g.id === 'ph')!, c).material).toBeUndefined()
  expect(glossaryParts('vi', term, { materials: [] }).material).toBeUndefined()
  for (const lang of ['id', 'th', 'ms'] as const) {
    expect(glossaryParts(lang, term, c).material).toBeUndefined()
    expect(JSON.stringify(glossaryDoc(lang, term, c))).not.toContain('vat-lieu')
  }
})
