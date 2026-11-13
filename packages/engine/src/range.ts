import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'node-html-parser'
import { z } from 'zod'
import { countryOf, mayPublish, namesCountry, placeCountry, PlaceSchema, RangeSchema, TranslationSchema, type SectionKey, type SourceId, type SpeciesEntity, type SpeciesRange } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { placeId, rangePlace } from './merge'
import { gbifRecords, type Gbif, type RecordsAudit } from './range-records'
import { SOURCES, type SourceConfig } from './sources'
import { errorKind } from './state'

/**
 * Where each species lives in the wild (content `range`, `@aq/schema` RangeSchema), in two parts with their own pace:
 * - `native`, read by the model from what its cited sources say (distribution, habitat, quick facts, notes), again when
 *   that text changes. Every country must come with a sentence of a source that names it, checked here word for word;
 *   one a source calls introduced or doubtful is left out. The sentences stay in engine-state/range/<id>.json.
 * - `records`, its wild records on GBIF (range-records.ts), once the native part is current, again after RECORDS_DAYS.
 * A failed model call or GBIF request leaves the species as it was, tried again after RETRY_HOURS. A call that failed
 * for the usage limit leaves no such mark and stops the step's model calls for the run. GBIF's records are unchanged.
 */

const TEMPLATE = readFileSync(new URL('./prompts/range.md', import.meta.url), 'utf8')
/** Bumped when the prompt or the checks change what an answer gives, so every species is read again (3: `quotes`). */
const VERSION = 3
/** The sections that say where a fish lives. */
const KEYS: SectionKey[] = ['distribution', 'habitat', 'quickFacts', 'notes']
const BLOCK_CHARS = 6000
const MAX_REGIONS = 6
export const RECORDS_DAYS = 30
const RETRY_HOURS = 24
const STATE = 'engine-state/range'

const STATUS = ['native', 'introduced', 'doubtful'] as const
/** The answer's shape, `source` one of the species' own sources (the model once gave "sprucepets (quickFacts)"). */
export function schemaFor(sources: SourceId[]) {
  const source = { type: 'string', enum: [...new Set(sources)] }
  return {
    type: 'object', additionalProperties: false, required: ['countries', 'regions'],
    properties: {
      countries: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['code', 'status', 'source', 'quote', 'words'],
          properties: { code: { type: 'string', pattern: '^[A-Z]{2}$' }, status: { type: 'string', enum: STATUS }, source, quote: { type: 'string', minLength: 1 }, words: { type: 'string', minLength: 1 } },
        },
      },
      regions: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['name', 'source', 'quote', 'country'], properties: { name: { type: 'string', minLength: 1 }, source, quote: { type: 'string', minLength: 1 }, country: { type: 'string', pattern: '^([A-Z]{2})?$' } } },
      },
    },
  }
}
/** The answer as it may come: a claim missing a field is refused one by one, not the whole answer. */
const Answer = z.object({
  countries: z.array(z.object({ code: z.string().optional(), status: z.string().optional(), source: z.string().optional(), quote: z.string().optional(), words: z.string().optional() })),
  regions: z.array(z.object({ name: z.string().optional(), source: z.string().optional(), quote: z.string().optional(), country: z.string().optional() })),
})
type Answer = z.infer<typeof Answer>

export type Block = { source: SourceId; key: SectionKey; text: string }
export type Claim = { code: string; status: string; source: string; quote: string; words: string; ok: boolean; why?: string }
export type RegionClaim = { name: string; source: string; quote: string; country?: string; ok: boolean; why?: string }
type Native = NonNullable<SpeciesRange['native']>

