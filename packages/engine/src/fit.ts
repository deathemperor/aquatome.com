import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LANGS, type Lang } from '@aq/schema'
import { parse } from 'node-html-parser'
import { LlmError, type Llm } from './claude'
import { mentions, PRODUCTS } from './market'
import { LANG_NAME, type Page, type PageKind } from './pages'
import { PHRASES, phraseQuotes } from './phrases'
import { label, norm, readable, render, RETRACTED } from './reader'
import { CONVERTED_LITRES } from './round'
import { snapshotName } from './snapshot'

/**
 * Is a page written for its reader? The owner on a guide that sent Vietnamese readers to an American product: "If the vast
 * contents of the product works like that nobody is able to check." So a fixed checklist runs over every page, in two
 * layers: rules with no model for what words can show exactly, and a model that reads the page for what they can't
 * (prompts/fit.md). A model's finding counts only with a quote that is on the page. Whether a product is sold in a market
 * is never the model's call: it names the products, and the market table (market.ts) says.
 */
export const FIT_CHECKS = ['product', 'shop', 'price', 'dose', 'source', 'units', 'words', 'elsewhere', 'kit', 'harm', 'card', 'dose-purpose', 'dose-conflict', 'dose-caution'] as const
export type FitCheck = (typeof FIT_CHECKS)[number]
/** What each check came from, so a new complaint about one page has a place to go: a check run over all of them. */
export const FIT_TITLE: Record<FitCheck, string> = {
  product: 'A product shops here may not list',
  shop: 'A foreign shop',
  price: 'A foreign price or shipping cost',
  dose: 'A dose tied to a foreign product',
  source: 'Talk about the source article or video',
  units: 'Imperial units, or a volume that shows it was converted',
  words: 'Words keepers here don\'t use',
  elsewhere: 'Written for a reader who lives elsewhere',
  kit: 'A shop abroad\'s kit or catalogue, which no rewording fixes',
  harm: 'Advice that, followed as written, would hurt the fish, other animals, plants or the keeper',
  card: 'A card that says a newly described species was discovered or gives no date for its paper, or a trend without its figures or where they come from',
  'dose-purpose': 'A dose that doesn\'t say what it\'s for',
  'dose-conflict': 'The same treatment, for the same thing, dosed differently on another page',
  'dose-caution': 'A dose without the caution its source gives for shrimp or other sensitive animals',
}
/** The same, as the owner's daily report shows them. */
export const FIT_LABEL_VI: Record<FitCheck, string> = {
  product: 'Sản phẩm tiệm ở đây có thể không bán',
  shop: 'Tiệm ở nước ngoài',
  price: 'Giá hay phí ship ở nước ngoài',
  dose: 'Liều theo sản phẩm nước ngoài',
  source: 'Nhắc tới bài hay video gốc',
  units: 'Gallon, inch hay số lít đổi từ đó',
  words: 'Chữ người chơi ở đây không dùng',
  elsewhere: 'Viết cho người đọc ở nước khác',
  kit: 'Bộ đồ hay danh mục của tiệm nước ngoài',
  harm: 'Lời khuyên làm theo thì hại cá, con vật khác, cây hay người nuôi',
  card: 'Thẻ ghi loài mới là "phát hiện" hay thiếu ngày công bố, hay xu hướng thiếu số liệu và nguồn',
  'dose-purpose': 'Liều không nói để trị gì',
  'dose-conflict': 'Cùng một cách trị mà trang này liều khác trang kia',
  'dose-caution': 'Liều thiếu lời dặn cho tép và con vật nhạy',
}
export type FitFinding = { check: FitCheck; part: string; quote: string; why: string; product?: string; fix?: string; by: 'rule' | 'model' }
/** A dose as a page states it. A figure in here is on the page: keepDoses drops one whose figures aren't in its quote. */
export type FitDose = { treatment: string; strength: string; amount: number; amountMax: number; unit: string; per: number; perUnit: string; use: string; method: string; quote: string }
export type FitEntry = {
  at: string; hash: string; model: string; findings: FitFinding[]; products: string[]; doses?: FitDose[]
  /** Doses were read against the page's source: false when it has none kept, so a missing caution can't be told. */
  sourceRead?: boolean
  /** The checklist it was read with (CHECKLIST); absent: the first. */
  checklist?: number
}
/**
 * 2: `kit` added, a check guides read before it lack, so they're read again. 3: `harm` added, after a video guide told
 * readers to catch fish by raising CO₂ and switching the filter off: guides are read again for it; other pages take it at
 * their next read, when their text changes.
 */
export const CHECKLIST = 3
export type FitState = Record<string, FitEntry>

const COUNTRY: Record<Lang, string> = { vi: 'Vietnam', id: 'Indonesia', th: 'Thailand', ms: 'Malaysia' }
const TEMPLATE = readFileSync(new URL('./prompts/fit.md', import.meta.url), 'utf8')
/**
 * The app's short cards cite dated sources by design, so naming one isn't the source talking; they have checks of their
 * own, which the Curation Lead asked for: a new species is described, with its paper's date, and a trend shows its figures.
 */
