/**
 * How the chat answers, with the Worker's own agent, prompt, schema, limits and model (apps/site/worker/chat/), over the
 * live site's handbook: its app index and page copies, read as the Worker reads them from its assets.
 *
 * Three sets of questions, in Vietnamese:
 * - faq: a question from a guide's FAQ, one per guide, guides at random (the seed's). Questions that only read inside
 *   their guide ("this siphon", "the video") are left out. The guide is the expected page; another may answer as well.
 * - start: written here, asked from a fish's page or from fish ID, or naming fish or a tank: the page it should read and
 *   the blocks it should show (a card, a comparison, a tool).
 * - outside: written here, what the handbook doesn't answer (it should say so: covered false) or isn't about keeping
 *   fish (the off-topic line; chat-offtopic.ts holds that rule on its own, far harder, set).
 *
 * Graded by the script, no judge:
 * - Found (faq): the guide read or shown, and answered from / another page shown, covered / not covered. A page counts
 *   as read once it loaded (a read that failed doesn't).
 * - Tank-mates: blocks picked whose fish, counts and tank Claude checked first (check_tank_mates; the Worker drops the
 *   others), and answers whose text opens with the shown block's verdict's head, word for word, as the prompt asks. The check's verdict
 *   is listed by the answer for a look.
 * - Points to blocks: answers whose text refers to its blocks ("xem thẻ bên dưới"), which the prompt says never to do
 *   (chat-eval-grade.ts `pointsAt`), listed by the answer.
 * - Figures: numbers in the text that nothing Claude was sent has: the question, its start, the searches' results and
 *   the parts of pages it opened (the prompt: figures only from a page read), listed for a look.
 * - Stopped, calls, tool calls, blocks dropped, seconds, and cost (usage × list price, apps/site/worker/fishid/claude.ts).
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-eval.ts --dry-run --n 5    # a fake Claude, no key
 *   pnpm --filter @aq/engine exec tsx scripts/chat-eval.ts --n 20             # 20 FAQ questions and the written ones
 *   … --models claude-opus-5-5,claude-sonnet-5-5 --seed 2 --concurrency 4 --keys <file> --site <origin> --cache <dir> --out <file>
 *   … --only "pH bể" --trace     # the questions with these words only; each call's stop reason, tool calls and text printed
 *
 * Keys: ~/.config/aquatome/anthropic-keys (or --keys), as fish-id-accuracy.ts reads them; never printed. The index is
 * read fresh each run; the handbook's other files are cached in --cache, in a folder named for the site and the index's
 * hash, so a run reads one build's files. Writes docs/review/chat-eval.md (a dry run: /tmp/chat-eval.dry-run.md), results only.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import type { PageDoc, PageShard } from '@aq/schema/app-page'
import { answerQuestion, type ChatOptions, type ChatRun, type Start } from '../../../apps/site/worker/chat/agent'
import type { ChatBlock } from '../../../apps/site/worker/chat/answer'
import { handbookOf, type Index, type Lang, type Source } from '../../../apps/site/worker/chat/handbook'
import type { Tank } from '../../../apps/site/worker/chat/tools'
import { topicsOf, type Topics } from '../../../apps/site/worker/chat/topics'
import { clientFor, costOf, DEFAULT_MODEL } from '../../../apps/site/worker/fishid/claude'
import { healthyKeys, loadKeys, memoryHealth, rotate, type HealthStore, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { faqFound, matesChecks, numbersIn, pointsAt, readPages, sentText } from './chat-eval-grade'
import { pool } from './eval-lib'

const ROOT = join(import.meta.dirname, '../../..')
/** The SDK's request and message, as the agent's `send` takes and gives them (the engine has no SDK of its own). */
type Send = ChatOptions['send']
type Message = Awaited<ReturnType<Send>>
type Client = Awaited<ReturnType<typeof clientFor>>
const { values: args } = parseArgs({
  options: {
    models: { type: 'string' },
    n: { type: 'string', default: '30' },
    seed: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '4' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    site: { type: 'string', default: 'https://aquatome.com' },
    cache: { type: 'string', default: '/tmp/chat-eval-cache' },
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    only: { type: 'string' },
    trace: { type: 'boolean', default: false },
  },
})
const DRY = args['dry-run']
const MODELS = (args.models ?? DEFAULT_MODEL).split(',').map(m => m.trim()).filter(Boolean)
const SEED = Number(args.seed)
const OUT = args.out ?? (DRY ? '/tmp/chat-eval.dry-run.md' : join(ROOT, 'docs/review/chat-eval.md'))

