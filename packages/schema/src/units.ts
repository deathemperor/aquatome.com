const round1 = (n: number) => Math.round(n * 10) / 10
export const cToF = (c: number): number => round1(c * 9 / 5 + 32)
export const cmToIn = (cm: number): number => round1(cm / 2.54)

/**
 * Page text in metric only. Readers in Vietnam, Indonesia and Thailand use °C, cm and litres, but sources (and
 * translators following them) write "20–30 °C (68–86 °F)", "2 inch (khoảng 5 cm)" or a bare "10 gallon".
 * `toMetric` rewrites one text (HTML or plain) in the page's language:
 * - a metric figure with its imperial one beside it keeps only the metric: "120 × 30 cm (48 × 12 in)" → "120 × 30 cm",
 *   "880 mm, 35 inch" → "880 mm", "khoảng 21°C, tức 70°F" → "khoảng 21°C", "4,55 lít (1 inch cho mỗi gallon)" →
 *   "4,55 lít" (when they agree; "32–33 °C หรือ 86–88 °F" are two sources' figures, and the second is converted)
 * - an imperial figure with its metric one after it keeps the metric as written (the source's own conversion, UK
 *   gallons included): "2 inch (khoảng 5 cm)" → "5 cm", "6 inch/15 cm" → "15 cm", "30 gallon Mỹ, tức khoảng 114 L" →
 *   "114 L", "1 นิ้วต่อน้ำ 1 แกลลอน (2.5 ซม. ต่อ 4.55 ลิตร)" → "2.5 ซม. ต่อ 4.55 ลิตร"; a metric figure that doesn't
 *   match is not trusted, and one only "nearly" right ("6 feet (gần hai mét)") gives way to the exact conversion
 * - an imperial figure alone is converted: °C to whole degrees; cm to the half under 10 cm, whole above; feet to cm
 *   under a metre (and a tank's sides always in cm), else m to one decimal; litres to one decimal under 5 L, whole
 *   under 100 L, tens under 1,000 L, hundreds above (a range in the steps of its smallest end: "380–1.890 lít");
 *   gallons an hour (GPH) to litres an hour; pounds and ounces (a weight) to grams, kg from 1,000 g
 * - a change of temperature is no temperature: "±2 °F", "lên 9 °F", anything under 25 °F → ×5/9 ("1 °C" at least)
 * - "mid-60s °F" ("giữa 60 độ F", "ราวกลาง 50 °F") is the decade's middle: "khoảng 18 độ C"
 * - a US tank model is its volume and size, standard dimensions (L × W × H): "bể 20 gallon long" → "bể khoảng 75 lít
 *   (76 × 30 × 30 cm)"; in a sentence that names one, the other standard tanks get theirs too, since the sentence
 *   compares their shapes. A plain "bể 10 gallon" is a volume: "bể 38 lít"
 * - a pipe or fitting's inch size is a nominal size, not a length: shops in Vietnam sell pipe by its outside diameter
 *   in mm, "phi 21" for ½ inch, "phi 27" for ¾, 34 for 1, 42 for 1¼, 49 for 1½, 60 for 2. "ống PVC ¾ inch (khoảng 19
 *   mm)" → "ống PVC phi 27". Indonesian and Thai pages (none has a pipe yet) get the same outside diameter in mm.
 *   A hose (ống mềm) is sold by its inside size, and a hole saw (mũi khoét lỗ) cuts its own: their figures convert as
 *   lengths
 * - "84” x 27” x 28”", "6’ x 2’", "5ft x 2ft", "1/2" đến 1"", "bốn feet", "satu galon" are read as figures first;
 *   an Indonesian "kaki" is a foot only after a length word ("kedalaman minimal 3–4 kaki"), since it is a leg too
 * Left as published: a quoted label with its metric after it ("'…elevation 650 feet' (độ cao khoảng 200 m)",
 * "“một gallon nước cho một inch cá” (khoảng 3,8 lít…)"), a product's name ("Fluval 10 Gallon": a unit written with a
 * capital), a bottle's size in ounces ("chai 8 oz": fluid ounces, as sold), unit words with no figure ("vài inch").
 * Reference lists are not page text: `metricPage` leaves them alone.
 */
export type UnitLang = 'vi' | 'id' | 'th'
type Dim = 'temp' | 'length' | 'feet' | 'flow' | 'volume' | 'mass'

const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 }
// A number as the three languages and English write it: 3,5 / 3.5 / 24.000 / 3 1/2 / 1/2 / ½ / 1½.
const N = String.raw`(?:\d+\s+\d\/\d{1,2}|\d\/\d{1,2}|\d+(?:[.,]\d+)*(?:\s?[½¼¾])?|[½¼¾])`
const TO = String.raw`(?:\s*[–—−-]\s*|\s+(?:to|đến|tới|hoặc|sampai|hingga|atau|ถึง|หรือ)\s+)`
// Lengths only: a tank's sides ("48 × 12"), or a male's and a female's size ("2,2 / 1,6 inch").
const BY = String.raw`(?:\s*[×x*]\s*|\s+\/\s+)`
// A figure: one number or a range ("68–86", "73 °F–80"); a length also several by BY ("48 × 12 × 12").
const RANGE = String.raw`${N}(?:(?:\s*[°º˚]\s*F)?${TO}${N})?`
const FIG = (d: Dim) => (d === 'length' || d === 'feet' ? String.raw`${N}(?:(?:\s*[°º˚]\s*F)?${TO}${N}|(?:${BY}${N})+)?` : RANGE)
const QUAL = String.raw`(?:~|≈|±|khoảng|chừng|gần|tầm|ước|sekitar|kira-kira|hampir|ประมาณ|ราว|เกือบ|about|approx\.?|ca\.)`
const NEARLY = /^(?:gần|hampir|เกือบ|nearly)/u
// Not inside a number ("1.5") or a Latin word ("B2 in").
const START = String.raw`(?<![\d.,A-Za-z])`
const END = String.raw`(?!\p{L})`
const SUFFIX = String.raw`(?:\s+(?:SL|TL))?`

