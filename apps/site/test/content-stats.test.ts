import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll, QUALITY_THRESHOLD } from '@aq/schema'
import { backfill, bulkEntries } from '../scripts/content-backfill'
import { classify, computeContentStats, h1Of, lastReview, licenceFamily, lowScores, MAX_ATTEMPTS, OTHER_REVIEWS, outForScore, photoOrigin, QUALITY_BAR, REWRITE_V, SCORE_REVIEWS } from '../scripts/content-stats'
import { keepTotals, type ContentStats, type LastReview, type LowScores } from '../worker/admin/content-shape'
import { DIST, page } from './dist'

const CONTENT = fileURLToPath(new URL('./fixture-content', import.meta.url))
const ENGINE = fileURLToPath(new URL('./fixture-engine-state', import.meta.url))
const NOW = new Date('2026-11-02T21:00:00Z')
const stats = computeContentStats({ contentRoot: CONTENT, engineState: ENGINE, dist: DIST, publicBuild: false, now: NOW })

test('the build writes dist/_ab/content.json; the fixture build has no engine state beside its content, so no engine section', () => {
  const file = join(DIST, '_ab', 'content.json')
  expect(existsSync(file)).toBe(true)
  const built = JSON.parse(readFileSync(file, 'utf8')) as ContentStats
  expect(built).toMatchObject({ v: 1, publicBuild: false, engine: null })
  const same = (s: ContentStats) => ({ inventory: s.inventory, built: s.built, pages: s.pages, sources: s.sources, photos: s.photos, totals: s.totals })
  expect(same(built)).toEqual(same(stats))
})

test('inventory: items per kind in content/, and how many have an Indonesian, a Thai and a Malay page', () => {
  // The fixture's Malay: one of each kind the engine writes in it.
  expect(stats.inventory).toEqual({
    fish: { total: 9, id: 0, th: 0, ms: 1 }, breed: { total: 3, id: 0, th: 0, ms: 1 }, plant: { total: 4, id: 0, th: 0, ms: 1 },
    guide: { total: 7, id: 0, th: 0, ms: 1 }, videoGuide: { total: 2, id: 0, th: 0, ms: 0 }, series: { total: 2, id: 0, th: 0, ms: 0 },
    glossary: { total: 5, id: 0, th: 0, ms: 1 }, equipment: { total: 1, id: 0, th: 0, ms: 1 }, place: { total: 12, id: 0, th: 0, ms: 1 }, product: { total: 6, id: 0, th: 0, ms: 0 },
  })
})

test('built pages: every index.html under /, /id/, /th/ and /ms/, by kind, each with its h1 and its item', () => {
  // 181 pages, as markdown.ts counts them (every page under the four languages). Malay's tools are one fewer: no setup budget.
  expect(stats.built!.total).toEqual({ vi: 109, id: 21, th: 21, ms: 30 })
  const n = (vi: number, id = 0, th = 0, ms = 0) => ({ vi, id, th, ms })
  expect(stats.built!.byKind).toMatchObject({ fish: n(9, 0, 0, 1), breed: n(3, 0, 0, 1), plant: n(4, 0, 0, 1), guide: n(7, 0, 0, 1), videoGuide: n(2), glossary: n(5, 0, 0, 1), series: n(1), gallery: n(3, 0, 0, 1), tool: n(7, 7, 7, 6), other: n(10, 5, 5, 5) })
  expect(stats.pages!.fish).toContainEqual(['/ca/ca-neon-vua/', 'Cá neon vua', 'paracheirodon-axelrodi'])
  expect(stats.pages!.breed).toContainEqual(['/ca/ca-la-han/', 'Cá La Hán (Flowerhorn)', 'flowerhorn-cichlid'])
  expect(stats.pages!.videoGuide).toContainEqual(['/huong-dan/bon-phan-cho-cay-thuy-sinh/', 'Bón phân cho cây thủy sinh', 'youtube-r53ZQW0m8VM'])
  expect(stats.pages!.place).toContainEqual(['/nguon-goc/asia/china/', 'Trung Quốc', 'china'])
  expect(stats.pages!.list).toContainEqual(['/th/fish/', 'ทุกสายพันธุ์'])
  // The unlisted material pilot and the about pages (the site's and its data card's), contact, privacy, sign-in and app pages are "other": every other page has its kind.
  expect(stats.pages!.other!.map(r => r[0]).sort()).toEqual(['/chinh-sach-bao-mat/', '/dang-nhap/', '/gioi-thieu/', '/gioi-thieu/bang-du-lieu/', '/id/aplikasi/', '/id/kebijakan-privasi/', '/id/kontak/', '/id/tentang/', '/id/tentang/tabel-data/', '/lien-he/', '/ms/aplikasi/', '/ms/dasar-privasi/', '/ms/hubungi/', '/ms/tentang/', '/ms/tentang/jadual-data/', '/th/about/', '/th/about/data-table/', '/th/contact/', '/th/mobile-app/', '/th/privacy/', '/ung-dung/', '/vat-lieu/', '/vat-lieu/lua-mopani/', '/vat-lieu/lua-sa-tung/', '/vat-lieu/lua/'])
  expect(Buffer.byteLength(JSON.stringify(stats.totals))).toBeLessThan(1024)
})

