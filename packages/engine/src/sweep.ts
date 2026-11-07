import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mayPublish, QUALITY_THRESHOLD, resolveDataCard, shownCard, tankSearch, WRITTEN_LANGS, type DataCardField, type SpeciesEntity, type WrittenLang } from '@aq/schema'
import { breedKin, breedNames, cleanAltNames, cleanBreedAltNames, tidyNames, type BreedName, type NameOff } from './alt-names'
import { linkBreed, speciesResolver, type BreedFacts } from './breeds'
import { LlmError, type Llm } from './claude'
import { cardSlips, countMismatch, ctxOf, cutFurniture, dropEmptyHeadings, dropPermissionNotes, dropRepeats, fixTranslation, isAdPoster, isMap, NAMED_KINDS, renumberLabels, stripCount, SWEPT_KINDS, wrongFish } from './content-rules'
import { loadPages, sectionFields } from './pages'
import { sfDifficulty } from './process'
import { rewriteTitle } from './reader'
import { logReviews } from './review-log'
import { viWording } from './sanitize'
import { snapshotName } from './snapshot'
import { isShop, readVarietyPages, withoutShopTalk } from './species-sources'
import { carryTopicChecks } from './topic-check'
import { breedsNamed } from './topics'
import { readVideoRejected } from './videos'

/**
 * The content rules' safe fixes (content-rules.ts, RATCHETED) on every page, each cycle, before the build, as
 * `pnpm engine metric` does for units: a page the engine never writes again loses its defect too, and the real-content
 * test fails on any left. Each file keeps its own indentation, and no page's date changes.
 * - the source site's comments, comment form and related posts: cut (cutFurniture)
 * - empty headings and blocks: dropped; a repeated paragraph: the later copy dropped; labels out of order: renumbered
 * - a sentence that only says the text is translated, adapted or used with permission (the source's note under an
 *   article it reprints): dropped, its paragraph too when it is all there is (dropPermissionNotes)
 * - a photo whose caption names another fish the site has, or is a map: off that page (its file and its gallery). A map
 *   leaves every page (engine-state/_photo-rejected.json); a photo of another fish may still join that fish's page, so
 *   it is taken off again whenever a later run brings it back here
 * - a rejected video (engine-state/_video-rejected.json): off every species and plant page
 * - a card figure out of bounds, upside down, or a tank shorter than twice the fish: hidden (`hidden`: why), not deleted;
 *   worked out again each run, so a figure whose reason went (a corrected size) shows again. The species' approved
 *   summary, checked against the old card, goes back to pending: hidden until the summaries step writes it again
 * - a species' Seriously Fish difficulty: the word its stored page rates it (process.ts sfDifficulty), or none when the
 *   page rates nothing, for cards read before the engine read that word; a page in the old layout keeps its figure. Its
 *   approved summary goes back to pending, as above
 * - a species' or plant's text from a shop (species-sources.ts): a block that speaks as the shop or sells goes, in English
 *   and every language (the whole section when a translation's blocks don't match the English's). A page about one
 *   variety (engine-state/_variety-pages.json) leaves a species page, with its source's card figures and photos, unless
 *   it is all the page has; its summary waits to be written again
 * - a species' tank search: the card's minimum tank as shops sell it ("bể cá 60cm", @aq/schema tankSearch), never a
 *   smaller or mini tank the model named ("bể cá mini 20cm" for a betta whose card says 45 cm). A page with no tank row,
 *   or a card with no minimum tank, is left as it is
 * - a guide's title promising a count its text lacks: with `llm`, rewritten by the model (`titles` at most a run, reviewer-gated:
 *   reader.ts rewriteTitle); otherwise, or when the rewrite isn't kept, the number dropped from it. The address stays.
 * - a fish's summary (content/summaries): the words Vietnamese readers write another way written their way (sanitize.ts
 *   viWording), as the page's own text has them (fixTranslation)
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
  /** Pages changed by each text fix: furniture, headings, repeated, labels, permission, name (and tidy: the fixes made on write). */
  text: Record<string, string[]>
  photos: string[]
  rejected: number
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
  /** Other names taken off species pages, `lang/id: "name" (why)`, and off breed pages, `lang/breeds/id: …`. */
  names: string[]
  /** Breeds taken off a guide's mentions, its text naming them by none of their names: `guides/id: breed`. */
  mentions: string[]
  /** Links made from breeds to species pages, `breeds/id: what → species ("research name")`. */
  links: string[]
  /** Breeds whose parents no longer match their research, left unlinked. */
  unmatched: string[]
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

