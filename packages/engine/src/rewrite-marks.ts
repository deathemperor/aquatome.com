import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { Llm } from './claude'
import { PHRASES, phraseRun, phraseWords, type Phrase } from './phrases'
import { listedText, REWRITE_KINDS, rewriteExisting, type RewriteState } from './vi-backfill'
import type { RewriteOpts } from './vi-rewrite'

/**
 * The style rewrite's marks for the pages it rewrote without keeping them: the daily queue keeps none, and no record
 * from before #1717 (20 Nov 2026) has any, so `rewrite-vi --phrases` would take up again every page that still has a
 * listed word, 544 on 16 Nov, each part a write and a review. The pass writes them as its first step (`phrasesPass`). The chief of staff's option (b), 20 Nov: a page is marked for a word only when the word's row was
 * in the rewrite's prompt the day the page was rewritten. The rest is left for one paid pass, on the chief of staff's yes.
 *
 * The Vietnamese day each row reached the style rewrite's prompt (VI_STYLE, vi-rewrite.ts), from git: 61 rows on 8 Nov
 * 2026 (37d837b853 at 13:50, then 9b43c6be83, c76ed024e3 and 9045a064e1 at 18:09), four on 12 Nov (09b6e07182,
 * dae73d2530, aeb8af7829, by 04:31). No row's words widened on a later day than the row's own. A row added since isn't
 * here, and this step never marks its words.
 */
const ON_8_NOV = ['nhiều khả năng', 'dù vậy', 'phần lớn', 'nhìn chung', 'nhờ vậy', 'lý do là', 'thủ phạm', 'lý tưởng', 'khuyến nghị', 'bắt buộc phải', 'tốt nhất bạn nên', 'bạn nên', 'hung hăng', 'bạn cùng bể', 'giới chơi', 'thị trường cá cảnh', 'thức ăn sống', 'giữ lãnh thổ', 'chỗ trú', 'keo siêu dính', 'rất nên', 'loricariid', 'muối bể cá', 'dân chơi', 'được chuộng', 'cây thân đứng', 'lọc sponge', 'sản xuất hàng loạt', 'lọc bọt biển', 'bể cộng đồng', 'được xem là', 'ghi nhận', 'không xương sống', 'cá mê cung', 'bơi tự do', 'khẩu phần', 'cột nước', 'dưới đèn', 'thành phần thực vật', 'nuôi thương mại', 'nhắm tới', 'trưởng thành sinh dục', 'cá nhân giống', 'viên phân nền', 'gỡ tay', 'máy tạo dòng', 'cá ram', 'quả sủi', 'nền trồng cây', 'bể trồng cây', 'dựng bể', 'xao động', 'trị rộng', 'chỗ bắt đầu', 'được cho là', 'gần như không', 'việc đầu tiên là', 'dây hơi', 'gầy rộc', 'người cho đẻ', 'một cách + tính từ']
const ON_12_NOV = ['thài lài', 'trùn chỉ đỏ', 'nửa tá', 'thủng lỗ đầu']
export const LISTED_ON: Readonly<Record<string, string>> = Object.fromEntries([...ON_8_NOV.map(s => [s, '2026-11-08']), ...ON_12_NOV.map(s => [s, '2026-11-12'])])

/**
 * Whether a page the record dates `at` was rewritten with the row in the prompt. `at` is a UTC day and the row's a
 * Vietnamese one, so only a later day counts: a page rewritten the day a row landed, maybe by an engine clone not yet
 * pulled, keeps its word for the pass.
 */
export const listedBy = (say: string, at: string) => { const on = LISTED_ON[say]; return !!on && at > on }

/** A page's marks: each word it has now whose row was in the prompt when it was rewritten, as `--phrases` matches it. */
export const marksFor = (text: string, at: string, list: readonly Phrase[]) =>
  [...new Set(list.filter(p => listedBy(p.say, at)).flatMap(p => phraseWords(text, 'vi', [p])))]

type Page = Parameters<typeof listedText>[0]

/** A page's parts by the ids the rewrite gives them: a guide's body, summary and FAQ lines, a term's definition, each section of a fish or plant page (references and fixed ones too): all the text `--phrases` reads. */
export function textParts(vi: Page | null): Record<string, string> {
  if (!vi) return {}
  return {
    ...(vi.body ? { body: vi.body } : {}),
    ...Object.fromEntries((vi.summary ?? []).map((t, i) => [`summary:${i}`, t])),
    ...Object.fromEntries((vi.faq ?? []).flatMap((f, i) => [[`faq:${i}:q`, f.q], [`faq:${i}:a`, f.a]])),
    ...(vi.definition ? { definition: vi.definition } : {}),
    ...(vi.sections ?? {}),
  }
}

/** For each record asked about, the parts of its page that the commit which wrote that record changed, as that commit left them. A page missing from the map: no such commit was found. */
export type ChangedParts = (want: RewriteState) => Promise<Map<string, Record<string, string>>>

