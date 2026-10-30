import { parse } from 'node-html-parser'
import { expect, test } from 'vitest'
import { applyUnits } from '../src/scripts/units'
import { translator } from '../src/lib/i18n'

// Voice-control users say what they see ("click cm"): the button's name has to start with its visible text.
test('units toggle: the accessible name contains the visible label in both states', () => {
  const root = parse('<button data-units-toggle>cm · °C</button>')
  const b = root.querySelector('button')!
  for (const u of ['imperial', 'metric'] as const) {
    applyUnits(u, translator('vi'), root as unknown as ParentNode)
    expect(b.getAttribute('aria-label')!.startsWith(b.textContent)).toBe(true)
  }
  expect(b.getAttribute('aria-label')).toBe('cm · °C, đổi sang inch và °F')
})
