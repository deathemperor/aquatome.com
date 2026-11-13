/**
 * The troubleshooting board: our chat against a general chatbot on readers' tank problems, by subject (fish dying, sick
 * fish, algae, cycling, stocking). Each forum post is asked in three forms:
 * - post: the whole post, no saved tank.
 * - posttank: the whole post, with the reader's tank saved in the app (the chat can read it; a general chatbot is told
 *   its facts in the reader's words, as someone pasting them into a chat would).
 * - tank: a short question with the tank saved: the owner's own kind, typed on a phone.
 *
 * Steps, each writing <dir>/<arm>/turns.json (or judge-<a>-vs-<b>.json), so a step run again keeps what's done:
 *
 *   tsx scripts/chat-board.ts answer --chat <checkout> --arm main [--given <dir>]   our chat as that checkout has it
 *   tsx scripts/chat-board.ts plain --model claude-opus-5-5 --arm plain-opus         no handbook, no tools
 *   tsx scripts/chat-board.ts judge --ours main --plain plain-opus                  both orders, a side wins on both
 *   tsx scripts/chat-board.ts report --pairs main:plain-opus,mainB:main,…           the board, by subject and form
 *
 * Ours runs the checkout's own agent, prompt, schema and limits (apps/site/worker/chat/) over the live site's handbook,
 * on the chat's keys (~/.config/aquatome/anthropic-keys), billed. `--given` is chat-search-recall.ts `--give 5`'s folder:
 * the sections the Worker's search would hand over before the first call (handover.ts `handsOver`: a saved tank and a
 * question under 150 characters). A plain answer through the CLI (claude-opus-5-5) is on the owner's subscription;
 * through the API (claude-haiku-5-5, the chat's own model, as chat-vs-plain.ts asked on 8 Nov) it is billed. The judge
 * is Opus through the CLI, with chat-vs-plain's rubric.
 *
 * The posts (--posts, one or more files) are readers' public forum posts, kept out of the repository; the report says
 * counts only. A third of them, by a hash of the id, may be tuned on (`dev`); the rest are held out, and a change
 * merges only on what it does there.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { claudeCli } from '../src/claude'
import { pool, retry } from './eval-lib'
import { JUDGE_SCHEMA, JUDGE_SYSTEM, judgePrompt, outcome, type PairOutcome, type PostTank, savedTank, seenOurs, tankFacts, unbrand, type Verdict } from './chat-vs-plain-lib'

const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: {
    posts: { type: 'string', default: ['board/posts.vi.json', 'algae-cycling/posts.vi.json'].map(f => join(homedir(), '.cache/aquatome/evals', f)).join(',') },
    dir: { type: 'string', default: join(homedir(), '.cache/aquatome/evals/board/runs') },
    forms: { type: 'string', default: 'post,posttank,tank' },
    only: { type: 'string' },
    chat: { type: 'string' },
    arm: { type: 'string' },
    given: { type: 'string' },
    model: { type: 'string', default: 'claude-haiku-5-5' },
    ours: { type: 'string' },
    plain: { type: 'string' },
    pairs: { type: 'string' },
    judge: { type: 'string', default: 'claude-opus-5-5' },
    concurrency: { type: 'string', default: '3' },
    site: { type: 'string', default: 'https://aquatome.com' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    out: { type: 'string' },
  },
})

type Post = { id: string; topic: string; post: string; short: string; tank: PostTank }
type Form = 'post' | 'posttank' | 'tank'
type Turn = { id: string; post: string; topic: string; form: Form; text?: string; blocks?: unknown[]; suggestions?: string[]; stopped?: string; calls?: number; asked?: string[]; ms: number; usd: number; failed?: string }
const SUBJECTS = ['dying', 'sick', 'algae', 'cycling', 'stocking'] as const
const FORMS = args.forms!.split(',') as Form[]
const hash = (...xs: unknown[]) => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 16)
/** A third of the posts may be tuned on; the rest are held out. Fixed by the id, so it never moves. */
export const dev = (id: string) => parseInt(createHash('sha256').update(id).digest('hex').slice(0, 8), 16) % 3 === 0