test('a page\'s kind and item from its address, in each language (slugs are per language; places go by id)', () => {
  const m = (pairs: [string, string][]) => new Map(pairs)
  const none = m([])
  const s = {
    fish: { vi: m([['ca-neon', 'p-innesi']]), id: m([['ikan-neon', 'p-innesi']]), th: m([['pla-neon', 'p-innesi']]), ms: m([['ikan-neon', 'p-innesi']]) },
    breed: { vi: m([['ca-la-han', 'flowerhorn']]), id: none, th: none, ms: none },
    plant: { vi: m([['ray-nana', 'a-nana']]), id: m([['anubias-nana', 'a-nana']]), th: none, ms: none },
    guide: { vi: m([['thay-nuoc', 'g1'], ['bon-phan', 'youtube-x']]), id: m([['ganti-air', 'g1']]), th: none, ms: none },
    video: new Set(['youtube-x']),
    glossary: { vi: m([['ph', 'ph']]), id: m([['ph', 'ph']]), th: m([['ph', 'ph']]), ms: none },
    place: new Set(['asia', 'china']),
    series: { vi: m([['reu-hai', 'PL1']]), id: none, th: none, ms: none },
    product: { vi: m([['oase', 'oase-1']]), id: none, th: none, ms: none },
  }
  expect(classify('/id/ikan/ikan-neon/', s)).toEqual(['fish', 'p-innesi'])
  expect(classify('/th/fish/pla-neon/photos/', s)).toEqual(['gallery', 'p-innesi'])
  expect(classify('/id/ikan/ca-neon/', s)).toEqual(['other']) // the Vietnamese slug isn't the Indonesian page
  expect(classify('/ca/ca-la-han/', s)).toEqual(['breed', 'flowerhorn'])
  expect(classify('/id/tanaman/anubias-nana/', s)).toEqual(['plant', 'a-nana'])
  expect(classify('/huong-dan/bon-phan/', s)).toEqual(['videoGuide', 'youtube-x'])
  expect(classify('/id/panduan/ganti-air/', s)).toEqual(['guide', 'g1'])
  expect(classify('/huong-dan/trang/2/', s)).toEqual(['list'])
  expect(classify('/th/plants/page/3/', s)).toEqual(['list'])
  expect(classify('/video/reu-hai/', s)).toEqual(['series', 'PL1'])
  expect(classify('/video/kenh/green-aqua/', s)).toEqual(['list'])
  expect(classify('/nguon-goc/asia/china/', s)).toEqual(['place', 'china'])
  expect(classify('/id/asal/asia/', s)).toEqual(['place', 'asia'])
  expect(classify('/phan-loai/cichliformes/cichlidae/', s)).toEqual(['taxon'])
  expect(classify('/th/tools/tank-volume/', s)).toEqual(['tool'])
  expect(classify('/ms/ikan/ikan-neon/', s)).toEqual(['fish', 'p-innesi'])
  expect(classify('/ms/alat/isi-padu-tangki/', s)).toEqual(['tool'])
  expect(classify('/id/peralatan/loc/', s)).toEqual(['equipment', 'loc'])
  expect(classify('/san-pham/oase/', s)).toEqual(['product', 'oase-1'])
  expect(classify('/', s)).toEqual(['list'])
  expect(classify('/th/about/', s)).toEqual(['other'])
  expect(h1Of('<h1 class="t">Cá <span>neon</span> &amp; tép&#39;s &#x1F41F;</h1>')).toBe("Cá neon & tép's 🐟")
})

