import { createHash } from 'node:crypto'
import { photoAddressSet, photoKey, type PhotoRejection } from './photo-address'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isOwnerCrop, type ImageSwitches } from './image-policy'
import { photoRejections, retainedOwnMark } from './own-mark'
import type { Photo } from './types'

/**
 * The public screen record keeps measurements and a fingerprint, never the lettering itself.
 * Legacy lines are readable during the engine-owned migration, but are never written again.
 */
export type OcrSummary = { c: number; at?: string; alnum: number; mark: boolean; hash: string }
export type LegacyOcrLine = { t: string; c: number; at?: string }
export type PhotoScreenEntry = { ocr: (OcrSummary | LegacyOcrLine)[]; watermark?: boolean; retainedOwnMark?: unknown }

const MARK = /©|\(c\)|copyright|www\.|https?:|\.(com|net|org|de|co|vn|th|id|uk)\b/i

/**
 * The intake rule: text on a photo worth a model's look. A credit sign or a web address always; otherwise a line Vision
 * is sure of with at least 3 letters or digits (fish scales and plant stems read as stray "I", "ll" or "W").
 */
export const validOcrSummary = (x: unknown): x is OcrSummary => {
  const l=x as OcrSummary|undefined
  return !!l && Number.isFinite(l.c) && l.c>=0 && l.c<=1 && Number.isSafeInteger(l.alnum) && l.alnum>=0
    && typeof l.mark==='boolean' && typeof l.hash==='string' && /^[a-f0-9]{64}$/.test(l.hash)
    && (l.at===undefined || /^(?:(?:top|middle|bottom) (?:left|centre|right)|unknown)$/.test(l.at))
}
export function ocrHit(lines: (OcrSummary | LegacyOcrLine)[]): boolean {
  if(!Array.isArray(lines))return true
  return lines.some(l => {
    if(l && 't' in l && typeof l.t==='string')return MARK.test(l.t) || (l.c>=0.5 && (l.t.match(/[\p{L}\p{N}]/gu)?.length??0)>=3)
    return !validOcrSummary(l) || l.mark || (l.c>=0.5 && l.alnum>=3)
  })
}

/**
 * R2 folders (sources) whose photos all go to the model, text read or not: the 2026-10-31 scan found marks on 15–96% of
 * their photos, some a logo with no letters or a signature too faint for Vision.
 */
export const LOGO_FOLDERS = ['glaser', 'seriouslyfish', 'bwaquatics', 'scotcat', 'panitvong']
export const logoFolder = (url: string) => LOGO_FOLDERS.some(f => url.includes(`/${f}/`))

/**
 * Whether the watermark screen still owes this photo a look: Vision has not read it, or it has text on it or comes from
 * a logo source and the model has not judged it. Such a photo waits: a public build does not show it (load.ts), and it
 * shows by itself once the screen has judged it clean. Until 2026-11-11 it showed while it waited, and on that day the
 * model ran out of quota: 36 photos reached pages with no look, 24 of them with text the reader had found (the chief of
 * staff).
 */
export const awaitsScreen = (url: string, entry: PhotoScreenEntry | undefined): boolean =>
  !entry || (entry.watermark === undefined && (ocrHit(entry.ocr) || logoFolder(url)))

/**
 * The photos the dead-fish screen owes a look, in engine-state (address → the day first owed): each photo new to a fish
 * or plant page that the faces step's screen hasn't judged, past its sheets, on a failed sheet or after a stop (the
 * engine's faces.ts `screenNewPhotos`). Such a photo waits as one the watermark screen owes does: a public build doesn't
 * show it (load.ts). It shows by itself once the screen or the photo check has judged it and a faces step has taken it
 * off the list. The chief of staff told the owner the screen sees every new photo before it can show (21 Nov 2026).
 */
export const DEAD_OWED_FILE = '_photo-dead-owed.json'

/**
 * The face finder's record, in engine-state (address → faces found): every own photo of a species, plant or guide page
 * it has read (the engine's faces.ts `dropFacePhotos`). A public build shows no such photo it hasn't read, whatever put it
 * there: a faces step that failed, a job with no faces step, a step after it, a hand run, the image step (load.ts; the
 * chief of staff, 21 Nov 2026). It shows by itself once a faces step reads it. A breed's photos aren't the face finder's.
 */