async function postsOf(): Promise<Post[]> {
  const all = (await Promise.all(args.posts!.split(',').map(async f => JSON.parse(await readFile(f, 'utf8')) as Post[]))).flat()
  const only = args.only?.split(',')
  return all.filter(p => (SUBJECTS as readonly string[]).includes(p.topic) && (!only || only.includes(p.id)))
}
const asked = (p: Post, f: Form) => (f === 'tank' ? p.short : p.post)

/** The tank in the reader's own words, for a general chatbot that can't read the app. */
function tankWords(t: PostTank): string {
  const size = t.l && t.w && t.h ? `${t.l}x${t.w}x${t.h} cm` : null
  return [
    size || t.litres ? `bể ${[size, t.litres ? `${t.litres} lít` : null].filter(Boolean).join(', ')}` : null,
    t.fish.length ? `cá: ${t.fish.map(f => `${f.name}${f.count ? ` ${f.count} con` : ''}`).join(', ')}` : null,
    t.plants.length ? `cây: ${t.plants.join(', ')}` : null,
    t.light ? `đèn: ${t.light}` : null,
    t.co2 ? `CO2: ${t.co2}` : null,
    t.ferts ? `phân: ${t.ferts}` : null,
    t.substrate ? `nền: ${t.substrate}` : null,
    t.ageWeeks !== null ? `bể chạy được ${t.ageWeeks} tuần` : null,
    t.notes ? t.notes : null,
  ].filter(Boolean).join('; ')
}
const plainQuestion = (p: Post, f: Form) => (f === 'post' ? p.post : `${asked(p, f)}\n\nThông tin bể của mình: ${tankWords(p.tank)}.`)

async function readTurns(arm: string): Promise<Map<string, Turn>> {
  try { return new Map((JSON.parse(await readFile(join(args.dir!, arm, 'turns.json'), 'utf8')) as Turn[]).map(t => [t.id, t])) } catch { return new Map() }
}
async function writeTurns(arm: string, turns: Map<string, Turn>) {
  await mkdir(join(args.dir!, arm), { recursive: true })
  await writeFile(join(args.dir!, arm, 'turns.json'), JSON.stringify([...turns.values()].sort((a, b) => a.id.localeCompare(b.id)), null, 1))
}

/** Each post in each form not yet answered (or that failed): what a step still has to ask. */
async function todo(arm: string) {
  const done = await readTurns(arm)
  const jobs = (await postsOf()).flatMap(p => FORMS.map(f => ({ p, f, id: `${p.id}-${f}` }))).filter(j => !done.get(j.id)?.text)
  return { done, jobs }
}

