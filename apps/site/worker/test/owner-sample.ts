import { lastDays } from '../admin/chart'
import { summariseApp, type AppRows } from '../admin/app'
import { cursorOf, type CommentRow, type CommentState, type CommentWeek } from '../admin/comments'
import type { ContentReads, PageInfo, ContentStats, KindClicks, LowScores, Snapshot, Talk, Totals } from '../admin/content'
import { summariseFishId, type CallRow, type DayRow } from '../admin/fishid'
import type { Overview } from '../admin/pages'
import type { ReportsData } from '../daily/page'
import type { Change } from '../daily/github'
import { summariseScoreboard, type BeaconRow } from '../admin/scoreboard'
import type { Today } from '../admin/today'
import type { Wanted } from '../wanted'

/**
 * One sample of everything the dashboard's pages draw, at a fixed moment in Vietnam: every part loaded, with rows of
 * each kind (a link and no link, every key resting, a photo approved, a source waiting on the owner…). The pages' HTML and
 * their blocks are drawn from it side by side (owner-api.test.ts), and protocols/owner-dashboard-vectors.json is its JSON.
 * Data only: it draws nothing itself.
 */
export const NOW = new Date('2026-11-04T09:00:00Z')
export const TZ = 'Asia/Ho_Chi_Minh'
const days30 = lastDays(NOW, 30, TZ)
const days31 = lastDays(NOW, 31, TZ)
const wave = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => f(i))
const iso = (day: string, hm = '02:00') => `${day}T${hm}:00.000Z`

export const READERS = {
  days: 14, sessions: 1240, readers: 610,
  daily: lastDays(NOW, 14, TZ).map((day, i) => ({ day, sessions: 70 + i * 3, readers: 30 + i * 2 })),
  pages: [{ path: '/ca/ca-neon-vua/', views: 320 }, { path: '/huong-dan/thay-nuoc/', views: 140 }, { path: '//other.site/x', views: 2 }],
  sources: [{ source: 'Google', sessions: 800, readers: 420 }, { source: '(trực tiếp)', sessions: 300, readers: 120 }],
  countries: [{ cc: 'VN', readers: 540 }, { cc: 'ID', readers: 40 }],
}

const APP_ROWS: AppRows = {
  views: [{ p: '/ca/ca-neon-vua/', s: '', n: '40' }, { p: '', s: 'lights', n: '25' }],
  actions: [{ act: 'light.connect', ver: '1.0 (114)', n: '20', ok: '15' }, { act: 'fishid', ver: '1.0 (115)', n: '4', ok: '4' }],
  errors: [{ act: 'light.connect', why: 'timeout', n: '5' }],
  shops: [{ shop: 'shopee', p: '/ca/ca-neon-vua/', n: '3' }],
  health: [{ ver: '1.0 (114)', reports: '30', crashes: '3', hangs: '1', exits: '4' }],
  perf: [900, 1100, 3000].map(launch => ({ ver: '1.0 (114)', launch: String(launch), mem: '150', w: '1' })),
}
export const APP = summariseApp(APP_ROWS, false)

