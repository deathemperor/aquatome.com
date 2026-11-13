import { expect, test } from 'vitest'
import { creditKind } from '../src/photo-credit'

// Who a source credits a photo to, by the credit's form (the chief of staff, 2026-11-13: the intake's credit check).
// Every name here is made up.
test.each([
  ['Imaginary Person', 'person'],
  ['J. D. Imaginary', 'person'],
  ['Imaginary van der Person', 'person'],
  ['Imaginary Person et al.', 'person'],
  ['© Imaginary Person', 'person'],
  ['Photographer A', 'person'],
  ['Imaginaryhandle', 'unclear'],
  ['IPX', 'unclear'],
  ['A.B.C.', 'organisation'],
  ['Example Fish Society', 'organisation'],
  ['example-fish.org', 'organisation'],
  ['Example Aquatics', 'business'],
  ['Example Photography', 'business'],
  ['example-shop.com', 'business'],
  ['Example Fish Co.', 'business'],
  ['Example Fish Company', 'business'],
  ['Example Fish Corp', 'business'],
  ['Imaginary Person/Example Fish Society', 'person-with-organisation'],
  ['Imaginary Person/example-fish.org', 'person-with-organisation'],
  ['Imaginary Person/Examplefishgroup', 'person-with-organisation'],
  ['Imaginary Person, Example University', 'person-with-organisation'],
  ['Imaginary Person, Another Person', 'person'],
  ['Example Picture Agency', 'agency'],
  ['Imaginary Person/Example Picture Agency', 'agency'],
] as const)('%s reads as %s', (credit, kind) => {
  expect(creditKind(credit, ['example picture agency'])).toBe(kind)
})

test('a picture agency is only one the permission record names', () => {
  expect(creditKind('Example Picture Agency')).not.toBe('agency')
})
