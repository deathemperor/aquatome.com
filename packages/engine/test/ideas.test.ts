import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { nameStep } from '../src/ceiling'
import { LlmError, type Llm } from '../src/claude'
import { cycleOnlyHosts } from '../src/cycle-only'
import { dropPosts, IDEA_SOURCES, ListingRefused, listingText, listPosts, MAGAZINE_PER_DAY, readIdeas, refreshIdeas, writeIdeas, type IdeasState } from '../src/ideas'
import { sourceBlockedSince } from '../src/state'

// Shaped like the shops' own sitemaps and WordPress answers: placeholder titles, never the shops' text.
const sitemap = (urls: [string, string?][]) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>${u}</loc>${d ? `<lastmod>${d}T08:00:00+07:00</lastmod>` : ''}</url>`).join('')}</urlset>`
const AZ = 'https://aquazonefish.vn/blogs/kien-thuc/'
const TL = 'https://cacanhtailoc.com/blogs/tin-tuc/'
const AH = 'https://aquahouse.vn'
const PF = 'https://www.practicalfishkeeping.co.uk/'
const wpPosts = (n: number, from = 0) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ link: `${AH}/post-${from + i}/`, title: { rendered: `Post ${from + i} &#8211; <b>A</b> &amp; B` }, date: '2026-05-0' + (1 + (i % 9)) + 'T10:00:00' })))

function web(pages: Record<string, string>) {
  const asked: string[] = []
  const get = async (u: string) => { asked.push(u); if (!(u in pages)) throw new Error('HTTP 404'); return pages[u]! }
  return { get, asked }
}
const PAGES = {
  'https://aquazonefish.vn/sitemap_blogs_1.xml': sitemap([[`${AZ}nuoc-be-ca-bi-duc`, '2026-06-02'], [`${AZ}cach-xu-ly-tao`, '2024-07-01'], ['https://aquazonefish.vn/blogs/news/sale', '2026-06-01']]),
  'https://cacanhtailoc.com/sitemap_blogs_1.xml': sitemap([[`${TL}nuoc-be-ca-bi-duc-trang`, '2026-03-01'], ['https://cacanhtailoc.com/blogs/bao-gia/bao-gia', '2026-01-01'], [`${TL}Bad_Slug`]]),
  [`${AH}/wp-json/wp/v2/categories?slug=tin-tuc-aqua&_fields=id`]: '[{"id":853}]',
  [`${AH}/wp-json/wp/v2/posts?categories=853&per_page=100&page=1&_fields=link,title,date`]: JSON.stringify([{ link: `${AH}/ca-bi-tuot-nhot/`, title: { rendered: 'Cá Bị Tuột Nhớt' }, date: '2026-03-06T10:00:00' }, { link: `${AH}/ho-ca-bi-tao-xanh/`, title: { rendered: 'Hồ cá bị tảo xanh &#8211; cách xử lý' }, date: '2026-01-10T10:00:00' }]),
  // The magazine's: its features, readers' questions and beginners' pages; never its news, gear, galleries or readers' tank visits.
  [`${PF}sitemap-1.xml`]: sitemap([[`${PF}features/cloudy-water-explained/`, '2026-05-01'], [`${PF}fishkeeping-answers/why-is-my-water-cloudy/`, '2026-04-01'], [`${PF}beginners-hub/your-first-tank/`],
    [`${PF}readers-visits/a-readers-fish-room/`, '2026-06-01'], [`${PF}fishkeeping-news/a-show-this-weekend/`, '2026-06-02'], [`${PF}gear/a-filter-on-test/`], [`${PF}features/a/nested/`]]),
}

async function site(guides: Record<string, string> = { 'be-moi-chu-trinh-nito': 'Chu trình nitơ cho bể mới' }) {
  const root = await mkdtemp(join(tmpdir(), 'ideas-'))
  for (const [id, name] of Object.entries(guides)) {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'vi.json'), JSON.stringify({ name }))
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // The engine's record of its sources: what research, and the leads it is given, keep to (cycle-only.ts).
  await writeFile(join(root, 'engine-state/_sources.json'), '{}')
  return root
}
const deps = (get: (u: string) => Promise<string>, llm: Llm, now = '2026-11-03T00:00:00Z') => {
  const slept: number[] = []
  return { d: { get, llm, sleep: async (ms: number) => { slept.push(ms) }, now: () => new Date(now) }, slept }
}

test('a sitemap: the blog\'s posts only, titled by their address\'s words, with their date; a WordPress category: every page of 100, titles unescaped', async () => {
  const { get } = web(PAGES)
  expect(await listPosts({ kind: 'sitemap', url: 'https://cacanhtailoc.com/sitemap_blogs_1.xml', prefix: TL }, get)).toEqual([
    { url: `${TL}nuoc-be-ca-bi-duc-trang`, title: 'nuoc be ca bi duc trang', date: '2026-03-01' },
  ])
  const wp = web({
    [`${AH}/wp-json/wp/v2/categories?slug=tin-tuc-aqua&_fields=id`]: '[{"id":7}]',
    [`${AH}/wp-json/wp/v2/posts?categories=7&per_page=100&page=1&_fields=link,title,date`]: wpPosts(100),
    [`${AH}/wp-json/wp/v2/posts?categories=7&per_page=100&page=2&_fields=link,title,date`]: wpPosts(3, 100),
  })
  const posts = await listPosts({ kind: 'wordpress', base: AH, category: 'tin-tuc-aqua' }, wp.get)
  expect(posts).toHaveLength(103)
  expect(posts[0]).toEqual({ url: `${AH}/post-0/`, title: 'Post 0 – A & B', date: '2026-05-01' })
  expect(wp.asked).toHaveLength(3)
  await expect(listPosts({ kind: 'wordpress', base: AH, category: 'none' }, web({ [`${AH}/wp-json/wp/v2/categories?slug=none&_fields=id`]: '[]' }).get)).rejects.toThrow('no category none')
})

