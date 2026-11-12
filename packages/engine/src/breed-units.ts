import { CONVERTED_LITRES, GALLON, keeperFigure, US_TANKS, usTankOf } from './round'

/**
 * A breed page's units, mended by the reader-fit rewrite (fit-rewrite.ts; the chief of staff, 2026-11-12). A breed page
 * has no English beside it to keep a figure from: its facts (engine-state/breeds/<id>.json, breeds.ts) give a source's US
 * figure, and the page's litres are our conversion, so naming it as keepers here say is the rounding's job. Code works
 * out each figure from the source's own US figure, the rewriter is told it, its reviewer too, and a rewrite is kept only
 * with each one in it:
 * - a US tank in the table (US_TANKS) is the size it names: 29 or 30 gallons 120 lít;
 * - any other (35 gallons, 1,000 gallons, 3 gallons a fish) is keeperFigure's: 130, 4.000, 12 lít;
 * - "for each 2,5 cm" of a fish is a source's "per inch": given per cm, 10 gallons an inch 15 lít mỗi cm.
 * The US figure is the facts' own beside the page's figure ("35 US gal (about 132 L)"), else the facts' nearest within a
 * twentieth of it, else the table's for a volume only a gallon conversion gives (usTankOf: 110 lít is 29 gallons; or to
 * tens, 950 for 250 gallons). A finding is left to a person (`unitsLeft`) when a litre figure in it has neither, or its
 * sentence is a dose, whose water stays exact. A figure counts only as the whole quantity: 15 lít mỗi cm, not 15 lít
 * mỗi 2,5 cm (`keepsFigures`).
 * The breed writers (breeds.ts) get the same figures, and their fact check too (`writerFigures`).
 */
export type BreedFigure = { from: string; to: string; litres: number; why: string; perCm?: true }

