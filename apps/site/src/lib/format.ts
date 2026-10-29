import type { DataCardField, Range } from '@aq/schema'

const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })
export const num = (n: number) => nf.format(n)
export const isRange = (v: Range | number): v is Range => typeof v === 'object'
export const range = (v: Range | number) => (isRange(v) ? (v.min === v.max ? num(v.min) : `${num(v.min)}–${num(v.max)}`) : num(v))

export const FIELD_LABELS: Record<DataCardField, string> = {
  tempC: 'Nhiệt độ', ph: 'pH', gh: 'Độ cứng (dGH)', sizeCm: 'Kích thước', tankCm: 'Bể tối thiểu', difficulty: 'Độ khó',
}
export const FIELD_ORDER: DataCardField[] = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'difficulty']

export const CATEGORY_LABELS: Record<string, string> = {
  'be-ca': 'Bể cá', loc: 'Lọc', 'thuc-an': 'Thức ăn', suoi: 'Sưởi', 'cay-thuy-sinh': 'Cây thủy sinh', 'phan-nen': 'Nền và lá', den: 'Đèn', co2: 'CO2', 'test-nuoc': 'Bộ test nước',
}
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c

/** Tracked affiliate link; the Worker resolves it to a checked product or a marketplace search (see worker/affiliate). */
export const goLink = (network: 'shopee' | 'lazada' | 'tiki', keyword: string, category: string, entity?: string) =>
  `/go/${network}/?${new URLSearchParams({ k: keyword, c: category, ...(entity ? { e: entity } : {}) })}`

export const GROUP_LABELS: Record<string, string> = {
  tetras: 'Cá tetra', cichlids: 'Cichlid', danios: 'Danio', rasboras: 'Rasbora', shrimp: 'Tép', loaches: 'Cá chạch', catfish: 'Cá da trơn', labyrinth: 'Cá mê cung',
}
export const groupLabel = (g: string) => GROUP_LABELS[g] ?? g

export const PLANT_LABELS = {
  difficulty: { 1: 'Dễ', 2: 'Trung bình', 3: 'Khó' } as Record<number, string>,
  light: { low: 'Yếu', medium: 'Trung bình', high: 'Mạnh' } as Record<string, string>,
  co2: { none: 'Không cần', optional: 'Tùy chọn', required: 'Bắt buộc' } as Record<string, string>,
  growth: { slow: 'Chậm', medium: 'Vừa', fast: 'Nhanh' } as Record<string, string>,
  placement: { foreground: 'Tiền cảnh', midground: 'Trung cảnh', background: 'Hậu cảnh', epiphyte: 'Bám đá, lũa', floating: 'Thả nổi' } as Record<string, string>,
}
export const GUIDE_KIND_LABELS: Record<string, string> = {
  setup: 'Setup bể', care: 'Chăm sóc', breeding: 'Sinh sản', disease: 'Bệnh', aquascaping: 'Bố cục', plantCare: 'Chăm cây', discovery: 'Khám phá',
}
