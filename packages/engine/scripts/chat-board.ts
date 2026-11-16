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
 *   tsx scripts/chat-board.ts cli --chat <checkout> --site <folder> --model claude-sonnet-5-5 --arm cli-sonnet
 *                                                                                   our prompt and tools, through the CLI
 *   tsx scripts/chat-board.ts plain --model claude-opus-5-5 --arm plain-opus         no handbook, no tools
 *   tsx scripts/chat-board.ts judge --ours main --plain plain-opus                  both orders, a side wins on both
 *   tsx scripts/chat-board.ts report --pairs main:plain-opus,mainB:main,…           the board, by subject and form
 *
 * Ours runs the checkout's own agent, prompt, schema and limits (apps/site/worker/chat/) over the live site's handbook,
 * on the chat's keys (~/.config/aquatome/anthropic-keys), billed. `--given` is chat-search-recall.ts `--give 5`'s folder:
 * the sections the Worker's search would hand over before the first call (handover.ts `handsOver`: a saved tank and a
 * question under 150 characters). A plain answer through the CLI (claude-opus-5-5) is on the owner's subscription;
 * through the API (claude-haiku-5-5, the chat's own model, as chat-vs-plain.ts asked on 8 Nov) it is billed. The judge
 * is Opus through the CLI, with chat-vs-plain's rubric. Every billed call is held to the board's billed line before it
 * goes and logged after (src/billed.ts, ceilings.json `api`), apart from the Mac's quota; a run stopped at the line says
 * so and exits 2, and what it didn't ask is asked on the next run.
 *
 * `cli` is a copy of our chat, not the Worker: the checkout's own system prompt, first message, handover, answer schema
 * and four tools (served by chat-mcp.ts) on the owner's subscription, so any model can write it with no billed money. What
 * differs from the Worker: the CLI runs its own loop (no time rule, no forced last call, no pace: only the tool limit,
 * 16, holds), the tools carry the CLI's mcp__chat__ names, and its time to the first words (the first piece of the last
 * message, from the CLI's stream) is approximate. Its cost is what the CLI reports the same tokens would cost on the API.
 *
 * `--question` asks every post that one question instead (the tank review: "Bể của mình ổn không?"); `--notank` asks
 * the general chatbot without the tank's facts, as someone who hasn't typed them would; `--held` keeps to the held-out
 * posts.
 *
 * The board runs only with main's ceilings (`ceilingsAsMain`): on 15 Nov its checkout, 178 commits behind, read an old
 * table and took $34 that main had given the engine.
 *
 * The posts (--posts, one or more files) are readers' public forum posts, kept out of the repository; the report says
 * counts only. A third of them, by a hash of the id, may be tuned on (`dev`); the rest are held out, and a change
 * merges only on what it does there.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { costOf as mainCost, priceOf as mainPrice } from '../../../apps/site/worker/fishid/claude'
import type { KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { Billed, BilledLimit, worstOf, type Tokens } from '../src/billed'
import { ceilingsAsMain, costLog, leftYielding, nameStep, stepName } from '../src/ceiling'
import { claudeCli, claudeTools } from '../src/claude'
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
    // The cards under our answer count too. The owner's build shows text and suggestions only until the cards (#766) ship.
    cards: { type: 'boolean', default: false },
    question: { type: 'string' },
    notank: { type: 'boolean', default: false },
    held: { type: 'boolean', default: false },
    // The name its calls are counted under and yield by (`chat-board` unless said): a test of the board's own, kept apart.
    step: { type: 'string' },
  },
})

/**
 * The run's billed calls, on the chat's keys (`answer`, and `plain` with Haiku): each held to the board's billed line
 * before it goes and logged after (billed.ts), apart from the Mac's quota. Prices are main's (fishid/claude.ts).
 */
const billed = new Billed()
/** A reply's usage as tokens; none when the API sent none, and the call then counts at its worst (billed.ts). */
const tokensOf = (u: any): Tokens | undefined => (u ? { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } : undefined)
if (args.step) nameStep(args.step)