const CARD_NOTE = `
- card: this one is a short card for the app's home screen, not a page, and it names its dated sources by design: a paper, a publisher or the source of a count named as the authority for a claim ("theo …, 2026") is expected here, not \`source\`. Report instead: a newly described species called discovered ("phát hiện", "ditemukan", "ditemui", "ค้นพบ") when it was described; a new species without the year or date of the paper that described it; a trend without its figures (views, searches, upvotes) or without where they come from.`
export const fitPrompt = (lang: Lang, kind?: PageKind) => TEMPLATE
  .replace('{{CARD_NOTE}}', kind === 'cards' ? CARD_NOTE : '')
  .replaceAll('{{COUNTRY}}', COUNTRY[lang]).replaceAll('{{LANG}}', LANG_NAME[lang])
  .replace('{{SHOP_NOTE}}', lang === 'vi' ? '' : ' A Vietnamese chain (Pharmacity) counts too: this reader isn\'t in Vietnam.')
  .replace('{{PRICE_NOTE}}', lang === 'vi' ? '' : ' Vietnamese đồng counts too.')
  .replace('{{WORDS_NOTE}}', PHRASES[lang]?.length ? ` Another check counts these, so leave them out: ${PHRASES[lang]!.map(p => p.say).join(', ')}.` : '')

/** The text a reader gets, in numbered parts, without what comes from elsewhere as it is (photo captions, reference lists). */
export function fitText(p: Page): { parts: { id: string; field: string; text: string }[]; text: string; hash: string } {
  const parts = [
    { id: 'T', field: 'title', text: p.title },
    ...readable(p).map((f, i) => ({ id: `P${i + 1}`, field: f.field, text: render(f.html) })),
    ...p.lines.map((l, i) => ({ id: `L${i + 1}`, field: l.field, text: l.text })),
  ]
  const text = parts.map(x => (x.id === 'T' ? `TITLE: ${x.text}` : `[${x.id} ${label(x.field)}]\n${x.text}`)).join('\n\n')
  return { parts, text, hash: createHash('sha1').update(text).digest('hex').slice(0, 16) }
}

const WORD = (s: string) => `(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}\\p{N}])`
const re = (s: string) => new RegExp(s, 'giu')
const AMOUNT = '\\d[\\d.,–-]*\\s*'
/** Amazon the shop, not the river: a sentence buying from it, or its address. */
const FOREIGN_SHOPS = 'petco|petsmart|chewy|walmart|bulk reef supply|king british|big al\'?s|pets at home|aquarium co-?op|ebay|trên amazon|amazon\\.com|(?:mua|beli)[^.\\n]{0,40}amazon'
const SHOP: Record<'vi' | 'other', RegExp> = { vi: re(WORD(FOREIGN_SHOPS)), other: re(`${WORD(`${FOREIGN_SHOPS}|pharmacity|long châu`)}|ซื้อ[^.\\n]{0,40}amazon`) }
const PRICE = [
  re(WORD(`${AMOUNT}(?:USD|US\\$|EUR|euro|đô(?:\\s+la|\\s+Mỹ)?|dollars?|dolar|bảng Anh)`)),
  re(`(?:US\\$|\\$|£|€)\\s?\\d|\\d\\s?(?:\\$|£|€)|(?<!\\d\\s*)${WORD('USD')}|${WORD('vài đô|mấy đô|phí vận chuyển|cước vận chuyển|phí ship|ongkos kirim|ongkir|air freight')}|\\d[\\d.,]*\\s*ดอลลาร์|ค่าส่ง|ค่าขนส่ง`),
]
const PRICE_OTHER = re(WORD(`${AMOUNT}(?:đồng|VND|VNĐ)`))
/** Per language: "kami" is "we" in Indonesian and Malay, and a name on a Vietnamese page. "Mình" opening a sentence with a verb is the writer's own voice; "Mình cá dẹp" is a fish's body. */
const SOURCE: Record<Lang, RegExp> = {
  vi: re(`${WORD('bài gốc|bài viết gốc|video này|trong video|theo video|kênh này|chúng tôi')}|(?<=^|[.!?…:]\\s)Mình (?:chỉ|đã|thấy|nghĩ|khuyên|từng|hay|thường|dùng|làm|không|cũng|nuôi|mua)(?![\\p{L}\\p{N}])`),
  id: re(WORD('artikel asli|video ini|dalam video|kami')),
  ms: re(WORD('artikel asal|video ini|dalam video|kami')),
  th: re('บทความต้นฉบับ|วิดีโอนี้|ในวิดีโอ|พวกเรา'),
}
/**
 * A fact's source number the writer copied into the text ("(sumber 8)", "Sumber 0 menyebut", "แหล่งที่ 2 ระบุ"): the
 * reader never sees the numbered list. A count after the word ("satu sumber 24–29 °C") or a table's column of sources is
 * not one, so outside brackets the number must open a clause: a colon or a lower-case word after it.
 */
const SOURCE_NO = [
  re(`\\((?:sumber|nguồn|source|แหล่ง(?:ข้อมูล)?(?:ที่)?)\\s*\\d+(?:\\s*(?:,|dan|và|และ|and)\\s*\\d+)*\\)`),
  new RegExp('(?<![\\p{L}\\p{N}])(?:[Ss]umber|Nguồn|Source)\\s+\\d+(?=:|\\s+\\p{Ll})|แหล่ง(?:ข้อมูล)?ที่\\s*\\d+(?=\\s*[\\u0E00-\\u0E7F])', 'gu'),
]
const IMPERIAL = [
  re(WORD(`${AMOUNT}(?:gal|inch(?:es)?|inci|feet|ft|foot|pounds?|lbs?|ounces?|oz|độ F)`)),
  re(`${WORD('gallons?|galon|ga-?\\s?lông')}|แกลลอน|°\\s?F|\\d\\s*นิ้ว`),
]
/** A volume only a conversion from gallons would give. A dose's figures are the dose check's. */
const CONVERTED = re(`(?<![\\d.,])(?:${CONVERTED_LITRES.join('|')})\\s*(?:lít|liter|litre|l|ลิตร)(?![\\p{L}\\p{N}])`)
const PER = /(?:mỗi|cho|trên|per|setiap|untuk|ต่อ|\/)\s*(?:khoảng\s*)?(?:\d+\s*[–-]\s*)?$/iu
const DOSE = re(WORD(`${AMOUNT}(?:ml|gói|viên|thìa|muỗng|giọt|mg|g|nắp|sachet|tablet|butir|ซอง|เม็ด|หยด)`))

