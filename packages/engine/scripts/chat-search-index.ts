/**
 * Fills the chat's section search (apps/site/worker/chat/section-search.ts): every handbook section in the languages the
 * chat hands sections over in (handover.ts `SEARCHED`), embedded and written to the Vectorize index, a namespace a
 * language. A section's text is read from the handbook when it's handed over, so one that changed still reads right; a
 * section added since is found once this runs again.
 *
 *   pnpm --filter @aq/engine exec tsx scripts/chat-search-index.ts [--create] [--site <a chat-speed.ts build folder>]
 *
 * The Cloudflare token (Workers AI: Read, Vectorize: Edit) is read from --token, a file, never printed; the account from --account.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'
import { SEARCHED } from '../../../apps/site/worker/chat/handover'
import { docsOf, latestBuild, siteSource, vectors, type Embedder } from './chat-search-lib'
import { pool } from './eval-lib'

const { values: args } = parseArgs({
  options: {
    site: { type: 'string' },
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
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${e.token}`, 'content-type': type }, body })
    const j = await r.json().catch(() => null) as { success?: boolean; errors?: unknown } | null
    if (!j?.success) throw new Error(`${r.status} ${JSON.stringify(j?.errors ?? null)}`)
  }
  await mkdir(args.cache!, { recursive: true })
  if (args.create) await call(api, JSON.stringify({ name: args.index, description: 'The chat\'s handbook sections, one namespace a language', config: { dimensions: DIMENSIONS, metric: 'cosine' } }), 'application/json')
  const dir = args.site ?? await latestBuild()
  console.log(`Handbook: ${basename(dir)}`)
  const source = siteSource(dir)
  for (const lang of SEARCHED) {
    const { docs } = await docsOf(source, lang, Number(args.chars))
    const v = await vectors(e, `docs-${lang}`, docs.map(d => d.text))
    const lines = docs.map((d, i) => JSON.stringify({
      id: createHash('sha256').update(`${lang}:${d.path}#${d.heading ?? ''}`).digest('hex').slice(0, 32),
      namespace: lang, values: Array.from(v[i]!), metadata: { path: d.path, ...(d.heading ? { heading: d.heading } : {}) },
    }))
    const batches: string[][] = []
    for (let i = 0; i < lines.length; i += BATCH) batches.push(lines.slice(i, i + BATCH))
    await pool(batches.map(b => () => call(`${api}/${args.index}/upsert`, b.join('\n'), 'application/x-ndjson')), 4)
    console.log(`${lang}: ${lines.length} sections written`)
  }
}

await main()
