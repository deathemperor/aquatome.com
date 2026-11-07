import { expect, test } from 'vitest'
import type { Localized, SpeciesEntity } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { jumpRow, speciesParts } from '../src/lib/species-page'

// The photos' chip was the one left out when a fish had every part: on 2026-11-07, 126 of the 153 fish with a gallery
// page. No fixture fish has every part (Cá neon vua has no tank text), so it gets one here, as no-photo.test.ts does.
const LONG = 'Một đàn sáu con cần bể dài ít nhất sáu mươi xăng-ti-mét, có nhiều cây và chỗ trống ở giữa để bơi cùng nhau.'
const withTankText = (s: Localized<SpeciesEntity>): Localized<SpeciesEntity> => {
  const { source, sourceUrl } = s.sections[0]!
  return { ...s, sections: [...s.sections, { key: 'aquariumSize', source, sourceUrl, html: `<p>${LONG}</p>` }], t: { ...s.t, sections: { ...s.t.sections, [`aquariumSize:${source}`]: `<p>${LONG}</p>` } } }
}

test('a fish with every part: five chips, breeding and the tank give way, the photos stay last with their count', async () => {
  const c = await getContent('vi')
  const s = withTankText(c.species.find(x => x.id === 'paracheirodon-axelrodi')!)
  const { jumps, gallery } = await speciesParts('vi', c, s)
  expect(jumps.map(j => [j.label, j.href])).toEqual([
    ['Nước', '#muc-waterConditions'], ['Thức ăn', '#muc-diet'], ['Nuôi chung', '#muc-behaviour'], ['Mua đồ', '#mua-do'], [`Ảnh ${gallery.length}`, `/vi/ca/${s.t.slug}/anh/`],
  ])
  expect(jumps.at(-1)!.end).toBe(true)
})

test('a row that fits gives nothing up; past five, only as many as it takes, breeding first', () => {
  const chip = (href: string) => ({ href })
  const care = ['#muc-aquariumSize', '#muc-waterConditions', '#muc-diet', '#muc-behaviour', '#muc-reproduction'].map(chip)
  expect(jumpRow(care)).toEqual(care)
  expect(jumpRow([...care, chip('/ca/x/anh/')]).map(c => c.href)).toEqual(['#muc-aquariumSize', '#muc-waterConditions', '#muc-diet', '#muc-behaviour', '/ca/x/anh/'])
  expect(jumpRow([...care, chip('#mua-do'), chip('/ca/x/anh/')]).map(c => c.href)).toEqual(['#muc-waterConditions', '#muc-diet', '#muc-behaviour', '#mua-do', '/ca/x/anh/'])
})
