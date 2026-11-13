/**
 * How long a reader waits for the chat's first words, and where that time goes: each question asked as the Worker asks
 * it, with the Worker's own agent, prompt, schema, effort, limits and model, over the live site's handbook, every call
 * to Claude streamed and timed.
 *
 * Two ways to show the answer (`--modes`), run side by side, each question in both, in turn:
 * - today: the Worker's calls don't stream, and the reader's first words come with the whole answer, once the run ends
 *   (and the turn is saved, which this script can't time: it runs on the Mac, not on Cloudflare).
 * - streamed: the agent streams the answer's text as Claude writes it (agent.ts `onText`), so the first words come with
 *   the answer call's first piece.
 *
 * Per call it keeps when it was sent, when the stream began (Claude's first token, the network included), its first
 * text, the first piece of the answer's text a reader would see (answer.ts `textReader`), its first tool call and its end;
 * its tokens; and between calls, the tools' time (reading the handbook, the reader's tanks).
 *
 * The questions: the hard problems (hard-questions.vi.json, each in both conditions, as chat-vs-plain.ts asks them) and
 * everyday ones (everyday-questions.json: short questions, from a species page and from fish ID, in the four languages).
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-speed.ts
 *   … --sets hard,everyday --modes today,streamed --only algae-01,vi-short-01 --concurrency 4 --label baseline
 *   … --report ~/.cache/aquatome/evals/speed/<run>   # its report again, from its turns, with no call
 *
 * Calls go from this Mac straight to Anthropic's API; the Worker's go through the relay in eastern North America
 * (fishid/relay.ts), so each of its calls also pays that hop. Writes the runs and a report to
 * ~/.cache/aquatome/evals/speed/<when>-<label>/. Keys: ~/.config/aquatome/anthropic-keys, never printed.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import type { PageShard } from '@aq/schema/app-page'
import { answerQuestion, type ChatOptions, type Start } from '../../../apps/site/worker/chat/agent'
import { textReader, type ChatBlock } from '../../../apps/site/worker/chat/answer'
import { chatTools } from '../../../apps/site/worker/chat/tools'
import { handoverFor, type Found } from '../../../apps/site/worker/chat/handover'
import { handbookOf, type Handbook, type Index, type Lang, type Source } from '../../../apps/site/worker/chat/handbook'
import type { Topics } from '../../../apps/site/worker/chat/topics'
import { clientFor, costOf } from '../../../apps/site/worker/fishid/claude'
import { healthyKeys, isApiError, loadKeys, memoryHealth, rotate, type HealthStore, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { CONDITIONS, savedTank, TOPICS, type HardQuestion, type PostTank } from './chat-vs-plain-lib'
import { pool } from './eval-lib'

const ROOT = join(import.meta.dirname, '../../..')
const { values: args } = parseArgs({
  options: {
    hard: { type: 'string', default: join(import.meta.dirname, 'hard-questions.vi.json') },
    everyday: { type: 'string', default: join(import.meta.dirname, 'everyday-questions.json') },
    sets: { type: 'string', default: 'hard,everyday' },
    modes: { type: 'string', default: 'today,streamed' },
    only: { type: 'string' },
    // The Worker's (CHAT_MODEL in apps/site/wrangler.jsonc).
    model: { type: 'string', default: 'claude-haiku-5-5' },
    concurrency: { type: 'string', default: '4' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    site: { type: 'string', default: 'https://aquatome.com' },
    cache: { type: 'string', default: join(homedir(), '.cache/aquatome/chat-speed') },
    label: { type: 'string', default: 'run' },
    // A run's folder: its report written again from its turns, nothing asked.
    report: { type: 'string' },
    // A folder of a search's reads (chat-search-recall.ts `--give`): each question gets what the chat would hand over
    // (handover.ts `handoverFor`), the search being what that folder found for it.
    given: { type: 'string' },
    // Claude writes a first line for the wait (agent.ts OPENING_SYSTEM): when it came, and what it said.
    opening: { type: 'boolean', default: false },
  },
})
const MODEL = args.model!
const MODES = ['today', 'streamed'] as const
type Mode = (typeof MODES)[number]
const modes = args.modes!.split(',').filter((m): m is Mode => (MODES as readonly string[]).includes(m))
type Send = ChatOptions['send']
type Client = Awaited<ReturnType<typeof clientFor>>

/** One question as this script asks it: a hard problem in one condition, or an everyday question. */
type Asked = { id: string; set: 'hard' | 'everyday'; kind: string; lang: Lang; q: string; start: Start; tanks: ReturnType<typeof savedTank>[] }
/**
 * One call, in ms: `at` from the turn's start to when it was sent; the rest from when it was sent. `first`: the stream
 * began (message_start); `text`: its first text; `piece`: the first piece of the answer's text a reader would see; `last`: its last;
 * `tool`: its first tool call. `forced`: the last call, with no tools left (tool_choice none). `asked`: its tool calls.
 */
