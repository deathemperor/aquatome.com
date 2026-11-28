import { piece } from './pieces'
import { compactVerdict, photoReason, photoFailure, photoModelStop, type PhotoHints } from './photo-observations'
import { recordPhotoRefusals, writePhotoState } from './photo-state'
import { holdablePhotoVerdicts, pruneGuideLegacyUses, readReviewedPhotoVersion, versionRejection } from './photo-visibility'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import sharp from 'sharp'
import { deadScreenPhotoUrls, expandWholePhotoRejections, guideLooked, GUIDE_LOOKS_FILE, PHOTO_SCREEN_FILE, photoAddressSet, photoRejections, retainedOwnMark, stillShown, subjectForGuide, type Photo, type PhotoScreenEntry } from '@aq/schema'
export { guideSubject } from '@aq/schema'
import { LlmError } from './claude'
import { contactSheet, stillDone } from './video-images'
import type { StillsState } from './video-stills'
import { stripPhotos } from './watermarks'
import { holdForSecondLook, looks, readSecondLook, verdictAddressSet } from './last-photo'
import { DEAD_RULE, takeOffGuidesDead } from './guides-dead'

/**
 * No people and no logos in the pictures the subject check (photo-check.ts) doesn't look at: every guide's photos (the
 * lead and those set under its headings) and its video sections' photos, and the equipment guides' photos. Before
 * this, a guide photo had only the face detector (it misses hands, and a person seen from behind) and the watermark
 * step, whose model looks only where macOS Vision reads text and calls a product's own label part of the scene. Found
 * by a design review (2026-11-07): hands planting a sword plant leading one guide, a person siphoning a tank leading
 * another, and an Aquarium Co-op test-strip bottle in the betta setup guide; 5,960 of 6,428 guide pictures had never
 * had a model look for a mark, and none for people.
 *
 * The model answers per photo, 6 to a sheet (a faint signature needs the size): a person or any part of one (PRODUCT.md:
 * "Photos never show people (hands count)"); a mark added on the photo; a shop's or dealer's brand in it, on its own-brand
 * products too (governance: no "dealer logos"; a maker's brand on its own product is fine). A person or a mark is the photo's: it leaves every guide and equipment guide and joins
 * `_photo-rejected.json` ("people: …", "watermark: …"), which the photo steps respect, so a source re-read doesn't bring
 * it back and the faces and subject steps take it off any other page. A brand leaves the guides ("logo: …"), and is kept
 * on an equipment guide, whose subject is the product. Each photo is judged once (`engine-state/_photo-guides.json`, URL
 * → verdict); one that can't be fetched is tried again next run. Leads first, since they are the guide's card too.
 *
 * A video guide's stills (its "Trong video" frames) too, ahead of the guides' other photos, since a still shows only with
 * a verdict on it (`stillShown`): teaching videos show hands planting and siphoning. A person or a mark takes a still off
 * its guide and onto the blocklist; a brand in a still's scene is recorded, not acted on; any other still gets `person:
 * false` in its guide. A still is judged once video-stills.ts won't change it again (`stillDone`) and it could show (it
 * passes the other bars), so a tile about to be replaced at a new address isn't judged twice, and a still taken off is one
 * it never brings back. video-stills.ts asks the same of the frames it makes, before they are uploaded.
 *
 * On a guide about one kind of fish or plant (`guideSubject`: not a how-to with stock tank shots, a tank-mates list or a
 * guide naming several), the same call also asks, with the guide's title, whether a photo plainly shows another kind:
 * fish with fish, plant with plant (`other`, per subject: a photo may be right on another guide, so it leaves this guide and joins no blocklist, and each run takes it off again if
 * a re-read brings it back). The owner's report (2026-11-10): arowanas and a corydoras on the platy guide. A photo judged
 * before this was asked is asked again, once, keeping its verdict. A still isn't asked: it's the guide's own video.
 *
 * The same call asks whether a picture shows a dead fish or fish as food (`dead`, guides-dead.ts's rule, the chief of
 * staff, 22 Nov 2026), of each picture it looks at for the first time; a photo asked again for its subject keeps the
 * verdict it had, and the pictures this check judged before the question, the faces step's backlog asks (guides-dead.ts).
 * A dead one this run's answers name comes off every guide that shows it as `takeOffGuidesDead` takes it, off at its
 * first verdict and restorable until a person has looked, unless a person, a mark or a brand takes it off first (those
 * are the photo's for good). An equipment guide's photo is asked too, and its answer kept, but only a guide's pictures
 * come off. A still whose verdict says dead isn't cleared to show until its second look clears it.
 */
