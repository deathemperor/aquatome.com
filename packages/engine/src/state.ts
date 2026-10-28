import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SourceId } from '@aq/schema'

export type UrlState = {
  lastmod?: string
  hash?: string
  processedHash?: string
  status: 'new' | 'fetched' | 'processed' | 'skipped' | 'blocked' | 'error'
  entityIds: string[]
  attempts: number
  updatedAt: string
  error?: string
}

const DAY = 86_400_000
const file = (root: string, source: SourceId) => join(root, 'engine-state', `${source}.json`)

export async function loadState(root: string, source: SourceId): Promise<Record<string, UrlState>> {
  try {
    return JSON.parse(await readFile(file(root, source), 'utf8'))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw e
  }
}

export async function saveState(root: string, source: SourceId, state: Record<string, UrlState>): Promise<void> {
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const sorted = Object.fromEntries(Object.keys(state).sort().map(k => [k, state[k]]))
  await writeFile(file(root, source), `${JSON.stringify(sorted, null, 2)}\n`)
}

/** New URL, newer lastmod, stale without lastmod, blocked retry after 7 days, errors retried up to 3 attempts. */
export function needsFetch(prev: UrlState | undefined, lastmod: string | undefined, now: Date, refreshDays = 30): boolean {
  if (!prev) return true
  const age = now.getTime() - new Date(prev.updatedAt).getTime()
  if (prev.status === 'blocked') return age > 7 * DAY
  if (prev.status === 'error') return prev.attempts < 3
  if (lastmod && (!prev.lastmod || lastmod > prev.lastmod)) return true
  if (!lastmod) return age > refreshDays * DAY
  return false
}
