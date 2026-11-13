import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, type GuideEntity, type Section, type Translation } from '@aq/schema'
import { OTHER_LANGS } from '@aq/schema/langs'
import { LlmError, type Llm } from './claude'
import { placeLine, review as reviewLocalized, reviewPlaces, translatableIn, type TargetLang } from './localize'
import { reviewTranslation, steadyRead } from './quality'
import { applySourceRechecks, sourcePairs, sourceTextHash } from './recheck-score'
import { itemReviews, logReviews, readReviews, reviewKey, type PageRef, type ReviewKind } from './review-log'
import { setHold } from './video-hold'
import { byRank } from './video-order'
import { recheckTopic } from './topics'
import { reviewDraft, throttled, VIDEO_GAP_MS, type YouTube } from './youtube'
export { lowVideoGuides } from './youtube'

/**
 * Pages under the bar whose review left no notes (it ran before reviews were kept), reviewed again as they are, nothing
 * rewritten: each gets its review's score and notes in engine-state/reviews (attempt "recheck"). Per kind, `limit` model
 * calls a run; `only` pages (ids, as `youtube-<id>` or `species/<id>`) are reviewed again whatever their score and notes.
 * `reviewedBefore` (a time): every page whose version on the site has no review from then on, whatever its score, after a
 * reviewer's prompt changed; its recheck is from after it, so a page is reviewed again once. `rank`: that order instead
 * (video-order.ts byRank), then the lowest scores. `parallel`: pages reviewed at once (places: one batch at a time).
 *
 * - video-guide: the guide against its transcript (yt; the video job's, on the Mac). The videos the owner added first,
 *   then the lowest scores.
 * - translation: a Vietnamese species or plant page's text from one source, against that source's English. A guide
 *   translated from a source keeps no English to check against, so it waits for its next translation. A recheck
 *   at or above the bar is copied onto that source when it read the text still on the page (recheck-score.ts);
 *   the page's score is then the minimum across its sources. A topic guide already does this, because its one
 *   score is the check's.
 * - localize: an Indonesian or Thai species or plant page, against the English.
 * - places: Indonesian and Thai place names, a batch a call.
 * - topic: a guide AquaTome wrote, in any language, against the facts its writer had (topics.ts recheckTopic). A guide's
 *   score is its check's, so this one also gives the page its new score.
 */
