import { parse } from 'node-html-parser'
import { resolveDataCard } from './datacard'
import { tankLengthFor } from './tank-sizes'
import type { DataCardField, Range } from './types'

/**
 * A species page shows each figure once, in its data card, and its sections are each source's own text. Two things
 * keep the text from contradicting the card:
 * - a quick-facts list drops the items the card already carries for that source (each source's figure stays one tap
 *   away in the card's "Nguồn và độ tin cậy"), and the family (the page's header shows it): `dropCardRepeats`
 * - a block that states a figure the card resolved differently says so: `figuresOffCard`, and a tank volume that makes
 *   a shorter tank than the card's: `litresOffCard`; a quick-facts line that does either goes: `dropOffItems`
 */

type Card = Partial<Record<DataCardField, { source: string; value: Range | number; hidden?: string }[]>>
type Figure = Range | number

/**
 * A quick-facts item's English label → what it repeats. "Care" (The Spruce Pets) and "Keeping" (Aquarium Breeder) are
 * their words for difficulty; Aquarium Breeder's "Optimal …" figures are the ones it gives the card. A lifespan goes
 * too: the app's facts card shows the card's (`lifeYears` in the app index), and the app's copy of a page reads as the
 * page, so the line goes from both.
 */
const LABELS: [RegExp, DataCardField | 'family'][] = [
  [/^family$/, 'family'],
  [/^(optimal |water )?temperature$/, 'tempC'],
  [/^(optimal )?ph$/, 'ph'],
  [/^(optimal )?(water hardness|hardness|gh|general hardness)$/, 'gh'],
  [/^(max(imum)? (size|length)|(adult|average) size|size)$/, 'sizeCm'],
  [/^(minimum )?(aquarium|tank) (size|length|base)$/, 'tankCm'],
  [/^(difficulty|care|care level|keeping)$/, 'difficulty'],
  [/^(average )?(life ?span|life expectancy)$/, 'lifeYears'],
]
/** An unlabelled item that is only water figures: "pH 6.0-8.0; hardness up to 12 dGH; temperature 4-25 °C". */
const WATER = [[/^ph\b/, 'ph'], [/^(hardness|gh)\b/, 'gh'], [/^temperature\b/, 'tempC']] as const
/** Words a bare figure is written with (units, "up to", a difficulty grade): anything else says more than the card. */
const FIGURE_WORDS = new Set(('c f cm mm in inch inches sl tl l litres liters gallons gal dgh gh ph to up about approx approximately around of or and '
  + 'max maximum min minimum x very easy moderate moderately intermediate medium difficult hard expert experts beginner beginners advanced simple '
  + 'challenging fairly relatively').split(' '))
/** A lifespan's units, for its label only: "Max size: 5 cm in 2 years" says how fast it grows, more than the card. */
const LIFE_WORDS = new Set('year years yr yrs month months ca'.split(' '))
/** The value is the figure and nothing more: "23–29°C (73–84°F)", "Easy", "150 mm SL"; not "5 of 8; needs a very large tank". */
const bare = (value: string, life = false) =>
  value.toLowerCase().replace(/\([^)]*\)/g, ' ').match(/\p{L}+/gu)?.every(w => FIGURE_WORDS.has(w) || (life && LIFE_WORDS.has(w))) ?? true

// Block elements apart: "…size: 20 gallons</li><li>Diet…" is not "20 gallonsDiet".
const text = (html: string) => parse(html).structuredText.replace(/\s+/g, ' ').trim()

/** What an English quick-facts item repeats, if it is nothing but that: the fields it gives (several for a water line), or the family. */
function repeats(item: string): (DataCardField | 'family')[] {
  const t = item.toLowerCase()
  const m = /^([^:]{1,40}):(.*)$/.exec(t)
  if (m) {
    const hit = LABELS.find(([re]) => re.test(m[1]!.trim()))
    if (!hit) return []
    // A family is one name ("Cobitidae (loaches)"); a figure is bare.
    const ok = hit[1] === 'family' ? (m[2]!.replace(/\([^)]*\)/g, ' ').match(/\p{L}+/gu) ?? []).length <= 1 : bare(m[2]!, hit[1] === 'lifeYears')
    return ok ? [hit[1]] : []
  }
  const parts = t.split(/\s*;\s*/).filter(Boolean).map(p => ({ p, f: WATER.find(([re]) => re.test(p)) }))
  return parts.length > 0 && parts.every(x => x.f && bare(x.p.replace(x.f[0], ''))) ? parts.map(x => x.f![1]) : []
}

