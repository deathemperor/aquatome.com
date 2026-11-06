/**
 * How well each Claude model names the handbook's fish from a photo, with the fish-ID tool's own prompt, schema,
 * key rotation and matching (apps/site/worker/fishid/), so the result is the tool's.
 *
 * Photos with a known answer: one per species or breed page, a photo the subject check said shows that page's fish,
 * typically (engine-state/_photo-subjects.json: ok "yes", typical), still on the page or in its gallery. Breeds up to a
 * quarter of the sample, the most popular species to half of it, then a seeded random spread. Each is shrunk as the page shrinks a
 * reader's photo (1024 px, JPEG) and sent to each model.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/fish-id-accuracy.ts --dry-run --n 20          # a fake Claude, no key
 *   pnpm --filter @aq/engine exec tsx scripts/fish-id-accuracy.ts                           # 200 photos × 3 models
 *   … --models claude-haiku-5-5,claude-sonnet-5-5 --n 100 --seed 2 --concurrency 4 --keys <file> --out <file>
 *   … --models claude-opus-5-5 --agent --max-turns 3,2   # today's call, then the agent (apps/site/worker/fishid/agent.ts)
 *
 * --agent: each model also runs as the agent the Worker runs with FISH_ID_AGENT on, on the same photos, its tools over
 * content/ (the catalog and the facts the build would write), with the test photo left out of the reference photos it
 * is shown, and so is any photo from the same source page (`sourceUrl`) or a near-copy of it (its dHash within 10 bits,
 * content/picture-hashes.json). --max-turns: the turns it may use tools in before its answer is forced, one row each
 * (3: the Worker's 4 calls; 2: one search and one look, then the answer). --agent-only: the agent's rows only, not
 * today's call again (write it with --out, then put it beside the full run's).
 *
 * --photo <file> (repeatable): instead of the 200, a reader's photo kept on this machine, run through the agent as the
 * Worker runs it (its limits, the facts the build writes, every language's names), every step printed: what it searched,
 * the pages it opened, each turn's tool calls and text, its answer and the pages it links. --expect <scientific name or
 * page id>: says whether the answer has it first or in its top three. --box x,y,w,h: the part of the photo the reader
 * boxed, as fractions of its width and height. --runs <n>: each photo n times (the same photo can be answered
 * differently). --effort low|medium|high: the agent's effort (the Worker's: low). Nothing is written.
 * --genera Betta,Corydoras,…: instead of the usual sample, species of these genera only, at random: the look-alikes of
 * a big genus, which the usual sample (popular fish first) has few of.
 *
 *   … --photo ~/Desktop/fish.jpg --expect "Betta macrostoma" --runs 3
 *
 * Keys: ~/.config/aquatome/anthropic-keys (or --keys), the Worker's ANTHROPIC_KEYS format: one per line, `<key>` or
 * `<key> <workspaceId>`. Never printed: the report and the log name a key by its hash only. Writes
 * docs/review/fish-id-accuracy.md (a dry run: /tmp/fish-id-accuracy.dry-run.md), results only.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { loadAll, type Photo } from '@aq/schema'
import { smallSrc } from '../../../apps/site/src/lib/img'
import { identifyWithAgent, type AgentOutcome } from '../../../apps/site/worker/fishid/agent'
import { askClaude, costOf, DEFAULT_MODEL, readAnswer, type Answer } from '../../../apps/site/worker/fishid/claude'
import { buildCatalog, type Catalog, type CatalogEntry } from '../../../apps/site/worker/fishid/catalog'
import { buildFacts, type Facts } from '../../../apps/site/worker/fishid/facts'
import { healthyKeys, loadKeys, memoryHealth, rotate, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { matchGuesses, type Result } from '../../../apps/site/worker/fishid/match'
import { pageOf as pageOfKey } from '../../../apps/site/worker/fishid/agent-tools'
import { LANGS } from '@aq/schema/langs'
import { JPEG_QUALITY, MAX_SIDE } from '../../../apps/site/worker/fishid/photo'
import { popularityOrder } from '../src/depth'
import { popularFirst } from '../src/shops'

const ROOT = join(import.meta.dirname, '../../..')
const { values: args } = parseArgs({
  options: {
    models: { type: 'string' },
    n: { type: 'string', default: '200' },
    seed: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '4' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    out: { type: 'string' },
    agent: { type: 'boolean', default: false },
    'agent-only': { type: 'boolean', default: false },
    'max-turns': { type: 'string', default: '3' },
    'dry-run': { type: 'boolean', default: false },
    photo: { type: 'string', multiple: true },
    expect: { type: 'string' },
    box: { type: 'string' },
    runs: { type: 'string', default: '1' },
    effort: { type: 'string', default: 'low' },
    genera: { type: 'string' },
  },
})
/** --genera: species of these genera only, at random (the seed's), for the look-alikes of a big genus. */
const GENERA = new Set((args.genera ?? '').split(',').map(g => g.trim().toLowerCase()).filter(Boolean))
const EFFORT = (['low', 'medium', 'high'] as const).find(e => e === args.effort) ?? 'low'
const DRY = args['dry-run']
const MODELS = (args.models ?? (args.photo?.length ? DEFAULT_MODEL : 'claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5')).split(',').map(s => s.trim()).filter(Boolean)
const N = Number(args.n)
const SEED = Number(args.seed)
const OUT = args.out ?? (DRY ? '/tmp/fish-id-accuracy.dry-run.md' : join(ROOT, 'docs/review/fish-id-accuracy.md'))
/** The runs per model: today's single call, then the agent at each --max-turns. */
type Mode = { label: string; turns?: number }
const AGENT_MODES: Mode[] = args.agent || args['agent-only'] ? args['max-turns']!.split(',').map(Number).filter(n => n > 0).map(n => ({ label: `agent, ${n + 1} calls`, turns: n })) : []
const MODES: Mode[] = args['agent-only'] ? AGENT_MODES : [{ label: '' }, ...AGENT_MODES]
/** Two photos whose dHashes differ in this many bits or fewer are one picture (as the engine's own duplicate check). */
const NEAR_BITS = 10
const hamming = (a: string, b: string) => { let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0; while (x) { n += Number(x & 1n); x >>= 1n } return n }

