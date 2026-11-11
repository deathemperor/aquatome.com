import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { categoriesIn } from '../src/lib/equipment'
import { linkTargets, mentionIndex } from '../src/lib/mentions'

// An equipment guide can be left out of a build: not translated yet, or held back while its pictures wait for the
// watermark screen (the loader, 2026-11-11). Another language then builds no page for that kind of kit.
test("a kind of kit is linked, in text and in a guide's chips, only where the language builds a page for it", async () => {
  const vi = await getContent('vi')
  const kinds = (c: Content) => linkTargets(c).filter(t => t.key.startsWith('equipment:')).map(t => t.key.slice('equipment:'.length)).sort()
  // Vietnamese builds a page for every kind its fish use, with a guide or without, and links each.
  expect(kinds(vi)).toEqual(['den', 'loc', 'suoi', 'thuc-an'])
  expect(kinds({ ...vi, equipment: [] })).toEqual(kinds(vi))
  // The same content as another language's: a page only where it has the guide (the fixture's filter guide), so a link
  // only there.
  const ms: Content = { ...vi, lang: 'ms' }
  expect(categoriesIn('ms', ms).map(u => u.category)).toEqual(['loc'])
  expect(kinds(ms)).toEqual(['loc'])
  // That guide held back: no page, no link in text, and no chip under a guide.
  const held: Content = { ...ms, equipment: [] }
  expect(categoriesIn('ms', held)).toEqual([])
  expect(kinds(held)).toEqual([])
  expect([...mentionIndex(held).guides.values()].flatMap(g => g.equipment)).toEqual([])
  // A content put together by hand, with no language, reads as Vietnamese.
  expect(kinds({ ...vi, lang: undefined })).toEqual(kinds(vi))
})
