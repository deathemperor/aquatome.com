import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { LANGS, type Lang } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { mentions, PRODUCTS } from './market'
import { LANG_NAME, type Page, type PageKind } from './pages'
import { PHRASES, phraseQuotes } from './phrases'
import { label, norm, readable, render, RETRACTED } from './reader'
import { snapshotName } from './snapshot'

/**
 * Is a page written for its reader? The owner on a guide that sent Vietnamese readers to an American product: "If the vast
 * contents of the product works like that nobody is able to check." So a fixed checklist runs over every page, in two
 * layers: rules with no model for what words can show exactly, and a model that reads the page for what they can't
 * (prompts/fit.md). A model's finding counts only with a quote that is on the page. Whether a product is sold in a market
 * is never the model's call: it names the products, and the market table (market.ts) says.
 */
export const FIT_CHECKS = ['product', 'shop', 'price', 'dose', 'source', 'units', 'words', 'elsewhere', 'dose-purpose', 'dose-conflict', 'dose-caution'] as const
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
  'dose-purpose': 'A dose that doesn\'t say what it\'s for or how to use it',
  'dose-conflict': 'The same treatment, for the same thing, dosed differently on another page',
  'dose-caution': 'A dose without the caution its source gives for shrimp or other sensitive animals',
}
export type FitFinding = { check: FitCheck; part: string; quote: string; why: string; product?: string; fix?: string; by: 'rule' | 'model' }
/** A dose as a page states it. A figure in here is on the page: keepDoses drops one whose figures aren't in its quote. */
export type FitDose = { treatment: string; strength: string; amount: number; amountMax: number; unit: string; per: number; perUnit: string; use: string; method: string; quote: string }
export type FitEntry = {
  at: string; hash: string; model: string; findings: FitFinding[]; products: string[]; doses?: FitDose[]
  /** Doses were read against the page's source: false when it has none kept, so a missing caution can't be told. */
  sourceRead?: boolean
}
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

/** A page with an amount of something per volume, by its words: how a sample finds doses, which are too few at random. */
const PER_VOLUME = re(`\\d[\\d.,]*\\s*(?:ml|mg|g|gói|viên|thìa|muỗng|giọt|sachet|tablet|ซอง|เม็ด|หยด)[^.\\n]{0,40}(?:lít|liter|litre|ลิตร|gallon|galon)`)
export const hasDose = (p: Page) => { PER_VOLUME.lastIndex = 0; return PER_VOLUME.test(fitText(p).text) }

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

/** What the program works out itself, from the table and from `doses`, never the model's word. */
const WORKED_OUT: readonly FitCheck[] = ['product', 'dose-purpose', 'dose-conflict', 'dose-caution']
const MODEL_CHECKS = FIT_CHECKS.filter(c => !WORKED_OUT.includes(c))
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findings', 'products', 'doses'],
  properties: {
    findings: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['check', 'part', 'quote', 'why', 'fix', 'product'],
        properties: { check: { type: 'string', enum: MODEL_CHECKS }, part: { type: 'string' }, quote: { type: 'string' }, why: { type: 'string' }, fix: { type: 'string' }, product: { type: 'string' } },
      },
    },
    products: { type: 'array', items: { type: 'string' } },
    doses: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, required: ['treatment', 'strength', 'amount', 'amountMax', 'unit', 'per', 'perUnit', 'use', 'method', 'quote'],
        properties: { treatment: { type: 'string' }, strength: { type: 'string' }, amount: { type: 'number' }, amountMax: { type: 'number' }, unit: { type: 'string' }, per: { type: 'number' }, perUnit: { type: 'string' }, use: { type: 'string' }, method: { type: 'string' }, quote: { type: 'string' } },
      },
    },
  },
}
const CAUTION = readFileSync(new URL('./prompts/fit-caution.md', import.meta.url), 'utf8')
const CAUTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['cautions'],
  properties: { cautions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['doseQuote', 'sourceQuote', 'animals', 'onPage', 'pageQuote'], properties: { doseQuote: { type: 'string' }, sourceQuote: { type: 'string' }, animals: { type: 'string' }, onPage: { type: 'boolean' }, pageQuote: { type: 'string' } } } } },
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

