import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { mayPublish, WaterSchema, type SourceId, type SpeciesEntity, type SpeciesWater } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { flat, sourceTier, textOf, type Block } from './range'
import type { SourceConfig } from './sources'
import { errorKind } from './state'

/**
 * Whether a species is kept in brackish or sea water (content `water`, `@aq/schema` WaterSchema), read by the model from
 * what its sources say, again when that text changes. A species whose sources never mention salt, the sea or brackish
 * water is fresh with no call. A claim stays only with a sentence of its source, found there word for word, that
 * itself mentions salt, the sea or brackish water. The claims stay in engine-state/water/<id>.json. Water a person set
 * (`fixed`) is left as it is.
 */

const TEMPLATE = readFileSync(new URL('./prompts/water.md', import.meta.url), 'utf8')
/** Bumped when the prompt or the checks change what an answer gives, so every species is read again. */
const VERSION = 1
const BLOCK_CHARS = 6000
const RETRY_HOURS = 24
const STATE = 'engine-state/water'
/** Words a sentence about brackish or sea water has: a species with none in its sources is fresh, with no call. */
export const SALT = /brackish|salt|salin|marine|sea ?water|estuar|mangrove|tidal|coastal|specific gravity|\bsg\b/i
const KINDS = ['brackish', 'marine'] as const

export function schemaFor(sources: SourceId[]) {
  return {
    type: 'object', additionalProperties: false, required: ['claims'],
    properties: {
      claims: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['kind', 'source', 'quote'], properties: { kind: { type: 'string', enum: KINDS }, source: { type: 'string', enum: [...new Set(sources)] }, quote: { type: 'string', minLength: 1 } } },
      },
    },
  }
}
const Answer = z.object({ claims: z.array(z.object({ kind: z.string().optional(), source: z.string().optional(), quote: z.string().optional() })) })
type Answer = z.infer<typeof Answer>
export type Claim = { kind: string; source: string; quote: string; ok: boolean; why?: string }

/** Every section but the references, from sources whose text the site may publish, in page order. */
export function blocksOf(entity: Pick<SpeciesEntity, 'sections'>, mayUse: (s: SourceId) => boolean): Block[] {
  return entity.sections.filter(s => s.key !== 'references' && mayUse(s.source)).map(s => ({ source: s.source, key: s.key, text: textOf(s.html).slice(0, BLOCK_CHARS) })).filter(b => b.text)
}

export function promptOf(scientificName: string, blocks: Block[]): string {
  return `${TEMPLATE}\n\nSpecies: ${scientificName}\n\n${blocks.map(b => `=== source: ${b.source}; section: ${b.key} ===\n${b.text}`).join('\n\n')}`
}
export const inputHash = (scientificName: string, blocks: Block[]) => createHash('sha256').update(`${VERSION}\n${promptOf(scientificName, blocks)}`).digest('hex').slice(0, 16)

/**
 * The answer checked against the text: a claim stays only with a kind, a source the species cites, and a sentence found
 * in that source's text word for word that mentions salt, the sea or brackish water (SALT). When a specialist source
 * (`tier`) has text on the species, only specialist sources' claims count: a general pet-care site that adds salt for a
 * fish Seriously Fish keeps fresh doesn't make it brackish. The water is the first claim that counts, in page order.
 */
export function checkAnswer(answer: Answer, blocks: Block[], tierOf: (id: SourceId) => SourceConfig['tier'] = sourceTier): { water?: SpeciesWater; claims: Claim[] } {
  const texts = new Map<string, string>()
  for (const b of blocks) texts.set(b.source, `${texts.get(b.source) ?? ''}\n${flat(b.text)}`)
  const claims: Claim[] = answer.claims.map(c => {
    const claim = { kind: c.kind ?? '', source: c.source ?? '', quote: (c.quote ?? '').trim() }
    const q = flat(claim.quote)
    const why = !KINDS.includes(claim.kind as (typeof KINDS)[number]) ? 'no kind'
      : !texts.has(claim.source) ? 'not one of its sources'
      : q.split(' ').length < 2 ? 'no sentence'
      : !texts.get(claim.source)!.includes(q) ? 'not in the source\'s text'
      : !SALT.test(claim.quote) ? 'says nothing of salt or the sea' : undefined
    return { ...claim, ok: !why, ...(why ? { why } : {}) }
  })
  const specialist = (s: string) => tierOf(s as SourceId) === 'specialist'
  const covered = blocks.some(b => specialist(b.source))
  const order = [...new Set(blocks.map(b => b.source as string))]
  const counted = claims.filter(c => c.ok && (!covered || specialist(c.source))).sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
  const first = counted[0]
  return { claims, ...(first ? { water: WaterSchema.parse({ kind: first.kind, source: first.source, quote: first.quote }) } : {}) }
}

