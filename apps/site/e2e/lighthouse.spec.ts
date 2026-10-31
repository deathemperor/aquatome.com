import { chromium, expect, test } from '@playwright/test'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'
import { LIVE, onePerKind, sourcePages, templateOf } from './pages'

// Lighthouse (what PageSpeed Insights runs) on one page of each kind readers open most: the phone run is PageSpeed's
// mobile test, the computer run its desktop one. A score or a number past its budget fails the check, so a change that
// makes pages slower, heavier, shakier or less accessible can't merge, deploy, or stay live unnoticed
// (docs/governance.md). Only with E2E_LIGHTHOUSE=1, alone (`--workers=1`): timings measured next to other checks are
// the other checks' load, not the page's.
const ON = !!process.env.E2E_LIGHTHOUSE

type Budget = {
  performance: number; accessibility: number; 'best-practices': number; seo: number // scores, 0–100
  lcp: number; tbt: number; cls: number // largest paint (ms), blocking time (ms), layout shift
  js: number; dom: number // the site's own scripts (KB, uncompressed: the same locally and live), page elements
}
// Accessibility, best practices, SEO, layout shift (Google's "good" line), script weight and page size come out the same
// on every run: their budget is where they are, or a little above. Performance and the two timings move a few points
// between runs and machines: their budget leaves room under the lowest page (2026-10-31, on GitHub's runners, the real
// build: phone 77–89, computer 98–100), and a failing run is measured again twice before it counts.
const BUDGET: Record<'phone' | 'desktop', Budget> = {
  phone: { performance: 70, accessibility: 100, 'best-practices': 100, seo: 100, lcp: 5000, tbt: 200, cls: 0.1, js: 50, dom: 1500 },
  desktop: { performance: 90, accessibility: 100, 'best-practices': 100, seo: 100, lcp: 1500, tbt: 100, cls: 0.1, js: 50, dom: 1500 },
}
// Pages that start below the general budget (by path, else by kind): held where they are until they're fixed, then
// removed from here.
const KNOWN: Record<string, Partial<Budget>> = {
  // Every species card at once: ~15,400 elements on aquatome.com (more with each species added): phone 54, LCP 9.5 s.
  'vi/ca/2': { performance: 45, lcp: 12000, tbt: 800, dom: 20000 },
  // A search page asks not to be indexed (SEO's "crawlable" fails on purpose) and has no description; its search
  // script is ~90 KB.
  'vi/tim-kiem/2': { seo: 55, js: 100 },
}

// One page of each kind, the first in the build (or the sitemap), so the same page is measured each time.
const KINDS = ['vi//1', 'vi/ca/2', 'vi/ca/3', 'vi/cay/3', 'vi/huong-dan/3', 'vi/cong-cu/2', 'vi/cong-cu/3', 'th//1']
// Plus the pages whose weight isn't their kind's: search, and tank-mates (every species' index inline).
const pages = onePerKind(sourcePages(), KINDS, ['/vi/tim-kiem/?q=neon', '/vi/cong-cu/nuoi-chung/'])

test.describe.configure({ retries: 2 })
for (const path of pages) {
  test(`lighthouse ${path}`, { tag: '@lighthouse' }, async ({ baseURL }, info) => {
    test.skip(!ON, 'E2E_LIGHTHOUSE=1 turns Lighthouse on')
    test.setTimeout(180_000)
    const form = info.project.name === 'desktop' ? 'desktop' : 'phone'
    const budget = { ...BUDGET[form], ...(KNOWN[path] ?? KNOWN[templateOf(path.replace(/\?.*/, ''))]) }
    const own = new URL(baseURL!).origin
    const port = 9222 + info.parallelIndex
    const browser = await chromium.launch({ channel: 'chromium', args: [`--remote-debugging-port=${port}`] })
    try {
      const result = await lighthouse(new URL(path, baseURL).href, {
        port, output: 'json', logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        // robots.txt's Content-Signal line (lib/seo.ts) is a newer directive Lighthouse doesn't know yet: not an error.
        skipAudits: ['robots-txt'],
        // Never the site's visit counter (a check is not a reader). Locally, nothing from other sites either (ads,
        // analytics, photos: the build is served over http, everything else is https), nor the Worker's answers the
        // pages ask for (likes, comments, products, accounts: the files alone have none, and a 404 is a console error).
        // Live, the page as readers get it.
        blockedUrlPatterns: ['*/_e', ...(LIVE ? [] : ['https://*', '*/_p?*', '*/_c?*', '*/_aff/*', '*/api/v1/*'])],
      }, form === 'desktop' ? desktopConfig : undefined)
      const lhr = result!.lhr
      await info.attach('lighthouse.json', { body: result!.report as string, contentType: 'application/json' })
      expect(lhr.runtimeError, 'Lighthouse measured the page').toBeUndefined()

      const score = (k: string) => Math.round((lhr.categories[k]?.score ?? 0) * 100)
      const value = (k: string) => lhr.audits[k]?.numericValue ?? NaN
      const scripts = (lhr.audits['network-requests']?.details as { items?: { url: string; resourceType?: string; resourceSize?: number }[] } | undefined)?.items ?? []
      const got = {
        performance: score('performance'), accessibility: score('accessibility'), 'best-practices': score('best-practices'), seo: score('seo'),
        lcp: Math.round(value('largest-contentful-paint')), tbt: Math.round(value('total-blocking-time')), cls: Number(value('cumulative-layout-shift').toFixed(3)),
        js: Math.round(scripts.filter(r => r.resourceType === 'Script' && new URL(r.url).origin === own).reduce((n, r) => n + (r.resourceSize ?? 0), 0) / 1024),
        dom: value('dom-size'),
      }
      // The numbers in the log, to see the margin a budget has.
      console.log(`${form} ${path} ${JSON.stringify(got)} (machine speed ${Math.round(lhr.environment.benchmarkIndex)})`)

      // Each miss with what Lighthouse found wrong in that category, so the failure says what to fix.
      const failed = (k: string) => (lhr.categories[k]?.auditRefs ?? []).filter(r => r.weight > 0 && (lhr.audits[r.id]?.score ?? 1) < 0.9).map(r => `${r.id}: ${lhr.audits[r.id]!.title}`).join('; ')
      for (const k of ['performance', 'accessibility', 'best-practices', 'seo'] as const) expect.soft(got[k], `${k} score on a ${form} (${failed(k)})`).toBeGreaterThanOrEqual(budget[k])
      expect.soft(got.lcp, `largest contentful paint on a ${form}, ms`).toBeLessThanOrEqual(budget.lcp)
      expect.soft(got.tbt, `total blocking time on a ${form}, ms`).toBeLessThanOrEqual(budget.tbt)
      expect.soft(got.cls, `cumulative layout shift on a ${form}`).toBeLessThanOrEqual(budget.cls)
      expect.soft(got.js, `the site's own scripts, KB`).toBeLessThanOrEqual(budget.js)
      expect.soft(got.dom, 'page elements').toBeLessThanOrEqual(budget.dom)
    } finally {
      await browser.close()
    }
  })
}
