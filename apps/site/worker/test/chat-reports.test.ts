import { expect, test } from 'vitest'
import { chatReportsPage, chatReportsSection, recentReports, type ChatReport } from '../admin/chat-reports'
import { deleteChatOf, reportKey } from '../chat/store'
import { memoryR2 } from './r2'

const A = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-11-10T03:00:00Z')
const report = (question: string, more: Partial<ChatReport> = {}): ChatReport => ({ at: '2026-11-09T10:00:00Z', question, text: `answer to ${question}`, ...more })

async function kept(reports: [string, ChatReport, string][]) {
  const r2 = memoryR2()
  for (const [key, r, at] of reports) {
    r2.setNow(() => new Date(at))
    await r2.bucket.put(key, JSON.stringify(r))
  }
  return r2
}

test('the newest reports come first, a limit cuts the oldest, and only reports are read', async () => {
  const r2 = await kept([
    [reportKey('a', A, 1), report('old'), '2026-11-01T00:00:00Z'],
    [reportKey('b', A, 1), report('newest'), '2026-11-09T00:00:00Z'],
    [reportKey('c', A, 2), report('middle'), '2026-11-05T00:00:00Z'],
    [`chat-conv/a/${A}.json`, report('not a report'), '2026-11-10T00:00:00Z'],
  ])
  expect((await recentReports(r2.bucket)).rows.map(r => r.question)).toEqual(['newest', 'middle', 'old'])
  const cut = await recentReports(r2.bucket, 2)
  expect(cut.total).toBe(3)
  expect(cut.rows.map(r => r.question)).toEqual(['newest', 'middle'])
  expect(chatReportsPage(cut, NOW)).toContain('The newest 2 of 3.')
})

test('a report goes with its account, also when the account goes while the list is read', async () => {
  const r2 = await kept([
    [reportKey('a', A, 1), report('of a'), '2026-11-01T00:00:00Z'],
    [reportKey('b', A, 1), report('of b'), '2026-11-02T00:00:00Z'],
  ])
  const get = r2.bucket.get.bind(r2.bucket)
  r2.bucket.get = (async (key: string) => (key === reportKey('a', A, 1) ? null : get(key))) as typeof r2.bucket.get
  expect((await recentReports(r2.bucket)).rows.map(r => r.question)).toEqual(['of b'])
  r2.bucket.get = get as typeof r2.bucket.get
  await deleteChatOf(r2.bucket, 'b')
  expect((await recentReports(r2.bucket)).rows.map(r => r.question)).toEqual(['of a'])
})

test('what a reader wrote is drawn as text, and an answer keeps its line breaks and wraps instead of running off the page', () => {
  const html = chatReportsPage({ total: 1, rows: [report('<script>alert(1)</script>', { reason: '<img src=x>', text: 'x'.repeat(4000) })] }, NOW)
  expect(html).not.toContain('<script>alert(1)')
  expect(html).not.toContain('<img src=x>')
  expect(html).toContain('&lt;script&gt;alert(1)')
  expect(html).not.toContain('<table class="wide"')
  expect(html).toContain('<div class="reports">')
  expect(html).toMatch(/\.reports td\{[^}]*pre-line[^}]*overflow-wrap:anywhere/)
})

test('the page and the app say the same, and a missing reason is an empty cell', () => {
  const s = chatReportsSection({ total: 1, rows: [report('q')] }, NOW)
  const t = s.blocks.find(b => b.kind === 'table')
  expect(t).toMatchObject({ columns: ['Reported', 'Question', 'Answer', 'Reason'], rows: [[{}, { text: 'q' }, { text: 'answer to q' }, { text: '' }]] })
  expect(chatReportsPage({ total: 0, rows: [] }, NOW)).toContain('No reports yet.')
})