const fishDays: DayRow[] = lastDays(NOW, 62, TZ).flatMap((d, i) => [
  { d, outcome: 'ok', n: 10 + (i % 5), called: 10 + (i % 5), tin: 12000, tout: 900, usd: 0.11, guessed: 9, linked: 7 },
  { d, outcome: 'rate', n: i % 3, called: 0, tin: 0, tout: 0, usd: 0, guessed: 0, linked: 0 },
])
const call = (t: string, o: Partial<CallRow>): CallRow => ({ t, outcome: 'ok', model: 'claude-x', kh: 'aaaa1111', verdict: 'fish', sci: '', page: '', lang: 'vi', src: 'page', cc: 'VN', tin: 1200, tout: 90, usd: 0.0109, ms: 4200, attempts: 1, conf: 0.9, guesses: 3, ...o })
export const FISH = {
  now: NOW, tz: TZ,
  stats: summariseFishId(fishDays, [{ sci: 'Betta macrostoma', n: '6', conf: '4.8' }], [
    call('2026-11-04 08:58:01', { sci: 'Paracheirodon axelrodi', page: 'paracheirodon-axelrodi' }),
    call('2026-11-04 08:40:00', { sci: 'Betta macrostoma' }),
    call('2026-11-04 08:30:00', { sci: 'Trigonostigma heteromorpha', page: 'gone-page' }),
    call('2026-11-04 08:00:00', { outcome: 'rate', verdict: '', kh: '', tin: 0, tout: 0, usd: 0, guesses: 0, conf: 0, src: 'tank' }),
    // Enough for more than one page of the app's table (50 rows a page).
    ...Array.from({ length: 56 }, (_, i) => call(`2026-11-04 07:${String(59 - i).padStart(2, '0')}:00`, { sci: 'Paracheirodon innesi', page: 'paracheirodon-innesi' })),
  ], NOW, TZ),
  keys: { rows: [{ n: 1, hash: 'aaaa1111', workspace: false, state: 'credit' as const, until: '2026-11-05T02:00:00.000Z', calls: 3, answered: 0 }, { n: 2, hash: 'bbbb2222', workspace: true, state: 'rate' as const, until: '2026-11-04T09:30:00.000Z', calls: 40, answered: 39 }], bad: 0, today: 42, model: 'claude-x', counts: { fallback: 2, callLimit: 5, later400: 1, facts: 0, refunds: 3, offTopic: 0 }, mostRefunds: 2, cap: 50, spend: [] },
  pages: new Map([['paracheirodon-axelrodi', '/vi/ca/ca-neon-vua/']]),
}

export const KEPT_ID = '0b4c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21'
export const KEPT_ANON = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b'
export const KEPT = [
  { id: KEPT_ID, created: '2026-11-04T08:10:00.000Z', verdict: 'fish', guesses: [{ scientificName: 'Betta splendens', commonName: 'Betta', variety: null, confidence: 0.9 }], account: 'reader-1', model: 'm', lang: 'vi' },
  { id: KEPT_ANON, created: '2026-11-03T11:00:00.000Z', verdict: 'other', guesses: [], model: 'm', lang: 'th' },
]

export const CLICKS = { days: days30, clicks: wave(30, i => (i * 7) % 5) }
export const AFF = {
  byNetwork: [{ network: 'shopee', category: 'thuc-an', n: 30 }, { network: 'lazada', category: 'loc', n: 4 }],
  top: [{ entity_ref: 'species:paracheirodon-axelrodi', n: 12 }],
  status: [{ status: 'ok', n: 40 }, { status: 'gone', n: 2 }],
  lastCheck: '2026-11-04T01:00:00.000Z',
}

export const WANTED: { names: Wanted[]; more: boolean } = {
  names: [
    { kind: 'fish', name: 'Cá sặc gấm', sci: 'Trichogaster lalius', readers: 5, sources: { tank: 3, 'fish-id': 2 }, first: days30[27]!, last: days30[29]! },
    { kind: 'plant', name: 'Rotala macrandra', sci: 'Rotala macrandra', readers: 2, sources: { tank: 2 }, first: '2025-12-30', last: days30[20]! },
  ],
  more: false,
}

/** A phone's APNs device token, as the app sends it (lowercase hex). */
export const PUSH_TOKEN = '3b9a7c2e5d4f6a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b'
export const PHOTO_WAITING = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
export const PHOTO_APPROVED = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
export const PHOTO_LIVE = 'c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f'
export const PHOTO_MOVED = 'd4e5f6a7-b8c9-4d0e-9f1a-3b4c5d6e7f8a'
export const RECENT = [
  { id: PHOTO_LIVE, entity_ref: 'species:paracheirodon-axelrodi', moved_from: null, name: 'Minh', thumb: 'https://media.aquatome.com/p/c3d4-thumb.webp', created_at: '2026-11-03T10:00:00.000Z' },
  // Sent on the neon's page; moderation found a goldfish and moved it there.
  { id: PHOTO_MOVED, entity_ref: 'species:carassius-auratus', moved_from: 'species:paracheirodon-innesi', name: 'Thảo', thumb: 'https://media.aquatome.com/p/d4e5-thumb.webp', created_at: '2026-11-03T09:00:00.000Z' },
]
export const WAITING = [
  { id: PHOTO_WAITING, entity_ref: 'species:betta-splendens', name: 'Lan', created_at: '2026-11-04T08:34:00.000Z', ownerOk: false },
  { id: PHOTO_APPROVED, entity_ref: 'breed:betta-halfmoon', name: 'Hùng <3', created_at: '2026-11-04T07:00:00.000Z', ownerOk: true },
]