/** Text as quotes are compared: one kind of quote mark, dash and space, no case. */
export const flat = (s: string) => s.normalize('NFKC').replace(/[‘’ʼ`´]/g, "'").replace(/[“”„«»]/g, '"').replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase()
/** The same, without accents: a name matched inside its quote ("Rio Solimões" written "Rio Solimoes"). */
const bare = (s: string) => flat(s).normalize('NFD').replace(/\p{M}/gu, '')

/** A section's text as the model reads it: paragraphs and list items a line each. */
export const textOf = (html: string) => parse(html).structuredText.replace(/\n{2,}/g, '\n').trim()

/** The sections of `entity` that say where it lives, from sources whose text the site may publish, in page order. */
export function blocksOf(entity: Pick<SpeciesEntity, 'sections'>, mayUse: (s: SourceId) => boolean): Block[] {
  return entity.sections.filter(s => KEYS.includes(s.key) && mayUse(s.source)).map(s => ({ source: s.source, key: s.key, text: textOf(s.html).slice(0, BLOCK_CHARS) })).filter(b => b.text)
}

/** What the model reads; its hash is what makes a species read again. */
export function promptOf(scientificName: string, blocks: Block[]): string {
  return `${TEMPLATE}\n\nSpecies: ${scientificName}\n\n${blocks.map(b => `=== source: ${b.source}; section: ${b.key} ===\n${b.text}`).join('\n\n')}`
}
export const inputHash = (scientificName: string, blocks: Block[]) => createHash('sha256').update(`${VERSION}\n${promptOf(scientificName, blocks)}`).digest('hex').slice(0, 16)

/** A source's tier in the engine's registry (sources.ts); one the registry doesn't list counts as a general site. */
export const sourceTier = (id: SourceId): SourceConfig['tier'] => SOURCES.find(s => s.id === id)?.tier ?? 'general'

/**
 * The answer checked against the text: a country stays only with its code a country, a source the species cites, a
 * sentence found in that source's text word for word, and the country's own name in it (`words`, through namesCountry:
 * a place in a country is not its name, "Congo" may be either Congo); a region only with a name found in a sentence of
 * its source, not a country's (MAX_REGIONS, in the answer's order).
 * - When a specialist source (`tier`) says where the species lives, a country or a region, only specialist sources'
 *   countries count: a country only a general pet-care site gives is dropped (`outranked`, with its sentence). General
 *   sites count for a species no specialist covers.
 * - A country is native when a source that counts says so and none that counts calls it introduced or doubtful
 *   (`disputed`: any source called it native).
 * - A region the quote puts in a country left out goes with it.
 * - `quotes`: the sentence each country and region rests on (its first claim that counts), one per sentence, with all
 *   it names, for the page to cite.
 */
export function checkAnswer(answer: Answer, blocks: Block[], tierOf: (id: SourceId) => SourceConfig['tier'] = sourceTier): { native?: Native; claims: Claim[]; regions: RegionClaim[]; disputed: string[]; outranked: Claim[] } {
  const texts = new Map<string, string>()
  for (const b of blocks) texts.set(b.source, `${texts.get(b.source) ?? ''}\n${flat(b.text)}`)
  const sentence = (source: string, quote: string) => {
    const q = flat(quote)
    if (!texts.has(source)) return 'not one of its sources'
    if (q.split(' ').length < 2) return 'no sentence'
    if (!texts.get(source)!.includes(q)) return 'not in the source\'s text'
    return undefined
  }
  const claims: Claim[] = answer.countries.map(c => {
    const claim = { code: c.code ?? '', status: c.status ?? '', source: c.source ?? '', quote: c.quote ?? '', words: c.words ?? '' }
    const why = !STATUS.includes(claim.status as (typeof STATUS)[number]) ? 'no status'
      : !claim.quote.trim() ? 'no quote'
      : sentence(claim.source, claim.quote)
        ?? (!claim.words.trim() || !flat(claim.quote).includes(flat(claim.words)) ? 'its name is not in the quote'
          : !namesCountry(claim.words, claim.code) ? `"${claim.words}" is not ${claim.code || 'a country'}` : undefined)
    return { ...claim, ok: !why, ...(why ? { why } : {}) }
  })
  const named = answer.regions.map(r => {
    const claim = { name: (r.name ?? '').trim(), source: r.source ?? '', quote: r.quote ?? '', ...(r.country ? { country: r.country } : {}) }
    const why = !claim.name ? 'no name' : !claim.quote.trim() ? 'no quote' : sentence(claim.source, claim.quote)
      ?? (!bare(claim.quote).includes(bare(claim.name)) ? 'its name is not in the quote' : countryOf(claim.name) ? 'a country' : undefined)
    return { claim, why }
  })
  const ok = claims.filter(c => c.ok)
  const specialist = (s: string) => tierOf(s as SourceId) === 'specialist'
  const covered = ok.some(c => c.status === 'native' && specialist(c.source)) || named.some(r => !r.why && specialist(r.claim.source))
  const counted = covered ? ok.filter(c => specialist(c.source)) : ok
  const against = new Set(counted.filter(c => c.status !== 'native').map(c => c.code))
  const countries = [...new Set(counted.filter(c => c.status === 'native').map(c => c.code))].filter(c => !against.has(c))
  const outranked = covered ? ok.filter(c => c.status === 'native' && !specialist(c.source) && !countries.includes(c.code) && !against.has(c.code)) : []
  const dropped = new Set(outranked.map(c => c.code))
  // A region the quote puts in a country left out (Nepal's rivers, where the dwarf gourami's records are misidentified) goes with it.
  const regions: RegionClaim[] = named.map(({ claim, why }) => {
    const left = why ?? (claim.country && against.has(claim.country) ? `in ${claim.country}, which a source calls introduced or doubtful`
      : claim.country && dropped.has(claim.country) ? `in ${claim.country}, which only a general site gives` : undefined)
    return { ...claim, ok: !left, ...(left ? { why: left } : {}) }
  })
  const names = new Map<string, RegionClaim>()
  for (const r of regions) if (r.ok && !names.has(bare(r.name))) names.set(bare(r.name), r)
  const kept = [...names.values()].slice(0, MAX_REGIONS)
  const from = new Set([...counted.filter(c => c.status === 'native' && countries.includes(c.code)).map(c => c.source), ...kept.map(r => r.source)])
  const sources = [...new Set(blocks.map(b => b.source))].filter(s => from.has(s))
  const quotes: NonNullable<Native['quotes']> = []
  const quoteOf = (source: string, text: string) => {
    const quote = text.trim()
    let q = quotes.find(x => x.source === source && x.quote === quote)
    if (!q) quotes.push(q = { source: source as SourceId, quote, countries: [], regions: [] })
    return q
  }
  for (const code of countries) { const c = counted.find(x => x.code === code && x.status === 'native')!; quoteOf(c.source, c.quote).countries.push(code) }
  for (const r of kept) quoteOf(r.source, r.quote).regions.push(r.name)
  return {
    native: countries.length || kept.length ? { countries, regions: kept.map(r => r.name), sources, quotes } : undefined,
    claims, regions, outranked,
    disputed: [...new Set(ok.filter(c => c.status === 'native').map(c => c.code))].filter(c => against.has(c)),
  }
}

/** What the engine keeps of each species' range beside the page: the sentences, the refusals, the GBIF match. */
export type Audit = {
  id: string
  native?: {
    input: string; at: string; claims: Claim[]; regions: RegionClaim[]; disputed: string[]
    /** Countries only a general pet-care site gives, dropped because a specialist source says where it lives: with the sentence. */
    outranked: { code: string; source: string; quote: string }[]
    /** The species' origin pages (`places`) as a check: countries only they name, and only the sources do. */
    origin: { pagesOnly: string[]; sourcesOnly: string[] }
  }
  nativeFailed?: { at: string; error: string }
  records?: (RecordsAudit | { unmatched: true }) & { at: string }
  recordsFailed?: { at: string; error: string }
}

export type RangeDeps = { llm: Llm; gbif: Gbif; now: () => Date; order: string[] }
export type RangeReport = {
  native: { read: string[]; quiet: string[]; failed: string[]; calls: number }
  records: { fetched: string[]; unmatched: string[]; failed: string[]; requests: number }
  disputed: string[]; outranked: string[]; origin: string[]
  stopped: string
}

const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const hoursSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 3_600_000 : Infinity)
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))

/** The page's entity with `range` put where the engine writes it, after `places` (or without it), in the file's own indent. */
async function writeRange(file: string, raw: string, range: SpeciesRange | undefined) {
  const { range: _, ...rest } = JSON.parse(raw) as Record<string, unknown>
  const has = range && (range.native || range.records)
  const entity = Object.fromEntries(Object.entries(rest).flatMap(([k, v]) => (k === 'places' && has ? [[k, v], ['range', range]] : [[k, v]])))
  const next = `${JSON.stringify(entity, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`
  if (next !== raw) await writeFile(file, next)
}

/**
 * One pass, most popular first (`order`, then by id): `limit` model calls for species whose sources' text is new or
 * changed (a species with no such text gets no `native`, with no call), then GBIF's records for up to `records` species
 * whose native part is current and whose records are missing, older than RECORDS_DAYS, or counted for other native
 * countries. `only`: these species, whatever is due.
 */
export async function speciesRanges(root: string, deps: RangeDeps, opts: { limit: number; records: number; only?: string[] }): Promise<RangeReport> {
  const now = deps.now()
  const at = now.toISOString()
  const published = (await readJson<Partial<Record<SourceId, { publish?: boolean | 'photos' }>>>(join(root, 'content/sources.json'))) ?? {}
  const mayUse = (s: SourceId) => mayPublish(published[s], 'text')
  const dir = join(root, 'content/species')
  const rank = (id: string) => { const i = deps.order.indexOf(id); return i < 0 ? deps.order.length : i }
  const ids = (await readdir(dir).catch(() => [] as string[])).filter(id => !opts.only || opts.only.includes(id)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  await mkdir(join(root, STATE), { recursive: true })
  const auditFile = (id: string) => join(root, STATE, `${id}.json`)
  const saveAudit = (a: Audit) => writeFile(auditFile(a.id), `${JSON.stringify(a, null, 2)}\n`)
  const report: RangeReport = { native: { read: [], quiet: [], failed: [], calls: 0 }, records: { fetched: [], unmatched: [], failed: [], requests: 0 }, disputed: [], outranked: [], origin: [], stopped: '' }
  const load = async (id: string) => {
    const file = join(dir, id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => '')
    if (!raw) return undefined
    const entity = JSON.parse(raw) as SpeciesEntity
    const audit = (await readJson<Audit>(auditFile(id))) ?? { id }
    const blocks = blocksOf(entity, mayUse)
    return { file, raw, entity, audit, blocks, input: inputHash(entity.scientificName, blocks) }
  }

  for (const id of ids) {
    const s = await load(id)
    if (!s || s.audit.native?.input === s.input) continue
    if (s.blocks.length && (report.stopped || report.native.calls >= opts.limit || hoursSince(s.audit.nativeFailed?.at, now) < RETRY_HOURS)) continue
    let checked: ReturnType<typeof checkAnswer> = { claims: [], regions: [], disputed: [], outranked: [] }
    if (s.blocks.length) {
      report.native.calls++
      try {
        checked = checkAnswer(Answer.parse(await deps.llm({ system: 'Reply only with JSON.', prompt: promptOf(s.entity.scientificName, s.blocks), schema: schemaFor(s.blocks.map(b => b.source)) })), s.blocks)
      } catch (e) {
        // Every account is out of its limit: a later call fails the same way, and a stamp would skip the species for a day.
        if (e instanceof LlmError && errorKind(e.message) === 'usage') { report.stopped = e.message; continue }
        report.native.failed.push(id)
        await saveAudit({ ...s.audit, nativeFailed: { at, error: (e as Error).message.slice(0, 300) } })
        continue
      }
    }
    const old = s.entity.range
    const native = checked.native
    // Records counted inside other native countries no longer add up: dropped until fetched again.
    const records = old?.records && sameSet(old.native?.countries ?? [], native?.countries ?? []) ? old.records : undefined
    try {
      await writeRange(s.file, s.raw, RangeSchema.parse({ ...(native ? { native } : {}), ...(records ? { records } : {}) }))
    } catch (e) {
      report.native.failed.push(id)
      await saveAudit({ ...s.audit, nativeFailed: { at, error: (e as Error).message.slice(0, 300) } })
      continue
    }
    const pages = [...new Set(s.entity.places.map(placeCountry).filter((c): c is string => !!c))]
    const mine = native?.countries ?? []
    const origin = { pagesOnly: pages.filter(c => !mine.includes(c)), sourcesOnly: mine.filter(c => !pages.includes(c)) }
    const { nativeFailed: _, ...audit } = s.audit
    await saveAudit({ ...audit, native: { input: s.input, at, claims: checked.claims, regions: checked.regions, disputed: checked.disputed, outranked: checked.outranked.map(({ code, source, quote }) => ({ code, source, quote })), origin } })
    ;(s.blocks.length ? report.native.read : report.native.quiet).push(id)
    if (checked.disputed.length) report.disputed.push(`${id}: ${checked.disputed.join(', ')}`)
    if (checked.outranked.length) report.outranked.push(`${id}: ${[...new Set(checked.outranked.map(c => `${c.code} (${c.source})`))].join(', ')}`)
    if (s.blocks.length && (origin.pagesOnly.length || origin.sourcesOnly.length)) report.origin.push(`${id}: origin pages only ${origin.pagesOnly.join(', ') || '-'}; sources only ${origin.sourcesOnly.join(', ') || '-'}`)
  }

  const due = async (id: string) => {
    const s = await load(id)
    if (!s || s.audit.native?.input !== s.input || hoursSince(s.audit.recordsFailed?.at, now) < RETRY_HOURS) return undefined
    const native = s.entity.range?.native?.countries ?? []
    const r = s.entity.range?.records
    const fresh = hoursSince(s.audit.records?.at, now) < RECORDS_DAYS * 24
    if (s.audit.records && 'unmatched' in s.audit.records) return fresh ? undefined : { s, first: false }
    if (r && fresh && sameSet((s.audit.records as RecordsAudit | undefined)?.native ?? [], native)) return undefined
    return { s, first: !r }
  }
  const todo = (await Promise.all(ids.map(due))).filter(x => !!x)
  // Species with no records yet first, then the oldest, each group most popular first.
  for (const { s } of [...todo.filter(t => t.first), ...todo.filter(t => !t.first)].slice(0, opts.records)) {
    const native = s.entity.range?.native?.countries ?? []
    const before = deps.gbif.requests()
    try {
      const got = await gbifRecords(s.entity.scientificName, native, deps.gbif, at.slice(0, 10))
      const { recordsFailed: _, ...audit } = s.audit
      if (!got) {
        report.records.unmatched.push(s.entity.id)
        const { records: _, ...range } = s.entity.range ?? {}
        await writeRange(s.file, s.raw, range)
        await saveAudit({ ...audit, records: { unmatched: true, at } })
        continue
      }
      await writeRange(s.file, s.raw, RangeSchema.parse({ ...s.entity.range, records: got.records }))
      await saveAudit({ ...audit, records: { ...got.audit, at } })
      report.records.fetched.push(s.entity.id)
    } catch (e) {
      report.records.failed.push(`${s.entity.id}: ${(e as Error).message}`)
      await saveAudit({ ...s.audit, recordsFailed: { at, error: (e as Error).message.slice(0, 300) } })
    } finally {
      report.records.requests += deps.gbif.requests() - before
    }
  }
  await writeRangePlaces(root, ids)
  return report
}

/** A place for every river and region the ranges name and the site has none for: localize-places then names it in each language. */
export async function writeRangePlaces(root: string, ids: string[]) {
  const dir = join(root, 'content/places')
  const known = new Set(await readdir(dir).catch(() => [] as string[]))
  for (const id of ids) {
    const native = (await readJson<SpeciesEntity>(join(root, 'content/species', id, 'entity.json')))?.range?.native
    for (const name of native?.regions ?? []) {
      if (known.has(placeId(name))) continue
      const said = native!.quotes?.find(q => q.regions.includes(name))?.countries
      const p = rangePlace(name, said?.length ? said : native!.countries)
      known.add(p.entity.id)
      await mkdir(join(dir, p.entity.id), { recursive: true })
      await writeFile(join(dir, p.entity.id, 'entity.json'), `${JSON.stringify(PlaceSchema.parse(p.entity), null, 2)}\n`)
      await writeFile(join(dir, p.entity.id, 'vi.json'), `${JSON.stringify(TranslationSchema.parse(p.vi), null, 2)}\n`)
    }
  }
}
