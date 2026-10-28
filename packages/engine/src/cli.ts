import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { SOURCE_IDS, type SourceId } from '@aq/schema'
import { claudeCli } from './claude'
import { ChromeFetcher } from './fetch'
import { r2Media } from './media'
import { httpAdmin, moderate } from './moderate'
import { runEngine } from './run'
import { loadState } from './state'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const UA = 'thuysinh-engine/0.1 (https://thuysinh.infinitus.run)'
const http = async (url: string) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${new URL(url).host}`)
  return r.json()
}

/** Media bucket credentials: env, else the owner's ~/.config/thuysinh files (never printed). */
const conf = (env: string, file: string) => process.env[env] ?? readFileSync(join(homedir(), '.config/thuysinh', file), 'utf8').trim()
const media = () => r2Media({
  accountId: conf('CF_ACCOUNT_ID', 'cf-account'), token: conf('CLOUDFLARE_API_TOKEN', 'cf-token'),
  bucket: process.env.MEDIA_BUCKET ?? 'thuysinh-media', publicBase: process.env.MEDIA_BASE ?? 'https://media.thuysinh.infinitus.run',
})

const { positionals, values } = parseArgs({ allowPositionals: true, options: { sources: { type: 'string' }, limit: { type: 'string' }, 'max-minutes': { type: 'string' }, only: { type: 'string' }, 'retry-blocked': { type: 'boolean' } } })
const cmd = positionals[0]

if (cmd === 'run') {
  const sources = values.sources?.split(',').map(s => s.trim()) as SourceId[] | undefined
  const bad = sources?.filter(s => !(SOURCE_IDS as readonly string[]).includes(s))
  if (bad?.length) throw new Error(`unknown source(s): ${bad.join(', ')}`)
  const profileDir = process.env.ENGINE_PROFILE ?? join(homedir(), '.cache/thuysinh/chrome-profile')
  const fetcher = new ChromeFetcher({ profileDir })
  const startedAt = new Date().toISOString()
  await fetcher.open()
  try {
    const report = await runEngine(
      { fetcher, llm: claudeCli, http, media: media(), root: ROOT, now: () => new Date(), sleep: ms => new Promise(r => setTimeout(r, ms)) },
      { sources, limit: values.limit ? Number(values.limit) : undefined, maxMinutes: values['max-minutes'] ? Number(values['max-minutes']) : undefined, only: values.only ? new RegExp(values.only) : undefined, retryBlocked: values['retry-blocked'] },
    )
    await mkdir(join(ROOT, 'engine-state'), { recursive: true })
    await writeFile(join(ROOT, 'engine-state/last-run.json'), `${JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), ...report }, null, 2)}\n`)
    console.table(report.perSource)
    if (report.needsHuman.length) console.log(`needs-human: ${report.needsHuman.join(', ')} — pass the browser check in the engine Chrome profile, then: pnpm engine run --sources <id> --retry-blocked`)
    for (const e of report.errors) console.log(`error: ${e}`)
    console.log(`changed: ${report.changed.length}`)
  } finally {
    await fetcher.close()
  }
} else if (cmd === 'moderate') {
  const base = process.env.SITE_URL ?? 'https://thuysinh.infinitus.run'
  const r = await moderate(httpAdmin(base, conf('AB_DASH_TOKEN', 'ab-dash-token')), claudeCli)
  console.log(r.off ? 'comments are off (no D1 yet) — nothing to moderate' : `moderated: ${r.queued} queued, ${r.applied} applied, ${r.ignored} ignored, ${r.failedBatches} failed batches`)
  if (!r.off && r.failedBatches) process.exitCode = 1
} else if (cmd === 'status') {
  const rows: Record<string, Record<string, number>> = {}
  for (const id of SOURCE_IDS) {
    const counts: Record<string, number> = {}
    for (const s of Object.values(await loadState(ROOT, id))) counts[s.status] = (counts[s.status] ?? 0) + 1
    rows[id] = counts
  }
  console.table(rows)
} else {
  console.log('usage: pnpm engine run [--sources a,b] [--limit N] [--max-minutes M] [--only <url regex>] [--retry-blocked] | pnpm engine moderate | pnpm engine status')
  process.exitCode = 1
}