export const HIDDEN = { '/ca/ca-x/': { at: '2026-11-03T03:00:00.000Z', note: 'ảnh nhầm loài' }, '/id/ikan/y/': { at: '2026-11-04T01:00:00.000Z' } }

export const ACCOUNTS = {
  days: days30, users: 40, newUsers: wave(30, i => (i === 28 ? 3 : i % 4 === 0 ? 1 : 0)), synced: 9, openSessions: 12,
  credentials: [{ kind: 'google', n: 30 }, { kind: 'passkey', n: 4 }], comments: [{ status: 'approved', n: 20 }, { status: 'held', n: 2 }], newComments: wave(30, i => i % 3),
}

const totals = (fish: number, plant: number, guide: number, id: number, th: number, sources: Record<string, number>): Totals =>
  ({ kinds: { fish: { vi: fish, id, th, ms: 0 }, plant: { vi: plant, id: 0, th: 0, ms: 0 }, guide: { vi: guide, id, th: 0, ms: 0 } } as Partial<Totals['kinds']> as Totals['kinds'], built: null, sources, photos: { pages: 0, gallery: 0 } })
export const SNAPSHOTS: Snapshot[] = [
  { day: days30[20]!, totals: totals(700, 90, 300, 100, 80, { seriouslyfish: 500, youtube: 120 }) },
  { day: days30[25]!, totals: totals(720, 92, 305, 130, 90, { seriouslyfish: 515, youtube: 125 }) },
  { day: days30[28]!, totals: totals(730, 92, 310, 150, 95, { seriouslyfish: 520, youtube: 132 }) },
]
const inv = (total: number, id = 0, th = 0, ms = 0) => ({ total, id, th, ms })
export const STATS = {
  v: 1, builtAt: '2026-11-04T06:00:00.000Z', publicBuild: true,
  inventory: { fish: inv(730, 150, 95), breed: inv(40), plant: inv(92), guide: inv(250, 20), videoGuide: inv(60), series: inv(5), glossary: inv(120), equipment: inv(0), place: inv(30), product: inv(0) },
  built: { total: { vi: 1500, id: 300, th: 200, ms: 0 }, byKind: {} },
  sources: { seriouslyfish: { name: 'Seriously Fish', fish: 520, plant: 0, guide: 0 }, youtube: { name: 'YouTube', fish: 0, plant: 0, guide: 132 } },
  photos: { pages: 2100, byOrigin: { commons: 900, inaturalist: 700 }, byLicence: { 'CC BY': 1000, CC0: 600 }, covered: { fish: { with: 600, of: 730 }, plant: { with: 80, of: 92 } }, waitingMirror: 14, gallery: { pages: 300, photos: 2400 } },
  engine: {
    sources: [
      { id: '2hraquarist', name: '2Hr Aquarist', found: 300, done: 120, skipped: 40, waiting: 130, failed: 5, blocked: 5, discovered: 340, lastAt: '2026-11-04T05:00:00.000Z' },
      { id: 'seriouslyfish', name: 'Seriously Fish', found: 900, done: 880, skipped: 15, waiting: 5, failed: 0, blocked: 0 },
    ],
    needsHuman: [{ source: '2hraquarist', since: '2026-11-03T22:00:00.000Z' }],
    videos: { listed: 400, written: 132, skipped: 60, waiting: 200, failed: 8, playlists: { queued: 3, skipped: 0 }, singles: { queued: 10, skipped: 1 }, writtenAt: days31.slice(20).map(d => iso(d)) },
    rewrite: { done: 300, waiting: 400, failed: 3 },
    lastRun: { startedAt: '2026-11-04T03:00:00.000Z', finishedAt: '2026-11-04T04:10:00.000Z', needsHuman: ['2hraquarist'], errors: 1, changed: 12 },
  },
  gaps: {
    fish: { noPhoto: { n: 130, top: [['/ca/ca-a/', 'Cá A'], ['/ca/ca-b/', 'Cá B']] }, noKeyFacts: { n: 12, top: [], by: { tempC: 4, ph: 9 } } },
    plant: { noViName: { n: 3, top: [['/cay/rotala/', 'Rotala']] } },
  },
  pages: null,
  totals: totals(730, 92, 310, 150, 95, { seriouslyfish: 520, youtube: 132 }),
} as unknown as ContentStats
export const READS: ContentReads = {
  days: 30, readers: 600,
  byKind: [{ kind: 'fish', pages: 730, read: 300, readers: 500, views: 4000 }, { kind: 'plant', pages: 92, read: 0, readers: 0, views: 0 }],
  top: [{ path: '/ca/ca-neon-vua/', title: 'Cá neon vua', kind: 'fish', readers: 90, views: 320 }],
  unread: { n: 430, byKind: { fish: 430 }, pages: [{ path: '/ca/ca-c/', title: 'Cá C', kind: 'fish' }] },
  elsewhere: { views: 12, paths: 3 },
}
export const TALK: Talk = { comments: 20, photos: 6, byKind: [{ kind: 'fish', comments: 18, photos: 6 }], top: [{ path: '/ca/ca-neon-vua/', title: 'Cá neon vua', kind: 'fish', comments: 7, photos: 2 }], elsewhere: { comments: 1, photos: 0 } } as Talk
export const KIND_CLICKS: KindClicks = { days: 30, since: days30[0]!, clicks: 80, byKind: [{ kind: 'fish', clicks: 60 }], top: [{ path: '/ca/ca-neon-vua/', title: 'Cá neon vua', kind: 'fish', clicks: 12 }], elsewhere: 4 }