const run = promisify(execFile)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * From git, in the checkout the content is in: the newest commit (merges aside) in which each record took the value it
 * has, and what that commit changed on the page. A rewrite writes the page and its record in one commit, so a part it
 * changed is a part the writer's text went into. No history (a shallow clone): an empty map, so nothing is marked.
 */
export const gitChanged = (contentRoot: string, stateRel = 'engine-state/vi-rewrite.json'): ChangedParts => async want => {
  const cwd = dirname(contentRoot)
  const git = (...a: string[]) => run('git', a, { cwd, maxBuffer: 512 << 20 }).then(r => r.stdout)
  const show = (rev: string, path: string) => git('show', `${rev}:./${path}`).then(t => JSON.parse(t) as Record<string, unknown>).catch(() => ({}) as Record<string, unknown>)
  const out = new Map<string, Record<string, string>>()
  const left = new Map(Object.entries(want))
  const commits = (await git('log', '--no-merges', '--format=%H', '--', stateRel).catch(() => '')).split('\n').filter(Boolean)
  for (const c of commits) {
    if (!left.size) break
    const [after, before] = await Promise.all([show(c, stateRel), show(`${c}^`, stateRel)])
    for (const [id, rec] of left) {
      if (!same(after[id], rec) || same(before[id], rec)) continue
      left.delete(id)
      const path = `${basename(contentRoot)}/${id}/vi.json`
      const [now, was] = await Promise.all([show(c, path), show(`${c}^`, path)])
      const a = textParts(now as Page), b = textParts(was as Page)
      out.set(id, Object.fromEntries(Object.entries(a).filter(([k, t]) => b[k] !== t)))
    }
  }
  return out
}

/**
 * A page's marks: each word its rewrite's own text kept, where the page still has it and has it nowhere else. A part the
 * commit didn't change is a part the writer's text never went into (a rewrite that came back as it was, a part not sent),
 * so its words aren't marked; nor is a word also in another part (a guide's question, a fish page's references), which
 * the mark would close too, since a mark is the page's.
 */
export function slips(changed: Record<string, string>, now: Record<string, string>, at: string, list: readonly Phrase[]): string[] {
  const inside = Object.keys(changed).filter(k => k in now)
  const words = (keys: string[], from: Record<string, string>) => new Set(phraseWords(JSON.stringify(keys.map(k => from[k])), 'vi', [...list]))
  const kept = new Set(marksFor(JSON.stringify(inside.map(k => changed[k])), at, list))
  const still = words(inside, now)
  const outside = words(Object.keys(now).filter(k => !inside.includes(k)), now)
  return [...kept].filter(w => still.has(w) && !outside.has(w))
}

/** A record the step may mark: no marks yet, no failure (an empty message is one), and every part rewritten and kept. */
export const eligible = (e: RewriteState[string]) => !e.phrases?.length && !('error' in e) && e.of > 0 && e.rewritten === e.of

export type MarksReport = {
  /** Records the step read; those left as they were for marks or a failure; those with a part the reviewer refused (never marked: their text wasn't rewritten); those it may mark. */
  records: number
  skipped: number
  partial: number
  eligible: number
  /** Of those it may mark: no commit found that wrote the record (no history, a shallow clone); the commit changed no part of the page (the rewrite came back as it was). Neither is marked. */
  noCommit: number
  unchanged: number
  /** Per listed row: eligible records rewritten with it in the prompt; of those, the pages marked for its words (the rewrite's own text kept them, and the page has them nowhere else); and the pages `--phrases` still takes up for its words after the step. */
  byRow: Record<string, { rewrittenWith: number; stillHave: number; leftWith: number }>
  /** Pages marked, and the marks written. */
  marked: string[]
  marks: number
  /** What `rewrite-vi --phrases` takes up before the marks and after: pages, with their parts ("guides/x (2 parts)"). */
  dueBefore: string[]
  dueAfter: string[]
  /** Of those after: pages with a record, and pages with none (never rewritten, or a record an engine repair took off). */
  afterRecorded: number
  afterNever: number
  parts: number
}

/** Writes the report to a file that doesn't exist yet, never over one (the record, a page). */
export const writeReport = (file: string, r: MarksReport) => writeFile(file, `${JSON.stringify(r, null, 2)}\n`, { flag: 'wx' })

const partsOf = (x: string) => Number(/\((\d+) parts?\)/.exec(x)?.[1] ?? 0)
const json = async <T>(f: string): Promise<T> => JSON.parse(await readFile(f, 'utf8'))

