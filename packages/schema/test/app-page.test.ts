import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { z } from 'zod'
import { Block, drawnKinds, PageDoc, PageShard, type KindShards } from '../src/app-page'

// The app page format, shared with the iOS app (its decode test reads the same vectors).
type Vectors = {
  html: { note: string; blocks: unknown[] }[]
  docs: { note: string; valid: boolean; doc: unknown }[]
  added: { note: string; doc: { blocks: { t: string }[] }; older: string[] }[]
  levels: { note: string; shards: Partial<Record<PageDoc['kind'], KindShards>>; appLevel: number; draws: string[] }[]
}
const VECTORS = new URL('../../../protocols/page-vectors.json', import.meta.url)
const SCHEMA_FILE = new URL('../../../protocols/page.schema.json', import.meta.url)
const v: Vectors = JSON.parse(readFileSync(VECTORS, 'utf8'))

/** The JSON Schema from the zod schemas (UPDATE_SCHEMA=1 rewrites the file). */
function jsonSchema(): string {
  const registry = z.registry<{ id: string }>()
  for (const [id, s] of Object.entries({ PageDoc, PageShard, Block })) registry.add(s, { id })
  const out = z.toJSONSchema(registry, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any', uri: id => `#/$defs/${id}` })
  const defs = Object.fromEntries(Object.entries(out.schemas).map(([k, s]) => { const { $schema: _, $id: __, ...rest } = s as Record<string, unknown>; return [k, rest] }))
  const doc = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from packages/schema/src/app-page.ts by packages/schema/test/app-page.test.ts (UPDATE_SCHEMA=1 pnpm --filter @aq/schema test). A reader shows a block whose t it does not know, or one that does not read, as "open on the web", and ignores fields it does not know: this schema is what the site writes, not all a reader must survive. protocols/page-vectors.json has cases of both.',
    $defs: defs,
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

test('protocols/page.schema.json is up to date', () => {
  const next = jsonSchema()
  if (process.env.UPDATE_SCHEMA === '1') writeFileSync(SCHEMA_FILE, next)
  expect(readFileSync(SCHEMA_FILE, 'utf8'), 'run UPDATE_SCHEMA=1 pnpm --filter @aq/schema test').toBe(next)
})

const ajv = new Ajv2020({ allErrors: true, strict: false })
const schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'))
ajv.addSchema(schema, 'page')
const valid = (def: string, x: unknown) => ajv.validate({ $ref: `page#/$defs/${def}` }, x)

test('every block the converter makes is the format, by zod and by the JSON Schema', () => {
  for (const c of v.html) for (const b of c.blocks) {
    expect(Block.safeParse(b).success, c.note).toBe(true)
    expect(valid('Block', b), `${c.note}: ${ajv.errorsText()}`).toBe(true)
  }
})

test('the site\'s pages are the format; a newer site\'s or a malformed page is not (a reader still shows it)', () => {
  for (const d of v.docs) {
    expect(PageDoc.safeParse(d.doc).success, d.note).toBe(d.valid)
    expect(valid('PageDoc', d.doc), d.note).toBe(d.valid)
  }
})

// The blocks the first app that reads this format knows. A block added since (fish, plant and glossary pages') is
// "open on the web" to it, in its place, and a field added since is nothing: so those kinds are at level 2, which it
// doesn't know (apps/site/src/lib/app-page.ts PAGE_LEVELS).
const FIRST = new Set(['h', 'p', 'list', 'table', 'figure', 'moments', 'summary', 'faq', 'refs', 'pages', 'web'])
const ADDED = ['gallery', 'trust', 'mates', 'climate', 'cards', 'videos']

test('the pages with blocks added after the first app are the format, and an older app shows the web for each of those blocks', () => {
  expect(v.added.length).toBeGreaterThanOrEqual(3)
  for (const d of v.added) {
    expect(PageDoc.safeParse(d.doc).error, d.note).toBeUndefined()
    expect(valid('PageDoc', d.doc), `${d.note}: ${ajv.errorsText()}`).toBe(true)
    expect(d.older, d.note).toEqual(d.doc.blocks.map(b => (FIRST.has(b.t) ? b.t : 'web')))
  }
  // Each added block is in a case, and every block the format has is either the first app's or an added one.
  const used = new Set(v.added.flatMap(d => d.doc.blocks.map(b => b.t)))
  for (const t of ADDED) expect(used.has(t), t).toBe(true)
  const defs = (schema.$defs.Block.anyOf as { properties?: { t?: { const?: string } } }[]).map(b => b.properties?.t?.const)
  expect(defs.filter(t => t && !FIRST.has(t)).sort()).toEqual([...ADDED].sort())
})

test.each(v.levels)('levels: $note', c => {
  expect(drawnKinds(c.shards, c.appLevel).sort(), c.note).toEqual([...c.draws].sort())
})
