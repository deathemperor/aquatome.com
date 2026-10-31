import { TankStore } from '@aq/schema'
import { expect, test } from 'vitest'
import { deviceByBleName, ensureTank, forget, liveDevices, load, putDevice, save, wroteSchedule, activeSchedule } from '../src/scripts/tank-store'

function env() {
  const data = new Map<string, string>()
  let t = Date.parse('2026-10-31T12:00:00.000Z')
  let n = 0
  return {
    storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
    now: () => new Date((t += 1000)),
    uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    data,
  }
}

test('a light met for the first time goes on a new "Bể của tôi"; the store is the shared model', () => {
  const e = env()
  const s = load(e)
  expect(s).toEqual({ v: 1, tanks: [], devices: [] })
  const tank = ensureTank(s, 'Bể của tôi', e)
  const d = putDevice(s, { tankId: tank.id, kind: 'light', brand: 'chihiros', model: 'WRGB II Slim', bleName: 'DYSL30TEST' }, e)
  save(s, e)
  const back = load(e)
  expect(TankStore.safeParse(back).success).toBe(true)
  expect(deviceByBleName(back, 'DYSL30TEST')?.id).toBe(d.id)
  expect(ensureTank(back, 'x', e).id).toBe(tank.id)
})

test('schedules written to a light: the same setting once, newest first, the active one marked', () => {
  const e = env()
  const s = load(e)
  let d = putDevice(s, { tankId: ensureTank(s, 'Bể', e).id, kind: 'light', bleName: 'DY1' }, e)
  const a = { on: '12:00', off: '20:00', ramp: 30, levels: [70, 70, 70] }
  const b = { on: '13:00', off: '19:00', ramp: 30, levels: [40, 40, 40], name: 'Bể mới trồng' }
  d = wroteSchedule(s, d, a, e)
  d = wroteSchedule(s, d, b, e)
  d = wroteSchedule(s, d, a, e)
  expect(d.schedules.map(x => x.on)).toEqual(['12:00', '13:00'])
  expect(activeSchedule(d)?.on).toBe('12:00')
  expect(d.schedules[1]!.name).toBe('Bể mới trồng')
  expect(TankStore.safeParse(s).success).toBe(true)
  for (let i = 0; i < 25; i++) d = wroteSchedule(s, d, { ...a, ramp: i }, e)
  expect(d.schedules).toHaveLength(20)
})

test('a forgotten light leaves a tombstone and is no longer listed', () => {
  const e = env()
  const s = load(e)
  const d = putDevice(s, { tankId: ensureTank(s, 'Bể', e).id, kind: 'light', bleName: 'DY1' }, e)
  forget(s, d.id, e)
  expect(liveDevices(s)).toEqual([])
  expect(s.devices[0]).toEqual({ id: d.id, updatedAt: expect.any(String), deletedAt: expect.any(String) })
  expect(TankStore.safeParse(s).success).toBe(true)
})

test('an unreadable store starts empty instead of breaking the page', () => {
  const e = env()
  e.data.set('aq.tanks', '{not json')
  expect(load(e)).toEqual({ v: 1, tanks: [], devices: [] })
})
