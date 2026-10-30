import type { T } from '../lib/i18n'
import { msg } from '../i18n/msg'

/**
 * Tank volume by shape: the floor area (top view) × height, in cm → litres. Shapes and their measurements follow the
 * usual aquarium calculators; round tanks are entered by diameter, the way they are sold here.
 */
export type ShapeId = 'chu-nhat' | 'lap-phuong' | 'luc-giac' | 'bat-giac' | 'luc-giac-lung' | 'tru' | 'nua-tru' | 'goc-tron' | 'elip' | 'goc-ngu-giac' | 'chu-l' | 'goc-tam-giac'
export type Field = { key: string; label: string }
type D = Record<string, number>
type Shape = { name: string; fields: Field[]; area: (d: D) => number; height?: (d: D) => number; check?: (d: D, ct: T) => string | undefined }

const f = (key: string, label: string): Field => ({ key, label })
const L = f('l', msg('Dài')), W = f('w', msg('Rộng')), H = f('h', msg('Cao')), FRONT = f('f', msg('Kính trước')), END = f('e', msg('Kính hông'))
const shorter = (a: number, b: number, what: string, than: string, ct: T) => (a > b ? ct('{what} phải ngắn hơn {than}.', { what, than }) : undefined)

export const SHAPES: Record<ShapeId, Shape> = {
  'chu-nhat': { name: 'Chữ nhật', fields: [L, W, H], area: d => d.l! * d.w! },
  'lap-phuong': { name: 'Lập phương', fields: [f('l', msg('Cạnh'))], area: d => d.l! * d.l!, height: d => d.l! },
  // Elongated hexagon: front and back panes, a point at each end.
  'luc-giac': { name: 'Lục giác', fields: [L, W, H, FRONT], area: d => (d.w! * (d.l! + d.f!)) / 2, check: (d, ct) => shorter(d.f!, d.l!, ct('Kính trước'), ct('chiều dài'), ct) },
  'bat-giac': {
    name: 'Bát giác', fields: [L, W, H, FRONT, END],
    area: d => d.l! * d.w! - 2 * ((d.l! - d.f!) / 2) * ((d.w! - d.e!) / 2),
    check: (d, ct) => shorter(d.f!, d.l!, ct('Kính trước'), ct('chiều dài'), ct) ?? shorter(d.e!, d.w!, ct('Kính hông'), ct('chiều rộng'), ct),
  },
  // Flat back, square ends of depth E, two angled front corners.
  'luc-giac-lung': {
    name: 'Lục giác lưng phẳng', fields: [L, W, H, FRONT, END],
    area: d => d.l! * d.w! - ((d.l! - d.f!) / 2) * (d.w! - d.e!),
    check: (d, ct) => shorter(d.f!, d.l!, ct('Kính trước'), ct('chiều dài'), ct) ?? shorter(d.e!, d.w!, ct('Kính hông'), ct('chiều rộng'), ct),
  },
  tru: { name: 'Trụ tròn', fields: [f('d', msg('Đường kính')), H], area: d => Math.PI * (d.d! / 2) ** 2 },
  'nua-tru': { name: 'Nửa trụ', fields: [f('d', msg('Dài (lưng phẳng)')), H], area: d => (Math.PI * (d.d! / 2) ** 2) / 2 },
  'goc-tron': { name: 'Góc ¼ tròn', fields: [f('r', msg('Cạnh áp tường')), H], area: d => (Math.PI * d.r! ** 2) / 4 },
  elip: { name: 'Elip', fields: [L, W, H], area: d => Math.PI * (d.l! / 2) * (d.w! / 2) },
  // Corner pentagon: two walls of A, short sides B, a front pane across.
  'goc-ngu-giac': { name: 'Ngũ giác góc', fields: [f('a', msg('Cạnh áp tường')), f('b', msg('Cạnh ngắn')), H], area: d => d.a! ** 2 - (d.a! - d.b!) ** 2 / 2, check: (d, ct) => shorter(d.b!, d.a!, ct('Cạnh ngắn'), ct('cạnh áp tường'), ct) },
  // L-shape, each arm measured overall from the corner: the shared corner is counted once.
  'chu-l': {
    name: 'Chữ L', fields: [f('l1', msg('Dài nhánh 1')), f('w1', msg('Rộng nhánh 1')), f('l2', msg('Dài nhánh 2')), f('w2', msg('Rộng nhánh 2')), H],
    area: d => d.l1! * d.w1! + d.l2! * d.w2! - d.w1! * d.w2!,
    check: (d, ct) => shorter(d.w2!, d.l1!, ct('Rộng nhánh 2'), ct('dài nhánh 1'), ct) ?? shorter(d.w1!, d.l2!, ct('Rộng nhánh 1'), ct('dài nhánh 2'), ct),
  },
  'goc-tam-giac': { name: 'Tam giác góc', fields: [f('a', msg('Cạnh 1')), f('b', msg('Cạnh 2')), H], area: d => (d.a! * d.b!) / 2 },
}

