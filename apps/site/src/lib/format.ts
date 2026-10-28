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
  'be-ca': 'Bể cá', loc: 'Lọc', 'thuc-an': 'Thức ăn', suoi: 'Sưởi', 'cay-thuy-sinh': 'Cây thủy sinh', 'phan-nen': 'Phân nền', den: 'Đèn',
}
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c

export const shopeeSearch = (k: string) => `https://shopee.vn/search?keyword=${encodeURIComponent(k)}`
export const lazadaSearch = (k: string) => `https://www.lazada.vn/catalog/?q=${encodeURIComponent(k)}`

export const GROUP_LABELS: Record<string, string> = {
  tetras: 'Cá tetra', cichlids: 'Cichlid', danios: 'Danio', rasboras: 'Rasbora', shrimp: 'Tép', loaches: 'Cá chạch', catfish: 'Cá da trơn', labyrinth: 'Cá mê cung',
}
export const groupLabel = (g: string) => GROUP_LABELS[g] ?? g
