import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MarketSchema, ProductSchema, QUALITY_THRESHOLD, slugify, TranslationSchema, type Market, type ProductEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { isMarketplace } from './marketplaces'
import { sanitizeHtml } from './sanitize'

const WRITE = readFileSync(new URL('./prompts/product.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')

type Sourced = { fact: string; source: number }
type Spec = { key: string; value: string; source?: number }
/** What research found about one product: facts in the researcher's own words, each with the index of its source. */
export type Facts = {
  found: boolean
  specs: Spec[]; variants: { name: string; specs: Spec[] }[]
  prices: { shop: string; url: string; variant?: string; vnd: number; source: number }[]
  fits: Sourced[]; usage: Sourced[]; issues: Sourced[]
  alternatives: { brand: string; model: string; why: string }[]
  sources: { url: string; title: string; kind: ProductEntity['sources'][number]['kind'] }[]
}
const sourced = { type: 'array', items: { type: 'object', required: ['fact', 'source'], properties: { fact: { type: 'string' }, source: { type: 'number' } } } }
const specs = { type: 'array', items: { type: 'object', required: ['key', 'value'], properties: { key: { type: 'string' }, value: { type: 'string' }, source: { type: 'number' } } } }
const FACTS_SCHEMA = {
  type: 'object', required: ['found', 'specs', 'variants', 'prices', 'fits', 'usage', 'issues', 'alternatives', 'sources'],
  properties: {
    found: { type: 'boolean' }, specs, variants: { type: 'array', items: { type: 'object', required: ['name', 'specs'], properties: { name: { type: 'string' }, specs } } },
    prices: { type: 'array', items: { type: 'object', required: ['shop', 'url', 'vnd', 'source'], properties: { shop: { type: 'string' }, url: { type: 'string' }, variant: { type: 'string' }, vnd: { type: 'number' }, source: { type: 'number' } } } },
    fits: sourced, usage: sourced, issues: sourced,
    alternatives: { type: 'array', items: { type: 'object', required: ['brand', 'model', 'why'], properties: { brand: { type: 'string' }, model: { type: 'string' }, why: { type: 'string' } } } },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'title', 'kind'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['manufacturer', 'shop', 'review', 'video', 'forum', 'other'] } } } },
  },
}

export type ProductAsk = { brand: string; model: string; category: string; type?: string; kind: string }

const researchPrompt = (a: ProductAsk) => `Research the aquarium product "${a.brand} ${a.model}" (${a.kind}) for a Vietnamese aquarium handbook's buying guide. Use WebSearch and WebFetch.

Collect facts, each pointing at the index of its source in sources[]:
- specs: manufacturer or distributor specifications (power, flow, dimensions, tank size, materials, warranty). key in English ("Flow rate"), value with units as stated.
- variants: the sizes or models in this range and their key specs.
- prices: current prices in VND on Vietnamese aquarium shops' own websites, from at least two different shops when they exist, with the variant each is for and the exact page URL. Never fetch Shopee, Lazada or Tiki pages.
- fits: what tanks, livestock or setups it suits or doesn't, per the sources.
- usage: setup and maintenance facts (installing, priming, first run, cleaning and how often).
- issues: problems hobbyists report in reviews or forums (noise, leaks, durability), and differences between versions.
- alternatives: 2–3 comparable products sold in Vietnam (cheaper or better), and why.
Write every fact briefly in your own words; never copy sentences from a page. Leave out what you couldn't find. found = false if the product doesn't exist or is no longer sold.
sources: url, title, kind (manufacturer, shop, review, video, forum, other).`

