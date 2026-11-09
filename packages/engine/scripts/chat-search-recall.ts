/**
 * How often a search by meaning finds what the chat reads: every handbook section embedded (Workers AI, bge-m3, as the
 * Worker would), each question of a chat-speed.ts run embedded the same way, and the sections nearest each question
 * held against the ones Claude opened with read_page in that run. Offline: nothing here is on the site.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-search-recall.ts --run ~/.cache/aquatome/evals/speed/<run> [--give 5]
 *
 * The Cloudflare token (Workers AI: Read) is read from --token, a file (~/.config/aquatome/cf-ai-token); the account from --account. Vectors are kept in
 * ~/.cache/aquatome/evals/search/, under the text embedded.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import type { Lang } from '../../../apps/site/worker/chat/handbook'
import { docsOf, latestBuild, siteSource, vectors, type Embedder } from './chat-search-lib'
import { CONDITIONS, type HardQuestion } from './chat-vs-plain-lib'

const { values: args } = parseArgs({
  options: {
    run: { type: 'string' },
    site: { type: 'string' },
    hard: { type: 'string', default: join(import.meta.dirname, 'hard-questions.vi.json') },
    everyday: { type: 'string', default: join(import.meta.dirname, 'everyday-questions.json') },
    token: { type: 'string', default: join(homedir(), '.config/aquatome/cf-ai-token') },
    account: { type: 'string', default: join(homedir(), '.config/aquatome/cf-account') },
    model: { type: 'string', default: '@cf/baai/bge-m3' },
    chars: { type: 'string', default: '2000' },
    k: { type: 'string', default: '3,5,8,12,20' },
    // `--give 5`: also write each question's nearest five sections as a run's reads, for chat-speed.ts `--given`.
    give: { type: 'string' },
    cache: { type: 'string', default: join(homedir(), '.cache/aquatome/evals/search') },
  },
})

type Turn = { id: string; set: string; lang: Lang; calls: { asked?: string[] }[] }
const dot = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!; return s }

async function main() {
  if (!args.run || !args.token) throw new Error('--run: a chat-speed.ts run; --token: a file holding a Cloudflare token for Workers AI')
  const e: Embedder = { token: (await readFile(args.token, 'utf8')).trim(), account: (await readFile(args.account!, 'utf8')).trim(), model: args.model!, cache: args.cache! }
  const dir = args.site ?? await latestBuild()
  const source = siteSource(dir)
  console.log(`Handbook: ${basename(dir)}`)
  await mkdir(args.cache!, { recursive: true })

  const turns = JSON.parse(await readFile(join(args.run, 'turns.json'), 'utf8')) as Turn[]
  const asked = new Map<string, string>()
  for (const q of JSON.parse(await readFile(args.hard!, 'utf8')) as HardQuestion[]) for (const c of CONDITIONS) asked.set(`${q.id}-${c}`, c === 'post' ? q.post : q.short)
  // Where a chat was opened from (a species page, fish ID): the fish it is about.
  const about = new Map<string, string>()
  for (const q of JSON.parse(await readFile(args.everyday!, 'utf8')) as { id: string; q: string; start?: { about?: string } }[]) {
    asked.set(q.id, q.q)
    if (q.start?.about) about.set(q.id, q.start.about)
  }
  const ks = args.k!.split(',').map(Number)
  const give = Number(args.give ?? 0)
  const given: { id: string; calls: { asked: string[] }[] }[] = []
  /** Each handed section's closeness to its question, and whether Claude read its page in the run. */
  const scores: { lang: string; score: number; read: boolean }[] = []

  for (const lang of [...new Set(turns.map(t => t.lang))]) {
    const { docs, hb } = await docsOf(source, lang, Number(args.chars))
    // The search's words: the question, after the name of the fish the chat is about when it was opened from one.
    const startOf = (id: string) => (about.has(id) ? hb.byId(about.get(id)!) : undefined)
    const query = (id: string) => { const i = startOf(id); return i ? `${i.name}${i.sub ? ` (${i.sub})` : ''}: ${asked.get(id)!}` : asked.get(id)! }
    const dv = await vectors(e, `docs-${lang}`, docs.map(d => d.text))
    const mine = turns.filter(t => t.lang === lang && asked.has(t.id))
    const qv = await vectors(e, `questions-${lang}`, mine.map(t => query(t.id)))
    const rows: { id: string; set: string; sections: number[]; pages: number[]; gold: number; goldPages: number }[] = []
    mine.forEach((t, n) => {
      const reads = t.calls.flatMap(c => c.asked ?? []).filter(a => a.startsWith('read_page ')).map(a => JSON.parse(a.slice('read_page '.length)) as { path: string; heading: string | null })
      const gold = new Set(reads.filter(r => r.heading).map(r => `${r.path}#${r.heading}`))
      const goldPages = new Set(reads.map(r => r.path))
      const scored = dv.map((v, i) => [dot(v, qv[n]!), i] as const).sort((a, b) => b[0] - a[0]).slice(0, Math.max(...ks, give))
      const ranked = scored.map(([, i]) => docs[i]!)
      scores.push(...scored.slice(0, give || 5).map(([sc, i]) => ({ lang, score: sc, read: goldPages.has(docs[i]!.path) })))
      // And that fish's page (its outline), as Claude reads first when the chat starts from it.
      const start = startOf(t.id)
      const handed = [...(start ? [{ path: start.path, heading: null }] : []), ...ranked.slice(0, give).map(d => ({ path: d.path, heading: d.heading }))]
      if (give) given.push({ id: t.id, calls: [{ asked: handed.map(r => `read_page ${JSON.stringify(r)}`) }] })
      if (!goldPages.size) return
      rows.push({
        id: t.id, set: t.set, gold: gold.size, goldPages: goldPages.size,
        sections: ks.map(k => ranked.slice(0, k).filter(d => gold.has(`${d.path}#${d.heading}`)).length),
        pages: ks.map(k => new Set(ranked.slice(0, k).map(d => d.path).filter(p => goldPages.has(p))).size),
      })
    })
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const pct = (a: number, b: number) => `${Math.round((100 * a) / (b || 1))}%`
    console.log(`\n${lang}: ${docs.length} sections, ${rows.length} turns that read a page`)
    for (const set of [...new Set(rows.map(r => r.set))]) {
      const rs = rows.filter(r => r.set === set)
      console.log(`  ${set} (${rs.length} turns; ${sum(rs.map(r => r.gold))} sections read, ${sum(rs.map(r => r.goldPages))} pages)`)
      ks.forEach((k, i) => {
        const anyPage = rs.filter(r => r.pages[i]! > 0).length
        console.log(`    top ${String(k).padStart(2)}: sections read found ${pct(sum(rs.map(r => r.sections[i]!)), sum(rs.map(r => r.gold)))}, pages read found ${pct(sum(rs.map(r => r.pages[i]!)), sum(rs.map(r => r.goldPages)))}, turns with at least one page read found ${pct(anyPage, rs.length)}`)
      })
    }
    await writeFile(join(args.cache!, `recall-${lang}.json`), JSON.stringify(rows, null, 1))
  }
  await writeFile(join(args.cache!, 'scores.json'), JSON.stringify(scores))
  if (give) {
    const out = join(args.cache!, `given-top${give}-start`)
    await mkdir(out, { recursive: true })
    await writeFile(join(out, 'turns.json'), JSON.stringify(given))
    console.log(`\nEach question's nearest ${give} sections, as reads: ${out}`)
  }
}

await main()
