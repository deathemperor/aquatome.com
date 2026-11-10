/**
 * The first line: what Claude writes for the reader to see while it reads (the wait's box, above the steps; the Design
 * Lead's brief), checked here before it is shown. It is Claude's own words before anything says whether the question is
 * about fishkeeping, so a line that could send the reader anywhere or embarrass the product is never shown: the wait then
 * looks as it does without one. A line dropped costs nothing but the line.
 */
import { rudeWord } from '../moderation/words'
import { reaches } from './contacts'
import type { Lang } from './handbook'

/** The longest line shown, in characters as the reader sees them; the prompt asks for under 150, and the editors would sooner a line of about 180 than none. */
export const OPENING_CHARS = 200
const MIN_CHARS = 10

/**
 * Words a line never holds beyond the shared list (moderation/words.ts): the comments' spam terms (comments/rules.ts), and
 * what a reader's comment may say but Claude's own line needn't ("súc vật" of livestock, "เหี้ย" of a lizard), since a
 * line dropped costs nothing but the line. Whole words where the language spaces its words; Thai, anywhere in the line.
 */
const SPACED = [
  'óc chó', 'mẹ mày', 'bố mày', 'con chó cái', 'súc vật', 'retard', 'sex', 'porn', 'xxx',
  // The comments' spam terms
  'casino', 'cá cược', 'nhà cái', 'cho vay', 'vay tiền', 'xổ số', 'lô đề', 'viagra', 'judi', 'slot gacor', 'togel', 'pinjol',
]
const THAI = ['เหี้ย', 'มึง', 'สล็อต', 'บาคาร่า', 'แทงบอล', 'เว็บพนัน', 'กู้เงิน']
const WORD = new RegExp(`(?<![\\p{L}\\p{N}])(?:${SPACED.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu')

/**
 * Letters only Vietnamese writes: its marked vowels and đ. An Indonesian or Malay line with one is Vietnamese at least in
 * part (it began "Mình sedang…" now and then); a Vietnamese line has them, a Thai one is in Thai script.
 */
const VIET = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu
const THAI_SCRIPT = /[\u0E00-\u0E7F]/u
/** Where a line went wrong by opening on anything else: "Bạn muốn tra…" makes the reader the one looking; "Mari semak…" invites them to (the editors, 2026-11-10). */
/** The line saying what it won't write, in one sentence: what the post asked of it, and the sentence check doesn't see it. */
const REFUSES = /(?:nggak|ngga|gak|tidak|tak|không|ไม่)\s*(?:akan\s*|mau\s*|จะ\s*)?(?:menulis|nulis|tulis|ghi|viết|เขียน)|(?:sẽ không|จะไม่)\s*(?:ghi|viết|เขียน)|(?:nggak|ngga|gak|tidak|tak)\s+akan\s+(?:saya\s+|aku\s+|ku)\p{L}|(?:kamu|anda|bạn|คุณ)\s*(?:minta|suruh|menyuruh|yêu cầu|ขอให้|สั่ง)|(?:bukan|không phải|ไม่ใช่)\s*(?:soalan|pertanyaan|câu hỏi|คำถาม)/iu
const OPENS: Record<Lang, string> = { vi: 'Mình đang tra cẩm nang', id: 'Aku lagi cek panduan', ms: 'Saya sedang semak buku panduan', th: 'เรากำลังเปิดคู่มือดูว่า' }
/** Malay that reads as a translation's, or broken: a form no reader writes, or a word typed twice (Malay joins a doubled word with a hyphen). */
const MALAY_ODD = /(?<![\p{L}\p{N}])(?:awak|bahawa yang|soalan bahawa|halaman ms|untuk jawapan|untuk soalan)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}-])(\p{L}{2,})\s+\1(?![\p{L}\p{N}-])/iu
const inLang = (t: string, lang: Lang) =>
  lang === 'th' ? THAI_SCRIPT.test(t) && !VIET.test(t) : !THAI_SCRIPT.test(t) && (lang === 'vi' ? VIET.test(t) : !VIET.test(t))

/** Why a line isn't shown, or undefined when it may be. */
export function openingFault(text: string, lang: Lang): string | undefined {
  const t = text.normalize('NFC')
  const n = [...t].length
  if (n < MIN_CHARS) return 'too short'
  if (n > OPENING_CHARS) return 'too long'
  if (/\n/.test(t)) return 'more than one line'
  if (!inLang(t, lang)) return 'not in the reader\'s language'
  if (rudeWord(t) || WORD.test(t) || THAI.some(w => t.includes(w))) return 'a word it never shows'
  if (/<|>/.test(t) || reaches(t)) return 'something that could send the reader elsewhere'
  // One sentence: a second was, now and then, the line's own aside on what the post asked of it ("I won't write…"). A
  // sentence ends on a word's last letter or a figure, then a capital or a figure starts the next: "v.v.", "TP. HCM", a
  // quoted question ("“Vì sao…?” ") and "…" mid-line end none. Thai, which marks no sentence's end, has no second.
  if (/(?<=\p{Ll}{2}|\p{N})[.!?…]+["'”’»)\]]*\s+[\p{Lu}\p{N}]/u.test(t)) return 'more than one sentence'
  if (REFUSES.test(t)) return 'says what it won\'t write'
  if (!t.startsWith(OPENS[lang])) return 'doesn\'t open with the chat\'s own words'
  if (lang === 'ms' && MALAY_ODD.test(t)) return 'Malay no reader writes'
  return undefined
}

/** The line as shown (trimmed), or undefined when it isn't. */
export function openingOf(text: unknown, lang: Lang): string | undefined {
  if (typeof text !== 'string') return undefined
  // Runs of spaces count as one; a line break stays, so a second line is seen.
  const t = text.trim().replace(/[^\S\n]+/g, ' ')
  return openingFault(t, lang) ? undefined : t
}
