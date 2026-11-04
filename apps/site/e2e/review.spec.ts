import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claude } from './claude-accounts'
import { usageLimit } from './claude-limit'
import { LIVE, recheckPages, sourcePages } from './pages'
import { expect, test } from './fixtures'

// Layer 3 of docs/governance.md: Claude looks at a page the way a reader does (a phone's first three screens and a
// computer's first screen) and reports what's wrong that no rule describes. Only with E2E_REVIEW=1 (it costs model time);
// a serious finding fails the check, so it becomes an issue like any other (scripts/site-watch.mjs).

const ON = !!process.env.E2E_REVIEW
const MODEL = process.env.REVIEW_MODEL ?? 'opus'
// What readers open most, and the searches and tools that broke before. On aquatome.com, also a few pages that change
// each day (E2E_SEED).
const KEY = ['/', '/ca/', '/ca/?q=neon', '/ca/ca-neon-vua/', '/cay/', '/huong-dan/', '/cong-cu/', '/cong-cu/the-tich-be/', '/cong-cu/den-chihiros/', '/id/', '/th/']
const seed = Number(process.env.E2E_SEED ?? 0)
const pool = sourcePages().filter(p => !KEY.includes(p))
const daily = LIVE && pool.length ? Array.from({ length: 6 }, (_, i) => pool[(seed * 7919 + i * 104729) % pool.length]!) : []
// E2E_REVIEW_PAGES: other pages instead (comma-separated paths), for a one-off review.
const PAGES = process.env.E2E_REVIEW_PAGES ? process.env.E2E_REVIEW_PAGES.split(',') : [...new Set([...KEY, ...daily, ...recheckPages()])]

const SYSTEM = `You review pages of AquaTome, an aquarium handbook (Vietnamese, with Indonesian and Thai versions), as a reader would see them.
You get the page's address, its outline, and screenshots: phone.png (a phone's first three screens) and desktop.png (a computer's first screen). Open both with the Read tool.

Report only problems a reader would notice and be hurt by:
- the page doesn't do what its address promises: a search (?q=…) or filter whose results aren't what the first screens show; a tool whose answer isn't visible after its form
- broken layout: overlapping or cut-off text, elements wider than the screen, controls that look broken or unusable on a phone
- empty or placeholder sections, missing pictures where a picture is clearly meant to be, "undefined", raw code or template text
- text in the wrong language for the page (Vietnamese words on an Indonesian or Thai page; names of species and products are fine)
- something plainly wrong at a glance: impossible numbers or units, a heading that contradicts its content, a picture that obviously shows something else

Do not report: style or taste, things you cannot see in the screenshots, missing features, ads being absent (they are blocked in this check), pictures from other websites failing to load (they are blocked too: a grey box where a photo goes is expected).

Severity: "high" = the page fails its purpose or looks broken to most readers (example: a search whose matching results start five phone screens down, below unrelated cards); "medium" = a real problem that most readers can work around; "low" = minor.
Each finding: a short title, the evidence (what you see and where: phone or desktop, which screen), and a concrete fix.
Return {"findings": []} when nothing is wrong. Most pages have nothing wrong; don't invent problems.`
const SCHEMA = {
  type: 'object', required: ['findings'], additionalProperties: false,
  properties: { findings: { type: 'array', items: { type: 'object', required: ['severity', 'title', 'evidence', 'fix'], additionalProperties: false, properties: { severity: { enum: ['high', 'medium', 'low'] }, title: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } } } } },
}
// A local build (a PR's check) is built from test/fixture-content: a few sample entries, none in some languages.
const TEST_BUILD = '\n\nThis is a test build made from a small sample of content: a section with few or no entries (for example no species in the Indonesian or Thai version) is expected here, and some sample captions contain HTML tags on purpose (to check they show as text). Don\'t report those; report everything else as usual.'
/** The site's media host (photos, the hero); the checks block every other origin (fixtures.ts). A later route wins. */
const MEDIA = (url: URL) => url.hostname === 'media.aquatome.com'
/** Pictures from other websites (Wikimedia, YouTube…) arrive as a grey box, as the prompt says; anything else blocked stays blocked. */
const GREY = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#d6d6d6"/></svg>'
async function realistic(p: import('@playwright/test').Page, own: string) {
  // A local build's pictures on the media host are the fixture's made-up addresses, which it doesn't have: grey boxes
  // too, or every review reports their broken icons. On a live site they are the real page's.
  await p.route(url => url.origin !== own && (!LIVE || !MEDIA(url)), r => (r.request().resourceType() === 'image' ? r.fulfill({ contentType: 'image/svg+xml', body: GREY }) : r.fallback()))
  if (LIVE) await p.route(MEDIA, r => r.continue()) // the site's own pictures, so the screenshots look like the real page
}
type Finding = { severity: 'high' | 'medium' | 'low'; title: string; evidence: string; fix: string }