// Imperial units by dimension. "in" counts only with no word after it (SL, TL aside): "1922 in Lake Malawi" is English.
const GAL = String.raw`(?:(?:US|UK)\s+)?(?:[Gg]all?ons?|[Gg]al)`
const IMP_UNIT: Record<Dim, string> = {
  temp: String.raw`(?:[°º˚]\s*F${END}|độ\s*F${END}|℉)`,
  length: String.raw`(?:[Ii]nch(?:es)?${END}|inci${END}|นิ้ว(?!มือ|เท้า)|″|in${END}(?!\s+(?!SL\b|TL\b)\p{L})(?!\s+\d))`,
  feet: String.raw`(?:(?:[Ff]eet|[Ff]oot|ft)${END}|ฟุต)`,
  flow: String.raw`(?:(?:GPH|gph)${END}|${GAL}(?:\s+(?:Mỹ|US|AS))?\s*(?:mỗi\s+giờ|\/\s*giờ|per\s+jam|\/\s*jam|per\s+hour)${END}|แกลลอน(?:สหรัฐฯ?)?\s*(?:ต่อ|\/)\s*ชั่วโมง)`,
  volume: String.raw`(?:${GAL}${END}|แกลลอน)(?:\s+(?:Mỹ|Anh|US|UK|AS|Inggris|imperial)${END}|\s*(?:สหรัฐฯ?|อังกฤษ))?`,
  mass: String.raw`(?:(?:lbs?|oz|pounds?|ounces?|pon)${END}|ปอนด์|ออนซ์)`,
}
const LENGTH = String.raw`(?:(?:mm|cm|km|m|mét|meter)${END}|ซม\.|มม\.|เซนติเมตร|เมตร)`
const LITRE = String.raw`(?:lít|L|l|liter|litre)`
const METRIC_UNIT: Record<Dim, string> = {
  temp: String.raw`(?:[°º˚]\s*C${END}|độ\s*C${END}|℃|องศา)`,
  length: LENGTH,
  feet: LENGTH,
  flow: String.raw`(?:${LITRE}\s*\/\s*(?:giờ|h|jam|hour)${END}|(?:lph|LPH)${END}|ลิตร\s*(?:\/|ต่อ)\s*ชั่วโมง)`,
  volume: String.raw`(?:(?:${LITRE}|ml|mL)${END}|ลิตร)`,
  mass: String.raw`(?:(?:g|kg|mg|gram|gam|ml|mL)${END}|กรัม|กก\.|มล\.)`,
}
// Flow before volume: "3000 gallon Mỹ mỗi giờ" is a flow, not 3000 gallons.
const DIMS: Dim[] = ['temp', 'length', 'feet', 'flow', 'volume', 'mass']
const CHECKED = DIMS.filter(d => d !== 'mass')
const imp = (d: Dim) => String.raw`${START}(${FIG(d)})(\s*-?\s*)(${IMP_UNIT[d]})(${SUFFIX})`
const metric = (d: Dim) => String.raw`${START}${FIG(d)}\s*${METRIC_UNIT[d]}${SUFFIX}`
const withQual = (d: Dim) => String.raw`(?:${QUAL}\s*)?${metric(d)}`
const re = (s: string) => new RegExp(s, 'gu')
const ANY_IMP = String.raw`(?:${CHECKED.map(imp).join('|')})`
const ANY_MET = String.raw`(?:${QUAL}\s*)?(?:${CHECKED.map(metric).join('|')})`
const after = (a: unknown[]) => ({ at: a[a.length - 2] as number, s: a[a.length - 1] as string })
const dimOf = (fig: string, kind: (d: Dim) => string) => CHECKED.find(d => new RegExp(`^${kind(d)}$`, 'u').test(fig.trim()))

function parseNum(s: string, lang: UnitLang): number {
  const t = s.trim()
  let m = /^(\d+)\s+(\d)\/(\d{1,2})$/.exec(t)
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3])
  m = /^(\d)\/(\d{1,2})$/.exec(t)
  if (m) return Number(m[1]) / Number(m[2])
  const frac = /[½¼¾]$/.exec(t)
  const whole = (frac ? t.slice(0, -1) : t).trim()
  // Thousands: "24.000" in Vietnamese and Indonesian, "1,000" in Thai; the other mark is the decimal one.
  const group = lang === 'th' ? ',' : '.'
  const grouped = new RegExp(String.raw`^\d{1,3}(?:[${group}]\d{3})+(?:[.,]\d+)?$`).test(whole)
  const n = whole === '' ? 0 : Number((grouped ? whole.split(group).join('') : whole).replace(',', '.'))
  return n + (frac ? FRAC[frac[0]]! : 0)
}
const numbers = (fig: string, lang: UnitLang) => [...fig.matchAll(re(N))].map(m => parseNum(m[0], lang))

