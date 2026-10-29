/**
 * Which way of writing video guides reads most like a person wrote it? Writes each sample video with every variant,
 * checks accuracy with the usual reviewer, then a blind pairwise judge (another model, both orders) picks the more
 * natural Vietnamese and quotes the least natural sentences. Output: /tmp/aqeval/report.md (never touches content/).
 *
 *   pnpm --filter @aq/engine exec tsx scripts/eval-writing.ts [videoId,videoId]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { claudeCli, LlmError } from '../src/claude'
import { reviewDraft, writeDraft, ytDlp, type Draft, type VideoMeta, type WriteOpts } from '../src/youtube'

const OUT = '/tmp/aqeval'
const VIDEOS = process.argv[2]?.split(',') ?? ['J_PR999bgtw', 'YXhZnSTaUW0', 'PfHZZ1Yecqo']
const VARIANTS: Record<string, WriteOpts> = {
  A: {}, // current prompt
  B: { style: true }, // + Vietnamese style guide
  C: { style: true, edit: true }, // + separate editor pass
  D: { style: true, model: 'opus' }, // style guide, written by Opus
}
const JUDGE_MODEL = 'opus'

const cached = async <T>(file: string, make: () => Promise<T>): Promise<T> => {
  try { return JSON.parse(await readFile(join(OUT, file), 'utf8')) } catch { /* not yet */ }
  const v = await make()
  await writeFile(join(OUT, file), JSON.stringify(v, null, 2))
  return v
}
const retry = async <T>(f: () => Promise<T>): Promise<T> => { try { return await f() } catch (e) { if (!(e instanceof LlmError)) throw e; return f() } }
async function pool<T>(jobs: (() => Promise<T>)[], n = 3): Promise<T[]> {
  const out: T[] = []
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const j = i++; out[j] = await jobs[j]!() } }))
  return out
}
const plain = (d: Draft) => [
  `# ${d.viTitle}`, ...d.summary.map(s => `- ${s}`), '',
  d.body.replace(/<h3>/g, '\n## ').replace(/<\/h3>/g, '\n').replace(/<li>/g, '\n- ').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim(), '',
  ...d.faq.map(f => `H: ${f.q}\nĐ: ${f.a}`),
].join('\n')

const JUDGE = `You are a native Vietnamese editor for a Vietnamese aquarium-hobby site. Two Vietnamese guides (X and Y) cover the same YouTube video.
Judge ONLY how natural and human the Vietnamese reads: would a Vietnamese hobbyist believe a fellow hobbyist wrote it, or does it read like machine writing or translation?
Ignore which covers more content and ignore formatting.

Tells of machine or translated Vietnamese: note-style clauses without subjects joined by semicolons; "liên quan" for causes; calques of English ("nên đừng…", "điều này giúp…", "đóng vai trò", "một cách + adj", "việc + verb" as subject, needless "được" passives); stock phrases ("yếu tố then chốt", "không chỉ… mà còn"); every sentence the same length and shape; flat, opinion-free tone; hobby terms Vietnamese players don't use.

Return: better ("X", "Y" or "tie"), naturalX and naturalY (1–10), worstX and worstY (the 3 least natural sentences of each, quoted exactly), why (one sentence).`
const JUDGE_SCHEMA = {
  type: 'object', required: ['better', 'naturalX', 'naturalY', 'worstX', 'worstY', 'why'],
  properties: { better: { type: 'string', enum: ['X', 'Y', 'tie'] }, naturalX: { type: 'number' }, naturalY: { type: 'number' }, worstX: { type: 'array', items: { type: 'string' } }, worstY: { type: 'array', items: { type: 'string' } }, why: { type: 'string' } },
}
type Verdict = { better: 'X' | 'Y' | 'tie'; naturalX: number; naturalY: number; worstX: string[]; worstY: string[]; why: string }

await mkdir(OUT, { recursive: true })
const sources = await pool(VIDEOS.map(id => () => cached(`src-${id}.json`, async () => ({ meta: await ytDlp.video(id), transcript: (await ytDlp.transcript(id))! }))), 1) as { meta: VideoMeta; transcript: string }[]

const names = Object.keys(VARIANTS)
const drafts = new Map<string, Draft>()
const facts = new Map<string, number>()
await pool(VIDEOS.flatMap((id, vi) => names.map(v => async () => {
  const { meta, transcript } = sources[vi]!
  const d = await cached(`draft-${id}-${v}.json`, () => retry(() => writeDraft(claudeCli, meta, transcript, VARIANTS[v])))
  drafts.set(`${id}/${v}`, d)
  facts.set(`${id}/${v}`, (await cached(`fact-${id}-${v}.json`, () => retry(() => reviewDraft(claudeCli, transcript, d, meta)))).score)
  console.log(`written ${id}/${v}`)
})))

type Row = { id: string; x: string; y: string; v: Verdict }
const rows: Row[] = []
await pool(VIDEOS.flatMap(id => names.flatMap((a, i) => names.slice(i + 1).flatMap(b => [[a, b], [b, a]].map(([x, y]) => async () => {
  const v = await cached(`judge-${id}-${x}-${y}.json`, () => retry(() => claudeCli<Verdict>({
    system: 'You judge Vietnamese prose. Reply only with JSON.', model: JUDGE_MODEL, schema: JUDGE_SCHEMA,
    prompt: `${JUDGE}\n\n=== X ===\n${plain(drafts.get(`${id}/${x}`)!)}\n\n=== Y ===\n${plain(drafts.get(`${id}/${y}`)!)}`,
  })))
  rows.push({ id, x: x!, y: y!, v })
  console.log(`judged ${id} ${x} vs ${y}: ${v.better}`)
})))), 3)

const stat = Object.fromEntries(names.map(n => [n, { wins: 0, losses: 0, ties: 0, natural: [] as number[], worst: [] as string[] }]))
for (const { x, y, v } of rows) {
  stat[x]!.natural.push(v.naturalX); stat[y]!.natural.push(v.naturalY)
  stat[x]!.worst.push(...v.worstX); stat[y]!.worst.push(...v.worstY)
  if (v.better === 'tie') { stat[x]!.ties++; stat[y]!.ties++ } else { const [w, l] = v.better === 'X' ? [x, y] : [y, x]; stat[w!]!.wins++; stat[l!]!.losses++ }
}
const mean = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(2)
const lines = [
  '# Video guide writing eval', '', `Videos: ${VIDEOS.join(', ')}. Judge: ${JUDGE_MODEL}, pairwise, both orders.`, '',
  '| variant | setup | wins | losses | ties | naturalness (1–10) | accuracy (reviewer) |', '|---|---|---|---|---|---|---|',
  ...names.map(n => `| ${n} | ${JSON.stringify(VARIANTS[n])} | ${stat[n]!.wins} | ${stat[n]!.losses} | ${stat[n]!.ties} | ${mean(stat[n]!.natural)} | ${mean(VIDEOS.map(id => facts.get(`${id}/${n}`)!))} |`),
  '', ...names.flatMap(n => [`## ${n}: sentences the judge flagged`, ...[...new Set(stat[n]!.worst)].slice(0, 12).map(s => `- ${s}`), '']),
]
await writeFile(join(OUT, 'report.md'), lines.join('\n'))
console.log(lines.slice(0, 10).join('\n'))
