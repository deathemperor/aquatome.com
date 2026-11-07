import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { LANGS, type Lang } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { mentions, PRODUCTS } from './market'
import { LANG_NAME, type Page, type PageKind } from './pages'
import { PHRASES, phraseQuotes } from './phrases'
import { label, norm, readable, render, RETRACTED } from './reader'

/**
 * Is a page written for its reader? The owner on a guide that sent Vietnamese readers to an American product: "If the vast
 * contents of the product works like that nobody is able to check." So a fixed checklist runs over every page, in two
 * layers: rules with no model for what words can show exactly, and a model that reads the page for what they can't
 * (prompts/fit.md). A model's finding counts only with a quote that is on the page. Whether a product is sold in a market
 * is never the model's call: it names the products, and the market table (market.ts) says.
 */
export const FIT_CHECKS = ['product', 'shop', 'price', 'dose', 'source', 'units', 'words', 'elsewhere'] as const
export type FitCheck = (typeof FIT_CHECKS)[number]
/** What each check came from, so a new complaint about one page has a place to go: a check run over all of them. */
export const FIT_TITLE: Record<FitCheck, string> = {
  product: 'A product shops here may not list',
  shop: 'A foreign shop',
  price: 'A foreign price or shipping cost',
  dose: 'A dose tied to a foreign product',
  source: 'Talk about the source article or video',
  units: 'Imperial units, or a volume that shows it was converted',
  words: 'Words keepers here don\'t use',
  elsewhere: 'Written for a reader who lives elsewhere',
}
export type FitFinding = { check: FitCheck; part: string; quote: string; why: string; product?: string; fix?: string; by: 'rule' | 'model' }
export type FitEntry = { at: string; hash: string; model: string; findings: FitFinding[]; products: string[] }
export type FitState = Record<string, FitEntry>

const COUNTRY: Record<Lang, string> = { vi: 'Vietnam', id: 'Indonesia', th: 'Thailand' }
const TEMPLATE = readFileSync(new URL('./prompts/fit.md', import.meta.url), 'utf8')
export const fitPrompt = (lang: Lang) => TEMPLATE
  .replaceAll('{{COUNTRY}}', COUNTRY[lang]).replaceAll('{{LANG}}', LANG_NAME[lang])
  .replace('{{SHOP_NOTE}}', lang === 'vi' ? '' : ' A Vietnamese chain (Pharmacity) counts too: this reader isn\'t in Vietnam.')
  .replace('{{PRICE_NOTE}}', lang === 'vi' ? '' : ' Vietnamese đồng counts too.')
  .replace('{{WORDS_NOTE}}', PHRASES[lang]?.length ? ` Another check counts these, so leave them out: ${PHRASES[lang]!.map(p => p.say).join(', ')}.` : '')

/** The text a reader gets, in numbered parts, without what comes from elsewhere as it is (photo captions, reference lists). */
export function fitText(p: Page): { parts: { id: string; field: string; text: string }[]; text: string; hash: string } {
  const parts = [
    { id: 'T', field: 'title', text: p.title },
    ...readable(p).map((f, i) => ({ id: `P${i + 1}`, field: f.field, text: render(f.html) })),
    ...p.lines.map((l, i) => ({ id: `L${i + 1}`, field: l.field, text: l.text })),
  ]
  const text = parts.map(x => (x.id === 'T' ? `TITLE: ${x.text}` : `[${x.id} ${label(x.field)}]\n${x.text}`)).join('\n\n')
  return { parts, text, hash: createHash('sha1').update(text).digest('hex').slice(0, 16) }
}

