import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEAD_OWED_FILE, DEAD_SCREEN_FILE, deadLooked, facePhotoStatus, FACES_FILE, guideLooked, guidePhotoUrlsIn, GUIDE_LOOKS_FILE, ownDeadPhotoUrls, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoWaitsFor, rejectedEntry, SECOND_LOOK_RECORD, type PhotoScreenEntry } from '@aq/schema'

const read = async <T>(root: string, name: string): Promise<Record<string, T> | undefined> => {
  const raw = await readFile(join(root, 'engine-state', name), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  return raw === undefined ? undefined : JSON.parse(raw) as Record<string, T>
}

/** Use the public screen predicates before removing a photo that might leave its page empty. */
export async function readPhotoWaits(
  root: string,
  overrides: { check?: Record<string, unknown>; subjects?: Record<string, unknown>; rejected?: Record<string, string> } = {},
): Promise<(url: string) => boolean> {
  const [watermarks, owed, faces, deadScreen, secondLook, rejected, check, subjects, guideLooks] = await Promise.all([
    read<PhotoScreenEntry>(root, PHOTO_SCREEN_FILE), read(root, DEAD_OWED_FILE), read(root, FACES_FILE),
    read(root, DEAD_SCREEN_FILE), read(root, SECOND_LOOK_RECORD), overrides.rejected ?? read<string>(root, PHOTO_REJECTED_FILE),
    overrides.check ?? read(root, PHOTO_CHECK_FILE), overrides.subjects ?? read(root, PHOTO_SUBJECTS_FILE), read(root, GUIDE_LOOKS_FILE),
  ])
  const content = join(root, 'content')
  const { unread, altered: flaggedAlterations } = await facePhotoStatus(content, faces)
  const unjudged = new Set<string>()
  if (deadScreen) {
    const looked = deadLooked({ screen: deadScreen, check, subjects, secondLook })
    for (const url of await ownDeadPhotoUrls(content)) if (!looked(url)) unjudged.add(url)
  }
  if (guideLooks) for (const url of await guidePhotoUrlsIn(content)) if (!guideLooked(guideLooks[url])) unjudged.add(url)
  return photoWaitsFor({ watermarks, owed, unread, flaggedAlterations, faces, unjudged, deadScreen, secondLook,
    rejected: rejectedEntry(rejected ?? {}) })
}
