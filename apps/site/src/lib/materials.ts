import { MATERIAL_SECTION_ORDER, type Localized, type MaterialEntity } from '@aq/schema'
import { citeMark } from './cite'

type Material = Localized<MaterialEntity>
export const materialPath = (m: Material) => `/vi/vat-lieu/${m.t.slug}/`

/** Only groups with their own page appear. The count is the number of kinds, excluding the group's own page. */
export function materialGroups(materials: Material[]) {
  const order = ['lua', 'da', 'nen', 'la-qua-kho']
  const rank = (m: Material) => { const i = order.indexOf(m.id); return i < 0 ? order.length : i }
  return materials.filter(m => !m.parent)
    .sort((a, b) => rank(a) - rank(b) || a.t.name.localeCompare(b.t.name, 'vi'))
    .map(m => ({ material: m, kinds: materials.filter(k => k.parent === m.id).sort((a, b) => a.t.name.localeCompare(b.t.name, 'vi')) }))
}

/** Browse adds the current page's h1 after these linked ancestors. */
export function materialCrumbs(m: Material, materials: Material[]): [string, string][] {
  const parent = materials.find(p => p.id === m.parent)
  return [['/vi/', 'Trang chủ'], ['/vi/vat-lieu/', 'Vật liệu'], ...(parent ? [[materialPath(parent), parent.t.name] as [string, string]] : [])]
}

export const MATERIAL_HEADINGS = {
  about: 'Là gì',
  water: 'Ảnh hưởng tới nước',
  prepare: 'Xử lý trước khi dùng',
  suits: 'Hợp với cá và cây nào',
  mistakes: 'Lỗi hay gặp',
  buy: 'Mua ở đâu, chọn thế nào',
} as const

/** Fixed reading order, regardless of JSON key order. loadAll refuses references outside the source list. */
export function materialSections(m: Localized<MaterialEntity>) {
  return MATERIAL_SECTION_ORDER.flatMap(key => {
    const text = m.t.sections[key]
    if (!text?.trim()) return []
    const html = text.replace(/\[(\d+)\]/g, (_, number: string) => {
      const source = m.sources[Number(number) - 1]!
      return citeMark('vi', Number(number), source.title, source.url, { tip: 'AquaTome tổng hợp và tự viết', more: 'Mở bài gốc ↗' })
    })
    return [{ key, heading: MATERIAL_HEADINGS[key], html }]
  })
}
