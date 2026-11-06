import { userAgents } from 'lighthouse/core/config/constants.js'
import { ours } from '../playwright.config'

/**
 * Lighthouse's settings for one run (lighthouse.spec.ts). Lighthouse emulates its phone or computer with a browser name
 * of its own, so it says it's ours as every Playwright project does (worker/bots.ts): on the live site, unmarked, it was a
 * reader from the runner's country, and the root gave a runner in the US the language chooser, not the home page (watch
 * run 42092859915).
 */
export const lighthouseFlags = (form: 'phone' | 'desktop', port: number, live: boolean) => ({
  port, output: 'json' as const, logLevel: 'error' as const,
  onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  emulatedUserAgent: ours(userAgents[form === 'desktop' ? 'desktop' : 'mobile']),
  // robots.txt's Content-Signal line (lib/seo.ts) is a newer directive Lighthouse doesn't know yet: not an error.
  skipAudits: ['robots-txt'],
  // Never the site's visit counter (a check is not a reader). Locally, nothing from other sites either (ads,
  // analytics, photos: the build is served over http, everything else is https), nor the Worker's answers the
  // pages ask for (likes, comments, products, accounts, fish ID: the files alone have none, and a 404 is a console error).
  // Live, the page as readers get it.
  blockedUrlPatterns: ['*/_e', ...(live ? [] : ['https://*', '*/_p?*', '*/_c?*', '*/_aff/*', '*/api/v1/*', '*/api/fish-id'])],
})
