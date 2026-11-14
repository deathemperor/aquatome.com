import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { alphabet, bodySections, glossaryParts, letterOf, tipLine, usedRows, USED_IN_ALL, USED_IN_ROWS } from '../src/lib/glossary-page'

// The Design Lead's board for the glossary (14 Nov 2026), the pieces a term's page and the list put together.

test('a related term reads as its tip begins: its meaning to the first full stop or semicolon, never a decimal point', () => {
  expect(tipLine('Hợp chất tự nhiên tiết ra từ lá khô, lũa và vỏ cây, làm nước có màu vàng nâu và hơi chua. Tanin hạ pH.')).toBe('Hợp chất tự nhiên tiết ra từ lá khô, lũa và vỏ cây, làm nước có màu vàng nâu và hơi chua.')
  expect(tipLine('Độ cứng cacbonat: lượng cacbonat và bicacbonat trong nước; quyết định khả năng đệm.')).toBe('Độ cứng cacbonat: lượng cacbonat và bicacbonat trong nước.')
  expect(tipLine('Thang từ 0 đến 14, với 6.5 là hơi chua. Thêm.')).toBe('Thang từ 0 đến 14, với 6.5 là hơi chua.')
  expect(tipLine('  Một câu không có dấu chấm  ')).toBe('Một câu không có dấu chấm')
})

test('a term\'s rows: three of each kind past six pages in all, with a search for the rest; six or fewer all show, no search', () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i)
  expect([USED_IN_ROWS, USED_IN_ALL]).toEqual([3, 6])
  expect(usedRows({ guides: n(5), fish: n(1), plants: [], total: 6 })).toEqual({ guides: n(5), fish: n(1), plants: [], more: false })
  expect(usedRows({ guides: n(5), fish: n(2), plants: n(4), total: 11 })).toEqual({ guides: n(3), fish: n(2), plants: n(3), more: true })
})

test('a term\'s text becomes parts to jump to: each heading with what follows, addressed by its words, never one of the page\'s own', () => {
  const b = bodySections('<p>Mở đầu.</p><h2>Trong bể của bạn</h2><p>A.</p><h2>Nên làm gì</h2><ol><li>B.</li></ol><h2>Nên làm gì</h2><p>C.</p><h2>Xem thêm</h2><p>D.</p>')
  expect(b.parts).toEqual([
    { href: '#trong-be-cua-ban', label: 'Trong bể của bạn' },
    { href: '#nen-lam-gi', label: 'Nên làm gì' },
    { href: '#nen-lam-gi-2', label: 'Nên làm gì' },
    { href: '#xem-them-2', label: 'Xem thêm' },
  ])
  expect(b.html).toBe('<p>Mở đầu.</p><section aria-labelledby="trong-be-cua-ban"><h2 id="trong-be-cua-ban">Trong bể của bạn</h2><p>A.</p></section><section aria-labelledby="nen-lam-gi"><h2 id="nen-lam-gi">Nên làm gì</h2><ol><li>B.</li></ol></section><section aria-labelledby="nen-lam-gi-2"><h2 id="nen-lam-gi-2">Nên làm gì</h2><p>C.</p></section><section aria-labelledby="xem-them-2"><h2 id="xem-them-2">Xem thêm</h2><p>D.</p></section>')
  expect(bodySections('')).toEqual({ html: '', parts: [] })
})

test('the list files a term under its first letter: accents off, Đ its own in Vietnamese; a Thai word under its first consonant', () => {
  expect(['Ăn tạp', 'Áp trứng bằng miệng', 'Đẻ con', 'Ốc', 'pH', 'Ưa sáng', '2 ngăn'].map(n => letterOf('vi', n))).toEqual(['A', 'A', 'Đ', 'O', 'P', 'U', '2'])
  expect(letterOf('id', 'Đẻ con')).toBe('D')
  expect(['แอมโมเนีย', 'ไรทะเล', 'กรด'].map(n => letterOf('th', n))).toEqual(['อ', 'ร', 'ก'])
  const vi = alphabet('vi', ['Amoniac', 'Ăn tạp', 'Đẻ con', 'Walstad'])
  expect(vi.map(l => l.letter).join(' ')).toBe('A B C D Đ E G H I K L M N O P Q R S T U V X Y W')
  expect(vi.filter(l => l.count)).toEqual([{ letter: 'A', count: 2 }, { letter: 'Đ', count: 1 }, { letter: 'W', count: 1 }])
  expect(alphabet('id', ['Amonia']).length).toBe(26)
  // Thai: only the letters that hold a term, in Thai order.
  expect(alphabet('th', ['แอมโมเนีย', 'กรด', 'ไรทะเล', 'ก้อนหิน'])).toEqual([{ letter: 'ก', count: 2 }, { letter: 'ร', count: 1 }, { letter: 'อ', count: 1 }])
})

test('a disease term links the guide that treats it: the first guide its page lists, a disease guide that names it; any other term none', async () => {
  const c = await getContent('vi')
  const g = c.glossary.find(x => x.id === 'ph')!
  const guide = (id: string, name: string, kind: 'disease' | 'care') => ({ ...c.guides[0]!, id, kind, t: { ...c.guides[0]!.t, name, slug: id } })
  const html = '<p><a href="/vi/thuat-ngu/ph/" class="gl">pH</a></p>'
  const withGuides = (gs: ReturnType<typeof guide>[]) => ({ ...c, guides: gs.map(x => ({ ...x, updatedAt: '2026-11-01', t: { ...x.t, body: html } })) }) as typeof c
  expect(glossaryParts('vi', withGuides([guide('tri-ph', 'Trị bệnh do pH thấp', 'disease'), guide('cham-soc', 'Chăm sóc bể', 'care')]), g).treat?.id).toBe('tri-ph')
  // A care guide leads: no treatment link. A disease guide that doesn't name the term: none.
  expect(glossaryParts('vi', withGuides([guide('ph-la-gi', 'pH là gì', 'care'), guide('tri-ph', 'Trị bệnh do pH thấp', 'disease')]), g).treat).toBeUndefined()
  expect(glossaryParts('vi', withGuides([guide('tri-nam', 'Trị nấm', 'disease')]), g).treat).toBeUndefined()
})