/** A page with an amount of something per volume, by its words: how a sample finds doses, which are too few at random. */
const PER_VOLUME = re(`\\d[\\d.,]*\\s*(?:ml|mg|g|gói|viên|thìa|muỗng|giọt|sachet|tablet|ซอง|เม็ด|หยด)[^.\\n]{0,40}(?:lít|liter|litre|ลิตร|gallon|galon)`)
export const hasDose = (p: Page) => { PER_VOLUME.lastIndex = 0; return PER_VOLUME.test(fitText(p).text) }

/**
 * Doses no reading is needed to call harmful, from guides of 8 Nov 2026 whose figures were copied faithfully from wrong
 * sources: a medicine in grams per litre (a source's milligrams written as grams, a forum post's figure), a salt dip of 2%
 * or more held over 10 minutes (a fish farm's, for food fish; a vet's dip is 30 g/L for at most 10), and copper at 1 ppm or
 * more with no product, type or label beside it (a chelated product's level, which given for copper sulphate kills fish).
 * They are `harm`, so the gate holds a page with one before any model reads it.
 */
const NUM = '\\d+(?:[.,]\\d+)?(?:\\s*[–-]\\s*\\d+(?:[.,]\\d+)?)?'
const top = (s: string) => Number(s.split(/\s*[–-]\s*/).at(-1)!.replace(',', '.'))
const MED = 'kanamycin|kanamisin|quinin\\p{L}*|kina|ký ninh|metronidazol\\p{L}*|praziquantel|levamisol\\p{L}*|erythromycin|eritromisin|oxytetracyclin\\p{L}*|oksitetrasiklin|tetracyclin\\p{L}*|tetrasiklin|doxycyclin\\p{L}*|nitrofura\\p{L}*|furazolidon\\p{L}*|malachit\\p{L}*|methylen\\p{L}*|metilen\\p{L}*|formalin|formaldehyd\\p{L}*|permanganat\\p{L}*|thuốc tím|acriflavin\\p{L}*|ampicillin|amoxicillin|enrofloxacin|ciprofloxacin|trimethoprim|fenbendazol\\p{L}*|flubendazol\\p{L}*|trichlorfon|dipterex|chloroquin\\p{L}*|kháng sinh|antibiotik\\p{L}*|antibiotics?'
const MED_TH = 'ควินิน|คานามัยซิน|เมโทรนิดาโซล|ฟอร์มาลิน|เมทิลีน|มาลาไคต์|ด่างทับทิม|ยาปฏิชีวนะ'
const MEDICINE = re(`${WORD(MED)}|${MED_TH}`)
/** A medicine named right after a figure's unit ("2–5 g/L kanamycin"). */
const MEDICINE_NEXT = new RegExp(`^\\s*(?:${WORD(MED)}|${MED_TH})`, 'iu')
const SALT = re(`${WORD('muối|độ mặn|salt|salinity|saline|NaCl|garam|kemasinan|ppt')}|เกลือ|ความเค็ม|‰`)
const GRAMS = '(?:g|gm|gr|gam|gram|grams|ก\\.|กรัม)\\.?'
const PER_L = '(?:\\/|per|mỗi|trên|cho(?:\\s+mỗi)?|trong|in(?:\\s+every)?|setiap|bagi(?:\\s+setiap)?|dalam|untuk|ต่อ(?:น้ำ)?)\\s*(?:1\\s*)?(?:l|lít|lit|liter|litre|liters|litres|ลิตร)(?!\\p{L})'
const G_PER_L = re(`(?<![\\d.,])(${NUM})\\s*${GRAMS}\\s*((?:\\p{L}+\\s+){0,2}?)${PER_L}`)
/** A stock solution's strength, not a dose: "dung dịch gốc 10 g/L", "37% (khoảng 370 g/L)". */
const STOCK = new RegExp(`(?:${WORD('dung dịch gốc|dung dịch mẹ|pha sẵn|stock|larutan induk|larutan stok')}|สารละลายเข้มข้น|%\\s*\\(\\s*(?:khoảng|sekitar|kira-kira|about|ประมาณ)?\\s*)[^.!?\\n]{0,25}$`, 'iu')
/** A salt's strength: a percentage, per mille, or grams per litre. */
const CONC = re(`(?<![\\d.,])(${NUM})\\s*(?:(%)(?!\\s*(?:nước|air|น้ำ|of)(?!\\p{L}))|(‰|ppt(?!\\p{L}))|${GRAMS}\\s*${PER_L})`)
const TIME = re(`(?<![\\d.,])(${NUM})\\s*(?:(?:phút|minit|minutes?|mins?|menit)(?!\\p{L})|นาที|((?:giờ|tiếng|hours?|hrs?|jam)(?!\\p{L})|ชั่วโมง|ชม\\.?))`)
/** Salt water for something other than a fish: decor, nets, brine shrimp eggs. */
const DECOR = re(`${WORD('đồ trang trí|ngâm đồ|đồ vật|dụng cụ|vợt|dekorasi|hiasan|peralatan|decor\\p{L}*|ornaments?|equipment|nets?|artemia|brine shrimp|kista|cysts?|naupli\\p{L}*|penetasan|menetas\\p{L}*|hatch\\p{L}*|ấp trứng|trứng artemia')}|ของตกแต่ง|อุปกรณ์|อาร์ทีเมีย|ไรทะเล|ฟัก|ใส่ไข่`)
/** A bound, not a dose: "dưới 100 g/L", "up to 17 g/L". */
const BOUND = new RegExp(`${WORD('dưới|tối đa|under|below|less than|up to|di bawah|kurang dari|sampai|hingga')}\\s*$|(?:น้อยกว่า|ต่ำกว่า|ไม่เกิน)\\s*$`, 'iu')
const CU_WORD = `(?<![\\p{L}\\p{N}])(?:ion\\s+)?(?:CuSO[4₄]|(?:sunphat|sunfat|sulfat)\\s+đồng|đồng(?!\\s*(?:thời|ý|hồ|bằng|đều|loạt|nghĩa|nhất|dạng|bộ|lòng|tiền|minh|hành|cỡ)(?!\\p{L}))|copper|tembaga|kuprum|Cu)(?!\\p{L})|ทองแดง|คอปเปอร์|จุนสี`
const CU_UNIT = '(?:ppm|mg\\s*\\/\\s*(?:l|lít|liter|litre))(?!\\p{L})'
const CU_AFTER = re(`(?<![\\d.,])(${NUM})\\s*${CU_UNIT}\\s*(?:${CU_WORD})`)
/** Thai has no full stops: a space before Thai words ends a phrase; ", " ends one too. */
const CU_BEFORE = re(`(?:${CU_WORD})((?:(?!\\s[\\u0E00-\\u0E7F]|,\\s)[^.!?;\\n]){0,60}?)(?<![\\d.,])(${NUM})\\s*${CU_UNIT}`)
const ALKALINITY = re(`${WORD('kiềm|độ cứng|alkalin\\p{L}*|kesadahan|KH|GH')}|ความเป็นด่าง|ความกระด้าง|อัลคาลินิตี`)
const NAMED_COPPER = re(`${WORD('coppersafe|cupramine|chelat\\p{L}*|kelat|terkelat|nhãn|label')}|คีเลต|ฉลาก`)
/** Where the last match of `r` in `s` ends, or -1. */
const endOf = (r: RegExp, s: string) => { let at = -1; for (const m of s.matchAll(r)) at = m.index + m[0].length; return at }
/** Where a clause ends: a sentence's end, a semicolon or a line (a list item, a table row). */
const CLAUSE_END = /[.!?](?=\s|$)|[;\n]/g

