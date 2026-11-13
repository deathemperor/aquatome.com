import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GlossarySchema, metricPage, QUALITY_THRESHOLD, TranslationSchema, type GlossaryEntity, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { VI_STYLE as STYLE } from './phrases'
import { isMarketplace } from './marketplaces'
import { logReviews } from './review-log'
import { withTanks } from './round'
import { sanitizeHtml, unescapePlain } from './sanitize'
import { checkGuide, FACTS_SCHEMA, researchPrompt, viFacts, type TopicFacts, type Written } from './topics'

const WRITE = withTanks(readFileSync(new URL('./prompts/glossary-entry.md', import.meta.url), 'utf8'))
/**
 * What the owner asked of a term, the kinds its entry must cover by name, and the shops' own pages to read for them
 * (glossary-asks.json). The owner, 13 Nov 2026, of driftwood: "lũa sa tùng là gì", "all kinds and names named per
 * language"; the first run of Lũa missed sa tùng, mopani and Malaysian driftwood, and gave one English name in thirteen.
 */
type Asks = { asked?: string[]; kinds?: string[]; shops?: string[] }
const ASKS = JSON.parse(readFileSync(new URL('./glossary-asks.json', import.meta.url), 'utf8')) as Record<string, Asks>
const ENTRY_SCHEMA = {
  type: 'object', required: ['definition', 'altNames', 'body', 'related'],
  properties: { definition: { type: 'string' }, altNames: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, related: { type: 'array', items: { type: 'string' } } },
}
type Entry = { definition: string; altNames: string[]; body: string; related: string[] }

/**
 * The house rules a glossary entry is read against besides its facts (the chief of staff, 14 Nov 2026, of the first Lũa:
 * industrial alcohol on one shop's word, "harmless" beside "toxic", tannins that "soften" water, six "one shop says…,
 * another says…", animals by names our pages don't use). Its notes join the fact check's, for the one rewrite; an entry
 * that still breaks one is not saved.
 */
const RULES = `GLOSSARY RULES. Below are a Vietnamese glossary ENTRY about a fishkeeping term, the FACTS it was written from, the KINDS it must cover, the site's PAGES for the animals and plants the facts name, and the site's other TERMS with their definitions. List every place the ENTRY breaks one of these rules, in English, quoting the Vietnamese phrase:
1. Two statements contradict each other (for example "tannins do not harm fish" and "the water turns toxic").
2. A chemical (alcohol, bleach, hydrogen peroxide, an acid, a dye) is advised for wood, rock or decor on one shop's word. It needs a second source that is not a shop, or the source's own caution and a thorough rinse. Industrial alcohol is never advised.
3. A word is used against a TERM's definition: tannins that lower pH a little do not soften water (hardness is GH and KH), and so on.
4. The remark that sources or shops disagree appears more than once. It should be said once, with what the keeper can do about it.
5. A kind in KINDS that the FACTS describe is missing; a kind is without the English name the FACTS give it; an English name is given that the FACTS don't give.
6. An animal or plant in PAGES is called by a name that line doesn't list.
Reply {"notes": [...]}, empty if the entry keeps every rule.`
const RULES_SCHEMA = { type: 'object', required: ['notes'], properties: { notes: { type: 'array', items: { type: 'string' } } } }

/**
 * The site's pages for the animals and plants a text names: a page one of whose names of two words or more (its own, its
 * scientific name, its other names, English ones among them) the text writes whole, a plural too ("bristlenose plecos"),
 * and the two fullest pages of a genus the text names alone ("Otocinclus"). Each line is the page's name, then other names
 * it goes by: the writer writes one of them, and the site links it.
 */
