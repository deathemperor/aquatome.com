import type { Device, SavedSchedule, Tank, TankStore } from '@aq/schema'
import { stamp as stampAfter, tombstone } from '@aq/schema/tank-rules'
/**
 * "Bể của tôi" kept in this browser: the reader's tanks and the lights on them, in the shared model
 * (packages/schema/src/tanks.ts, docs/my-tanks-sync.md). Signing in later sends these same records to the account.
 * Every change sets the record's `updatedAt` after the copy it changes (`stamp`); deleting leaves a tombstone. Other tabs hear of changes (CHANGED).
 */
export const KEY = 'aq.tanks'
export const CHANGED = 'aq-tanks-changed'

type Env = { storage: Pick<Storage, 'getItem' | 'setItem'>; now: () => Date; uuid: () => string }
const browser = (): Env => ({ storage: localStorage, now: () => new Date(), uuid: () => crypto.randomUUID() })
const stamp = (env: Env) => env.now().toISOString()
const isLive = (r: { deletedAt?: unknown }) => !('deletedAt' in r)

export function load(env: Env = browser()): TankStore {
  try {
    const s = JSON.parse(env.storage.getItem(KEY) ?? 'null') as TankStore | null
    if (s?.v === 1 && Array.isArray(s.tanks) && Array.isArray(s.devices)) return s
  } catch { /* unreadable: start again */ }
  return { v: 1, tanks: [], devices: [] }
}

export function save(store: TankStore, env: Env = browser()) {
  env.storage.setItem(KEY, JSON.stringify(store))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(CHANGED))
    try { new BroadcastChannel(KEY).postMessage('changed') } catch { /* no BroadcastChannel: this tab only */ }
  }
}