/**
 * The positions of the items in a quick-facts list (English, the text every translation is made from) that repeat the
 * data card: a figure this same source gave the card, or the family.
 */
export function cardRepeats(en: string, source: string, card: Card): number[] {
  return parse(en).querySelectorAll('li').flatMap((li, i) => {
    const f = repeats(text(li.innerHTML))
    return f.length > 0 && f.every(x => x === 'family' || card[x]?.some(v => v.source === source)) ? [i] : []
  })
}

/**
 * A quick-facts block (any language) without the items its English text has at `drop`: '' when nothing is left. A
 * translation whose list doesn't have the English list's items one for one is left as it is.
 */
export function dropItems(en: string, html: string, drop: number[]): string {
  if (drop.length === 0) return html
  const count = parse(en).querySelectorAll('li').length
  const root = parse(html)
  const items = root.querySelectorAll('li')
  if (items.length !== count) return html
  for (const i of drop) items[i]?.remove()
  for (const list of root.querySelectorAll('ul, ol')) if (list.querySelectorAll('li').length === 0) list.remove()
  return root.textContent.trim() ? root.toString() : ''
}

/** `dropItems` with the positions `cardRepeats` finds: one call for a page or the engine. */
export const dropCardRepeats = (en: string, html: string, source: string, card: Card) => dropItems(en, html, cardRepeats(en, source, card))

/** Tropica's row for how little CO₂ a plant asks for, as its pages word it: a level, with figures only for Medium (6–14 mg/L) and High (15–25). */
const LOW_CO2 = /^co[2₂]( demand)?\s*:\s*low\.?$/
/**
 * A plant's quick facts without Tropica's "Low" row where the plant's card answers otherwise: "Không cần" or "Bắt buộc" says
 * whether to add CO₂, and "Thấp" beside it reads as a second answer to that. The card is the page's figure. Beside "Tùy chọn"
 * the row stays, since how little the plant asks for is more than that card says.
 */
export function dropLowCo2(en: string, html: string, co2: 'none' | 'optional' | 'required'): string {
  if (co2 === 'optional') return html
  return dropItems(en, html, parse(en).querySelectorAll('li').flatMap((li, i) => (LOW_CO2.test(text(li.innerHTML).toLowerCase()) ? [i] : [])))
}

// Numbers as the three languages and English write them (3,5 or 3.5), and the words that join a range.
const NUM = String.raw`(\d+(?:[.,]\d+)?)`
const TO = String.raw`\s*(?:–|—|-|−|~|to|đến|tới|sampai|hingga|ถึง)\s*`
const DEG = String.raw`\s*(?:°\s*C|℃|độ\s*C|องศาเซลเซียส)`
const GH = String.raw`\s*°?\s*d?GH\b`
/** "×" between a tank's sides ("60 × 30 cm", "60x30 cm"), and not after one: the 30 there is no length of its own. */
const BY = String.raw`\s*(?:×|\*|x(?=\s*\d))`
const NOT_SIDE = String.raw`(?<!(?:×|\*|\dx|\d\sx)\s*)(?<![\d.,])`
const num = (s: string) => Number(s.replace(',', '.'))
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9
const pairs = (t: string, re: RegExp) => [...t.matchAll(re)].map(m => [num(m[1]!), num(m[2] ?? m[1]!)] as const)
const isRange = (v: Figure): v is Range => typeof v === 'object'

/** Whether a block's text states this figure for this field (difficulty is words, never matched). */
export function states(html: string, field: DataCardField, value: Figure): boolean {
  const t = text(html)
  const [lo, hi] = isRange(value) ? [value.min, value.max] : [value, value]
  const hasPair = (re: RegExp) => pairs(t, re).some(([a, b]) => same(a, lo) && same(b, hi))
  switch (field) {
    case 'tempC': return hasPair(new RegExp(`${NUM}(?:${DEG})?${TO}${NUM}${DEG}`, 'gi')) || (lo === hi && hasPair(new RegExp(`${NUM}${DEG}`, 'gi')))
    case 'ph': return hasPair(new RegExp(String.raw`pH[^0-9]{0,25}?${NUM}${TO}${NUM}`, 'gi'))
    case 'gh': return hasPair(new RegExp(`${NUM}${TO}${NUM}${GH}`, 'gi'))
      || (lo === 0 && pairs(t, new RegExp(String.raw`(?:tối đa|up to|maksimal|ไม่เกิน)\s*${NUM}${GH}`, 'gi')).some(([a]) => same(a, hi)))
    // A length in cm that isn't the second or third side of a tank's "60 × 30 × 30 cm"; a tank is also its first side.
    case 'sizeCm': return pairs(t, new RegExp(String.raw`${NOT_SIDE}${NUM}\s*cm\b`, 'gi')).some(([a]) => same(a, lo))
    case 'tankCm': return pairs(t, new RegExp(String.raw`${NOT_SIDE}${NUM}\s*(?:cm\b|${BY}\s*\d)`, 'gi')).some(([a]) => same(a, lo))
    default: return false
  }
}

