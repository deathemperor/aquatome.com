import type { SectionKey } from '@aq/schema'

/** Reader order: can I keep it → what it needs → living with it → breeding → the wild. (Sources use their own order.) */
export const DISPLAY_ORDER: SectionKey[] = [
  'quickFacts', 'beforeYouBuy', 'aquariumSize', 'waterConditions', 'maintenance', 'equipment', 'diet',
  'behaviour', 'dimorphism', 'reproduction', 'distribution', 'habitat', 'notes', 'references',
]

/** Headings phrased as the questions a Vietnamese hobbyist asks. */
export const QUESTION_LABELS: Record<SectionKey, string> = {
  quickFacts: 'Thông tin nhanh', beforeYouBuy: 'Có nên mua không?', aquariumSize: 'Cần bể bao lớn?',
  waterConditions: 'Nước cần thế nào?', maintenance: 'Chăm sóc ra sao?', equipment: 'Cần thiết bị gì?', diet: 'Cho ăn gì?',
  behaviour: 'Nuôi chung với con gì?', dimorphism: 'Phân biệt đực cái thế nào?', reproduction: 'Sinh sản ra sao?',
  distribution: 'Ngoài tự nhiên sống ở đâu?', habitat: 'Môi trường tự nhiên', notes: 'Ghi chú', references: 'Tài liệu tham khảo',
}
