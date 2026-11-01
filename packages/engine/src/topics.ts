import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuideSchema, QUALITY_THRESHOLD, slugify, TranslationSchema, type GuideEntity } from '@aq/schema'
import type { Llm } from './claude'
import { TARGETS, type TargetLang } from './localize'
import { pickSlug } from './merge'
import { sanitizeHtml } from './sanitize'
import { readForumState, topicLeads } from './forum'

const WRITE = readFileSync(new URL('./prompts/topic.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')
const INTL = readFileSync(new URL('./prompts/topic-intl.md', import.meta.url), 'utf8')

const SECTIONS = ['what', 'signs', 'causes', 'firstAid', 'treatment', 'steps', 'prevention', 'mistakes', 'vietnam', 'myths', 'other'] as const
/** What research found about one fishkeeping topic: facts in the researcher's own words, each with its source's index. */
export type TopicFacts = {
  found: boolean
  facts: { section: (typeof SECTIONS)[number]; fact: string; source: number }[]
  /** Scientific names of the fish and plants the facts are about (links to their pages). */
  species: string[]
  sources: { url: string; title: string; kind: 'vet' | 'university' | 'maker' | 'article' | 'forum' | 'paper' | 'other' }[]
}
const FACTS_SCHEMA = {
  type: 'object', required: ['found', 'facts', 'species', 'sources'],
  properties: {
    found: { type: 'boolean' },
    facts: { type: 'array', items: { type: 'object', required: ['section', 'fact', 'source'], properties: { section: { type: 'string', enum: SECTIONS }, fact: { type: 'string' }, source: { type: 'number' } } } },
    species: { type: 'array', items: { type: 'string' } },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'title', 'kind'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['vet', 'university', 'maker', 'article', 'forum', 'paper', 'other'] } } } },
  },
}

export type TopicAsk = { topic: string; kind: GuideEntity['kind'] }

const researchPrompt = (a: TopicAsk) => `Research this freshwater fishkeeping topic for a Vietnamese aquarium handbook: "${a.topic}" (kind: ${a.kind}). Use WebSearch and WebFetch. Search in English and in Vietnamese.

Prefer aquatic vets, universities and extension services (for example UF/IFAS, Merck Veterinary Manual), makers' own documentation, and long-time hobbyist articles; forums only for what keepers report. Collect facts, each with the index of its source in sources[] and one section:
- what (what it is, why it matters), signs (how it looks, how to tell it from look-alikes), causes, firstAid (what to do at once), treatment (methods with exact doses, temperatures and durations as sources give them, and what fish, shrimp, snails or plants cannot take them), steps (for a how-to: the steps in order), prevention, mistakes (common errors), vietnam (anything specific to Vietnam: tropical climate and hot season, tap water, power cuts, products or names used there), myths (claims sources say are wrong, with who says so), other.
- species: scientific names of the fish or plants the topic is mostly about or that sources single out (sensitive species, typical victims). Empty if none.
- sources: every page used, once each: its URL, its title as the page itself gives it (never a description of what you found there), and its kind.
- found: false if this is not a real fishkeeping topic or nothing reliable was found.

Rules: facts in your own words, short, one claim each. Keep numbers and units as sources give them. If sources disagree, keep each fact with its own source. Never fetch Shopee, Lazada or Tiki pages.`

const WRITE_SCHEMA = {
  type: 'object', required: ['name', 'summary', 'body', 'faq'],
  properties: {
    name: { type: 'string' }, summary: { type: 'array', items: { type: 'string' } }, body: { type: 'string' },
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
  },
}
type Written = { name: string; summary: string[]; body: string; faq: { q: string; a: string }[] }
const INTL_SCHEMA = { ...WRITE_SCHEMA, required: [...WRITE_SCHEMA.required, 'slug'], properties: { ...WRITE_SCHEMA.properties, slug: { type: 'string' } } }

const GROUNDED = `Below are FACTS gathered about a fishkeeping topic and a Vietnamese GUIDE written from them. Score 0–1 how well the GUIDE sticks to the FACTS: 1.0 = every claim, dose, number, product and recommendation is supported by the facts; 0.75 = small unsupported generalities; below 0.75 = an invented dose, number, medicine, cause or claim, or a fact turned around.
notes: up to 10 unsupported or wrong claims (in English), quoting the phrase. Empty if none.`

/** Scientific name → page id, for the species and plants we have. */
async function idsByName(content: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const kind of ['species', 'plants']) {
    for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) {
      const e = JSON.parse(await readFile(join(content, kind, id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }
      if (e.scientificName) out.set(e.scientificName.toLowerCase(), id)
    }
  }
  return out
}