/** A tank volume: "75 litres", "60 l", "20 gallons", "10 US gal". */
const VOLUME = String.raw`${NOT_SIDE}${NUM}\s*(litres?|liters?|l\b|(?:us\s*)?gal(?:lons?)?\b)`
const GALLON = 3.785

/** A tank's length or sides in any unit: "120 × 30 cm", "48 x 12 in", "a 4-foot tank", "a tank 90 cm long". */
const TANK_LENGTH = String.raw`\d\s*(?:×|\*|x(?=\s*\d))\s*\d|\d\s*-?\s*(?:cm|in(?:ch(?:es)?)?|foot|feet|ft)\b\.?\s+(?:long\s+)?(?:tank|aquarium)|(?:tank|aquarium)\s+(?:(?:of|at least|measuring)\s+)*\d+(?:[.,]\d+)?\s*(?:cm|in(?:ch(?:es)?)?|foot|feet|ft)\b`

/**
 * Whether a minimum tank length is really the source's tank volume: the text gives that figure as litres or gallons
 * ("75 litres (20 gallons)" read as 75 cm; "75 gallons (about 284 litres)" as 284 cm) and never as a length, or it gives
 * the tank only as a volume, so a length was made up from it (The Spruce Pets' "10 gallons (about 38 litres)" became
 * 40 cm, its "2 gallons" 30 cm: 19 cards in 2026-11).
 */
export function tankIsVolume(html: string, value: number): boolean {
  if (states(html, 'tankCm', value)) return false
  const t = text(html)
  const volumes = [...t.matchAll(new RegExp(VOLUME, 'gi'))]
  if (volumes.length && !new RegExp(TANK_LENGTH, 'i').test(t)) return true
  return volumes.some(m => {
    const litres = /^l/i.test(m[2]!) ? num(m[1]!) : num(m[1]!) * GALLON
    return Math.abs(litres - value) <= Math.max(1.5, value * 0.03)
  })
}

/** What a shop has in stock, not how big the fish gets: Glaser's "Available size: 4–5 cm", "currently 20–25 cm long". */
const SOLD_SIZE = /available size:?\s*[\d.,]+(?:\s*(?:-|–|to)\s*[\d.,]+)?\s*cm|currently(?![^.]{0,40}fully grown)[^.]{0,60}?[\d.,]+(?:\s*(?:-|–|to)\s*[\d.,]+)?\s*cm(?:\s*long)?/gi

/** Whether a card's adult size is really the size a shop sells: the source gives that figure only as what it has in stock. */
export function sizeIsForSale(html: string, value: number): boolean {
  if (!/available size|currently/i.test(html)) return false
  const t = text(html)
  if (!(t.match(SOLD_SIZE) ?? []).some(c => (c.match(/\d+(?:[.,]\d+)?/g) ?? []).some(n => same(num(n), value)))) return false
  return !states(t.replace(SOLD_SIZE, ' '), 'sizeCm', value)
}

/** Said of the wild or of breeding, or a low the fish meets now and then: no temperature to keep it at. */
const NOT_KEEPING = /monsoon|in the wild|in nature|natural (?:waters?|habitat|range)|habitat|temperature there|the lake|falls below|breed|spawn|\bfry\b|drops? to|as low as|as high as|at times|winter|measured|recorded/i

