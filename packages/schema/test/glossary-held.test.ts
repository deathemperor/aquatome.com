import { expect, test } from 'vitest'
import { heldPhrase, type HeldPhrase } from '../src/glossary-held'

// A held phrase is matched as the linker matches names: in either case and either tone placing ("hòa" and "hoà").
test('a held phrase matches its term in either case and either tone placing, and no other term', () => {
  const held: HeldPhrase[] = [{ term: 'oxy-hoa-tan', phrase: 'oxy hòa tan', since: '2026-11-22', why: 'a test' }]
  expect(heldPhrase('oxy-hoa-tan', 'Oxy hoà tan', held)).toBe(true)
  expect(heldPhrase('oxy-hoa-tan', 'OXY HÒA TAN', held)).toBe(true)
  expect(heldPhrase('suc-khi', 'oxy hòa tan', held)).toBe(false)
  expect(heldPhrase('oxy-hoa-tan', 'oxy', held)).toBe(false)
})
