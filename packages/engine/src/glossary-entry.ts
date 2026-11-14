import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GlossarySchema, metricPage, QUALITY_THRESHOLD, TranslationSchema, type GlossaryEntity, type GuideEntity, type Translation } from '@aq/schema'
import type { Llm } from './claude'
import { VI_STYLE as STYLE } from './phrases'
import { isMarketplace } from './marketplaces'
import { logReviews, readReviews } from './review-log'
import { withTanks } from './round'
import { sanitizeHtml, unescapePlain } from './sanitize'
import { checkSentences, rewordLoose, stopNote } from './glossary-facts'
import { genera, judgeKindNames, kindNames } from './glossary-names'
import { FACTS_SCHEMA, researchPrompt, viFacts, type TopicFacts } from './topics'

const WRITE = withTanks(readFileSync(new URL('./prompts/glossary-entry.md', import.meta.url), 'utf8'))
/**
 * What the owner asked of a term, the kinds its entry must cover by name, and the shops' own pages to read for them
 * (glossary-asks.json). The owner, 13 Nov 2026, of driftwood: "lũa sa tùng là gì", "all kinds and names named per
 * language"; the first run of Lũa missed sa tùng, mopani and Malaysian driftwood, and gave one English name in thirteen.
 */
type Asks = {
  asked?: string[]
  /** The kinds sold in Vietnam: first in the entry, and in detail. */
  local?: string[]
  /** The names a keeper meets on a foreign listing: after, each with whether shops here sell it and under what name. */
  foreign?: string[]
  /** What else the entry must find out, if a page says it. */
  also?: string[]
  /** Pages to read (again: a top-up keeps what they said before) and the shops whose own pages to read. */
  read?: string[]
  shops?: string[]
  /**
   * How this term's entry is to say what it says, from a reader's read of a draft (the chief of staff, 14 Nov 2026, of
   * Lũa's fifth: boiling and rot each once, what to leave out): the writer follows each line, and the rules check reads it.
   */
  write?: string[]
  /**
   * A term without kinds whose facts hold more than the 400 words carry: its own length, with the reason. The chief of staff,
   * 14 Nov 2026: pH 600; up to 600 set by the Glossary Lead before a term's first run, listed in the day's report; past
   * 600 is the chief of staff's word.
   */
  length?: { words: number; why: string }
}
const ASKS = JSON.parse(readFileSync(new URL('./glossary-asks.json', import.meta.url), 'utf8')) as Record<string, Asks>
const ENTRY_SCHEMA = {
  type: 'object', required: ['definition', 'altNames', 'body', 'related'],
  properties: { definition: { type: 'string' }, altNames: { type: 'array', items: { type: 'string' } }, body: { type: 'string' }, related: { type: 'array', items: { type: 'string' } } },
}
type Entry = { definition: string; altNames: string[]; body: string; related: string[] }

/**
 * The house rules a glossary entry is read against besides its facts (the chief of staff, 14 Nov 2026, of the first Lũa:
 * industrial alcohol on one shop's word, "harmless" beside "toxic", tannins that "soften" water, six "one shop says…,
 * another says…", animals by names our pages don't use). Its notes join the fact check's, for the rewrites; an entry
 * that still breaks one is not saved.
 */
