import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, slugify, TranslationSchema, type Section } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { pickSlug } from './merge'
import { sanitizeHtml } from './sanitize'

const WRITE = readFileSync(new URL('./prompts/localize.md', import.meta.url), 'utf8')
const REVIEW = readFileSync(new URL('./prompts/localize-review.md', import.meta.url), 'utf8')

/** Site languages besides Vietnamese, and how each is written. */
export const TARGETS = {
  id: {
    lang: 'Indonesian (Bahasa Indonesia)', country: 'Indonesia',
    style: `Style: natural, plain Bahasa Indonesia, friendly but not slangy, addressing the reader neutrally (no "gue/lo"). Use the words Indonesian aquarists use: akuarium, ikan hias, tanaman air, aquascape, filter, suhu, pH, kesadahan (GH), ganti air, siklus nitrogen, karantina, pakan. Decimal comma (1,5), ranges with an en dash (22–26 °C). Live and frozen foods as Indonesian shops name them: cacing darah (bloodworm), cacing sutra (tubifex), kutu air (daphnia, moina), artemia (brine shrimp), pelet, pakan serpihan (flakes). Bubble nest: sarang busa.`,
  },
  th: {
    lang: 'Thai', country: 'Thailand',
    style: `Style: natural, plain written Thai, neutral and polite without spoken particles (no ครับ/ค่ะ). Use the words Thai aquarists use: ตู้ปลา, ปลาสวยงาม, ไม้น้ำ, อุณหภูมิ, ค่า pH, ความกระด้าง (GH), เปลี่ยนน้ำ, ระบบกรอง, วงจรไนโตรเจน, กักโรค, อาหารปลา. Decimal point (1.5), ranges with an en dash (22–26 °C); units in running text the Thai way (ซม., ลิตร), the symbols °C and pH as they are. Live and frozen foods as Thai shops name them: หนอนแดง (bloodworm), ไส้เดือนน้ำ (tubifex), ไรแดง (moina, daphnia), ไรทะเล (brine shrimp, artemia), อาหารเม็ด (pellets), อาหารแผ่น (flakes). Bubble nest: หวอด.`,
  },
} as const
export type TargetLang = keyof typeof TARGETS

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
 * Species pages in another site language: each section translated from its English source (entity.json), with the
 * names hobbyists in that country use, scored against the English (one retry on the reviewer's notes; the better one
 * is kept, indexable at the usual threshold). content/species/<id>/<lang>.json; engine-state/localize-<lang>.json
 * keeps each page's name confidence and the source date it was made from. Pages already done are skipped unless redo.
 */
export async function localizeSpecies(root: string, llm: Llm, lang: TargetLang, ids: string[], o: { redo?: boolean; model?: string; now?: () => Date; english?: (sci: string) => Promise<string>; /** Stop after this many pages made. */ limit?: number } = {}) {
  const dir = join(root, 'content/species')
  const stateFile = join(root, `engine-state/localize-${lang}.json`)
  const state = JSON.parse(await readFile(stateFile, 'utf8').catch(() => '{}')) as Record<string, { at: string; from: string; name: string; confidence: string; score: number; notes?: string[] }>
  const taken = new Set<string>()
  for (const kind of ['species', 'breeds']) for (const id of await readdir(join(root, 'content', kind)).catch(() => [] as string[])) {
    const t = JSON.parse(await readFile(join(root, 'content', kind, id, `${lang}.json`), 'utf8').catch(() => '{}')) as { slug?: string }
    if (t.slug && !ids.includes(id)) taken.add(t.slug)
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
      const e = JSON.parse(await readFile(join(dir, id, 'entity.json'), 'utf8')) as { scientificName: string; family: string; sections: Section[]; updatedAt: string }
      // Done, and made from the English as it is now: nothing to do. A page whose English changed since is made again.
      const done = await readFile(file, 'utf8').then(() => true, () => false)
      if (!o.redo && done && (state[id]?.from ?? '') >= e.updatedAt) { report.skipped.push(id); continue }
      const parts = e.sections.filter(s => s.html.trim() && translatable(s.source)).map(s => ({ id: `${s.key}:${s.source}`, en: s.html }))
      if (!parts.length) { report.skipped.push(`${id}: no English`); continue }
      // The species' English name (Wikipedia's title for it) points the translator at the trade name; the page's own text
      // may be about one strain or hybrid of it, so the name is asked for the species.
      const english = (await o.english?.(e.scientificName).catch(() => undefined)) ?? e.scientificName
      const species = `${e.scientificName} (family ${e.family})${english !== e.scientificName ? `, in English "${english}"` : ''}. The names are for the species as a whole, never for one strain, colour form or hybrid the text may describe`
      let w = await write(llm, lang, species, parts, [], o.model)
      let r = await review(llm, lang, parts, w.parts)
      if (r.score < QUALITY_THRESHOLD) {
        const again = await write(llm, lang, species, parts, r.notes, o.model)
        const r2 = await review(llm, lang, parts, again.parts)
        if (r2.score > r.score) { w = again; r = r2 }
      }
      const name = w.name.trim()
      // A page keeps its address once made (a redo never moves it); Thai script has no Latin slug, so Thai pages are
      // addressed by the scientific name.
      const prev = JSON.parse(await readFile(file, 'utf8').catch(() => 'null')) as { slug: string } | null
      const slug = prev?.slug ?? pickSlug(lang === 'th' || !slugify(name) ? e.scientificName : name, e.scientificName, taken)
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