/**
 * A part's text for the harm rules: a block a line, as the reader reads it, but a table row on one line with its cells
 * joined, so that a row is one clause and the next row another.
 */
export const rowsOf = (html: string) => parse(html).querySelectorAll('h3, p, li, tr')
  .filter(el => el.rawTagName === 'tr' || (!el.closest('tr') && !el.querySelector('h3, p, li, td, th, ul, ol')))
  .map(el => (el.rawTagName === 'tr' ? `| ${el.querySelectorAll('td, th').map(c => c.text.replace(/\s+/g, ' ').trim()).join(' | ')}` : `${el.rawTagName === 'li' ? '- ' : ''}${el.text.replace(/\s+/g, ' ').trim()}`))
  .filter(t => t.replace(/^[-|]\s*/, ''))
  .join('\n')

/** What these find in one part's text: the words, and why. */
export function harmfulDoses(text: string): { quote: string; why: string }[] {
  const out: { quote: string; why: string }[] = []
  // The words as the page has them, without the marks a list item, a table cell or a heading takes in the text.
  const say = (quote: string, why: string) => out.push({ quote: quote.replace(/(?:^|\n)\s*(?:-|\||##)\s*/g, ' ').trim(), why })
  // The clause a figure is in, up to it (`n` characters at most) and on from it.
  const lead = (i: number, n: number) => { const s = text.slice(Math.max(0, i - n), i); return s.slice(Math.max(0, endOf(CLAUSE_END, s))) }
  const tail = (i: number, n = 60) => { const s = text.slice(i, i + n); const end = s.search(/[.!?](?=\s|$)|[;\n]/); return end < 0 ? s : s.slice(0, end) }
  for (const m of text.matchAll(G_PER_L)) {
    const before = lead(m.index, 120)
    if (STOCK.test(before)) continue
    // The figure is a medicine's when one is named between it and its unit, right after the unit, or after any salt before it.
    if (endOf(MEDICINE, m[2]!) >= 0 || MEDICINE_NEXT.test(text.slice(m.index + m[0].length)) || endOf(MEDICINE, before) > endOf(SALT, before)) say(`${before}${m[0]}`, 'a medicine in grams per litre, where medicines are dosed in milligrams')
  }
  const strengths = [...text.matchAll(CONC)]
  strengths.forEach((m, i) => {
    // A salt's own strength (a salt word just before it, with no other figure between, or per mille), 2% or more: a
    // percentage over 10 is something else's. Its time is in the same clause, before or after, and not past another
    // strength, whose time it would be.
    const pct = m[2] ? top(m[1]!) : top(m[1]!) / 10
    if (pct < 2 || (m[2] && pct > 10)) return
    const end = m.index + m[0].length, prev = strengths[i - 1], next = strengths[i + 1]
    const before = lead(m.index, 80), after = tail(end, 80), salt = endOf(SALT, before)
    if (!m[3] && (salt < 0 || /\d/.test(before.slice(salt)))) return
    if (BOUND.test(before) || endOf(DECOR, `${before}${after}`) >= 0) return
    const own = `${prev && prev.index + prev[0].length > m.index - before.length ? text.slice(prev.index + prev[0].length, m.index) : before} ${next && next.index < end + after.length ? text.slice(end, next.index) : after}`
    const minutes = Math.max(0, ...[...own.matchAll(TIME)].map(t => top(t[1]!) * (t[2] ? 60 : 1)))
    if (minutes > 10) say(`${before}${m[0]}${after}`, 'a salt dip of 2% or more held over 10 minutes, where a vet\'s dip is 30 g/L for at most 10')
  })
  // One finding a figure, found with its copper word after it or before.
  const seen = new Set<number>()
  const copper = (at: number, figure: string, quote: string) => {
    if (seen.has(at) || top(figure) < 1 || endOf(NAMED_COPPER, `${lead(at, 120)}${tail(at)}`) >= 0) return
    seen.add(at)
    say(quote, 'copper at 1 ppm or more with no product, type or label beside it: copper sulphate at that level kills fish')
  }
  for (const m of text.matchAll(CU_AFTER)) copper(m.index, m[1]!, `${lead(m.index, 60)}${m[0]}`)
  for (const m of text.matchAll(CU_BEFORE)) if (endOf(ALKALINITY, m[1]!) < 0 && endOf(MEDICINE, m[1]!) < 0) copper(m.index + m[0].lastIndexOf(m[2]!), m[2]!, m[0])
  return out
}

/** A medicine, copper or salt named: what makes a figure in a researched fact a dose (topics.ts usableFact). */
export const NAMES_TREATMENT = new RegExp(`${WORD(MED)}|${MED_TH}|${CU_WORD}|${WORD('muối|salt|saline|NaCl|garam')}|เกลือ`, 'iu')

/** The products in the table that a reader in this language may not find: hard here, or, with no market data, all of them. */
const foreignIn = (lang: Lang) => PRODUCTS.filter(x => { const s = x.market[lang]?.status; return s === 'hard' || (s === undefined && lang !== 'vi') })
const clip = (s: string) => s.trim().split(/\s+/).slice(0, 20).join(' ')

/** What rules with no model find: exact words, so a count of them needs no sample. */
export function fitRules(p: Page): FitFinding[] {
  const out: FitFinding[] = []
  const say = (check: FitCheck, part: string, quote: string, why: string, extra: Partial<FitFinding> = {}) => out.push({ check, part, quote: clip(quote), why, by: 'rule', ...extra })
  const foreign = foreignIn(p.lang)
  const html = new Map(readable(p).map((f, i) => [`P${i + 1}`, f.html]))
  for (const { id, text } of fitText(p).parts) {
    const each = (check: FitCheck, r: RegExp, why: string) => { for (const m of text.matchAll(r)) say(check, id, m[0], why) }
    each('shop', p.lang === 'vi' ? SHOP.vi : SHOP.other, 'names a foreign shop')
    for (const r of PRICE) each('price', r, 'a foreign price or shipping cost')
    if (p.lang !== 'vi') each('price', PRICE_OTHER, 'a price in Vietnamese đồng')
    each('source', SOURCE[p.lang], 'talks about the source or in its voice')
    for (const r of SOURCE_NO) each('source', r, 'a source\'s number from the facts, which the reader never sees')
    for (const r of IMPERIAL) each('units', r, 'an imperial unit')
    for (const m of text.matchAll(CONVERTED)) if (!PER.test(text.slice(Math.max(0, m.index - 24), m.index))) say('units', id, m[0], 'a volume that shows it was converted from gallons')
    for (const x of foreign) if (mentions(x, text)) say('product', id, x.name, x.market[p.lang] ? 'not found at shops here (market.ts)' : 'in the table, market unknown', { product: x.name })
    for (const s of text.split(/(?<=[.!?])\s+|\n/)) {
      const x = foreign.find(y => mentions(y, s))
      if (x && s.match(DOSE)) say('dose', id, s, `a dose tied to ${x.name}`, { product: x.name })
    }
    for (const q of phraseQuotes(text, p.lang)) say('words', id, q.quote, `listed: ${q.instead}`, { fix: q.instead })
    for (const h of harmfulDoses(html.has(id) ? rowsOf(html.get(id)!) : text)) say('harm', id, h.quote, h.why)
  }
  return dedupe(out)
}

const dedupe = (xs: FitFinding[]) => [...new Map(xs.map(f => [`${f.check}|${norm(f.quote)}`, f])).values()]

/** What the program works out itself, from the table and from `doses`, never the model's word. */
const WORKED_OUT: readonly FitCheck[] = ['product', 'dose-purpose', 'dose-conflict', 'dose-caution']
const MODEL_CHECKS = FIT_CHECKS.filter(c => !WORKED_OUT.includes(c))
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findings', 'products', 'doses'],
  properties: {
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['check', 'part', 'quote', 'why', 'fix', 'product'],
        properties: { check: { type: 'string', enum: MODEL_CHECKS }, part: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, fix: { type: 'string' }, product: { type: 'string' } },
      },
    },
    products: { type: 'array', items: { type: 'string' } },
    doses: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['treatment', 'strength', 'amount', 'amountMax', 'unit', 'per', 'perUnit', 'use', 'method', 'quote'],
        properties: { treatment: { type: 'string' }, strength: { type: 'string' }, amount: { type: 'number' }, amountMax: { type: 'number' }, unit: { type: 'string' }, per: { type: 'number' }, perUnit: { type: 'string' }, use: { type: 'string' }, method: { type: 'string' }, quote: { type: 'string' } },
      },
    },
  },
}
const CAUTION = readFileSync(new URL('./prompts/fit-caution.md', import.meta.url), 'utf8')
const CAUTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['cautions'],
  properties: { cautions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['doseQuote', 'sourceQuote', 'animals', 'onPage', 'pageQuote'], properties: { doseQuote: { type: 'string' }, sourceQuote: { type: 'string' }, animals: { type: 'string' }, onPage: { type: 'boolean' }, pageQuote: { type: 'string' } } } } },
}
type Found = { check: string; part: string; quote: string; why: string; fix?: string; product?: string }

