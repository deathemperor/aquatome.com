/** Where the two places of a clash are kept (clashes.ts): the private bucket, one entry per pair, for the Writing Lead's list. */
import { sha256 } from '../accounts/session'
import { checkedClashes, type Clash, type FiledClash } from './clashes'
import type { Handbook, Lang } from './handbook'
import { listAll } from './store'

export const CLASH_PREFIX = 'handbook-clash/'

export async function fileClashes(bucket: R2Bucket, hb: Handbook, found: Clash[], lang: Lang, at: Date): Promise<void> {
  for (const places of await checkedClashes(hb, found)) {
    const entry: FiledClash = { at: at.toISOString(), lang, places }
    await bucket.put(`${CLASH_PREFIX}${await sha256(JSON.stringify(places))}.json`, JSON.stringify(entry))
  }
}

export async function recentClashes(bucket: R2Bucket, limit = 200): Promise<FiledClash[]> {
  const all = await listAll(bucket, CLASH_PREFIX)
  const newest = all.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime()).slice(0, limit)
  const rows = await Promise.all(newest.map(async o => (await bucket.get(o.key))?.json<FiledClash>()))
  return rows.filter(r => r !== undefined)
}