type Post = { id: string; topic: string; post: string; short: string; tank: PostTank }
type Form = 'post' | 'posttank' | 'tank'
type Turn = { wordsAt?: number; id: string; post: string; topic: string; form: Form; text?: string; blocks?: unknown[]; suggestions?: string[]; stopped?: string; calls?: number; asked?: string[]; timing?: { call: number; at: number; ms: number; out?: number; tools?: number; failed?: boolean }[]; ms: number; usd: number; failed?: string }
const SUBJECTS = ['dying', 'sick', 'algae', 'cycling', 'stocking'] as const
const FORMS = args.forms!.split(',') as Form[]
const hash = (...xs: unknown[]) => createHash('sha256').update(JSON.stringify(xs)).digest('hex').slice(0, 16)
/** A third of the posts may be tuned on; the rest are held out. Fixed by the id, so it never moves. */
export const dev = (id: string) => parseInt(createHash('sha256').update(id).digest('hex').slice(0, 8), 16) % 3 === 0

async function postsOf(): Promise<Post[]> {
  const all = (await Promise.all(args.posts!.split(',').map(async f => JSON.parse(await readFile(f, 'utf8')) as Post[]))).flat()
  const only = args.only?.split(',')
  return all.filter(p => (SUBJECTS as readonly string[]).includes(p.topic) && (!only || only.includes(p.id)) && (!args.held || !dev(p.id)))
}
const asked = (p: Post, f: Form) => args.question ?? (f === 'tank' ? p.short : p.post)

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
const plainQuestion = (p: Post, f: Form) => (f === 'post' || args.notank ? asked(p, f) : `${asked(p, f)}\n\nThông tin bể của mình: ${tankWords(p.tank)}.`)