const WORD = (s: string) => `(?<![\\p{L}\\p{N}])(?:${s})(?![\\p{L}\\p{N}])`
const re = (s: string) => new RegExp(s, 'giu')
const AMOUNT = '\\d[\\d.,–-]*\\s*'
/** Amazon the shop, not the river: a sentence buying from it, or its address. */
const FOREIGN_SHOPS = 'petco|petsmart|chewy|walmart|bulk reef supply|king british|big al\'?s|pets at home|aquarium co-?op|ebay|trên amazon|amazon\\.com|(?:mua|beli)[^.\\n]{0,40}amazon'
const SHOP: Record<'vi' | 'other', RegExp> = { vi: re(WORD(FOREIGN_SHOPS)), other: re(`${WORD(`${FOREIGN_SHOPS}|pharmacity|long châu`)}|ซื้อ[^.\\n]{0,40}amazon`) }
const PRICE = [
  re(WORD(`${AMOUNT}(?:USD|US\\$|EUR|euro|đô(?:\\s+la|\\s+Mỹ)?|dollars?|dolar|bảng Anh)`)),
  re(`(?:US\\$|\\$|£|€)\\s?\\d|\\d\\s?(?:\\$|£|€)|(?<!\\d\\s*)${WORD('USD')}|${WORD('vài đô|mấy đô|phí vận chuyển|cước vận chuyển|phí ship|ongkos kirim|ongkir|air freight')}|\\d[\\d.,]*\\s*ดอลลาร์|ค่าส่ง|ค่าขนส่ง`),
]
const PRICE_OTHER = re(WORD(`${AMOUNT}(?:đồng|VND|VNĐ)`))
const SOURCE = re(`${WORD('bài gốc|bài viết gốc|video này|trong video|theo video|kênh này|chúng tôi|artikel asli|video ini|dalam video|kami')}|บทความต้นฉบับ|วิดีโอนี้|ในวิดีโอ|พวกเรา`)
const IMPERIAL = [
  re(WORD(`${AMOUNT}(?:gal|inch(?:es)?|inci|feet|ft|foot|pounds?|lbs?|ounces?|oz|độ F)`)),
  re(`${WORD('gallons?|galon|ga-?\\s?lông')}|แกลลอน|°\\s?F|\\d\\s*นิ้ว`),
]
/** A volume only a conversion from gallons would give. A dose's figures are the dose check's. */
const CONVERTED = re(`(?<![\\d.,])(?:19|38|57|76|114|151|208|284|379)\\s*(?:lít|liter|litre|l|ลิตร)(?![\\p{L}\\p{N}])`)
const PER = /(?:mỗi|cho|trên|per|setiap|untuk|ต่อ|\/)\s*(?:khoảng\s*)?$/iu
const DOSE = re(WORD(`${AMOUNT}(?:ml|gói|viên|thìa|muỗng|giọt|mg|g|nắp|sachet|tablet|butir|ซอง|เม็ด|หยด)`))

/** The products in the table that a reader in this language may not find: hard here, or, with no market data, all of them. */
const foreignIn = (lang: Lang) => PRODUCTS.filter(x => { const s = x.market[lang]?.status; return s === 'hard' || (s === undefined && lang !== 'vi') })
const clip = (s: string) => s.trim().split(/\s+/).slice(0, 20).join(' ')

/** What rules with no model find: exact words, so a count of them needs no sample. */
export function fitRules(p: Page): FitFinding[] {
  const out: FitFinding[] = []
  const say = (check: FitCheck, part: string, quote: string, why: string, extra: Partial<FitFinding> = {}) => out.push({ check, part, quote: clip(quote), why, by: 'rule', ...extra })
  const foreign = foreignIn(p.lang)
  for (const { id, text } of fitText(p).parts) {
    const each = (check: FitCheck, r: RegExp, why: string) => { for (const m of text.matchAll(r)) say(check, id, m[0], why) }
    each('shop', p.lang === 'vi' ? SHOP.vi : SHOP.other, 'names a foreign shop')
    for (const r of PRICE) each('price', r, 'a foreign price or shipping cost')
    if (p.lang !== 'vi') each('price', PRICE_OTHER, 'a price in Vietnamese đồng')
    each('source', SOURCE, 'talks about the source or in its voice')
    for (const r of IMPERIAL) each('units', r, 'an imperial unit')
    for (const m of text.matchAll(CONVERTED)) if (!PER.test(text.slice(Math.max(0, m.index - 24), m.index))) say('units', id, m[0], 'a volume that shows it was converted from gallons')
    for (const x of foreign) if (mentions(x, text)) say('product', id, x.name, x.market[p.lang] ? 'not found at shops here (market.ts)' : 'in the table, market unknown', { product: x.name })
    for (const s of text.split(/(?<=[.!?])\s+|\n/)) {
      const x = foreign.find(y => mentions(y, s))
      if (x && s.match(DOSE)) say('dose', id, s, `a dose tied to ${x.name}`, { product: x.name })
    }
    for (const q of phraseQuotes(text, p.lang)) say('words', id, q.quote, `listed: ${q.instead}`, { fix: q.instead })
  }
  return dedupe(out)
}

