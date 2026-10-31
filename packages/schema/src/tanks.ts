import { z } from 'zod'
import { mergeRecords, minutesLit } from './tank-rules'

export * from './tank-rules'

/**
 * "Bể của tôi" (My tanks): a reader's tanks and the devices on them, one model for the site and the iOS app.
 * Shared test cases and the JSON Schema: protocols/tanks-vectors.json, protocols/tanks.schema.json.
 * How copies merge (local-first, last writer wins per record, tombstones): docs/my-tanks-sync.md.
 *
 * Writers always use the exact forms below: timestamps as `2026-10-31T12:00:00.000Z` (UTC, milliseconds), so comparing
 * the strings compares the times; record ids as lowercase UUIDs. Objects keep keys they don't know, so a client that is
 * older than the record's writer doesn't drop the newer fields when it saves the record again. Lengths count Unicode code
 * points (Swift's `unicodeScalars.count`; zod and JSON Schema count the same way).
 */

export const STORE_VERSION = 1
/** Live records a reader can make (checked when making one): a merge of two stores (signing in) can go past it. */
export const MAX_TANKS = 50
export const MAX_DEVICES = 100
/** Live records an account may hold after a merge; a sync past them is refused. */
export const STORED_MAX = { tanks: 4 * MAX_TANKS, devices: 4 * MAX_DEVICES }

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
/** A real UTC instant in the one form: `2026-02-30T…` and hour 24 are refused. */
export const Timestamp = z.string().regex(ISO, 'UTC timestamp with milliseconds')
  .refine(s => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d.toISOString() === s }, 'not a real date and time')
export const RecordId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'lowercase UUID')
/** A species or plant page's content id (the same in every language), e.g. `paracheirodon-axelrodi`. */
const ContentId = z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'content id')
/** A time of day, 24-hour. */
const TimeOfDay = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'HH:MM')
/** Text a person typed: something besides spaces. Writers trim it; readers take it as it is. */
const Label = (max: number) => z.string().max(max).regex(/\S/, 'blank')
const Level = z.number().int().min(0).max(100)
const Cm = z.number().positive().max(1000)

/** Values the site writes today. The fields are open strings: a value added later must not break an older decoder. */
export const KNOWN = {
  substrate: ['soil', 'sand', 'gravel', 'lava', 'bare', 'other'],
  deviceKind: ['light'],
  brand: ['chihiros'],
} as const


/**
 * A light schedule saved on a device: the everyday on/off setting with its sunrise/sunset ramp, levels in the light's
 * channel order (Chihiros: the model's channels, from the light's Bluetooth name). Same rules as the Chihiros page.
 */
export const SavedSchedule = z.looseObject({
  id: RecordId,
  name: Label(80).optional(),
  on: TimeOfDay,
  off: TimeOfDay,
  ramp: z.number().int().min(0).max(150),
  levels: z.array(Level).min(1).max(4),
  savedAt: Timestamp,
}).refine(s => minutesLit(s.on, s.off) > 0, { message: 'off must be after on, the same day', path: ['off'] })
  .refine(s => s.ramp * 2 <= minutesLit(s.on, s.off), { message: 'ramp longer than half the time lit', path: ['ramp'] })

export const Tank = z.looseObject({
  id: RecordId,
  name: Label(80),
  /** Inside length × width × height, cm. */
  dims: z.looseObject({ l: Cm, w: Cm, h: Cm }).optional(),
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
  nickname: Label(80).optional(),
  /** Lights: the saved schedules ([] for none). Other kinds of device may leave it out. */
  schedules: z.array(SavedSchedule).max(20).optional(),
  /** The saved schedule last written to the light. */
  activeScheduleId: RecordId.optional(),
  /** The levels last set by hand (lights can't report them), channel order as in schedules. */
  manual: z.looseObject({ levels: z.array(Level).min(1).max(4), at: Timestamp }).optional(),
  /** When the light's clock was last set. */
  clockSyncedAt: Timestamp.optional(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletedAt: z.never().optional(),
})

/**
 * What is left of a deleted record: enough to win the merge against older copies. Writers put nothing else in it;
 * readers keep any other key, as for every record.
 */
export const Tombstone = z.looseObject({ id: RecordId, updatedAt: Timestamp, deletedAt: Timestamp })

export const TankRecord = z.union([Tombstone, Tank])
export const DeviceRecord = z.union([Tombstone, Device])

const unique = (rs: { id: string }[]) => new Set(rs.map(r => r.id)).size === rs.length
/** One reader's tanks and devices: the on-device copy, and what sync sends and returns. One record per id. */
export const TankStore = z.looseObject({
  v: z.literal(STORE_VERSION),
  tanks: z.array(TankRecord),
  devices: z.array(DeviceRecord),
}).refine(s => unique(s.tanks), { message: 'two tanks with the same id', path: ['tanks'] })
  .refine(s => unique(s.devices), { message: 'two devices with the same id', path: ['devices'] })

export type SavedSchedule = z.infer<typeof SavedSchedule>
export type Tank = z.infer<typeof Tank>
export type Device = z.infer<typeof Device>
export type Tombstone = z.infer<typeof Tombstone>
export type TankRecord = z.infer<typeof TankRecord>
export type DeviceRecord = z.infer<typeof DeviceRecord>
export type TankStore = z.infer<typeof TankStore>

/** Two stores as one: tanks and devices each merged by `mergeRecords`; any other key of `kept` stays. */
export function mergeStores(kept: TankStore, incoming: TankStore): TankStore {
  return { ...kept, v: STORE_VERSION, tanks: mergeRecords(kept.tanks, incoming.tanks), devices: mergeRecords(kept.devices, incoming.devices) }
}
