import type { Device, SavedSchedule, Tank, TankStore } from '@aq/schema'
/**
 * "Bể của tôi" kept in this browser: the reader's tanks and the lights on them, in the shared model
 * (packages/schema/src/tanks.ts, docs/my-tanks-sync.md). Signing in later sends these same records to the account.
 * Every change sets the record's `updatedAt`; deleting leaves a tombstone. Other tabs hear of changes (CHANGED).
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
  const at = stamp(env)
  const i = d.id ? s.devices.findIndex(x => x.id === d.id) : -1
  const kept = i >= 0 && isLive(s.devices[i]!) ? (s.devices[i] as Device) : undefined
  const next = { schedules: [], createdAt: at, ...kept, ...d, id: kept?.id ?? d.id ?? env.uuid(), updatedAt: at } as Device
  if (i >= 0) s.devices[i] = next
  else s.devices.push(next)
  return next
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
  const at = stamp(env)
  const i = s.devices.findIndex(x => x.id === id)
  if (i >= 0) s.devices[i] = { id, updatedAt: at, deletedAt: at }
}

export const activeSchedule = (d: Device) => d.schedules?.find(x => x.id === d.activeScheduleId)