export type GuidePhotoVerdict = { person: boolean; mark: boolean; brand: boolean; note: string; noteHash?:string; hints?:PhotoHints; other?: Record<string, boolean>; dead?: boolean; answeredSubjects?: string[] }
export type GuidePhotoDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ photos: ({ n: number; other?: boolean; dead?: boolean } & Omit<GuidePhotoVerdict, 'other' | 'dead'>)[] }>
}
export const GUIDE_PHOTO_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'person', 'mark', 'brand', 'dead', 'note'], properties: { n: { type: 'number' }, person: { type: 'boolean' }, mark: { type: 'boolean' }, brand: { type: 'boolean' }, note: { type: 'string' }, other: { type: 'boolean' }, dead: { type: 'boolean' } } } } },
}
export const GUIDE_PHOTO_PROMPT = `Numbered photos and video frames from an aquarium handbook's guides. For each photo n:
- person: true if a person or any part of one is in it: a hand or fingers (planting, holding, pointing, working in the tank), an arm, a foot, a face, a body seen from behind, even small, cut off at the edge, blurred or behind the glass; false if not.
- mark: true if a logo, watermark, signature, credit, web address or caption was added on top of the photo after it was taken, even small or faint, in a corner, in any script, with or without letters; false if not.
- brand: true if a shop's or dealer's logo or name can be read or recognised in the photo: on a product it sells under its own name (such as an Aquarium Co-op bottle), a bag, a box, a sign or a price tag; false for a maker's own brand on its own product (Seachem, API, Fluval, Tetra, Oase and the like), for a product with no brand in view, and for text that isn't a brand.
- note: a few words on what it shows and, for each true, what and where (e.g. "hands planting a sword plant in gravel"; "Aquarium Co-op logo on a test-strip bottle").
- ${DEAD_RULE}
Answer every photo, by its number.`
const GUIDE_SUBJECT_PROMPT = `Some of these photos come from a guide about one kind of fish or plant. Each is listed below with that kind and the guide's title. For each photo listed, also answer:
- other: true only if the photo is plainly of a different kind from the one named: on a guide about a fish, shrimp or snail, another fish, shrimp or snail; on a guide about a plant, another plant. Say what it shows in note. False if it shows the named kind in any variety or colour, or if you can't tell. False for anything the title names or suggests (tank mates, food, fish eating it), for a plant on a fish guide or a fish on a plant guide, and for a tank, a layout, equipment, water or a diagram.`
export const PER_SHEET = 6

type About = { subject: string; title: string }
type Item = { url: string; lead: boolean; equipment: boolean; still: boolean; wanted: boolean; subjects: About[] }
type Guide = { kind?: string; source?: string; photos?: Photo[]; video?: { title?: string; figures?: { photo?: Photo; moments?: { t: number; url: string; width: number; height: number; sharpness?: number; person?: boolean }[] }[] } }
type Equipment = { hero?: { url: string }; types?: { photo?: { url: string } }[] }
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) await f(items[next++]!) }))
}

/** Why a photo leaves a guide, or undefined; `brandKept`: an equipment guide's (the brand is the product's) or a video still. */
export function guidePhotoOff(v: GuidePhotoVerdict | undefined, brandKept: boolean, ownMarkKept = false): string | undefined {
  if (!v) return undefined
  return v.mark && !ownMarkKept ? `watermark: ${photoReason(v)}` : v.brand && !brandKept ? `logo: ${photoReason(v)}` : v.person ? `people: ${photoReason(v)}` : undefined
}