function fmt(n: number, lang: UnitLang): string {
  const [int, dec] = String(n).split('.')
  const i = int!.length > 3 ? int!.replace(/\B(?=(\d{3})+$)/g, lang === 'th' ? ',' : '.') : int!
  return dec ? `${i}${lang === 'th' ? '.' : ','}${dec}` : i
}
const roundTo = (n: number, step: number) => Number((Math.round(n / step) * step).toFixed(step < 1 ? 1 : 0))
const isOunce = (unit: string) => /oz|ounce|ออนซ์/u.test(unit)
const isUk = (unit: string) => /\b(?:UK|Anh|Inggris|imperial)\b|อังกฤษ/u.test(unit)
const litres = (gal: number, uk: boolean) => gal * (uk ? 4.546 : 3.785)
const litreStep = (l: number) => (l < 5 ? 0.1 : l < 100 ? 1 : l < 1000 ? 10 : 100)
/** A °F figure that is a change of temperature, not one: after "±", or every number under 25 °F (-4 °C). */
const isDelta = (fig: string, before: string, lang: UnitLang) => /±\s*$/.test(before) || numbers(fig, lang).every(n => n < 25)
const UNIT_OUT: Record<UnitLang, Record<'length' | 'feet' | 'flow' | 'volume', string>> = {
  vi: { length: 'cm', feet: 'm', flow: 'lít/giờ', volume: 'lít' },
  id: { length: 'cm', feet: 'm', flow: 'liter/jam', volume: 'liter' },
  th: { length: 'ซม.', feet: 'เมตร', flow: 'ลิตร/ชั่วโมง', volume: 'ลิตร' },
}
const GRAMS: Record<UnitLang, [string, string]> = { vi: ['g', 'kg'], id: ['g', 'kg'], th: ['กรัม', 'กก.'] }

/** The imperial figure in metric: each number converted, its range and side separators kept. */
function convert(fig: string, gap: string, unit: string, suffix: string, d: Dim, lang: UnitLang, delta = false): string {
  const parts = fig.replace(/\s*[°º˚]\s*F/g, '').split(new RegExp(`(${TO}|${BY})`, 'u'))
  const nums = parts.filter((_, i) => i % 2 === 0).map(p => parseNum(p, lang))
  const sides = parts.length > 1 && new RegExp(`^${BY}$`, 'u').test(parts[1]!)
  let out: number[]
  let unitOut = d === 'temp' || d === 'mass' ? '' : UNIT_OUT[lang][d]
  if (d === 'temp') out = nums.map(f => (delta ? Math.max(1, Math.round(f * 5 / 9)) : Math.round((f - 32) * 5 / 9)))
  else if (d === 'length') out = nums.map(i => { const cm = i * 2.54; return cm < 1 ? round1(cm) : cm < 10 ? roundTo(cm, 0.5) : Math.round(cm) })
  else if (d === 'feet') {
    const m = nums.map(ft => ft * 0.3048)
    // A tank's sides, or anything under a metre, in cm: "4 ft × 2 ft" → "122 × 61 cm", "2 feet" → "61 cm".
    if (sides || Math.max(...m) < 1) { out = m.map(x => Math.round(x * 100)); unitOut = UNIT_OUT[lang].length }
    else out = m.map(x => (x < 10 ? round1(x) : Math.round(x)))
  } else if (d === 'mass') {
    const g = nums.map(x => x * (isOunce(unit) ? 28.35 : 453.6))
    const kg = Math.max(...g) >= 1000
    out = g.map(x => (kg ? (x < 10_000 ? round1(x / 1000) : Math.round(x / 1000)) : roundTo(x, x < 10 ? 0.1 : x < 100 ? 1 : 10)))
    unitOut = GRAMS[lang][kg ? 1 : 0]
  } else {
    const l = nums.map(g => litres(g, isUk(unit)))
    const step = litreStep(Math.min(...l))
    out = l.map(x => roundTo(x, step))
  }
  const text = parts.map((p, i) => (i % 2 ? p : fmt(out[i / 2]!, lang)))
  // A range whose ends meet once rounded ("73–74 °F") is one figure.
  const one = text.length === 3 && text[0] === text[2] && new RegExp(`^${TO}$`, 'u').test(text[1]!) ? text[0]! : text.join('')
  if (d === 'temp') return /độ/.test(unit) ? `${one} độ C` : `${one}${/\s/.test(gap) ? ' ' : ''}°C`
  return `${one} ${unitOut}${suffix}`
}

