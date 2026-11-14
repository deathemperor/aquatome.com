import { expect, test } from 'vitest'
import { LANGS } from '@aq/schema/langs'
import { localizePath } from '../src/lib/i18n'
import { placeTip } from '../src/scripts/glossary-tip'
import { TERM_PAGE } from '../worker/events'

test('a glossary term\'s address, as every language writes it, is one the Worker keeps from a tip\'s event', () => {
  for (const l of LANGS) expect(TERM_PAGE.test(localizePath(l, '/vi/thuat-ngu/ph/')), l).toBe(true)
})

test('the card sits under the term, over it near the bottom of the screen, and inside the sides', () => {
  expect(placeTip({ left: 100, top: 200, bottom: 220 }, 300, 120, 400, 800)).toEqual({ left: 92, top: 226 }) // pushed in from the right edge
  expect(placeTip({ left: 20, top: 700, bottom: 720 }, 300, 120, 1200, 800)).toEqual({ left: 20, top: 574 }) // no room below
  expect(placeTip({ left: 2, top: 50, bottom: 70 }, 300, 120, 1200, 150)).toEqual({ left: 8, top: 76 }) // no room either way: below
})