// The owner's word through the chief of staff, 13 Nov: a British magazine's topics. Its features, readers' questions and
// beginners' pages only; never its readers' tank visits, a page about someone's tank whose photos we couldn't show (14 Nov).
test("the magazine's sitemap: its features, readers' questions and beginners' pages, under any of its prefixes; nothing else", async () => {
  const magazine = IDEA_SOURCES.find(s => s.id === 'practicalfishkeeping')!
  expect(magazine.magazine).toBe(true)
  expect(await listPosts(magazine.list, web(PAGES).get)).toEqual([
    { url: `${PF}features/cloudy-water-explained/`, title: 'cloudy water explained', date: '2026-05-01' },
    { url: `${PF}fishkeeping-answers/why-is-my-water-cloudy/`, title: 'why is my water cloudy', date: '2026-04-01' },
    { url: `${PF}beginners-hub/your-first-tank/`, title: 'your first tank' },
  ])
})

test('ideas: the shops\' titles and the handbook\'s guides go to the model; its topics kept most asked first; one already written never comes back; a week fresh', async () => {
  const root = await site()
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ posts: {}, ideas: [{ topic: 'Tảo xanh trong bể', kind: 'disease', posts: [], sites: 1, guide: 'aquatome-tao-xanh-trong-be' }], written: {} }))
  const { get, asked } = web(PAGES)
  const prompts: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => {
    prompts.push(prompt)
    return { ideas: [
      { topic: 'Tảo xanh trong bể', kind: 'disease', posts: [2, 4] }, // written already
      { topic: 'Cá thiếu oxy', kind: 'care', posts: [99] }, // no such post
      { topic: 'Nước bể cá bị đục trắng: nguyên nhân và cách xử lý', kind: 'disease', posts: [1, 5, 1] },
      { topic: 'Feng shui', kind: 'luck', posts: [4] }, // not a kind
      { topic: 'Cá bị tuột nhớt', kind: 'disease', posts: [3] },
      { topic: 'Nước bể cá bị đục trắng: nguyên nhân và cách xử lý', kind: 'care', posts: [5] }, // the same topic twice
    ] } as T
  }
  const { d, slept } = deps(get, llm)
  const r = await refreshIdeas(root, d)
  expect(r).toMatchObject({ fresh: false, posts: 8, ideas: 2, failed: [] })
  expect(slept).toEqual(Array(asked.length - 1).fill(5000))
  expect(prompts[0]).toContain('1. nuoc be ca bi duc')
  expect(prompts[0]).toContain('Hồ cá bị tảo xanh – cách xử lý')
  expect(prompts[0]).toContain('- Chu trình nitơ cho bể mới')
  expect(prompts[0]).not.toContain('sale')
  // The magazine's last, each marked (UK), with what only fits the UK left out; the shops' unmarked.
  expect(prompts[0]).toContain('6. cloudy water explained (UK)\n7. why is my water cloudy (UK)\n8. your first tank (UK)\n')
  expect(prompts[0]).toContain('1. nuoc be ca bi duc\n')
  expect(prompts[0]).toContain('From the magazine, also what only fits the UK')
  expect(prompts[0]).not.toMatch(/fish room|a show this weekend|a filter on test/)
  const s = await readIdeas(root)
  expect(s.ideas.map(i => [i.topic, i.sites, i.posts.length, i.latest])).toEqual([
    ['Nước bể cá bị đục trắng: nguyên nhân và cách xử lý', 2, 2, '2026-06-02'],
    ['Cá bị tuột nhớt', 1, 1, '2026-03-06'],
    ['Tảo xanh trong bể', 1, 0, undefined],
  ])
  expect(s.ideas[0]!.posts).toEqual([`${AZ}nuoc-be-ca-bi-duc`, `${TL}nuoc-be-ca-bi-duc-trang`])
  // Six days on: still fresh, nothing fetched. Eight days on, with one site down: its last titles stand.
  const again = web(PAGES)
  expect(await refreshIdeas(root, deps(again.get, llm, '2026-11-09T00:00:00Z').d)).toMatchObject({ fresh: true })
  expect(again.asked).toEqual([])
  const down = web(Object.fromEntries(Object.entries(PAGES).filter(([u]) => !u.includes('cacanhtailoc'))))
  const later = await refreshIdeas(root, deps(down.get, llm, '2026-11-11T00:00:00Z').d)
  expect(later.failed).toEqual(['cacanhtailoc: HTTP 404, its last titles kept'])
  expect(later.posts).toBe(8)
})