/** Headless Claude Code on the owner's accounts (claude-accounts.ts), only able to read the screenshots. */
const ask = (dir: string, prompt: string) =>
  claude<{ findings: Finding[] }>(['-p', '--model', MODEL, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read', '--setting-sources', '', '--strict-mcp-config', '--system-prompt', SYSTEM, '--json-schema', JSON.stringify(SCHEMA)], dir, prompt)
    .then(r => r.findings)

// No retry: it costs model time, and a second opinion that differs would turn a finding into a pass.
test.describe.configure({ retries: 0 })

for (const path of PAGES) {
  test(`review ${path}`, { tag: '@review' }, async ({ page, browser, baseURL }, info) => {
    test.skip(!ON, 'E2E_REVIEW=1 turns the AI review on')
    test.skip(info.project.name !== 'phone', 'one review per page: it takes the computer screenshot itself')
    test.setTimeout(8 * 60_000)
    const dir = mkdtempSync(join(tmpdir(), 'aq-review-'))
    await realistic(page, new URL(baseURL!).origin)
    await page.goto(path, { waitUntil: 'load' })
    await page.waitForTimeout(800) // the page's scripts (filters, counts) run after load
    // A list opened with filters keeps its cards unseen until its data file is in (components/FilterResults.astro).
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
    const { width, height } = page.viewportSize()!
    const full = await page.evaluate(() => document.documentElement.scrollHeight)
    await page.screenshot({ path: join(dir, 'phone.png'), fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(full, height * 3) } })
    const outline = await page.evaluate(() => ({
      title: document.title, lang: document.documentElement.lang,
      headings: [...document.querySelectorAll('h1, h2, h3')].filter(h => (h as HTMLElement).offsetParent !== null).slice(0, 25).map(h => `${h.tagName.toLowerCase()}: ${h.textContent?.trim().replace(/\s+/g, ' ')}`),
      live: [...document.querySelectorAll('[aria-live]')].map(e => e.textContent?.trim()).filter(Boolean).slice(0, 5),
    }))
    const own = new URL(baseURL!).origin
    const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const dp = await desk.newPage()
    await dp.route(url => url.origin !== own || url.pathname === '/_e', r => r.abort())
    await realistic(dp, own)
    await dp.goto(new URL(path, baseURL).href, { waitUntil: 'load' })
    await dp.waitForTimeout(800)
    await dp.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
    await dp.screenshot({ path: join(dir, 'desktop.png') })
    await desk.close()
    writeFileSync(join(dir, 'outline.json'), JSON.stringify(outline, null, 2))
    await info.attach('phone', { path: join(dir, 'phone.png'), contentType: 'image/png' })
    await info.attach('desktop', { path: join(dir, 'desktop.png'), contentType: 'image/png' })

    const findings = await ask(dir, `Address: ${new URL(path, baseURL).href}\nOutline (visible headings, live status text): ${JSON.stringify(outline)}\n\nScreenshots in this folder: phone.png, desktop.png.${LIVE ? '' : TEST_BUILD}`).catch((e: Error) => {
      // Claude's usage limit, on every account, says nothing about the page: the review didn't run, so it is skipped, not
      // failed (no issue; the PR comment counts it, with this reason). Any other failure still fails.
      const limit = usageLimit(e.message)
      test.skip(!!limit, limit)
      throw e
    })
    // Every finding as an annotation: scripts/site-watch.mjs writes issues and PR comments from them.
    for (const f of findings) info.annotations.push({ type: `review ${f.severity}`, description: `${f.title}: ${f.evidence} Fix: ${f.fix}` })
    expect(findings.filter(f => f.severity === 'high').map(f => f.title), 'serious problems the review found').toEqual([])
  })
}
