import { expect, test } from 'vitest'
import { edgeOf, loadLine, pathOf } from '../e2e/edge'

// The night of 16 Nov: live checks failed on far Cloudflare edges and dropped connections, and the browser checks didn't
// say which. Each live page load now prints one line in one shape, so a week of logs can be counted by edge.
test('a load prints its edge, the cache, the time to its first byte, its status and its address', () => {
  expect(loadLine({ path: '/cay/', status: 200, headers: { 'cf-ray': 'a5b7e01188f7570d-ATL', 'cf-cache-status': 'HIT' }, firstByte: 182.4 }))
    .toBe('live load: edge ATL cache HIT first byte 182 ms 200 /cay/')
  // No timing from the browser (-1), no cache header, no ray: each says so rather than a number.
  expect(loadLine({ path: '/', status: 200, headers: {}, firstByte: -1 })).toBe('live load: edge ? cache - first byte ? ms 200 /')
})

test('a load that failed prints why, with no edge', () => {
  expect(loadLine({ path: '/cong-cu/be-cua-toi/', failure: 'net::ERR_CONNECTION_RESET' })).toBe('live load: edge ? failed net::ERR_CONNECTION_RESET /cong-cu/be-cua-toi/')
  expect(loadLine({ path: '/', failure: '' })).toBe('live load: edge ? failed unknown /')
})

test("the edge is the ray's airport code, and the address keeps its query but not its origin", () => {
  expect(edgeOf({ 'cf-ray': 'a5b7deb9cd0a2581-MAN' })).toBe('MAN')
  expect(edgeOf({ 'cf-ray': 'malformed' })).toBe('?')
  expect(edgeOf()).toBe('?')
  expect(pathOf('https://aquatome.com/tim-kiem/?q=neon')).toBe('/tim-kiem/?q=neon')
})
