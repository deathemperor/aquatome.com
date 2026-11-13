/**
 * Do video guides keep to what the video says? Takes the guides whose last kept review (engine-state/reviews/video-guide.json)
 * is under the bar, and for each:
 *   recheck  the guide on the site, reviewed again (the reviewer as it is now)
 *   edit     with --site-edit: the guide on the site, edited with those notes (the retry alone), then reviewed
 *   redo     what `videos --redo --only <id>` does: a fresh draft given those notes, its review, and under the bar one
 *            edit with the new notes and its review
 * then one blind call sorts every note (the stored ones too) by kind. Every call is cached in
 * ~/.cache/aquatome/eval-fidelity; content/ and engine-state/ are only read. Output: its report.md there.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/eval-fidelity.ts [videoId,videoId] [--site-edit] [--rows-only: no sorting of the notes]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { QUALITY_THRESHOLD, type GuideEntity, type Translation } from '@aq/schema'
import { claudeCli, LlmError } from '../src/claude'
import { lastKept, readReviews } from '../src/review-log'
import { fixDraft, reviewDraft, writeDraft, ytDlp, type Draft, type VideoMeta } from '../src/youtube'
import { evalDir } from './eval-lib'

const OUT = evalDir('eval-fidelity')
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const WRITE = { style: true, model: process.env.VIDEO_MODEL ?? 'opus' }

const cached = async <T>(file: string, make: () => Promise<T>): Promise<T> => {
  try { return JSON.parse(await readFile(join(OUT, file), 'utf8')) } catch { /* not yet */ }
  const v = await make()
  await writeFile(join(OUT, file), JSON.stringify(v, null, 2))
  return v
}
const retry = async <T>(f: () => Promise<T>): Promise<T> => { try { return await f() } catch (e) { if (!(e instanceof LlmError)) throw e; return f() } }
const json = async <T>(f: string) => JSON.parse(await readFile(f, 'utf8')) as T
const words = (d: Pick<Draft, 'body' | 'summary' | 'faq'>) => [d.body, ...d.summary, ...d.faq.flatMap(f => [f.q, f.a])].join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
type Review = { score: number; notes: string[] }

await mkdir(OUT, { recursive: true })
const traced = await readReviews(ROOT, 'video-guide')
const ids = process.argv[2]?.split(',') ?? Object.keys(traced).map(k => k.split('/').pop()!.replace(/^youtube-/, ''))

type Row = { id: string; title: string; stored: number; before: Review; recheck: Review; edit: Review | null | undefined; redo: Review[]; words: { site: number; edit: number | null; redo: number }; left?: { quoted: number; kept: number } }
const rows: Row[] = []
for (const id of ids) {
  const dir = join(ROOT, 'content/guides', `youtube-${id}`)
  const e = await json<GuideEntity>(join(dir, 'entity.json'))
  const vi = await json<Translation>(join(dir, 'vi.json'))
  const before = await lastKept(ROOT, { id: `guides/youtube-${id}`, lang: 'vi' }, ['video-guide'])
  if (!before || before.score >= QUALITY_THRESHOLD || !e.video) { console.log(`${id}: no kept review under the bar, skipped`); continue }
  const lang = e.video.lang ?? 'en'
  const meta = await cached<VideoMeta>(`meta-${id}.json`, () => ytDlp.video(id))
  // As review-backfill reads it: the cached captions, or our own transcript of the audio.
  const transcript = (e.video.transcribed ? null : await ytDlp.transcript(id, lang)) ?? (await ytDlp.transcribe!(id, lang))
  if (!transcript) throw new Error(`${id}: no transcript`)
  const site: Draft = { relevant: true, kind: e.kind, viTitle: vi.name, summary: vi.summary ?? [], body: vi.body ?? '', faq: vi.faq ?? [], chapters: vi.chapters ?? [] }
  const review = (file: string, d: Draft) => cached<Review>(file, () => retry(() => reviewDraft(claudeCli, transcript, d, meta)))

  const recheck = await review(`recheck-${id}.json`, site)
  const edited = process.argv.includes('--site-edit') ? await cached(`edit-${id}.json`, () => retry(() => fixDraft(claudeCli, transcript, site, before.notes, { ...WRITE, lang }))) : undefined
  const edit = edited ? await review(`edit-review-${id}.json`, edited) : edited

  let d = await cached(`redo-${id}.json`, () => retry(() => writeDraft(claudeCli, meta, transcript, { ...WRITE, notes: before.notes })))
  const redo = [await review(`redo-review-${id}.json`, d)]
  let left: Row['left']
  if (redo[0]!.score < QUALITY_THRESHOLD) {
    const fixed = await cached(`redo-edit-${id}.json`, () => retry(() => fixDraft(claudeCli, transcript, d, redo[0]!.notes, { ...WRITE, lang })))
    if (fixed) {
      // The Vietnamese the notes quote (a rough check, no model): how much of it the edit left as it was.
      const text = (x: Draft) => [x.viTitle, ...x.summary, x.body, ...x.faq.flatMap(f => [f.q, f.a])].join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      const was = text(d)
      const quoted = redo[0]!.notes.flatMap(n => [...n.matchAll(/["'“‘]([^"'”’]{8,}?)["'”’]/g)].map(m => m[1]!.replace(/\.\.\.|…/g, '').trim())).filter(q => q.length >= 8 && was.includes(q))
      left = { quoted: quoted.length, kept: quoted.filter(q => text(fixed).includes(q)).length }
      d = fixed
      redo.push(await review(`redo-edit-review-${id}.json`, d))
    }
  }
  rows.push({ id, title: vi.name, stored: vi.quality?.score ?? 0, before, recheck, edit, redo, words: { site: words(site), edit: edited ? words(edited) : null, redo: words(d) }, ...(left ? { left } : {}) })
  console.log(`${id}: before ${before.score}, recheck ${recheck.score}, edit ${edit?.score ?? '–'}, redo ${redo.map(r => r.score).join(' → ')}`)
}

