import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, type HTMLElement } from 'node-html-parser'
import { SOURCES } from './sources'

/**
 * What a species or plant page doesn't take from a source page:
 * - a shop's own talk: a block (paragraph, list item) of a shop source (`shop` in sources.ts) that speaks as the shop
 *   ("we", "our", "I") or sells ("customers", "stock list", "shipping", "before purchase"). Found on the English text every
 *   translation is made from; the same block goes from each translation, or the whole section when a translation's
 *   blocks don't match the English one for one. Found 2026-11-06: the betta's "Có nên mua không?" was a shop's note on how
 *   it picks fish for its customers. A shop's list line of the size it sells ("Available size: 4–5 cm") goes the same way.
 * - a shop's part that is stock talk in every sentence (stockOnly, below): the whole part, in every language.
 * - a page about one variety, strain or hybrid line of the species (the Copper Alien betta, the albino pacu): its
 *   sections, card figures and photos say what that line is, not the species. Kept in engine-state/_variety-pages.json
 *   (the translator names the variety, prompts/process.md); the sweep takes them off a species page that has text from
 *   another page, and the engine never merges them again.
 */

const FIRST = /\b(?:we|we're|we've|we'll|we'd|our|ours|my)\b/i
// Case matters: "US" is a country, "Type I" a form.
const FIRST_CASED = /\bus\b|(?<![\w.'’])(?<!\b(?:Type|Form|Group|Phase|Part|Class|sp\.|No\.)\s)I(?:'m|'ve|’m|’ve)?(?![\w.'’])/
const SALES = /\b(?:the (?:shop|store|importer)|customers?|stock ?list|in stock|for sale|wholesale|ship(?:s|ped|ping|ment|ments)?|prices?|discounts?|sellers?|seller's|purchase[sd]?|order(?:s|ed)? from|deliver(?:y|ies|ed)?)\b/i
/** Whether an English block speaks as the shop or sells. */
export const shopTalk = (text: string) => FIRST.test(text) || FIRST_CASED.test(text) || SALES.test(text)
export const isShop = (source: string) => !!SOURCES.find(s => s.id === source)?.shop

const LEAF = 'p, li, h3, td'
const leaves = (root: HTMLElement) => root.querySelectorAll(LEAF).filter(el => !el.querySelector(LEAF))

/** A list line giving the size the dealer sells ("Available size: 4–5 cm"), not one the fish grows to. */
const SIZE_ON_OFFER = /^available sizes?\s*:/i
/** A size line that is only that: no other fact rides on it ("…; adults reach 12 cm" stays). */
const SIZE_ONLY = /^available sizes?\s*:\s*(?:ca\.?\s*)?[\d.,]+\s*(?:[-–]\s*[\d.,]+\s*)?cm\.?$/i
/** The positions of an English section's blocks that are a shop's own talk. */
export const shopTalkBlocks = (en: string) => leaves(parse(en)).flatMap((el, i) => (shopTalk(el.text.replace(/\s+/g, ' ')) ? [i] : []))
/** The positions of a shop's list lines of the size it sells, and nothing else. */
const sizeLines = (en: string) => leaves(parse(en)).flatMap((el, i) => (el.tagName === 'LI' && SIZE_ONLY.test(el.text.replace(/\s+/g, ' ').trim()) ? [i] : []))
/** A line's figures, as a translation writes them too ("4-5" and "4–5", "0.3" and "0,3" alike). */
const figures = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(x => x.replace(',', '.')).join(' ')

/**
 * Stock talk (the chief of staff, 15 Nov 2026): a dealer's sentence true only of its own country and shelf, not of the
 * fish wherever a keeper buys it. On the market now, currently available, this batch received, bred in Germany, the size
 * on offer: a keeper in Vietnam isn't buying the dealer's German-bred fish. Rare in the trade, only captive-bred fish
 * traded, no exports, a place the species comes from, a year, the size it grows to, a care fact: true anywhere, so a
 * sentence with one isn't stock talk, and a part with one waits for the sentence mend. Limia perugiae's "Có nên mua
 * không?" was stock talk in every sentence ("available on a quite regular basis", "German bred ones", "Available size").
 */
const STOCK = [
  /\b(?:currently|now|at (?:the moment|present)|presently|from time to time)\b.*\b(?:available|on offer|offered|in stock)\b/i,
  /\b(?:available|on offer|offered|in stock)\b.*\b(?:currently|now|at (?:the moment|present)|from time to time|again)\b/i,
  /\bavailable (?:as|on a)\b/i,
  /\b(?:german|czech|european)[- ]bred\b|\bgerman breeding\b|\bbred ones\b/i,
  SIZE_ON_OFFER,
  /\bobtained from a breeder\b|\b(?:specimens|animals|fish) (?:were|was) received\b/i,
  /\b(?:the )?(?:animals|specimens|fish) offered\b/i,
]
const ANYWHERE = [
  /\b(?:rare|rarely|rarit(?:y|ies)|seldom|occasionally|hardly ever|sought[- ]after|first|extinct|exports?|exported|fully grown|maximum|adults?|native|region)\b/i,
  /\bno (?:regular |commercial )?(?:imports?|importations?)\b/i,
  /\b(?:counterpart|relatives?|similar|resembl\w*|distinguish\w*|looks? like)\b/i,
  /\b(?:only|exclusively|mostly|mainly|all|always)\b.*\bbred\b|\balways\b/i,
  /\bin the (?:trade|hobby|shops?)\b|\bsynonym|\bunder the name\b/i,
  /\b(?:grows?|grown|reach(?:es)?|attains?|need\w*|requir\w*|prefer\w*|eats?|prey|colou?r\w*|bands?|stripes?|spots?|fins?|pattern\w*)\b/i,
  /\b(?:from|in|via) (?:the )?(?!German\b|Czech\b|European\b)\p{Lu}\p{Ll}+/u,
  /\b(?:1[89]|20)\d\d\b|\bL ?\d{2,3}\b/,
  /\b(?:tanks?|aquari\w*|communit\w*|water|feed\w*|food|keep\w*|kept|peaceful|hardy|temperature|pH)\b/i,
]
/**
 * The only words a stock-talk sentence is made of, once the size on offer and a short name are taken out. A list of facts to
 * spare can't be closed (the delta read of 15 Nov 2026: "Origin of the fish offered: wild caught (Sibu, Sarawak)", "The
 * specimens offered are venomous", "Available size: 4-5 cm, up to 30 cm when mature" all went), so a sentence is stock
 * talk only when nothing else is left: any other word, a place, a look, a caution, a figure, keeps it.
 */
const STOCK_WORDS = new Set(('a an the this these it they both and but or of from as on to only usually again currently now at present presently ' +
  'moment time regular quite basis available offer offered stock is are was were be been originate originates german czech european bred ' +
  'breeding breeder ones specimens specimen animals fish individuals wild caught collected captive two three few several received ' +
  'obtained beautiful livebearer photos taken').split(' '))
const SIZE_SAID = /\bavailable sizes?\s*:\s*(?:ca\.?|approx\.?)?\s*[\d.,]+\s*(?:[-–]\s*[\d.,]+\s*)?cm\b|\bcurrently\s+[\d.,]+\s*(?:[-–]\s*[\d.,]+\s*)?cm(?:\s+long)?\b/gi
/**
 * A name as an abbreviated genus ("A. atahualpa"), the only form told from a fact by its shape: a full binomial reads like
 * "The venomous" or "Sarawak population" (the second delta read, 15 Nov 2026), so a sentence naming its fish in full stays.
 */
const SHORT_NAME = /\b\p{Lu}\.\s+\p{Ll}{3,}\b/gu
const nothingElse = (sentence: string) =>
  (sentence.replace(SIZE_SAID, ' ').replace(SHORT_NAME, ' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .every(w => STOCK_WORDS.has(w))
/** Whether an English sentence of a dealer's is stock talk, by the line above, with nothing else in it. */
export const stockTalk = (sentence: string) => STOCK.some(r => r.test(sentence)) && !ANYWHERE.some(r => r.test(sentence)) && nothingElse(sentence)
/** Whether every sentence of a dealer's English part is stock talk: the whole part goes, its heading with it if alone. */
export function stockOnly(en: string): boolean {
  const said = parse(en.replace(/<br\s*\/?>/gi, '\n')).structuredText.split('\n')
    .flatMap(b => b.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=["“(]?[\p{Lu}\d])/u))
    .filter(s => /[\p{L}\p{N}]/u.test(s))
  return said.length > 0 && said.every(stockTalk)
}

/**
 * A section's text (English or a translation) without the blocks at `drop`: '' when nothing is left, null when it has
 * not as many blocks as the English (`count`), so its blocks can't be matched.
 */
export function dropBlocks(html: string, count: number, drop: number[]): string | null {
  if (!drop.length) return html
  const root = parse(html)
  const els = leaves(root)
  if (els.length !== count) return null
  for (const i of drop) els[i]!.remove()
  for (const list of root.querySelectorAll('ul, ol')) if (!list.querySelector('li')) list.remove()
  return root.textContent.trim() ? root.toString() : ''
}

/**
 * A shop source's section without its own talk, in English and each translation (`tr`, by language): every text '' when
 * the section goes (nothing left, or a translation that can't be matched block for block).
 */
export function withoutShopTalk<T extends Record<string, string>>(en: string, tr: T): { en: string; tr: T } {
  if (stockOnly(en)) return { en: '', tr: Object.fromEntries(Object.keys(tr).map(k => [k, ''])) as T }
  const talk = shopTalkBlocks(en)
  const count = leaves(parse(en)).length
  // A size line goes only where every translation matches the English block for block: else the part keeps it, and its
  // facts, for the sentence mend.
  // …and only where that block in each translation gives the same figures, so a translation in another order keeps it.
  const enLeaves = leaves(parse(en))
  const sizes = sizeLines(en).filter(i => !talk.includes(i))
  const matched = Object.values(tr).every(html => {
    const els = leaves(parse(html))
    return els.length === count && sizes.every(i => figures(els[i]!.text) === figures(enLeaves[i]!.text))
  })
  const drop = [...talk, ...(matched ? sizes : [])].sort((a, b) => a - b)
  if (!drop.length) return { en, tr }
  const out = Object.fromEntries(Object.entries(tr).map(([k, html]) => [k, dropBlocks(html, count, drop)]))
  const cleanEn = dropBlocks(en, count, drop)!
  const gone = !cleanEn || Object.values(out).some(x => !x)
  return { en: gone ? '' : cleanEn, tr: Object.fromEntries(Object.keys(tr).map(k => [k, gone ? '' : out[k]!])) as T }
}

export type VarietyPage = { species: string; variety: string; at: string }
const varietyFile = (root: string) => join(root, 'engine-state', '_variety-pages.json')
export const readVarietyPages = async (root: string): Promise<Record<string, VarietyPage>> => JSON.parse(await readFile(varietyFile(root), 'utf8').catch(() => '{}'))
export async function recordVarietyPage(root: string, url: string, page: VarietyPage) {
  const all = await readVarietyPages(root)
  if (all[url]) return
  all[url] = page
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(varietyFile(root), `${JSON.stringify(Object.fromEntries(Object.entries(all).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
}
