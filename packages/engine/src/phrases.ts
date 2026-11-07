import { readFileSync } from 'node:fs'
import type { WrittenLang } from '@aq/schema'

/**
 * Per language the engine writes: words and turns it writes far more often than that language's hobbyists do, each with
 * what they write instead. Found by comparing the site's text with hobbyists' own writing in that language (forums and
 * blogs, kept out of the repository), and checked by the editors (.claude/skills/editors/SKILL.md);
 * docs/review/phrases.md has the method and each phrase's counts. Three readers:
 * - the writers' prompts (VI_STYLE for Vietnamese);
 * - the `phrasing` content rule, which lists them (never a held count: a model can still write one, and only a model can
 *   mend it);
 * - the style rewrite, `rewrite-vi --match`, through phraseMatch.
 * A swap that is right in every sentence goes in sanitize.ts WORDING instead, which the sweep makes on every page.
 */
export type Phrase = {
  /** What the writer is told to avoid, as the prompt and the report show it. */
  say: string
  /** What hobbyists write instead, in the same language, for the prompt and the report. */
  instead: string
  /** The words on a page: a regular expression's source, matched case-blind (whole words where the language spaces them). Defaults to `say`. */
  find?: string
}

export const PHRASES: Partial<Record<WrittenLang, Phrase[]>> = {
  // 2026-11-07: the site's Vietnamese (3.3M words) against a Vietnamese fish-keeping forum (1.5M words, 2007–2020) and
  // the transcripts of Vietnamese planted-tank videos (0.3M words). Each is at least ten times rarer in both than on the
  // site, except where its line says; per million words: site | forum | videos.
  vi: [
    { say: 'nhiều khả năng', instead: '"chắc là", "có lẽ" (giữ đúng mức chắc chắn của nguồn)' }, // 473 | 5 | 0
    { say: 'dù vậy', find: '(?:dù|tuy) vậy', instead: '"nhưng", "tuy nhiên"' }, // dù vậy 568 | 5 | 0, tuy vậy 560 | 3 | 26
    { say: 'phần lớn', instead: '"thường", "chủ yếu", hoặc bỏ' }, // 1100 | 25 | 15
    { say: 'nhìn chung', instead: '"thường", hoặc bỏ' }, // 167 | 14 | 15
    { say: 'nhờ vậy', find: 'nhờ (?:vậy|đó)', instead: 'để câu sau tự nói; "thế là" chỉ khi đúng là chuyện xảy ra tiếp' }, // 169 | 12 | 0
    { say: 'lý do là', instead: '"vì", "là do"' }, // 153 | 6 | 19
    { say: 'thủ phạm', instead: '"nguyên nhân", "là do"' }, // 70 | 6 | 0
    { say: 'lý tưởng', instead: '"hợp nhất", "tốt nhất", hoặc nói thẳng con số ("nên giữ 24–26 °C")' }, // 230 | 34 | 15: seven times the forum's
    { say: 'khuyến nghị', instead: '"nên", "khuyên"' }, // 43 | 0 | 0
    { say: 'bắt buộc phải', instead: '"phải"' }, // 103 | 7 | 37: three times the videos'
    { say: 'tốt nhất bạn nên', instead: '"nên", "tốt nhất là"' }, // 41 | 3 | 0
    // Five times the forum's and three and a half times the videos': most of the pages say it, in most paragraphs.
    { say: 'bạn nên', find: 'bạn (?:nên|cần)', instead: '"nên", "cần", hoặc nói thẳng việc cần làm ("Thay 30% nước mỗi tuần")' }, // bạn nên 848 | 187 | 240, bạn cần 366 | 51 | 137
    { say: 'hung hăng', instead: '"dữ", "hung dữ"' }, // 189 | 9 | 0
    { say: 'bạn cùng bể', instead: '"cá nuôi chung", "nuôi chung với…"' }, // 222 | 0 | 0
    { say: 'giới chơi', instead: '"người chơi", hoặc bỏ' }, // 220 | 4 | 0
    { say: 'thị trường cá cảnh', instead: '"tiệm cá", "trên thị trường"' }, // 126 | 2 | 0
    { say: 'thức ăn sống', find: '(?:thức ăn|mồi) sống', instead: '"thức ăn tươi sống", "đồ tươi"' }, // 427 | 9 | 0
    { say: 'giữ lãnh thổ', instead: '"hay đuổi cá khác khỏi chỗ của nó", "hay giành chỗ"' }, // 124 | 0 | 0
    { say: 'chỗ trú', instead: '"chỗ trốn"' }, // 107 | 0 | 0
    { say: 'keo siêu dính', instead: '"keo 502"' }, // 5 | 0 | 0; the videos say keo 502 (30)
    // The editors' third round (2026-11-07), each held by the references.
    { say: 'rất nên', instead: '"nên", "tốt nhất là"' }, // 41 | 0 | 0
    { say: 'loricariid', instead: '"cá lau kiếng", "cá tỳ bà", "pleco"' }, // 48 | 0 | 0; tỳ bà 30 and lau kiếng 26 in the forum, pleco 11 in the videos
    { say: 'muối bể cá', instead: '"muối hột"' }, // 4 | 0 | 0; muối hột 63 in the forum
    // "giới chơi" used to point here, and the rewrite took it: guides 295, species 120, video guides 117 | 24 | 7.
    { say: 'dân chơi', instead: 'thường bỏ được ("gọi là…", "hay nuôi…"); "người chơi" khi cần nói ai' },
    { say: 'được chuộng', instead: '"nhiều người nuôi", "dễ kiếm", hoặc nói thẳng vì sao' }, // 20 | 0 | 0
    // The editors' fourth round.
    // The fifth round found "cây thân đứng" rewritten as "cây có thân" (0 in both references).
    { say: 'cây thân đứng', find: 'cây (?:thân đứng|có thân)', instead: '"cây cắt cắm"' }, // 20 | 0 | 0; cây cắt cắm 59 in the videos
    { say: 'lọc sponge', instead: '"lọc mút", "lọc bio"' }, // 10 | 0 | 0; lọc bio 22 in the videos
    { say: 'sản xuất hàng loạt', instead: '"nuôi đại trà", "nuôi hàng loạt"' }, // 3 | 0 | 0: fish aren't factory goods
    // The editors' fifth round, all four seats (2026-11-07). Site rates by kind, where the word sits.
    // The rewrite turned a page's "lọc mút" into "lọc bọt biển (lọc mút)": guides 142 | 0.7 | 0; lọc mút 15 in the forum.
    { say: 'lọc bọt biển', find: 'lọc (?:bọt biển|mút xốp)', instead: '"lọc mút", "lọc bio" (lọc mút chạy sủi)' },
    { say: 'bể cộng đồng', find: '(?:bể|cá) cộng đồng', instead: '"nuôi chung", "thả chung với cá hiền"' }, // species 521, guides 226 | 4 | 15; nuôi chung 86 in the forum
    { say: 'được xem là', instead: 'nói thẳng ("CO2 coi như bắt buộc", "cây khó giữ lâu"), đừng đổi sang "được coi là"' }, // species 184, guides 44 | 7 | 4
    { say: 'ghi nhận', instead: '"có ở", "gặp ở", "thấy ở" (nguồn nói chưa ai thấy thì giữ ý đó)' }, // species 1021, guides 104 | 12 | 4
    { say: 'không xương sống', instead: 'gọi tên con: "tép, ốc"' }, // species 242, guides 176 | 0.7 | 0
    { say: 'cá mê cung', find: '(?:cá|nhóm|họ|loài) mê cung', instead: 'gọi tên con: "cá sặc, cá betta"' }, // mê cung: species 263, guides 37 | 0.7 | 0
    { say: 'bơi tự do', instead: '"tự bơi được", "bơi được"' }, // species 194, guides 59 | 7 | 0
    { say: 'khẩu phần', instead: '"thức ăn", "cho ăn…"' }, // species 153, guides 117 | 14 | 0
    { say: 'cột nước', instead: '"trong nước"' }, // guides 23 | 0.7 | 0
    { say: 'dưới đèn', instead: '"đèn mạnh thì…", "đèn yếu thì…"' }, // guides 42 | 0 | 4
    { say: 'thành phần thực vật', instead: '"có rau", "có tảo"' }, // species 38 | 0 | 0
    { say: 'nuôi thương mại', instead: '"cá nuôi", "cá trại"' }, // species 15 | 0 | 0
    { say: 'nhắm tới', instead: '"để…", "dành cho…"' }, // guides 22 | 3 | 0: seven times the forum's
    // The editors' second round (2026-11-07), each checked here: textbook words where a keeper says what happens.
    { say: 'trưởng thành sinh dục', instead: '"đủ lớn để đẻ", "bắt cặp được"' }, // 33 | 0 | 0
    { say: 'cá nhân giống', instead: '"cá trại", "cá cho đẻ trong bể" (dễ đọc nhầm thành "cá nhân")' }, // 29 | 0 | 0
    {
      say: 'một cách + tính từ',
      find: 'một cách (?:đơn giản|nghiêm túc|tự nhiên|chắc chắn|nhẹ nhàng|cẩn thận|hợp lý|đều đặn|bài bản|chu đáo|dè dặt|hiệu quả|nhanh chóng|dễ dàng|an toàn|từ từ|triệt để|rõ ràng|chính xác|thường xuyên|qua loa|tốt)',
      instead: 'bỏ "một cách": "làm cẩn thận", "cho đơn giản"',
    }, // vi-style.md bans it; 9 pages still have it, one in a title
  ],
}

