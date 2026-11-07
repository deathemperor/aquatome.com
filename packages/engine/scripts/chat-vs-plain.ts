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
 *   … --only algae-01,sick-03 --conditions tank --concurrency 4 --judges 3   # pairs judged at once, two orders each
 *   … --retry-failed            # ask again where a cached answer failed (a timeout, no key), instead of keeping it
 *   … --model claude-haiku-5-5 --judge claude-opus-5-5 --site https://aquatome.com --out <file>
 *   … --panel <dir>             # also one blind packet for other judges (panel.md, key.json); their replies,
 *                               # saved there as verdicts-<judge>.json, join the report on the next run
 *
 * Keys: ~/.config/aquatome/anthropic-keys, as chat-eval.ts reads them. Answers and verdicts are cached in --cache, under
 * the chat's code and the question, so a run after a change to the chat's brain asks again and plain Claude's answers
 * are kept. Writes docs/review/chat-vs-plain.md.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { PageShard } from '@aq/schema/app-page'
import type { Limits } from '../../../apps/site/worker/agent/loop'
import { answerQuestion, type ChatOptions, type ChatRun } from '../../../apps/site/worker/chat/agent'
import type { ChatBlock } from '../../../apps/site/worker/chat/answer'
import { handbookOf, type Index, type Source } from '../../../apps/site/worker/chat/handbook'
import type { Topics } from '../../../apps/site/worker/chat/topics'
import { clientFor, costOf } from '../../../apps/site/worker/fishid/claude'
import { healthyKeys, loadKeys, memoryHealth, rotate, type HealthStore, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { claudeCli } from '../src/claude'
import {
  CONDITIONS, CRITERIA, JUDGE_SCHEMA, JUDGE_SYSTEM, judgePrompt, LACKS, outcome, panelPrompt, panelSide, readPanel, RUBRIC_VERSION, savedTank, seenOurs, single,
  tankFacts, TOPICS, unbrand, type Condition, type Criterion, type HardQuestion, type Judged, type PairOutcome, type Verdict,
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
    split: { type: 'string', default: 'all' },
    limits: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    judges: { type: 'string', default: '3' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    site: { type: 'string', default: 'https://aquatome.com' },
    cache: { type: 'string', default: '/tmp/chat-vs-plain' },
    out: { type: 'string', default: join(ROOT, 'docs/review/chat-vs-plain.md') },
    panel: { type: 'string' },
    'retry-failed': { type: 'boolean', default: false },
  },
})
const MODEL = args.model!
/** The agent's limits for ours, over the Worker's own (CHAT_LIMITS), as JSON: to see what a looser budget would buy. */
const LIMITS = args.limits ? (JSON.parse(args.limits) as Partial<Limits>) : undefined
const JUDGE = args.judge!
const WANTED = args.conditions!.split(',').filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c))
const hash = (...xs: unknown[]) => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 12)
const git = (...a: string[]) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
/** The chat's code as it is in this checkout: its last commit and any change not committed, so a changed brain asks again. */
const BRAIN = ['apps/site/worker/chat', 'apps/site/worker/agent']
/** The chat's code by its content: each file's blob, committed or not, so committing a change keeps its answers. */
const brainFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '--', ...BRAIN).split('\n').filter(f => f && existsSync(join(ROOT, f))).sort()
const brainBlobs = brainFiles.length ? git('hash-object', '--', ...brainFiles).split('\n') : []
const brain = hash(brainFiles.map((f, i) => [f, brainBlobs[i]]))
const commit = `${git('log', '-1', '--format=%h', '--', ...BRAIN)}${git('status', '--porcelain', '--', ...BRAIN) ? ', with changes not committed' : ''}`

