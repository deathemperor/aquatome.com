import { expect, test } from 'vitest'
import config from '../playwright.config'

// On 18 Nov, 16:56-17:58, a lead's browser checks at Playwright's local default (half the Mac's 16 cores) slowed the Mac's
// small job to 7-26 s beside the engine. Every run takes four browsers at a time, on the Mac as on GitHub.
test('browser checks run four browsers at a time, on this Mac as on GitHub', () => {
  expect(config.workers).toBe(4)
})
