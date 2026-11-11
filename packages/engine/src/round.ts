import type { UnitLang } from '@aq/schema'

/**
 * Litres that only a gallon conversion gives: a US 5, 10, 15, 20, 25, 30, 40, 50, 55, 75, 90, 100, 120, 125, 150, 180,
 * 200 and 250-gallon tank, converted to the litre or to tens. The reader-fit rule finds them (fit.ts), and `roundConverted`
 * rounds them.
 */
export const CONVERTED_LITRES: readonly number[] = [19, 38, 57, 76, 95, 113, 114, 151, 189, 208, 210, 284, 285, 341, 379, 380, 454, 473, 568, 681, 757, 946, 950]
/** The tank sizes a keeper here names, in litres. */
const TANK_LITRES = [20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 750, 800, 1000]
/**
 * A size a keeper names stays within a tenth of the exact figure, and never more than a twentieth under it: a minimum
 * mustn't drop by 9% (the chief of staff, 2026-11-11 and 12).
 */
const WITHIN = 0.1
const UNDER = 0.05
/** A tank's side in cm that only an inch or foot conversion gives (13, 15, 16, 18, 20, 24, 30, 36, 48, 60, 72, 84, 96 in). */
const INCH_SIDES = new Set([33, 38, 41, 46, 51, 61, 76, 91, 122, 152, 183, 213, 244])
/** A tank's length in cm that only a foot conversion gives (2 to 8 ft): "bể dài 122 cm". */
const FOOT_LENGTHS = new Set([61, 91, 122, 152, 183, 213, 244])

const near = (n: number) => TANK_LITRES.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) || (Math.abs(x - n) === Math.abs(b - n) && x > b) ? x : b))
/**
 * The tank size a keeper here names for a volume: the nearest of TANK_LITRES, or the next one up where the nearest is
 * more than a twentieth under it (29 gallons, 110 litres, is 120, not 100), when that is within a tenth.
 */
const keeperLitres = (n: number): number | undefined => {
  const r = n - near(n) > n * UNDER ? TANK_LITRES.find(x => x >= n)! : near(n)
  return Math.abs(r - n) / n <= WITHIN ? r : undefined
}
const litres = (n: number) => (CONVERTED_LITRES.includes(n) ? keeperLitres(n) ?? n : n)

/** A US gallon, in litres. */
const GALLON = 3.785411784
/**
 * The one rule for a tank a source names in US gallons: the size a keeper here names it, in litres (`keeperLitres` of
 * the exact volume). The writers' prompts give it ({{TANKS_EN}}, {{TANKS_VI}}: `withTanks`), the units mender maps a
 * figure converted another way back to it (`usTankOf`, units-mend.ts), and `roundConverted` rounds to the same sizes.
 * The site's ready-made tank table (@aq/schema READY_TANKS, the tank volume tool) reads each size as the same tank as
 * its exact volume, but for 25 gallons: 95 litres is a 70 cm tank there, 100 an 80 cm one. 100 stands, as roundConverted
 * already writes it and the roomier tank is the safer advice (the chief of staff, 2026-11-11).
 */
export const US_TANKS: readonly (readonly [gallons: number, litres: number])[] =
  [5, 5.5, 10, 15, 20, 25, 29, 30, 40, 50, 55, 65, 75, 90, 100, 110, 120, 125, 150, 180, 200, 210, 220, 250].map(g => [g, keeperLitres(g * GALLON)!] as const)
/**
 * The US tank a volume in litres is a conversion of, by the exact figure (to the litre either way, or with a decimal:
 * 113, 114, 113,6 for 30 gallons) or to the nearest 5 litres (115): what writers made of it before this table. Any other
 * figure, a size in between (470 for 125 gallons), maps to none.
 */
