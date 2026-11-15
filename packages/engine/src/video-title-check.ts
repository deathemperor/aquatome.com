import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { speaksPageLang, type Lang } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { TARGETS, type TargetLang } from './localize'

const PROMPT = readFileSync(new URL('./prompts/video-title-check.md', import.meta.url), 'utf8')
const KINDS = ['wrong fish', 'wrong figure', 'dropped', 'added', 'strength'] as const
const SCHEMA = { type: 'object', required: ['checks'], properties: { checks: { type: 'array', items: { type: 'object', required: ['n', 'ok'], properties: { n: { type: 'number' }, ok: { type: 'boolean' }, kind: { type: 'string', enum: [...KINDS] }, why: { type: 'string' } } } } } }
const BATCH = 40

export type TitleCheck = { ok: boolean; kind?: (typeof KINDS)[number]; why?: string }

/**
 * A second read of each written title against the video's own title and the page's name for the fish: a fault of meaning
 * (a wrong fish, a wrong figure, something dropped or added, a claim made stronger or weaker) and the title isn't shown,
 * the video keeping its own (the chief of staff, 16 Nov). `titles`: YouTube id → the title written in `lang`.
 */
export async function checkVideoTitles(root: string, llm: Llm, lang: Lang, titles: Record<string, string>, o: { only?: string[]; model?: string } = {}) {
  type Row = { youtubeId: string; title: string; written: string; about: string }
  const rows = new Map<string, Row>()
  const read = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as T | null
  for (const kind of ['species', 'products']) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const t = await read<{ name?: string }>(join(root, 'content', kind, id, `${lang}.json`))
      if (!t) continue
      const e = await read<{ scientificName?: string; name?: string; videos?: { youtubeId: string; title: string; lang: string }[]; reviews?: { videos: { youtubeId: string; title: string; lang: string }[] } }>(join(root, 'content', kind, id, 'entity.json'))
      const name = t.name ?? e?.name ?? id
      for (const v of e?.videos ?? e?.reviews?.videos ?? []) {
        const written = titles[v.youtubeId]
        if (!written || speaksPageLang(v, lang) || (o.only && !o.only.includes(v.youtubeId))) continue
        // Every page the video sits on, so a title named for one of them can't pass as right for all (the editors, round 10).
        const page = e?.scientificName ? `${name}, ${e.scientificName}` : name
        const row = rows.get(v.youtubeId)
        if (row) { if (!row.about.split(' | ').includes(page)) row.about += ` | ${page}` } else rows.set(v.youtubeId, { youtubeId: v.youtubeId, title: v.title, written, about: page })
      }
    }
  }
  const list = [...rows.values()]
  const report = { checks: {} as Record<string, TitleCheck>, failed: [] as string[], stopped: '' }
  const target = lang === 'vi' ? { lang: 'Vietnamese', country: 'Vietnam' } : TARGETS[lang as TargetLang]
  for (let i = 0; i < list.length && !report.stopped; i += BATCH) {
    const batch = list.slice(i, i + BATCH)
    const prompt = `${PROMPT.replaceAll('{{LANG}}', target.lang).replaceAll('{{COUNTRY}}', target.country)}\n\n${batch.map((r, j) => `${j + 1}. [${r.about}] ${r.title}\n   ${target.lang}: ${r.written}`).join('\n')}`
    try {
      const r = await llm<{ checks: { n: number; ok: boolean; kind?: TitleCheck['kind']; why?: string }[] }>({ system: `You check the meaning of video titles written in ${target.lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model })
      for (const c of r.checks ?? []) {
        const row = batch[c.n - 1]
        if (row) report.checks[row.youtubeId] = c.ok ? { ok: true } : { ok: false, kind: c.kind, why: c.why }
      }
    } catch (err) {
      if (err instanceof LlmError) report.stopped = err.message
      else report.failed.push((err as Error).message.slice(0, 200))
    }
  }
  return report
}

/**
 * Each refusal and its reason into content/video-titles/<lang>.refused.json (YouTube id → why), where the site shows that
 * video's own title, marked; a title that now passes comes off it. Sorted, as the title files are.
 */
export async function recordRefusals(root: string, lang: Lang, checks: Record<string, TitleCheck>) {
  const file = join(root, 'content/video-titles', `${lang}.refused.json`)
  await mkdir(join(root, 'content/video-titles'), { recursive: true })
  const refused = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string>
  for (const [id, c] of Object.entries(checks)) if (c.ok) delete refused[id]; else refused[id] = `${c.kind ?? 'unsure'}: ${c.why ?? ''}`.trim()
  await writeFile(file, `${JSON.stringify(Object.fromEntries(Object.entries(refused).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)
}
