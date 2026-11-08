import { expect, test } from 'vitest'
import { lastDays } from '../admin/chart'
import { summariseApp, type AppDay } from '../admin/app'
import type { Overview } from '../admin/pages'
import type { Metric, Scoreboard } from '../admin/scoreboard'
import { compose, highlights, needsCare, siteStats, type ComposeInput, type Stat } from '../daily/compose'
import { dashboardUrl } from '../paths'
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
    fish: { days: days.slice(1), perDay: { ok: z, none: z, blocked: z, usd: z, tin: z, tout: z }, unmatched: [], recent: [], periods: { today: none, yesterday: none, last30: none, d7: none, d7prev: none, d30: none, d30prev: none, mtd: none, mtdPrev: none }, byDay: new Map(), early: new Map() },
    keys: { rows: [KEY], bad: 0, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0, offTopic: 0 }, mostRefunds: 0, cap: 50, spend: [] },
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
    runId: '1001', runUrl: `${REPO}/actions/runs/1001`, since: '2026-11-05T00:00:00Z', missing: [], changes: [],
    deploys: runs(), engine: runs(), commits: { total: 0, parts: [] }, ios: runs(), testflight: { uploads: [], failed: 0 }, appStore: runs(), watch: runs(),
    failing: [], issues: nothing, notes: 0, prs: { ready: nothing, draft: nothing }, ...over,
  }
}
const metric = (key: string, unit: Metric['unit'], now: number | null, lastSoFar: number | null, last: number | null): Metric => ({ key, name: `The page's name for ${key}`, group: 'reach', unit, now, lastSoFar, last, weeks: [] })
/** The week's scoreboard as loadScoreboard gives it; its names are the page's, which the report doesn't print. */
const SCORE: Scoreboard = {
  v: 1, at: NOW.toISOString(), tz: TZ, page: dashboardUrl('/_ab/thanh-cong/'), docs: '', weeks: [], countingFrom: '2026-11-05T03:10:00Z', northStar: 'answered',
  metrics: [metric('answered', 'count', 12, 9, 20), metric('readers', 'count', 1234, 1000, 2500), metric('sessions', 'count', 4000, 3000, 6000), metric('searchShare', 'percent', 66.6667, 50, 40), metric('stepShare', 'percent', 33.3333, null, 25), metric('shopPer1000', 'per1000', 2.5, 0, null)],
  countries: { now: [], last: [] }, failed: {}, notYet: [],
}
const input = (over: Partial<ComposeInput> = {}): ComposeInput => ({ now: NOW, overview: quiet(), app: noApp, gh: gh(), scoreboard: SCORE, ...over })
const titles = (i: ComposeInput) => needsCare(i).map(c => c.title)

test('a quiet day: nothing needs care, and the subject says so', () => {
  const r = compose(input())
  expect(r.care).toBe(0)
  expect(r.subject).toBe('AquaTome daily · 6 Nov · nothing needs care')
  expect(r.text).toContain('NEEDS CARE: nothing')
  expect(r.text).toContain('No big moves.')
})

const SCOREBOARD_URL = dashboardUrl('/_ab/thanh-cong/')
test('success, this week: first, the north star and the key metrics in English, this week so far against the same point and all of last week, and the scoreboard\'s link', () => {
  const r = compose(input())
  const lines = [
    'Readers who found their answer: 12 (same point last week 9, all of last week 20)',
    'Readers: 1,234 (same point last week 1,000, all of last week 2,500)',
    'Readers from search: 66.7% (same point last week 50.0%, all of last week 40.0%)',
    'Sessions with a next step: 33.3% (all of last week 25.0%)',
    'Shop clicks per 1,000 readers: 2.5 (same point last week 0.0, all of last week —)',
  ]
  expect(r.text).toContain(['', 'SUCCESS, THIS WEEK', ...lines.map(l => `- ${l}`), `Scoreboard: ${SCOREBOARD_URL}`, '', 'NEEDS CARE: nothing'].join('\n'))
  expect(r.html).toContain(`<b>${lines[0]}</b>`)
  for (const l of lines.slice(1)) expect(r.html).toContain(`>${l}</li>`)
  expect(r.html).toContain(`<a href="${SCOREBOARD_URL}" style="color:#2f6b4f">Scoreboard</a>`)
  expect(r.html.indexOf('Success, this week')).toBeLessThan(r.html.indexOf('Needs care'))
  expect(`${r.text}${r.html}`).not.toMatch(VIETNAMESE)
  expect(r.care).toBe(0)
})