async function readTurns(arm: string): Promise<Map<string, Turn>> {
  // Only a missing file is no answers yet: a damaged one (a run killed mid-write) stops the step, never asked again over.
  let text: string
  try { text = await readFile(join(args.dir!, arm, 'turns.json'), 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return new Map(); throw e }
  return new Map((JSON.parse(text) as Turn[]).map(t => [t.id, t]))
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
  // A checkout from before the handover (8 Nov) had none, as its Worker didn't: its questions go without.
  const handoverFor = existsSync(`${W}/apps/site/worker/chat/handover.ts`) ? (await import(`${W}/apps/site/worker/chat/handover.ts`)).handoverFor : undefined
  // The keys and their client are main's, whatever checkout's chat is asked: a call is one request, held and logged once.
  const { clientFor } = await import('../../../apps/site/worker/fishid/claude')
  const { healthyKeys, loadKeys, memoryHealth, rotate } = await import('../../../apps/site/worker/fishid/keys')
  const get = async (path: string) => { const r = await fetch(new URL(path, args.site)); return r.ok ? r.json() : null }
  const hb = await handbookOf({ index: (l: string) => get(`/app/${l}.json`), shard: (l: string, k: string, n: number) => get(`/app/pages/${l}/${k}-${n}.json`), topics: (l: string) => get(`/app/chat/${l}.json`) }, 'vi')
  const given = new Map<string, { path: string; heading: string | null }[]>()
  if (args.given) for (const g of JSON.parse(await readFile(join(args.given, 'turns.json'), 'utf8')) as { id: string; calls: { asked: string[] }[] }[])
    given.set(g.id, g.calls.flatMap(c => c.asked).map(a => JSON.parse(a.slice('read_page '.length))))
  const { keys } = await loadKeys(await readFile(args.keys!, 'utf8'))
  const store = memoryHealth()
  // As the Worker sends: every call goes through the keys in turn, a key that fails rotated past.
  // Each call's start, length and output, so the time rule can be set from the calls' own times.
  const sender = (healthy: KeyEntry[], log: { call: number; at: number; ms: number; out?: number; tools?: number; failed?: boolean }[] = [], t0 = Date.now()) => {
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
      if (billed.stopped) throw new BilledLimit(billed.stopped)
      const at = Date.now()
      // Each try on a key is a billed call, held to the line and logged (billed.ts).
      const r = await rotate(healthy, store, async (k: any, left: number) => {
        const c = await clientFor(k)
        return billed.call({ model: b.model, worst: worstOf(b, mainPrice(b.model)), key: k.hash }, async () => {
          const m = await once(c, b, Math.min(left, o.timeoutMs), o)
          const tokens = tokensOf(m.usage)
          return { value: m, usd: tokens ? mainCost(b.model, tokens) : NaN, tokens }
        })
      }, { budgetMs: o.timeoutMs })
      if (!r.ok && billed.stopped) throw new BilledLimit(billed.stopped)
      if (!r.ok) { log.push({ call: o.call, at: at - t0, ms: Date.now() - at, failed: true }); throw new Error(`no key answered: ${r.reason}`) }
      log.push({ call: o.call, at: at - t0, ms: Date.now() - at, out: r.value.usage?.output_tokens, tools: r.value.content.filter((x: any) => x.type === 'tool_use').length })
      return r.value
    }
  }
  const { done, jobs } = await todo(args.arm)
  console.log(`${args.arm}: ${jobs.length} to answer, ${done.size} kept`)
  let n = 0
  await pool(jobs.map(({ p, f, id }) => async () => {
    // Stopped at the billed line: what's left is asked on the next run.
    if (billed.stopped) return
    const began = Date.now()
    const timing: any[] = []
    const tanks = f === 'post' ? [] : [savedTank(p.tank)]
    const found = given.get(`${p.id}-${f === 'tank' ? 'tank' : 'post'}`)
    try {
      const run = await answerQuestion({
        send: sender(await healthyKeys(keys, store, Date.now()), timing, began), model: args.model, lang: 'vi', question: asked(p, f), earlier: [], start: {}, handbook: hb, tanks: async () => tanks,
        // As the Worker: the handover is asked whenever there's a tank (handoverFor decides), its search what --given found.
        ...(tanks.length && handoverFor ? { handover: () => handoverFor({ question: asked(p, f), start: {}, tanks, hb, lang: 'vi', search: async () => found ?? [] }) } : {}),
        onText: () => undefined,
      })
      // Stopped at the billed line (the agent's loop hands back what its send threw): asked again on the next run, and
      // an answer that came is kept, since it was paid for.
      if (!run.answer?.text && (run.error instanceof BilledLimit || billed.stopped)) return
      const toolUses = run.history.flatMap((m: any) => (Array.isArray(m.content) ? m.content : []).filter((b: any) => b.type === 'tool_use').map((b: any) => `${b.name} ${JSON.stringify(b.input)}`))
      done.set(id, { id, post: p.id, topic: p.topic, form: f, text: run.answer?.text, blocks: run.blocks, suggestions: run.answer?.suggestions, stopped: run.stopped, calls: run.calls, asked: toolUses, timing, ms: Date.now() - began, usd: mainCost(args.model, run.spent), ...(run.answer ? {} : { failed: String(run.error?.message ?? run.stopped).slice(0, 160) }) })
    } catch (e: any) {
      if (billed.stopped) return
      done.set(id, { id, post: p.id, topic: p.topic, form: f, ms: Date.now() - began, usd: 0, failed: String(e?.message ?? e).slice(0, 160) })
    }
    if (++n % 10 === 0) await writeTurns(args.arm!, done)
  }), Number(args.concurrency))
  await writeTurns(args.arm, done)
  summary(args.arm, done)
  stoppedAtLine()
}

/**
 * The board yields to the engine (the chief of staff, 13 Nov 2026): before each call on the owner's sign-in it stops when
 * that call could take what another step's line still has today (ceiling.ts `leftYielding`). `SPARE` is kept for the gate
 * and moderation, which have no line; `CALL` covers the calls in the air at once (a judge's about $0.05, a plain Opus
 * answer's $0.08).
 */