/** What `rewrite-vi --phrases` would take up with `state` as its record: its own dry run, so the count is the picker's. */
async function dueWith(contentRoot: string, state: RewriteState, list: Phrase[], opts: RewriteOpts): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'aq-marks-'))
  try {
    const file = join(dir, 'vi-rewrite.json')
    await writeFile(file, JSON.stringify(state))
    const none: Llm = async () => { throw new Error('a dry run calls no model') }
    const r = await rewriteExisting(contentRoot, file, { llm: none, opts, now: () => new Date() }, { limit: Infinity, kinds: REWRITE_KINDS, ...phraseRun('vi', list), dry: true })
    return r.done
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/**
 * Marks each eligible record for the words its rewrite's own text kept whose row was in the prompt that day (`slips`).
 * `dry`: writes nothing in the checkout (the picker's dry runs read a copy in the system's temp folder). Calls no model.
 * The record is written whole (a new file beside it, then renamed), and only if it was unchanged at the last read before
 * the write: a write in the moment between is still lost, so it runs only in the pass's own checkout. A second run marks
 * nothing more: a record with marks is left as it is.
 */
export async function rewriteMarks(contentRoot: string, stateFile: string, o: { dry?: boolean; list?: Phrase[]; opts: RewriteOpts; /** What each record's commit changed (default: from git, `gitChanged`). */ changed?: ChangedParts; /** Tests: runs before the record is read again for the write. */ beforeWrite?: () => Promise<void> }): Promise<MarksReport> {
  const list = o.list ?? PHRASES.vi ?? []
  const read = await readFile(stateFile, 'utf8')
  const state = JSON.parse(read) as RewriteState
  const next: RewriteState = { ...state }
  const byRow: MarksReport['byRow'] = Object.fromEntries(list.map(p => [p.say, { rewrittenWith: 0, stillHave: 0, leftWith: 0 }]))
  const marked: string[] = []
  let skipped = 0, partial = 0, ok = 0, marks = 0, noCommit = 0, unchanged = 0
  const may = Object.fromEntries(Object.entries(state).filter(([, e]) => eligible(e) && list.some(p => listedBy(p.say, e.at))))
  const changed = await (o.changed ?? gitChanged(contentRoot))(may)
  for (const [id, e] of Object.entries(state)) {
    if (e.phrases?.length || 'error' in e) { skipped++; continue }
    if (!eligible(e)) { partial++; continue }
    ok++
    if (!may[id]) continue
    const c = changed.get(id)
    if (!c) { noCommit++; continue }
    if (!Object.keys(c).length) { unchanged++; continue }
    const m = slips(c, textParts(await json<Page>(join(contentRoot, id, 'vi.json')).catch(() => null)), e.at, list)
    for (const p of list) if (listedBy(p.say, e.at)) {
      byRow[p.say]!.rewrittenWith++
      if (phraseWords(JSON.stringify(m), 'vi', [p]).length) byRow[p.say]!.stillHave++
    }
    if (!m.length) continue
    next[id] = { ...e, phrases: m }
    marked.push(id)
    marks += m.length
  }
  const dueBefore = await dueWith(contentRoot, state, list, o.opts)
  const dueAfter = await dueWith(contentRoot, next, list, o.opts)
  for (const x of dueAfter) {
    const id = x.split(' ')[0]!
    const vi = await json<Page>(join(contentRoot, id, 'vi.json')).catch(() => null)
    const text = vi ? listedText(vi) : ''
    const have = new Set(next[id]?.phrases ?? [])
    for (const p of list) if (phraseWords(text, 'vi', [p]).some(w => !have.has(w))) byRow[p.say]!.leftWith++
  }
  const afterRecorded = dueAfter.filter(x => state[x.split(' ')[0]!]).length
  if (!o.dry && marked.length) {
    await o.beforeWrite?.()
    if (await readFile(stateFile, 'utf8') !== read) throw new Error(`${stateFile} changed while the marks were made: nothing written; run it again`)
    // A new file of its own (never one already there, which may be a link to the record), gone again if the write fails.
    const tmp = `${stateFile}.marks-${process.pid}`
    try {
      await writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
      await rename(tmp, stateFile)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') await rm(tmp, { force: true })
      throw err
    }
  }
  return { records: Object.keys(state).length, skipped, partial, eligible: ok, noCommit, unchanged, byRow, marked, marks, dueBefore, dueAfter, afterRecorded, afterNever: dueAfter.length - afterRecorded, parts: dueAfter.reduce((n, x) => n + partsOf(x), 0) }
}

/**
 * The pass (`rewrite-vi --phrases`): its first step writes the marks, so no one has to remember them and no days between
 * a hand run and the pass refill the list (the chief of staff, 22 Nov). `dry`: the marks go in a copy in the system's
 * temp folder, and the rewrite's dry run reads that copy, so it lists what the pass would take up and writes nothing.
 */
export async function phrasesPass(contentRoot: string, stateFile: string, d: Parameters<typeof rewriteExisting>[2], o: Omit<Parameters<typeof rewriteExisting>[3], 'match' | 'listed'>, m: { changed?: ChangedParts } = {}) {
  const dir = o.dry ? await mkdtemp(join(tmpdir(), 'aq-pass-')) : undefined
  const file = dir ? join(dir, 'vi-rewrite.json') : stateFile
  try {
    if (dir) await copyFile(stateFile, file)
    const marks = await rewriteMarks(contentRoot, file, { opts: d.opts, ...m })
    return { marks, run: await rewriteExisting(contentRoot, file, d, { ...o, ...phraseRun('vi') }) }
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true })
  }
}