const dedupe = (xs: FitFinding[]) => [...new Map(xs.map(f => [`${f.check}|${norm(f.quote)}`, f])).values()]

const MODEL_CHECKS = FIT_CHECKS.filter(c => c !== 'product')
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findings', 'products'],
  properties: {
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['check', 'part', 'quote', 'why', 'fix', 'product'],
        properties: { check: { type: 'string', enum: MODEL_CHECKS }, part: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, fix: { type: 'string' }, product: { type: 'string' } },
      },
    },
    products: { type: 'array', items: { type: 'string' } },
  },
}
type Found = { check: string; part: string; quote: string; why: string; fix?: string; product?: string }

/** A product's row in the table and its status in a language, from a name as a page spells it. */
export const productOf = (name: string, lang: Lang) => {
  const x = PRODUCTS.find(y => new RegExp(y.match.source, 'iu').test(name))
  return x && { name: x.name, status: x.market[lang]?.status ?? ('no data' as const) }
}

/** The model's answer that holds: a known check, a quote on the page, not taken back, and no dose tied to something sold here. */
export function keepFit(found: Found[], text: string, lang: Lang): FitFinding[] {
  const page = norm(text)
  return found
    .filter(f => (MODEL_CHECKS as readonly string[]).includes(f.check) && f.quote?.trim() && f.why?.trim() && !RETRACTED.test(f.why) && page.includes(norm(f.quote)))
    .filter(f => f.check !== 'dose' || !f.product || productOf(f.product, lang)?.status !== 'sold')
    .map(f => ({ check: f.check as FitCheck, part: f.part, quote: f.quote.trim(), why: f.why.trim(), by: 'model' as const, ...(f.product?.trim() ? { product: f.product.trim() } : {}), ...(f.fix?.trim() ? { fix: f.fix.trim() } : {}) }))
}

/** One model reads one page against the checklist. */
export async function readFit(llm: Llm, p: Page, model: string | undefined, now: Date): Promise<FitEntry> {
  const { text, hash } = fitText(p)
  const r = await llm<{ findings: Found[]; products: string[] }>({ system: fitPrompt(p.lang), prompt: text, schema: SCHEMA, ...(model ? { model } : {}) })
  return { at: now.toISOString().slice(0, 10), hash, model: model ?? 'default', findings: keepFit(r.findings ?? [], text, p.lang), products: [...new Set((r.products ?? []).map(x => x.trim()).filter(Boolean))] }
}

/** Everything found on a page: the rules', the model's, and each product the model named that the table says is hard to find here. */
export function fitFindings(p: Page, entry?: FitEntry): FitFinding[] {
  const named = (entry?.products ?? []).flatMap(n => {
    const x = productOf(n, p.lang)
    return x && (x.status === 'hard' || (x.status === 'no data' && p.lang !== 'vi')) ? [{ check: 'product' as const, part: '', quote: x.name, why: x.status === 'hard' ? 'not found at shops here (market.ts)' : 'in the table, market unknown', product: x.name, by: 'model' as const }] : []
  })
  return dedupe([...fitRules(p), ...(entry?.findings ?? []), ...named])
}

