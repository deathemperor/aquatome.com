import { z } from 'zod'

/**
 * "Bể của tôi" (My tanks): a reader's tanks and the devices on them, one model for the site and the iOS app.
 * Shared test cases and the JSON Schema: protocols/tanks-vectors.json, protocols/tanks.schema.json.
 * How copies merge (local-first, last writer wins per record, tombstones): docs/my-tanks-sync.md.
 *
 * Writers always use the exact forms below: timestamps as `2026-10-31T12:00:00.000Z` (UTC, milliseconds), so comparing
 * the strings compares the times; record ids as lowercase UUIDs. Records keep keys they don't know, so a client that is
 * older than the record's writer doesn't drop the newer fields when it saves the record again.
 */

export const STORE_VERSION = 1
/** Live records one store (one reader) may hold; tombstones don't count. */
export const MAX_TANKS = 50
export const MAX_DEVICES = 100

export const Timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'UTC timestamp with milliseconds')
export const RecordId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'lowercase UUID')
/** A species or plant page's content id (the same in every language), e.g. `paracheirodon-axelrodi`. */
const ContentId = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'content id')
/** A time of day, 24-hour. */
const TimeOfDay = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')
const Level = z.number().int().min(0).max(100)
const Cm = z.number().positive().max(1000)

/** Values the site writes today. The fields are open strings: a value added later must not break an older decoder. */
export const KNOWN = {
  substrate: ['soil', 'sand', 'gravel', 'lava', 'bare', 'other'],
  deviceKind: ['light'],
  brand: ['chihiros'],
} as const

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
/** Minutes a schedule keeps the light on; an off time of 00:00 is midnight at the end of the day. */
export const minutesLit = (on: string, off: string) => (off === '00:00' ? 1440 : minutes(off)) - minutes(on)

/**
 * A light schedule saved on a device: the everyday on/off setting with its sunrise/sunset ramp, levels in the light's
 * channel order (Chihiros: the model's channels, from the light's Bluetooth name). Same rules as the Chihiros page.
 */
export const SavedSchedule = z.looseObject({
  id: RecordId,
  name: z.string().trim().min(1).max(80).optional(),
  on: TimeOfDay,
  off: TimeOfDay,
  ramp: z.number().int().min(0).max(150),
  levels: z.array(Level).min(1).max(4),
  savedAt: Timestamp,
}).refine(s => minutesLit(s.on, s.off) > 0, { message: 'off must be after on, the same day', path: ['off'] })
  .refine(s => s.ramp * 2 <= minutesLit(s.on, s.off), { message: 'ramp longer than half the time lit', path: ['ramp'] })

export const Tank = z.looseObject({
  id: RecordId,
  name: z.string().trim().min(1).max(80),
  /** Inside length × width × height, cm. */
  dims: z.strictObject({ l: Cm, w: Cm, h: Cm }).optional(),
  /** Volume when it isn't the box of `dims` (a round or corner tank, from the volume tool); else litres come from `dims`. */
  litres: z.number().positive().max(100_000).optional(),
  substrate: z.string().min(1).max(40).optional(),
  species: z.array(z.looseObject({ id: ContentId, count: z.number().int().min(1).max(9999).optional() })).max(200),
  plants: z.array(z.looseObject({ id: ContentId })).max(200),
  notes: z.string().max(4000).optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  /** Only tombstones carry it. */
  deletedAt: z.never().optional(),
})

