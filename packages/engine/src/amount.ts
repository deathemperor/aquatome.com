/**
 * What counts as an amount, in one place: the video mend's editor may not write or change one (the chief of staff, 19 Nov
 * 2026, after six reads of #1690 found a new way to read an amount each time). It errs wide: a word here that isn't an
 * amount where it stands ("nắp" as a tank's lid, "năm" as a year) costs a mend, and a miss is the one way an amount still
 * reaches the editor. Two things are carved out, and only these (the chief of staff, 19 Nov 2026): the bare "một", which
 * is also the article "a" ("một cách là…", the hedge the reviews ask for), and the digits of a chemical name in
 * `CHEMICALS`. "một" beside any word below is still an amount ("một thìa", "một nắm"), and a chemical name is checked
 * apart: an answer may drop one, never add or swap one (NO2 for NO3).
 *
 * An amount is any of these, as a whole word where it's a word:
 * - a digit, a fraction sign ("½", "⅜"), a superscript or subscript digit ("m³", "CO₂"), "%" or "‰";
 * - a number in words: mốt, hai, ba, bốn, tư, năm, lăm, sáu, bảy, bẩy, tám, chín, mười, mươi, trăm, nghìn, ngàn,
 *   vạn, triệu, tỷ, tỉ, linh, lẻ, chục, tá, and English one to twelve, twenty, thirty, hundred, thousand, dozen;
 * - a half, a few, a pair, a multiple: nửa, rưỡi, rưởi, vài, dăm, mấy, đôi, cặp, gấp, half, quarter, few, couple, twice,
 *   double, triple;
 * - a spoon, a cap, a drop, a tablet, a packet and the like: thìa, muỗng, nắp, giọt, viên, gói, túi, bao, chai, lọ, hũ,
 *   cốc, chén, ly, nắm, nhúm, dúm, liều, and spoon, teaspoon, tablespoon, tsp, tbsp, cap, capful, drop, tablet, pill,
 *   packet, sachet, scoop, pump, pinch;
 * - a unit of measure: ml, l, lít, cc, mg, g, gam, gram, kg, oz, ounce, lb, pound, ppm, ppt, cm, mm, m, mét, km, inch, in,
 *   ft, feet, foot, gallon, gal, galông, galon, độ, °, dh, dgh, dkh, kh, gh, w, watt, kw, k, kelvin, lumen, lux, par, v,
 *   volt, a;
 * - a count of time: giây, phút, giờ, tiếng, ngày, đêm, hôm, buổi, tuần, tháng, năm, lần, second, minute, hour, day, week,
 *   month, year, time, times.
 *
 * Not on it, so a read can attack them: vague comparatives ("ít", "nhiều", "hơn", "lớn", "nhỏ"), which say more or less but
 * give no amount.
 */
const WORDS = [
  // numbers in words
  'mốt', 'hai', 'ba', 'bốn', 'tư', 'năm', 'lăm', 'sáu', 'bảy', 'bẩy', 'tám', 'chín', 'mười', 'mươi', 'trăm', 'nghìn', 'ngàn',
  'vạn', 'triệu', 'tỷ', 'tỉ', 'linh', 'lẻ', 'chục', 'tá',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'thirty',
  'hundred', 'thousand', 'dozen',
  // halves, a few, pairs, multiples
  'nửa', 'rưỡi', 'rưởi', 'vài', 'dăm', 'mấy', 'đôi', 'cặp', 'gấp', 'half', 'quarter', 'few', 'couple', 'twice', 'double', 'triple',
  // spoons, caps, drops, tablets, packets
  'thìa', 'muỗng', 'nắp', 'giọt', 'viên', 'gói', 'túi', 'bao', 'chai', 'lọ', 'hũ', 'cốc', 'chén', 'ly', 'nắm', 'nhúm', 'dúm', 'liều',
  'spoon', 'spoons', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons', 'tsp', 'tbsp', 'cap', 'caps', 'capful', 'capfuls',
  'drop', 'drops', 'tablet', 'tablets', 'pill', 'pills', 'packet', 'packets', 'sachet', 'sachets', 'scoop', 'scoops', 'pump',
  'pumps', 'pinch',
  // units of measure
  'ml', 'l', 'lít', 'cc', 'mg', 'g', 'gam', 'gram', 'grams', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'ppm',
  'ppt', 'cm', 'mm', 'm', 'mét', 'km', 'inch', 'inches', 'in', 'ft', 'feet', 'foot', 'gallon', 'gallons', 'gal', 'galông', 'galon',
  'độ', 'dh', 'dgh', 'dkh', 'kh', 'gh', 'w', 'watt', 'watts', 'kw', 'k', 'kelvin', 'lumen', 'lumens', 'lux', 'par', 'v', 'volt',
  'volts', 'a',
  // counts of time
  'giây', 'phút', 'giờ', 'tiếng', 'ngày', 'đêm', 'hôm', 'buổi', 'tuần', 'tháng', 'lần',
  'second', 'seconds', 'minute', 'minutes', 'hour', 'hours', 'day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years',
  'time', 'times',
]
const WORD = new Set(WORDS)
/** Digits, fraction signs, superscript and subscript digits, percent and per mille, a degree sign. */
const SIGN = /[\d²³¹⁰-⁹₀-₉¼-¾⅐-⅞↉%‰°]/u

/**
 * The chemical names whose digits aren't amounts: exact tokens, any case, a subscript digit read as its digit. A closed
 * list: a name not here ("C6H12O6") is read as letters and digits, and its digits are amounts.
 */
export const CHEMICALS: readonly string[] = [
  'co2', 'o2', 'no2', 'no3', 'nh3', 'nh4', 'po4', 'h2s', 'h2o', 'h2o2', 'caco3', 'mgco3', 'nahco3', 'k2so4', 'mgso4', 'caso4',
  'kno3', 'kh2po4', 'k2hpo4', 'feso4', 'cuso4', 'cacl2', 'mgcl2',
]
const CHEMICAL = new Set(CHEMICALS)
const flat = (w: string) => w.toLowerCase().replace(/[₀-₉]/gu, d => String(d.charCodeAt(0) - 0x2080))
/** A run of letters and figures ("CO2", "10cm", "nắp"), or one mark. */
const TOKENS = /[\p{L}\p{M}\p{N}]+|[^\s\p{L}\p{M}\p{N}]/gu

/** Each amount in a text, as it's written (a sign, or a whole word from the list), in order. */
export function amounts(text: string): string[] {
  const out: string[] = []
  for (const [run] of text.normalize('NFC').matchAll(TOKENS)) {
    if (CHEMICAL.has(flat(run))) continue
    for (const [w] of run.matchAll(/[\p{L}\p{M}]+|[^\p{L}\p{M}]/gu)) if (SIGN.test(w) || WORD.has(w.toLowerCase())) out.push(w)
  }
  return out
}

export const holdsAmount = (text: string) => amounts(text).length > 0

/** The chemical names a text holds, as `CHEMICALS` writes them, as often as it holds them. */
export const chemicals = (text: string) => [...text.normalize('NFC').matchAll(TOKENS)].map(([run]) => flat(run)).filter(w => CHEMICAL.has(w))