/**
 * Words of one meaning that a rewrite reaches for in turn once a listed one is gone: the editors' third round
 * (2026-11-07) found "phần lớn" rewritten as "hầu hết", then "đa số", five times on one page, and "nên" stacked
 * ("Thế nên nên mua"). Each word is fine once. The style rewrite's second pass takes up a part that uses one kind three
 * times or more, or stacks "nên" (ticSlips).
 */
export const TICS: Partial<Record<WrittenLang, Phrase[]>> = {
  vi: [
    { say: 'phần lớn, hầu hết, đa số', find: 'phần lớn|hầu hết|đa số', instead: 'nói "bao nhiêu" bằng động từ ("thường", "chủ yếu"), hoặc bỏ' },
    { say: 'dù vậy, tuy vậy, tuy nhiên', find: '(?:dù|tuy) (?:vậy|nhiên)', instead: '"nhưng", hoặc bỏ: hai câu đặt cạnh nhau đã đủ ý ngược' },
    { say: 'nhìn chung, nói chung', find: '(?:nhìn|nói) chung', instead: '"thường", hoặc bỏ' },
    { say: 'vì vậy, vì thế, nhờ vậy, thế nên, vậy nên, do đó, thế là', find: '(?:vì|nhờ) (?:vậy|thế|đó)|(?:thế|vậy) nên|do đó|thế là', instead: 'để câu sau tự nói, hoặc nối hai câu bằng "nên", "thế là"' },
  ],
}
/** Two "nên" a word apart at most: "Thế nên nên mua", "nên bạn nên", "nên không nên". */
const STACKED: Partial<Record<WrittenLang, RegExp>> = { vi: /(?<![\p{L}])nên(?:\s+\p{L}+)?\s+nên(?![\p{L}])/giu }
const TIC_AT = 3

