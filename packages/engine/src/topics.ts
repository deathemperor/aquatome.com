import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuideSchema, QUALITY_THRESHOLD, slugify, TranslationSchema, type GuideEntity } from '@aq/schema'
import type { Llm } from './claude'
import { pickSlug } from './merge'
import { sanitizeHtml } from './sanitize'

const WRITE = readFileSync(new URL('./prompts/topic.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')

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
- sources: every page used, with its kind.
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
 * A guide AquaTome writes itself: web research (cited facts, kept in engine-state/topics for --redo), a Vietnamese
 * guide written from the facts only and checked against them (one rewrite with the checker's notes), linked to the
 * species and plants it is about. Files: content/guides/<id>/{entity,vi}.json, source 'aquatome', with its references.
 */
export async function makeTopic(root: string, d: { research: Llm; llm: Llm }, a: TopicAsk, o: { researchModel?: string; writeModel?: string; reuse?: boolean; now?: () => Date } = {}) {
  const content = join(root, 'content')
  const id = `aquatome-${slugify(a.topic)}`.slice(0, 90).replace(/-+$/, '')
  const factsFile = join(root, 'engine-state/topics', `${id}.json`)
  const kept = o.reuse ? JSON.parse(await readFile(factsFile, 'utf8').catch(() => 'null')) as TopicFacts | null : null
  const researched = kept ?? await d.research<TopicFacts>({ system: 'You research fishkeeping topics carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a), schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/topics'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: `${a.topic}: nothing reliable found` }

  // Only web links are kept as sources; a fact whose source was dropped goes with it, and the rest are renumbered.
  const web = researched.sources.map(s => /^https?:\/\/\S+$/i.test(s.url))
  const at = (i: number) => (web[i] ? web.slice(0, i).filter(Boolean).length : -1)
  const facts = researched.facts.filter(f => at(f.source) >= 0).map(f => ({ ...f, source: at(f.source) }))
  const refs = researched.sources.filter((_, i) => web[i]).map(s => ({ url: s.url, title: s.title }))
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
  const entity: GuideEntity = GuideSchema.parse({
    id, kind: a.kind, source: 'aquatome', sourceUrl: `https://aquatome.com/vi/huong-dan/${slug}/`, html: '', photos: [],
    mentions: [...new Set(researched.species.map(s => ids.get(s.replace(/\s*\(.*$/, '').trim().toLowerCase())).filter((x): x is string => !!x))],
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