export async function pageNames(root: string, text: string): Promise<string[]> {
  const lower = text.toLowerCase()
  const genera = new Set(text.match(/\b[A-Z][a-z]{4,}\b/g) ?? [])
  const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const named = (n: string) => n.trim().includes(' ') && lower.includes(n.toLowerCase()) && new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.trim())}(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu').test(text)
  const out = new Set<string>()
  const byGenus = new Map<string, { line: string; size: number }[]>()
  for (const kind of ['species', 'plants']) {
    const base = join(root, 'content', kind)
    for (const x of await readdir(base).catch(() => [] as string[])) {
      const v = await readFile(join(base, x, 'vi.json'), 'utf8').then(JSON.parse).catch(() => null) as { name: string; altNames?: string[] } | null
      const e = await readFile(join(base, x, 'entity.json'), 'utf8').then(JSON.parse).catch(() => null) as { scientificName?: string } | null
      if (!v?.name) continue
      const names = [v.name, ...(e?.scientificName ? [e.scientificName] : []), ...(v.altNames ?? [])]
      const line = names.slice(0, 6).join(' | ')
      if (names.some(named)) out.add(line)
      const genus = e?.scientificName?.split(' ')[0]
      if (genus && genera.has(genus)) byGenus.set(genus, [...(byGenus.get(genus) ?? []), { line, size: JSON.stringify(v).length }])
    }
  }
  for (const ps of byGenus.values()) for (const p of ps.sort((a, b) => b.size - a.size).slice(0, 2)) out.add(p.line)
  return [...out].slice(0, 30)
}

/** Seriously Fish's glossary entry for a term, by its address there: a named source (their permission is on record). */
export const sfGlossaryUrl = (slug: string) => `https://www.seriouslyfish.com/glossary/${slug}`