/** Languages written without spaces between words: a phrase matches anywhere, not at word edges. */
const UNSPACED: readonly string[] = ['th']
const pattern = (p: Phrase, lang: WrittenLang) => UNSPACED.includes(lang) ? `(?:${p.find ?? p.say})` : `(?<![\\p{L}\\p{N}])(?:${p.find ?? p.say})(?![\\p{L}\\p{N}])`
const listOf = (lang: WrittenLang, list?: Phrase[]) => list ?? PHRASES[lang] ?? []

/** Each listed phrase a text has, once, with how many times: `"nhiều khả năng" ×3 → chắc là, có lẽ`. */
export function phraseSlips(text: string, lang: WrittenLang, list?: Phrase[]): string[] {
  return listOf(lang, list).flatMap(p => {
    const n = [...text.matchAll(new RegExp(pattern(p, lang), 'giu'))].length
    return n ? [`"${p.say}"${n > 1 ? ` ×${n}` : ''} → ${p.instead}`] : []
  })
}

/** Each listed phrase a text has, once, with the words as the text writes them. */
export const phraseQuotes = (text: string, lang: WrittenLang, list?: Phrase[]) => listOf(lang, list).flatMap(p => {
  const m = new RegExp(pattern(p, lang), 'iu').exec(text)
  return m ? [{ say: p.say, quote: m[0], instead: p.instead }] : []
})

