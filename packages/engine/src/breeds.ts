import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BreedSchema, GallerySchema, metricPage, nameKey, QUALITY_THRESHOLD, slugify, TranslationSchema, type BreedEntity, type Range, type Translation } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { lastKept, logReviews } from './review-log'
import { commonsCandidates, screen, type GalleryDeps } from './gallery'
import { pickSlug } from './merge'
import { plainParts, sanitizeHtml, unescapePlain } from './sanitize'
import { localName, TARGETS, type TargetLang } from './localize'
import { breedLeads, readForumState } from './forum'
import { breedKin, breedNames, cleanBreedAltNames } from './alt-names'
import { isMarketplace } from './marketplaces'
import { BOUNDS } from './process'
import { VI_STYLE as STYLE } from './phrases'
import { steadyRead } from './quality'

const WRITE = readFileSync(new URL('./prompts/breed.md', import.meta.url), 'utf8')
const INTL = readFileSync(new URL('./prompts/breed-intl.md', import.meta.url), 'utf8')

type Sourced = { fact: string; source: number }
export const CARE_FIELDS = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'difficulty', 'lifeYears'] as const
export type CareField = (typeof CARE_FIELDS)[number]
type SourceKind = BreedEntity['sources'][number]['kind']
/** What research found about one man-made fish: facts in the researcher's own words, each with the index of its source. */
export type BreedFacts = {
  found: boolean
  kind: BreedEntity['kind']
  enNames: string[]
  viNames: { name: string; source: number }[]
  /** Varieties: the scientific name of the species it is a form of. */
  basedOn?: string
  parents: { name: string; scientificName?: string; certain: boolean; source: number }[]
  origin: Sourced[]; looks: Sourced[]; lines: Sourced[]
  care: { field: CareField; min: number; max: number; source: number }[]
  keeping: Sourced[]; breeding: Sourced[]; health: Sourced[]; buying: Sourced[]; controversy: Sourced[]
  commons?: string
  sources: { url: string; title: string; kind: SourceKind }[]
}
const SOURCES_SCHEMA = { type: 'array', items: { type: 'object', required: ['url', 'title', 'kind'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['breeder', 'shop', 'article', 'forum', 'video', 'paper', 'other'] } } } }
const sourced = { type: 'array', items: { type: 'object', required: ['fact', 'source'], properties: { fact: { type: 'string' }, source: { type: 'number' } } } }
const FACTS_SCHEMA = {
  type: 'object',
  required: ['found', 'kind', 'enNames', 'viNames', 'parents', 'origin', 'looks', 'lines', 'care', 'keeping', 'breeding', 'health', 'buying', 'controversy', 'sources'],
  properties: {
    found: { type: 'boolean' }, kind: { type: 'string', enum: ['hybrid', 'variety', 'transgenic'] },
    enNames: { type: 'array', items: { type: 'string' } },
    viNames: { type: 'array', items: { type: 'object', required: ['name', 'source'], properties: { name: { type: 'string' }, source: { type: 'number' } } } },
    basedOn: { type: 'string' },
    parents: { type: 'array', items: { type: 'object', required: ['name', 'certain', 'source'], properties: { name: { type: 'string' }, scientificName: { type: 'string' }, certain: { type: 'boolean' }, source: { type: 'number' } } } },
    origin: sourced, looks: sourced, lines: sourced,
    care: { type: 'array', items: { type: 'object', required: ['field', 'min', 'max', 'source'], properties: { field: { type: 'string', enum: CARE_FIELDS }, min: { type: 'number' }, max: { type: 'number' }, source: { type: 'number' } } } },
    keeping: sourced, breeding: sourced, health: sourced, buying: sourced, controversy: sourced,
    commons: { type: 'string' },
    sources: SOURCES_SCHEMA,
  },
}

export type BreedAsk = { name: string; kind?: BreedEntity['kind']; basedOn?: string }

/** Difficulty and lifespan in a species' words (prompts/process.md), for what a breed's own sources say of it. */
export const DIFFICULTY = 'difficulty (1 = very easy … 8 = expert; convert the source\'s scale: a rating out of 10 or 5 as its share of 8, rounded (8/10 is 6, 3/5 is 5); its words so: very easy 1, easy or beginner 2, easy to moderate 3, moderate or intermediate 4, moderate to difficult 5, difficult or advanced 6, very difficult 7, expert only 8), one whole number (min = max)'
export const LIFE_YEARS = 'lifeYears in years (how long the fish lives in an aquarium, as the source states it: "4 years" is min = max = 4, "up to 5 years" is min = max = 5, "3 to 5 years" is 3–5; months as a fraction of a year; never inferred from anything else)'
const ITS_OWN = 'Only a figure from a page about this fish (its care sheet, a breeder\'s, hobbyist\'s or shop\'s page on it): its rating of how hard this fish is to keep counts even when worded for its kind. Never a figure from a page about its species or a parent species (a species profile, the species\' encyclopedia article).'