/** A small seeded generator (mulberry32): the same seed picks the same photos. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const readJson = async <T>(p: string): Promise<T | undefined> => JSON.parse(await readFile(p, 'utf8').catch(() => 'null')) ?? undefined

/** `thumb`: the photo's own small copy; `sourceUrl`: the page it came from. Neither, nor a near-copy, is ever a reference photo. */
type Sample = { id: string; kind: 'species' | 'breed'; url: string; thumb: string; sourceUrl: string; why: 'breed' | 'popular' | 'random' }
type Verdicts = Record<string, Record<string, { ok?: string; typical?: boolean }>>

/** One typical photo per page, as described at the top. */
async function pickPhotos(catalog: Catalog): Promise<Sample[]> {
  const verdicts = (await readJson<Verdicts>(join(ROOT, 'engine-state/_photo-subjects.json'))) ?? {}
  const random = rng(SEED)
  const pages = new Map<string, Sample>()
  for (const kind of ['species', 'breeds'] as const) {
    for (const id of (await readdir(join(ROOT, 'content', kind)).catch(() => [] as string[])).sort()) {
      if (!catalog.entries.some(e => e.id === id)) continue
      const entity = await readJson<{ photos?: Photo[] }>(join(ROOT, 'content', kind, id, 'entity.json'))
      const gallery = await readJson<{ photos?: Photo[] }>(join(ROOT, 'content/gallery', `${id}.json`))
      const all = [...(entity?.photos ?? []), ...(gallery?.photos ?? [])]
      const urls = [...new Set(all.map(p => p.url))]
      const good = urls.filter(u => verdicts[u]?.[id]?.ok === 'yes' && verdicts[u]?.[id]?.typical === true)
      const url = good.length ? good[Math.floor(random() * good.length)]! : undefined
      const photo = all.find(p => p.url === url)
      if (url && photo) pages.set(id, { id, kind: kind === 'species' ? 'species' : 'breed', url, thumb: smallSrc(photo), sourceUrl: photo.sourceUrl, why: 'random' })
    }
  }
  const out: Sample[] = []
  const take = (s: Sample, why: Sample['why']) => { if (out.length < N && pages.delete(s.id)) out.push({ ...s, why }) }
  if (GENERA.size) {
    const genusOf = (id: string) => catalog.entries.find(e => e.id === id)?.sci?.split(' ')[0]?.toLowerCase() ?? ''
    const pool = [...pages.values()].filter(s => s.kind === 'species' && GENERA.has(genusOf(s.id)))
    while (out.length < N && pool.length) take(pool.splice(Math.floor(random() * pool.length), 1)[0]!, 'random')
    return out
  }
  // Breeds up to a quarter of the sample, popular species to half of it, then the spread.
  for (const s of [...pages.values()].filter(s => s.kind === 'breed').slice(0, Math.floor(N / 4))) take(s, 'breed')
  let popular = 0
  for (const id of popularityOrder(await popularFirst(ROOT))) { if (popular >= N / 2) break; const s = pages.get(id); if (s?.kind === 'species') { take(s, 'popular'); popular++ } }
  const rest = [...pages.values()]
  while (out.length < N && rest.length) take(rest.splice(Math.floor(random() * rest.length), 1)[0]!, 'random')
  return out
}