/** A product's row in the table and its status in a language, from a name as a page spells it. */
export const productOf = (name: string, lang: Lang) => {
  const x = PRODUCTS.find(y => new RegExp(y.match.source, 'iu').test(name))
  return x && { name: x.name, status: x.market[lang]?.status ?? ('no data' as const) }
}

/** The model's answer that holds: a known check, a quote on the page, not taken back, and no dose tied to something sold here. */
export function keepFit(found: Found[], text: string, lang: Lang): FitFinding[] {
  const page = norm(text)
  return found
    .filter(f => (MODEL_CHECKS as readonly string[]).includes(f.check) && f.quote?.trim() && f.why?.trim() && !RETRACTED.test(f.why) && page.includes(norm(f.quote)))
    .filter(f => f.check !== 'dose' || !f.product || productOf(f.product, lang)?.status !== 'sold')
    .map(f => ({ check: f.check as FitCheck, part: f.part, quote: f.quote.trim(), why: f.why.trim(), by: 'model' as const, ...(f.product?.trim() ? { product: f.product.trim() } : {}), ...(f.fix?.trim() ? { fix: f.fix.trim() } : {}) }))
}

const figure = (n: number) => String(n).replace('.', ',')
const quoteHas = (quote: string, n: number) => { const q = quote.replace(/\s/g, ''); return q.includes(String(n)) || q.includes(figure(n)) || n === 0 }
/** The doses that hold: on the page, each with its figures in its own words, so no number is the model's. */
export function keepDoses(found: FitDose[], text: string): FitDose[] {
  const page = norm(text)
  return found.filter(d => d.treatment?.trim() && d.quote?.trim() && page.includes(norm(d.quote)) && quoteHas(d.quote, d.amount) && quoteHas(d.quote, d.amountMax) && quoteHas(d.quote, d.per))
    .map(d => ({ ...d, treatment: d.treatment.trim().toLowerCase(), strength: d.strength.replace(/\s/g, ''), quote: d.quote.trim() }))
}

