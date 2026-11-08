/**
 * The titles the chat gives its conversations, for the editors to score: each question asked as a conversation's first,
 * as the Worker asks it (`title: true`), with the Worker's own agent, prompt, schema, limits and model, over the live
 * site's handbook.
 *
 * The questions (a JSON array; the sample's is kept out of this public repository, in ~/.cache/aquatome/evals/titles/,
 * since its posts hold made-up names, places and phone numbers): `{ id, lang, kind, q, start?, private? }`. `kind` is
 * post (a whole pasted forum post), fish-id, short or species; `private`, the personal details in the message, which the
 * title must leave out. Each run writes, per language, `titles.<lang>.md` (the message's opening, where the chat started,
 * the title, and what the script flags: no title, a personal detail in it), and every result in `titles.json`.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-titles.ts
 *   … --questions <file> --only vi-post-01,th-short-02 --model claude-haiku-5-5 --concurrency 4 --out <dir>
 *
 * Keys: ~/.config/aquatome/anthropic-keys, as chat-offtopic.ts reads them; never printed.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { PageShard } from '@aq/schema/app-page'
import { answerQuestion, type ChatOptions, type Start } from '../../../apps/site/worker/chat/agent'
import { handbookOf, type Handbook, type Index, type Lang, type Source } from '../../../apps/site/worker/chat/handbook'
import type { Topics } from '../../../apps/site/worker/chat/topics'
import { clientFor, costOf } from '../../../apps/site/worker/fishid/claude'
import { healthyKeys, loadKeys, memoryHealth, rotate, type HealthStore, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { pool } from './eval-lib'

const ROOT = join(import.meta.dirname, '../../..')
const SAMPLE = join(homedir(), '.cache/aquatome/evals/titles')
type Send = ChatOptions['send']
const { values: args } = parseArgs({
  options: {
    questions: { type: 'string', default: join(SAMPLE, 'questions.json') },
    // The Worker's (CHAT_MODEL in apps/site/wrangler.jsonc).
    model: { type: 'string', default: 'claude-haiku-5-5' },
    only: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    site: { type: 'string', default: 'https://aquatome.com' },
    cache: { type: 'string', default: join(homedir(), '.cache/aquatome/chat-titles') },
    out: { type: 'string', default: SAMPLE },
  },
})
const MODEL = args.model!

type Question = { id: string; lang: Lang; kind: 'post' | 'fish-id' | 'short' | 'species'; q: string; start?: Start; private?: string[] }
type Result = { id: string; lang: Lang; kind: Question['kind']; title?: string; offTopic?: boolean; failed?: string; leaks: string[]; usd: number; ms: number }

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

/** A call on the keys: the first rotates over the healthy ones, later calls in a run keep the key that answered. */
function sender(healthy: KeyEntry[], store: HealthStore): Send {
  let client: Awaited<ReturnType<typeof clientFor>> | undefined
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

/** The personal details the title repeats, case and accents as written. */
const leaksIn = (title: string, q: Question) => (q.private ?? []).filter(p => title.normalize('NFC').toLowerCase().includes(p.normalize('NFC').toLowerCase()))

async function main() {
  const questions = (JSON.parse(await readFile(args.questions!, 'utf8')) as Question[]).filter(q => !args.only || args.only.split(',').includes(q.id))
  const indexText = await (await fetch(new URL('/app/vi.json', args.site))).text()
  siteDir = join(args.cache!, `site-${new URL(args.site!).host}-${hash(indexText)}`)
  await mkdir(siteDir, { recursive: true })
  const handbooks = new Map<Lang, Handbook>()
  for (const lang of new Set(questions.map(q => q.lang))) {
    const hb = await handbookOf(source, lang)
    if (!hb) throw new Error(`No app index for ${lang} at ${args.site}`)
    handbooks.set(lang, hb)
  }
  const { keys } = await loadKeys(await readFile(args.keys!, 'utf8').catch(() => ''))
  if (!keys.length) throw new Error(`No key in ${args.keys}`)
  const store = memoryHealth()
  console.log(`${questions.length} questions; ${MODEL}`)

  const results = await pool(questions.map(q => async (): Promise<Result> => {
    const t = Date.now()
    try {
      const run = await answerQuestion({ send: sender(await healthyKeys(keys, store, Date.now()), store), model: MODEL, lang: q.lang, question: q.q, earlier: [], start: q.start ?? {}, handbook: handbooks.get(q.lang)!, tanks: async () => [], title: true })
      const usd = costOf(MODEL, run.spent)
      if (!run.answer) return { id: q.id, lang: q.lang, kind: q.kind, failed: run.error ? String((run.error as Error).message ?? run.error).slice(0, 160) : `no answer (stopped: ${run.stopped})`, leaks: [], usd, ms: Date.now() - t }
      const title = run.answer.title
      console.log(`${q.id}: ${title ?? (run.answer.offTopic ? '(off topic)' : '(none)')}`)
      return { id: q.id, lang: q.lang, kind: q.kind, ...(title ? { title } : {}), ...(run.answer.offTopic ? { offTopic: true } : {}), leaks: title ? leaksIn(title, q) : [], usd, ms: Date.now() - t }
    } catch (e) {
      return { id: q.id, lang: q.lang, kind: q.kind, failed: String((e as Error).message ?? e).slice(0, 160), leaks: [], usd: 0, ms: Date.now() - t }
    }
  }), Number(args.concurrency))

  await mkdir(args.out!, { recursive: true })
  await writeFile(join(args.out!, 'titles.json'), `${JSON.stringify(results, null, 2)}\n`)
  for (const lang of new Set(questions.map(q => q.lang))) await writeFile(join(args.out!, `titles.${lang}.md`), report(lang, questions.filter(q => q.lang === lang), results))
  const missing = results.filter(r => !r.title).length
  const leaks = results.filter(r => r.leaks.length).length
  console.log(`${results.length - missing}/${results.length} titled, ${leaks} with a personal detail, $${results.reduce((a, r) => a + r.usd, 0).toFixed(3)}. Written: ${args.out}`)
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
/** The first `n` characters as the reader sees them, so a Thai mark is never cut from its letter. */
const cut = (s: string, n: number) => { const g = [...graphemes.segment(s)].map(x => x.segment); return g.length <= n ? s : `${g.slice(0, n - 1).join('')}…` }
const started = (s?: Start) => !s?.from ? '' : s.from === 'fish-id'
  ? `fish ID: ${(s.identified?.results ?? []).map(r => `${r.scientificName} ${Math.round(r.confidence * 100)}%`).join(', ')}`
  : `${s.from}: ${s.about ?? ''}`

function report(lang: Lang, qs: Question[], results: Result[]): string {
  const git = (...a: string[]) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim() } catch { return '' } }
  const brain = ['apps/site/worker/chat', 'apps/site/worker/agent']
  const commit = `${git('log', '-1', '--format=%h', '--', ...brain) || 'unknown'}${git('status', '--porcelain', '--', ...brain) ? ', with changes not committed' : ''}`
  const by = new Map(results.map(r => [r.id, r]))
  return [
    `# Chat titles: ${lang}`,
    '',
    `${new Date().toISOString().slice(0, 10)}, \`packages/engine/scripts/chat-titles.ts\`, the chat's code at \`${commit}\`, ${MODEL}, over ${args.site}'s handbook. Each question asked as a conversation's first, as the Worker asks it.`,
    '',
    `Titled: ${qs.filter(q => by.get(q.id)?.title).length}/${qs.length}. A personal detail from the message in the title: ${qs.filter(q => by.get(q.id)?.leaks.length).length}.`,
    '',
    '| # | Kind | Started from | The reader\'s message (its opening) | Title | Flag |',
    '| --- | --- | --- | --- | --- | --- |',
    ...qs.map((q, i) => {
      const r = by.get(q.id)
      const flag = !r ? 'not run' : r.failed ? `failed: ${r.failed}` : !r.title ? (r.offTopic ? 'off topic: no title' : 'no title') : r.leaks.length ? `personal: ${r.leaks.join(', ')}` : ''
      return `| ${i + 1} | ${q.kind} | ${cell(started(q.start))} | ${cell(cut(q.q, 160))} | ${cell(r?.title ?? '')} | ${cell(flag)} |`
    }),
    '',
  ].join('\n')
}

await main()
