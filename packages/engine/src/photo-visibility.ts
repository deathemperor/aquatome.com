import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeImageCache } from './image-cache-write'
import { lastPhotoVerdicts, looks, pagesShowing, readSecondLook } from './last-photo'
import { CREDIT_HOLD_FILE, CREDIT_HOLD_REJECTION, creditHoldPhotoUrls, type CreditHoldPhotos } from '@aq/schema'
import { DEAD_OWED_FILE, DEAD_SCREEN_FILE, deadLooked, expandWholePhotoRejections, reviewedPhotoVersion, facePhotoStatus, FACES_FILE, guideLooked, guidePhotoUrlsIn, guidePhotoWaits, GUIDE_LEGACY_USES_FILE, GUIDE_LOOKS_FILE, keepGuideLegacyUses, readGuideLegacyUses, IMAGE_SWITCHES, isOwnerCrop, isVersionRejection, mayPublish, mayPublishLicence, ownDeadPhotoUrls, originalPhotoRefusals, ownerCropFitsPage, PHOTO_CHECK_FILE, PHOTO_REJECTED_FILE, PHOTO_SCREEN_FILE, PHOTO_SUBJECTS_FILE, photoAddressSet, photoRejections, rejectedEntry, photoWaitsFor, publicPhotoVersion, SECOND_LOOK_RECORD, setsCookies, type Photo, type PhotoScreenEntry, type SourceInfo } from '@aq/schema'

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

export async function readCreditHoldWait(root: string): Promise<(url: string) => boolean> {
  return photoAddressSet(creditHoldPhotoUrls(await read<CreditHoldPhotos>(root, CREDIT_HOLD_FILE)))
}

export async function readPhotoIntakeBlocks(root: string): Promise<Record<string, string>> {
  const [rejected, holds] = await Promise.all([read<string>(root, PHOTO_REJECTED_FILE), read<CreditHoldPhotos>(root, CREDIT_HOLD_FILE)])
  return { ...Object.fromEntries(creditHoldPhotoUrls(holds).map(url => [url, CREDIT_HOLD_REJECTION])), ...rejected }
}

/** Keep the baseline in step with removed guide uses and newly explicit answers. */
export async function pruneGuideLegacyUses(root: string, looks?: Record<string, unknown>): Promise<void> {
  const content = join(root, 'content')
  const legacy = await readGuideLegacyUses(content)
  if (!legacy.length) return
  const { pendingLegacy } = await guidePhotoWaits(content, looks ?? await read(root, GUIDE_LOOKS_FILE) ?? {})
  const keep = keepGuideLegacyUses(legacy, pendingLegacy)
  if (keep.length < legacy.length) {
    await writeImageCache(join(content, GUIDE_LEGACY_USES_FILE), keep.length ? `[\n${keep.map(use => '  ' + JSON.stringify(use)).join(',\n')}\n]\n` : '[]\n')
  }
}

export async function readReviewedPhotoVersion(root: string): Promise<(url: string) => boolean> {
  const [reviews, check, subjects, screen] = await Promise.all([
    read(root, SECOND_LOOK_RECORD), read(root, PHOTO_CHECK_FILE), read(root, PHOTO_SUBJECTS_FILE), read(root, DEAD_SCREEN_FILE),
  ])
  return reviewedPhotoVersion(reviews, check, subjects, screen)
}

/** Use the public screen predicates before removing a photo that might leave its page empty. */
export async function readPhotoWaits(
  root: string,
  overrides: { check?: Record<string, unknown>; subjects?: Record<string, unknown>; rejected?: Record<string, string>; watermarks?: Record<string, PhotoScreenEntry>; freshOwn?: boolean; requireDeadLook?: boolean } = {},
): Promise<(url: string, freshOwn?: boolean) => boolean> {
  const [watermarks, owed, faces, deadScreen, secondLook, rejected, check, subjects, guideLooks, creditHeld] = await Promise.all([
    overrides.watermarks ?? read<PhotoScreenEntry>(root, PHOTO_SCREEN_FILE), read(root, DEAD_OWED_FILE), read(root, FACES_FILE),
    read(root, DEAD_SCREEN_FILE), read(root, SECOND_LOOK_RECORD), overrides.rejected ?? read<string>(root, PHOTO_REJECTED_FILE),
    overrides.check ?? read(root, PHOTO_CHECK_FILE), overrides.subjects ?? read(root, PHOTO_SUBJECTS_FILE), read(root, GUIDE_LOOKS_FILE),
    readCreditHoldWait(root),
  ])
  const content = join(root, 'content')
  const { unread } = await facePhotoStatus(content, faces)
  const unjudged = new Set<string>()
  const looked = deadScreen && deadLooked({ screen: deadScreen, check, subjects, secondLook })
  if (looked) {
    for (const url of await ownDeadPhotoUrls(content)) if (!looked(url)) unjudged.add(url)
  }
  const guideUnjudged = guideLooks ? new Set([...await guidePhotoUrlsIn(content)].filter(url => !guideLooked(guideLooks[url]))) : undefined
  const effective = await expandWholePhotoRejections(content, rejected ?? {}, watermarks)
  const waits = photoWaitsFor({ watermarks, owed, unread, faces, unjudged, lookedForDead: looked, check, subjects, deadScreen, guideLooks, guideUnjudged, secondLook,
    rejected: photoRejections(effective, watermarks, reviewedPhotoVersion(secondLook, check, subjects, deadScreen)) })
  return (url, freshOwn = overrides.freshOwn === true) => setsCookies(url) || creditHeld(url) || waits(url) ||
    ((freshOwn || overrides.requireDeadLook) && !!looked && !looked(url)) ||
    (freshOwn && !!faces && !Object.hasOwn(faces, url))
}

/** Attribute a page's last visible photo to the pending guide or credit verdict. */
export async function holdablePhotoVerdicts(root: string, rejected: Record<string, string>, verdicts: Set<string>, removesWrapper: (url: string) => boolean) {
  if (!verdicts.size) return new Map<string, string[]>()
  const content = join(root, 'content')
  const [waits, sources, marks, reviewed] = await Promise.all([
    readPhotoWaits(root, { rejected }), readPhotoSources(content), read<PhotoScreenEntry>(root, PHOTO_SCREEN_FILE), readReviewedPhotoVersion(root),
  ])
  const listed = photoRejections(await expandWholePhotoRejections(content, rejected, marks), marks, reviewed)
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
  return lastPhotoVerdicts(pages, url => waits(url) || !!listed(url), pending, removesWrapper, originals, true)
}

export { isVersionRejection as versionRejection }

/** A durable first refusal can exist before its waiting rejection or after a clear arrives. */
export async function readRecoveryRetention(root: string): Promise<(url: string) => boolean> {
  const marks = await readSecondLook(root)
  const review = looks(marks)
  return photoAddressSet(Object.keys(marks).filter(url => review.off(url) ||
    (marks[url]!.off === true && !marks[url]!.back && review.cleared(url))))
}
