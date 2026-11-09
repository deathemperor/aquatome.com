/**
 * The first line: what Claude writes for the reader to see while it reads (the wait's box, above the steps; the Design
 * Lead's brief), checked here before it is shown. It is Claude's own words before anything says whether the question is
 * about fishkeeping, so a line that could send the reader anywhere or embarrass the product is never shown: the wait then
 * looks as it does without one. A line dropped costs nothing but the line.
 */
import { reaches } from './contacts'
import type { Lang } from './handbook'

/** The longest line shown, in characters as the reader sees them; the prompt asks for under 160 (the box holds about that). */
export const OPENING_CHARS = 200
const MIN_CHARS = 10

/**
 * Words a line never holds: profanity and slurs in the four languages and English, and the comments' spam terms
 * (comments/rules.ts). Whole words where the language spaces its words; Thai, anywhere in the line. Only forms that
 * can't be an ordinary word: "lon" (a can), "babi" (a pig) and "anjing" (a dog) aren't here, as a fish page says them.
 */
const SPACED = [
  // Vietnamese
  'địt', 'đụ', 'đéo', 'lồn', 'buồi', 'cặc', 'đĩ', 'đcm', 'đmm', 'đkm', 'vcl', 'vkl', 'clgt', 'óc chó', 'mẹ mày', 'bố mày',
  'thằng chó', 'con chó cái', 'khốn nạn', 'mất dạy', 'súc vật', 'đồ ngu', 'thằng ngu', 'con ngu',
  // Indonesian and Malay
  'bangsat', 'kontol', 'memek', 'ngentot', 'entot', 'goblok', 'tolol', 'bajingan', 'jancok', 'jancuk', 'brengsek', 'keparat',
  'pukimak', 'puki', 'sundal', 'pelacur', 'lancau', 'butoh', 'babi kau', 'anjing kau', 'bodoh kau',
  // English
  'fuck', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'whore', 'slut', 'bastard', 'nigger', 'nigga', 'faggot', 'retard',
  'sex', 'porn', 'xxx',
  // The comments' spam terms
  'casino', 'cá cược', 'nhà cái', 'cho vay', 'vay tiền', 'xổ số', 'lô đề', 'viagra', 'judi', 'slot gacor', 'togel', 'pinjol',
]
const THAI = ['เหี้ย', 'ควย', 'เย็ด', 'สัส', 'ไอ้สัตว์', 'อีสัตว์', 'ระยำ', 'ชาติหมา', 'อีดอก', 'ส้นตีน', 'มึง', 'สล็อต', 'บาคาร่า', 'แทงบอล', 'เว็บพนัน', 'กู้เงิน']
const WORD = new RegExp(`(?<![\\p{L}\\p{N}])(?:${SPACED.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'iu')

/**
 * Letters only Vietnamese writes: its marked vowels and đ. An Indonesian or Malay line with one is Vietnamese at least in
 * part (it began "Mình sedang…" now and then); a Vietnamese line has them, a Thai one is in Thai script.
 */
const VIET = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/iu
const THAI_SCRIPT = /[\u0E00-\u0E7F]/u
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
  if (WORD.test(t) || THAI.some(w => t.includes(w))) return 'a word it never shows'
  if (/<|>/.test(t) || reaches(t)) return 'something that could send the reader elsewhere'
  // One sentence: a second was, now and then, the line's own aside on what the post asked of it ("I won't write…"). A
  // sentence ends on a word's last letter or a figure, then a capital or a figure starts the next: "v.v.", "TP. HCM", a
  // quoted question ("“Vì sao…?” ") and "…" mid-line end none. Thai, which marks no sentence's end, has no second.
  if (/(?<=\p{Ll}{2}|\p{N})[.!?…]+["'”’»)\]]*\s+[\p{Lu}\p{N}]/u.test(t)) return 'more than one sentence'
  return undefined
}

/** The line as shown (trimmed), or undefined when it isn't. */
export function openingOf(text: unknown, lang: Lang): string | undefined {
  if (typeof text !== 'string') return undefined
  // Runs of spaces count as one; a line break stays, so a second line is seen.
  const t = text.trim().replace(/[^\S\n]+/g, ' ')
  return openingFault(t, lang) ? undefined : t
}
