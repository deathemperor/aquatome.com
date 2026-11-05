import { expect, test } from 'vitest'
import { lastDays } from '../admin/chart'
import { summariseApp, type AppDay } from '../admin/app'
import type { Overview } from '../admin/pages'
import { compose, dashLink, highlights, needsCare, siteStats, type ComposeInput, type Stat } from '../daily/compose'
import { parseGitHubSide, type GitHubSide } from '../daily/github'
import * as S from './owner-sample'

const NOW = new Date('2026-11-06T00:00:00Z') // 07:00 in Vietnam
const TZ = 'Asia/Ho_Chi_Minh'
const REPO = 'https://github.com/deathemperor/aquatome.com'
const none = { requests: 0, calls: 0, ok: 0, none: 0, blocked: 0, tin: 0, tout: 0, usd: 0, guessed: 0, linked: 0 }
const KEY = { n: 1, hash: 'aaaa1111', workspace: false, state: 'ok' as const, calls: 0, answered: 0 }

/** Every part of the overview loaded, nothing waiting, no days counted. */
function quiet(now = NOW): Overview {
  const days = lastDays(now, 31, TZ)
  const z = days.slice(1).map(() => 0)
  return {
    now, tz: TZ, readers: [], clicks: { days, clicks: days.map(() => 0) },
    fish: { days: days.slice(1), perDay: { ok: z, none: z, blocked: z, usd: z, tin: z, tout: z }, unmatched: [], recent: [], periods: { today: none, yesterday: none, last30: none, d7: none, d7prev: none, d30: none, d30prev: none, mtd: none, mtdPrev: none } },
    keys: { rows: [KEY], bad: 0, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }, mostRefunds: 0 },
    photos: 3, waiting: { comments: 0, photos: 0, oldest: null }, wanted: { names: [], more: false }, hidden: {},
    accounts: { days: days.slice(1), users: 5, newUsers: z, synced: 2, openSessions: 1, credentials: [], comments: [], newComments: z },
    content: { engine: { needsHuman: [], sources: [], videos: { waiting: 0, writtenAt: [] } }, inventory: {} } as unknown as Overview['content'],
    snapshots: [],
  }
}
const noApp: AppDay = { ...summariseApp({ views: [], actions: [], errors: [], shops: [], health: [], perf: [] }, false), sessions: 0 }
const runs = (n = 0, failed = 0) => ({ runs: n, failed })
const nothing = { total: 0, items: [] }
function gh(over: Partial<GitHubSide> = {}): GitHubSide {
  return {
    runId: '1001', runUrl: `${REPO}/actions/runs/1001`, since: '2026-11-05T00:00:00Z', missing: [], merged: nothing,
    deploys: runs(), engine: runs(), commits: { total: 0, parts: [] }, ios: runs(), testflight: { uploads: [], failed: 0 }, appStore: runs(), watch: runs(),
    failing: [], issues: nothing, notes: 0, prs: { ready: nothing, draft: nothing }, ...over,
  }
}
const input = (over: Partial<ComposeInput> = {}): ComposeInput => ({ now: NOW, overview: quiet(), app: noApp, gh: gh(), ...over })
const titles = (i: ComposeInput) => needsCare(i).map(c => c.title)

test('a quiet day: nothing needs care, and the subject says so', () => {
  const r = compose(input())
  expect(r.care).toBe(0)
  expect(r.subject).toBe('AquaTome daily · 6 Nov · nothing needs care')
  expect(r.text).toContain('NEEDS CARE: nothing')
  expect(r.text).toContain('No big moves.')
})

