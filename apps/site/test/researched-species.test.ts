import { expect, test } from 'vitest'
import type { Localized, SpeciesEntity } from '@aq/schema'
import type { Block } from '@aq/schema/app-page'
import { fishDoc, listedPaths, sectionBlocks } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { sectionParts } from '../src/lib/section-parts'

// A species no licensed source covers, written by AquaTome from web research (engine species-research.ts): its text cites
// each page its facts come from, its card's figure the page it comes from. A fixture fish made into one here: a fixture
// page of the kind would change the app's page vectors (protocols/page-vectors.json).
const ABOUT = 'https://aquatome.com/vi/gioi-thieu/'
const refs = [{ url: 'https://journal.example/new-genus', title: 'A new genus of miniature labyrinth fish' }, { url: 'https://www.youtube.com/watch?v=iV3tUG5Vd4I', title: 'Meet the Jewel Gourami!' }, { url: 'https://museum.example/catalogue', title: 'Museum catalogue' }]
async function researched() {
  const c = await getContent('vi')
  const base = c.species.find(x => x.id === 'paracheirodon-axelrodi')!
  const s: Localized<SpeciesEntity> = {
    ...base, refs, range: undefined,
    sections: [
      { key: 'habitat', source: 'aquatome', sourceUrl: ABOUT, html: '<p>Đầm lầy.</p>', refs: [1] },
      { key: 'notes', source: 'aquatome', sourceUrl: ABOUT, html: '<p>Loài mới.</p>', refs: [0, 1] },
    ],
    // Its size from the catalogue alone: listed among the sources, though no part of the text cites it.
    dataCard: { sizeCm: [{ source: 'aquatome', ref: 2, value: 1.65 }] },
    t: { ...base.t, sections: { 'habitat:aquatome': '<p>Đầm lầy.</p>', 'notes:aquatome': '<p>Loài được mô tả năm 2026.</p>' } },
  }
  return { c, s }
}

test('AquaTome\'s own text cites each page it was researched from, numbered in the page\'s source list, the card\'s too', async () => {
  const { c, s } = await researched()
  const { groups, refs: listed, note } = sectionParts('vi', c, { sections: s.sections, t: s.t, card: s.dataCard, refs: s.refs })
  const html = (key: string) => groups.find(g => g.key === key)!.blocks[0]!.vi
  // A mark for each page, numbered by where it first appears; never AquaTome's own about page.
  expect([...html('notes').matchAll(/href="([^"]+)"[^>]*>(\d+)</g)].map(m => [m[1], m[2]])).toEqual([[refs[0]!.url, '2'], [refs[1]!.url, '1']])
  expect([...html('habitat').matchAll(/href="([^"]+)"[^>]*>(\d+)</g)].map(m => [m[1], m[2]])).toEqual([[refs[1]!.url, '1']])
  expect(html('notes')).not.toContain(ABOUT)
  expect(html('notes')).not.toContain('dịch từ nguồn')
  expect(listed).toEqual([{ name: 'Meet the Jewel Gourami!', url: refs[1]!.url }, { name: 'A new genus of miniature labyrinth fish', url: refs[0]!.url }, { name: 'Museum catalogue', url: refs[2]!.url }])
  expect(note).toBe('Các phần trên dịch hoặc tổng hợp từ những nguồn này. Mỗi đoạn ghi số nguồn của nó.')
  // The app's copy reads a block ending in several marks as it reads one.
  expect(sectionBlocks('vi', c, { sections: s.sections, t: s.t, card: s.dataCard, refs: s.refs }).unknown).toEqual([])
})

test('a researched fish\'s copy: credited to AquaTome\'s research, its card\'s figure named by its page', async () => {
  const { c, s } = await researched()
  const d = await fishDoc('vi', c, s, listedPaths('vi', c))
  expect(d.credit).toEqual(['AquaTome tổng hợp từ ', { text: '3 nguồn', href: '#nguon' }, ' rồi tự viết.'])
  const trust = d.blocks.find((b): b is Extract<Block, { t: 'trust' }> => b.t === 'trust')!
  expect(trust.rows).toEqual([{ field: 'sizeCm', label: 'Kích thước', items: ['Museum catalogue'] }])
  // Its two parts are a few words each: they fold into its quick facts (lib/sections.ts) and still cite their pages.
  const list = d.blocks.find((b): b is Extract<Block, { t: 'refs' }> => b.t === 'refs')!
  expect(list.items.map(i => i.url)).toEqual([refs[1]!.url, refs[0]!.url, refs[2]!.url])
})

test('a translated page keeps its note and its credit', async () => {
  const c = await getContent('vi')
  const s = c.species.find(x => x.id === 'paracheirodon-axelrodi')!
  expect(sectionParts('vi', c, { sections: s.sections, t: s.t, card: s.dataCard }).note).toBe('Các phần trên dịch từ những nguồn này. Mỗi đoạn ghi số nguồn của nó.')
  expect((await fishDoc('vi', c, s, listedPaths('vi', c))).credit).toEqual(['Dịch và tổng hợp từ Seriously Fish, Aquarium Glaser. Cập nhật 2026-10-28.'])
})
