import { expect, test, vi } from 'vitest'
import { post, read, summarise } from '../../../scripts/daily-report.mjs'
import { parseGitHubSide } from '../worker/daily/github'

// The collector, on GitHub's JSON as its REST API gives it: no network.
const REPO = 'deathemperor/aquatome.com'
const URL_ = `https://github.com/${REPO}`
const NOW = new Date('2026-11-06T00:00:00Z')
const ago = (h: number, m = 0) => new Date(NOW.getTime() - (h * 3_600_000 + m * 60_000)).toISOString().replace('.000', '')
let nextId = 1000
const run = (o: Record<string, unknown>) => {
  const id = nextId++
  const created = (o.created_at as string) ?? ago(1)
  return { id, name: 'A workflow', display_title: 'A title', status: 'completed', conclusion: 'success', event: 'push', head_sha: 'f698ac6aaaaaaa', run_number: id, created_at: created, updated_at: created, html_url: `${URL_}/actions/runs/${id}`, ...o }
}
const pr = (number: number, o: Record<string, unknown> = {}) => ({ number, title: `PR ${number}`, html_url: `${URL_}/pull/${number}`, draft: false, merged_at: null, ...o })
const commit = (message: string, date = ago(1)) => ({ commit: { message, committer: { date } } })
const bot = { login: 'github-actions[bot]' }
const issue = (number: number, title: string, labels: string[] = ['site-check'], user = bot) => ({ number, title, html_url: `${URL_}/issues/${number}`, user, labels: labels.map(name => ({ name })) })

const raw = (o: Record<string, unknown> = {}) => ({ runs: {}, jobs: {}, commits: [], closed: [], files: {}, open: [], issues: [], missing: [], ...o })
const sum = (o: Record<string, unknown> = {}) => summarise(raw(o), { now: NOW, runId: '777', runUrl: `${URL_}/actions/runs/777` })

test('product changes of the last 24 hours\' merged pull requests, newest first: no number, title or link of theirs; closed unmerged and older ones left out', () => {
  const section = (line: string) => `## Summary\nWhy.\n\n## Changelog\n- ${line}\n`
  const s = sum({
    closed: [
      pr(1, { merged_at: ago(3), title: 'feat(comments): photos', body: section('Site: Readers can attach one photo to a comment.') }),
      pr(2, { merged_at: ago(1), title: 'feat(ios): the Tìm home lists what\'s new', body: null }),
      pr(3, { title: 'feat: never merged', body: section('Site: Not merged.') }),
      pr(4, { merged_at: ago(25), title: 'feat: too old', body: section('Site: Too old.') }),
      pr(5, { merged_at: ago(2), title: 'ci(ios): x', body: null }),
    ],
    files: { 2: ['apps/ios/AquaTome/Home.swift'] },
  })
  expect(s.changes).toEqual([
    { area: 'App', text: 'The Tìm home lists what\'s new.', at: ago(1) },
    { area: 'Site', text: 'Readers can attach one photo to a comment.', at: ago(3) },
  ])
  expect(s).not.toHaveProperty('merged')
})

test('deploys: runs and failures of the last 24 hours, the live version from the last that succeeded', () => {
  const live = run({ created_at: ago(30), conclusion: 'success', head_sha: 'abc1234ffff' })
  const s = sum({ runs: { 'deploy.yml': [run({ conclusion: 'failure', created_at: ago(2) }), run({ conclusion: 'cancelled', created_at: ago(3) }), run({ conclusion: null, status: 'in_progress', created_at: ago(1) }), live] } })
  expect(s.deploys).toEqual({ runs: 2, failed: 1, live: { sha: 'abc1234', url: live.html_url, at: live.created_at } })
  expect(sum({ runs: { 'deploy.yml': [run({ conclusion: 'failure' })] } }).deploys.live).toBeUndefined()
})

test('the engine: a cycle is a run of over 10 minutes; the hourly check that finds none due is no run, and no success', () => {
  const cycle = (at: number) => run({ created_at: ago(at), updated_at: ago(at - 1) })
  const check = (at: number) => run({ created_at: ago(at), updated_at: ago(at, -1) })
  const failed = run({ conclusion: 'failure', name: 'Engine: content cycle every 3 h', created_at: ago(5), updated_at: ago(5, -2) })
  // Newest first: two checks after the failed cycle, a cycle before it.
  const s = sum({ runs: { 'engine.yml': [check(1), check(2), failed, cycle(8)] } })
  expect(s.engine).toEqual({ runs: 2, failed: 1 })
  expect(s.failing).toEqual([{ workflow: 'Engine: content cycle every 3 h', url: failed.html_url, since: failed.created_at, failures: 1 }])
  // A cycle that passed afterwards clears it.
  expect(sum({ runs: { 'engine.yml': [cycle(2), check(3), failed] } }).failing).toEqual([])
})

