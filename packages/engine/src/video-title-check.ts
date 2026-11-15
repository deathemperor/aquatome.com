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
/** Every this many titles checked, a language's refusals so far are counted; over one in ten stops it there (the chief of staff, 16 Nov). */
export const MARK = 200

export type TitleCheck = { ok: boolean; kind?: (typeof KINDS)[number]; why?: string }

/** What a page is about, for the rule that a video on the pages of more than one fish gets no title: its scientific name, or a product's page. */
export const pageFish = (kind: string, id: string, e: { scientificName?: string } | null | undefined) => e?.scientificName ?? `${kind}/${id}`

/**
 * A second read of each written title against the video's own title and the page's name for the fish: a fault of meaning
 * (a wrong fish, a wrong figure, something dropped or added, a claim made stronger or weaker) and the title isn't shown,
 * the video keeping its own (the chief of staff, 16 Nov). `titles`: YouTube id → the title written in `lang`. On Opus,
 * which it was tried on, unless `model` says otherwise. `record`: called with each batch's verdicts as it comes, so a run
 * stopped or killed keeps what it read (recordVerdicts). A video on the pages of more than one fish isn't read: the
 * writer gives it no title and records why, and no pass may undo that (`shared`). `unanswered`: titles sent whose row
 * the model left out; with those past a stop or in a failed batch, they stay unread, and the site shows their own title.
 */