let cacheDir = ''
/** Read or make and keep; an answer that failed is kept too (a run is repeatable), unless --retry-failed asks again. */
const cachedFile = async <T>(name: string, make: () => Promise<T>): Promise<T> => {
  const file = join(cacheDir, name)
  try {
    const v = JSON.parse(await readFile(file, 'utf8')) as T
    if (!(args['retry-failed'] && (v as { failed?: string }).failed)) return v
  } catch { /* not yet */ }
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

/**
 * The questions kept out of tuning: three a problem, marked `holdout` in the questions' file (picked once at random). Changes to the brain are tried on the others
 * (`--split dev`); the holdout (`--split holdout`) is read only for a result, so the brain isn't fitted to it.
 */
let held = new Set<string>()
const holdout = (qs: HardQuestion[]) => new Set(qs.filter(q => q.holdout).map(q => q.id))

/** An answer as the judge reads it (`text`); ours keeps what Claude chose and the Worker filled (`turn`), so a change to
 * how a block is shown judges the same answers again. */
type Answered = { text: string; usd: number; ms: number; failed?: string; read?: string[]; stopped?: string; turn?: { text: string; blocks: ChatBlock[]; suggestions: string[] } }
const asked = (q: HardQuestion, c: Condition) => (c === 'post' ? q.post : q.short)
/** Our turn as the reader sees it now (chat-vs-plain-lib.ts `seenOurs`). */
const seen = (a: Answered): Answered => (a.turn ? { ...a, text: seenOurs(a.turn.text, a.turn.blocks, a.turn.suggestions) } : a)

async function main() {
  if (!['all', 'dev', 'holdout'].includes(args.split!)) throw new Error(`--split is all, dev or holdout, not "${args.split}"`)
  const all = JSON.parse(await readFile(args.questions!, 'utf8')) as HardQuestion[]
  held = holdout(all)
  const questions = all
    .filter(q => !args.only || args.only.split(',').includes(q.id))
    .filter(q => (TOPICS as readonly string[]).includes(q.topic))
    .filter(q => args.split === 'all' || (args.split === 'holdout') === held.has(q.id))
  const indexText = await (await fetch(new URL('/app/vi.json', args.site))).text()
  // The guides' topics and which are held change apart from the index, so the build's folder is named for both.
  const topicsText = await (await fetch(new URL('/app/chat/vi.json', args.site))).text()
  siteDir = join(args.cache!, `site-${new URL(args.site!).host}-${hash(indexText, topicsText)}`)
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

  const ours = async (q: HardQuestion, c: Condition) => seen(await cachedFile<Answered>(`ours-v2-${MODEL}-${brain}${LIMITS ? `-limits${hash(LIMITS)}` : ''}-${c}-${q.id}-${hash(asked(q, c), q.tank)}.json`, async () => {
    const t = Date.now()
    try {
      const tanks = c === 'tank' && q.tank ? [savedTank(q.tank)] : []
      const run: ChatRun = await answerQuestion({ send: sender(await healthyKeys(keys, store, Date.now()), store), model: MODEL, lang: 'vi', question: asked(q, c), earlier: [], start: {}, handbook: hb, tanks: async () => tanks, ...(LIMITS ? { limits: LIMITS } : {}) })
      const read = run.steps.flatMap(s => (s.kind === 'read' ? [s.page.url] : []))
      const usd = costOf(MODEL, run.spent)
      if (!run.answer) return { text: '', usd, ms: Date.now() - t, failed: run.error ? String((run.error as Error).message ?? run.error).slice(0, 160) : `no answer (stopped: ${run.stopped})`, read, stopped: run.stopped }
      return { text: '', turn: { text: run.answer.text, blocks: run.blocks, suggestions: run.answer.suggestions }, usd, ms: Date.now() - t, read, stopped: run.stopped }
    } catch (e) {
      return { text: '', usd: 0, ms: Date.now() - t, failed: String((e as Error).message ?? e).slice(0, 160) }
    }
  }))
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

  const judged = args.panel ? await panelOf(pairs.filter(p => p.result), args.panel) : []
  await writeFile(args.out!, report(pairs, questions.length, judged))
  console.log(`Written: ${args.out}`)
}

/**
 * The panel (`--panel <dir>`): the pairs the judge judged as one blind packet, <dir>/panel.md (the rubric once, each pair
 * once, ours on the side its hash picks), and its key beside the folder, <dir>.key.json, out of the judges' sight: each
 * pair's question, side and the answers it showed. Each other judge's reply, its JSON array, saved in the folder as
 * verdicts-<judge>.json, is read back by the key on a later run, never rewritten: a verdict counts only for the pair
 * it was given, with the same answers. Delete the verdicts to write a new packet.
 */
type KeyPair = { pair: number; id: string; condition: Condition; oursIs: 'X' | 'Y'; answers: string }
async function panelOf(pairs: { q: HardQuestion; c: Condition; ours: Answered; plain: Answered; result?: PairOutcome }[], dir: string) {
  await mkdir(dir, { recursive: true })
  const keyFile = `${dir.replace(/\/+$/, '')}.key.json`
  const files = (await readdir(dir)).filter(f => /^verdicts-.+\.json$/.test(f)).sort()
  const answers = (p: (typeof pairs)[number]) => hash(p.ours.text, p.plain.text)
  if (!files.length) {
    const sorted = [...pairs].sort((a, b) => hash(a.q.id, a.c).localeCompare(hash(b.q.id, b.c)))
    const key: KeyPair[] = sorted.map((p, i) => ({ pair: i + 1, id: p.q.id, condition: p.c, oursIs: panelSide(hash('side', p.q.id, p.c)), answers: answers(p) }))
    await writeFile(join(dir, 'panel.md'), panelPrompt(sorted.map((p, i) => {
      const [x, y] = key[i]!.oursIs === 'X' ? [p.ours.text, p.plain.text] : [p.plain.text, p.ours.text]
      return { pair: i + 1, question: asked(p.q, p.c), tank: p.c === 'tank' && p.q.tank ? tankFacts(p.q.tank) : null, x: unbrand(x), y: unbrand(y) }
    })))
    await writeFile(keyFile, JSON.stringify({ commit, model: MODEL, pairs: key }, null, 2))
    console.log(`Panel: ${join(dir, 'panel.md')} (${sorted.length} pairs), its key ${keyFile}`)
    return []
  }
  const key = (JSON.parse(await readFile(keyFile, 'utf8')) as { pairs: KeyPair[] }).pairs
  const now = new Map(pairs.map(p => [`${p.q.id} ${p.c}`, p]))
  return Promise.all(files.map(async f => {
    const judge = f.slice('verdicts-'.length, -'.json'.length)
    const verdicts = readPanel(await readFile(join(dir, f), 'utf8'))
    if (!verdicts.size) console.log(`panel: no verdicts read in ${f}`)
    const results = key.flatMap(k => {
      const p = now.get(`${k.id} ${k.condition}`)
      const v = verdicts.get(k.pair)
      return p && v && answers(p) === k.answers ? [{ p, r: single(v, k.oursIs) }] : []
    })
    return { judge, results, left: key.filter(k => now.has(`${k.id} ${k.condition}`)).length - results.length }
  }))
}
type Panel = Awaited<ReturnType<typeof panelOf>>

const pct = (k: number, n: number) => (n ? `${k}/${n}` : '–')
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : '–')
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)
const counts = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || '–'

