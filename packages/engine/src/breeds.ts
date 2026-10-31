import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BreedSchema, GallerySchema, nameKey, QUALITY_THRESHOLD, slugify, TranslationSchema, type BreedEntity, type Translation } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { commonsCandidates, screen, type GalleryDeps } from './gallery'
import { pickSlug } from './merge'
import { sanitizeHtml } from './sanitize'
import { localName, TARGETS, type TargetLang } from './localize'

const WRITE = readFileSync(new URL('./prompts/breed.md', import.meta.url), 'utf8')
const STYLE = readFileSync(new URL('./prompts/vi-style.md', import.meta.url), 'utf8')
const INTL = readFileSync(new URL('./prompts/breed-intl.md', import.meta.url), 'utf8')

type Sourced = { fact: string; source: number }
type CareField = 'tempC' | 'ph' | 'gh' | 'sizeCm' | 'tankCm'
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
    care: { type: 'array', items: { type: 'object', required: ['field', 'min', 'max', 'source'], properties: { field: { type: 'string', enum: ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm'] }, min: { type: 'number' }, max: { type: 'number' }, source: { type: 'number' } } } },
    keeping: sourced, breeding: sourced, health: sourced, buying: sourced, controversy: sourced,
    commons: { type: 'string' },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'title', 'kind'], properties: { url: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string', enum: ['breeder', 'shop', 'article', 'forum', 'video', 'paper', 'other'] } } } },
  },
}

export type BreedAsk = { name: string; kind?: BreedEntity['kind']; basedOn?: string }

const researchPrompt = (a: BreedAsk) => `Research the aquarium fish "${a.name}" for a Vietnamese aquarium handbook. It is a man-made fish without a scientific name of its own: a hybrid, a line or colour form bred within one species, or a transgenic fish${a.kind ? ` (expected: ${a.kind})` : ''}. Use WebSearch and WebFetch. Search in English and in Vietnamese (the names Vietnamese hobbyists and shops use, Vietnamese forums and articles), and in the languages of the countries where it was developed when that helps.

Collect facts, each pointing at the index of its source in sources[]:
- found: false if this is not a recognised aquarium fish, or if it is a wild species with its own scientific name.
- kind: hybrid (two or more species crossed), variety (a line, strain or colour form bred within one species), transgenic.
- enNames: its English names. viNames: the names Vietnamese hobbyists and shops use, each with its source.
- basedOn: for a variety, the valid scientific name of its species.
- parents: for a hybrid, each parent species or fish as sources give it, with its scientific name when known; certain = false when its role is disputed or a guess.
- origin: who developed it, where and when.
- looks: the traits that define it and how hobbyists judge a good one. lines: named sub-lines or strains and what sets each apart.
- care: temperature (°C), pH, GH, adult size (cm), minimum tank length (cm) as ranges (min = max for a single figure), each from a source. Convert units.
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

const GROUNDED = `Below are FACTS gathered about a man-made aquarium fish and a Vietnamese PAGE written from them. Score 0–1 how well the PAGE sticks to the FACTS: 1.0 = every claim, number, origin, name and recommendation in the page is supported by the facts; 0.75 = small unsupported generalities; below 0.75 = an invented number, origin, parent, line, scientific name or claim, or a fact turned around.
notes: up to 10 unsupported or wrong claims (in English), quoting the phrase. Empty if none.`

const BOUNDS: Record<CareField, [number, number]> = { tempC: [4, 40], ph: [2, 10.5], gh: [0, 50], sizeCm: [0.3, 300], tankCm: [10, 1000] }

/** Research → what a page may use: only web links are kept as sources (`at`: a source's position among them), and a fact
 * whose source was dropped goes with it, so every claim on the page is cited. */
function webFacts(r: BreedFacts) {
  const web = r.sources.map(s => /^https?:\/\/\S+$/i.test(s.url))
  const at = (i: number) => (web[i] ? web.slice(0, i).filter(Boolean).length : -1)
  const cited = <T extends { source: number }>(xs: T[]) => xs.filter(x => at(x.source) >= 0)
  const facts: BreedFacts = { ...r, viNames: cited(r.viNames), parents: cited(r.parents), origin: cited(r.origin), looks: cited(r.looks), lines: cited(r.lines), care: cited(r.care), keeping: cited(r.keeping), breeding: cited(r.breeding), health: cited(r.health), buying: cited(r.buying), controversy: cited(r.controversy) }
  return { web, at, facts }
}

/** Scientific name → species id, from the species pages we have. */
async function speciesIds(content: string): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (const id of await readdir(join(content, 'species')).catch(() => [] as string[])) {
    const e = JSON.parse(await readFile(join(content, 'species', id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }
    if (e.scientificName) out.set(e.scientificName.toLowerCase(), id)
  }
  return out
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
  const researched = kept ?? await d.research<BreedFacts>({ system: 'You research aquarium fish carefully and cite every fact. Reply only with JSON.', prompt: researchPrompt(a), schema: FACTS_SCHEMA, model: o.researchModel ?? 'opus' })
  if (!kept) { await mkdir(join(root, 'engine-state/breeds'), { recursive: true }); await writeFile(factsFile, `${JSON.stringify(researched, null, 2)}\n`) }
  if (!researched.found) return { id, skipped: `${a.name}: not a man-made aquarium fish, or not found` }

  const { web, at, facts } = webFacts(researched)
  const ids = await speciesIds(content)
  // "Vieja melanurus (syn. Vieja synspila)": the name before any synonym note.
  const sci = (name?: string) => name?.replace(/\s*\(.*$/, '').trim() || undefined
  const species = (name?: string) => (sci(name) ? ids.get(sci(name)!.toLowerCase()) : undefined)

  const forWriter = { name: a.name, kind: facts.kind, enNames: facts.enNames, viNames: facts.viNames, basedOn: facts.basedOn, parents: facts.parents, origin: facts.origin, looks: facts.looks, lines: facts.lines, care: facts.care, keeping: facts.keeping, breeding: facts.breeding, health: facts.health, buying: facts.buying, controversy: facts.controversy }
  const write = (notes?: string[]) => d.llm<Written>({
    system: 'You write Vietnamese aquarium fish profiles from facts. Reply only with JSON.', model: o.writeModel ?? 'opus', schema: WRITE_SCHEMA,
    prompt: `${WRITE}\n\n${STYLE}${notes?.length ? `\n\nBản trước có chỗ vượt quá dữ kiện. Sửa theo các ghi chú sau, chỉ viết điều dữ kiện có:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- DỮ KIỆN ---\n${JSON.stringify(forWriter, null, 1)}`,
  })
  const check = async (x: Written) => {
    const r = await d.llm<{ score: number; notes: string[] }>({ system: 'You check a page against its facts. Reply only with JSON.', prompt: `${GROUNDED}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nPAGE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  }
  let w = await write()
  let review = await check(w)
  // Any claim beyond the facts: one rewrite with the checker's notes; the better-grounded page is kept.
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
    if (r.score > review.score) { w = again; review = r }
  }

  // Photos: its Commons category (else a search for its name), screened for this line only, best first.
  // A rewrite from kept research keeps the photos already screened.
  const dir = join(content, 'breeds', id)
  const prevPhotos = kept ? JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8').catch(() => 'null')) as BreedEntity | null : null
  const prevGallery = prevPhotos ? JSON.parse(await readFile(join(content, 'gallery', `${id}.json`), 'utf8').catch(() => 'null')) as { photos: BreedEntity['photos']; seen: number } | null : null
  const enName = facts.enNames[0] ?? a.name
  const cands = prevPhotos ? [] : await commonsCandidates((facts.commons ?? enName).replace(/^Category:/i, '').trim(), d.gallery.http, 450, !facts.commons)
  const photos = prevPhotos ? [...prevPhotos.photos, ...(prevGallery?.photos ?? [])] : await screen(cands.slice(0, 300), enName, w.name, d.gallery, true)
  const seen = prevPhotos ? prevGallery?.seen ?? photos.length : cands.length

  const today = d.gallery.now().toISOString().slice(0, 10)
  const prev = JSON.parse(await readFile(join(dir, 'vi.json'), 'utf8').catch(() => 'null')) as Translation | null
  const care: BreedEntity['care'] = {}
  for (const c of facts.care) {
    const [lo, hi] = BOUNDS[c.field] ?? [NaN, NaN]
    // Temperatures converted from °F come as 18.3–22.2: whole degrees.
    const round = (v: number) => (c.field === 'tempC' ? Math.round(v) : v)
    const min = round(Math.min(c.min, c.max))
    const max = round(Math.max(c.min, c.max))
    if (!(min >= lo && max <= hi) || at(c.source) < 0) continue
    ;(care[c.field] ??= []).push({ source: at(c.source), value: min === max ? min : { min, max } })
  }
  const basedOn = a.basedOn ?? species(facts.basedOn)
  const entity: BreedEntity = BreedSchema.parse({
    id, kind: facts.kind,
    ...(basedOn ? { basedOn } : {}),
    // The writer's Vietnamese name for each parent when it gave one per parent; else the researched name.
    parents: facts.parents.map((p, i) => ({ name: (w.parentNames?.length === facts.parents.length && w.parentNames[i]?.trim()) || (sci(p.scientificName) ? `${p.name} (${sci(p.scientificName)})` : p.name), ...(species(p.scientificName) ? { species: species(p.scientificName) } : {}), certain: p.certain })),
    care, photos: photos.slice(0, 4), ...(facts.commons ? { commons: facts.commons } : {}),
    sources: facts.sources.filter((_, i) => web[i]).map(s => ({ ...s, at: today })), updatedAt: today,
  })
  // A name the owner fixed, and the addresses it had before, survive a --redo.
  const name = (prev?.nameFixed ? prev.name : w.name).trim()
  const vi: Translation = TranslationSchema.parse({
    slug: prev?.slug ?? pickSlug(name.replace(/\s*\(.*\)\s*$/, ''), facts.kind === 'hybrid' ? 'lai' : 'dong', await speciesSlugs(content)),
    // Other names, minus those the title already holds ("Cá hồng két (Blood parrot cichlid)").
    name, altNames: [...new Set([...w.altNames, ...facts.enNames, ...facts.viNames.map(v => v.name)].map(s => s.trim()).filter(s => s && !name.toLowerCase().includes(s.toLowerCase())))],
    sections: {}, body: sanitizeHtml(w.body), summary: w.summary.map(s => s.trim()).filter(Boolean), faq: w.faq.filter(f => f.q.trim() && f.a.trim()),
    quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
    ...(prev?.nameFixed ? { nameFixed: true } : {}), ...(prev?.redirectFrom ? { redirectFrom: prev.redirectFrom } : {}),
  })
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(entity, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), `${JSON.stringify(vi, null, 2)}\n`)
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
  const check = async (x: Written) => {
    const r = await llm<{ score: number; notes: string[] }>({ system: 'You check a page against its facts. Reply only with JSON.', prompt: `${GROUNDED.replace('Vietnamese PAGE', `${T.lang} PAGE`)}\n\nFACTS:\n${JSON.stringify(forWriter)}\n\nPAGE:\n${x.name}\n${x.summary.join('\n')}\n${sanitizeHtml(x.body)}\n${x.faq.map(f => `${f.q} ${f.a}`).join('\n')}`, schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } } })
    return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: r.notes ?? [] }
  }
  let w = await write()
  let review = await check(w)
  if (review.score < QUALITY_THRESHOLD || review.notes.length) {
    const again = await write(review.notes)
    const r = await check(again)
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
  const name = localName(w.name, prev, names, forWriter.name)
  const slug = prev?.slug ?? pickSlug(lang === 'th' || !slugify(name) ? w.slug : name.replace(/\s*\(.*\)\s*$/, ''), lang === 'id' ? 'ikan' : 'fish', taken)
  // The Vietnamese page's own names are not names in this language.
  const viNames = new Set([vi.name, ...vi.altNames].map(n => n.toLowerCase()))
  const t = TranslationSchema.parse({
    slug, name, altNames: [...new Set([w.name, ...w.altNames].map(n => n.trim()).filter(n => n && !viNames.has(n.toLowerCase()) && !name.toLowerCase().includes(n.toLowerCase())))],
    sections: {}, body: sanitizeHtml(w.body), summary: w.summary.map(s => s.trim()).filter(Boolean), faq: w.faq.filter(f => f.q.trim() && f.a.trim()),
    ...(w.parentNames?.length && w.parentNames.length === facts.parents.length ? { parents: w.parentNames.map(n => n.trim()) } : {}),
    quality: { score: review.score, indexable: review.score >= QUALITY_THRESHOLD },
    ...(prev?.nameFixed ? { nameFixed: true } : {}),
  })
  await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
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
