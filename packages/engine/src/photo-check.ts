import { piece } from './pieces'
import { compactVerdict, photoHints, photoReason, deadNote, peopleNote, photoFailure, photoModelStop, type PhotoHints } from './photo-observations'
import { writePhotoState } from './photo-state'
import { writeImageCache } from './image-cache-write'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realPhotosFirst } from '@aq/schema'
import sharp from 'sharp'
import { LlmError } from './claude'
import { captionFlaw } from './content-rules'
import { galleryPlan } from './gallery-plan'
import { pickStands, readPersonYes } from './person-yes'
import { holdForSecondLook, looks, readSecondLook } from './last-photo'
import { contactSheet } from './video-images'
import { keptOwnMark, LOGO_FOLDERS, stripPhotos, type WatermarkEntry } from './watermarks'
import { CF, namedOn, namedOrder, passesHead, SPECIES } from './photo-named'

type Photo = { url: string; caption?: string; author?: string; sourceUrl?: string; generated?: unknown }
/**
 * Does the photo show its page's subject: yes (in the wild too, where it is clearly seen); another species, breed or
 * variety (`note` says which); not a photo of the subject at all (a map, chart, hands, a tank, a packshot, a landscape or
 * stream where it can't be picked out); a dead fish or fish as food (`dead`: a market, a plate, a catch landed or held, a
 * preserved or museum specimen); or can't tell. `no` is the first check's verdict (before 2026-11-02), which didn't tell
 * the two apart; `habitat` is the check's before 2026-11-07, "its wild place, with or without it", kept on the page, so a
 * lake with no fish led the firemouth's page and cards. `logo`: a stamp, logo or mark added on the photo, which the
 * watermark step's text reader can miss (since 2026-11-05). `person`: a person or any part of one in the photo; every
 * verdict since 2026-11-07 has it, so one without it is from before the check asked about people, and is asked again.
 * `guide`: judged against a guide photo's caption, which lets other fish into the shot, so it doesn't stand for the page's
 * own stricter look. `file`: "other" from the photo's Commons file name, which names another species with a page
 * (fileNamesOther), with no model call.
 */
export type PhotoVerdict = { ok: 'yes' | 'other' | 'none' | 'habitat' | 'unsure' | 'dead' | 'no'; typical: boolean; note: string; noteHash?: string; hints?: PhotoHints; logo?: boolean; person?: boolean; guide?: boolean; file?: true }
export type PhotoCheckDeps = {
  get: (url: string) => Promise<Uint8Array>
  look: (sheet: string, prompt: string) => Promise<{ photos: ({ n: number } & PhotoVerdict)[] }>
}
const VERDICTS = ['yes', 'other', 'none', 'unsure', 'dead'] as const
export const PHOTO_CHECK_SCHEMA = {
  type: 'object', required: ['photos'],
  properties: { photos: { type: 'array', items: { type: 'object', required: ['n', 'ok', 'typical', 'note', 'logo', 'person'], properties: { n: { type: 'number' }, ok: { type: 'string', enum: VERDICTS }, typical: { type: 'boolean' }, note: { type: 'string' }, logo: { type: 'boolean' }, person: { type: 'boolean' } } } } },
}
/** Verdicts that take a photo off its page. */
export const OFF = new Set<PhotoVerdict['ok']>(['other', 'none', 'dead', 'no'])
/** A page's own verdict refuses a photo there: anything in OFF, but a head a person picked that the check calls "none" stays
 * (the chief of staff, 2026-11-12). The check takes such a photo off (`off` below); the sweep keeps it off (`refusedOn`). */
export const refuses = (v: PhotoVerdict | undefined, pickedHere: boolean): boolean => !!v && OFF.has(v.ok) && !(v.ok === 'none' && pickedHere)
/** A verdict that sees a fish or a plant in the photo: it keeps a photo another page calls "none" off the rule below. */
const SEES = new Set<PhotoVerdict['ok']>(['yes', 'unsure', 'other', 'dead'])
/**
 * Why a cycle keeps a photo off a fish's, a breed's or a plant's page or album, between two runs of the check (the sweep,
 * in every part: a source read or a monthly backfill puts back what a source still shows; the chief of staff, 2026-11-13):
 * - "refused here": that page's own verdict refuses it (`refuses`), as the check takes it off. Another fish's photo stays
 *   on the pages that haven't refused it;
 * - "nothing of a fish" / "nothing of a plant": a fish's or a breed's page calls it "none" (nothing of the subject in it),
 *   so it shows nothing on any fish's or breed's page, and a plant page's "none" the same for plant pages, unless a page of
 *   that kind sees something in it ("yes", "unsure", "other", "dead"). A page that hasn't judged it doesn't count. A head
 *   a person picked is out of this rule on every page (`pickedUrls`), and guides keep the photo: a guide may show a habitat.
 * Page verdicts only: no guide's verdict and no older one-photo verdict.
 */
export function refusedOn(cache: Record<string, Record<string, PhotoVerdict>>, kindOf: (id: string) => string | undefined, picked: (id: string, url: string) => boolean, pickedUrls: Set<string>) {
  const group = (id: string) => { const k = kindOf(id); return k === 'plants' ? 'plants' : k === 'species' || k === 'breeds' ? 'fish' : undefined }
  return (id: string, url: string): 'refused here' | 'nothing of a fish' | 'nothing of a plant' | undefined => {
    const g = group(id)
    if (!g) return undefined
    const by = cache[url] ?? {}
    const v = by[id]
    if (v && !v.guide && refuses(v, picked(id, url))) return 'refused here'
    if (pickedUrls.has(url)) return undefined
    const same = Object.entries(by).filter(([p, x]) => !x.guide && group(p) === g).map(([, x]) => x.ok)
    if (same.includes('none') && !same.some(ok => SEES.has(ok))) return g === 'fish' ? 'nothing of a fish' : 'nothing of a plant'
    return undefined
  }
}
/**
 * Whether the check could not tell that a photo shows this page's subject ("unsure"). Such a photo keeps showing (the
 * owner, 2026-11-11), behind the others: it never leads a page that has a photo the check passed, and in an album it
 * comes after every photo the check passed or has not reached yet.
 */
export const cantTellOn = (subjects: Record<string, Record<string, PhotoVerdict>>, page: string) => (url: string): boolean => {
  const v = subjects[url]?.[page]
  return !!v && !v.guide && v.ok === 'unsure'
}
/** "Can't tell" photos last, each group in the order it had. The album step ranks with it too (gallery.ts), so both agree. */
export const cantTellLast = <P extends { url: string }>(photos: P[], cantTell: (url: string) => boolean): P[] =>
  [...photos.filter(p => !cantTell(p.url)), ...photos.filter(p => cantTell(p.url))]
/**
 * Why a photo leaves every page, whatever another page's verdict: it shows a dead fish or fish as food, a person or part
 * of one ("Photos never show people (hands count)", PRODUCT.md), or a logo.
 */
const blockedFor = (by: Record<string, PhotoVerdict> = {}, keepOwnLogo = false) => {
  const vs = Object.values(by)
  const dead = vs.find(v => v.ok === 'dead')
  const person = vs.find(v => v.person)
  const logo = keepOwnLogo ? undefined : vs.find(v => v.logo)
  return dead ? `dead: ${dead.note}` : person ? `people: ${person.note}` : logo ? `watermark: ${logo.note}` : undefined
}

