import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { speciesItems } from '../src/lib/list-data'

// The fish list's data file says which fish are kept in brackish or sea water, for the cards its script builds
// (scripts/species-card.ts); a fresh-water fish's item has no `water`.
test("a list item carries a brackish fish's water, and a fresh-water fish's none", async () => {
  const { getContent } = await import('../src/lib/content')
  const c: Content = await getContent('vi')
  const tetra = c.species.find(s => s.id === 'paracheirodon-innesi')!
  const archer = { ...tetra, id: 'toxotes-jaculatrix', water: { kind: 'brackish' as const, source: 'seriouslyfish' as const, quote: 'a brackish setup is always used' } }
  const [fresh, salt] = speciesItems([tetra, archer], [null, null])
  expect(fresh).not.toHaveProperty('water')
  expect(salt!.water).toBe('brackish')
})
