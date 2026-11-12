import { GALLON, givesDose, keeperFigure, US_TANKS, usTankOf } from './round'

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
 * twentieth of it, else the table's for a volume only a gallon conversion gives (usTankOf: 110 lít is 29 gallons). A
 * finding is left to a person (`unitsLeft`) when a litre figure in it has neither, or a dose is given beside it (round.ts
 * givesDose), whose water stays exact. A figure counts only as the whole quantity: 15 lít mỗi cm, not 15 lít mỗi 2,5 cm (`keepsFigures`).
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
    usTankOf(l)?.[0]
}

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
      const table = US_TANKS.find(([x]) => x === g)?.[1]
      const to = perInch ? keeperFigure((g * GALLON) / 2.54) : table ?? keeperFigure(g * GALLON)
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

/**
 * Why a breed page's units finding is left to a person: a dose is given beside it (`around`: its paragraph and the ones
 * before and after it, fit-rewrite.ts), so a figure in it may be the water the dose goes into, which stays exact; or a
 * litre figure with no US figure to work from. The paragraphs beside it and not the whole part: a breed page's body is
 * one part of 30 to 40 paragraphs, and a treatment far down it would leave koi's tank (round.ts givesDose: a sentence or
 * a clause is too narrow, a dose's amount and its water can sit in two).
 */
export function unitsLeft(quote: string, facts: string, around = quote): string | undefined {
  const litres = litresIn(quote)
  if (!litres.length) return undefined
  if (givesDose(around) || givesDose(quote)) return 'a dose is given beside it, whose water stays exact'
  const pairs = factsPairs(facts)
  const none = litres.filter(l => usGallons(l, pairs) === undefined)
  return none.length ? `no US figure to work ${none.map(l => l.toLocaleString('vi-VN')).join(', ')} lít from` : undefined
}
/**
 * Where a quote's litres are once another mend of the part reworded it, in the block it was in: the one sentence there
 * giving each of them. None, or two (a spare tank of the same size beside the minimum), and it's for a person.
 */
export function moved(quote: string, block: string): string | undefined {
  const want = litresIn(quote)
  const found = want.length ? flat(block).split(/(?<=[.!?…])\s+/).filter(s => want.every(l => litresIn(s).includes(l))) : []
  return found.length === 1 ? found[0] : undefined
}
