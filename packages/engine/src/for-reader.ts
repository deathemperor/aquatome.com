import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { fitFindings, ownSource, productOf, readFit, type FitFinding } from './fit'
import { hedged, hedgesLost, text } from './hedges'
import { marketFor, type ProblemId } from './market'
import type { Page } from './pages'
import { VI_STYLE } from './phrases'
import { plainParts, sanitizeHtml, unescapePlain } from './sanitize'

/**
 * A guide written for its reader. Translating a foreign article and patching it after keeps it written for someone else:
 * its products, its shops, its gallons, its sentences. So the source goes through a list of facts the writer works from
 * alone, the market table says what can be bought here, and what comes out passes the same checks every page does
 * (fit.ts) and says nothing more surely than its facts (hedgesLost), one more try with their notes, or it isn't kept.
 */
const FACTS = readFileSync(new URL('./prompts/guide-facts.md', import.meta.url), 'utf8')
const WRITE = readFileSync(new URL('./prompts/guide-write.md', import.meta.url), 'utf8')
const PROBLEM_IDS = ['ich', 'fungus', 'finRot', 'quarantine', 'cyanobacteria', 'parasites'] as const
const SECTIONS = ['what', 'signs', 'causes', 'firstAid', 'treatment', 'steps', 'prevention', 'mistakes', 'myths', 'other'] as const

export type GuideFacts = {
  topic: string
  facts: { section: (typeof SECTIONS)[number]; fact: string }[]
  products: { name: string; for: string; ingredient: string; dose: string }[]
  problems: ProblemId[]
}
const FACTS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['topic', 'facts', 'products', 'problems'],
  properties: {
    topic: { type: 'string' },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'fact'], properties: { section: { type: 'string', enum: SECTIONS }, fact: { type: 'string' } } } },
    products: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'for', 'ingredient', 'dose'], properties: { name: { type: 'string' }, for: { type: 'string' }, ingredient: { type: 'string' }, dose: { type: 'string' } } } },
    problems: { type: 'array', items: { type: 'string', enum: PROBLEM_IDS } },
  },
}
type Written = { name: string; summary: string[]; body: string; faq: { q: string; a: string }[] }
const WRITE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name', 'summary', 'body', 'faq'],
  properties: { name: { type: 'string' }, summary: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, faq: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } } },
}
const GROUNDED = `Below are FACTS and a MARKET table, and a Vietnamese GUIDE written from them. Score 0–1 how well the GUIDE sticks to them: 1.0 = every claim, dose, number, product and piece of advice is supported; lower it for each one that isn't, or that says more than they do ("often used" as "every tank needs"; a schedule, dose or safety claim FACTS give for named products, written for any medicine of that kind), most of all a dose or a safety claim. Converting units and writing in the writer's own words is fine, and so is leaving a fact out, unless it's a warning the reader needs. notes: up to 10 unsupported or wrong claims, or warnings left out, in English, quoting the phrase. List nothing that is supported, and nothing that would merely make the guide more useful. Empty if none. hedges: go through every line of HEDGED FACTS, the facts a program found a word of how often or how sure in. For each whose word means that (may, might, often, usually, sometimes, a lot of times, likely, probably; can or could only where it means may, as in "bacteria can follow", not where it means is able to, as in "the medicine can only kill adults"), give the fact copied exactly, with one pair for each GUIDE sentence that says that fact (in the summary, a section's first lines, the body or the questions), each copied exactly, or one pair with "" if the guide leaves the fact out. unsafe: the numbers (0 for the first) of your notes a reader could harm fish, shrimp, snails or plants by following: a dose, a medicine, a mix of medicines or a schedule FACTS and MARKET don't give for it. [] if none. Reply only with JSON.`
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['score', 'notes', 'hedges', 'unsafe'],
  properties: {
    score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } }, unsafe: { type: 'array', items: { type: 'integer' } },
    hedges: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['fact', 'quote'], properties: { fact: { type: 'string' }, quote: { type: 'string' } } } },
  },
}

/** The amounts in a text, as numbers with their units: what a guide may not make up. */
const AMOUNTS = /(\d+(?:[.,]\d+)?)\s*(ml|mg|g|lít|l|gói|viên|thìa|muỗng|giọt|nắp|%|ppm|ngày|tuần|giờ|phút)(?![\p{L}\p{N}])/giu
const amounts = (s: string) => [...s.matchAll(AMOUNTS)].map(m => `${m[1]!.replace(',', '.')} ${m[2]!.toLowerCase().replace(/^lít$/, 'l')}`)
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
/**
 * Amounts with a figure neither the facts nor the market table has. A source's "three days" is the guide's "3 ngày", and
 * its "10 gallons" a tank of 40 litres, so a volume within 10% of a gallon figure passes. A dose has no such room: it comes
 * with its source's own figure, or it reads "theo hướng dẫn trên nhãn", and the reviewer sees it.
 */
