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

export const MAX_ATTEMPTS = 3
export const BROWSER_GONE = /Target page, context or browser has been closed|Browser has been closed|Target closed/i
const NETWORK = /fetch failed|net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|Timeout \d+ ?ms exceeded|Navigation timeout|\bHTTP (408|429|5\d\d)\b/i
const USAGE = /hit your .*limit|usage limit|limit reached|rate.?limit/i

/**
 * Why a page failed, from its error: Claude's usage limit ('usage'), the browser or the network gone ('transient'),
 * or the page itself (a 404, a translation that wouldn't parse: 'other').
 */
export function errorKind(error = ''): 'usage' | 'transient' | 'other' {
  if (USAGE.test(error)) return 'usage'
  if (BROWSER_GONE.test(error) || NETWORK.test(error)) return 'transient'
  return 'other'
}
/** A page that failed through no fault of its own: it goes first in its source's next run (run.ts). */
export const retryFirst = (prev?: UrlState) => prev?.status === 'error' && errorKind(prev.error) !== 'other'
/** The attempts a failure leaves: a usage limit uses none. */
export const attemptsAfter = (prev: UrlState | undefined, error: string) => (prev?.status === 'error' ? prev.attempts : 0) + (errorKind(error) === 'usage' ? 0 : 1)

/**
 * New URL, newer lastmod, stale without lastmod, blocked retry after 7 days. Errors (a newer lastmod resets them): a usage
 * limit always runs again; a transient fault at the next run, up to MAX_ATTEMPTS; anything else after 6 h × attempts, up to
 * MAX_ATTEMPTS.
 */
export function needsFetch(prev: UrlState | undefined, lastmod: string | undefined, now: Date, refreshDays = 30): boolean {
  if (!prev) return true
  const age = now.getTime() - new Date(prev.updatedAt).getTime()
  if (prev.status === 'blocked') return age > 7 * DAY
  if (prev.status === 'error') {
    if (lastmod && (!prev.lastmod || lastmod > prev.lastmod)) return true
    const kind = errorKind(prev.error)
    if (kind === 'usage') return true
    return prev.attempts < MAX_ATTEMPTS && (kind === 'transient' || age > prev.attempts * 6 * HOUR)
  }
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
