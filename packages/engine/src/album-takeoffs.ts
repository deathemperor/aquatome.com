import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { photoAddressSet, photoKey, type PhotoRejection } from '@aq/schema'
import { writePhotoState } from './photo-state'
import { writeImageCache } from './image-cache-write'
import { readSecondLook, waitingReview } from './last-photo'

const receiptFile = (root: string) => join(root, 'engine-state', '_photo-album-dead-takeoffs.json')
const batchDir = (root: string) => join(root, 'engine-state', 'album-takeoff-batches')
const ackDir = (root: string) => join(root, 'engine-state', 'album-takeoff-acks')
const hash = (urls: string[]) => createHash('sha256').update(JSON.stringify(urls)).digest('hex')
const batchId = /^[a-f0-9]{64}$/
export type TakeOffReceipt = true | { applied: true } | { batch: string; acknowledged?: true }
export const albumTakeOffApplied = (receipt: TakeOffReceipt | undefined): boolean =>
  !!receipt && receipt !== true && 'applied' in receipt && receipt.applied
export const pendingAlbumTakeOff = (receipt: TakeOffReceipt | undefined): boolean =>
  receipt === true || albumTakeOffApplied(receipt)
type Batch = { id: string; urls: string[] }

const missing = (error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error
  return undefined
}
const read = async <T>(file: string): Promise<T | undefined> => {
  const raw = await readFile(file, 'utf8').catch(missing)
  return raw === undefined ? undefined : JSON.parse(raw) as T
}
export const albumReceipts = async (root: string) => (await read<Record<string, TakeOffReceipt>>(receiptFile(root))) ?? {}

/** Commit a pending take-off before any step removes its album entry. */
export async function recordAlbumTakeOffs(root: string, urls: Iterable<string>, applied = false) {
  const receipts = await albumReceipts(root)
  let changed = false
  for (const url of urls) if (!(url in receipts) || (applied && receipts[url] === true)) {
    receipts[url] = applied ? { applied: true } : true
    changed = true
  }
  if (changed) await writePhotoState(receiptFile(root), receipts)
  return receipts
}

/** Gallery cleanup and sweep can reach the album before the next screening retry. */
export async function recordListedAlbumTakeOffs(root: string, urls: Iterable<string>, listed: PhotoRejection) {
  const marks = await readSecondLook(root)
  const dead = await read<Record<string, { dead?: boolean }>>(join(root, 'engine-state', '_dead-screen.json'))
  const cachedDead = photoAddressSet(Object.keys(dead ?? {}).filter(url => dead?.[url]?.dead === true))
  const removed = [...urls].flatMap(url => {
    const entry = listed(url)
    if (!entry) return []
    const [address, reason] = entry
    if (reason.startsWith('dead:')) return [url]
    const review = waitingReview(marks, address, reason)
    return review && (review[1].why.startsWith('dead:') || cachedDead(url)) ? [url] : []
  })
  if (removed.length) await recordAlbumTakeOffs(root, removed)
  return removed
}

async function readBatches(root: string): Promise<Batch[]> {
  const dir = batchDir(root)
  const files = (await readdir(dir).catch(missing)) ?? []
  return Promise.all(files.filter(id => batchId.test(id)).sort().map(async id => {
    const urls = await read<string[]>(join(dir, id))
    if (!Array.isArray(urls) || urls.length > 30 || hash(urls) !== id) throw new Error('Invalid stored album take-off batch')
    return { id, urls }
  }))
}

export async function acknowledgeAlbumTakeOffs(root: string, batch: string): Promise<number> {
  if (!batchId.test(batch)) throw new Error('Invalid album take-off batch ID')
  const urls = await read<string[]>(join(batchDir(root), batch))
  if (!urls?.length || hash(urls) !== batch) return 0
  const folder = ackDir(root)
  await mkdir(folder, { recursive: true })
  return writeFile(join(folder, batch), '', { flag: 'wx' }).then(() => urls.length, (error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') return 0
    throw error
  })
}

export async function completeAlbumReceipts(root: string, completed: string[], ignored: string[]): Promise<Batch[]> {
  const receipts = await albumReceipts(root)
  const batches = await readBatches(root)
  const acknowledged = new Set((await readdir(ackDir(root)).catch(missing)) ?? [])
  const identity = (url: string) => photoKey(url) ?? url
  const covered = new Set(batches.filter(batch => acknowledged.has(batch.id)).flatMap(batch => batch.urls.map(identity)))
  for (const url of ignored) if (receipts[url] === true) delete receipts[url]
  const ready = new Map<string, string>()
  for (const url of [...completed, ...batches.flatMap(batch => batch.urls)].sort()) {
    const key = identity(url)
    if (!covered.has(key) && !ready.has(key)) ready.set(key, url)
  }
  const report: Batch[] = []
  // A committed batch keeps the membership its ID names. A simultaneous overlapping batch contributes only the URLs
  // still due, under a new ID when needed.
  for (const batch of batches) {
    if (!batch.urls.every(url => ready.has(identity(url)))) continue
    report.push(batch)
    for (const url of batch.urls) ready.delete(identity(url))
  }
  const rest = [...ready.values()].sort()
  for (let start = 0; start < rest.length; start += 30) {
    const urls = rest.slice(start, start + 30), id = hash(urls)
    await mkdir(batchDir(root), { recursive: true })
    await writeImageCache(join(batchDir(root), id), `${JSON.stringify(urls)}\n`)
    report.push({ id, urls })
  }
  const assigned = new Map([...batches, ...report].flatMap(batch => batch.urls.map(url => [identity(url), batch.id] as const)))
  for (const url of completed) if (assigned.has(identity(url))) receipts[url] = { batch: assigned.get(identity(url))! }
  if (completed.length || ignored.length) await writePhotoState(receiptFile(root), receipts)
  return report
}
