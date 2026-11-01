import { parse } from 'node-html-parser'
import { resolveDataCard } from './datacard'
import type { DataCardField, Range } from './types'

/**
 * A species page shows each figure once, in its data card, and its sections are each source's own text. Two things
 * keep the text from contradicting the card:
 * - a quick-facts list drops the items the card already carries for that source (each source's figure stays one tap
 *   away in the card's "Nguồn và độ tin cậy"), and the family (the page's header shows it): `dropCardRepeats`
 * - a block that states a figure the card resolved differently says so: `figuresOffCard`
 */

type Card = Partial<Record<DataCardField, { source: string; value: Range | number }[]>>
type Figure = Range | number

/**
 * A quick-facts item's English label → what it repeats. "Care" (The Spruce Pets) and "Keeping" (Aquarium Breeder) are
 * their words for difficulty; Aquarium Breeder's "Optimal …" figures are the ones it gives the card.
 */
const LABELS: [RegExp, DataCardField | 'family'][] = [
  [/^family$/, 'family'],
  [/^(optimal |water )?temperature$/, 'tempC'],
  [/^(optimal )?ph$/, 'ph'],
  [/^(optimal )?(water hardness|hardness|gh|general hardness)$/, 'gh'],
  [/^(max(imum)? (size|length)|(adult|average) size|size)$/, 'sizeCm'],
  [/^(minimum )?(aquarium|tank) (size|length|base)$/, 'tankCm'],
  [/^(difficulty|care|care level|keeping)$/, 'difficulty'],
]
/** An unlabelled item that is only water figures: "pH 6.0-8.0; hardness up to 12 dGH; temperature 4-25 °C". */
const WATER = [[/^ph\b/, 'ph'], [/^(hardness|gh)\b/, 'gh'], [/^temperature\b/, 'tempC']] as const
/** Words a bare figure is written with (units, "up to", a difficulty grade): anything else says more than the card. */
const FIGURE_WORDS = new Set(('c f cm mm in inch inches sl tl l litres liters gallons gal dgh gh ph to up about approx approximately around of or and '
  + 'max maximum min minimum x very easy moderate moderately intermediate medium difficult hard expert experts beginner beginners advanced simple '
  + 'challenging fairly relatively').split(' '))
/** The value is the figure and nothing more: "23–29°C (73–84°F)", "Easy", "150 mm SL"; not "5 of 8; needs a very large tank". */
const bare = (value: string) => value.toLowerCase().replace(/\([^)]*\)/g, ' ').match(/\p{L}+/gu)?.every(w => FIGURE_WORDS.has(w)) ?? true

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
    const ok = hit[1] === 'family' ? (m[2]!.replace(/\([^)]*\)/g, ' ').match(/\p{L}+/gu) ?? []).length <= 1 : bare(m[2]!)
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

/**
 * A data card as a page shows it: the values of the sources it may show (`allowed`), without a tank length that is that
 * source's tank volume (read in that source's sections). The build reads every card this way, and so does the engine's
 * card-fill step when it looks for the figures a card lacks.
 */
export function shownCard<C extends Card>(card: C, sections: { source: string; html: string }[], allowed: (source: string) => boolean): C {
  return Object.fromEntries(
    Object.entries(card)
      .map(([field, values]) => [field, (values ?? []).filter(v => allowed(v.source)
        && !(field === 'tankCm' && typeof v.value === 'number' && tankIsVolume(sections.filter(s => s.source === v.source).map(s => s.html).join('\n'), v.value)))] as const)
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
    const r = resolveDataCard(vals)
    return own && r && key(own.value) !== key(r.value) && states(html, field, own.value) ? [{ field, own: own.value, card: r.value }] : []
  })
}