test('gaps on the fish, plant and breed pages, each with its count and the list to act on, staples first', () => {
  const g = stats.gaps
  // Only Cá neon vua's summary is approved (Cá đĩa's is pending).
  expect(g.fish!.noSummary!.n).toBe(8)
  expect(g.fish!.noSummary!.top.map(([p]) => p)).toEqual(['/ca/ca-neon-xanh/', '/ca/ca-dia/', '/ca/ca-ong-tien/', '/ca/tep-red-cherry/', '/ca/ca-phuong-hoang/', '/ca/ca-galaxy/', '/ca/ca-boraras-do/', '/ca/ca-apisto-cacatuoides/'])
  // Cá ông tiên's card has a size but no temperature or pH; its only source (Glaser) writes no profile, and its text is short.
  expect(g.fish!.noKeyFacts).toEqual({ n: 1, top: [['/ca/ca-ong-tien/', 'Cá ông tiên']], by: { tempC: 1, ph: 1, sizeCm: 0 } })
  expect(g.fish!.thin).toEqual({ n: 1, top: [['/ca/ca-ong-tien/', 'Cá ông tiên']] })
  expect([g.fish!.noPhoto!.n, g.fish!.noViName!.n, g.fish!.noId!.n, g.fish!.noTh!.n]).toEqual([0, 0, 9, 9])
  expect(g.plant!.noPhoto).toEqual({ n: 1, top: [['/cay/cay-rau-den-do-mini/', 'Cây rau dền đỏ mini']] })
  expect(g.plant!.noViName).toEqual({ n: 1, top: [['/cay/cryptocoryne-wendtii/', 'Cryptocoryne wendtii']] })
  expect(g.breed!.noPhoto).toEqual({ n: 2, top: [['/ca/ca-la-han/', 'Cá La Hán (Flowerhorn)'], ['/ca/ca-vang-oranda/', 'Cá vàng Oranda']] })
  expect(g.breed!.noKeyFacts!.by).toEqual({ tempC: 1, ph: 2, sizeCm: 1 })
  expect([g.guide!.noId!.n, g.videoGuide!.noTh!.n, g.glossary!.noId!.n]).toEqual([7, 2, 5])
  // Older Vietnamese: every page with text to rewrite, less Cá neon xanh (done) and the term pH (failed under this version).
  // The guide rewritten under version 1 with nothing kept is due again.
  expect([g.fish!.oldVi!.n, g.plant!.oldVi!.n, g.guide!.oldVi!.n, g.glossary!.oldVi!.n]).toEqual([8, 4, 7, 4])
  expect(g.fish!.oldVi!.top.map(([p]) => p)).not.toContain('/ca/ca-neon-xanh/')
  // A page taken down from the dashboard leaves the lists.
  const hidden = computeContentStats({ contentRoot: CONTENT, publicBuild: false, hidden: new Set(['/ca/ca-ong-tien/']), now: NOW })
  expect(hidden.gaps.fish!.thin!.n).toBe(0)
})

