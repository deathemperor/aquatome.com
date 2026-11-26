import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { checkLinks, glossaryLinkCheck, linkCheckText, type Page, READER_ORDER, type Term, writeLinkCheck } from '../src/glossary-link-check'

// The standing check on link phrases, its half with no model (the chief of staff, 21 Nov 2026): "oxy" linked "oxy già"
// and "lãnh thổ" linked "Lãnh thổ Bắc Úc". Each is flagged where the linker links it; a term's own use isn't.
const terms: Term[] = [
  { id: 'oxy-hoa-tan', name: 'Oxy hòa tan', altNames: [], linkNames: ['oxy'], text: '<p>Giữ oxy hòa tan cao.</p>' },
  { id: 'tinh-lanh-tho', name: 'Tính lãnh thổ', altNames: [], linkNames: ['lãnh thổ'], text: '<p>Cá giữ lãnh thổ.</p>' },
  { id: 'luu-vuc', name: 'Lưu vực', altNames: [], linkNames: ['lưu vực sông'], text: '<p>Cá ở lưu vực sông Amazon.</p>' },
]
const page = (id: string, html: string): Page => ({ kind: 'guides', id, html })
const pages = [
  ...Array.from({ length: 12 }, (_, i) => page(`rua-be-${i}`, `<p>Rửa bể bằng oxy già rồi xả sạch.</p>`)),
  page('suc-khi', '<p>Tăng oxy cho bể khi cá ngáp.</p>'),
  page('ca-uc', '<p>Loài này sống ở Lãnh thổ Bắc Úc.</p><p>Con đực giữ lãnh thổ.</p>'),
  page('ca-amazon', '<p>Cá sống ở lưu vực sông Amazon.</p>'),
  page('hai-doan', '<p>Cá giữ lãnh thổ</p><p>Nuôi riêng.</p>'),
]

test('a link phrase is flagged before a word that makes a longer phrase the site writes often, and before a name', () => {
  const r = checkLinks(terms, pages)
  const oxy = r.find(x => x.phrase === 'oxy')!
  expect(oxy.links).toBe(13)
  expect(oxy.longer[0]).toEqual(['già', 12, 12])
  expect(oxy.flagged).toHaveLength(12)
  expect(oxy.flagged.every(f => f.flag === 'longer' && f.next === 'già')).toBe(true)
  const lt = r.find(x => x.term === 'tinh-lanh-tho')!
  expect(lt.flagged.map(f => [f.page, f.flag, f.next])).toEqual([['guides/ca-uc', 'name', 'Bắc']])
})

test('a term\'s own use is not flagged: its name, a name it writes itself after the phrase, a word in the next paragraph', () => {
  const r = checkLinks(terms, pages)
  expect(r.find(x => x.term === 'luu-vuc')!.flagged).toEqual([])
  expect(r.find(x => x.term === 'tinh-lanh-tho')!.flagged.some(f => f.page === 'guides/hai-doan')).toBe(false)
  const own = checkLinks([{ ...terms[0]!, linkNames: [] }], Array.from({ length: 12 }, (_, i) => page(`p${i}`, '<p>Oxy hòa tan thấp làm cá ngạt.</p>')))
  expect(own[0]!.flagged).toEqual([])
})

test('a held phrase doesn\'t link, so it isn\'t counted or flagged, and the file groups the flags', () => {
  const r = checkLinks(terms, pages, new Set(['oxy-hoa-tan\noxy']))
  expect(r.some(x => x.phrase === 'oxy')).toBe(false)
  const text = linkCheckText({ reports: checkLinks(terms, pages), links: 0, flagged: 13 }, '2026-11-22')
  expect(text).toContain('## oxy-hoa-tan: "oxy", 12 of 13 flagged')
  expect(text).toContain('"oxy già" 12 times on 12 pages')
  expect(text).toContain('- longer: beside "già", 12 places')
})