export async function checkVideoTitles(root: string, llm: Llm, lang: Lang, titles: Record<string, string>, o: { only?: string[]; model?: string; record?: (checks: Record<string, TitleCheck>) => Promise<void> } = {}) {
  type Row = { youtubeId: string; title: string; written: string; about: string }
  const rows = new Map<string, Row>()
  const about = new Map<string, Set<string>>()
  const read = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8').catch(() => 'null')) as T | null
  for (const kind of ['species', 'products']) {
    for (const id of (await readdir(join(root, 'content', kind)).catch(() => [] as string[])).sort()) {
      const t = await read<{ name?: string }>(join(root, 'content', kind, id, `${lang}.json`))
      if (!t) continue
      const e = await read<{ scientificName?: string; name?: string; videos?: { youtubeId: string; title: string; lang: string }[]; reviews?: { videos: { youtubeId: string; title: string; lang: string }[] } }>(join(root, 'content', kind, id, 'entity.json'))
      const name = t.name ?? e?.name ?? id
      for (const v of e?.videos ?? e?.reviews?.videos ?? []) {
        if (speaksPageLang(v, lang)) continue
        about.set(v.youtubeId, (about.get(v.youtubeId) ?? new Set()).add(pageFish(kind, id, e)))
        const written = titles[v.youtubeId]
        if (!written || rows.has(v.youtubeId) || (o.only && !o.only.includes(v.youtubeId))) continue
        rows.set(v.youtubeId, { youtubeId: v.youtubeId, title: v.title, written, about: e?.scientificName ? `${name}, ${e.scientificName}` : name })
      }
    }
  }
  const shared = [...rows.keys()].filter(id => about.get(id)!.size > 1)
  for (const id of shared) rows.delete(id)
  const list = [...rows.values()]
  const report = { checks: {} as Record<string, TitleCheck>, failed: [] as string[], stopped: '', given: list.length, shared, unanswered: [] as string[] }
  const target = lang === 'vi' ? { lang: 'Vietnamese', country: 'Vietnam' } : TARGETS[lang as TargetLang]
  let marked = 0
  for (let i = 0; i < list.length && !report.stopped; i += BATCH) {
    const batch = list.slice(i, i + BATCH)
    const prompt = `${PROMPT.replaceAll('{{LANG}}', target.lang).replaceAll('{{COUNTRY}}', target.country)}\n\n${batch.map((r, j) => `${j + 1}. [${r.about}] ${r.title}\n   ${target.lang}: ${r.written}`).join('\n')}`
    try {
      const r = await llm<{ checks: { n: number; ok: boolean; kind?: TitleCheck['kind']; why?: string }[] }>({ system: `You check the meaning of video titles written in ${target.lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model ?? 'opus' })
      const answered: Record<string, TitleCheck> = {}
      for (const c of r.checks ?? []) {
        const row = batch[c.n - 1]
        if (row && !(row.youtubeId in answered)) answered[row.youtubeId] = c.ok ? { ok: true } : { ok: false, kind: c.kind, why: c.why }
      }
      report.unanswered.push(...batch.filter(row => !(row.youtubeId in answered)).map(row => row.youtubeId))
      Object.assign(report.checks, answered)
      if (o.record) await o.record(answered)
      // At the first MARK titles checked and every MARK after, counted on all checked so far: over one in ten refused stops
      // the language, what was checked kept as checked, and the chief of staff is told before it is turned on.
      const done = Object.values(report.checks), mark = Math.floor(done.length / MARK) * MARK
      if (mark > marked) {
        marked = mark
        const refused = done.filter(c => !c.ok).length
        if (refused * 10 > done.length) report.stopped = `over one in ten refused at ${mark} titles: ${refused} of ${done.length}`
      }
    } catch (err) {
      if (err instanceof LlmError) report.stopped = err.message
      else report.failed.push((err as Error).message.slice(0, 200))
    }
  }
  return report
}

const readMap = async (file: string) => JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string>
/** A map written sorted, as the title files are; untouched where nothing changed, so a run that changes nothing leaves no file behind. */
const saveMap = async (file: string, before: Record<string, string>, after: Record<string, string>) => {
  const sorted = Object.fromEntries(Object.entries(after).sort(([a], [b]) => a.localeCompare(b)))
  if (JSON.stringify(sorted) !== JSON.stringify(Object.fromEntries(Object.entries(before).sort(([a], [b]) => a.localeCompare(b))))) await writeFile(file, `${JSON.stringify(sorted, null, 2)}\n`)
}

/**
 * The check's verdicts into content/video-titles/: each refusal and its reason in <lang>.refused.json (YouTube id → why),
 * where the site shows that video's own title, marked; each pass with the words it passed in <lang>.passed.json, which
 * alone let a title show translated once its language is on (videosForPage). A pass never clears a refusal: a second
 * read of the same words is no new word on them (the reviewers of the check, 16 Nov). New words from the writer clear
 * both (forgetVerdicts). `titles`: the words each verdict was given on.
 */
export async function recordVerdicts(root: string, lang: Lang, checks: Record<string, TitleCheck>, titles: Record<string, string> = {}) {
  const dir = join(root, 'content/video-titles'), refusedFile = join(dir, `${lang}.refused.json`), passedFile = join(dir, `${lang}.passed.json`)
  await mkdir(dir, { recursive: true })
  const refusedBefore = await readMap(refusedFile), passedBefore = await readMap(passedFile)
  const refused = { ...refusedBefore }, passed = { ...passedBefore }
  for (const [id, c] of Object.entries(checks)) {
    if (!c.ok) { refused[id] = `${c.kind ?? 'unsure'}: ${c.why ?? ''}`.trim(); delete passed[id] }
    else if (!(id in refused) && titles[id] !== undefined) passed[id] = titles[id]
  }
  await saveMap(refusedFile, refusedBefore, refused)
  await saveMap(passedFile, passedBefore, passed)
}

/** A video's verdicts taken off, where the writer has given it new words: they were on the old ones, and the new are unread. */
export async function forgetVerdicts(root: string, lang: Lang, ids: string[]) {
  if (!ids.length) return
  const dir = join(root, 'content/video-titles'), refusedFile = join(dir, `${lang}.refused.json`), passedFile = join(dir, `${lang}.passed.json`)
  const refusedBefore = await readMap(refusedFile), passedBefore = await readMap(passedFile)
  const refused = { ...refusedBefore }, passed = { ...passedBefore }
  for (const id of ids) { delete refused[id]; delete passed[id] }
  await saveMap(refusedFile, refusedBefore, refused)
  await saveMap(passedFile, passedBefore, passed)
}