async function answer() {
  if (!args.chat || !args.arm) throw new Error('answer: --chat <checkout> --arm <name>')
  const W = args.chat
  const { answerQuestion } = await import(`${W}/apps/site/worker/chat/agent.ts`)
  const { handbookOf } = await import(`${W}/apps/site/worker/chat/handbook.ts`)
  const { handoverFor } = await import(`${W}/apps/site/worker/chat/handover.ts`)
  const { clientFor, costOf } = await import(`${W}/apps/site/worker/fishid/claude.ts`)
  const { healthyKeys, loadKeys, memoryHealth, rotate } = await import(`${W}/apps/site/worker/fishid/keys.ts`)
  const get = async (path: string) => { const r = await fetch(new URL(path, args.site)); return r.ok ? r.json() : null }
  const hb = await handbookOf({ index: (l: string) => get(`/app/${l}.json`), shard: (l: string, k: string, n: number) => get(`/app/pages/${l}/${k}-${n}.json`), topics: (l: string) => get(`/app/chat/${l}.json`) }, 'vi')
  const given = new Map<string, { path: string; heading: string | null }[]>()
  if (args.given) for (const g of JSON.parse(await readFile(join(args.given, 'turns.json'), 'utf8')) as { id: string; calls: { asked: string[] }[] }[])
    given.set(g.id, g.calls.flatMap(c => c.asked).map(a => JSON.parse(a.slice('read_page '.length))))
  const { keys } = await loadKeys(await readFile(args.keys!, 'utf8'))
  const store = memoryHealth()
  // As the Worker sends: a key that fails is rotated past, the run's later calls stay on the key that answered.
  const sender = (healthy: unknown[]) => {
    let client: any
    const once = async (c: any, b: any, timeoutMs: number, o: any) => {
      const stop = new AbortController(), t0 = Date.now()
      let timer = setTimeout(() => stop.abort(), timeoutMs), began = false
      try {
        const stream = c.messages.stream(b, { timeout: timeoutMs, signal: stop.signal })
        for await (const e of stream as any) {
          if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
            if (!began && o.writingMs && o.writingMs > timeoutMs) { clearTimeout(timer); timer = setTimeout(() => stop.abort(), o.writingMs - (Date.now() - t0)) }
            began = true
            o.onText?.(e.delta.text)
          }
        }
        return await stream.finalMessage()
      } catch (e: any) {
        if (e?.name === 'TimeoutError' || /aborted/i.test(String(e?.message))) throw Object.assign(new Error('Request timed out.'), { status: undefined })
        throw e
      } finally { clearTimeout(timer) }
    }
    return async (b: any, o: any) => {
      if (o.call > 1 && client) return once(client, b, o.timeoutMs, o)
      const r = await rotate(healthy, store, async (k: any, left: number) => {
        const c = await clientFor(k)
        const m = await once(c, b, Math.min(left, o.timeoutMs), o)
        if (o.call !== 0) client = c
        return m
      }, { budgetMs: o.timeoutMs })
      if (!r.ok) throw new Error(`no key answered: ${r.reason}`)
      return r.value
    }
  }
  const { done, jobs } = await todo(args.arm)
  console.log(`${args.arm}: ${jobs.length} to answer, ${done.size} kept`)
  let n = 0
  await pool(jobs.map(({ p, f, id }) => async () => {
    const began = Date.now()
    const tanks = f === 'post' ? [] : [savedTank(p.tank)]
    const found = given.get(`${p.id}-${f === 'tank' ? 'tank' : 'post'}`)
    try {
      const run = await answerQuestion({
        send: sender(await healthyKeys(keys, store, Date.now())), model: args.model, lang: 'vi', question: asked(p, f), earlier: [], start: {}, handbook: hb, tanks: async () => tanks,
        ...(found && tanks.length ? { handover: () => handoverFor({ question: asked(p, f), start: {}, tanks, hb, lang: 'vi', search: async () => found }) } : {}),
        onText: () => undefined,
      })
      const toolUses = run.history.flatMap((m: any) => (Array.isArray(m.content) ? m.content : []).filter((b: any) => b.type === 'tool_use').map((b: any) => `${b.name} ${JSON.stringify(b.input)}`))
      done.set(id, { id, post: p.id, topic: p.topic, form: f, text: run.answer?.text, blocks: run.blocks, suggestions: run.answer?.suggestions, stopped: run.stopped, calls: run.calls, asked: toolUses, ms: Date.now() - began, usd: costOf(args.model, run.spent), ...(run.answer ? {} : { failed: String(run.error?.message ?? run.stopped).slice(0, 160) }) })
    } catch (e: any) {
      done.set(id, { id, post: p.id, topic: p.topic, form: f, ms: Date.now() - began, usd: 0, failed: String(e?.message ?? e).slice(0, 160) })
    }
    if (++n % 10 === 0) await writeTurns(args.arm!, done)
  }), Number(args.concurrency))
  await writeTurns(args.arm, done)
  summary(args.arm, done)
}