export type Audit = { id: string; input?: string; at?: string; claims?: Claim[]; failed?: { at: string; error: string } }
export type WaterDeps = { llm: Llm; now: () => Date; order: string[] }
export type WaterReport = { read: string[]; quiet: string[]; failed: string[]; calls: number; salt: string[]; stopped: string }

const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)
const hoursSince = (iso: string | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 3_600_000 : Infinity)

/** The page's entity with `water` put after `range` (or `places`), or without it, in the file's own indent. */
async function writeWater(file: string, raw: string, water: SpeciesWater | undefined) {
  const { water: _, ...rest } = JSON.parse(raw) as Record<string, unknown>
  const after = 'range' in rest ? 'range' : 'places'
  const entity = Object.fromEntries(Object.entries(rest).flatMap(([k, v]) => (k === after && water ? [[k, v], ['water', water]] : [[k, v]])))
  const next = `${JSON.stringify(entity, null, raw.match(/^\{\n( +)/)?.[1]?.length ?? 2)}\n`
  if (next !== raw) await writeFile(file, next)
}

/**
 * One pass, most popular first (`order`, then by id), over species whose sources' text is new or changed: one with no
 * word of salt or the sea is fresh with no call; up to `limit` model calls for the rest. `only`: these species. A call
 * that failed for the usage limit leaves that species' audit as it was and stops the step's model calls for the run.
 */
export async function speciesWater(root: string, deps: WaterDeps, opts: { limit: number; only?: string[] }): Promise<WaterReport> {
  const now = deps.now()
  const at = now.toISOString()
  const published = (await readJson<Partial<Record<SourceId, { publish?: boolean | 'photos' }>>>(join(root, 'content/sources.json'))) ?? {}
  const mayUse = (s: SourceId) => mayPublish(published[s], 'text')
  const dir = join(root, 'content/species')
  const rank = (id: string) => { const i = deps.order.indexOf(id); return i < 0 ? deps.order.length : i }
  const ids = (await readdir(dir).catch(() => [] as string[])).filter(id => !opts.only || opts.only.includes(id)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  await mkdir(join(root, STATE), { recursive: true })
  const auditFile = (id: string) => join(root, STATE, `${id}.json`)
  const report: WaterReport = { read: [], quiet: [], failed: [], calls: 0, salt: [], stopped: '' }
  for (const id of ids) {
    const file = join(dir, id, 'entity.json')
    const raw = await readFile(file, 'utf8').catch(() => '')
    if (!raw) continue
    const entity = JSON.parse(raw) as SpeciesEntity
    if (entity.water?.fixed) continue
    const audit = (await readJson<Audit>(auditFile(id))) ?? { id }
    const blocks = blocksOf(entity, mayUse)
    const input = inputHash(entity.scientificName, blocks)
    if (audit.input === input) continue
    const salty = blocks.some(b => SALT.test(b.text))
    if (salty && (report.stopped || report.calls >= opts.limit || hoursSince(audit.failed?.at, now) < RETRY_HOURS)) continue
    let checked: ReturnType<typeof checkAnswer> = { claims: [] }
    if (salty) {
      report.calls++
      try {
        checked = checkAnswer(Answer.parse(await deps.llm({ system: 'Reply only with JSON.', prompt: promptOf(entity.scientificName, blocks), schema: schemaFor(blocks.map(b => b.source)) })), blocks)
      } catch (e) {
        // Every account is out of its limit: a later call fails the same way, and a stamp would skip the species for a day.
        if (e instanceof LlmError && errorKind(e.message) === 'usage') { report.stopped = e.message; continue }
        report.failed.push(id)
        await writeFile(auditFile(id), `${JSON.stringify({ ...audit, failed: { at, error: (e as Error).message.slice(0, 300) } }, null, 2)}\n`)
        continue
      }
    }
    await writeWater(file, raw, checked.water)
    await writeFile(auditFile(id), `${JSON.stringify({ id, input, at, claims: checked.claims }, null, 2)}\n`)
    ;(salty ? report.read : report.quiet).push(id)
    if (checked.water) report.salt.push(`${id}: ${checked.water.kind} (${checked.water.source})`)
  }
  return report
}
