const round1 = (n: number) => Math.round(n * 10) / 10
export const cToF = (c: number): number => round1(c * 9 / 5 + 32)
export const cmToIn = (cm: number): number => round1(cm / 2.54)

/**
 * Page text in metric only. Readers in Vietnam, Indonesia and Thailand use °C, cm and litres, but sources (and
 * translators following them) write "20–30 °C (68–86 °F)", "2 inch (khoảng 5 cm)" or a bare "10 gallon".
 * `toMetric` rewrites one text (HTML or plain) in the page's language:
 * - a metric figure with its imperial one beside it keeps only the metric: "120 × 30 cm (48 × 12 in)" → "120 × 30 cm",
 *   "880 mm, 35 inch" → "880 mm"
 * - an imperial figure with its metric one after it keeps the metric as written (the source's own conversion, UK
 *   gallons included): "2 inch (khoảng 5 cm)" → "5 cm", "6 inch/15 cm" → "15 cm", "30 gallon Mỹ, tức khoảng 114 L" →
 *   "114 L"; a metric figure that doesn't match the imperial one is not trusted, the imperial is converted
 * - an imperial figure alone is converted: °C to whole degrees; cm to the half under 10 cm, whole above; m to one
 *   decimal under 10 m; litres whole (one decimal under 5 L, hundreds from 1,000 L)
 * A figure right before a closing quote is a quoted label ("…elevation 650 feet'") and stays as quoted. Reference lists
 * are not page text: `metricPage` leaves them alone.
 */
export type UnitLang = 'vi' | 'id' | 'th'
type Dim = 'temp' | 'length' | 'feet' | 'volume'

const FRAC: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75 }
// A number as the three languages and English write it: 3,5 / 3.5 / 24.000 / 3 1/2 / 1/2 / ½ / 1½.
const N = String.raw`(?:\d+\s+\d\/\d{1,2}|\d\/\d{1,2}|\d+(?:[.,]\d+)*(?:\s?[½¼¾])?|[½¼¾])`
const TO = String.raw`(?:\s*[–—−-]\s*|\s+(?:to|đến|tới|sampai|hingga|ถึง)\s+)`
// Lengths only: a tank's sides ("48 × 12"), or a male's and a female's size ("2,2 / 1,6 inch").
const BY = String.raw`(?:\s*[×x*]\s*|\s+\/\s+)`
// A figure: one number or a range ("68–86", "73 °F–80"); a length also several by BY ("48 × 12 × 12").
const RANGE = String.raw`${N}(?:(?:\s*[°º˚]\s*F)?${TO}${N})?`
const FIG = (d: Dim) => (d === 'length' || d === 'feet' ? String.raw`${N}(?:(?:\s*[°º˚]\s*F)?${TO}${N}|(?:${BY}${N})+)?` : RANGE)
const QUAL = String.raw`(?:~|≈|±|khoảng|chừng|gần|tầm|ước|sekitar|kira-kira|ประมาณ|ราว|about|approx\.?|ca\.)`
// Not inside a number ("1.5") or a Latin word ("B2 in").
const START = String.raw`(?<![\d.,A-Za-z])`
const END = String.raw`(?!\p{L})`
const SUFFIX = String.raw`(?:\s+(?:SL|TL))?`