/** Product names the table has no row for: what to look up next, with how many pages name each. */
export function uncheckedProducts(pages: Page[], state: FitState, lang: Lang): [string, number][] {
  const n = new Map<string, number>()
  for (const p of pages) if (p.lang === lang) for (const name of new Set((state[fitKey(p)]?.products ?? []).filter(x => !productOf(x, lang)).map(x => x.toLowerCase()))) n.set(name, (n.get(name) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** The pages a model reads. The glossary's are a line each, and the rules alone are enough for them. */
export const FIT_KINDS: readonly PageKind[] = ['guides', 'species', 'plants', 'breeds', 'products', 'equipment']

export const fitKey = (p: Page) => `${p.lang}/${p.kind}/${p.id}`
/** A stable order that isn't the alphabet: a run stopped part way has read a random sample, and its counts can be scaled. */
export const fitOrder = (pages: Page[], seed = 'fit') => [...pages].map(p => [createHash('sha1').update(`${seed}:${fitKey(p)}`).digest('hex'), p] as const).sort((a, b) => a[0].localeCompare(b[0])).map(x => x[1])
export const fitDue = (pages: Page[], state: FitState) => pages.filter(p => state[fitKey(p)]?.hash !== fitText(p).hash)

/** Reads the pages due, a few at a time, saving as it goes. Stops, with what it has, when the accounts are out of their limit. */
export async function runFit(pages: Page[], statePath: string, d: { llm: Llm; model?: string; jobs?: number; limit?: number; now?: () => Date }) {
  const state: FitState = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'))
  const due = fitOrder(fitDue(pages, state)).slice(0, d.limit ?? Infinity)
  const report = { read: 0, failed: [] as string[], stopped: undefined as string | undefined, left: 0 }
  const save = () => writeFile(statePath, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  let next = 0
  await Promise.all(Array.from({ length: d.jobs ?? 2 }, async () => {
    while (next < due.length && !report.stopped) {
      const p = due[next++]!
      try {
        state[fitKey(p)] = await readFit(d.llm, p, d.model, (d.now ?? (() => new Date()))())
        if (++report.read % 10 === 0) await save()
      } catch (e) {
        if (e instanceof LlmError && /limit|rejected|no account/i.test(e.message)) report.stopped = e.message.slice(0, 200)
        else report.failed.push(`${fitKey(p)}: ${(e as Error).message.slice(0, 200)}`)
      }
    }
  }))
  await save()
  report.left = fitDue(pages, state).length
  return { report, state }
}

/** Pages with a finding, by check and in all, for one language. `words` apart: one listed word doesn't make a page wrong for its reader. */
export function fitCounts(pages: Page[], state: FitState, lang: Lang) {
  const mine = pages.filter(p => p.lang === lang && state[fitKey(p)]?.hash === fitText(p).hash)
  const found = mine.map(p => new Set(fitFindings(p, state[fitKey(p)]).map(f => f.check)))
  const by = Object.fromEntries(FIT_CHECKS.map(c => [c, found.filter(s => s.has(c)).length])) as Record<FitCheck, number>
  return { pages: pages.filter(p => p.lang === lang).length, read: mine.length, by, wrongReader: found.filter(s => [...s].some(c => c !== 'words')).length }
}

/** docs/review/fit.md: the counts by language and check. Never a list of pages: nobody can read them all. */
export function fitReport(pages: Page[], state: FitState): string {
  const rows = LANGS.map(lang => ({ lang, ...fitCounts(pages, state, lang) }))
  const head = ['Language', 'Pages', 'Read', 'Wrong for the reader', ...FIT_CHECKS]
  const unchecked = uncheckedProducts(pages, state, 'vi').slice(0, 40)
  return `# Written for the reader

Generated by \`pnpm engine fit\` (\`packages/engine/src/fit.ts\`, checklist in \`src/prompts/fit.md\`). "Wrong for the reader": pages with a
finding on any check but words. Rules run on every page; the model's findings count only on pages it has read as they are now.

| ${head.join(' | ')} |
| ${head.map(() => '---').join(' | ')} |
${rows.map(r => `| ${[LANG_NAME[r.lang], r.pages, r.read, r.wrongReader, ...FIT_CHECKS.map(c => r.by[c])].join(' | ')} |`).join('\n')}

## What each check is

${FIT_CHECKS.map(c => `- ${c}: ${FIT_TITLE[c]}`).join('\n')}

## Products the market table has no row for, Vietnamese pages

${unchecked.map(([n, k]) => `- ${n.replace(/([[\]|*_\`<>\\])/g, '\\$1')}: ${k}`).join('\n') || '- none'}
`
}
