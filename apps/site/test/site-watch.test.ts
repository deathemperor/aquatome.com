import { expect, test } from 'vitest'
import { checks, prComment, sitemapPages } from '../../../scripts/site-watch.mjs'

// One page's review in Playwright's JSON report, shaped as a real run writes it (ci.yml runs the phone project only).
const LIMIT = "Claude usage limit: You've hit your weekly limit · resets Nov 5, 6am (UTC)"
type Note = { type: string; description: string }
const review = (path: string, status: 'expected' | 'unexpected' | 'skipped', annotations: Note[] = [], error?: string) => ({
  title: `review ${path}`, file: 'review.spec.ts', tags: ['review'],
  tests: [{ projectName: 'phone', expectedStatus: 'passed', status, annotations, results: [{ status: status === 'expected' ? 'passed' : status === 'skipped' ? 'skipped' : 'failed', annotations, ...(error ? { error: { message: error } } : {}) }] }],
})
const limited = (path: string) => review(path, 'skipped', [{ type: 'skip', description: LIMIT }])
const passed = (path: string, notes: Note[] = []) => review(path, 'expected', notes)
const body = (...specs: ReturnType<typeof review>[]) => prComment(checks({ suites: [{ title: 'review.spec.ts', specs }] }), 'RUN')

test('pr-comment: every review stopped by the usage limit is no review, and says why', () => {
  // PRs #381 and #382 read "11 pages reviewed on the fixture build. Nothing serious found." with no page reviewed.
  expect(body(limited('/vi/'), limited('/vi/ca/'))).toBe(['### AI page review (advisory)', '', 'No page was reviewed.', `2 reviews did not run: ${LIMIT}`, '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: some reviewed, some stopped by the limit', () => {
  const note = { type: 'review medium', description: 'Empty section: phone, screen 2. Fix: hide it.' }
  expect(body(passed('/vi/', [note]), passed('/id/'), limited('/vi/ca/'))).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', `1 review did not run: ${LIMIT}`, '', `- medium, review /vi/: ${note.description}`, '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: every page reviewed, nothing serious', () => {
  expect(body(passed('/vi/'), passed('/id/'))).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', '', 'Nothing serious found.', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: a review that failed on its findings was reviewed; one that failed on another error was not', () => {
  const high = review('/vi/ca/?q=neon', 'unexpected', [{ type: 'review high', description: 'Results below the fold' }], 'Error: serious problems the review found')
  const broken = review('/th/', 'unexpected', [], 'Error: claude failed (1): Invalid API key · Please run /login\n    at ask')
  expect(body(passed('/vi/'), high, broken)).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', '1 review did not run: phone: Error: claude failed (1): Invalid API key · Please run /login', '', '- **high**, review /vi/ca/?q=neon: Results below the fold', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('report: a review stopped by the limit neither fails nor passes, so its issue is left as it is', () => {
  const [c] = checks({ suites: [{ title: 'review.spec.ts', specs: [limited('/vi/')] }] })
  expect(c).toMatchObject({ failed: [], passed: [], notes: [], highs: [] })
})

test('the pages a site offers: through the index of its sitemaps, or an older build\'s plain list', async () => {
  const files: Record<string, string> = {
    '/sitemap.xml': '<sitemapindex><sitemap><loc>https://aquatome.com/sitemap-fish.xml</loc></sitemap><sitemap><loc>https://aquatome.com/sitemap-other.xml</loc></sitemap></sitemapindex>',
    '/sitemap-fish.xml': '<urlset><url><loc>https://aquatome.com/ca/x/</loc><lastmod>2026-11-01</lastmod></url></urlset>',
    '/sitemap-other.xml': '<urlset><url><loc>https://aquatome.com/</loc></url></urlset>',
  }
  const get = (async (u: URL) => new Response(files[u.pathname])) as typeof fetch
  expect(await sitemapPages('https://aquatome.com', get)).toEqual(['/ca/x/', '/'])
  files['/sitemap.xml'] = '<urlset><url><loc>https://aquatome.com/old/</loc></url></urlset>'
  expect(await sitemapPages('https://aquatome.com', get)).toEqual(['/old/'])
})