const figure = (n: number) => String(n).replace('.', ',')
const quoteHas = (quote: string, n: number) => { const q = quote.replace(/\s/g, ''); return q.includes(String(n)) || q.includes(figure(n)) || n === 0 }
/** The doses that hold: on the page, each with its figures in its own words, so no number is the model's. */
export function keepDoses(found: FitDose[], text: string): FitDose[] {
  const page = norm(text)
  return found.filter(d => d.treatment?.trim() && d.quote?.trim() && page.includes(norm(d.quote)) && quoteHas(d.quote, d.amount) && quoteHas(d.quote, d.amountMax) && quoteHas(d.quote, d.per))
    .map(d => ({ ...d, treatment: d.treatment.trim().toLowerCase(), strength: d.strength.replace(/\s/g, ''), quote: d.quote.trim() }))
}

/** Each caution the source gives for a dose that the page leaves out, by quote: the source's words checked against the source. */
export function keepCautions(found: { doseQuote: string; sourceQuote: string; animals: string; onPage: boolean; pageQuote: string }[], text: string, source: string): FitFinding[] {
  const page = norm(text), from = norm(source)
  return found.filter(c => c.doseQuote?.trim() && page.includes(norm(c.doseQuote)) && c.sourceQuote?.trim() && from.includes(norm(c.sourceQuote)))
    .filter(c => !(c.onPage && c.pageQuote?.trim() && page.includes(norm(c.pageQuote))))
    .map(c => ({ check: 'dose-caution' as const, part: '', quote: clip(c.doseQuote), why: `the source warns about ${c.animals}: "${c.sourceQuote.trim()}"`, by: 'model' as const }))
}

/** One model reads one page against the checklist; when the page has doses, against what the page was written from too. */
export async function readFit(llm: Llm, p: Page, model: string | undefined, now: Date, source?: string): Promise<FitEntry> {
  const { text, hash } = fitText(p)
  const r = await llm<{ findings: Found[]; products: string[]; doses?: FitDose[] }>({ system: fitPrompt(p.lang), prompt: text, schema: SCHEMA, ...(model ? { model } : {}) })
  const doses = keepDoses(r.doses ?? [], text)
  const entry: FitEntry = { at: now.toISOString().slice(0, 10), hash, model: model ?? 'default', findings: keepFit(r.findings ?? [], text, p.lang), products: [...new Set((r.products ?? []).map(x => x.trim()).filter(Boolean))], ...(doses.length ? { doses } : {}) }
  if (!doses.length) return entry
  if (!source?.trim()) return { ...entry, sourceRead: false }
  const c = await llm<{ cautions: Parameters<typeof keepCautions>[0] }>({
    system: CAUTION, schema: CAUTION_SCHEMA, ...(model ? { model } : {}),
    prompt: `--- DOSES ---\n${doses.map(d => `- ${d.quote}`).join('\n')}\n\n--- PAGE ---\n${text}\n\n--- SOURCE ---\n${source.slice(0, 40_000)}`,
  })
  return { ...entry, sourceRead: true, findings: [...entry.findings, ...keepCautions(c.cautions ?? [], text, source)] }
}

/** What a page was written from, when it's kept: a section's English, a guide's article or transcript, a topic's facts. */
export async function fitSource(root: string, p: Page): Promise<string> {
  if (p.en && Object.keys(p.en).length) return Object.values(p.en).join('\n')
  if (p.kind !== 'guides' || !p.origin) return ''
  if (p.origin.source === 'aquatome') return readFile(join(root, 'engine-state/topics', `${p.id}.json`), 'utf8').then(t => (JSON.parse(t) as { facts: { fact: string }[] }).facts.map(f => f.fact).join('\n')).catch(() => '')
  return ownSource(root, { id: p.id, source: p.origin.source, sourceUrl: p.origin.url })
}

