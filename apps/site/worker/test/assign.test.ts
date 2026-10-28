import { expect, test } from 'vitest'
import { isBot, pickSkin, resolveSkin } from '../assign'
import { EQUAL } from '../skins'

const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const req = (path = '/vi/', h: Record<string, string> = { 'user-agent': CHROME, 'accept-language': 'vi-VN,vi;q=0.9' }) => new Request(`https://x.test${path}`, { headers: h })

test('crawlers and tools always get mix with no cookie, even with ?skin=', async () => {
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'AhrefsBot/7.0', 'curl/8.7.1', 'facebookexternalhit/1.1', 'Mozilla/5.0 Chrome-Lighthouse']) {
    expect(await resolveSkin(req('/vi/', { 'user-agent': ua, 'accept-language': 'en' }), async () => ({ mix: 0, a: 1, b: 0, c: 0 }), 0.5)).toEqual({ skin: 'mix' })
    expect(await resolveSkin(req('/vi/?skin=a', { 'user-agent': ua, 'accept-language': 'en' }), async () => EQUAL, 0.5)).toEqual({ skin: 'mix' })
  }
  expect(isBot(CHROME, null)).toBe(true)
  expect(isBot(CHROME, 'vi')).toBe(false)
})

test('query override sets a sticky cookie; reset clears it', async () => {
  const r = await resolveSkin(req('/vi/?skin=b'), async () => EQUAL, 0)
  expect(r.skin).toBe('b')
  expect(r.setCookie).toMatch(/^skin=b; Path=\/; Max-Age=7776000; SameSite=Lax; Secure$/)
  expect(await resolveSkin(req('/vi/?skin=reset'), async () => EQUAL, 0)).toEqual({ skin: 'mix', setCookie: 'skin=; Path=/; Max-Age=0; SameSite=Lax; Secure' })
  expect((await resolveSkin(req('/vi/?skin=evil'), async () => ({ mix: 1, a: 0, b: 0, c: 0 }), 0.3)).skin).toBe('mix')
})

test('existing cookie wins, is not re-set, and weights are not read', async () => {
  expect(await resolveSkin(req('/vi/', { 'user-agent': CHROME, 'accept-language': 'vi', cookie: 'x=1; skin=c' }), async () => { throw new Error('weights read') }, 0)).toEqual({ skin: 'c' })
})

test('new visitors are assigned by weight', async () => {
  expect((await resolveSkin(req(), async () => ({ mix: 1, a: 0, b: 0, c: 0 }), 0.99)).skin).toBe('mix')
  expect(pickSkin(EQUAL, 0)).toBe('mix')
  expect(pickSkin(EQUAL, 0.26)).toBe('a')
  expect(pickSkin(EQUAL, 0.51)).toBe('b')
  expect(pickSkin(EQUAL, 0.999)).toBe('c')
  expect(pickSkin({ mix: 0, a: 0, b: 0, c: 0 }, 0.5)).toBe('mix')
})