type Call = { n: number; at: number; ms: number; first?: number; text?: number; piece?: number; last?: number; tool?: number; input: number; cacheRead: number; cacheWrite: number; output: number; stop?: string | null; forced: boolean; failed?: string; asked?: string[] }
/** A turn: `ms`, the run (agent and blocks filled); `words`, when the reader's first words came in this mode; `cards`, when each block went out as Claude picked it (streamed); the answer as the reader gets it. */
type Turn = { id: string; set: Asked['set']; kind: string; lang: Lang; mode: Mode; ms: number; words?: number; calls: Call[]; steps: number[]; stopped?: string; failed?: string; offTopic?: boolean; dropped?: boolean; usd: number; text?: string; blocks?: ChatBlock[]; suggestions?: string[]; cards?: number[]; opening?: { at: number; text: string }; side?: Call[] }

const hash = (...parts: string[]) => createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 12)
let siteDir = ''
/** The live site's handbook, each file kept once read, in a folder named for the build. */
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

/**
 * The Worker's send (api.ts: the first call rotates over the healthy keys, later calls keep the key that answered), but
 * streamed, each call timed into `calls`. The whole call is bounded by its timeout, as a call that doesn't stream is,
 * and a stream cut once it began is the network's, as there (`callClaude`). As there too, a first call isn't asked again
 * once the reader has words (`shown`), and is asked again without its text read on once some of it was.
 */
function sender(healthy: KeyEntry[], store: HealthStore, began: number, calls: Call[], shown: () => boolean, side: Call[] = calls): Send {
  let client: Client | undefined
  const once = async (c: Client, b: Parameters<Send>[0], timeoutMs: number, o: Parameters<Send>[1], feed = o.onText) => {
    const sent = Date.now()
    const into = o.call === 0 ? side : calls
    const call: Call = { n: o.call, at: sent - began, ms: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, forced: b.tool_choice?.type === 'none' }
    const read = textReader()
    // As api.ts `callClaude`: a call that has begun writing may take the time left.
    const stop = new AbortController()
    let timer = setTimeout(() => stop.abort(), timeoutMs)
    try {
      const stream = c.messages.stream(b, { timeout: timeoutMs, signal: stop.signal })
      for await (const e of stream) {
        const t = Date.now() - sent
        if (e.type === 'message_start') call.first ??= t
        else if (e.type === 'content_block_start' && e.content_block.type === 'tool_use') call.tool ??= t
        else if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') {
          if (call.text === undefined && o.writingMs && o.writingMs > timeoutMs) { clearTimeout(timer); timer = setTimeout(() => stop.abort(), o.writingMs - t) }
          call.text ??= t
          if (read(e.delta.text)) { call.piece ??= t; call.last = t }
          feed?.(e.delta.text)
        }
      }
      const m = await stream.finalMessage()
      // A call that ran out of room: what it wrote, for a look (no answer comes of it).
      if (m.stop_reason === 'max_tokens') await writeFile(join(args.cache!, `max-tokens-${Date.now()}.json`), JSON.stringify(m.content, null, 1)).catch(() => undefined)
      Object.assign(call, { ms: Date.now() - sent, input: m.usage.input_tokens, cacheRead: m.usage.cache_read_input_tokens ?? 0, cacheWrite: m.usage.cache_creation_input_tokens ?? 0, output: m.usage.output_tokens, stop: m.stop_reason, asked: m.content.flatMap(b => (b.type === 'tool_use' ? [`${b.name} ${JSON.stringify(b.input)}`] : [])) })
      into.push(call)
      return m
    } catch (e) {
      into.push({ ...call, ms: Date.now() - sent, failed: String((e as Error).message ?? e).slice(0, 80) })
      // An abort by the bound is the timeout a call that doesn't stream would have hit; a cut stream, the network.
      if ((e as Error)?.name === 'TimeoutError' || /aborted/i.test(String((e as Error)?.message))) throw Object.assign(new Error('Request timed out.'), { status: undefined })
      throw isApiError(e) ? e : Object.assign(e instanceof Error ? e : new Error(String(e)), { status: undefined })
    } finally {
      clearTimeout(timer)
    }
  }
  return async (b, o) => {
    if (o.call > 1 && client) return once(client, b, o.timeoutMs, o)
    let fed = false
    const r = await rotate(healthy, store, async (k, left) => {
      const c = await clientFor(k)
      const feed = o.onText && !fed ? (d: string) => { fed = true; o.onText!(d) } : undefined
      try {
        // What an earlier key's try used comes off both, as in api.ts.
        const bounded = Math.min(left, o.timeoutMs)
        const m = await once(c, b, bounded, { ...o, ...(o.writingMs ? { writingMs: o.writingMs - (o.timeoutMs - bounded) } : {}) }, feed)
        // The first line's call (0) is beside the run's: its key isn't the run's, as on the server.
        if (o.call !== 0) client = c
        return m
      } catch (e) {
        if (shown()) throw new Error('cut after the first words')
        throw e
      }
    }, { budgetMs: o.timeoutMs })
    if (!r.ok) throw new Error(`no key answered: ${r.reason}`)
    return r.value
  }
}

