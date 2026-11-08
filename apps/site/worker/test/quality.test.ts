import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import type { ContentStats } from '../admin/content'
import { expectedCtr, GSC_KEY, HELP, qualityBlocks, qualityHtml, qualityJson, SCORE, summariseQuality, type Gsc, type PageSignals, type TabPage } from '../admin/quality'
import type { Session } from '../readers'

// The fixture build's content.json (pnpm test builds the site first).
const STATS = JSON.parse(readFileSync(fileURLToPath(new URL('../../dist/_ab/content.json', import.meta.url).href), 'utf8')) as ContentStats
const FISH = '/ca/ca-neon-vua/'
const GUIDE = '/huong-dan/thay-nuoc-dung-cach/'
const PLANT = '/cay/monte-carlo/'
const at = (m: number) => `2026-11-07 ${String(1 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`

// 25 tabs on the fish page: 20 read half of it and stayed 30 s, and the first 10 went on to the guide, which none read.
const tabs: TabPage[] = []
for (let i = 0; i < 25; i++) {
  tabs.push({ sid: `t${i}`, p: FISH, first: at(i), views: 1, scroll: i < 20 ? 90 : 0, t: i < 20 ? 60 : 0, shop: i === 0 ? 1 : 0, tank: i < 3 ? 1 : 0, src: i === 4 ? '2' : 0 })
  if (i < 10) tabs.push({ sid: `t${i}`, p: GUIDE, first: at(i + 1), views: '1', scroll: 0, t: 0, shop: 0 })
}
// The count's tabs: ours and automated ones aren't among them (readers.ts querySessions), so their rows count nowhere.
const sessions = [...new Set(tabs.map(t => t.sid))].map((sid): Session => ({ sid, first: at(0), pages: 1, t: 0, scroll: 0 }))
const ours = Array.from({ length: 40 }, (_, i): TabPage => ({ sid: `o${i}`, p: GUIDE, first: at(i), views: 1, scroll: 90, t: 180, shop: 0 }))

const gsc: Gsc = {
  v: 1, at: '2026-11-08T01:00:00Z', from: '2026-10-10', to: '2026-11-06', prevFrom: '2026-09-12', prevTo: '2026-10-09',
  pages: {
    [FISH]: [1000, 100, 3, 900, 95], // the click rate position 3 usually gets
    [GUIDE]: [200, 2, 2, 500, 3], // a good position few click, and half the impressions it had
    [PLANT]: [50, 0, 30, 0, 0],
    '/ca/khong-co/': [999, 9, 5, 0, 0], // an address this build doesn't have
  },
  queries: [
    ['neon vua', FISH, 800, 90, 2.5],
    ['monte carlo trải nền <b>', PLANT, 40, 0, 32],
    ['monte carlo trải nền <b>', GUIDE, 5, 0, 18],
    ['thay nước', GUIDE, 9, 0, 40], // too few impressions to be a gap
  ],
}
const signals: PageSignals = { v: 1, pages: { [GUIDE]: ['vi/guides/aquariumcoop-thay-nuoc', 0.6, ['source', 'units'], null, 0.6, false, null] } }
const wanted = [{ kind: 'fish', name: 'Cá rồng', readers: 3, sources: { search: 2, chat: 1 }, first: '2026-11-01', last: '2026-11-07' }]

