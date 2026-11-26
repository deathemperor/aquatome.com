import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEAD_OWED_FILE, DEAD_SCREEN_FILE, deadLooked, facePhotoStatus, FACES_FILE, guideLooked, guidePhotoUrlsIn, GUIDE_LOOKS_FILE, IMAGE_SWITCHES, isOwnerCrop, mayPublish, mayPublishLicence, ownDeadPhotoUrls, ownerCropFitsPage, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoRejections, photoWaitsFor, SECOND_LOOK_RECORD, setsCookies, type Photo, type PhotoScreenEntry, type SourceInfo } from '@aq/schema'

const read = async <T>(root: string, name: string): Promise<Record<string, T> | undefined> => {
  const raw = await readFile(join(root, 'engine-state', name), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  return raw === undefined ? undefined : JSON.parse(raw) as Record<string, T>
}

/** A withdrawn source cannot supply a replacement for a photo about to be removed. */
export const permittedPhotoSource = (photo: Photo, sources: Record<string, SourceInfo>, ref: string, scientificName: string, allowInat = IMAGE_SWITCHES.inatNonCommercial): boolean => {
  const source = photo.source ? sources[photo.source] : undefined
  if (photo.source ? !mayPublish(source, 'photos') : !mayPublishLicence(photo, allowInat)) return false
  return !isOwnerCrop(photo) || (source?.permission?.markRemoval?.allowed !== false && ownerCropFitsPage(photo, ref, scientificName))
}

/** Use the public screen predicates before removing a photo that might leave its page empty. */
export async function readPhotoWaits(
  root: string,
  overrides: { check?: Record<string, unknown>; subjects?: Record<string, unknown>; rejected?: Record<string, string>; watermarks?: Record<string, PhotoScreenEntry> } = {},
): Promise<(url: string) => boolean> {
  const [watermarks, owed, faces, deadScreen, secondLook, rejected, check, subjects, guideLooks] = await Promise.all([
    overrides.watermarks ?? read<PhotoScreenEntry>(root, PHOTO_SCREEN_FILE), read(root, DEAD_OWED_FILE), read(root, FACES_FILE),
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
  const waits = photoWaitsFor({ watermarks, owed, unread, flaggedAlterations, faces, unjudged, deadScreen, secondLook,
    rejected: photoRejections(rejected ?? {}, watermarks) })
  return url => setsCookies(url) || waits(url)
}
