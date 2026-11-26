import { completedDeadVerdict, deadScreenPhotoUrls, rejectedEntry, type Photo } from '@aq/schema'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LlmError } from './claude'
import { askedByCheck, type DeadScreenDeps, type DeadVerdict } from './dead-screen'
import { entriesDir, holdForSecondLook, looks, notePlaces, placesIn, readSecondLook, waitingEntry, type Stood } from './last-photo'
import { compactRejection, compactVerdict, GUIDE_BACKLOG_FLAG, photoFailure, photoModelStop } from './photo-observations'
import { writePhotoState } from './photo-state'
import { replacePhotoDocument, writeImageCache } from './image-cache-write'
import { shouldStripPhoto } from './watermarks'
import { contactSheet, type PartPhotosOff } from './video-images'

/**
 * The dead-or-food rule, in the words both looks ask it in: this screen's sheets and the guides' photo check
 * (guide-photos.ts), which asks it of each new picture it looks at.
 */
export const DEAD_RULE = `dead: true if it shows a dead fish, shrimp, snail or other dead animal, or one that looks dead: lying still on its side, in a bottle or a dish with no water to swim in, laid out flat for a photo; a preserved, mounted, museum or lab specimen; a fish lying out of the water on a surface, alive or not (say "out of water" in the note); or fish, shrimp or snails as food where an animal can be made out: a whole fish, shrimp bodies, heads, a heap of them. Not dead: an empty shell, even laid out on a board; a part of an animal alone, such as a spine, a scale, a bone or a fin; a picture through a microscope, such as a parasite, a worm or an egg; food where no animal can be made out: cut meat, cubes, mince, mash, pellets, flakes and processed food such as fish sticks; a cloud of live food (daphnia, brine shrimp or other small live food); worms; a live fish beside its food; a fish resting on the bottom in water; a live fish in a photo tank or against a white background; a live animal in water or held for a moment; a drawing, painting or graphic.`
export const GUIDE_DEAD_PROMPT = `Each numbered tile is a photo or a video frame from an aquarium handbook's guide. For each tile:
- ${DEAD_RULE}
- note: a few words on what it shows (for dead: what makes it so, e.g. "two fish lying flat in bottles").
Answer every tile, by its number.`

export const GUIDE_BACKLOG_PER_SHEET = 6