export const FACES_FILE = '_photo-faces.json'
/**
 * More own photos than this that the face finder hasn't read is a lost or damaged record, not a run's new photos: the
 * site's build fails rather than publish its pages without them. A normal run leaves 0 to 2 (main, 19 to 21 Nov); a
 * pages run whose faces step failed, 128 to 138; a lost record, about 7,100. One failed pages run must not stop every
 * deploy, a lost record must (the chief of staff's ruling, 21 Nov).
 */
export const UNREAD_FACES_LIMIT = 300

/** The dead-fish screen's record, in engine-state (address → its verdict): every photo it has judged, dead or not. */
export const DEAD_SCREEN_FILE = '_dead-screen.json'
/** The photo check's records, in engine-state: its verdicts by address, the old form, and the one by subject. */
export const PHOTO_CHECK_FILE = '_photo-check.json'
export const PHOTO_REJECTED_FILE = '_photo-rejected.json'
export const PHOTO_SUBJECTS_FILE = '_photo-subjects.json'
/** The second look's records, in engine-state (address → record): a person's `look` is on its photo's record. */
export const SECOND_LOOK_RECORD = '_photo-second-look.json'
type PhotoVersions = Pick<Photo, 'url' | 'altered' | 'original' | 'generated' | 'source' | 'ownerCrop'>
const markAlteration = (p: PhotoVersions) => p.altered?.find(a => a.method === 'mark-removal' || a.method === 'mark-crop')
const mayFallBack = (p: PhotoVersions) => !!p.original && (!markAlteration(p) || p.source === 'glaser')

/** The version allowed by the alteration switch and current source permission. */
export function publicPhotoVersion<P extends Photo>(p: P, images: Readonly<ImageSwitches>, permission?: { allowed: boolean; date?: string }): P | undefined {
  if (isOwnerCrop(p) || p.generated || !p.altered?.length) return p
  const mark = markAlteration(p)
  const allowed = images.publishAltered && (mark ? images.removeMarks && permission?.allowed && permission.date === mark.permissionDate : images.upscaleReal)
  if (allowed) return p
  if (!mayFallBack(p)) return undefined
  const { altered: _altered, original, large: _large, thumb: _thumb, ...rest } = p
  return { ...rest, ...original } as P
}

/** These refusals apply to the version that received the verdict. */
export const isVersionRejection = (reason: string): boolean => /^(?:dead|people|waiting): /.test(reason)

/** A waiver can lift a watermark decision, so it must never replace an independent refusal. */
export const maySupersedePhotoRefusal = (prior: string | undefined, decision: string): boolean =>
  !prior || (prior === CREDIT_HOLD_REJECTION && !decision.startsWith('waiting:')) || (!decision.startsWith('watermark:') &&
    (prior.startsWith('watermark:') || (isVersionRejection(prior) && !isVersionRejection(decision))))
const CREDIT_HOLD_TEXT = 'rejected: held for a credit read'
export const CREDIT_HOLD_REJECTION = `rejected: withheld [sha256:${createHash('sha256').update(CREDIT_HOLD_TEXT).digest('hex')}]`
export const CREDIT_HOLD_FILE = '_credit-holds.json'

/** The stored URL and any original the public loader can use if it withdraws an alteration. */
export function deadScreenPhotoUrls(p: PhotoVersions): string[] {
  return p.altered?.length && !p.generated && !isOwnerCrop(p) && mayFallBack(p) ? [p.url, p.original!.url] : [p.url]
}

/** An active rights hold covers the stored photo and originals carried by its saved placements. */
export type CreditHoldPhotos = { released?: boolean; originals?: string[]; places?: { photo: Pick<Photo, 'url' | 'original'> }[] }

export function creditHoldAddresses(url: string, hold: CreditHoldPhotos): string[] {
  return [...new Set([url, ...(hold.originals ?? []), ...(hold.places ?? []).flatMap(({ photo }) =>
    photo.original?.url ? [photo.original.url] : [])])]
}