const TRANSCRIPTS = process.env.TRANSCRIPT_CACHE ?? join(homedir(), '.cache/aquatome/transcripts')
/** A guide's English article, or its video's transcript: the transcripts are on one Mac, and not all of them. */
export async function ownSource(root: string, e: { id: string; source: string; sourceUrl: string }): Promise<string> {
  if (e.source === 'youtube') return readFile(join(TRANSCRIPTS, `${e.id.replace(/^youtube-/, '')}.txt`), 'utf8').catch(() => '')
  return (await readFile(join(root, 'sources', e.source, `${snapshotName(e.sourceUrl)}.md`), 'utf8').catch(() => '')).replace(/^---[\s\S]*?---\s*/, '')
}

/** A dose's rate per litre, in what can be compared: a spoon by its millilitres, a gallon by its litres. */
const SPOON: Record<string, number> = { tablespoon: 15, teaspoon: 5 }
export function doseRate(d: Pick<FitDose, 'amount' | 'amountMax' | 'unit' | 'per' | 'perUnit'>) {
  const litres = /^(?:l|lít|litre|liter)s?$/i.test(d.perUnit) ? d.per : /^gal/i.test(d.perUnit) ? d.per * 3.785 : 0
  if (!litres) return undefined
  const unit = d.unit.toLowerCase()
  const k = SPOON[unit] ?? 1
  return { unit: SPOON[unit] ? 'ml' : unit, low: (d.amount * k) / litres, high: ((d.amountMax || d.amount) * k) / litres }
}
const WITHIN = 0.12
const apart = (a: { low: number; high: number }, b: { low: number; high: number }) => a.low > b.high * (1 + WITHIN) || b.low > a.high * (1 + WITHIN)

export type DoseRow = { key: string; use: string; method: string; unit: string; low: number; high: number; quote: string }
export type DoseGroup = { treatment: string; strength: string; rows: DoseRow[]; conflicts: [string, string][] }
/**
 * Every treatment the pages dose, each with its doses by what they're for. Two pages that give it for the same thing the
 * same way, at rates that can't both be right, are a conflict: flagged, never averaged, and no dose is picked. Doses for
 * different things stand, each page saying which it is. A different strength is a different row: 3% and 35% don't compare.
 */
export function doseGroups(pages: Page[], state: FitState): DoseGroup[] {
  const groups = new Map<string, DoseGroup>()
  for (const p of pages) for (const d of state[fitKey(p)]?.doses ?? []) {
    const r = doseRate(d)
    if (!r) continue
    const id = `${d.treatment}|${d.strength}`
    const g = groups.get(id) ?? { treatment: d.treatment, strength: d.strength, rows: [], conflicts: [] }
    g.rows.push({ key: fitKey(p), use: d.use, method: d.method, unit: r.unit, low: r.low, high: r.high, quote: d.quote })
    groups.set(id, g)
  }
  for (const g of groups.values()) {
    // A page's own levels for one use are one range: a salt guide's first and second levels don't conflict with each other.
    const spans = new Map<string, DoseRow>()
    for (const r of g.rows.filter(x => x.use && x.method)) {
      const k = `${r.key}|${r.use}|${r.method}|${r.unit}`
      const s = spans.get(k)
      spans.set(k, s ? { ...s, low: Math.min(s.low, r.low), high: Math.max(s.high, r.high) } : r)
    }
    const xs = [...spans.values()]
    for (const [i, a] of xs.entries()) for (const b of xs.slice(i + 1)) if (a.use === b.use && a.method === b.method && a.unit === b.unit && apart(a, b)) g.conflicts.push([a.key, b.key])
  }
  return [...groups.values()].sort((a, b) => b.conflicts.length - a.conflicts.length || b.rows.length - a.rows.length || a.treatment.localeCompare(b.treatment))
}

