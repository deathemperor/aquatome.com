import { expect, test } from 'vitest'
import { curve, lit, mix, snap, toMin, toTime } from '../src/scripts/light-view'

test('equal red, green and blue mix to a near-white; one channel to its own colour; nothing on is dark', () => {
  const w = mix(['red', 'green', 'blue'], [100, 100, 100])
  expect(Math.min(...w.rgb)).toBeGreaterThan(220)
  expect(w.power).toBe(1)
  expect(mix(['red', 'green', 'blue'], [50, 50, 50]).power).toBeCloseTo(0.5, 1)
  const red = mix(['red', 'green', 'blue'], [80, 0, 0])
  expect(red.rgb[0]).toBe(255)
  expect(red.rgb[2]).toBeLessThan(60)
  expect(mix(['red', 'green', 'blue'], [0, 0, 0])).toEqual({ rgb: [0, 0, 0], power: 0 })
  expect(mix(['white'], [100])).toEqual({ rgb: [255, 240, 220], power: expect.any(Number) })
})

test('a red plant looks redder under more red, and dark with the light off', () => {
  const plant: [number, number, number] = [180, 60, 60]
  const warm = lit(plant, mix(['red', 'green', 'blue'], [90, 50, 50]))
  const cool = lit(plant, mix(['red', 'green', 'blue'], [40, 60, 90]))
  expect(warm[0] / warm[2]).toBeGreaterThan(cool[0] / cool[2])
  const off = lit(plant, mix(['red', 'green', 'blue'], [0, 0, 0]))
  expect(Math.max(...off)).toBeLessThan(10)
})

test('times on the timeline: snapped to 15 minutes within the day, 24:00 written as 00:00', () => {
  expect(snap(727)).toBe(720)
  expect(snap(1500)).toBe(1440)
  expect(snap(-20)).toBe(0)
  expect(toTime(1440)).toBe('00:00')
  expect(toTime(toMin('07:45'))).toBe('07:45')
})

test("the day's curve: off, ramp, full, ramp, off", () => {
  expect(curve(720, 1200, 30, 0.7, 100)).toBe('M0 100 L720 100 L750 30.0 L1170 30.0 L1200 100 L1440 100 Z')
  // A ramp longer than half the time lit meets in the middle instead of crossing.
  expect(curve(720, 760, 30, 1, 100)).toBe('M0 100 L720 100 L740 0.0 L740 0.0 L760 100 L1440 100 Z')
})