/** The photo as the page would send it: at most 1024 px on its long side, JPEG. */
async function prepare(url: string): Promise<string> {
  if (DRY) return (await sharp({ create: { width: 64, height: 48, channels: 3, background: '#2f6b4f' } }).jpeg().toBuffer()).toString('base64')
  const r = await fetch(url)
  if (!r.ok) throw new Error(`download ${r.status}`)
  const img = await sharp(Buffer.from(await r.arrayBuffer())).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: Math.round(JPEG_QUALITY * 100) }).toBuffer()
  return img.toString('base64')
}

/**
 * The dry run's Claude: a fetch that answers like the API, from the known answer, right most of the time, sometimes
 * second, sometimes wrong, unclear or refused, so every column of the report gets numbers. Asked as the agent (tools in
 * the request), it searches for the right name, opens the right page, then answers with its id.
 */
function fakeClaude(expected: CatalogEntry, base: CatalogEntry | undefined, roll: number): typeof fetch {
  const english = (expected.name.vi.match(/\(([^)]+)\)\s*$/)?.[1] ?? expected.name.vi)
  const right = { scientificName: (expected.sci ?? base?.sci) ?? 'Hybrid', commonName: expected.kind === 'breed' ? english : 'Fish', variety: null, confidence: 0.85, reason: 'Hình dáng và màu sắc khớp.' }
  const wrong = { scientificName: 'Danio rerio', commonName: 'Zebrafish', variety: null, confidence: 0.6, reason: 'Sọc ngang.' }
  const answer = roll < 0.65 ? { verdict: 'fish', guesses: [right] } : roll < 0.8 ? { verdict: 'fish', guesses: [wrong, { ...right, confidence: 0.3 }] } : roll < 0.9 ? { verdict: 'fish', guesses: [wrong] } : roll < 0.95 ? { verdict: 'unclear', guesses: [] } : null
  const reply = (stop: string, content: unknown[], usage: Record<string, number>) => Response.json({ id: 'msg_dry', type: 'message', role: 'assistant', model: 'dry-run', stop_sequence: null, stop_reason: stop, content, usage })
  return (async (_: RequestInfo | URL, init?: RequestInit) => {
    await new Promise(r => setTimeout(r, 5))
    const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: unknown[]; tool_choice?: { type: string }; messages: unknown[] }
    if (body.tools && body.tool_choice?.type !== 'none' && body.messages.length < 5) {
      const turn = (body.messages.length - 1) / 2
      const use = turn === 0 ? { name: 'search_handbook', input: { query: right.scientificName, genus: null } } : { name: 'get_entry', input: { id: expected.id } }
      return reply('tool_use', [{ type: 'tool_use', id: `toolu_dry_${turn}`, ...use }], { input_tokens: 300, output_tokens: 120, cache_read_input_tokens: 1700 * turn, cache_creation_input_tokens: 1700 })
    }
    const agentAnswer = answer && body.tools ? { ...answer, guesses: answer.guesses.map(g => ({ ...g, id: g === right ? expected.id : null })) } : answer
    return reply(answer ? 'end_turn' : 'refusal', [{ type: 'text', text: answer ? JSON.stringify(agentAnswer) : 'No.' }], { input_tokens: 1700, output_tokens: 160 })
  }) as typeof fetch
}

