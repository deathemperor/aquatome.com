import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { pageMatcher, sciKey, type MatchPage } from '../src/unlisted'

// Shared with the iOS app's tests: an entry without a page is shown as the same page everywhere.
type Vectors = {
  sciKey: { note: string; in: string; key: string }[]
  pages: MatchPage[]
  match: { note: string; kind: string; sci: string | null; page: string | null }[]
}
const v: Vectors = JSON.parse(readFileSync(new URL('../../../protocols/unlisted-vectors.json', import.meta.url), 'utf8'))

test.each(v.sciKey)('sciKey: $note', c => { expect(sciKey(c.in)).toBe(c.key) })

const match = pageMatcher(v.pages)
test.each(v.match)('match: $note', c => { expect(match(c.kind, c.sci ?? undefined)?.id ?? null).toBe(c.page) })

test('the pages\' order doesn\'t change what matches', () => {
  const reversed = pageMatcher([...v.pages].reverse())
  for (const c of v.match) expect(reversed(c.kind, c.sci ?? undefined)?.id ?? null, c.note).toBe(c.page)
})
