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

test('our own browser checks are not readers: every Playwright project says so in its user agent', async () => {
  const { default: config } = await import('../../playwright.config')
  for (const p of config.projects ?? []) expect(isBot(p.use?.userAgent ?? null, 'vi'), p.name).toBe(true)
  // The same phone and computer without the mark still count.
  const { devices } = await import('@playwright/test')
  expect(isBot(devices['Pixel 7']!.userAgent, 'vi')).toBe(false)
  expect(isBot(devices['Desktop Chrome']!.userAgent, 'vi')).toBe(false)
})

test('Lighthouse, as the checks run it, is ours too: its emulated phone and computer say so', async () => {
  const { lighthouseFlags } = await import('../../e2e/lighthouse-flags')
  const { userAgents } = await import('lighthouse/core/config/constants.js')
  for (const form of ['phone', 'desktop'] as const) expect(isBot(lighthouseFlags(form, 9222, true).emulatedUserAgent, 'en-US'), form).toBe(true)
  // Unmarked, they're readers: on the live site, a runner in the US got the language chooser at the root.
  for (const ua of Object.values(userAgents)) expect(isBot(ua, 'en-US')).toBe(false)
})