/** A metric figure's numbers in °C, cm, litres or grams. */
function metricValues(text: string, d: Dim, lang: UnitLang): number[] {
  const scale = d === 'mass' ? (/(?:^|[^\p{L}])kg(?!\p{L})|กก\./u.test(text) ? 1000 : /(?:^|[^\p{L}])mg(?!\p{L})/u.test(text) ? 0.001 : 1)
    : /(?:^|[^\p{L}])mm(?!\p{L})|มม\./u.test(text) ? 0.1 : /(?:^|[^\p{L}])km(?!\p{L})/u.test(text) ? 100_000
      : /(?:^|[^\p{L}])(?:m|mét|meter)(?!\p{L})|(?<!เซนติ)เมตร/u.test(text) ? 100 : /(?:^|[^\p{L}])m[lL](?!\p{L})/u.test(text) ? 0.001 : 1
  return numbers(text.replace(re(QUAL), ''), lang).map(n => n * scale)
}
/** Whether a metric figure says what the imperial one does: each end within a fifth (a gallon may be US or UK). */
function agrees(impFig: string, impUnit: string, met: string, d: Dim, lang: UnitLang, delta = false): boolean {
  const a = numbers(impFig.replace(/\s*[°º˚]\s*F/g, ''), lang)
  const b = metricValues(met, d, lang)
  if (!a.length || a.length !== b.length) return false
  const near = (x: number, y: number, uk: boolean) => {
    if (d === 'temp') return Math.abs((delta ? x * 5 / 9 : (x - 32) * 5 / 9) - y) <= 1.5
    const want = d === 'length' ? x * 2.54 : d === 'feet' ? x * 30.48 : d === 'mass' ? x * (isOunce(impUnit) ? 28.35 : 453.6)
      : litres(x, uk)
    return Math.abs(want - y) <= Math.max(want * 0.2, d === 'length' ? 0.6 : 0)
  }
  return [isUk(impUnit), true].some(uk => a.every((x, i) => near(x, b[i]!, uk)))
}

// --- Read first: figures written in ways the unit patterns don't see. ---------------------------------------------
// Vietnamese numbers in words, up to 99: "sáu", "mười hai", "hai mươi lăm".
const DIGIT: Record<string, number> = { một: 1, mốt: 1, hai: 2, ba: 3, bốn: 4, tư: 4, năm: 5, lăm: 5, sáu: 6, bảy: 7, tám: 8, chín: 9 }
const D = 'một|hai|ba|bốn|năm|sáu|bảy|tám|chín'
const U = 'mốt|một|hai|ba|bốn|tư|lăm|năm|sáu|bảy|tám|chín'
const WORDS = String.raw`(?:(?:${D})\s+mươi(?:\s+(?:${U}))?|mười(?:\s+(?:${U}))?|(?:${D}))`
function viNumber(w: string): number {
  const [a, b, c] = w.split(/\s+/)
  if (a === 'mười') return 10 + (b ? DIGIT[b]! : 0)
  if (b === 'mươi') return DIGIT[a!]! * 10 + (c ? DIGIT[c]! : 0)
  return DIGIT[a!]!
}
// Indonesian, before "galon" or "inci": "Satu galon air" (not the rule "satu galon per inci").
const ID_WORDS: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, sepuluh: 10, setengah: 0.5 }
const INCH_MARK = '["”″]'
const FOOT_MARK = "['’′]"
const SIDE_UNIT = String.raw`(?:ft|feet|foot|ฟุต|inch|inci|นิ้ว|${INCH_MARK}|${FOOT_MARK})`
const unitName = (u: string) => (new RegExp(`^${INCH_MARK}$`).test(u) ? 'inch' : new RegExp(`^${FOOT_MARK}$`).test(u) ? 'feet' : u)
function normalize(t: string): string {
  return t
    // "bốn feet", "bốn foot rưỡi", "(gần hai mét)" after a figure in feet: the number in digits.
    .replace(re(String.raw`(?<!\p{L})(${WORDS})\s+(feet|foot|inch|gallon)(\s+rưỡi)?(?!\p{L})`),
      (_a, w: string, u: string, half?: string) => `${String(viNumber(w) + (half ? 0.5 : 0)).replace('.', ',')} ${u}`)
    .replace(re(String.raw`(?<!\p{L})nửa\s+(inch|foot|gallon)(?!\p{L})`), '0,5 $1')
    .replace(re(String.raw`(?<!\p{L})(${Object.keys(ID_WORDS).map(w => `[${w[0]}${w[0]!.toUpperCase()}]${w.slice(1)}`).join('|')})\s+(galon|inci)(?!\p{L})(?!\s+per\s+inci)`),
      (_a, w: string, u: string) => `${String(ID_WORDS[w.toLowerCase()]).replace('.', ',')} ${u}`)
    // "kedalaman minimal 3–4 kaki": feet; a "kaki" is a leg too, so only after a length word.
    .replace(re(String.raw`((?<!\p{L})(?:kedalaman|panjang|tinggi|lebar|jarak|sedalam|setinggi|sepanjang|selebar)(?:nya)?[^\d<>]{0,30}?${START}${N}(?:${TO}${N})?)\s*kaki(?!\p{L})`), '$1 feet')
    // "vài inch (khoảng 5–8 cm)": the bracket says how many.
    .replace(re(String.raw`(?<!\p{L})vài\s+(?:inch|feet|foot|gallon)\s*\(\s*(${QUAL}\s*${N}(?:${TO}${N})?\s*(?:${LENGTH}|${LITRE}${END}))\s*\)`), '$1')
    .replace(re(String.raw`\((\s*(?:${QUAL}\s+)?)(${WORDS})\s+mét\s*\)`), (_a, q: string, w: string) => `(${q}${viNumber(w)} mét)`)
    .replace(/độ\s+Fahrenheit/gu, 'độ F').replace(/°\s*Fahrenheit/gu, '°F')
    // A unit after each side: "84” x 27” x 28”", "6’ x 2’ x 2’", "5ft x 2ft x 2ft", "4 ft × 2 ft" → "84 x 27 x 28 inch".
    .replace(re(String.raw`${START}(${N})\s?(${SIDE_UNIT})(\s*[x×]\s*)(${N})\s?\2(?:(\s*[x×]\s*)(${N})\s?\2)?(?!\p{L})`),
      (_a, a: string, u: string, x1: string, b: string, x2?: string, c?: string) => `${a}${x1}${b}${x2 ? `${x2}${c}` : ''} ${unitName(u)}`)
    // "1/2" đến 1"", and "(12”)": inch marks.
    .replace(re(String.raw`${START}(${N})\s?${INCH_MARK}(\s+(?:đến|to|tới|sampai)\s+|\s*[–-]\s*)(${N})\s?${INCH_MARK}`), '$1$2$3 inch')
    .replace(re(String.raw`\(\s*(${N})\s?${INCH_MARK}\s*\)`), '($1 inch)')
    // "per galon", "cho mỗi gallon", "ต่อแกลลอน": one gallon (not in "số inch trên mỗi gallon", a rule's name).
    .replace(re(String.raw`(?<!\p{L})(per|mỗi)\s+(${GAL}|galon)(?!\p{L})|(ต่อ(?:น้ำ)?)\s*(แกลลอน)`), (all, w1?: string, u1?: string, w2?: string, u2?: string, ...a: unknown[]) => {
      const { at, s } = after(a)
      return /(?:^|[^\d½¼¾\s])\s*(?:inch|inci|นิ้ว)(?:\s+\S+){0,2}\s*$/u.test(s.slice(Math.max(0, at - 30), at)) ? all : `${w1 ?? w2} 1 ${u1 ?? u2}`
    })
}

