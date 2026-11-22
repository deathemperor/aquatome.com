import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Llm } from './claude'
import { PHRASES, phraseRun, phraseWords, type Phrase } from './phrases'
import { listedText, REWRITE_KINDS, rewriteExisting, type RewriteState } from './vi-backfill'
import type { RewriteOpts } from './vi-rewrite'

/**
 * The style rewrite's marks for the pages it did before it kept them (#1717, 20 Nov 2026), once: no record had any, so
 * the first `rewrite-vi --phrases` would take up again every page that still has a listed word, 544 on 16 Nov, each part
 * a write and a review. The chief of staff's option (b), 20 Nov: a page is marked for a word only when the word's row was
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

export type MarksReport = {
  /** Records the step read, and those it left as they were (marked already, or the rewrite failed). */
  records: number
  untouched: number
  /** Per listed row: records rewritten with it in the prompt; of those, the pages that still have its words (each such word is marked); and the pages that have its words with no mark after the step. */
  byRow: Record<string, { rewrittenWith: number; stillHave: number; leftWith: number }>
  /** Pages marked, and the marks written. */
  marked: string[]
  marks: number
  /** What `rewrite-vi --phrases` takes up before the marks and after: pages, with their parts ("guides/x (2 parts)"). */
  dueBefore: string[]
  dueAfter: string[]
  /** Of those after: pages with a record, and pages the rewrite never did. */
  afterRecorded: number
  afterNever: number
  parts: number
}

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
 * Marks each record that has none and whose rewrite went through (kept or not, as #1717 marks), for the words the page
 * still has whose row was in the prompt that day. `dry`: writes nothing. Calls no model. A second run marks nothing more:
 * a record with marks is left as it is.
 */
export async function rewriteMarks(contentRoot: string, stateFile: string, o: { dry?: boolean; list?: Phrase[]; opts: RewriteOpts }): Promise<MarksReport> {
  const list = o.list ?? PHRASES.vi ?? []
  const state = await json<RewriteState>(stateFile)
  const next: RewriteState = { ...state }
  const byRow: MarksReport['byRow'] = Object.fromEntries(list.map(p => [p.say, { rewrittenWith: 0, stillHave: 0, leftWith: 0 }]))
  const marked: string[] = []
  let untouched = 0, marks = 0
  for (const [id, e] of Object.entries(state)) {
    if (e.phrases || e.error) { untouched++; continue }
    const vi = await json<Parameters<typeof listedText>[0]>(join(contentRoot, id, 'vi.json')).catch(() => null)
    const text = vi ? listedText(vi) : ''
    for (const p of list) if (listedBy(p.say, e.at)) {
      byRow[p.say]!.rewrittenWith++
      if (phraseWords(text, 'vi', [p]).length) byRow[p.say]!.stillHave++
    }
    const m = marksFor(text, e.at, list)
    if (!m.length) continue
    next[id] = { ...e, phrases: m }
    marked.push(id)
    marks += m.length
  }
  const dueBefore = await dueWith(contentRoot, state, list, o.opts)
  const dueAfter = await dueWith(contentRoot, next, list, o.opts)
  for (const x of dueAfter) {
    const id = x.split(' ')[0]!
    const vi = await json<Parameters<typeof listedText>[0]>(join(contentRoot, id, 'vi.json')).catch(() => null)
    const text = vi ? listedText(vi) : ''
    const have = new Set(next[id]?.phrases ?? [])
    for (const p of list) if (phraseWords(text, 'vi', [p]).some(w => !have.has(w))) byRow[p.say]!.leftWith++
  }
  const afterRecorded = dueAfter.filter(x => state[x.split(' ')[0]!]).length
  if (!o.dry && marked.length) await writeFile(stateFile, `${JSON.stringify(next, null, 2)}\n`)
  return { records: Object.keys(state).length, untouched, byRow, marked, marks, dueBefore, dueAfter, afterRecorded, afterNever: dueAfter.length - afterRecorded, parts: dueAfter.reduce((n, x) => n + partsOf(x), 0) }
}
