import { expect, test } from 'vitest'
import { edgeOf, loadLine, pathOf, routeLine, waitingLines } from '../e2e/edge'

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
  expect(pathOf('https://aquatome.com/cong-cu/the-tich-be/?l=60&w=30&h=36')).toBe('/cong-cu/the-tich-be/?l=60&w=30&h=36')
  // Any key not the checks' own cuts the whole query: it can carry a code or a token.
  expect(pathOf('https://aquatome.com/ca/x/?q=neon&token=abc123')).toBe('/ca/x/?…')
})

// The night of 18 Nov: three Lighthouse runs missed the desktop paint budget on a round trip to the site of 112 to 169 ms
// (34 to 55 ms on the runs that passed), and their lines named neither the edge nor the round trip.
test("a Lighthouse line's route: the document's edge and the round trip to each of the site's own hosts, largest first", () => {
  const rtts = [{ origin: 'https://aquatome.com', rtt: 112.4 }, { origin: 'https://challenges.cloudflare.com', rtt: 9 }, { origin: 'https://media.aquatome.com', rtt: 140.6 }]
  expect(routeLine({ 'cf-ray': 'a5b7deb9cd0a2581-VIE' }, rtts, 'https://aquatome.com')).toBe('edge VIE, round trip media.aquatome.com 141 ms, aquatome.com 112 ms')
  // Another site's host isn't the site's, even one ending in its name; nothing measured says so.
  expect(routeLine({}, [{ origin: 'https://notaquatome.com', rtt: 5 }], 'https://aquatome.com')).toBe('edge ?, round trip ?')
})

// The same night: three bursts of page loads past 30 s, and no network log to tell which request held each page's load.
test('a check that ran out of time names what its page was still waiting on, longest first, five at most, nothing secret', () => {
  const own = 'https://aquatome.com'
  const open = [
    { url: `${own}/_astro/a.js`, type: 'script', ms: 3_400 },
    { url: `${own}/api/sign-in?code=123456`, type: 'fetch', ms: 29_600 },
    { url: 'https://media.aquatome.com/commons/x.webp?sig=abc', type: 'image', ms: 28_200 },
    ...Array.from({ length: 4 }, (_, i) => ({ url: `${own}/f${i}.woff2`, type: 'font', ms: 1_000 + i })),
  ]
  // The site's own query keys print (pathOf); another host prints its name alone, never its path or query.
  expect(waitingLines(open, own)).toEqual([
    'live load: waiting on /api/sign-in?… (fetch) for 30 s',
    'live load: waiting on media.aquatome.com (image) for 28 s',
    'live load: waiting on /_astro/a.js (script) for 3 s',
    'live load: waiting on /f3.woff2 (font) for 1 s',
    'live load: waiting on /f2.woff2 (font) for 1 s',
  ])
  expect(waitingLines([{ url: `${own}/tim-kiem/?q=betta`, type: 'fetch', ms: 6_000 }, { url: 'https://accounts.example.com/o/oauth2/x/abc123def', type: 'document', ms: 5_000 }], own))
    .toEqual(['live load: waiting on /tim-kiem/?q=betta (fetch) for 6 s', 'live load: waiting on accounts.example.com (document) for 5 s'])
  expect(waitingLines([], own)).toEqual([])
})