// Imperial units by dimension. "in" counts only with no word after it (SL, TL aside): "1922 in Lake Malawi" is English.
const IMP_UNIT: Record<Dim, string> = {
  temp: String.raw`(?:[°º˚]\s*F${END}|độ\s*F${END}|℉)`,
  length: String.raw`(?:[Ii]nch(?:es)?${END}|inci${END}|นิ้ว(?!มือ|เท้า)|″|in${END}(?!\s+(?!SL\b|TL\b)\p{L})(?!\s+\d))`,
  feet: String.raw`(?:(?:[Ff]eet|[Ff]oot|ft)${END}|ฟุต)`,
  volume: String.raw`(?:(?:US|UK)\s+)?(?:(?:[Gg]all?ons?|[Gg]al)${END}|แกลลอน)(?:\s+(?:Mỹ|Anh|US|UK|AS|Inggris|imperial)${END}|\s*(?:สหรัฐ|อังกฤษ))?`,
}
const LENGTH = String.raw`(?:(?:mm|cm|km|m)${END}|ซม\.|มม\.|เซนติเมตร|เมตร)`
const METRIC_UNIT: Record<Dim, string> = {
  temp: String.raw`(?:[°º˚]\s*C${END}|độ\s*C${END}|℃|องศา)`,
  length: LENGTH,
  feet: LENGTH,
  volume: String.raw`(?:(?:lít|L|l|ml|mL|liter|litre)${END}|ลิตร)`,
}
const DIMS = Object.keys(IMP_UNIT) as Dim[]
const NOT_QUOTED = String.raw`(?!\s*['’"”])`
const imp = (d: Dim) => String.raw`${START}(${FIG(d)})(\s*-?\s*)(${IMP_UNIT[d]})(${SUFFIX})${NOT_QUOTED}`
const metric = (d: Dim) => String.raw`${START}${FIG(d)}\s*${METRIC_UNIT[d]}${SUFFIX}`
const withQual = (d: Dim) => String.raw`(?:${QUAL}\s*)?${metric(d)}`
const re = (s: string) => new RegExp(s, 'gu')
const ANY_IMP = String.raw`(?:${DIMS.map(imp).join('|')})`

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
const roundTo = (n: number, step: number) => Math.round(n / step) * step
const isUk = (unit: string) => /\b(?:UK|Anh|Inggris|imperial)\b|อังกฤษ/u.test(unit)
/** An imperial number in °C, cm, m or litres, rounded as a hobbyist would say it. */
const CONVERT: Record<Dim, (n: number, uk: boolean) => number> = {
  temp: f => Math.round((f - 32) * 5 / 9),
  length: i => { const cm = i * 2.54; return cm < 1 ? round1(cm) : cm < 10 ? roundTo(cm, 0.5) : Math.round(cm) },
  feet: ft => { const m = ft * 0.3048; return m < 10 ? round1(m) : Math.round(m) },
  volume: (g, uk) => { const l = g * (uk ? 4.546 : 3.785); return l < 5 ? round1(l) : l < 1000 ? Math.round(l) : roundTo(l, 100) },
}
const UNIT_OUT: Record<UnitLang, Record<Dim, string>> = {
  vi: { temp: '°C', length: 'cm', feet: 'm', volume: 'lít' },
  id: { temp: '°C', length: 'cm', feet: 'm', volume: 'liter' },
  th: { temp: '°C', length: 'ซม.', feet: 'เมตร', volume: 'ลิตร' },
}

/** The imperial figure in metric: each number converted, its range and side separators kept. */
function convert(fig: string, gap: string, unit: string, suffix: string, d: Dim, lang: UnitLang): string {
  const parts = fig.replace(/\s*[°º˚]\s*F/g, '').split(new RegExp(`(${TO}|${BY})`, 'u'))
  const out = parts.map((p, i) => (i % 2 ? p : fmt(CONVERT[d](parseNum(p, lang), isUk(unit)), lang)))
  // A range whose ends meet once rounded ("73–74 °F") is one figure.
  const text = out.length === 3 && out[0] === out[2] && new RegExp(`^${TO}$`, 'u').test(out[1]!) ? out[0]! : out.join('')
  if (d === 'temp') return /độ/.test(unit) ? `${text} độ C` : `${text}${/\s/.test(gap) ? ' ' : ''}°C`
  return `${text} ${UNIT_OUT[lang][d]}${suffix}`
}

/** A metric figure's numbers in °C, cm or litres. */
function metricValues(text: string, lang: UnitLang): number[] {
  const scale = /(?:^|[^\p{L}])mm(?!\p{L})|มม\./u.test(text) ? 0.1 : /(?:^|[^\p{L}])km(?!\p{L})/u.test(text) ? 100_000
    : /(?:^|[^\p{L}])m(?!\p{L})|(?<!เซนติ)เมตร/u.test(text) ? 100 : /(?:^|[^\p{L}])m[lL](?!\p{L})/u.test(text) ? 0.001 : 1
  return numbers(text.replace(re(QUAL), ''), lang).map(n => n * scale)
}
/** Whether a metric figure says what the imperial one does: each end within a fifth (a gallon may be US or UK). */
function agrees(impFig: string, impUnit: string, met: string, d: Dim, lang: UnitLang): boolean {
  const a = numbers(impFig.replace(/\s*[°º˚]\s*F/g, ''), lang)
  const b = metricValues(met, lang)
  if (!a.length || a.length !== b.length) return false
  const near = (x: number, y: number, uk: boolean) => {
    if (d === 'temp') return Math.abs((x - 32) * 5 / 9 - y) <= 1.5
    const want = x * (d === 'length' ? 2.54 : d === 'feet' ? 30.48 : uk ? 4.546 : 3.785)
    return Math.abs(want - y) <= Math.max(want * 0.2, d === 'length' ? 0.6 : 0)
  }
  return [isUk(impUnit), true].some(uk => a.every((x, i) => near(x, b[i]!, uk)))
}