test('engine: each source\'s addresses by state, the blocked ones, the video queue, the rewrite and the last run', () => {
  const e = stats.engine!
  expect(e.sources).toEqual([
    { id: '2hraquarist', name: '2Hr Aquarist', found: 0, done: 0, skipped: 0, waiting: 0, failed: 0, blocked: 0 },
    // A page that failed 3 times is given up; one with a try left still waits, as does a new one.
    { id: 'seriouslyfish', name: 'Seriously Fish', found: 7, done: 2, skipped: 1, waiting: 2, failed: 1, blocked: 1, lastAt: '2026-11-02T09:00:00.000Z', discovered: 1800 },
  ])
  expect(e.needsHuman).toEqual([{ source: '2hraquarist', since: '2026-11-02T12:04:44.939Z' }])
  // v1–v5 from the playlist, v5 again and v6 as single videos, v7 and the skipped playlist's v9 left out.
  expect(e.videos).toMatchObject({ listed: 6, written: 1, skipped: 1, waiting: 3, failed: 1, playlists: { queued: 1, skipped: 1 }, singles: { queued: 2, skipped: 1 } })
  // When each guide was written, so the dashboard counts them by its viewer's days (both are within 32 days of the build).
  expect(e.videos.writtenAt).toEqual(['2026-11-01T04:00:00.000Z', '2026-11-02T08:00:00.000Z'])
  expect(e.rewrite).toEqual({ done: 1, waiting: 8 + 4 + 7 + 4, failed: 1 })
  expect(e.lastRun).toEqual({ startedAt: '2026-11-02T18:00:00.000Z', finishedAt: '2026-11-02T20:30:00.000Z', needsHuman: ['2hraquarist'], errors: 1, changed: 2 })
})

test('the engine rules the stats mirror are the engine\'s', () => {
  const src = (f: string) => readFileSync(fileURLToPath(new URL(`../../../packages/engine/src/${f}`, import.meta.url)), 'utf8')
  expect(src('state.ts')).toContain(`export const MAX_ATTEMPTS = ${MAX_ATTEMPTS}\n`)
  expect(src('youtube.ts')).toContain(`s.attempts < ${MAX_ATTEMPTS} &&`)
  expect(src('vi-backfill.ts')).toContain(`export const REWRITE_V = ${REWRITE_V}\n`)
  expect(QUALITY_BAR).toBe(QUALITY_THRESHOLD)
  // Each kind of review the engine keeps either scores a page or doesn't: a new one fails here until it's one or the other.
  const kinds = /export const REVIEW_KINDS = \[([\s\S]*?)\] as const/.exec(src('review-log.ts'))![1]!
  expect([...kinds.matchAll(/^\s*'([a-z-]+)',$/gm)].map(m => m[1]).sort()).toEqual([...SCORE_REVIEWS, ...OTHER_REVIEWS].sort())
})

test('the pages out of search for their score, lowest first, each with its last review (engine-state/reviews, here stand-ins)', () => {
  const low = lowScores({ contentRoot: CONTENT, engineState: ENGINE, publicBuild: false, pages: stats.pages })
  expect(low.bar).toBe(0.75)
  expect(low.pages.map(p => [p.path, p.kind, p.score, p.review?.kind, p.review?.at])).toEqual([
    // The newest review of the version the page has, over an older one it no longer has.
    ['/ca/ca-la-han/', 'breed', 0.6, 'breed', '2026-11-06T09:35:27Z'],
    // The version kept, over a newer rewrite that wasn't kept.
    ['/huong-dan/thay-nuoc-dung-cach/', 'guide', 0.6, 'translation', '2026-11-04T07:00:00Z'],
    // A title's review doesn't score the page: none.
    ['/thuat-ngu/gh/', 'glossary', 0.6, undefined, undefined],
    // Reviewed in parts: the part under the bar says why, over a newer one that passed; the Indonesian page's isn't this one's.
    ['/ca/ca-boraras-do/', 'fish', 0.61, 'translation', '2026-11-05T10:00:00Z'],
  ])
  expect(low.pages.at(-1)!.review).toEqual({
    kind: 'translation', at: '2026-11-05T10:00:00Z', score: 0.61, kept: true,
    notes: ['"Nhiệt độ 20–28°C" is not the source\'s range (24–28°C).', '"Cá sống theo đàn lớn ngoài tự nhiên" is not in the source: <cut it>.', 'Wording: "Đây là loài cá mà nhiều người yêu thích" is a calque. Rewrite it plainly.'],
  })
  // Cá ông tiên is out of search for being thin, at a passing score: not here.
  expect(low.pages.map(p => p.path)).not.toContain('/ca/ca-ong-tien/')
  // The build's file: the same pages, and no review, with no engine state beside the fixture content.
  const built = JSON.parse(readFileSync(join(DIST, '_ab', 'reviews.json'), 'utf8')) as LowScores
  expect(built.pages.map(p => [p.path, p.kind, p.score])).toEqual(low.pages.map(p => [p.path, p.kind, p.score]))
  expect(built.pages.some(p => p.review)).toBe(false)
  expect(lowScores({ contentRoot: CONTENT, publicBuild: false, pages: null }).pages).toEqual([])
})

