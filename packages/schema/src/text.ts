/** Letters only Vietnamese uses, or its words for fish and shrimp ("Cá Ping Pong – …", "Tép Blue Dream"): plain á, é… alone are Spanish and Portuguese too. */
export const isVietnamese = (s: string) => /[ăĩũạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]|(?<!\p{L})(cá|tép)(?!\p{L})/iu.test(s)

const VIETNAMESE_LETTER = /[ăĩũạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]/iu
/**
 * Another language's HTML with the Vietnamese names in it marked as Vietnamese: a run of capitalised words with a letter
 * only Vietnamese uses ("sungai Đồng Nai di Vietnam") goes in `<span lang="vi">`, so screen readers say it as Vietnamese
 * and the check for Vietnamese left on Indonesian and Thai pages (e2e invariants) passes over it. Vietnamese left
 * untranslated has lower-case Vietnamese words ("bể thủy sinh", "Hướng dẫn cách …"), which stay unmarked and still show.
 */
export function markVietnameseNames(html: string): string {
  let inVi = 0 // inside a span already marked Vietnamese (its own spans counted, to find its end)
  return html.split(/(<[^>]*>)/).map(part => {
    if (part.startsWith('<')) {
      if (/^<span\b/i.test(part) && (inVi || /\slang="vi"/.test(part))) inVi++
      else if (inVi && /^<\/span>/i.test(part)) inVi--
      return part
    }
    return inVi ? part : part.replace(/\p{Lu}[\p{L}\p{M}]*(?:[ \u00a0]+\p{Lu}[\p{L}\p{M}]*)*/gu, run => (VIETNAMESE_LETTER.test(run) ? `<span lang="vi">${run}</span>` : run))
  }).join('')
}

/** The five tone marks, decomposed: huyền, sắc, ngã, hỏi, nặng. */
const TONE = /[\u0300\u0301\u0303\u0309\u0323]/gu
/**
 * One key for a Vietnamese name whichever vowel of a word its tone mark sits on, the old placing or the new: "Oxy hoà tan"
 * and "Oxy hòa tan" are one name, as are "thuỷ" and "thủy" (the chief of staff, 19 Nov 2026, after "Oxy hoà tan" came back
 * as Oxy hòa tan's other name). Case folded; every other mark stays where it is, so "hóa" and "hoa", "ô" and "o" stay apart.
 */
export const toneKey = (s: string) => s.normalize('NFD').toLowerCase().replace(/[\p{L}\p{M}]+/gu, w => w.replace(TONE, '') + (w.match(TONE) ?? []).join('')).normalize('NFC')

/**
 * Two names a reader can't tell apart get the same key: the tank-mates picker's folding (accents off, đ → d, lower case,
 * punctuation dropped; Thai keeps its marks) with the spaces dropped too, since Thai writes one name with or without them
 * ("อนูเบียสนานา", "อนูเบียส นานา").
 */
export const nameKey = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '')