/** Whether a card's single temperature is one its source gives only for the wild or for breeding (a range is a keeper's target). */
export function isOneEnded(html: string, field: DataCardField, value: Figure): boolean {
  const label = ONE_ENDED[field]
  if (!label || !isRange(value)) return false
  const t = text(html)
  const said = [...t.matchAll(label)].map(m => t.slice(m.index + m[0].length, m.index + m[0].length + 90).split(/[.;!?](?=\s|$)/)[0]!)
  if (said.some(s => TWO_ENDS.test(s))) return false
  const end = (n: string, unit: string | undefined, want: number) => {
    const x = Number(n.replace(',', '.'))
    return field === 'tempC' && /f/i.test(unit ?? '') ? Math.abs((x - 32) * 5 / 9 - want) < 0.6 : x === want
  }
  // The range's other end, stated beside it ("below 26°C in summer and around 17°C in winter"), is two ends, not one.
  const stated = (want: number) => value.min !== value.max && said.some(s => new RegExp(String.raw`(?<![\d.,])${want}(?![\d])`).test(s))
  return said.some(s => {
    const low = NO_LESS.exec(s) ?? AT_LEAST_AFTER.exec(s)
    const high = NO_MORE.exec(s) ?? AT_MOST_AFTER.exec(s)
    return (!!low && end(low[1]!, low[2], value.min) && !stated(value.max)) || (!!high && end(high[1]!, high[2], value.max) && !stated(value.min))
  })
}

export function tempIsNotForKeeping(html: string, value: Figure): boolean {
  if (!isRange(value) || !same(value.min, value.max)) return false
  const figure = new RegExp(String.raw`(?<![\d.,])${value.min}${DEG}`, 'i')
  const said = text(html).split(/(?<=[.!?;])\s+/).filter(x => figure.test(x))
  return said.length > 0 && said.every(x => NOT_KEEPING.test(x))
}

/**
 * A figure the page gives only as one end ("pH above 7.5", "GH of at least 5°", "up to 28°C", "should not sink below 8"): a
 * range for it has an end the page never gave (Aquarium Co-op's "at least 5 dGH" was 5–12 on the card), so it's no card
 * figure, and the page's text keeps it one-sided. A statement of two ends about the same field, anywhere, is a range.
 */
const ONE_ENDED: Partial<Record<DataCardField, RegExp>> = {
  ph: /\bp\.?H\b/gi, gh: /\b(?:d?GH|dH|hardness)\b/gi, tempC: /\btemperatures?\b/gi, lifeYears: /\b(?:life ?span|life expectancy|lives?|living)\b/gi,
}
const FIGURE = String.raw`(?:about\s+|around\s+|approximately\s+|~\s*)?(\d+(?:[.,]\d+)?)\s*(°\s*[CFHd]?|d?GH|dH|years?)?`
const BEFORE = String.raw`^[^\d]{0,30}?`
const TWO_ENDS = /\d(?:[.,]\d+)?\s*(?:°\s*[A-Za-z]*\s*)?(?:-|–|—|to)\s*\d/
const NO_LESS = new RegExp(`${BEFORE}(?:(?<!not\\s(?:rise\\s|go\\s)?)\\b(?:above|over)\\b|\\bat least\\b|\\bmore than\\b|\\b(?:higher|greater|warmer) than\\b|\\bminimum(?: of)?\\b|\\bnot (?:fall|sink|drop|go) below\\b)\\s*${FIGURE}`, 'i')
const NO_MORE = new RegExp(`${BEFORE}(?:(?<!not\\s(?:fall\\s|sink\\s|drop\\s|go\\s)?)\\b(?:below|under)\\b|\\bup to\\b|\\bat most\\b|\\bless than\\b|\\b(?:lower|cooler) than\\b|\\bmaximum(?: of)?\\b|\\bnot (?:rise|go) above\\b|\\bnot exceed(?:ing)?\\b)\\s*${FIGURE}`, 'i')
const AT_LEAST_AFTER = new RegExp(`${BEFORE}${FIGURE}\\s*(?:or (?:more|higher|above|warmer)|and (?:above|up|higher))\\b`, 'i')
const AT_MOST_AFTER = new RegExp(`${BEFORE}${FIGURE}\\s*(?:or (?:less|lower|below|under|cooler)|and (?:below|under))\\b`, 'i')

/**
 * A data card as a page shows it: the values of the sources it may show (`allowed`), without a value the engine hid
 * (`hidden`), a tank length that is that source's tank volume, a size that is what a shop sells or a temperature only for
 * the wild or breeding (each read in that source's sections). The build reads every card this way, and so does the
 * engine's card-fill step when it looks for the figures a card lacks.
 */
