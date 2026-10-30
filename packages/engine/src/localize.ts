import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, slugify, TranslationSchema, type Section } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { pickSlug } from './merge'
import { sanitizeHtml } from './sanitize'

const WRITE = readFileSync(new URL('./prompts/localize.md', import.meta.url), 'utf8')
const REVIEW = readFileSync(new URL('./prompts/localize-review.md', import.meta.url), 'utf8')
const GLOSSARY = readFileSync(new URL('./prompts/localize-glossary.md', import.meta.url), 'utf8')
const GLOSSARY_REVIEW = readFileSync(new URL('./prompts/localize-glossary-review.md', import.meta.url), 'utf8')
const PLACES = readFileSync(new URL('./prompts/localize-places.md', import.meta.url), 'utf8')

/** Site languages besides Vietnamese, and how each is written. */
export const TARGETS = {
  id: {
    lang: 'Indonesian (Bahasa Indonesia)', country: 'Indonesia', place: 'indonesia',
    style: `Style: natural, plain Bahasa Indonesia, friendly but not slangy, addressing the reader neutrally (no "gue/lo"). Use the words Indonesian aquarists use: akuarium, ikan hias, tanaman air, aquascape, filter, suhu, pH, kesadahan (GH), ganti air, siklus nitrogen, karantina, pakan. Decimal comma (1,5), ranges with an en dash (22–26 °C). Live and frozen foods as Indonesian shops name them: cacing darah (bloodworm), cacing sutra (tubifex), kutu air (daphnia, moina), artemia (brine shrimp), pelet, pakan serpihan (flakes). Bubble nest: sarang busa. Ich / white spot: penyakit bintik putih (white spot). Hillstream loaches and stone-clinging stream fish: hillstream loach, never a made-up "loach sungai".`,
  },
  th: {
    lang: 'Thai', country: 'Thailand', place: 'thailand',
    style: `Style: natural, plain written Thai, neutral and polite without spoken particles (no ครับ/ค่ะ). Use the words Thai aquarists use: ตู้ปลา, ปลาสวยงาม, ไม้น้ำ, อุณหภูมิ, ค่า pH, ความกระด้าง (GH), เปลี่ยนน้ำ, ระบบกรอง, วงจรไนโตรเจน, กักโรค, อาหารปลา. Decimal point (1.5), ranges with an en dash (22–26 °C); units in running text the Thai way (ซม., ลิตร), the symbols °C and pH as they are. Live and frozen foods as Thai shops name them: หนอนแดง (bloodworm), ไส้เดือนน้ำ (tubifex), ไรแดง (moina, daphnia), ไรทะเล (brine shrimp, artemia), อาหารเม็ด (pellets), อาหารแผ่น (flakes). Bubble nest: หวอด.`,
  },
} as const
export type TargetLang = keyof typeof TARGETS

/** Species found wild in a place (content/places id): listed under it, or under a region, river or island inside it. */
export async function nativeTo(root: string, place: string): Promise<Set<string>> {
  const parent = new Map<string, string>()
  for (const id of await readdir(join(root, 'content/places')).catch(() => [] as string[])) {
    const p = JSON.parse(await readFile(join(root, 'content/places', id, 'entity.json'), 'utf8').catch(() => '{}')) as { parent?: string }
    if (p.parent) parent.set(id, p.parent)
  }
  const within = (p: string) => { for (let at: string | undefined = p, n = 0; at && n < 10; at = parent.get(at), n++) if (at === place) return true; return false }
  const out = new Set<string>()
  for (const id of (await readdir(join(root, 'content/species'))).sort()) {
    const e = JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { places?: string[] }
    if ((e.places ?? []).some(within)) out.add(id)
  }
  return out
}

const fill = (s: string, lang: TargetLang, species = '') =>
  s.replaceAll('{{LANG}}', TARGETS[lang].lang).replaceAll('{{COUNTRY}}', TARGETS[lang].country).replace('{{STYLE}}', TARGETS[lang].style).replace('{{SPECIES}}', species)

const SCHEMA = {
  type: 'object', required: ['name', 'altNames', 'nameConfidence', 'parts'],
  properties: {
    name: { type: 'string' }, altNames: { type: 'array', items: { type: 'string' } }, nameConfidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    parts: { type: 'array', items: { type: 'object', required: ['id', 'text'], properties: { id: { type: 'string' }, text: { type: 'string' } } } },
  },
}
type Written = { name: string; altNames: string[]; nameConfidence: 'high' | 'medium' | 'low'; parts: { id: string; text: string }[] }
const REVIEW_SCHEMA = { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } } }

/** One page's English parts → the language's text and names; HTML stays HTML, plain stays plain, every part present. */
async function write(llm: Llm, lang: TargetLang, species: string, parts: { id: string; en: string }[], notes: string[], model?: string) {
  const prompt = [
    fill(WRITE, lang, species),
    ...(notes.length ? [`A reviewer scored the previous translation low. Fix these:\n${notes.map(n => `- ${n}`).join('\n')}`] : []),
    `--- PARTS ---\n${parts.map(p => `### ${p.id}\n${p.en}`).join('\n\n')}`,
  ].join('\n\n')
  const r = await llm<Written>({ system: `You translate aquarium-handbook pages into ${TARGETS[lang].lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model })
  // A part may come back empty: the rules drop sales talk and bylines, and some parts are nothing else. The reviewer
  // sees it marked as left out, so a part with real content dropped scores low; a page with nothing left fails.
  const out = new Map<string, string>()
  for (const p of parts) {
    const text = r.parts.find(x => x.id === p.id)?.text.trim() ?? ''
    out.set(p.id, !text ? '' : /<[a-z]/i.test(p.en) ? sanitizeHtml(text) : text.replace(/<[^>]+>/g, '').trim())
  }
  if (![...out.values()].some(Boolean)) throw new Error('translation left out every part')
  return { ...r, parts: out }
}

async function review(llm: Llm, lang: TargetLang, parts: { id: string; en: string }[], done: Map<string, string>) {
  const pairs = parts.map((p, i) => `### ${i + 1}\nEN:\n${p.en}\n${lang.toUpperCase()}:\n${done.get(p.id) || '(left out)'}`).join('\n\n')
  const r = await llm<{ score: number; notes: string[] }>({ system: `You are a strict English→${TARGETS[lang].lang} translation reviewer. Reply only with JSON.`, prompt: `${fill(REVIEW, lang)}\n\n${pairs.slice(0, 80_000)}`, schema: REVIEW_SCHEMA })
  return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10) }
}

/**
 * Species (or plant) pages in another site language: each section translated from its English source (entity.json),
 * with the names hobbyists in that country use, scored against the English (one retry on the reviewer's notes; the
 * better one is kept, indexable at the usual threshold). content/<kind>/<id>/<lang>.json; engine-state/localize-<lang>.json
 * (plants: localize-<lang>-plants.json) keeps each page's name confidence and the source date it was made from. Pages
 * already done are skipped unless redo.
 */
