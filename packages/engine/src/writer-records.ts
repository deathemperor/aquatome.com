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

/** A source record's `entityIds` names this page, as `<kind>/<id>` (run.ts). */
const namesPage = (entityIds: unknown, page: PageRef) => Array.isArray(entityIds) && entityIds.includes(`${page.kind}/${page.id}`)

/**
 * Planting writes its text in two places: the plant's entity.json, as a section of AquaTome's own, and the Vietnamese
 * page. The gate puts back the page alone, and the step passes over a plant whose entity has that section
 * (planting.ts, plantsWithoutPlanting), so the advice would never reach the page. The section this cycle added goes
 * too, and with its record gone the step writes the plant again.
 */
async function dropNewPlanting(root: string, id: string) {
  const file = `content/plants/${id}/entity.json`
  const raw = await readFile(join(root, file), 'utf8').catch(() => '')
  if (!raw) return
  type Entity = { sections?: { source?: string }[] }
  const own = (e: Entity) => e.sections?.some(x => x.source === 'aquatome') ?? false
  const cur = JSON.parse(raw) as Entity
  if (!own(cur) || own(committed(root, file) as Entity)) return
  cur.sections = cur.sections!.filter(x => x.source !== 'aquatome')
  const indent = raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
  await writeFile(join(root, file), `${JSON.stringify(cur, null, indent)}\n`)
}

/**
 * Puts each of these pages' entries, in the writers' records, back to the committed value. HEAD having no entry deletes
 * it. The records are the ones that are one JSON map, an entry a page, and that make the writer skip the page next time.
 */
export async function restoreUnreadRecords(root: string, pages: PageRef[]): Promise<void> {
  if (!pages.length) return
  const dirtyFiles = dirty(root)
  const map = (file: string, keys: string[]) => (keys.length ? restoreMap(root, file, dirtyFiles, keyed(keys)) : undefined)
  const vi = pages.filter(p => p.lang === 'vi')
  // A source writes the Vietnamese page (run.ts): an entry is a URL and names the pages it wrote. Only an entry that says
  // the source wrote the page this cycle (`processed`, and not as HEAD has it) goes back. One that failed this cycle
  // wrote nothing, and putting it back would take a failure off its count of attempts each time. A video guide isn't
  // here: youtube.ts takes a video once, and a guide written again from its notes is chosen by its reviews, which the
  // gate has already put back (review-log.ts, unkeep).
  if (vi.length) for (const source of SOURCE_IDS) {
    await restoreMap(root, `engine-state/${source}.json`, dirtyFiles, (cur, head) => {
      let changed = false
      for (const k of Object.keys(cur)) {
        const entry = cur[k] as { entityIds?: unknown; status?: unknown } | null
        if (entry?.status !== 'processed' || !vi.some(p => namesPage(entry.entityIds, p))) continue
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
  const plants = vi.filter(p => p.kind === 'plants').map(p => p.id)
  await map('engine-state/_planting.json', plants)
  for (const id of plants) await dropNewPlanting(root, id)
  // The translator's record, a file a language and one more for its plants (localize.ts).
  for (const lang of WRITTEN_OTHER_LANGS) {
    await map(`engine-state/localize-${lang}.json`, pages.filter(p => p.lang === lang && p.kind === 'species').map(p => p.id))
    await map(`engine-state/localize-${lang}-plants.json`, pages.filter(p => p.lang === lang && p.kind === 'plants').map(p => p.id))
  }
  // A card's translation is keyed `<lang>/<id>`, with no kind (cards-intl.ts).
  await map('engine-state/_cards-intl.json', pages.filter(p => p.kind === 'cards' && p.lang !== 'vi').map(p => `${p.lang}/${p.id}`))
}
