import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, type GuideEntity, type Section, type Translation } from '@aq/schema'
import { OTHER_LANGS } from '@aq/schema/langs'
import { LlmError, type Llm } from './claude'
import { placeLine, review as reviewLocalized, reviewPlaces, translatableIn, type TargetLang } from './localize'
import { reviewTranslation } from './quality'
import { itemReviews, logReviews, readReviews, reviewKey, type PageRef, type ReviewKind } from './review-log'
import { reviewDraft, throttled, VIDEO_GAP_MS, type YouTube } from './youtube'

/**
 * Pages under the bar whose review left no notes (it ran before reviews were kept), reviewed again as they are, nothing
 * rewritten: each gets its review's score and notes in engine-state/reviews (attempt "recheck"). Per kind, `limit` model
 * calls a run; `only` pages (ids, as `youtube-<id>` or `species/<id>`) are reviewed again whatever their score and notes.
 *
 * - video-guide: the guide against its transcript (yt; the video job's, on the Mac). The videos the owner added first,
 *   then the lowest scores.
 * - translation: a Vietnamese species or plant page's text from one source, against that source's English. A guide
 *   translated from a source keeps no English to check against, so it waits for its next translation.
 * - localize: an Indonesian or Thai species or plant page, against the English.
 * - places: Indonesian and Thai place names, a batch a call.
 */
export const BACKFILL_KINDS = ['video-guide', 'translation', 'localize', 'places'] as const satisfies readonly ReviewKind[]
export type BackfillKind = (typeof BACKFILL_KINDS)[number]

export type BackfillDeps = { root: string; llm: Llm; now: () => Date; yt?: YouTube; sleep?: (ms: number) => Promise<void> }
export type BackfillReport = { checked: string[]; failed: string[]; stopped: string; left: Partial<Record<BackfillKind, number>> }

type Job = { page: PageRef; score: number; first?: boolean }
const json = async <T>(f: string): Promise<T | null> => { try { return JSON.parse(await readFile(f, 'utf8')) as T } catch { return null } }
const list = (dir: string) => readdir(dir).catch(() => [] as string[])

/** The jobs of a kind: pages under the bar (`all`: every page), the owner's first, then the lowest scores. */
async function jobs(root: string, kind: BackfillKind, all = false): Promise<Job[]> {
  const content = join(root, 'content')
  const out: Job[] = []
  const under = (q?: { score: number }) => !!q && (all || q.score < QUALITY_THRESHOLD)
  if (kind === 'video-guide') {
    const owners = new Set(((await json<{ id: string; by?: string }[]>(join(root, 'engine-state/youtube-videos.json'))) ?? []).filter(v => v.by === 'owner').map(v => `youtube-${v.id}`))
    for (const id of (await list(join(content, 'guides'))).filter(d => d.startsWith('youtube-'))) {
      const q = (await json<Translation>(join(content, 'guides', id, 'vi.json')))?.quality
      if (under(q)) out.push({ page: { id: `guides/${id}`, lang: 'vi' }, score: q!.score, first: owners.has(id) })
    }
  } else if (kind === 'translation') {
    for (const dir of ['species', 'plants']) for (const id of await list(join(content, dir))) {
      const q = (await json<Translation>(join(content, dir, id, 'vi.json')))?.quality
      for (const [part, score] of Object.entries(q?.bySource ?? {})) if (under({ score })) out.push({ page: { id: `${dir}/${id}`, lang: 'vi', part }, score })
    }
  } else {
    const dirs = kind === 'places' ? ['places'] : ['species', 'plants']
    for (const lang of OTHER_LANGS) for (const dir of dirs) for (const id of await list(join(content, dir))) {
      const q = (await json<Translation>(join(content, dir, id, `${lang}.json`)))?.quality
      if (under(q)) out.push({ page: { id: `${dir}/${id}`, lang }, score: q!.score })
    }
  }
  return out.sort((a, b) => Number(!!b.first) - Number(!!a.first) || a.score - b.score || reviewKey(a.page).localeCompare(reviewKey(b.page)))
}

const matches = (only: string[], p: PageRef) => only.some(x => p.id === x || p.id.endsWith(`/${x}`) || reviewKey(p) === x)

