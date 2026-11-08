import { expect, test } from 'vitest'
import { checkPages, rulesReport, RULES } from '../src/content-rules'
import type { Page } from '../src/pages'
import { PHRASES, phraseMatch, phraseSlips, ticCount, ticSlips, VI_STYLE } from '../src/phrases'

const page = (o: Partial<Page>): Page => ({ lang: 'vi', kind: 'species', id: 's', title: 'T', path: '/vi/ca/s/', fields: [], lines: [], captions: [], latinNames: [], card: [], ...o })
const phrasing = (pages: Page[]) => checkPages(pages, RULES.filter(r => r.id === 'phrasing'))

test('each listed phrase a text has, once, with how many times; case-blind and whole words only', () => {
  const list = [{ say: 'nhiều khả năng', instead: '"chắc là"' }, { say: 'dù vậy', find: '(?:dù|tuy) vậy', instead: '"nhưng"' }]
  expect(phraseSlips('Nhiều khả năng cá đực. Tuy vậy, nhiều khả năng cá cái. Dù vậy thì sao.', 'vi', list)).toEqual(['"nhiều khả năng" ×2 → "chắc là"', '"dù vậy" ×2 → "nhưng"'])
  // A phrase inside a longer word is not the phrase.
  expect(phraseSlips('dù vậyy', 'vi', list)).toEqual([])
  // Thai has no spaces between words: a phrase counts anywhere.
  expect(phraseSlips('ปลาชนิดนี้อย่างมีประสิทธิภาพมาก', 'th', [{ say: 'อย่างมีประสิทธิภาพ', instead: 'ดี' }])).toEqual(['"อย่างมีประสิทธิภาพ" → ดี'])
  expect(phraseMatch('vi', list)!.test('Tuy vậy')).toBe(true)
  expect(phraseMatch('vi', [])).toBeUndefined()
})

test('the Vietnamese list: each entry finds its own words, and the writers\' style guide carries every one', () => {
  for (const p of PHRASES.vi!) {
    expect(VI_STYLE).toContain(`- "${p.say}" → ${p.instead}`)
    if (!p.find) expect(phraseSlips(`Câu có ${p.say} ở giữa.`, 'vi')).toContain(`"${p.say}" → ${p.instead}`)
  }
  // The editors' first round: the quarantine guide's title.
  expect(phraseSlips('Cách cách ly cá mới hoặc cá bệnh một cách đơn giản', 'vi')).toEqual(['"một cách + tính từ" → bỏ "một cách": "làm cẩn thận", "cho đơn giản"'])
  // "Một cách khác là…" (another way) is not the calque.
  expect(phraseSlips('Một cách khác là dùng keo 502.', 'vi')).toEqual([])
  // The editors' fifth round: the rewrite glossed the hobby's word with the dictionary's, and swapped a listed word for
  // another calque.
  expect(phraseSlips('Nếu dùng lọc thì lọc bọt biển (lọc mút) chạy bằng sủi là hợp nhất.', 'vi').map(s => s.split(' → ')[0])).toEqual(['"lọc bọt biển"'])
  expect(phraseSlips('Bể đẻ dùng lọc mút xốp là tốt.', 'vi').map(s => s.split(' → ')[0])).toEqual(['"lọc bọt biển"'])
  expect(phraseSlips('Nó là cây có thân.', 'vi').map(s => s.split(' → ')[0])).toEqual(['"cây thân đứng"'])
  expect(phraseSlips('Cá cộng đồng nhỏ, hiền như cá neon, cá sặc và các loài cá mê cung khác.', 'vi').map(s => s.split(' → ')[0])).toEqual(['"bể cộng đồng"', '"cá mê cung"'])
  // A maze of rocks is not the labyrinth fish.
  expect(phraseSlips('Xếp đá thành một mê cung cho cá trốn.', 'vi')).toEqual([])
})

test('a tic: one kind of word three times in a text (the listed one swapped for its neighbours), or "nên" stacked', () => {
  // The editors' third round: "phần lớn" became "hầu hết", then "đa số", all over one page.
  expect(ticSlips('Hầu hết là do CO2. Đa số ca rêu râu đen là vậy. Đa số cây không ưa oxy già.', 'vi')).toEqual(['"phần lớn, hầu hết, đa số" ×3 → nói "bao nhiêu" bằng động từ ("thường", "chủ yếu"), hoặc bỏ'])
  expect(ticSlips('Hầu hết là do CO2. Đa số cây không ưa oxy già.', 'vi')).toEqual([])
  expect(ticSlips('Cá yếu. Thế nên nên mua cá tốt. Cá lớn đắt, nên bạn nên mua cá non.', 'vi')).toEqual(['"nên nên" ×2 → một câu một chữ "nên": "Muốn… thì…", "tốt nhất là"'])
  // Two "nên" further apart can read fine.
  expect(ticSlips('Đó là điều bạn nên biết hoặc nên ôn lại.', 'vi')).toEqual([])
  expect(ticCount('Hầu hết. Đa số. Phần lớn. Thế nên nên mua.', 'vi')).toBe(4)
  expect(ticSlips('ปลา', 'th')).toEqual([])
})

test('the phrasing rule: on a page\'s title, text, summary and FAQ, not its references, and only in a language with a list', () => {
  const p = page({
    title: 'Cá có bạn cùng bể',
    fields: [{ field: 'sections.behaviour:sf', html: '<p>Loài này hung hăng. Dù vậy vẫn nuôi được.</p>' }, { field: 'sections.references:sf', html: '<p>Phần lớn tài liệu (2001).</p>' }],
    lines: [{ field: 'faq.0.a', text: 'Nhiều khả năng là cá đực.' }, { field: 'reviews.agree.0', text: 'phần lớn' }],
  })
  expect(phrasing([p]).findings.map(f => f.detail)).toEqual([
    '"nhiều khả năng" → "chắc là", "có lẽ" (giữ đúng mức chắc chắn của nguồn)',
    '"dù vậy" → "nhưng", "tuy nhiên"',
    '"hung hăng" → "dữ", "hung dữ"',
    '"bạn cùng bể" → "cá nuôi chung", "nuôi chung với…"',
  ])
  expect(phrasing([{ ...p, lang: 'id', path: '/id/ikan/s/' }]).findings).toEqual([])
})

test('the report counts each phrase\'s pages and times instead of listing every page', () => {
  const a = page({ id: 'a', path: '/vi/ca/a/', fields: [{ field: 'body', html: '<p>Dù vậy. Tuy vậy. Phần lớn.</p>' }] })
  const b = page({ id: 'b', path: '/vi/ca/b/', fields: [{ field: 'body', html: '<p>Dù vậy.</p>' }] })
  const md = rulesReport([a, b], phrasing([a, b]), RULES.filter(r => r.id === 'phrasing'))
  expect(md).toContain('## Words hobbyists rarely write (2)')
  expect(md).toContain('- vi · "dù vậy" → "nhưng", "tuy nhiên": 2 pages, 3 times\n- vi · "phần lớn" → "thường", "chủ yếu", hoặc bỏ: 1 pages, 1 times')
})
