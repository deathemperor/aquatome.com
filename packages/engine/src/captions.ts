import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CaptionsSchema } from '@aq/schema'
import { isVietnamese } from '@aq/schema/text'
import { LlmError, type Llm } from './claude'
import { TARGETS, type TargetLang } from './localize'

const PROMPT = readFileSync(new URL('./prompts/captions-intl.md', import.meta.url), 'utf8')
const SCHEMA = { type: 'object', required: ['captions'], properties: { captions: { type: 'array', items: { type: 'object', required: ['n', 'text'], properties: { n: { type: 'number' }, text: { type: 'string' } } } } } }
const BATCH = 40
const THAI = /[฀-๿]/

type Photos = { photos?: { caption?: string }[] }

/**
 * Photo captions written in Vietnamese (galleries, breed photos, guide photos) in another site language, for the pages that language
 * has: one call per page, given the page's name in that language so the captions use it. content/captions/<lang>.json,
 * keyed by the Vietnamese caption; the site shows the translation, and leaves a caption off until it has one.
 */
export async function localizeCaptions(root: string, llm: Llm, lang: TargetLang, o: { /** Pages to do. */ limit?: number; model?: string } = {}) {
  const file = join(root, 'content/captions', `${lang}.json`)
  const done = CaptionsSchema.parse(JSON.parse(await readFile(file, 'utf8').catch(() => '{}')))
  const save = async () => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(done).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  }
  const read = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as T | null
  const pages: { id: string; subject: string; todo: string[] }[] = []
  for (const kind of ['species', 'breeds', 'plants', 'guides']) for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
    const t = await read<{ name: string }>(join(root, 'content', kind, id, `${lang}.json`))
    if (!t) continue
    const e = await read<Photos & { scientificName?: string }>(join(root, 'content', kind, id, 'entity.json'))
    const g = await read<Photos>(join(root, 'content/gallery', `${id}.json`))
    const todo = [...new Set([...(e?.photos ?? []), ...(g?.photos ?? [])].map(p => p.caption ?? '').filter(c => c && isVietnamese(c) && !(c in done)))]
    if (todo.length) pages.push({ id, subject: `"${t.name}"${e?.scientificName ? ` (${e.scientificName})` : ''}`, todo })
  }
  const report = { done: [] as string[], failed: [] as string[], stopped: '', left: 0 }
  for (const p of pages) {
    if (report.done.length >= (o.limit ?? Infinity)) { report.left++; continue }
    try {
      for (let i = 0; i < p.todo.length; i += BATCH) {
        const batch = p.todo.slice(i, i + BATCH)
        const prompt = `${PROMPT.replaceAll('{{LANG}}', TARGETS[lang].lang).replaceAll('{{COUNTRY}}', TARGETS[lang].country).replace('{{SUBJECT}}', p.subject)}\n\n${batch.map((c, j) => `${j + 1}. ${c}`).join('\n')}`
        const r = await llm<{ captions: { n: number; text: string }[] }>({ system: `You translate photo captions into ${TARGETS[lang].lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model })
        for (const x of r.captions ?? []) {
          const vi = batch[x.n - 1]
          const text = x.text?.trim().replace(/\.$/, '')
          // Kept only if it reads as the language: no Vietnamese left in it, and Thai written in Thai.
          if (vi && text && !isVietnamese(text) && (lang !== 'th' || THAI.test(text))) done[vi] = text.slice(0, 160)
        }
      }
      await save() // after every page: a stopped run keeps what it finished
      report.done.push(`${p.id}: ${p.todo.filter(c => c in done).length}/${p.todo.length}`)
    } catch (err) {
      if (err instanceof LlmError) { report.stopped = `${p.id}: ${err.message}`; break }
      report.failed.push(`${p.id}: ${(err as Error).message.slice(0, 200)}`)
    }
  }
  return report
}
