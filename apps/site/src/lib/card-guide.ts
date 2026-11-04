import type { DataCardField, NeedKey, NeedLevel, TempWhy, Temperament, WaterWhy } from '@aq/schema'

/**
 * The page that explains the data card (pages/gioi-thieu/bang-du-lieu.astro), and where each of the card's labels
 * leads on it. One table, read by the card (DataCard.astro) and the page's own section ids, so a label can't point to a
 * section that isn't there. Text here is Vietnamese: a page shows it through t().
 */
export const CARD_GUIDE = '/vi/gioi-thieu/bang-du-lieu/'
export const FIELD_ANCHORS: Record<DataCardField, string> = {
  tempC: 'nhiet-do', ph: 'ph', gh: 'do-cung', sizeCm: 'kich-thuoc', lifeYears: 'tuoi-tho', tankCm: 'be-toi-thieu', difficulty: 'do-kho',
}
/** Where the page explains how one figure is chosen when sources disagree, and what each need's level means. */
export const CONFLICT_ANCHOR = 'nguon-khac-nhau'
export const NEEDS_ANCHOR = 'nhu-cau'
export const guideLink = (anchor: string) => `${CARD_GUIDE}#${anchor}`

/** A label's card on hover or tap (GlossaryTip): what the figure is, in a sentence or two. */
export const FIELD_TIPS: Record<DataCardField, string> = {
  tempC: 'Khoảng nhiệt độ nước mà cá sống khỏe, tính bằng °C.',
  ph: 'Độ chua của nước. pH dưới 7 là nước chua, trên 7 là nước kiềm.',
  gh: 'Lượng canxi và magie hòa trong nước, đo bằng dGH. Số càng nhỏ, nước càng mềm.',
  sizeCm: 'Chiều dài của cá khi trưởng thành.',
  lifeYears: 'Số năm cá sống trong bể, đúng như nguồn ghi.',
  tankCm: 'Chiều dài bể ngắn nhất cho cá trưởng thành. Đây là chiều dài, không phải thể tích.',
  difficulty: 'Thang từ 1 đến 8. Từ 1 đến 3 là dễ, 4 và 5 là vừa, 6 đến 8 là khó.',
}

/** The needs of "Vì sao độ khó này" (careNeeds in @aq/schema), their levels, and the words for why one isn't easy. */
export const NEED_LABELS: Record<NeedKey, string> = { space: 'Không gian', water: 'Nước', temperature: 'Nhiệt độ', temperament: 'Tính cách', social: 'Bầy đàn' }
export const LEVEL_WORDS: Record<NeedLevel, string> = { easy: 'Dễ', mid: 'Vừa', hard: 'Khó' }
export const WHY_WORDS: Record<WaterWhy | TempWhy, string> = {
  acid: 'nước chua', alkaline: 'nước kiềm', narrowPh: 'pH trong khoảng hẹp', soft: 'nước mềm', veryHard: 'nước rất cứng', narrowGh: 'độ cứng trong khoảng hẹp',
  warm: 'nước ấm', cool: 'nước mát', narrow: 'khoảng nhiệt độ hẹp',
}
/** The tank-mates tool's own words for a temperament (scripts/tankmates.ts), lower-cased in a need's line. */
export const TEMPERAMENT_WORDS: Record<Temperament, string> = { peaceful: 'Hiền', 'semi-aggressive': 'Hơi dữ', aggressive: 'Hung dữ', predator: 'Săn mồi' }