test('needs care: failures with no later success, open problem issues and what GitHub would not give come first, each with its link', () => {
  const i = input({ gh: gh({
    failing: [{ workflow: 'Deploy aquatome.com', url: `${REPO}/actions/runs/7`, since: '2026-11-05T15:00:00Z', failures: 2 }],
    missing: ['the open issues'],
    issues: { total: 1, items: [{ number: 576, title: 'Deploy failed', url: `${REPO}/issues/576` }] },
  }) })
  const care = needsCare(i)
  expect(care.map(c => c.title)).toEqual(['Deploy aquatome.com is failing', 'GitHub did not give part of this report', '#576 Deploy failed'])
  expect(care[0]).toMatchObject({ text: '2 failed runs since 05/11 22:00, no success after.', href: `${REPO}/actions/runs/7` })
  expect(care[2]!.href).toBe(`${REPO}/issues/576`)
  const r = compose(i)
  expect(r.subject).toBe('AquaTome daily · 6 Nov · 3 need care')
  expect(r.care).toBe(3)
  expect(r.html).toContain(`href="${REPO}/issues/576"`)
  expect(compose(input({ gh: gh({ issues: { total: 1, items: [{ number: 1, title: 'x', url: `${REPO}/issues/1` }] } }) })).subject).toBe('AquaTome daily · 6 Nov · 1 needs care')
})

test('needs care: every open issue counts, past the ones listed', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ number: i + 1, title: `Check ${i + 1}`, url: `${REPO}/issues/${i + 1}` }))
  const r = compose(input({ gh: gh({ issues: { total: 60, items } }) }))
  expect(r.care).toBe(60)
  expect(r.subject).toContain('60 need care')
  // Twenty listed, then the rest in a line.
  expect(r.text).toContain('20. #20 Check 20')
  expect(r.text).not.toContain('21. #21 Check 21')
  expect(r.text).toContain('and 31 more')
})

test('needs care: a moderation queue only once it is late; past 30 hours the overview\'s to-do says it, once', () => {
  const waiting = (hours: number) => input({ overview: { ...quiet(), waiting: { comments: 2, photos: 0, oldest: new Date(NOW.getTime() - hours * 3_600_000).toISOString() } } })
  expect(titles(waiting(5))).toEqual([])
  expect(needsCare(waiting(7))).toEqual([{ title: 'Moderation is behind', text: '2 comments waiting since 06/11 00:00.', href: '/_ab/tai-khoan/' }])
  expect(needsCare(input({ overview: { ...quiet(), waiting: { comments: 0, photos: 1, oldest: new Date(NOW.getTime() - 7 * 3_600_000).toISOString() } } }))[0]!.href).toBe('/_ab/anh-ban-doc/')
  expect(titles(waiting(31))).toEqual(['Moderation has not run'])
  expect(needsCare(waiting(31))[0]!.href).toContain('/actions/workflows/moderate.yml')
  // Waiting and small, it is a number in the site's table.
  expect(compose(waiting(5)).text).toContain('Comments waiting: 2')
})

test('needs care: fish ID keys, in English', () => {
  const keys = (rows: NonNullable<Exclude<Overview['keys'], { failed: string }>>['rows'], bad = 0) => input({ overview: { ...quiet(), keys: { rows, bad, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0 }, mostRefunds: 0 } } })
  const resting = { ...KEY, state: 'credit' as const, until: '2026-11-06T08:00:00.000Z' }
  expect(needsCare(keys([resting, { ...KEY, n: 2 }]))).toEqual([{ title: '1 Anthropic key resting', text: '#1 out of credit until 06/11 15:00', href: '/_ab/nhan-dien-ca/#key' }])
  expect(titles(keys([resting]))).toEqual(['Fish ID is down: every Anthropic key is resting'])
  expect(titles(keys([KEY], 2))).toEqual(['2 lines of ANTHROPIC_KEYS can\'t be read'])
  expect(titles(input({ overview: { ...quiet(), keys: undefined } }))).toEqual(['Fish ID is off'])
  // The error text stays on the dashboard: a report prints no error it didn't write.
  const failed = needsCare(input({ overview: { ...quiet(), keys: { failed: 'KV down at 203.0.113.9' } } }))[0]!
  expect(failed.title).toBe('Could not read the Anthropic keys\' state')
  expect(JSON.stringify(failed)).not.toContain('203.0.113.9')
})

