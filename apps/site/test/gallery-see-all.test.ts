import { expect, test } from 'vitest'
import { seeAll } from '../src/lib/gallery'

// "Xem tất cả" under a strip (the Design Lead, 18 Nov): there unless the strip shows every photo, each a thumb or one
// the page shows already; a tall screen's column may show the rest.
const p = (n: number) => Array.from({ length: n }, (_, i) => `photo ${i}`)

test('an album the strip shows whole has no "Xem tất cả", its photos on the page counted as shown', () => {
  expect(seeAll(6, p(6), [], false)).toEqual({ all: false, fit: undefined })
  expect(seeAll(8, [null, ...p(7)], [], true)).toEqual({ all: false, fit: undefined })
  // Its ninth photo on the page already (a breed's card): null in `more`, so all 9 show (Codex's read, 18 Nov).
  expect(seeAll(9, p(8), [null], true)).toEqual({ all: false, fit: undefined })
})

test('an album past the strip has it, and a column with more thumbs lists the places the page shows already', () => {
  expect(seeAll(45, p(8), [], false)).toEqual({ all: true, fit: undefined })
  expect(seeAll(45, [null, ...p(7)], [...p(3), null, ...p(4)], true)).toEqual({ all: true, fit: '0 11' })
  // The column's next ones, no photo the page shows: places none.
  expect(seeAll(12, p(8), p(4), true)).toEqual({ all: true, fit: '' })
  // A column whose `more` is only the page's own photos has no thumbs to fit: the strip decides.
  expect(seeAll(10, p(8), [null], true)).toEqual({ all: true, fit: undefined })
})

// The strip's reader, 21 Nov: no phone keeps a strip to six thumbs any more (every strip outside the column is a sideways
// row up to 860 px), so a row that holds the whole album has no button of its own: its script shows it while a thumb is
// out of view, at a phone's width or at 700 px alike.
test('a row of 7 or 8 thumbs, the whole album, leaves "Xem tất cả" to its own measure, at any width', () => {
  expect(seeAll(7, p(7), [], false)).toEqual({ all: false, fit: undefined })
  expect(seeAll(8, [null, ...p(7)], [], false)).toEqual({ all: false, fit: undefined })
  expect(seeAll(7, [null, ...p(6)], [], false)).toEqual({ all: false, fit: undefined })
  // A column's row on a phone swipes through all of them.
  expect(seeAll(8, p(8), [], true)).toEqual({ all: false, fit: undefined })
})