/** One photo's run; the agent's also has its calls, tool calls, photos shown and why it stopped. */
type Outcome = { sample: Sample; ms?: number; answer?: Answer; results?: Result[]; failed?: string; cost?: number; agent?: Pick<AgentOutcome, 'calls' | 'tools' | 'photos' | 'stopped'> & { cacheRead: number; input: number } }
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!, i) } }))
  return out
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN }
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–')
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** A reader's photo from this machine as the page sends it: the boxed part (x,y,w,h as fractions), at most 1024 px, JPEG. */
async function prepareFile(path: string, box?: string): Promise<string> {
  let img = sharp(await readFile(path)).rotate()
  if (box) {
    const [x, y, w, h] = box.split(',').map(Number)
    const { width = 0, height = 0 } = await sharp(await img.toBuffer()).metadata()
    img = sharp(await img.toBuffer()).extract({ left: Math.round(x! * width), top: Math.round(y! * height), width: Math.round(w! * width), height: Math.round(h! * height) })
  }
  return (await img.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: Math.round(JPEG_QUALITY * 100) }).toBuffer()).toString('base64')
}

/** A fetch that prints each of the agent's turns as it comes back: its tool calls and its text, cut short. */
const tracing = (label: string): typeof fetch => (async (input: RequestInfo | URL, init?: RequestInit) => {
  const r = await fetch(input, init)
  type Block = { type: string; name?: string; input?: unknown; text?: string; thinking?: string }
  const m = (await r.clone().json().catch(() => null)) as { content?: Block[] } | null
  for (const b of m?.content ?? []) {
    if (b.type === 'tool_use') console.log(`  ${label} → ${b.name} ${JSON.stringify(b.input)}`)
    else if (b.type === 'text' && b.text) console.log(`  ${label} text: ${b.text.slice(0, 1200)}`)
    else if (b.type === 'thinking' && b.thinking) console.log(`  ${label} thinking: ${b.thinking.replace(/\s+/g, ' ').slice(0, 600)}`)
  }
  return r
}) as typeof fetch

