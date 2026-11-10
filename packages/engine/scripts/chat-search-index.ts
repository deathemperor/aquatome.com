/**
 * Keeps the chat's section search (apps/site/worker/chat/section-search.ts) in step with the live handbook: every section
 * in the languages the chat hands sections over in (handover.ts `SEARCHED`), embedded and written to the Vectorize index, a
 * namespace a language. Runs after each deploy (.github/workflows/chat-search.yml). A record of what it wrote
 * (`written-<index>-<lang>.json` in --cache) means a run embeds and writes only the sections new or changed since, and
 * removes those the handbook no longer has; with no record it writes them all.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-search-index.ts [--create] [--site <url>]
 *
 * The Cloudflare token (Workers AI: Read, Vectorize: Edit) is read from --token, a file, never printed; the account from --account.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { SEARCHED } from '../../../apps/site/worker/chat/handover'
import { batchesOf, changesOf, deleteBodies, docsOf, hash, liveSource, steady, vectors, type Embedder } from './chat-search-lib'
import { pool } from './eval-lib'

const { values: args } = parseArgs({
  options: {
    site: { type: 'string', default: 'https://aquatome.com' },
    index: { type: 'string', default: 'aquatome-chat-sections' },
    create: { type: 'boolean', default: false },
    token: { type: 'string', default: join(homedir(), '.config/aquatome/cf-ai-token') },
    account: { type: 'string', default: join(homedir(), '.config/aquatome/cf-account') },
    model: { type: 'string', default: '@cf/baai/bge-m3' },
    chars: { type: 'string', default: '2000' },
    cache: { type: 'string', default: join(homedir(), '.cache/aquatome/evals/search') },
  },
})
const BATCH = 1000
const DIMENSIONS = 1024

async function main() {
  const e: Embedder = { token: (await readFile(args.token!, 'utf8')).trim(), account: (await readFile(args.account!, 'utf8')).trim(), model: args.model!, cache: args.cache! }
  const api = `https://api.cloudflare.com/client/v4/accounts/${e.account}/vectorize/v2/indexes`
  const call = async (url: string, body: string, type: string) => {
    const r = await steady()(url, { method: 'POST', headers: { authorization: `Bearer ${e.token}`, 'content-type': type }, body })
    const j = await r.json().catch(() => null) as { success?: boolean; errors?: unknown } | null
    if (!j?.success) throw new Error(`${r.status} ${JSON.stringify(j?.errors ?? null)}`)
  }
  await mkdir(args.cache!, { recursive: true })
  if (args.create) await call(api, JSON.stringify({ name: args.index, description: 'The chat\'s handbook sections, one namespace a language', config: { dimensions: DIMENSIONS, metric: 'cosine' } }), 'application/json')
  for (const lang of SEARCHED) {
    const { docs } = await docsOf(liveSource(args.site!), lang, Number(args.chars))
    const byId = new Map(docs.map(d => [createHash('sha256').update(`${lang}:${d.path}#${d.heading ?? ''}`).digest('hex').slice(0, 32), d]))
    const wanted = Object.fromEntries([...byId].map(([id, d]) => [id, hash(`${e.model}\n${d.text}`)]))
    const record = join(args.cache!, `written-${args.index}-${lang}.json`)
    const { write, gone } = changesOf(JSON.parse(await readFile(record, 'utf8').catch(() => '{}')) as Record<string, string>, wanted)
    const v = await vectors(e, `docs-${lang}`, write.map(id => byId.get(id)!.text))
    const lines = write.map((id, i) => {
      const d = byId.get(id)!
      return JSON.stringify({ id, namespace: lang, values: Array.from(v[i]!), metadata: { path: d.path, ...(d.heading ? { heading: d.heading } : {}) } })
    })
    await pool(batchesOf(lines, BATCH).map(b => () => call(`${api}/${args.index}/upsert`, b.join('\n'), 'application/x-ndjson')), 4)
    await pool(deleteBodies(gone).map(body => () => call(`${api}/${args.index}/delete_by_ids`, body, 'application/json')), 4)
    await writeFile(record, JSON.stringify(wanted))
    console.log(`${lang}: ${byId.size} sections, ${write.length} written, ${gone.length} removed`)
  }
}

await main()