export function usTankOf(litres: number): readonly [gallons: number, litres: number] | undefined {
  return US_TANKS.find(([g]) => Math.abs(litres - g * GALLON) < 1 || litres === Math.round((g * GALLON) / 5) * 5)
}
/** The table as the writers' prompts give it, in English and in Vietnamese. */
const sizes = (gal: string, l: string) => {
  const byLitres = new Map<number, number[]>()
  for (const [g, x] of US_TANKS) byLitres.set(x, [...(byLitres.get(x) ?? []), g])
  return [...byLitres].map(([x, gs]) => `${gs.join(' hoặc ').replace(/(\d)\.(\d)/g, '$1,$2')} ${gal} ${x} ${l}`)
}
export const TANK_RULE = {
  en: `a tank given in US gallons is named by the size keepers here say, never its exact conversion or one to the nearest 5 litres: ${sizes('gallons', 'litres').map(s => s.replaceAll(' hoặc ', ' or ').replace(/(\d),(\d)/g, '$1.$2')).join(', ')}. A tank size not listed is converted and rounded to whole litres`,
  vi: `bể ghi theo gallon Mỹ thì gọi bằng cỡ người chơi ở đây vẫn gọi, không đổi chính xác, không làm tròn tới 5 lít: ${sizes('gallon', 'lít').join(', ')}. Cỡ bể không có ở đây thì đổi ra lít, làm tròn tới số nguyên`,
}
/** A writer's or reviewer's prompt with the table in place of {{TANKS_EN}} and {{TANKS_VI}}. */
export const withTanks = (prompt: string) => prompt.replaceAll('{{TANKS_EN}}', TANK_RULE.en).replaceAll('{{TANKS_VI}}', TANK_RULE.vi)
const side = (n: number) => (n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10)

const L = String.raw`(?:lít|liter|litre|ลิตร|L|l)(?![\p{L}\p{N}])`
const JOIN = String.raw`\s*(?:[–-]|hoặc|đến|tới|và|atau|hingga|sampai|dan|หรือ|ถึง|และ)\s*`
/** A dose's volume ("1 gói cho mỗi 38 lít", "per 38 liter"): the label's own figure, which stays. */
const PER = /(?:mỗi|cho|trên|per|setiap|untuk|ต่อ|\/)\s*(?:khoảng\s*)?(?:\d+\s*[–-]\s*)?$/iu
const TANK = /(?:bể|hồ|akuarium|tangki|ตู้)[^.;!?<>]{0,40}$/iu
const LITRE_FIG = new RegExp(String.raw`(?<![\d.,])(\d{2,3})(?:(${JOIN})(\d{2,3}))?(\s*${L})`, 'gu')
const SIDES = /(?<![\d.,])(\d{2,3})(\s*[×x]\s*)(\d{2,3})(?:(\s*[×x]\s*)(\d{2,3}))?(\s*(?:cm|ซม\.))/gu
const LENGTH = /(?<![\d.,×x]\s?)(\d{2,3})(\s*(?:cm|ซม\.))(?!\s*[×x])/gu
const fromF = (c: number) => { const f = c * 9 / 5 + 32; return Math.abs(f - Math.round(f)) < 0.1 }

/**
 * A text's metric figures that only a conversion gives, rounded to what a keeper here says. `toMetric` (@aq/schema)
 * converts an imperial figure exactly ("bể 10 gallon" → "bể 38 lít"), and writers convert the same way; nobody here
 * names a tank "38 lít", "183 × 61 cm" or a temperature "22,8 °C". This is the step after it:
 * - litres in CONVERTED_LITRES, to the nearest tank size a keeper names, when that is within 7%: "38 lít" → "40 lít",
 *   "681 lít" → "700 lít", "110 lít" stays. A range keeps both ends ("57–76 lít" → "60–80 lít"), and becomes one figure
 *   only when both ends are one tank converted two ways ("208–210 lít" → "200 lít"); ends a real difference apart that
 *   would meet are rounded to tens instead ("189–208 lít" → "190–210 lít").
 * - a tank's sides, when one is an inch or foot figure: to 5 cm under a metre, 10 above ("183 × 61 cm" → "180 × 60 cm");
 *   a tank's length in feet the same ("bể dài ít nhất 122 cm" → "120 cm")
 * - °C that a whole °F gives, to whole degrees ("22,8 đến 27,8 °C", 73 to 82 °F, → "23 đến 28 °C"); a measured
 *   "29,3 °C" stays, and so does a range whose ends would meet
 * Left as written: a dose's volume ("1 gói cho mỗi 38 lít"), a length that isn't a tank's ("cá dài 61 cm"), HTML tags.
 */
