import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'node-html-parser'
import { loadAll, mayPublish, QUALITY_THRESHOLD, resolveDataCard, shownCard, tankSearch, WRITTEN_LANGS, type Photo, type DataCardField, type SpeciesEntity, type Summary, type WrittenLang } from '@aq/schema'
import { breedKin, breedNames, cleanAltNames, cleanBreedAltNames, tidyNames, type BreedName, type NameOff } from './alt-names'
import { linkBreed, speciesResolver, type BreedFacts } from './breeds'
import { LlmError, type Llm } from './claude'
import { withLNumber } from './l-numbers'
import { cardSlips, countMismatch, ctxOf, cutFurniture, dropEmptyHeadings, dropPermissionNotes, dropRepeats, fixTranslation, isAdPoster, notAlive, isMap, unwellOff, NAMED_KINDS, renameStored, renameSwapped, renameSwappedIn, renumberLabels, sfScoreFixed, stripCount, SWEPT_KINDS, wrongFish } from './content-rules'
import { loadPages, sectionFields } from './pages'
import { sweepPlaceNames } from './place-names'
import { sfDifficulty } from './process'
import { retitleGuide, sourceTitle, titleClashes, titleKey } from './guide-titles'
import { rewriteTitle } from './reader'
import { logReviews } from './review-log'
import { viSearchWords, viWording } from './sanitize'
import { snapshotName } from './snapshot'
import { SOURCES } from './sources'
import { errorKind } from './state'
import { isShop, readVarietyPages, withoutShopTalk } from './species-sources'
import { cardOf, cardProblems } from './summaries'
import { carryTopicChecks } from './topic-check'
import { breedsNamed } from './topics'
import { schoolFromSeriouslyFish } from './traits'
import { readVideoRejected } from './videos'

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
 * - a head photo a person picked (engine-state/_photo-head-picks.json, page → photo, from its own photos or its gallery):
 *   first on its page, the old head second. The steps before the sweep may reorder a page's photos; this has the last word
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
 * - a fish's summary (content/summaries): the words Vietnamese readers write another way written their way (sanitize.ts
 *   viWording), as the page's own text has them (fixTranslation)
 * - a fish's old name, on a Vietnamese page, its summary or a buying guide: its name now, when the sentence says which fish
 *   it is (content-rules.ts renameSwapped). A rename can't stop a publish that way, and what it leaves the tests list.
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
  /** Pages changed by each text fix: furniture, headings, repeated, labels, permission, name, renamed (and tidy: the fixes made on write). */
  text: Record<string, string[]>
  photos: string[]
  rejected: number
  /** Photos the caption rule would have taken off every page, left where they are: more than the cap in one run (`photoCap`), `url (why)`. */
  held: string[]
  /** A page's only photo that its source's caption calls unwell: left on the page, off every card, `kind/id: url (word; …)`. */
  unwell: string[]
  /** Heads a person picked (engine-state/_photo-head-picks.json) put first, `kind/id: old -> new`, or picks not found on the page. */
  heads: string[]
  /** Rejected videos (engine-state/_video-rejected.json) taken off a page, `kind/id: youtubeId (why)`. */
  videos: string[]
  card: string[]
  /** Summaries sent back to be written again, their card having changed. */
  summaries: string[]
  /** Species whose tank search was written again from the card, `id: old → new`. */
  tanks: string[]
  /** A shop's own talk taken off a page, `kind/id: key:source (blocks or the section)`. */
  shop: string[]
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

/** Guides whose title is shared or only a name, written again at most a run (each a write and a review). */
export const GUIDE_RETITLES = 10

