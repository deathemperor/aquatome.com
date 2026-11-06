import { modelWords, nameKey } from '@aq/schema'

export const words = (s: string) => modelWords(s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd'))
export const has = (hay: string[], needle: string[]) => hay.some((_, i) => needle.every((w, j) => hay[i + j] === w))

const WORD = /[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu
/** A word with the numeral that makes it a model, not a size: "WRGB 2", "WRGB II", "Commander 4". */
const WORD_AND_NUMERAL = new RegExp(`${WORD.source}(?: (?:\\d|I{1,3}|IV|VI{0,3}|IX)(?![\\p{L}\\p{N}]))?`, 'gu')
/** One Vietnamese syllable, marks off. A foreign name doesn't fit it ("Nana", "Chihiros"); "Việt", "Một" and "Anh" do. */
const VI_SYLLABLE = /^(?:ngh|ng|nh|ch|gh|gi|kh|ph|qu|th|tr|[bcdghklmnprstvx])?[aeiouy]{1,3}(?:ng|nh|ch|[cmnpt])?$/
/** Foreign words a page may capitalize that name no product. */
const NOT_NAMES = new Set([
  'led', 'rgb', 'rgbw', 'uv', 'usb', 'ac', 'dc', 'ip', 'ip44', 'ip54', 'ip65', 'ip67', 'ip68', 't5', 't8', 'par', 'ppfd', 'pur', 'cri', 'cct', 'lumen', 'lux', 'kelvin', 'watt', 'volt',
  'co2', 'ph', 'gh', 'kh', 'tds', 'no2', 'no3', 'nh3', 'o2', 'usd', 'eur', 'euro', 'gbp', 'vnd', 'wifi', 'bluetooth', 'app', 'web', 'ios', 'android', 'iphone', 'ipad', 'chrome', 'safari',
  'youtube', 'facebook', 'google', 'amazon', 'shopee', 'lazada', 'tiki', 'review', 'video', 'clip', 'test', 'model', 'size', 'nano', 'mini', 'aquarium', 'tank', 'light', 'lights', 'plant', 'plants', 'aquatome',
  // Materials, water and algae, kit: what real pages capitalize most (a slip here costs a rewrite, not a wrong name).
  'pvc', 'cpvc', 'abs', 'mica', 'silicone', 'silicon', 'carbon', 'acrylic', 'epoxy', 'inox', 'oxy', 'nitrat', 'nitrate', 'nitrit', 'nitrite', 'phosphat', 'phosphate', 'amoniac', 'canxi', 'kali', 'axit', 'clo', 'npk', 'po4',
  'bba', 'gsa', 'bga', 'gda', 'psb', 'cfl', 'ups', 'db', 'ato', 'hob', 'sump', 'skimmer', 'timer', 'remote', 'reactor', 'bulkhead', 'dimmer', 'controller', 'iwagumi', 'dutch', 'bonsai',
  'taiwan', 'canada', 'malaysia', 'singapore', 'thailand', 'china', 'japan', 'germany', 'europe', 'usa', 'eu', 'uk',
])

/** Vietnamese for a living thing: the name after it is that thing's ("cá Oscar", "tép Amano", "cây Anubias Nana"), not a product's. */
const LIVING = new Set(['cá', 'tép', 'cây', 'rêu', 'ốc', 'ráy', 'tảo', 'bèo', 'xỉ', 'cua'])

/** A word written as a product or brand name: capitals somewhere, not Vietnamese, not an everyday word. A name in lower case isn't seen. */
export function isName(w: string): boolean {
  const key = nameKey(w)
  return w.length > 1 && /\p{Lu}/u.test(w) && !/^\p{N}/u.test(w) && !VI_SYLLABLE.test(key) && !NOT_NAMES.has(key)
}

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    row = next
  }
  return row[b.length]!
}

/** How many letters a spelling may be off. Short names have few to spare: "ADB" is no more "ADA" than "API" is. */
const slack = (letters: number) => (letters < 4 ? 0 : letters < 6 ? 1 : 2)

/**
 * The spelling a misheard name stands for: the same letters in any source, else the nearest in the closest source. Each
 * candidate must start with the same letter, and two as near as each other are no answer: a wrong rewrite is a new error.
 */
function closest(word: string, sources: string[][]): string | undefined {
  const key = nameKey(word)
  const names = sources.map(s => [...new Map(s.filter(w => isName(w) && !/\p{N}/u.test(w)).map(w => [nameKey(w), w] as const)).entries()])
  for (const source of names) for (const [k, w] of source) if (k === key) return w
  for (const source of names) {
    const near = source.filter(([k]) => k[0] === key[0]).map(([k, w]) => ({ w, d: distance(k, key) })).filter(x => x.d <= slack(key.length))
    if (!near.length) continue
    const best = Math.min(...near.map(x => x.d))
    const at = near.filter(x => x.d === best)
    return at.length === 1 ? at[0]!.w : undefined
  }
  return undefined
}

/**
 * Every product or brand name in a text, held to how its sources spell it (closest source first), because captions mangle
 * names ("Nana" for a light whose video title says "Nala"). A near-miss takes that spelling. A name no source holds is
 * reported. A word with a number only stands as it is: a different number is a different product, never a slip. Fish and
 * plants aren't checked, by `genera` and the word before them: a light's review may praise "Anubias Nana" beside a "Nala".
 */
export function fixNames(text: string, sources: string[], genera: ReadonlySet<string> = new Set()): { text: string; unknown: string[]; renamed: string[] } {
  const unknown: string[] = []
  const renamed: string[] = []
  const tokens = sources.map(s => s.normalize('NFC').match(WORD) ?? [])
  const nfc = text.normalize('NFC')
  let livingEnd = -2
  const fixed = nfc.replace(WORD_AND_NUMERAL, (whole, at: number) => {
    const [word, numeral] = whole.split(' ') as [string, string?]
    if (!isName(word)) return whole
    const before = /([\p{L}\p{N}-]+) $/u.exec(nfc.slice(0, at))?.[1] ?? ''
    if (genera.has(nameKey(word)) || LIVING.has(before.toLowerCase()) || genera.has(nameKey(before)) || at === livingEnd + 1) {
      livingEnd = at + whole.length
      return whole
    }
    if (numeral || /\p{N}/u.test(word)) {
      if (!sources.some(s => has(words(s), words(whole)))) unknown.push(whole)
      return whole
    }
    if (tokens.some(ws => ws.some(w => w.toLowerCase() === word.toLowerCase()))) return whole
    const spelling = closest(word, tokens)
    if (!spelling) { unknown.push(word); return whole }
    renamed.push(`${word} → ${spelling}`)
    return spelling
  })
  return { text: fixed, unknown, renamed }
}