type Kind = 'photo' | 'stock' | 'frame'
const ORDER: Kind[] = ['photo', 'stock', 'frame']
type Place = { file: string; guide: string; kind: Kind; fig?: number; t?: number; sourceUrl?: string }
type GuidePhoto = Parameters<typeof deadScreenPhotoUrls>[0] & { sourceUrl?: string }
type Guide = { photos?: GuidePhoto[]; video?: { figures?: { heading?: string; photo?: GuidePhoto; moments?: { url: string; t: number }[] }[] } }
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, (error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error
  return undefined
})
const indentOf = (raw: string) => /^\{\n( +)"/.exec(raw)?.[1]?.length ?? 0
const hashed = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`

/** Every guide's pictures, where each stands: its own photos, then its parts' stock photos and frames. */
async function guidePlaces(root: string): Promise<Map<string, Place[]>> {
  const out = new Map<string, Place[]>()
  const put = (url: string | undefined, place: Place) => { if (url) out.set(url, [...(out.get(url) ?? []), place]) }
  const dir = join(root, 'content', 'guides')
  for (const guide of (await readdir(dir).catch(() => [] as string[])).sort()) {
    const file = join(dir, guide, 'entity.json')
    const e = await readJson<Guide>(file)
    for (const p of e?.photos ?? []) for (const url of deadScreenPhotoUrls(p)) put(url, { file, guide, kind: 'photo' })
    for (const [fig, f] of (e?.video?.figures ?? []).entries()) {
      if (f.photo) for (const url of deadScreenPhotoUrls(f.photo)) put(url, { file, guide, kind: 'stock', fig, sourceUrl: f.photo.sourceUrl })
      for (const m of f.moments ?? []) put(m.url, { file, guide, kind: 'frame', fig, t: m.t })
    }
  }
  return out
}

/**
 * Takes each picture `dead` names (its address → the model's note) off every guide that shows it, at its first verdict,
 * marked for a second look and restorable until a person has looked (last-photo.ts), with its waiting entry on the
 * never-again list:
 * - a guide's own photo, off its photos;
 * - a stock photo, off its part, with its Commons page on the part-photo list for that guide (video-images.ts), hashed
 *   (`sha256:`), so a rewrite doesn't pick it again and no page's name is written out;
 * - a frame, off its part's frames, on the part-photo list by its address with its second, for that guide.
 * Every reason written is hashed, never the model's note. A picture no guide shows, one a second look already holds or
 * cleared, and one the photo check asked about a dead fish on a fish page (its verdict there stands, as this screen
 * doesn't ask those) are left alone. A part left with no picture stays so, with no hold (the chief of staff, 22 Nov):
 * no step gives an existing guide's part a new picture (video-images.ts writes a guide's parts once), and the next step
 * that strips the guide's photos drops the empty part, which the put-back brings back under its heading. `bare` names
 * each. `step` names the look in its record.
 */
export async function takeOffGuidesDead(root: string, dead: Map<string, string>, step: string, reason = 'dead'): Promise<{ off: string[]; bare: string[] }> {
  const report = { off: [] as string[], bare: [] as string[] }
  if (!dead.size) return report
  const state = (f: string) => join(root, 'engine-state', f)
  const reviews = await readSecondLook(root)
  const sl = looks(reviews)
  const where = await guidePlaces(root)
  const asked = await askedByCheck(root)
  const rejected = (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {}
  const isListed = rejectedEntry(rejected)
  const going = [...dead].filter(([u]) => {
    if (!where.has(u) || asked.has(u)) return false
    const existing = isListed(u)?.[1]
    const review = reviews[u]
    const allowed = !existing || existing.startsWith('watermark:')
    if (!review?.off) return sl.open(u) && allowed
    const guideReview = (review.step === 'the guide photo check' && review.why.startsWith('dead:')) ||
      (review.step === 'the dead-fish screen' && review.why.startsWith(`${GUIDE_BACKLOG_FLAG}:`))
    return guideReview && sl.off(u) && !sl.clearedPhoto(u) && (allowed || existing === waitingEntry(review.why))
  })
  if (!going.length) return report
  const partsFile = state('_part-photos-off.json')
  const parts = (await readJson<PartPhotosOff>(partsFile)) ?? {}
  const hold = new Map<string, { why: string; pages: string[]; off: true; parts?: string[] }>()
  const files = new Map<string, Place[]>()
  let partsChanged = false
  for (const [url, note] of going) {
    const places = where.get(url)!
    const prior = sl.off(url) ? reviews[url] : undefined
    const why = prior?.why ?? `${reason}: ${note} (${step})`
    const guides = [...new Set(places.map(p => p.guide))].sort()
    hold.set(url, { why, pages: guides.map(g => `guides/${g}`), off: true })
    rejected[url] ??= waitingEntry(why)
    if (!prior) report.off.push(`${url}: ${guides.map(g => `guides/${g}`).join(', ')}`)
    for (const p of places) {
      files.set(p.file, [...(files.get(p.file) ?? []), p])
      const key = p.kind === 'stock' ? (p.sourceUrl ? hashed(p.sourceUrl) : undefined) : p.kind === 'frame' ? url : undefined
      if (!key) continue
      // On its record too, so a clear lifts it whether or not the picture can go back (last-photo.ts putBackCleared).
      const h = hold.get(url)!
      h.parts = [...new Set([...(h.parts ?? []), key])]
      const had = parts[key]
      const photoKey = hashed(url)
      const holds = { ...had?.holds, [photoKey]: [...new Set([...(had?.holds?.[photoKey] ?? []), p.guide])].sort() }
      const manualGuides = had?.manualGuides ?? (!had?.holds && !had?.agreedGuides ? had?.guides : undefined)
      parts[key] = {
        ...had, why: had?.why ?? compactRejection(why), holds,
        ...(manualGuides?.length ? { manualGuides } : {}),
        ...(had && !had.guides ? {} : { guides: [...new Set([...(had?.guides ?? []), p.guide])].sort() }),
        ...(p.kind === 'frame' ? { seconds: [...new Set([...(had?.seconds ?? []), p.t!])].sort((a, b) => a - b) } : {}),
      }
      partsChanged ||= JSON.stringify(parts[key]) !== JSON.stringify(had)
    }
  }
  // A flag and the source exclusion must survive even if the private entry cannot be written yet.
  await holdForSecondLook(root, hold, step)
  await writePhotoState(state('_photo-rejected.json'), rejected)
  if (partsChanged) await writeImageCache(partsFile, `${JSON.stringify(parts, null, 2)}\n`)
  const off = new Set(going.map(([u]) => u))
  const recovery = new Map<string, Stood[]>()
  const edits = new Map<string, string>()
  // Without private recovery, keep the content entry for a clear. The durable flag hides it in the build.
  if (entriesDir()) for (const [file, places] of files) {
    const raw = await readFile(file, 'utf8')
    const e = JSON.parse(raw) as Guide
    const remove = (photo: GuidePhoto) => shouldStripPhoto(photo as Photo, url => off.has(url), (_stored, original, blocked) =>
      off.has(original) || sl.pendingOff(original) || (!blocked && (!isListed(original) || sl.clearedPhoto(original))),
    )
    placesIn(root, file, e, (url, slot) => slot.path?.[3] === 'moments' ? off.has(url) : remove(slot.photo as Photo), recovery)
    const before = JSON.stringify(e)
    if (e.photos) e.photos = e.photos.filter(p => !remove(p))
    for (const fig of new Set(places.flatMap(p => p.fig === undefined ? [] : [p.fig]))) {
      const f = e.video?.figures?.[fig]
      if (!f) continue
      if (f.photo && remove(f.photo)) delete f.photo
      if (f.moments) f.moments = f.moments.filter(m => !off.has(m.url))
      if (!f.photo && !f.moments?.length) report.bare.push(`guides/${places[0]!.guide}: part ${fig + 1}`)
    }
    if (before !== JSON.stringify(e)) edits.set(file, `${JSON.stringify(e, null, indentOf(raw))}\n`)
  }
  await notePlaces(root, recovery)
  for (const [url, stood] of recovery) {
    if (sl.off(url)) report.off.push(`${url}: ${[...new Set(stood.map(place => place.file.split('/').slice(1, 3).join('/')))].join(', ')}`)
  }
  for (const [file, data] of edits) await replacePhotoDocument(file, data)
  return report
}

/**
 * The dead-fish question on guides (the chief of staff, 22 Nov 2026): each guide's own photos, then its video parts'
 * stock photos, then the frames cut from its video, that nothing has asked about a dead fish (not this screen, not the
 * guides' photo check, not the photo check, which asks a fish page's photos), `limit` pictures a run, six to a sheet.
 * The faces step takes them after the new photos it owes a look (faces.ts); the frames, which Curation looked at once
 * on 21 Nov, are this screen's second look at them. Each dead one comes off as `takeOffGuidesDead` takes it.
 *
 * A guide's rule is the chief of staff's of 21 and 22 Nov (`DEAD_RULE`): food comes off only where an animal can be made
 * out in it (a whole fish, shrimp bodies, heads, a heap of them), and a fish out of water on a surface comes off as out of
 * water; cut meat, mince, mash, pellets and processed food, an empty shell, a part of an animal alone, a picture through
 * a microscope, a live fish in a photo tank or against white, a cloud of live food and worms stay.
 */
export async function screenGuidesDead(root: string, d: DeadScreenDeps, o: { limit: number; more?: () => boolean }) {
  const state = (f: string) => join(root, 'engine-state', f)
  const cache = (await readJson<Record<string, DeadVerdict>>(state('_dead-screen.json'))) ?? {}
  const rejected = (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {}
  const looked = (await readJson<Record<string, { dead?: boolean }>>(state('_photo-guides.json'))) ?? {}
  const asked = await askedByCheck(root)
  const report = { sheets: 0, judged: 0, off: [] as string[], bare: [] as string[], failed: [] as string[], left: 0, stopped: '', reserved: false }

  const kindOf = (places: Place[]) => ORDER.find(k => places.some(p => p.kind === k))!
  const places = await guidePlaces(root)
  const todo = [...places]
    .filter(([url]) => !completedDeadVerdict(cache[url]) && !(url in rejected) && !asked.has(url) && typeof looked[url]?.dead !== 'boolean')
    .map(([url, places]) => ({ url, kind: kindOf(places) }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
  const batch = todo.slice(0, Math.max(0, o.limit))
  const dead = new Map([...places.keys()].flatMap(url => cache[url]?.dead === true ? [[url, cache[url]!.note] as const] : []))
  const tmp = await mkdtemp(join(tmpdir(), 'guides-dead-'))
  try {
    for (let i = 0; i < batch.length && !report.stopped; i += GUIDE_BACKLOG_PER_SHEET) {
      // `more`: room for another sheet (faces.ts keeps the new photos' share of the line).
      if (o.more && !o.more()) { report.reserved = true; break }
      const ok: { url: string; b: Buffer }[] = []
      for (const it of batch.slice(i, i + GUIDE_BACKLOG_PER_SHEET)) {
        try { ok.push({ url: it.url, b: Buffer.from(await d.get(it.url)) }) } catch (err) { report.failed.push(`${it.url}: ${photoFailure(err)}`) }
      }
      if (!ok.length) continue
      try {
        const sheet = join(tmp, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 400, 260, 4, 'contain'))
        const v = await d.look(sheet, GUIDE_DEAD_PROMPT)
        report.sheets++
        const answers = new Map<number, { dead: boolean; note: string }>()
        const conflicts = new Set<number>()
        for (const t of v.tiles ?? []) {
          if (!Number.isInteger(t.n) || !ok[t.n - 1] || typeof t.dead !== 'boolean') continue
          const prior = answers.get(t.n)
          if (prior && prior.dead !== t.dead) conflicts.add(t.n)
          else if (!prior) answers.set(t.n, { dead: t.dead, note: String(t.note ?? '').slice(0, 120) })
        }
        for (const [n, answer] of answers) {
          if (conflicts.has(n)) continue
          const { url } = ok[n - 1]!
          cache[url] = compactVerdict(answer)
          report.judged++
          if (answer.dead) dead.set(url, cache[url]!.note)
        }
      } catch (err) {
        if (err instanceof LlmError) report.stopped = photoModelStop(err)
        else report.failed.push(`sheet ${i / GUIDE_BACKLOG_PER_SHEET}: ${photoFailure(err)}`)
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
  report.left = todo.length - report.judged
  if (report.judged) await writePhotoState(state('_dead-screen.json'), cache)
  Object.assign(report, await takeOffGuidesDead(root, dead, 'the dead-fish screen', GUIDE_BACKLOG_FLAG))
  return report
}
