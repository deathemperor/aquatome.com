import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { checkedPage, checks, prComment, sitemapPages, lateDeploy, goesLive, DEPLOY_PATHS, waitingCommits } from '../../../scripts/site-watch.mjs'

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
  expect(body(limited('/vi/'), limited('/vi/ca/'))).toBe(['### AI page review (advisory)', '', 'No page was reviewed.', `2 reviews did not run: ${LIMIT}`, '**This is not a pass: 2 of 2 pages were not reviewed.**', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: some reviewed, some stopped by the limit', () => {
  const note = { type: 'review medium', description: 'Empty section: phone, screen 2. Fix: hide it.' }
  expect(body(passed('/vi/', [note]), passed('/id/'), limited('/vi/ca/'))).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', `1 review did not run: ${LIMIT}`, '**This is not a pass: 1 of 3 pages was not reviewed.**', '', `- medium, review /vi/: ${note.description}`, '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: reviews stopped by their own daily ceiling say so in plain words, and the rest never reads as a clean pass', () => {
  const CEILING = "Today's ceiling for the page review is reached ($0.52 spent by this run, of the $0.50 left for today), so the call was not made"
  const capped = (path: string) => review(path, 'skipped', [{ type: 'skip', description: CEILING }])
  expect(body(passed('/vi/'), passed('/ms/'), capped('/id/'), capped('/th/'))).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', `2 reviews did not run: ${CEILING}`, '**This is not a pass: 2 of 4 pages were not reviewed.**', '', 'Nothing serious found on the 2 reviewed.', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
  expect(body(capped('/vi/'))).toBe(['### AI page review (advisory)', '', 'No page was reviewed.', `1 review did not run: ${CEILING}`, '**This is not a pass: 1 of 1 pages was not reviewed.**', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: every page reviewed, nothing serious', () => {
  expect(body(passed('/vi/'), passed('/id/'))).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', '', 'Nothing serious found.', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
})

test('pr-comment: a review that failed on its findings was reviewed; one that failed on another error was not', () => {
  const high = review('/vi/ca/?q=neon', 'unexpected', [{ type: 'review high', description: 'Results below the fold' }], 'Error: serious problems the review found')
  const broken = review('/th/', 'unexpected', [], 'Error: claude failed (1): Invalid API key · Please run /login\n    at ask')
  expect(body(passed('/vi/'), high, broken)).toBe(['### AI page review (advisory)', '', '2 pages reviewed on the fixture build.', '1 review did not run: phone: Error: claude failed (1): Invalid API key · Please run /login', '**This is not a pass: 1 of 3 pages was not reviewed.**', '', '- **high**, review /vi/ca/?q=neon: Results below the fold', '', '[run](RUN) · docs/governance.md, layer 3'].join('\n'))
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

test('changes waiting for a deploy are late at 3 hours, counted from the oldest', () => {
  const now = Date.parse('2026-11-10T10:00:00Z')
  expect(lateDeploy([], now)).toBeNull()
  expect(lateDeploy(['2026-11-10T07:01:00Z', '2026-11-10T09:00:00Z'], now)).toBeNull()
  expect(lateDeploy(['2026-11-10T06:30:00Z', '2026-11-10T09:00:00Z'], now)).toEqual({ hours: 3, changes: 2 })
})

// The engine's pushes change content/page-dates.json and change it back, so GitHub starts no deploy for them, and the
// commits that touched it are not waiting for one: they raised "No deploy has finished for 5 hours" (2026-11-12, #1150).
test('changes wait for a deploy only when, taken together, they change what deploy.yml deploys', () => {
  expect(goesLive(['engine-state/fit-summary.json', 'sources/x.json', 'packages/engine/src/a.ts'])).toBe(false)
  expect(goesLive(['pnpm-lock.yaml.bak'])).toBe(false)
  for (const f of ['content/page-dates.json', 'apps/site/src/x.astro', 'packages/schema/src/langs.ts', 'pnpm-lock.yaml']) expect(goesLive([f]), f).toBe(true)
  const yml = readFileSync(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8')
  expect(DEPLOY_PATHS).toEqual(/paths: \[(.*)\]/.exec(yml)![1]!.split(',').map(s => s.trim().replace(/'/g, '').replace(/\*\*$/, '')))
})

// waitingCommits reads the last deploy and main against it. The stub answers those gh calls; the commit list is what
// the shortcut skips when it decides nothing is waiting.
const DATE = '2026-11-12T04:00:00Z'
type Changed = { filename: string; previous_filename?: string }
const waiting = (compare: { status: string; files: Changed[] } | 'bad') => waitingCommits((...a: string[]) => {
  if (a[0] === 'run') return 'deployed\n'
  const spec = a.join(' ')
  if (spec.includes('/compare/')) {
    if (compare === 'bad') throw new Error('compare failed')
    const jq = a[a.indexOf('--jq') + 1] ?? ''
    // Filenames alone drop a rename's old path and whether the last deploy is an ancestor.
    if (!jq.includes('status')) return JSON.stringify(compare.files.map(f => f.filename))
    return JSON.stringify({ status: compare.status, files: compare.files.map(f => ({ filename: f.filename, previous_filename: f.previous_filename ?? null })) })
  }
  if (spec.includes('per_page=100')) return JSON.stringify([{ sha: 'later', commit: { committer: { date: DATE } } }])
  if (spec.includes('/commits/')) return '2026-11-12T00:00:00Z\n'
  throw new Error(`unexpected gh ${spec}`)
})

test('a change that was changed back leaves nothing waiting when no deploy path differs', () => {
  // content/page-dates.json was edited and reverted, so the compare does not list it. A backup of the lockfile is not the lockfile.
  expect(waiting({ status: 'ahead', files: [{ filename: 'engine-state/fit-summary.json' }, { filename: 'sources/x.json' }] })).toEqual([])
  expect(waiting({ status: 'ahead', files: [{ filename: 'pnpm-lock.yaml.bak' }] })).toEqual([])
})

test('a rename out of a deploy path is still waiting', () => {
  expect(waiting({ status: 'ahead', files: [{ filename: 'docs/moved.ts', previous_filename: 'apps/site/moved.ts' }] })).toEqual([DATE])
})

test('a baseline that is not an ancestor of main falls through to the commit count', () => {
  expect(waiting({ status: 'diverged', files: [{ filename: 'engine-state/fit-summary.json' }] })).toEqual([DATE])
  expect(waiting('bad')).toEqual([DATE])
})

test('300 changed files or more fall through to the commit count', () => {
  const files = Array.from({ length: 300 }, (_, i) => ({ filename: `notes/${i}.txt` }))
  expect(waiting({ status: 'ahead', files })).toEqual([DATE])
})

// 14 Nov 2026: three issues for /ms/tumbuhan/cryptocoryne-spiralis-red/foto/ recorded their page as "checks" (from the test
// "page checks /ms/…"), so the recheck never found it and they stayed open after the page was fixed.
test("each check's page is read from its name, whatever words come before it in each spec's tests", () => {
  expect(checkedPage('page checks /ms/tumbuhan/cryptocoryne-spiralis-red/foto/')).toBe('/ms/tumbuhan/cryptocoryne-spiralis-red/foto/')
  expect(checkedPage('page /ms/tumbuhan/x/ @phone')).toBe('/ms/tumbuhan/x/')
  expect(checkedPage('review /vi/ca/?q=neon')).toBe('/vi/ca/?q=neon')
  expect(checkedPage('lighthouse /')).toBe('/')
  expect(checkedPage('Site checks did not run')).toBeUndefined()
  // Every test the live checks name after a page, in every spec, as the specs write their names.
  const e2e = new URL('../e2e/', import.meta.url)
  const named = ['invariants.spec.ts', 'review.spec.ts', 'lighthouse.spec.ts'].flatMap(f => [...readFileSync(new URL(f, e2e), 'utf8').matchAll(/test\(`([^`$]+) \$\{path\}`/g)].map(m => m[1]!))
  expect(named.length).toBeGreaterThanOrEqual(4)
  for (const words of named) expect(checkedPage(`${words} /th/fish/x/`), words).toBe('/th/fish/x/')
})