const researchPrompt = (a: BreedAsk) => `Research the aquarium fish "${a.name}" for a Vietnamese aquarium handbook. It is a man-made fish without a scientific name of its own: a hybrid, a line or colour form bred within one species, or a transgenic fish${a.kind ? ` (expected: ${a.kind})` : ''}. Use WebSearch and WebFetch. Search in English and in Vietnamese (the names Vietnamese hobbyists and shops use, Vietnamese forums and articles), and in the languages of the countries where it was developed when that helps.

Collect facts, each pointing at the index of its source in sources[]:
- found: false if this is not a recognised aquarium fish, or if it is a wild species with its own scientific name.
- kind: hybrid (two or more species crossed), variety (a line, strain or colour form bred within one species), transgenic.
- enNames: its English names. viNames: the names Vietnamese hobbyists and shops use for it, each with its source. Only names for this fish itself: not its species' names, which every form of the species shares (a halfmoon betta's are not "cá xiêm" or "cá chọi"), nor its parents'.
- basedOn: for a variety, the valid scientific name of its species.
- parents: for a hybrid, each parent species or fish as sources give it, with its scientific name when known; certain = false when its role is disputed or a guess.
- origin: who developed it, where and when.
- looks: the traits that define it and how hobbyists judge a good one. lines: named sub-lines or strains and what sets each apart.
- care: temperature (°C), pH, GH, adult size (cm), minimum tank length (cm) as ranges (min = max for a single figure), each from a source. Convert units. Also its ${DIFFICULTY} and ${LIFE_YEARS}. ${ITS_OWN}
- keeping (tank, water, food, tankmates), breeding (can it breed, are offspring fertile, do they breed true), health (problems specific to it), buying (how to pick a healthy, good one).
- controversy: criticism with who makes it (deformities from breeding, dyed, injected or tattooed fish, releases into the wild, bans).
- commons: the Wikimedia Commons category with photos of it (for example "Category:Flowerhorn cichlid"), only if you confirmed it exists.
- sources: every page used, with its kind (breeder, shop, article, forum, video, paper, other).

Rules: facts in your own words, short. Never fetch Shopee, Lazada or Tiki pages. Prefer breeders, long-time hobbyist articles and papers over shop copy. If sources disagree, keep each fact with its own source.`

const WRITE_SCHEMA = {
  type: 'object', required: ['name', 'altNames', 'parentNames', 'summary', 'body', 'faq'],
  properties: {
    name: { type: 'string' }, altNames: { type: 'array', items: { type: 'string' } }, parentNames: { type: 'array', items: { type: 'string' } }, summary: { type: 'array', items: { type: 'string' } }, body: { type: 'string' },
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: { type: 'string' }, a: { type: 'string' } } } },
  },
}
type Written = { name: string; altNames: string[]; parentNames?: string[]; summary: string[]; body: string; faq: { q: string; a: string }[] }
const INTL_SCHEMA = { ...WRITE_SCHEMA, required: [...WRITE_SCHEMA.required, 'slug'], properties: { ...WRITE_SCHEMA.properties, slug: { type: 'string' } } }

const GROUNDED = `Below are FACTS gathered about a man-made aquarium fish and a Vietnamese PAGE written from them. Score 0–1 how well the PAGE sticks to the FACTS: 1.0 = every claim, number, origin, name and recommendation in the page is supported by the facts; 0.75 = small unsupported generalities; below 0.75 = an invented number, origin, parent, line, scientific name or claim, or a fact turned around. A fact's figure converted to metric (°F → °C, inches → cm, gallons → litres, sensibly rounded) is that fact's figure.
notes: up to 10 unsupported or wrong claims (in English), quoting the phrase. Empty if none.`

/**
 * A researched care figure as the card keeps it, or undefined: outside the bounds the engine keeps for a species' card
 * (process.ts), or a difficulty that isn't one figure. Temperature and difficulty in whole numbers (from °F, 18.3–22.2);
 * a lifespan always a range, as a species' (months as tenths of a year).
 */