const RULES = `GLOSSARY RULES. Below are a Vietnamese glossary ENTRY about a fishkeeping term, the FACTS it was written from, the KINDS it must cover, the site's PAGES for the animals and plants the facts name, and the site's other TERMS with their definitions. List every place the ENTRY breaks one of these rules, in English, quoting the Vietnamese phrase:
1. Two statements contradict each other (for example "tannins do not harm fish" and "the water turns toxic").
2. A chemical (alcohol, bleach, hydrogen peroxide, an acid, a dye) is advised for wood, rock or decor on one shop's word. It needs a second source that is not a shop, or the source's own caution and a thorough rinse. Industrial alcohol is never advised.
3. A word is used against a TERM's definition: tannins that lower pH a little do not soften water (hardness is GH and KH), and so on.
4. A thing is said in more than one place (a step such as boiling, a warning such as rot, a number): it should be said once, in one place. Or the remark that sources or shops disagree appears more than once, or another line takes a side on what it says they disagree on: it should be said once, with what the keeper can do about it only where the FACTS say what to do; where they don't, it is said once and left (about one kind alone, in that kind's item). Never ask for advice the FACTS don't give.
5. A kind in KINDS that the FACTS describe is missing; a kind is without the English name the FACTS give it; an English name is given that the FACTS don't give.
6. An animal or plant in PAGES is called by anything but its page's name, the first name on its line. One with no line in PAGES, or a group of them (a genus, "plecos", "pencilfish"), is called by anything but its scientific name as the FACTS write it: an English name, or a Vietnamese name the writer made up. Case doesn't count: mid-sentence a page's name starts in lower case like any common noun ("như cá neon vua"). A name under KIND WORDS (a kind word before a scientific name, already checked against the site's table of kind words) keeps this rule: don't note it. When you note this rule, quote the name itself first, as Rule 6: "<the name>" in "<the sentence>": …, one note for each name.
7. The kinds sold in Vietnam (KINDS, local) don't come first, or one says less than the FACTS give while a foreign name gets more. A kind's item isn't in this order, where the FACTS say these: what it is, how it looks, whether it sinks and colours the water, what it is used for, then its other names (a remark that no English name was found goes last). A kind's own key facts (it sinks at once, it colours the water for long) sit elsewhere and not in its item.
8. A brand or a product's name (a maker's, as in "Zoo Med Mopani"), where the kind's name is enough.
9. A remark on safety that leaves a keeper unsure whether to use it in a tank ("the leaves are poisonous, the wood less so"), where the FACTS say how it is used in tanks.
10. A comparison the FACTS don't make ("it lowers pH more than other woods").
11. "Rêu" (moss) is used for algae, which is "tảo", as the TERMS have it.
12. A line under THIS TERM is not followed.
Start each note with the number of the rule it breaks, as "Rule 4: …" or "Rules 4 and 12: …". Reply {"notes": [...]}, empty if the entry keeps every rule.`
const RULES_SCHEMA = { type: 'object', required: ['notes'], properties: { notes: { type: 'array', items: { type: 'string' } } } }

/** The house rules a note says the entry breaks ("Rule 4: …", "Rules 4 and 12: …"); none for a fact or length note. */
export const ruleNumbers = (note: string) => [...(/^Rules?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)\s*:/i.exec(note)?.[1] ?? '').matchAll(/\d+/g)].map(m => Number(m[0]))
const isLength = (note: string) => /^(The entry is|An item is) \d+ words/.test(note)

/** A draft the step kept, unsaved: its fact score, its notes (the fact check's first, then the rules', then length's), how many of them stop a save. */
export type Draft = { score: number; broken: number; notes: string[]; entry: Entry }

/**
 * What each house rule's break does (the chief of staff, 14 Nov 2026: "which notes stop a save (facts, names,
 * contradictions) and which are advice (repetition, order, a length within about 15 percent)"). A stop keeps the entry
 * from the reader until a rewrite clears it; advice goes to the rewrite and never stops a save. Chemicals, terms used
 * against their definitions, brands, safety, comparisons the facts don't make and "rêu" for algae stop, as facts do.
 */
export const RULE_SIDE: Record<number, 'stop' | 'advice'> = { 1: 'stop', 2: 'stop', 3: 'stop', 4: 'advice', 5: 'stop', 6: 'stop', 7: 'advice', 8: 'stop', 9: 'stop', 10: 'stop', 11: 'stop', 12: 'advice' }
/** A rules note stops a save when a rule it names stops, or when it names none. */
export const stops = (note: string) => { const r = ruleNumbers(note); return !r.length || r.some(x => RULE_SIDE[x] !== 'advice') }

/**
 * Why a kept draft may not be accepted as the entry on a reader's word: a sentence the fact check stops, a fact score under
 * the bar (a draft kept before the sentence check), or a rules note that stops (RULE_SIDE). Its length never refuses it: a
 * reader's word is what a draft past the length needs (the chief of staff, 14 Nov 2026, accepting Lũa's sixth with its
 * repetition, order and length notes). Empty when it may be.
 */
