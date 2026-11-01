import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { z } from 'zod'
import { Block, PageDoc, PageShard } from '../src/app-page'

// The app page format, shared with the iOS app (its decode test reads the same vectors).
type Vectors = {
  html: { note: string; blocks: unknown[] }[]
  docs: { note: string; valid: boolean; doc: unknown }[]
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