/** A page whose photos show one subject: a species, a plant (a cultivar is named in its scientific name), or a breed. */
/** `latin`: a species' or plant's synonyms. */
export type Subject = { id: string; kind: 'species' | 'plants' | 'breeds'; sci: string; names: string[]; breed?: string; latin?: string[] }

const PER_SHEET = 6
/**
 * A run that would leave more pages than this with no photo of their own takes none of their photos off, and none of
 * them onto the never-again list: it lists them and holds (`report.heads.held`), so a check gone wrong can't blank
 * pages. `--empty-cap` lets a person who has looked at them release a larger run (the chief of staff, 2026-11-12).
 * None: a page's last photo doesn't come off on the check's word alone (the chief of staff, 2026-11-14, after one
 * night's runs left 27 fish pages with no photo, within the cap of 10 a run).
 */
export const EMPTY_CAP = 0
/** Gallery photos a species page shows itself (the site's GALLERY_STRIP, apps/site/src/lib/gallery.ts); the rest are on the gallery page. */
const STRIP = 8

/**
 * Species whose hobby colour forms belong to another species: the bred discus (turquoise, red, pigeon blood…) are
 * Symphysodon aequifasciatus, which Commons and stock sites often file as S. discus, so Heckel's discus page took them
 * (the owner's naming of the two, 2026-11-07).
 */
export const WILD_ONLY: Record<string, string> = {
  'symphysodon-discus': 'it must be the wild Heckel discus, brown to blue-green with one bold dark bar through the middle of the body; a captive-bred colour form (turquoise, red, pigeon blood, snakeskin, golden, solid colours) is Symphysodon aequifasciatus, so "other"',
}

/** `captions`: per photo on the sheet, the caption of a guide photo judged here because the caption names the subject. */
export const subjectPrompt = (s: Subject, captions: (string | undefined)[] = []) => {
  const names = s.names.length ? ` (${s.names.slice(0, 4).join(', ')})` : ''
  const what = s.kind === 'breeds'
    ? `the breed or line ${s.names[0] ?? s.id}${s.sci ? ` of ${s.sci}` : ''}. What sets it apart: ${s.breed ?? 'its name'}`
    : `${s.sci}${names}, ${s.kind === 'plants' ? 'an aquarium plant' : 'a fish or other aquatic animal'}`
  const form = WILD_ONLY[s.id] ?? (s.kind === 'breeds' || /['‘’"]| (var|cv|f)\. /.test(s.sci)
    ? 'it must be this breed, line or cultivar: the plain species or another form of it is "other"'
    : 'its colour forms, sexes and young count as it')
  return `Numbered photos from the page about ${what} in an aquarium handbook.
For each photo n:
- ok: "dead" if it shows a dead fish or other animal, or fish as food, whatever the species: at a market or fishmonger's, on ice; on a plate, cooked, fillets; a catch landed or held up, a fish lying on a tray, a board or the floor; a preserved, mounted, museum or lab specimen (for a snail, an empty museum shell; for a plant, a pressed herbarium sheet). When you can't tell whether it is alive, it is "dead". Not "dead": a drawing, painting or engraved plate (that is "none"; a photo of a preserved specimen is "dead", however old); a live fish held briefly in a net or a bag.
  "yes" if it clearly shows the page's subject as the main subject (a group of it counts, and so does it in the wild where it is clearly seen; ${form}).
  "other" if the main subject is a different species, breed or variety. Look-alikes count: tell them apart by their marks (neon tetra from green neon or cardinal tetra, cherry barb from rosy or tiger barb).
  "none" if it is not a photo of the subject at all: a map, chart, diagram or drawing, hands or people, a landscape or wild place (a river, stream, lake, swamp or shore) where it can't be picked out, a tank or aquascape where it can't be picked out, equipment, a product packshot.
  "unsure" if you cannot tell (a species you do not know well, a poor or distant view, a look-alike you cannot rule out).
- typical: true if it shows the ordinary look of the subject (adult, clear view; for a species, the wild type); false otherwise, and for "dead".
- person: true if a person or any part of one is in the photo: a hand or fingers (holding it, planting it, in the shot), an arm, a foot, a face, a diver, even small, cut off at the edge, blurred or behind the glass; false if not.
- logo: true if a logo, stamp, watermark, signature or text was added on top of the photo after it was taken, even small or faint, round, in a corner, in any script, with or without readable letters; false if not. Text in the scene (a label on a tank, a specimen tag) is not added.
- note: a few words on what it shows (for "other": what it is instead, e.g. "neon tetra: red stripe runs only half the body"; for "dead": what makes it so, e.g. "dead fish on ice at a market"; with a person, what of them, e.g. "fish held in a hand"; with a logo, what and where, e.g. "round logo bottom left").${captions.some(Boolean) ? `
Some photos are from a guide, with this caption: ${captions.flatMap((c, i) => (c ? [`${i + 1}: "${c.slice(0, 160)}"`] : [])).join('; ')}. Judge these against their caption instead: "yes" if the photo shows what the caption says about the page's subject (any form of it counts, other fish or plants may be in the shot too); "other" only if it shows a different fish or plant where the caption names the subject; "unsure" if the caption is about something else. "dead", person and logo hold for these as for any photo.` : ''}`
}

const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
const ascii = (n: string) => /^[\x20-\x7e]+$/.test(n)

/**
 * Species, plant and breed pages. A breed is judged against what sets it apart and its base species, or a hybrid's
 * parents; a transgenic line (GloFish: danios, tetras, barbs, bettas) against its own names only.
 */
const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * The other species a Commons file's name names, when the site has a page for it and the name doesn't name this page's
 * own too (its scientific name or a synonym). The gallery step writes captions in Vietnamese, so the file name is often
 * all that says which fish a photo is, and the model takes look-alikes for the page's: a Dario dario male judged a Badis
 * badis, a Channa andrao "can't tell" on two snakehead pages (the v2 Lab, 2026-11-08). A species and its varieties count
 * as one (Anubias barteri on the var. glabra page), and a plant named on a fish's photo is in its tank; breeds' photos
 * are filed under their species, so none for them.
 * `byName`: species and plants by each Latin name, as `words` gives it.
 */
export function fileNamesOther(source: string | undefined, s: Subject, byName: Map<string, Subject>): Subject | undefined {
  const file = source?.match(/commons\.wikimedia\.org\/wiki\/File:([^?#]+)/)?.[1]
  if (!file || s.kind === 'breeds') return undefined
  let name: string
  try { name = decodeURIComponent(file) } catch { return undefined }
  const w = words(name.replace(/\.[a-z0-9]+$/i, '')).split(' ')
  const named = new Set<Subject>()
  for (let i = 0; i < w.length; i++) for (let n = 2; n <= 4 && i + n <= w.length; n++) { const x = byName.get(w.slice(i, i + n).join(' ')); if (x) named.add(x) }
  if (named.has(s)) return undefined
  const own = words(s.sci)
  // Only its own kind: a fish's photo may name the plants in the tank.
  return [...named].find(o => { const a = words(o.sci); return o.kind === s.kind && !a.startsWith(`${own} `) && !own.startsWith(`${a} `) })
}

async function subjects(content: string): Promise<Subject[]> {
  const out: Subject[] = []
  const sci = new Map<string, string>()
  for (const kind of ['species', 'plants', 'breeds'] as const) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const e = await readJson<{ scientificName?: string; synonyms?: string[]; kind?: string; basedOn?: string; parents?: { name: string; species?: string }[] }>(join(content, kind, id, 'entity.json'))
      if (!e) continue
      const t = (await readJson<{ name?: string; altNames?: string[]; body?: string }>(join(content, kind, id, 'vi.json'))) ?? {}
      const names = [t.name, ...(t.altNames ?? []).filter(ascii)].filter((n): n is string => !!n)
      if (kind !== 'breeds') { sci.set(id, e.scientificName ?? id); out.push({ id, kind, sci: e.scientificName ?? id, names, ...(e.synonyms?.length ? { latin: e.synonyms } : {}) }); continue }
      const base = e.basedOn ? sci.get(e.basedOn) : e.kind === 'hybrid' ? (e.parents ?? []).map(p => (p.species && sci.get(p.species)) || p.name.match(/\(([A-Z][a-z]+ [a-z]+)\)/)?.[1]).filter(Boolean).join(' × ') : undefined
      const marks = t.body?.match(/<h3>Nhận biết[^<]*<\/h3>\s*<p>([\s\S]*?)<\/p>/)?.[1]
      out.push({ id, kind, sci: base ?? '', names, ...(marks ? { breed: text(marks).slice(0, 300) } : {}) })
    }
  }
  return out
}

/** Most-read first: breeds (the forms of the staples readers open), then the gallery plan's order (species and plants). */
async function rank(root: string, all: Subject[]): Promise<Subject[]> {
  const order = [...all.filter(s => s.kind === 'breeds').map(s => s.id), ...(await galleryPlan(root)).map(p => p.id)]
  const at = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  return [...all].sort((a, b) => at(a.id) - at(b.id) || a.id.localeCompare(b.id))
}

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/['‘’"]/g, '').replace(/\s+/g, ' ').trim()

/**
 * The species or plant a guide photo's caption names: a scientific name or another name of exactly one page, two words or
 * more (a one-word name, "Molly", names a group), plural or not. A name inside a longer one gives way ("Cá neon" in "Cá neon xanh lục");
 * a caption naming two pages, or another genus ("How to plant Anubias or Java Fern"), names neither. `genera`: each
 * genus (lower case) and the pages in it.
 */
export function captionSubject(caption: string, index: Map<string, string>, genera = new Map<string, Set<string>>()): string | undefined {
  const c = norm(caption)
  const hits: { id: string; from: number; to: number }[] = []
  for (const [name, id] of index) {
    let i = c.indexOf(name)
    while (i >= 0) {
      const edge = (j: number) => j < 0 || j >= c.length || !/[\p{L}\p{N}]/u.test(c[j]!)
      const end = i + name.length + (c.startsWith('es', i + name.length) && edge(i + name.length + 2) ? 2 : c[i + name.length] === 's' ? 1 : 0) // "cherry barbs"
      if (edge(i - 1) && edge(end)) hits.push({ id, from: i, to: end })
      i = c.indexOf(name, i + 1)
    }
  }
  const kept = hits.filter(h => !hits.some(o => o !== h && o.from <= h.from && o.to >= h.to && o.to - o.from > h.to - h.from))
  const ids = [...new Set(kept.map(h => h.id))]
  if (ids.length !== 1) return undefined
  return c.split(/[^\p{L}]+/u).some(w => genera.get(w) && !genera.get(w)!.has(ids[0]!)) ? undefined : ids[0]
}

function nameIndex(all: Subject[]) {
  const owners = new Map<string, Set<string>>()
  const genera = new Map<string, Set<string>>()
  for (const s of all) if (s.kind !== 'breeds') {
    for (const n of [s.sci.split(/\s+/).slice(0, 2).join(' '), ...s.names].map(norm)) if (n.split(' ').length >= 2) owners.set(n, (owners.get(n) ?? new Set()).add(s.id))
    const g = norm(s.sci.split(/\s+/)[0]!)
    genera.set(g, (genera.get(g) ?? new Set()).add(s.id))
  }
  return { names: new Map([...owners].filter(([, ids]) => ids.size === 1).map(([n, ids]) => [n, [...ids][0]!])), genera }
}

async function pool<T>(items: T[], n: number, f: (x: T) => Promise<void>) {
  let next = 0
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < items.length) await f(items[next++]!) }))
}