export async function sweep(root: string, o: { llm?: Llm; titles?: number; retitles?: number; model?: string; photoCap?: number } = {}): Promise<SweepReport> {
  // Before anything is written. Not a whole number ("1O" for 10 reads as none), every comparison with it is false and
  // the cap would be off (the independent reader, 2026-11-11).
  const cap = o.photoCap ?? PHOTO_CAP
  if (!Number.isInteger(cap) || cap < 0) throw new Error(`sweep: the photo cap is a whole number, 0 or more, not ${cap}`)
  const content = join(root, 'content')
  const report: SweepReport = { files: [], text: {}, photos: [], rejected: 0, held: [], unwell: [], heads: [], videos: [], card: [], summaries: [], tanks: [], shop: [], varieties: [], titles: [], schools: [], names: [], mentions: [], links: [], unmatched: [], unplaced: [], stopped: '' }
  const changed = (f: string) => { if (!report.files.includes(f)) report.files.push(f) }
  const guides: { key: string; before: string; after: string }[] = []
  const counted: { file: string; raw: string; t: Stored; kind: string; lang: WrittenLang; id: string }[] = [] // raw: for its indentation
  // A fish card's school size: Seriously Fish's, never below what another source on the page says (traits.ts), here so
  // every part of the cycle has it before its tests, whatever changed a page's sections.
  for (const id of report.schools = await schoolFromSeriouslyFish(content)) changed(`traits/${id}.json`)
  const titled: { file: string; raw: string; t: Stored; lang: WrittenLang; id: string; title: string }[] = []
  // A place's Vietnamese name with no generic word left in English (place-names.ts).
  for (const id of await sweepPlaceNames(root)) changed(`places/${id}/vi.json`)

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
  const headPicks = JSON.parse(await readFile(join(root, 'engine-state', '_photo-head-picks.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  for (const [ref, url] of Object.entries(headPicks)) {
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
  // A fish its source's caption calls unwell (dead, thin, wounded, sick: content-rules.ts captionFlaw) is not shown where
  // its page has another photo of its own: off the page and its gallery, and never picked again. A page's only photo
  // stays, off every card (curation.ts cardWorthy), and is listed for a person.
  const everyPage = new Set<string>() // the photos this rule alone would take off every page
  for (const p of all) {
    const key = `${p.kind}/${p.id}`
    const { off: gone, kept, picked } = unwellOff(p, new Set(off.get(key)?.keys()))
    if (kept) report.unwell.push(`${key}: ${kept.url} (${kept.word}; the page's only photo)`)
    // A head a person picked stays until a person says it goes: listed each run with its caption, at the size readers see.
    if (picked) report.unwell.push(`${key}: ${picked.url} (${picked.word}; a head a person picked. Its caption: "${p.captions.find(c => c.url === picked.url)?.caption ?? ''}")`)
    for (const x of gone) {
      const why = `unwell: its source's caption says "${x.word}"`
      const drop = off.get(key) ?? new Map<string, string>()
      if (!drop.has(x.url)) off.set(key, drop.set(x.url, why))
      if (!maps.has(x.url)) { maps.set(x.url, `${why} (${key})`); everyPage.add(x.url) }
    }
  }
  // A photo that is left as some page's only one, or is a head a person picked there, is not taken off every page on
  // this rule's word: it leaves the page whose caption calls it unwell and stays on the other, whatever that page's own
  // caption says of it. Another rule's word (a map, a plate) still takes it off every page.
  for (const p of all) {
    const drop = off.get(`${p.kind}/${p.id}`)
    // Distinct photos: two pages today list one address twice among their own.
    const left = [...new Set((p.own ?? []).filter(u => !drop?.has(u)))]
    for (const url of [...(left.length === 1 ? left : []), ...(p.picked && left.includes(p.picked) ? [p.picked] : [])]) if (everyPage.has(url)) maps.delete(url)
  }
  if (maps.size > cap) {
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
  // with the label's number ("2.", "#1"). One it can't place is listed and kept; the site shows it at the guide's end.
  const near = (h: string) => h.replace(/\s+/g, ' ').trim().toLowerCase()
  const numberOf = (h: string) => h.match(/^\s*(#?\d+)[.):]?\s/)?.[1]
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
      const numbered = headings.filter(h => numberOf(h) !== undefined && numberOf(h) === numberOf(label))
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
    if (report.rejected) await writeFile(rejectedFile, `${JSON.stringify(rejected, null, 2)}\n`)
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
  return report
}
