import type { Range } from '@aq/schema'

/**
 * Typical water temperature of an indoor tank with no heater or chiller (°C). Rules of thumb, shown on the page
 * as assumptions (confirmed by the owner 2026-10-29): Hà Nội Dec–Feb, TP.HCM's cool nights Dec–Jan, hot season Apr–May (both regions in summer).
 */
export const VN_WATER = { northWinter: 16, southCool: 25, summer: 31 } as const

export type ClimateNote = { label: string; ok: boolean; text: string; temps: number[] }

/** What a species' temperature range means for a tank in Vietnam. Each `{t}` in text is filled by `temps` in order. */
export function vnClimate(t: Range | number): ClimateNote[] {
  const { min, max } = typeof t === 'number' ? { min: t, max: t } : t
  return [
    min > VN_WATER.northWinter
      ? { label: 'Mùa đông miền Bắc', ok: false, text: 'Cần sưởi: nước bể không sưởi xuống khoảng {t}, dưới mức tối thiểu {t}.', temps: [VN_WATER.northWinter, min] }
      : { label: 'Mùa đông miền Bắc', ok: true, text: 'Chịu được không sưởi (tối thiểu {t}).', temps: [min] },
    // "All year" only when the summer heat is within reach too: the south has the summer of the line below.
    min > VN_WATER.southCool
      ? { label: 'Miền Nam', ok: false, text: 'Nên có sưởi cho những đêm mát tháng 12–1, khi nước xuống khoảng {t}.', temps: [VN_WATER.southCool] }
      : max < VN_WATER.summer
        ? { label: 'Miền Nam', ok: false, text: 'Không cần sưởi, nhưng mùa nóng cần làm mát (xem dòng dưới).', temps: [] }
        : { label: 'Miền Nam', ok: true, text: 'Hợp nhiệt độ quanh năm, thường không cần sưởi.', temps: [] },
    max < VN_WATER.summer
      ? { label: 'Mùa hè cả nước', ok: false, text: 'Nước bể có thể lên {t}, trên mức tối đa {t}: đặt bể chỗ mát, dùng quạt hoặc máy làm lạnh.', temps: [VN_WATER.summer, max] }
      : { label: 'Mùa hè cả nước', ok: true, text: 'Chịu được nóng (tối đa {t}).', temps: [max] },
  ]
}
