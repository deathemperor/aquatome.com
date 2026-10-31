import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { z } from 'zod'
import { Device, DeviceRecord, MAX_TANKS, Tank, TankRecord, TankStore, mergeRecords, mergeStores, newer, tankLitres, tombstone } from '../src/index'

// Shared with the iOS app's tests: both must accept, reject and merge the same records.
type Kind = 'tank' | 'device' | 'tankRecord' | 'store'
type Rec = { id: string; updatedAt: string; deletedAt?: string }
type Vectors = {
  valid: { note: string; kind: Kind; value: unknown }[]
  invalid: { note: string; kind: Kind; value: unknown; path: (string | number)[] }[]
  merge: { note: string; kept: Rec[]; incoming: Rec[]; expected: Rec[] }[]
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

test('stores merge tanks and devices each on their own', () => {
  const [tankCase, deviceCase] = [v.valid.find(c => c.kind === 'tank')!, v.valid.find(c => c.kind === 'device')!]
  const t = tankCase.value as Tank
  const d = deviceCase.value as Device
  const deleted = tombstone(t.id, '2026-11-01T00:00:00.000Z')
  const out = mergeStores({ v: 1, tanks: [t], devices: [] }, { v: 1, tanks: [deleted], devices: [d] })
  expect(out).toEqual({ v: 1, tanks: [deleted], devices: [d] })
  expect(TankStore.parse(out)).toEqual(out)
  expect(DeviceRecord.parse(deleted)).toEqual(deleted)
})

test('tombstones do not count towards the tank limit', () => {
  const t = v.valid.find(c => c.kind === 'tank')!.value as Tank
  const tanks = Array.from({ length: MAX_TANKS }, (_, i) => ({ ...t, id: `00000000-0000-4000-8000-${String(500 + i).padStart(12, '0')}` }))
  const dead = Array.from({ length: 5 }, (_, i) => tombstone(`00000000-0000-4000-8000-${String(900 + i).padStart(12, '0')}`, t.updatedAt))
  expect(TankStore.safeParse({ v: 1, tanks: [...tanks, ...dead], devices: [] }).success).toBe(true)
})

test.each(v.litres)('litres: $note', ({ tank, litres }) => {
  if (litres === null) expect(tankLitres(tank)).toBeUndefined()
  else expect(tankLitres(tank)).toBeCloseTo(litres)
})

/** The JSON Schema the iOS thread and the API contract use, from the zod schemas (UPDATE_SCHEMA=1 rewrites the file). */
function jsonSchema(): string {
  const registry = z.registry<{ id: string }>()
  for (const [id, s] of Object.entries({ Tank, Device, Tombstone: TankRecord.options[0], TankRecord, DeviceRecord, TankStore })) registry.add(s, { id })
  const out = z.toJSONSchema(registry, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any', uri: id => `#/$defs/${id}` })
  const defs = Object.fromEntries(Object.entries(out.schemas).map(([k, s]) => { const { $schema: _, ...rest } = s as Record<string, unknown>; return [k, rest] }))
  const doc = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $comment: 'Generated from packages/schema/src/tanks.ts by packages/schema/test/tanks.test.ts (UPDATE_SCHEMA=1 pnpm --filter @aq/schema test). Rules a JSON Schema cannot say (schedule times, ramp, store limits): see the source and protocols/tanks-vectors.json.',
    $defs: defs,
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

test('protocols/tanks.schema.json is up to date', () => {
  const next = jsonSchema()
  if (process.env.UPDATE_SCHEMA === '1') writeFileSync(SCHEMA_FILE, next)
  expect(readFileSync(SCHEMA_FILE, 'utf8'), 'run UPDATE_SCHEMA=1 pnpm --filter @aq/schema test').toBe(next)
})