const SOCIAL = ['facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'tiktok.com']
/**
 * A page that is never a source: a marketplace's (reached only through its affiliate API) or a social network's. Research
 * can cite one it found through search without fetching it (the Site Lead, 13 Nov 2026), likeliest for the kinds shops
 * sell.
 */
export function offLimits(url: string): boolean {
  if (isMarketplace(url)) return true
  const u = new URL(url)
  const h = u.hostname.toLowerCase()
  return SOCIAL.some(d => h === d || h.endsWith(`.${d}`)) || (/(^|\.)youtube\.com$/.test(h) && u.pathname.startsWith('/shorts'))
}

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
  const asks = ASKS[id] ?? {}
  const topic = `${vi.name} (${entity.en}) in a freshwater aquarium: what it is, what it does in a tank, how to use or handle it, common mistakes. If it comes in kinds (for driftwood: the woods sold to keepers in Vietnam), each kind sold in Vietnam: the name Vietnamese shops write for it and its English name, each quoted exactly as a source writes it; what it looks like and does in a tank (sinks or floats, tannins, the water's colour and pH, fungus or film); how to prepare it; what goes wrong with it. Start each fact about one kind with that kind's name as its source writes it. Find the Vietnamese names on Vietnamese shops' own websites and in Vietnamese keepers' articles, never on marketplaces (Shopee, Lazada, Tiki) or social networks. Each name for the term itself in a fact of its own (section other), quoted exactly as the source writes it; never a name translated by you`
  const lead = o.sf ? `\n\nRead this glossary entry first and cite it as a reference source: ${sfGlossaryUrl(o.sf)}` : ''
  // The kinds the owner named, by name: each found where a source we may use writes it, its English trade name only as a
  // source writes it, and an honest line when no such source says what it is.
  const cover = asks.kinds?.length ? `\n\nThe owner asked: ${(asks.asked ?? []).map(a => `"${a}"`).join(', ')}. Cover each of these kinds by name, in facts of their own: ${asks.kinds.join('; ')}. For each: what Vietnamese shops call it, as their own pages write it; its English trade name, only as an English-language shop or keeper writes it, in a fact that names both; what it is and what it does in a tank. For every other kind you list, look for its English trade name too. If no source you may use says what one of them is, add one fact (section other) saying only what a shop's own page sells under that name.${asks.shops?.length ? ` Read these shops' own pages for them first: ${asks.shops.join(', ')}.` : ''}` : ''
  const researched = kept ?? await d.research<TopicFacts>({ system: 'You research fishkeeping topics carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt({ topic, kind: o.kind }) + lead + cover, schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/glossary'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: 'nothing reliable found' }
  // Such a page goes, with the facts that cite it, before the writer sees them: no address, no source (viFacts).
  const { facts, refs, sources } = viFacts({ ...researched, sources: researched.sources.map(x => (offLimits(x.url) ? { ...x, url: '' } : x)) })
  if (!facts.length) return { id, skipped: 'no cited facts' }

  // The other terms: what `related` may name, and the names an added other name may not take.
  const others: { id: string; name: string; altNames: string[]; definition: string }[] = []
  for (const x of (await readdir(dir)).sort()) {
    if (x === id) continue
    const t = await read<Translation>(join(dir, x, 'vi.json')).catch(() => null)
    if (t) others.push({ id: x, name: t.name, altNames: t.altNames, definition: t.definition ?? '' })
  }
  const forWriter = { term: vi.name, english: entity.en, sources, facts }
  const pages = await pageNames(root, facts.map(f => f.fact).join('\n'))
  const terms = others.map(x => `${x.id}: ${x.name}: ${x.definition}`).join('\n')
  const kinds = asks.kinds?.length ? `\n\n--- LOẠI CẦN CÓ ---\n${asks.kinds.join('\n')}\n\n--- NGƯỜI ĐỌC ĐÃ HỎI ---\n${(asks.asked ?? []).join('\n')}` : ''
  const write = (notes?: string[]) => d.llm<Entry>({
    system: 'You write Vietnamese aquarium glossary entries from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: ENTRY_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện hoặc phạm quy tắc. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}${kinds}\n\n--- TRANG CỦA AQUATOME (tên trang | tên khác) ---\n${pages.join('\n')}\n\n--- CÁC THUẬT NGỮ KHÁC (id: tên: định nghĩa) ---\n${terms}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter)}`,
  })
  const asGuide = (e: Entry): Written => ({ name: vi.name, summary: [e.definition], body: e.body, faq: [] })
  const rules = async (e: Entry) => (await d.llm<{ notes?: string[] }>({
    system: 'You check a Vietnamese glossary entry against house rules. Reply only with JSON.', model: 'opus', schema: RULES_SCHEMA,
    prompt: `${RULES}\n\n--- KINDS ---\n${(asks.kinds ?? []).join('\n') || '(none named)'}\n\n--- PAGES ---\n${pages.join('\n') || '(none)'}\n\n--- TERMS ---\n${terms}\n\n--- FACTS ---\n${JSON.stringify(forWriter)}\n\n--- ENTRY ---\n${JSON.stringify(e)}`,
  })).notes ?? []
  const check = async (e: Entry) => {
    const [g, r] = await Promise.all([checkGuide(d.llm, 'Vietnamese', forWriter, asGuide(e)), rules(e)])
    return { score: g.score, notes: [...g.notes, ...r], broken: r.length }
  }
  const passes = (r: { score: number; broken: number }) => r.score >= QUALITY_THRESHOLD && !r.broken
  let w = await write()
  let review = await check(w)
  const tries = [review]
  if (!passes(review) || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    tries.push(r)
    // The one that keeps more of the rules, then the better grounded.
    if (r.broken < review.broken || (r.broken === review.broken && r.score > review.score)) { w = again; review = r }
  }
  const now = o.now?.()
  await logReviews(root, 'glossary', { id: `glossary/${id}`, lang: 'vi' }, tries, passes(review) ? review : undefined, now ? { now } : {})
  if (!passes(review)) return { id, skipped: review.broken ? `breaks the rules: ${review.broken}` : `under the bar: ${review.score}`, notes: review.notes }

  const taken = new Set(others.flatMap(x => [x.name, ...x.altNames]).map(n => n.toLowerCase()))
  // Written whole in one fact, as its own word: "gỗ lũ" is not in "gỗ lũa".
  const quoted = (n: string) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')
    return facts.some(f => re.test(f.fact))
  }
  const linkable = (n: string) => (/\s/.test(n) || /[A-Z].*[A-Z0-9]|\d/.test(n)) && !taken.has(n.toLowerCase()) && quoted(n)
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
