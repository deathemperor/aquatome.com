import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { rangeParts } from '../src/lib/range'

test('a range names a river in the page\'s language when the river is written in it, even with no page of its own there', async () => {
  // The Thai page of Bagarius rutilus named the Thái Bình, Kỳ Cùng, Mã and Lam rivers in Vietnamese (2026-11-08): no Thai
  // fish lists them, so they had no Thai page, and their Thai names went unread.
  const c = await getContent('th')
  const s = { id: 'x', name: 'x', range: { native: { countries: ['VN'], regions: ['Thái Bình'], sources: ['seriouslyfish' as const], quotes: [] } } }
  const html = JSON.stringify(rangeParts('th', { ...c, placeNames: { ...c.placeNames, 'thai-binh': 'ไทบิ่ญ' } }, s, () => ''))
  expect(html).toContain('ไทบิ่ญ')
  expect(html).not.toContain('Thái Bình')
})
