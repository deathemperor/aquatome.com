// One-time: the dashboard's content totals for the days before the daily snapshot existed (worker/admin/content.ts
// recordSnapshot), from git history. Needs a full clone: the deploy's checkout is shallow. For each UTC day from the first
// commit to yesterday, the last commit of that day: its content/ (git archive), counted by content-stats.ts as a public
// build counts it. Built pages per language are unknown for past days (null). It writes nothing anywhere: it prints the
// entries for `wrangler kv bulk put`, and on stderr the command to load them.
//   node scripts/content-backfill.ts [ref, default origin/main] > backfill.json
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keepTotals, type KeptTotals, type Totals } from '../worker/admin/content-shape.ts'
import { computeContentStats } from './content-stats.ts'

const SNAPSHOT_PREFIX = 'stats:' // worker/admin/content.ts SNAPSHOT_PREFIX
const METADATA_MAX = 1024

export type BulkEntry = { key: string; value: string; metadata?: KeptTotals }

/** Each past day's totals, oldest first, from `ref` in the git repository at `repo`; `today` (UTC) and later are left to the cron. */
export function backfill(repo: string, ref: string, today: string): { day: string; sha: string; totals: Totals }[] {
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 }).trim()
  const first = git('log', '--reverse', '--format=%cI', ref).split('\n')[0]
  if (!first) return []
  const out: { day: string; sha: string; totals: Totals }[] = []
  for (let d = new Date(`${new Date(first).toISOString().slice(0, 10)}T00:00:00Z`); d.toISOString().slice(0, 10) < today; d = new Date(d.getTime() + 86_400_000)) {
    const day = d.toISOString().slice(0, 10)
    const sha = git('rev-list', '-1', `--before=${day}T23:59:59Z`, ref)
    if (!/^[0-9a-f]{40}$/.test(sha)) continue
    try { git('cat-file', '-e', `${sha}:content`) } catch { continue } // before content/ existed
    const tmp = mkdtempSync(join(tmpdir(), 'aq-backfill-'))
    try {
      execFileSync('sh', ['-c', `git -C "$1" archive "$2" content | tar -x -C "$3"`, 'sh', repo, sha, tmp], { stdio: ['ignore', 'ignore', 'inherit'] })
      out.push({ day, sha, totals: computeContentStats({ contentRoot: join(tmp, 'content'), publicBuild: true, now: d }).totals })
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  return out
}

/** `wrangler kv bulk put` entries: the kept totals as the value, and as metadata when they fit (as recordSnapshot stores them). */
export const bulkEntries = (days: { day: string; totals: Totals }[]): BulkEntry[] => days.map(({ day, totals }) => {
  const kept = keepTotals(totals)
  const value = JSON.stringify(kept)
  return { key: `${SNAPSHOT_PREFIX}${day}`, value, ...(Buffer.byteLength(value) <= METADATA_MAX ? { metadata: kept } : {}) }
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = fileURLToPath(new URL('../../..', import.meta.url))
  if (execFileSync('git', ['-C', repo, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() === 'true') {
    console.error('content-backfill: this clone is shallow; run `git fetch --unshallow` first')
    process.exit(1)
  }
  const ref = process.argv[2] ?? 'origin/main'
  const days = backfill(repo, ref, new Date().toISOString().slice(0, 10))
  for (const d of days) console.error(`${d.day} ${d.sha.slice(0, 8)} ${Object.entries(d.totals.kinds).map(([k, n]) => `${k} ${n.vi}`).join(', ')}`)
  process.stdout.write(`${JSON.stringify(bulkEntries(days), null, 1)}\n`)
  console.error(`\n${days.length} days. To load them (production KV, the owner's call):\n  pnpm exec wrangler kv bulk put backfill.json --binding AB --remote`)
}
