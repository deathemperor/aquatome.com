import type { Section, SectionKey, SourceId, Translation } from '@aq/schema'
import { expect, test } from 'vitest'
import { dropCardRepeats } from '@aq/schema'
import { foldNearEmpty } from '../src/lib/sections'

const sec = (key: SectionKey, source: SourceId, en: string): Section => ({ key, source, sourceUrl: `https://${source}.test/x`, html: `<p>${en}</p>` })
const tr = (sections: Record<string, string>): Translation => ({ slug: 'x', name: 'X', altNames: [], sections, quality: { score: 0.9, indexable: true } })
const label = (s: string) => `[${s}]`

test('a heading over a few words joins its source\'s quick facts; a full one stays a section', () => {
  const sections = [sec('quickFacts', 'bwaquatics', 'Max 11.5 cm.'), sec('diet', 'bwaquatics', 'Carnivorous. Fed on live, frozen and dry foods, such as blackworms.'), sec('reproduction', 'bwaquatics', 'Mouthbrooder.')]
  const t = tr({ 'quickFacts:bwaquatics': '<ul><li>Tối đa 11,5 cm</li></ul>', 'diet:bwaquatics': '<p>Ăn thịt…</p>', 'reproduction:bwaquatics': '<p>Cá ấp trứng bằng miệng.</p>' })
  const out = foldNearEmpty(sections, t, label)
  expect(out.sections.map(s => s.key)).toEqual(['quickFacts', 'diet'])
  expect(out.sections[0]!.html).toBe('<p>Max 11.5 cm.</p><ul><li>reproduction: Mouthbrooder.</li></ul>') // the English list gets the item too
  expect(out.t.sections).toEqual({ 'quickFacts:bwaquatics': '<ul><li>Tối đa 11,5 cm</li><li><strong>[Sinh sản]:</strong> Cá ấp trứng bằng miệng.</li></ul>', 'diet:bwaquatics': '<p>Ăn thịt…</p>' })
  expect(t.sections['reproduction:bwaquatics']).toBeDefined() // the page's own translation is left as it was
})

test('left out when the quick facts already say it, or when all it says is "Unknown."', () => {
  const sections = [sec('quickFacts', 'bwaquatics', 'Breeding: mouthbrooder'), sec('reproduction', 'bwaquatics', 'Mouthbrooder.'), sec('dimorphism', 'bwaquatics', 'Unknown.')]
  const t = tr({ 'quickFacts:bwaquatics': '<ul><li>Sinh sản: ấp trứng bằng miệng</li></ul>', 'reproduction:bwaquatics': '<p>Cá ấp trứng bằng miệng.</p>', 'dimorphism:bwaquatics': '<p>Chưa rõ.</p>' })
  const out = foldNearEmpty(sections, t, label)
  expect(out.sections.map(s => s.key)).toEqual(['quickFacts'])
  expect(out.t.sections).toEqual({ 'quickFacts:bwaquatics': '<ul><li>Sinh sản: ấp trứng bằng miệng</li></ul>' })
})

test('a source with no quick facts gets them, so the fact keeps its own source mark', () => {
  const sections = [sec('quickFacts', 'seriouslyfish', 'Profile.'), sec('distribution', 'glaser', 'Rio Ucayali, Peru.')]
  const out = foldNearEmpty(sections, tr({ 'quickFacts:seriouslyfish': '<p>Hồ sơ.</p>', 'distribution:glaser': '<p>Sông Ucayali, Peru.</p>' }), label)
  expect(out.sections).toEqual([{ key: 'quickFacts', source: 'glaser', sourceUrl: 'https://glaser.test/x', html: '<ul><li>distribution: Rio Ucayali, Peru.</li></ul>' }, sections[0]])
  expect(out.t.sections['quickFacts:glaser']).toBe('<ul><li><strong>[Phân bố]:</strong> Sông Ucayali, Peru.</li></ul>')
})

test('two sources under one heading count together: a short line next to a full one stays', () => {
  const sections = [sec('reproduction', 'bwaquatics', 'Mouthbrooder.'), sec('reproduction', 'seriouslyfish', 'A paternal mouthbrooder; the male holds the eggs for up to four weeks.')]
  const t = tr({ 'reproduction:bwaquatics': '<p>a</p>', 'reproduction:seriouslyfish': '<p>b</p>' })
  expect(foldNearEmpty(sections, t, label)).toEqual({ sections, t })
})

test('after a fold, the quick facts still drop the figures the data card shows (the lists match item for item)', () => {
  const sections = [sec('quickFacts', 'bwaquatics', ''), sec('reproduction', 'bwaquatics', 'Mouthbrooder.')]
  sections[0]!.html = '<ul><li>Temperature: 72–82°F (22–28°C)</li><li>Wild-caught in Marudi.</li></ul>'
  const t = tr({ 'quickFacts:bwaquatics': '<ul><li>Nhiệt độ: 22–28°C</li><li>Bắt từ tự nhiên ở Marudi.</li></ul>', 'reproduction:bwaquatics': '<p>Cá ấp trứng bằng miệng.</p>' })
  const out = foldNearEmpty(sections, t, label)
  const card = { tempC: [{ source: 'bwaquatics' as const, value: { min: 22, max: 28 } }] }
  expect(dropCardRepeats(out.sections[0]!.html, out.t.sections['quickFacts:bwaquatics']!, 'bwaquatics', card))
    .toBe('<ul><li>Bắt từ tự nhiên ở Marudi.</li><li><strong>[Sinh sản]:</strong> Cá ấp trứng bằng miệng.</li></ul>')
})