const VIETNAMESE = /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
test('needs care: the overview\'s to-dos, each of them, in English with the page\'s link', () => {
  const F = { failed: 'x' }
  const failed = { ...S.OVERVIEW, readers: F, clicks: F, fish: F, keys: F, photos: F, waiting: F, wanted: F, accounts: F, hidden: F, content: F, snapshots: F }
  for (const overview of [S.OVERVIEW, failed]) {
    const r = compose({ now: S.NOW, overview, app: noApp, gh: gh() })
    expect(`${r.subject}\n${r.text}\n${r.html}`).not.toMatch(VIETNAMESE)
  }
  expect(titles({ now: S.NOW, overview: S.OVERVIEW, app: noApp, gh: gh() })).toEqual(['1 Anthropic key resting', '2Hr Aquarist needs you to pass a browser check'])
  expect(titles({ now: S.NOW, overview: failed, app: noApp, gh: gh() })).toEqual([
    'Could not read the Anthropic keys\' state', 'Could not load readers', 'Could not load affiliate clicks', 'Could not load the fish ID log', 'Could not load comments and accounts',
    'Could not load the moderation queues', 'Could not load reader photos', 'Could not load the wanted names', 'Could not load the hidden pages', 'Could not load the content totals', 'Could not load the daily content totals',
  ])
})

test('needs care: an app that crashed, by version; telemetry that can\'t load says so', () => {
  const app = { ...S.APP, sessions: 12 }
  expect(needsCare(input({ app }))).toEqual([{ title: 'App: 3 crashes in the last 24 hours', text: '1.0 (114): 3', href: '/_ab/ung-dung/' }])
  expect(titles(input({ app: { failed: 'x' } }))).toEqual(['Could not load the app\'s telemetry'])
})

test('highlights: at most five, the farthest from their baseline, numbers against the 7-day average', () => {
  const stat = (label: string, value: number, base?: number, moves = true): Stat => ({ label, value, base, moves })
  const picked = highlights([
    stat('Flat', 100, 100), stat('Small move', 100, 95), stat('Tiny counts', 3, 1),
    stat('No baseline', 500), stat('Not a move', 900, 10, false),
    stat('Readers', 412, 298), stat('Comments', 12, 2), stat('Clicks', 40, 20), stat('Calls', 90, 40), stat('Accounts', 8, 1), stat('Wanted', 30, 10), stat('Pages', 6, 1),
  ])
  // A big move on a big count beats a bigger percentage on a tiny one: Pages (+500%) and Clicks (+100%) wait.
  expect(picked).toEqual(['Calls 90: +125% vs 7-day avg 40', 'Comments 12: +10 vs 7-day avg 2,0', 'Accounts 8: +7 vs 7-day avg 1,0', 'Readers 412: +38% vs 7-day avg 298', 'Wanted 30: +200% vs 7-day avg 10'])
  expect(highlights([stat('Flat', 100, 100)])).toEqual([])
})

test('site numbers: yesterday against the 7 whole days before it; today, seven hours old, isn\'t counted', () => {
  const o = quiet()
  const clicks = o.clicks as { clicks: number[] }
  clicks.clicks.fill(10)
  clicks.clicks[clicks.clicks.length - 2] = 30 // yesterday
  clicks.clicks[clicks.clicks.length - 1] = 999 // today
  expect(siteStats(o, NOW).find(s => s.label === 'Affiliate clicks')).toMatchObject({ value: 30, base: 10 })
  const r = compose(input({ overview: o }))
  expect(r.text).toContain('Affiliate clicks 30: +200% vs 7-day avg 10')
  expect(r.text).toContain('Affiliate clicks: 30 (7-day avg 10)')
  expect(r.html).toContain('Affiliate clicks')
})

test('site numbers: readers have no baseline from before the count\'s reset', () => {
  const stats = (now: Date) => siteStats({ ...quiet(now), readers: lastDays(now, 31, TZ).map(day => ({ day, sessions: 40, readers: 20 })) }, now).find(s => s.label === 'Readers')!
  // 5 November is the reset's own part of a day: the report of the 6th has nothing to compare with.
  expect(stats(NOW)).toMatchObject({ value: 20, base: undefined })
  expect(compose(input({ overview: { ...quiet(), readers: lastDays(NOW, 31, TZ).map(day => ({ day, sessions: 40, readers: 20 })) } })).text).toContain('Readers: 20 (7-day avg —)')
  expect(stats(new Date('2026-11-08T00:00:00Z'))).toMatchObject({ value: 20, base: 20 })
  expect(stats(new Date('2026-11-16T00:00:00Z'))).toMatchObject({ value: 20, base: 20 })
})