/** Spans kept as published, out of the way while the rest is converted: quoted labels with their metric after, names. */
function mask(t: string): { text: string; restore: (s: string) => string } {
  const kept: string[] = []
  const hold = (s: string) => `${String.fromCharCode(0xE100 + kept.push(s) - 1)}`
  const text = t
    // The label and its bracket: "“một gallon nước cho một inch cá” (khoảng 3,8 lít nước cho 2,5 cm cá)".
    .replace(/(["“‘'])([^"“”‘’'<>()]{1,160}?)(["”’'])(\s*\([^()]*\d[^()]*\))/gu, (all, _o, inner: string, _c, br: string) =>
      (re(ANY_IMP).test(normalize(inner)) && re(ANY_MET).test(normalize(br)) ? hold(all) : all))
    // A unit written with a capital, mid-sentence, is part of a product's name: "Aqueon 10 Gallon", "Fluval Flex 32,5 Gallon".
    .replace(re(String.raw`${START}${N}\s*-?\s*(?:Gall?ons?|Inch(?:es)?|Inci)${END}`), hold)
  return { text, restore: s => s.replace(/(.)/gu, (_a, c: string) => kept[c.charCodeAt(0) - 0xE100]!) }
}

// --- Guides: decades of °F, US tank models, pipe sizes. -------------------------------------------------------------
const ABOUT: Record<UnitLang, string> = { vi: 'khoảng', id: 'sekitar', th: 'ราว' }
/** "giữa 60 độ F" → the middle of the 60s; "từ giữa đến cuối 60 độ F" → its upper half. A metric figure after wins. */
function decades(t: string, lang: UnitLang): string {
  const BANDS: [RegExp, Record<string, number[]>][] = [
    [/(?:(?:từ\s+)?giữa\s+đến\s+cuối|đầu|giữa|cuối)/u, { đầu: [2], giữa: [5], cuối: [8], 'giữa đến cuối': [4, 9] }],
    [/(?:ราว|ช่วง)?\s*(?:ต้น|กลาง|ปลาย)/u, { ต้น: [2], กลาง: [5], ปลาย: [8] }],
    [/(?:awal|pertengahan|akhir)/u, { awal: [2], pertengahan: [5], akhir: [8] }],
  ]
  for (const [band, at] of BANDS) {
    t = t.replace(re(String.raw`(?<!\p{Script=Latin})(${band.source})\s*(\d0)(?:-an)?(\s*)(độ\s*F|[°º˚]\s*F)${END}(?:\s*\(\s*(${withQual('temp')})\s*\))?`),
      (_a, word: string, dec: string, gap: string, unit: string, met?: string) => {
        if (met) return `${ABOUT[lang]} ${met.replace(new RegExp(`^${QUAL}\\s*`, 'u'), '')}`
        const key = Object.keys(at).find(k => word.replace(/^(?:từ\s+|ราว|ช่วง)\s*/u, '').trim() === k)!
        const f = at[key]!.map(o => Number(dec) + o)
        return `${ABOUT[lang]} ${convert(f.join('–'), gap, unit, '', 'temp', lang)}`
      })
  }
  // "60-an °F bawah atau 50-an °F atas", "50 ปลาย ๆ ถึง 60 ต้น ๆ °F": a band, or two bands as one range.
  const AT: Record<string, number> = { bawah: 2, tengah: 5, atas: 8, ต้น: 2, กลาง: 5, ปลาย: 8 }
  const band = (dec: string, w: string) => Number(dec) + AT[w]!
  const span = (fs: number[], gap: string) => convert([...new Set([Math.min(...fs), Math.max(...fs)])].join('–'), gap, '°F', '', 'temp', lang)
  t = t.replace(re(String.raw`${START}(\d0)-an(\s*)[°º˚]\s*F\s+(atas|bawah|tengah)${END}(?:\s+(?:atau|sampai|hingga)\s+(\d0)-an\s*[°º˚]\s*F\s+(atas|bawah|tengah)${END})?`),
    (_a, d1: string, gap: string, w1: string, d2?: string, w2?: string) => span([band(d1, w1), ...(d2 ? [band(d2, w2!)] : [])], gap))
  t = t.replace(re(String.raw`${START}(\d0)\s*(ปลาย|ต้น|กลาง)\s*ๆ?\s*(?:(?:ถึง|หรือ)\s*(\d0)\s*(ปลาย|ต้น|กลาง)\s*ๆ?)?(\s*)[°º˚]\s*F`),
    (_a, d1: string, w1: string, d2: string | undefined, w2: string | undefined, gap: string) => span([band(d1, w1), ...(d2 ? [band(d2, w2!)] : [])], gap))
  return t
}