/**
 * Words in an earlier look's note that say the photo may show a dead fish or fish as food: the subject checks' and the
 * watermark step's notes (English) and the gallery step's captions (Vietnamese). Not a drawing or painting: the check
 * already calls one "not a photo of it".
 */
export { deadNote, peopleNote }


/**
 * The photos to judge again first (`checkPagePhotos`' `recheck`): shown on a species, plant or breed page or its gallery,
 * judged only before the check asked about people (no verdict of it has `person`), and either a note of an earlier look
 * says it may show a dead fish or fish as food (`deadNote`) or a person or hand (`peopleNote`), or the verdict was the old
 * "habitat" (the wild place, with or without it). Each is judged once: a re-run finds none. Found by the owner
 * (2026-11-05): dead peacock bass at a market leading their page, judged "yes" with a note that said so; and a design
 * review (2026-11-07): a lake with no fish leading the firemouth's page. URL → that note.
 */
export async function recheckCandidates(root: string): Promise<Map<string, string>> {
  const state = async <T>(f: string) => (await readJson<Record<string, T>>(join(root, 'engine-state', f))) ?? {}
  const legacy = await state<PhotoVerdict>('_photo-check.json')
  const cache = await state<Record<string, PhotoVerdict>>('_photo-subjects.json')
  const marks = await state<{ what?: string; hints?: PhotoHints }>('_photo-watermarks.json')
  const rejected = await state<string>('_photo-rejected.json')
  const content = join(root, 'content')
  const notes = new Map<string, (string | undefined)[]>()
  for (const s of await subjects(content)) {
    for (const file of [join(content, s.kind, s.id, 'entity.json'), join(content, 'gallery', `${s.id}.json`)]) {
      for (const p of (await readJson<{ photos?: Photo[] }>(file))?.photos ?? []) {
        notes.set(p.url, [...(notes.get(p.url) ?? []), ...(file.includes('/gallery/') ? [p.caption] : [])])
      }
    }
  }
  const out = new Map<string, string>()
  for (const [url, captions] of notes) {
    const by = Object.values(cache[url] ?? {})
    if (url in rejected || by.some(v => v.person !== undefined)) continue
    const cues=[legacy[url],...by,marks[url]].filter(Boolean).map(v=>photoHints(v!))
    const dead=cues.some(v=>v.dead)||captions.some(n=>!!n&&deadNote(n))
    const people=cues.some(v=>v.people)||captions.some(n=>!!n&&peopleNote(n))
    if(dead||people)out.set(url,[dead?'possible dead subject':undefined,people?'possible person':undefined].filter(Boolean).join('; '))
    else if([legacy[url],...by].some(v=>v?.ok==='habitat'))out.set(url,'habitat needs recheck')
  }
  return out
}