test('writing: the most asked idea first, its shops\' posts as leads that say never to copy them; the day\'s cap; a guide already there is not rewritten', async () => {
  const root = await site({ 'aquatome-ca-bi-tuot-nhot': 'Cá bị tuột nhớt' })
  const state: IdeasState = {
    readAt: '2026-11-03T00:00:00Z',
    // The magazine's post saved in a shop's list too, and a marketplace's: research is given neither, told by the address.
    posts: {
      aquazonefish: [{ url: `${AZ}nuoc-be-ca-bi-duc`, title: 'nuoc be ca bi duc' }, { url: `${PF}features/water-clarity/`, title: 'water clarity' }, { url: 'https://shopee.vn/thuoc-tri-nuoc-duc-i.1.2', title: 'thuoc tri nuoc duc' }, { url: 'https://www.tokopedia.com/toko/obat-air-keruh', title: 'obat air keruh' }],
      practicalfishkeeping: [{ url: `${PF}features/cloudy-water-explained/`, title: 'cloudy water explained' }],
    },
    ideas: [
      { topic: 'Cá bị tuột nhớt', kind: 'disease', posts: [], sites: 1 },
      { topic: 'Nước bể cá bị đục trắng', kind: 'disease', posts: [`${AZ}nuoc-be-ca-bi-duc`, `${PF}features/cloudy-water-explained/`, `${PF}features/water-clarity/`, 'https://shopee.vn/thuoc-tri-nuoc-duc-i.1.2', 'https://www.tokopedia.com/toko/obat-air-keruh'], sites: 2 },
      { topic: 'Cá thiếu oxy', kind: 'care', posts: [], sites: 1 },
    ],
    written: { '2026-09-01': 3 },
    magazine: {},
  }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify(state))
  const asked: string[] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => { asked.push(prompt); return { found: false, facts: [], species: [], sources: [] } as T }
  const now = (t: string) => () => new Date(t)
  const r = await writeIdeas(root, { research, llm: research, now: now('2026-11-03T05:00:00Z') }, { perDay: 1 })
  expect(r).toMatchObject({ written: [], skipped: ['Nước bể cá bị đục trắng: nothing reliable found'], failed: [], stopped: '' })
  expect(asked).toHaveLength(1)
  expect(asked[0]).toContain('"Nước bể cá bị đục trắng"')
  expect(asked[0]).toContain(`- ${AZ}nuoc-be-ca-bi-duc (nuoc be ca bi duc)`)
  expect(asked[0]).toContain('never copy or translate their text')
  // Research never opens the magazine (the chief of staff, 14 Nov 2026), so its posts aren't given, on an idea of a shop's
  // too, whichever list one was saved in; nor a marketplace's.
  expect(asked[0]).not.toContain('practicalfishkeeping')
  expect(asked[0]).not.toContain('shopee')
  expect(asked[0]).not.toContain('tokopedia')
  expect(asked[0]).not.toContain('British fishkeeping magazine')
  let s = await readIdeas(root)
  expect(s.ideas.map(i => i.guide ?? i.skipped ?? '')).toEqual(['aquatome-ca-bi-tuot-nhot', 'Nước bể cá bị đục trắng: nothing reliable found', ''])
  // The idea keeps when research was spent on it, what the day counts; the old days' counts are gone.
  expect(s.ideas.map(i => i.at)).toEqual([undefined, '2026-11-03T05:00:00.000Z', undefined])
  expect(s.written).toBeUndefined()
  // Today's count stops a second run.
  expect((await writeIdeas(root, { research, llm: research, now: now('2026-11-03T08:00:00Z') }, { perDay: 1 })).skipped).toEqual([])
  expect(asked).toHaveLength(1)
  // The next day, a model out of quota: stopped, the idea left for later and nothing counted.
  const tired: Llm = async () => { throw new LlmError('usage limit') }
  expect(await writeIdeas(root, { research: tired, llm: tired, now: now('2026-11-04T00:00:00Z') }, { perDay: 1 })).toMatchObject({ stopped: 'usage limit' })
  s = await readIdeas(root)
  expect(s.ideas[2]).not.toHaveProperty('skipped')
  expect(s.ideas[2]).not.toHaveProperty('at')
  expect(JSON.parse(await readFile(join(root, 'engine-state/_ideas.json'), 'utf8')).ideas).toHaveLength(3)
})

test('a guide is started only when what\'s left of the day\'s line covers its last one too: in the cloud, $3 a day from 13 Nov', async () => {
  // The chief of staff, 2026-11-12: on 12 Nov the step spent its $1 line on 7 of a guide's 9 calls and wrote nothing.
  // A guide costs $1.28 to $1.37; the cloud's line is $3 (two guides). The Mac's stays $0: the step runs in the cloud.
  const root = await site({})
  const state: IdeasState = { readAt: '2026-11-13T00:00:00Z', posts: {}, ideas: [{ topic: 'Cá thiếu oxy', kind: 'care', posts: [], sites: 1 }], written: {}, magazine: {} }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify(state))
  const log = join(root, 'aquatome-cost-rewrite.jsonl')
  const piece = (at: string, usd: number) => JSON.stringify({ at, step: 'write-ideas', piece: `x ${at}`, pieceUsd: usd, finished: true })
  const asked: string[] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => { asked.push(prompt); return { found: false, facts: [], species: [], sources: [] } as T }
  const github = process.env.GITHUB_ACTIONS
  process.env.GITHUB_ACTIONS = 'true'
  process.env.ENGINE_COST_LOG = log
  nameStep('write-ideas')
  try {
    // $1.65 spent today: $1.35 left covers the $1.30 middle, but not the $1.37 last guide.
    await writeFile(log, [piece('2026-11-10T09:00:00Z', 1.28), piece('2026-11-11T09:00:00Z', 1.3), piece('2026-11-11T10:00:00Z', 1.37), JSON.stringify({ at: '2026-11-13T04:00:00Z', step: 'write-ideas', usd: 1.65 })].join('\n') + '\n')
    const r = await writeIdeas(root, { research, llm: research, now: () => new Date('2026-11-13T05:00:00Z') }, { perDay: 2 })
    expect(r.stopped).toContain('not started: $1.35 left, a piece costs about $1.37')
    expect(asked).toEqual([])
    expect((await readIdeas(root)).ideas[0]).not.toHaveProperty('skipped')
    // $1 spent today: $2 left, and it starts.
    await writeFile(log, [piece('2026-11-10T09:00:00Z', 1.28), piece('2026-11-11T09:00:00Z', 1.3), piece('2026-11-11T10:00:00Z', 1.37), JSON.stringify({ at: '2026-11-13T04:00:00Z', step: 'write-ideas', usd: 1 })].join('\n') + '\n')
    expect((await writeIdeas(root, { research, llm: research, now: () => new Date('2026-11-13T05:00:00Z') }, { perDay: 2 })).stopped).toBe('')
    expect(asked).toHaveLength(1)
  } finally {
    process.env.ENGINE_COST_LOG = 'off'
    nameStep(undefined)
    if (github === undefined) delete process.env.GITHUB_ACTIONS
    else process.env.GITHUB_ACTIONS = github
  }
})