export const BACKFILL_KINDS = ['video-guide', 'translation', 'localize', 'places', 'topic'] as const satisfies readonly ReviewKind[]
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
  } else if (kind === 'topic') {
    for (const id of (await list(join(content, 'guides'))).filter(d => d.startsWith('aquatome-'))) for (const lang of ['vi', ...OTHER_LANGS]) {
      const q = (await json<Translation>(join(content, 'guides', id, `${lang}.json`)))?.quality
      if (under(q)) out.push({ page: { id: `guides/${id}`, lang }, score: q!.score })
    }
  } else if (kind === 'translation') {
    for (const dir of ['species', 'plants']) for (const id of await list(join(content, dir))) {
      const t = await json<Translation>(join(content, dir, id, 'vi.json'))
      const low = Object.entries(t?.quality?.bySource ?? {}).filter(([, score]) => under({ score }))
      if (!low.length) continue
      // A source whose text has left the page, or whose Vietnamese is empty, has nothing to check: it isn't listed. On 13 Nov 2026 one such
      // (a fish's Glaser part) was tried and failed "no text to check" every run (the chief of staff: drop it).
      const sections = (await json<{ sections: Section[] }>(join(content, dir, id, 'entity.json')))?.sections ?? []
      for (const [part, score] of low) if (sourcePairs(sections, t?.sections ?? {}, part).length) out.push({ page: { id: `${dir}/${id}`, lang: 'vi', part }, score })
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

/**
 * `band`: a read within this of the bar is read twice more and the middle read counts (steadyRead); none, one read. The
 * command passes NEAR_BAR (the chief of staff, 2026-11-11: second reads move a page in or out of search). `fromLastRead`: the page's newest second read is the first of
 * the three, so a page gets two more reads whatever its score (the low video guides: lowVideoGuides). `limit` counts pages.
 */
export async function reviewBackfill(d: BackfillDeps, o: { kinds?: readonly BackfillKind[]; limit: number; only?: string[]; reviewedBefore?: string; rank?: (p: PageRef) => number[]; parallel?: number; band?: number; fromLastRead?: boolean }): Promise<BackfillReport> {
  // Rechecks already in the log, applied before any new model call. A passing one of a source still on the page raises that source.
  await applySourceRechecks(d.root)
  const report: BackfillReport = { checked: [], failed: [], stopped: '', left: {} }
  const content = join(d.root, 'content')
  const recheck = () => ({ recheck: true, now: d.now() })
  for (const kind of o.kinds ?? BACKFILL_KINDS) {
    if (report.stopped) break
    const traced = await readReviews(d.root, kind)
    // The store is newest first: the first kept review is the one of the version the page has now.
    const kept = (j: Job) => traced[reviewKey(j.page)]?.find(t => t.kept)
    const before = (j: Job) => { const t = kept(j); return !t || Date.parse(t.at) < Date.parse(o.reviewedBefore!) }
    const todo = (await jobs(d.root, kind, !!o.only || !!o.reviewedBefore)).filter(j => (o.only ? matches(o.only, j.page) : o.reviewedBefore ? before(j) : !kept(j)))
    if (o.rank) todo.sort((a, b) => byRank(o.rank!(a.page), o.rank!(b.page)) || a.score - b.score || reviewKey(a.page).localeCompare(reviewKey(b.page)))
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
            const r = await steadyRead(() => reviewPlaces(d.llm, lang, lines, named), o.band ?? 0)
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
    // A few at a time: a page holds its place in the limit while it is being reviewed, so `parallel` never overshoots it.
    let done = 0
    let busy = 0
    let k = 0
    const one = async (j: Job): Promise<void> => {
      const [dir, id] = j.page.id.split('/') as [string, string]
      const at = join(content, dir, id)
      // The newest second read, as the first of three (fromLastRead).
      const last = traced[reviewKey(j.page)]?.[0]
      const given = o.fromLastRead && last?.attempt === 'recheck' && !last.reads ? { score: last.score, notes: last.notes } : undefined
      // Its newest second read changed since it was listed (another job read it): nothing to start from, so no read.
      if (o.fromLastRead && !given) { report.failed.push(`${reviewKey(j.page)}: no single second read to start from`); return }
      const steady = <T extends { score: number; notes: string[] }>(read: () => Promise<T>) => steadyRead(read, o.band ?? 0, given as T | undefined)
      try {
        let r
        let textHash: string | undefined
        if (kind === 'topic') r = await recheckTopic(d.root, d.llm, id, j.page.lang as 'vi' | TargetLang)
        else if (kind === 'video-guide') {
          const e = await json<GuideEntity>(join(at, 'entity.json'))
          const vi = await json<Translation>(join(at, 'vi.json'))
          if (!e?.video || !vi || !d.yt) { report.failed.push(`${j.page.id}: ${!d.yt ? 'no YouTube access' : 'no video'}`); return }
          if (done) await (d.sleep ?? (ms => new Promise(res => setTimeout(res, ms))))(VIDEO_GAP_MS)
          const lang = e.video.lang ?? 'en'
          const transcript = (e.video.transcribed ? null : await d.yt.transcript(e.video.youtubeId, lang)) ?? (await d.yt.transcribe?.(e.video.youtubeId, lang)) ?? null
          if (!transcript) { report.failed.push(`${j.page.id}: no transcript`); return }
          const { title, channel } = e.video
          r = await steady(() => reviewDraft(d.llm, transcript, { viTitle: vi.name, summary: vi.summary ?? [], body: vi.body ?? '', faq: vi.faq ?? [] }, { title, channel, lang }))
        } else {
          const e = await json<{ sections: Section[] }>(join(at, 'entity.json'))
          const t = await json<Translation>(join(at, `${j.page.lang}.json`))
          // The parts its reviewer read: one source's pairs, chosen as the listing and the page's score choose them
          // (recheck-score.ts sourcePairs), or every translatable one. Chosen otherwise, a passing check hashed text the
          // score's update didn't, and never reached the page (Astra's read).
          const pairs = kind === 'translation' ? sourcePairs(e?.sections ?? [], t?.sections ?? {}, j.page.part ?? '') : []
          const parts = kind === 'translation' ? pairs : (e?.sections ?? []).filter(s => s.html.trim() && translatable(s.source)).map(s => ({ id: `${s.key}:${s.source}`, en: s.html }))
          if (!parts.length || !t) { report.failed.push(`${reviewKey(j.page)}: no text to check`); return }
          if (kind === 'translation') textHash = sourceTextHash(pairs)
          r = kind === 'translation'
            ? await steady(() => reviewTranslation(d.llm, pairs.map(p => ({ en: p.en, vi: p.vi }))))
            : await steady(() => reviewLocalized(d.llm, j.page.lang as TargetLang, parts, new Map(Object.entries(t.sections))))
        }
        calls++
        done++
        await logReviews(d.root, kind, j.page, [r], r, { ...recheck(), ...(textHash ? { textHash } : {}) })
        // A video guide held out of the chat (video-hold.ts) that passes goes back in; under the bar, it waits for its redo.
        const back = kind === 'video-guide' && r.score >= QUALITY_THRESHOLD && await setHold(content, id, false)
        report.checked.push(`${kind} ${reviewKey(j.page)}: ${r.score.toFixed(2)} (was ${j.score.toFixed(2)}), ${r.notes.length} notes${back ? ', back in the chat' : ''}`)
      } catch (e) {
        if (e instanceof LlmError) { report.stopped ||= `${reviewKey(j.page)}: ${e.message}`; return }
        if (throttled(e)) { report.stopped ||= `YouTube is throttling (${j.page.id})`; return }
        report.failed.push(`${reviewKey(j.page)}: ${(e as Error).message.slice(0, 200)}`)
      }
    }
    const worker = async () => {
      while (k < todo.length && calls + busy < o.limit && !report.stopped) {
        busy++
        try { await one(todo[k++]!) } finally { busy-- }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, o.parallel ?? 1) }, worker))
    report.left[kind] = todo.length - done
  }
  return report
}