/** The overview with every part loaded. */
export const OVERVIEW: Overview = {
  now: NOW, tz: TZ,
  readers: days31.map((day, i) => ({ day, sessions: 60 + i, readers: 20 + (i % 9) })),
  clicks: { days: days31, clicks: wave(31, i => (i * 7) % 5) },
  fish: FISH.stats, keys: FISH.keys, photos: 6,
  waiting: { comments: 2, photos: 2, oldest: '2026-11-04T07:00:00.000Z' },
  wanted: WANTED, accounts: ACCOUNTS, hidden: HIDDEN, content: STATS, snapshots: SNAPSHOTS,
}

/**
 * Pages out of search for their score (dist/_ab/reviews.json), past the content page's list of 30: a review with several
 * notes, one, none, one of a version not kept, one whose own score isn't the page's, a page with no review kept, a page
 * the build has no title for. In CONTENT too, so the app's vectors have the part (titled by their paths: CONTENT's stats
 * have no titles for them).
 */
export const LOW: LowScores = {
  v: 1, bar: 0.75,
  pages: [
    {
      path: '/huong-dan/bon-phan-ray/', kind: 'videoGuide', score: 0.5,
      review: {
        kind: 'video-guide', at: '2026-11-03T09:35:27Z', score: 0.5, kept: true,
        notes: [
          'Remove "Phụ đề tự động của video khá nhiễu, nên những chỗ không rõ được ghi là kinh nghiệm chung...": this mentions the video and its captions, which the guide must not do.',
          'The transcript is very garbled, yet the guide states firm specifics. "Dư phân làm ráy yếu, nhũn và chết nhanh hơn" is only partly supported. Tone down or cut anything the transcript does not clearly back.',
          '"Lá lớn có thể to gần gấp ba ngón tay" and "nuôi cả năm, thậm chí năm rưỡi" come from noisy lines. Keep them hedged & <don\'t> give the figure as firm.',
        ],
      },
    },
    { path: '/ca/ca-boraras-do/', kind: 'fish', score: 0.61, review: { kind: 'translation', at: '2026-11-02T10:00:00Z', score: 0.55, kept: true, notes: ['"Nhiệt độ 20–28°C" is not the source\'s range (24–28°C).'] } },
    { path: '/id/ikan/ikan-boraras/', kind: 'fish', score: 0.62, review: { kind: 'localize', at: '2026-11-04T01:00:00Z', score: 0.62, kept: false, notes: ['The Indonesian name is the Vietnamese one.', 'Units: "inci" where the source has centimetres.'] } },
    { path: '/thuat-ngu/gh/', kind: 'glossary', score: 0.7 },
    { path: '/th/fish/pla-boraras/', kind: 'fish', score: 0.7, review: { kind: 'localize', at: '2026-11-04T01:00:00Z', score: 0.7, kept: true, notes: [] } },
    ...Array.from({ length: 30 }, (_, i) => ({ path: `/ca/ca-${String(i).padStart(2, '0')}/`, kind: 'fish' as const, score: 0.74 })),
  ],
}
export const CONTENT = { now: NOW, tz: TZ, stats: STATS, reads: READS, talk: TALK, clicks: KIND_CLICKS, snapshots: SNAPSHOTS, low: LOW }
/** The sample's content with the build's titles for those pages, and readers for two of them. */
export const LOW_CONTENT = {
  ...CONTENT, low: LOW,
  stats: { ...STATS, pages: { videoGuide: [['/huong-dan/bon-phan-ray/', 'Bón phân cho ráy', 'youtube-x']], fish: [['/ca/ca-boraras-do/', 'Cá boraras đỏ', 'boraras-brigittae'], ['/id/ikan/ikan-boraras/', 'Ikan boraras merah', 'boraras-brigittae']], glossary: [['/thuat-ngu/gh/', 'GH', 'gh']] } } as ContentStats,
  reads: { ...READS, readersOf: { '/ca/ca-boraras-do/': 12, '/thuat-ngu/gh/': 3, '/ca/ca-neon-vua/': 90 } },
}