/** Everything found on a page: the rules', the model's, and each product the model named that the table says is hard to find here. */
export function fitFindings(p: Page, entry?: FitEntry): FitFinding[] {
  const named = (entry?.products ?? []).flatMap(n => {
    const x = productOf(n, p.lang)
    return x && (x.status === 'hard' || (x.status === 'no data' && p.lang !== 'vi')) ? [{ check: 'product' as const, part: '', quote: x.name, why: x.status === 'hard' ? 'not found at shops here (market.ts)' : 'in the table, market unknown', product: x.name, by: 'model' as const }] : []
  })
  const unsaid = (entry?.doses ?? []).filter(d => !d.use || !d.method).map(d => ({ check: 'dose-purpose' as const, part: '', quote: clip(d.quote), why: !d.use ? 'doesn\'t say what this dose is for' : 'doesn\'t say how to use this dose', by: 'model' as const }))
  return dedupe([...fitRules(p), ...(entry?.findings ?? []), ...named, ...unsaid])
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
export async function runFit(pages: Page[], statePath: string, d: { llm: Llm; model?: string; jobs?: number; limit?: number; now?: () => Date; root?: string }) {
  const state: FitState = JSON.parse(await readFile(statePath, 'utf8').catch(() => '{}'))
  const due = fitOrder(fitDue(pages, state)).slice(0, d.limit ?? Infinity)
  const report = { read: 0, failed: [] as string[], stopped: undefined as string | undefined, left: 0 }
  const save = () => writeFile(statePath, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`)
  let next = 0
  await Promise.all(Array.from({ length: d.jobs ?? 2 }, async () => {
    while (next < due.length && !report.stopped) {
      const p = due[next++]!
      try {
        state[fitKey(p)] = await readFit(d.llm, p, d.model, (d.now ?? (() => new Date()))(), d.root ? await fitSource(d.root, p) : undefined)
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
  const conflicted = new Set(doseGroups(mine, state).flatMap(g => g.conflicts.flat()))
  const found = mine.map(p => new Set([...fitFindings(p, state[fitKey(p)]).map(f => f.check), ...(conflicted.has(fitKey(p)) ? ['dose-conflict' as const] : [])]))
  const by = Object.fromEntries(FIT_CHECKS.map(c => [c, found.filter(s => s.has(c)).length])) as Record<FitCheck, number>
  const dosed = mine.filter(p => state[fitKey(p)]?.doses?.length)
  return { pages: pages.filter(p => p.lang === lang).length, read: mine.length, by, wrongReader: found.filter(s => [...s].some(c => c !== 'words')).length, dosed: dosed.length, noSource: dosed.filter(p => state[fitKey(p)]?.sourceRead === false).length }
}

const rate = (r: Pick<DoseRow, 'low' | 'high' | 'unit'>) => `${+r.low.toFixed(3)}${r.high > r.low ? `–${+r.high.toFixed(3)}` : ''} ${r.unit}/l`
const doseLine = (g: DoseGroup) => {
  const uses = new Map<string, DoseRow[]>()
  for (const r of g.rows) { const k = `${r.use || 'unsaid'}, ${r.method || 'unsaid'}`; uses.set(k, [...(uses.get(k) ?? []), r]) }
  const each = [...uses].map(([k, rs]) => `${k}: ${[...new Set(rs.map(rate))].join(', ')} (${new Set(rs.map(r => r.key)).size} pages)`)
  return `- ${g.treatment}${g.strength ? ` ${g.strength}` : ''}${g.conflicts.length ? ` — **${g.conflicts.length} conflicts**` : ''}: ${each.join('; ')}`
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

Pages with a dose whose source isn't kept, so a missing caution can't be told: ${rows.map(r => `${LANG_NAME[r.lang]} ${r.noSource} of ${r.dosed}`).join(', ')}.

## Doses on more than one page

Per litre, by what the pages say each is for. A conflict is the same treatment, strength, use and method at rates that can't both be right: flagged, never averaged. A person settles which holds.

${doseGroups(pages, state).filter(g => new Set(g.rows.map(r => `${r.low.toFixed(3)}-${r.high.toFixed(3)}${r.unit}`)).size > 1).slice(0, 40).map(doseLine).join('\n') || '- none'}

## What each check is

${FIT_CHECKS.map(c => `- ${c}: ${FIT_TITLE[c]}`).join('\n')}

## Products the market table has no row for, Vietnamese pages

${unchecked.map(([n, k]) => `- ${n.replace(/([[\]|*_\`<>\\])/g, '\\$1')}: ${k}`).join('\n') || '- none'}
`
}