async function plain() {
  if (!args.arm) throw new Error('plain: --arm <name> --model <model>')
  const { done, jobs } = await todo(args.arm)
  console.log(`${args.arm}: ${jobs.length} to answer, ${done.size} kept`)
  const cli = !args.model!.includes('haiku')
  let send: ((q: string) => Promise<{ text: string; usd: number }>) | undefined
  if (!cli) {
    // The chat's own model with no system prompt, no tools and no handbook, as chat-vs-plain.ts asked it on 8 Nov.
    const { clientFor, costOf } = await import('../../../apps/site/worker/fishid/claude')
    const { loadKeys } = await import('../../../apps/site/worker/fishid/keys')
    const { keys } = await loadKeys(await readFile(args.keys!, 'utf8'))
    const client = await clientFor(keys[0]!)
    send = async q => {
      const m: any = await client.messages.create({ model: args.model!, max_tokens: 8192, messages: [{ role: 'user', content: q }], output_config: { effort: 'medium' } } as any, { timeout: 120_000 })
      const u = m.usage
      return { text: m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), usd: costOf(args.model!, { input: u.input_tokens, output: u.output_tokens, cacheRead: 0, cacheWrite: 0 }) }
    }
  }
  let n = 0
  await pool(jobs.map(({ p, f, id }) => async () => {
    const began = Date.now()
    const q = plainQuestion(p, f)
    try {
      // Through the CLI: on the owner's subscription, a general assistant's one line for a system prompt, no tools.
      const r = cli
        ? { text: (await retry(() => claudeCli<{ answer: string }>({ system: 'You are Claude, a helpful AI assistant.', prompt: q, schema: { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } }, model: args.model }))).answer, usd: 0 }
        : await send!(q)
      done.set(id, { id, post: p.id, topic: p.topic, form: f, text: r.text, ms: Date.now() - began, usd: r.usd })
    } catch (e: any) {
      done.set(id, { id, post: p.id, topic: p.topic, form: f, ms: Date.now() - began, usd: 0, failed: String(e?.message ?? e).slice(0, 160) })
    }
    if (++n % 10 === 0) await writeTurns(args.arm!, done)
  }), Number(args.concurrency))
  await writeTurns(args.arm, done)
  summary(args.arm, done)
}

function summary(arm: string, turns: Map<string, Turn>) {
  const ts = [...turns.values()]
  const failed = ts.filter(t => !t.text)
  const stops = ts.reduce<Record<string, number>>((s, t) => ({ ...s, [t.stopped ?? '-']: (s[t.stopped ?? '-'] ?? 0) + 1 }), {})
  console.log(`${arm}: ${ts.length - failed.length} answered, ${failed.length} failed; billed $${ts.reduce((s, t) => s + (t.usd ?? 0), 0).toFixed(3)}; ended by ${JSON.stringify(stops)}`)
}

/** Ours against plain, each pair in both orders; a verdict is cached under its prompt, so a run again judges only what's new. */
async function judge() {
  if (!args.ours || !args.plain) throw new Error('judge: --ours <arm> --plain <arm>')
  const [ours, other] = await Promise.all([readTurns(args.ours), readTurns(args.plain)])
  const posts = new Map((await postsOf()).map(p => [p.id, p]))
  const cache = join(args.dir!, '..', 'judge')
  await mkdir(cache, { recursive: true })
  const once = async (prompt: string): Promise<Verdict> => {
    const file = join(cache, `${args.judge}-${hash(JUDGE_SYSTEM, prompt)}.json`)
    try { return JSON.parse(await readFile(file, 'utf8')) as Verdict } catch { /* not yet */ }
    const v = await retry(() => claudeCli<Verdict>({ system: JUDGE_SYSTEM, prompt, schema: JUDGE_SCHEMA, model: args.judge }))
    await writeFile(file, JSON.stringify(v))
    return v
  }
  // Each side as the reader sees it: ours with its cards and suggestions, without the site's name.
  const seen = (t: Turn) => unbrand(t.blocks ? seenOurs(t.text ?? '', t.blocks as never, t.suggestions ?? []) : t.text ?? '')
  const ids = [...ours.keys()].filter(id => ours.get(id)?.text && other.get(id)?.text && posts.has(ours.get(id)!.post))
  let n = 0
  const rows = await pool(ids.map(id => async () => {
    const a = ours.get(id)!, b = other.get(id)!, p = posts.get(a.post)!
    const prompt = (x: string, y: string) => judgePrompt(asked(p, a.form), a.form === 'post' ? null : tankFacts(p.tank), x, y)
    const [first, second] = await Promise.all([once(prompt(seen(a), seen(b))), once(prompt(seen(b), seen(a)))])
    if (++n % 25 === 0) console.log(`${n}/${ids.length}`)
    return { id, post: a.post, topic: a.topic, form: a.form, dev: dev(a.post), ...outcome({ first, second }) }
  }), Number(args.concurrency))
  const out = join(args.dir!, `judge-${args.ours}-vs-${args.plain}.json`)
  await writeFile(out, JSON.stringify(rows, null, 1))
  console.log(`${rows.length} judged, ${ids.length < ours.size ? `${ours.size - ids.length} left out (no answer on a side)` : 'none left out'}: ${out}`)
}