export function creditHoldPhotoUrls(holds: Record<string, CreditHoldPhotos> = {}): string[] {
  return Object.entries(holds).flatMap(([url, hold]) => hold.released ? [] : creditHoldAddresses(url, hold))
}

/** Photo placements that carry their own publishing and attribution metadata. */
export function* documentPhotos(doc: {
  photos?: Photo[]; video?: { figures?: { photo?: Photo }[] }; kinds?: { photo?: Photo }[]; hero?: Photo; types?: { photo?: Photo }[]
}): Generator<Photo> {
  yield* doc.photos ?? []
  if (doc.hero) yield doc.hero
  for (const item of [...(doc.video?.figures ?? []), ...(doc.kinds ?? []), ...(doc.types ?? [])]) if (item.photo) yield item.photo
}

async function* entityPhotos(root: string, kinds: readonly string[], includeLinked = false): AsyncGenerator<Photo> {
  for (const kind of kinds) {
    const ids = await readdir(join(root, kind)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return [] as string[]
    })
    for (const id of ids.sort()) {
      const raw = await readFile(join(root, kind, id, 'entity.json'), 'utf8').catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT') return undefined
        throw e
      })
      if (raw === undefined) continue
      const page = JSON.parse(raw) as Parameters<typeof documentPhotos>[0]
      yield* includeLinked ? documentPhotos(page) : page.photos ?? []
    }
  }
}

/** Photos shared across pages, albums, guides and glossary terms. */
export async function* photoPlacements(root: string): AsyncGenerator<Photo> {
  yield* entityPhotos(root, ['species', 'plants', 'breeds', 'guides', 'glossary'], true)
  const galleries = join(root, 'gallery')
  const files = await readdir(galleries).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return [] as string[]
  })
  for (const file of files.filter(f => f.endsWith('.json')).sort()) {
    const album = JSON.parse(await readFile(join(galleries, file), 'utf8')) as { photos?: Photo[] }
    yield* album.photos ?? []
  }
  const equipment = join(root, 'equipment')
  const equipmentFiles = await readdir(equipment, { recursive: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error
    return [] as string[]
  })
  for (const file of equipmentFiles.filter(f => f.endsWith('.json')).sort()) {
    yield* documentPhotos(JSON.parse(await readFile(join(equipment, file), 'utf8')) as Parameters<typeof documentPhotos>[0])
  }
}

/** Attribute a bare original to the whole-photo refusal on its altered placement. */
export async function originalPhotoRefusals(root: string, refused: (url: string) => string | undefined): Promise<Map<string, Set<string>>> {
  const originals = new Map<string, Set<string>>()
  for await (const p of photoPlacements(root)) {
    const [, original] = deadScreenPhotoUrls(p)
    if (!original) continue
    const cause = refused(p.url)
    if (!cause) continue
    const causes = originals.get(original) ?? new Set<string>()
    causes.add(cause)
    originals.set(original, causes)
  }
  return originals
}

/** A whole-photo refusal also follows its original when another placement stores that original separately. */
export async function expandWholePhotoRejections(
  root: string, rejections: Record<string, string>, marks?: Record<string, { retainedOwnMark?: unknown }>,
): Promise<Record<string, string>> {
  if (!Object.values(rejections).some(why => why && !isVersionRejection(why))) return rejections
  const effective = photoRejections(rejections, marks)
  const originals = await originalPhotoRefusals(root, url => {
    const entry = effective(url)
    return entry && entry[1] !== CREDIT_HOLD_REJECTION && !isVersionRejection(entry[1]) ? entry[0] : undefined
  })
  const added: Record<string, string> = {}
  for (const [url, causes] of originals) {
    const prior = effective(url)?.[1]
    const reasons = [...causes].map(cause => rejections[cause]!)
    const independent = reasons.find(reason => !reason.startsWith('watermark:'))
    const reason = independent ?? reasons[0]
    if (reason && maySupersedePhotoRefusal(prior, reason)) added[url] = reason
  }
  return Object.keys(added).length ? { ...rejections, ...added } : rejections
}