test('content commits on main, by part: dates dropped, other commits left out', () => {
  const s = sum({ commits: [commit('content: engine pages 2026-11-05'), commit('content: engine pages 2026-11-05\n\nbody'), commit('content: videos 2026-11-05'), commit('content: owner video picks (JJ Aquariums)'), commit('engine: pages records 2026-11-05'), commit('feat: x')] })
  expect(s.commits).toEqual({ total: 4, parts: [{ name: 'engine pages', n: 2 }, { name: 'videos', n: 1 }, { name: 'owner video picks (JJ Aquariums)', n: 1 }] })
})

test('a workflow failing on main with no later success: since its first failure, linking its newest; a later success, or none at all, is no failure', () => {
  const newest = run({ conclusion: 'failure', name: 'iOS app: build and tests', created_at: ago(40) })
  const first = run({ conclusion: 'timed_out', created_at: ago(60) })
  const s = sum({ runs: {
    'ios.yml': [run({ status: 'in_progress', conclusion: null }), run({ conclusion: 'cancelled', created_at: ago(2) }), newest, first, run({ created_at: ago(70) })],
    'ci.yml': [run({ created_at: ago(1) }), run({ conclusion: 'failure', created_at: ago(2) })],
    'watch.yml': [],
  } })
  expect(s.failing).toEqual([{ workflow: 'iOS app: build and tests', url: newest.html_url, since: first.created_at, failures: 2 }])
})

test('the Mac\'s engine reports only failures: one counts for 24 hours, by part, until a later commit of that part', () => {
  const part = (p: string, at: number) => run({ conclusion: 'failure', display_title: `Engine on the Mac: ${p} failed`, created_at: ago(at) })
  const photos = part('photos', 3)
  const s = sum({
    runs: { 'engine-mac.yml': [photos, part('photos', 5), part('sf', 6), part('pages', 30)] },
    // sf has run since it failed; the photos commit is older than its failure.
    commits: [commit('content: engine sf 2026-11-05', ago(2)), commit('content: engine photos 2026-11-05', ago(10))],
  })
  expect(s.failing).toEqual([{ workflow: 'Engine on the Mac: photos failed', url: photos.html_url, since: ago(5), failures: 2 }])
  expect(s.engine).toEqual({ runs: 0, failed: 0 })
})

test('the iOS app: runs on main, TestFlight uploads by build number from the job that uploads, App Store runs', () => {
  const up = run({ run_number: 184, created_at: ago(2) })
  const old = run({ run_number: 180, created_at: ago(30) })
  const none = run({ run_number: 183, created_at: ago(3) })
  const bad = run({ run_number: 182, conclusion: 'failure', created_at: ago(4) })
  const s = sum({
    runs: { 'ios.yml': [run({ conclusion: 'failure' }), run({})], 'testflight.yml': [up, none, bad, old], 'app-store.yml': [run({ conclusion: 'failure', event: 'workflow_dispatch' })] },
    jobs: {
      [up.id]: [{ name: "iOS app: decide whether to upload", conclusion: 'success' }, { name: 'iOS app: sign and upload to TestFlight', conclusion: 'success' }],
      [none.id]: [{ name: 'iOS app: sign and upload to TestFlight', conclusion: 'skipped' }],
      [bad.id]: [{ name: 'iOS app: sign and upload to TestFlight', conclusion: 'failure' }],
      [old.id]: [{ name: 'iOS app: sign and upload to TestFlight', conclusion: 'success' }],
    },
  })
  expect(s.ios).toEqual({ runs: 2, failed: 1 })
  expect(s.testflight).toEqual({ uploads: [{ build: 184, url: up.html_url, at: up.created_at }], failed: 1 })
  expect(s.appStore).toEqual({ runs: 1, failed: 1 })
})