/** How many times a text has any listed phrase. */
export const phraseCount = (text: string, lang: WrittenLang, list?: Phrase[]) =>
  listOf(lang, list).reduce((n, p) => n + [...text.matchAll(new RegExp(pattern(p, lang), 'giu'))].length, 0)

const occurrences = (text: string, p: Phrase, lang: WrittenLang) => [...text.matchAll(new RegExp(pattern(p, lang), 'giu'))].length

/** A text's tics, each once: a kind of word used TIC_AT times or more, a stacked "nên". */
export function ticSlips(text: string, lang: WrittenLang): string[] {
  const kinds = (TICS[lang] ?? []).flatMap(p => { const n = occurrences(text, p, lang); return n >= TIC_AT ? [`"${p.say}" ×${n} → ${p.instead}`] : [] })
  const stacked = STACKED[lang] ? [...text.matchAll(STACKED[lang]!)].map(m => m[0]) : []
  return stacked.length ? [...kinds, `"${stacked[0]}"${stacked.length > 1 ? ` ×${stacked.length}` : ''} → một câu một chữ "nên": "Muốn… thì…", "tốt nhất là"`] : kinds
}

/** How many tics a text has: each kind's uses at TIC_AT or more, and each stacked "nên". */
export const ticCount = (text: string, lang: WrittenLang) =>
  (TICS[lang] ?? []).reduce((n, p) => { const k = occurrences(text, p, lang); return n + (k >= TIC_AT ? k : 0) }, 0) + (STACKED[lang] ? [...text.matchAll(STACKED[lang]!)].length : 0)

/** Any listed phrase: the pages the style rewrite takes up (`pnpm engine rewrite-vi --match`). Undefined for an empty list. */
export const phraseMatch = (lang: WrittenLang, list?: Phrase[]) => {
  const l = listOf(lang, list)
  return l.length ? new RegExp(l.map(p => pattern(p, lang)).join('|'), 'iu') : undefined
}

/** The Vietnamese list as the writers read it. */
const viPrompt = (list: Phrase[]) => !list.length ? '' : [
  'Danh sách: những chữ người chơi Việt ít khi viết, mà trang lại dùng quá nhiều. Bên phải là cách người chơi nói cùng ý, để gợi ý, không phải chữ để thay vào: viết lại cả câu như các ví dụ ở trên.',
  ...list.map(p => `- "${p.say}" → ${p.instead}`),
].join('\n')

/** The style guide every Vietnamese writer reads (prompts/vi-style.md), with the Vietnamese list. */
export const VI_STYLE = [readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8').trimEnd(), viPrompt(listOf('vi'))].filter(Boolean).join('\n\n')