async function ask(a: Asked, mode: Mode, hb: Handbook, keys: KeyEntry[], store: HealthStore, given?: Found[]): Promise<Turn> {
  // The Worker picks its healthy keys before the run, so the clock starts after.
  const healthy = await healthyKeys(keys, store, Date.now())
  const began = Date.now()
  const calls: Call[] = []
  /** The first line's own call (call 0), apart from the run's. */
  const side: Call[] = []
  const steps: number[] = []
  let words: number | undefined
  const cards: number[] = []
  let opening: { at: number; text: string } | undefined
  const base = { id: a.id, set: a.set, kind: a.kind, lang: a.lang, mode }
  try {
    const run = await answerQuestion({
      send: sender(healthy, store, began, calls, () => words !== undefined, side),
      model: MODEL, lang: a.lang, question: a.q, earlier: [], start: a.start, handbook: hb, tanks: async () => a.tanks,
      ...(given ? { handover: () => handoverFor({ question: a.q, start: a.start, tanks: a.tanks, hb, lang: a.lang, search: async () => given }) } : {}),
      onStep: () => steps.push(Date.now() - began),
      ...(args.opening ? { opening: true, onOpening: (text: string) => { opening ??= { at: Date.now() - began, text } } } : {}),
      ...(mode === 'streamed' ? { onText: () => { words ??= Date.now() - began }, onBlock: () => { cards.push(Date.now() - began) } } : {}),
    })
    const ms = Date.now() - began
    const usd = costOf(MODEL, run.spent)
    if (!run.answer) return { ...base, ...(opening ? { opening } : {}), ms, calls, steps, usd, stopped: run.stopped, failed: run.error ? String((run.error as Error).message ?? run.error).slice(0, 160) : `no answer (stopped: ${run.stopped})` }
    // The streamed answer's tool calls, dropped once its text showed (agent.ts `streaming`): the run ended on it.
    const last = calls.at(-1)
    const dropped = mode === 'streamed' && last?.piece !== undefined && last.tool !== undefined
    // Today the first words come with the whole answer; an off-topic answer's line comes whole in both.
    return { ...base, ms, words: mode === 'today' || words === undefined ? ms : words, calls, steps, usd, stopped: run.stopped, ...(run.answer.offTopic ? { offTopic: true } : {}), ...(dropped ? { dropped } : {}), text: run.answer.text, blocks: run.blocks, suggestions: run.answer.suggestions, ...(cards.length ? { cards } : {}), ...(run.opening ? { opening: opening! } : {}), ...(side.length ? { side } : {}) }
  } catch (e) {
    return { ...base, ms: Date.now() - began, calls, steps, usd: 0, failed: String((e as Error).message ?? e).slice(0, 160) }
  }
}

