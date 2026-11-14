import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isGenerated } from '@aq/schema'

/**
 * Fish the owner asked for more photos of: engine-state/_priority-fish.json, `kind/id` → the day it went on, and nothing
 * else, since the repository is public (the chief of staff, 15 Nov). The album step and the photo check take these first
 * (gallery-plan.ts, photo-check.ts), oldest day first, until the fish's album holds six checked photos: the number the
 * site's album row shows at (apps/site/src/lib/gallery.ts GALLERY_MIN). Then it ranks where it would anyway.
 */
export const PRIORITY_UNTIL = 6
const REF = /^(species|plants|breeds)\/[a-z0-9-]+$/, DAY = /^\d{4}-\d{2}-\d{2}$/

/** The list as written, its malformed lines left out (a test holds the committed file to the form). */
export async function readPriorityFish(root: string): Promise<Record<string, string>> {
  const raw = JSON.parse(await readFile(join(root, 'engine-state/_priority-fish.json'), 'utf8').catch(() => '{}')) as Record<string, unknown>
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => REF.test(e[0]) && typeof e[1] === 'string' && DAY.test(e[1])))
}

/** The fish to take first, as `kind/id`, oldest day first: those on the list whose album holds fewer than six checked photos. */
export async function priorityFish(root: string): Promise<string[]> {
  const out: [string, string][] = []
  for (const [ref, day] of Object.entries(await readPriorityFish(root))) {
    const id = ref.split('/')[1]!
    const album = JSON.parse(await readFile(join(root, 'content/gallery', `${id}.json`), 'utf8').catch(() => '{}')) as { photos?: { unchecked?: boolean }[] }
    if ((album.photos ?? []).filter(p => !p.unchecked && !isGenerated(p)).length < PRIORITY_UNTIL) out.push([ref, day])
  }
  return out.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([ref]) => ref)
}