const EN_N = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`
const en = (s: string) => Number(s.replaceAll(',', ''))
const LITRE = String.raw`(?:L|litres?|liters?)`
const GAL = String.raw`(?:US\s+)?gal(?:lons?)?`
const ABOUT = String.raw`(?:about|roughly|approx\.?|~)?\s*`
/** "35 US gal (about 132 L)", "11 L (3 gal)": a single figure each side, never a range's end. */
const GAL_FIRST = new RegExp(String.raw`(?<![\d.,–-])(${EN_N})\+?\s*${GAL}\s*\(\s*${ABOUT}(${EN_N})\s*${LITRE}(?![\p{L}\d–-])`, 'giu')
const LITRE_FIRST = new RegExp(String.raw`(?<![\d.,–-])(${EN_N})\s*${LITRE}\s*\(\s*${ABOUT}(${EN_N})\+?\s*${GAL}(?![\p{L}])`, 'giu')

/** The US gallon figures a breed's facts give, each with the litre figure beside it. */
export function factsPairs(facts: string): [gallons: number, litres: number][] {
  return [...[...facts.matchAll(GAL_FIRST)].map(m => [en(m[1]!), en(m[2]!)] as [number, number]), ...[...facts.matchAll(LITRE_FIRST)].map(m => [en(m[2]!), en(m[1]!)] as [number, number])]
}

const VI_N = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?`
const vi = (s: string) => Number(s.replaceAll('.', '').replace(',', '.'))
const viFigure = (n: number) => (n >= 1000 ? `${Math.floor(n / 1000)}.${String(n % 1000).padStart(3, '0')}` : String(n))
/** Litres in Vietnamese text: "132 lít", "3.800 lít", "75–115 lít", "40 lít cho mỗi 2,5 cm". */
const VOLUME = new RegExp(String.raw`(?<![\d.,])(${VI_N})(?:\s*(?:[–-]|đến)\s*(${VI_N}))?\s*(?:lít|L|l)(?![\p{L}\p{N}])(\s*cho mỗi\s*2,5\s*cm)?`, 'giu')

/** The litres a Vietnamese text gives, each end of a range on its own. */
export const litresIn = (text: string) => [...text.matchAll(VOLUME)].flatMap(m => [vi(m[1]!), ...(m[2] ? [vi(m[2])] : [])])

/** The source's US gallons for a page's litre figure: the facts' own beside that figure, else their nearest within a twentieth, else a US tank's. */
function usGallons(l: number, pairs: [number, number][]): number | undefined {
  return pairs.find(([, L]) => L === l)?.[0] ??
    pairs.map(([g]) => [g, Math.abs(g * GALLON - l) / l] as const).filter(([, d]) => d <= 0.05).sort((a, b) => a[1] - b[1])[0]?.[0] ??
    usTankOf(l)?.[0] ?? US_TANKS.find(([g]) => Math.round((g * GALLON) / 10) * 10 === l)?.[0]
}
/** The litres keepers here say for a source's US gallons: a table tank its size, any other keeperFigure's; per inch, per cm. */
const keeperOf = (g: number, perInch: boolean) => (perInch ? keeperFigure((g * GALLON) / 2.54) : US_TANKS.find(([x]) => x === g)?.[1] ?? keeperFigure(g * GALLON))

/** What keepers here say for each litre figure a units finding quotes, from the source's US figure. */
export function breedFigures(quote: string, facts: string): BreedFigure[] {
  const pairs = factsPairs(facts)
  const out: BreedFigure[] = []
  for (const m of quote.matchAll(VOLUME)) {
    const perInch = !!m[3]
    for (const s of [m[1]!, ...(m[2] ? [m[2]] : [])]) {
      const l = vi(s)
      const g = usGallons(l, pairs)
      if (g === undefined) continue
      const to = keeperOf(g, perInch)
      const gal = `${g.toLocaleString('en-US')} US gallon${g === 1 ? '' : 's'}`
      if (perInch) out.push({ from: `${s} lít cho mỗi 2,5 cm`, to: `${viFigure(to)} lít cho mỗi cm`, litres: to, why: `${gal} per inch`, perCm: true })
      else if (to !== l) out.push({ from: `${s} lít`, to: `${viFigure(to)} lít`, litres: to, why: gal })
    }
  }
  return out
}

/** The figures as the rewriter and its reviewer are told them. */
export const figuresSaid = (figures: BreedFigure[]) => figures.map(f => `"${f.from}" → "${f.to}" (${f.why})`).join('; ')

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()
/** After a volume, "… cho mỗi cm": a figure per cm of fish. */
const PER_CM = /^[^\d.;,\n]{0,20}?(?:mỗi|trên|\/)\s*(?:1\s*)?cm(?![\p{L}])/iu
/** A text's litres as whole quantities: "130", "15/cm" per cm of fish, "40/2.5cm" per 2,5 cm. */
const quantities = (text: string) => new Set([...text.matchAll(VOLUME)].flatMap(m => {
  const per = m[3] ? '/2.5cm' : PER_CM.test(text.slice(m.index + m[0].length)) ? '/cm' : ''
  return [m[1]!, ...(m[2] ? [m[2]] : [])].map(s => `${vi(s)}${per}`)
}))

/** A rewrite keeps each figure: every one named as its whole quantity, and the quote it mends gone. */
export function keepsFigures(text: string, quotes: string[], figures: BreedFigure[]): string | undefined {
  const have = quantities(text)
  const missing = figures.filter(f => !have.has(`${f.litres}${f.perCm ? '/cm' : ''}`)).map(f => f.to)
  if (missing.length) return `the figures as keepers say them aren't there: ${missing.join(', ')}`
  const left = quotes.filter(q => q && flat(text).includes(flat(q)))
  return left.length ? `the figure it mends is still there: ${left.join('; ')}` : undefined
}

/** The sentence a quote sits in, in its block's text (the quote itself where it isn't there). */
export function sentenceOf(quote: string, block: string): string {
  const t = flat(block)
  const q = flat(quote)
  const i = q ? t.indexOf(q) : -1
  if (i < 0) return quote
  const ends = [...t.slice(0, i).matchAll(/[.!?…]\s/g)]
  const after = /[.!?…]$/.test(q) ? { index: -1 } : /[.!?…](?:\s|$)/.exec(t.slice(i + q.length))
  return t.slice(ends.length ? ends.at(-1)!.index + 2 : 0, after ? i + q.length + after.index + 1 : t.length)
}
/** A dose: an amount of a medicine, salt or the like in the sentence. The water it goes into stays exact. */
const DOSE = /\d\s*(?:ml|mg|g|gam|gram|giọt|viên|muỗng|thìa)(?![\p{L}])|thuốc|liều/iu
/** Why a breed page's units finding is left to a person: a dose's water, or a litre figure with no US figure to work from. */
export function unitsLeft(quote: string, facts: string, block = quote): string | undefined {
  const litres = litresIn(quote)
  if (!litres.length) return undefined
  if (DOSE.test(sentenceOf(quote, block))) return 'a dose, whose water stays exact'
  const pairs = factsPairs(facts)
  const none = litres.filter(l => usGallons(l, pairs) === undefined)
  return none.length ? `no US figure to work ${none.map(l => l.toLocaleString('vi-VN')).join(', ')} lít from` : undefined
}
/** Where a quote's litres are once another mend of the part reworded it: the first sentence of the blocks giving each. */
export function moved(quote: string, blocks: string[]): string | undefined {
  const want = litresIn(quote)
  if (!want.length) return undefined
  for (const b of blocks) for (const s of flat(b).split(/(?<=[.!?…])\s+/)) {
    const have = litresIn(s)
    if (want.every(l => have.includes(l))) return s
  }
  return undefined
}

/** A language's numbers: Vietnamese and Indonesian write "3.800" and "2,5", Thai, Malay and English "3,800" and "2.5". */
export type NumLang = 'vi' | 'id' | 'th' | 'ms' | 'en'
const commaDecimal = (l: NumLang) => l === 'vi' || l === 'id'
/** Litres in any page language or the facts; Thai runs words together, so ลิตร needs no word end. */
const volumes = (l: NumLang) => new RegExp(String.raw`(?<![\d.,])(${commaDecimal(l) ? VI_N : EN_N})(?:\s*(?:[–-]|đến|hingga|sampai|ถึง|to)\s*(${commaDecimal(l) ? VI_N : EN_N}))?\s*(?:(?:lít|liter|litres?|liters?|L|l)(?![\p{L}\p{N}])|ลิตร)`, 'giu')
/** "… cho mỗi 2,5 cm", "setiap 2,5 cm", "bagi setiap 2.5 cm", "ต่อ…2.5 ซม.", "per 2.5 cm": a source's "per inch". */
const PER_LENGTH = /^[^.;\n]{0,40}?(?:mỗi|setiap|bagi|per|ต่อ)[^.;\n]{0,25}?2[.,]5\s*(?:cm|ซม)/iu
/** Every US gallon figure the facts give, a range's ends each, and whether it is per inch of fish. */
const GALLONS = new RegExp(String.raw`(?<![\d.,–-])(${EN_N})(?:\s*[–-]\s*(${EN_N}))?\+?\s*(?:US\s+)?gal(?:lons?)?(?![\p{L}])(\s*(?:per|an|a|for each|each)\s+inch)?`, 'giu')

/** A figure for a breed writer: the source's US figure, and the litres keepers here say. */
export type WriterFigure = { us: string; litres: number; perCm?: true }
/**
 * The figures a breed writer and its fact check are given (breeds.ts): every US gallon figure the breed's facts give, a
 * litre figure in them that only a gallon conversion gives (CONVERTED_LITRES), and those a page's units findings quote,
 * each worked out from the source's US figure as keepers here say (the chief of staff, 2026-11-12).
 */
export function writerFigures(facts: string, quotes: { text: string; lang: NumLang }[] = []): WriterFigure[] {
  const pairs = factsPairs(facts)
  const out = new Map<string, WriterFigure>()
  const add = (g: number, perInch: boolean) => {
    const us = `${g.toLocaleString('en-US')} US gallon${g === 1 ? '' : 's'}${perInch ? ' per inch of fish' : ''}`
    out.set(us, { us, litres: keeperOf(g, perInch), ...(perInch ? { perCm: true as const } : {}) })
  }
  for (const m of facts.matchAll(GALLONS)) for (const x of [m[1], m[2]]) if (x) add(en(x), !!m[3])
  for (const { text, lang, facts: inFacts } of [{ text: facts, lang: 'en' as NumLang, facts: true }, ...quotes.map(q => ({ ...q, facts: false }))]) {
    for (const m of text.matchAll(volumes(lang))) {
      const perInch = PER_LENGTH.test(text.slice(m.index + m[0].length))
      for (const x of [m[1], m[2]]) {
        if (!x) continue
        const l = commaDecimal(lang) ? vi(x) : en(x)
        if (inFacts && !CONVERTED_LITRES.includes(l)) continue
        const g = usGallons(l, pairs)
        if (g !== undefined) add(g, perInch)
      }
    }
  }
  return [...out.values()]
}

const said = (fs: WriterFigure[]) => fs.map(f => `${f.us} → ${f.litres.toLocaleString('en-US')} litres${f.perCm ? ' per cm of fish' : ''}`).join('; ')
/** The figures as a breed writer is told them, in its prompt's language. */
export function writerFiguresNote(fs: WriterFigure[], lang: 'vi' | 'en'): string {
  if (!fs.length) return ''
  return lang === 'vi'
    ? `\n\nSố đo bể và nước: số lít dữ kiện ghi kèm số gallon, hay số chỉ phép đổi gallon mới ra, là số ta đổi sẵn, không phải số của nguồn. Viết các số sau, đổi từ số gallon gốc theo cỡ người chơi ở đây gọi (mức tối thiểu không thấp hơn số đổi chính xác quá 5%): ${said(fs)}. Bể hay nước cho mỗi con, cho mỗi cm thân cá là mức cần, không phải liều thuốc. Số của liều thuốc giữ đúng.`
    : `\n\nTank and water figures: a litre figure the facts give beside a US one, or one only a gallon conversion gives, is an earlier conversion of ours, not the source's. Write these instead, worked out from the source's US figure as keepers here name them (a minimum never more than a twentieth under the exact conversion): ${said(fs)}. A tank or water per fish, or per cm of a fish, is an allowance, not a dose. A dose's figures stay exact.`
}
/** The figures as a breed writer's fact check is told them: the facts' own. */
export const checkFiguresNote = (fs: WriterFigure[]) => (fs.length ? `\nThese figures were worked out by rule from the facts' US figures, a minimum never more than a twentieth under the exact conversion, and are the facts' figures: ${said(fs)}.` : '')