type Row = PairOutcome & { id: string; post: string; topic: string; form: Form; dev: boolean }
/** The middle of the mistake difference (ours less plain, a pair's two orders averaged) and its 90% range, posts resampled. */
function middle(rows: Row[]) {
  const d = rows.map(r => ({ post: r.post, v: (r.errorsOurs.length - r.errorsPlain.length) / 2 }))
  const byPost = new Map<string, number[]>()
  for (const x of d) byPost.set(x.post, [...(byPost.get(x.post) ?? []), x.v])
  const ks = [...byPost.keys()]
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  const B: number[] = []
  for (let i = 0; i < 20000; i++) {
    const s = Array.from({ length: ks.length }, () => byPost.get(ks[Math.floor(rand() * ks.length)]!)!).flat()
    B.push(s.reduce((a, b) => a + b, 0) / s.length)
  }
  B.sort((a, b) => a - b)
  return { m: d.reduce((a, b) => a + b.v, 0) / (d.length || 1), lo: B[1000]!, hi: B[19000]! }
}

async function report() {
  if (!args.pairs) throw new Error('report: --pairs ours:plain,…')
  const f2 = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(2)
  const lines: string[] = []
  const FORM_NAMES: Record<Form, string> = { post: 'Whole post, no saved tank', posttank: 'Whole post, tank saved', tank: 'Short question, tank saved' }
  for (const pair of args.pairs.split(',')) {
    const [a, b] = pair.split(':')
    const rows = JSON.parse(await readFile(join(args.dir!, `judge-${a}-vs-${b}.json`), 'utf8')) as Row[]
    lines.push(`\n### ${a} against ${b}\n`, '| | Posts | Ours better | Theirs better | Tie | Score | Mistakes an answer | Mistakes, ours less theirs (90% range) |', '|---|---|---|---|---|---|---|---|')
    const line = (name: string, rs: Row[]) => {
      if (!rs.length) return
      const k = (w: string) => rs.filter(r => r.better === w).length
      const mean = (f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length
      const { m, lo, hi } = middle(rs)
      lines.push(`| ${name} | ${new Set(rs.map(r => r.post)).size} | ${k('ours')} | ${k('plain')} | ${k('tie')} | ${mean(r => r.ours).toFixed(1)} v ${mean(r => r.plain).toFixed(1)} | ${(mean(r => r.errorsOurs.length) / 2).toFixed(2)} v ${(mean(r => r.errorsPlain.length) / 2).toFixed(2)} | ${f2(m)} (${f2(lo)} to ${f2(hi)}) |`)
    }
    line('**All**', rows)
    for (const f of FORMS) line(FORM_NAMES[f], rows.filter(r => r.form === f))
    for (const s of SUBJECTS) line(s, rows.filter(r => r.topic === s))
    line('Held out (never tuned on)', rows.filter(r => !r.dev))
  }
  const text = lines.join('\n')
  console.log(text)
  if (args.out) await writeFile(args.out, text)
}

const steps: Record<string, () => Promise<void>> = { answer, plain, judge, report }
const step = steps[positionals[0] ?? '']
if (!step) throw new Error(`a step: ${Object.keys(steps).join(', ')}`)
await step()