export function roundConverted(text: string, lang: UnitLang): string {
  const dec = lang === 'th' || lang === 'ms' ? '\\.' : ','
  const D = String.raw`(\d{1,2})${dec}(\d)`
  const TEMP = new RegExp(String.raw`(?<![\d.,])${D}(?:(${JOIN})(?:${D}|(\d{1,2})(?![\d.,])))?(\s*(?:°\s?C|độ C|độ))`, 'gu')
  const round = (t: string) => t
    .replace(LITRE_FIG, (all, a: string, j: string | undefined, b: string | undefined, u: string, at: number, s: string) => {
      if (PER.test(s.slice(Math.max(0, at - 24), at))) return all
      const x = Number(a)
      if (!b) return `${litres(x)}${u}`
      const y = Number(b)
      let [rx, ry] = [litres(x), litres(y)]
      if (rx === ry && x !== y) {
        if (Math.abs(x - y) / Math.max(x, y) <= 0.05) return `${rx}${u}`
        ;[rx, ry] = [Math.round(x / 10) * 10, Math.round(y / 10) * 10]
        if (rx === ry) return all
      }
      return `${rx}${j}${ry}${u}`
    })
    .replace(SIDES, (all, a: string, x1: string, b: string, x2: string | undefined, c: string | undefined, u: string) => {
      const ns = [a, b, c].filter((v): v is string => !!v).map(Number)
      if (!ns.some(n => INCH_SIDES.has(n))) return all
      const [ra, rb, rc] = ns.map(side)
      return `${ra}${x1}${rb}${c ? `${x2}${rc}` : ''}${u}`
    })
    .replace(LENGTH, (all, a: string, u: string, at: number, s: string) =>
      (FOOT_LENGTHS.has(Number(a)) && TANK.test(s.slice(Math.max(0, at - 48), at)) ? `${side(Number(a))}${u}` : all))
    .replace(TEMP, (all, a1: string, a2: string, j: string | undefined, b1: string | undefined, b2: string | undefined, b3: string | undefined, u: string) => {
      const num = (i: string, d: string) => Number(`${i}.${d}`)
      if (a2 === '0' || a2 === '5' || !fromF(num(a1, a2)) || (b1 && (b2 === '5' || !fromF(num(b1, b2!))))) return all
      const first = Math.round(num(a1, a2))
      if (!j) return `${first}${u}`
      const second = b1 ? Math.round(num(b1, b2!)) : Number(b3)
      return first === second ? all : `${first}${j}${second}${u}`
    })
  return text.split(/(<[^>]+>)/).map((seg, i) => (i % 2 ? seg : round(seg))).join('')
}

/**
 * A figure in US units: gallons, inches (a number's "in" only as a measure: "30 × 12 in", "3 in long"), feet, °F,
 * miles, pounds. Not "5 in a group", "Ft. Lauderdale" or "LB-12". The page languages' own words for them too, each a
 * word of its own ("menggeleng", "ฟุตบอล" aren't), and an Indonesian or Malay "kaki" only after a length word or a tank,
 * as @aq/schema reads it, since it is a leg too.
 */
export const US_UNITS = /gallons?|\bgal\b|galon|(?<!\p{L})gelen(?!\p{L})|ga-?\s?lông|แกลลอน|\binch(?:es)?\b|\binci\b|นิ้ว|\d\s*"|\d\s*in\.?(?=\s*(?:[x×)\],;]|long|deep|tall|high|wide|SL|TL|$))|\d\s*(?:feet|foot|ft)\b|(?<!\p{L})(?:kedalaman|panjang|tinggi|lebar|jarak|sedalam|setinggi|sepanjang|selebar|akuarium|tangki)(?:nya)?[^\d<>]{0,30}?\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:[.,]\d+)?)?\s*kaki(?!\p{L})|\d\s*(?:ฟุต|ปอนด์)(?![\p{L}\p{M}\p{N}])|°\s?F\b|độ F|\d\s*miles?\b|\d\s*(?:pounds?|lbs?)\b/iu

const END = String.raw`(?![\p{L}\p{N}])`
/** Metric lengths, by kind, as the page languages and the English sources write them. Thai runs words together: no end. */
const LENGTHS = String.raw`(?<cm>(?:cm|centimet(?:er|re)s?)${END}|ซม\.?|เซนติเมตร)|(?<mm>(?:mm|millimet(?:er|re)s?)${END}|มม\.?|มิลลิเมตร)|(?<km>km${END}|กิโลเมตร)|(?<m>(?:m|mét|meters?|metres?)${END}|เมตร)`
/** Metric units, by kind. */
const METRIC = String.raw`(?:(?<l>(?:lít|liters?|litres?|l)${END}|ลิตร)|${LENGTHS}|(?<c>(?:[°º]\s?C|độ C|degrees? C(?:elsius)?)${END}|องศา(?:เซลเซียส)?))`
const NUMBER = String.raw`\d+(?:[.,]\d+)*`
/**
 * What joins the numbers one unit closes, one kind to a figure: a range ("2,5–5 cm", "24 to 28 °C"), a tank's sides
 * ("91 × 38 × 30 cm"), a choice of two ("57 hoặc 76 lít", "between 24 and 28 °C"). Mixed, they are separate figures:
 * "pH 6.5–7.5 and 24–28 °C" is 24 and 28 °C.
 */