export const GALLON_L = 3.785411784 // US gallon

/** Litres from the measurements in cm; `fill` (optional) is the water line from the bottom. */
export function shapeVolume(id: ShapeId, d: D, ct: T): { litres: number; gallons: number; filled?: number } | { error: string } {
  const s = SHAPES[id]
  for (const x of s.fields) if (!(d[x.key]! > 0)) return { error: ct('{label} phải lớn hơn 0.', { label: ct(x.label) }) }
  const problem = s.check?.(d, ct)
  if (problem) return { error: problem }
  const height = s.height?.(d) ?? d.h!
  if (d.fill !== undefined && !(d.fill > 0 && d.fill <= height)) return { error: ct('Mực nước phải lớn hơn 0 và không cao hơn bể.') }
  const area = s.area(d)
  const litres = (area * height) / 1000
  return { litres, gallons: litres / GALLON_L, ...(d.fill !== undefined && d.fill < height ? { filled: (area * d.fill) / 1000 } : {}) }
}

/** Glass of an open-top box (bottom + four sides), thickness in mm, at 2.5 kg per litre of glass. */
export function glassKg(lengthCm: number, widthCm: number, heightCm: number, mm: number) {
  const area = lengthCm * widthCm + 2 * (lengthCm + widthCm) * heightCm
  return (area * (mm / 10) * 2.5) / 1000
}

// Plate bending factor β by the pane's length ÷ water height (the table aquarium builders use).
const BETA: [number, number][] = [[0.5, 0.085], [0.667, 0.116], [1, 0.16], [1.5, 0.26], [2, 0.32], [2.5, 0.35], [3, 0.37]]
export const GLASS_STOCK_MM = [4, 5, 6, 8, 10, 12, 15, 19] as const
/** Float glass breaks at about 19.2 N/mm²; builders divide by a safety factor of 3.8. */
const ALLOWED = 19.2e6 / 3.8

/**
 * Front pane thickness for a glass box: t = √(β · ρgh · h² / σ). Returns the computed minimum (mm) and the stock
 * thickness to order, or null above 19 mm (a tank that size needs a builder's own calculation, bracing or laminated glass).
 */
export function glassThickness(lengthCm: number, waterCm: number): { min: number; order: number | null } {
  const r = lengthCm / waterCm
  const i = BETA.findIndex(([x]) => x >= r)
  const beta = i < 0 ? BETA.at(-1)![1] : i === 0 ? BETA[0]![1] : BETA[i - 1]![1] + ((r - BETA[i - 1]![0]) / (BETA[i]![0] - BETA[i - 1]![0])) * (BETA[i]![1] - BETA[i - 1]![1])
  const h = waterCm / 100
  const min = Math.round(Math.sqrt((beta * 9810 * h * h * h) / ALLOWED) * 10000) / 10 // mm, one decimal
  return { min, order: GLASS_STOCK_MM.find(t => t >= min) ?? null }
}
