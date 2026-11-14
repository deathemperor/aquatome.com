import { MATERIAL_SECTION_ORDER, type Localized, type MaterialEntity } from '@aq/schema'
import { citeMark } from './cite'

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