type Want = {
  /** Any of these pages read or shown. */
  read?: string[]
  /** Any of these shown: `species:<id>`, `compare:<id>+<id>` (both in one comparison), `tool:<name>`, `section:<path>`. */
  show?: string[]
  /** The handbook doesn't answer it: covered false. */
  covered?: false
  /** It isn't about keeping fish: the off-topic line. */
  offTopic?: true
}
/** `tanks`: the reader's saved tanks, as read_tanks would read them (none when missing). */
type Question = { set: 'faq' | 'start' | 'outside'; q: string; start: Start; want: Want; tanks?: Tank[] }

const neon = 'paracheirodon-innesi'
const WRITTEN: Question[] = [
  { set: 'start', q: 'Nuôi chung với những cá nào được?', start: { from: 'species', about: neon }, want: { read: ['/vi/ca/ca-neon-xanh/'], show: ['tool:tank-mates', `species:${neon}`] } },
  {
    set: 'start', q: 'Cá này nuôi bể bao nhiêu lít là vừa?',
    start: { from: 'fish-id', about: 'pterophyllum-scalare', identified: { verdict: 'fish', results: [{ scientificName: 'Pterophyllum scalare', id: 'pterophyllum-scalare', confidence: 0.91 }] } },
    want: { read: ['/vi/ca/ca-ong-tien/'], show: ['species:pterophyllum-scalare', 'tool:tank-volume', 'tool:tank-mates'] },
  },
  { set: 'start', q: 'Neon xanh với neon vua khác nhau thế nào, nên nuôi con nào?', start: {}, want: { read: ['/vi/ca/ca-neon-xanh/', '/vi/ca/ca-neon-vua/'], show: [`compare:${neon}+paracheirodon-axelrodi`] } },
  { set: 'start', q: 'Cá betta nuôi chung với cá bảy màu được không?', start: {}, want: { read: ['/vi/ca/ca-betta/', '/vi/ca/ca-bay-mau/'], show: ['tool:tank-mates', 'compare:betta-splendens+poecilia-reticulata'] } },
  // Fish the tank-mates check says no to: the text says what the block under it shows.
  { set: 'start', q: 'Cá betta nuôi chung với cá neon xanh được không?', start: {}, want: { read: ['/vi/ca/ca-betta/', '/vi/ca/ca-neon-xanh/'], show: ['tool:tank-mates'] } },
  { set: 'start', q: 'Bể dài 80, rộng 35, cao 45 cm thả 2 con cá ông tiên với 10 con neon xanh được không?', start: {}, want: { read: ['/vi/ca/ca-ong-tien/', '/vi/ca/ca-neon-xanh/'], show: ['tool:tank-mates'] } },
  // The reader's own tank: checked with its fish (read_tanks, then check_tank_mates with its id), the block naming it.
  {
    set: 'start', q: 'Bể của tôi thả thêm 1 con cá betta được không?', start: {}, want: { show: ['tool:tank-mates:tank'] },
    tanks: [{ id: 'eval-tank', name: 'Bể phòng khách', dims: { l: 60, w: 30, h: 36 }, species: [{ id: neon, count: 12 }], unlisted: [] }],
  },
  { set: 'start', q: 'Bể của tôi dài 60, rộng 30, cao 36 cm thì chứa được bao nhiêu lít nước?', start: {}, want: { show: ['tool:tank-volume'] } },
  { set: 'start', q: 'Thả 5 con thì cần bể lớn cỡ nào?', start: { from: 'species', about: 'symphysodon-aequifasciatus' }, want: { read: ['/vi/ca/ca-dia-nau/'], show: ['species:symphysodon-aequifasciatus', 'tool:tank-mates', 'tool:tank-volume'] } },
  { set: 'outside', q: 'Thời tiết Hà Nội ngày mai thế nào?', start: {}, want: { offTopic: true } },
  { set: 'outside', q: 'Cách nấu canh chua cá lóc ngon?', start: {}, want: { offTopic: true } },
  { set: 'outside', q: 'Người bị nấm da chân thì bôi thuốc gì, ngày mấy lần?', start: {}, want: { offTopic: true } },
  { set: 'outside', q: 'Đặt bể cá theo phong thủy thì nên quay hướng nào cho hợp tuổi?', start: {}, want: { covered: false } },
  { set: 'outside', q: 'Nuôi cá mập trắng trong bể kính ở nhà cần những gì?', start: {}, want: { covered: false } },
]