// The chief of staff, 14 Nov 2026: a challenge page answered with 200 became an empty listing and replaced the saved titles,
// and a 403 or a 429 marked nothing. For every site read for ideas: a listing that comes back empty, or isn't a listing,
// never replaces its saved titles; a refusal marks the site as needing the owner, and its fetches stop. A refusal is told
// by shape, never by a challenge page's words: a 403, a 429, or an answer of 200 that isn't the listing.
const CHALLENGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Checking your browser before accessing.</body></html>'
/** The engine's own fetch (cli.ts): each address's status and body, through listingText. */
function answers(pages: Record<string, [number, string]>) {
  const asked: string[] = []
  const get = async (u: string) => { asked.push(u); const [status, body] = pages[u] ?? [404, 'Not found']; return listingText(new Response(body, { status })) }
  return { get, asked }
}

test('a refusal is told by shape: a 403, a 429, or a 200 that is not the listing needs the owner; a 404, a 5xx or a time-out is a failure only', async () => {
  expect(await listingText(new Response('<urlset></urlset>', { status: 200 }))).toBe('<urlset></urlset>')
  for (const [status, body] of [[403, 'Forbidden'], [429, '']] as const)
    await expect(listingText(new Response(body, { status })), String(status)).rejects.toBeInstanceOf(ListingRefused)
  // A browser check answered with a 503 is a failure: the site is tried again next time, and nothing is marked.
  for (const [status, body] of [[404, 'Not found'], [500, 'Server error'], [503, CHALLENGE]] as const) {
    const e = await listingText(new Response(body, { status })).catch((x: unknown) => x)
    expect(e, String(status)).toBeInstanceOf(Error)
    expect(e, String(status)).not.toBeInstanceOf(ListingRefused)
  }
  const page = (body: string) => async () => body
  const map = { kind: 'sitemap', url: 'https://aquazonefish.vn/sitemap_blogs_1.xml', prefix: AZ } as const
  const wp = { kind: 'wordpress', base: AH, category: 'tin-tuc-aqua' } as const
  // Answered with 200, anything but the listing is a refusal, whatever its words: a challenge page in any words, one whose
  // words start past its first 600 characters, a page of the site's own, a page holding a urlset in its text.
  const late = `<!DOCTYPE html><html><head>${'<meta name="x" content="y">'.repeat(40)}</head><body>Just a moment...</body></html>`
  const holding = `<!DOCTYPE html><html><body><pre>${sitemap([[`${AZ}nuoc-be-ca-bi-duc`]])}</pre></body></html>`
  for (const body of [CHALLENGE, late, '<html><body>A shop</body></html>', holding, '', 'Please wait'])
    await expect(listPosts(map, page(body)), body.slice(0, 40)).rejects.toBeInstanceOf(ListingRefused)
  // A sitemap of another site's pages is not this one's listing.
  await expect(listPosts(map, page(sitemap([['https://elsewhere.example/blogs/kien-thuc/x']])))).rejects.toBeInstanceOf(ListingRefused)
  for (const body of [CHALLENGE, late, '<html><body>A shop</body></html>', '{"code":"rest_no_route"}'])
    await expect(listPosts(wp, page(body)), body.slice(0, 40)).rejects.toBeInstanceOf(ListingRefused)
  // A list of posts on another host is not this site's.
  const elsewhere = web({ [`${AH}/wp-json/wp/v2/categories?slug=tin-tuc-aqua&_fields=id`]: '[{"id":7}]', [`${AH}/wp-json/wp/v2/posts?categories=7&per_page=100&page=1&_fields=link,title,date`]: JSON.stringify([{ link: 'https://elsewhere.example/a/', title: { rendered: 'A' }, date: '2026-01-01T00:00:00' }]) })
  await expect(listPosts(wp, elsewhere.get)).rejects.toBeInstanceOf(ListingRefused)
  // The listing's own shape passes, with a stylesheet's instruction and a comment before it, its host with or without "www.".
  const styled = `\uFEFF<?xml version="1.0"?>\n<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>\n<!-- a comment -->\n${sitemap([[`https://www.aquazonefish.vn/blogs/kien-thuc/x`], [`${AZ}nuoc-be-ca-bi-duc`]]).replace(/^<\?xml[^>]*>/, '')}`
  expect((await listPosts(map, page(styled))).map(p => p.title)).toEqual(['nuoc be ca bi duc'])
  // A body that fails on its way, after a 200's headers (a time-out), is a failure, never an empty listing.
  const broken = new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<?xml version="1.0"?><urlset>')); c.error(new DOMException('The operation was aborted due to timeout', 'TimeoutError')) } }), { status: 200 })
  const cut = await listingText(broken).catch((x: unknown) => x)
  expect(cut).toBeInstanceOf(Error)
  expect(cut).not.toBeInstanceOf(ListingRefused)
  // The category gone is the site's own answer: a failure, nothing refused.
  const gone = await listPosts(wp, web({ [`${AH}/wp-json/wp/v2/categories?slug=tin-tuc-aqua&_fields=id`]: '[]' }).get).catch((x: unknown) => x)
  expect(gone).not.toBeInstanceOf(ListingRefused)
})