/** The daily report's section: email on, push on with one phone, and the last three reports (the newest from before push). */
export const REPORTS: ReportsData = {
  now: NOW, tz: TZ,
  delivery: { settings: { email: true, push: true }, phones: 1, keyed: true },
  xs: [
    { id: '1003', when: '2026-11-04T00:00:00.000Z', subject: 'AquaTome daily · 4 Nov · 2 need care', sent: true, push: { sent: 1 }, care: 2 },
    { id: '1002', when: '2026-11-03T00:00:00.000Z', subject: 'AquaTome daily · 3 Nov · nothing needs care', sent: false, why: 'E_RATE_LIMIT_EXCEEDED', push: { sent: 0, why: 'no_device' }, care: 0 },
    { id: '1001', when: '2026-11-02T00:00:00.000Z', subject: 'AquaTome daily · 2 Nov · 1 needs care', sent: true, care: 1 },
  ],
}

/**
 * The readers' beacon from last week's Monday (26 Oct) to now (Wednesday 4 Nov, 16:00 in Vietnam): each day, readers from
 * search who stayed on the page they landed on (answers), readers who came straight in, and visits from search that left
 * at once; a shop click every other day. The scoreboard and the overview read the same rows.
 */
export const BEACON: BeaconRow[] = lastDays(NOW, 10, TZ).flatMap((day, i) => {
  const at = (k: number) => `${day} ${day === '2026-11-04' ? '05' : '02'}:${String(k).padStart(2, '0')}:00`
  const row = (sid: string, t: string, k: number, v = 1, o: Partial<BeaconRow> = {}): BeaconRow => ({ sid, t, p: '/ca/ca-neon-vua/', ref: '', cc: i % 5 ? 'VN' : 'ID', first: at(k), v, n: 1, ...o })
  const google = { ref: 'www.google.com' }
  return [
    ...Array.from({ length: 3 + (i % 4) }, (_, k) => [row(`a${i}-${k}`, 'view', k, 1, google), row(`a${i}-${k}`, 'time', k, 45), ...(k === 0 && i % 2 ? [row(`a${i}-${k}`, 'aff', k)] : [])]).flat(),
    ...Array.from({ length: 2 + (i % 3) }, (_, k) => [row(`d${i}-${k}`, 'view', 10 + k), row(`d${i}-${k}`, 'time', 10 + k, 60)]).flat(),
    ...Array.from({ length: 4 }, (_, k) => row(`b${i}-${k}`, 'view', 20 + k, 1, google)),
  ]
})
/** Before the readers were counted (READERS_FROM): the sample counts them from October. */
export const COUNTING_FROM = '2026-10-01T00:00:00Z'
/** The product changes kept: three in the last 24 hours, one site, one app, one engine, and an older one. */
export const CHANGES: Change[] = [
  { area: 'Site', text: 'Comments held for review now show on the owner\'s dashboard.', at: '2026-11-04T01:00:00Z' },
  { area: 'App', text: 'The tank list loads faster on older phones.', at: '2026-11-03T20:00:00Z' },
  { area: 'Engine', text: 'Species pages no longer show photos of dead fish.', at: '2026-11-03T12:00:00Z' },
  { area: 'Site', text: 'The tank volume calculator fits a phone.', at: '2026-11-01T08:00:00Z' },
]
export const SCOREBOARD_INPUT = {
  now: NOW, owners: ['owner-1'], beacon: BEACON, community: { tanks: [], comments: [{ at: '2026-11-03T02:00:00Z' }], photos: [] }, clicks: { days: days31, clicks: wave(31, i => (i * 7) % 5) },
  app: { sessions: [{ at: '2026-11-03T02:00:00Z' }], actions: [], crashes: [] }, content: STATS, snapshots: SNAPSHOTS, checks: [],
}
export const SCOREBOARD = summariseScoreboard(SCOREBOARD_INPUT)

