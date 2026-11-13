import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GlossarySchema, metricPage, QUALITY_THRESHOLD, TranslationSchema, type GlossaryEntity, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { VI_STYLE as STYLE } from './phrases'
import { logReviews } from './review-log'
import { withTanks } from './round'
import { sanitizeHtml, unescapePlain } from './sanitize'
import { checkGuide, FACTS_SCHEMA, researchPrompt, viFacts, type TopicFacts, type Written } from './topics'

const WRITE = withTanks(readFileSync(new URL('./prompts/glossary-entry.md', import.meta.url), 'utf8'))
const ENTRY_SCHEMA = {
  type: 'object', required: ['definition', 'altNames', 'body', 'related'],
  properties: { definition: { type: 'string' }, altNames: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, related: { type: 'array', items: { type: 'string' } } },
}
type Entry = { definition: string; altNames: string[]; body: string; related: string[] }

/** Seriously Fish's glossary entry for a term, by its address there: a named source (their permission is on record). */
export const sfGlossaryUrl = (slug: string) => `https://www.seriouslyfish.com/glossary/${slug}`

/**
 * A glossary term's fuller Vietnamese entry, written by AquaTome from web research as its own guides are (topics.ts): the
 * research's cited facts (kept in engine-state/glossary/<id>.json, reused with `reuse`), an entry written from them only
 * (meaning, other names, what it means in a tank and what to do, related terms), checked against them with one rewrite on
 * the checker's notes. `sf`: the term's slug in Seriously Fish's glossary, read first and cited.
 *
 * The entry replaces the old one only at the bar: below it, the term keeps the entry it has, and the report says why.
 * Other names are added only as a source writes them: word for word in the research's facts, never one the writer
 * translated (the Writing Lead, 13 Nov 2026, after the owner found a fern under a translated name). And only when the
 * site can link them safely, as the translations' (localize.ts): several words or an abbreviation, and no other term's.
 */
export async function makeGlossaryEntry(root: string, d: { research: Llm; llm: Llm }, id: string, o: { kind: GuideEntity['kind']; sf?: string; reuse?: boolean; researchModel?: string; writeModel?: string; now?: () => Date }) {
  const dir = join(root, 'content/glossary')
  const read = async <T>(f: string) => JSON.parse(await readFile(f, 'utf8')) as T
  const entity = GlossarySchema.parse(await read(join(dir, id, 'entity.json')))
  const vi = TranslationSchema.parse(await read(join(dir, id, 'vi.json')))
  const factsFile = join(root, 'engine-state/glossary', `${id}.json`)
  const kept = o.reuse ? await read<TopicFacts>(factsFile).catch(() => null) : null
  // The owner, 13 Nov, of driftwood: "all kinds and names named per language", "lũa sa tùng là gì", "full details". A term
  // that comes in kinds is researched kind by kind, each by the name shops here write and its English name.
  const topic = `${vi.name} (${entity.en}) in a freshwater aquarium: what it is, what it does in a tank, how to use or handle it, common mistakes. If it comes in kinds (for driftwood: the woods sold to keepers in Vietnam), each kind sold in Vietnam: the name Vietnamese shops write for it and its English name, each quoted exactly as a source writes it; what it looks like and does in a tank (sinks or floats, tannins, the water's colour and pH, fungus or film); how to prepare it; what goes wrong with it. Start each fact about one kind with that kind's name as its source writes it. Find the Vietnamese names on Vietnamese shops' own websites and in Vietnamese keepers' articles, never on marketplaces (Shopee, Lazada, Tiki) or social networks. Each name for the term itself in a fact of its own (section other), quoted exactly as the source writes it; never a name translated by you`
  const lead = o.sf ? `\n\nRead this glossary entry first and cite it as a reference source: ${sfGlossaryUrl(o.sf)}` : ''
  const researched = kept ?? await d.research<TopicFacts>({ system: 'You research fishkeeping topics carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt({ topic, kind: o.kind }) + lead, schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/glossary'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: 'nothing reliable found' }
  const { facts, refs, sources } = viFacts(researched)
  if (!facts.length) return { id, skipped: 'no cited facts' }

  // The other terms: what `related` may name, and the names an added other name may not take.
  const others: { id: string; name: string; altNames: string[]; definition: string }[] = []
  for (const x of (await readdir(dir)).sort()) {
    if (x === id) continue
    const t = await read<Translation>(join(dir, x, 'vi.json')).catch(() => null)
    if (t) others.push({ id: x, name: t.name, altNames: t.altNames, definition: t.definition ?? '' })
  }
  const forWriter = { term: vi.name, english: entity.en, sources, facts }
  const write = (notes?: string[]) => d.llm<Entry>({
    system: 'You write Vietnamese aquarium glossary entries from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: ENTRY_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- CÁC THUẬT NGỮ KHÁC (id: tên: định nghĩa) ---\n${others.map(x => `${x.id}: ${x.name}: ${x.definition}`).join('\n')}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter)}`,
  })
  const asGuide = (e: Entry): Written => ({ name: vi.name, summary: [e.definition], body: e.body, faq: [] })
  const check = (e: Entry) => checkGuide(d.llm, 'Vietnamese', forWriter, asGuide(e))
  let w = await write()
  let review = await check(w)
  const tries = [review]
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    tries.push(r)
    if (r.score > review.score) { w = again; review = r }
  }
  const now = o.now?.()
  await logReviews(root, 'glossary', { id: `glossary/${id}`, lang: 'vi' }, tries, review.score >= QUALITY_THRESHOLD ? review : undefined, now ? { now } : {})
  if (review.score < QUALITY_THRESHOLD) return { id, skipped: `under the bar: ${review.score}`, notes: review.notes }

  const taken = new Set(others.flatMap(x => [x.name, ...x.altNames]).map(n => n.toLowerCase()))
  const said = facts.map(f => f.fact.toLowerCase()).join('\n')
  const linkable = (n: string) => (/\s/.test(n) || /[A-Z].*[A-Z0-9]|\d/.test(n)) && !taken.has(n.toLowerCase()) && said.includes(n.toLowerCase())
  const own = new Set([vi.name.toLowerCase()])
  const altNames = [...vi.altNames, ...w.altNames.map(n => unescapePlain(n).trim()).filter(linkable)].filter(n => n && !own.has(n.toLowerCase()) && own.add(n.toLowerCase()))
  const ids = new Set(others.map(x => x.id))
  const next: GlossaryEntity = GlossarySchema.parse({ ...entity, refs, related: [...new Set(w.related)].filter(r => ids.has(r)).slice(0, 6) })
  const t = TranslationSchema.parse(metricPage({
    ...vi, altNames, definition: unescapePlain(w.definition).replace(/<[^>]+>/g, '').trim(), body: sanitizeHtml(w.body),
    quality: { score: review.score, indexable: true },
  }, 'vi'))
  await writeFile(join(dir, id, 'entity.json'), `${JSON.stringify(next, null, 2)}\n`)
  await writeFile(join(dir, id, 'vi.json'), `${JSON.stringify(t, null, 2)}\n`)
  return { id, score: review.score, notes: review.notes, refs: refs.length, altNames: altNames.length - vi.altNames.length, related: next.related ?? [] }
}