export function shownCard<C extends Card>(card: C, sections: { source: string; html: string }[], allowed: (source: string) => boolean): C {
  return Object.fromEntries(
    Object.entries(card)
      .map(([field, values]) => [field, (values ?? []).filter(v => {
        const own = () => sections.filter(s => s.source === v.source).map(s => s.html).join('\n')
        return allowed(v.source) && !v.hidden
          && !(field === 'tankCm' && typeof v.value === 'number' && tankIsVolume(own(), v.value))
          && !(field === 'sizeCm' && typeof v.value === 'number' && sizeIsForSale(own(), v.value))
          && !(field === 'tempC' && tempIsNotForKeeping(own(), v.value))
          && !isOneEnded(own(), field as DataCardField, v.value)
      })] as const)
      .filter(([, values]) => values.length > 0),
  ) as C
}

const FIELDS: DataCardField[] = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm']
const key = (v: Figure) => JSON.stringify(isRange(v) ? [v.min, v.max] : v)

/**
 * The figures a source's block states that the data card shows otherwise: the card resolves sources that disagree to
 * one value (resolveDataCard), so a block from a source it didn't follow can read as a contradiction unless it says so.
 */
export function figuresOffCard(card: Card, source: string, html: string): { field: DataCardField; own: Figure; card: Figure }[] {
  return FIELDS.flatMap(field => {
    const vals = card[field] ?? []
    const own = vals.find(v => v.source === source)
    const r = resolveDataCard(vals, field)
    return own && r && key(own.value) !== key(r.value) && states(html, field, own.value) ? [{ field, own: own.value, card: r.value }] : []
  })
}

/** A volume in any of the languages ("8 lít", "54 L", "38 liter", "40 ลิตร"), not a rate ("300 lít/giờ", "lít mỗi giờ"). */
const LITRES = new RegExp(String.raw`${NOT_SIDE}${NUM}(?:${TO}${NUM})?\s*(?:ลิตร|(?:lít|liter|litres?|liters?|l)(?![\p{L}/]))(?!\s*(?:\/|mỗi|per|tiap|ต่อ))`, 'giu')
/** "1.000 lít" and "1,000 L" are a thousand litres: no tank is one litre to three decimals. */
const litres = (s: string) => (/^\d{1,3}[.,]\d{3}$/.test(s) ? Number(s.replace(/[.,]/, '')) : num(s))
/**
 * The tank volumes a block gives that make a shorter tank than the card's minimum, each read as the shortest
 * ready-made tank that holds it (tank-sizes.ts): The Spruce Pets' "Dung tích bể tối thiểu: 8 lít" is a 30 cm tank, under
 * a 45 cm card. A volume beside a tank's sides or a length the card has is that tank's ("đáy 120 × 30 cm, khoảng 108
 * lít": long and low, so more length than the shops' tank of 108 litres), and the length is what is read.
 */
export function litresOffCard(card: Card, html: string): { field: 'tankL'; own: Figure; card: number }[] {
  const min = resolveDataCard(card.tankCm ?? [], 'tankCm')?.value
  if (typeof min !== 'number') return []
  const t = text(html)
  if (new RegExp(String.raw`\d${BY}\s*\d`, 'i').test(t) || (card.tankCm ?? []).some(v => typeof v.value === 'number' && states(html, 'tankCm', v.value))) return []
  const out: { field: 'tankL'; own: Figure; card: number }[] = []
  for (const m of t.matchAll(LITRES)) {
    const own: Figure = m[2] ? { min: litres(m[1]!), max: litres(m[2]) } : litres(m[1]!)
    const len = tankLengthFor(isRange(own) ? own.min : own)
    if (len !== undefined && len < min && !out.some(o => key(o.own) === key(own))) out.push({ field: 'tankL', own, card: min })
  }
  return out
}

/** A quick-facts block (any language) without the lines that state a figure off the card, or a volume that makes a shorter tank: '' when nothing is left. */
export function dropOffItems(card: Card, source: string, html: string): string {
  const root = parse(html)
  const off = root.querySelectorAll('li').filter(li => figuresOffCard(card, source, li.innerHTML).length + litresOffCard(card, li.innerHTML).length > 0)
  if (!off.length) return html
  for (const li of off) li.remove()
  for (const list of root.querySelectorAll('ul, ol')) if (list.querySelectorAll('li').length === 0) list.remove()
  return root.textContent.trim() ? root.toString() : ''
}