export function careValue(c: { field: CareField; min: number; max: number }): Range | number | undefined {
  const [lo, hi] = BOUNDS[c.field] ?? [NaN, NaN]
  const round = (v: number) => (c.field === 'tempC' || c.field === 'difficulty' ? Math.round(v) : c.field === 'lifeYears' ? Math.round(v * 10) / 10 : v)
  const min = round(Math.min(c.min, c.max))
  const max = round(Math.max(c.min, c.max))
  if (!(min >= lo && max <= hi) || (c.field === 'difficulty' && min !== max)) return undefined
  return c.field === 'lifeYears' ? { min, max } : min === max ? min : { min, max }
}

/** Research → what a page may use: only web links are kept as sources (`at`: a source's position among them), and a fact
 * whose source was dropped goes with it, so every claim on the page is cited. */
function webFacts(r: BreedFacts) {
  const web = r.sources.map(s => /^https?:\/\/\S+$/i.test(s.url))
  const at = (i: number) => (web[i] ? web.slice(0, i).filter(Boolean).length : -1)
  const cited = <T extends { source: number }>(xs: T[]) => xs.filter(x => at(x.source) >= 0)
  const facts: BreedFacts = { ...r, viNames: cited(r.viNames), parents: cited(r.parents), origin: cited(r.origin), looks: cited(r.looks), lines: cited(r.lines), care: cited(r.care), keeping: cited(r.keeping), breeding: cited(r.breeding), health: cited(r.health), buying: cited(r.buying), controversy: cited(r.controversy) }
  return { web, at, facts }
}

/**
 * The species page a scientific name from a breed's research names, or undefined unless exactly one page is it: the
 * page's own name, else through GBIF's answers the engine keeps (engine-state/_gbif-names.json; exact matches only, as
 * a fuzzy one can be another fish), a synonym and its accepted name being one species. A note after the name is left
 * out ("Vieja melanurus (syn. Vieja synspila)"), and only a species' name links: never two ("Poecilia sphenops /
 * Poecilia latipinna"), a genus ("Caridina sp.") or a variety ("Cyprinus carpio var. flavipinnis").
 */
export async function speciesResolver(root: string): Promise<(name?: string) => string | undefined> {
  const gbif = JSON.parse(await readFile(join(root, 'engine-state/_gbif-names.json'), 'utf8').catch(() => '{}')) as Record<string, { canonicalName: string; matchType: string } | null>
  const accepted = (sci: string) => { const t = gbif[sci]; return (t?.matchType === 'EXACT' ? t.canonicalName : sci).toLowerCase() }
  const byName = new Map<string, Set<string>>()
  const bySpecies = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, key: string, id: string) => (m.get(key) ?? m.set(key, new Set()).get(key)!).add(id)
  for (const id of await readdir(join(root, 'content/species')).catch(() => [] as string[])) {
    const sci = (JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }).scientificName?.trim()
    if (!sci) continue
    add(byName, sci.toLowerCase(), id)
    add(bySpecies, accepted(sci), id)
  }
  const one = (ids?: Set<string>) => (ids?.size === 1 ? [...ids][0] : undefined)
  return name => {
    const sci = name?.replace(/\s*\(.*$/, '').trim()
    if (!sci || !/^[A-Z][a-z]+ [a-z-]+( [a-z-]+)?$/.test(sci)) return undefined
    const own = byName.get(sci.toLowerCase())
    return own ? one(own) : one(bySpecies.get(accepted(sci)))
  }
}

/**
 * A breed's links to the species pages its research names, where it has none yet: what it is a form of (`basedOn`) and
 * each parent's page. A link it has is never changed. The sweep runs it each cycle, so a breed written before its
 * species had a page links once it has one. `links`: each link made; `unmatched`: why its parents were left as they are.
 */
export function linkBreed(e: BreedEntity, research: BreedFacts, species: (name?: string) => string | undefined): { entity: BreedEntity; links: string[]; unmatched?: string } {
  const { facts } = webFacts(research)
  const links: string[] = []
  const basedOn = e.basedOn ?? species(facts.basedOn)
  if (basedOn && !e.basedOn) links.push(`basedOn → ${basedOn} ("${facts.basedOn}")`)
  // The page's parents are its research's cited ones, in the same order.
  const same = facts.parents.length === e.parents.length
  const parents = e.parents.map((p, i) => {
    const s = p.species ? undefined : same ? species(facts.parents[i]!.scientificName) : undefined
    if (!s) return p
    links.push(`parent "${p.name}" → ${s} ("${facts.parents[i]!.scientificName}")`)
    const { name, ...rest } = p
    return { name, species: s, ...rest }
  })
  const unmatched = !same && e.parents.some(p => !p.species) ? `parents left: ${e.parents.length} on the page, ${facts.parents.length} in its research` : undefined
  const { id, kind, ...rest } = e
  return { entity: { id, kind, ...(basedOn ? { basedOn } : {}), ...rest, parents }, links, ...(unmatched ? { unmatched } : {}) }
}
async function speciesSlugs(content: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const kind of ['species', 'breeds']) {
    for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) {
      const t = JSON.parse(await readFile(join(content, kind, id, 'vi.json'), 'utf8').catch(() => '{}')) as { slug?: string }
      if (t.slug) out.add(t.slug)
    }
  }
  return out
}

