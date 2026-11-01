import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mayPublish, QUALITY_THRESHOLD, shownCard, type DataCardField, type Lang, type SpeciesEntity } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { cardSlips, countMismatch, ctxOf, cutFurniture, dropEmptyHeadings, dropRepeats, fixTranslation, isMap, renumberLabels, stripCount, SWEPT_KINDS, wrongFish } from './content-rules'
import { loadPages, sectionFields } from './pages'
import { rewriteTitle } from './reader'
import { carryTopicChecks } from './topic-check'

/**
 * The content rules' safe fixes (content-rules.ts, RATCHETED) on every page, each cycle, before the build, as
 * `pnpm engine metric` does for units: a page the engine never writes again loses its defect too, and the real-content
 * test fails on any left. Each file keeps its own indentation, and no page's date changes.
 * - the source site's comments, comment form and related posts: cut (cutFurniture)
 * - empty headings and blocks: dropped; a repeated paragraph: the later copy dropped; labels out of order: renumbered
 * - a photo whose caption names another fish the site has, or is a map: off that page (its file and its gallery). A map
 *   leaves every page (engine-state/_photo-rejected.json); a photo of another fish may still join that fish's page, so
 *   it is taken off again whenever a later run brings it back here
 * - a card figure out of bounds, upside down, or a tank shorter than twice the fish: hidden (`hidden`: why), not deleted;
 *   worked out again each run, so a figure whose reason went (a corrected size) shows again. The species' approved
 *   summary, checked against the old card, goes back to pending: hidden until the summaries step writes it again
 * - a title promising a count its text lacks: with `llm`, rewritten by the model (`titles` at most a run, reviewer-gated:
 *   reader.ts rewriteTitle); otherwise, or when the rewrite isn't kept, the number dropped from it. The address stays.
 */
export type SweepReport = {
  /** Files changed, `kind/id/file`. */
  files: string[]
  /** Pages changed by each text fix: furniture, headings, repeated, labels (and tidy: the fixes made on write). */
  text: Record<string, string[]>
  photos: string[]
  rejected: number
  card: string[]
  /** Summaries sent back to be written again, their card having changed. */
  summaries: string[]
  titles: string[]
  stopped: string
}

const LANGS: Lang[] = ['vi', 'id', 'th']
type Stored = { name?: string; altNames?: string[]; sections?: Record<string, string>; body?: string; definition?: string; summary?: string[]; faq?: { q: string; a: string }[] }

/** A file's own indentation, so a change is the lines it changes. */
const indentOf = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2
const write = async (file: string, raw: string, data: unknown) => writeFile(file, `${JSON.stringify(data, null, indentOf(raw))}\n`)

/** One stored translation with the text fixes made, and which of them changed something. */
export function sweepTranslation<T extends Stored>(t: T): { t: T; fixed: string[] } {
  const fixed: string[] = []
  const tidy = fixTranslation(t) as T
  if (JSON.stringify(tidy) !== JSON.stringify(t)) fixed.push('tidy')
  const fields = [...sectionFields(tidy.sections ?? {}), ...(tidy.body !== undefined ? [{ field: 'body', html: tidy.body }] : []), ...(tidy.definition !== undefined ? [{ field: 'definition', html: tidy.definition }] : [])]
  const prose = (field: string) => !field.startsWith('sections.references')
  const step = (name: string, fs: typeof fields, fix: (html: string) => string) => fs.map(f => {
    const html = prose(f.field) ? fix(f.html) : f.html
    if (html !== f.html && !fixed.includes(name)) fixed.push(name)
    return { ...f, html }
  })
  let out = step('furniture', fields, cutFurniture)
  const repeats = dropRepeats(out)
  if (repeats.some((f, i) => f.html !== out[i]!.html)) fixed.push('repeated')
  out = step('headings', repeats, dropEmptyHeadings)
  out = step('labels', out, renumberLabels)
  const html = (field: string) => out.find(f => f.field === field)!.html
  const next = {
    ...tidy,
    ...(tidy.sections ? { sections: Object.fromEntries(Object.keys(tidy.sections).map(k => [k, html(`sections.${k}`)])) } : {}),
    ...(tidy.body !== undefined ? { body: html('body') } : {}),
    ...(tidy.definition !== undefined ? { definition: html('definition') } : {}),
  }
  return { t: next, fixed }
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

export async function sweep(root: string, o: { llm?: Llm; titles?: number; model?: string } = {}): Promise<SweepReport> {
  const content = join(root, 'content')
  const report: SweepReport = { files: [], text: {}, photos: [], rejected: 0, card: [], summaries: [], titles: [], stopped: '' }
  const changed = (f: string) => { if (!report.files.includes(f)) report.files.push(f) }
  const guides: { key: string; before: string; after: string }[] = []
  const counted: { file: string; raw: string; t: Stored; kind: string; lang: Lang; id: string }[] = [] // raw: for its indentation

  // Text, in every language.
  for (const kind of SWEPT_KINDS) {
    for (const id of (await readdir(join(content, kind)).catch(() => [] as string[])).sort()) {
      for (const lang of LANGS) {
        const file = join(content, kind, id, `${lang}.json`)
        const raw = await readFile(file, 'utf8').catch(() => null)
        if (!raw) continue
        const before = JSON.parse(raw) as Stored
        const { t, fixed } = sweepTranslation(before)
        if (fixed.length) {
          await write(file, raw, t)
          changed(`${kind}/${id}/${lang}.json`)
          for (const f of fixed) (report.text[f] ??= []).push(`${kind}/${id}/${lang}`)
          if (kind === 'guides' && before.body !== undefined) guides.push({ key: lang === 'vi' ? id : `${id}:${lang}`, before: before.body, after: t.body! })
        }
        if (t.name && t.body && countMismatch(t.name, t.body)) counted.push({ file, raw, t, kind, lang, id })
      }
    }
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
    const why = other ? `caption names ${other}, not ${p.sci}` : isMap(c.caption) ? `a map, not ${p.sci}` : ''
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
  // A map is no fish's photo: off every page, and never picked again.
  if (maps.size) {
    const rejectedFile = join(root, 'engine-state', '_photo-rejected.json')
    const rejected = JSON.parse(await readFile(rejectedFile, 'utf8').catch(() => '{}')) as Record<string, string>
    for (const [url, why] of maps) if (!rejected[url]) { rejected[url] = why; report.rejected++ }
    if (report.rejected) await writeFile(rejectedFile, `${JSON.stringify(rejected, null, 2)}\n`)
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
      const hidden = hideSlips(card, kind === 'species'
        ? c => shownCard(c as SpeciesEntity['dataCard'], e.sections ?? [], s => mayPublish(sources[s], 'text')) as Partial<Record<DataCardField, Value[]>>
        : c => c)
      if (JSON.stringify(e) === JSON.stringify(JSON.parse(raw))) continue
      await write(file, raw, e)
      changed(`${kind}/${id}/entity.json`)
      report.card.push(`${kind}/${id}${hidden.length ? `: ${hidden.join('; ')}` : ': shown again'}`)
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
  return report
}