test('a listing that is empty or not a listing keeps the saved titles; a refused one marks its site, which is not fetched again until a retry', async () => {
  const root = await site()
  const saved: IdeasState['posts'] = {
    aquazonefish: [{ url: `${AZ}nuoc-be-ca-bi-duc`, title: 'nuoc be ca bi duc' }],
    aquahouse: [{ url: `${AH}/ca-bi-tuot-nhot/`, title: 'Cá Bị Tuột Nhớt' }],
    cacanhtailoc: [{ url: `${TL}nuoc-be-ca-bi-duc-trang`, title: 'nuoc be ca bi duc trang' }],
    practicalfishkeeping: [{ url: `${PF}features/cloudy-water-explained/`, title: 'cloudy water explained' }],
  }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ readAt: '2026-11-01T00:00:00Z', posts: saved, ideas: [], written: {} }))
  await writeFile(join(root, 'engine-state/_sources.json'), '{}')
  const llm: Llm = async <T>() => ({ ideas: [] }) as T
  const web1 = answers({
    'https://aquazonefish.vn/sitemap_blogs_1.xml': [200, CHALLENGE], // a browser check answered with 200
    [`${AH}/wp-json/wp/v2/categories?slug=tin-tuc-aqua&_fields=id`]: [200, '<html><body>Maintenance</body></html>'], // not a listing
    'https://cacanhtailoc.com/sitemap_blogs_1.xml': [200, sitemap([['https://cacanhtailoc.com/blogs/bao-gia/bao-gia']])], // its sitemap, nothing under its blog
    [`${PF}sitemap-1.xml`]: [403, 'Forbidden'],
  })
  const r = await refreshIdeas(root, deps(web1.get, llm, '2026-11-14T00:00:00Z').d)
  expect(r.needsHuman).toEqual(['aquazonefish', 'aquahouse', 'practicalfishkeeping'])
  expect(r.failed).toEqual([
    'aquazonefish: refused, not a sitemap of its own pages, its last titles kept',
    'aquahouse: refused, not a list of categories, its last titles kept',
    'cacanhtailoc: an empty listing, its last titles kept',
    'practicalfishkeeping: refused, HTTP 403, its last titles kept',
  ])
  expect((await readIdeas(root)).posts).toEqual(saved)
  expect(await sourceBlockedSince(root, 'aquazonefish')).toBe('2026-11-14T00:00:00.000Z')
  expect(await sourceBlockedSince(root, 'aquahouse')).toBe('2026-11-14T00:00:00.000Z')
  expect(await sourceBlockedSince(root, 'practicalfishkeeping')).toBe('2026-11-14T00:00:00.000Z')
  expect(await sourceBlockedSince(root, 'cacanhtailoc')).toBeUndefined()
  // The dashboard's "needs you" reads that record; research keeps off a shop that refused us as it does off the cycle's.
  expect(await cycleOnlyHosts(root)).toEqual(expect.arrayContaining(['aquazonefish.vn', '*.aquazonefish.vn']))
  // Forced a day on: the refused sites aren't fetched, nor marked again.
  const web2 = answers(Object.fromEntries(Object.entries(PAGES).map(([u, b]) => [u, [200, b] as [number, string]])))
  const again = await refreshIdeas(root, deps(web2.get, llm, '2026-11-15T00:00:00Z').d, { force: true })
  expect(again.blocked).toEqual(['aquazonefish', 'aquahouse', 'practicalfishkeeping'])
  expect(web2.asked.filter(u => u.includes('aquazonefish') || u.includes('aquahouse') || u.includes('practicalfishkeeping'))).toEqual([])
  expect((await readIdeas(root)).posts.aquazonefish).toEqual(saved.aquazonefish)
  expect(await sourceBlockedSince(root, 'aquazonefish')).toBe('2026-11-14T00:00:00.000Z')
  // Once the owner has looked, a retry reads them; a good listing clears the mark, and research may open the shop again.
  const web3 = answers(Object.fromEntries(Object.entries(PAGES).map(([u, b]) => [u, [200, b] as [number, string]])))
  const retried = await refreshIdeas(root, deps(web3.get, llm, '2026-11-16T00:00:00Z').d, { force: true, retryBlocked: true })
  expect(retried).toMatchObject({ needsHuman: [], blocked: [], failed: [] })
  expect(await sourceBlockedSince(root, 'aquazonefish')).toBeUndefined()
  expect(await sourceBlockedSince(root, 'aquahouse')).toBeUndefined()
  expect(await sourceBlockedSince(root, 'practicalfishkeeping')).toBeUndefined()
  expect((await readIdeas(root)).posts.aquazonefish!.map(p => p.url)).toEqual([`${AZ}nuoc-be-ca-bi-duc`, `${AZ}cach-xu-ly-tao`])
  expect(await cycleOnlyHosts(root)).not.toContain('aquazonefish.vn')
  // A 5xx with a challenge page, or a time-out: the titles kept, nothing marked.
  const web4 = answers({ 'https://aquazonefish.vn/sitemap_blogs_1.xml': [503, CHALLENGE] })
  const slow = async (u: string) => { if (u.includes('aquahouse')) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); return web4.get(u) }
  const down = await refreshIdeas(root, deps(slow, llm, '2026-11-24T00:00:00Z').d, { force: true })
  expect(down.needsHuman).toEqual([])
  expect(await sourceBlockedSince(root, 'aquazonefish')).toBeUndefined()
  expect(await sourceBlockedSince(root, 'aquahouse')).toBeUndefined()
  expect((await readIdeas(root)).posts.aquazonefish!.map(p => p.url)).toEqual([`${AZ}nuoc-be-ca-bi-duc`, `${AZ}cach-xu-ly-tao`])
})