export async function ownDeadPhotoUrls(root: string, kinds: readonly string[] = ['species', 'plants']): Promise<Set<string>> {
  const urls = new Set<string>()
  for await (const photo of entityPhotos(root, kinds)) for (const url of deadScreenPhotoUrls(photo)) urls.add(url)
  return urls
}

/** The loader can still use a fallback after a face verdict blocks the stored alteration. */
export async function facePhotoStatus(root: string, faces?: Record<string, unknown>, kinds: readonly string[] = ['species', 'plants', 'guides']) {
  const unread = new Set<string>(), altered = new Set<string>()
  if (!faces) return { unread, altered }
  for await (const photo of entityPhotos(root, kinds)) {
    const versions = deadScreenPhotoUrls(photo)
    for (const url of versions) {
      if (!Object.hasOwn(faces, url)) unread.add(url)
      else if (versions.length > 1 && typeof faces[url] === 'number' && Number(faces[url]) > 0) altered.add(url)
    }
  }
  return { unread, altered }
}

export type DeadLookRecords = { screen: Record<string, unknown>; check?: Record<string, unknown>; subjects?: Record<string, unknown>; secondLook?: Record<string, unknown> }

const photoCheckAnswers = new Set(['yes', 'other', 'none', 'habitat', 'unsure', 'dead', 'no'])
const answeredByCheck = (verdict: unknown): boolean => {
  if (!verdict || typeof verdict !== 'object') return false
  const { ok, logo } = verdict as { ok?: unknown; logo?: unknown }
  return typeof ok === 'string' && photoCheckAnswers.has(ok) && typeof logo === 'boolean'
}

/** A complete check answer from the version that asked about dead fish, marked by its `logo` answer since 5 Nov 2026. */
export function askedByCheckOf(check: Record<string, unknown> = {}, subjects: Record<string, unknown> = {}): Set<string> {
  const asked = new Set<string>()
  for (const [u, v] of Object.entries(check)) if (answeredByCheck(v)) asked.add(u)
  for (const [u, by] of Object.entries(subjects)) if (by && typeof by === 'object' && Object.values(by).some(answeredByCheck)) asked.add(u)
  return asked
}

export const completedDeadVerdict = (record: unknown): record is { dead: boolean } =>
  typeof (record as { dead?: unknown } | null | undefined)?.dead === 'boolean'

/**
 * Whether a look has judged a photo for a dead fish (the chief of staff, 22 Nov 2026): the dead-fish screen's verdict, a
 * photo-check verdict that asked (`askedByCheckOf`), or a person's look on its second-look record (a clear counts). How
 * the photo came onto its page doesn't matter: on 22 Nov a pages run begun on the code from before the screen read 111
 * new photos into the face finder's record, and the screen, which then owed only photos new to that record, never would
 * have looked at them. One rule for the engine and the build: the faces step's screen owes every own photo of a fish or
 * plant page this doesn't pass (the engine's faces.ts), and a public build doesn't show one (load.ts), whatever the owed
 * list says, so a list that is behind can't let one through.
 */
export function deadLooked(r: DeadLookRecords): (url: string) => boolean {
  const asked = askedByCheckOf(r.check, r.subjects)
  return url => completedDeadVerdict(r.screen[url]) || asked.has(url) ||
    (!!r.secondLook && Object.hasOwn(r.secondLook, url) && !!photoLookAnswer(r.secondLook[url]))
}
/** A second look is answered only with a decision, a reviewer and a dated record. */
export function photoLookAnswer(record: unknown): { said: 'agree' | 'clear'; by: string; on: string } | undefined {
  const look = (record as { look?: { said?: unknown; by?: unknown; on?: unknown } } | undefined)?.look
  if (!look || (look.said !== 'agree' && look.said !== 'clear') || typeof look.by !== 'string' || !look.by.trim() ||
      typeof look.on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(look.on)) return undefined
  return { said: look.said, by: look.by, on: look.on }
}