test('built: deploys and the live version, content pushes with what they added, merged PRs listed, app builds', () => {
  const totals = (fish: { vi: number; id: number; th: number }, guide: number, pages: number) => ({ kinds: { fish, guide: { vi: guide, id: 0, th: 0 }, plant: { vi: 3, id: 0, th: 0 } }, built: null, sources: {}, photos: { pages, gallery: 0 } }) as unknown as import('../admin/content').Totals
  const overview = { ...quiet(), snapshots: [{ day: '2026-11-04', totals: totals({ vi: 100, id: 40, th: 30 }, 10, 500) }, { day: '2026-11-05', totals: totals({ vi: 105, id: 42, th: 30 }, 12, 520) }] }
  const { text, html } = compose(input({ overview, gh: gh({
    deploys: { runs: 5, failed: 1, live: { sha: 'abc1234', url: `${REPO}/actions/runs/9`, at: '2026-11-05T20:19:53Z' } },
    engine: { runs: 8, failed: 1 }, commits: { total: 12, parts: [{ name: 'engine pages', n: 7 }, { name: 'videos', n: 5 }] },
    merged: { total: 2, items: [{ number: 575, title: 'docs(research): smart tanks', url: `${REPO}/pull/575` }, { number: 574, title: 'fix: x', url: `${REPO}/pull/574` }] },
    ios: runs(3, 1), testflight: { uploads: [{ build: 184, url: `${REPO}/actions/runs/20`, at: '2026-11-05T17:53:13Z' }, { build: 183, url: `${REPO}/actions/runs/19`, at: '2026-11-05T16:00:00Z' }], failed: 1 }, appStore: runs(1, 0),
    watch: runs(6, 2), notes: 2, prs: { ready: { total: 1, items: [{ number: 562, title: 'test: y', url: `${REPO}/pull/562` }] }, draft: { total: 4, items: [] } },
  }) }))
  expect(text).toContain('Deploys: 5 runs, 1 failed. Live: abc1234, deployed 06/11 03:19.')
  expect(text).toContain('Content pushes: Engine: 8 cycles, 1 failed. 12 content commits (engine pages 7, videos 5).')
  expect(text).toContain('Added 04/11 to 05/11: fish vi +5, id +2; guides vi +2; photos +20 on pages.')
  expect(text).toContain('Merged PRs (2)')
  expect(text).toContain(`- #575 docs(research): smart tanks ${REPO}/pull/575`)
  expect(text).toContain('App builds: ios.yml: 3 runs, 1 failed. TestFlight: 2 uploads (build 184, 183), 1 failed. App Store: 1 run, 0 failed.')
  expect(text).toContain('Live checks: 6 runs, 2 failed. 2 review notes open.')
  expect(text).toContain('Open PRs: 1 ready, 4 draft.')
  expect(html).toContain(`<a href="${REPO}/pull/575"`)
  // Under two nights' totals: no line of made-up nothing.
  expect(compose(input()).text).not.toContain('Added ')
})

test('the app: one line while it has sent nothing; a table once it has', () => {
  const empty = compose(input())
  expect(empty.text).toContain('APP\nno app data yet')
  expect(empty.html).toContain('no app data yet')
  const full = compose(input({ app: { ...S.APP, sessions: 12 } }))
  expect(full.text).not.toContain('no app data yet')
  expect(full.text).toContain('Sessions: 12')
  expect(full.text).toContain('Crashes: 3')
  expect(full.text).toContain('Hangs: 1')
  expect(full.text).toContain('Light connect failures: 5 of 20')
  expect(full.text).toContain('Plug switch failures: 0')
})

