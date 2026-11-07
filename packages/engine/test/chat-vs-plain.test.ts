import { describe, expect, it } from 'vitest'
import type { ChatBlock } from '../../../apps/site/worker/chat/answer'
import { agreed, blockText, FOLDED, judgePrompt, outcome, panelPrompt, panelSide, readPanel, savedTank, seenOurs, single, unbrand, type PostTank, type Verdict } from '../scripts/chat-vs-plain-lib'

const verdict = (v: Partial<Verdict>): Verdict => ({
  criteria: { correct: 'tie', fits: 'tie', actionable: 'tie', grounded: 'tie', local: 'tie' },
  better: 'tie', scoreX: 5, scoreY: 5, lacksX: [], lacksY: [], errorsX: [], errorsY: [], why: '', ...v,
})

describe('the chat against plain Claude counts a win only when both orders agree', () => {
  it('ours first as X, then as Y: both picking ours is a win', () => {
    const r = outcome({ first: verdict({ better: 'X', scoreX: 8, scoreY: 6 }), second: verdict({ better: 'Y', scoreX: 5, scoreY: 9 }) })
    expect(r.better).toBe('ours')
    expect(r.consistent).toBe(true)
    expect(r.ours).toBe(8.5)
    expect(r.plain).toBe(5.5)
  })
  it('the judge picking whichever came first is a split, so a tie', () => {
    const r = outcome({ first: verdict({ better: 'X' }), second: verdict({ better: 'X' }) })
    expect(r.better).toBe('tie')
    expect(r.consistent).toBe(false)
  })
  it('each count is read back the same way', () => {
    const r = outcome({
      first: verdict({ criteria: { correct: 'Y', fits: 'X', actionable: 'X', grounded: 'tie', local: 'Y' } }),
      second: verdict({ criteria: { correct: 'X', fits: 'Y', actionable: 'X', grounded: 'tie', local: 'X' } }),
    })
    expect(r.criteria).toEqual({ correct: 'plain', fits: 'ours', actionable: 'tie', grounded: 'tie', local: 'plain' })
  })
  it("what each lacks and its errors, from both orders, each answer's own", () => {
    const r = outcome({
      first: verdict({ lacksX: ['plan'], lacksY: ['tank-fit'], errorsX: ['a'], errorsY: ['b'] }),
      second: verdict({ lacksX: ['tank-fit', 'too-long'], lacksY: ['plan', 'figures'], errorsX: ['c'], errorsY: [] }),
    })
    expect(r.lacksOurs).toEqual(['plan', 'figures'])
    expect(r.lacksPlain).toEqual(['tank-fit', 'too-long'])
    expect(r.errorsOurs).toEqual(['a'])
    expect(r.errorsPlain).toEqual(['b', 'c'])
  })
  it('agreed', () => {
    expect(agreed('ours', 'ours')).toBe('ours')
    expect(agreed('plain', 'tie')).toBe('tie')
  })
})

describe('the judge reads both answers without our name or links', () => {
  it('the name, full links and site paths go', () => {
    expect(unbrand('Theo cẩm nang AquaTome, xem https://aquatome.com/ca/x/ hoặc /vi/huong-dan/reu-toc/.')).toBe('Theo cẩm nang, xem [link] hoặc [link]')
  })
  it('a fraction or a date stays', () => {
    expect(unbrand('pH 6/7, ngày 12/11')).toBe('pH 6/7, ngày 12/11')
  })
})

describe("the tank condition's saved tank is what the chat reads of a tank today", () => {
  const tank: PostTank = {
    l: 60, w: 30, h: 36, litres: null, fish: [{ name: 'neon', count: 12 }, { name: 'cá lạ', count: null }, { name: 'betta', count: 1, id: 'betta-splendens' }],
    plants: ['rêu java'], light: '10h', co2: null, ferts: null, substrate: null, ageWeeks: 3, notes: null,
  }
  it('fish pinned to the handbook by id, the others unlisted, plants by name, its size and age, the light in its notes', () => {
    expect(savedTank(tank)).toEqual({
      id: 'eval-tank', name: 'Bể của tôi', dims: { l: 60, w: 30, h: 36 },
      species: [{ id: 'betta-splendens', count: 1 }],
      unlisted: [{ name: 'neon', kind: 'fish', count: 12 }, { name: 'cá lạ', kind: 'fish' }, { name: 'rêu java', kind: 'plant' }],
      days: 21, notes: 'Đèn: 10h',
    })
    expect(savedTank({ ...tank, co2: 'bình 1 giọt/giây', ferts: 'phân nước', notes: 'Thay 30% mỗi tuần', substrate: 'soil' })).toMatchObject({
      substrate: 'soil', notes: 'Đèn: 10h. CO2: bình 1 giọt/giây. Phân: phân nước. Thay 30% mỗi tuần',
    })
  })
  it('no size without all three sides', () => {
    expect(savedTank({ ...tank, h: null, litres: 54 })).toMatchObject({ litres: 54 })
    expect(savedTank({ ...tank, h: null })).not.toHaveProperty('dims')
  })
})