test('the score: reading and search, each pulled towards a middle value until there is data, as the page\'s help says', () => {
  const q = summariseQuality(STATS, [...tabs, ...ours], sessions, gsc, signals, wanted)
  const fish = q.best[0]!
  expect(fish.path).toBe(FISH)
  // Reading: (20 read half + 20 stayed 30 s + 10 went on) ÷ (3 × 25), its section's own mean, so the pull changes nothing.
  expect(fish.reading).toBeCloseTo(50 / 75)
  // Search: clicked 10% at position 3, what position 3 gets, so 1; pulled towards ½ by 100 impressions.
  expect(expectedCtr(3)).toBe(0.1)
  expect(fish.search).toBeCloseTo((1000 * 1 + 100 * 0.5) / 1100)
  expect(fish.score).toBe(Math.round((100 * (2 * (50 / 75) + 1050 / 1100)) / 3))
  expect(fish.figures).toMatchObject({ tabs: 25, half: 20, s30: 20, next: 10, shop: 1, tank: 3, src: 2, impressions: 1000 })
  expect(fish.why).toContain('clicks: 1 shop, 3 add to tank, 2 source')
  // Our 40 tabs on the guide count nowhere: the guide has its 10 tabs only.
  const guide = q.worst[0]!
  expect([guide.path, guide.figures.tabs, guide.reading]).toEqual([GUIDE, 10, 0])
  // Ranked by tabs (25 ≥ 20) or impressions (200 ≥ 100); the plant, with 50 impressions and no tab, has a score but no rank.
  expect([q.scored, q.ranked]).toEqual([3, 2])
  expect(HELP).toContain('Score = 100 × (2 × reading + search) ÷ 3')
  expect(HELP).toContain(`${SCORE.minTabs} tabs or ${SCORE.minImpressions} impressions in ${SCORE.days} days`)
})

test('the five lists: best and worst halves, rewrite first, decaying, and the gaps', () => {
  const q = summariseQuality(STATS, tabs, sessions, gsc, signals, wanted)
  expect(q.best.map(r => r.path)).toEqual([FISH])
  expect(q.worst.map(r => r.path)).toEqual([GUIDE])
  // A good position few click: its title and description, before its text.
  expect(q.rewrite.map(r => [r.path, r.why])).toEqual([[GUIDE, 'Google: 200 impressions at position 2, 1% clicked (usual 15%): the title and description need work']])
  expect(q.decaying.map(r => r.path)).toEqual([GUIDE])
  expect(q.decaying[0]!.why).toContain('impressions 500 → 200')
  // A page Google stopped showing altogether, with no tab: first on the list, with nothing to score, and no rank.
  const gone = summariseQuality(STATS, tabs, sessions, { ...gsc, pages: { ...gsc.pages, '/cay/monte-carlo/': [0, 0, 0, 800, 12] } }, signals, wanted)
  expect(gone.decaying.map(r => [r.path, r.score, r.ranked])).toEqual([[PLANT, null, false], [GUIDE, 7, true]])
  expect([gone.scored, gone.totals.decaying]).toEqual([2, 2])
  expect(qualityHtml(gone)).toContain('<td>—</td>')
  // A search Google shows us for only far down, by its best page; then the names readers looked for. Too few impressions: none.
  expect(q.gaps.map(g => [g.source, g.name, g.demand, g.path])).toEqual([['search', 'monte carlo trải nền <b>', 45, GUIDE], ['wanted', 'Cá rồng', 30, undefined]])
  // Without Search Console (the job hasn't run), the beacon alone: no search part, no decaying, no search gap.
  const beacon = summariseQuality(STATS, tabs, sessions, undefined, undefined, [])
  expect([beacon.search, beacon.best[0]!.search, beacon.decaying, beacon.gaps]).toEqual([undefined, undefined, [], []])
  expect(beacon.best[0]!.score).toBe(Math.round(100 * (50 / 75)))
})

test('a page fixed by hand, or rewritten in the last 28 days, is on no list to rewrite and not in the writers\' feed', () => {
  const now = new Date('2026-11-08T05:00:00Z')
  const sig = (fixed: boolean, rewritten: string | null): PageSignals => ({ v: 1, pages: { [GUIDE]: ['vi/guides/aquariumcoop-thay-nuoc', 0.6, null, null, null, fixed, rewritten] } })
  const lists = (s: PageSignals) => { const q = summariseQuality(STATS, tabs, sessions, gsc, s, [], now); return [q.rewrite.length, q.decaying.length, qualityJson(q).pages.filter(p => p.path === GUIDE).length] }
  expect(lists(sig(false, null))).toEqual([1, 1, 3])
  expect(lists(sig(true, null))).toEqual([0, 0, 0])
  expect(lists(sig(false, '2026-10-20T00:00:00Z'))).toEqual([0, 0, 0])
  // Its figures are all the new text's by then: back on the lists.
  expect(lists(sig(false, '2026-10-01T00:00:00Z'))).toEqual([1, 1, 3])
  // Still on the owner's worst list: the score is the page's.
  expect(summariseQuality(STATS, tabs, sessions, gsc, sig(true, null), [], now).worst.map(r => r.path)).toEqual([GUIDE])
})