test('live checks; open issues the workflows opened, problems apart from the review\'s notes; open pull requests, drafts and ready', () => {
  const s = sum({
    runs: { 'watch.yml': [run({ conclusion: 'failure' }), run({}), run({ conclusion: 'skipped' })] },
    issues: [issue(1, 'Deploy failed'), issue(2, "iOS: main's run failed", ['ios-main-red']), issue(3, 'Review notes: /ca/', ['page-review']), issue(4, 'Backlog', ['backlog'], { login: 'someone' }), { ...issue(5, 'A PR'), pull_request: {} }],
    open: [pr(10), pr(11, { draft: true }), pr(12, { draft: true })],
  })
  expect(s.watch).toEqual({ runs: 2, failed: 1 })
  expect(s.issues.items.map((i: { title: string }) => i.title)).toEqual(['Deploy failed', "iOS: main's run failed"])
  expect(s.notes).toBe(1)
  expect(s.prs.ready.total).toBe(1)
  expect(s.prs.draft).toMatchObject({ total: 2 })
  expect(s.prs.draft.items[0].url).toBe(`${URL_}/pull/11`)
})

test('what the collector sends is what the Worker reads, long lists and long titles too', () => {
  const many = Array.from({ length: 80 }, (_, i) => pr(i + 1, { title: 'x'.repeat(500), merged_at: ago(1), body: `## Changelog\n- Site: ${i} ${'é'.repeat(400)}\n- App: ${i} ${'ạ'.repeat(400)}` }))
  const s = sum({ closed: many, open: many, issues: Array.from({ length: 80 }, (_, i) => issue(i + 1, 'y'.repeat(500))), runs: { 'deploy.yml': [run({ head_sha: 'abc1234ffff', created_at: ago(1) })], 'testflight.yml': [] }, commits: [commit('content: engine pages 2026-11-05')], missing: ['x'] })
  expect(s.changes).toHaveLength(100)
  expect(s.changes[0].text).toHaveLength(300)
  expect(s.issues.total).toBe(80)
  const body = JSON.stringify(s)
  expect(new TextEncoder().encode(body).length).toBeLessThan(128 * 1024)
  expect(parseGitHubSide(body)).toEqual(s)
})

test('read: asks GitHub for main\'s runs, drops a pull request\'s, reads the jobs of recent TestFlight runs only, and pages the open lists', () => {
  const asked: string[] = []
  const recent = run({ created_at: ago(1), run_number: 9 })
  const old = run({ created_at: ago(40) })
  const fullPage = Array.from({ length: 100 }, (_, i) => issue(i, 'x'))
  const api = (path: string) => {
    asked.push(path)
    if (path.endsWith('/actions/workflows?per_page=100')) return { workflows: [{ path: '.github/workflows/testflight.yml', state: 'active' }, { path: '.github/workflows/gone.yml', state: 'disabled_manually' }, { path: 'dynamic/pages/x', state: 'active' }] }
    if (path.includes('/testflight.yml/runs')) return { workflow_runs: [recent, old, run({ event: 'pull_request', created_at: ago(1) })] }
    if (path.includes('/jobs')) return { jobs: [{ name: 'upload', conclusion: 'success' }] }
    if (path.includes('/issues?')) return path.endsWith('page=1') ? fullPage : [issue(100, 'y')]
    return []
  }
  const r = read(api, REPO, NOW)
  expect(asked).toContain(`repos/${REPO}/actions/workflows/testflight.yml/runs?branch=main&per_page=100`)
  expect(asked.filter(p => p.includes('gone.yml') || p.includes('dynamic'))).toEqual([])
  expect(r.runs['testflight.yml']).toHaveLength(2)
  expect(Object.keys(r.jobs)).toEqual([String(recent.id)])
  expect(r.issues).toHaveLength(101)
  expect(r.missing).toEqual([])
  expect(asked).toContain(`repos/${REPO}/commits?sha=main&since=${new Date(NOW.getTime() - 86_400_000).toISOString()}&per_page=100`)
  expect(summarise(r, { now: NOW, runId: '1', runUrl: `${URL_}/actions/runs/1` }).testflight.uploads).toEqual([{ build: 9, url: recent.html_url, at: recent.created_at }])
})