test('success, this week: a scoreboard that couldn\'t load, or whose readers\' numbers didn\'t, says so in its place and in what needs care; the report still goes', () => {
  for (const scoreboard of [undefined, { ...SCORE, failed: { beacon: 'Chưa cấu hình AE_API_TOKEN.' } }]) {
    const r = compose(input({ scoreboard }))
    expect(r.text).toContain(`SUCCESS, THIS WEEK\nCould not load the scoreboard's numbers.\nScoreboard: ${SCOREBOARD_URL}`)
    expect(r.html).toContain('Could not load the scoreboard&#39;s numbers.')
    expect(r.text).not.toContain('Readers who found their answer')
    expect(needsCare(input({ scoreboard }))).toEqual([{ title: 'Could not load the week\'s success numbers', href: '/_ab/thanh-cong/' }])
    expect(r.subject).toBe('AquaTome daily · 6 Nov · 1 needs care')
    // Its error stays on its page.
    expect(`${r.text}${r.html}`).not.toMatch(VIETNAMESE)
  }
  // Another part (GitHub's issues, say) isn't one the key metrics read.
  const checks = input({ scoreboard: { ...SCORE, failed: { checks: 'GitHub 403' } } })
  expect(compose(checks).text).toContain('- Readers: 1,234')
  expect(needsCare(checks)).toEqual([])
})

test('needs care: failures with no later success, open problem issues and what GitHub would not give come first, each with its link', () => {
  const i = input({ gh: gh({
    failing: [{ workflow: 'Deploy aquatome.com', url: `${REPO}/actions/runs/7`, since: '2026-11-05T15:00:00Z', failures: 2 }],
    missing: ['the open issues'],
    issues: { total: 1, items: [{ number: 576, title: 'Deploy failed', url: `${REPO}/issues/576` }] },
  }) })
  const care = needsCare(i)
  expect(care.map(c => c.title)).toEqual(['Deploy aquatome.com is failing', 'GitHub did not give part of this report', '#576 Deploy failed'])
  expect(care[0]).toMatchObject({ text: '2 failed runs since Thu 5 Nov, 22:00, no success after.', href: `${REPO}/actions/runs/7` })
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
  expect(needsCare(waiting(7))).toEqual([{ title: 'Moderation is behind', text: '2 comments waiting since Fri 6 Nov, 0:00.', href: '/_ab/binh-luan/' }])
  expect(needsCare(input({ overview: { ...quiet(), waiting: { comments: 0, photos: 1, oldest: new Date(NOW.getTime() - 7 * 3_600_000).toISOString() } } }))[0]!.href).toBe('/_ab/anh-ban-doc/')
  expect(titles(waiting(31))).toEqual(['Moderation hasn’t run'])
  expect(needsCare(waiting(31))[0]!.href).toContain('/actions/workflows/moderate.yml')
  // Waiting and small, it is a number in the site's table.
  expect(compose(waiting(5)).text).toContain('Comments waiting: 2')
})

test('needs care: the AI spend of the day that just ended, past 80% of the cap, so the owner can raise it before readers are told "busy"', () => {
  const o = quiet()
  const keys = o.keys as Exclude<Overview['keys'], { failed: string } | undefined>
  // The report goes at 07:00 in Vietnam, as the ledger's UTC day turns: yesterday's is the whole day.
  const spent = (usd: number) => input({ overview: { ...o, keys: { ...keys, cap: 50, spend: [{ day: '2026-11-06', usd: 0.4 }, { day: '2026-11-05', usd }] } } })
  expect(needsCare(spent(46.5))).toEqual([{ title: 'AI spend at 93% of its cap', text: 'Fish ID and chat: $46.50 of the $50 cap on 5 Nov.', href: '/_ab/nhan-dien-ca/' }])
  expect(compose(spent(46.5)).text).toContain('AI spend at 93% of its cap')
  expect(needsCare(spent(39))).toEqual([])
})