/** --photo: each file through the agent as the Worker runs it, printed step by step (see the top). */
async function photoMode(files: string[]) {
  const langs = await Promise.all(LANGS.map(async lang => ({ lang, pages: await loadAll({ root: join(ROOT, 'content'), lang, publicBuild: true }) })))
  const vi = langs.find(l => l.lang === 'vi')!.pages
  const catalog = buildCatalog(langs.map(l => ({ lang: l.lang, pages: l.pages, at: (p: string) => p })), p => p.url)
  const facts = new Map(buildFacts(catalog, vi, smallSrc, { gallery: id => vi.galleries[id] ?? [] }).map(f => [f.id, f] as [string, Facts]))
  const want = args.expect ? pageOfKey(catalog, args.expect) : undefined
  if (args.expect && !want) console.log(`--expect ${args.expect}: no page in the handbook by that name or id`)
  const { keys } = await loadKeys(await readFile(args.keys!, 'utf8').catch(() => ''))
  if (!keys.length) { console.error(`No key in ${args.keys}`); process.exit(1) }
  const store = memoryHealth()
  const tally = { runs: 0, top1: 0, top3: 0, usd: 0 }
  for (const file of files) {
    const data = await prepareFile(file, args.box)
    for (const model of MODELS) {
      for (let run = 1; run <= Number(args.runs); run++) {
        const label = `${file.split('/').pop()} #${run}`
        console.log(`\n${label}: ${model}, effort ${EFFORT}${args.box ? `, box ${args.box}` : ''}`)
        const t = Date.now()
        const a = await identifyWithAgent({
          healthy: await healthyKeys(keys, store, Date.now()), store, photo: { data, type: 'image/jpeg' }, model, lang: 'vi', fetch: tracing(label), effort: EFFORT,
          tools: { catalog, facts: async id => facts.get(id) },
          onStep: s => console.log(`  ${label} step: ${s.kind === 'search' ? `search "${s.query}"` : `open ${s.page.id}`}`),
        })
        const cost = costOf(model, a.spent)
        tally.runs++; tally.usd += cost
        console.log(`  ${label}: ${a.calls} calls, ${a.tools} tools, ${a.photos} reference photos, stopped ${a.stopped}${a.rechecked ? ', rechecked' : ''}, ${((Date.now() - t) / 1000).toFixed(1)} s, $${cost.toFixed(3)}`)
        if (!a.ok) { console.log(`  ${label}: failed (${a.reason})`); continue }
        const answer = readAnswer(a.message)
        if (answer.refused) { console.log(`  ${label}: refused`); continue }
        const results = matchGuesses(answer.id.guesses, catalog, 'vi')
        answer.id.guesses.forEach((g, i) => console.log(`  ${label} guess ${i + 1}: ${g.scientificName}${g.variety ? ` (${g.variety})` : ''} ${g.confidence.toFixed(2)} → ${results[i]?.page?.id ?? '—'}: ${g.reason}`))
        if (want) {
          const at = results.findIndex(r => r.page?.id === want.id)
          if (at === 0) tally.top1++
          if (at >= 0) tally.top3++
          console.log(`  ${label}: ${want.sci ?? want.id} ${at === 0 ? 'first' : at > 0 ? `guess ${at + 1}` : 'missed'}`)
        }
      }
    }
  }
  console.log(`\n${tally.runs} runs${want ? `, ${want.sci ?? want.id}: first in ${tally.top1}, top three in ${tally.top3}` : ''}, $${tally.usd.toFixed(2)} spent`)
}