export async function sweep(root: string, o: { llm?: Llm; titles?: number; model?: string } = {}): Promise<SweepReport> {
  const content = join(root, 'content')
  const report: SweepReport = { files: [], text: {}, photos: [], rejected: 0, videos: [], card: [], summaries: [], tanks: [], shop: [], varieties: [], titles: [], names: [], mentions: [], links: [], unmatched: [], stopped: '' }
  const changed = (f: string) => { if (!report.files.includes(f)) report.files.push(f) }
  const guides: { key: string; before: string; after: string }[] = []
  const counted: { file: string; raw: string; t: Stored; kind: string; lang: WrittenLang; id: string }[] = [] // raw: for its indentation

  // Text, in every language the engine writes.
  for (const kind of SWEPT_KINDS) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      for (const lang of WRITTEN_LANGS) {
        const file = join(content, kind, id, `${lang}.json`)
        const raw = await readFile(file, 'utf8').catch(() => null)
        if (!raw) continue
        const before = JSON.parse(raw) as Stored
        const swept = sweepTranslation(before)
        // A name as hobbyists write it (alt-names.ts tidyName): Vietnamese, on the pages named for what they are.
        const t = lang === 'vi' && NAMED_KINDS.includes(kind) && swept.t.name !== undefined && swept.t.altNames ? tidyNames(swept.t as Stored & { name: string; altNames: string[] }, kind) : swept.t
        const fixed = t === swept.t ? swept.fixed : [...swept.fixed, 'name']
        if (fixed.length) {
          await write(file, raw, t)
          changed(`${kind}/${id}/${lang}.json`)
          for (const f of fixed) (report.text[f] ??= []).push(`${kind}/${id}/${lang}`)
          if (kind === 'guides' && before.body !== undefined) guides.push({ key: lang === 'vi' ? id : `${id}:${lang}`, before: before.body, after: t.body! })
        }
        if (kind === 'guides' && t.name && t.body && countMismatch(t.name, t.body)) counted.push({ file, raw, t, kind, lang, id })
      }
    }
  }

  // A fish's summary, written from its page: the words Vietnamese readers write another way, written their way, as on the page.
  for (const f of (await readdir(join(content, 'summaries')).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()) {
    const file = join(content, 'summaries', f)
    const raw = await readFile(file, 'utf8')
    const s = JSON.parse(raw) as { summary: string; mistakes: string[] }
    const next = { ...s, summary: viWording(s.summary), mistakes: s.mistakes.map(viWording) }
    if (JSON.stringify(next) === JSON.stringify(s)) continue
    await write(file, raw, next)
    changed(`summaries/${f}`)
    ;(report.text.wording ??= []).push(`summaries/${f.replace(/\.json$/, '')}`)
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
        if (e instanceof LlmError) report.stopped = `title ${c.lang}/${c.kind}/${c.id}: ${e.message}`
        else how = `number dropped; rewrite failed: ${(e as Error).message.slice(0, 120)}`
      }
    }
    if (title === old || countMismatch(title, c.t.body!)) continue
    await write(c.file, c.raw, { ...c.t, name: title })
    changed(`${c.kind}/${c.id}/${c.lang}.json`)
    report.titles.push(`${c.lang}/${c.kind}/${c.id}: "${old}" → "${title}" (${how})`)
  }
  if (guides.length) await carryTopicChecks(root, guides)

  // Photos: what the caption rule finds on a published page (Vietnamese: the photos are the same in every language).
  const all = await loadPages(content, ['vi'])
  const ctx = ctxOf(all)
  const pages = all.filter(p => p.sci && (p.kind === 'species' || p.kind === 'plants'))
  const off = new Map<string, Map<string, string>>() // page (kind/id) → url → why
  const maps = new Map<string, string>() // url → why
  for (const p of pages) for (const c of p.captions) {
    const other = wrongFish(c.caption, p.sci!, p.latinNames, ctx)
    const why = other ? `caption names ${other}, not ${p.sci}` : isMap(c.caption) ? `a map, not ${p.sci}` : isAdPoster(c.caption) ? `an ad video's poster, not ${p.sci}` : ''
    if (why) off.set(`${p.kind}/${p.id}`, (off.get(`${p.kind}/${p.id}`) ?? new Map()).set(c.url, why))
    if (!other && why) maps.set(c.url, `${why} (${p.kind}/${p.id})`)
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
  // A map or an ad's poster is no fish's photo: off every page, and never picked again.
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
