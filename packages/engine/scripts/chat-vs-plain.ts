/**
 * Our chat against plain Claude on readers' hard problems: algae, setting up a tank, cycling, sick fish, stocking.
 *
 * The questions (hard-questions.vi.json) are public Vietnamese forum posts, reworded with no names. Each is asked in two
 * conditions, reported apart (chat-vs-plain-lib.ts `CONDITIONS`):
 * - post: the whole post, word for word, to both.
 * - tank: a short question; ours reads the reader's saved tank (what the chat reads of it today), plain Claude has only
 *   the question.
 *
 * Ours: the Worker's own agent, prompt, schema, effort and limits (apps/site/worker/chat/), the production model, over
 * the live site's handbook. Plain: the same model, the same effort, no system prompt, no tools, no handbook.
 *
 * A judge (another model, on the owner's accounts through the Claude CLI) reads both as the reader sees them, without
 * the site's name or links, in both orders. A side wins a pair only when both orders pick it. It scores each 1–10, picks
 * per count (correct, fits, actionable, grounded, local), tags what each lacks and quotes any error.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-vs-plain.ts                      # every question, both conditions
 *   … --only algae-01,sick-03 --conditions tank --concurrency 4 --judges 3
 *   … --model claude-haiku-5-5 --judge claude-opus-5-5 --site https://aquatome.com --out <file>
 *   … --packet <dir> --n 12     # also a blind packet of n pairs for a council round, and its key
 *
 * Keys: ~/.config/aquatome/anthropic-keys, as chat-eval.ts reads them. Answers and verdicts are cached in --cache, under
 * the chat's code and the question, so a run after a change to the chat's brain asks again and plain Claude's answers
 * are kept. Writes docs/review/chat-vs-plain.md.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { PageShard } from '@aq/schema/app-page'
import { answerQuestion, type ChatOptions, type ChatRun } from '../../../apps/site/worker/chat/agent'
import { handbookOf, type Index, type Source } from '../../../apps/site/worker/chat/handbook'
import type { Topics } from '../../../apps/site/worker/chat/topics'
import { clientFor, costOf } from '../../../apps/site/worker/fishid/claude'
import { healthyKeys, loadKeys, memoryHealth, rotate, type HealthStore, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { claudeCli } from '../src/claude'
import {
  CONDITIONS, CRITERIA, JUDGE_SCHEMA, JUDGE_SYSTEM, judgePrompt, LACKS, outcome, RUBRIC_VERSION, savedTank, seenOurs, tankFacts, TOPICS, unbrand,
  type Condition, type HardQuestion, type Judged, type PairOutcome, type Verdict,
} from './chat-vs-plain-lib'
import { pool, retry } from './eval-lib'

const ROOT = join(import.meta.dirname, '../../..')
type Send = ChatOptions['send']
type Message = Awaited<ReturnType<Send>>
type Client = Awaited<ReturnType<typeof clientFor>>
const { values: args } = parseArgs({
  options: {
    questions: { type: 'string', default: join(import.meta.dirname, 'hard-questions.vi.json') },
    model: { type: 'string', default: 'claude-haiku-5-5' },
    judge: { type: 'string', default: 'claude-opus-5-5' },
    conditions: { type: 'string', default: CONDITIONS.join(',') },
    only: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    judges: { type: 'string', default: '3' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    site: { type: 'string', default: 'https://aquatome.com' },
    cache: { type: 'string', default: '/tmp/chat-vs-plain' },
    out: { type: 'string', default: join(ROOT, 'docs/review/chat-vs-plain.md') },
    packet: { type: 'string' },
    n: { type: 'string', default: '12' },
  },
})
const MODEL = args.model!
const JUDGE = args.judge!
const WANTED = args.conditions!.split(',').filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c))
const hash = (...xs: unknown[]) => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 12)
const git = (...a: string[]) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
/** The chat's code as it is in this checkout: its last commit and any change not committed, so a changed brain asks again. */
const BRAIN = ['apps/site/worker/chat', 'apps/site/worker/agent']
const brain = hash(git('log', '-1', '--format=%H', '--', ...BRAIN), git('diff', 'HEAD', '--', ...BRAIN))
const commit = `${git('log', '-1', '--format=%h', '--', ...BRAIN)}${git('status', '--porcelain', '--', ...BRAIN) ? ', with changes not committed' : ''}`