/** Where a photo is shown: a page's own photos or gallery (`page`), or a guide (`page`: the fish its caption names, if any). */
/**
 * `waits`: a gallery photo no page shows until this check has judged it (`unchecked`); `bare`: a gallery photo of a page
 * with no photo of its own; `sourced`: a permitted source's own photo of what its page is about (Tropica's of its plant);
 * `lead`: the page's first photo of its own.
 */
type Shown = { file: string; url: string; page?: string; guide?: boolean; caption?: string; galleryOnly?: boolean; author?: string; source?: string; waits?: boolean; bare?: boolean; sourced?: boolean; lead?: boolean }

/**
 * Whose turn a photo not judged yet has (the chief of staff, 2026-11-10: of 2,611 gallery photos judged, 272 had been
 * taken off, most as another fish, Flickr's 17 in 100, Commons' 12 and iNaturalist's 7, and some 6,300 more were on pages
 * unjudged):
 * 0. photos readers see now from Flickr and Commons, where most of the wrong fish are;
 * 1. the other photos readers see now;
 * 2. photos that wait (`unchecked`) on a page with no photo of its own, which they would fill;
 * 3. the other photos that wait.
 *
 * Before all of them, a share of each run (`fill` sheets): a permitted source's own photos in the gallery of a page that
 * has none, which give that page its first photo once judged (Tropica's on the plant pages with none: the chief of
 * staff, 2026-11-10).
 *
 * And before the turns (the chief of staff, 2026-11-11, after the owner found a parasite paper's plate as a page's only
 * photo, which the check had not reached in three days): a page's lead that neither check has looked at, from Flickr and
 * Commons first, then from the other sources; then the gallery of a page with no photo of its own, which gives it one
 * once judged. A lead's sheet is filled with its page's other photos, as any sheet is.
 */
export const turn = (x: Pick<Shown, 'waits' | 'bare' | 'source'>): 0 | 1 | 2 | 3 =>
  x.waits ? (x.bare ? 2 : 3) : /\/\/(?:commons\.wikimedia\.org|(?:www\.)?flickr\.com)\//.test(x.source ?? '') ? 0 : 1

/**
 * Every photo on a species, plant or breed page (its own photos and its gallery) must show that page's subject, judged
 * by the model on numbered sheets of 6 against the scientific name, the page's names and, for a breed, what sets it apart.
 * Guide photos whose caption names one species or plant are judged against it; a guide photo that is a page's photo goes
 * with that page's verdict. Verdicts are cached per photo and page (`engine-state/_photo-subjects.json`; the first check's
 * `_photo-check.json` still counts for a photo on one page only), so a re-run makes no model call for them. A verdict
 * from before the check asked about people (no `person`, the first check's too) still counts and is asked again, in the
 * same order as photos not judged yet.
 *
 * - "other" and "none" leave the page (in a guide, only "other": a guide may show a packshot or a tank on purpose). A
 *   landscape or stream where the subject can't be picked out is "none". A photo every page that shows it rejects joins
 *   `_photo-rejected.json` (added to, never rewritten), which the photo steps respect, so a source re-read or a gallery
 *   rebuild doesn't bring it back. One some page keeps leaves only the others.
 * - "dead" (a dead fish or fish as food), a person or part of one, and a logo are the photo's, not the page's: one such
 *   verdict takes it off every page, guide and gallery and onto `_photo-rejected.json` ("dead: …", "people: …",
 *   "watermark: …"). A logo found, the same photographer's photos judged before the check asked about people are judged
 *   in the same run (they may carry it too).
 * - "unsure" stays and is listed for review with the removals (docs/review/photo-subjects.md). A page left without a
 *   photo shows none.
 * - On a species or plant page a typical photo comes first, each group in the order it had: a lead the check passes as
 *   typical stays the lead, and one that passes as less, can't be told, is taken off or is not judged yet gives way to
 *   a typical photo in the run that judges that photo. An old "habitat" verdict goes last until it is asked again.
 *
 * - A gallery photo a step added waits (`unchecked`, gallery.ts) and no page shows it: judged and left on, it loses the
 *   mark here and shows from the next build.
 *
 * The order: the leads nothing has looked at and the pages with no photo of their own (see `turn`), then `turn`'s, and
 * within each most-read pages first (`rank`), the photos a page shows itself before the rest of its gallery. A page's
 * lead is judged in the first sheet a run gives the page, so no photo of the page is judged before it. A page's last
 * sheet is filled from its photos of a later turn (a lead's sheet from the page's own photos first), so no sheet goes
 * out part empty.
 * `limit`: model calls this run; stops on a model failure (usage limit), and the rest wait. `fill`: how many of them go
 * first to a source's photos that fill a page with none (`turn`).
 * `recheck`: with it, only these photos are judged, where their verdict is from before the check asked about people
 * (`recheckCandidates`).
 */
