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
import { loadAll } from '@aq/schema'
import { askClaude, costOf, readAnswer, type Answer } from '../../../apps/site/worker/fishid/claude'
import { buildCatalog, type Catalog, type CatalogEntry } from '../../../apps/site/worker/fishid/catalog'
import { healthyKeys, loadKeys, memoryHealth, rotate, type KeyEntry } from '../../../apps/site/worker/fishid/keys'
import { matchGuesses, type Result } from '../../../apps/site/worker/fishid/match'
import { JPEG_QUALITY, MAX_SIDE } from '../../../apps/site/worker/fishid/photo'
import { popularityOrder } from '../src/depth'
import { popularFirst } from '../src/shops'

const ROOT = join(import.meta.dirname, '../../..')
const { values: args } = parseArgs({
  options: {
    models: { type: 'string', default: 'claude-haiku-5-5,claude-sonnet-5-5,claude-opus-5-5' },
    n: { type: 'string', default: '200' },
    seed: { type: 'string', default: '1' },
    concurrency: { type: 'string', default: '4' },
    keys: { type: 'string', default: join(homedir(), '.config/aquatome/anthropic-keys') },
    out: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
})
const DRY = args['dry-run']
const MODELS = args.models!.split(',').map(s => s.trim()).filter(Boolean)
const N = Number(args.n)
const SEED = Number(args.seed)
const OUT = args.out ?? (DRY ? '/tmp/fish-id-accuracy.dry-run.md' : join(ROOT, 'docs/review/fish-id-accuracy.md'))

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

type Sample = { id: string; kind: 'species' | 'breed'; url: string; why: 'breed' | 'popular' | 'random' }
type Verdicts = Record<string, Record<string, { ok?: string; typical?: boolean }>>

/** One typical photo per page, as described at the top. */
async function pickPhotos(catalog: Catalog): Promise<Sample[]> {
  const verdicts = (await readJson<Verdicts>(join(ROOT, 'engine-state/_photo-subjects.json'))) ?? {}
  const random = rng(SEED)
  const pages = new Map<string, Sample>()
  for (const kind of ['species', 'breeds'] as const) {
    for (const id of (await readdir(join(ROOT, 'content', kind)).catch(() => [] as string[])).sort()) {
      if (!catalog.entries.some(e => e.id === id)) continue
      const entity = await readJson<{ photos?: { url: string }[] }>(join(ROOT, 'content', kind, id, 'entity.json'))
      const gallery = await readJson<{ photos?: { url: string }[] }>(join(ROOT, 'content/gallery', `${id}.json`))
      const urls = [...new Set([...(entity?.photos ?? []), ...(gallery?.photos ?? [])].map(p => p.url))]
      const good = urls.filter(u => verdicts[u]?.[id]?.ok === 'yes' && verdicts[u]?.[id]?.typical === true)
      if (good.length) pages.set(id, { id, kind: kind === 'species' ? 'species' : 'breed', url: good[Math.floor(random() * good.length)]!, why: 'random' })
    }
  }
  const out: Sample[] = []
  const take = (s: Sample, why: Sample['why']) => { if (out.length < N && pages.delete(s.id)) out.push({ ...s, why }) }
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
 * second, sometimes wrong, unclear or refused, so every column of the report gets numbers.
 */
function fakeClaude(expected: CatalogEntry, base: CatalogEntry | undefined, roll: number): typeof fetch {
  const english = (expected.name.vi.match(/\(([^)]+)\)\s*$/)?.[1] ?? expected.name.vi)
  const right = { scientificName: (expected.sci ?? base?.sci) ?? 'Hybrid', commonName: expected.kind === 'breed' ? english : 'Fish', variety: null, confidence: 0.85, reason: 'Hình dáng và màu sắc khớp.' }
  const wrong = { scientificName: 'Danio rerio', commonName: 'Zebrafish', variety: null, confidence: 0.6, reason: 'Sọc ngang.' }
  const answer = roll < 0.65 ? { verdict: 'fish', guesses: [right] } : roll < 0.8 ? { verdict: 'fish', guesses: [wrong, { ...right, confidence: 0.3 }] } : roll < 0.9 ? { verdict: 'fish', guesses: [wrong] } : roll < 0.95 ? { verdict: 'unclear', guesses: [] } : null
  return (async () => {
    await new Promise(r => setTimeout(r, 5))
    return Response.json({
      id: 'msg_dry', type: 'message', role: 'assistant', model: 'dry-run', stop_sequence: null,
      stop_reason: answer ? 'end_turn' : 'refusal', content: [{ type: 'text', text: answer ? JSON.stringify(answer) : 'No.' }],
      usage: { input_tokens: 1700, output_tokens: 160 },
    })
  }) as typeof fetch
}

type Outcome = { sample: Sample; ms?: number; answer?: Answer; results?: Result[]; failed?: string; cost?: number }
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!, i) } }))
  return out
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : NaN }
const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–')
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

