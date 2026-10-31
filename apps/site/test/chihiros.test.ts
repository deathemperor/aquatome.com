import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { askStatus, clockDrift, clockOf, firmwareOf, levelAt, frame, hoursLit, modelOf, nextId, scheduleParams, setLevel, setMode, setSchedule, setTime, type Schedule } from '../src/scripts/chihiros'

// Shared with the iOS app's tests, so both implementations send the same bytes.
type Case<T> = T & { note?: string }
type Vectors = {
  frame: Case<{ cmd: number; mode: number; params: number[]; id: number; hex: string }>[]
  setLevel: Case<{ channel: number; level: number; id: number; hex: string }>[]
  setMode: Case<{ mode: number; id: number; hex: string }>[]
  setTime: Case<{ local: string; id: number; hex: string }>[]
  askStatus: Case<{ id: number; hex: string }>[]
  setSchedule: Case<{ schedule: Schedule; channels: number; id: number; hex: string }>[]
  nextId: Case<{ id: number; next: number }>[]
  scheduleParams: Case<{ schedule: Schedule; channels: number; params: number[] }>[]
  modelOf: Case<{ name: string; model: string | null; channels?: string[] }>[]
  firmwareOf: Case<{ reply: string; firmware: number | null }>[]
  hoursLit: Case<{ on: string; off: string; hours: number }>[]
  clockOf: Case<{ reply: string; clock: { weekday: number; hour: number; minute: number } | null }>[]
  clockDrift: Case<{ clock: { weekday: number; hour: number; minute: number }; local: string; minutes: number | null }>[]
  levelAt: Case<{ schedule: Pick<Schedule, 'on' | 'off' | 'ramp'>; minute: number; level: number }>[]
}
const v: Vectors = JSON.parse(readFileSync(new URL('../../../protocols/chihiros-vectors.json', import.meta.url), 'utf8'))

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex').replace(/(..)(?!$)/g, '$1 ')
const bytes = (h: string) => Uint8Array.from(h.split(' '), b => parseInt(b, 16))

test('frames match the captures in the protocol notes', () => {
  for (const c of v.frame) expect(hex(frame(c.cmd, c.mode, c.params, c.id)), c.note).toBe(c.hex)
  for (const c of v.setLevel) expect(hex(setLevel(c.channel, c.level, c.id)), c.note).toBe(c.hex)
  for (const c of v.setMode) expect(hex(setMode(c.mode, c.id)), c.note).toBe(c.hex)
  for (const c of v.askStatus) expect(hex(askStatus(c.id))).toBe(c.hex)
  for (const c of v.setSchedule) expect(hex(setSchedule(c.schedule, c.channels, c.id)), c.note).toBe(c.hex)
})

test('message ids skip 0x5a in either byte and wrap', () => {
  for (const c of v.nextId) expect(nextId(c.id), c.note).toBe(c.next)
})

test('the clock frame sends the ISO weekday', () => {
  // `local` has no zone, so it is read as this machine's local time, as the page's `new Date()` is.
  for (const c of v.setTime) expect(hex(setTime(new Date(c.local), c.id)), c.note).toBe(c.hex)
})

test('schedules: 14 bytes, everyday, levels by channel, white-only and midnight cases', () => {
  for (const c of v.scheduleParams) expect(scheduleParams(c.schedule, c.channels), c.note).toEqual(c.params)
})

test('models by name prefix, longest first', () => {
  for (const c of v.modelOf) {
    const m = modelOf(c.name)
    expect(m?.name ?? null, c.name).toBe(c.model)
    if (c.channels) expect(m?.channels, c.name).toEqual(c.channels)
  }
})

test('status replies and hours of light', () => {
  for (const c of v.firmwareOf) expect(firmwareOf(bytes(c.reply)) ?? null).toBe(c.firmware)
  for (const c of v.hoursLit) expect(hoursLit(c.on, c.off)).toBe(c.hours)
})

test("the light's clock from its long status reply, and how far it is from this machine's", () => {
  for (const c of v.clockOf) expect(clockOf(bytes(c.reply)) ?? null, c.note).toEqual(c.clock)
  for (const c of v.clockDrift) expect(clockDrift(c.clock, new Date(c.local)) ?? null, c.note).toBe(c.minutes)
})

test('the sunrise/sunset curve: off, rising over the ramp, full, falling to off', () => {
  for (const c of v.levelAt) expect(levelAt(c.schedule, c.minute), c.note ?? `${c.schedule.on}–${c.schedule.off} at ${c.minute}`).toBeCloseTo(c.level, 5)
})
