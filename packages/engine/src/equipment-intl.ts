import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EquipmentSchema, QUALITY_THRESHOLD } from '@aq/schema'
import { isVietnamese } from '@aq/schema/text'
import { LlmError, type Llm } from './claude'
import { TARGETS, type TargetLang } from './localize'
import { sanitizeHtml } from './sanitize'

const WRITE = readFileSync(new URL('./prompts/equipment-intl.md', import.meta.url), 'utf8')
const REVIEW = readFileSync(new URL('./prompts/equipment-intl-review.md', import.meta.url), 'utf8')
type Text = { name: string; lead: string; intro: string; types: { id: string; name: string; desc: string; pick: string }[]; choose: string[]; mistakes: string[]; faq: { q: string; a: string }[] }
const str = { type: 'string' }
const strs = { type: 'array', items: str }
const SCHEMA = {
  type: 'object', required: ['name', 'lead', 'intro', 'types', 'choose', 'mistakes', 'faq'],
  properties: {
    name: str, lead: str, intro: str, choose: strs, mistakes: strs,
    types: { type: 'array', items: { type: 'object', required: ['id', 'name', 'desc', 'pick'], properties: { id: str, name: str, desc: str, pick: str } } },
    faq: { type: 'array', items: { type: 'object', required: ['q', 'a'], properties: { q: str, a: str } } },
  },
}
const fill = (s: string, lang: TargetLang) => s.replaceAll('{{LANG}}', TARGETS[lang].lang).replaceAll('{{COUNTRY}}', TARGETS[lang].country).replace('{{STYLE}}', TARGETS[lang].style)

/**
 * The equipment buying guides (content/equipment/<category>.json) in another site language: translated from the
 * Vietnamese, leaving out what is only about Vietnam, scored against it (one retry on the reviewer's notes; the better one
 * is kept, indexable at the usual threshold). content/equipment/<lang>/<category>.json keeps the guide's photos and type
 * matching as they are. Guides already done are skipped unless redo.
 */
export async function localizeEquipment(root: string, llm: Llm, lang: TargetLang, o: { only?: string[]; redo?: boolean; model?: string } = {}) {
  const dir = join(root, 'content/equipment')
  const report = { done: [] as string[], skipped: [] as string[], failed: [] as string[], stopped: '' }
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.json')).sort()) {
    const cat = f.replace(/\.json$/, '')
    if (o.only && !o.only.includes(cat)) continue
    const out = join(dir, lang, f)
    if (!o.redo && (await readFile(out, 'utf8').then(() => true, () => false))) { report.skipped.push(cat); continue }
    try {
      const vi = EquipmentSchema.parse(JSON.parse(await readFile(join(dir, f), 'utf8')))
      const src: Text = { name: vi.name, lead: vi.lead, intro: vi.intro, types: vi.types.map(t => ({ id: t.id, name: t.name, desc: t.desc, pick: t.pick })), choose: vi.choose, mistakes: vi.mistakes, faq: vi.faq }
      const write = (notes: string[]) => llm<Text>({
        system: `You translate aquarium buying guides into ${TARGETS[lang].lang}. Reply only with JSON.`, schema: SCHEMA, model: o.model ?? 'opus',
        prompt: `${fill(WRITE, lang)}${notes.length ? `\n\nA reviewer scored the previous translation low. Fix these:\n${notes.map(n => `- ${n}`).join('\n')}` : ''}\n\n--- GUIDE (Vietnamese) ---\n${JSON.stringify(src, null, 1)}`,
      })
      const review = async (w: Text) => {
        const r = await llm<{ score: number; notes: string[] }>({
          system: `You are a strict Vietnamese→${TARGETS[lang].lang} translation reviewer. Reply only with JSON.`,
          schema: { type: 'object', required: ['score', 'notes'], properties: { score: { type: 'number' }, notes: strs } },
          prompt: `${fill(REVIEW, lang)}\n\nVIETNAMESE:\n${JSON.stringify(src)}\n\n${lang.toUpperCase()}:\n${JSON.stringify(w)}`,
        })
        // Vietnamese left in the text is a failed translation whatever the reviewer says.
        const left = isVietnamese(JSON.stringify(w))
        return { score: left ? Math.min(0.5, Number(r.score) || 0) : Math.min(1, Math.max(0, Number(r.score) || 0)), notes: [...(left ? ['Vietnamese text is left in the translation: translate it or leave it out.'] : []), ...(r.notes ?? [])].slice(0, 10) }
      }
      let w = await write([])
      let r = await review(w)
      if (r.score < QUALITY_THRESHOLD || r.notes.length) {
        const again = await write(r.notes)
        const r2 = await review(again)
        if (r2.score > r.score) { w = again; r = r2 }
      }
      const types = vi.types.map(t => {
        const x = w.types.find(y => y.id === t.id)
        return x ? { ...t, name: x.name.trim(), desc: sanitizeHtml(x.desc), pick: x.pick.trim() } : null
      })
      if (types.some(t => !t)) throw new Error('translation left out a type')
      const t = EquipmentSchema.parse({
        ...vi, name: w.name.trim(), lead: w.lead.trim(), intro: sanitizeHtml(w.intro), types,
        choose: w.choose.map(sanitizeHtml).filter(Boolean), mistakes: w.mistakes.map(sanitizeHtml).filter(Boolean),
        faq: w.faq.filter(x => x.q.trim() && x.a.trim()).map(x => ({ q: x.q.trim(), a: sanitizeHtml(x.a) })),
        quality: { score: r.score, indexable: r.score >= QUALITY_THRESHOLD },
      })
      await mkdir(join(dir, lang), { recursive: true })
      await writeFile(out, `${JSON.stringify(t, null, 2)}\n`)
      report.done.push(`${cat}: ${t.name} (${r.score})${r.notes.length ? `\n  - ${r.notes.join('\n  - ')}` : ''}`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${cat}: ${err.message}`; break }
      report.failed.push(`${cat}: ${(err as Error).message.slice(0, 200)}`)
    }
  }
  return report
}
