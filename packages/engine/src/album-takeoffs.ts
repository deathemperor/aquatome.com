import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PhotoRejection } from '@aq/schema'
import { writePhotoState } from './photo-state'
import { writeImageCache } from './image-cache-write'
import { readSecondLook, waitingEntry } from './last-photo'

const receiptFile = (root: string) => join(root, 'engine-state', '_photo-album-dead-takeoffs.json')
const batchDir = (root: string) => join(root, 'engine-state', 'album-takeoff-batches')
const ackDir = (root: string) => join(root, 'engine-state', 'album-takeoff-acks')
const hash = (urls: string[]) => createHash('sha256').update(JSON.stringify(urls)).digest('hex')
const batchId = /^[a-f0-9]{64}$/
export type TakeOffReceipt = true | { batch: string; acknowledged?: true }
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
export async function recordAlbumTakeOffs(root: string, urls: Iterable<string>) {
  const receipts = await albumReceipts(root)
  let changed = false
  for (const url of urls) if (!(url in receipts)) { receipts[url] = true; changed = true }
  if (changed) await writePhotoState(receiptFile(root), receipts)
  return receipts
}

/** Gallery cleanup and sweep can reach the album before the next screening retry. */
export async function recordListedAlbumTakeOffs(root: string, urls: Iterable<string>, listed: PhotoRejection) {
  const marks = await readSecondLook(root)
  const dead = await read<Record<string, { dead?: boolean }>>(join(root, 'engine-state', '_dead-screen.json'))
  const removed = [...urls].flatMap(url => {
    const entry = listed(url)
    if (!entry) return []
    const [address, reason] = entry
    if (reason.startsWith('dead:')) return [address]
    const mark = marks[address]
    return mark && reason === waitingEntry(mark.why) &&
      (mark.why.startsWith('dead:') || dead?.[address]?.dead || dead?.[url]?.dead) ? [address] : []
  })
  if (removed.length) await recordAlbumTakeOffs(root, removed)
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
  const covered = new Set(batches.filter(batch => acknowledged.has(batch.id)).flatMap(batch => batch.urls))
  for (const url of ignored) if (receipts[url] === true) delete receipts[url]
  const ready = new Set([...completed, ...batches.flatMap(batch => batch.urls)].filter(url => !covered.has(url)))
  const report: Batch[] = []
  // A committed batch keeps the membership its ID names. A simultaneous overlapping batch contributes only the URLs
  // still due, under a new ID when needed.
  for (const batch of batches) {
    if (!batch.urls.every(url => ready.has(url))) continue
    report.push(batch)
    for (const url of batch.urls) ready.delete(url)
  }
  const rest = [...ready].sort()
  for (let start = 0; start < rest.length; start += 30) {
    const urls = rest.slice(start, start + 30), id = hash(urls)
    await mkdir(batchDir(root), { recursive: true })
    await writeImageCache(join(batchDir(root), id), `${JSON.stringify(urls)}\n`)
    report.push({ id, urls })
  }
  const assigned = new Map([...batches, ...report].flatMap(batch => batch.urls.map(url => [url, batch.id] as const)))
  for (const url of completed) if (assigned.has(url)) receipts[url] = { batch: assigned.get(url)! }
  if (completed.length || ignored.length) await writePhotoState(receiptFile(root), receipts)
  return report
}