/** Commons mirrors resize the same file. Other source IDs can name different crops, which need their own results. */
export function photoVersionAddressSet(urls: Iterable<string>): (url: string) => boolean {
  const exact = new Set(urls)
  const commons = (url: string) => photoKey(url)?.startsWith('commons/') === true
  const resized = photoAddressSet([...exact].filter(commons))
  return url => exact.has(url) || (commons(url) && resized(url))
}

/** A completed decision at the requested address takes precedence over a clear on the same Commons file. */
export function photoClears(records: Record<string, unknown> = {}): (url: string) => boolean {
  const clears = photoVersionAddressSet(Object.keys(records).filter(url => photoLookAnswer(records[url])?.said === 'clear'))
  return url => {
    const decision = Object.hasOwn(records, url) ? photoLookAnswer(records[url]) : undefined
    return decision ? decision.said === 'clear' : clears(url)
  }
}

type LookMark = { why?: unknown; off?: boolean; left?: unknown; settled?: unknown; waitingReasons?: unknown; originals?: unknown }

function unansweredHold(record: unknown): boolean {
  const mark = record as LookMark | undefined
  return typeof mark?.why === 'string' && !!mark.why && mark.off !== true && !photoLookAnswer(mark)
}

/** An unanswered hold stays with the photo when its source is mirrored. */
export function photoHolds(records: Record<string, unknown> = {}): (url: string) => boolean {
  const held = photoAddressSet(Object.keys(records).filter(url => unansweredHold(records[url])))
  return url => Object.hasOwn(records, url) ? unansweredHold(records[url]) : held(url)
}

/** A first-refusal mark is durable before its rejection entry is written. */
function photoFirstOff(records: Record<string, unknown> = {}): (url: string) => boolean {
  return photoAddressSet(Object.entries(records).flatMap(([url, record]) => {
    const mark = record as LookMark | undefined
    if (mark?.off !== true || typeof mark.why !== 'string' || photoLookAnswer(mark)?.said === 'clear') return []
    return [url, ...(Array.isArray(mark.originals) ? mark.originals.filter(u => typeof u === 'string') : [])]
  }))
}

/** A face found on one version of a photo disqualifies that URL, subject to its second look. */
export function facePhotoOff(url: string, faces?: Record<string, unknown>, secondLook?: Record<string, unknown>, cleared = photoClears(secondLook), held = photoHolds(secondLook)): boolean {
  const count = faces?.[url]
  return typeof count === 'number' && count > 0 && !cleared(url) && !held(url)
}

/** One place has already published its clear. A later pending place must not put the whole URL back on the list. */
export function settledWaiting(reason: unknown, record: unknown): boolean {
  const mark = record as LookMark | undefined
  return typeof reason === 'string' && reason.startsWith('waiting:') && typeof mark?.why === 'string' &&
    Array.isArray(mark.settled) && mark.settled.length > 0 &&
    (reason === mark.why.replace(/^[^:]+:/, 'waiting:') ||
      (Array.isArray(mark.waitingReasons) && mark.waitingReasons.some(why =>
        typeof why === 'string' && reason === why.replace(/^[^:]+:/, 'waiting:'))) ||
      [...mark.settled, ...(Array.isArray(mark.left) ? mark.left : [])].some(p =>
        typeof p?.captureWhy === 'string' && reason === p.captureWhy.replace(/^[^:]+:/, 'waiting:'))) &&
    photoLookAnswer(mark)?.said === 'clear'
}

/**
 * A waiting rejection remains in force when its mark is missing. A recorded dead verdict holds its URL even if the
 * file it came from still needs to preserve a different fallback version. A last-photo hold or a person's clear can
 * keep a dead verdict from taking effect.
 */
export function deadPhotoOff(url: string, screen?: Record<string, unknown>, secondLook?: Record<string, unknown>, rejected?: PhotoRejection, cleared = photoClears(secondLook), held = photoHolds(secondLook), firstOff = photoFirstOff(secondLook)): boolean {
  const rejection = rejected?.(url)
  const why = rejection?.[1]
  const mark = secondLook?.[rejection?.[0] ?? url] as LookMark | undefined
  if (settledWaiting(why, mark)) return false
  if (typeof why === 'string' && (why.startsWith('dead:') || why.startsWith('people:') || why.startsWith('waiting:'))) return true
  if (cleared(rejection?.[0] ?? url)) return false
  if (firstOff(url)) return true
  const verdict = screen?.[url] as { dead?: unknown } | undefined
  return verdict?.dead === true && !held(rejection?.[0] ?? url)
}

