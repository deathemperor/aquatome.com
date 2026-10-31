import { nearEmptyKeys, plainText, SECTION_LABELS, type Section, type SectionKey, type Translation } from '@aq/schema'

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

const BLOCK = /<\/?(p|ul|ol|li|div|br)\b[^>]*>/gi
/** A heading whose whole text (the source's) is "Unknown.": nothing to show, as a section or a quick fact. */
const UNKNOWN = /^(unknown|not known|uncertain)( at (this time|present))?\.?$/i
const tokens = (html: string) => plainText(html).toLowerCase().split(/[\s,.;:!?()"“”'‘’–-]+/).filter(Boolean)

/** Quick facts already say it: most of its words are in them ("Sinh sản: ấp trứng bằng miệng" and "Cá ấp trứng bằng miệng."). */
function said(facts: string, html: string): boolean {
  const have = plainText(facts).toLowerCase()
  const words = tokens(html)
  return words.length > 0 && words.filter(w => have.includes(w)).length / words.length >= 0.75
}

/** One more list item at the end of a block: inside its last list, else in a list of its own. */
const appendItem = (html: string | undefined, item: string) => {
  const end = html?.lastIndexOf('</ul>') ?? -1
  return !html ? `<ul>${item}</ul>` : end >= 0 ? `${html.slice(0, end)}${item}${html.slice(end)}` : `${html}<ul>${item}</ul>`
}

/**
 * A heading with only a few words under it, all sources together ("Sinh sản ra sao?" over "Mouthbrooder.") doesn't stand
 * as a section of its own: the fact joins its source's quick facts (so its source mark stays right), or is left out when
 * they already say it. Which headings fold is decided on the source text (@aq/schema depth.ts), the same in every language.
 * The English quick facts get the same item, so the two lists still match item for item (@aq/schema card-facts).
 */
export function foldNearEmpty(sections: Section[], t: Translation, label: (vi: string) => string): { sections: Section[]; t: Translation } {
  const fold = nearEmptyKeys(sections)
  if (!fold.size) return { sections, t }
  const vi = { ...t.sections }
  const out = sections.filter(s => !fold.has(s.key))
  for (const s of sections.filter(x => fold.has(x.key))) {
    const html = vi[`${s.key}:${s.source}`]
    delete vi[`${s.key}:${s.source}`]
    const facts = `quickFacts:${s.source}`
    if (!html || !plainText(html) || UNKNOWN.test(plainText(s.html)) || said(vi[facts] ?? '', html)) continue
    const flat = (h: string) => h.replace(BLOCK, ' ').replace(/\s+/g, ' ').trim()
    vi[facts] = appendItem(vi[facts], `<li><strong>${label(SECTION_LABELS.vi[s.key])}:</strong> ${flat(html)}</li>`)
    const i = out.findIndex(x => x.key === 'quickFacts' && x.source === s.source)
    const en = `<li>${s.key}: ${flat(s.html)}</li>`
    if (i >= 0) out[i] = { ...out[i]!, html: appendItem(out[i]!.html, en) }
    else out.unshift({ key: 'quickFacts', source: s.source, sourceUrl: s.sourceUrl, html: `<ul>${en}</ul>` })
  }
  return { sections: out, t: { ...t, sections: vi } }
}