/** Each caution the source gives for a dose that the page leaves out, by quote: the source's words checked against the source. */
export function keepCautions(found: { doseQuote: string; sourceQuote: string; animals: string; onPage: boolean; pageQuote: string }[], text: string, source: string): FitFinding[] {
  const page = norm(text), from = norm(source)
  return found.filter(c => c.doseQuote?.trim() && page.includes(norm(c.doseQuote)) && c.sourceQuote?.trim() && from.includes(norm(c.sourceQuote)))
    .filter(c => !(c.onPage && c.pageQuote?.trim() && page.includes(norm(c.pageQuote))))
    .map(c => ({ check: 'dose-caution' as const, part: '', quote: clip(c.doseQuote), why: `the source warns about ${c.animals}: "${c.sourceQuote.trim()}"`, by: 'model' as const }))
}

/** One model reads one page against the checklist; when the page has doses, against what the page was written from too. */
export async function readFit(llm: Llm, p: Page, model: string | undefined, now: Date, source?: string): Promise<FitEntry> {
  const { text, hash } = fitText(p)
  const r = await llm<{ findings: Found[]; products: string[]; doses?: FitDose[] }>({ system: fitPrompt(p.lang, p.kind), prompt: text, schema: SCHEMA, ...(model ? { model } : {}) })
  const doses = keepDoses(r.doses ?? [], text)
  const entry: FitEntry = { at: now.toISOString().slice(0, 10), hash, model: model ?? 'default', checklist: CHECKLIST, findings: keepFit((r.findings ?? []).filter(f => f.check !== 'card' || p.kind === 'cards'), text, p.lang), products: [...new Set((r.products ?? []).map(x => x.trim()).filter(Boolean))], ...(doses.length ? { doses } : {}) }
  if (!doses.length) return entry
  if (!source?.trim()) return { ...entry, sourceRead: false }
  const c = await llm<{ cautions: Parameters<typeof keepCautions>[0] }>({
    system: CAUTION, schema: CAUTION_SCHEMA, ...(model ? { model } : {}),
    prompt: `--- DOSES ---\n${doses.map(d => `- ${d.quote}`).join('\n')}\n\n--- PAGE ---\n${text}\n\n--- SOURCE ---\n${source.slice(0, 40_000)}`,
  })
  return { ...entry, sourceRead: true, findings: [...entry.findings, ...keepCautions(c.cautions ?? [], text, source)] }
}

/** What a page was written from, when it's kept: a section's English, a guide's article or transcript, a topic's facts. */
export async function fitSource(root: string, p: Page): Promise<string> {
  if (p.en && Object.keys(p.en).length) return Object.values(p.en).join('\n')
  if (p.kind !== 'guides' || !p.origin) return ''
  if (p.origin.source === 'aquatome') return readFile(join(root, 'engine-state/topics', `${p.id}.json`), 'utf8').then(t => (JSON.parse(t) as { facts: { fact: string }[] }).facts.map(f => f.fact).join('\n')).catch(() => '')
  return ownSource(root, { id: p.id, source: p.origin.source, sourceUrl: p.origin.url })
}

