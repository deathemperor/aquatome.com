import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { speaksPageLang, VideoTitlesSchema, type Lang } from '@aq/schema'
import { isVietnamese } from '@aq/schema/text'
import { LlmError, type Llm } from './claude'
import { TARGETS, type TargetLang } from './localize'

const PROMPT = readFileSync(new URL('./prompts/video-titles.md', import.meta.url), 'utf8')
const SCHEMA = { type: 'object', required: ['titles'], properties: { titles: { type: 'array', items: { type: 'object', required: ['n', 'title'], properties: { n: { type: 'number' }, title: { type: 'string' } } } } } }
const BATCH = 40
const THAI = /[฀-๿]/
const VI = { lang: 'Vietnamese', country: 'Vietnam', style: 'Style: plain written Vietnamese, as aquarium hobbyists in Vietnam write it: "bể", "cá", "thay nước", "cây thủy sinh". No phrasing that reads as translated from English.' }

type Video = { youtubeId: string; title: string; lang: string }
type Page = { t?: { name?: string }; name?: string }
type Todo = Video & { about: string }

/** Whether a translated title can be kept: written in the page's language, and not the foreign title handed back. */
export function titleFits(text: string, original: string, lang: Lang): boolean {
  if (!text) return false
  if (lang === 'th') return THAI.test(text)
  if (lang === 'vi') return text !== original || isVietnamese(text)
  return !isVietnamese(text)
}

/**
 * Video titles in a page's language (the owner's report, 2026-11-10: a Vietnamese page listing English titles). For every
 * language's pages that have videos, each video not spoken in that language, once: content/video-titles/<lang>.json,
 * YouTube id → title. The loader shows them (videosForPage). `limit`: model calls this run, 40 titles each.
 */
export async function translateVideoTitles(root: string, llm: Llm, lang: Lang, o: { limit?: number; parallel?: number; model?: string } = {}) {
  const file = join(root, 'content/video-titles', `${lang}.json`)
  const done = VideoTitlesSchema.parse(JSON.parse(await readFile(file, 'utf8').catch(() => '{}')))
  const save = async () => {
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(done).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
  }
  const read = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as T | null
  const todo = new Map<string, Todo>()
  for (const kind of ['species', 'products']) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const t = await read<Page>(join(root, 'content', kind, id, `${lang}.json`))
      if (!t) continue
      const e = await read<{ scientificName?: string; name?: string; videos?: Video[]; reviews?: { videos: Video[] } }>(join(root, 'content', kind, id, 'entity.json'))
      const name = t.t?.name ?? t.name ?? e?.name ?? id
      for (const v of e?.videos ?? e?.reviews?.videos ?? []) {
        if (speaksPageLang(v, lang) || v.youtubeId in done || todo.has(v.youtubeId)) continue
        todo.set(v.youtubeId, { ...v, about: e?.scientificName ? `${name}, ${e.scientificName}` : name })
      }
    }
  }
  const rows = [...todo.values()]
  const batches = Array.from({ length: Math.ceil(rows.length / BATCH) }, (_, i) => rows.slice(i * BATCH, (i + 1) * BATCH))
  const target = lang === 'vi' ? VI : TARGETS[lang as TargetLang]
  const report = { titles: 0, rejected: [] as string[], failed: [] as string[], stopped: '', left: rows.length }
  const calls = batches.slice(0, o.limit ?? batches.length)
  let next = 0
  const work = async () => {
    while (next < calls.length && !report.stopped) {
      const batch = calls[next++]!
      try {
        const prompt = `${PROMPT.replaceAll('{{LANG}}', target.lang).replaceAll('{{COUNTRY}}', target.country).replace('{{STYLE}}', target.style)}\n\n${batch.map((v, j) => `${j + 1}. [${v.about}] ${v.title}`).join('\n')}`
        const r = await llm<{ titles: { n: number; title: string }[] }>({ system: `You translate video titles into ${target.lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model })
        for (const x of r.titles ?? []) {
          const v = batch[x.n - 1]
          if (!v) continue
          const text = x.title?.trim().replace(/\.$/, '').slice(0, 140) ?? ''
          if (titleFits(text, v.title, lang)) { done[v.youtubeId] = text; report.titles++; report.left-- } else report.rejected.push(`${v.youtubeId}: ${v.title} -> ${text}`)
        }
        await save() // after every batch: a stopped run keeps what it finished
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= err.message
        else report.failed.push((err as Error).message.slice(0, 200))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, o.parallel ?? 1) }, work))
  return report
}