const RANGE = String.raw`(?:\s*[–\-]\s*|\s+(?:to|đến|tới|hingga|sampai)\s+|\s*ถึง\s*)`
const BY = String.raw`\s*[×x*∗]\s*`
const CHOICE = String.raw`(?:\s+(?:or|and|hoặc|và|atau|dan)\s+|\s*(?:หรือ|และ)\s*)`
/** A tank's sides: "x" joins lengths only ("2 x 10 litre water changes" are changes of 10 litres). */
const BY_SIDES = new RegExp(String.raw`(?<![\d.,])(${NUMBER}(?:${BY}${NUMBER})+)\s*-?\s*(?:${LENGTHS})`, 'giu')
/** One number, a range, or a choice of two whose first isn't joined to a number before it ("pH 6.5 or 7.5 and 75 litres" is 75 litres). */
const FIGURE = new RegExp(String.raw`(?<![\d.,])(${NUMBER}(?:${RANGE}${NUMBER})?|(?<!\d(?:${RANGE}|${BY}|${CHOICE}))${NUMBER}${CHOICE}${NUMBER})\s*-?\s*${METRIC}`, 'giu')
/** A number as a language writes it: "2,5" and "1.000" in Vietnamese and Indonesian, "2.5" and "1,000" in the others. */
export const numberIn = (s: string, lang: UnitLang | 'en') => Number(lang === 'vi' || lang === 'id' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''))
/**
 * A text's metric figures, each number with its unit's kind, every number the unit closes: "2,5–5 cm" is ["2.5 cm",
 * "5 cm"], "91 × 38 × 30 cm" three of cm, "11 litres" ["11 l"].
 */
export function metricFigures(text: string, lang: UnitLang | 'en'): string[] {
  const sides = [...text.matchAll(BY_SIDES)]
  // The sides read, the rest of the text is read without them.
  const rest = sides.reduce((t, m) => t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length), text)
  return [...sides, ...rest.matchAll(FIGURE)].sort((a, b) => a.index - b.index).flatMap(m => {
    const kind = Object.entries(m.groups ?? {}).find(([, v]) => v !== undefined)![0]
    return m[1]!.match(new RegExp(NUMBER, 'g'))!.map(x => `${numberIn(x, lang)} ${kind}`)
  })
}
/**
 * Whether every figure a quote gives is metric and one its English source gives in metric itself, alone or beside a US
 * one ("tanks as small as 11 litres", "5 gallons (about 19 litres)"): numbers stay as the source gives them (the chief
 * of staff, 2026-11-11), so the reader-fit check doesn't count them. A US unit in the quote, or one figure the source
 * doesn't give, still counts.
 */
export function sourceGives(quote: string, en: string, lang: UnitLang): boolean {
  if (US_UNITS.test(quote)) return false
  const figures = metricFigures(quote, lang)
  if (!figures.length) return false
  const given = new Set(metricFigures(en, 'en'))
  return figures.every(x => given.has(x))
}

type Page = { sections?: Record<string, string>; body?: string; summary?: string[]; faq?: { q: string; a: string }[] }
/** A page's text rounded (`roundConverted`): what `metricPage` (@aq/schema) reads, and reference lists stay as published. */
export function roundPage<T extends Page>(page: T, lang: UnitLang): T {
  const r = (s: string) => roundConverted(s, lang)
  return {
    ...page,
    ...(page.sections ? { sections: Object.fromEntries(Object.entries(page.sections).map(([k, v]) => [k, k.startsWith('references:') ? v : r(v)])) } : {}),
    ...(page.body !== undefined ? { body: r(page.body) } : {}),
    ...(page.summary ? { summary: page.summary.map(r) } : {}),
    ...(page.faq ? { faq: page.faq.map(f => ({ q: r(f.q), a: r(f.a) })) } : {}),
  }
}
