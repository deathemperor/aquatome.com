import { compactRejection } from './photo-observations'
import { writePhotoState } from './photo-state'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'node-html-parser'
import { loadAll, mayPublish, vnDate, ownNumber, QUALITY_THRESHOLD, resolveDataCard, shownCard, tankSearch, WRITTEN_LANGS, type Photo, type DataCardField, type SpeciesEntity, type Summary, type WrittenLang } from '@aq/schema'
import { breedKin, breedNames, cleanAltNames, cleanBreedAltNames, tidyNames, type BreedName, type NameOff } from './alt-names'
import { linkBreed, speciesResolver, type BreedFacts } from './breeds'
import { LlmError, type Llm } from './claude'
import { dealerNotice } from './fit'
import { droppedName, FISH_NAMES, KIND_PASSAGES, ownWords, type FishName, type KindPassage } from './names'
import { withLNumber } from './l-numbers'
import { pickStands, readPersonYes } from './person-yes'
import { EMPTY_CAP, refusedOn, type PhotoVerdict } from './photo-check'
import { cardSlips, countMismatch, ctxOf, cutFurniture, dropEmptyHeadings, dropPermissionNotes, dropRepeats, fixTranslation, isAdPoster, notAlive, isMap, unwellOff, NAMED_KINDS, renameFishNames, renameStored, renameSwapped, renameSwappedIn, renumberLabels, sfScoreFixed, stripCount, SWEPT_KINDS, wrongFish } from './content-rules'
import { loadPages, sectionFields } from './pages'
import { foldPages } from './page-folds'
import { sweepPlaceNames } from './place-names'
import { sfDifficulty } from './process'
import { retitleGuide, sourceTitle, titleClashes, titleKey } from './guide-titles'
import { rewriteTitle } from './reader'
import { logReviews } from './review-log'
import { viSearchWords, viWording } from './sanitize'
import { snapshotName } from './snapshot'
import { alnum } from './source-photos'
import { SOURCES } from './sources'
import { errorKind } from './state'
import { isShop, readVarietyPages, withoutShopTalk } from './species-sources'
import { cardOf, cardProblems } from './summaries'
import { readVerdicts } from './curation'
import { carryTopicChecks } from './topic-check'
import { breedsNamed } from './topics'
import { schoolFromSeriouslyFish } from './traits'
import { readVideoRejected } from './videos'
import { orderAlbums } from './gallery'
import { keptOwnMark, stripPhotos, type WatermarkEntry } from './watermarks'
import { holdForSecondLook, listAgreed, looks, readSecondLook } from './last-photo'
import { namedOn, namedOrder, passesHead } from './photo-named'

/**
 * The content rules' safe fixes (content-rules.ts, RATCHETED) on every page, each cycle, before the build, as
 * `pnpm engine metric` does for units: a page the engine never writes again loses its defect too, and the real-content
 * test fails on any left. Each file keeps its own indentation, and no page's date changes.
 * - the source site's comments, comment form and related posts: cut (cutFurniture)
 * - empty headings and blocks: dropped; a repeated paragraph: the later copy dropped; labels out of order: renumbered
 * - a sentence that only says the text is translated, adapted or used with permission (the source's note under an
 *   article it reprints): dropped, its paragraph too when it is all there is (dropPermissionNotes)
 * - a photo whose caption names another fish the site has, or is a map, or a Wikimedia Commons photo whose own words say
 *   it is a paper's plate, a microscope picture, a drawing or a dish: off that page (its file and its gallery). A map or
 *   a plate leaves every page (engine-state/_photo-rejected.json); a photo of another fish may still join that fish's page, so
 *   it is taken off again whenever a later run brings it back here
 * - a photo of a fish its source's caption calls unwell (dead, thin, wounded, sick), on a fish's or a breed's page that
 *   has another photo of its own: off the page and its gallery, and onto engine-state/_photo-rejected.json. A page's only
 *   photo stays and is listed (`unwell`)
 * - a guide's photo that is its source's "read next" card (an unplaced photo at the source's card width): off the guide, and
 *   onto engine-state/_photo-rejected.json so a re-read can't bring it back
 * - a photo on the never-again list (engine-state/_photo-rejected.json): off every fish's, plant's, breed's, guide's
 *   and equipment page and every album, as the photo check takes it off (an Aquarium Glaser photo with the shop's own mark kept stays).
 *   So one that the cycle's catch-up with main or a clash at its push brings back leaves again before its tests
 * - a head photo a person picked (engine-state/_photo-head-picks.json, page → photo, from its own photos or its gallery):
 *   first on its page, the old head second. The steps before the sweep may reorder a page's photos; this has the last word.
 *   A pick that rests on a person's yes lapses with it (person-yes.ts)
 * - a rejected video (engine-state/_video-rejected.json): off every species and plant page
 * - a card figure out of bounds, upside down, or a tank shorter than twice the fish: hidden (`hidden`: why), not deleted;
 *   worked out again each run, so a figure whose reason went (a corrected size) shows again. The species' approved
 *   summary, checked against the old card, goes back to pending: hidden until the summaries step writes it again
 * - a fish's approved summary that states a card figure the card no longer shows (summaries.ts cardProblems, against the
 *   card as the build shows it): back to pending, hidden until the summaries step writes it again. A card changes
 *   without its page changing, so the summary's own check, made once, can't hold it
 * - a species' Seriously Fish difficulty: the word its stored page rates it (process.ts sfDifficulty), or none when the
 *   page rates nothing, for cards read before the engine read that word; a page in the old layout keeps its figure. Its
 *   approved summary goes back to pending, as above
 * - a species' Seriously Fish quick-facts line that gives its count of measures as the difficulty ("Độ khó: 7/8"): the
 *   card's figure, in English and every language (content-rules.ts sfScoreFixed). The card doesn't change, so its summary stays
 * - a species' or plant's text from a shop (species-sources.ts): a block that speaks as the shop or sells goes, in English
 *   and every language (the whole section when a translation's blocks don't match the English's). A page about one
 *   variety (engine-state/_variety-pages.json) leaves a species page, with its source's card figures and photos, unless
 *   it is all the page has; its summary waits to be written again
 * - a species' tank search: the card's minimum tank as shops sell it ("bể cá 60cm", @aq/schema tankSearch), never a
 *   smaller or mini tank the model named ("bể cá mini 20cm" for a betta whose card says 45 cm). A page with no tank row,
 *   or a card with no minimum tank, is left as it is
 * - a guide's title promising a count its text lacks: with `llm`, rewritten by the model (`titles` at most a run, reviewer-gated:
 *   reader.ts rewriteTitle); otherwise, or when the rewrite isn't kept, the number dropped from it. A call that failed
 *   for the usage limit leaves that title, and every later one this run, as it is. The address stays.
 * - a guide's title another guide in its language has, or that is only a name ("Dou Mok"): with `llm`, written again by
 *   the model (`retitles` at most a run, reviewer-gated: guide-titles.ts retitleGuide), a person's name kept as the credit.
 *   The address stays.
 * - a fish's or a breed's head the box step found no animal in (engine-state/_photo-boxes.json: null) that the photo check
 *   hasn't passed as the fish: listed, each with the day it was first seen (engine-state/_photo-no-animal-heads.json), for
 *   the cycle's log and the owner's daily report, so a person sees one the day it appears (the chief of staff, 2026-11-12)
 * - a fish's summary (content/summaries): the words Vietnamese readers write another way written their way (sanitize.ts
 *   viWording), as the page's own text has them (fixTranslation)
 * - a fish the chief of staff named (names.ts FISH_NAMES): its Vietnamese page takes the name, guarded (`nameFixed`), with
 *   the name it had among its other names; the address stays, or moves to the row's own with the old one forwarding.
 *   Once guarded, a page is left as it is, but for the row's kept names a writer dropped (nameFish). Its old name in the
 *   photos' captions too, their translations kept (renameCaptions)
 * - a passage a person found calls a fish by another's kind where no rule can tell (names.ts KIND_PASSAGES): written as it
 *   should be (kindPassages)
 * - a species page filed under the wrong animal (page-folds.ts FOLDS): its sources' text, photos and figures joined to
 *   its fish's page and its address forwarding there, or the page moved to its fish's name, once
 * - a fish's old name, on a Vietnamese page, its summary or a buying guide: its name now, when the sentence says which fish
 *   it is, and a named fish's old page name wherever it is (content-rules.ts renameSwapped). A rename can't stop a publish
 *   that way, and what it leaves the tests list.
 * - a species', plant's or breed's Vietnamese name as hobbyists write it (alt-names.ts tidyName): a place keeps its capital
 *   ("Rêu Java"), a plant's name has no "Cây thủy sinh" before it. A name a person fixed (`nameFixed`) stays; the address
 *   stays.
 * - a species' other names, in each language: its own only (alt-names.ts). A breed page's name leaves it (that page is
 *   found by it), a colour form's or bred line's goes, a name written twice is kept once. Each name taken off is kept in
 *   engine-state/_names-off.json with why, for a person to check.
 * - a breed with no link to the species page its research names, or a parent with none (breeds.ts linkBreed): linked,
 *   when exactly one page is that species, by its name or a synonym GBIF gives. A link it has stays. Each link made is
 *   kept in engine-state/_breed-links.json.
 * - a breed's other names, in each language, once it is linked: its own only (alt-names.ts cleanBreedAltNames). Its
 *   species' names and a hybrid's parents' leave it (other pages' text names the species by them), as do another breed
 *   page's name and a name written twice; logged in engine-state/_names-off.json as `lang/breeds/id`. Then a guide's
 *   breeds (topics.ts breedsNamed, when it was written) that its text names by none of their names any more: off it.
 */