/**
 * Readers' comments in each state (admin/comments.ts): held by a posting rule, after a signed-in reader's report (two
 * reports, one without a reason) and by a rule on a page this build doesn't have; shown when posted, by the moderator and
 * by the owner; hidden by the owner (shown again within its 30 days) and by the moderator past its 30 days, waiting to be
 * deleted. Newest first in each state, as the page lists them.
 */
export const COMMENT_HELD = '0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
export const COMMENT_REPORTED = '1d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a'
export const COMMENT_SHOWN = '2e3f4a5b-6c7d-4e8f-8a9b-1c2d3e4f5a6b'
export const COMMENT_HIDDEN = '3f4a5b6c-7d8e-4f9a-9b0c-2d3e4f5a6b7c'
export const COMMENT_EXPIRED = '4a5b6c7d-8e9f-4a0b-8c1d-3e4f5a6b7c8d'
const comment = (id: string, o: Partial<CommentRow>): CommentRow => ({ id, entity_ref: 'species:paracheirodon-axelrodi', name: 'Minh', body: 'Bể 60 lít nuôi được mấy con neon vua?', status: 'approved', reason: null, created_at: '2026-11-03T02:00:00.000Z', decided_at: null, reports: [], ...o })
export const COMMENT_ROWS: CommentRow[] = [
  comment(COMMENT_HELD, { name: 'banhmi_fish', body: 'Mình mua neon vua ở shop gần nhà giá rẻ lắm, ai cần thì nhắn zalo: 09xx nhé', status: 'held', reason: 'blocked term: zalo:', created_at: '2026-11-04T07:00:00.000Z' }),
  comment(COMMENT_REPORTED, { entity_ref: 'species:betta-splendens', name: 'tep.do', body: 'Betta nuôi chung với tép được không?\nBể 60 lít của mình có 10 con tép đỏ, sợ bị ăn.', status: 'held', reason: 'reported by a reader', created_at: '2026-11-03T08:00:00.000Z', reports: ['off topic', ''] }),
  comment('5b6c7d8e-9f0a-4b1c-9d2e-4f5a6b7c8d9e', { entity_ref: 'guide:gone-guide', name: 'Hùng <3', body: 'Xem <b>ở đây</b> và www.a.vn, www.b.vn', status: 'held', reason: 'contains <', created_at: '2026-11-02T01:00:00.000Z' }),
  comment(COMMENT_SHOWN, { created_at: '2026-11-04T08:30:00.000Z' }),
  comment('6c7d8e9f-0a1b-4c2d-8e3f-5a6b7c8d9e0f', { name: 'Lan', body: 'Neon vua ăn cám nhỏ, cho ăn ít một.', reason: 'Helpful: a first-hand feeding tip.', created_at: '2026-11-02T10:00:00.000Z', decided_at: '2026-11-03T01:00:00.000Z' }),
  comment('7d8e9f0a-1b2c-4d3e-9f4a-6b7c8d9e0f1a', { name: 'Thảo', body: 'Cảm ơn bài viết!', reason: 'Shown by the owner', created_at: '2026-10-30T10:00:00.000Z', decided_at: '2026-10-31T01:00:00.000Z' }),
  comment(COMMENT_HIDDEN, { name: 'An', body: 'Bán cá giá sỉ, inbox.', status: 'removed', reason: 'Hidden by the owner', created_at: '2026-11-03T05:00:00.000Z', decided_at: '2026-11-03T06:00:00.000Z' }),
  comment(COMMENT_EXPIRED, { name: 'Bình', body: 'Ghé web cá cược ở đây.', status: 'removed', reason: 'Spam: a betting site.', created_at: '2026-09-20T05:00:00.000Z', decided_at: '2026-09-21T06:00:00.000Z' }),
]
/**
 * Five held: the three above, then, past `next` (COMMENT_MORE), the two oldest of the held comments the Worker's test
 * seeds in D1 (owner-api.test.ts), which "more comments" answers. A short first page, so paging shows in the samples.
 */