if (process.argv.includes('--rows-only')) process.exit(0)

// Every note, shuffled under neutral ids so the judge can't tell which version it came from.
const KINDS = ['invented-fact', 'invented-wording', 'overstated', 'repeats', 'awkward', 'wrong', 'missing', 'names-source', 'no-fault', 'other'] as const
const sets: Record<string, string[]> = {}
for (const r of rows) {
  sets[`before/${r.id}`] = r.before.notes
  sets[`recheck/${r.id}`] = r.recheck.notes
  if (r.edit) sets[`edit/${r.id}`] = r.edit.notes
  sets[`redo-first/${r.id}`] = r.redo[0]!.notes
  if (r.redo[1]) sets[`redo-edit/${r.id}`] = r.redo[1].notes
}
const all = Object.entries(sets).flatMap(([set, ns]) => ns.map(n => ({ set, n })))
const order = all.map((x, i) => ({ ...x, key: (i * 7919) % 104729 })).sort((a, b) => a.key - b.key)
const sorted = await cached<{ notes: { id: number; kinds: string[] }[] }>(`kinds-${all.length}.json`, () => retry(() => claudeCli({
  system: 'You sort reviewer notes. Reply only with JSON.', schema: { type: 'object', required: ['notes'], properties: { notes: { type: 'array', items: { type: 'object', required: ['id', 'kinds'], properties: { id: { type: 'number' }, kinds: { type: 'array', items: { type: 'string', enum: KINDS } } } } } } },
  prompt: `Each note below is a reviewer's note on a Vietnamese aquarium guide written from a YouTube video. Give every note the kinds of fault it names (one or more):
- invented-fact: a step, tip, product, price, number, order, cause or recommendation the video doesn't give
- invented-wording: an elaboration or word choice that goes a little past the video's words but adds no fact
- overstated: the creator's opinion, preference, guess or hedged claim stated as fact or a rule; a hedge dropped
- repeats: a closing section, FAQ or summary repeating the body
- awkward: unnatural, translated or note-style Vietnamese
- wrong: contradicts or distorts what the video says (not just added)
- missing: a point of the video left out
- names-source: mentions the video, its creator, its channel or its example tank
- no-fault: the note names nothing to fix (it says the passage is fine, acceptable or good)
- other: any other fault
A note that says one thing is fine and another is wrong gets the kinds of the fault only.

${order.map((x, i) => `${i}. ${x.n}`).join('\n')}`,
})))
const kindsOf = new Map(sorted.notes.map(x => [x.id, x.kinds]))
const count = (prefix: string) => {
  const c = Object.fromEntries(KINDS.map(k => [k, 0])) as Record<string, number>
  let n = 0
  order.forEach((x, i) => { if (x.set.startsWith(prefix)) { n++; for (const k of kindsOf.get(i) ?? ['other']) c[k] = (c[k] ?? 0) + 1 } })
  return { n, c }
}
const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '–')
const passed = (xs: number[]) => (xs.length ? xs.filter(x => x >= QUALITY_THRESHOLD).length : '–')
const finals = rows.map(r => r.redo.at(-1)!.score)
const lines = [
  '# Video guides: keeping to the video', '',
  `Guides: ${rows.length}. Writer and editor ${WRITE.model}, reviewer ${process.env.ENGINE_MODEL ?? 'sonnet'}, bar ${QUALITY_THRESHOLD}.`, '',
  '| guide | stored | kept review | recheck | edit of the site\'s | redo: first → edit | quoted phrases the edit left | words: site / edit / redo |', '|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.stored} | ${r.before.score} (${r.before.notes.length}) | ${r.recheck.score} (${r.recheck.notes.length}) | ${r.edit ? `${r.edit.score} (${r.edit.notes.length})` : r.edit === null ? 'broken' : '–'} | ${r.redo.map(x => `${x.score} (${x.notes.length})`).join(' → ')} | ${r.left ? `${r.left.kept} of ${r.left.quoted}` : '–'} | ${r.words.site} / ${r.words.edit ?? '–'} / ${r.words.redo} |`),
  `| mean | ${mean(rows.map(r => r.stored))} | ${mean(rows.map(r => r.before.score))} | ${mean(rows.map(r => r.recheck.score))} | ${mean(rows.flatMap(r => (r.edit ? [r.edit.score] : [])))} | ${mean(rows.map(r => r.redo[0]!.score))} → ${mean(finals)} | | |`,
  `| at the bar | | ${passed(rows.map(r => r.before.score))} | ${passed(rows.map(r => r.recheck.score))} | ${passed(rows.flatMap(r => (r.edit ? [r.edit.score] : [])))} | ${passed(rows.map(r => r.redo[0]!.score))} → ${passed(finals)} | | |`,
  '', '(score (notes))', '', '## Notes by kind', '',
  `| set | notes | ${KINDS.join(' | ')} |`, `|---|---|${KINDS.map(() => '---').join('|')}|`,
  ...['before', 'recheck', 'edit', 'redo-first', 'redo-edit'].map(s => { const { n, c } = count(`${s}/`); return `| ${s} | ${n} | ${KINDS.map(k => c[k]).join(' | ')} |` }),
  '', '## Notes', '',
  ...Object.entries(sets).flatMap(([set, ns]) => [`### ${set}`, ...ns.map(n => `- ${n}`), '']),
]
await writeFile(join(OUT, 'report.md'), lines.join('\n'))
console.log(lines.slice(0, 22).join('\n'))