export function amountsOutside(text: string, allowed: string): string[] {
  const figures = new Set([...allowed.matchAll(/\d+(?:[.,]\d+)?/g)].map(m => m[0].replace(',', '.')))
  for (const [i, w] of WORDS.entries()) if (new RegExp(`\\b${w}\\b`, 'i').test(allowed)) figures.add(String(i))
  const gallons = [...allowed.matchAll(/(\d+(?:[.,]\d+)?)[\s-]*gal/gi)].map(m => Number(m[1]!.replace(',', '.')) * 3.785)
  if (/\bper gallon\b|\ba gallon\b/i.test(allowed)) gallons.push(3.785)
  const near = (l: number) => gallons.some(g => Math.abs(g - l) <= g * 0.1)
  return [...new Set(amounts(text))].filter(a => { const [n, u] = a.split(' '); return !figures.has(n!) && !(u === 'l' && near(Number(n))) })
}

/** As the reviewer reads it: the body as hedgesLost reads it too, so a quote of it is found. */
const plain = (w: Written) => [w.name, ...w.summary, text(w.body), ...w.faq.flatMap(f => [f.q, f.a])].join('\n')
/** The same with the body's markup, for what reads its lists (hedgesLost). */
const marked = (w: Written) => [w.name, ...w.summary, w.body, ...w.faq.flatMap(f => [f.q, f.a])].join('\n')
const asPage = (id: string, w: Written): Page => ({
  lang: 'vi', kind: 'guides', id, title: w.name, path: `/vi/huong-dan/${id}/`, fields: [{ field: 'body', html: w.body }],
  lines: [...w.summary.map((s, i) => ({ field: `summary.${i}`, text: s })), ...w.faq.flatMap((f, i) => [{ field: `faq.${i}.q`, text: f.q }, { field: `faq.${i}.a`, text: f.a }])],
  captions: [], latinNames: [], card: [],
})

/**
 * A product's dose reaches the writer only when the table says the product is sold here. Otherwise a writer told to name the
 * ingredient turns "10 ml of this brand" into "10 ml of erythromycin", at a strength no reader can buy: the code stops
 * that, since a line in a prompt didn't.
 */
export const forWriter = (products: GuideFacts['products']) => products.map(x => (productOf(x.name, 'vi')?.status === 'sold' ? x : { ...x, dose: '' }))

export type ForReader = { written: Written; facts: GuideFacts; market: string; score: number; notes: string[]; findings: FitFinding[]; tries: number; kept: boolean }

/**
 * A Vietnamese guide from its source's text. `voice`: another voice's rules, tried on the side before the owner picks one.
 * `name`: a title the owner fixed (nameFixed), which the guide keeps and calls its subject by.
 */
