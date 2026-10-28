import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChangelogEntry } from '@aq/schema'

const MAX = 500

/** Prepend entries to content/changelog.json (newest first, capped). */
export async function appendChangelog(contentRoot: string, entries: ChangelogEntry[]): Promise<void> {
  if (!entries.length) return
  const path = join(contentRoot, 'changelog.json')
  const prev: ChangelogEntry[] = JSON.parse(await readFile(path, 'utf8').catch(() => '[]'))
  await writeFile(path, `${JSON.stringify([...entries, ...prev].slice(0, MAX), null, 2)}\n`)
}