test('on the content page and for the writers: the formula, the lists, Google\'s words escaped', () => {
  const q = summariseQuality(STATS, tabs, sessions, gsc, signals, wanted)
  const html = qualityHtml(q)
  expect(html).toContain('id="chat-luong"')
  expect(html).toContain('Score = 100 × (2 × reading + search) ÷ 3')
  for (const t of ['Rewrite first', 'Decaying', 'Gaps: asked for, not written', 'Best pages', 'Worst pages']) expect(html).toContain(t)
  expect(html).toContain(`<a href="${GUIDE}">`)
  expect(html).toContain('monte carlo trải nền &lt;b&gt;')
  expect(html).not.toContain('<b>')
  expect(qualityHtml(undefined)).toContain('Not loaded')
  expect(qualityHtml({ failed: 'analytics engine sql 422' })).toContain('analytics engine sql 422')
  expect(qualityBlocks(q).filter(b => b.kind === 'table')).toHaveLength(5)
  const j = qualityJson(q)
  expect(j.pages.find(p => p.list === 'rewrite')).toMatchObject({ priority: 1, path: GUIDE, key: 'vi/guides/aquariumcoop-thay-nuoc', fit: ['source', 'units'], review: 0.6 })
  expect(j.gaps[0]).toMatchObject({ priority: 1, source: 'search', name: 'monte carlo trải nền <b>' })
  // A page with no engine key (the home page, a section's list, the fish here, which has no signals) is the owner's to
  // judge: on the owner's lists, not in the writers' queue, which rewrites by key.
  expect(q.best.map(r => r.path)).toContain(FISH)
  expect(j.pages.map(p => p.path)).not.toContain(FISH)
  expect(j.pages.every(p => p.key)).toBe(true)
})

test('the daily job\'s figures: only with the dashboard token, only in their shape, kept for the content page', async () => {
  const store = new Map<string, string>()
  const env = { ASSETS: { fetch: async () => new Response('x') }, AB: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }, AB_DASH_TOKEN: 'tok', STAGING: '1' } as unknown as Env
  const post = (body: string, token = 'tok', method = 'POST') => handle(new Request('https://x.test/_ab/search-console', { method, body: method === 'POST' ? body : null, headers: { authorization: `Bearer ${token}` } }), env)
  const good = JSON.stringify(gsc)
  expect((await post(good, 'wrong')).status).toBe(404)
  expect((await post(good, 'tok', 'GET')).status).toBe(404)
  expect((await post('{')).status).toBe(400)
  expect((await post(JSON.stringify({ ...gsc, v: 2 }))).status).toBe(400)
  expect((await post(JSON.stringify({ ...gsc, pages: { [FISH]: [1, 2, 'x', 4, 5] } }))).status).toBe(400)
  expect((await post(JSON.stringify({ ...gsc, queries: [[1, FISH, 1, 1, 1]] }))).status).toBe(400)
  expect((await post(JSON.stringify({ ...gsc, queries: [['x', FISH, null, 1, 1]] }))).status).toBe(400)
  expect((await post(JSON.stringify({ ...gsc, queries: Array.from({ length: 40_000 }, () => ['x'.repeat(40), FISH, 1, 1, 1]) }))).status).toBe(413)
  expect(store.size).toBe(0)
  const r = await post(good)
  expect([r.status, await r.json()]).toEqual([200, { stored: true, pages: 4, queries: 4 }])
  expect(JSON.parse(store.get(GSC_KEY)!)).toEqual(gsc)
})