export type SweepReport = {
  /** Files changed, `kind/id/file`. */
  files: string[]
  /** Pages changed by each text fix: furniture, headings, repeated, labels, permission, name, fish-name, renamed (and tidy: the fixes made on write). */
  text: Record<string, string[]>
  photos: string[]
  rejected: number
  /** Photos on the never-again list (engine-state/_photo-rejected.json) taken off a page or an album, `file: url (why)`. */
  again: string[]
  /** Photos the caption rule would have taken off every page, left where they are: more than the cap in one run (`photoCap`), `url (why)`. */
  held: string[]
  /** A page's last photo the refused-photo rule would have taken, left for a second look (last-photo.ts), `url: pages (why)`. */
  secondLook: string[]
  /** Photos a second look agreed on, put on the never-again list in this pass (last-photo.ts). */
  agreed: string[]
  /** A page's only photo that its source's caption calls unwell: left on the page, off every card, `kind/id: url (word; …)`. */
  unwell: string[]
  /** Heads a person picked (engine-state/_photo-head-picks.json) put first, `kind/id: old -> new`, picks not found on the page, or picks that lapsed with their person's yes. */
  heads: string[]
  /** Heads its source names only with "cf.", to the genus or as another fish, put behind one named better that passes (photo-named.ts), `kind/id: old -> new`. */
  named: string[]
  /** Heads with no animal in them and no "yes" from the photo check, `kind/id: url (since day)`. */
  noAnimal: string[]
  /** Photos the photo check refused, kept off a page or an album it is back on (photo-check.ts refusedOn), `file: url (why)`. */
  refused: string[]
  /** Pages that rule leaves as they are: held by the check's last run, or more than EMPTY_CAP of them it would leave with no photo, `kind/id (why)`. */
  refusedHeld: string[]
  /** Albums put in the album order (gallery.ts orderAlbums) whose lead photo changed, `id: old -> new`. */
  albums: string[]
  /** Heads a person picked that a page's check calls "none": out of the rule, listed each cycle, `kind/id: url`. */
  refusedPicked: string[]
  /** Rejected videos (engine-state/_video-rejected.json) taken off a page, `kind/id: youtubeId (why)`. */
  videos: string[]
  card: string[]
  /** Summaries sent back to be written again, their card having changed. */
  summaries: string[]
  /** Species whose tank search was written again from the card, `id: old → new`. */
  tanks: string[]
  /** A shop's own talk taken off a page, `kind/id: key:source (blocks or the section)`. */
  shop: string[]
  /** A shop's part that was wholly its notice of a current batch or stock, taken off a page whose heading has another source's text, `kind/id: key:source`. */
  dealer: string[]
  /** The same, left because it's its heading's only text: for the chief of staff, `kind/id: key:source`. */
  dealerOnly: string[]
  /** Pages about one variety taken off a species page, `id: url`; `kept` when it is all the page has. */
  varieties: string[]
  titles: string[]
  /** Fish cards whose school size was set to Seriously Fish's, never below another source's on the page (traits.ts cardSchool): ids. */
  schools: string[]
  /** Other names taken off species pages, `lang/id: "name" (why)`, and off breed pages, `lang/breeds/id: …`. */
  names: string[]
  /** Breeds taken off a guide's mentions, its text naming them by none of their names: `guides/id: breed`. */
  mentions: string[]
  /** Links made from breeds to species pages, `breeds/id: what → species ("research name")`. */
  links: string[]
  /** Breeds whose parents no longer match their research, left unlinked. */
  unmatched: string[]
  /** Guide photos whose label names no heading of the guide, so the site shows them at its end: `guides/id: "label"`. */
  unplaced: string[]
  /** Species pages filed under the wrong animal, joined to their fish's page or moved to it (page-folds.ts): `from → into`. */
  folds: string[]
  stopped: string
}

type Stored = { name?: string; altNames?: string[]; nameFixed?: boolean; sections?: Record<string, string>; body?: string; definition?: string; summary?: string[]; faq?: { q: string; a: string }[] }

/** A file's own indentation, so a change is the lines it changes. */
const indentOf = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
const write = async (file: string, raw: string, data: unknown) => writeFile(file, `${JSON.stringify(data, null, indentOf(raw))}\n`)

/**
 * One stored translation with the text fixes made, and which of them changed something. Again until nothing changes: a
 * fix can make room for another (a repeat or a trailing form heading dropped brings comments under half the text, so
 * they can be cut; labels renumbered make a heading the tidy folds), and the real-content test holds what one pass would
 * leave.
 */
export function sweepTranslation<T extends Stored>(t: T): { t: T; fixed: string[] } {
  const fixed: string[] = []
  const mark = (name: string) => { if (!fixed.includes(name)) fixed.push(name) }
  const prose = (field: string) => !field.startsWith('sections.references')
  let cur = t
  for (let round = 0; round < 5; round++) {
    const tidy = fixTranslation(cur) as T
    if (JSON.stringify(tidy) !== JSON.stringify(cur)) mark('tidy')
    const fields = [...sectionFields(tidy.sections ?? {}), ...(tidy.body !== undefined ? [{ field: 'body', html: tidy.body }] : []), ...(tidy.definition !== undefined ? [{ field: 'definition', html: tidy.definition }] : [])]
    const step = (name: string, fs: typeof fields, fix: (html: string) => string) => fs.map(f => {
      const html = prose(f.field) ? fix(f.html) : f.html
      if (html !== f.html) mark(name)
      return { ...f, html }
    })
    let out = step('furniture', fields, cutFurniture)
    const repeats = dropRepeats(out)
    if (repeats.some((f, i) => f.html !== out[i]!.html)) mark('repeated')
    out = step('headings', repeats, dropEmptyHeadings)
    out = step('labels', out, renumberLabels)
    out = step('permission', out, dropPermissionNotes)
    const html = (field: string) => out.find(f => f.field === field)!.html
    const next = {
      ...tidy,
      ...(tidy.sections ? { sections: Object.fromEntries(Object.keys(tidy.sections).map(k => [k, html(`sections.${k}`)])) } : {}),
      ...(tidy.body !== undefined ? { body: html('body') } : {}),
      ...(tidy.definition !== undefined ? { definition: html('definition') } : {}),
    }
    if (JSON.stringify(next) === JSON.stringify(cur)) break
    cur = next
  }
  return { t: cur, fixed }
}

type Value = { source: string | number; value: number | { min: number; max: number }; hidden?: string }
/** A card's values with `hidden` set on those to keep off the page and cleared on the rest; true when one changed. */
function hideSlips(card: Partial<Record<DataCardField, Value[]>>, shown: (card: Partial<Record<DataCardField, Value[]>>) => Partial<Record<DataCardField, Value[]>>): string[] {
  const before = JSON.stringify(card)
  for (const vs of Object.values(card)) for (const v of vs ?? []) delete v.hidden
  const flat = Object.entries(shown(card)).flatMap(([field, vs]) => (vs ?? []).map(v => ({ field: field as DataCardField, value: v.value, ref: v })))
  const slips = cardSlips(flat)
  for (const { v, why } of slips) v.ref.hidden = why
  return JSON.stringify(card) === before ? [] : slips.map(({ v, why }) => `${v.field} ${JSON.stringify(v.value)}: ${why}`)
}

/** A species card's Seriously Fish difficulty set to the word its stored page gives, or taken off; what changed. */
async function sfWord(root: string, card: Partial<Record<DataCardField, Value[]>>, sections: SpeciesEntity['sections']): Promise<string[]> {
  const sf = card.difficulty?.find(v => v.source === 'seriouslyfish')
  const urls = [...new Set(sections.filter(s => s.source === 'seriouslyfish').map(s => s.sourceUrl))]
  if (!sf || urls.length !== 1) return []
  const d = sfDifficulty(await readFile(join(root, 'sources/seriouslyfish', `${snapshotName(urls[0]!)}.md`), 'utf8').catch(() => ''))
  if (d === undefined || d === sf.value) return []
  const was = sf.value
  if (d) sf.value = d
  else if (card.difficulty!.length > 1) card.difficulty = card.difficulty!.filter(v => v !== sf)
  else delete card.difficulty
  return [`difficulty ${was} → ${d ?? 'none'} (Seriously Fish's word)`]
}

/**
 * The photos a run takes off every page for good by its caption rule (a map, a paper's plate, an ad's poster), at most:
 * nobody looks at them first, and a word that starts to match more than it should would empty pages for good. A run
 * that finds more takes none off and lists them (`held`), the content rules' check keeps finding them, so the cycle's
 * suite holds what it wrote until a person has looked and run `pnpm engine sweep --photo-cap <N>` (the chief of staff,
 * 2026-11-11). The first run of the paper's-plate rule found 28, each looked at on a contact sheet before it ran.
 */
export const PHOTO_CAP = 10

/**
 * Each fish the chief of staff named (names.ts FISH_NAMES): its Vietnamese page's name, guarded (`nameFixed`) so no later
 * step writes another, with the name it had, its old one and the row's others among its other names. The address stays.
 * A guarded page is left (done, or a person chose its name), but a page with the row's name gets back a kept name a
 * writer dropped, and loses a dropped name a writer wrote again. A row may give a new address, the old one forwarding, and
 * a plant's page is named the same way. The pages named or mended, as `<kind>/<id>`.
 */