test('what a report may carry: no address, no picture, links only to aquatome.com and github.com, what GitHub sent escaped', () => {
  const hostile = 'mail reader.one+x@example.com <script>alert(1)</script> <img src=https://tracker.test/p.gif> see www.tracker.test/x'
  const r = compose({ now: S.NOW, overview: S.OVERVIEW, app: { ...S.APP, sessions: 1 }, gh: gh({
    failing: [{ workflow: hostile, url: `${REPO}/actions/runs/7`, since: '2026-11-03T15:00:00Z', failures: 1 }],
    issues: { total: 1, items: [{ number: 1, title: hostile, url: `${REPO}/issues/1` }] },
    merged: { total: 1, items: [{ number: 2, title: hostile, url: `${REPO}/pull/2` }] },
    commits: { total: 1, parts: [{ name: 'by owner@example.com', n: 1 }] },
    missing: ['a@example.org'],
  }) })
  for (const part of [r.subject, r.text, r.html]) {
    expect(part).not.toMatch(/\S+@\S+\.\S+/)
    expect(part).not.toContain('example.')
  }
  expect(r.html).not.toMatch(/<(?:img|script|style|link|iframe)\b|<[^>]*\bsrc=/i)
  expect(r.html).toContain('&lt;script&gt;')
  // Mail apps link a bare address by themselves: another site's doesn't get that far either.
  for (const part of [r.text, r.html]) expect(part).not.toContain('tracker.test')
  const links = [...r.html.matchAll(/href="([^"]*)"/g)].map(m => m[1]!)
  expect(links.length).toBeGreaterThan(5)
  for (const url of [...links, ...(r.text.match(/https?:\/\/\S+/g) ?? [])]) expect(url).toMatch(/^https:\/\/(?:(?:[a-z]+\.)?aquatome\.com\/|github\.com\/deathemperor\/aquatome\.com\/)/)
  // Comments, names readers typed and photos' names aren't in it: only counts.
  expect(r.text).not.toContain('Cá sặc gấm')
  expect(r.html).not.toContain('Lan')
})

test('every dashboard link goes through one helper', () => {
  const r = compose({ now: S.NOW, overview: S.OVERVIEW, app: { ...S.APP, sessions: 1 }, gh: gh() })
  expect(r.html).toContain(`href="${dashLink('/_ab/nhan-dien-ca/#key')}"`)
  expect(r.html).toContain(`href="${dashLink('/_ab/bao-cao/')}"`)
  expect(r.text).toContain(dashLink('/_ab/ung-dung/'))
  expect(r.html).not.toMatch(/href="\//)
})

test('the workflow\'s body: read strictly, every link this repository\'s', () => {
  const ok = gh({ issues: { total: 1, items: [{ number: 1, title: 'x\u0000y', url: `${REPO}/issues/1` }] } })
  expect(parseGitHubSide(JSON.stringify(ok))?.issues.items[0]!.title).toBe('x y')
  const bad = (o: Record<string, unknown>) => parseGitHubSide(JSON.stringify({ ...ok, ...o }))
  expect(bad({})).not.toBeNull()
  for (const o of [{ runId: 'abc' }, { runId: 12 }, { runUrl: 'https://evil.test/x' }, { runUrl: 'https://github.com.evil.test/deathemperor/aquatome.com/x' }, { runUrl: `${REPO}/x" onclick="y` }, { since: 'soon' }, { missing: 'x' }, { merged: { total: 1, items: [{ number: 1, title: 'x', url: 'javascript:alert(1)' }] } }, { merged: { total: 51, items: Array.from({ length: 51 }, () => ({ number: 1, title: 'x', url: `${REPO}/pull/1` })) } }, { deploys: { runs: -1, failed: 0 } }, { failing: [{ workflow: 'x'.repeat(201), url: `${REPO}/x`, since: '2026-11-05T00:00:00Z', failures: 1 }] }]) expect(bad(o), JSON.stringify(o).slice(0, 80)).toBeNull()
  expect(parseGitHubSide('not json')).toBeNull()
  expect(parseGitHubSide('[]')).toBeNull()
  expect(parseGitHubSide('')).toBeNull()
})