let cacheDir = ''
const cachedFile = async <T>(name: string, make: () => Promise<T>): Promise<T> => {
  const file = join(cacheDir, name)
  try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { /* not yet */ }
  const v = await make()
  await writeFile(file, JSON.stringify(v, null, 2))
  return v
}
/** The live site's handbook, each file kept once read (in the build's own folder). */
let siteDir = ''
async function site<T>(path: string): Promise<T | null> {
  const file = join(siteDir, path.replace(/^\//, '').replace(/\//g, '_'))
  try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { /* not yet */ }
  const r = await fetch(new URL(path, args.site))
  if (!r.ok) return null
  const text = await r.text()
  await writeFile(file, text)
  return JSON.parse(text) as T
}
const source: Source = {
  index: lang => site<Index>(`/app/${lang}.json`),
  shard: (lang, kind, n) => site<PageShard>(`/app/pages/${lang}/${kind}-${n}.json`),
  topics: lang => site<Topics>(`/app/chat/${lang}.json`),
}

/** A call on the keys: the first rotates over the healthy ones, later calls in a run keep the key that answered. */
function sender(healthy: KeyEntry[], store: HealthStore): Send {
  let client: Client | undefined
  return async (b, { timeoutMs, call }) => {
    if (call > 1 && client) return client.messages.create(b, { timeout: timeoutMs })
    const r = await rotate(healthy, store, async (k, left) => {
      const c = await clientFor(k)
      const m = await c.messages.create(b, { timeout: Math.min(left, timeoutMs) })
      client = c
      return m
    }, { budgetMs: timeoutMs })
    if (!r.ok) throw new Error(`no key answered: ${r.reason}`)
    return r.value
  }
}

type Answered = { text: string; usd: number; ms: number; failed?: string; read?: string[]; stopped?: string }
const asked = (q: HardQuestion, c: Condition) => (c === 'post' ? q.post : q.short)

async function main() {
  const questions = (JSON.parse(await readFile(args.questions!, 'utf8')) as HardQuestion[])
    .filter(q => !args.only || args.only.split(',').includes(q.id))
    .filter(q => (TOPICS as readonly string[]).includes(q.topic))
  const indexText = await (await fetch(new URL('/app/vi.json', args.site))).text()
  siteDir = join(args.cache!, `site-${new URL(args.site!).host}-${hash(indexText)}`)
  cacheDir = join(args.cache!, 'runs')
  await mkdir(siteDir, { recursive: true })
  await mkdir(cacheDir, { recursive: true })
  await writeFile(join(siteDir, 'app_vi.json'), indexText)
  const hb = await handbookOf(source, 'vi')
  if (!hb) throw new Error(`No app index at ${args.site}`)
  const { keys } = await loadKeys(await readFile(args.keys!, 'utf8').catch(() => ''))
  if (!keys.length) throw new Error(`No key in ${args.keys}`)
  const store = memoryHealth()
  console.log(`${questions.length} questions × ${WANTED.join(', ')}; ${MODEL}, judged by ${JUDGE}; the chat's code at ${commit}`)
  const gone = questions.flatMap(q => (q.tank?.fish ?? []).flatMap(f => (f.id && hb.byId(f.id)?.kind !== 'fish' ? [`${q.id}: ${f.id}`] : [])))
  if (gone.length) throw new Error(`Pinned fish the handbook doesn't have: ${gone.join(', ')}`)

  const ours = (q: HardQuestion, c: Condition) => cachedFile<Answered>(`ours-${MODEL}-${brain}-${c}-${q.id}-${hash(asked(q, c), q.tank)}.json`, async () => {
    const t = Date.now()
    try {
      const tanks = c === 'tank' && q.tank ? [savedTank(q.tank)] : []
      const run: ChatRun = await answerQuestion({ send: sender(await healthyKeys(keys, store, Date.now()), store), model: MODEL, lang: 'vi', question: asked(q, c), earlier: [], start: {}, handbook: hb, tanks: async () => tanks })
      const read = run.steps.flatMap(s => (s.kind === 'read' ? [s.page.url] : []))
      const usd = costOf(MODEL, run.spent)
      if (!run.answer) return { text: '', usd, ms: Date.now() - t, failed: run.error ? String((run.error as Error).message ?? run.error).slice(0, 160) : `no answer (stopped: ${run.stopped})`, read, stopped: run.stopped }
      return { text: seenOurs(run.answer.text, run.blocks, run.answer.suggestions), usd, ms: Date.now() - t, read, stopped: run.stopped }
    } catch (e) {
      return { text: '', usd: 0, ms: Date.now() - t, failed: String((e as Error).message ?? e).slice(0, 160) }
    }
  })
  const plain = (q: HardQuestion, c: Condition) => cachedFile<Answered>(`plain-${MODEL}-${c}-${q.id}-${hash(asked(q, c))}.json`, async () => {
    const t = Date.now()
    try {
      const send = sender(await healthyKeys(keys, store, Date.now()), store)
      const m: Message = await send({ model: MODEL, max_tokens: 8192, messages: [{ role: 'user', content: asked(q, c) }], output_config: { effort: 'medium' } } as Parameters<Send>[0], { timeoutMs: 120_000, call: 1 })
      const text = m.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
      const usage = { input: m.usage.input_tokens, output: m.usage.output_tokens }
      return { text, usd: costOf(MODEL, usage), ms: Date.now() - t, ...(m.stop_reason === 'max_tokens' ? { stopped: 'max_tokens' } : {}) }
    } catch (e) {
      return { text: '', usd: 0, ms: Date.now() - t, failed: String((e as Error).message ?? e).slice(0, 160) }
    }
  })

  type Pair = { q: HardQuestion; c: Condition; ours: Answered; plain: Answered; judged?: Judged; result?: PairOutcome }
  const pairs: Pair[] = await pool(questions.flatMap(q => WANTED.map(c => async (): Promise<Pair> => {
    const [o, p] = await Promise.all([ours(q, c), plain(q, c)])
    console.log(`answered ${q.id} ${c}: ours ${o.failed ? `FAILED ${o.failed}` : `${o.text.length} chars`} $${o.usd.toFixed(4)}, plain ${p.failed ? `FAILED ${p.failed}` : `${p.text.length} chars`}`)
    return { q, c, ours: o, plain: p }
  })), Number(args.concurrency))

  // The judge: both orders, each cached under the rubric's version and what it read.
  const judgeOnce = (p: Pair, x: string, y: string) => {
    const tank = p.c === 'tank' && p.q.tank ? tankFacts(p.q.tank) : null
    const prompt = judgePrompt(asked(p.q, p.c), tank, unbrand(x), unbrand(y))
    return cachedFile<Verdict>(`judge-${JUDGE}-v${RUBRIC_VERSION}-${hash(prompt)}.json`, () => retry(() => claudeCli<Verdict>({ system: JUDGE_SYSTEM, prompt, schema: JUDGE_SCHEMA, model: JUDGE })))
  }
  await pool(pairs.filter(p => !p.ours.failed && !p.plain.failed).map(p => async () => {
    try {
      const [first, second] = await Promise.all([judgeOnce(p, p.ours.text, p.plain.text), judgeOnce(p, p.plain.text, p.ours.text)])
      p.judged = { first, second }
      p.result = outcome(p.judged)
      console.log(`judged ${p.q.id} ${p.c}: ${p.result.better} (ours ${p.result.ours}, plain ${p.result.plain}${p.result.consistent ? '' : ', orders split'})`)
    } catch (e) {
      console.log(`judge failed ${p.q.id} ${p.c}: ${String((e as Error).message ?? e).slice(0, 160)}`)
    }
  }), Number(args.judges))

  await writeFile(args.out!, report(pairs, questions.length))
  console.log(`Written: ${args.out}`)
  if (args.packet) await packet(pairs.filter(p => p.result), args.packet, Number(args.n))
}

const pct = (k: number, n: number) => (n ? `${k}/${n}` : '–')
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–')
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)
const counts = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '–'

function report(pairs: { q: HardQuestion; c: Condition; ours: Answered; plain: Answered; result?: PairOutcome }[], n: number): string {
  const done = pairs.filter(p => p.result)
  const row = (label: string, ps: typeof done) => {
    const w = (o: 'ours' | 'plain' | 'tie') => ps.filter(p => p.result!.better === o).length
    return `| ${label} | ${w('ours')} / ${w('plain')} / ${w('tie')} of ${ps.length} | ${avg(ps.map(p => p.result!.ours))} · ${avg(ps.map(p => p.result!.plain))} | ${CRITERIA.map(c => `${ps.filter(p => p.result!.criteria[c] === 'ours').length}–${ps.filter(p => p.result!.criteria[c] === 'plain').length}`).join(' | ')} | ${pct(ps.filter(p => p.result!.consistent).length, ps.length)} |`
  }
  const head = `| | Ours / plain / tie or split | Score: ours · plain | ${CRITERIA.join(' | ')} | Orders agree |\n| --- | --- | ---: | ${CRITERIA.map(() => '---:').join(' | ')} | ---: |`
  const usd = (k: 'ours' | 'plain') => (pairs.reduce((t, p) => t + p[k].usd, 0) / Math.max(1, pairs.length)).toFixed(4)
  const lines = [
    '# The chat against plain Claude, on hard problems',
    '',
    `${new Date().toISOString().slice(0, 10)}, \`packages/engine/scripts/chat-vs-plain.ts\`. ${n} questions from public Vietnamese hobby forums, reworded with no names (\`packages/engine/scripts/hard-questions.vi.json\`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and limits at commit \`${commit}\`, ${MODEL}, over ${args.site}'s handbook. Plain: ${MODEL}, the same effort, no system prompt, no tools, no handbook. Judge: ${JUDGE} through the Claude CLI, rubric version ${RUBRIC_VERSION} (\`chat-vs-plain-lib.ts\`).`,
    '',
    '- **post:** both answer the whole forum post. **tank:** both get a short question; ours reads the reader\'s saved tank as the chat reads it today (size, fish and counts; not plants, light, CO₂ or notes), plain Claude only the question. The judge is told everything the post said about the tank.',
    '- **Blind, as far as it goes:** the judge isn\'t told which answer is ours, and both lose the site\'s name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.',
    '- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.',
    '- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).',
    `- **Cost** per question, at list price: ours $${usd('ours')}, plain $${usd('plain')}. The judge runs on the owner's Claude accounts.`,
    '',
    head,
    ...WANTED.map(c => row(c, done.filter(p => p.c === c))),
    '',
    '## By problem',
    '',
    head,
    ...WANTED.flatMap(c => TOPICS.flatMap(t => { const ps = done.filter(p => p.c === c && p.q.topic === t); return ps.length ? [row(`${c} · ${t}`, ps)] : [] })),
    '',
    '## What each lacks, as the judge tagged it',
    '',
    '| | Ours | Plain |',
    '| --- | --- | --- |',
    ...WANTED.map(c => `| ${c} | ${counts(done.filter(p => p.c === c).flatMap(p => p.result!.lacksOurs))} | ${counts(done.filter(p => p.c === c).flatMap(p => p.result!.lacksPlain))} |`),
    '',
    `Tags: ${LACKS.join(', ')}.`,
    '',
    '## Errors the judge found',
    '',
    ...done.flatMap(p => [
      ...p.result!.errorsOurs.map(e => `- ours, ${p.q.id} ${p.c}: ${cell(e)}`),
      ...p.result!.errorsPlain.map(e => `- plain, ${p.q.id} ${p.c}: ${cell(e)}`),
    ]),
    '',
    '## Failed',
    '',
    ...pairs.filter(p => p.ours.failed || p.plain.failed || !p.result).map(p => `- ${p.q.id} ${p.c}: ${p.ours.failed ? `ours ${cell(p.ours.failed)}` : ''}${p.plain.failed ? ` plain ${cell(p.plain.failed)}` : ''}${!p.ours.failed && !p.plain.failed && !p.result ? 'not judged' : ''}`),
    '',
    '## Each question',
    '',
  ]
  for (const p of pairs) {
    const r = p.result
    lines.push(
      `### ${p.q.id} · ${p.c} · ${r ? `${r.better === 'tie' ? 'tie or split' : `${r.better} wins`} (${r.ours} · ${r.plain})` : 'not judged'}`,
      '',
      `**Asked:** ${cell(asked(p.q, p.c))}`,
      '',
      ...(r ? [`**Judge:** ${cell(r.why.join(' / '))}`, '', `**Ours lacks:** ${r.lacksOurs.join(', ') || '–'}. **Plain lacks:** ${r.lacksPlain.join(', ') || '–'}.`, ''] : []),
      `**Ours** (read ${p.ours.read?.length ?? 0} pages${p.ours.stopped && p.ours.stopped !== 'answer' ? `, stopped at the ${p.ours.stopped} limit` : ''}):`,
      '',
      ...(p.ours.failed ? [`failed: ${p.ours.failed}`] : cut(p.ours.text, 1500).split('\n').map(l => `> ${l}`)),
      '',
      `**Plain** (${p.plain.text.length} characters):`,
      '',
      ...(p.plain.failed ? [`failed: ${p.plain.failed}`] : cut(p.plain.text, 1500).split('\n').map(l => `> ${l}`)),
      '',
    )
  }
  return `${lines.join('\n')}\n`
}

/** A blind packet for a council round: n pairs, each answer as A or B at random, and the key to read the verdicts back. */
async function packet(pairs: { q: HardQuestion; c: Condition; ours: Answered; plain: Answered }[], dir: string, n: number) {
  await mkdir(dir, { recursive: true })
  const picked = [...pairs].sort((a, b) => hash(a.q.id, a.c).localeCompare(hash(b.q.id, b.c))).slice(0, n)
  const key: Record<string, 'A' | 'B'> = {}
  const parts = picked.map((p, i) => {
    const id = `${i + 1}`
    const oursIs = parseInt(hash('side', p.q.id, p.c), 16) % 2 ? 'A' : 'B'
    key[id] = oursIs
    const [a, b] = oursIs === 'A' ? [p.ours.text, p.plain.text] : [p.plain.text, p.ours.text]
    const tank = p.c === 'tank' && p.q.tank ? `\nWhat is true about their tank (their app holds it; they didn't type it):\n${tankFacts(p.q.tank)}\n` : ''
    return `## Pair ${id}\n\nThe question:\n"""\n${asked(p.q, p.c)}\n"""\n${tank}\n### A\n\n${unbrand(a)}\n\n### B\n\n${unbrand(b)}\n`
  })
  await writeFile(join(dir, 'packet.md'), parts.join('\n---\n\n'))
  await writeFile(join(dir, 'key.json'), JSON.stringify({ oursIs: key, pairs: picked.map((p, i) => ({ pair: i + 1, id: p.q.id, condition: p.c })) }, null, 2))
  console.log(`Packet: ${join(dir, 'packet.md')} (${picked.length} pairs), key ${join(dir, 'key.json')}`)
}

await main()
