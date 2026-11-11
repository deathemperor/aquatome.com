import { expect, test } from 'vitest'
import { cleanLRecord, lNumbersOf, showsLNumber, withLNumber } from '../src/l-numbers'

test("an L record is written as keepers write it, from the five ways it came in; a cory's, an apisto's or a ray's number is left as it is", () => {
  expect(['L 46', 'L046', 'L31', 'LDA 008', 'L027, LDA077', 'L 1, L 22', 'L201a', 'L056X', 'C055, C105', 'CW 35', 'A188', 'P11'].map(cleanLRecord))
    .toEqual(['L46', 'L46', 'L31', 'LDA8', 'L27, LDA77', 'L1, L22', 'L201a', 'L56x', 'C055, C105', 'CW 35', 'A188', 'P11'])
  expect(lNumbersOf('L027, LDA077')).toEqual(['L27', 'LDA77'])
  expect(lNumbersOf('C055, A188, CW 35')).toEqual([])
})

// The owner, 2026-11-11, on the zebra pleco's page: "Pleco must always include L number on name".
test("a pleco's name shows its first L number after it, written clean; a name with one of its numbers keeps it; any other fish is as it was", () => {
  const pleco = (name: string, record?: string) => withLNumber(name, 'Loricariidae', record)
  expect(pleco('Cá zebra pleco', 'L46')).toBe('Cá zebra pleco L46')
  expect(pleco('Cá lau kiếng hoàng gia Tapajos', 'L27, LDA77')).toBe('Cá lau kiếng hoàng gia Tapajos L27')
  expect(pleco('Cá lau kính claro', 'LDA8')).toBe('Cá lau kính claro LDA8')
  expect(pleco('Cá pleco L091', 'L91')).toBe('Cá pleco L91')
  expect(pleco('Cá lau kiếng Ancistrus dolichopterus (L183)', 'L183')).toBe('Cá lau kiếng Ancistrus dolichopterus L183')
  expect(pleco('Pleco L001', 'L1, L22')).toBe('Pleco L1')
  expect(pleco('Pleco L22', 'L1, L22')).toBe('Pleco L22') // one of its own, not the first: kept
  expect(pleco('Cá L134', 'L134')).toBe('Cá L134') // only its number: stays
  expect(pleco('Cá L201a Big Spots', 'L201a')).toBe('Cá L201a Big Spots')
  expect(pleco('Cá L56x Parancistrus', 'L056X')).toBe('Cá L56x Parancistrus') // a form's letter in either case
  expect(pleco('Cá lau kiếng vàng')).toBe('Cá lau kiếng vàng') // no number on record
  expect(withLNumber('Cá chuột panda', 'Callichthyidae', 'C020')).toBe('Cá chuột panda')
  expect(withLNumber('Cá sặc L46', 'Osphronemidae', 'L46')).toBe('Cá sặc L46')
  for (const [name, record] of [['Cá zebra pleco', 'L46'], ['Cá pleco L091', 'L91'], ['Cá L134', 'L134']] as const)
    expect(showsLNumber(withLNumber(name, 'Loricariidae', record), 'Loricariidae', record)).toBe(true)
  expect(showsLNumber('Cá zebra pleco', 'Loricariidae', 'L46')).toBe(false)
  expect(showsLNumber('Cá lau kiếng vàng', 'Loricariidae', undefined)).toBe(true)
})