export async function writeForReader(d: { llm: Llm }, id: string, source: string, o: { factsModel?: string; writeModel?: string; checkModel?: string; fitModel?: string; voice?: string; name?: string; now?: () => Date } = {}): Promise<ForReader> {
  const facts = await d.llm<GuideFacts>({ system: FACTS, prompt: source.slice(0, 120_000), schema: FACTS_SCHEMA, model: o.factsModel ?? 'sonnet' })
  const market = marketFor('vi', facts.products.map(x => x.name).join('\n'), facts.problems)
  const input = `--- DỮ KIỆN ---\n${JSON.stringify({ topic: facts.topic, facts: facts.facts, products: forWriter(facts.products) }, null, 1)}\n\n--- THỊ TRƯỜNG ---\n${market}`
  const write = (notes: string[] = [], draft?: Written) => d.llm<Written>({
    system: 'Bạn viết bài hướng dẫn cá cảnh bằng tiếng Việt. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: [WRITE, VI_STYLE, ...(o.voice ? [`Giọng của bài này:\n${o.voice}`] : []), ...(o.name ? [`Tiêu đề bài đã chốt: "${o.name}". Giữ đúng tiêu đề này, và trong bài gọi thứ tiêu đề nói tới bằng đúng tên trong đó.`] : []), ...(draft ? [`Bản nháp dưới đây bị trả lại vì các lý do sau. Sửa đúng những chỗ đó, bỏ điều dữ kiện không có, giữ nguyên mọi câu khác:\n${notes.map(n => `- ${n}`).join('\n')}\n\n--- BẢN NHÁP ---\n${JSON.stringify(draft)}`] : []), input].join('\n\n'),
  })
  // The facts that hedge, listed by the code: a reviewer asked to find them itself missed some ("can", "a lot of times").
  const hedgedFacts = facts.facts.map(f => f.fact).filter(hedged).map(f => `- ${f}`).join('\n')
  const check = async (w: Written) => {
    const clean = { ...w, name: o.name ?? unescapePlain(w.name).trim(), body: sanitizeHtml(w.body) }
    const page = asPage(id, clean)
    // The same checks every page passes (fit.ts), its cautions against the facts and the table the writer had.
    const made = await readFit(d.llm, page, o.fitModel ?? 'opus', o.now?.() ?? new Date(), `${JSON.stringify(facts)}\n${market}`)
    const findings = fitFindings(page, made)
    const wrong = findings.filter(f => f.check !== 'words')
    const outside = amountsOutside(plain(clean), input)
    const r = await d.llm<{ score: number; notes: string[]; hedges?: { fact: string; quote: string }[]; unsafe?: number[] }>({ system: GROUNDED, prompt: `${input}\n\n--- HEDGED FACTS ---\n${hedgedFacts || '(none)'}\n\n--- GUIDE ---\n${plain(clean)}`, schema: REVIEW_SCHEMA, model: o.checkModel ?? 'opus' })
    const score = Math.min(1, Math.max(0, Number(r.score) || 0))
    const lost = hedgesLost((r.hedges ?? []).map(h => ({ from: h.fact, to: h.quote })), facts.facts.map(f => f.fact).join('\n'), marked(clean))
    // A note a reader could harm fish by following holds the guide back, whatever its score.
    const unsafe = (r.unsafe ?? []).filter(i => r.notes?.[i])
    const notes = [
      ...wrong.map(f => `${f.check}: "${f.quote}": ${f.why}`),
      ...findings.filter(f => f.check === 'words').map(f => `Chữ người chơi ít dùng: "${f.quote}"${f.fix ? ` (${f.fix})` : ''}`),
      ...outside.map(a => `Con số không có trong dữ kiện: ${a}`),
      ...lost.map(h => `Nói chắc hơn dữ kiện: "${h.to}" (dữ kiện: "${h.from}"). Giữ đúng mức như dữ kiện: "có thể", "thường", "nhiều khi"…`),
      ...(r.notes ?? []),
    ]
    return { written: clean, findings, score, notes, ok: !wrong.length && !outside.length && !lost.length && !unsafe.length && score >= QUALITY_THRESHOLD }
  }
  // A draft with notes goes back once to mend those sentences. Writing it afresh only swapped one run's slips for another's.
  let best = await check(await write())
  let tries = 1
  if (!best.ok || best.notes.length) {
    const again = await check(await write(best.notes, best.written))
    tries = 2
    if (again.ok ? !best.ok || again.score >= best.score : !best.ok && again.score >= best.score) best = again
  }
  return { written: best.written, facts, market, score: best.score, notes: best.notes, findings: best.findings, tries, kept: best.ok }
}

/**
 * What a guide is written from: its English article, its video's transcript, or, where neither is kept, the guide as it
 * stands, which its reviewer held to them when it was written.
 */
export async function sourceOf(root: string, e: Pick<GuideEntity, 'id' | 'source' | 'sourceUrl'>, vi: Pick<Translation, 'name' | 'body' | 'summary' | 'faq'>): Promise<string> {
  const own = await ownSource(root, e)
  return own.trim() ? own : plain({ name: vi.name, summary: vi.summary ?? [], body: vi.body ?? '', faq: vi.faq ?? [] })
}

/** Writes one guide again for its reader, in the file a build reads, when it passes. A guide a person fixed stays, unless `force`. */
export async function rewriteForReader(root: string, id: string, d: { llm: Llm }, o: Parameters<typeof writeForReader>[3] & { force?: boolean } = {}) {
  const dir = join(root, 'content/guides', id)
  const entity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')) as GuideEntity
  const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation
  if (vi.bodyFixed && !o.force) return { id, skipped: 'a person fixed its text' }
  const source = await sourceOf(root, entity, vi)
  if (!source.trim()) return { id, skipped: 'no source kept' }
  const r = await writeForReader(d, id, source, { ...o, ...(vi.nameFixed ? { name: vi.name } : {}) })
  if (r.kept) {
    const { bodyFixed: _f, localNote: _n, ...rest } = vi
    const out = TranslationSchema.parse(metricPage({ ...rest, name: r.written.name, body: r.written.body, ...plainParts(r.written.summary, r.written.faq), quality: { score: r.score, indexable: true } }, 'vi'))
    await writeFile(join(dir, 'vi.json'), `${JSON.stringify(out, null, 2)}\n`)
  }
  return { id, ...r }
}