test('read: the files of a merged pull request only when its title falls back (no Changelog section, a feat or fix), every page', () => {
  const asked: string[] = []
  const closed = [
    pr(1, { merged_at: ago(1), title: 'feat(ios): x', body: null }),
    pr(2, { merged_at: ago(2), title: 'feat(ios): y', body: '## Changelog\n- App: Y.' }),
    pr(3, { merged_at: ago(3), title: 'docs: z', body: null }),
    pr(4, { merged_at: ago(30), title: 'fix: old', body: null }),
    pr(5, { title: 'fix: closed unmerged', body: null }),
  ]
  const api = (path: string) => {
    asked.push(path)
    if (path.includes('/pulls?state=closed')) return closed
    if (path.includes('/pulls/1/files')) return path.endsWith('page=1') ? Array.from({ length: 100 }, (_, i) => ({ filename: `apps/site/f${i}.ts` })) : [{ filename: 'apps/ios/A.swift' }]
    if (path.includes('workflows?')) return { workflows: [] }
    return []
  }
  const r = read(api, REPO, NOW)
  expect(asked.filter(p => p.includes('/files'))).toEqual([`repos/${REPO}/pulls/1/files?per_page=100&page=1`, `repos/${REPO}/pulls/1/files?per_page=100&page=2`])
  expect(r.files[1]).toHaveLength(101)
  expect(summarise(r, { now: NOW, runId: '1', runUrl: `${URL_}/actions/runs/1` }).changes).toEqual([{ area: 'App', text: 'X.', at: ago(1) }, { area: 'App', text: 'Y.', at: ago(2) }])
  // Files GitHub won't give: named, and the line still made from the title (the site's, for want of the files).
  const down = read((path: string) => { if (path.includes('/files')) throw new Error('HTTP 502'); return api(path) }, REPO, NOW)
  expect(down.missing).toEqual(['the files of pull request 1'])
  expect(summarise(down, { now: NOW, runId: '1', runUrl: `${URL_}/actions/runs/1` }).changes[0]).toEqual({ area: 'Site', text: 'X.', at: ago(1) })
})

test('read: what GitHub won\'t give is named, never counted as none', () => {
  const api = (path: string) => {
    if (path.includes('/issues?')) throw new Error('HTTP 502')
    if (path.includes('workflows?')) return { workflows: [{ path: '.github/workflows/deploy.yml', state: 'active' }] }
    if (path.includes('deploy.yml/runs')) throw new Error('HTTP 502')
    return []
  }
  const r = read(api, REPO, NOW)
  expect(r.missing).toEqual(['runs of deploy.yml', 'the open issues'])
  expect(summarise(r, { now: NOW, runId: '1', runUrl: `${URL_}/actions/runs/1` }).missing).toEqual(['runs of deploy.yml', 'the open issues'])
})

const answer = (status: number, body = '{}') => new Response(body, { status })
const quiet = () => ({ sleep: vi.fn(async () => {}), log: vi.fn() })

test('post: once to the site with the dashboard token; retries what may pass, as deploy.sh does; fails if it still refuses', async () => {
  const q = quiet()
  const fetchFn = vi.fn(async () => answer(200, '{"sent":true}'))
  expect(await post({ runId: '1' }, { token: 'tok', fetchFn, ...q })).toBe(true)
  expect(fetchFn).toHaveBeenCalledTimes(1)
  const [url, init] = fetchFn.mock.calls[0]! as unknown as [string, RequestInit]
  expect(url).toBe('https://aquatome.com/_ab/report')
  expect(init.method).toBe('POST')
  expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok')
  expect(init.body).toBe('{"runId":"1"}')
  expect(q.sleep).not.toHaveBeenCalled()

  // A 5xx, then no answer, then taken: the same body each time (its run id keeps it from sending twice).
  const r = quiet()
  const flaky = vi.fn().mockResolvedValueOnce(answer(502)).mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(answer(200))
  expect(await post({ runId: '1' }, { token: 'tok', fetchFn: flaky, ...r })).toBe(true)
  expect(flaky).toHaveBeenCalledTimes(3)
  expect(r.sleep.mock.calls.map(c => (c as unknown[])[0])).toEqual([30_000, 60_000])

  // Still refused after three: the job fails.
  const s = quiet()
  const down = vi.fn(async () => answer(503))
  expect(await post({}, { token: 'tok', fetchFn: down, ...s })).toBe(false)
  expect(down).toHaveBeenCalledTimes(3)
  expect(s.sleep).toHaveBeenCalledTimes(2)

  // 409: another try in progress, or sent but not logged. Worth waiting for; then the job fails.
  const t = quiet()
  const busy = vi.fn(async () => answer(409))
  expect(await post({}, { token: 'tok', fetchFn: busy, ...t })).toBe(false)
  expect(busy).toHaveBeenCalledTimes(3)
})

test('post: a refusal that won\'t change ends it at once', async () => {
  for (const status of [400, 401, 403, 404, 413]) {
    const q = quiet()
    const fetchFn = vi.fn(async () => answer(status))
    expect(await post({}, { token: 'tok', fetchFn, ...q }), String(status)).toBe(false)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(q.sleep).not.toHaveBeenCalled()
  }
})