/** What may sit in brackets beside imperial figures that only restate a metric one: "~", "khoảng", "♂", "SL", "Mỹ"… */
const FILLER = new RegExp(String.raw`^(?:\s|[,;:/~≈±–—−-]|[♂♀]|${QUAL}|SL|TL|Mỹ|US|AS)*$`, 'u')

/** Text in metric only (see above): page text in `lang`, HTML or plain. */
export function toMetric(text: string, lang: UnitLang): string {
  // 1. "(68–86 °F)", "(~29 gal Mỹ)", "(♂ 5 in, ♀ 3,5 in)" after a metric figure of their kind (same clause): dropped.
  let t = text.replace(/\s*\(([^()]*)\)/g, (all, inner: string, at: number, whole: string) => {
    const kinds = DIMS.filter(d => re(imp(d)).test(inner))
    if (!kinds.length || !FILLER.test(inner.replace(re(ANY_IMP), ''))) return all
    const before = whole.slice(Math.max(0, at - 90), at).split(/<[^>]+>|[.!?;,](?=\s)/).pop()!
    return kinds.every(d => new RegExp(metric(d), 'u').test(before)) ? '' : all
  })
  for (const d of DIMS) {
    const IMP = imp(d)
    const MET = withQual(d)
    // 2. "880 mm, 35 inch", "23 °C/73 °F": the imperial after a metric figure goes.
    t = t.replace(re(`(${metric(d)})\\s*[,/]\\s*${IMP}`), (_all, keep: string) => keep)
    // 3. The imperial first, its metric after: "2 inch (khoảng 5 cm)" → "5 cm", "6 inch/15 cm", "30 gallon Mỹ, tức 114 L":
    //    the metric stands for the figure when it agrees (its "khoảng" was about the conversion, which is gone).
    //    "5 gallon nước (khoảng 19 lít)", a word or two between: "19 lít nước" (Thai: "5 แกลลอนขึ้นไป (ราว 19 ลิตร)").
    const bare = (met: string) => met.replace(new RegExp(`^${QUAL}\\s*`, 'u'), '').trim()
    const pick = (fig: string, gap: string, unit: string, suffix: string, met: string) =>
      agrees(fig, unit, met, d, lang) ? bare(met) : convert(fig, gap, unit, suffix, d, lang)
    for (const after of [String.raw`\s*\(\s*(${MET})\s*\)`, String.raw`\s*\/\s*(${MET})`, String.raw`,?\s+tức(?: là)?\s+(${MET})`]) {
      t = t.replace(re(IMP + after), (_all, fig: string, gap: string, unit: string, suffix: string, met: string) => pick(fig, gap, unit, suffix, met))
    }
    t = t.replace(re(String.raw`${IMP}((?:\s*[^\s\d()<>]+){1,2})\s*\(\s*(${MET})\s*\)`),
      (all, fig: string, _gap: string, unit: string, _suffix: string, words: string, met: string) =>
        agrees(fig, unit, met, d, lang) ? `${bare(met)}${words}` : all)
    // 4. Whatever imperial is left: converted where it stands.
    t = t.replace(re(IMP), (_all, fig: string, gap: string, unit: string, suffix: string) => convert(fig, gap, unit, suffix, d, lang))
  }
  return t
}

/** The imperial figures a text still has: none once `toMetric` has run (quoted labels aside). */
const LEFT = re(ANY_IMP)
export const imperialLeft = (text: string): string[] => text.match(LEFT) ?? []

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