async function main() {
  if (args.photo?.length) return photoMode(args.photo)
  const content = await loadAll({ root: join(ROOT, 'content'), lang: 'vi', publicBuild: true })
  const catalog = buildCatalog([{ lang: 'vi', pages: content, at: p => p }], p => p.url)
  const byId = new Map(catalog.entries.map(e => [e.id, e]))
  // The facts the build would write, with more photos a page, so leaving out the test photo's copies still leaves two.
  const facts = new Map(buildFacts(catalog, content, smallSrc, { gallery: id => content.galleries[id] ?? [], count: 6 }).map(f => [f.id, f] as [string, Facts]))
  // Every page photo by its own address and by the small copy the facts show; their dHashes.
  const photoBySrc = new Map<string, Photo>()
  for (const p of [...content.species, ...content.breeds, ...content.plants].flatMap(e => e.photos ?? []).concat(Object.values(content.galleries).flat())) { photoBySrc.set(p.url, p); photoBySrc.set(smallSrc(p), p) }
  const hashes = (await readJson<Record<string, string>>(join(ROOT, 'content/picture-hashes.json'))) ?? {}
  /** A reference photo the agent must not see for `sample`: the test photo, one from its source page, or a near-copy. */
  const leaks = (sample: Sample) => {
    const own = hashes[sample.url]
    return (src: string) => {
      if (src === sample.thumb || src === sample.url) return true
      const p = photoBySrc.get(src)
      if (!p) return false
      const h = hashes[p.url]
      return p.url === sample.url || (Boolean(sample.sourceUrl) && p.sourceUrl === sample.sourceUrl) || Boolean(own && h && hamming(own, h) <= NEAR_BITS)
    }
  }
  const samples = await pickPhotos(catalog)
  if (AGENT_MODES.length) {
    // How many test photos have copies in the reference photos besides their own small copy: what the leak check leaves out.
    const refs = [...facts.values()].flatMap(f => f.photos)
    const left = samples.map(s => { const leak = leaks(s); return refs.filter(r => r !== s.thumb && r !== s.url && leak(r)).length })
    console.log(`Leak check: ${left.filter(n => n > 0).length} of ${samples.length} test photos have other copies (same source page, or a near-copy): ${left.reduce((a, n) => a + n, 0)} reference photos left out for them; ${samples.filter(s => hashes[s.url]).length} test photos have a dHash`)
  }
  console.log(`${samples.length} photos: ${samples.filter(s => s.why === 'breed').length} breeds, ${samples.filter(s => s.why === 'popular').length} popular species, ${samples.filter(s => s.why === 'random').length} random (seed ${SEED})${DRY ? ', dry run' : ''}`)

  const { keys, bad } = DRY ? { keys: [{ key: 'dry-run-key-000', hash: 'dryrun00' }] as KeyEntry[], bad: 0 } : await loadKeys(await readFile(args.keys!, 'utf8').catch(() => ''))
  if (bad) console.log(`${bad} line(s) in the keys file aren't a key: skipped`)
  if (!keys.length) { console.error(`No key in ${args.keys} (one per line: <key> or <key> <workspaceId>). Use --dry-run to try the script without one.`); process.exit(1) }
  console.log(`${keys.length} key(s): ${keys.map(k => k.hash).join(', ')}`)
  const store = memoryHealth()

  const photos = new Map<string, Promise<string>>()
  const photoOf = (url: string) => photos.get(url) ?? photos.set(url, prepare(url)).get(url)!
  const results = new Map<string, Outcome[]>()
  for (const model of MODELS) {
    for (const mode of MODES) {
      const roll = rng(SEED * 1000 + MODELS.indexOf(model))
      const rolls = samples.map(() => roll())
      const outs = await pool(samples, Number(args.concurrency), async (sample, i): Promise<Outcome> => {
        const expected = byId.get(sample.id)!
        let data: string
        try { data = await photoOf(sample.url) } catch (e) { return { sample, failed: (e as Error).message } }
        const healthy = await healthyKeys(keys, store, Date.now())
        const fake = DRY ? fakeClaude(expected, expected.basedOn ? byId.get(expected.basedOn) : undefined, rolls[i]!) : undefined
        const t = Date.now()
        if (mode.turns) {
          const a = await identifyWithAgent({
            healthy, store, photo: { data, type: 'image/jpeg' }, model, lang: 'vi', fetch: fake, limits: { calls: mode.turns + 1 }, effort: EFFORT,
            tools: { catalog, facts: async id => facts.get(id), exclude: leaks(sample) },
          }).catch((e: Error) => e)
          const ms = Date.now() - t
          if (a instanceof Error) return { sample, ms, failed: a.message.slice(0, 60) }
          for (const x of a.attempts) if (x.status || x.marked) console.log(`  ${model} key ${x.hash}: ${x.status ?? 'network'}${x.marked ? ` → set aside (${x.marked})` : ''}`)
          const agent = { calls: a.calls, tools: a.tools, photos: a.photos, stopped: a.stopped, cacheRead: a.spent.cacheRead, input: a.spent.input + a.spent.cacheRead + a.spent.cacheWrite }
          const cost = costOf(model, a.spent)
          if (!a.ok) return { sample, ms, failed: a.reason, cost, agent }
          try {
            const answer = readAnswer(a.message)
            return { sample, ms, answer, cost, agent, results: answer.refused ? [] : matchGuesses(answer.id.guesses, catalog, 'vi') }
          } catch (e) {
            return { sample, ms, failed: (e as Error).message.slice(0, 60), cost, agent }
          }
        }
        const r = await rotate(healthy, store, (key, timeoutMs) => askClaude(key, { data, type: 'image/jpeg' }, { model, lang: 'vi', timeoutMs: Math.min(timeoutMs, 60_000), fetch: fake }), { budgetMs: 90_000 })
        const ms = Date.now() - t
        for (const a of r.attempts) if (a.status || a.marked) console.log(`  ${model} key ${a.hash}: ${a.status ?? 'network'}${a.marked ? ` → set aside (${a.marked})` : ''}`)
        if (!r.ok) return { sample, ms, failed: r.reason }
        try {
          const answer = readAnswer(r.value)
          const cost = costOf(model, answer.usage)
          return { sample, ms, answer, cost, results: answer.refused ? [] : matchGuesses(answer.id.guesses, catalog, 'vi') }
        } catch (e) {
          return { sample, ms, failed: (e as Error).message.slice(0, 60) }
        }
      })
      const name = mode.label ? `${model}, ${mode.label}` : model
      results.set(name, outs)
      const done = outs.filter(o => !o.failed)
      const spent = outs.reduce((a, o) => a + (o.cost ?? 0), 0)
      console.log(`${name}: ${done.length}/${outs.length} answered, top-1 ${pct(done.filter(o => o.results?.[0]?.page?.id === o.sample.id).length, outs.length)}, median ${(median(done.map(o => o.ms!)) / 1000).toFixed(1)} s, $${spent.toFixed(2)} spent`)
    }
  }
  await writeFile(OUT, report(results, samples, byId))
  console.log(`Written: ${OUT}`)
}