export type PhotoWaitRecords = {
  watermarks?: Record<string, PhotoScreenEntry>
  owed?: Record<string, unknown>
  unread?: ReadonlySet<string>
  faces?: Record<string, unknown>
  unjudged?: ReadonlySet<string>
  lookedForDead?: (url: string) => boolean
  check?: Record<string, unknown>
  subjects?: Record<string, unknown>
  deadScreen?: Record<string, unknown>
  secondLook?: Record<string, unknown>
  rejected?: PhotoRejection
}

/** The screen records that can withhold a selected photo version, wherever its address is used. */
export function photoWaitsFor(r: PhotoWaitRecords): (url: string) => boolean {
  const directWaits = new Set([...Object.keys(r.owed ?? {}), ...(r.unjudged ?? [])])
  const owesLook = photoAddressSet(directWaits)
  const lookedForDead = r.lookedForDead ?? (url =>
    completedDeadVerdict(r.deadScreen?.[url]) || !!photoLookAnswer(r.secondLook?.[url]))
  const cleared = photoClears(r.secondLook)
  const held = photoHolds(r.secondLook)
  const firstOff = photoFirstOff(r.secondLook)
  const directFaces = new Set(Object.keys(r.faces ?? {}).filter(url => facePhotoOff(url, r.faces, r.secondLook, cleared, held)))
  const faceWaits = photoAddressSet([...(r.unread ?? []), ...directFaces])
  const refusedByCheck = new Set<string>()
  for (const url of new Set([...Object.keys(r.check ?? {}), ...Object.keys(r.subjects ?? {})])) {
    const by = r.subjects?.[url]
    const verdicts = [r.check?.[url], ...(by && typeof by === 'object' ? Object.values(by) : [])] as
      ({ logo?: unknown; ok?: unknown; person?: unknown } | null | undefined)[]
    if (verdicts.some(v => v?.logo === true) && verdicts.some(v => v?.ok === 'dead' || v?.person === true)) refusedByCheck.add(url)
  }
  return url => {
    const entry = r.rejected?.(url)
    if (entry && !entry[1].startsWith('watermark:')) return true
    if (r.watermarks) {
      if (awaitsScreen(url, r.watermarks[url])) return true
      if (entry && !retainedOwnMark(url, r.watermarks[url]) && !retainedOwnMark(entry[0], r.watermarks[entry[0]])) return true
    }
    const waitsForFace = directFaces.has(url) || r.unread?.has(url) || (!Object.hasOwn(r.faces ?? {}, url) && faceWaits(url))
    // The photo check writes the whole-photo watermark reason. Its independent dead/person result still applies
    // after a shop-mark waiver, pending an applicable review.
    const review = r.secondLook?.[url] as LookMark | undefined
    const clearedRefusal = typeof review?.why === 'string' && /^(?:dead|people): /.test(review.why) &&
      photoLookAnswer(review)?.said === 'clear'
    const refusedVersion = refusedByCheck.has(url) && !held(url) && !clearedRefusal
    return directWaits.has(url) || (owesLook(url) && !lookedForDead(url)) || waitsForFace || refusedVersion ||
      deadPhotoOff(url, r.deadScreen, r.secondLook, r.rejected, cleared, held, firstOff)
  }
}

/**
 * More own photos of fish and plant pages than this with no dead-fish look is a lost or damaged record, not a run's new
 * photos: the site's build fails rather than publish its pages without them (the chief of staff's number for the face
 * finder's record, 21 Nov, taken for this on 22 Nov). A run leaves none once its faces step has run; on 22 Nov 111 came
 * from one run; lost photo-check records would leave about 5,200 of the 6,145 (the screen had judged 916). A missing
 * screen record fails the site's build by itself.
 */
export const UNJUDGED_DEAD_LIMIT = 300
