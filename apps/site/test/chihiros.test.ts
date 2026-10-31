import { expect, test } from 'vitest'
import { firmwareOf, frame, hoursLit, modelOf, nextId, scheduleParams, setLevel, setMode, setTime } from '../src/scripts/chihiros'

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex').replace(/(..)(?!$)/g, '$1 ')

test('frames match the captures in the protocol notes', () => {
  expect(hex(setLevel(0, 90, 0x0001))).toBe('5a 01 07 00 01 07 00 5a 5a') // level 90 = 0x5a is sent as is
  expect(hex(setLevel(0, 100, 0x0020))).toBe('5a 01 07 00 20 07 00 64 45')
  // Deleting an everyday 02:30–05:10 setting with a one-minute ramp.
  expect(hex(frame(0xa5, 0x19, [2, 30, 5, 10, 1, 127, 255, 255, 255, 255, 255, 255, 255, 255], 0x0017))).toBe('a5 01 13 00 17 19 02 1e 05 0a 01 7f ff ff ff ff ff ff ff ff 71')
  expect(hex(setMode(11, 2))).toBe('5a 01 08 00 02 05 0b ff ff 05')
  expect(setLevel(1, 140, 3)[7]).toBe(100) // levels are 0–100
})

test('message ids skip 0x5a in either byte and wrap', () => {
  expect(nextId(1)).toBe(2)
  expect(nextId(0x59)).toBe(0x5b)
  expect(nextId(0x59ff)).toBe(0x5b00)
  expect(nextId(0xffff)).toBe(1)
})

test('the clock frame sends the ISO weekday', () => {
  // Saturday 31 October 2026, 12:05:09.
  expect([...setTime(new Date(2026, 9, 31, 12, 5, 9), 1).slice(6, 12)]).toEqual([26, 10, 6, 12, 5, 9])
  expect(setTime(new Date(2026, 10, 1, 8, 0, 0), 1)[8]).toBe(7) // Sunday
})

test('schedules: 14 bytes, everyday, levels by channel, white-only and midnight cases', () => {
  expect(scheduleParams({ on: '08:00', off: '16:00', ramp: 30, levels: [70, 60, 50] }, 3)).toEqual([8, 0, 16, 0, 30, 127, 70, 60, 50, 255, 255, 255, 255, 255])
  expect(scheduleParams({ on: '09:30', off: '00:00', ramp: 0, levels: [80] }, 1)).toEqual([9, 30, 23, 59, 0, 127, 80, 255, 255, 255, 255, 255, 255, 255])
  expect(scheduleParams({ on: '10:00', off: '18:00', ramp: 45, levels: [50, 50, 50, 90] }, 4).slice(6, 10)).toEqual([50, 50, 50, 90])
})

test('models by name prefix, longest first', () => {
  expect(modelOf('DYSL30FB86A368EB04')).toMatchObject({ name: 'WRGB II Slim', channels: ['red', 'green', 'blue'] })
  expect(modelOf('DYNA2N12345')?.name).toBe('A II')
  expect(modelOf('DYNARGB60')?.name).toBe('RGB A Plus') // not the A Series ("DYA")
  expect(modelOf('DYNC2N60')?.name).toBe('C II')
  expect(modelOf('DYU1200AB')?.channels).toHaveLength(4)
  expect(modelOf('DYTWO300')).toBeUndefined() // X300: warm/white channels, not supported here
  expect(modelOf('B3.0-A430Pro')).toBeUndefined()
})

test('status replies and hours of light', () => {
  expect(firmwareOf(Uint8Array.from([0x5b, 24, 0x10, 0, 1, 0xfe, 0, 0, 0]))).toBe(24)
  expect(firmwareOf(Uint8Array.from([0x5a, 24, 0, 0, 0, 0, 0]))).toBeUndefined()
  expect(hoursLit('08:00', '16:00')).toBe(8)
  expect(hoursLit('22:00', '06:00')).toBe(8)
  expect(hoursLit('10:00', '16:30')).toBe(6.5)
})