test('a page listed is one the build keeps out of search for its score: noindex, and so judged by @aq/schema', async () => {
  const listed = lowScores({ contentRoot: CONTENT, engineState: ENGINE, publicBuild: false, pages: stats.pages }).pages
  for (const p of listed) expect(page(p.path).html, p.path).toContain('<meta name="robots" content="noindex')
  const c = await loadAll({ root: CONTENT, lang: 'vi', publicBuild: false })
  const judged = [...c.species, ...c.breeds, ...c.plants, ...c.guides, ...c.glossary, ...c.products].filter(x => !x.t.quality.indexable && x.t.quality.score < QUALITY_THRESHOLD)
  expect(listed.map(p => p.path.split('/').at(-2)).sort()).toEqual(judged.map(x => x.t.slug).sort())
})

test('a page\'s score as the build judges it: a fish\'s or plant\'s shown sources, a fish\'s recorded thin, a passed page never', () => {
  const all = () => true
  const youtube = (s: string) => s === 'youtube'
  expect(outForScore('guides', { score: 0.6, indexable: false }, all)).toBe(0.6)
  // Out of search, but not for its score; a score recorded as passing.
  expect(outForScore('guides', { score: 0.8, indexable: false }, all)).toBeUndefined()
  expect(outForScore('guides', { score: 0.6, indexable: true }, all)).toBeUndefined()
  expect(outForScore('species', undefined, all)).toBeUndefined()
  // A public build scores a fish or a plant by the sources it shows; any other page by its own score.
  const q = { score: 0.6, indexable: false, bySource: { seriouslyfish: 0.6, youtube: 0.9 } }
  expect(outForScore('species', q, all)).toBe(0.6)
  expect(outForScore('species', q, youtube)).toBeUndefined()
  expect(outForScore('plants', { score: 0.6, indexable: false, bySource: { seriouslyfish: 0.9, youtube: 0.6 } }, youtube)).toBe(0.6)
  expect(outForScore('guides', q, youtube)).toBe(0.6)
  // A fish recorded thin: its score alone decides.
  expect(outForScore('species', { score: 0.6, indexable: false, reason: 'thin' }, all)).toBe(0.6)
  expect(outForScore('species', { score: 0.8, indexable: false, reason: 'thin' }, all)).toBeUndefined()
  // No review kept: the newest of those under the bar.
  const t = (at: string, score: number, kept: boolean): LastReview => ({ kind: 'translation', at, score, notes: [], kept })
  expect(lastReview([t('2026-11-01T00:00:00Z', 0.5, false), t('2026-11-03T00:00:00Z', 0.6, false), t('2026-11-04T00:00:00Z', 0.9, false)])!.at).toBe('2026-11-03T00:00:00Z')
  expect(lastReview([])).toBeUndefined()
})

