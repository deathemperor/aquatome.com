/**
 * What counts as an amount, in one place: the video mend's editor may not write or change one (the chief of staff, 19 Nov
 * 2026, after six reads of #1690 found a new way to read an amount each time). It errs wide: a word here that isn't an
 * amount where it stands ("nắp" as a tank's lid, "năm" as a year) costs a mend, and a miss is the one way an amount still
 * reaches the editor. Nothing is carved out: the bare "một" is a count of one as often as it's the article "a", and a
 * chemical name's digits are figures (Codex's seventh read of #1690 turned a count of one into one per group, and NO3 into
 * nitrite; the chief of staff, 19 Nov 2026: Friday ships on the wide list).
 *
 * The text is read as a reader sees it: a character that shows nothing (a soft hyphen, a zero-width space, a variation
 * selector) is taken out first, and a word is matched in its plain form (a full-width "ｈａｉ" is "hai"). An amount is any
 * of these, as a whole word where it's a word:
 * - a number in any script: a digit, a full-width or circled one, a Roman numeral, a fraction sign ("½", "⅜"), a
 *   superscript or subscript digit ("m³", "CO₂"); and "%", "‰" or "°";
 * - a letter of any alphabet but the Latin one, which Vietnamese and English are written in: a Thai or Chinese number
 *   word, or a Cyrillic or Greek letter that looks like a Latin one;
 * - a number in words: một, mốt, hai, ba, bốn, tư, năm, lăm, sáu, bảy, bẩy, tám, chín, mười, mươi, trăm, nghìn, ngàn,
 *   vạn, triệu, tỷ, tỉ, linh, lẻ, chục, tá; English one to twenty, twenty to ninety by tens, hundred, thousand,
 *   million, billion, dozen; Indonesian and Malay satu, dua, tiga, empat, lima, enam, tujuh, delapan, lapan, sembilan,
 *   sepuluh, sebelas, belas, puluh, ratus, ribu, juta, seratus, seribu, sejuta;
 * - a half, a few, a little, a pair, a multiple: nửa, rưỡi, rưởi, vài, dăm, mấy, chút, xíu, tí, đôi, cặp, gấp, half,
 *   quarter, few, couple, twice, double, triple, setengah, separuh, seperempat, beberapa;
 * - a spoon, a cap, a drop, a tablet, a packet, a container and the like: thìa, muỗng, nắp, giọt, viên, gói, túi, bao,
 *   chai, lọ, hũ, cốc, chén, ly, bát, tô, xô, thùng, bình, ống, nắm, vốc, nhúm, dúm, liều, butir, and spoon, teaspoon,
 *   tablespoon, tsp, tbsp, cup, pint, quart, cap, capful, drop, tablet, pill, packet, sachet, scoop, pump, pinch;
 * - a unit of measure: ml, mililít, mililit, milliliter, millilitre, l, lít, lit, litre, liter, cc, mg, milligram, g, gr,
 *   gam, gram, kg, kilogram, cân, ký, kí, lạng, oz, ounce, fl, lb, pound, ppm, ppt, cm, centimet, centimét, xentimét,
 *   centimeter, centimetre, mm, millimeter, millimetre, m, mét, meter, metre, tấc, km, inch, in, ft, feet, foot, gallon,
 *   gal, galông, galon, độ, °, dh, dgh, dkh, kh, gh, w, watt, kw, k, kelvin, lumen, lux, par, v, volt, a;
 * - a count of time: giây, phút, giờ, tiếng, ngày, đêm, hôm, buổi, tuần, tháng, năm, lần, second, minute, hour, day, week,
 *   month, year, time, times.
 *
 * Not on it, so a read can attack them: vague comparatives ("ít", "nhiều", "hơn", "lớn", "nhỏ"), which say more or less but
 * give no amount; "phân" (fertilizer, and a centimetre in speech) and "phần" (a part), on which too many of a guide's
 * sentences would wait; the counting words ("con", "cái", "cây", "ekor"), which "một" or a figure beside them holds; and
 * number words of languages the guides aren't written or sourced in (French, Spanish, German). Some words
 * on it are other words too ("cân bằng", "ký sinh", "bình thường", "ống lọc", "thùng lọc"): they cost a mend, as erring
 * wide does.
 */