// The reader of #1805, 22 Nov 2026: with the case-blind flag, "a name after it" matched any word, so an entry that writes
// "lãnh thổ là …" let every "Lãnh thổ Bắc Úc" through. Only a capitalised word in the entry's own text makes it the term's use.
test('an entry that writes the phrase before a lower-case word still has a name after it flagged', () => {
  const t: Term = { id: 'tinh-lanh-tho', name: 'Tính lãnh thổ', altNames: [], linkNames: ['lãnh thổ'], text: '<p>Cá giữ lãnh thổ rất chặt.</p>' }
  const r = checkLinks([t], [page('ca-uc', '<p>Loài này sống ở Lãnh thổ Bắc Úc.</p>')])
  expect(r[0]!.ownCaps).toBe(false)
  expect(r[0]!.flagged.map(f => [f.flag, f.next])).toEqual([['name', 'Bắc']])
})

// The chief of staff, 22 Nov 2026: nothing reads the check's 587 KB .json, so the cycle writes only the page he reads.
test('the check writes only its page for the chief of staff, no .json beside it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-link-check-'))
  await mkdir(join(root, 'content/glossary/oxy-hoa-tan'), { recursive: true })
  await writeFile(join(root, 'content/glossary/oxy-hoa-tan/vi.json'), JSON.stringify({ name: 'Oxy hòa tan', altNames: [], linkNames: ['oxy'] }))
  const out = join(root, 'review')
  await mkdir(out)
  await writeLinkCheck(root, out, '2026-11-22')
  expect(await readdir(out)).toEqual(['glossary-link-check.md'])
})

// The outside read of 22 Nov: the site links a term once a page, where it first comes as the page is read, and a fish page's
// file has its habitat before its water while the page shows water first. The check reads the sections in the page's order.
test('a page\'s sections are read in the order the site shows them, so the place checked is the one the site links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-link-order-'))
  await mkdir(join(root, 'content/glossary/luu-vuc'), { recursive: true })
  await writeFile(join(root, 'content/glossary/luu-vuc/vi.json'), JSON.stringify({ name: 'Lưu vực', altNames: [], linkNames: ['lưu vực sông'] }))
  await mkdir(join(root, 'content/species/ca-a'), { recursive: true })
  await writeFile(join(root, 'content/species/ca-a/vi.json'), JSON.stringify({ sections: { 'habitat:glaser': '<p>Sống ở vùng lưu vực sông lớn.</p>', 'waterConditions:sf': '<p>Nước của lưu vực sông thì chua.</p>' } }))
  const { reports } = await glossaryLinkCheck(root)
  const around = reports[0]!.places.map(p => p.around)
  expect(around).toHaveLength(1)
  expect(around[0]).toContain('Nước của [lưu vực sông] thì chua.')
  expect(around[0]).toContain('Sống ở vùng lưu vực sông lớn.')
})

test('the check\'s section order is the site\'s', async () => {
  const site = await readFile(new URL('../../../apps/site/src/lib/sections.ts', import.meta.url), 'utf8')
  const list = /export const DISPLAY_ORDER: SectionKey\[\] = \[([^\]]+)\]/.exec(site)![1]!.match(/'([^']+)'/g)!.map(x => x.slice(1, -1))
  expect(READER_ORDER).toEqual(list)
})

// Two spellings of one name: which one a page writes first doesn't decide whether a name after it is the term's own use.
test('a term\'s own use after one spelling holds for the other, whatever order the pages come in', () => {
  const t: Term = { id: 'luu-vuc', name: 'Lưu vực', altNames: [], linkNames: ['thủy vực', 'thuỷ vực'], text: '<p>Cá ở thủy vực Mekong.</p>' }
  const ps = [page('a', '<p>Cá sống ở thuỷ vực Amazon.</p>'), page('b', '<p>Cá sống ở thủy vực Mekong.</p>')]
  const flags = (xs: Page[]) => checkLinks([t], xs).flatMap(r => r.places.map(p => [p.page, p.flagged]))
  expect(flags(ps)).toEqual([['guides/a', false], ['guides/b', false]])
  expect(flags([...ps].reverse()).sort()).toEqual([['guides/a', false], ['guides/b', false]])
})