function report(results: Map<string, Outcome[]>, samples: Sample[], byId: Map<string, CatalogEntry>): string {
  const lines = [
    '# Fish ID: accuracy by model',
    '',
    `${DRY ? '**Dry run: a fake Claude, these numbers mean nothing.** ' : ''}${new Date().toISOString().slice(0, 10)}, \`packages/engine/scripts/fish-id-accuracy.ts\`, seed ${SEED}. The tool's own prompt, schema and matching (\`apps/site/worker/fishid/\`).`,
    '',
    `${samples.length} photos with a known answer, one per page (photo check: shows the page's fish, typically): ${samples.filter(s => s.why === 'breed').length} breeds, ${samples.filter(s => s.why === 'popular').length} popular species, ${samples.filter(s => s.why === 'random').length} species at random. Each shrunk to 1024 px JPEG, as the page sends a reader's photo.`,
    '',
    '- **Top-1 / top-3:** the right page is the first guess\'s / one of the guesses\' (a breed\'s page for a breed).',
    '- **Breed\'s species:** for breed photos, the guess named the species the breed is a form of, or the breed.',
    '- **Not a fish / can\'t tell:** verdicts "other" and "unclear" (refusals counted as can\'t tell), on photos that all show a fish.',
    '- **Cost:** response usage × list price (models.md and prompt-caching.md, 2026-11; the agent\'s cache reads and writes at theirs), every call of every photo, per 1,000 photos.',
    '- **Latency:** from the first call to the answer, on this machine (the agent\'s tools read content/ here, the Worker\'s its assets).',
    ...(AGENT_MODES.length ? ['- **Agent:** the agent the Worker runs with `FISH_ID_AGENT` on (apps/site/worker/fishid/agent.ts), its tools over content/, never shown the test photo as a reference photo, nor one from the same source page, nor a near-copy (dHash within 10 bits). *Calls · tools · photos*: per photo, on average. *Stopped*: how many answered when Claude chose / were forced by the calls, tool-call, time or token limit / fell back to today\'s single call.'] : []),
    '',
    '| Run | Answered | Top-1 | Top-3 | Breed\'s species | Not a fish | Can\'t tell | Failed | Median latency | p95 latency | Cost / 1,000 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  const p95 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]! : NaN }
  for (const [model, outs] of results) {
    const done = outs.filter(o => !o.failed)
    const top1 = outs.filter(o => o.results?.[0]?.page?.id === o.sample.id).length
    const top3 = outs.filter(o => o.results?.some(r => r.page?.id === o.sample.id)).length
    const breeds = outs.filter(o => o.sample.kind === 'breed')
    const base = (id: string) => byId.get(id)?.basedOn
    const breedSpecies = breeds.filter(o => o.results?.some(r => r.page?.id === o.sample.id || (r.species ?? r.page)?.id === base(o.sample.id))).length
    const other = done.filter(o => !o.answer?.refused && o.answer?.id.verdict === 'other').length
    const unclear = done.filter(o => o.answer?.refused || o.answer?.id.verdict === 'unclear').length
    const costs = outs.map(o => o.cost).filter((c): c is number => c !== undefined)
    const per1000 = costs.length ? `$${((costs.reduce((a, b) => a + b, 0) / outs.length) * 1000).toFixed(2)}` : '–'
    const timed = outs.filter(o => o.ms !== undefined).map(o => o.ms!)
    lines.push(`| ${model} | ${done.length}/${outs.length} | ${pct(top1, outs.length)} | ${pct(top3, outs.length)} | ${breeds.length ? pct(breedSpecies, breeds.length) : '–'} | ${pct(other, done.length)} | ${pct(unclear, done.length)} | ${outs.length - done.length} | ${(median(done.map(o => o.ms!)) / 1000).toFixed(1)} s | ${(p95(timed) / 1000).toFixed(1)} s | ${per1000} |`)
  }
  const agents = [...results].filter(([, outs]) => outs.some(o => o.agent))
  if (agents.length) {
    lines.push('', '## The agent', '', '| Run | Calls · tools · photos | Stopped: answer / calls / tools / time / tokens / fallback | Input read from cache | Top-1 against today\'s call: fixed / broken |', '| --- | ---: | --- | ---: | ---: |')
    const top1 = (o: Outcome | undefined) => o?.results?.[0]?.page?.id === o?.sample.id
    for (const [name, outs] of agents) {
      const a = outs.flatMap(o => (o.agent ? [o.agent] : []))
      const mean = (f: (x: (typeof a)[number]) => number) => (a.reduce((t, x) => t + f(x), 0) / Math.max(1, a.length)).toFixed(1)
      const stops = (['answer', 'calls', 'tools', 'time', 'tokens', 'fallback'] as const).map(k => a.filter(x => x.stopped === k).length).join(' / ')
      const read = a.reduce((t, x) => t + x.cacheRead, 0) / Math.max(1, a.reduce((t, x) => t + x.input, 0))
      const single = results.get(name.split(', ')[0]!)
      const fixed = single ? outs.filter((o, i) => top1(o) && !top1(single[i])).length : 0
      const broken = single ? outs.filter((o, i) => !top1(o) && top1(single[i])).length : 0
      lines.push(`| ${name} | ${mean(x => x.calls)} · ${mean(x => x.tools)} · ${mean(x => x.photos)} | ${stops} | ${(100 * read).toFixed(0)}% | ${single ? `${fixed} / ${broken}` : '–'} |`)
    }
  }
  for (const [model, outs] of results) {
    // The worst: misses Claude was surest of first, then the photos it couldn't name.
    const misses = outs.filter(o => !o.failed && o.results?.[0]?.page?.id !== o.sample.id)
      .sort((a, b) => (b.results?.[0]?.confidence ?? -1) - (a.results?.[0]?.confidence ?? -1)).slice(0, 20)
    lines.push('', `## ${model}: the 20 worst misses`, '')
    if (!misses.length) { lines.push('None.'); continue }
    lines.push('| Page | Photo | Its answer | Top guess | Sure | Linked to |', '| --- | --- | --- | --- | ---: | --- |')
    for (const o of misses) {
      const e = byId.get(o.sample.id)!
      const g = o.results?.[0]
      const verdict = o.answer?.refused ? 'refused' : o.answer?.id.verdict ?? ''
      lines.push(`| [${cell(e.name.vi)}](https://aquatome.com${e.url.vi.replace(/^\/vi\//, '/')}) | [photo](${o.sample.url}) | ${cell(e.sci ?? (e.basedOn ? `breed of ${byId.get(e.basedOn)?.sci ?? e.basedOn}` : 'breed'))} | ${g ? cell(`${g.scientificName}${g.variety ? ` (${g.variety})` : ''}`) : `— (${verdict})`} | ${g ? g.confidence.toFixed(2) : ''} | ${cell(g?.page?.id ?? (g?.sameGenus ? 'same genus only' : '—'))} |`)
    }
  }
  const failed = [...results].flatMap(([model, outs]) => outs.filter(o => o.failed).map(o => `${model}: ${o.sample.id} (${o.failed})`))
  if (failed.length) lines.push('', '## Failed calls', '', ...failed.slice(0, 50).map(f => `- ${f}`))
  return `${lines.join('\n')}\n`
}

await main()