const TRANSCRIPTS = process.env.TRANSCRIPT_CACHE ?? join(homedir(), '.cache/aquatome/transcripts')
/** A guide's English article, or its video's transcript: the transcripts are on one Mac, and not all of them. */
export async function ownSource(root: string, e: { id: string; source: string; sourceUrl: string }): Promise<string> {
  if (e.source === 'youtube') return readFile(join(TRANSCRIPTS, `${e.id.replace(/^youtube-/, '')}.txt`), 'utf8').catch(() => '')
  return (await readFile(join(root, 'sources', e.source, `${snapshotName(e.sourceUrl)}.md`), 'utf8').catch(() => '')).replace(/^---[\s\S]*?---\s*/, '')
}

/** A dose's rate per litre, in what can be compared: a spoon by its millilitres, a gallon by its litres. */
const SPOON: Record<string, number> = { tablespoon: 15, teaspoon: 5 }
export function doseRate(d: Pick<FitDose, 'amount' | 'amountMax' | 'unit' | 'per' | 'perUnit'>) {
  const litres = /^(?:l|lít|litre|liter)s?$/i.test(d.perUnit) ? d.per : /^gal/i.test(d.perUnit) ? d.per * 3.785 : 0
  if (!litres) return undefined
  const unit = d.unit.toLowerCase()
  const k = SPOON[unit] ?? 1
  return { unit: SPOON[unit] ? 'ml' : unit, low: (d.amount * k) / litres, high: ((d.amountMax || d.amount) * k) / litres }
}
const WITHIN = 0.12
const apart = (a: { low: number; high: number }, b: { low: number; high: number }) => a.low > b.high * (1 + WITHIN) || b.low > a.high * (1 + WITHIN)

export type DoseRow = { key: string; use: string; method: string; unit: string; low: number; high: number; quote: string }
export type DoseGroup = { treatment: string; strength: string; rows: DoseRow[]; conflicts: [string, string][] }
/**
 * Every treatment the pages dose, each with its doses by what they're for. Two pages that give it for the same thing the
 * same way, at rates that can't both be right, are a conflict: flagged, never averaged, and no dose is picked. Doses for
 * different things stand, each page saying which it is. A different strength is a different row: 3% and 35% don't compare.
 */
export function doseGroups(pages: Page[], state: FitState): DoseGroup[] {
  const groups = new Map<string, DoseGroup>()
  for (const p of pages) for (const d of state[fitKey(p)]?.doses ?? []) {
    const r = doseRate(d)
    if (!r) continue
    const id = `${d.treatment}|${d.strength}`
    const g = groups.get(id) ?? { treatment: d.treatment, strength: d.strength, rows: [], conflicts: [] }
    g.rows.push({ key: fitKey(p), use: d.use, method: d.method, unit: r.unit, low: r.low, high: r.high, quote: d.quote })
    groups.set(id, g)
  }
  for (const g of groups.values()) {
    // A page's own levels for one use are one range: a salt guide's first and second levels don't conflict with each other.
    const spans = new Map<string, DoseRow>()
    // A fish's own water (a brackish fish's salt) and a use the page doesn't name aren't a treatment: two pages can both be right.
    for (const r of g.rows.filter(x => x.use && x.method && x.use !== 'water' && x.use !== 'other')) {
      const k = `${r.key}|${r.use}|${r.method}|${r.unit}`
      const s = spans.get(k)
      spans.set(k, s ? { ...s, low: Math.min(s.low, r.low), high: Math.max(s.high, r.high) } : r)
    }
    const xs = [...spans.values()]
    for (const [i, a] of xs.entries()) for (const b of xs.slice(i + 1)) if (a.use === b.use && a.method === b.method && a.unit === b.unit && apart(a, b)) g.conflicts.push([a.key, b.key])
  }
  return [...groups.values()].sort((a, b) => b.conflicts.length - a.conflicts.length || b.rows.length - a.rows.length || a.treatment.localeCompare(b.treatment))
}

/** Everything found on a page: the rules', the model's, and each product the model named that the table says is hard to find here. */
export function fitFindings(p: Page, entry?: FitEntry): FitFinding[] {
  const named = (entry?.products ?? []).flatMap(n => {
    const x = productOf(n, p.lang)
    return x && (x.status === 'hard' || (x.status === 'no data' && p.lang !== 'vi')) ? [{ check: 'product' as const, part: '', quote: x.name, why: x.status === 'hard' ? 'not found at shops here (market.ts)' : 'in the table, market unknown', product: x.name, by: 'model' as const }] : []
  })
  // What it's for, not how: two readers agree on the first and not on the second, which is only for comparing doses.
  const unsaid = (entry?.doses ?? []).filter(d => !d.use).map(d => ({ check: 'dose-purpose' as const, part: '', quote: clip(d.quote), why: 'doesn\'t say what this dose is for', by: 'model' as const }))
  return dedupe([...fitRules(p), ...(entry?.findings ?? []), ...named, ...unsaid])
}