export async function nameFish(content: string, rows: readonly FishName[] = FISH_NAMES): Promise<string[]> {
  const named: string[] = []
  for (const r of rows) {
    const file = join(content, r.kind ?? 'species', r.id, 'vi.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const t = JSON.parse(raw) as Stored & { name: string; altNames: string[]; slug: string; redirectFrom?: { slug: string; name: string }[] }
    // Guarded: a person named it, and it's left; or this step did, and its kept names come back if a writer dropped them.
    const keep = [r.was, ...(r.alts ?? [])].filter(n => n !== r.name && !droppedName(r, n))
    // A new address: the old one forwards to it, its note the old name, or none when the old name is dropped (apps/site
    // renamed.ts: a forward with no name adds no search name).
    const moved = r.slug && t.slug !== r.slug && !t.nameFixed
      ? { slug: r.slug, redirectFrom: [...(t.redirectFrom ?? []).filter(x => x.slug !== t.slug && x.slug !== r.slug), { slug: t.slug, name: droppedName(r, r.was) ? '' : r.was }] } : {}
    if (t.nameFixed) {
      // This step's name: its kept names back if a writer dropped them, its dropped ones off if a writer wrote them again.
      const lost = keep.filter(n => !t.altNames.includes(n))
      const again = t.altNames.filter(n => droppedName(r, n))
      if (t.name !== r.name || (!lost.length && !again.length)) continue
      await write(file, raw, { ...t, altNames: [...t.altNames.filter(n => !droppedName(r, n)), ...lost] })
    } else await write(file, raw, { ...t, ...moved, name: r.name, altNames: [...new Set([...t.altNames, t.name, ...keep])].filter(n => n !== r.name && !droppedName(r, n)), nameFixed: true })
    named.push(`${r.kind ?? 'species'}/${r.id}`)
  }
  return named
}

/**
 * A renamed fish's old name (names.ts FISH_NAMES) in the photos' captions, written as its name, and each caption's
 * translations kept under its new words (content/captions/<lang>.json is keyed by the Vietnamese). A row's own photos, in
 * its gallery and on its page, say what its own page calls it (names.ts ownWords). The files changed.
 */
export async function renameCaptions(content: string, rows: readonly FishName[] = FISH_NAMES): Promise<string[]> {
  const changed: string[] = []
  const rekey = new Map<string, string>()
  const own = rows.filter(r => r.own).flatMap(r => [[`gallery/${r.id}.json`, r], [`${r.kind ?? 'species'}/${r.id}/entity.json`, r]] as const)
  const files = [...(await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(x => x.endsWith('.json')).map(f => `gallery/${f}`), ...own.map(([f]) => f).filter(f => !f.startsWith('gallery/'))]
  for (const f of files) {
    const raw = await readFile(join(content, f), 'utf8').catch(() => null)
    if (!raw) continue
    const g = JSON.parse(raw) as { photos?: { caption?: string }[] }
    const r = own.find(([o]) => o === f)?.[1]
    let any = false
    const photos = (g.photos ?? []).map(p => {
      const to = p.caption && (r ? ownWords(r, renameFishNames(p.caption)) : renameFishNames(p.caption))
      if (!p.caption || to === p.caption) return p
      any = true
      rekey.set(p.caption, to!)
      return { ...p, caption: to }
    })
    if (!any) continue
    await write(join(content, f), raw, { ...g, photos })
    changed.push(f)
  }
  if (!rekey.size) return changed
  for (const f of (await readdir(join(content, 'captions')).catch(() => [] as string[])).filter(x => x.endsWith('.json'))) {
    const file = join(content, 'captions', f)
    const raw = await readFile(file, 'utf8')
    const map = JSON.parse(raw) as Record<string, string>
    if (![...rekey.keys()].some(k => k in map)) continue
    // In place, so the file's order stays and a diff shows only the keys.
    await write(file, raw, Object.fromEntries(Object.entries(map).map(([k, v]) => [rekey.get(k) ?? k, v])))
    changed.push(`captions/${f}`)
  }
  return changed
}

/** A page's Vietnamese text a reader reads, each string through `fn`, never its names, address or sources: whether it changed. */
async function rewriteText(file: string, fn: (s: string) => string, fields = ['title', 'body', 'sections', 'faq', 'summary', 'intro']): Promise<boolean> {
  const raw = await readFile(file, 'utf8').catch(() => null)
  if (!raw) return false
  const t = JSON.parse(raw) as Record<string, unknown>
  const fix = (v: unknown): unknown => (typeof v === 'string' ? fn(v.normalize('NFC'))
    : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k.startsWith('references') ? x : fix(x)])) : v)
  const next = { ...t, ...Object.fromEntries(fields.flatMap(k => (k in t ? [[k, fix(t[k])]] : []))) }
  if (JSON.stringify(next) === JSON.stringify(t)) return false
  await write(file, raw, next)
  return true
}

/** The passages a person found that a rule can't tell (names.ts KIND_PASSAGES), written as they should be on their page: the pages changed. */
export async function kindPassages(content: string, rows: readonly KindPassage[] = KIND_PASSAGES): Promise<string[]> {
  const changed: string[] = []
  for (const page of new Set(rows.map(r => r.page))) {
    if (await rewriteText(join(content, page, 'vi.json'), v => rows.filter(r => r.page === page).reduce((s, r) => s.replaceAll(r.was, r.now), v))) changed.push(page)
  }
  return changed
}

/** A row's own page and its summary in its own words (names.ts ownWords), where they wrote a name that is another's: the files changed. */
export async function ownPages(content: string, rows: readonly FishName[] = FISH_NAMES): Promise<string[]> {
  const changed: string[] = []
  for (const r of rows.filter(x => x.own)) {
    const page = `${r.kind ?? 'species'}/${r.id}/vi.json`
    if (await rewriteText(join(content, page), s => ownWords(r, s))) changed.push(page)
    if (await rewriteText(join(content, 'summaries', `${r.id}.json`), s => ownWords(r, s), ['summary', 'mistakes'])) changed.push(`summaries/${r.id}.json`)
  }
  return changed
}

/**
 * Photos shown with a credit their source's permission record refuses (content/sources.json `permission.refusedCredits`),
 * url → why, on pages and in albums. The credit is the line the source printed under the photo, read from the saved copy
 * of its page (sources/<source>/): an image line that is the photo's caption followed by a refused credit, compared by
 * letters and digits. Where one caption sits under several figures, the first decides, as the picker keeps the first
 * figure of a caption. A photo with no caption, and one the saved copy doesn't show, can't be told and stay.
 */
