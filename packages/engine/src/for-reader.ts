import { readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metricPage, QUALITY_THRESHOLD, TranslationSchema, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { fitFindings, ownSource, productOf, readFit, type FitFinding } from './fit'
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
const GROUNDED = `Below are FACTS and a MARKET table, and a Vietnamese GUIDE written from them. Score 0–1 how well the GUIDE sticks to them: 1.0 = every claim, dose, number, product and piece of advice is supported; lower it for each one that isn't, or that says more than they do ("often used" as "every tank needs"; a schedule, dose or safety claim FACTS give for named products, written for any medicine of that kind), most of all a dose or a safety claim. Converting units and writing in the writer's own words is fine, and so is leaving a fact out, unless it's a warning the reader needs. notes: up to 10 unsupported or wrong claims, or warnings left out, in English, quoting the phrase. List nothing that is supported, and nothing that would merely make the guide more useful. Empty if none. hedges: every fact in FACTS that says how often or how sure (may, might, often, usually, sometimes, a lot of times, likely, probably; can or could only where it means may, as in "bacteria can follow", not where it means is able to, as in "the medicine can only kill adults"), copied exactly, each with the one GUIDE sentence that says that fact, copied exactly ("" if the guide leaves the fact out). unsafe: the numbers (0 for the first) of your notes a reader could harm fish, shrimp, snails or plants by following: a dose, a medicine, a mix of medicines or a schedule FACTS and MARKET don't give for it. [] if none. Reply only with JSON.`
const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['score', 'notes', 'hedges', 'unsafe'],
  properties: {
    score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } }, unsafe: { type: 'array', items: { type: 'integer' } },
    hedges: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['fact', 'quote'], properties: { fact: { type: 'string' }, quote: { type: 'string' } } } },
  },
}

/** How often and how sure, as the facts say it in English (guide-facts.md keeps it word for word)… */
const HEDGE_EN = /\b(?:may|might|can|could|often|usually|typically|generally|sometimes|occasionally|a lot of times|many times|most of the time|in some cases|likely|probably|possibly|tends? to|i think|seems?)\b/i
/** …and as a Vietnamese sentence carries it. "Thường" in "bình thường" is "normal", and "dễ" alone "easy"; "hay" before a word is "often" ("hay vướng") as well as "or", and counts. */
const HEDGE_VI = /(?<!\p{L})(?:có thể|(?<!bình )thường|đôi khi|nhiều khi|có khi|có lúc|lắm lúc|thỉnh thoảng|có lẽ|chắc là|hình như|nghe nói|dễ (?:bị|nhiễm|chết|lây|mắc)|hay(?= \p{L})|tùy|chưa chắc|không phải lúc nào|phần lớn|đa số|hầu hết)(?!\p{L})/iu
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
/**
 * Facts the guide says more surely than they do: "a lot of times a fungal infection means an open wound" written "nấm chỉ
 * mọc trên vết thương hở". The reviewer pairs each hedged fact with the guide's sentence for it; the code holds the pair to
 * the facts and the page (a fact it didn't copy, or a sentence that isn't there, counts for nothing) and decides whether
 * the sentence still says how often or how sure.
 */
export function hedgesLost(pairs: { fact: string; quote: string }[], facts: string[], page: string): { fact: string; quote: string }[] {
  const known = new Set(facts.map(squash)), text = squash(page)
  return pairs.filter(x => x.quote.trim() && known.has(squash(x.fact)) && HEDGE_EN.test(x.fact) && text.includes(squash(x.quote)) && !HEDGE_VI.test(x.quote))
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

const plain = (w: Written) => [w.name, ...w.summary, w.body.replace(/<[^>]+>/g, ' '), ...w.faq.flatMap(f => [f.q, f.a])].join('\n')
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
  const check = async (w: Written) => {
    const clean = { ...w, name: o.name ?? unescapePlain(w.name).trim(), body: sanitizeHtml(w.body) }
    const page = asPage(id, clean)
    // The same checks every page passes (fit.ts), its cautions against the facts and the table the writer had.
    const made = await readFit(d.llm, page, o.fitModel ?? 'opus', o.now?.() ?? new Date(), `${JSON.stringify(facts)}\n${market}`)
    const findings = fitFindings(page, made)
    const wrong = findings.filter(f => f.check !== 'words')
    const outside = amountsOutside(plain(clean), input)
    const r = await d.llm<{ score: number; notes: string[]; hedges?: { fact: string; quote: string }[]; unsafe?: number[] }>({ system: GROUNDED, prompt: `${input}\n\n--- GUIDE ---\n${plain(clean)}`, schema: REVIEW_SCHEMA, model: o.checkModel ?? 'opus' })
    const score = Math.min(1, Math.max(0, Number(r.score) || 0))
    const lost = hedgesLost(r.hedges ?? [], facts.facts.map(f => f.fact), plain(clean))
    // A note a reader could harm fish by following holds the guide back, whatever its score.
    const unsafe = (r.unsafe ?? []).filter(i => r.notes?.[i])
    const notes = [
      ...wrong.map(f => `${f.check}: "${f.quote}": ${f.why}`),
      ...findings.filter(f => f.check === 'words').map(f => `Chữ người chơi ít dùng: "${f.quote}"${f.fix ? ` (${f.fix})` : ''}`),
      ...outside.map(a => `Con số không có trong dữ kiện: ${a}`),
      ...lost.map(h => `Nói chắc hơn dữ kiện: "${h.quote}" (dữ kiện: "${h.fact}"). Giữ đúng mức như dữ kiện: "có thể", "thường", "nhiều khi"…`),
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
