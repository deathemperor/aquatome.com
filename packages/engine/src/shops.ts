import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { POPULAR, slugify } from '@aq/schema'
import type { Llm } from './claude'

/**
 * What fish shops in each site language's country sell (their own price lists), engine-state/shop-lists/<lang>.json: the
 * species each language covers first (speciesOrder, galleries, new pages) and the names shops use (addShopNames). Private:
 * shops and prices never reach the site, only the species' common names.
 */
export type ShopLang = 'vi' | 'id' | 'th'
/** Fish (with shrimp and snails), or plants: plant lists rank the plants' galleries (engine-state/shop-lists/plants-<lang>.json). */
export type ShopGoods = 'fish' | 'plants'
export type ShopItem = { trade: string; name: string | null; scientificName: string | null; confidence: number; evidence: string }
export type ShopList = { lang: ShopLang; items: ShopItem[]; sources: { url: string; title: string }[]; updatedAt: string }

const PROMPT = readFileSync(new URL('./prompts/shop-list.md', import.meta.url), 'utf8')
const COUNTRY: Record<ShopLang, { country: string; lang: string; nameForm: string; plantNameForm: string }> = {
  vi: { country: 'Vietnam', lang: 'Vietnamese', nameForm: ', starting with "Cá", "Tép" or "Ốc" ("Cá cánh buồm", "Cá mún", "Tép đỏ")', plantNameForm: ' ("Cây ráy", "Rêu Java", "Trân châu Nhật")' },
  id: { country: 'Indonesia', lang: 'Indonesian', nameForm: ' (often "Ikan …" or the trade name alone, e.g. "Neon Tetra", "Cupang")', plantNameForm: ' (often the trade name alone, e.g. "Anubias Nana", "Moss Java")' },
  th: { country: 'Thailand', lang: 'Thai', nameForm: ' in Thai script (e.g. "ปลาหางนกยูง")', plantNameForm: ' in Thai script where shops use one (e.g. "อนูเบียส")' },
}
/** What a list covers, and what it leaves out, in the prompt's words. */
const GOODS: Record<ShopGoods, { shops: string; sell: string; leaveOut: string }> = {
  fish: { shops: 'aquarium fish shops', sell: 'fish, shrimp and snail', leaveOut: 'plants, equipment and food' },
  plants: { shops: 'aquarium plant shops (or fish shops with a plant list)', sell: 'aquarium plant and moss', leaveOut: 'fish, shrimp, snails, equipment and food' },
}
/** Below this a mapping still orders the work; only at NAME_MIN does its name go on a page. */
const RANK_MIN = 0.6
/** A new page is fetched first from here: a wrong guess costs one page fetched early (apple snails, 0.55, are a shop staple). */
const QUEUE_MIN = 0.5
const NAME_MIN = 0.8
/** Shop names a page gets at most (its other names are already long). */
const MAX_NEW = 2
const SCHEMA = {
  type: 'object', required: ['items', 'sources'],
  properties: {
    items: { type: 'array', items: { type: 'object', required: ['trade', 'name', 'scientificName', 'confidence', 'evidence'], properties: { trade: { type: 'string' }, name: { type: ['string', 'null'] }, scientificName: { type: ['string', 'null'] }, confidence: { type: 'number' }, evidence: { type: 'string' } } } },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'title'], properties: { url: { type: 'string' }, title: { type: 'string' } } } },
  },
}
const file = (root: string, lang: ShopLang, goods: ShopGoods = 'fish') => join(root, 'engine-state/shop-lists', goods === 'plants' ? `plants-${lang}.json` : `${lang}.json`)
const key = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
/** A name that is only the genus ("Danio", "Ikan Monodactylus"): it covers every species in it. */
const genusOnly = (name: string, sci: string) => key(name).replace(/^(cá|tép|ốc|ikan|udang|ปลา)\s*/, '') === key(sci.split(' ')[0]!)

export async function readShopList(root: string, lang: ShopLang, goods: ShopGoods = 'fish'): Promise<ShopList | null> {
  return JSON.parse(await readFile(file(root, lang, goods), 'utf8').catch(() => 'null')) as ShopList | null
}

/**
 * Researches the country's shop lists (web, never marketplaces) and maps each item to a species and its local name.
 * `seed`: one shop's list the owner supplied (trade names as written), mapped item by item before anything else.
 */
