import { expect, test } from 'vitest'
import { commentHtml, date } from '../src/scripts/comments'
import { translator } from '../src/lib/i18n'
import { page } from './dist'

test('comment renderer makes any payload inert', () => {
  const html = commentHtml({ id: '"><x', name: '<img src=x onerror=alert(1)>', body: '<script>alert(1)</script>\n\nhttps://evil.test', helpful: true, createdAt: '2026-10-29T03:00:00Z' }, translator('vi'), 'vi')
  expect(html).not.toMatch(/<img|<script|<a /)
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  expect(html).toContain('&lt;script&gt;')
  expect(html).toContain('data-comment-id="&quot;&gt;&lt;x"')
  expect(html).toContain('Trả lời hay')
})

test("a comment's date is the reader's own day, in their time zone", () => {
  const tz = process.env.TZ
  try {
    process.env.TZ = 'America/New_York'
    expect(date('2026-10-29T20:00:00Z', 'vi')).toBe('29/10/2026')
    process.env.TZ = 'Asia/Tokyo'
    expect(date('2026-10-29T20:00:00Z', 'vi')).toBe('30/10/2026')
  } finally {
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
  }
})

test('species, plant and guide pages carry a hidden comments section for their entity', () => {
  for (const [path, ref] of [['/ca/ca-neon-vua/', 'species:paracheirodon-axelrodi'], ['/cay/ray-nana/', 'plant:anubias-barteri-nana'], ['/huong-dan/setup-be-thuy-sinh-dau-tien/', 'guide:']] as const) {
    const s = page(path).dom.querySelector('section[data-comments]')
    expect(s?.getAttribute('data-entity'), path).toMatch(new RegExp(`^${ref}`))
    expect(s?.hasAttribute('hidden'), path).toBe(true)
  }
})