export function refusals(d: Draft): string[] {
  const out = d.score < QUALITY_THRESHOLD ? [`its fact score ${d.score} is under the bar, ${QUALITY_THRESHOLD}`] : []
  for (const n of d.notes.slice(0, d.notes.length - d.broken)) if (FACT_STOP.test(n)) out.push(`a sentence the facts don't carry: ${n.slice(0, 160)}`)
  for (const n of d.notes.slice(d.notes.length - d.broken)) if (!isLength(n) && stops(n)) out.push(`a note that stops a save: ${n.slice(0, 160)}`)
  return out
}

/** A fact check's note on a sentence that stops (stopNote), unjudged ones included. */
const FACT_STOP = /^".*": (the facts don't carry it|the reads left it unjudged) \(/s

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

/**
 * Drafts kept before the review log recorded a draft's SHA-256, by the SHA-256 of a copy made when the step wrote each:
 * Lũa's sixth, kept at 03:44 on 14 Nov 2026 and copied at once, which the chief of staff read and accepted.
 */
export const LEGACY_DRAFTS: Record<string, string> = { lua: '809b5af3033a45a64c928a9d091f64abcdd6f2ce3aa48dfc9589a958be459fd0' }

/** Words as a reader counts them: a Vietnamese syllable is one, as the 1,527 and 2,917 of Lũa's drafts were counted. */
const words = (html: string) => unescapePlain(html.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean).length

/**
 * Where an entry runs past its length (the chief of staff, 14 Nov 2026: Lũa's fifth ran to 2,917 words, twice the first's
 * 1,527, and the length bred contradictions). `kinds`: how many kinds the term's notes file names (glossary-asks.json), never
 * read off the draft, so a writer can't raise its own length by splitting items, and a list of bold labels ("Làm pH lên:")
 * isn't kinds (pH's first fuller draft ran to 916 words that way). A term with three kinds or more: about 900 words besides
 * its kinds (Lũa's sixth had 914) and about 60 for each, the kinds' depth left to their own pages, an item past 90 words
 * noted. Any other term: about 400 (chu trình nitơ's 392, with its 8 sources), or `own`, its notes file's own length. Past the target, a note, so the draft gets one
 * trim pass; `stop`: more than 15 percent past it (the chief of staff's line).
 */
export function lengthNotes(body: string, kinds = 0, own = 400): { notes: string[]; stop: boolean } {
  const target = kinds >= 3 ? 900 + 60 * kinds : own
  const n = words(body)
  const out = n > target ? [`The entry is ${n} words: hold it to about ${target}${kinds >= 3 ? ', about 60 a kind' : ''}, and leave what is left out to the pages that use the term.`] : []
  if (kinds >= 3) {
    // Each item's own words: a list inside an item is its own items, not the outer one's.
    const items: string[] = []
    const open: string[] = []
    for (const [t] of body.matchAll(/<li\b[^>]*>|<\/li\s*>|<[^>]*>|[^<]+/gi)) {
      if (/^<li\b/i.test(t)) open.push(t)
      else if (/^<\/li/i.test(t)) { const li = open.pop(); if (li !== undefined) items.push(li) }
      else if (open.length) open[open.length - 1] += t
    }
    for (const li of items) {
      const m = words(li)
      if (m > 90) out.push(`An item is ${m} words, at most about 60: "${unescapePlain(li.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 50)}…". Keep what it is, how it looks, whether it sinks and colours the water and what it is for.`)
    }
  }
  return { notes: out, stop: n > Math.round(target * 1.15) }
}

/**
 * The site's pages for the animals and plants a text names: a page one of whose names of two words or more (its own, its
 * scientific name, its other names, English ones among them) the text writes whole, a plural too ("bristlenose plecos"),
 * a page's one-word English name the text writes ("discus", "angelfish"), and up to eight pages of a genus the text names alone ("Otocinclus and…"): not inside a scientific name ("Otocinclus
 * vittatus" is that fish), and not first in a sentence, where an English word is capitalised too ("Spider wood…"). Each
 * line is the page's name, then other names it goes by: the writer writes one of them, and the site links it.
 */
export async function pageNames(root: string, text: string): Promise<string[]> {
  const lower = text.toLowerCase()
  const escape = (n: string) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const named = (n: string) => n.trim().includes(' ') && lower.includes(n.toLowerCase()) && new RegExp(`(?<![\\p{L}\\p{N}])${escape(n.trim())}(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu').test(text)
  const out = new Set<string>()
  const pages: { names: string[]; scientific?: string; line: string; size: number }[] = []
  for (const kind of ['species', 'plants']) {
    const base = join(root, 'content', kind)
    for (const x of (await readdir(base).catch(() => [] as string[])).sort()) {
      const v = await readFile(join(base, x, 'vi.json'), 'utf8').then(JSON.parse).catch(() => null) as { name: string; altNames?: string[] } | null
      const e = await readFile(join(base, x, 'entity.json'), 'utf8').then(JSON.parse).catch(() => null) as { scientificName?: string } | null
      if (!v?.name) continue
      const names = [v.name, ...(e?.scientificName ? [e.scientificName] : []), ...(v.altNames ?? [])]
      pages.push({ names, ...(e?.scientificName ? { scientific: e.scientificName } : {}), line: names.slice(0, 6).join(' | '), size: JSON.stringify(v).length })
    }
  }
  for (const p of pages) if (p.names.some(named)) out.add(p.line)
  // A one-word English name ("Discus" on two pages, "Angelfish" on one): the fullest eight pages that carry it.
  const oneWord = (n: string) => /^[A-Za-z]{5,}$/.test(n.trim()) && new RegExp(`(?<![\\p{L}\\p{N}])${n.trim()}(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu').test(text)
  const byWord = new Map<string, typeof pages>()
  for (const p of pages) for (const n of p.names.slice(1).filter(oneWord)) byWord.set(n.trim().toLowerCase(), [...(byWord.get(n.trim().toLowerCase()) ?? []), p])
  for (const ps of byWord.values()) for (const p of ps.sort((a, b) => b.size - a.size).slice(0, 8)) out.add(p.line)
  const scientific = new Set(pages.flatMap(p => (p.scientific ? [p.scientific.toLowerCase()] : [])))
  const alone = new Set([...text.matchAll(/(^|[^.!?\s]\s+|[,;:(]\s*)([A-Z][a-z]{4,})\b(\s+[a-z]+)?/g)].filter(m => !scientific.has(`${m[2]}${m[3] ?? ''}`.toLowerCase()) && m[1] !== '').map(m => m[2]!))
  const byGenus = new Map<string, typeof pages>()
  for (const p of pages) { const g = p.scientific?.split(' ')[0]; if (g && alone.has(g)) byGenus.set(g, [...(byGenus.get(g) ?? []), p]) }
  for (const ps of byGenus.values()) for (const p of ps.sort((a, b) => b.size - a.size).slice(0, 8)) out.add(p.line)
  return [...out].slice(0, 40)
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
 * Two researches as one: the first's sources and facts, then the second's that aren't already there, their sources
 * renumbered. A fact both give is kept once, with the second's sources added to the pages that also give it (`also`): a
 * dose from a forum needs that second page (usableFact).
 */
export function addResearch(a: TopicFacts, b: TopicFacts): TopicFacts {
  const sources = [...a.sources]
  const at = (x: TopicFacts['sources'][number]) => { const i = sources.findIndex(y => y.url === x.url); return i >= 0 ? i : sources.push(x) - 1 }
  const moved = b.facts.flatMap(f => (b.sources[f.source] ? [{ ...f, source: at(b.sources[f.source]!), ...(f.also ? { also: f.also.flatMap(i => (b.sources[i] ? [at(b.sources[i]!)] : [])) } : {}) }] : []))
  const key = (f: TopicFacts['facts'][number]) => `${f.section}|${f.fact.trim().toLowerCase()}`
  const facts = a.facts.map(f => ({ ...f }))
  const at2 = new Map(facts.map((f, i) => [key(f), i]))
  for (const f of moved) {
    const i = at2.get(key(f))
    if (i === undefined) { at2.set(key(f), facts.push(f) - 1); continue }
    const kept = facts[i]!
    const also = [...new Set([...(kept.also ?? []), f.source, ...(f.also ?? [])])].filter(x => x !== kept.source)
    if (also.length) kept.also = also
  }
  return { found: a.found || b.found, facts, species: [...new Set([...a.species, ...b.species])], sources }
}

/**
 * A glossary term's fuller Vietnamese entry, written by AquaTome from web research as its own guides are (topics.ts): the
 * research's cited facts (kept in engine-state/glossary/<id>.json, reused with `reuse`), an entry written from them only
 * (meaning, other names, what it means in a tank and what to do, related terms), checked against them and the house rules,
 * rewritten on the notes, and again while it still isn't saved. `sf`: the term's slug in Seriously Fish's glossary, read first and cited.
 *
 * Below the bar, the draft that came closest is kept (engine-state/glossary/<id>.draft.json). `fromDraft` revises that
 * draft on its notes, sentence by sentence, from the same research, and keeps a revision only if it is better. `revise`
 * does the same to the saved entry, with one rewrite on its notes whatever they are (the chief of staff, 14 Nov 2026: a
 * sentence the fact check now stops in chu trình nitơ's, and Lũa's next save with its kinds' own pages). `accept`
 * (who accepts it) saves that draft as it is, on a reader's word, when it breaks nothing but `refusals` allows, and logs
 * who did and with what notes.
 *
 * The entry replaces the old one only at the bar: below it, the term keeps the entry it has, and the report says why.
 * Other names are added only as a source writes them: word for word in the research's facts, never one the writer
 * translated (the Writing Lead, 13 Nov 2026, after the owner found a fern under a translated name). And only when the
 * site can link them safely, as the translations' (localize.ts): several words or an abbreviation, and no other term's.
 */
export async function makeGlossaryEntry(root: string, d: { research: Llm; llm: Llm }, id: string, o: { kind: GuideEntity['kind']; sf?: string; reuse?: boolean; fresh?: boolean; fromDraft?: boolean; revise?: boolean; accept?: string; researchModel?: string; writeModel?: string; now?: () => Date }) {
  const dir = join(root, 'content/glossary')
  const read = async <T>(f: string) => JSON.parse(await readFile(f, 'utf8')) as T
  const entity = GlossarySchema.parse(await read(join(dir, id, 'entity.json')))
  const vi = TranslationSchema.parse(await read(join(dir, id, 'vi.json')))
  const factsFile = join(root, 'engine-state/glossary', `${id}.json`)
  const saved = await read<TopicFacts>(factsFile).catch(() => null)
  const draftFile = join(root, 'engine-state/glossary', `${id}.draft.json`)
  // A kept draft, revised or accepted, goes with the research it was written from, and only as the step kept it: a file
  // whose SHA-256 the review log has for a draft of this term (Codex's read, 14 Nov 2026), or one kept before the log had
  // them, by its own. An earlier kept draft counts, put back byte for byte (the chief of staff's fallback to Lũa's sixth).
  const draftText = o.fromDraft || o.accept ? await readFile(draftFile, 'utf8').catch(() => null) : null
  const draft = draftText !== null ? JSON.parse(draftText) as Draft
    : o.revise && vi.body ? { score: vi.quality.score, broken: 0, notes: [], entry: { definition: vi.definition ?? '', altNames: [], body: vi.body, related: entity.related ?? [] } } satisfies Draft
      : null
  if ((o.fromDraft || o.accept) && (!draft || !saved)) return { id, refused: [`no kept draft${saved ? '' : ' or research'} to ${o.accept ? 'accept' : 'revise'}`] }
  if (o.revise && (!draft || !saved)) return { id, refused: [`no saved entry${saved ? '' : ' or research'} to revise`] }
  if (draftText !== null) {
    const traces = (await readReviews(root, 'glossary'))[`vi/glossary/${id}`] ?? []
    const ours = new Set([...traces.flatMap(t => (t.draft ? [t.draft] : [])), ...(LEGACY_DRAFTS[id] ? [LEGACY_DRAFTS[id]] : [])])
    if (!ours.has(sha(draftText!))) return { id, refused: ['the kept draft is not as the step kept it'] }
  }
  if (o.accept && refusals(draft!).length) return { id, refused: refusals(draft!) }
  const kept = o.reuse || draft ? saved : null
  // The owner, 13 Nov, of driftwood: "all kinds and names named per language", "lũa sa tùng là gì", "full details". A term
  // that comes in kinds is researched kind by kind, each by the name shops here write and its English name.
  const asks = ASKS[id] ?? {}
  const topic = `${vi.name} (${entity.en}) in a freshwater aquarium: what it is, what it does in a tank, how to use or handle it, common mistakes. If it comes in kinds (for driftwood: the woods sold to keepers in Vietnam), each kind sold in Vietnam: the name Vietnamese shops write for it and its English name, each quoted exactly as a source writes it; what it looks like and does in a tank (sinks or floats, tannins, the water's colour and pH, fungus or film); how to prepare it; what goes wrong with it. Start each fact about one kind with that kind's name as its source writes it. Find the Vietnamese names on Vietnamese shops' own websites and in Vietnamese keepers' articles, never on marketplaces (Shopee, Lazada, Tiki) or social networks. Each name for the term itself in a fact of its own (section other), quoted exactly as the source writes it; never a name translated by you`
  const lead = o.sf ? `\n\nRead this glossary entry first and cite it as a reference source: ${sfGlossaryUrl(o.sf)}` : ''
  // The kinds the owner named, by name: each found where a source we may use writes it, its English trade name only as a
  // source writes it, and an honest line when no such source says what it is.
  const kindsAsked = [...(asks.local ?? []), ...(asks.foreign ?? [])]
  const named = kindsAsked.length
  const cover = [
    asks.asked?.length ? `The owner asked: ${asks.asked.map(a => `"${a}"`).join(', ')}.` : '',
    kindsAsked.length ? 'Cover each of these kinds by name, in facts of their own, each fact starting with the kind\'s name as its source writes it. If no source you may use says what one of them is, add one fact (section other) saying only what a shop\'s own page sells under that name.' : '',
    asks.local?.length ? `Kinds sold in Vietnam. For each, everything a source says: what it is (which tree or root), how it looks, whether it sinks, what it does to the water, how to prepare it, what goes wrong, what tanks it suits; the name each Vietnamese shop's own page writes for it; and its English trade name, only as an English-language shop or keeper writes it, in a fact that names both: ${asks.local.join('; ')}.` : '',
    asks.foreign?.length ? `Names a keeper meets on foreign listings. For each: what it is, how it behaves in a tank, how to prepare it, and whether Vietnamese shops sell it and under what name, from their own pages: ${asks.foreign.join('; ')}.` : '',
    asks.also?.length ? `Also find, if a page says it: ${asks.also.join('; ')}.` : '',
    'Name every animal and plant you mention by its scientific name too (the genus at least), as a source gives it.',
    asks.read?.length ? `Read these pages first, again if they were read before, and keep what they say: ${asks.read.join(', ')}.` : '',
    asks.shops?.length ? `And these shops' own pages: ${asks.shops.join(', ')}.` : '',
  ].filter(Boolean).join(' ')
  const found = kept ?? await d.research<TopicFacts>({ system: 'You research fishkeeping topics carefully and cite every fact. Reply only with JSON.', prompt: `${researchPrompt({ topic, kind: o.kind })}${lead}${cover ? `\n\n${cover}` : ''}`, schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  // New research adds to what was kept unless told to start over (the chief of staff, 14 Nov 2026: Lũa's second research
  // replaced its first, and the kinds sold here went with it).
  const researched = !kept && saved && !o.fresh ? addResearch(saved, found) : found
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
  const taxa = await genera(root)
  const terms = others.map(x => `${x.id}: ${x.name}: ${x.definition}`).join('\n')
  const kinds = [
    asks.local?.length ? `--- LOẠI BÁN Ở VIỆT NAM ---\n${asks.local.join('\n')}` : '',
    asks.foreign?.length ? `--- TÊN NƯỚC NGOÀI ---\n${asks.foreign.join('\n')}` : '',
    asks.asked?.length ? `--- NGƯỜI ĐỌC ĐÃ HỎI ---\n${asks.asked.join('\n')}` : '',
    asks.write?.length ? `--- CHO MỤC NÀY ---\n${asks.write.join('\n')}` : '',
    // The term's own length, in place of the prompt's (Codex, 14 Nov 2026: the writer was never told pH's 600). As in
    // lengthNotes, a term with three kinds or more keeps 900 and 60 a kind.
    asks.length && named < 3 ? `--- ĐỘ DÀI ---\nKhoảng ${asks.length.words} chữ cả bài, thay cho độ dài nói ở trên.` : '',
  ].filter(Boolean).map(x => `\n\n${x}`).join('')
  // A rewrite edits the draft before it: only the sentences a note quotes or points to change, every other one stays word
  // for word (the chief of staff, 14 Nov 2026: Lũa's three whole rewrites each brought fresh notes and didn't converge).
  const write = (notes?: string[], before?: Entry) => d.llm<Entry>({
    system: 'You write Vietnamese aquarium glossary entries from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: ENTRY_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện, phạm quy tắc hoặc quá dài. Sửa bản trước, không viết lại: chỉ sửa, gộp hay bỏ những câu mà ghi chú trích hoặc chỉ tới, và giữ nguyên từng chữ mọi câu khác. Quá dài thì bỏ hoặc rút gọn câu, không viết lại câu khác. Chỉ thêm câu khi ghi chú nói thiếu, và chỉ viết điều dữ kiện có. Các ghi chú:\n${notes.map(n => `- ${n}`).join('\n')}${before ? `\n\n--- BẢN TRƯỚC ---\n${JSON.stringify(before)}` : ''}` : ''}${kinds}\n\n--- TRANG CỦA AQUATOME (tên trang | tên khác) ---\n${pages.join('\n')}\n\n--- CÁC THUẬT NGỮ KHÁC (id: tên: định nghĩa) ---\n${terms}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter)}`,
  })
  const rules = async (e: Entry) => {
    const k = kindNames(e, taxa)
    const notes = (await d.llm<{ notes?: string[] }>({
      system: 'You check a Vietnamese glossary entry against house rules. Reply only with JSON.', model: 'opus', schema: RULES_SCHEMA,
      prompt: `${RULES}\n\n--- KINDS ---\nlocal: ${(asks.local ?? []).join('; ') || '(none named)'}\nforeign: ${(asks.foreign ?? []).join('; ') || '(none named)'}\n\n--- THIS TERM ---\n${(asks.write ?? []).join('\n') || '(nothing more)'}\n\n--- PAGES ---\n${pages.join('\n') || '(none)'}\n\n--- KIND WORDS ---\n${k.fit.map(x => x.name).join('\n') || '(none)'}\n\n--- TERMS ---\n${terms}\n\n--- FACTS ---\n${JSON.stringify(forWriter)}\n\n--- ENTRY ---\n${JSON.stringify(e)}`,
    })).notes ?? []
    return judgeKindNames(notes, k, ruleNumbers)
  }
  const check = async (e: Entry) => {
    const [f, r] = await Promise.all([checkSentences(d.llm, forWriter, e), rules(e)])
    const long = lengthNotes(e.body, named, asks.length?.words)
    const unborne = f.stops.map(stopNote)
    return { score: f.score, notes: [...unborne, ...r, ...long.notes], broken: r.length + long.notes.length, stops: unborne.length + r.filter(stops).length + (long.stop ? 1 : 0), loose: f.loose }
  }
  type Checked = { score: number; notes: string[]; broken: number; stops?: number; loose?: Awaited<ReturnType<typeof checkSentences>>['loose'] }
  const stopping = (r: Checked) => r.stops ?? r.broken
  const passes = (r: Checked) => r.score >= QUALITY_THRESHOLD && !stopping(r)
  // Saved beats unsaved; then fewer notes that stop, a fact score at the bar, fewer notes of advice; then, but for a
  // revision of a kept draft, the better grounded. Fact notes aren't counted: the check caps them at ten and they
  // include remarks that a line is supported (Lũa's eighth).
  const rank = (r: Checked) => [passes(r) ? 0 : 1, stopping(r), r.score >= QUALITY_THRESHOLD ? 0 : 1, r.broken - stopping(r)]
  const better = (r: Checked, b: Checked) => {
    const [x, y] = [rank(r), rank(b)]
    const i = x.findIndex((v, j) => v !== y[j])
    return i >= 0 ? x[i]! < y[i]! : !draft && r.score > b.score
  }
  const now = o.now?.()
  const page = { id: `glossary/${id}`, lang: 'vi' }
  let w: Entry
  let review: Checked
  const tries: Checked[] = []
  if (o.accept) {
    w = draft!.entry
    review = { score: draft!.score, notes: draft!.notes, broken: draft!.broken }
    await logReviews(root, 'glossary', page, [review], review, { ...(now ? { now } : {}), rewrite: true, acceptedBy: o.accept })
  } else {
    // A kept draft is read again first: its notes were read against the term's notes as they were then (Lũa's seventh: three
    // of its four came from the notes file's wording, since fixed).
    w = draft ? draft.entry : await write()
    review = await check(w)
    tries.push(review)
    const from = review
    // A rewrite on the notes, and a second while the best still isn't saved (the chief of staff, 14 Nov 2026: Lũa's fifth
    // left six rule breaks after its one rewrite).
    // A fresh draft or a revised entry gets one rewrite on any notes, a kept draft one past its length (its trim pass).
    for (let i = 0; i < 2 && (!passes(review) || (i === 0 && (!draft || o.revise || review.notes.some(isLength)) && review.notes.length)); i++) {
      const again = await write(review.notes, w)
      const r = await check(again)
      tries.push(r)
      if (better(r, review)) { w = again; review = r }
    }
    // The middle path for loose, once, on the entry about to be saved; what it did is logged with the entry's notes. The
    // whole entry is read again after it, and a sentence that read stops keeps it from being saved, kept for a reader.
    if (passes(review) && review.loose?.length) {
      const m = await rewordLoose(d.llm, o.writeModel ?? 'opus', forWriter, w, review.loose)
      w = m.entry
      // The reworded entry is the one saved, so its length is counted again: past the cap, it stops (Codex, 14 Nov 2026).
      const long = lengthNotes(w.body, named, asks.length?.words)
      const over = long.stop ? long.notes.slice(0, 1) : []
      review.notes = [...m.stops.map(stopNote), ...m.log, ...review.notes, ...over]
      review.stops = stopping(review) + m.stops.length + over.length
      review.broken += over.length
      if (m.score !== undefined) review.score = m.score
    }
    // Kept for a reader to judge (the chief of staff, 14 Nov 2026): the draft that came closest, and why it wasn't saved.
    // A revision that came no closer leaves the draft it revised as it was.
    const keep = !passes(review) && (review !== from || !draft) ? `${JSON.stringify({ score: review.score, broken: review.broken, notes: review.notes, entry: w }, null, 2)}\n` : null
    // A draft left as it was carries its digest on this run's reading of it, so the log's last few reviews always hold the
    // kept draft's (it keeps six: Codex's read, 14 Nov 2026).
    const still = draftText !== null && !passes(review) && !keep
    await logReviews(root, 'glossary', page, tries, passes(review) ? review : undefined, { ...(now ? { now } : {}), ...(draft ? { rewrite: true } : {}), ...(keep ? { draft: { of: review, sha: sha(keep) } } : still ? { draft: { of: from, sha: sha(draftText!) } } : {}) })
    if (!passes(review)) {
      if (keep) await writeFile(draftFile, keep)
      return { id, skipped: stopping(review) ? `stopped by ${stopping(review)} note${stopping(review) > 1 ? 's' : ''}` : `under the bar: ${review.score}`, notes: review.notes, draft: `engine-state/glossary/${id}.draft.json`, ...(draft ? { revised: review !== from } : {}) }
    }
  }

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
  // A kept draft is the entry's now, or older than it.
  await rm(draftFile, { force: true })
  return { id, score: review.score, notes: review.notes, ...(o.accept ? { acceptedBy: o.accept } : {}), refs: refs.length, altNames: altNames.length - vi.altNames.length, related: next.related ?? [] }
}