// The chief of staff, 14 Nov 2026: a plain word filter on the magazine's addresses for the clear cases, each rule's count
// printed with the posts that survive (the owner's figure). Placeholder addresses, never the magazine's own.
test("the magazine's word rules leave out posts about someone, not a topic, and count each rule", async () => {
  const rules = IDEA_SOURCES.find(s => s.id === 'practicalfishkeeping')!.drop!
  const post = (slug: string) => ({ url: `${PF}features/${slug}/`, title: slug.replace(/-/g, ' ') })
  const out = ['a-visit-to-a-planted-tank', 'visiting-a-breeder', 'inside-a-keepers-fish-room', 'a-day-in-the-fishhouse', 'readers-tank-a-planted-60',
    'tank-of-the-month-a-reef', 'an-interview-with-a-breeder', 'a-day-in-the-life-of-a-keeper', 'a-breeder-shares-her-way', 'profile-a-tetra',
    'obituary-a-keeper', 'a-tribute-to-a-keeper', 'a-filter-review', 'reviewed-a-light', 'a-light-on-test', 'win-a-tank', 'readers-poll-the-winners',
    'news-a-show-this-weekend', 'a-shop-tour', 'shop-of-the-month-a-store']
  const kept = ['how-to-set-up-a-fish-room', 'meet-the-rainbowfish', 'how-to-win-against-algae', 'contest-style-aquascapes', 'winter-care', 'reviewing-your-water-changes',
    'how-often-should-water-be-tested', 'the-water-profile-of-a-river']
  const r = dropPosts([...out, ...kept].map(post), rules)
  expect(r.kept.map(p => p.title)).toEqual(kept.map(k => k.replace(/-/g, ' ')))
  expect(r.dropped).toEqual({ 'a visit': 2, 'a fish room': 2, "a reader's tank": 2, 'an interview': 3, 'a profile': 1, 'an obituary': 2, 'a review': 3, 'a competition': 2, news: 1, 'a shop tour': 2 })
  // Each post left out by its title, under its rule: the run prints them (cli.ts).
  expect(Object.values(r.titles).flat().sort()).toEqual(out.map(o => o.replace(/-/g, ' ')).sort())
  expect(r.titles['a visit']).toEqual(['a visit to a planted tank', 'visiting a breeder'])
  // The shops have no rules. A refresh keeps what's left and reports each rule's count.
  expect(IDEA_SOURCES.filter(s => s.drop).map(s => s.id)).toEqual(['practicalfishkeeping'])
  const root = await site()
  const pages = { ...PAGES, [`${PF}sitemap-1.xml`]: sitemap([[`${PF}features/cloudy-water-explained/`], [`${PF}features/a-visit-to-a-planted-tank/`], [`${PF}fishkeeping-answers/a-filter-review/`], [`${PF}beginners-hub/your-first-tank/`]]) }
  const report = await refreshIdeas(root, deps(web(pages).get, async <T>() => ({ ideas: [] }) as T).d)
  expect(report.listed.practicalfishkeeping).toEqual({ kept: 2, dropped: { ...Object.fromEntries(rules.map(([n]) => [n, 0])), 'a visit': 1, 'a review': 1 }, titles: { 'a visit': ['a visit to a planted tank'], 'a review': ['a filter review'] } })
  expect((await readIdeas(root)).posts.practicalfishkeeping!.map(p => p.title)).toEqual(['cloudy water explained', 'your first tank'])
  expect(report.listed.aquazonefish).toEqual({ kept: 2, dropped: {}, titles: {} })
})

