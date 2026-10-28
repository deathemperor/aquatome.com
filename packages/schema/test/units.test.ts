import { expect, test } from 'vitest'
import { cmToIn, cToF } from '../src/index'

test('converts to one decimal', () => {
  expect(cToF(24)).toBe(75.2)
  expect(cmToIn(5)).toBe(2)
  expect(cmToIn(60)).toBe(23.6)
})