export const COMMENT_COUNTS: Record<CommentState, number> = { held: 5, shown: 20, hidden: 2 }
/** The held comments the Worker's test seeds past the first two, posted at one moment: they go by id. */
export const COMMENT_FILLER = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
/** The held list's `next`: its second page, FILLER(1) and FILLER(0). */
export const COMMENT_MORE = cursorOf({ created_at: '2026-11-01T00:00:00.000Z', id: COMMENT_FILLER(2) })
export const COMMENT_WEEK: CommentWeek = { posted: 23, heldPosted: 1, reported: 1, hidden: 1 }
/** The sample's pages by D1's key, as content.json gives them; guide:gone-guide isn't one. */
export const COMMENT_PAGES = new Map<string, PageInfo>([
  ['species:paracheirodon-axelrodi', { path: '/ca/ca-neon-vua/', title: 'Cá neon vua', kind: 'fish', id: 'paracheirodon-axelrodi' }],
  ['species:betta-splendens', { path: '/ca/ca-betta/', title: 'Cá betta (cá xiêm)', kind: 'fish', id: 'betta-splendens' }],
])

/**
 * The overview's version 2: a key resting and a source waiting on the owner (faults), today's AI spend past 80% of its
 * cap, the held comments (COMMENT_COUNTS) and two photos waiting.
 */
export const TODAY: Today = {
  ...OVERVIEW, keys: { ...FISH.keys, spend: [{ day: '2026-11-04', usd: 42.5 }, { day: '2026-11-03', usd: 18.2 }] }, beacon: BEACON, countingFrom: COUNTING_FROM, held: COMMENT_COUNTS.held, waitingPhotos: WAITING.map(w => ({ id: w.id })), kept: KEPT.length, crashes: 3,
  lastReport: (REPORTS.xs as Exclude<ReportsData['xs'], { failed: string }>)[0]!, changes: CHANGES,
}
/** Nothing needs the owner: every key working, nothing held or waiting, no source waiting on a browser check. */
export const CALM: Today = {
  ...TODAY, keys: { ...FISH.keys, rows: FISH.keys.rows.map(({ until: _u, ...r }) => ({ ...r, state: 'ok' as const })) }, held: 0, waitingPhotos: [],
  waiting: { comments: 0, photos: 0, oldest: null }, content: { ...STATS, engine: STATS.engine && { ...STATS.engine, needsHuman: [] } }, crashes: 0,
}