test('a gallery photo that waits for the photo check is on no page, so the count leaves it out', () => {
  const root = mkdtempSync(join(tmpdir(), 'aq-stats-'))
  try {
    mkdirSync(join(root, 'gallery'))
    const p = (n: string, more: object = {}) => ({ url: `https://media.example/${n}.webp`, width: 1200, height: 800, licence: 'CC BY 4.0', author: 'a', sourceUrl: 'x', ...more })
    writeFileSync(join(root, 'gallery/x.json'), JSON.stringify({ id: 'x', photos: [p('shown'), p('waits', { unchecked: true })] }))
    writeFileSync(join(root, 'gallery/y.json'), JSON.stringify({ id: 'y', photos: [p('waits-too', { unchecked: true })] }))
    expect(computeContentStats({ contentRoot: root, publicBuild: false, now: NOW }).photos.gallery).toEqual({ pages: 1, photos: 1 })
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('sources and photos: what each source gives the pages, and where photos come from', () => {
  expect(stats.sources.seriouslyfish).toEqual({ name: 'Seriously Fish', fish: 7, plant: 0, guide: 0 })
  expect(stats.sources.youtube).toEqual({ name: 'YouTube', fish: 0, plant: 0, guide: 2 })
  expect(stats.photos.covered).toEqual({ fish: { with: 9, of: 9 }, plant: { with: 3, of: 4 }, breed: { with: 1, of: 3 } })
  expect(stats.photos.pages).toBe(14)
  expect(stats.totals.photos).toEqual({ pages: 14, gallery: 60 })
  expect(licenceFamily({ licence: 'CC BY-SA 3.0 de' })).toBe('CC BY-SA')
  expect(licenceFamily({ licence: 'dùng với sự cho phép', source: 'seriouslyfish' })).toBe('permission')
  expect(photoOrigin({ url: 'https://media.aquatome.com/commons/ab.webp' })).toBe('commons')
  expect(photoOrigin({ url: 'https://media.aquatome.com/x.webp', source: 'scotcat' })).toBe('scotcat')
  // The fixture's photos are on Wikimedia's own host, which a public build leaves out until they are mirrored; the Pigeon
  // Blood discus's own photo is Unsplash's, hot-linked as Unsplash asks, never mirrored.
  expect(stats.photos.waitingMirror).toBe(12)
  // A public build shows only sources with permission: the fixture's are all held back but YouTube, so no fish or plant
  // page is left; of the breeds' photos, the Commons one waits for our media host and the Unsplash one shows.
  const pub = computeContentStats({ contentRoot: CONTENT, publicBuild: true, now: NOW })
  expect(Object.keys(pub.sources)).toEqual(['youtube'])
  expect(pub.photos.covered).toEqual({ fish: { with: 0, of: 0 }, plant: { with: 0, of: 0 }, breed: { with: 1, of: 3 } })
  expect(pub.gaps.fish!.noSummary!.n).toBe(0)
  expect(pub.photos.waitingMirror).toBe(1)
})

test('backfill: each past day\'s totals from the last commit of the day, as entries for wrangler kv bulk put', () => {
  const repo = mkdtempSync(join(tmpdir(), 'aq-backfill-test-'))
  try {
    const git = (date: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-C', repo, ...args], { env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } })
    const fish = (id: string, extra = {}) => {
      mkdirSync(join(repo, 'content/species', id), { recursive: true })
      writeFileSync(join(repo, 'content/species', id, 'entity.json'), JSON.stringify({ id, scientificName: id, sections: [{ key: 'diet', source: 'youtube', html: 'x' }], photos: [], dataCard: {}, ...extra }))
      writeFileSync(join(repo, 'content/species', id, 'vi.json'), JSON.stringify({ slug: id, name: id }))
    }
    git('2026-10-28T10:00:00Z', 'init', '-q')
    mkdirSync(join(repo, 'content'))
    writeFileSync(join(repo, 'content/sources.json'), JSON.stringify({ youtube: { name: 'YouTube', publish: true } }))
    fish('a')
    git('2026-10-28T10:00:00Z', 'add', '-A')
    git('2026-10-28T10:00:00Z', 'commit', '-qm', 'one')
    fish('b')
    writeFileSync(join(repo, 'content/species/b/id.json'), JSON.stringify({ slug: 'b', name: 'b' }))
    git('2026-10-30T23:00:00Z', 'add', '-A')
    git('2026-10-30T23:00:00Z', 'commit', '-qm', 'two')
    const days = backfill(repo, 'HEAD', '2026-10-31')
    expect(days.map(d => [d.day, d.totals.kinds.fish, d.totals.sources.youtube])).toEqual([['2026-10-28', { vi: 1, id: 0, th: 0, ms: 0 }, 1], ['2026-10-29', { vi: 1, id: 0, th: 0, ms: 0 }, 1], ['2026-10-30', { vi: 2, id: 1, th: 0, ms: 0 }, 2]])
    expect(days.every(d => d.totals.built === null)).toBe(true)
    const entries = bulkEntries(days)
    const kept = keepTotals(days[0]!.totals)
    expect(entries[0]).toEqual({ key: 'stats:2026-10-28', value: JSON.stringify(kept), metadata: kept })
    // Today is the daily snapshot's.
    expect(backfill(repo, 'HEAD', '2026-10-30').map(d => d.day)).toEqual(['2026-10-28', '2026-10-29'])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
