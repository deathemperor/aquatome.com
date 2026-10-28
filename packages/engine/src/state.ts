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

const HOUR = 3_600_000
const DAY = 24 * HOUR
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

/** New URL, newer lastmod, stale without lastmod, blocked retry after 7 days, errors retried with 6 h × attempts backoff (max 3; a newer lastmod resets). */
export function needsFetch(prev: UrlState | undefined, lastmod: string | undefined, now: Date, refreshDays = 30): boolean {
  if (!prev) return true
  const age = now.getTime() - new Date(prev.updatedAt).getTime()
  if (prev.status === 'blocked') return age > 7 * DAY
  if (prev.status === 'error') return (!!lastmod && (!prev.lastmod || lastmod > prev.lastmod)) || (prev.attempts < 3 && age > prev.attempts * 6 * HOUR)
  if (lastmod && (!prev.lastmod || lastmod > prev.lastmod)) return true
  if (!lastmod) return age > refreshDays * DAY
  return false
}

/** Sources that hit a browser check a person must pass: skipped by scheduled runs until cleared (or a day passes). */
const blocksFile = (root: string) => join(root, 'engine-state', '_sources.json')
async function readBlocks(root: string): Promise<Partial<Record<SourceId, { blockedAt: string }>>> {
  return JSON.parse(await readFile(blocksFile(root), 'utf8').catch(() => '{}'))
}
export async function sourceBlockedSince(root: string, source: SourceId): Promise<string | undefined> {
  return (await readBlocks(root))[source]?.blockedAt
}
export async function setSourceBlock(root: string, source: SourceId, blockedAt: string | undefined): Promise<void> {
  const all = await readBlocks(root)
  if ((all[source]?.blockedAt) === blockedAt) return
  if (blockedAt) all[source] = { blockedAt }
  else delete all[source]
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(blocksFile(root), `${JSON.stringify(Object.fromEntries(Object.entries(all).sort()), null, 2)}\n`)
}