export async function localizeSpecies(root: string, llm: Llm, lang: TargetLang, ids: string[], o: { redo?: boolean; model?: string; now?: () => Date; english?: (sci: string) => Promise<string>; /** Stop after this many pages made. */ limit?: number; kind?: 'species' | 'plants' } = {}) {
  const kind = o.kind ?? 'species'
  const dir = join(root, 'content', kind)
  const stateFile = join(root, `engine-state/localize-${lang}${kind === 'plants' ? '-plants' : ''}.json`)
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as Record<string, { at: string; from: string; name: string; confidence: string; score: number; notes?: string[] }>
  const taken = new Set<string>()
  // Addresses are per section: species and breeds share /ca/, plants have /cay/.
  for (const k of kind === 'plants' ? ['plants'] : ['species', 'breeds']) for (const id of await readdir(join(root, 'content', k)).catch(() => [] as string[])) {
    const t = JSON.parse(await readFile(join(root, 'content', k, id, `${lang}.json`), 'utf8').catch(() => '{}')) as { slug?: string }
    if (t.slug) taken.add(t.slug) // a page's own address in here is harmless: a page with a file keeps its address
  }
  // Only text whose source allows translation (its permission scope says so) is translated.
  const sourceInfo = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8')) as Record<string, { permission?: { scope: string[] } }>
  const translatable = (source: string) => !!sourceInfo[source]?.permission?.scope.includes('translation')
  const save = async () => {
    await mkdir(join(root, 'engine-state'), { recursive: true })
    await writeFile(stateFile, `${JSON.stringify(Object.fromEntries(Object.entries(state).sort()), null, 2)}\n`)
  }
  const report = { done: [] as string[], skipped: [] as string[], failed: [] as string[], stopped: '' }
  for (const id of ids) {
    if (report.done.length >= (o.limit ?? Infinity)) break
    const file = join(dir, id, `${lang}.json`)
    try {
      const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { scientificName: string; family?: string; sections: Section[]; updatedAt: string }
      // Done, and made from the English as it is now: nothing to do. A page whose English changed since is made again.
      const done = await readFile(file, 'utf8').then(() => true, () => false)
      if (!o.redo && done && (state[id]?.from ?? '') >= e.updatedAt) { report.skipped.push(id); continue }
      const parts = e.sections.filter(s => s.html.trim() && translatable(s.source)).map(s => ({ id: `${s.key}:${s.source}`, en: s.html }))
      if (!parts.length) { report.skipped.push(`${id}: no English`); continue }
      // The species' English name (Wikipedia's title for it) points the translator at the trade name. A fish page's text
      // may be about one strain or hybrid of it, so the name is asked for the species; a plant page is about exactly the
      // cultivar or variety it names (Anubias barteri 'Mini Coin' has its own page), so that keeps its name.
      const english = (await o.english?.(e.scientificName).catch(() => undefined)) ?? e.scientificName
      // A plant's Vietnamese page names the trade form ("Bucephalandra Silver" where the scientific name is just "sp.").
      const vi = kind === 'plants' ? (JSON.parse(await readFile(join(dir, id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }).name : undefined
      const species = `${e.scientificName}${e.family ? ` (family ${e.family})` : ''}${english !== e.scientificName ? `, in English "${english}"` : ''}${vi ? `, sold in Vietnam as "${vi}"` : ''}. ${kind === 'plants'
        ? 'The names are for exactly this plant: a cultivar or variety keeps its cultivar or variety name (as sellers write it, e.g. "Anubias Mini Coin"), never just the species name'
        : 'The names are for the species as a whole, never for one strain, colour form or hybrid the text may describe'}`
      let w = await write(llm, lang, species, parts, [], o.model)
      let r = await review(llm, lang, parts, w.parts)
      if (r.score < QUALITY_THRESHOLD) {
        const again = await write(llm, lang, species, parts, r.notes, o.model)
        const r2 = await review(llm, lang, parts, again.parts)
        if (r2.score > r.score) { w = again; r = r2 }
      }
      const name = w.name.trim()
      // A page keeps its address once made (a redo never moves it); Thai script has no Latin slug, so Thai pages are
      // addressed by the scientific name, and so is the second of two pages with one name.
      const prev = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { slug: string } | null
      const named = lang !== 'th' && slugify(name) ? pickSlug(name, '', new Set()) : ''
      const slug = prev?.slug ?? (named && !taken.has(named) ? named : pickSlug(e.scientificName, lang, taken))
      taken.add(slug)
      const sources = [...new Set(e.sections.filter(s => translatable(s.source)).map(s => s.source))]
      const t = TranslationSchema.parse({
        slug, name, altNames: [...new Set(w.altNames.map(n => n.trim()).filter(n => n && n !== name))].slice(0, 5),
        sections: Object.fromEntries(parts.filter(p => w.parts.get(p.id)).map(p => [p.id, w.parts.get(p.id)!])),
        quality: { score: r.score, indexable: r.score >= QUALITY_THRESHOLD, bySource: Object.fromEntries(sources.map(s => [s, r.score])) },
      })
      await writeFile(file, `${JSON.stringify(t, null, 2)}\n`)
      state[id] = { at: (o.now?.() ?? new Date()).toISOString().slice(0, 10), from: e.updatedAt, name, confidence: w.nameConfidence, score: r.score, notes: r.notes }
      await save() // after every page: a stopped batch doesn't redo what it finished
      report.done.push(`${id}: ${name} (${w.nameConfidence}, ${r.score})`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${id}: ${err.message}`; break }
      report.failed.push(`${id}: ${(err as Error).message.slice(0, 200)}`)
    }
  }
  await save()
  return report
}

const GLOSSARY_SCHEMA = {
  type: 'object', required: ['terms'],
  properties: { terms: { type: 'array', items: { type: 'object', required: ['id', 'name', 'altNames', 'definition'], properties: { id: { type: 'string' }, name: { type: 'string' }, altNames: { type: 'array', items: { type: 'string' } }, definition: { type: 'string' } } } } },
}
type Term = { id: string; name: string; altNames: string[]; definition: string }

/**
 * Glossary terms in another site language, written from the Vietnamese entry (AquaTome's own text) and the English
 * term, in batches; each batch scored (one retry on the reviewer's notes). content/glossary/<id>/<lang>.json; Thai
 * terms are addressed by the English term. A term the reply leaves out is not written (asked again next time); terms
 * already done are skipped unless redo, and a redo keeps the address.
 */
export async function localizeGlossary(root: string, llm: Llm, lang: TargetLang, o: { redo?: boolean; model?: string; batch?: number; /** Only these terms. */ only?: string[] } = {}) {
  const dir = join(root, 'content/glossary')
  const taken = new Set<string>()
  const todo: { id: string; en: string; latin?: string; vi: { name: string; definition?: string }; slug?: string }[] = []
  for (const id of (await readdir(dir)).sort()) {
    const prev = JSON.parse(await readFile(join(dir, id, `${lang}.json`), 'utf8').catch(() => 'null')) as { slug: string } | null
    if (prev) taken.add(prev.slug)
    if ((prev && !o.redo) || (o.only && !o.only.includes(id))) continue
    const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { en: string; latin?: string }
    const vi = JSON.parse(await readFile(join(dir, id, 'vi.json'), 'utf8')) as { name: string; definition?: string }
    todo.push({ id, en: e.en, latin: e.latin, vi, slug: prev?.slug })
  }
  const report = { done: [] as string[], failed: [] as string[], stopped: '', /** Each batch's score and the reviewer's notes. */ reviews: [] as string[] }
  // Small batches: a batch is scored by its worst entry, so one bad term holds back only a few good ones.
  const size = o.batch ?? 8
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size)
    const terms = batch.map(x => `### ${x.id}\nEnglish: ${x.en}${x.latin ? ` (${x.latin})` : ''}\nVietnamese: ${x.vi.name}: ${x.vi.definition ?? ''}`).join('\n\n')
    const write = (notes: string[]) => llm<{ terms: Term[] }>({
      system: `You write an aquarium-handbook glossary in ${TARGETS[lang].lang}. Reply only with JSON.`, schema: GLOSSARY_SCHEMA, model: o.model,
      prompt: [fill(GLOSSARY, lang), ...(notes.length ? [`A reviewer scored the previous entries low. Fix these:\n${notes.map(n => `- ${n}`).join('\n')}`] : []), `--- TERMS ---\n${terms}`].join('\n\n'),
    })
    const review = async (w: { terms: Term[] }) => {
      const pairs = batch.map(x => { const t = w.terms.find(y => y.id === x.id); return `### ${x.id}\nEN: ${x.en}\nVI: ${x.vi.name}: ${x.vi.definition ?? ''}\n${lang.toUpperCase()}: ${t ? `${t.name}: ${t.definition}` : '(left out)'}` }).join('\n\n')
      const r = await llm<{ score: number; notes: string[] }>({ system: `You are a strict Vietnamese→${TARGETS[lang].lang} reviewer of an aquarium glossary. Reply only with JSON.`, prompt: `${fill(GLOSSARY_REVIEW, lang)}\n\n${pairs}`, schema: REVIEW_SCHEMA })
      return { score: Math.min(1, Math.max(0, Number(r.score) || 0)), notes: (r.notes ?? []).slice(0, 10) }
    }
    try {
      let w = await write([])
      let r = await review(w)
      if (r.score < QUALITY_THRESHOLD) {
        const again = await write(r.notes)
        const r2 = await review(again)
        if (r2.score > r.score) { w = again; r = r2 }
      }
      report.reviews.push(`${batch[0]!.id}…: ${r.score}${r.notes.length ? `\n  - ${r.notes.join('\n  - ')}` : ''}`)
      for (const x of batch) {
        const got = w.terms.find(t => t.id === x.id)
        const name = got?.name.trim() ?? ''
        const definition = got?.definition.replace(/<[^>]+>/g, '').trim() ?? ''
        if (!name || !definition) { report.failed.push(`${x.id}: left out`); continue }
        const slug = x.slug ?? pickSlug(lang === 'th' || !slugify(name) ? x.en : name, lang === 'id' ? 'istilah' : 'term', taken)
        taken.add(slug)
        const t = TranslationSchema.parse({
          slug, name, altNames: [...new Set(got!.altNames.map(n => n.trim()).filter(n => n && n !== name))].slice(0, 4), sections: {}, definition,
          quality: { score: r.score, indexable: r.score >= QUALITY_THRESHOLD },
        })
        await writeFile(join(dir, x.id, `${lang}.json`), `${JSON.stringify(t, null, 2)}\n`)
        report.done.push(x.id)
      }
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = (err as Error).message; break }
      report.failed.push(...batch.map(x => `${x.id}: ${(err as Error).message.slice(0, 200)}`))
    }
  }
  // The site links a term's names wherever they appear in running text: other names are kept only when they can't be
  // an everyday word (several words, or an abbreviation such as NH3, dGH) and no other term has them.
  const files = (await readdir(dir)).map(id => join(dir, id, `${lang}.json`))
  const all = (await Promise.all(files.map(f => readFile(f, 'utf8').then(s => ({ f, t: JSON.parse(s) as { name: string; altNames: string[] } }), () => null)))).filter(x => x !== null)
  const uses = new Map<string, number>()
  for (const { t } of all) for (const n of new Set([t.name, ...t.altNames].map(n => n.toLowerCase()))) uses.set(n, (uses.get(n) ?? 0) + 1)
  const linkable = (n: string) => (/\s/.test(n.trim()) || /[A-Z].*[A-Z0-9]|\d/.test(n)) && uses.get(n.toLowerCase()) === 1
  for (const { f, t } of all) {
    const kept = t.altNames.filter(linkable)
    if (kept.length !== t.altNames.length) await writeFile(f, `${JSON.stringify({ ...t, altNames: kept }, null, 2)}\n`)
  }
  return report
}

const PLACES_SCHEMA = { type: 'object', required: ['places'], properties: { places: { type: 'array', items: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } } } } }
const VIETNAMESE = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđơư]/i