export async function makeShopList(root: string, research: Llm, lang: ShopLang, o: { seed?: string[]; model?: string; now: () => Date; goods?: ShopGoods }): Promise<ShopList> {
  const c = COUNTRY[lang]
  const goods = o.goods ?? 'fish'
  const g = GOODS[goods]
  const task = o.seed?.length
    ? `Here is a current price list from a ${goods === 'fish' ? 'fish' : 'plant'} shop in ${c.country} (trade names as written). Map every item. Then add the other species that 2 or more other shop lists in ${c.country} sell and this list lacks.\n\n${o.seed.map(s => `- ${s}`).join('\n')}`
    : `Find 3 to 6 current price or stock lists published by ${g.shops} in ${c.country}, and list every ${g.sell} they sell. Put the species that appear on more lists first.`
  const prompt = PROMPT.replaceAll('{{SHOPS}}', g.shops).replace('{{LEAVE_OUT}}', g.leaveOut).replaceAll('{{COUNTRY}}', c.country).replaceAll('{{LANG}}', c.lang).replace('{{NAME_FORM}}', goods === 'fish' ? c.nameForm : c.plantNameForm).replace('{{TASK}}', task)
  const r = await research<{ items: ShopItem[]; sources: { url: string; title: string }[] }>({ system: 'You research what aquarium shops sell and cite your sources. Reply only with JSON.', prompt, schema: SCHEMA, model: o.model })
  const items = r.items.map(i => ({ ...i, trade: i.trade.trim(), name: i.name?.trim() || null, scientificName: i.scientificName?.trim().replace(/\s+/g, ' ') || null, confidence: Math.max(0, Math.min(1, i.confidence)) }))
  const list: ShopList = { lang, items, sources: r.sources, updatedAt: o.now().toISOString().slice(0, 10) }
  await mkdir(join(root, 'engine-state/shop-lists'), { recursive: true })
  await writeFile(file(root, lang, goods), `${JSON.stringify(list, null, 2)}\n`)
  return list
}

/** The species shops in these languages' countries sell (scientific names, list order, each once): sure enough to rank by. */
export async function shopScientific(root: string, langs: ShopLang[], min = RANK_MIN, goods: ShopGoods = 'fish'): Promise<string[]> {
  const out = new Map<string, string>()
  for (const lang of langs) for (const i of (await readShopList(root, lang, goods))?.items ?? []) {
    if (i.scientificName && i.confidence >= min && !out.has(slugify(i.scientificName))) out.set(slugify(i.scientificName), i.scientificName)
  }
  return [...out.values()]
}

/** Their page ids, in the same order. */
export const shopIds = async (root: string, langs: ShopLang[], goods: ShopGoods = 'fish') => (await shopScientific(root, langs, RANK_MIN, goods)).map(slugify)

/** What the engine fetches new pages for first (wanted.ts): every country's shop species, then the most-kept fish. */
export const popularFirst = async (root: string) => [...new Set([...await shopScientific(root, ['vi', 'id', 'th'], QUEUE_MIN), ...POPULAR])]

/**
 * Shop names onto the language's species pages as other names: only sure mappings, the surest first, at most MAX_NEW a
 * page, and never a name the list gives several species or a group ("Cá pleco" for any pleco, at any confidence), or that
 * another page in the language already uses (it would point readers to the wrong fish).
 */
export async function addShopNames(root: string, lang: ShopLang): Promise<string[]> {
  const list = await readShopList(root, lang)
  if (!list) return []
  const sure = list.items.filter((i): i is ShopItem & { name: string; scientificName: string } => !!i.name && !!i.scientificName && i.confidence >= NAME_MIN && !genusOnly(i.name, i.scientificName))
  const owners = new Map<string, Set<string>>()
  const own = (name: string, who: string) => (owners.get(key(name)) ?? owners.set(key(name), new Set()).get(key(name))!).add(who)
  for (const i of list.items) if (i.name) own(i.name, i.scientificName ? `species:${slugify(i.scientificName)}` : `group:${i.trade}`)
  for (const kind of ['species', 'breeds', 'plants']) for (const id of await readdir(join(root, 'content', kind)).catch(() => [] as string[])) {
    const t = JSON.parse(await readFile(join(root, 'content', kind, id, `${lang}.json`), 'utf8').catch(() => 'null')) as { name: string; altNames: string[] } | null
    if (t) for (const name of [t.name, ...t.altNames]) own(name, `${kind}:${id}`)
  }
  const added: string[] = []
  const byId = new Map<string, string[]>()
  for (const i of [...sure].sort((a, b) => b.confidence - a.confidence)) byId.set(slugify(i.scientificName), [...(byId.get(slugify(i.scientificName)) ?? []), i.name])
  for (const [id, names] of byId) {
    const f = join(root, 'content/species', id, `${lang}.json`)
    const t = JSON.parse(await readFile(f, 'utf8').catch(() => 'null')) as { name: string; altNames: string[] } | null
    if (!t) continue
    const seen = new Set([t.name, ...t.altNames].map(key))
    const add = [...new Set(names)].filter(n => !seen.has(key(n)) && [...owners.get(key(n))!].every(o => o === `species:${id}`)).slice(0, MAX_NEW)
    if (!add.length) continue
    await writeFile(f, `${JSON.stringify({ ...t, altNames: [...t.altNames, ...add] }, null, 2)}\n`)
    added.push(`${id}: ${add.join(', ')}`)
  }
  return added
}