/** The model's verdict on each image (at most PER_SHEET), in order; one it didn't answer is undefined. `subjects`: each image's guide's subject, if it's to be asked about. */
export async function judgeGuidePhotos(images: Buffer[], sheet: string, look: GuidePhotoDeps['look'], subjects: (About | undefined)[] = []): Promise<(GuidePhotoVerdict | undefined)[]> {
  await writeFile(sheet, await contactSheet(images, 640, 480, 2, 'contain'))
  const out: (GuidePhotoVerdict | undefined)[] = images.map(() => undefined)
  const asked = subjects.flatMap((s, i) => (s ? [`- Photo ${i + 1} (${s.subject}): "${s.title}"`] : []))
  const prompt = asked.length ? `${GUIDE_PHOTO_PROMPT}\n${GUIDE_SUBJECT_PROMPT}\n${asked.join('\n')}` : GUIDE_PHOTO_PROMPT
  const conflicts = new Set<number>()
  for (const p of (await look(sheet, prompt)).photos ?? []) {
    const index = p.n - 1
    if (!Number.isInteger(index) || index < 0 || index >= out.length || conflicts.has(index) ||
        typeof p.person !== 'boolean' || typeof p.mark !== 'boolean' || typeof p.brand !== 'boolean' || typeof p.dead !== 'boolean') continue
    const about = subjects[index]
    const other = about && typeof p.other === 'boolean' ? p.other : undefined
    const previous = out[index]
    if (previous && (previous.person !== p.person || previous.mark !== p.mark || previous.brand !== p.brand ||
        previous.dead !== p.dead || (about && previous.other?.[about.subject] !== other))) {
      conflicts.add(index)
      out[index] = undefined
      continue
    }
    out[index] ??= compactVerdict({ person: p.person, mark: p.mark, brand: p.brand, dead: p.dead, note: String(p.note ?? '').slice(0, 120),
      ...(about && other !== undefined ? { other: { [about.subject]: other }, answeredSubjects: [about.subject] } : {}),
    })
  }
  return out
}

