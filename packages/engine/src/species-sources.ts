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
 *   it picks fish for its customers.
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

/** The positions of an English section's blocks that are a shop's own talk. */
export const shopTalkBlocks = (en: string) => leaves(parse(en)).flatMap((el, i) => (shopTalk(el.text.replace(/\s+/g, ' ')) ? [i] : []))

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
  const drop = shopTalkBlocks(en)
  if (!drop.length) return { en, tr }
  const count = leaves(parse(en)).length
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