describe("our answer as the reader sees it", () => {
  const section: ChatBlock = {
    t: 'section', page: { kind: 'guide', title: 'Rêu tóc', url: '/vi/huong-dan/reu-toc/' }, heading: { text: 'Cách xử lý', id: 'cach-xu-ly' },
    blocks: [{ t: 'p', c: ['Giảm đèn còn 6 giờ.'] }, { t: 'list', ordered: true, items: [[{ t: 'p', c: ['Hút rêu'] }], [{ t: 'p', c: ['Thay 50% nước'] }]] }],
  } as ChatBlock
  it("a section's words under its title and heading", () => {
    expect(blockText(section)).toBe('[Trích: Rêu tóc › Cách xử lý]\nGiảm đèn còn 6 giờ.\n1. Hút rêu\n2. Thay 50% nước')
  })
  it('a long section folded as the app draws it, cut at a word, the rest a tap away', () => {
    const long = { ...section, blocks: [{ t: 'p', c: [`${'rêu '.repeat(80)}cuối`] }] } as ChatBlock
    const text = blockText(long).split('\n')[1]!
    expect(text.endsWith('… [chạm để đọc tiếp]')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(FOLDED + '… [chạm để đọc tiếp]'.length)
    expect(text).not.toContain('cuối')
  })
  it("a card's figures", () => {
    const card = { t: 'species', page: { id: 'paracheirodon-innesi', kind: 'species', name: 'Cá neon', sci: 'Paracheirodon innesi' }, facts: { tempC: { min: 20, max: 26 }, sizeCm: 4, schoolMin: 6 } } as ChatBlock
    expect(blockText(card)).toBe('[Thẻ loài] Cá neon (Paracheirodon innesi): nhiệt độ 20–26 °C; dài 4 cm; đàn từ 6 con')
  })
  it("a tank-mates tool's verdict and warnings, a volume tool with what it's filled with", () => {
    const mates = { t: 'tool', tool: 'tank-mates', name: 'Nuôi chung', check: { verdict: { level: 'no', text: 'Không nên nuôi chung: betta rỉa vây.' }, warnings: ['Cá betta có thể đuổi cá neon.'] } } as ChatBlock
    expect(blockText(mates)).toBe('[Công cụ: Nuôi chung]\nKhông nên nuôi chung: betta rỉa vây.\nCá betta có thể đuổi cá neon.')
    const volume = { t: 'tool', tool: 'tank-volume', name: 'Thể tích bể', url: '/vi/cong-cu/the-tich-be/?d=60&r=30&c=36' } as ChatBlock
    expect(blockText(volume)).toBe('[Công cụ: Thể tích bể (đã điền sẵn: d=60, r=30, c=36)]')
  })
  it('the text, the blocks, then the suggestions', () => {
    expect(seenOurs('Rêu tóc do thừa sáng.', [section], ['Bao lâu thì hết?'])).toBe(`Rêu tóc do thừa sáng.\n\n${blockText(section)}\n\n[Gợi ý hỏi tiếp] Bao lâu thì hết?`)
  })
})

describe('the panel: other judges read many pairs in one packet, each once', () => {
  it("the judge's rubric, word for word, and each pair's question, tank and answers", () => {
    const prompt = panelPrompt([{ pair: 1, question: 'Rêu tóc?', tank: 'Bể 60 lít', x: 'Giảm đèn.', y: 'Thay nước.' }, { pair: 2, question: 'Cá bỏ ăn?', tank: null, x: 'a', y: 'b' }])
    const rubric = judgePrompt('q', null, 'x', 'y')
    expect(prompt).toContain(rubric.slice(rubric.indexOf('An answer may show'), rubric.indexOf('=== X ===')).trim())
    expect(prompt).toContain('## Pair 1')
    expect(prompt).toContain('Bể 60 lít')
    expect(prompt).toContain('=== Y ===\nb')
  })
  it('ours keeps its side for a pair, and both sides come up', () => {
    expect(panelSide('80000000')).toBe('Y')
    expect(panelSide('00000001')).toBe('X')
  })
  it('a reply read back by pair, in a code fence or not; a verdict missing a field is left out', () => {
    const v = { pair: 2, criteria: { correct: 'X', fits: 'X', actionable: 'Y', grounded: 'tie', local: 'X' }, better: 'X', scoreX: 7, scoreY: 5, lacksX: [], lacksY: ['plan'], errorsX: [], errorsY: [], why: '' }
    const read = readPanel(`Here:\n\`\`\`json\n${JSON.stringify([v, { pair: 3, better: 'X' }])}\n\`\`\``)
    expect([...read.keys()]).toEqual([2])
    expect(single(read.get(2)!, 'Y')).toEqual({ better: 'plain', criteria: { correct: 'plain', fits: 'plain', actionable: 'ours', grounded: 'tie', local: 'plain' }, ours: 5, plain: 7 })
  })
})
