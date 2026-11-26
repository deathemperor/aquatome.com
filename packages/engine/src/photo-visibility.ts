import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lastPhotoVerdicts, looks, pagesShowing, readSecondLook } from './last-photo'
import { DEAD_OWED_FILE, DEAD_SCREEN_FILE, deadLooked, expandWholePhotoRejections, facePhotoStatus, FACES_FILE, IMAGE_SWITCHES, isOwnerCrop, isVersionRejection, mayPublish, mayPublishLicence, ownDeadPhotoUrls, originalPhotoRefusals, ownerCropFitsPage, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoAddressSet, photoRejections, rejectedEntry, photoWaitsFor, publicPhotoVersion, SECOND_LOOK_RECORD, setsCookies, type Photo, type PhotoScreenEntry, type SourceInfo } from '@aq/schema'

const read = async <T>(root: string, name: string): Promise<Record<string, T> | undefined> => {
  const raw = await readFile(join(root, 'engine-state', name), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return undefined
  })
  return raw === undefined ? undefined : JSON.parse(raw) as Record<string, T>
}

export async function readPhotoSources(content: string): Promise<Record<string, SourceInfo>> {
  const raw = await readFile(join(content, 'sources.json'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '{}'
    throw error
  })
  const sources: unknown = JSON.parse(raw)
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)) throw new Error('Source permissions must be a map')
  return sources as Record<string, SourceInfo>
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
  overrides: { check?: Record<string, unknown>; subjects?: Record<string, unknown>; rejected?: Record<string, string>; watermarks?: Record<string, PhotoScreenEntry>; freshOwn?: boolean } = {},
): Promise<(url: string) => boolean> {
  const [watermarks, owed, faces, deadScreen, secondLook, rejected, check, subjects] = await Promise.all([
    overrides.watermarks ?? read<PhotoScreenEntry>(root, PHOTO_SCREEN_FILE), read(root, DEAD_OWED_FILE), read(root, FACES_FILE),
    read(root, DEAD_SCREEN_FILE), read(root, SECOND_LOOK_RECORD), overrides.rejected ?? read<string>(root, PHOTO_REJECTED_FILE),
    overrides.check ?? read(root, PHOTO_CHECK_FILE), overrides.subjects ?? read(root, PHOTO_SUBJECTS_FILE),
  ])
  const content = join(root, 'content')
  const { unread, altered: flaggedAlterations } = await facePhotoStatus(content, faces)
  const unjudged = new Set<string>()
  const looked = deadScreen && deadLooked({ screen: deadScreen, check, subjects, secondLook })
  if (looked) {
    for (const url of await ownDeadPhotoUrls(content)) if (!looked(url)) unjudged.add(url)
  }
  const effective = await expandWholePhotoRejections(content, rejected ?? {}, watermarks)
  const waits = photoWaitsFor({ watermarks, owed, unread, flaggedAlterations, faces, unjudged, deadScreen, secondLook,
    rejected: photoRejections(effective, watermarks) })
  return url => setsCookies(url) || waits(url) ||
    (overrides.freshOwn === true && ((!!looked && !looked(url)) || (!!faces && !Object.hasOwn(faces, url))))
}

/** Attribute a page's last visible photo to the pending guide or credit verdict. */
export async function holdablePhotoVerdicts(root: string, rejected: Record<string, string>, verdicts: Set<string>, removesWrapper: (url: string) => boolean) {
  if (!verdicts.size) return new Map<string, string[]>()
  const content = join(root, 'content')
  const [waits, sources, marks] = await Promise.all([
    readPhotoWaits(root, { rejected }), readPhotoSources(content), read<PhotoScreenEntry>(root, PHOTO_SCREEN_FILE),
  ])
  const listed = photoRejections(await expandWholePhotoRejections(content, rejected, marks), marks)
  const pages = await pagesShowing(content, (p, ref, name) => {
    const shown = publicPhotoVersion(p, IMAGE_SWITCHES, p.source ? sources[p.source]?.permission?.markRemoval : undefined)
    if (!shown || !permittedPhotoSource(shown, sources, ref, name)) return undefined
    const storedReason = listed(p.url)?.[1]
    if (storedReason && !isVersionRejection(storedReason)) return undefined
    return shown.url
  })
  const pending = [...verdicts].filter(url => {
    const prior = listed(url)?.[1]
    return !prior || (removesWrapper(url) && isVersionRejection(prior))
  })
  const whole = pending.filter(removesWrapper)
  const byAddress = rejectedEntry(Object.fromEntries(whole.map(url => [url, 'whole'])))
  const originals = whole.length ? await originalPhotoRefusals(content, url => byAddress(url)?.[0]) : undefined
  return lastPhotoVerdicts(pages, url => waits(url) || !!listed(url), pending, removesWrapper, originals)
}

export { isVersionRejection as versionRejection }

/** A durable first refusal can exist before its waiting rejection or after a clear arrives. */
export async function readRecoveryRetention(root: string): Promise<(url: string) => boolean> {
  const marks = await readSecondLook(root)
  const review = looks(marks)
  return photoAddressSet(Object.keys(marks).filter(url => review.off(url) ||
    (marks[url]!.off === true && !marks[url]!.back && review.cleared(url))))
}