test('needs care: fish ID keys, in English', () => {
  const keys = (rows: NonNullable<Exclude<Overview['keys'], { failed: string }>>['rows'], bad = 0) => input({ overview: { ...quiet(), keys: { rows, bad, today: 0, model: 'm', counts: { fallback: 0, callLimit: 0, later400: 0, facts: 0, refunds: 0, offTopic: 0 }, mostRefunds: 0, cap: 50, spend: [] } } })
  const resting = { ...KEY, state: 'credit' as const, until: '2026-11-06T08:00:00.000Z' }
  // The owner's rule: one key out is the rotation's to skip, and only every key out is theirs.
  expect(needsCare(keys([resting, { ...KEY, n: 2 }]))).toEqual([])
  expect(needsCare(keys([resting]))).toEqual([{ title: 'Fish ID and chat are down', text: 'Every key resting, the first until Fri 6 Nov, 15:00.', href: '/_ab/nhan-dien-ca/#key' }])
  expect(titles(keys([KEY], 2))).toEqual(['2 key lines unreadable'])
  expect(titles(input({ overview: { ...quiet(), keys: undefined } }))).toEqual(['Fish ID is off'])
  // The error text stays on the dashboard: a report prints no error it didn't write.
  const failed = needsCare(input({ overview: { ...quiet(), keys: { failed: 'KV down at 203.0.113.9' } } }))[0]!
  expect(failed.title).toBe('Can’t read the keys’ state')
  expect(JSON.stringify(failed)).not.toContain('203.0.113.9')
})

