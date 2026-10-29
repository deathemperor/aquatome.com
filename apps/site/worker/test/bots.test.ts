import { expect, test } from 'vitest'
import { isBot } from '../bots'

const CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36'
test('crawlers, tools and clients without accept-language are bots; a real browser is not', () => {
  for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'AhrefsBot/7.0', 'curl/8.7.1', 'facebookexternalhit/1.1', 'Mozilla/5.0 Chrome-Lighthouse'])
    expect(isBot(ua, 'en'), ua).toBe(true)
  expect(isBot(CHROME, null)).toBe(true)
  expect(isBot(null, 'vi')).toBe(true)
  expect(isBot(CHROME, 'vi')).toBe(false)
})
