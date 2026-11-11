import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SOURCE_IDS } from '@aq/schema'
import { WRITTEN_OTHER_LANGS } from '@aq/schema/langs'

/**
 * The gate put these live pages back because it could not read them (gate.ts). A writer that recorded the page as done
 * this cycle would skip it next time, and the text it wrote is gone, so its entry goes back to what is committed: the
 * writer does the page again. A record file unchanged against HEAD is left as it is. A page put back for a check is not
 * passed here: it has had its go.
 */
type PageRef = { kind: string; id: string; lang: string }

const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })

/** Record files under engine-state the working tree changed against HEAD, untracked ones included. */
function dirty(root: string): Set<string> {
  const names = [
    ...git(root, ['diff', '--name-only', '-z', 'HEAD', '--', 'engine-state']).split('\0'),
    ...git(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', 'engine-state']).split('\0'),
  ]
  return new Set(names.filter(Boolean))
}

const committed = (root: string, file: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(git(root, ['show', `HEAD:${file}`]))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

/**
 * Keys the working file has and HEAD doesn't lose the entry; keys both have go back to HEAD's value. A key the working
 * file dropped stays dropped: there is no "done" mark left to undo, and putting HEAD's back would skip the page again.
 */
function restoreKeys(cur: Record<string, unknown>, head: Record<string, unknown>, keys: string[]): boolean {
  let changed = false
  for (const k of keys) {
    if (!Object.hasOwn(cur, k)) continue
    if (Object.hasOwn(head, k) && JSON.stringify(cur[k]) === JSON.stringify(head[k])) continue
    if (Object.hasOwn(head, k)) cur[k] = head[k]
    else delete cur[k]
    changed = true
  }
  return changed
}

async function restoreMap(root: string, file: string, dirtyFiles: Set<string>, touch: (cur: Record<string, unknown>, head: Record<string, unknown>) => boolean) {
  if (!dirtyFiles.has(file)) return
  const raw = await readFile(join(root, file), 'utf8').catch(() => '')
  if (!raw) return
  const cur = JSON.parse(raw) as unknown
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return
  if (!touch(cur as Record<string, unknown>, committed(root, file))) return
  const indent = raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
  await writeFile(join(root, file), `${JSON.stringify(cur, null, indent)}\n`)
}

const keyed = (keys: string[]) => (cur: Record<string, unknown>, head: Record<string, unknown>) => restoreKeys(cur, head, keys)

/** A source record's `entityIds` names this page. youtube.json uses the guide's id alone, `youtube-<id>`, with no kind. */
const namesPage = (entityIds: unknown, page: PageRef) => Array.isArray(entityIds) && entityIds.some(x =>
  x === `${page.kind}/${page.id}` || (page.kind === 'guides' && page.id.startsWith('youtube-') && x === page.id))

/**
 * Puts each of these pages' entries, in the writers' records, back to the committed value. HEAD having no entry deletes
 * it. The records are the ones that are one JSON map, an entry a page, and that make the writer skip the page next time.
 */
export async function restoreUnreadRecords(root: string, pages: PageRef[]): Promise<void> {
  if (!pages.length) return
  const dirtyFiles = dirty(root)
  const map = (file: string, keys: string[]) => (keys.length ? restoreMap(root, file, dirtyFiles, keyed(keys)) : undefined)
  const vi = pages.filter(p => p.lang === 'vi')
  // A source writes the Vietnamese page (run.ts, youtube.ts). One entry is a URL, or a video id, and names the page.
  if (vi.length) for (const source of SOURCE_IDS) {
    await restoreMap(root, `engine-state/${source}.json`, dirtyFiles, (cur, head) => {
      let changed = false
      for (const k of Object.keys(cur)) {
        const entry = cur[k] as { entityIds?: unknown } | null
        const named = vi.some(p => namesPage(entry?.entityIds, p) || namesPage((head[k] as { entityIds?: unknown } | null)?.entityIds, p))
        if (!named) continue
        if (Object.hasOwn(head, k) && JSON.stringify(entry) === JSON.stringify(head[k])) continue
        if (Object.hasOwn(head, k)) cur[k] = head[k]
        else delete cur[k]
        changed = true
      }
      return changed
    })
  }
  await map('engine-state/vi-rewrite.json', vi.map(p => `${p.kind}/${p.id}`))
  await map('engine-state/_reader.json', pages.map(p => `${p.lang}/${p.kind}/${p.id}`))
  // The collection rewrite skips a page whose tried hash is the text it has now (fit-rewrite.ts). The rewritten list is
  // the same key, the text it kept: that hash would name a text the page no longer has.
  const viKeys = vi.map(p => `vi/${p.kind}/${p.id}`)
  await map('engine-state/_fit-rewrite.json', viKeys)
  await map('engine-state/rewritten.json', viKeys)
  // Planting is tried once a plant (planting.ts), keyed by the plant's id.
  await map('engine-state/_planting.json', vi.filter(p => p.kind === 'plants').map(p => p.id))
  // The translator's record, a file a language and one more for its plants (localize.ts).
  for (const lang of WRITTEN_OTHER_LANGS) {
    await map(`engine-state/localize-${lang}.json`, pages.filter(p => p.lang === lang && p.kind === 'species').map(p => p.id))
    await map(`engine-state/localize-${lang}-plants.json`, pages.filter(p => p.lang === lang && p.kind === 'plants').map(p => p.id))
  }
  // A card's translation is keyed `<lang>/<id>`, with no kind (cards-intl.ts).
  await map('engine-state/_cards-intl.json', pages.filter(p => p.kind === 'cards' && p.lang !== 'vi').map(p => `${p.lang}/${p.id}`))
}