/** The never-again list as the sweep strips it: a listed photo leaves every page, but one a shop's own mark keeps (watermarks.ts keptOwnMark). */
async function neverAgain(root: string) {
  const rejected = JSON.parse(await readFile(join(root, 'engine-state', '_photo-rejected.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const kept = keptOwnMark(rejected, JSON.parse(await readFile(join(root, 'engine-state', '_photo-watermarks.json'), 'utf8').catch(() => '{}')) as Record<string, WatermarkEntry>)
  return { rejected, listed: (url: string) => url in rejected && !kept(url) }
}

async function refusedByCredit(root: string, content: string): Promise<Map<string, string>> {
  const records = JSON.parse(await readFile(join(content, 'sources.json'), 'utf8').catch(() => '{}')) as Record<string, { permission?: { refusedCredits?: string[] } }>
  const refused = new Map(Object.entries(records).flatMap(([s, r]) => (r.permission?.refusedCredits?.length ? [[s, r.permission.refusedCredits.map(alnum)] as const] : [])))
  const out = new Map<string, string>()
  if (!refused.size) return out
  const lines = new Map<string, string[]>()
  const saved = async (source: string, url: string) => {
    const k = `${source} ${url}`
    if (!lines.has(k)) lines.set(k, (await readFile(join(root, 'sources', source, `${snapshotName(url)}.md`), 'utf8').catch(() => '')).split('\n').map(alnum).filter(Boolean))
    return lines.get(k)!
  }
  const entities = async (kind: string) => (await readdir(join(content, kind)).catch(() => [] as string[])).sort().map(id => join(content, kind, id, 'entity.json'))
  const albums = (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort().map(f => join(content, 'gallery', f))
  for (const file of [...(await entities('species')), ...(await entities('plants')), ...(await entities('breeds')), ...(await entities('guides')), ...albums]) {
    const data = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as { photos?: Photo[] }
    for (const p of data.photos ?? []) {
      const credits = p.source ? refused.get(p.source) : undefined
      const caption = alnum(p.caption ?? '')
      if (!credits || !caption || out.has(p.url)) continue
      const have = await saved(p.source!, p.sourceUrl)
      // The caption under a credit, in the page's order: what follows it is a name's length, not a sentence that starts
      // with the same words. A line that ends with a refused credit after more words is another figure's longer caption,
      // not a say on this one. The picker keeps the first figure of a caption, so the first line left is this photo's
      // (the independent reader, 2026-11-13: three agency photos stayed while a later figure's credit was another's).
      const lines = have.filter(l => l.startsWith(caption) && l.length - caption.length <= 60).filter(l => credits.some(c => l === caption + c) || !credits.some(c => l.endsWith(c)))
      if (lines.length && credits.some(c => lines[0] === caption + c)) out.set(p.url, `rejected: credited to someone its source's permission doesn't cover (${file.slice(content.length + 1)})`)
    }
  }
  return out
}

/** Guides whose title is shared or only a name, written again at most a run (each a write and a review). */
export const GUIDE_RETITLES = 10

export async function sweep(root: string, o: { llm?: Llm; titles?: number; retitles?: number; model?: string; photoCap?: number; today?: string } = {}): Promise<SweepReport> {
  // Before anything is written. Not a whole number ("1O" for 10 reads as none), every comparison with it is false and
  // the cap would be off (the independent reader, 2026-11-11).
  const cap = o.photoCap ?? PHOTO_CAP
  if (!Number.isInteger(cap) || cap < 0) throw new Error(`sweep: the photo cap is a whole number, 0 or more, not ${cap}`)
  const content = join(root, 'content')
  const report: SweepReport = { files: [], text: {}, photos: [], rejected: 0, again: [], held: [], secondLook: [], agreed: [], unwell: [], heads: [], named: [], noAnimal: [], refused: [], refusedHeld: [], refusedPicked: [], albums: [], videos: [], card: [], summaries: [], tanks: [], shop: [], dealer: [], dealerOnly: [], varieties: [], titles: [], schools: [], names: [], mentions: [], links: [], unmatched: [], unplaced: [], folds: [], stopped: '' }
  const changed = (f: string) => { if (!report.files.includes(f)) report.files.push(f) }
  const guides: { key: string; before: string; after: string }[] = []
  const counted: { file: string; raw: string; t: Stored; kind: string; lang: WrittenLang; id: string }[] = [] // raw: for its indentation
  // A species page filed under the wrong animal, joined to its fish's or moved to it (page-folds.ts): first, so the
  // school size and the text read the page as it is now (Astra, 2026-11-13).
  for (const f of report.folds = await foldPages(root)) changed(`species/${f.split(' → ')[1]}`)
  // A fish card's school size: Seriously Fish's, never below what another source on the page says (traits.ts), here so
  // every part of the cycle has it before its tests, whatever changed a page's sections.
  for (const id of report.schools = await schoolFromSeriouslyFish(content)) changed(`traits/${id}.json`)
  const titled: { file: string; raw: string; t: Stored; lang: WrittenLang; id: string; title: string }[] = []
  // A place's Vietnamese name with no generic word left in English (place-names.ts).
  for (const id of await sweepPlaceNames(root)) changed(`places/${id}/vi.json`)
  // A fish the chief of staff named, before the text: its name is guarded when the renames below read it.
  for (const page of await nameFish(content)) {
    changed(`${page}/vi.json`)
    ;(report.text['fish-name'] ??= []).push(`${page}/vi`)
  }
  for (const page of await kindPassages(content)) {
    changed(`${page}/vi.json`)
    ;(report.text['kind-passage'] ??= []).push(`${page}/vi`)
  }
  for (const f of await ownPages(content)) {
    changed(f)
    ;(report.text['own-words'] ??= []).push(f.replace(/\.json$/, ''))
  }
  for (const f of await renameCaptions(content)) {
    changed(f)
    ;(report.text['fish-name-caption'] ??= []).push(f)
  }

  // Text, in every language the engine writes.
  for (const kind of SWEPT_KINDS) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      // A pleco's L number, in its name in every language (l-numbers.ts).
      const fish = kind === 'species' ? JSON.parse(await readFile(join(content, kind, id, 'entity.json'), 'utf8').catch(() => '{}')) as Partial<SpeciesEntity> : {}
      for (const lang of WRITTEN_LANGS) {
        const file = join(content, kind, id, `${lang}.json`)
        const raw = await readFile(file, 'utf8').catch(() => null)
        if (!raw) continue
        const before = JSON.parse(raw) as Stored
        const swept = sweepTranslation(before)
        // A name as hobbyists write it (alt-names.ts tidyName): Vietnamese, on the pages named for what they are.
        const named = lang === 'vi' && NAMED_KINDS.includes(kind) && swept.t.name !== undefined && swept.t.altNames ? tidyNames(swept.t as Stored & { name: string; altNames: string[] }, kind) : swept.t
        const renamed = lang === 'vi' ? renameStored(named) : named
        const numbered = renamed.name === undefined ? renamed.name : withLNumber(renamed.name, fish.family, fish.lNumber)
        const t = numbered === renamed.name ? renamed : { ...renamed, name: numbered }
        const fixed = [...swept.fixed, ...(named === swept.t ? [] : ['name']), ...(renamed === named ? [] : ['renamed']), ...(t === renamed ? [] : ['lnumber'])]
        if (fixed.length) {
          await write(file, raw, t)
          changed(`${kind}/${id}/${lang}.json`)
          for (const f of fixed) (report.text[f] ??= []).push(`${kind}/${id}/${lang}`)
          if (kind === 'guides' && before.body !== undefined) guides.push({ key: lang === 'vi' ? id : `${id}:${lang}`, before: before.body, after: t.body! })
        }
        if (kind === 'guides' && t.name && t.body && countMismatch(t.name, t.body)) counted.push({ file, raw, t, kind, lang, id })
        if (kind === 'guides' && t.name) titled.push({ file, raw, t, lang, id, title: t.name })
      }
    }
  }

  // A buying guide isn't in SWEPT_KINDS, and the rule reads it: Vietnamese is at the top of the folder.
  for (const f of (await readdir(join(content, 'equipment')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const file = join(content, 'equipment', f)
    const raw = await readFile(file, 'utf8')
    const guide = JSON.parse(raw) as unknown
    const next = renameSwappedIn(guide)
    if (JSON.stringify(next) === JSON.stringify(guide)) continue
    await write(file, raw, next)
    changed(`equipment/${f}`)
    ;(report.text.renamed ??= []).push(`equipment/${f.replace(/\.json$/, '')}`)
  }

  // A fish's summary, written from its page: the words Vietnamese readers write another way, written their way, as on the page.
  for (const f of (await readdir(join(content, 'summaries')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const file = join(content, 'summaries', f)
    const raw = await readFile(file, 'utf8')
    const s = JSON.parse(raw) as { summary: string; mistakes: string[] }
    const next = { ...s, summary: renameSwapped(viWording(s.summary)), mistakes: s.mistakes.map(m => renameSwapped(viWording(m))) }
    if (JSON.stringify(next) === JSON.stringify(s)) continue
    await write(file, raw, next)
    changed(`summaries/${f}`)
    ;(report.text.wording ??= []).push(`summaries/${f.replace(/\.json$/, '')}`)
  }

  // A page's shop searches, in the words its text uses. Fish and plants are the pages with them.
  for (const kind of ['species', 'plants']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const file = join(content, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const e = JSON.parse(raw) as { productSlots?: { keywords: string[] }[] }
      const before = JSON.stringify(e.productSlots ?? [])
      for (const row of e.productSlots ?? []) row.keywords = row.keywords.map(viSearchWords)
      if (JSON.stringify(e.productSlots ?? []) === before) continue
      await write(file, raw, e)
      changed(`${kind}/${id}/entity.json`)
      ;(report.text.wording ??= []).push(`${kind}/${id}/searches`)
    }
  }

  // A species' other names: its own, each once.
  const breeds = Object.fromEntries(await Promise.all(WRITTEN_LANGS.map(async l => [l, await breedNames(content, l)] as const))) as Record<WrittenLang, BreedName[]>
  const offFile = join(root, 'engine-state', '_names-off.json')
  const offLog = JSON.parse(await readFile(offFile, 'utf8').catch(() => '{}')) as Record<string, Record<string, string>>
  const today = new Date().toISOString().slice(0, 10)
  const logOff = (page: string, off: NameOff[], own: { sci?: string; name: string }) => {
    for (const o of off) {
      const why = o.why === 'breed' ? `a breed's name: breeds/${o.of}` : o.why === 'species' ? `a species' name: species/${o.of}` : o.why === 'variety' ? 'a variety\'s name'
        : o.of === own.sci ? 'its scientific name' : o.of === own.name ? 'its name' : `written twice: "${o.of}"`
      report.names.push(`${page}: "${o.name}" (${why})`)
      ;(offLog[page] ??= {})[o.name] ??= `${why}, ${today}`
    }
  }
  for (const id of (await readdir(join(content, 'species')).catch(() => [] as string[])).sort()) {
    const sci = (JSON.parse(await readFile(join(content, 'species', id, 'entity.json'), 'utf8').catch(() => '{}')) as { scientificName?: string }).scientificName
    if (!sci) continue
    for (const lang of WRITTEN_LANGS) {
      const file = join(content, 'species', id, `${lang}.json`)
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const t = JSON.parse(raw) as Stored & { name: string; altNames: string[] }
      const { altNames, off } = cleanAltNames({ name: t.name, sci, altNames: t.altNames }, breeds[lang])
      if (JSON.stringify(altNames) === JSON.stringify(t.altNames)) continue
      await write(file, raw, { ...t, altNames })
      changed(`species/${id}/${lang}.json`)
      logOff(`${lang}/${id}`, off, { sci, name: t.name })
    }
  }

  // A breed's links to the species pages its research names: one written before its species had a page links once it has.
  const species = await speciesResolver(root)
  const linkFile = join(root, 'engine-state', '_breed-links.json')
  const linkLog = JSON.parse(await readFile(linkFile, 'utf8').catch(() => '{}')) as Record<string, string[]>
  for (const id of (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'breeds', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    const research = JSON.parse(await readFile(join(root, 'engine-state', 'breeds', `${id}.json`), 'utf8').catch(() => 'null')) as BreedFacts | null
    if (!raw || !research?.found) continue
    const { entity, links, unmatched } = linkBreed(JSON.parse(raw), research, species)
    if (unmatched) report.unmatched.push(`breeds/${id}: ${unmatched}`)
    if (!links.length) continue
    await write(file, raw, entity)
    changed(`breeds/${id}/entity.json`)
    for (const l of links) { report.links.push(`breeds/${id}: ${l}`); (linkLog[id] ??= []).push(`${l}, ${today}`) }
  }
  if (report.links.length) await writeFile(linkFile, `${JSON.stringify(Object.fromEntries(Object.entries(linkLog).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)

  // A breed's other names: its own, each once. After the links, so a breed linked this cycle is cleaned this cycle.
  const breedIds = (await readdir(join(content, 'breeds')).catch(() => [] as string[])).sort()
  for (const id of breedIds) {
    const e = JSON.parse(await readFile(join(content, 'breeds', id, 'entity.json'), 'utf8').catch(() => 'null')) as { basedOn?: string; parents: { species?: string }[] } | null
    if (!e) continue
    for (const lang of WRITTEN_LANGS) {
      const file = join(content, 'breeds', id, `${lang}.json`)
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const t = JSON.parse(raw) as Stored & { name: string; altNames: string[] }
      const { altNames, off } = cleanBreedAltNames({ id, name: t.name, altNames: t.altNames }, await breedKin(content, e, lang, breeds[lang]), breeds[lang])
      if (JSON.stringify(altNames) === JSON.stringify(t.altNames)) continue
      await write(file, raw, { ...t, altNames })
      changed(`breeds/${id}/${lang}.json`)
      logOff(`${lang}/breeds/${id}`, off, { name: t.name })
    }
  }
  if (report.names.length) await writeFile(offFile, `${JSON.stringify(Object.fromEntries(Object.entries(offLog).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`)

  // A guide's breeds, found by their names when it was written ("cá xiêm" named the halfmoon betta): one its text names by
  // none of their names now leaves its mentions, and that breed's page no longer lists it.
  const isBreed = new Set(breedIds)
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    const g = raw ? JSON.parse(raw) as { mentions?: string[] } : null
    if (!g?.mentions?.some(m => isBreed.has(m))) continue
    const t = JSON.parse(await readFile(join(content, 'guides', id, 'vi.json'), 'utf8').catch(() => 'null')) as Stored | null
    if (!t) continue
    const named = await breedsNamed(content, `${(t.summary ?? []).join(' ')} ${t.body ?? ''}`)
    const gone = g.mentions.filter(m => isBreed.has(m) && !named.includes(m))
    if (!gone.length) continue
    await write(file, raw!, { ...g, mentions: g.mentions.filter(m => !gone.includes(m)) })
    changed(`guides/${id}/entity.json`)
    for (const b of gone) report.mentions.push(`guides/${id}: ${b}`)
  }

  // A title promising a count its text lacks: the model's rewrite when it passes, else the number dropped.
  let budget = o.llm ? (o.titles ?? 3) : 0
  for (const c of counted) {
    const old = c.t.name!
    let title = stripCount(old)
    let how = 'number dropped'
    if (budget > 0 && !report.stopped) {
      budget--
      try {
        const r = await rewriteTitle(o.llm!, old, c.t.body!, c.lang, o.model)
        if (r.score >= QUALITY_THRESHOLD) { title = r.title; how = `rewritten (${r.score.toFixed(2)})` }
        else how = `number dropped; rewrite "${r.title}" not kept (${r.score.toFixed(2)}${r.notes.length ? `: ${r.notes.slice(0, 2).join('; ')}` : ''})`
        await logReviews(root, 'title', { id: `${c.kind}/${c.id}`, lang: c.lang }, [r], title === r.title ? r : undefined, { model: o.model })
      } catch (e) {
        // Every account is out of its limit: dropping the number would keep the title from being offered again.
        if (e instanceof LlmError && errorKind(e.message) === 'usage') {
          report.stopped = `title ${c.lang}/${c.kind}/${c.id}: ${e.message}`
          break
        }
        if (e instanceof LlmError) report.stopped = `title ${c.lang}/${c.kind}/${c.id}: ${e.message}`
        else how = `number dropped; rewrite failed: ${(e as Error).message.slice(0, 120)}`
      }
    }
    if (title === old || countMismatch(title, c.t.body!)) continue
    await write(c.file, c.raw, { ...c.t, name: title })
    changed(`${c.kind}/${c.id}/${c.lang}.json`)
    report.titles.push(`${c.lang}/${c.kind}/${c.id}: "${old}" → "${title}" (${how})`)
  }

  // A guide's title another guide in its language has, or that is only a name (guide-titles.ts): the model's title when
  // it passes its review, `retitles` at most a run. One taken by a guide the run already titled is never written.
  let retitles = o.llm ? (o.retitles ?? GUIDE_RETITLES) : 0
  const taken = (lang: WrittenLang) => new Set(titled.filter(g => g.lang === lang).map(g => titleKey(g.title)))
  for (const c of titleClashes(titled)) {
    if (c.guide.t.nameFixed) continue // a title a person chose stays
    if (retitles <= 0 || report.stopped) break
    retitles--
    const g = c.guide
    const old = g.title
    try {
      const e = JSON.parse(await readFile(join(content, 'guides', g.id, 'entity.json'), 'utf8').catch(() => '{}')) as Parameters<typeof sourceTitle>[1]
      const r = await retitleGuide(o.llm!, { title: g.title, body: g.t.body ?? '', lang: g.lang, why: c.why, source: await sourceTitle(root, e), others: c.with.map(w => ({ title: w.title, body: w.t.body ?? '' })), taken: taken(g.lang) }, o.model)
      await logReviews(root, 'title', { id: `guides/${g.id}`, lang: g.lang }, [r], r.score >= QUALITY_THRESHOLD ? r : undefined, { model: o.model })
      if (r.score < QUALITY_THRESHOLD) {
        report.titles.push(`${g.lang}/guides/${g.id}: "${old}" (${c.why === 'name' ? 'only a name' : 'shared'}): "${r.title}" not kept (${r.score.toFixed(2)}${r.notes.length ? `: ${r.notes.slice(0, 2).join('; ')}` : ''})`)
        continue
      }
      const raw = await readFile(g.file, 'utf8')
      const now = JSON.parse(raw) as Stored
      if (now.name !== g.title) continue // the count step wrote it this run
      await write(g.file, raw, { ...now, name: r.title })
      g.title = r.title
      changed(`guides/${g.id}/${g.lang}.json`)
      report.titles.push(`${g.lang}/guides/${g.id}: "${old}" (${c.why === 'name' ? 'only a name' : 'shared'}) → "${r.title}" (${r.score.toFixed(2)})`)
    } catch (e) {
      if (e instanceof LlmError) report.stopped = `title guides/${g.id}/${g.lang}: ${e.message}`
      else report.titles.push(`${g.lang}/guides/${g.id}: retitle failed: ${(e as Error).message.slice(0, 120)}`)
    }
  }
  if (guides.length) await carryTopicChecks(root, guides)

  // The owner, 2026-11-10: a card and its page's head are always the same photo, so a photo picked for a card becomes the head.
  // Before the photo rules read the pages: a head picked from the gallery is one of the page's own photos from here on,
  // so an unwell photo beside it is not kept as the page's only one and left for the next sweep (the cycle tests after
  // one). No later step puts another photo ahead of the pick. One can still take the picked photo off its page, as it
  // could before: a caption that names another fish, a map or a plate, or a variety's source.
  // A pick that rests on a person's yes lapses with it (person-yes.ts pickStands): it is reported, and the page keeps its order.
  const headPicks = JSON.parse(await readFile(join(root, 'engine-state', '_photo-head-picks.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const yes = await readPersonYes(root)
  const subjects = JSON.parse(await readFile(join(root, 'engine-state', '_photo-subjects.json'), 'utf8').catch(() => '{}')) as Record<string, Record<string, PhotoVerdict>>
  // The chief of staff, 2026-11-14: a photo its source names only with "cf.", to its genus or as another fish never leads
  // while one named better passes as a head (photo-named.ts). The photo check and the lead step rank the same way; this
  // has the last word, so no step between them leaves such a head. A standing pick still leads (the loop below).
  {
    const asHead = passesHead(await readVerdicts(root))
    const on = await namedOn(content)
    type Named = { kind: string; id: string; file: string; raw: string; e: { scientificName?: string; synonyms?: string[]; photos?: Photo[] } }
    const read = async (kind: string) => Promise.all((await readdir(join(content, kind)).catch(() => [] as string[])).sort().map(async (id): Promise<Named | null> => {
      const file = join(content, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      return raw ? { kind, id, file, raw, e: JSON.parse(raw) as Named['e'] } : null
    }))
    const pages = (await Promise.all(['species', 'plants', 'breeds'].map(read))).flat().filter((x): x is Named => !!x)
    for (const p of pages) {
      const photos = p.e.photos ?? []
      if (photos.length < 2 || !p.e.scientificName) continue
      // A standing pick keeps its place here, the rest ordered around it: the loop below puts it first and says so.
      const ref = `${p.kind}/${p.id}`, pick = headPicks[ref]
      const at = pick && pickStands(ref, pick, subjects, yes) ? photos.findIndex(x => x.url === pick) : -1
      const now = namedOrder(at >= 0 ? photos.filter((_, i) => i !== at) : photos, on(p.id), x => asHead(x, p.id))
      if (at >= 0) now.splice(at, 0, photos[at]!)
      if (now.every((x, i) => x.url === photos[i]!.url)) continue
      if (now[0]!.url !== photos[0]!.url) report.named.push(`${ref}: ${photos[0]!.url} -> ${now[0]!.url}`)
      await write(p.file, p.raw, { ...p.e, photos: now })
      changed(`${ref}/entity.json`)
    }
  }
  for (const [ref, url] of Object.entries(headPicks)) {
    if (!pickStands(ref, url, subjects, yes)) { report.heads.push(`${ref}: pick lapsed with its person's yes`); continue }
    const file = join(content, ref, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const e = JSON.parse(raw) as { photos?: Photo[] }
    const own = e.photos ?? []
    let picked = own.find(p => p.url === url)
    if (!picked) {
      const id = ref.split('/')[1]!
      const gallery = JSON.parse(await readFile(join(content, 'gallery', `${id}.json`), 'utf8').catch(() => '{}')) as { photos?: (Photo & { best?: boolean; kind?: string; unchecked?: boolean })[] }
      const found = gallery.photos?.find(p => p.url === url && !p.unchecked)
      if (found) {
        const { best: _b, kind: _k, unchecked: _u, ...photo } = found
        picked = photo
      }
    }
    if (!picked) { report.heads.push(`${ref}: picked photo isn't on the page`); continue }
    if (own[0]?.url === url) continue
    report.heads.push(`${ref}: ${own[0]?.url ?? 'none'} -> ${url}`)
    await write(file, raw, { ...e, photos: [picked, ...own.filter(p => p.url !== url)] })
    changed(`${ref}/entity.json`)
  }
  // Photos: what the caption rule finds on a published page (Vietnamese: the photos are the same in every language).
  const all = await loadPages(content, ['vi'])
  const ctx = ctxOf(all)
  const pages = all.filter(p => p.sci && (p.kind === 'species' || p.kind === 'plants'))
  const off = new Map<string, Map<string, string>>() // page (kind/id) → url → why
  const maps = new Map<string, string>() // url → why
  for (const p of pages) for (const c of p.captions) {
    const other = wrongFish(c.caption, p.sci!, p.latinNames, ctx)
    // A plate's words name every fish on it, the page's among others: it is no photo of any of them.
    const unfit = notAlive(c)
    const why = unfit ? `${unfit}, not ${p.sci}` : other ? `caption names ${other}, not ${p.sci}` : isMap(c.caption) ? `a map, not ${p.sci}` : isAdPoster(c.caption) ? `an ad video's poster, not ${p.sci}` : ''
    if (why) off.set(`${p.kind}/${p.id}`, (off.get(`${p.kind}/${p.id}`) ?? new Map()).set(c.url, why))
    if ((unfit || !other) && why) maps.set(c.url, `${why} (${p.kind}/${p.id})`)
  }
  // What leaves the pages in this pass on another rule's word: a map or a plate above, a credit whose permission we don't
  // hold, and the never-again list, which a second look's agreed photos join first (last-photo.ts). The unwell rule
  // counts none of them as a photo its page keeps. Counted as kept, a photo a guide's check had listed while the page
  // still had another let the unwell rule take that other, and the page was left with none (the guard's read, 14 Nov).
  report.agreed.push(...await listAgreed(root))
  const credit = await refusedByCredit(root, content)
  const already = (await neverAgain(root)).listed
  const captionOff = new Map([...off].map(([k, v]) => [k, new Map(v)]))
  const captionMaps = new Map(maps)
  const unwellAt = report.unwell.length
  // `going`: what leaves in this pass whatever this rule says. `back`: what the cap keeps of the rules above.
  const unwellPass = (going: (url: string) => boolean, back: (url: string) => boolean) => {
    // A fish its source's caption calls unwell (dead, thin, wounded, sick: content-rules.ts captionFlaw) is not shown
    // where its page has another photo of its own: off the page and its gallery, and never picked again. A page's only
    // photo stays, off every card (curation.ts cardWorthy), and is listed for a person; on a page with none of its own,
    // which shows its gallery, so does the gallery's last.
    const everyPage = new Set<string>() // the photos this rule alone would take off every page
    const gone = (p: (typeof all)[number]) => [...(off.get(`${p.kind}/${p.id}`)?.keys() ?? [])].filter(u => !back(u))
    for (const p of all) {
      const key = `${p.kind}/${p.id}`
      const leaving = [...(p.own ?? []), ...(p.gallery ?? [])].filter(going)
      const { off: unwell, kept, picked } = unwellOff(p, new Set([...gone(p), ...leaving]))
      if (kept) report.unwell.push(`${key}: ${kept.url} (${kept.word}; the page's only photo)`)
      // A head a person picked stays until a person says it goes: listed each run with its caption, at the size readers see.
      if (picked) report.unwell.push(`${key}: ${picked.url} (${picked.word}; a head a person picked. Its caption: "${p.captions.find(c => c.url === picked.url)?.caption ?? ''}")`)
      for (const x of unwell) {
        if (going(x.url)) continue // off in this pass on another rule's word
        const why = `unwell: its source's caption says "${x.word}"`
        const drop = off.get(key) ?? new Map<string, string>()
        if (!drop.has(x.url)) off.set(key, drop.set(x.url, why))
        if (!maps.has(x.url)) { maps.set(x.url, `${why} (${key})`); everyPage.add(x.url) }
      }
    }
    // A photo that is left as some page's only one (its own, or its gallery's where it has none of its own), or is a head
    // a person picked there, is not taken off every page on this rule's word: it leaves the page whose caption calls it
    // unwell and stays on the other, whatever that page's own caption says of it. Another rule's word (a map, a plate)
    // still takes it off every page.
    for (const p of all) {
      const drop = off.get(`${p.kind}/${p.id}`)
      const stays = (u: string) => !(drop?.has(u) && !back(u)) && !going(u)
      // Distinct photos: two pages today list one address twice among their own.
      const own = [...new Set((p.own ?? []).filter(stays))]
      const left = own.length ? own : [...new Set((p.gallery ?? []).filter(stays))]
      for (const url of [...(left.length === 1 ? left : []), ...(p.picked && left.includes(p.picked) ? [p.picked] : [])]) if (everyPage.has(url)) maps.delete(url)
    }
    // A photo credited to someone its source's permission doesn't cover (a picture agency's) leaves every page and album
    // for good, under the same cap (the chief of staff, 2026-11-13: a picture agency's photos are never ours).
    for (const [url, why] of credit) if (!maps.has(url)) maps.set(url, why)
  }
  const before = new Set([...maps.keys(), ...credit.keys()])
  unwellPass(url => before.has(url) || already(url), () => false)
  const over = maps.size > cap
  if (over && before.size) {
    // Over the cap, nothing the rules above list for every page goes: the unwell rule counts again what each page keeps.
    off.clear()
    for (const [k, v] of captionOff) off.set(k, new Map(v))
    maps.clear()
    for (const [k, v] of captionMaps) maps.set(k, v)
    report.unwell.length = unwellAt
    unwellPass(already, url => before.has(url))
  }
  if (over) {
    // Too many to take off for good with nobody looking: they stay where they are, and a person is told (PHOTO_CAP).
    report.held = [...maps].map(([url, why]) => `${url} (${why})`)
    for (const drop of off.values()) for (const url of maps.keys()) drop.delete(url)
    maps.clear()
  }
  for (const [page, drop] of off) {
    const [kind, id] = page.split('/') as [string, string]
    for (const file of [join(content, kind, id, 'entity.json'), join(content, 'gallery', `${id}.json`)]) {
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const e = JSON.parse(raw) as { photos?: { url: string }[] }
      if (!(e.photos ?? []).some(ph => drop.has(ph.url))) continue
      for (const ph of e.photos!.filter(x => drop.has(x.url))) report.photos.push(`${page}: ${ph.url} (${drop.get(ph.url)})`)
      await write(file, raw, { ...e, photos: e.photos!.filter(ph => !drop.has(ph.url)) })
      changed(file.slice(content.length + 1))
    }
  }
  // A source's "read next" cards, stored as a guide's photos before the picker knew them (source-photos.ts): the unplaced
  // photos at the card's exact width that end a guide from that source's list, never its lead (an article's own photo that
  // no heading took is earlier in the list). Another article's picture, so off the guide and never picked again.
  const cardWidths = new Map(SOURCES.flatMap(s => (s.cardWidth ? [[s.id as string, s.cardWidth] as const] : [])))
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const e = JSON.parse(raw) as { source?: string; photos?: { url: string; width: number; section?: object }[] }
    const width = cardWidths.get(e.source ?? '')
    if (!width) continue
    const photos = e.photos ?? []
    let end = photos.length
    while (end > 1 && !photos[end - 1]!.section && photos[end - 1]!.width === width) end--
    if (end === photos.length) continue
    for (const p of photos.slice(end)) {
      report.photos.push(`guides/${id}: ${p.url} (a read-next card)`)
      maps.set(p.url, `card: a read-next card of ${e.source}, not an article's photo`)
    }
    await write(file, raw, { ...e, photos: photos.slice(0, end) })
    changed(`guides/${id}/entity.json`)
  }
  // A guide's photo goes under the heading its label names (the site matches the two), so a label follows its heading when
  // the heading is rewritten: the words the sweep writes another way ("Trùn chỉ đỏ" → "Trùng huyết"), else the one heading
  // with the label's own number ("2.", "#1", "Bước 2"; schema headings.ts, so a count title, "3 nguyên nhân chính", has
  // none). One it can't place is listed and kept; the site shows it at the guide's end.
  const near = (h: string) => h.replace(/\s+/g, ' ').trim().toLowerCase()
  for (const id of (await readdir(join(content, 'guides')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'guides', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    const e = raw ? JSON.parse(raw) as { photos?: (Photo & { section?: Record<string, string> })[] } : null
    if (!e?.photos?.some(p => p.section?.vi)) continue
    const t = JSON.parse(await readFile(join(content, 'guides', id, 'vi.json'), 'utf8').catch(() => 'null')) as Stored | null
    const headings = parse(t?.body ?? '').querySelectorAll('h3').map(h => h.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
    const named = (label: string) => headings.find(h => near(h) === near(label))
    let moved = false
    const photos = e.photos.map(p => {
      const label = p.section?.vi
      if (!label || named(label)) return p
      const numbered = ownNumber(label) === undefined ? [] : headings.filter(h => ownNumber(h) === ownNumber(label))
      const to = named(viWording(label)) ?? (numbered.length === 1 ? numbered[0] : undefined)
      if (!to) { report.unplaced.push(`guides/${id}: "${label}"`); return p }
      moved = true
      return { ...p, section: { ...p.section, vi: to } }
    })
    if (!moved) continue
    await write(file, raw!, { ...e, photos })
    changed(`guides/${id}/entity.json`)
    ;(report.text['photo-heading'] ??= []).push(`guides/${id}`)
  }

  // A map, a paper's plate or an ad's poster is no fish's photo: off every page, and never picked again.
  if (maps.size) {
    const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
    const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
    for (const [url, why] of maps) if (!rejected[url]) { rejected[url] = why; report.rejected++ }
    if (report.rejected) await writePhotoState(rejectedFile, rejected)
  }
  // Every photo on the never-again list leaves the pages and albums the photo check strips, by the check's own rule (an
  // Aquarium Glaser photo with the shop's own mark kept stays: watermarks.ts keptOwnMark). The check strips them only
  // in the tree its run started from. The cycle's push keeps its own lines where they clash with main's, so a photo a
  // person took off while a run was under way came back in its album (three on 2026-11-11). The cycle sweeps after it
  // catches up with main, after a clash at its push and after a clean pull there that brought main's commits in
  // (cycle-checks.sh swept_pull). What a second look agreed on joined the list above.
  const { rejected, listed } = await neverAgain(root)
  const shownIn = async (kind: string) => (await readdir(join(content, kind)).catch(() => [] as string[])).sort().map(id => join(content, kind, id, 'entity.json'))
  const galleryFiles = (await readdir(join(content, 'gallery')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort().map(f => join(content, 'gallery', f))
  // Equipment pages too (a category's hero and its types' photos, each language's copy): the photo check strips every
  // content file, so one listed after an equipment page was written stayed on it until the next check
  // (an Aquarium Co-op photo on the aquatic-plants page, in all four languages, 14 Nov).
  const everyJson = async (kind: string) => (await readdir(join(content, kind), { recursive: true }).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort().map(f => join(content, kind, f))
  for (const file of [...(await shownIn('species')), ...(await shownIn('plants')), ...(await shownIn('breeds')), ...galleryFiles, ...(await shownIn('guides')), ...(await everyJson('equipment'))]) {
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const data = JSON.parse(raw) as unknown
    const removed: string[] = []
    stripPhotos(data, listed, removed, [])
    if (!removed.length) continue
    for (const url of removed) report.again.push(`${file.slice(content.length + 1)}: ${url} (${compactRejection(rejected[url]!)})`)
    await write(file, raw, data)
    changed(file.slice(content.length + 1))
  }
  // A photo the check refused stays off: a Seriously Fish read or the monthly backfill puts back what its source still
  // shows, and the next check is hours away (photo-check.ts refusedOn; the chief of staff, 2026-11-13). A run that would
  // leave more than EMPTY_CAP pages with no photo of their own takes none off them or their albums, and lists them, as
  // the check holds such a run.
  {
    const kindOf = new Map<string, string>()
    for (const kind of ['species', 'breeds', 'plants']) for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) kindOf.set(id, kind)
    const standing = Object.entries(headPicks).filter(([ref, url]) => pickStands(ref, url, subjects, yes))
    const pickedOn = new Set(standing.map(([ref, url]) => `${ref.split('/')[1]}\n${url}`))
    const why = refusedOn(subjects, id => kindOf.get(id), (id, url) => pickedOn.has(`${id}\n${url}`), new Set(standing.map(([, url]) => url)))
    for (const [ref, url] of standing) if (Object.values(subjects[url] ?? {}).some(v => !v.guide && v.ok === 'none')) report.refusedPicked.push(`${ref}: ${url}`)
    type Doc = { photos?: { url: string; generated?: boolean }[] }
    // A photo held for a second look, or one it cleared, stays (last-photo.ts).
    const sl = looks(await readSecondLook(root))
    const plan: { file: string; id: string; raw: string; data: Doc; off: Map<string, string> }[] = []
    for (const [id, kind] of [...kindOf].sort((a, b) => a[0].localeCompare(b[0]))) for (const file of [join(content, kind, id, 'entity.json'), join(content, 'gallery', `${id}.json`)]) {
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const data = JSON.parse(raw) as Doc
      const off = new Map((data.photos ?? []).filter(p => !p.generated).flatMap(p => { const w = why(id, p.url); return w && sl.open(p.url) ? [[p.url, w] as const] : [] }))
      if (off.size) plan.push({ file, id, raw, data, off })
    }
    const own = (x: (typeof plan)[number]) => (x.data.photos ?? []).filter(p => !p.generated)
    const emptying = plan.filter(x => x.file.endsWith('entity.json') && own(x).length && own(x).every(p => x.off.has(p.url)))
    // A page with none of its own whose album would go whole is left with nothing too (the chief of staff, 2026-11-14).
    for (const x of plan) {
      if (!x.file.endsWith(`gallery/${x.id}.json`) || !own(x).length || !own(x).every(p => x.off.has(p.url))) continue
      const page = JSON.parse(await readFile(join(content, kindOf.get(x.id)!, x.id, 'entity.json'), 'utf8').catch(() => '{}')) as Doc
      if (!(page.photos ?? []).some(p => !p.generated)) emptying.push(x)
    }
    // The pages the check's last run held (photo-check.ts writes them, page → true), and this run's own past the cap. A
    // held file the sweep can't read holds every page: nothing comes off until a run of the check writes it again.
    const heldRaw = await readFile(join(root, 'engine-state', '_photo-held.json'), 'utf8').then(s => JSON.parse(s) as unknown, (e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? {} : undefined)).catch(() => undefined)
    const readable = !!heldRaw && typeof heldRaw === 'object' && !Array.isArray(heldRaw) && Object.values(heldRaw).every(v => v === true)
    const byCheck = new Set(readable ? Object.keys(heldRaw as object).map(ref => ref.split('/')[1]!) : plan.map(x => x.id))
    const overCap = new Set(emptying.length > EMPTY_CAP ? emptying.map(x => x.id) : [])
    const held = new Set([...byCheck, ...overCap])
    const heldWhy = (id: string) => (!readable ? 'engine-state/_photo-held.json unreadable: nothing taken off' : byCheck.has(id) ? 'held by the photo check' : EMPTY_CAP ? `more than ${EMPTY_CAP} pages left with no photo` : 'would be left with no photo: a person looks first')
    for (const id of [...new Set(plan.map(x => x.id))].filter(id => held.has(id))) report.refusedHeld.push(`${kindOf.get(id)}/${id} (${heldWhy(id)})`)
    // The pages this rule's own count holds go on the second look (the check's own holds it put there itself).
    const holding = new Map<string, { why: string; pages: string[] }>()
    for (const x of plan) if (overCap.has(x.id) && !byCheck.has(x.id)) for (const [url, w] of x.off) {
      const h = holding.get(url) ?? { why: `subject: ${w}`, pages: [] }
      h.pages.push(`${kindOf.get(x.id)}/${x.id}`)
      holding.set(url, h)
    }
    for (const [url, { why, pages }] of holding) report.secondLook.push(`${url}: ${pages.join(', ')} (${why})`)
    await holdForSecondLook(root, holding, 'the sweep (refused photos)')
    for (const x of plan) {
      if (held.has(x.id)) continue
      x.data.photos = x.data.photos!.filter(p => p.generated || !x.off.has(p.url))
      for (const [url, w] of x.off) report.refused.push(`${x.file.slice(content.length + 1)}: ${url} (${w})`)
      await write(x.file, x.raw, x.data)
      changed(x.file.slice(content.length + 1))
    }
  }
  // The calendar names its pictures by address, the app's large copy as often as the page's: a day's, a language's own
  // day's, a guide's, a story's and a week's heroes'. One that is a listed photo, or its large copy, is dropped, and the
  // app shows the page's own (apps/site/src/lib/curation.ts). The planner points the day at the page's head again when it
  // next plans. A loop whose poster is listed goes whole: the poster is required, and the footage shows what it shows.
  const unsplash = (url: string) => (url.startsWith('https://images.unsplash.com/') ? url.split('?')[0]! : url)
  const listedBase = new Map(Object.keys(rejected).filter(listed).map(u => [unsplash(u), u]))
  // The address itself first: a large copy can be listed by its own address too.
  const listedImg = (url: string) => listedBase.get(unsplash(url)) ?? listedBase.get(unsplash(url.replace(/-large\.webp$/, '.webp')))
  const calFile = join(content, 'curation.json')
  const calRaw = await readFile(calFile, 'utf8').catch(() => null)
  if (calRaw) {
    const cal = JSON.parse(calRaw) as { days?: Record<string, unknown>[]; loops?: Record<string, { poster?: string }> }
    let off = 0
    const drop = (o: Record<string, unknown> | undefined, date: string, where: string) => {
      for (const k of ['img', 'guideImg']) {
        const url = typeof o?.[k] === 'string' ? o[k] as string : undefined
        const page = url && listedImg(url)
        if (!page) continue
        delete o![k]
        off++
        report.again.push(`curation.json ${date}${where} ${k}: ${url} (${compactRejection(rejected[page]!)})`)
      }
    }
    for (const d of cal.days ?? []) {
      const date = String(d.date)
      drop(d, date, '')
      drop(d.story as Record<string, unknown> | undefined, date, ' story')
      for (const [lang, own] of Object.entries((d.by ?? {}) as Record<string, Record<string, unknown>>)) drop(own, date, ` ${lang}`)
    }
    for (const w of (cal as { weeks?: { from?: string; hero?: Record<string, unknown>[] }[] }).weeks ?? []) for (const h of w.hero ?? []) drop(h, `week ${w.from}`, ` hero ${h.page}`)
    for (const [id, loop] of Object.entries(cal.loops ?? {})) {
      const page = typeof loop?.poster === 'string' ? listedImg(loop.poster) : undefined
      if (!page) continue
      delete cal.loops![id]
      off++
      report.again.push(`curation.json loop ${id} poster: ${loop.poster} (${compactRejection(rejected[page]!)})`)
    }
    if (off) { await write(calFile, calRaw, cal); changed('curation.json') }
  }
  // A rejected video (engine-state/_video-rejected.json: a thumbnail with a dead fish, …) leaves every page.
  const videoRejected = await readVideoRejected(root)
  for (const kind of Object.keys(videoRejected).length ? ['species', 'plants'] : []) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const file = join(content, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const e = JSON.parse(raw) as { videos?: { youtubeId: string }[] }
      const off = (e.videos ?? []).filter(v => videoRejected[v.youtubeId])
      if (!off.length) continue
      for (const v of off) report.videos.push(`${kind}/${id}: ${v.youtubeId} (${videoRejected[v.youtubeId]})`)
      await write(file, raw, { ...e, videos: e.videos!.filter(v => !videoRejected[v.youtubeId]) })
      changed(`${kind}/${id}/entity.json`)
    }
  }

  // A shop's own talk, and pages about one variety (species-sources.ts): before the card, which then reads what is left.
  const varieties = await readVarietyPages(root)
  type Entity = { sections: SpeciesEntity['sections']; dataCard?: Record<string, { source: string }[]>; photos?: { sourceUrl?: string }[] }
  for (const kind of ['species', 'plants']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const file = join(content, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const e = JSON.parse(raw) as Entity
      if (!e.sections) continue
      const off = new Set(kind === 'species' ? e.sections.filter(x => varieties[x.sourceUrl]).map(x => x.sourceUrl) : [])
      if (!off.size && !e.sections.some(x => isShop(x.source))) continue
      const langs = (await Promise.all(WRITTEN_LANGS.map(async l => {
        const f = join(content, kind, id, `${l}.json`)
        const r = await readFile(f, 'utf8').catch(() => null)
        return r ? [{ f, raw: r, t: JSON.parse(r) as Stored & { sections: Record<string, string> } }] : []
      }))).flat()
      const before = langs.map(l => JSON.stringify(l.t))
      let sections = e.sections
      let summary = false
      if (off.size) {
        const kept = sections.filter(x => !off.has(x.sourceUrl))
        if (!kept.some(x => x.key !== 'references')) report.varieties.push(...[...off].map(u => `${id}: ${u} (kept: all the page has)`))
        else {
          const gone = sections.filter(x => off.has(x.sourceUrl))
          for (const x of gone) if (!kept.some(k => k.key === x.key && k.source === x.source)) for (const l of langs) delete l.t.sections[`${x.key}:${x.source}`]
          for (const src of new Set(gone.map(x => x.source))) {
            if (kept.some(k => k.source === src)) continue
            for (const [f, vs] of Object.entries(e.dataCard ?? {})) {
              const left = vs.filter(v => v.source !== src)
              if (left.length === vs.length) continue
              summary = true
              if (left.length) e.dataCard![f] = left
              else delete e.dataCard![f]
            }
          }
          if (e.photos) e.photos = e.photos.filter(p => !off.has(p.sourceUrl ?? ''))
          sections = kept
          report.varieties.push(...[...off].map(u => `${id}: ${u}`))
        }
      }
      sections = sections.flatMap(x => {
        if (!isShop(x.source) || x.key === 'references') return [x]
        const k = `${x.key}:${x.source}`
        const has = langs.filter(l => l.t.sections[k] !== undefined)
        const { en, tr } = withoutShopTalk(x.html, Object.fromEntries(has.map(l => [l.f, l.t.sections[k]!])))
        if (en === x.html) return [x]
        report.shop.push(`${kind}/${id}: ${k} (${en ? 'blocks' : 'the section'})`)
        for (const l of has) { if (en) l.t.sections[k] = tr[l.f]!; else delete l.t.sections[k] }
        return en ? [{ ...x, html: en }] : []
      })
      // A shop's part that is wholly its notice of a current batch or stock in Vietnamese (fit.ts dealerNotice): off the
      // page, in every language, when its heading has another source's text that isn't such a notice too; else listed for
      // the chief of staff and left (Astra's read: two shops' notices under one heading each took the other for the text
      // that stays, and both went).
      const vi = langs.find(l => l.f.endsWith('/vi.json'))?.t
      const notices = new Set(sections.filter(x => isShop(x.source) && x.key !== 'references' && !!vi?.sections[`${x.key}:${x.source}`] && dealerNotice(vi.sections[`${x.key}:${x.source}`]!)))
      sections = sections.filter(x => {
        const k = `${x.key}:${x.source}`
        if (!notices.has(x)) return true
        if (!sections.some(o => !notices.has(o) && o.key === x.key && o.html.trim())) { report.dealerOnly.push(`${kind}/${id}: ${k}`); return true }
        report.dealer.push(`${kind}/${id}: ${k}`)
        for (const l of langs) delete l.t.sections[k]
        return false
      })
      e.sections = sections
      if (JSON.stringify(e) !== JSON.stringify(JSON.parse(raw))) {
        await write(file, raw, e)
        changed(`${kind}/${id}/entity.json`)
      }
      for (const [i, l] of langs.entries()) if (JSON.stringify(l.t) !== before[i]) { await write(l.f, l.raw, l.t); changed(l.f.slice(content.length + 1)) }
      // The card lost figures: its summary, checked against the old card, waits to be written again.
      const sfile = join(content, 'summaries', `${id}.json`)
      const sraw = summary ? await readFile(sfile, 'utf8').catch(() => null) : null
      const sum = sraw ? JSON.parse(sraw) as { review: string; problems?: string[] } : null
      if (sraw && sum?.review === 'approved') {
        await write(sfile, sraw, { ...sum, review: 'pending', problems: undefined })
        changed(`summaries/${id}.json`)
        report.summaries.push(id)
      }
    }
  }

  // Card figures: hidden or shown again, as the build shows the card (published sources, no tank that is a volume).
  const sources = JSON.parse(await readFile(join(content, 'sources.json'), 'utf8').catch(() => '{}')) as Record<string, { publish?: boolean | 'photos' }>
  for (const kind of ['species', 'breeds']) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      const file = join(content, kind, id, 'entity.json')
      const raw = await readFile(file, 'utf8').catch(() => null)
      if (!raw) continue
      const e = JSON.parse(raw) as { dataCard?: SpeciesEntity['dataCard']; care?: Partial<Record<DataCardField, Value[]>>; sections?: SpeciesEntity['sections'] }
      const card = (kind === 'species' ? e.dataCard : e.care) as Partial<Record<DataCardField, Value[]>> | undefined
      if (!card) continue
      const fixed = kind === 'species' ? await sfWord(root, card, e.sections ?? []) : []
      const hidden = hideSlips(card, kind === 'species'
        ? c => shownCard(c as SpeciesEntity['dataCard'], e.sections ?? [], s => mayPublish(sources[s], 'text')) as Partial<Record<DataCardField, Value[]>>
        : c => c)
      if (JSON.stringify(e) === JSON.stringify(JSON.parse(raw))) continue
      await write(file, raw, e)
      changed(`${kind}/${id}/entity.json`)
      report.card.push(`${kind}/${id}: ${[...fixed, ...hidden].join('; ') || 'shown again'}`)
      // Its summary may state the figure the card no longer shows ("bể tối thiểu dài 200 cm" for a 130 cm fish).
      const sfile = join(content, 'summaries', `${id}.json`)
      const sraw = kind === 'species' ? await readFile(sfile, 'utf8').catch(() => null) : null
      const summary = sraw ? JSON.parse(sraw) as { review: string; problems?: string[] } : null
      if (sraw && summary?.review === 'approved') {
        await write(sfile, sraw, { ...summary, review: 'pending', problems: undefined })
        changed(`summaries/${id}.json`)
        report.summaries.push(id)
      }
    }
  }

  // A Seriously Fish quick-facts line that gave its count of measures as the difficulty: the card's figure, after the card's
  // own correction above.
  for (const id of (await readdir(join(content, 'species')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'species', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    const e = raw ? JSON.parse(raw) as Partial<SpeciesEntity> : null
    const score = e?.dataCard?.difficulty?.find(v => v.source === 'seriouslyfish')?.value
    const quick = e?.sections?.find(s => s.key === 'quickFacts' && s.source === 'seriouslyfish')
    if (typeof score !== 'number' || !quick) continue
    const fixed = sfScoreFixed(quick.html, 'en', score)
    if (fixed !== quick.html) {
      quick.html = fixed
      await write(file, raw!, e)
      changed(`species/${id}/entity.json`)
      ;(report.text['sf-count'] ??= []).push(`species/${id}/en`)
    }
    for (const lang of WRITTEN_LANGS) {
      const tfile = join(content, 'species', id, `${lang}.json`)
      const traw = await readFile(tfile, 'utf8').catch(() => null)
      const t = traw ? JSON.parse(traw) as Stored : null
      const html = t?.sections?.['quickFacts:seriouslyfish']
      if (!html || sfScoreFixed(html, lang, score) === html) continue
      await write(tfile, traw!, { ...t, sections: { ...t!.sections, 'quickFacts:seriouslyfish': sfScoreFixed(html, lang, score) } })
      changed(`species/${id}/${lang}.json`)
      ;(report.text['sf-count'] ??= []).push(`species/${id}/${lang}`)
    }
  }

  // Every approved fish summary against its card as the build shows it (after the figures hidden above): one that states a
  // figure the card doesn't show waits to be written again (summaries.ts cardProblems). A card changes under a summary
  // without its page changing: the rule for sources that disagree (2026-11-07) left Cá neon vua's at 23–27 °C beside a
  // card of 23–29 °C, and 53 more.
  const cards = new Map((await loadAll({ root: content, lang: 'vi', publicBuild: true })).species.map(s => [s.id, cardOf(s)]))
  for (const f of (await readdir(join(content, 'summaries')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const file = join(content, 'summaries', f)
    const raw = await readFile(file, 'utf8')
    const s = JSON.parse(raw) as Summary
    const card = cards.get(s.id)
    if (s.review !== 'approved' || !card || !cardProblems(s, card).length) continue
    await write(file, raw, { ...s, review: 'pending', problems: undefined })
    changed(`summaries/${f}`)
    if (!report.summaries.includes(s.id)) report.summaries.push(s.id)
  }

  // A species' tank search, from its card as the build shows it (after the figures hidden above).
  for (const id of (await readdir(join(content, 'species')).catch(() => [] as string[])).sort()) {
    const file = join(content, 'species', id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => null)
    if (!raw) continue
    const e = JSON.parse(raw) as Pick<SpeciesEntity, 'dataCard' | 'sections' | 'productSlots'>
    const tank = resolveDataCard(shownCard(e.dataCard ?? {}, e.sections ?? [], s => mayPublish(sources[s], 'text')).tankCm ?? [], 'tankCm')?.value
    const row = e.productSlots?.find(x => x.category === 'be-ca')
    if (typeof tank !== 'number' || !row) continue
    const keywords = [tankSearch(tank)]
    if (JSON.stringify(row.keywords) === JSON.stringify(keywords)) continue
    report.tanks.push(`${id}: ${row.keywords.join(', ')} → ${keywords.join(', ')}`)
    row.keywords = keywords
    await write(file, raw, e)
    changed(`species/${id}/entity.json`)
  }
  // Every album in the album order, after every photo above has left: the check's screening order, photo-tank and ruler
  // photos after the others (gallery.ts orderAlbums). Before the heads with no animal are read, as a page's head may be
  // its album's first.
  const albums = await orderAlbums(root, subjects)
  albums.files.forEach(changed)
  report.albums = albums.leads
  report.noAnimal = await noAnimalHeads(root, o.today ?? vnDate(new Date()))
  return report
}

export const NO_ANIMAL_FILE = 'engine-state/_photo-no-animal-heads.json'
/**
 * Fish and breed pages whose head the box step found no animal in and the photo check hasn't passed as the fish ("yes",
 * its own verdict for the page or the first check's): written to NO_ANIMAL_FILE, page → { url, since }, `since` kept
 * while the same photo leads. Returned as `kind/id: url (since day)`.
 */
export async function noAnimalHeads(root: string, today: string): Promise<string[]> {
  const content = join(root, 'content')
  const boxes = JSON.parse(await readFile(join(root, 'engine-state/_photo-boxes.json'), 'utf8').catch(() => '{}')) as Record<string, unknown>
  const v = await readVerdicts(root)
  const before = JSON.parse(await readFile(join(root, NO_ANIMAL_FILE), 'utf8').catch(() => '{}')) as Record<string, { url: string; since: string }>
  const now: Record<string, { url: string; since: string }> = {}
  type Photos = { photos?: (Photo & { generated?: unknown })[] }
  const read = async (file: string) => JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Photos
  // The first check's verdict counts only for a photo on one page, as the photo check reads it.
  const pagesOf = new Map<string, Set<string>>()
  const on = (ps: Photos['photos'], id: string) => { for (const p of ps ?? []) if (!p.generated) pagesOf.set(p.url, (pagesOf.get(p.url) ?? new Set()).add(id)) }
  for (const kind of ['species', 'plants', 'breeds']) for (const id of await readdir(join(content, kind)).catch(() => [] as string[])) on((await read(join(content, kind, id, 'entity.json'))).photos, id)
  for (const f of await readdir(join(content, 'gallery')).catch(() => [] as string[])) if (f.endsWith('.json')) on((await read(join(content, 'gallery', f))).photos, f.replace(/\.json$/, ''))
  for (const kind of ['species', 'breeds']) for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
    const url = (await read(join(content, kind, id, 'entity.json'))).photos?.find(p => !p.generated)?.url
    if (!url || boxes[url] !== null) continue
    const own = v.subjects[url]?.[id]
    if ((own && !own.guide ? own : pagesOf.get(url)?.size === 1 ? v.legacy[url] : undefined)?.ok === 'yes') continue
    const ref = `${kind}/${id}`
    now[ref] = { url, since: before[ref]?.url === url ? before[ref]!.since : today }
  }
  const out = `${JSON.stringify(now, null, 2)}\n`
  if (out !== (await readFile(join(root, NO_ANIMAL_FILE), 'utf8').catch(() => (Object.keys(now).length ? '' : out)))) await writeFile(join(root, NO_ANIMAL_FILE), out)
  return Object.entries(now).map(([ref, x]) => `${ref}: ${x.url} (since ${x.since})`)
}
