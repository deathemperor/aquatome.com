import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pageFish, speaksPageLang, type Lang } from '@aq/schema'
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
/**
 * A second read of each written title against the video's own title and the page's name for the fish: a fault of meaning
 * (a wrong fish, a wrong figure, something dropped or added, a claim made stronger or weaker) and the title isn't shown,
 * the video keeping its own (the chief of staff, 16 Nov). `titles`: YouTube id → the title written in `lang`. On Opus,
 * which it was tried on, unless `model` says otherwise. `record`: called with each batch's verdicts as it comes, so a run
 * stopped or killed keeps what it read (recordVerdicts). A video on the pages of more than one fish isn't read: the
 * writer gives it no title and records why, and no pass may undo that (`shared`). `unanswered`: titles sent whose row
 * the model left out; with those past a stop or in a failed batch, they stay unread, and the site shows their own title.
 * `verdicts`, the ones on file (--write): a title refused, or passed in its present words, isn't read again, and counts
 * toward the stop line (`prior`), so a run after a stop stops again before it reads anything.
 */
export async function checkVideoTitles(root: string, llm: Llm, lang: Lang, titles: Record<string, string>, o: { only?: string[]; model?: string; record?: (checks: Record<string, TitleCheck>) => Promise<void>; verdicts?: { refused: Record<string, string>; passed: Record<string, string> } } = {}) {
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
  const prior = { checked: 0, refused: 0 }
  for (const [id, row] of o.verdicts ? rows : []) {
    const refused = id in o.verdicts!.refused
    if (refused || o.verdicts!.passed[id] === row.written) { rows.delete(id); prior.checked++; if (refused) prior.refused++ }
  }
  const list = [...rows.values()]
  const report = { checks: {} as Record<string, TitleCheck>, failed: [] as string[], stopped: '', given: list.length, shared, unanswered: [] as string[], prior }
  const target = lang === 'vi' ? { lang: 'Vietnamese', country: 'Vietnam' } : TARGETS[lang as TargetLang]
  // At the first MARK titles checked and every MARK after, counted on all checked so far, those read before this run
  // included: over one in ten refused stops the language, what was checked kept as checked, and the chief of staff is
  // told before it is turned on.
  let marked = 0
  const stopLine = () => {
    const done = Object.values(report.checks), checked = prior.checked + done.length, mark = Math.floor(checked / MARK) * MARK
    if (mark <= marked) return
    marked = mark
    const refused = prior.refused + done.filter(c => !c.ok).length
    if (refused * 10 > checked) report.stopped = `over one in ten refused at ${mark} titles: ${refused} of ${checked}`
  }
  stopLine()
  for (let i = 0; i < list.length && !report.stopped; i += BATCH) {
    const batch = list.slice(i, i + BATCH)
    const prompt = `${PROMPT.replaceAll('{{LANG}}', target.lang).replaceAll('{{COUNTRY}}', target.country)}\n\n${batch.map((r, j) => `${j + 1}. [${r.about}] ${r.title}\n   ${target.lang}: ${r.written}`).join('\n')}`
    try {
      const r = await llm<{ checks: { n: number; ok: boolean; kind?: TitleCheck['kind']; why?: string }[] }>({ system: `You check the meaning of video titles written in ${target.lang}. Reply only with JSON.`, prompt, schema: SCHEMA, model: o.model ?? 'opus' })
      const answered: Record<string, TitleCheck> = {}
      for (const c of r.checks ?? []) {
        const row = batch[c.n - 1]
        // A row answered twice: a refusal wins (unsure means not shown).
        if (row && (!(row.youtubeId in answered) || (answered[row.youtubeId]!.ok && !c.ok))) answered[row.youtubeId] = c.ok ? { ok: true } : { ok: false, kind: c.kind, why: c.why }
      }
      report.unanswered.push(...batch.filter(row => !(row.youtubeId in answered)).map(row => row.youtubeId))
      Object.assign(report.checks, answered)
      if (o.record) await o.record(answered)
      stopLine()
    } catch (err) {
      if (err instanceof LlmError) report.stopped = err.message
      else report.failed.push((err as Error).message.slice(0, 200))
    }
  }
  return report
}

/** The command's usage: --out, or --write; --write reads and records the stored titles only, so never with --titles. */
export const checkUsage = (v: { out?: string; write?: boolean; titles?: string }) => Boolean(v.out || v.write) && !(v.write && v.titles)

/**
 * What a run says, and whether it ends with an error: any title left unread (a stop, a failed batch, a row the model left
 * out), or more than one in ten refused over every title read in these words, this run's and those before it, even under
 * the first mark of 200 (the chief of staff, 16 Nov: the language isn't turned on until they have heard).
 */
export function checkOutcome(lang: Lang, r: Awaited<ReturnType<typeof checkVideoTitles>>) {
  const checked = Object.keys(r.checks).length, refused = Object.values(r.checks).filter(c => !c.ok).length, unread = r.given - checked
  const lines = [`video-titles-check ${lang}: ${r.given} to read, ${checked} checked, ${refused} refused, ${unread} unread (${r.unanswered.length} left out by the model), ${r.failed.length} failed${r.stopped ? `, stopped (${r.stopped})` : ''}; read before in these words ${r.prior.checked}, ${r.prior.refused} of them refused; ${r.shared.length} on two fish's pages not read`]
  lines.push(...r.failed.slice(0, 10).map(x => `  ${x}`))
  let exitCode = 0
  if (unread || r.stopped || r.failed.length) {
    lines.push(`  ${unread} titles unread: the site shows their videos' own titles until a run reads them`)
    exitCode = 1
  }
  const all = checked + r.prior.checked, allRefused = refused + r.prior.refused
  if (allRefused * 10 > all) {
    lines.push(`  over one in ten refused (${allRefused} of ${all}): stop, and tell the chief of staff before ${lang} is turned on`)
    exitCode = 1
  }
  return { lines, exitCode }
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
