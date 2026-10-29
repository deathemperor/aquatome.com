import { expect, test } from 'vitest'
import { parseEvent, toDataPoint } from '../events'

const ok = { s: 'a', p: '/vi/ca/ca-neon-vua/', t: 'aff', v: 1, sid: 'abc123def456' }
test('valid events parse and map to analytics engine points', () => {
  const e = parseEvent(JSON.stringify(ok))
  expect(e).toEqual(ok)
  expect(toDataPoint(e!)).toEqual({ blobs: ['a', 'aff', '/vi/ca/ca-neon-vua/', 'abc123def456', '', ''], doubles: [1], indexes: ['a'] })
  const v = parseEvent(JSON.stringify({ ...ok, t: 'view', r: 'www.google.com' }))
  expect(toDataPoint(v!, 'VN').blobs).toEqual(['a', 'view', '/vi/ca/ca-neon-vua/', 'abc123def456', 'www.google.com', 'VN'])
  expect(parseEvent(JSON.stringify({ ...ok, r: '' }))).toEqual(ok)
})
test('anything unexpected is rejected', () => {
  for (const bad of [{ ...ok, s: 'z' }, { ...ok, t: 'buy' }, { ...ok, p: 'http://evil' }, { ...ok, p: `/${'x'.repeat(300)}` }, { ...ok, v: -1 }, { ...ok, v: 'NaN' }, { ...ok, sid: 'short' }, { ...ok, sid: 'ABCDEFGHIJKL' }, { ...ok, r: 'https://x.com/a?b' }, { ...ok, r: 1 }])
    expect(parseEvent(JSON.stringify(bad))).toBeNull()
  expect(parseEvent('not json')).toBeNull()
  expect(parseEvent('null')).toBeNull()
  expect(parseEvent(' '.repeat(5000))).toBeNull()
})