function report(pairs: { q: HardQuestion; c: Condition; ours: Answered; plain: Answered; result?: PairOutcome }[], n: number, panel: Panel = []): string {
  const done = pairs.filter(p => p.result)
  // One side failed and the other answered: that reader got an error, so the other side wins it on every count (no score:
  // nothing to judge). Both failed: left out.
  const lost = (p: (typeof pairs)[number]) => Boolean(p.ours.failed) && !p.plain.failed
  const won = (p: (typeof pairs)[number]) => Boolean(p.plain.failed) && !p.ours.failed
  const row = (label: string, all: typeof pairs) => {
    const ps = all.filter(p => p.result)
    const failed = all.filter(lost).length
    const plainFailed = all.filter(won).length
    const w = (o: 'ours' | 'plain' | 'tie') => ps.filter(p => p.result!.better === o).length + (o === 'plain' ? failed : o === 'ours' ? plainFailed : 0)
    const by = (c: Criterion, o: 'ours' | 'plain') => ps.filter(p => p.result!.criteria[c] === o).length + (o === 'plain' ? failed : plainFailed)
    return `| ${label} | ${w('ours')} / ${w('plain')} / ${w('tie')} of ${ps.length + failed + plainFailed}${failed ? `, ours failed ${failed}` : ''}${plainFailed ? `, plain failed ${plainFailed}` : ''} | ${avg(ps.map(p => p.result!.ours))} · ${avg(ps.map(p => p.result!.plain))} | ${CRITERIA.map(c => `${by(c, 'ours')}–${by(c, 'plain')}`).join(' | ')} | ${pct(ps.filter(p => p.result!.consistent).length, ps.length)} | ${stops(all)} |`
  }
  // How ours ended: Claude answered when it chose, a limit forced the last call, or no answer at all.
  const stops = (ps: typeof pairs) => `${ps.filter(p => !p.ours.failed && p.ours.stopped === 'answer').length} / ${ps.filter(p => !p.ours.failed && p.ours.stopped && p.ours.stopped !== 'answer').length} / ${ps.filter(p => p.ours.failed).length}`
  const head = `| | Ours / plain / tie or split | Score: ours · plain | ${CRITERIA.join(' | ')} | Orders agree | Ours stopped: answered / at a limit / failed |\n| --- | --- | ---: | ${CRITERIA.map(() => '---:').join(' | ')} | ---: | ---: |`
  const usd = (k: 'ours' | 'plain') => (pairs.reduce((t, p) => t + p[k].usd, 0) / Math.max(1, pairs.length)).toFixed(4)
  const lines = [
    '# The chat against plain Claude, on hard problems',
    '',
    `${new Date().toISOString().slice(0, 10)}, \`packages/engine/scripts/chat-vs-plain.ts\`. ${n} questions (${args.split === 'all' ? 'all of them' : args.split === 'dev' ? 'those tuned on' : 'the holdout, kept out of tuning'}) from public Vietnamese hobby forums, reworded with no names (\`packages/engine/scripts/hard-questions.vi.json\`), in two conditions. Ours: the Worker's own agent, prompt, schema, effort and ${LIMITS ? `limits but these, \`${JSON.stringify(LIMITS)}\`,` : 'limits'} at commit \`${commit}\`, ${MODEL}, over ${args.site}'s handbook. Plain: ${MODEL}, the same effort, no system prompt, no tools, no handbook. Judge: ${JUDGE} through the Claude CLI, rubric version ${RUBRIC_VERSION} (\`chat-vs-plain-lib.ts\`).`,
    '',
    '- **post:** both answer the whole forum post. **tank:** both get a short question. The eval saves the post\'s tank for the reader (size, fish, plants, substrate, age; the light, CO₂ and fertiliser as the tank\'s notes), and ours sees only what the chat\'s code reads of a saved tank; plain Claude sees only the question. The judge is told everything the post said about the tank.',
    '- **Blind, as far as it goes:** the judge isn\'t told which answer is ours, and both lose the site\'s name and links. Ours still looks different (short text with excerpts, cards and tools under it), so the blinding is partial.',
    '- **Both orders:** each pair is judged twice, the answers swapped. A side wins only when both orders pick it; a split counts as a tie. The same for each count.',
    '- **Failed:** when one side failed (ours: the limits ran out, a call timed out) and the other answered, that reader got an error: the other side wins it on every count, with no score. A failed answer is kept in the cache, so a rerun is the same run; `--retry-failed` asks again.',
    '- **Counts** (ours–plain wins): correct (right and safe), fits (uses this tank), actionable (what to do now, in order), grounded (no made-up precision), local (Vietnamese and Vietnam).',
    `- **Cost** per question, at list price: ours $${usd('ours')}, plain $${usd('plain')}. The judge runs on the owner's Claude accounts.`,
    '',
    head,
    ...WANTED.map(c => row(c, pairs.filter(p => p.c === c))),
    '',
    ...(panel.length ? [
      '## Other judges',
      '',
      `Other providers' models, through Infinitus on the owner's Cursor plan, read the same pairs in one blind packet: each pair once, ours on a side its hash picks, with the judge's rubric. One order each, so a judge's lean to one side isn't cancelled out as above. "Same as ${JUDGE}": the pairs where its pick matches the headline's (a split there counts as a tie).`,
      '',
      `| | Ours / plain / tie | Score: ours · plain | ${CRITERIA.join(' | ')} | Same as ${JUDGE} |`,
      `| --- | --- | ---: | ${CRITERIA.map(() => '---:').join(' | ')} | ---: |`,
      ...panel.flatMap(j => WANTED.map(c => {
        const rs = j.results.filter(x => x.p.c === c)
        const w = (o: 'ours' | 'plain' | 'tie') => rs.filter(x => x.r.better === o).length
        return `| ${j.judge} · ${c} | ${w('ours')} / ${w('plain')} / ${w('tie')} of ${rs.length}${j.left ? ` (${j.left} of the packet's pairs left out: no verdict, or the answers changed since)` : ''} | ${avg(rs.map(x => x.r.ours))} · ${avg(rs.map(x => x.r.plain))} | ${CRITERIA.map(k => `${rs.filter(x => x.r.criteria[k] === 'ours').length}–${rs.filter(x => x.r.criteria[k] === 'plain').length}`).join(' | ')} | ${pct(rs.filter(x => x.r.better === x.p.result!.better).length, rs.length)} |`
      })),
      '',
    ] : []),
    '## By problem',
    '',
    head,
    ...WANTED.flatMap(c => TOPICS.flatMap(t => { const ps = pairs.filter(p => p.c === c && p.q.topic === t); return ps.length ? [row(`${c} · ${t}`, ps)] : [] })),
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
      ...(p.ours.failed ? [`failed: ${p.ours.failed}`] : cut(p.ours.text, 600).split('\n').map(l => `> ${l}`)),
      '',
      `**Plain** (${p.plain.text.length} characters):`,
      '',
      ...(p.plain.failed ? [`failed: ${p.plain.failed}`] : cut(p.plain.text, 600).split('\n').map(l => `> ${l}`)),
      '',
    )
  }
  return `${lines.join('\n')}\n`
}

await main()