export async function checkPagePhotos(root: string, d: PhotoCheckDeps, o: { limit: number; fill?: number; parallel?: number; only?: string; today?: string; recheck?: Set<string>; emptyCap?: number }) {
  const content = join(root, 'content')
  const cacheFile = join(root, 'engine-state/_photo-subjects.json')
  const rejectedFile = join(root, 'engine-state/_photo-rejected.json')
  const rawCache = (await readJson<Record<string, Record<string, PhotoVerdict>>>(cacheFile)) ?? {}
  const cache = Object.fromEntries(Object.entries(rawCache).map(([u,by])=>[u,Object.fromEntries(Object.entries(by).map(([id,v])=>[id,compactVerdict(v)]))]))
  const rawLegacy = (await readJson<Record<string, PhotoVerdict>>(join(root, 'engine-state/_photo-check.json'))) ?? {}
  const legacy=Object.fromEntries(Object.entries(rawLegacy).map(([u,v])=>[u,compactVerdict(v)]))
  const rejected = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  // A photo held for a second look, or one it cleared, isn't taken off on a verdict (last-photo.ts).
  const sl = looks(await readSecondLook(root))
  const marks = (await readJson<Record<string, WatermarkEntry>>(join(root, 'engine-state/_photo-watermarks.json'))) ?? {}
  const keepLogo = keptOwnMark(rejected, marks)
  // A head a person picked (engine-state/_photo-head-picks.json, page → photo): it stays first on its page, while it
  // counts (person-yes.ts pickStands).
  const headPicks = (await readJson<Record<string, string>>(join(root, 'engine-state/_photo-head-picks.json'))) ?? {}
  const yes = await readPersonYes(root)
  const report = {
    photos: 0, sheets: 0, judged: 0, removed: [] as string[], rejected: 0, blocked: [] as string[], unsure: 0, failed: [] as string[], stopped: '',
    /** A page's head that changed, `kind/id: old -> new`; a page left with no photo of its own, `kind/id: old`; one held by EMPTY_CAP. */
    heads: { moved: [] as string[], emptied: [] as string[], held: [] as string[], named: [] as string[] },
    /** A head a person picked that the check calls "none": it stays, listed for a person each run. */
    picked: [] as string[],
  }
  // Heads the box step found no animal in (engine-state/_photo-boxes.json: null), on a fish's or a breed's page.
  const boxes = (await readJson<Record<string, unknown>>(join(root, 'engine-state/_photo-boxes.json'))) ?? {}

  const all = await rank(root, await subjects(content))
  const byId = new Map(all.map(s => [s.id, s]))
  // What each photo's source calls its subject on each page (photo-named.ts), and the head's test.
  const namedHere = await namedOn(content)
  const faces = (await readJson<Record<string, number>>(join(root, 'engine-state/_photo-faces.json'))) ?? {}
  const asHead = passesHead({ subjects: cache, legacy, rejected, faces, personYes: yes.counted })
  const shown: Shown[] = []
  for (const s of all) {
    let bare = false
    for (const file of [join(content, s.kind, s.id, 'entity.json'), join(content, 'gallery', `${s.id}.json`)]) {
      const photos = ((await readJson<{ photos?: (Photo & { unchecked?: boolean; source?: string })[] }>(file))?.photos ?? []).filter(p => !p.generated)
      if (file.endsWith('entity.json')) bare = !photos.length
      let place = 0
      for (const [i, p] of photos.entries()) {
        shown.push({ file, url: p.url, page: s.id, ...(p.author ? { author: p.author } : {}), ...(p.sourceUrl ? { source: p.sourceUrl } : {}), ...(file.includes('/gallery/') && place >= STRIP ? { galleryOnly: true } : {}), ...(p.unchecked ? { waits: true } : {}), ...(i === 0 && file.endsWith('entity.json') ? { lead: true } : {}), ...(bare && file.includes('/gallery/') ? { bare: true, ...(p.source ? { sourced: true } : {}) } : {}) })
        // A photo that waits is on no page, so it takes no place in the strip.
        if (p.unchecked !== true) place++
      }
    }
  }
  const index = nameIndex(all)
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const g = await readJson<{ photos?: Photo[]; video?: { figures?: { photo?: Photo }[] } }>(file)
    for (const p of [...(g?.photos ?? []), ...(g?.video?.figures ?? []).flatMap(f => (f.photo ? [f.photo] : []))].filter(p => !p.generated)) {
      const page = p.caption ? captionSubject(p.caption, index.names, index.genera) : undefined
      shown.push({ file, url: p.url, guide: true, ...(page ? { page, caption: p.caption } : {}) })
    }
  }
  // The first check judged a page's own photos one page at a time: its verdict holds where the photo is on one page only.
  const pagesOf = new Map<string, Set<string>>()
  for (const x of shown) if (x.page) pagesOf.set(x.url, (pagesOf.get(x.url) ?? new Set()).add(x.page))
  const verdict = (url: string, page: string, strict = true): PhotoVerdict | undefined => {
    const v = cache[url]?.[page]
    return (v && !(strict && v.guide) ? v : undefined) ?? (legacy[url] && legacy[url].ok !== 'unsure' && pagesOf.get(url)?.size === 1 ? legacy[url] : undefined)
  }

  // 0. A Commons photo whose file name names another species with a page is "other" there, with no model call, whatever
  // the model said; a file verdict that no longer holds (the page's names changed) goes, and the model judges the photo.
  const byName = new Map<string, Subject>()
  for (const s of all) if (s.kind !== 'breeds') for (const n of [s.sci, ...(s.latin ?? [])]) if (!byName.has(words(n))) byName.set(words(n), s)
  for (const x of shown) {
    const s = x.page && !x.guide ? byId.get(x.page) : undefined
    if (!s) continue
    const other = fileNamesOther(x.source, s, byName)
    const v = cache[x.url]?.[s.id]
    if (other) cache[x.url] = { ...cache[x.url], [s.id]: compactVerdict({ ...v, ok: 'other', typical: false, note: `its Commons file names ${other.sci}`, file: true }) }
    else if (v?.file) cache[x.url] = Object.fromEntries(Object.entries(cache[x.url]!).filter(([id]) => id !== s.id))
  }

  // 1. The model judges photos not judged yet or judged before the check asked about people (with `recheck`, only those
  // named there), most-read pages first: what each page shows itself (its photos, its gallery strip, guide photos naming
  // it), then the rest of each gallery.
  const stale = (x: Shown) => { const v = verdict(x.url, x.page!, !x.guide); return v?.person === undefined && !v?.file }
  const due = (x: Shown) => (!o.recheck || o.recheck.has(x.url)) && stale(x)
  /** Neither check has a verdict on it for its page (a verdict from before the check asked about people is one). */
  const unseen = (x: Shown) => !verdict(x.url, x.page!, !x.guide)
  const picked = (page: string, url: string) => { const s = byId.get(page); return !!s && headPicks[`${s.kind}/${page}`] === url && pickStands(`${s.kind}/${page}`, url, cache, yes) }
  /** A fish's or a breed's head the box step found no animal in. */
  const noAnimal = (x: Shown) => !!x.lead && boxes[x.url] === null && byId.get(x.page!)?.kind !== 'plants'
  const sheets: { s: Subject; urls: string[] }[] = []
  const queued = new Set<string>()
  // `only`: one page id, or several, comma-separated.
  const only = o.only ? new Set(o.only.split(',').map(x => x.trim()).filter(Boolean)) : undefined
  const onPage = new Map<string, Shown[]>()
  for (const x of shown) if (x.page) onPage.set(x.page, [...(onPage.get(x.page) ?? []), x])
  const queue = (want: (x: Shown) => boolean, fill = 0) => {
    const from = sheets.length
    // `first`: the share for a source's photos that fill a page with none. Then the leads nothing has looked at
    // (`lead0`: Flickr's and Commons', `lead1`: the rest), the pages with no photo of their own (`bare`), and each
    // turn in order.
    const phase = (x: Shown, now: 'noAnimal' | 'first' | 'lead0' | 'lead1' | 'bare' | 0 | 1 | 2 | 3) =>
      now === 'noAnimal' ? noAnimal(x)
      : now === 'first' ? !!x.sourced
      : now === 'lead0' || now === 'lead1' ? !!x.lead && unseen(x) && (turn(x) === 0) === (now === 'lead0')
      : now === 'bare' ? !!x.bare
      : turn(x) === now
    // A head with no animal in it goes before everything: a page whose head is a river should not wait (the chief of
    // staff, 2026-11-12). The source's share (`fill`) counts from where its own turn starts.
    let firstAt = from
    for (const now of ['noAnimal', 'first', 'lead0', 'lead1', 'bare', 0, 1, 2, 3] as const) for (const later of [false, true]) for (const s of all) {
      if (now === 'first' && !later && s === all[0]) firstAt = sheets.length
      if (sheets.length >= o.limit || (now === 'first' && sheets.length - firstAt >= fill)) break
      if (only && !only.has(s.id)) continue
      const open = (onPage.get(s.id) ?? []).filter(x => !(x.url in rejected) && want(x) && !queued.has(`${s.id}\n${x.url}`))
      const mine = [...new Set(open.filter(x => phase(x, now) && !!x.galleryOnly === later).map(x => x.url))]
      if (!mine.length) continue
      // The page's lead, when it is not judged yet, heads the first sheet a run gives its page, whatever its turn, as it
      // did before the turns: the typical-first order below would put a photo judged a run before the lead ahead of it,
      // and leave it there once the lead passed too (found in review, 2026-11-10).
      const lead = open.find(x => x.lead)?.url
      const first = lead ? [lead, ...mine.filter(u => u !== lead)] : mine
      // Its last sheet is filled from its photos whose turn comes later, the nearest turn first. A sheet headed by a
      // lead not judged yet takes the page's own photos before its gallery's: if the lead comes off, the photo that
      // takes its place was judged beside it, not left to wait as one more lead nothing has looked at (found in
      // review, 2026-11-11).
      const room = (PER_SHEET - (first.length % PER_SHEET)) % PER_SHEET
      const album = (x: Shown) => Number(!lead || !x.file.endsWith('entity.json'))
      const more = [...new Set(open.filter(x => !first.includes(x.url)).sort((a, b) => album(a) - album(b) || turn(a) - turn(b) || Number(!!a.galleryOnly) - Number(!!b.galleryOnly)).map(x => x.url))].slice(0, room)
      const todo = [...first, ...more]
      for (const u of todo) queued.add(`${s.id}\n${u}`)
      for (let i = 0; i < todo.length && sheets.length < o.limit; i += PER_SHEET) sheets.push({ s, urls: todo.slice(i, i + PER_SHEET) })
    }
    return sheets.slice(from).map((x, i) => ({ ...x, i: from + i }))
  }
  const logos = new Set<string>() // photos this run found a logo on
  const dir = await mkdtemp(join(tmpdir(), 'photo-check-'))
  const judge = (batch: { s: Subject; urls: string[]; i: number }[]) =>
    pool(batch, o.parallel ?? 1, async ({ s, urls, i }) => {
      if (report.stopped) return
      const ok: { url: string; b: Buffer }[] = []
      for (const url of urls) {
        try {
          const b = Buffer.from(await d.get(url))
          await sharp(b).metadata() // not an image (an error page served as 200): left out, so the rest of the sheet is judged
          ok.push({ url, b })
        } catch (err) { report.failed.push(`${s.id}: ${url}: ${photoFailure(err)}`) }
      }
      if (!ok.length) return
      // A guide's caption goes with a photo judged here only because of it (a photo on the page itself is the page's).
      const caption = (url: string) => (shown.some(x => x.url === url && x.page === s.id && !x.guide) ? undefined : shown.find(x => x.url === url && x.page === s.id)?.caption)
      const captions = ok.map(x => caption(x.url))
      try {
        const sheet = join(dir, `sheet-${i}.jpg`)
        await writeFile(sheet, await contactSheet(ok.map(x => x.b), 640, 480, 2, 'contain'))
        const v = await piece(s.id, () => d.look(sheet, subjectPrompt(s, captions)))
        report.sheets++
        for (const p of v.photos ?? []) {
          const x = ok[p.n - 1]
          if (!x || !(VERDICTS as readonly string[]).includes(p.ok)) continue
          cache[x.url] = { ...cache[x.url], [s.id]: compactVerdict({ ok: p.ok, typical: !!p.typical && p.ok !== 'dead', note: String(p.note ?? '').slice(0, 120), logo: !!p.logo, person: !!p.person, ...(captions[p.n - 1] ? { guide: true } : {}) }) }
          if (p.logo) logos.add(x.url)
          report.judged++
        }
      } catch (err) {
        if (err instanceof LlmError) report.stopped ||= `${s.id}: ${photoModelStop(err)}`
        else report.failed.push(`${s.id}: ${photoFailure(err)}`)
      }
    })
  try {
    await judge(queue(due, o.recheck ? 0 : o.fill ?? 0))
    // A photographer who stamps one photo may stamp others (a round logo in a corner, which the watermark step's text
    // reader missed: 2026-11-05). Not the sources whose every photo the watermark step's model has looked at.
    const stamped = new Set(shown.filter(x => logos.has(x.url) && x.author).map(x => x.author!))
    if (stamped.size && !report.stopped) await judge(queue(x => !!x.author && stamped.has(x.author) && stale(x) && !LOGO_FOLDERS.some(f => x.url.includes(`/${f}/`))))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // 2. Rejected photos leave their pages; a photo everywhere it is shown rejects is rejected for good, and one that shows
  // a dead fish, a person or a logo wherever it was judged.
  const onPages = new Map<string, Shown[]>()
  const everywhere = new Map<string, Shown[]>()
  for (const x of shown) {
    everywhere.set(x.url, [...(everywhere.get(x.url) ?? []), x])
    if (x.page) onPages.set(x.url, [...(onPages.get(x.url) ?? []), x])
  }
  const off = (x: Shown): boolean => {
    if (!sl.open(x.url)) return false
    if (!x.page) {
      // A guide photo that is a page's photo goes with it where it shows another fish (a map or a tank may be the guide's point).
      const xs = onPages.get(x.url) ?? []
      return xs.length > 0 && xs.every(off) && xs.some(p => verdict(p.url, p.page!, !p.guide)!.ok !== 'none')
    }
    const v = verdict(x.url, x.page, !x.guide)
    // A head a person picked that the check calls "none" stays on its page and off the never-again list: two people read
    // it as the fish plainly seen, and the check's question is what gets fixed (the chief of staff, 2026-11-12).
    return x.guide ? v?.ok === 'other' : refuses(v, picked(x.page, x.url))
  }
  for (const [ref, u] of Object.entries(headPicks)) {
    const page = ref.split('/')[1]!
    const v = shown.some(x => x.page === page && x.url === u && !x.guide) ? verdict(u, page) : undefined
    if (v?.ok === 'none' && pickStands(ref, u, cache, yes)) report.picked.push(`${ref}: ${u} (the check says not a photo of it; a head a person picked, so it stays)`)
  }
  const label = (id: string) => { const s = byId.get(id)!; return s.kind === 'breeds' ? (s.names[0] ?? id) : s.sci }
  const added: Record<string, string> = {}
  for (const url of everywhere.keys()) {
    const why = url in rejected || !sl.open(url) ? undefined : blockedFor(cache[url], keepLogo(url))
    if (why) { added[url] = why; report.blocked.push(`${url}: ${why}`) }
  }
  // Not one its file name took off: a photo of the species it names, which that species' page may still take.
  const named = (url: string) => Object.values(cache[url] ?? {}).some(v => v.file)
  for (const [url, xs] of onPages) if (!(url in rejected) && !(url in added) && !named(url) && everywhere.get(url)!.every(off)) added[url] = `not ${label(xs[0]!.page!)}: ${verdict(url, xs[0]!.page!, !xs[0]!.guide)!.note}`
  const offAt = new Set(shown.filter(off).map(x => `${x.file}\n${x.url}`))
  const blocked = (file: string) => (url: string) => (url in rejected && !keepLogo(url)) || url in added || offAt.has(`${file}\n${url}`)
  // Pages this run would leave with no photo of their own: more than the cap, and none of them loses any.
  const real = (ps: Photo[] | undefined) => (ps ?? []).filter(p => !p.generated)
  const ownPhotos = async (file: string) => real((await readJson<{ photos?: Photo[] }>(file))?.photos)
  const pageFiles = [...new Set(shown.filter(x => !x.guide && x.file.endsWith('entity.json')).map(x => x.file))]
  const emptying: string[] = []
  for (const file of pageFiles) { const ps = await ownPhotos(file); if (ps.length && ps.every(p => blocked(file)(p.url))) emptying.push(file) }
  // A page with none of its own whose album would go whole is left with nothing too (the chief of staff, 2026-11-14).
  const galleryOf = (file: string) => join(content, 'gallery', `${file.split('/').at(-2)}.json`)
  for (const g of [...new Set(shown.filter(x => !x.guide && /\/gallery\/[^/]+\.json$/.test(x.file)).map(x => x.file))]) {
    const s = byId.get(g.split('/').at(-1)!.replace(/\.json$/, ''))
    if (!s) continue
    const file = join(content, s.kind, s.id, 'entity.json')
    if (emptying.includes(file) || (await ownPhotos(file)).length) continue
    const ps = await ownPhotos(g)
    if (ps.length && ps.every(p => blocked(g)(p.url))) emptying.push(file)
  }
  // A cap that isn't a whole number (a typo) is the usual one: it never lets a run through unheld.
  const cap = Number.isInteger(o.emptyCap) && o.emptyCap! >= 0 ? o.emptyCap! : EMPTY_CAP
  const heldPages = emptying.length > cap ? emptying : []
  // A held page keeps its album too.
  const held = new Set([...heldPages, ...heldPages.map(galleryOf)])
  const pageOf = (file: string) => file.slice(content.length + 1).split('/').slice(0, 2).join('/')
  for (const file of heldPages) report.heads.held.push(`${pageOf(file)}: ${((await ownPhotos(file))[0] ?? (await ownPhotos(galleryOf(file)))[0])!.url}`)
  // Each photo a held page would have lost goes on the second look, with its reason (last-photo.ts).
  const holding = new Map<string, { why: string; pages: string[] }>()
  for (const file of heldPages) for (const f of [file, galleryOf(file)]) for (const p of await ownPhotos(f)) {
    if (p.url in rejected || !blocked(f)(p.url)) continue
    const id = file.split('/').at(-2)!
    const h = holding.get(p.url) ?? { why: added[p.url] ?? `not ${label(id)}: ${verdict(p.url, id)?.note ?? ''}`, pages: [] }
    h.pages.push(pageOf(file))
    holding.set(p.url, h)
  }
  await holdForSecondLook(root, holding, 'the photo check')
  // The pages held go to engine-state/_photo-held.json (page → true, a map as the engine's other records, so its merge
  // driver keeps it whole) for the sweep, which keeps a refused photo off between two runs and leaves these as the check
  // left them (sweep.ts). The check's hold counts more than the sweep's rule can see (a person, a dead fish or a logo, the
  // first check's verdicts), so the sweep reads it rather than counting again. Before this run writes anything, the hold
  // it found and its own together; at the end, its own alone: a run cut short leaves held every page either holds.
  const heldFile = join(root, 'engine-state/_photo-held.json')
  const writeHeld = (v: Record<string, true>) => writeImageCache(heldFile, `${JSON.stringify(Object.fromEntries(Object.entries(v).sort()), null, 2)}\n`)
  const heldNow = Object.fromEntries(heldPages.map(f => [pageOf(f), true as const]))
  const heldBefore = await readJson<unknown>(heldFile).catch(() => undefined)
  const heldKeys = heldBefore && typeof heldBefore === 'object' && !Array.isArray(heldBefore) ? Object.keys(heldBefore) : []
  await writeHeld({ ...Object.fromEntries(heldKeys.map(k => [k, true as const])), ...heldNow })
  // Not onto the never-again list either, or a later run would take them off through that, unseen.
  for (const file of held) for (const p of await ownPhotos(file)) {
    if (!(p.url in added)) continue
    delete added[p.url]
    report.blocked = report.blocked.filter(x => !x.startsWith(`${p.url}: `))
  }
  for (const file of [...new Set(shown.map(x => x.file))]) {
    if (held.has(file)) continue
    const raw = await readFile(file, 'utf8')
    const data = JSON.parse(raw) as { photos?: Photo[] }
    const before = real(data.photos)[0]?.url
    const removed: string[] = []
    stripPhotos(data, blocked(file), removed, [])
    // A gallery photo that waited (`unchecked`): judged for this page and left on, it shows from the next build.
    const gallery = /\/gallery\/([^/]+)\.json$/.exec(file)?.[1]
    if (gallery) for (const p of (data.photos ?? []) as (Photo & { unchecked?: boolean })[]) {
      const v = p.unchecked ? verdict(p.url, gallery) : undefined
      if (v && (v.person !== undefined || v.file)) delete p.unchecked
    }
    const s = byId.get(file.split('/').at(-2)!)
    // A fish its source's caption calls unwell or blemished (a split fin) counts as not typical, whatever the model said:
    // a fish's in the order below, and a fish's or a breed's where a photo goes ahead of a lead the check can't tell.
    const flawed = (x: Photo) => !!s && s.kind !== 'plants' && !!captionFlaw(x.caption, s.kind === 'breeds')
    if (s && s.kind !== 'breeds' && file.endsWith('entity.json') && data.photos) {
      // A typical photo first, other photos of it next, an old "habitat" verdict last (until it is asked again), each
      // group in the order it had. So a lead the check passes as typical stays the lead, and one that passes but isn't
      // typical gives way to a typical photo in the run that judges that photo, this one or a later one: no pair is
      // compared and no call added (the chief of staff, 2026-11-11). What follows a move is as it was: a head a
      // person picked is put back first by the sweep, which has the last word each cycle (_photo-head-picks.json).
      // Any other head can move, a card's fish too: the cycle's planner then points the day's card at the new head
      // (curation.ts), and no cycle runs `curate --check`, which would name a card and a head that differ.
      // A head a person picked stays first, as the sweep puts it each cycle.
      const r = (x: Photo) => { if (x.generated) return 3; if (picked(s.id, x.url)) return -1; const v = verdict(x.url, s.id); return v?.ok === 'yes' && v.typical && !flawed(x) ? 0 : v?.ok === 'habitat' ? 2 : 1 }
      data.photos = data.photos.map((x, i) => ({ x, i })).sort((a, b) => r(a.x) - r(b.x) || a.i - b.i).map(({ x }) => x)
    }
    // A photo the check can't tell doesn't lead a page that has one it passed (the owner, 2026-11-11): the first passed
    // photo, a typical one before another, goes ahead of it. A breed's page too, whose order is otherwise left as it is.
    // Where nothing on the page passed, the lead stays: that may be the page's only photo.
    if (s && file.endsWith('entity.json') && data.photos) {
      const lead = data.photos.findIndex(x => !x.generated)
      if (lead >= 0 && cantTellOn(cache, s.id)(data.photos[lead]!.url)) {
        const passed = (typical: boolean) => data.photos!.findIndex(x => { const v = x.generated ? undefined : verdict(x.url, s.id); return v?.ok === 'yes' && (!typical || (v.typical && !flawed(x))) })
        const i = passed(true) >= 0 ? passed(true) : passed(false)
        if (i > lead) data.photos.splice(lead, 0, ...data.photos.splice(i, 1))
      }
      // A head a person picked stays first whatever the order above did, as the sweep puts it back each cycle: the steps
      // between the two (the large copies of heads, the side-by-side look) then see the head a person chose. The
      // person's yes for a card rests on it (person-yes.ts): its photo is the check's "can't tell" that the order above
      // would move behind a passed one (the stated exception to the owner's rule of 2026-11-11). A pick that rests on a
      // yes lapses with it, by this pass's verdicts: once the check says anything but "can't tell", the order above holds.
      // A photo its source names only to the genus, as another fish, or with "cf." goes behind those named to the species,
      // and never leads while one of those passes as a head (photo-named.ts; the chief of staff, 2026-11-14). The lead step
      // and the sweep rank the same way, so none undoes another.
      const cls = namedHere(s.id)
      data.photos = namedOrder(data.photos, cls, x => asHead(x, s.id))
      const ref = `${s.kind}/${s.id}`, pick = headPicks[ref]
      const at = data.photos.findIndex(x => x.url === pick)
      if (at > 0 && pickStands(ref, pick!, cache, yes)) data.photos.unshift(...data.photos.splice(at, 1))
      // One still leads where nothing better passes, or a person picked it: listed for the chief of staff each run.
      const first = data.photos.find(x => !x.generated)
      const c = first ? cls(first) : SPECIES
      if (first && c !== SPECIES) report.heads.named.push(`${ref}: ${first.url} (${c === CF ? 'cf.' : 'genus only or another fish'}${picked(s.id, first.url) ? ', picked' : ''})`)
    }
    // In an album it comes after the photos the check passed or has not reached. The album step ranks the same way, but
    // only an album it adds to, so every album gets its order here, each run.
    if (gallery && data.photos) data.photos = realPhotosFirst(cantTellLast(data.photos, cantTellOn(cache, gallery)))
    if (s && file.endsWith('entity.json') && before) {
      const after = real(data.photos)[0]?.url
      if (!after) report.heads.emptied.push(`${pageOf(file)}: ${before}`)
      else if (after !== before) report.heads.moved.push(`${pageOf(file)}: ${before} -> ${after}`)
    }
    const out = `${JSON.stringify(data, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`
    if (out === raw) continue
    report.removed.push(...removed.map(u => `${file.slice(content.length + 1)}: ${u}`))
    await writeFile(file, out)
  }

  // 3. Verdicts, the blocklist (re-read, so entries another step added meanwhile stay) and the review file.
  await writePhotoState(cacheFile, Object.fromEntries(Object.entries(cache).sort()))
  const now = (await readJson<Record<string, string>>(rejectedFile)) ?? {}
  for (const [u, why] of Object.entries(added)) if (!(u in now)) { now[u] = why; report.rejected++ }
  await writePhotoState(rejectedFile, now)
  // This run's hold alone, once its pages, verdicts and never-again list are written (above).
  await writeHeld(heldNow)
  const left = new Map<string, number>()
  for (const s of all) left.set(s.id, 0)
  for (const f of [...new Set(shown.filter(x => !x.guide).map(x => x.file))]) {
    const id = f.endsWith('entity.json') ? f.split('/').at(-2)! : f.split('/').at(-1)!.replace(/\.json$/, '')
    left.set(id, (left.get(id) ?? 0) + ((await readJson<{ photos?: Photo[] }>(f))?.photos?.length ?? 0))
  }
  const review = reviewDoc(all, cache, shown.filter(x => !blocked(x.file)(x.url)), left, o.today ?? new Date().toISOString().slice(0, 10))
  await writeFile(join(root, 'docs/review/photo-subjects.md'), review.doc).catch(() => undefined)
  report.photos = review.photos
  report.unsure = review.unsure
  return report
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ')

/** docs/review/photo-subjects.md: what the check took off each page, what it couldn't tell, and pages it left with no photo. */
export function reviewDoc(all: Subject[], cache: Record<string, Record<string, PhotoVerdict>>, still: Shown[], left: Map<string, number>, today: string) {
  const page = new Map(all.map(s => [s.id, `${s.kind}/${s.id}`]))
  const rows = Object.entries(cache).flatMap(([url, by]) => Object.entries(by).filter(([id]) => page.has(id)).map(([id, v]) => ({ url, id, v })))
  const order = new Map(all.map((s, i) => [s.id, i]))
  const sort = <T extends { id: string; url: string }>(xs: T[]) => xs.sort((a, b) => order.get(a.id)! - order.get(b.id)! || a.url.localeCompare(b.url))
  // A page verdict is about the page's own photos and gallery; a guide verdict about guide photos naming the page.
  const shown = new Set(still.filter(x => x.page).map(x => `${x.page}\n${x.url}\n${!!x.guide}`))
  const on = (r: (typeof rows)[number]) => shown.has(`${r.id}\n${r.url}\n${!!r.v.guide}`)
  const removed = sort(rows.filter(r => (r.v.ok === 'other' || r.v.ok === 'none' || r.v.ok === 'dead' || r.v.person || r.v.logo) && !on(r)))
  const unsure = sort(rows.filter(r => r.v.ok === 'unsure' && on(r)))
  const emptied = all.filter(s => left.get(s.id) === 0 && removed.some(r => r.id === s.id && !r.v.guide))
  const table = (xs: typeof rows) => xs.map(r => `| ${page.get(r.id)}${r.v.guide ? ' (a guide photo)' : ''} | [photo](${r.url}) | ${cell(photoReason(r.v))} |`).join('\n')
  const doc = `# Photos that don't show their page's subject

Written by \`pnpm engine check-photos\` (${today}), most-read pages first. Rules: docs/governance.md, "Photos".
${rows.length} verdicts. Shows it: ${rows.filter(r => r.v.ok === 'yes' && !r.v.person && !r.v.logo).length}; its habitat (asked again): ${rows.filter(r => r.v.ok === 'habitat' && !r.v.logo).length}; something else: ${removed.filter(r => r.v.ok === 'other').length}; not a photo of it: ${removed.filter(r => r.v.ok === 'none').length}; dead or as food: ${removed.filter(r => r.v.ok === 'dead').length}; a person in it: ${removed.filter(r => r.v.person && r.v.ok !== 'dead').length}; a logo on it: ${removed.filter(r => r.v.logo && !r.v.person && r.v.ok !== 'dead').length}; can't tell: ${unsure.length}.

## Left with no photo (${emptied.length})

${emptied.length ? emptied.map(s => `- ${page.get(s.id)}`).join('\n') : 'None.'}

## Can't tell: still shown (${unsure.length})

| Page | Photo | Recorded outcome |
| --- | --- | --- |
${table(unsure)}

## Removed (${removed.length})

"Something else" names what the photo shows instead; "dead" a dead fish or fish as food (a market, a catch, a preserved specimen), "people" a person or part of one (a hand holding the fish), and "logo" a mark added on the photo, all three off every page; the rest are maps, landscapes with no fish, hands, tanks, packshots and the like.

| Page | Photo | Recorded outcome |
| --- | --- | --- |
${table(removed)}
`
  return { doc, photos: rows.length, unsure: unsure.length }
}