/** "5 watt cho mỗi gallon (khoảng 1,3 watt mỗi lít)", "13 mg mỗi lít (50 mg mỗi gallon)": a rate per gallon beside its rate per litre goes. */
function rates(t: string, lang: UnitLang): string {
  const GALLON = String.raw`1\s+(?:${GAL}|galon|แกลลอน)`
  const PER_L = String.raw`(?:mỗi|per|\/|ต่อ)\s*(?:lít|liter|L|ลิตร)${END}`
  const same = (perGal: string, perL: string) => [3.785, 4.546].some(k => Math.abs(parseNum(perGal, lang) / k - parseNum(perL, lang)) <= parseNum(perL, lang) * 0.2)
  return t
    .replace(re(String.raw`${START}(${N})\s*([^\s\d()<>]{1,6})\s+(?:cho\s+)?(?:mỗi|per|ต่อ)\s*${GALLON}(?:\s+(?:nước|air))?\s*\(\s*(?:${QUAL}\s*)?(${N})\s*\2\s*(${PER_L})\s*\)`),
      (all, g: string, unit: string, l: string, perL: string) => (same(g, l) ? `${l} ${unit} ${perL}` : all))
    .replace(re(String.raw`${START}(${N})(\s*)([^\s\d()<>]{1,6})(\s*${PER_L})\s*\(\s*(?:${QUAL}\s*)?(${N})\s*\3\s+(?:cho\s+)?(?:mỗi|per|ต่อ)\s*${GALLON}\s*\)`),
      (all, l: string, gap: string, unit: string, perL: string, g: string) => (same(g, l) ? `${l}${gap}${unit}${perL}` : all))
}

/** "10 ตารางฟุต", "2 feet vuông": square feet in m². */
const squares = (t: string, lang: UnitLang) => t.replace(re(String.raw`${START}(${N})\s*(?:(?:feet|foot|ft)\s+(?:vuông|persegi)|kaki\s+persegi|sq\.?\s*ft|ft²|ตารางฟุต)${END}`),
  (_a, n: string) => `${fmt(round1(parseNum(n, lang) * 0.0929) || 0.1, lang)} ${lang === 'th' ? 'ตารางเมตร' : 'm²'}`)

// Standard US tanks (Aqueon, Marineland, All-Glass), inches: length × width × height.
const TANKS: Record<string, [number, number, number]> = {
  5: [16, 8, 10], 10: [20, 10, 12], 15: [24, 12, 12], '20 high': [24, 12, 16], '20 long': [30, 12, 12], 29: [30, 12, 18],
  '40 breeder': [36, 18, 16], '40 long': [48, 13, 16], 55: [48, 13, 21], 75: [48, 18, 21], 125: [72, 18, 21],
}
const GALS = String.raw`(?:${GAL}|galon|แกลลอน)(?:\s+(?:Mỹ|US|AS)${END})?`
const SHAPE = String.raw`(?:long|high|tall|breeder)${END}`
const tank = (n: string, shape?: string) => TANKS[shape ? `${n} ${shape === 'tall' ? 'high' : shape}` : n]
function tanks(seg: string, lang: UnitLang): string {
  if (!new RegExp(String.raw`${START}\d+\s*-?\s*${GALS}\s+${SHAPE}|breeder\)?\s+\d+\s*-?\s*${GALS}`, 'u').test(seg)) return seg
  const size = (k: number[]) => `${k.map(i => Math.round(i * 2.54)).join(' × ')} ${lang === 'th' ? 'ซม.' : 'cm'}`
  const about = (n: string, k: number[]) => { const l = litres(Number(n), false); return `${ABOUT[lang]} ${fmt(roundTo(l, l < 100 ? 5 : 10), lang)} ${UNIT_OUT[lang].volume} (${size(k)})` }
  const MODEL = String.raw`(\d+)\s*-?\s*${GALS}(?:\s+(${SHAPE}))?`
  return seg
    // Its volume given already, the model in brackets after it: "hồ 76 lít dáng dài (loại 20 gallon long)" → its size.
    .replace(re(String.raw`(${metric('volume')}[^()<>]{0,30}?)\s*\(\s*(?:(?:loại|kiểu|dòng|tipe|jenis|แบบ)\s+)?${MODEL}\s*\)`),
      (all, pre: string, n: string, shape?: string) => { const k = tank(n, shape); return k ? `${pre} (${size(k)})` : all })
    .replace(re(String.raw`(breeder\)?\s+)(\d+)\s*-?\s*${GALS}`), (all, pre: string, n: string) => { const k = tank(n, 'breeder'); return k ? `${pre}${about(n, k)}` : all })
    // A shaped model anywhere; a plain size only as a tank ("bể 55 gallon", not "cho mỗi 10 gallon nước").
    .replace(re(`${START}${MODEL}`), (all, n: string, shape: string | undefined, at: number, s: string) => {
      const k = tank(n, shape)
      return k && (shape || /(?:bể|hồ|tank|akuarium|ตู้)\s*$/iu.test(s.slice(Math.max(0, at - 12), at))) ? about(n, k) : all
    })
}

