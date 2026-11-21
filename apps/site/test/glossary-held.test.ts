import { expect, test } from 'vitest'
import { GLOSSARY_HELD, heldPhrase } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { linkTargets } from '../src/lib/mentions'

// The chief of staff, 21 Nov 2026: a phrase the standing check flags doesn't link until the chief rules, through a list the
// linker reads (glossary-held.ts). The term keeps it; only the link goes, and comes back when it's off the list.
test('a held phrase of a term is not linked, in either case, and the term keeps it', async () => {
  const vi = await getContent('vi')
  const names = () => linkTargets(vi).find(t => t.key === 'glossary:ca-dan')!.names
  const before = names()
  expect(before).toContain('cá bơi theo đàn')
  GLOSSARY_HELD.push({ term: 'ca-dan', phrase: 'Cá bơi theo đàn', since: '2026-11-22', why: 'a test' })
  try {
    expect(heldPhrase('ca-dan', 'cá bơi theo đàn')).toBe(true)
    expect(names()).toEqual(before.filter(n => n !== 'cá bơi theo đàn'))
    const t = vi.glossary.find(g => g.id === 'ca-dan')!.t
    expect([t.name, ...t.altNames, ...(t.linkNames ?? [])]).toContain('cá bơi theo đàn')
  } finally {
    GLOSSARY_HELD.pop()
  }
  expect(names()).toEqual(before)
})