// The chief of staff, 14 Nov 2026: the magazine's ideas are listed behind the shops', so its 1,365 titles never push the
// shops' 61 out; and it gets one of the day's two guides from the start, at most one, the shops keeping the other.
test("the magazine's ideas are listed behind the shops', a shop's idea ranks by the shops alone, and the magazine has one of a day's two guides", async () => {
  const root = await site({})
  const llm: Llm = async <T>() => ({ ideas: [
    { topic: 'Ba bài của tạp chí', kind: 'care', posts: [6, 7, 8] }, // the magazine's only: last, whatever its count
    { topic: 'Một cửa hàng và tạp chí', kind: 'care', posts: [3, 6, 7] }, // one shop's post, and the magazine's
    { topic: 'Hai cửa hàng', kind: 'disease', posts: [1, 5] }, // two shops
  ] }) as T
  await refreshIdeas(root, deps(web(PAGES).get, llm).d)
  const s = await readIdeas(root)
  expect(s.ideas.map(i => [i.topic, i.fromMagazine ?? false])).toEqual([['Hai cửa hàng', false], ['Một cửa hàng và tạp chí', false], ['Ba bài của tạp chí', true]])
  expect(MAGAZINE_PER_DAY).toBe(1)
  const shop = (n: number) => ({ topic: `Cửa hàng ${n}`, kind: 'care', posts: [`${AZ}nuoc-be-ca-bi-duc`], sites: 1 })
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ ...s, ideas: [shop(1), shop(2), shop(3), shop(4),
    { topic: 'Tạp chí một', kind: 'care', posts: [`${PF}features/cloudy-water-explained/`], sites: 1, fromMagazine: true },
    { topic: 'Tạp chí hai', kind: 'care', posts: [`${PF}fishkeeping-answers/why-is-my-water-cloudy/`], sites: 1, fromMagazine: true },
  ] }))
  const asked: string[] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => { asked.push(prompt); return { found: false, facts: [], species: [], sources: [] } as T }
  const day = async (d: string) => {
    const from = asked.length
    const r = await writeIdeas(root, { research, llm: research, now: () => new Date(`${d}T05:00:00Z`) }, { perDay: 2 })
    return { r, topics: asked.slice(from).map(a => /"((?:Cửa hàng|Tạp chí) [^"]+)"/.exec(a)?.[1]) }
  }
  // The first day: the most asked shop idea and the magazine's first, though four shop ideas wait ahead of it.
  const one = await day('2026-11-14')
  expect(one.topics).toEqual(['Cửa hàng 1', 'Tạp chí một'])
  expect(one.r.magazine).toEqual(['Tạp chí một'])
  expect((await readIdeas(root)).ideas.find(i => i.topic === 'Tạp chí một')!.at).toBe('2026-11-14T05:00:00.000Z')
  // A run later the same day: the day's two are written.
  expect((await day('2026-11-14')).topics).toEqual([])
  expect((await day('2026-11-15')).topics).toEqual(['Cửa hàng 2', 'Tạp chí hai'])
  // None of the magazine's left: the shops have both.
  const three = await day('2026-11-16')
  expect(three.topics).toEqual(['Cửa hàng 3', 'Cửa hàng 4'])
  expect(three.r.magazine).toEqual([])
})

// The chief of staff, 14 Nov 2026: the day was counted in UTC while the engine's ceilings count Vietnam's, and the count was
// saved only once the run ended. Now one day, the ceilings' own, counted from the ideas research was spent on that day, each
// saved as it is spent; and a model that stops for the shops' guide still lets the magazine's be tried.
test("the day's guides are counted in Vietnam's day, from each idea's own time, saved as each is spent; a stop on one side leaves the other", async () => {
  const root = await site({})
  const shop = (n: number) => ({ topic: `Cửa hàng ${n}`, kind: 'care', posts: [`${AZ}nuoc-be-ca-bi-duc`], sites: 1 })
  const magazine = { topic: 'Tạp chí một', kind: 'care', posts: [`${PF}features/cloudy-water-explained/`], sites: 1, fromMagazine: true }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ posts: {}, ideas: [shop(1), shop(2), shop(3)] }))
  const asked: string[] = []
  const onDisk: (string | undefined)[][] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => {
    asked.push(/"((?:Cửa hàng|Tạp chí) [^"]+)"/.exec(prompt)![1]!)
    onDisk.push(JSON.parse(await readFile(join(root, 'engine-state/_ideas.json'), 'utf8')).ideas.map((i: { at?: string }) => i.at))
    return { found: false, facts: [], species: [], sources: [] } as T
  }
  const run = (at: string, perDay: number, r: Llm = research) => writeIdeas(root, { research: r, llm: r, now: () => new Date(at) }, { perDay })
  // 23:00 in Vietnam on the 14th (16:00 UTC): the shops' one guide of the day.
  await run('2026-11-14T16:00:00Z', 1)
  expect(asked).toEqual(['Cửa hàng 1'])
  // 01:00 in Vietnam on the 15th, still the 14th in UTC: a new day, and its guide.
  await run('2026-11-14T18:00:00Z', 1)
  expect(asked).toEqual(['Cửa hàng 1', 'Cửa hàng 2'])
  // The first idea's time was on disk before the second's research began: a run that dies mid-way has counted it.
  expect(onDisk[1]![0]).toBe('2026-11-14T16:00:00.000Z')
  // The same Vietnamese day, later: nothing more.
  await run('2026-11-15T10:00:00Z', 1)
  expect(asked).toHaveLength(2)
  // The 16th, with one of the magazine's waiting: the shops' guide stops on the model's quota; the magazine's is still
  // tried, and only it counts.
  const file = join(root, 'engine-state/_ideas.json')
  const before = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...before, ideas: [...before.ideas, magazine] }))
  const shopsOut: Llm = async <T>(a: { prompt: string; system: string; schema: object; model?: string }) => {
    if (a.prompt.includes('"Cửa hàng')) throw new LlmError('usage limit')
    return research<T>(a)
  }
  const r = await run('2026-11-16T03:00:00Z', 2, shopsOut)
  expect(r.stopped).toBe('usage limit')
  expect(r.magazine).toEqual(['Tạp chí một'])
  const s = await readIdeas(root)
  expect(s.ideas.map(i => [i.topic, i.at ?? '', i.skipped ?? ''])).toEqual([
    ['Cửa hàng 1', '2026-11-14T16:00:00.000Z', expect.stringContaining('nothing reliable')],
    ['Cửa hàng 2', '2026-11-14T18:00:00.000Z', expect.stringContaining('nothing reliable')],
    ['Cửa hàng 3', '', ''],
    ['Tạp chí một', '2026-11-16T03:00:00.000Z', expect.stringContaining('nothing reliable')],
  ])
})

