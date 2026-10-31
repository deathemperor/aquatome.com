import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { z } from 'zod'
import { Device, DeviceRecord, KNOWN, Tank, TankRecord, TankStore, Tombstone, mergeRecords, mergeStores, newer, stamp, tankLitres, tombstone } from '../src/index'

// Shared with the iOS app's tests: both must accept, reject and merge the same records.
type Kind = 'tank' | 'device' | 'tankRecord' | 'store'
type Rec = { id: string; updatedAt: string; deletedAt?: string }
type Vectors = {
  valid: { note: string; kind: Kind; value: unknown }[]
  invalid: { note: string; kind: Kind; value: unknown; path: (string | number)[] }[]
  merge: { note: string; kept: Rec[]; incoming: Rec[]; expected: Rec[] }[]
  mergeStores: { note: string; kept: TankStore; incoming: TankStore; expected: TankStore }[]
  stamp: { note: string; now: string; prev: string | null; updatedAt: string }[]
  known: typeof KNOWN
  litres: { note: string; tank: Parameters<typeof tankLitres>[0]; litres: number | null }[]
}
const VECTORS = new URL('../../../protocols/tanks-vectors.json', import.meta.url)
const SCHEMA_FILE = new URL('../../../protocols/tanks.schema.json', import.meta.url)
const v: Vectors = JSON.parse(readFileSync(VECTORS, 'utf8'))
const SCHEMAS = { tank: Tank, device: Device, tankRecord: TankRecord, store: TankStore }

test.each(v.valid)('accepts $note', ({ kind, value }) => {
  // Parsed, the record is the same JSON: nothing dropped, nothing added (unknown keys included).
  expect(SCHEMAS[kind].parse(value)).toEqual(value)
})

test.each(v.invalid)('rejects $note', ({ kind, value, path }) => {
  const r = SCHEMAS[kind].safeParse(value)
  expect(r.success).toBe(false)
  expect(r.error!.issues.map(i => i.path)).toContainEqual(path)
})

test.each(v.merge)('merge: $note', ({ kept, incoming, expected }) => {
  expect(mergeRecords(kept, incoming)).toEqual(expected)
})

test('merging a list with itself changes nothing, and merging again changes nothing', () => {
  for (const { kept, incoming } of v.merge) {
    const once = mergeRecords(kept, incoming)
    expect(mergeRecords(once, once)).toEqual(once)
    expect(mergeRecords(once, incoming)).toEqual(once)
  }
})

test('two copies that differ only in updatedAt merge the same way in either order', () => {
  const a = { id: 'x', updatedAt: '2026-10-01T00:00:00.000Z', name: 'a' }
  const b = { id: 'x', updatedAt: '2026-10-02T00:00:00.000Z', name: 'b' }
  expect(newer(a, b)).toBe(b)
  expect(newer(b, a)).toBe(b)
})

test.each(v.mergeStores)('merge stores: $note', ({ kept, incoming, expected }) => {
  expect(mergeStores(kept, incoming)).toEqual(expected)
  expect(TankStore.parse(expected)).toEqual(expected)
})

test.each(v.stamp)('stamp: $note', ({ now, prev, updatedAt }) => {
  expect(stamp(new Date(now), prev ?? undefined)).toBe(updatedAt)
})

test('a tombstone is stamped after the copy it deletes, and parses as a tank or device record', () => {
  const t = v.valid.find(c => c.kind === 'tank')!.value as Tank
  const dead = tombstone(t, new Date(Date.parse(t.updatedAt) - 60_000))
  expect(dead).toEqual({ id: t.id, updatedAt: stamp(new Date(t.updatedAt), t.updatedAt), deletedAt: dead.updatedAt })
  expect(newer<TankRecord>(t, dead)).toBe(dead)
  expect(TankRecord.parse(dead)).toEqual(dead)
  expect(DeviceRecord.parse(dead)).toEqual(dead)
})

test('the known values in the vectors are the schema\'s', () => { expect(v.known).toEqual(KNOWN) })

test.each(v.litres)('litres: $note', ({ tank, litres }) => {
  if (litres === null) expect(tankLitres(tank)).toBeUndefined()
  else expect(tankLitres(tank)).toBeCloseTo(litres)
})

/** The JSON Schema the iOS thread and the API contract use, from the zod schemas (UPDATE_SCHEMA=1 rewrites the file). */
function jsonSchema(): string {
  const registry = z.registry<{ id: string }>()
  for (const [id, s] of Object.entries({ Tank, Device, Tombstone, TankRecord, DeviceRecord, TankStore })) registry.add(s, { id })
  const out = z.toJSONSchema(registry, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any', uri: id => `#/$defs/${id}` })
  // Plain pointers: a $id with a fragment isn't allowed in 2020-12.
  const defs = Object.fromEntries(Object.entries(out.schemas).map(([k, s]) => { const { $schema: _, $id: __, ...rest } = s as Record<string, unknown>; return [k, rest] }))
  const doc = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: `Generated from packages/schema/src/tanks.ts by packages/schema/test/tanks.test.ts (UPDATE_SCHEMA=1 pnpm --filter @aq/schema test). Looser than the contract where JSON Schema can't say it: ${[...new Set(Object.values(LOOSER))].join('; ')}. protocols/tanks-vectors.json has a case for each.`,
    $defs: defs,
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

test('protocols/tanks.schema.json is up to date', () => {
  const next = jsonSchema()
  if (process.env.UPDATE_SCHEMA === '1') writeFileSync(SCHEMA_FILE, next)
  expect(readFileSync(SCHEMA_FILE, 'utf8'), 'run UPDATE_SCHEMA=1 pnpm --filter @aq/schema test').toBe(next)
})

/** Invalid cases this JSON Schema accepts, and why (the $comment lists them; the test below keeps the list exact). */
const LOOSER: Record<string, string> = {
  'February 30': 'timestamps must be real instants',
  'month 13': 'timestamps must be real instants',
  'hour 24': 'timestamps must be real instants',
  'off before on': 'a schedule\'s off time must be after its on time, the same day (00:00 = midnight at the end)',
  'a ramp longer than half the time lit': 'the ramp is at most half the time lit',
  'a store with the same tank twice': 'one record per id in each list',
}

test('the JSON Schema accepts every valid case and refuses the invalid ones it can express', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  const doc = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')) as { $defs: Record<string, object> }
  ajv.addSchema(doc, 'tanks')
  const check = (kind: Kind, value: unknown) => ajv.validate({ $ref: `tanks#/$defs/${({ tank: 'Tank', device: 'Device', tankRecord: 'TankRecord', store: 'TankStore' })[kind]}` }, value)
  for (const c of v.valid) expect(check(c.kind, c.value), c.note).toBe(true)
  const accepted = v.invalid.filter(c => check(c.kind, c.value)).map(c => c.note)
  expect(accepted.sort()).toEqual(Object.keys(LOOSER).sort())
})