async function main() {
  const content = await loadAll({ root: join(ROOT, 'content'), lang: 'vi', publicBuild: true })
  const catalog = buildCatalog([{ lang: 'vi', pages: content, at: p => p }], p => p.url)
  const byId = new Map(catalog.entries.map(e => [e.id, e]))
  const samples = await pickPhotos(catalog)
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
    const roll = rng(SEED * 1000 + MODELS.indexOf(model))
    const rolls = samples.map(() => roll())
    const outs = await pool(samples, Number(args.concurrency), async (sample, i): Promise<Outcome> => {
      const expected = byId.get(sample.id)!
      let data: string
      try { data = await photoOf(sample.url) } catch (e) { return { sample, failed: (e as Error).message } }
      const healthy = await healthyKeys(keys, store, Date.now())
      const fake = DRY ? fakeClaude(expected, expected.basedOn ? byId.get(expected.basedOn) : undefined, rolls[i]!) : undefined
      const t = Date.now()
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
    results.set(model, outs)
    const done = outs.filter(o => !o.failed)
    console.log(`${model}: ${done.length}/${outs.length} answered, top-1 ${pct(done.filter(o => o.results?.[0]?.page?.id === o.sample.id).length, outs.length)}`)
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
    '- **Cost:** response usage × list price (models.md, 2026-11), per 1,000 photos.',
    '',
    '| Model | Answered | Top-1 | Top-3 | Breed\'s species | Not a fish | Can\'t tell | Failed | Median latency | Cost / 1,000 |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const [model, outs] of results) {
    const done = outs.filter(o => !o.failed)
    const top1 = outs.filter(o => o.results?.[0]?.page?.id === o.sample.id).length
    const top3 = outs.filter(o => o.results?.some(r => r.page?.id === o.sample.id)).length
    const breeds = outs.filter(o => o.sample.kind === 'breed')
    const base = (id: string) => byId.get(id)?.basedOn
    const breedSpecies = breeds.filter(o => o.results?.some(r => r.page?.id === o.sample.id || (r.species ?? r.page)?.id === base(o.sample.id))).length
    const other = done.filter(o => !o.answer?.refused && o.answer?.id.verdict === 'other').length
    const unclear = done.filter(o => o.answer?.refused || o.answer?.id.verdict === 'unclear').length
    const costs = done.map(o => o.cost).filter((c): c is number => c !== undefined)
    const per1000 = costs.length ? `$${((costs.reduce((a, b) => a + b, 0) / costs.length) * 1000).toFixed(2)}` : '–'
    lines.push(`| ${model} | ${done.length}/${outs.length} | ${pct(top1, outs.length)} | ${pct(top3, outs.length)} | ${breeds.length ? pct(breedSpecies, breeds.length) : '–'} | ${pct(other, done.length)} | ${pct(unclear, done.length)} | ${outs.length - done.length} | ${(median(done.map(o => o.ms!)) / 1000).toFixed(1)} s | ${per1000} |`)
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
      lines.push(`| [${cell(e.name.vi)}](https://aquatome.com${e.url.vi}) | [photo](${o.sample.url}) | ${cell(e.sci ?? (e.basedOn ? `breed of ${byId.get(e.basedOn)?.sci ?? e.basedOn}` : 'breed'))} | ${g ? cell(`${g.scientificName}${g.variety ? ` (${g.variety})` : ''}`) : `— (${verdict})`} | ${g ? g.confidence.toFixed(2) : ''} | ${cell(g?.page?.id ?? (g?.sameGenus ? 'same genus only' : '—'))} |`)
    }
  }
  const failed = [...results].flatMap(([model, outs]) => outs.filter(o => o.failed).map(o => `${model}: ${o.sample.id} (${o.failed})`))
  if (failed.length) lines.push('', '## Failed calls', '', ...failed.slice(0, 50).map(f => `- ${f}`))
  return `${lines.join('\n')}\n`
}

await main()