const SPARE = 10, CALL = 0.3
class Yielded extends Error {}
function mayCall() {
  const log = costLog()
  const left = log ? leftYielding(stepName(), log, SPARE) : null
  if (left !== null && left < CALL) throw new Yielded(`the board yields to the engine: $${left.toFixed(2)} of its share left today`)
}

/** Our prompt and tools through the CLI, on the owner's subscription (the header says what differs from the Worker). */
async function cli() {
  if (!args.chat || !args.arm || /^https?:/.test(args.site!)) throw new Error('cli: --chat <checkout> --arm <name> --site <folder> [--model]')
  const W = args.chat
  const { SYSTEM, firstMessage } = await import(`${W}/apps/site/worker/chat/agent.ts`)
  const { ANSWER_SCHEMA } = await import(`${W}/apps/site/worker/chat/answer.ts`)
  const { handbookOf } = await import(`${W}/apps/site/worker/chat/handbook.ts`)
  const { handoverFor } = await import(`${W}/apps/site/worker/chat/handover.ts`)
  const get = async (path: string) => { try { return JSON.parse(await readFile(join(args.site!, path.replace(/^\//, '').replace(/\//g, '_')), 'utf8')) } catch { return null } }
  const hb = await handbookOf({ index: (l: string) => get(`/app/${l}.json`), shard: (l: string, k: string, n: number) => get(`/app/pages/${l}/${k}-${n}.json`), topics: (l: string) => get(`/app/chat/${l}.json`) }, 'vi')
  if (!hb) throw new Error(`cli: no handbook in ${args.site}`)
  const given = new Map<string, { path: string; heading: string | null }[]>()
  if (args.given) for (const g of JSON.parse(await readFile(join(args.given, 'turns.json'), 'utf8')) as { id: string; calls: { asked: string[] }[] }[])
    given.set(g.id, g.calls.flatMap(c => c.asked).map(a => JSON.parse(a.slice('read_page '.length))))
  const engine = fileURLToPath(new URL('..', import.meta.url))
  const tsx = join(engine, 'node_modules/.bin/tsx'), server = join(engine, 'scripts/chat-mcp.ts')
  const allow = ['search_handbook', 'read_page', 'check_tank_mates', 'read_tanks'].map(n => `mcp__chat__${n}`).join(',')
  const work = join(args.dir!, '..', 'cli-work', args.arm)
  const { done, jobs } = await todo(args.arm)
  console.log(`${args.arm}: ${jobs.length} to answer, ${done.size} kept`)
  let n = 0, yielded = false
  await pool(jobs.map(({ p, f, id }) => async () => {
    const began = Date.now()
    const dir = join(work, id)
    await mkdir(dir, { recursive: true })
    const tanks = f === 'post' ? [] : [savedTank(p.tank)]
    const tankFile = join(dir, 'tank.json'), log = join(dir, 'tools.jsonl'), mcp = join(dir, 'mcp.json')
    if (tanks.length) await writeFile(tankFile, JSON.stringify(tanks[0]))
    await writeFile(log, '')
    await writeFile(mcp, JSON.stringify({ mcpServers: { chat: { command: tsx, args: [server, '--chat', W, '--site', args.site!, ...(tanks.length ? ['--tank', tankFile] : []), '--log', log] } } }))
    const question = asked(p, f)
    const found = given.get(`${p.id}-${f === 'tank' ? 'tank' : 'post'}`)
    // The Worker's first message, then what its handover would give (the owner's first question with a saved tank).
    const first = firstMessage('vi', question, [], {}, hb) as { content: { text?: string }[] }
    const handed = tanks.length ? await handoverFor({ question, start: {}, tanks, hb, lang: 'vi', search: async () => found ?? [] }) : undefined
    const prompt = [...first.content.map(b => b.text ?? ''), ...(handed ? [handed.text] : [])].filter(Boolean).join('\n\n')
    // The first piece of each message as it streams; the last message's is when the answer's first words would show.
    let piece: number | undefined, wordsAt: number | undefined, report: Record<string, unknown> | undefined, tools: string | undefined
    if (yielded) return
    try {
      mayCall()
      const a = await claudeTools<{ text: string; suggestions?: string[] }>({
        system: SYSTEM, prompt, schema: ANSWER_SCHEMA, model: args.model, mcp, allow, effort: 'medium',
        onEvent: (e, ms) => {
          if (e.type === 'system' && e.subtype === 'init') tools = (e.mcp_servers as { name?: string; status?: string }[] | undefined)?.find(s => s.name === 'chat')?.status
          const ev = e.type === 'stream_event' ? (e.event as { type?: string; delta?: { type?: string } }) : undefined
          if (ev?.type === 'message_start') piece = undefined
          else if (ev?.type === 'content_block_delta' && (ev.delta?.type === 'text_delta' || ev.delta?.type === 'input_json_delta') && piece === undefined) wordsAt = piece = ms
        },
        onResult: r => { report = r },
      })
      const calls = (await readFile(log, 'utf8')).split('\n').filter(Boolean).map(l => JSON.parse(l) as { name: string; input: unknown })
      // No tool called and the server not known to be up: the answer may have had no tools, so it isn't one to judge.
      if (!calls.length && tools !== 'connected') throw new Error(`the chat's tools weren't confirmed (${tools ?? 'not listed'}) and none was called`)
      done.set(id, { id, post: p.id, topic: p.topic, form: f, text: a.text, suggestions: a.suggestions ?? [], blocks: [], calls: Number(report?.num_turns ?? 0), asked: calls.map(c => `${c.name} ${JSON.stringify(c.input)}`), ...(wordsAt !== undefined ? { wordsAt } : {}), ms: Date.now() - began, usd: Number(report?.total_cost_usd ?? 0) })
    } catch (e: any) {
      // Given way to the engine: no new answer starts, and those in the air finish and are kept.
      if (e instanceof Yielded) { if (!yielded) console.log(e.message); yielded = true; return }
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
    const { clientFor } = await import('../../../apps/site/worker/fishid/claude')
    const { loadKeys } = await import('../../../apps/site/worker/fishid/keys')
    const { keys } = await loadKeys(await readFile(args.keys!, 'utf8'))
    const client = await clientFor(keys[0]!)
    send = async q => {
      const body = { model: args.model!, max_tokens: 8192, messages: [{ role: 'user', content: q }], output_config: { effort: 'medium' } }
      const m: any = await billed.call({ model: body.model, worst: worstOf(body, mainPrice(body.model)), key: keys[0]!.hash }, async () => {
        const r: any = await client.messages.create(body as any, { timeout: 120_000 })
        const tokens = tokensOf(r.usage)
        return { value: r, usd: tokens ? mainCost(body.model, tokens) : NaN, tokens }
      })
      // A cut-off answer is a failure, asked again on the next run, never judged as whole.
      if (m.stop_reason !== 'end_turn') throw new Error(`stopped: ${m.stop_reason}`)
      return { text: m.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(''), usd: mainCost(args.model!, tokensOf(m.usage) ?? { input: 0, output: 0 }) }
    }
  }
  let n = 0
  await pool(jobs.map(({ p, f, id }) => async () => {
    if (billed.stopped) return
    const began = Date.now()
    const q = plainQuestion(p, f)
    try {
      // Through the CLI: on the owner's subscription, a general assistant's one line for a system prompt, no tools.
      if (cli) mayCall()
      const r = cli
        ? { text: (await retry(() => claudeCli<{ answer: string }>({ system: 'You are Claude, a helpful AI assistant.', prompt: q, schema: { type: 'object', additionalProperties: false, required: ['answer'], properties: { answer: { type: 'string' } } }, model: args.model }))).answer, usd: 0 }
        : await send!(q)
      done.set(id, { id, post: p.id, topic: p.topic, form: f, text: r.text, ms: Date.now() - began, usd: r.usd })
    } catch (e: any) {
      if (billed.stopped) return
      done.set(id, { id, post: p.id, topic: p.topic, form: f, ms: Date.now() - began, usd: 0, failed: String(e?.message ?? e).slice(0, 160) })
    }
    if (++n % 10 === 0) await writeTurns(args.arm!, done)
  }), Number(args.concurrency))
  await writeTurns(args.arm, done)
  summary(args.arm, done)
  stoppedAtLine()
}

/** A run stopped at the billed line says so, and fails: the chief of staff raises the day's line when a board needs it. */
function stoppedAtLine() {
  if (!billed.stopped) return
  console.error(billed.stopped)
  process.exitCode = 2
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
    mayCall()
    const v = await retry(() => claudeCli<Verdict>({ system: JUDGE_SYSTEM, prompt, schema: JUDGE_SCHEMA, model: args.judge }))
    await writeFile(file, JSON.stringify(v))
    return v
  }
  // Each side as the reader sees it on the phone, without the site's name: ours with its suggestions, and its cards with --cards.
  const seen = (t: Turn) => unbrand(t.blocks ? seenOurs(t.text ?? '', args.cards ? (t.blocks as never) : [], t.suggestions ?? []) : t.text ?? '')
  const ids = [...ours.keys()].filter(id => ours.get(id)?.text && other.get(id)?.text && posts.has(ours.get(id)!.post))
  let n = 0
  // A pair the board yields on, or whose judge fails twice, waits for the next run: its verdicts so far are kept.
  let waiting = 0, why = ''
  const judged = await pool(ids.map(id => async () => {
    const a = ours.get(id)!, b = other.get(id)!, p = posts.get(a.post)!
    const prompt = (x: string, y: string) => judgePrompt(asked(p, a.form), a.form === 'post' ? null : tankFacts(p.tank), x, y)
    try {
      const [first, second] = await Promise.all([once(prompt(seen(a), seen(b))), once(prompt(seen(b), seen(a)))])
      if (++n % 25 === 0) console.log(`${n}/${ids.length}`)
      return { id, post: a.post, topic: a.topic, form: a.form, dev: dev(a.post), ...outcome({ first, second }) }
    } catch (e) {
      waiting++
      why ||= String((e as Error)?.message ?? e).slice(0, 160)
      return undefined
    }
  }), Number(args.concurrency))
  const rows = judged.filter(r => r !== undefined)
  const out = join(args.dir!, `judge-${args.ours}-vs-${args.plain}${args.cards ? '-cards' : ''}.json`)
  await writeFile(out, JSON.stringify(rows, null, 1))
  console.log(`${rows.length} judged, ${ids.length < ours.size ? `${ours.size - ids.length} left out (no answer on a side)` : 'none left out'}${waiting ? `, ${waiting} waiting (${why})` : ''}: ${out}`)
}

type Row = PairOutcome & { id: string; post: string; topic: string; form: Form; dev: boolean }
/** The middle of the mistake difference (ours less plain, a pair's two orders averaged) and its 90% range, posts resampled. */
function middle(rows: Row[]) {
  const d = rows.map(r => ({ post: r.post, v: (r.errorsOurs.length - r.errorsPlain.length) / 2 }))
  const byPost = new Map<string, number[]>()
  for (const x of d) byPost.set(x.post, [...(byPost.get(x.post) ?? []), x.v])
  const ks = [...byPost.keys()]
  // mulberry32: the earlier `seed * 1103515245` passed 2^53 and fell into a cycle of about 10,000 draws (15 Nov).
  let seed = 7
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
    const rows = JSON.parse(await readFile(join(args.dir!, `judge-${a}-vs-${b}${args.cards ? '-cards' : ''}.json`), 'utf8')) as Row[]
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

const steps: Record<string, () => Promise<void>> = { answer, cli, plain, judge, report }
const step = steps[positionals[0] ?? '']
if (!step) throw new Error(`a step: ${Object.keys(steps).join(', ')}`)
// Every step that calls a model yields by main's ceilings, so it runs only from a checkout that has them.
if (positionals[0] !== 'report') ceilingsAsMain(fileURLToPath(new URL('..', import.meta.url)))
await step()