test("the count kept by day before ideas kept their own time still holds that day, and goes the next", async () => {
  const root = await site({})
  const idea = { topic: 'Cửa hàng 1', kind: 'care', posts: [`${AZ}nuoc-be-ca-bi-duc`], sites: 1 }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ posts: {}, ideas: [idea], written: { '2026-11-13': 2, '2026-11-14': 1 }, magazine: {} }))
  const asked: string[] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => { asked.push(prompt); return { found: false, facts: [], species: [], sources: [] } as T }
  await writeIdeas(root, { research, llm: research, now: () => new Date('2026-11-14T09:00:00Z') }, { perDay: 1 })
  expect(asked).toEqual([])
  expect((await readIdeas(root)).written).toEqual({ '2026-11-14': 1 })
  await writeIdeas(root, { research, llm: research, now: () => new Date('2026-11-15T03:00:00Z') }, { perDay: 1 })
  expect(asked).toHaveLength(1)
  const s = await readIdeas(root)
  expect(s.written).toBeUndefined()
  expect(s.magazine).toBeUndefined()
})

// The chief of staff, 14 Nov 2026: a refresh kept only the ideas written or skipped, so an idea still waiting went whenever
// the model's answer left it out; and a shop's idea was ranked by every post on it, the magazine's too.
test("a refresh keeps a waiting idea the model leaves out; a shop's idea's ties are broken by the shops' posts and dates alone", async () => {
  const root = await site({})
  const waiting = { topic: 'Cá thiếu oxy', kind: 'care', posts: [`${TL}ca-thieu-oxy`], sites: 1, latest: '2023-01-01' }
  const done = { topic: 'Tảo xanh', kind: 'disease', posts: [], sites: 1, guide: 'aquatome-tao-xanh' }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ posts: { cacanhtailoc: [{ url: `${TL}ca-thieu-oxy`, title: 'ca thieu oxy', date: '2023-01-01' }] }, ideas: [waiting, done] }))
  // Posts, numbered as the prompt lists them: 1 and 2 AquaZone's (2026-06-02, 2024-07-01), 3 and 4 Aqua House's, 5 Tài
  // Lộc's (2026-03-01), 6 to 8 the magazine's (2026-05-01, 2026-04-01).
  const llm: Llm = async <T>() => ({ ideas: [
    { topic: 'Một bài cửa hàng cũ, hai bài tạp chí', kind: 'care', posts: [2, 6, 7] }, // one shop's post (2024), the magazine's two newer
    { topic: 'Một bài cửa hàng mới', kind: 'care', posts: [5] }, // one shop's post (2026)
  ] }) as T
  const r = await refreshIdeas(root, deps(web(PAGES).get, llm, '2026-11-14T00:00:00Z').d)
  expect(r.ideas).toBe(2)
  const s = await readIdeas(root)
  expect(s.ideas.map(i => i.topic)).toEqual(['Một bài cửa hàng mới', 'Một bài cửa hàng cũ, hai bài tạp chí', 'Cá thiếu oxy', 'Tảo xanh'])
  expect(s.ideas[2]).toEqual(waiting)
})

// Codex's read of be5a1f9d7, 14 Nov 2026: a run that passes Vietnam's midnight kept counting the day it began, so the
// ideas it finished after midnight counted toward neither day.
test("a run that passes midnight counts the new day's guides from then on", async () => {
  const root = await site({})
  const shop = (n: number) => ({ topic: `Cửa hàng ${n}`, kind: 'care', posts: [`${AZ}nuoc-be-ca-bi-duc`], sites: 1 })
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ posts: {}, ideas: [1, 2, 3, 4, 5].map(shop) }))
  // 23:50 in Vietnam; each guide's research takes 30 minutes.
  let clock = Date.parse('2026-11-14T16:50:00Z')
  const asked: string[] = []
  const research: Llm = async <T>({ prompt }: { prompt: string }) => { asked.push(prompt); clock += 30 * 60_000; return { found: false, facts: [], species: [], sources: [] } as T }
  await writeIdeas(root, { research, llm: research, now: () => new Date(clock) }, { perDay: 2 })
  // The first finishes at 00:20 on the 15th and counts for it; the second too; then the 15th's two are spent.
  expect(asked).toHaveLength(2)
  expect((await readIdeas(root)).ideas.map(i => i.at ?? '')).toEqual(['2026-11-14T17:20:00.000Z', '2026-11-14T17:50:00.000Z', '', '', ''])
})

// Codex's read of be5a1f9d7: a waiting idea kept through refreshes outlives the saved posts it was made from, so its
// magazine posts were taken for a shop's. A post is the magazine's by its host.
test("a waiting idea kept through refreshes still tells its shops' posts from the magazine's", async () => {
  const root = await site({})
  const mixed = { topic: 'Một cửa hàng, hai bài tạp chí', kind: 'care', posts: [`${AZ}cach-xu-ly-tao`, `${PF}features/a/`, `${PF}features/b/`], sites: 2, latest: '2024-07-01' }
  const two = { topic: 'Hai cửa hàng', kind: 'care', posts: [`${AZ}nuoc-be-ca-bi-duc`, `${TL}nuoc-be-ca-bi-duc-trang`], sites: 2, latest: '2026-06-02' }
  // Neither idea's posts are among the saved titles any more: two refreshes have passed since they were made.
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ posts: {}, ideas: [mixed, two] }))
  const none: Llm = async <T>() => ({ ideas: [] }) as T
  await refreshIdeas(root, deps(web(PAGES).get, none, '2026-11-14T00:00:00Z').d)
  expect((await readIdeas(root)).ideas.map(i => i.topic)).toEqual(['Hai cửa hàng', 'Một cửa hàng, hai bài tạp chí'])
  await refreshIdeas(root, deps(web(PAGES).get, none, '2026-11-22T00:00:00Z').d)
  expect((await readIdeas(root)).ideas.map(i => i.topic)).toEqual(['Hai cửa hàng', 'Một cửa hàng, hai bài tạp chí'])
})
