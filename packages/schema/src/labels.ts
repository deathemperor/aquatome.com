import type { Lang, SectionKey } from './types'

export const SECTION_LABELS: Record<Lang, Record<SectionKey, string>> = {
  vi: {
    quickFacts: 'Thông tin nhanh', beforeYouBuy: 'Trước khi mua', distribution: 'Phân bố', habitat: 'Môi trường sống',
    aquariumSize: 'Kích thước bể', maintenance: 'Chăm sóc', waterConditions: 'Thông số nước', equipment: 'Thiết bị gợi ý',
    diet: 'Thức ăn', behaviour: 'Tập tính & khả năng sống chung', dimorphism: 'Phân biệt đực cái', reproduction: 'Sinh sản',
    notes: 'Ghi chú', references: 'Tài liệu tham khảo',
  },
}