export const Device = z.looseObject({
  id: RecordId,
  /** The tank it is on. A device whose tank is deleted or missing is not shown. */
  tankId: RecordId,
  kind: z.string().min(1).max(40),
  brand: z.string().min(1).max(40).optional(),
  /** The model's name when saved ("WRGB II"); for Chihiros the model is re-derived from `bleName`. */
  model: z.string().min(1).max(80).optional(),
  /** The Bluetooth name the light advertises ("DYNW60…"): a Chihiros light's model goes by its prefix. */
  bleName: z.string().min(1).max(64).optional(),
  nickname: z.string().trim().min(1).max(80).optional(),
  schedules: z.array(SavedSchedule).max(20),
  /** The saved schedule last written to the light. */
  activeScheduleId: RecordId.optional(),
  /** The levels last set by hand (lights can't report them), channel order as in schedules. */
  manual: z.strictObject({ levels: z.array(Level).min(1).max(4), at: Timestamp }).optional(),
  /** When the light's clock was last set. */
  clockSyncedAt: Timestamp.optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: z.never().optional(),
})

/** What is left of a deleted record: enough to win the merge against older copies, nothing of its content. */
export const Tombstone = z.strictObject({ id: RecordId, updatedAt: Timestamp, deletedAt: Timestamp })

export const TankRecord = z.union([Tombstone, Tank])
export const DeviceRecord = z.union([Tombstone, Device])

/** One reader's tanks and devices: the on-device copy, and what sync sends and returns. */
export const TankStore = z.looseObject({
  v: z.literal(STORE_VERSION),
  tanks: z.array(TankRecord),
  devices: z.array(DeviceRecord),
}).refine(s => s.tanks.filter(live).length <= MAX_TANKS, { message: `at most ${MAX_TANKS} tanks`, path: ['tanks'] })
  .refine(s => s.devices.filter(live).length <= MAX_DEVICES, { message: `at most ${MAX_DEVICES} devices`, path: ['devices'] })

export type SavedSchedule = z.infer<typeof SavedSchedule>
export type Tank = z.infer<typeof Tank>
export type Device = z.infer<typeof Device>
export type Tombstone = z.infer<typeof Tombstone>
export type TankRecord = z.infer<typeof TankRecord>
export type DeviceRecord = z.infer<typeof DeviceRecord>
export type TankStore = z.infer<typeof TankStore>

type Rec = { id: string; updatedAt: string; deletedAt?: string }
export const isTombstone = (r: Rec): r is Rec & Tombstone => 'deletedAt' in r && typeof r.deletedAt === 'string'
export function live<R extends Rec>(r: R): r is Exclude<R, Tombstone> { return !isTombstone(r) }

/** Litres of a tank: its own figure, else the box of its dimensions; undefined when it has neither. */
export function tankLitres(t: Pick<Tank, 'dims' | 'litres'>): number | undefined {
  if (t.litres !== undefined) return t.litres
  return t.dims ? (t.dims.l * t.dims.w * t.dims.h) / 1000 : undefined
}

/**
 * The copy of one record to keep. `kept` is the copy already held (on the server: the account's), `incoming` the one
 * arriving. The later `updatedAt` wins; on the same `updatedAt` a tombstone wins, else the copy already held stays.
 */
export function newer<R extends Rec>(kept: R, incoming: R): R {
  if (incoming.updatedAt > kept.updatedAt) return incoming
  if (incoming.updatedAt === kept.updatedAt && isTombstone(incoming) && !isTombstone(kept)) return incoming
  return kept
}

/** Both lists' records, one per id (`newer` decides), sorted by id. */
export function mergeRecords<R extends Rec>(kept: readonly R[], incoming: readonly R[]): R[] {
  const out = new Map<string, R>()
  for (const r of kept) out.set(r.id, out.has(r.id) ? newer(out.get(r.id)!, r) : r)
  for (const r of incoming) out.set(r.id, out.has(r.id) ? newer(out.get(r.id)!, r) : r)
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Two stores as one: tanks and devices each merged by `mergeRecords`. */
export function mergeStores(kept: TankStore, incoming: TankStore): TankStore {
  return { v: STORE_VERSION, tanks: mergeRecords(kept.tanks, incoming.tanks), devices: mergeRecords(kept.devices, incoming.devices) }
}

/** The tombstone that replaces a record deleted at `now`. */
export const tombstone = (id: string, now: string): Tombstone => ({ id, updatedAt: now, deletedAt: now })