export const liveTanks = (s: TankStore) => s.tanks.filter(isLive) as Tank[]
/** Lights on tanks that still exist, most recently changed first. */
export const liveDevices = (s: TankStore) => {
  const tanks = new Set(liveTanks(s).map(t => t.id))
  return (s.devices.filter(isLive) as Device[]).filter(d => tanks.has(d.tankId)).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
export const deviceByBleName = (s: TankStore, name: string) => liveDevices(s).find(d => d.bleName === name)

/** The tank a newly met light goes on: the first one, or a new "Bể của tôi" when there is none. */
export function ensureTank(s: TankStore, name: string, env: Env = browser()): Tank {
  const t = liveTanks(s)[0]
  if (t) return t
  const at = stamp(env)
  const tank: Tank = { id: env.uuid(), name, species: [], plants: [], createdAt: at, updatedAt: at }
  s.tanks.push(tank)
  return tank
}

/** A light met for the first time, or the saved one with its fields changed. */
export function putDevice(s: TankStore, d: Partial<Device> & Pick<Device, 'tankId' | 'kind'>, env: Env = browser()): Device {
  const i = d.id ? s.devices.findIndex(x => x.id === d.id) : -1
  const kept = i >= 0 && isLive(s.devices[i]!) ? (s.devices[i] as Device) : undefined
  // After the copy here, a tombstone too: a light written back after a delete must win over it.
  const at = stampAfter(env.now(), i >= 0 ? s.devices[i]!.updatedAt : undefined)
  const next = { schedules: [], createdAt: at, ...kept, ...d, id: kept?.id ?? d.id ?? env.uuid(), updatedAt: at } as Device
  if (i >= 0) s.devices[i] = next
  else s.devices.push(next)
  return next
}

/**
 * The record of a light this page is connected to, as the store has it now. Another tab may have forgotten the light,
 * or deleted its tank, since the page met it: then it is met again, a new record on a tank that exists. Writing the old
 * copy back would put it on a deleted tank: listed nowhere, impossible to forget, still counted.
 */
export function currentLight(s: TankStore, d: Device, tankName: string, env: Env = browser()): Device {
  const now = (d.bleName ? deviceByBleName(s, d.bleName) : undefined) ?? liveDevices(s).find(x => x.id === d.id)
  if (now) return now
  const { kind, brand, model, bleName } = d
  return putDevice(s, { tankId: ensureTank(s, tankName, env).id, kind, brand, model, bleName }, env)
}

const same = (a: Pick<SavedSchedule, 'on' | 'off' | 'ramp' | 'levels'>, b: typeof a) =>
  a.on === b.on && a.off === b.off && a.ramp === b.ramp && a.levels.join() === b.levels.join()

/**
 * A schedule just written to the light: kept in the light's list (the same setting once, moved to the front, named
 * when it has a name), and marked as the one on the light. At most 20 are kept; the oldest go.
 */
export function wroteSchedule(s: TankStore, d: Device, sched: Pick<SavedSchedule, 'on' | 'off' | 'ramp' | 'levels'> & { name?: string }, env: Env = browser()): Device {
  const list = d.schedules ?? []
  const old = list.find(x => same(x, sched))
  const rec: SavedSchedule = { ...old, on: sched.on, off: sched.off, ramp: sched.ramp, levels: sched.levels, id: old?.id ?? env.uuid(), savedAt: stamp(env), ...(sched.name ?? old?.name ? { name: sched.name ?? old?.name } : {}) }
  const schedules = [rec, ...list.filter(x => x.id !== rec.id)].slice(0, 20)
  return putDevice(s, { ...d, schedules, activeScheduleId: rec.id }, env)
}

/** Forget a light: a tombstone, so a copy elsewhere doesn't bring it back when they sync. */
export function forget(s: TankStore, id: string, env: Env = browser()) {
  const i = s.devices.findIndex(x => x.id === id)
  if (i >= 0 && isLive(s.devices[i]!)) s.devices[i] = tombstone(s.devices[i]!, env.now())
}

export const activeSchedule = (d: Device) => d.schedules?.find(x => x.id === d.activeScheduleId)

/** The fields of a tank a reader edits on "Bể của tôi". */
export type TankFields = Pick<Tank, 'name'> & Partial<Pick<Tank, 'dims' | 'litres' | 'substrate' | 'notes'>>

/**
 * A new tank, or the saved one with the given fields changed (a field given as undefined is removed; other keys stay).
 * Its `updatedAt` comes after the copy it changes, a tombstone included (`stamp`), so an edit made after a sync wins even
 * on a clock running behind.
 */
export function putTank(s: TankStore, fields: TankFields, id?: string, env: Env = browser()): Tank {
  const now = env.now()
  const i = id ? s.tanks.findIndex(x => x.id === id) : -1
  const kept = i >= 0 && isLive(s.tanks[i]!) ? (s.tanks[i] as Tank) : undefined
  const at = stampAfter(now, i >= 0 ? s.tanks[i]!.updatedAt : undefined)
  // `dims` is merged, not replaced: keys another client added to it stay (docs/my-tanks-sync.md).
  const dims = fields.dims ? { dims: { ...kept?.dims, ...fields.dims } } : {}
  const next = { species: [], plants: [], createdAt: at, ...kept, ...fields, ...dims, id: kept?.id ?? id ?? env.uuid(), name: fields.name.trim(), updatedAt: at } as Tank
  for (const k of ['dims', 'litres', 'substrate', 'notes'] as const) if (k in fields && (fields[k] === undefined || fields[k] === '')) delete next[k]
  if (i >= 0) s.tanks[i] = next
  else s.tanks.push(next)
  return next
}

/** Delete a tank and the lights on it: tombstones, stamped after the copies they replace. */
export function removeTank(s: TankStore, id: string, env: Env = browser()) {
  const now = env.now()
  const i = s.tanks.findIndex(x => x.id === id)
  if (i < 0 || !isLive(s.tanks[i]!)) return
  s.tanks[i] = tombstone(s.tanks[i]!, now)
  s.devices = s.devices.map(d => (isLive(d) && (d as Device).tankId === id ? tombstone(d, now) : d))
}