/**
 * Place names (continents, countries, rivers, regions) in another site language, in batches, each batch checked once by
 * a reviewer. content/places/<id>/<lang>.json (addressed by the place's id, as in Vietnamese). A place left without a
 * name, or given a Vietnamese one, is not written (asked again next time); places already done are skipped unless redo.
 */
export async function localizePlaces(root: string, llm: Llm, lang: TargetLang, o: { redo?: boolean; model?: string; batch?: number } = {}) {
  const dir = join(root, 'content/places')
  const todo: { id: string; line: string }[] = []
  for (const id of (await readdir(dir)).sort()) {
    if (!o.redo && (await readFile(join(dir, id, `${lang}.json`), 'utf8').then(() => true, () => false))) continue
    const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { kind: string; parent?: string }
    const vi = JSON.parse(await readFile(join(dir, id, 'vi.json'), 'utf8').catch(() => '{}')) as { name?: string }
    todo.push({ id, line: `### ${id} (${e.kind}${e.parent ? `, in ${e.parent}` : ''}): ${vi.name ?? id}` })
  }
  const report = { done: [] as string[], failed: [] as string[], stopped: '', reviews: [] as string[] }
  const size = o.batch ?? 100
  for (let i = 0; i < todo.length; i += size) {
    const batch = todo.slice(i, i + size)
    try {
      const w = await llm<{ places: { id: string; name: string }[] }>({ system: `You name places in ${TARGETS[lang].lang}. Reply only with JSON.`, schema: PLACES_SCHEMA, model: o.model, prompt: `${fill(PLACES, lang)}\n\n--- PLACES ---\n${batch.map(x => x.line).join('\n')}` })
      const named = new Map(w.places.map(p => [p.id, p.name.trim()]))
      const r = await llm<{ score: number; notes: string[] }>({
        system: `You check ${TARGETS[lang].lang} place names. Reply only with JSON.`, schema: REVIEW_SCHEMA,
        prompt: `Score 0–1 how correct these ${TARGETS[lang].lang} place names are, as an atlas in ${TARGETS[lang].country} writes them (1.0 all right; below 0.75 any wrong place, or a name not in ${TARGETS[lang].lang}). notes: the wrong ones, quoted.\n\n${batch.map(x => `${x.line} → ${named.get(x.id) || '(none)'}`).join('\n')}`,
      })
      const score = Math.min(1, Math.max(0, Number(r.score) || 0))
      report.reviews.push(`${batch[0]!.id}…: ${score}${r.notes?.length ? `\n  - ${r.notes.slice(0, 10).join('\n  - ')}` : ''}`)
      for (const x of batch) {
        const name = named.get(x.id) ?? ''
        if (!name || VIETNAMESE.test(name)) { report.failed.push(`${x.id}: no name`); continue }
        const t = TranslationSchema.parse({ slug: x.id, name, altNames: [], sections: {}, quality: { score, indexable: score >= QUALITY_THRESHOLD } })
        await writeFile(join(dir, x.id, `${lang}.json`), `${JSON.stringify(t, null, 2)}\n`)
        report.done.push(x.id)
      }
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = (err as Error).message; break }
      report.failed.push(...batch.map(x => `${x.id}: ${(err as Error).message.slice(0, 200)}`))
    }
  }
  return report
}
