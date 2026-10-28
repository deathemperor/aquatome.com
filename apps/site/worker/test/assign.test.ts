import { expect, test } from 'vitest'
import { isBot, pickSkin, resolveSkin } from '../assign'
import { EQUAL } from '../skins'

const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
const req = (path = '/vi/', h: Record<string, string> = { 'user-agent': CHROME, 'accept-language': 'vi-VN,vi;q=0.9' }) => new Request(`https://x.test${path}`, { headers: h })

test('crawlers and tools always get mix with no cookie', () => {
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'AhrefsBot/7.0', 'curl/8.7.1', 'facebookexternalhit/1.1', 'Mozilla/5.0 Chrome-Lighthouse']) {
    expect(resolveSkin(req('/vi/', { 'user-agent': ua, 'accept-language': 'en' }), { mix: 0, a: 1, b: 0, c: 0 }, 0.5)).toEqual({ skin: 'mix' })
  }
  expect(isBot(CHROME, null)).toBe(true)
  expect(isBot(CHROME, 'vi')).toBe(false)
})

test('query override sets a sticky cookie; reset clears it', () => {
  const r = resolveSkin(req('/vi/?skin=b'), EQUAL, 0)
  expect(r.skin).toBe('b')
  expect(r.setCookie).toMatch(/^skin=b; Path=\/; Max-Age=7776000; SameSite=Lax; Secure$/)
  expect(resolveSkin(req('/vi/?skin=reset'), EQUAL, 0)).toEqual({ skin: 'mix', setCookie: 'skin=; Path=/; Max-Age=0; SameSite=Lax; Secure' })
  expect(resolveSkin(req('/vi/?skin=evil'), { mix: 1, a: 0, b: 0, c: 0 }, 0.3).skin).toBe('mix')
})

test('existing cookie wins and is not re-set', () => {
  expect(resolveSkin(req('/vi/', { 'user-agent': CHROME, 'accept-language': 'vi', cookie: 'x=1; skin=c' }), EQUAL, 0)).toEqual({ skin: 'c' })
})

test('new visitors are assigned by weight', () => {
  expect(resolveSkin(req(), { mix: 1, a: 0, b: 0, c: 0 }, 0.99).skin).toBe('mix')
  expect(pickSkin(EQUAL, 0)).toBe('mix')
  expect(pickSkin(EQUAL, 0.26)).toBe('a')
  expect(pickSkin(EQUAL, 0.51)).toBe('b')
  expect(pickSkin(EQUAL, 0.999)).toBe('c')
  expect(pickSkin({ mix: 0, a: 0, b: 0, c: 0 }, 0.5)).toBe('mix')
})