/** `only`: the model looks at these guides' pictures alone; what's already judged is still applied everywhere. */
export async function screenGuidePhotos(root: string, d: GuidePhotoDeps, o: { limit: number; parallel?: number; only?: string[] }) {
  const content = join(root, 'content')
  const state = (f: string) => join(root, 'engine-state', f)
  const oldCache = (await readJson<Record<string, GuidePhotoVerdict>>(state(GUIDE_LOOKS_FILE))) ?? {}
  const cache = Object.fromEntries(Object.entries(oldCache).filter(([, v]) => guideLooked(v)).map(([u,v])=>[u,compactVerdict(v)]))
  const marks = (await readJson<Record<string, PhotoScreenEntry>>(state(PHOTO_SCREEN_FILE))) ?? {}
  const reviewed = await readReviewedPhotoVersion(root)
  const rejected = photoRejections(await expandWholePhotoRejections(content,
    (await readJson<Record<string, string>>(state('_photo-rejected.json'))) ?? {}, marks), marks, reviewed)
  const done = (await readJson<StillsState>(state('_video-stills.json'))) ?? {}
  const report = { sheets: 0, judged: 0, cleared: 0, off: [] as string[], removed: [] as string[], kept: [] as string[], held: [] as string[], failed: [] as string[], left: 0, waiting: 0, stopped: '', subject: [] as string[], dead: [] as string[], bare: [] as string[] }

  // Every photo a guide or an equipment guide shows, and every video still, with the files they are in.
  const files: string[] = []
  const subjectOf = new Map<string, string>() // a guide's file → what it's about
  const items = new Map<string, Item>()
  let wanted = true
  const add = (url: string, lead: boolean, equipment: boolean, still = false, about?: About) => {
    const it = items.get(url) ?? { url, lead, equipment, still, wanted, subjects: [] }
    items.set(url, { url, lead: it.lead || lead, equipment: it.equipment || equipment, still: it.still || still, wanted: it.wanted || wanted, subjects: about && !it.subjects.some(s => s.subject === about.subject) ? [...it.subjects, about] : it.subjects })
  }
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const g = await readJson<Guide>(file)
    if (!g) continue
    files.push(file)
    wanted = !o.only || o.only.includes(id)
    const name = (await readJson<{ name?: string }>(join(content, 'guides', id, 'vi.json')))?.name
    const title = name ?? g.video?.title ?? id
    const subject = subjectForGuide(g, id, name)
    const about = subject ? { subject, title } : undefined
    if (subject) subjectOf.set(file, subject)
    for (const [i, p] of (g.photos ?? []).entries()) {
      for (const url of deadScreenPhotoUrls(p)) add(url, i === 0, false, false, about)
    }
    for (const f of g.video?.figures ?? []) if (f.photo) {
      for (const url of deadScreenPhotoUrls(f.photo)) add(url, false, false, false, about)
    }
    // A tile video-stills.ts will replace with the video's frame waits for that frame; a still the other bars keep off
    // the page needs no verdict.
    for (const m of (g.video?.figures ?? []).flatMap(f => f.moments ?? [])) {
      if (!stillDone(m, done[id]?.kept)) report.waiting++
      else if (stillShown({ ...m, person: false })) add(m.url, false, false, true)
    }
  }
  wanted = !o.only
  // An equipment guide's photos are in each language's file too (equipment/id/…).
  for (const f of (await readdir(join(content, 'equipment'), { recursive: true }).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const file = join(content, 'equipment', f)
    const e = await readJson<Equipment>(file)
    if (!e) continue
    files.push(file)
    if (e.hero) add(e.hero.url, true, true)
    for (const t of e.types ?? []) if (t.photo) add(t.photo.url, false, true)
  }

  // 1. The model judges photos not judged yet, leads first, then video stills, then photos it judged before their guide's
  // subject was asked, then the rest; `limit` sheets this run.
  const ask = (x: Item) => x.subjects.find(s => !guideLooked(cache[x.url], s.subject))
  const todo = [...items.values()].filter(x => x.wanted && !rejected(x.url) && (!(x.url in cache) || ask(x))).map((x, i) => ({ x, i })).sort((a, b) => Number(b.x.lead) - Number(a.x.lead) || Number(b.x.still) - Number(a.x.still) || Number(b.x.url in cache) - Number(a.x.url in cache) || a.i - b.i).map(({ x }) => x)
  const batch = todo.slice(0, Math.max(0, o.limit) * PER_SHEET)
  report.left = todo.length - batch.length
  // Apply a prior verdict too if an interrupted video run left a flagged frame without its second-look record.
  const dead = new Map([...items.values()].flatMap(x => {
    const v = cache[x.url]
    return v?.dead === true && !guidePhotoOff(v, x.equipment || x.still) ? [[x.url, v.note] as const] : []
  }))
  const sheets = Array.from({ length: Math.ceil(batch.length / PER_SHEET) }, (_, i) => batch.slice(i * PER_SHEET, (i + 1) * PER_SHEET))
  const dir = await mkdtemp(join(tmpdir(), 'guide-photos-'))
  try {
    await pool(sheets.map((s, i) => ({ s, i })), o.parallel ?? 1, async ({ s, i }) => {
      if (report.stopped) return
      const ok: { url: string; b: Buffer; about?: About }[] = []
      for (const x of s) {
        try {
          const b = Buffer.from(await d.get(x.url))
          await sharp(b).metadata() // not an image (an error page served as 200): left out, so the rest of the sheet is judged
          ok.push({ url: x.url, b, about: ask(x) })
        } catch (err) { report.failed.push(`${x.url}: ${photoFailure(err)}`) }
      }
      if (!ok.length) return
      try {
        const verdicts = await piece(`sheet-${i}`, () => judgeGuidePhotos(ok.map(x => x.b), join(dir, `sheet-${i}.jpg`), d.look, ok.map(x => x.about)))
        report.sheets++
        verdicts.forEach((v, j) => {
          if (!v) return
          const url = ok[j]!.url, before = cache[url]
          // Asked again for its subject, a photo keeps the verdict that was acted on; the note says what a true found.
          cache[url] = compactVerdict(before ? {
            ...before,
            other: { ...before.other, ...v.other },
            answeredSubjects: [...new Set([...(before.answeredSubjects ?? []), ...(v.answeredSubjects ?? [])])],
            ...(Object.values(v.other ?? {}).some(Boolean) ? { note: v.note, noteHash:v.noteHash, hints:v.hints } : {}),
          } : v)
          report.judged++
          const x = items.get(url)!
          if (!before && v.dead === true && !guidePhotoOff(v, x.equipment || x.still)) dead.set(url, v.note)
        })
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= photoModelStop(err)
        else report.failed.push(`sheet ${i}: ${photoFailure(err)}`)
      }
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // 2. Off the guides and equipment guides; a person, a mark, or a brand on a photo no equipment guide shows and that
  // isn't a still, onto the blocklist.
  const rejectedFile = state('_photo-rejected.json')
  const prior = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  // A guide's photo that is also the last photo of a species, plant or breed page doesn't go on the list, which would
  // take it off that page too: it waits for a second look (last-photo.ts). It still leaves the guides.
  const sl = looks(await readSecondLook(root), reviewed)
  const ownMark = photoAddressSet(Object.keys(marks).filter(url => retainedOwnMark(url, marks[url])))
  const verdictOff = (url: string, brandKept: boolean) => guidePhotoOff(cache[url], brandKept, ownMark(url))
  const listing = new Map([...items.values()].flatMap(x => {
    const why = verdictOff(x.url, x.equipment || x.still)
    return why && sl.open(x.url) ? [[x.url, why] as const] : []
  }))
  const removesWrapper = photoAddressSet([...listing].flatMap(([url, reason]) => versionRejection(reason) ? [] : [url]))
  const last = await holdablePhotoVerdicts(root, prior, new Set(listing.keys()), removesWrapper)
  const heldWhole = photoAddressSet([...last.keys()].filter(removesWrapper))
  const heldVersions = verdictAddressSet([...last.keys()].filter(url => !removesWrapper(url)), new Set(listing.keys()))
  const heldAddress = (url: string) => heldWhole(url) || heldVersions(url)
  const holding = new Map<string, { why: string; pages: string[] }>()
  for (const x of items.values()) {
    const why = verdictOff(x.url, x.equipment || x.still)
    if (!why) continue
    report.off.push(`${x.url}: ${why}`)
    if (last.has(x.url)) { holding.set(x.url, { why, pages: last.get(x.url)! }); report.held.push(`${x.url}: ${last.get(x.url)!.join(', ')}`); continue }
  }
  await holdForSecondLook(root, holding, 'the guide photo check')
  await writePhotoState(state(GUIDE_LOOKS_FILE), Object.fromEntries(Object.entries(cache).sort()))
  // A dead one off its guides, held for its second look once the first look is durable.
  const took = await takeOffGuidesDead(root, dead, 'the guide photo check')
  report.dead = took.off
  report.bare = took.bare
  const now = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  await recordPhotoRefusals(rejectedFile, now, new Map([...listing].filter(([url]) => !heldAddress(url))), marks, reviewed)
  await writePhotoState(rejectedFile, now)
  for (const file of files) {
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw) as Guide
    const removed: string[] = []
    const equipment = file.startsWith(join(content, 'equipment'))
    const subject = subjectOf.get(file)
    const another = (url: string) => !!subject && cache[url]?.other?.[subject] === true
    const remove = (url: string) => sl.open(url) && (!!verdictOff(url, equipment || !!items.get(url)?.still) || another(url))
    stripPhotos(data, remove, removed, report.kept, (url, _original, blockedOriginal) => {
      const reason = verdictOff(url, equipment || !!items.get(url)?.still)
      return !blockedOriginal && (heldAddress(url) || !reason || versionRejection(reason))
    })
    const stock = (data.video?.figures ?? []).flatMap(f => f.photo ? [f.photo] : [])
    for (const p of [...(data.photos ?? []), ...stock]) {
      if (p.original && deadScreenPhotoUrls(p).includes(p.original.url) && remove(p.original.url)) {
        removed.push(p.original.url)
        delete p.original
      }
    }
    report.subject.push(...removed.filter(another).map(u => `${relative(root, file)}: ${u}: ${cache[u]!.note}`))
    // What's left of a guide's stills carries its verdict, which they need to show.
    let cleared = 0
    for (const m of (data.video?.figures ?? []).flatMap(f => f.moments ?? [])) {
      const v = cache[m.url]
      if (!v || m.person !== undefined || (v.dead && !sl.cleared(m.url))) continue
      m.person = v.person
      cleared++
    }
    report.cleared += cleared
    if (!removed.length && !cleared) continue
    report.removed.push(...removed.map(u => `${relative(root, file)}: ${u}`))
    await writeFile(file, `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`)
  }
  await pruneGuideLegacyUses(root, cache)
  return report
}
