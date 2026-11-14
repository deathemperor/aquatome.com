import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { awaitsScreen, isAllowedLicence, isGenerated, isOwnerCrop, mayPublish, PHOTO_SCREEN_FILE, PictureSet, setsCookies, unmarked, type Photo, type PhotoScreenEntry } from '@aq/schema'
import { isRejected } from './photos'

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
 * The pictures of a fish's album the site surely shows, each picture once as the row takes it (@aq/schema PictureSet: a
 * video's thumbnails are one picture, a photo and its thumb are one). Left out, beyond what the site leaves out: a photo
 * waiting for the photo check or the watermark screen, an AI picture, an altered photo or an owner's crop (the site shows
 * those only under its switches), a never-again photo, one a source may not show. And a marked photo, though the row shows
 * it: one the watermark screen found a mark on, which the album holds only under a kept-mark record (a cleared shop's own
 * mark), and one the site counts as marked (@aq/schema unmarked, Glaser's banner). A breed counts its album alone: its own
 * photos after its head show on the row too, but which photo the site leads with rests on the build's own steps (what it
 * leaves out, which photo fits a head), and counting from the wrong one would count the head. So this count can fall short
 * of the row's, never over it, and a fish never leaves the list before its row shows six photos with no mark.
 */
async function shownPictures(root: string, id: string): Promise<number> {
  const album = await readJson<{ photos?: (Photo & { unchecked?: boolean })[] }>(join(root, 'content/gallery', `${id}.json`), {})
  // No screen record, nothing waits, as in a build that has none (run.ts readKeeps).
  const screen = await readJson<Record<string, PhotoScreenEntry> | undefined>(join(root, 'engine-state', PHOTO_SCREEN_FILE), undefined)
  const rejected = isRejected(await readJson<Record<string, string>>(join(root, 'engine-state/_photo-rejected.json'), {}))
  const sources = await readJson<Record<string, { publish?: boolean | 'photos' }>>(join(root, 'content/sources.json'), {})
  const pictures = new PictureSet(await readJson<Record<string, string>>(join(root, 'content/picture-hashes.json'), {}))
  let clean = 0
  for (const p of album.photos ?? []) {
    if (p.unchecked || isGenerated(p) || p.altered?.length || isOwnerCrop(p) || (!!screen && awaitsScreen(p.url, screen[p.url])) || rejected(p.url) || setsCookies(p.url)) continue
    if (p.source ? !mayPublish(sources[p.source], 'photos') : !isAllowedLicence(p.licence)) continue
    // A marked photo takes its picture's place on the row too, so a clean copy after it isn't another picture.
    if (pictures.has(p.url)) continue
    pictures.add(p.url)
    if (unmarked(p) && screen?.[p.url]?.watermark !== true) clean++
  }
  return clean
}

/** The fish to take first, as `kind/id`, oldest day first: those on the list whose album row doesn't show yet. */
export async function priorityFish(root: string): Promise<string[]> {
  const out: [string, string][] = []
  for (const [ref, day] of Object.entries(await readPriorityFish(root))) {
    if ((await shownPictures(root, ref.split('/')[1]!)) < PRIORITY_UNTIL) out.push([ref, day])
  }
  return out.sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0])).map(([ref]) => ref)
}