const VIETNAMESE = /[ăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i
test('needs care: the overview\'s to-dos, each of them, in English with the page\'s link', () => {
  const F = { failed: 'x' }
  const failed = { ...S.OVERVIEW, readers: F, clicks: F, fish: F, keys: F, photos: F, waiting: F, wanted: F, accounts: F, hidden: F, content: F, snapshots: F }
  for (const [overview, scoreboard] of [[S.OVERVIEW, SCORE], [failed, undefined]] as const) {
    const r = compose({ now: S.NOW, overview, app: noApp, gh: gh(), scoreboard })
    expect(`${r.subject}\n${r.text}\n${r.html}`).not.toMatch(VIETNAMESE)
  }
  expect(titles({ now: S.NOW, overview: S.OVERVIEW, app: noApp, gh: gh(), scoreboard: SCORE })).toEqual(['Fish ID and chat are down', '2Hr Aquarist needs a browser check'])
  expect(titles({ now: S.NOW, overview: failed, app: noApp, gh: gh(), scoreboard: SCORE })).toEqual([
    'Can’t read the keys’ state', 'Readers didn’t load', 'Shop clicks didn’t load', 'The fish ID log didn’t load', 'Accounts didn’t load',
    'Moderation queues didn’t load', 'Reader photos didn’t load', 'Wanted names didn’t load', 'Hidden pages didn’t load', 'Content totals didn’t load', 'Daily content totals didn’t load',
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
  expect(picked).toEqual(['Calls 90: +125% vs 7-day avg 40', 'Comments 12: +10 vs 7-day avg 2.0', 'Accounts 8: +7 vs 7-day avg 1.0', 'Readers 412: +38% vs 7-day avg 298', 'Wanted 30: +200% vs 7-day avg 10'])
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

test('built: deploys and the live version, content pushes with what they added, app builds; no merged PR listed', () => {
  const totals = (fish: { vi: number; id: number; th: number }, guide: number, pages: number) => ({ kinds: { fish, guide: { vi: guide, id: 0, th: 0 }, plant: { vi: 3, id: 0, th: 0 } }, built: null, sources: {}, photos: { pages, gallery: 0 } }) as unknown as import('../admin/content').Totals
  const overview = { ...quiet(), snapshots: [{ day: '2026-11-04', totals: totals({ vi: 100, id: 40, th: 30 }, 10, 500) }, { day: '2026-11-05', totals: totals({ vi: 105, id: 42, th: 30 }, 12, 520) }] }
  const { text, html } = compose(input({ overview, gh: gh({
    deploys: { runs: 5, failed: 1, live: { sha: 'abc1234', url: `${REPO}/actions/runs/9`, at: '2026-11-05T20:19:53Z' } },
    engine: { runs: 8, failed: 1 }, commits: { total: 12, parts: [{ name: 'engine pages', n: 7 }, { name: 'videos', n: 5 }] },
    ios: runs(3, 1), testflight: { uploads: [{ build: 184, url: `${REPO}/actions/runs/20`, at: '2026-11-05T17:53:13Z' }, { build: 183, url: `${REPO}/actions/runs/19`, at: '2026-11-05T16:00:00Z' }], failed: 1 }, appStore: runs(1, 0),
    watch: runs(6, 2), notes: 2, prs: { ready: { total: 1, items: [{ number: 562, title: 'test: y', url: `${REPO}/pull/562` }] }, draft: { total: 4, items: [] } },
  }) }))
  expect(text).toContain('Deploys: 5 runs, 1 failed. Live: abc1234, deployed Fri 6 Nov, 3:19.')
  expect(text).toContain('Content pushes: Engine: 8 cycles, 1 failed. 12 content commits (engine pages 7, videos 5).')
  expect(text).toContain('Added 4 Nov to 5 Nov: fish vi +5, id +2; guides vi +2; photos +20 on pages.')
  expect(text).not.toContain('Merged PRs')
  expect(text).toContain('App builds: ios.yml: 3 runs, 1 failed. TestFlight: 2 uploads (build 184, 183), 1 failed. App Store: 1 run, 0 failed.')
  expect(text).toContain('Live checks: 6 runs, 2 failed. 2 review notes open.')
  expect(text).toContain('Open PRs: 1 ready, 4 draft.')
  expect(html).toContain(`<a href="${REPO}/pull/562"`)
  // Under two nights' totals: no line of made-up nothing.
  expect(compose(input()).text).not.toContain('Added ')
})

test('content quality: how many pages each list holds, linked to the content page, and no page or name a reader typed', () => {
  const row = { path: '/ca/x/', title: 'Cá x', section: 'fish·vi', score: 30, ranked: true, demand: 1, figures: {} as never, why: '' }
  const quality = {
    days: 28, scored: 40, ranked: 12, best: [], worst: [], rewrite: [row], decaying: [row],
    gaps: [{ source: 'wanted' as const, name: 'Cá rồng đỏ', demand: 30, why: '' }], totals: { rewrite: 14, decaying: 3, gaps: 1 },
  }
  const { text, html } = compose(input({ quality }))
  expect(text).toContain('Content quality: 14 pages to rewrite first, 3 decaying, 1 gap (asked for, not written).')
  expect(html).toContain(`href="${dashboardUrl('/_ab/noi-dung/#chat-luong')}"`)
  expect(text).not.toContain('Cá rồng đỏ')
  expect(text).not.toContain('/ca/x/')
  // Not loaded, or failed: no line (the content page says why).
  expect(compose(input()).text).not.toContain('Content quality')
  expect(compose(input({ quality: { failed: 'analytics engine sql 422' } })).text).not.toContain('Content quality')
})

test('what changed: the site\'s, the app\'s and the engine\'s lines, each newest first and once, then the change log; no PR number or link', () => {
  const changes = [
    { area: 'Engine', text: 'Guides keep their photos.', at: '2026-11-05T02:00:00Z' },
    { area: 'Site', text: 'Readers can attach one photo to a comment.', at: '2026-11-05T05:00:00Z' },
    { area: 'App', text: 'The Tìm home lists what\'s new on the site.', at: '2026-11-05T04:00:00Z' },
    { area: 'Site', text: 'Shop links fit a 320 px screen.', at: '2026-11-05T09:00:00Z' },
    { area: 'Site', text: 'Readers can attach one photo to a comment.', at: '2026-11-05T01:00:00Z' },
  ] as GitHubSide['changes']
  const { text, html } = compose(input({ gh: gh({ changes }) }))
  const log = dashboardUrl('/_ab/thay-doi/')
  expect(text).toContain(['What changed', '  Site:', '  - Shop links fit a 320 px screen.', '  - Readers can attach one photo to a comment.', '  App:', '  - The Tìm home lists what\'s new on the site.', '  Engine:', '  - Guides keep their photos.', `  Change log: ${log}`, 'Deploys: '].join('\n'))
  expect(text.match(/attach one photo/g)).toHaveLength(1)
  // After the week's success and what needs care; first of what was built, before the machinery's counts.
  const at = (x: string) => text.indexOf(x)
  expect([at('SUCCESS, THIS WEEK'), at('NEEDS CARE'), at('What changed'), at('Deploys:')].every((x, i, xs) => x >= 0 && (i === 0 || x > xs[i - 1]!))).toBe(true)
  expect(text).not.toMatch(/#\d|\/pull\//)
  expect(html).toMatch(/<b>What changed<\/b><\/p><p[^>]*>Site<\/p><ul[^>]*><li[^>]*>Shop links fit a 320 px screen\.<\/li><li[^>]*>Readers can attach one photo to a comment\.<\/li><\/ul><p[^>]*>App<\/p>/)
  expect(html).toContain(`<a href="${log}" style="color:#2f6b4f">Change log</a>`)
  expect(html.indexOf('Engine</p>')).toBeLessThan(html.indexOf('>Change log<'))
})

test('what changed: none says so, and still links the change log; with part of GitHub\'s answer missing, it doesn\'t claim none', () => {
  const quietDay = compose(input())
  expect(quietDay.text).toContain(`What changed: No product changes.\n  Change log: ${dashboardUrl('/_ab/thay-doi/')}`)
  expect(quietDay.html).toContain('<b>What changed</b>: No product changes.</p>')
  expect(quietDay.html).toContain(`href="${dashboardUrl('/_ab/thay-doi/')}"`)
  const missing = compose(input({ gh: gh({ missing: ['the merged pull requests'] }) }))
  expect(missing.text).toContain('What changed: None found, but GitHub did not give part of this report.')
  expect(missing.text).not.toContain('No product changes.')
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
  const r = compose({ now: S.NOW, overview: S.OVERVIEW, app: { ...S.APP, sessions: 1 }, scoreboard: SCORE, gh: gh({
    failing: [{ workflow: hostile, url: `${REPO}/actions/runs/7`, since: '2026-11-03T15:00:00Z', failures: 1 }],
    issues: { total: 1, items: [{ number: 1, title: hostile, url: `${REPO}/issues/1` }] },
    changes: [{ area: 'Site', text: hostile, at: '2026-11-05T10:00:00Z' }],
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
  const r = compose({ now: S.NOW, overview: S.OVERVIEW, app: { ...S.APP, sessions: 1 }, gh: gh(), scoreboard: SCORE })
  expect(r.html).toContain(`href="${dashboardUrl('/_ab/nhan-dien-ca/#key')}"`)
  expect(r.html).toContain(`href="${dashboardUrl('/_ab/bao-cao/')}"`)
  expect(r.text).toContain(dashboardUrl('/_ab/ung-dung/'))
  expect(r.html).not.toMatch(/href="\//)
})

test('the workflow\'s body: read strictly, every link this repository\'s', () => {
  const ok = gh({ issues: { total: 1, items: [{ number: 1, title: 'x\u0000y', url: `${REPO}/issues/1` }] } })
  expect(parseGitHubSide(JSON.stringify(ok))?.issues.items[0]!.title).toBe('x y')
  const bad = (o: Record<string, unknown>) => parseGitHubSide(JSON.stringify({ ...ok, ...o }))
  expect(bad({})).not.toBeNull()
  for (const o of [{ runId: 'abc' }, { runId: 12 }, { runUrl: 'https://evil.test/x' }, { runUrl: 'https://github.com.evil.test/deathemperor/aquatome.com/x' }, { runUrl: `${REPO}/x" onclick="y` }, { since: 'soon' }, { missing: 'x' }, { changes: undefined }, { changes: [{ area: 'Web', text: 'x', at: '2026-11-05T00:00:00Z' }] }, { changes: [{ area: 'Site', text: ' ', at: '2026-11-05T00:00:00Z' }] }, { changes: [{ area: 'Site', text: 'x'.repeat(301), at: '2026-11-05T00:00:00Z' }] }, { changes: [{ area: 'Site', text: 'x', at: 'soon' }] }, { changes: Array.from({ length: 101 }, () => ({ area: 'Site', text: 'x', at: '2026-11-05T00:00:00Z' })) }, { deploys: { runs: -1, failed: 0 } }, { failing: [{ workflow: 'x'.repeat(201), url: `${REPO}/x`, since: '2026-11-05T00:00:00Z', failures: 1 }] }]) expect(bad(o), JSON.stringify(o).slice(0, 80)).toBeNull()
  expect(parseGitHubSide('not json')).toBeNull()
  expect(parseGitHubSide('[]')).toBeNull()
  expect(parseGitHubSide('')).toBeNull()
})

test('the report writes numbers the English way, not the dashboard\'s Vietnamese way', async () => {
  const { fmt } = await import('../daily/compose')
  expect([fmt(2.1, 1), fmt(1234), fmt(0.11, 2)]).toEqual(['2.1', '1,234', '0.11'])
})

test("coming up in the app: Khám phá's week with its theme and the curator's note, then Hôm nay's fish a day; nothing without a calendar", () => {
  const calendar = { weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: 'Trời trở lạnh', why: 'Gió mùa về, bể cần sưởi.' }], days: [{ date: '2026-11-06', fish: 'Cá ông tiên altum' }, { date: '2026-11-07' }, { date: '2026-11-08', fish: 'Cá vàng Lưu kim (Ryukin)', why: 'Fish: Cá vàng Lưu kim (Ryukin), fine without a heater.' }] }
  const r = compose(input({ gh: gh({ calendar }) }))
  expect(r.text).toContain(['COMING UP IN THE APP', 'Khám phá, week of Mon 9 Nov: Trời trở lạnh. Gió mùa về, bể cần sưởi.', 'Hôm nay', '- Fri 6 Nov: Cá ông tiên altum', '- Sat 7 Nov: no fish picked, the app picks its own', '- Sun 8 Nov: Fish: Cá vàng Lưu kim (Ryukin), fine without a heater.'].join('\n'))
  expect(r.text.indexOf('COMING UP IN THE APP')).toBeGreaterThan(r.text.indexOf('BUILT (last 24 hours)'))
  expect(r.text.indexOf('COMING UP IN THE APP')).toBeLessThan(r.text.indexOf('\nSITE'))
  expect(r.html).toContain('>Coming up in the app</h3>')
  expect(r.html).toContain('Fri 6 Nov: Cá ông tiên altum')
  const without = compose(input())
  expect(without.text).not.toContain('COMING UP')
  expect(without.html).not.toContain('Coming up')
  const bad = (c: unknown) => parseGitHubSide(JSON.stringify({ ...gh(), calendar: c }))
  expect(bad(calendar)?.calendar).toEqual(calendar)
  for (const c of [{ weeks: [], days: [{ date: 'soon' }] }, { weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: 1 }], days: [] }, { weeks: [], days: Array.from({ length: 15 }, () => ({ date: '2026-11-06' })) }, { days: [] }, 'x']) expect(bad(c), JSON.stringify(c).slice(0, 60)).toBeNull()
})

test('a burst of likely automated tabs yesterday is something to look at; today\'s, or none, isn\'t', () => {
  // NOW is 07:00 on 6 Nov in Vietnam: yesterday is the 5th.
  const care = (readers: Overview['readers']) => needsCare(input({ overview: { ...quiet(), readers } })).filter(c => c.title.startsWith('Likely automated'))
  expect(care([{ day: '2026-11-05', sessions: 3, readers: 1, automated: 97 }])).toEqual([{ title: 'Likely automated visits yesterday: 97 fresh tabs', text: 'A burst of new tabs from one country, each opening a different page. Left out of the readers.', href: '/_ab/doc-gia/' }])
  expect(care([{ day: '2026-11-06', sessions: 3, readers: 1, automated: 40 }, { day: '2026-11-05', sessions: 3, readers: 1 }])).toEqual([])
})