/** Product names the table has no row for: what to look up next, with how many pages name each. */
export function uncheckedProducts(pages: Page[], state: FitState, lang: Lang): [string, number][] {
  const n = new Map<string, number>()
  for (const p of pages) if (p.lang === lang) for (const name of new Set((state[fitKey(p)]?.products ?? []).filter(x => !productOf(x, lang)).map(x => x.toLowerCase()))) n.set(name, (n.get(name) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** The pages a model reads. The glossary's are a line each, and the rules alone are enough for them. */
export const FIT_KINDS: readonly PageKind[] = ['guides', 'species', 'plants', 'breeds', 'products', 'equipment']

export const fitKey = (p: Page) => `${p.lang}/${p.kind}/${p.id}`
/** A stable order that isn't the alphabet: a run stopped part way has read a random sample, and its counts can be scaled. */
export const fitOrder = (pages: Page[], seed = 'fit') => [...pages].map(p => [createHash('sha1').update(`${seed}:${fitKey(p)}`).digest('hex'), p] as const).sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1])
export const fitDue = (pages: Page[], state: FitState) => pages.filter(p => {
  const e = state[fitKey(p)]
  return e?.hash !== fitText(p).hash || (p.kind === 'guides' && (e.checklist ?? 1) < CHECKLIST)
})

/** Reads the pages due, a few at a time, saving as it goes. Stops, with what it has, when the accounts are out of their limit. */
export async function runFit(pages: Page[], statePath: string, d: { llm: Llm; model?: string; jobs?: number; limit?: number; now?: () => Date; root?: string }) {
  const state: FitState = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'))
  const due = fitOrder(fitDue(pages, state)).slice(0, d.limit ?? Infinity)
  const report = { read: 0, failed: [] as string[], stopped: undefined as string | undefined, left: 0 }
  const save = () => writeFile(statePath, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  let next = 0
  await Promise.all(Array.from({ length: d.jobs ?? 2 }, async () => {
    while (next < due.length && !report.stopped) {
      const p = due[next++]!
      try {
        state[fitKey(p)] = await readFit(d.llm, p, d.model, (d.now ?? (() => new Date()))(), d.root ? await fitSource(d.root, p) : undefined)
        if (++report.read % 10 === 0) await save()
      } catch (e) {
        if (e instanceof LlmError && /limit|rejected|no account/i.test(e.message)) report.stopped = e.message.slice(0, 200)
        else report.failed.push(`${fitKey(p)}: ${(e as Error).message.slice(0, 200)}`)
      }
    }
  }))
  await save()
  report.left = fitDue(pages, state).length
  return { report, state }
}

/** Pages with a finding, by check and in all, for one language. `words` apart: one listed word doesn't make a page wrong for its reader. */
export function fitCounts(pages: Page[], state: FitState, lang: Lang) {
  const mine = pages.filter(p => p.lang === lang && state[fitKey(p)]?.hash === fitText(p).hash)
  const conflicted = new Set(doseGroups(mine, state).flatMap(g => g.conflicts.flat()))
  const found = mine.map(p => new Set([...fitFindings(p, state[fitKey(p)]).map(f => f.check), ...(conflicted.has(fitKey(p)) ? ['dose-conflict' as const] : [])]))
  const by = Object.fromEntries(FIT_CHECKS.map(c => [c, found.filter(s => s.has(c)).length])) as Record<FitCheck, number>
  const dosed = mine.filter(p => state[fitKey(p)]?.doses?.length)
  return { pages: pages.filter(p => p.lang === lang).length, read: mine.length, by, wrongReader: found.filter(s => [...s].some(c => c !== 'words')).length, dosed: dosed.length, noSource: dosed.filter(p => state[fitKey(p)]?.sourceRead === false).length }
}

const rate = (r: Pick<DoseRow, 'low' | 'high' | 'unit'>) => `${+r.low.toFixed(3)}${r.high > r.low ? `–${+r.high.toFixed(3)}` : ''} ${r.unit}/l`
const doseLine = (g: DoseGroup) => {
  const uses = new Map<string, DoseRow[]>()
  for (const r of g.rows) { const k = `${r.use || 'unsaid'}, ${r.method || 'unsaid'}`; uses.set(k, [...(uses.get(k) ?? []), r]) }
  const each = [...uses].map(([k, rs]) => `${k}: ${[...new Set(rs.map(rate))].join(', ')} (${new Set(rs.map(r => r.key)).size} pages)`)
  return `- ${g.treatment}${g.strength ? ` ${g.strength}` : ''}${g.conflicts.length ? ` — **${g.conflicts.length} conflicts**` : ''}: ${each.join('; ')}`
}

/** docs/review/fit.md: the counts by language and check. Never a list of pages: nobody can read them all. */
export function fitReport(pages: Page[], state: FitState): string {
  const rows = LANGS.map(lang => ({ lang, ...fitCounts(pages, state, lang) }))
  const head = ['Language', 'Pages', 'Read', 'Wrong for the reader', ...FIT_CHECKS]
  const unchecked = uncheckedProducts(pages, state, 'vi').slice(0, 40)
  return `# Written for the reader

Generated by \`pnpm engine fit\` (\`packages/engine/src/fit.ts\`, checklist in \`src/prompts/fit.md\`). "Wrong for the reader": pages with a
finding on any check but words. Rules run on every page; the model's findings count only on pages it has read as they are now.

| ${head.join(' | ')} |
| ${head.map(() => '---').join(' | ')} |
${rows.map(r => `| ${[LANG_NAME[r.lang], r.pages, r.read, r.wrongReader, ...FIT_CHECKS.map(c => r.by[c])].join(' | ')} |`).join('\n')}

Pages with a dose whose source isn't kept, so a missing caution can't be told: ${rows.map(r => `${LANG_NAME[r.lang]} ${r.noSource} of ${r.dosed}`).join(', ')}.

## Doses on more than one page

Per litre, by what the pages say each is for. A conflict is the same treatment, strength, use and method at rates that can't both be right: flagged, never averaged. A person settles which holds.

${doseGroups(pages, state).filter(g => new Set(g.rows.map(r => `${r.low.toFixed(3)}-${r.high.toFixed(3)}${r.unit}`)).size > 1).slice(0, 40).map(doseLine).join('\n') || '- none'}

## What each check is

${FIT_CHECKS.map(c => `- ${c}: ${FIT_TITLE[c]}`).join('\n')}

## Products the market table has no row for, Vietnamese pages

${unchecked.map(([n, k]) => `- ${n.replace(/([[\]|*_\`<>\\])/g, '\\$1')}: ${k}`).join('\n') || '- none'}
`
}
