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

/**
 * How long a retry on the live site waits before it measures again. The link between GitHub's runner and Cloudflare
 * slows for a while at a time, and a retry right away met the same slow link: watch run 44222512607 (18 Nov 2026)
 * measured a guide's desktop load at 1,553 to 1,568 ms on three tries in 25 s, against 1,500, and 907 ms 35 minutes later;
 * runs 44156973782 and 44169287926 (17 Nov) failed on desktop load the same way. A minute between tries keeps the job
 * inside its 45 minutes however many pages a slow spell catches. The build served on the runner itself needs no wait.
 */
export const retryPause = (live: boolean, retry: number) => (live && retry > 0 ? 60_000 : 0)