export async function reviewBackfill(d: BackfillDeps, o: { kinds?: readonly BackfillKind[]; limit: number; only?: string[] }): Promise<BackfillReport> {
  const report: BackfillReport = { checked: [], failed: [], stopped: '', left: {} }
  const content = join(d.root, 'content')
  const recheck = () => ({ recheck: true, now: d.now() })
  for (const kind of o.kinds ?? BACKFILL_KINDS) {
    if (report.stopped) break
    const traced = await readReviews(d.root, kind)
    const todo = (await jobs(d.root, kind, !!o.only)).filter(j => (o.only ? matches(o.only, j.page) : !traced[reviewKey(j.page)]?.some(t => t.kept)))
    let calls = 0
    const next = () => calls < o.limit && !report.stopped
    if (kind === 'places') {
      // A batch a call, by language: each place gets the batch's score and the notes about it.
      for (const lang of OTHER_LANGS) {
        const mine = todo.filter(j => j.page.lang === lang)
        for (let i = 0; i < mine.length && next(); i += 100) {
          const batch = mine.slice(i, i + 100)
          const ids = batch.map(j => j.page.id.slice('places/'.length))
          try {
            const lines = await Promise.all(ids.map(id => placeLine(join(content, 'places'), id)))
            const named = new Map(await Promise.all(ids.map(async id => [id, (await json<Translation>(join(content, 'places', id, `${lang}.json`)))?.name ?? ''] as [string, string])))
            const r = await reviewPlaces(d.llm, lang, lines, named)
            calls++
            for (const [k, j] of batch.entries()) {
              const it = itemReviews([r], r, lines.map(l => [l.id, l.line.replace(/^### [^:]*: /, ''), named.get(l.id) ?? '']), k)
              await logReviews(d.root, 'places', j.page, it.tries, it.kept, recheck())
            }
            report.checked.push(`places ${lang}: ${batch.length} names, ${r.score.toFixed(2)} (was ${Math.min(...batch.map(j => j.score)).toFixed(2)})`)
          } catch (e) {
            if (e instanceof LlmError) { report.stopped = `places ${lang}: ${e.message}`; break }
            report.failed.push(`places ${lang}: ${(e as Error).message.slice(0, 200)}`)
          }
        }
      }
      report.left[kind] = Math.max(0, todo.length - calls * 100)
      continue
    }
    const translatable = kind === 'localize' ? await translatableIn(d.root) : () => true
    let done = 0
    for (const j of todo) {
      if (!next()) break
      const [dir, id] = j.page.id.split('/') as [string, string]
      const at = join(content, dir, id)
      try {
        let r
        if (kind === 'video-guide') {
          const e = await json<GuideEntity>(join(at, 'entity.json'))
          const vi = await json<Translation>(join(at, 'vi.json'))
          if (!e?.video || !vi || !d.yt) { report.failed.push(`${j.page.id}: ${!d.yt ? 'no YouTube access' : 'no video'}`); continue }
          if (done) await (d.sleep ?? (ms => new Promise(res => setTimeout(res, ms))))(VIDEO_GAP_MS)
          const lang = e.video.lang ?? 'en'
          const transcript = (e.video.transcribed ? null : await d.yt.transcript(e.video.youtubeId, lang)) ?? (await d.yt.transcribe?.(e.video.youtubeId, lang)) ?? null
          if (!transcript) { report.failed.push(`${j.page.id}: no transcript`); continue }
          r = await reviewDraft(d.llm, transcript, { viTitle: vi.name, summary: vi.summary ?? [], body: vi.body ?? '', faq: vi.faq ?? [] }, { title: e.video.title, channel: e.video.channel, lang })
        } else {
          const e = await json<{ sections: Section[] }>(join(at, 'entity.json'))
          const t = await json<Translation>(join(at, `${j.page.lang}.json`))
          // The parts its reviewer read: one source's sections (references aside), or every translatable one.
          const sections = (e?.sections ?? []).filter(s => s.html.trim() && (kind === 'translation' ? s.source === j.page.part && s.key !== 'references' : translatable(s.source)))
          const parts = sections.map(s => ({ id: `${s.key}:${s.source}`, en: s.html })).filter(p => kind === 'localize' || t?.sections[p.id])
          if (!parts.length || !t) { report.failed.push(`${reviewKey(j.page)}: no text to check`); continue }
          r = kind === 'translation'
            ? await reviewTranslation(d.llm, parts.map(p => ({ en: p.en, vi: t.sections[p.id]! })))
            : await reviewLocalized(d.llm, j.page.lang as TargetLang, parts, new Map(Object.entries(t.sections)))
        }
        calls++
        done++
        await logReviews(d.root, kind, j.page, [r], r, recheck())
        report.checked.push(`${kind} ${reviewKey(j.page)}: ${r.score.toFixed(2)} (was ${j.score.toFixed(2)}), ${r.notes.length} notes`)
      } catch (e) {
        if (e instanceof LlmError) { report.stopped = `${reviewKey(j.page)}: ${e.message}`; break }
        if (throttled(e)) { report.stopped = `YouTube is throttling (${j.page.id})`; break }
        report.failed.push(`${reviewKey(j.page)}: ${(e as Error).message.slice(0, 200)}`)
      }
    }
    report.left[kind] = todo.length - done
  }
  return report
}