// Nominal pipe sizes → outside diameter in mm, as Vietnamese shops name them ("phi 27").
const PIPE: [number, number][] = [[0.5, 21], [0.75, 27], [1, 34], [1.25, 42], [1.5, 49], [2, 60], [2.5, 76], [3, 90], [4, 114]]
const PIPE_WORD = String.raw`(?<!\p{Script=Latin})(?:[ốỐ]ng|PVC|manifold|[rR]en|[pP]ipa|ท่อ)(?!\p{Script=Latin})(?:(?!mềm|selang|สายยาง|dài|cao|sâu|rộng|cắt|đường kính trong)[^\d.,;:()<>]){0,30}?`
function pipes(t: string, lang: UnitLang): string {
  const od = (fig: string) => PIPE.find(([inch]) => inch === parseNum(fig, lang))?.[1]
  const name = (mm: number) => (lang === 'vi' ? `phi ${mm}` : `${mm} ${lang === 'th' ? 'มม.' : 'mm'}`)
  const INCH = String.raw`\s*-?\s*(?:inch(?:es)?|inci|in|นิ้ว|${INCH_MARK})${END}`
  return t
    // "ống ... ¾ inch (khoảng 19 mm)"
    .replace(re(String.raw`(${PIPE_WORD})(${N})${INCH}(?:\s*\(\s*(?:${QUAL}\s*)?${N}\s*(?:mm|cm|มม\.|ซม\.)\s*\))?`), (all, pre: string, fig: string) => { const mm = od(fig); return mm ? `${pre}${name(mm)}` : all })
    // "ống ... đường kính khoảng 19 mm (3/4 inch)"
    .replace(re(String.raw`(${PIPE_WORD})(?:đường kính\s+(?:ngoài\s+)?)?(?:${QUAL}\s*)?${N}\s*(?:mm|มม\.)\s*\(\s*(${N})${INCH}\s*\)`), (all, pre: string, fig: string) => { const mm = od(fig); return mm ? `${pre}${name(mm)}` : all })
}

/** "1 นิ้วต่อน้ำ 1 แกลลอน (2.5 ซม. ต่อ 4.55 ลิตร)": a ratio in imperial, its metric after → the metric. */
function ratios(t: string, lang: UnitLang): string {
  const IMPS = String.raw`${START}(?:${FIG('length')})\s*-?\s*(?:${CHECKED.map(d => IMP_UNIT[d]).join('|')})`
  return t.replace(re(String.raw`(${IMPS})((?:\s*[^\s\d()<>,.;]{1,12}){1,3}\s*)(${IMPS})\s*\(\s*(${ANY_MET}[^\d()<>]{1,15}?${ANY_MET})\s*\)`),
    (all, i1: string, _w: string, i2: string, inner: string) => {
      const mets = [...inner.matchAll(re(ANY_MET))].map(m => m[0])
      const pairs = [i1, i2].map((fig, i) => {
        const d = dimOf(fig, imp)
        const m = mets[i] && dimOf(mets[i]!.replace(new RegExp(`^${QUAL}\\s*`, 'u'), ''), metric)
        const [, f, , u] = d ? new RegExp(`^${imp(d)}$`, 'u').exec(fig.trim()) ?? [] : []
        return d && d === m && f && agrees(f, u ?? '', mets[i]!, d, lang)
      })
      return mets.length === 2 && pairs.every(Boolean) ? inner.replace(new RegExp(`^${QUAL}\\s*`, 'u'), '') : all
    })
}

/** What may sit in brackets beside imperial figures that only restate a metric one: "~", "khoảng", "♂", "SL", "Mỹ", "cho mỗi"… */
const FILLER = new RegExp(String.raw`^(?:\s|[,;:/~≈±–—−-]|[♂♀]|${QUAL}|SL|TL|Mỹ|US|AS|cho|mỗi|trên|per|ต่อ|น้ำ|cá|nước|ikan|air|ปลา)*$`, 'u')
const SEP = String.raw`(?:\s*[,/]\s*|,?\s*(?:tức(?: là)?|yaitu|หรือ)\s+)(?:${QUAL}\s*)?`