const WORDS = [
  // numbers in words
  'một', 'mốt', 'hai', 'ba', 'bốn', 'tư', 'năm', 'lăm', 'sáu', 'bảy', 'bẩy', 'tám', 'chín', 'mười', 'mươi', 'trăm', 'nghìn', 'ngàn',
  'vạn', 'triệu', 'tỷ', 'tỉ', 'linh', 'lẻ', 'chục', 'tá',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen',
  'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred', 'thousand', 'million', 'billion', 'dozen',
  'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'lapan', 'sembilan', 'sepuluh', 'sebelas', 'belas', 'puluh',
  'ratus', 'ribu', 'juta', 'seratus', 'seribu', 'sejuta',
  // halves, a few, pairs, multiples
  'nửa', 'rưỡi', 'rưởi', 'vài', 'dăm', 'mấy', 'chút', 'xíu', 'tí', 'đôi', 'cặp', 'gấp', 'half', 'quarter', 'few', 'couple', 'twice',
  'double', 'triple', 'setengah', 'separuh', 'seperempat', 'beberapa',
  // spoons, caps, drops, tablets, packets, containers
  'thìa', 'muỗng', 'nắp', 'giọt', 'viên', 'gói', 'túi', 'bao', 'chai', 'lọ', 'hũ', 'cốc', 'chén', 'ly', 'bát', 'tô', 'xô', 'thùng',
  'bình', 'ống', 'nắm', 'vốc', 'nhúm', 'dúm', 'liều', 'butir',
  'spoon', 'spoons', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons', 'tsp', 'tbsp', 'cup', 'cups', 'pint', 'pints', 'quart',
  'quarts', 'cap', 'caps', 'capful', 'capfuls',
  'drop', 'drops', 'tablet', 'tablets', 'pill', 'pills', 'packet', 'packets', 'sachet', 'sachets', 'scoop', 'scoops', 'pump',
  'pumps', 'pinch',
  // units of measure
  'ml', 'mililít', 'mililit', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'l', 'lít', 'lit', 'litre', 'litres', 'liter',
  'liters', 'cc', 'mg', 'milligram', 'milligrams', 'g', 'gr', 'gam', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'cân', 'ký', 'kí',
  'lạng', 'oz', 'ounce', 'ounces', 'fl', 'lb', 'lbs', 'pound', 'pounds', 'ppm', 'ppt', 'cm', 'centimet', 'centimét', 'xentimét',
  'centimeter', 'centimeters', 'centimetre', 'centimetres', 'mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres', 'm',
  'mét', 'meter', 'meters', 'metre', 'metres', 'tấc', 'km', 'inch', 'inches', 'in', 'ft', 'feet', 'foot', 'gallon', 'gallons', 'gal',
  'galông', 'galon',
  'độ', 'dh', 'dgh', 'dkh', 'kh', 'gh', 'w', 'watt', 'watts', 'kw', 'k', 'kelvin', 'lumen', 'lumens', 'lux', 'par', 'v', 'volt',
  'volts', 'a',
  // counts of time
  'giây', 'phút', 'giờ', 'tiếng', 'ngày', 'đêm', 'hôm', 'buổi', 'tuần', 'tháng', 'lần',
  'second', 'seconds', 'minute', 'minutes', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  'time', 'times',
]
const WORD = new Set(WORDS)
/** A number in any script, percent, per mille, a degree sign; or a letter of any alphabet but the Latin one. */
const SIGN = /[\p{N}%‰°]|(?![\p{Script=Latin}])\p{L}/u
/** A run of letters and figures ("CO2", "10cm", "nắp"), or one mark. */
const TOKENS = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu
/** The text as a reader sees it: characters that show nothing out. */
const seen = (text: string) => text.normalize('NFC').replace(/\p{Default_Ignorable_Code_Point}/gu, '')

/** Each amount in a text, as it's written (a sign, or a whole word from the list), in order. */
export function amounts(text: string): string[] {
  const out: string[] = []
  for (const [run] of seen(text).matchAll(TOKENS)) {
    for (const [w] of run.matchAll(/[\p{L}\p{M}]+|[^\p{L}\p{M}]/gu)) if (SIGN.test(w) || WORD.has(w.normalize('NFKC').toLowerCase())) out.push(w)
  }
  return out
}

export const holdsAmount = (text: string) => amounts(text).length > 0