/** What a run was: when it started, the chat's code then, the model, how many at a time. */
type Meta = { started: string; commit: string; model: string; concurrency: string; site: string; modes: Mode[]; given?: string; opening?: boolean; build?: string }
const git = (...a: string[]) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
/** The code this script runs: the agent and its loop, not the Worker's side (api.ts). */
const BRAIN = ['apps/site/worker/chat/agent.ts', 'apps/site/worker/chat/handover.ts', 'apps/site/worker/chat/answer.ts', 'apps/site/worker/chat/tools.ts', 'apps/site/worker/chat/handbook.ts', 'apps/site/worker/chat/topics.ts', 'apps/site/worker/agent']

async function main() {
  if (args.report) {
    const md = report(JSON.parse(await readFile(join(args.report, 'turns.json'), 'utf8')) as Turn[], JSON.parse(await readFile(join(args.report, 'meta.json'), 'utf8')) as Meta)
    await writeFile(join(args.report, 'report.md'), md)
    console.log(md)
    return
  }
  const sets = args.sets!.split(',')
  const asked: Asked[] = []
  if (sets.includes('hard')) {
    const hard = (JSON.parse(await readFile(args.hard!, 'utf8')) as HardQuestion[]).filter(q => (TOPICS as readonly string[]).includes(q.topic))
    for (const q of hard) for (const c of CONDITIONS) asked.push({ id: `${q.id}-${c}`, set: 'hard', kind: c, lang: 'vi', q: c === 'post' ? q.post : q.short, start: {}, tanks: c === 'tank' && q.tank ? [savedTank(q.tank)] : [] })
  }
  if (sets.includes('everyday')) {
    const everyday = JSON.parse(await readFile(args.everyday!, 'utf8')) as { id: string; lang: Lang; kind: string; q: string; start?: Start; tank?: PostTank }[]
    for (const q of everyday) asked.push({ id: q.id, set: 'everyday', kind: q.kind, lang: q.lang, q: q.q, start: q.start ?? {}, tanks: q.tank ? [savedTank(q.tank)] : [] })
  }
  const only = args.only?.split(',')
  const questions = asked.filter(a => !only || only.some(o => a.id === o || a.id.startsWith(`${o}-`)))

  // The handbook, every shard of it read before the clock starts: a tool's read is then the Worker's, not the Mac's network.
  const indexText = await (await fetch(new URL('/app/vi.json', args.site))).text()
  siteDir = join(args.cache!, `site-${new URL(args.site!).host}-${hash(indexText)}`)
  await mkdir(siteDir, { recursive: true })
  const handbooks = new Map<Lang, Handbook>()
  for (const lang of new Set(questions.map(q => q.lang))) {
    const index = await source.index(lang)
    if (!index) throw new Error(`No app index for ${lang} at ${args.site}`)
    await pool(Object.entries(index.shards ?? {}).flatMap(([kind, s]) => Array.from({ length: (s?.n ?? 0) + 1 }, (_, n) => () => source.shard(lang, kind as never, n))), 8)
    await source.topics?.(lang)
    handbooks.set(lang, (await handbookOf(source, lang))!)
  }
  const { keys } = await loadKeys(await readFile(args.keys!, 'utf8').catch(() => ''))
  if (!keys.length) throw new Error(`No key in ${args.keys}`)
  const store = memoryHealth()
  const readsOf = (t: Turn) => [...new Set(t.calls.flatMap(c => c.asked ?? []).filter(s => s.startsWith('read_page ')))].map(s => JSON.parse(s.slice('read_page '.length)) as Found)
  const given = args.given ? new Map((JSON.parse(await readFile(join(args.given, 'turns.json'), 'utf8')) as Turn[]).map(t => [t.id, readsOf(t)])) : undefined

  // Each question in every mode, the modes' order turn about, so a slower hour falls on both.
  const jobs = questions.flatMap((a, i) => (i % 2 ? [...modes].reverse() : modes).map(m => () => ask(a, m, handbooks.get(a.lang)!, keys, store, given?.get(a.id))))
  const started = new Date()
  const meta: Meta = { started: started.toISOString(), commit: `${git('log', '-1', '--format=%h', '--', ...BRAIN) || 'unknown'}${git('status', '--porcelain', '--', ...BRAIN) ? ', with changes not committed' : ''}`, model: MODEL, concurrency: args.concurrency!, site: args.site!, modes, ...(args.given ? { given: args.given } : {}), ...(args.opening ? { opening: true } : {}), build: basename(siteDir) }
  console.log(`${questions.length} questions × ${modes.join(', ')}; ${MODEL}; concurrency ${args.concurrency}; ${started.toISOString()}`)
  const turns = await pool(jobs.map(j => async () => {
    const t = await j()
    console.log(`${t.id} ${t.mode}: ${t.failed ? `FAILED ${t.failed}` : `words ${sec(t.words!)}, run ${sec(t.ms)}, ${t.calls.length} calls`}`)
    return t
  }), Number(args.concurrency))

  const dir = join(homedir(), '.cache/aquatome/evals/speed', `${started.toISOString().slice(0, 16).replace(/:/g, '')}-${args.label}`)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'turns.json'), `${JSON.stringify(turns, null, 2)}\n`)
  await writeFile(join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  const md = report(turns, meta)
  await writeFile(join(dir, 'report.md'), md)
  console.log(`\n${md}\nWritten: ${dir}`)
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`
/** The value `p` of the way up, nearest rank. */
const at = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]! : NaN }
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * A turn's time by step, in ms, as `today` shows it (the first words when the run ends). The answer call is the last;
 * the others read. Each call: waiting for its first token (the network and Claude reading the prompt), then the rest.
 * Tools: the time between calls. Other: before the first call and after the last (the blocks filled). A key that refused
 * before the next one answered (out of credit, say): its time is the rotation's.
 */
function stepsOf(t: Turn) {
  const done = t.calls.filter(c => !c.failed)
  const last = done.at(-1)!
  const reading = done.slice(0, -1)
  const piece = last.piece ?? last.text ?? last.ms
  return {
    calls: done.length,
    steps: {
      readingFirst: sum(reading.map(c => c.first ?? c.ms)),
      readingRest: sum(reading.map(c => c.ms - (c.first ?? c.ms))),
      tools: sum(t.calls.slice(1).map((c, i) => c.at - (t.calls[i]!.at + t.calls[i]!.ms))),
      refused: sum(t.calls.filter(c => c.failed).map(c => c.ms)),
      answerFirst: last.first ?? last.ms,
      answerThinking: piece - (last.first ?? 0),
      answerWriting: last.ms - piece,
      other: (t.calls[0]?.at ?? 0) + t.ms - (last.at + last.ms),
    },
    /** When the first words would have come in this same turn, had it streamed. */
    streamed: last.at + piece,
    input1: done[0]?.input ?? 0,
  }
}
const STEPS: [keyof ReturnType<typeof stepsOf>['steps'], string][] = [
  ['readingFirst', 'Reading calls: waiting for each one\'s first token'],
  ['readingRest', 'Reading calls: the rest (thinking, writing the tool calls)'],
  ['tools', 'Tools between calls (the handbook, the tanks)'],
  ['refused', 'A key refused, the next one tried'],
  ['answerFirst', 'The answer call: waiting for its first token'],
  ['answerThinking', 'The answer call: its first token to the first words (thinking)'],
  ['answerWriting', 'The answer call: the first words to its end (writing)'],
  ['other', 'Other (before the first call, the blocks filled after)'],
]

function report(turns: Turn[], meta: Meta): string {
  const line = (label: string, xs: number[]) => `| ${label} | ${sec(at(xs, 0.5))} | ${sec(at(xs, 0.9))} |`
  const out = [
    '# Chat: time to the first words',
    '',
    `${meta.started.slice(0, 16).replace('T', ' ')} UTC, \`packages/engine/scripts/chat-speed.ts\`, the chat's code at \`${meta.commit}\`, ${meta.model}, over ${meta.site}'s handbook, ${meta.concurrency} at a time, from this Mac straight to Anthropic's API. Not timed here, as the Worker adds them: each call's hop to the relay in eastern North America, and the Worker's own steps before the first call (the session, the conversation, the ledger) and after the last (saving the turn, which today comes before the first words).`,
    '',
  ]
  for (const set of ['hard', 'everyday'] as const) {
    const ofSet = turns.filter(t => t.set === set)
    if (!ofSet.length) continue
    out.push(`## ${set === 'hard' ? 'The hard problems (each post whole, and its short question with the saved tank)' : 'Everyday questions (short, from a species page, from fish ID; four languages)'}`, '')
    const today = ofSet.filter(t => t.mode === 'today' && !t.failed).map(t => ({ t, s: stepsOf(t) }))
    const streamed = ofSet.filter(t => t.mode === 'streamed' && !t.failed)
    const failed = (m: Mode) => ofSet.filter(t => t.mode === m && t.failed).length
    out.push('| First words | Median | 90th percentile |', '| --- | --- | --- |')
    if (today.length) out.push(line(`**Today**: with the whole answer (${today.length} turns${failed('today') ? `, ${failed('today')} failed` : ''})`, today.map(x => x.t.words!)))
    if (streamed.length) out.push(line(`**Streamed** (${streamed.length} turns${failed('streamed') ? `, ${failed('streamed')} failed` : ''})`, streamed.map(t => t.words!)))
    if (today.length) out.push(line('Today\'s turns, had they streamed (their answer call\'s first words)', today.map(x => x.s.streamed)))
    const byId = new Map(today.map(x => [x.t.id, x.t]))
    const ratios = streamed.flatMap(t => (byId.has(t.id) ? [t.words! / byId.get(t.id)!.words!] : []))
    if (ratios.length) out.push('', `Streamed against today, question by question: ×${at(ratios, 0.5).toFixed(2)} at the median (×${at(ratios, 0.1).toFixed(2)} to ×${at(ratios, 0.9).toFixed(2)}, the 10th to the 90th percentile).`)
    const lines = streamed.filter(t => t.opening)
    if (lines.length) {
      out.push('', '| First line | Median | 90th percentile |', '| --- | --- | --- |', line(`Shown (${lines.length} of ${streamed.length} turns had one)`, lines.map(t => t.opening!.at)))
    }
    // After the text's last piece: the first card as Claude picks it (or with the run's end, when none streamed), and the run's end.
    const tail = streamed.flatMap(t => { const c = [...t.calls].reverse().find(x => x.last !== undefined); return c ? [{ last: c.at + c.last!, card: t.cards?.[0] ?? t.ms, end: t.ms }] : [] })
    if (tail.length) out.push('', '| After the text\'s last piece | Median | 90th percentile |', '| --- | --- | --- |', line('To the first card', tail.map(x => x.card - x.last)), line('To the run\'s end (the turn whole)', tail.map(x => x.end - x.last)))
    if (!today.length) { out.push(''); continue }
    const total = sum(today.map(x => sum(Object.values(x.s.steps))))
    out.push(
      '',
      `Where today's wait goes: each step's share of the time over the ${today.length} turns, its time in an average turn, and its own median and 90th percentile over the turns (those don't add up to the turn's).`,
      '',
      '| Step | Share | An average turn | Median | 90th percentile |',
      '| --- | --- | --- | --- | --- |',
      ...STEPS.map(([k, label]) => {
        const xs = today.map(x => x.s.steps[k])
        return `| ${label} | ${Math.round((sum(xs) / total) * 100)}% | ${sec(sum(xs) / today.length)} | ${sec(at(xs, 0.5))} | ${sec(at(xs, 0.9))} |`
      }),
      `| **The whole run** | 100% | ${sec(total / today.length)} | ${sec(at(today.map(x => x.t.ms), 0.5))} | ${sec(at(today.map(x => x.t.ms), 0.9))} |`,
      '',
      `Calls a turn: median ${at(today.map(x => x.s.calls), 0.5)}, 90th percentile ${at(today.map(x => x.s.calls), 0.9)}. The first call's input: median ${at(today.map(x => x.s.input1), 0.5)} tokens, none read from cache. A call's first token: median ${sec(at(today.flatMap(x => x.t.calls.flatMap(c => (c.failed || c.first === undefined ? [] : [c.first]))), 0.5))}.`,
    )
    if (streamed.length) {
      const dropped = streamed.filter(t => t.dropped).length
      const late = streamed.filter(t => t.words !== undefined && t.steps.some(s => s > t.words!)).length
      out.push('', `Streamed: ${dropped} of ${streamed.length} answers had a tool call dropped once their text showed; ${late} had a step after their first words. Off topic (its line comes whole): ${streamed.filter(t => t.offTopic).length}.`)
    }
    out.push('')
  }
  out.push(`Cost: $${sum(turns.map(t => t.usd)).toFixed(3)} for ${turns.length} turns.`, '')
  return out.join('\n')
}

await main()
