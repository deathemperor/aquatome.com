import { expect, test } from 'vitest'
import { parseEvent, toDataPoint, visitorOf } from '../events'

const ok = { p: '/vi/ca/ca-neon-vua/', t: 'aff', v: 1, sid: 'abc123def456' }
test('valid events parse and map to analytics engine points', () => {
  const e = parseEvent(JSON.stringify(ok))
  expect(e).toEqual(ok)
  expect(toDataPoint(e!)).toEqual({ blobs: ['', 'aff', '/vi/ca/ca-neon-vua/', 'abc123def456', '', '', '', ''], doubles: [1], indexes: ['abc123def456'] })
  const v = parseEvent(JSON.stringify({ ...ok, t: 'view', r: 'www.google.com' }))
  expect(toDataPoint(v!, 'VN').blobs).toEqual(['', 'view', '/vi/ca/ca-neon-vua/', 'abc123def456', 'www.google.com', 'VN', '', ''])
  // The click hook's kinds, and the visitor code (src/lib/beacon.ts).
  for (const t of ['tank', 'src']) expect(parseEvent(JSON.stringify({ ...ok, t }))?.t).toBe(t)
  expect(parseEvent(JSON.stringify({ ...ok, u: 'k3j9x0a1b2' }))).toEqual({ ...ok, u: 'k3j9x0a1b2' })
  expect(parseEvent(JSON.stringify({ ...ok, u: '' }))).toEqual(ok)
  expect(parseEvent(JSON.stringify({ ...ok, r: '' }))).toEqual(ok)
  expect(parseEvent(JSON.stringify({ ...ok, s: 'a' }))).toEqual(ok) // pages cached before the A/B test ended still send a skin: ignored
})
test('anything unexpected is rejected', () => {
  for (const bad of [{ ...ok, t: 'buy' }, { ...ok, p: 'http://evil' }, { ...ok, p: `/${'x'.repeat(300)}` }, { ...ok, v: -1 }, { ...ok, v: 'NaN' }, { ...ok, sid: 'short' }, { ...ok, sid: 'ABCDEFGHIJKL' }, { ...ok, r: 'https://x.com/a?b' }, { ...ok, r: 1 }, { ...ok, u: 'abc' }, { ...ok, u: 'A'.repeat(8) }, { ...ok, u: 'x'.repeat(13) }, { ...ok, u: 7 }])
    expect(parseEvent(JSON.stringify(bad))).toBeNull()
  expect(parseEvent('not json')).toBeNull()
  expect(parseEvent('null')).toBeNull()
  expect(parseEvent(' '.repeat(5000))).toBeNull()
})

test('the device is one of three words, kept as blob8; anything else, a browser string or a screen size, drops the event', () => {
  for (const d of ['phone', 'tablet', 'desktop']) {
    const e = parseEvent(JSON.stringify({ ...ok, d }))
    expect(e).toEqual({ ...ok, d })
    expect(toDataPoint(e!).blobs[7]).toBe(d)
  }
  for (const d of ['', 'iphone', 'Mozilla/5.0 (iPhone)', '390x844', 1, null, ['phone']]) expect(parseEvent(JSON.stringify({ ...ok, d }))).toBeNull()
})

test('the visitor code is kept only with the visitor switch on, and never from a browser sending Global Privacy Control', () => {
  const e = { ...ok, t: 'view' as const, u: 'k3j9x0a1b2' }
  const req = (h: Record<string, string> = {}) => new Request('https://x.test/_e', { method: 'POST', headers: h })
  expect(toDataPoint(visitorOf(e, req(), true)).blobs[6]).toBe('k3j9x0a1b2')
  expect(toDataPoint(visitorOf(e, req(), false)).blobs[6]).toBe('')
  expect(toDataPoint(visitorOf(e, req({ 'sec-gpc': '1' }), true)).blobs[6]).toBe('')
})