/**
 * A page for a man-made fish: web research (cited facts, kept in engine-state/breeds for --redo), a Vietnamese page
 * written from the facts only and checked against them (one rewrite with the checker's notes), photos from its
 * Commons category screened like a gallery. Files: content/breeds/<id>/{entity,vi}.json, content/gallery/<id>.json.
 */
export async function makeBreed(root: string, d: { research: Llm; llm: Llm; gallery: GalleryDeps }, a: BreedAsk, o: { researchModel?: string; writeModel?: string; reuse?: boolean } = {}) {
  const content = join(root, 'content')
  const id = slugify(a.name)
  const factsFile = join(root, 'engine-state/breeds', `${id}.json`)
  const kept = o.reuse ? JSON.parse(await readFile(factsFile, 'utf8').catch(() => 'null')) as BreedFacts | null : null
  // The Vietnamese names keepers on Diễn Đàn Cá Cảnh use for it (engine forum notes), as leads to check and cite.
  const leads = kept ? '' : breedLeads(await readForumState(join(root, 'engine-state/forum/diendancacanh.json')), [a.name])
  const researched = kept ?? await d.research<BreedFacts>({ system: 'You research aquarium fish carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a) + leads, schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/breeds'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: `${a.name}: not a man-made aquarium fish, or not found` }

  const { web, at, facts } = webFacts(researched)
  const species = await speciesResolver(root)
  // "Vieja melanurus (syn. Vieja synspila)": the name before any synonym note.
  const sci = (name?: string) => name?.replace(/\s*\(.*$/, '').trim() || undefined

  const forWriter = { name: a.name, kind: facts.kind, enNames: facts.enNames, viNames: facts.viNames, basedOn: facts.basedOn, parents: facts.parents, origin: facts.origin, looks: facts.looks, lines: facts.lines, care: facts.care, keeping: facts.keeping, breeding: facts.breeding, health: facts.health, buying: facts.buying, controversy: facts.controversy }
  // A name the owner fixed is the page's name in the text too, not only in its title (other names stay other names).
  const dir = join(content, 'breeds', id)
  const prev = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as Translation | null
  const fixed = prev?.nameFixed ? `\n\nTên trang đã chốt: "${prev.name}". Gọi cá bằng tên này trong cả bài; các tên khác chỉ nhắc như tên gọi khác.` : ''
  const write = (notes?: string[]) => d.llm<Written>({
    system: 'You write Vietnamese aquarium fish profiles from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${fixed}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter, null, 1)}`,
  })
  // Near the bar, read three times and the median read counts (steadyRead).
  const check = (x: Written) => steadyRead(async () => {
    const r = await d.llm<{ score: number; notes: string[] }>({ system: 'You check a page against its facts. Reply only with JSON.', prompt: `${GROUNDED}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nPAGE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  })
  // A redo starts from what the last review of the page on the site found, as the rewrite below does.
  const before = kept ? await lastKept(root, { id: `breeds/${id}`, lang: 'vi' }, ['breed']) : undefined
  let w = await write(before?.notes)
  let review = await check(w)
  const tries = [review]
  // Any claim beyond the facts: one rewrite with the checker's notes; the better-grounded page is kept.
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    tries.push(r)
    if (r.score > review.score) { w = again; review = r }
  }

  // Photos: its Commons category (else a search for its name), screened for this line only, best first.
  // A rewrite from kept research keeps the photos already screened.
  const was = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8').catch(() => 'null')) as BreedEntity | null
  const prevPhotos = kept ? was : null
  const prevGallery = prevPhotos ? JSON.parse(await readFile(join(content, 'gallery', `${id}.json`), 'utf8').catch(() => 'null')) as { photos: BreedEntity['photos']; seen: number } | null : null
  const enName = facts.enNames[0] ?? a.name
  const cands = prevPhotos ? [] : await commonsCandidates((facts.commons ?? enName).replace(/^Category:/i, '').trim(), d.gallery.http, 450, !facts.commons)
  const photos = prevPhotos ? [...prevPhotos.photos, ...(prevGallery?.photos ?? [])] : await screen(cands.slice(0, 300), enName, w.name, d.gallery, true)
  const seen = prevPhotos ? prevGallery?.seen ?? photos.length : cands.length

  const today = d.gallery.now().toISOString().slice(0, 10)
  const care: BreedEntity['care'] = {}
  for (const c of facts.care) {
    const value = careValue(c)
    if (value === undefined || at(c.source) < 0) continue
    ;(care[c.field] ??= []).push({ source: at(c.source), value })
  }
  // A link the page has stays (one given with --based-on too), and so do its parents' on a --redo (the same research).
  const basedOn = a.basedOn ?? was?.basedOn ?? species(facts.basedOn)
  const kin = kept && was?.parents.length === facts.parents.length ? was.parents : []
  const parentOf = (i: number) => kin[i]?.species ?? species(facts.parents[i]!.scientificName)
  const entity: BreedEntity = BreedSchema.parse({
    id, kind: facts.kind,
    ...(basedOn ? { basedOn } : {}),
    // The writer's Vietnamese name for each parent when it gave one per parent; else the researched name.
    parents: facts.parents.map((p, i) => ({ name: (w.parentNames?.length === facts.parents.length && w.parentNames[i]?.trim()) || (sci(p.scientificName) ? `${p.name} (${sci(p.scientificName)})` : p.name), ...(parentOf(i) ? { species: parentOf(i) } : {}), certain: p.certain })),
    care, photos: photos.slice(0, 4), ...(facts.commons ? { commons: facts.commons } : {}),
    sources: facts.sources.filter((_, i) => web[i]).map(s => ({ ...s, at: today })), updatedAt: today,
  })
  // A name the owner fixed, and the addresses it had before, survive a --redo.
  const name = (prev?.nameFixed ? prev.name : unescapePlain(w.name)).trim()
  // Other names, minus those the title already holds ("Cá hồng két (Blood parrot cichlid)"), and its own only: research
  // gives the species' too ("Cá xiêm" for the halfmoon betta), which the sweep would take off again.
  const breeds = await breedNames(content, 'vi')
  const { altNames } = cleanBreedAltNames({ id, name, altNames: [...new Set([...w.altNames, ...facts.enNames, ...facts.viNames.map(v => v.name)].map(s => unescapePlain(s).trim()).filter(s => s && !name.toLowerCase().includes(s.toLowerCase())))] }, await breedKin(content, entity, 'vi', breeds), breeds)
  const vi: Translation = TranslationSchema.parse(metricPage({
    slug: prev?.slug ?? pickSlug(name.replace(/\s*\(.*\)\s*$/, ''), facts.kind === 'hybrid' ? 'lai' : 'dong', await speciesSlugs(content)),
    name, altNames,
    sections: {}, body: sanitizeHtml(w.body), ...plainParts(w.summary, w.faq),
    quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
    ...(prev?.nameFixed ? { nameFixed: true } : {}), ...(prev?.redirectFrom ? { redirectFrom: prev.redirectFrom } : {}),
  }, 'vi'))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi, null, 2)}\n`)
  await logReviews(root, 'breed', { id: `breeds/${id}`, lang: 'vi' }, tries, review, { now: d.gallery.now() })
  if (photos.length > 4) {
    await mkdir(join(content, 'gallery'), { recursive: true })
    await writeFile(join(content, 'gallery', `${id}.json`), `${JSON.stringify(GallerySchema.parse({ id, photos: photos.slice(4), seen, updatedAt: today }), null, 2)}\n`)
  }
  return { id, slug: vi.slug, score: review.score, notes: review.notes, photos: `${photos.length} of ${seen}` }
}

/**
 * A breed page in another site language, written afresh from the same research (engine-state/breeds/<id>.json) rather
 * than translated: the Vietnamese names stay on the Vietnamese page, the rest is written for that country's hobbyists and
 * checked against the facts like the Vietnamese one (one rewrite with the checker's notes). content/breeds/<id>/<lang>.json;
 * skipped once done unless redo, and a redo keeps the address. Thai pages are addressed by an English slug the writer gives.
 */
export async function localizeBreed(root: string, llm: Llm, id: string, lang: TargetLang, o: { model?: string; redo?: boolean } = {}) {
  const dir = join(root, 'content/breeds', id)
  const file = join(dir, `${lang}.json`)
  if (!o.redo && (await readFile(file, 'utf8').then(() => true, () => false))) return { id, skipped: 'done' }
  const { facts } = webFacts(JSON.parse(await readFile(join(root, 'engine-state/breeds', `${id}.json`), 'utf8')) as BreedFacts)
  const vi = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8')) as Translation
  const T = TARGETS[lang]
  const forWriter = { name: facts.enNames[0] ?? id, kind: facts.kind, enNames: facts.enNames, basedOn: facts.basedOn, parents: facts.parents, origin: facts.origin, looks: facts.looks, lines: facts.lines, care: facts.care, keeping: facts.keeping, breeding: facts.breeding, health: facts.health, buying: facts.buying, controversy: facts.controversy }
  const prompt = (notes?: string[]) => `${INTL.replaceAll('{{LANG}}', T.lang).replaceAll('{{COUNTRY}}', T.country).replace('{{STYLE}}', T.style)}${notes?.length ? `\n\nThe previous version went beyond the facts. Fix these, writing only what the facts say:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- FACTS ---\n${JSON.stringify(forWriter, null, 1)}`
  const write = (notes?: string[]) => llm<Written & { slug: string }>({ system: `You write ${T.lang} aquarium fish profiles from facts. Reply only with JSON.`, model: o.model ?? 'opus', schema: INTL_SCHEMA, prompt: prompt(notes) })
  const check = (x: Written) => steadyRead(async () => {
    const r = await llm<{ score: number; notes: string[] }>({ system: 'You check a page against its facts. Reply only with JSON.', prompt: `${GROUNDED.replace('Vietnamese PAGE', `${T.lang} PAGE`)}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nPAGE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  })
  // A redo starts from what the last review of the page on the site found.
  const before = o.redo ? await lastKept(root, { id: `breeds/${id}`, lang }, ['breed']) : undefined
  let w = await write(before?.notes)
  let review = await check(w)
  const tries = [review]
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    tries.push(r)
    if (r.score > review.score) { w = again; review = r }
  }
  // Breeds share /ca/ with the species: an address and a name neither has in this language.
  const taken = new Set<string>()
  const names = new Set<string>()
  for (const kind of ['species', 'breeds']) for (const x of await readdir(join(root, 'content', kind)).catch(() => [] as string[])) {
    if (kind === 'breeds' && x === id) continue
    const t = JSON.parse(await readFile(join(root, 'content', kind, x, `${lang}.json`), 'utf8').catch(() => '{}')) as { slug?: string; name?: string }
    if (t.slug) taken.add(t.slug)
    if (t.name) names.add(nameKey(t.name))
  }
  const prev = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { slug: string; name: string; nameFixed?: boolean } | null
  const name = localName(unescapePlain(w.name), prev, names, forWriter.name)
  const slug = prev?.slug ?? pickSlug(lang === 'th' || !slugify(name) ? w.slug : name.replace(/\s*\(.*\)\s*$/, ''), T.slugWords.fish, taken)
  // The Vietnamese page's own names are not names in this language, nor are its species' (cleanBreedAltNames).
  const viNames = new Set([vi.name, ...vi.altNames].map(n => n.toLowerCase()))
  const breeds = await breedNames(join(root, 'content'), lang)
  const entity = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8')) as BreedEntity
  const { altNames } = cleanBreedAltNames({ id, name, altNames: [...new Set([w.name, ...w.altNames].map(n => unescapePlain(n).trim()).filter(n => n && !viNames.has(n.toLowerCase()) && !name.toLowerCase().includes(n.toLowerCase())))] }, await breedKin(join(root, 'content'), entity, lang, breeds), breeds)
  const t = TranslationSchema.parse(metricPage({
    slug, name, altNames,
    sections: {}, body: sanitizeHtml(w.body), ...plainParts(w.summary, w.faq),
    ...(w.parentNames?.length && w.parentNames.length === facts.parents.length ? { parents: w.parentNames.map(n => n.trim()) } : {}),
    quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
    ...(prev?.nameFixed ? { nameFixed: true } : {}),
  }, lang))
  await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
  await logReviews(root, 'breed', { id: `breeds/${id}`, lang }, tries, review)
  return { id, slug, score: review.score, notes: review.notes }
}

/**
 * Photos for breed pages that have none: a search for the name's words on Commons, screened for this line only. The
 * best 4 lead the page, the rest go to its gallery. Tried again after a month (the Unsplash step tries these pages too).
 */
export async function breedPhotos(root: string, d: GalleryDeps, o: { limit?: number }) {
  const content = join(root, 'content')
  const triedFile = join(root, 'engine-state/_breed-photos.json')
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Record<string, string>
  const today = d.now().toISOString().slice(0, 10)
  const report = { done: [] as string[], failed: [] as string[], stopped: '' }
  const ids = (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()
  // A photo on another breed page stays there: Commons rarely says which line a fish is (red-tailed golden or super red).
  const used = new Set<string>()
  for (const id of ids) {
    const e = JSON.parse(await readFile(join(content, 'breeds', id, 'entity.json'), 'utf8')) as BreedEntity
    const g = JSON.parse(await readFile(join(content, 'gallery', `${id}.json`), 'utf8').catch(() => 'null')) as { photos: BreedEntity['photos'] } | null
    for (const p of [...e.photos, ...(g?.photos ?? [])]) used.add(p.sourceUrl)
  }
  for (const id of ids) {
    if (report.done.length + report.failed.length >= (o.limit ?? Infinity)) break
    if (tried[id] && d.now().getTime() - Date.parse(tried[id]) < 30 * 86_400_000) continue
    const file = join(content, 'breeds', id, 'entity.json')
    const e = JSON.parse(await readFile(file, 'utf8')) as BreedEntity
    if (e.photos.length) continue
    const vi = JSON.parse(await readFile(join(content, 'breeds', id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
    const name = id.replace(/-/g, ' ')
    try {
      const cands = (await commonsCandidates(name, d.http, 450, true)).filter(c => !used.has(c.sourceUrl))
      const photos = await screen(cands.slice(0, 300), name, vi.name ?? name, d, true)
      if (photos.length) await writeFile(file, `${JSON.stringify({ ...e, photos: photos.slice(0, 4) }, null, 2)}\n`)
      for (const p of photos) used.add(p.sourceUrl)
      if (photos.length > 4) {
        const gfile = join(content, 'gallery', `${id}.json`)
        const g = JSON.parse(await readFile(gfile, 'utf8').catch(() => 'null')) as { photos: BreedEntity['photos']; seen: number; updatedAt: string } | null
        const have = new Set(g?.photos.map(p => p.url))
        await mkdir(join(content, 'gallery'), { recursive: true })
        await writeFile(gfile, `${JSON.stringify(GallerySchema.parse({ id, photos: [...(g?.photos ?? []), ...photos.slice(4).filter(p => !have.has(p.url))], seen: (g?.seen ?? 0) + cands.length, updatedAt: g?.updatedAt ?? today }), null, 2)}\n`)
      }
      tried[id] = today
      report.done.push(`${id}: ${photos.length} of ${cands.length}`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message}`; break }
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`)
    }
  }
  await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort()), null, 2)}\n`)
  return report
}

const CARE_SCHEMA = {
  type: 'object', required: ['figures', 'sources', 'none'],
  properties: {
    figures: { type: 'array', items: { type: 'object', required: ['field', 'min', 'max', 'source', 'quote'], properties: { field: { type: 'string', enum: ['difficulty', 'lifeYears'] }, min: { type: 'number' }, max: { type: 'number' }, source: { type: 'number' }, quote: { type: 'string' } } } },
    sources: SOURCES_SCHEMA,
    none: { type: 'string' },
  },
}
type CareFound = { figures: { field: 'difficulty' | 'lifeYears'; min: number; max: number; source: number; quote: string }[]; sources: BreedFacts['sources']; none: string }
/** What breed-care did for a breed: when, the figures it added (each with its source's words), or why it found none. */
type CareTried = { at: string; added: string[]; none?: string }

const carePrompt = (name: string, e: BreedEntity, r: BreedFacts | null, want: string[]) => {
  const what = e.kind === 'hybrid' ? `a hybrid${e.parents.length ? ` of ${e.parents.map(p => p.name).join(' and ')}` : ''}` : `a ${e.kind === 'transgenic' ? 'transgenic fish' : 'line or colour form'}${r?.basedOn ? ` of ${r.basedOn}` : ''}`
  return `The aquarium fish "${name}"${r?.enNames.length ? ` (also ${r.enNames.filter(n => n !== name).join(', ')})` : ''} is a man-made fish: ${what}. Find on the web, for this fish itself: ${[want.includes('difficulty') && `its ${DIFFICULTY}`, want.includes('lifeYears') && `its ${LIFE_YEARS}`].filter(Boolean).join('; and ')}.

Use WebSearch and WebFetch. Its page already cites these sources: look at them first, then search for other care sheets and breeders' pages on it (in English, and in Vietnamese when that helps), also when a listed page fails to load.
${e.sources.map(s => `- ${s.title}: ${s.url}`).join('\n')}

Rules: ${ITS_OWN} Prefer breeders, long-time hobbyist articles and care sheets over shop copy. Never fetch Shopee, Lazada or Tiki pages. Each figure points at the index of its source in sources[], with quote: the source's own words that state it. If sources disagree, keep each figure with its own source. Leave out a figure no source states. none: why a figure asked for is missing and what was tried, in one sentence (empty when every one was found).`
}

/**
 * Difficulty and lifespan for breed pages whose care card lacks either (`pnpm engine breed-care`), as a breed researched
 * now gets them: one web research call a breed, for just those, each figure cited. Its figures join the card, and its new
 * sources the page's sources (by address: one it cites keeps its place); nothing else on the page changes. The research
 * kept for --redo (engine-state/breeds/<id>.json) gets them too. Each breed is tried once (engine-state/_breed-care.json:
 * what it added, or why it found none), recorded as it goes; out of the model's limit, it stops and records nothing.
 */
export async function breedCare(root: string, research: Llm, o: { only?: string[]; limit?: number; model?: string; now?: () => Date } = {}) {
  const content = join(root, 'content')
  const triedFile = join(root, 'engine-state/_breed-care.json')
  const tried = JSON.parse(await readFile(triedFile, 'utf8').catch(() => '{}')) as Record<string, CareTried>
  const today = (o.now?.() ?? new Date()).toISOString().slice(0, 10)
  const report = { done: [] as string[], none: [] as string[], failed: [] as string[], stopped: '' }
  const indent = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
  const same = (a: string, b: string) => a.replace(/\/$/, '') === b.replace(/\/$/, '')
  for (const id of (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()) {
    if (o.only && !o.only.includes(id)) continue
    if (report.done.length + report.none.length + report.failed.length >= (o.limit ?? Infinity)) break
    const file = join(content, 'breeds', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw || tried[id]) continue
    const e = JSON.parse(raw) as BreedEntity
    const want = (['difficulty', 'lifeYears'] as const).filter(f => !e.care[f]?.length)
    if (!want.length) continue
    const factsFile = join(root, 'engine-state/breeds', `${id}.json`)
    const factsRaw = await readFile(factsFile, 'utf8').catch(() => null)
    const facts = factsRaw ? JSON.parse(factsRaw) as BreedFacts : null
    const name = facts?.enNames[0] ?? id.replace(/-/g, ' ')
    let r: CareFound
    try {
      r = await research<CareFound>({ system: 'You research aquarium fish carefully and cite every fact. Reply only with JSON.', prompt: carePrompt(name, e, facts, want), schema: CARE_SCHEMA, model: o.model ?? 'sonnet' })
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message}`; break }
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 160)}`)
      continue
    }
    const added: string[] = []
    for (const f of r.figures ?? []) {
      const s = r.sources?.[f.source]
      const value = want.includes(f.field) ? careValue(f) : undefined
      if (!s || value === undefined || !/^https?:\/\/\S+$/i.test(s.url) || isMarketplace(s.url)) continue
      const source = { url: s.url, title: s.title, kind: s.kind }
      let at = e.sources.findIndex(x => same(x.url, s.url))
      if (at < 0) at = e.sources.push({ ...source, at: today }) - 1
      const values = (e.care[f.field] ??= [])
      if (values.some(v => v.source === at)) continue
      values.push({ source: at, value })
      if (facts) {
        let i = facts.sources.findIndex(x => same(x.url, s.url))
        if (i < 0) i = facts.sources.push(source) - 1
        const { min, max } = typeof value === 'number' ? { min: value, max: value } : value
        facts.care.push({ field: f.field, min, max, source: i })
      }
      added.push(`${f.field} ${typeof value === 'number' ? value : `${value.min}–${value.max}`}: "${String(f.quote ?? '').trim().slice(0, 200)}" (${s.url})`)
    }
    const none = r.none?.trim()
    if (added.length) {
      BreedSchema.parse(e)
      await writeFile(file, `${JSON.stringify(e, null, indent(raw))}\n`)
      if (facts) await writeFile(factsFile, `${JSON.stringify(facts, null, indent(factsRaw!))}\n`)
    }
    tried[id] = { at: today, added, ...(none ? { none } : {}) }
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(triedFile, `${JSON.stringify(Object.fromEntries(Object.entries(tried).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
    if (added.length) report.done.push(`${id}: ${added.join('; ')}`)
    else report.none.push(`${id}: ${none || 'nothing found'}`)
  }
  return report
}
