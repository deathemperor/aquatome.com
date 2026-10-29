import { expect, test } from 'vitest'
import { parseEvent, toDataPoint } from '../events'

const ok = { p: '/vi/ca/ca-neon-vua/', t: 'aff', v: 1, sid: 'abc123def456' }
test('valid events parse and map to analytics engine points', () => {
  const e = parseEvent(JSON.stringify(ok))
  expect(e).toEqual(ok)
  expect(toDataPoint(e!)).toEqual({ blobs: ['', 'aff', '/vi/ca/ca-neon-vua/', 'abc123def456', '', ''], doubles: [1], indexes: ['abc123def456'] })
  const v = parseEvent(JSON.stringify({ ...ok, t: 'view', r: 'www.google.com' }))
  expect(toDataPoint(v!, 'VN').blobs).toEqual(['', 'view', '/vi/ca/ca-neon-vua/', 'abc123def456', 'www.google.com', 'VN'])
  expect(parseEvent(JSON.stringify({ ...ok, r: '' }))).toEqual(ok)
  expect(parseEvent(JSON.stringify({ ...ok, s: 'a' }))).toEqual(ok) // pages cached before the A/B test ended still send a skin: ignored
})
test('anything unexpected is rejected', () => {
  for (const bad of [{ ...ok, t: 'buy' }, { ...ok, p: 'http://evil' }, { ...ok, p: `/${'x'.repeat(300)}` }, { ...ok, v: -1 }, { ...ok, v: 'NaN' }, { ...ok, sid: 'short' }, { ...ok, sid: 'ABCDEFGHIJKL' }, { ...ok, r: 'https://x.com/a?b' }, { ...ok, r: 1 }])
    expect(parseEvent(JSON.stringify(bad))).toBeNull()
  expect(parseEvent('not json')).toBeNull()
  expect(parseEvent('null')).toBeNull()
  expect(parseEvent(' '.repeat(5000))).toBeNull()
})
