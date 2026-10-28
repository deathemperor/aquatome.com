import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify, type SourceId } from '@aq/schema'

export const snapshotName = (url: string) => slugify(new URL(url).pathname) || 'index'

export const snapshotHash = (page: { title: string; outline: string }) => createHash('sha256').update(`${page.title}\n${page.outline}`).digest('hex')

export async function writeSnapshot(root: string, source: SourceId, url: string, page: { title: string; outline: string }, now = new Date()): Promise<{ path: string; hash: string }> {
  const hash = snapshotHash(page)
  const dir = join(root, 'sources', source)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${snapshotName(url)}.md`)
  await writeFile(path, `---\nurl: ${url}\ntitle: ${page.title.replace(/\n/g, ' ')}\nfetchedAt: ${now.toISOString()}\nhash: ${hash}\n---\n\n${page.outline}\n`)
  return { path, hash }
}