/**
 * Breed pages a text names, by their Vietnamese or English names of two words or more (a trailing "discus", "cichlid"
 * or "fish" dropped: "Blue Diamond" names Blue Diamond discus). A guide lists them in its mentions, so their pages link to it.
 */
export async function breedsNamed(content: string, text: string): Promise<string[]> {
  const plain = ` ${text.replace(/<[^>]+>/g, ' ').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const out: string[] = []
  for (const id of (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()) {
    const t = JSON.parse(await readFile(join(content, 'breeds', id, 'vi.json'), 'utf8').catch(() => 'null')) as { name: string; altNames: string[] } | null
    if (!t) continue
    const names = [t.name.replace(/\s*\(.*\)\s*$/, ''), t.name.match(/\(([^)]+)\)/)?.[1] ?? '', ...t.altNames]
      .flatMap(n => [n, n.replace(/\s+(discus|cichlid|fish)$/i, '')])
      .map(n => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()).filter(n => n.includes(' '))
    if (names.some(n => plain.includes(` ${n} `))) out.push(id)
  }
  return out
}

/**
 * A guide AquaTome writes itself: web research (cited facts, kept in engine-state/topics for --redo), a Vietnamese
 * guide written from the facts only and checked against them (one rewrite with the checker's notes), linked to the
 * species and plants it is about. Files: content/guides/<id>/{entity,vi}.json, source 'aquatome', with its references.
 */
export async function makeTopic(root: string, d: { research: Llm; llm: Llm }, a: TopicAsk, o: { researchModel?: string; writeModel?: string; reuse?: boolean; now?: () => Date } = {}) {
  const content = join(root, 'content')
  const id = `aquatome-${slugify(a.topic)}`.slice(0, 90).replace(/-+$/, '')
  const factsFile = join(root, 'engine-state/topics', `${id}.json`)
  const kept = o.reuse ? JSON.parse(await readFile(factsFile, 'utf8').catch(() => 'null')) as TopicFacts | null : null
  // Forum threads on the topic (engine forum notes): a translated post leads to its original, the source to cite.
  const leads = kept ? '' : topicLeads(await readForumState(join(root, 'engine-state/forum/diendancacanh.json')), a.topic)
  const researched = kept ?? await d.research<TopicFacts>({ system: 'You research fishkeeping topics carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a) + leads, schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/topics'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: `${a.topic}: nothing reliable found` }

  // Only web links are kept as sources, each page once (a fact citing a page listed twice cites its first listing); a
  // fact whose source was dropped goes with it, and the rest are renumbered.
  const urls = [...new Set(researched.sources.map(s => s.url).filter(u => /^https?:\/\/\S+$/i.test(u)))]
  const at = (i: number) => urls.indexOf(researched.sources[i]?.url ?? '')
  const facts = researched.facts.filter(f => at(f.source) >= 0).map(f => ({ ...f, source: at(f.source) }))
  const refs = urls.map(url => ({ url, title: researched.sources.find(s => s.url === url)!.title }))
  if (!facts.length) return { id, skipped: `${a.topic}: no cited facts` }

  const forWriter = { topic: a.topic, kind: a.kind, facts }
  const write = (notes?: string[]) => d.llm<Written>({
    system: 'You write Vietnamese aquarium guides from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter, null, 1)}`,
  })
  const check = async (x: Written) => {
    const r = await d.llm<{ score: number; notes: string[] }>({ system: 'You check a guide against its facts. Reply only with JSON.', prompt: `${GROUNDED}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nGUIDE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  }
  let w = await write()
  let review = await check(w)
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    if (r.score > review.score) { w = again; review = r }
  }

  const dir = join(content, 'guides', id)
  const prev = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as { slug: string } | null
  const taken = new Set<string>()
  for (const g of await readdir(join(content, 'guides')).catch(() => [] as string[])) {
    if (g === id) continue
    const t = JSON.parse(await readFile(join(content, 'guides', g, 'vi.json'), 'utf8').catch(() => '{}')) as { slug?: string }
    if (t.slug) taken.add(t.slug)
  }
  const name = w.name.trim()
  const slug = prev?.slug ?? pickSlug(name.replace(/:.*$/, ''), 'huong-dan', taken)
  const ids = await idsByName(content)
  const today = (o.now?.() ?? new Date()).toISOString().slice(0, 10)
  // A rewrite keeps the photos put on the guide since (our drawings, photos picked for its sections).
  const prevEntity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8').catch(() => 'null')) as GuideEntity | null
  const entity: GuideEntity = GuideSchema.parse({
    id, kind: a.kind, source: 'aquatome', sourceUrl: `https://aquatome.com/vi/huong-dan/${slug}/`, html: '', photos: prevEntity?.photos ?? [],
    mentions: [...new Set([...researched.species.map(s => ids.get(s.replace(/\s*\(.*$/, '').trim().toLowerCase())).filter((x): x is string => !!x), ...await breedsNamed(content, `${w.summary.join(' ')} ${w.body}`)])],
    updatedAt: today, refs,
  })
  const vi = TranslationSchema.parse({
    slug, name, altNames: [], sections: {}, body: sanitizeHtml(w.body), summary: w.summary.map(s => s.trim()).filter(Boolean), faq: w.faq.filter(f => f.q.trim() && f.a.trim()),
    quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
  })
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi, null, 2)}\n`)
  return { id, slug, score: review.score, notes: review.notes, refs: refs.length }
}

/**
 * An AquaTome guide in another site language, written afresh from the same research (engine-state/topics/<id>.json)
 * rather than translated from the Vietnamese: facts about Vietnam itself are left out, the rest written for that
 * country's hobbyists and checked against the facts like the Vietnamese one. content/guides/<id>/<lang>.json; a guide
 * already done is skipped unless redo. Thai pages are addressed by an English slug the writer gives.
 */
export async function localizeTopic(root: string, llm: Llm, id: string, lang: TargetLang, o: { model?: string; redo?: boolean } = {}) {
  const file = join(root, 'content/guides', id, `${lang}.json`)
  if (!o.redo && (await readFile(file, 'utf8').then(() => true, () => false))) return { id, skipped: 'done' }
  const researched = JSON.parse(await readFile(join(root, 'engine-state/topics', `${id}.json`), 'utf8')) as TopicFacts
  const vi = JSON.parse(await readFile(join(root, 'content/guides', id, 'vi.json'), 'utf8')) as { name: string }
  const entity = JSON.parse(await readFile(join(root, 'content/guides', id, 'entity.json'), 'utf8')) as GuideEntity
  // Facts about Vietnam itself stay on the Vietnamese page; this page cites only the sources its facts come from
  // (in the Vietnamese page's order), numbered afresh.
  const kept = researched.facts.filter(f => f.section !== 'vietnam' && (entity.refs ?? []).some(r => r.url === researched.sources[f.source]?.url))
  const refs = (entity.refs ?? []).filter(r => kept.some(f => researched.sources[f.source]?.url === r.url))
  const facts = kept.map(f => ({ ...f, source: refs.findIndex(r => r.url === researched.sources[f.source]!.url) }))
  if (!facts.length) return { id, skipped: 'no facts' }
  const forWriter = { topic: vi.name, kind: entity.kind, facts }
  const T = TARGETS[lang]
  const prompt = (notes?: string[]) => `${INTL.replaceAll('{{LANG}}', T.lang).replaceAll('{{COUNTRY}}', T.country).replace('{{STYLE}}', T.style)}${notes?.length ? `\n\nThe previous version went beyond the facts. Fix these, writing only what the facts say:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- FACTS (topic given in Vietnamese) ---\n${JSON.stringify(forWriter, null, 1)}`
  const write = (notes?: string[]) => llm<Written & { slug: string }>({ system: `You write ${T.lang} aquarium guides from facts. Reply only with JSON.`, model: o.model ?? 'opus', schema: INTL_SCHEMA, prompt: prompt(notes) })
  const check = async (x: Written) => {
    const r = await llm<{ score: number; notes: string[] }>({ system: 'You check a guide against its facts. Reply only with JSON.', prompt: `${GROUNDED.replace('Vietnamese GUIDE', `${T.lang} GUIDE`)}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nGUIDE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  }
  let w = await write()
  let review = await check(w)
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    if (r.score > review.score) { w = again; review = r }
  }
  const taken = new Set<string>()
  for (const g of await readdir(join(root, 'content/guides')).catch(() => [] as string[])) {
    if (g === id) continue
    const t = JSON.parse(await readFile(join(root, 'content/guides', g, `${lang}.json`), 'utf8').catch(() => '{}')) as { slug?: string }
    if (t.slug) taken.add(t.slug)
  }
  const prev = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { slug: string } | null
  const name = w.name.trim()
  const slug = prev?.slug ?? pickSlug(lang === 'th' || !slugify(name) ? w.slug : name.replace(/:.*$/, ''), lang === 'id' ? 'panduan' : 'guide', taken)
  const t = TranslationSchema.parse({
    slug, name, altNames: [], sections: {}, body: sanitizeHtml(w.body), summary: w.summary.map(s => s.trim()).filter(Boolean), faq: w.faq.filter(f => f.q.trim() && f.a.trim()),
    refs, quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
  })
  await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
  return { id, slug, score: review.score, notes: review.notes }
}