/** Text in metric only (see above): page text in `lang`, HTML or plain. */
export function toMetric(text: string, lang: UnitLang): string {
  const m = mask(text)
  let t = normalize(m.text)
  t = squares(decades(rates(t, lang), lang), lang)
  t = t.split(/(<[^>]+>|[.!?](?=\s|<|$))/).map((seg, i) => (i % 2 ? seg : tanks(seg, lang))).join('')
  t = pipes(t, lang)
  t = ratios(t, lang)
  // 1. "(68–86 °F)", "(~29 gal Mỹ)", "(♂ 5 in, ♀ 3,5 in)", "(1 inch cho mỗi gallon)" after a metric figure of their kind
  //    (same clause): dropped.
  t = t.replace(/\s*\(([^()]*)\)/g, (all, inner: string, at: number, whole: string) => {
    const kinds = DIMS.filter(d => re(imp(d)).test(inner))
    if (!kinds.length || !FILLER.test(inner.replace(re(`(?:${DIMS.map(imp).join('|')})`), ''))) return all
    const before = whole.slice(Math.max(0, at - 90), at).split(/<[^>]+>|[.!?;,](?=\s)/).pop()!
    return kinds.every(d => new RegExp(metric(d), 'u').test(before)) ? '' : all
  })
  for (const d of DIMS) {
    const IMP = imp(d)
    const MET = withQual(d)
    const delta = (fig: string, a: unknown[], offset = 0) => { const { at, s } = after(a); return d === 'temp' && isDelta(fig, s.slice(Math.max(0, at + offset - 3), at + offset), lang) }
    // 2. "880 mm, 35 inch", "23 °C/73 °F", "khoảng 21°C, tức 70°F": the imperial after a metric figure it agrees with goes.
    t = t.replace(re(`(${metric(d)})(${SEP})${IMP}`), (all, keep: string, sep: string, fig: string, _g, unit: string, ...a: unknown[]) =>
      agrees(fig, unit, keep, d, lang, delta(fig, a, keep.length + sep.length)) ? keep : all)
    // 3. The imperial first, its metric after: "2 inch (khoảng 5 cm)" → "5 cm", "6 inch/15 cm", "30 gallon Mỹ, tức 114 L",
    //    "8 inch TL, khoảng 20 cm": the metric stands for the figure when it agrees (its "khoảng" was about the
    //    conversion, which is gone). "5 gallon nước (khoảng 19 lít)", a few words between: "19 lít nước".
    const bare = (met: string) => met.replace(new RegExp(`^${QUAL}\\s*`, 'u'), '').trim()
    const pick = (all: string, fig: string, gap: string, unit: string, suffix: string, met: string, isDelta: boolean) => {
      if (!agrees(fig, unit, met, d, lang, isDelta)) return d === 'mass' ? all : convert(fig, gap, unit, suffix, d, lang, isDelta)
      if (NEARLY.test(met.trim()) && d !== 'mass') return convert(fig, gap, unit, suffix, d, lang, isDelta)
      const b = bare(met)
      return suffix && !/(?:SL|TL)$/.test(b) ? `${b}${suffix}` : b
    }
    for (const tail of [String.raw`\s*\(\s*(${MET})\s*\)`, String.raw`\s*\/\s*(${MET})`, String.raw`,?\s+tức(?: là)?\s+(${MET})`, String.raw`,\s*(${QUAL}\s*${metric(d)})`]) {
      t = t.replace(re(IMP + tail), (all, fig: string, gap: string, unit: string, suffix: string, met: string, ...a: unknown[]) =>
        pick(all, fig, gap, unit, suffix, met, delta(fig, a)))
    }
    t = t.replace(re(String.raw`${IMP}((?:\s*[^\s\d()<>,.;]+){1,3})(?:\s*\(\s*(${MET})\s*\)|,\s*tức(?: là)?\s+(${MET}))`),
      (all, fig: string, _gap, unit: string, suffix: string, words: string, m1?: string, m2?: string, ...a: unknown[]) => {
        const met = m1 ?? m2!
        return agrees(fig, unit, met, d, lang, delta(fig, a)) && !NEARLY.test(met) ? `${bare(met)}${suffix}${words}` : all
      })
    // 4. Whatever imperial is left: converted where it stands; a bottle's ounces ("chai 8 oz") are its size as sold.
    t = t.replace(re(IMP), (all, fig: string, gap: string, unit: string, suffix: string, ...a: unknown[]) => {
      const { at, s } = after(a)
      if (d === 'mass' && isOunce(unit) && /(?:chai|lọ|bình|bottle|botol|ขวด)\s*$/iu.test(s.slice(Math.max(0, at - 12), at))) return all
      return convert(fig, gap, unit, suffix, d, lang, delta(fig, a))
    })
  }
  return m.restore(t)
}

/** The imperial figures a text still has (pounds; not ounces, which may size a bottle): none once `toMetric` has run (quoted labels and names aside). */
const LEFT = re(String.raw`${ANY_IMP}|${START}${N}\s*-?\s*(?:(?:lbs?|pounds?|pon)${END}|ปอนด์)|${START}\d0(?:-an|\s*(?:ปลาย|ต้น|กลาง)\s*ๆ?)\s*[°º˚]\s*F|${START}${N}\s*ตารางฟุต`)
export const imperialLeft = (text: string): string[] => normalize(mask(text).text).match(LEFT) ?? []

type Page = { sections?: Record<string, string>; body?: string; summary?: string[]; faq?: { q: string; a: string }[] }
/** A page's text in metric only: its sections (not reference lists, which stay as published), body, summary and FAQ. */
export function metricPage<T extends Page>(page: T, lang: UnitLang): T {
  const m = (s: string) => toMetric(s, lang)
  return {
    ...page,
    ...(page.sections ? { sections: Object.fromEntries(Object.entries(page.sections).map(([k, v]) => [k, k.startsWith('references:') ? v : m(v)])) } : {}),
    ...(page.body !== undefined ? { body: m(page.body) } : {}),
    ...(page.summary ? { summary: page.summary.map(m) } : {}),
    ...(page.faq ? { faq: page.faq.map(f => ({ q: m(f.q), a: m(f.a) })) } : {}),
  }
}
