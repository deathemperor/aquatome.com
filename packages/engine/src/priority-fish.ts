import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hashDistance, isAllowedLicence, isGenerated, isOwnerCrop, mayPublish, PHOTO_SCREEN_FILE, pictureOf, SAME_PICTURE, setsCookies, unmarked, type Photo, type PhotoScreenEntry } from '@aq/schema'
import { diskOwners, EMPTIED_FILE, readList, showingPhotos } from './emptied-pages'
import { isRejected } from './photos'
import { readPhotoWaits } from './photo-visibility'

/**
 * Fish the owner asked for more photos of: engine-state/_priority-fish.json, `kind/id` → the day it went on, and nothing
 * else, since the repository is public (the chief of staff, 15 Nov). The album step and the photo check take these first
 * (gallery-plan.ts, photo-check.ts), oldest day first, until the fish's album row shows six pictures with no mark on them
 * (apps/site/src/lib/gallery.ts GALLERY_MIN, counted by apps/site/src/lib/photo-page.ts albumOf). Then it ranks where it
 * would anyway. A photo kept with a shop's mark doesn't count: the owner asked for photos they'd like (the chief of staff,
 * 15 Nov).
 */
export const PRIORITY_UNTIL = 6
const REF = /^(species|plants|breeds)\/[a-z0-9-]+$/, DAY = /^\d{4}-\d{2}-\d{2}$/
const readJson = async <T>(file: string, empty: T): Promise<T> => {
  try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { return empty }
}

/**
 * The list as written. A malformed line is left out, and a file that isn't JSON at all reads as no list, so a slip in a
 * hand edit can't stop the album step or the photo check (a test holds the committed file to the form).
 */
export async function readPriorityFish(root: string): Promise<Record<string, string>> {
  const raw = await readJson<unknown>(join(root, 'engine-state/_priority-fish.json'), {})
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => REF.test(e[0]) && typeof e[1] === 'string' && DAY.test(e[1])))
}

/**
 * How many photos with no mark the fish's album row surely shows. A photo counts when the row shows it for sure: it's in
 * the album's file (a breed's own photos show on its row too, after its head, but which one leads rests on the build's own
 * steps), and none of these: waiting for the photo check or the watermark screen, an AI picture, an altered photo or an
 * owner's crop (the site shows those only under its switches), a never-again photo, one a source may not show. It has no
 * mark: neither one the site counts as marked (@aq/schema unmarked, Glaser's banner) nor one the watermark screen found
 * (the album holds such a photo only under a kept-mark record, a cleared shop's own mark). And it has no copy anywhere on
 * the page or in the album, shown or not, at any address the site may show either at (a photo's own, or its original's,
 * which the build falls back to): the same address, a video's other thumbnail, a photo's thumb, a hash within SAME_PICTURE
 * (@aq/schema pictureOf). The row takes each picture once, the first copy it shows, and near copies chain, so a picture
 * with a copy may not be the one the row shows; one with none is. So each photo counted is one the row shows with no mark,
 * the count can fall short of the row's, never over it, and a fish never leaves the list before its row shows six photos
 * with no mark. A picture shown twice counts for neither copy: the fish stays first in line a little longer.
 */
export async function shownPictures(root: string, kind: string, id: string, waiting?: (url: string) => boolean): Promise<number> {
  const page = await readJson<{ photos?: Photo[] }>(join(root, 'content', kind, id, 'entity.json'), {})
  const album = await readJson<{ photos?: (Photo & { unchecked?: boolean })[] }>(join(root, 'content/gallery', `${id}.json`), {})
  // No screen record, nothing waits, as in a build that has none (run.ts readKeeps).
  const screen = await readJson<Record<string, PhotoScreenEntry> | undefined>(join(root, 'engine-state', PHOTO_SCREEN_FILE), undefined)
  const unjudged = waiting ?? await readPhotoWaits(root)
  const rejected = isRejected(await readJson<Record<string, string>>(join(root, 'engine-state/_photo-rejected.json'), {}))
  const sources = await readJson<Record<string, { publish?: boolean | 'photos' }>>(join(root, 'content/sources.json'), {})
  const hashes = await readJson<Record<string, string>>(join(root, 'content/picture-hashes.json'), {})
  const at = (p: Photo) => [p.url, ...(p.original?.url ? [p.original.url] : [])].map(u => pictureOf(u, hashes))
  const copies = (a: ReturnType<typeof at>, b: ReturnType<typeof at>) => a.some(x => b.some(y => x.key === y.key || (!!x.hash && !!y.hash && hashDistance(x.hash, y.hash) <= SAME_PICTURE)))
  const own = page.photos ?? [], photos = album.photos ?? []
  const all = [...own, ...photos].map(at)
  let clean = 0
  for (const [i, p] of photos.entries()) {
    if (p.unchecked || unjudged(p.url) || isGenerated(p) || p.altered?.length || isOwnerCrop(p) || rejected(p.url) || setsCookies(p.url)) continue
    if (p.source ? !mayPublish(sources[p.source], 'photos') : !isAllowedLicence(p.licence)) continue
    if (!unmarked(p) || screen?.[p.url]?.watermark === true) continue
    const self = own.length + i
    if (all.some((q, j) => j !== self && copies(all[self]!, q))) continue
    clean++
  }
  return clean
}

/**
 * The fish to take first, as `kind/id`, oldest day first: those on the owner's list whose album row doesn't show six
 * yet, and the pages our removals emptied (emptied-pages.ts) that are pages with no photo yet, by the site's own rule.
 * A page on both keeps the owner's six.
 */
export async function priorityFish(root: string): Promise<string[]> {
  const out: [string, string][] = []
  const owner = await readPriorityFish(root)
  const entries = Object.entries(owner)
  const waiting = entries.length ? await readPhotoWaits(root) : undefined
  for (const [ref, day] of entries) {
    const [kind, id] = ref.split('/') as [string, string]
    if ((await shownPictures(root, kind, id, waiting)) < PRIORITY_UNTIL) out.push([ref, day])
  }
  const emptied = Object.entries(await readList(root, EMPTIED_FILE)).filter(([ref]) => !Object.hasOwn(owner, ref))
  const showing = await showingPhotos(emptied.map(([ref]) => ref), p => readFile(join(root, p), 'utf8').catch(() => undefined), diskOwners(root))
  // A page with no photo yet; one the loader drops (no section it may show) is no page to find photos for.
  for (const [ref, day] of emptied) if (showing.get(ref) === false) out.push([ref, day])
  return out.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([ref]) => ref)
}
