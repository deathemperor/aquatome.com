import { describe, expect, it } from 'vitest'
import { numbersIn, sentText } from '../scripts/chat-eval-grade'

describe('the chat eval reads numbers as Vietnamese writes them', () => {
  it('decimals, thousands and ranges', () => {
    expect(numbersIn('6,5 hay 6.5')).toEqual([6.5, 6.5])
    expect(numbersIn('1.000 lít, 1,000 lít, 2.000.000 đồng')).toEqual([1000, 1000, 2000000])
    expect(numbersIn('24–28 °C, pH 7,5–8, 64,8 lít')).toEqual([24, 28, 7.5, 8, 64.8])
  })
  it("a dose's small decimal isn't a thousand", () => {
    expect(numbersIn('0,125 g và 0,005 ml')).toEqual([0.125, 0.005])
  })
  it('thousands with a decimal part', () => {
    expect(numbersIn('1.234,5 lít')).toEqual([1234.5])
  })
})

describe('the chat eval counts as read only what Claude was sent', () => {
  it("the user turns' text and the tool results, not Claude's own turns", () => {
    const text = sentText([
      { role: 'user', content: 'Câu hỏi: bể 60 cm' },
      { role: 'assistant', content: [{ type: 'text', text: 'nhiệt độ 99' }, { type: 'tool_use', id: 't', name: 'read_page', input: { path: '/vi/x/' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'Nhiệt độ 24–28 °C' }, { type: 'text', text: 'Trả lời đi' }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'u', content: [{ type: 'text', text: 'pH 6,5' }] }] },
    ])
    expect(text).toContain('bể 60 cm')
    expect(text).toContain('24–28')
    expect(text).toContain('Trả lời đi')
    expect(text).toContain('pH 6,5')
    expect(text).not.toContain('99')
  })
})