/** Facts about a product from the web (manufacturer, Vietnamese shops, reviews). */
export const researchProduct = (research: Llm, a: ProductAsk, model?: string) =>
  research<Facts>({ system: 'You research aquarium products carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a), schema: FACTS_SCHEMA, model })

const digits = (n: number) => String(Math.round(n))
/** "280000" as shops write it: 280.000, 280,000, 280 000, 280k. */
const shown = (n: number) => { const d = digits(n); const g = d.replace(/\B(?=(\d{3})+(?!\d))/g, 'X'); return [d, g.replace(/X/g, '.'), g.replace(/X/g, ','), g.replace(/X/g, ' '), ...(n % 1000 === 0 ? [`${n / 1000}k`] : [])] }

/** A money amount in a note ("previously 180,000₫"): never published unless it went through the price check. */
const MONEY = /\d[\d.,\s]*\s*(?:₫|đ|vnd\b|k\b)/i
/** A price's variant note without money amounts: "M (out of stock; previously 180,000₫)" → "M (out of stock)". */
export function cleanVariant(v?: string): string | undefined {
  if (!v || !MONEY.test(v)) return v
  const out = v.replace(/\(([^)]*)\)/g, (_, inner: string) => { const keep = inner.split(/;\s*/).filter(x => !MONEY.test(x)); return keep.length ? `(${keep.join('; ')})` : '' }).replace(/\s+/g, ' ').trim()
  return out && !MONEY.test(out) ? out : undefined
}

/** Only prices the shop's page actually shows (fetched by us), so a mistaken number never publishes. */
export async function checkPrices(prices: Facts['prices'], get: (url: string) => Promise<string>): Promise<Facts['prices']> {
  const ok: Facts['prices'] = []
  for (const p of prices) {
    if (!/^https:\/\//.test(p.url) || isMarketplace(p.url) || !(p.vnd >= 1000)) continue
    const html = await get(p.url).catch(() => '')
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    // The whole number, not part of a bigger one (450.000 inside 1.450.000).
    if (shown(p.vnd).some(s => new RegExp(`(?<![\\d.,]|\\d )${s.replace(/[.]/g, '\\.')}(?![\\d]|[.,]\\d)`, 'i').test(text))) { const { variant: _v, ...rest } = p; const variant = cleanVariant(p.variant); ok.push(variant ? { ...rest, variant } : rest) }
  }
  return ok
}

const WRITE_SCHEMA = {
  type: 'object', required: ['name', 'summary', 'body', 'faq', 'labels'],
  properties: {
    name: { type: 'string' }, summary: { type: 'array', items: { type: 'string' } }, body: { type: 'string' },
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
    labels: { type: 'object', additionalProperties: { type: 'string' } },
  },
}
type Written = { name: string; summary: string[]; body: string; faq: { q: string; a: string }[]; labels: Record<string, string> }

const GROUNDED = `Below are FACTS gathered about a product and a Vietnamese PAGE written from them. Score 0–1 how well the PAGE sticks to the FACTS: 1.0 = every claim, number and recommendation in the page is supported by the facts; 0.75 = small unsupported generalities; below 0.75 = an invented number, feature, price, comparison or claim, or a fact turned around.
notes: up to 10 unsupported or wrong claims (in English), quoting the phrase. Empty if none.`

/** Research, check prices, write the Vietnamese page from the facts, check the page against the facts; files under content/products/<id>/. */
export async function makeProduct(contentRoot: string, d: { research: Llm; llm: Llm; get: (url: string) => Promise<string>; now: () => Date }, a: ProductAsk, o: { researchModel?: string; writeModel?: string; /** Research kept here (engine-state/products) so a page can be rewritten without searching again. */ factsDir?: string; reuse?: boolean } = {}) {
  const factsFile = o.factsDir && join(o.factsDir, `${slugify(`${a.brand} ${a.model}`)}.json`)
  const kept = o.reuse && factsFile ? JSON.parse(await readFile(factsFile, 'utf8').catch(() => 'null')) as Facts | null : null
  const facts = kept ?? await researchProduct(d.research, a, o.researchModel)
  if (factsFile && !kept) { await mkdir(o.factsDir!, { recursive: true }); await writeFile(factsFile, `${JSON.stringify(facts, null, 2)}\n`) }
  if (!facts.found) return { id: '', skipped: `${a.brand} ${a.model}: not found or no longer sold` }
  const prices = await checkPrices(facts.prices, d.get)
  const factsForWriter = { brand: a.brand, model: a.model, kind: a.kind, specs: facts.specs, variants: facts.variants, fits: facts.fits, usage: facts.usage, issues: facts.issues, alternatives: facts.alternatives }
  // English the page shows as-is (table keys and values, variant names, price notes): the writer gives each a Vietnamese label.
  const shown = [...new Set([...facts.specs, ...facts.variants.flatMap(v => v.specs)].flatMap(s => [s.key, s.value]).concat(facts.variants.map(v => v.name), prices.flatMap(p => (p.variant ? [p.variant] : []))))].filter(x => /[a-z]{3}/.test(x))
  const write = (notes?: string[]) => d.llm<Written>({
    system: 'You write Vietnamese buying guides from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- DỮ KIỆN ---\n${JSON.stringify(factsForWriter, null, 1)}\n\n--- CHUỖI HIỆN TRÊN TRANG ---\n${JSON.stringify(shown, null, 1)}`,
  })
  const check = async (x: Written) => {
    const r = await d.llm<{ score: number; notes: string[] }>({ system: 'You check a page against its facts. Reply only with JSON.', prompt: `${GROUNDED}\n\nFACTS:\n${JSON.stringify(factsForWriter)}\n\nPAGE:\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  }
  let w = await write()
  let review = await check(w)
  // Any claim beyond the facts: one rewrite with the checker's notes; the better-grounded page is kept.
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    if (r.score > review.score) { w = again; review = r }
  }
  const body = sanitizeHtml(w.body)
  // A label must keep every number of the original; otherwise the page shows the original.
  const nums = (x: string) => (x.match(/\d+/g) ?? []).join(',')
  const labels = Object.fromEntries(Object.entries(w.labels ?? {}).filter(([en, vi]) => typeof vi === 'string' && vi.trim() && nums(en) === nums(vi)).map(([en, vi]) => [en, vi.trim()]))
  const score = review.score

  const id = slugify(`${a.brand} ${a.model}`)
  const dir = join(contentRoot, 'products', id)
  const today = d.now().toISOString().slice(0, 10)
  const prev = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as Translation | null
  // Only web links are kept as sources; each spec's source number follows its source to the new position.
  const web = facts.sources.map(s => /^https?:\/\/\S+$/i.test(s.url))
  const cite = (s: Spec): Spec => {
    const { source, ...rest } = s
    return source !== undefined && web[source] ? { ...rest, source: web.slice(0, source).filter(Boolean).length } : rest
  }
  const entity: ProductEntity = ProductSchema.parse({
    id, brand: a.brand, model: a.model, category: a.category, ...(a.type ? { type: a.type } : {}),
    specs: facts.specs.map(cite), variants: facts.variants.map(v => ({ ...v, specs: v.specs.map(cite) })), sources: facts.sources.filter((_, i) => web[i]).map(s => ({ ...s, at: today })), updatedAt: today,
  })
  const vi: Translation = TranslationSchema.parse({
    slug: prev?.slug ?? id, name: w.name.trim(), altNames: [`${a.brand} ${a.model}`], sections: {}, body,
    summary: w.summary.map(s => s.trim()).filter(Boolean), faq: w.faq.filter(f => f.q.trim() && f.a.trim()), labels,
    quality: { score, indexable: score >= QUALITY_THRESHOLD },
  })
  const market: Market = MarketSchema.parse({ currency: 'VND', checkedAt: today, prices: prices.map(p => ({ shop: p.shop, url: p.url, ...(p.variant ? { variant: p.variant } : {}), price: Math.round(p.vnd), at: today })) })
  await mkdir(dir, { recursive: true })
  for (const [f, v] of [['entity.json', entity], ['vi.json', vi], ['vn.json', market]] as const) await writeFile(join(dir, f), `${JSON.stringify(v, null, 2)}\n`)
  return { id, score, notes: review.notes ?? [], prices: `${prices.length}/${facts.prices.length} prices confirmed on the shop page` }
}