/** Words that point inside the guide a FAQ sits in: the question doesn't read on its own. */
const IN_ITS_GUIDE = /(^|[\s,(])(này|đó|kia|ấy|như vậy|như thế|nói trên|ở trên|trên đây|dưới đây|bài|video|clip)(?=$|[\s,.?!)])/iu

/** A small seeded generator (mulberry32), as fish-id-accuracy.ts: the same seed picks the same questions. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const shuffle = <T>(xs: T[], r: () => number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] } return a }

/** The site's build: its host and the index's hash name the cache folder (main), the index itself read fresh each run. */
let build = ''
let cacheDir = ''
/** The live site's handbook, each file kept in the build's cache folder once read. */
async function cached<T>(path: string): Promise<T | null> {
  const file = join(cacheDir, path.replace(/^\//, '').replace(/\//g, '_'))
  try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { /* not yet */ }
  const r = await fetch(new URL(path, args.site))
  if (!r.ok) return null
  const text = await r.text()
  await writeFile(file, text)
  return JSON.parse(text) as T
}
/** Every guide's app copy, from its shards. */
async function guideDocs(lang: Lang): Promise<PageDoc[]> {
  const n = (await cached<Index>(`/app/${lang}.json`))?.shards?.guide?.n ?? 0
  const shards = await Promise.all(Array.from({ length: n }, (_, i) => cached<PageShard>(`/app/pages/${lang}/guide-${i}.json`)))
  return shards.flatMap(s => Object.values(s?.pages ?? {}))
}
/** The guides' topics the build writes; worked out from the page copies, as the build does, where the site has none yet. */
let topicsFrom: 'site' | 'pages' = 'site'
const source: Source = {
  index: lang => cached<Index>(`/app/${lang}.json`),
  shard: (lang, kind, n) => cached<PageShard>(`/app/pages/${lang}/${kind}-${n}.json`),
  topics: async lang => (await cached<Topics>(`/app/chat/${lang}.json`)) ?? ((topicsFrom = 'pages'), topicsOf(await guideDocs(lang))),
}

/** One FAQ question per guide, from n guides at random. */
async function faqQuestions(index: Index, n: number): Promise<Question[]> {
  const shards = index.shards?.guide?.n ?? 0
  const byGuide = new Map<string, string[]>()
  for (let i = 0; i < shards; i++) {
    const shard = await source.shard('vi', 'guide', i)
    for (const [path, doc] of Object.entries(shard?.pages ?? {})) {
      for (const b of doc.blocks) {
        if (b.t !== 'faq') continue
        const qs = b.items.map(x => x.q.trim()).filter(q => q.length >= 25 && !IN_ITS_GUIDE.test(q))
        if (qs.length) byGuide.set(path, [...(byGuide.get(path) ?? []), ...qs])
      }
    }
  }
  const r = rng(SEED)
  return shuffle([...byGuide.keys()].sort(), r).slice(0, n).map(path => {
    const qs = byGuide.get(path)!
    return { set: 'faq', q: qs[Math.floor(r() * qs.length)]!, start: {}, want: { read: [path] } }
  })
}

const message = (content: unknown[], stop: Message['stop_reason'] = 'end_turn'): Message =>
  ({ id: 'dry', type: 'message', role: 'assistant', model: 'dry-run', content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 300 } }) as unknown as Message

/**
 * The dry run's Claude: searches "cá", opens the first page found, then answers with its opening and a figure no page
 * gives, so every column of the report is filled.
 */
const fakeSend: Send = async b => {
  const turns = b.messages.filter(m => m.role === 'assistant').length
  if (turns === 0) return message([{ type: 'tool_use', id: 's1', name: 'search_handbook', input: { query: 'cá', kind: null } }], 'tool_use')
  const last = b.messages.at(-1)!.content
  const result = Array.isArray(last) ? last.find(c => c.type === 'tool_result') : undefined
  const text = result?.type === 'tool_result' && typeof result.content === 'string' ? result.content : ''
  const found = turns === 1 ? (JSON.parse(text.startsWith('[') ? text : '[]') as { path: string }[])[0]?.path : undefined
  if (found) return message([{ type: 'tool_use', id: 'r1', name: 'read_page', input: { path: found, heading: null } }], 'tool_use')
  const read = b.messages.flatMap(m => (Array.isArray(m.content) ? m.content : [])).flatMap(c => (c.type === 'tool_use' && c.name === 'read_page' ? [(c.input as { path: string }).path] : []))[0]
  const answer = { text: 'Trang này nói rõ cách nuôi; nhiệt độ khoảng 27,5 độ là vừa.', covered: Boolean(read), suggestions: ['Nuôi chung với cá gì?'],
    blocks: read ? [{ t: 'section', ids: [], path: read, heading: null, tool: null, fish: [], tank: null }] : [] }
  return message([{ type: 'text', text: JSON.stringify(answer) }])
}

/** A real call: the first rotates over the healthy keys, later calls keep the key that answered (as the Worker does). */
function realSend(healthy: KeyEntry[], store: HealthStore) {
  return () => {
    let client: Client | undefined
    const send: Send = async (b, { timeoutMs, call }) => {
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
    return send
  }
}

/** The keys a block answers to in `Want.show`. */
function keysOf(b: ChatBlock): string[] {
  switch (b.t) {
    case 'species': return [`species:${b.page.id}`]
    case 'compare': return b.items.map(c => `species:${c.page.id}`)
    case 'section': return [`section:${b.page.url}`]
    case 'tool': return [`tool:${b.tool}`, ...(b.tank ? [`tool:${b.tool}:tank`] : [])]
  }
}
const shows = (blocks: ChatBlock[], want: string) => {
  if (!want.startsWith('compare:')) return blocks.some(b => keysOf(b).includes(want))
  const ids = want.slice('compare:'.length).split('+')
  return blocks.some(b => b.t === 'compare' && ids.every(id => b.items.some(c => c.page.id === id)))
}
const pagesOf = (blocks: ChatBlock[]) => blocks.flatMap(b => (b.t === 'section' ? [b.page.url] : b.t === 'species' ? [b.page.url] : b.t === 'compare' ? b.items.map(c => c.page.url) : [])).filter((u): u is string => Boolean(u))

type Row = {
  model: string
  question: Question
  run?: ChatRun
  failed?: string
  read: string[]
  /** faq: the guide read or shown / another page shown and covered / neither. start, outside: as wanted or not. A run
   * with no answer has failed, whatever it read. */
  found: 'guide' | 'other' | 'none' | 'ok' | 'not' | 'failed'
  /** Numbers in the text nothing Claude was sent has. */
  invented: number[]
  /** Where its text points to its blocks (`pointsAt`). */
  points: string[]
  /** Its tank-mates blocks picked, those dropped as not checked first, whether the text opens with the shown one's verdict. */
  mates: { blocks: number; unchecked: number; opens?: boolean; verdicts: string[] }
  ms: number
  usd: number
}

function grade(model: string, question: Question, run: ChatRun | undefined, failed: string | undefined, ms: number, sent: string): Row {
  const read = readPages(run?.history ?? [])
  const blocks = run?.blocks ?? []
  const covered = run?.answer?.covered
  const w = question.want
  const touched = (paths: string[]) => paths.some(p => read.includes(p) || pagesOf(blocks).includes(p))
  let found: Row['found']
  if (failed) found = 'failed'
  else if (question.set === 'faq') found = faqFound(touched(w.read!), covered, pagesOf(blocks).length)
  else if (question.set === 'start') found = (!w.read || touched(w.read)) && (w.show ?? []).some(s => shows(blocks, s)) ? 'ok' : 'not'
  else found = (w.offTopic ? run?.answer?.offTopic === true : covered === false) ? 'ok' : 'not'
  // What it could have read its figures in: what it was sent (the question, its start, the searches' results, the parts
  // of pages it opened), not the whole of a page it saw only the outline of.
  const known = new Set(numbersIn([question.q, JSON.stringify(question.start.identified ?? {}), sent].join('\n')))
  const invented = [...new Set(numbersIn(run?.answer?.text ?? ''))].filter(n => !known.has(n))
  const usd = run ? costOf(model, run.spent) : 0
  // The head of the check the shown block carries: the run's check of the same sentence (the block has the sentence only).
  const checks = matesChecks(run?.history ?? [])
  const heads = blocks.flatMap(b => (b.t === 'tool' && b.check?.verdict ? checks.filter(c => c.text === b.check!.verdict!.text).flatMap(c => (c.head ? [c.head] : [])).slice(0, 1) : []))
  const unchecked = (run?.dropped ?? []).filter(d => /^tool: tank-mates .* not checked$/.test(d)).length
  const mates = {
    blocks: blocks.filter(b => b.t === 'tool' && b.tool === 'tank-mates').length + unchecked, unchecked,
    ...(heads[0] ? { opens: (run?.answer?.text ?? '').trimStart().startsWith(heads[0]) } : {}),
    verdicts: checks.flatMap(c => (c.text ? [`${c.level}: ${c.text}`] : [])),
  }
  return { model, question, run, ...(failed ? { failed } : {}), read, found, invented, points: pointsAt(run?.answer?.text ?? ''), mates, ms, usd }
}

async function main() {
  const fresh = await fetch(new URL('/app/vi.json', args.site)).catch(() => null)
  if (!fresh?.ok) { console.error(`No app index at ${args.site}/app/vi.json`); process.exit(1) }
  const indexText = await fresh.text()
  build = createHash('sha256').update(indexText).digest('hex').slice(0, 12)
  cacheDir = join(args.cache!, `${new URL(args.site!).host}-${build}`)
  await mkdir(cacheDir, { recursive: true })
  await writeFile(join(cacheDir, 'app_vi.json'), indexText)
  const hb = await handbookOf(source, 'vi')
  // A FAQ question is asked as its guide words it, and the search reads the guides' FAQ questions: it is left out of
  // them while it is asked, as a reader's own words would differ (fish ID's eval leaves out the test photo the same way).
  const all = await hb?.topics()
  const asked = async (q: Question) => {
    if (q.set !== 'faq' || !all) return hb!
    const pages = Object.fromEntries(Object.entries(all.pages).map(([path, list]) => [path, list.filter(([, text]) => text.trim() !== q.q)]))
    return (await handbookOf({ ...source, topics: async () => ({ v: 1, pages }) }, 'vi'))!
  }
  const index = await source.index('vi')
  if (!hb || !index) { console.error(`No app index at ${args.site}/app/vi.json`); process.exit(1) }
  const questions = [...(await faqQuestions(index, Number(args.n))), ...WRITTEN].filter(q => !args.only || q.q.includes(args.only))
  console.log(`${questions.length} questions: ${questions.filter(q => q.set === 'faq').length} from the guides' FAQs (seed ${SEED}), ${questions.filter(q => q.set !== 'faq').length} written here; ${MODELS.join(', ')}${DRY ? ', dry run' : ''}`)

  const { keys, bad } = DRY ? { keys: [], bad: 0 } : await loadKeys(await readFile(args.keys!, 'utf8').catch(() => ''))
  if (bad) console.log(`${bad} line(s) in the keys file aren't a key: skipped`)
  if (!DRY && !keys.length) { console.error(`No key in ${args.keys}`); process.exit(1) }
  const store = memoryHealth()
  const rows: Row[] = []
  for (const model of MODELS) {
    const out = await pool(questions.map(question => async () => {
      const plain = DRY ? fakeSend : realSend(await healthyKeys(keys, store, Date.now()), store)()
      // Each request holds the turns before it: the last one sent holds all Claude was given to read.
      let sent: Parameters<Send>[0]['messages'] = []
      const send: Send = async (b, o) => {
        sent = b.messages
        const m = await plain(b, o)
        if (!args.trace) return m
        console.log(`  call ${o.call} (tool_choice ${b.tool_choice?.type}): ${m.stop_reason}, ${m.usage.output_tokens} tokens out`)
        for (const c of m.content) console.log(`    ${c.type}${c.type === 'tool_use' ? ` ${c.name} ${JSON.stringify(c.input)}` : c.type === 'text' ? `: ${c.text.slice(0, 1500)}` : ''}`)
        return m
      }
      const t = Date.now()
      let run: ChatRun | undefined
      let failed: string | undefined
      try {
        run = await answerQuestion({ send, model, lang: 'vi', question: question.q, earlier: [], start: question.start, handbook: await asked(question), title: true, tanks: async () => question.tanks ?? [] })
        if (!run.answer) failed = run.error ? String((run.error as Error).message ?? run.error).slice(0, 120) : `no answer (stopped: ${run.stopped})`
      } catch (e) {
        failed = String((e as Error).message ?? e).slice(0, 120)
      }
      const row = grade(model, question, run, failed, Date.now() - t, sentText(sent))
      console.log(`${model} ${question.set} ${row.found}${row.invented.length ? ` figures ${row.invented.join(',')}` : ''}${failed ? ` FAILED ${failed}` : ''} ${(row.ms / 1000).toFixed(1)} s $${row.usd.toFixed(3)}: ${question.q}`)
      return row
    }), Number(args.concurrency))
    rows.push(...out)
  }
  await writeFile(OUT, report(rows))
  console.log(`Written: ${OUT}`)
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const pct = (k: number, n: number) => (n ? `${k}/${n}` : '–')
/** Tank-mates blocks checked first, of those shown. */
const checked = (rs: Row[]) => { const n = rs.reduce((t, r) => t + r.mates.blocks, 0); return pct(n - rs.reduce((t, r) => t + r.mates.unchecked, 0), n) }
const at = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]! : NaN }

/** The commit the Worker's code is at (its last change: a commit on main once this branch merges), and whether the
 * agent's or the eval's files differ from it. */
function commit(): string {
  try {
    const git = (...a: string[]) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
    return `${git('log', '-1', '--format=%h', '--', 'apps/site/worker')}${git('status', '--porcelain', '--', 'apps/site/worker', 'packages/engine/scripts') ? ', with changes not committed' : ''}`
  } catch { return 'unknown' }
}

function report(rows: Row[]): string {
  const faqs = rows.filter(r => r.question.set === 'faq' && r.model === MODELS[0]).length
  const lines = [
    '# Chat: how it answers',
    '',
    `${DRY ? '**Dry run: a fake Claude, these numbers mean nothing.** ' : ''}${new Date().toISOString().slice(0, 10)}, \`packages/engine/scripts/chat-eval.ts\`, seed ${SEED}, commit \`${commit()}\`. The Worker's own agent, prompt, schema, effort and limits (\`apps/site/worker/chat/\`) at that commit, over ${args.site}'s handbook (the build whose app index hashes to \`${build}\`; the guides' headings and FAQ questions ${topicsFrom === 'site' ? 'as the site serves them' : 'worked out from its page copies, as the build does'}), in Vietnamese, no saved tanks but a question's own.`,
    '',
    `${faqs} questions from the guides' FAQs, one per guide, guides at random; ${WRITTEN.filter(q => q.set === 'start').length} asked from a fish's page or fish ID, or naming fish or a tank; ${WRITTEN.filter(q => q.set === 'outside').length} the handbook doesn't answer or aren't about keeping fish.`,
    '',
    '- **FAQ:** the guide the question came from was read or shown, and answered from (not as not covered) / another page shown, answered as covered / answered as not covered (with the nearest page) or with no page shown. A page counts as read once it loaded. Another guide may answer as well. A run with no answer is counted as failed, not in these. The search reads the guides\' FAQ questions too, so the question asked is left out of them while it is asked.',
    '- **Start:** the page it should read was read or shown, and one of the blocks it should show was shown.',
    '- **Outside:** answered as not covered, or, when not about keeping fish, with the off-topic line.',
    '- **Tank-mates: checked · opens with it:** tank-mates blocks picked whose fish, counts and tank Claude checked first (check_tank_mates; the Worker shows no other) · answers with a verdict shown whose text opens with its head, word for word. The check\'s verdict is listed under each answer.',
    '- **Points to blocks:** answers whose text refers to its blocks ("xem thẻ bên dưới", "bảng dưới đây"), which the reader sees under it anyway; the prompt says never to. The words are listed by each answer: a flag for a look, not a count (other wordings aren\'t caught, and "below" as a place ending a clause can be).',
    '- **Figures not in a page:** answers whose text has a number that nothing Claude was sent has: the question, the searches\' results, the parts of pages it opened (listed below). A small number (a list\'s 2 or 3) may be in what it read by chance, so this is a floor.',
    '- **Stopped:** answered when Claude chose / at the calls, tool-call, time or token limit / a call failed.',
    '- **Cost:** response usage × list price, every call, per question. **Latency:** first call to the filled answer, on this machine.',
    '',
    '| Model | FAQ: guide / other page / not covered | Start | Outside | Tank-mates: checked · opens with it | Points to blocks | Figures not in a page | Blocks dropped | Stopped: answer / calls / tools / time / tokens / error | Calls · tools | Median | p90 | $ / question |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |',
  ]
  for (const model of MODELS) {
    const rs = rows.filter(r => r.model === model)
    const f = rs.filter(r => r.question.set === 'faq')
    const s = rs.filter(r => r.question.set === 'start')
    const o = rs.filter(r => r.question.set === 'outside')
    const runs = rs.flatMap(r => (r.run ? [r.run] : []))
    const stops = (['answer', 'calls', 'tools', 'time', 'tokens', 'error'] as const).map(k => runs.filter(x => x.stopped === k).length).join(' / ')
    const mean = (g: (x: ChatRun) => number) => (runs.reduce((t, x) => t + g(x), 0) / Math.max(1, runs.length)).toFixed(1)
    const ms = rs.map(r => r.ms)
    const failed = f.filter(r => r.found === 'failed').length
    lines.push(`| ${model} | ${f.filter(r => r.found === 'guide').length} / ${f.filter(r => r.found === 'other').length} / ${f.filter(r => r.found === 'none').length} of ${f.length}${failed ? `, ${failed} failed` : ''} | ${pct(s.filter(r => r.found === 'ok').length, s.length)} | ${pct(o.filter(r => r.found === 'ok').length, o.length)} | ${checked(rs)} · ${pct(rs.filter(r => r.mates.opens).length, rs.filter(r => r.mates.opens !== undefined).length)} | ${pct(rs.filter(r => r.points.length).length, rs.length)} | ${pct(rs.filter(r => r.invented.length).length, rs.length)} | ${runs.reduce((t, x) => t + x.dropped.length, 0)} | ${stops} | ${mean(x => x.calls)} · ${mean(x => x.tools)} | ${(at(ms, 0.5) / 1000).toFixed(1)} s | ${(at(ms, 0.9) / 1000).toFixed(1)} s | $${(rs.reduce((t, r) => t + r.usd, 0) / Math.max(1, rs.length)).toFixed(3)} |`)
  }
  for (const model of MODELS) {
    lines.push('', `## ${model}`, '', '| Set | Question | Found | Read | Shown | Covered | Points to blocks | Figures not in a page | Time | Cost |', '| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: |')
    for (const r of rows.filter(x => x.model === model)) {
      const shown = (r.run?.blocks ?? []).map(b => keysOf(b).join(' + ').replace(/^section:\/vi\//, 'section:')).join(', ')
      lines.push(`| ${r.question.set} | ${cell(r.question.q)} | ${r.failed ? `failed: ${cell(r.failed)}` : r.found} | ${r.read.length} | ${cell(shown) || '–'} | ${r.run?.answer?.covered ?? '–'} | ${cell(r.points.join(', ')) || '–'} | ${r.invented.join(', ') || '–'} | ${(r.ms / 1000).toFixed(1)} s | $${r.usd.toFixed(3)} |`)
    }
    lines.push('', '### Its answers', '')
    for (const r of rows.filter(x => x.model === model)) {
      const expected = r.question.want.read?.length ? ` (expected: ${r.question.want.read.join(', ')})` : ''
      const searched = (r.run?.steps ?? []).flatMap(s => (s.kind === 'search' ? [`"${s.query}"`] : []))
      lines.push(`- **${cell(r.question.q)}**${expected}: ${r.run?.answer ? cell(r.run.answer.text) : `— ${r.failed ?? ''}`}${r.run?.dropped.length ? ` Dropped: ${cell(r.run.dropped.join('; '))}.` : ''}`,
        `  Searched ${cell(searched.join(', ')) || 'nothing'}; read ${r.read.join(', ') || 'nothing'}.${r.mates.verdicts.length ? ` Tank-mates check: ${cell(r.mates.verdicts.join('; '))}.` : ''}${r.mates.unchecked ? ` ${r.mates.unchecked} tank-mates block${r.mates.unchecked > 1 ? 's' : ''} dropped, not checked.` : ''}${r.mates.opens === false ? ' The text doesn\'t open with the verdict.' : ''}`)
    }
  }
  return `${lines.join('\n')}\n`
}

await main()
