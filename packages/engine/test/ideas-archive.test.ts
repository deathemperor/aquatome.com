import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { ARCHIVE_POLITE, ArchiveFetcher, ArchiveRefused, type ArchiveReader } from '../src/archive'
import type { Llm } from '../src/claude'
import { cycleOnlyHosts } from '../src/cycle-only'
import { ListingRefused, readIdeas, refreshIdeas, writeIdeas, type IdeasState } from '../src/ideas'
import { POST_OTHER_SITES, POST_SHARE, siteOf, topicId } from '../src/topics'

// The owner, 20 Nov 2026: "Pratical fishkeeping: use internet archive" (and 9 Nov: "any site that are often blocked should
// use the same way"). The chief of staff's order of 21 Nov: the magazine's list, and each day the one post behind that
// day's magazine topic, read from the Internet Archive's copies by the engine's own reader, at its pace, never round a
// refusal. Placeholder addresses and text, never the magazine's own.
const PF = 'https://www.practicalfishkeeping.co.uk/'
const AZ = 'https://aquazonefish.vn/blogs/kien-thuc/'
const TL = 'https://cacanhtailoc.com/blogs/tin-tuc/'
const AH = 'https://aquahouse.vn'
const sitemap = (urls: [string, string?][]) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>${u}</loc>${d ? `<lastmod>${d}T08:00:00+00:00</lastmod>` : ''}</url>`).join('')}</urlset>`
const MAGAZINE_MAP = sitemap([[`${PF}features/cloudy-water-explained/`, '2026-05-01'], [`${PF}fishkeeping-answers/why-is-my-water-cloudy/`, '2026-04-01'], [`${PF}beginners-hub/your-first-tank/`], [`${PF}features/a-visit-to-a-planted-tank/`]])
const SHOPS = {
  'https://aquazonefish.vn/sitemap_blogs_1.xml': sitemap([[`${AZ}nuoc-be-ca-bi-duc`, '2026-06-02']]),
  'https://cacanhtailoc.com/sitemap_blogs_1.xml': sitemap([[`${TL}nuoc-be-ca-bi-duc-trang`, '2026-03-01']]),
  [`${AH}/wp-json/wp/v2/categories?slug=tin-tuc-aqua&_fields=id`]: '[{"id":853}]',
  [`${AH}/wp-json/wp/v2/posts?categories=853&per_page=100&page=1&_fields=link,title,date`]: JSON.stringify([{ link: `${AH}/ca-bi-tuot-nhot/`, title: { rendered: 'Cá Bị Tuột Nhớt' }, date: '2026-03-06T10:00:00' }]),
}
function web(pages: Record<string, string>) {
  const asked: string[] = []
  const get = async (u: string) => { asked.push(u); if (!(u in pages)) throw new Error('HTTP 404'); return pages[u]! }
  return { get, asked }
}

const restFile = async () => join(await mkdtemp(join(tmpdir(), 'archive-rest-')), 'rest.json')
const res = (status: number, body: string, date?: string) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n: string) => (n === 'memento-datetime' ? date ?? null : n === 'content-type' ? 'text/html' : null) }, text: async () => body, arrayBuffer: async () => new ArrayBuffer(0) })
/**
 * The engine's own Archive reader (archive.ts) over a stand-in for the Archive: each request it makes, and what it slept.
 * `answer`: the Archive's answer to an address, by what the address asks for.
 */
async function archive(answer: (url: string) => ReturnType<typeof res>, now = '2026-11-21T06:00:00Z', file?: string) {
  const asked: string[] = [], slept: number[] = []
  const rest = file ?? await restFile()
  const reader = new ArchiveFetcher({ fetch: async u => { asked.push(u); return answer(u) }, now: () => new Date(now), sleep: async ms => { slept.push(ms) }, ua: 'AquaTome test', restFile: rest })
  return { reader, asked, slept, rest }
}
const CDX = {
  features: [`http://www.practicalfishkeeping.co.uk:80/features/cloudy-water-explained/`, `https://www.practicalfishkeeping.co.uk/features/something-else/`],
  'fishkeeping-answers': [],
  'beginners-hub': [`https://practicalfishkeeping.co.uk/beginners-hub/your-first-tank`],
} as Record<string, string[]>
/** The Archive holding the magazine's sitemap, and its index listing two of the three posts kept. */
const holding = (url: string) => {
  if (url.includes('/cdx/')) {
    const section = Object.keys(CDX).find(s => decodeURIComponent(url).includes(`/${s}/*`))
    return res(200, `${(section ? CDX[section]! : []).join('\n')}\n`)
  }
  if (url.endsWith('id_/https://www.practicalfishkeeping.co.uk/sitemap-1.xml')) return res(200, MAGAZINE_MAP, 'Tue, 10 Nov 2026 04:00:00 GMT')
  return res(404, '')
}

async function site(blocked = true) {
  const root = await mkdtemp(join(tmpdir(), 'ideas-archive-'))
  await mkdir(join(root, 'content/guides'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_sources.json'), JSON.stringify(blocked ? { practicalfishkeeping: { blockedAt: '2026-11-18T12:30:07.863Z' } } : {}))
  return root
}
const ideasOf = (llm: Llm, get: (u: string) => Promise<string>, a: ArchiveReader | undefined, now = '2026-11-21T06:00:00Z') =>
  ({ get, llm, sleep: async () => {}, now: () => new Date(now), ...(a ? { archive: a } : {}) })
const noIdeas: Llm = async <T>() => ({ ideas: [] }) as T

test("while the magazine's own site refuses, its list is read from the Archive's copy of its sitemap, and the Archive's index says which posts it holds", async () => {
  const root = await site()
  const shops = web(SHOPS)
  const a = await archive(holding)
  const prompts: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => { prompts.push(prompt); return { ideas: [] } as T }
  const slept: number[] = []
  const r = await refreshIdeas(root, { ...ideasOf(llm, shops.get, a.reader), sleep: async (ms: number) => { slept.push(ms) } }, { force: true })
  // The site itself is never asked while its block stands; the shops are.
  const archiveAt = shops.asked.length
  expect(shops.asked.some(u => u.includes('practicalfishkeeping'))).toBe(false)
  expect(shops.asked).toHaveLength(4)
  // The Archive: the sitemap's newest copy, then the index once for each of the three sections, 10 s apart.
  expect(a.asked[0]).toBe('https://web.archive.org/web/20261121id_/https://www.practicalfishkeeping.co.uk/sitemap-1.xml')
  expect(a.asked.slice(1).map(u => decodeURIComponent(u).replace(/^.*url=|\*.*$/g, ''))).toEqual(['www.practicalfishkeeping.co.uk/features/', 'www.practicalfishkeeping.co.uk/fishkeeping-answers/', 'www.practicalfishkeeping.co.uk/beginners-hub/'])
  // The step's own waits: the shops' 5 s between their pages, then the Archive's 10 s between its asks.
  expect(slept.filter(ms => ms === ARCHIVE_POLITE)).toHaveLength(3)
  expect(slept).toHaveLength(archiveAt - 1 + 3)
  // The posts are the sitemap's, through the same parser and the same rules: the visit is still left out.
  const s = await readIdeas(root)
  expect(s.posts.practicalfishkeeping).toEqual([
    { url: `${PF}features/cloudy-water-explained/`, title: 'cloudy water explained', date: '2026-05-01', held: true },
    { url: `${PF}fishkeeping-answers/why-is-my-water-cloudy/`, title: 'why is my water cloudy', date: '2026-04-01' },
    { url: `${PF}beginners-hub/your-first-tank/`, title: 'your first tank', held: true },
  ])
  // The count for the owner: posts listed, and those the index holds a good capture of.
  expect(r.archived.practicalfishkeeping).toEqual({ listed: 3, held: 2 })
  expect(r.blocked).toEqual([])
  expect(r.failed).toEqual([])
  expect(prompts[0]).toContain('cloudy water explained (UK)')
  // Its block stays: the site itself still refuses, and research still keeps off it.
  expect(JSON.parse(await readFile(join(root, 'engine-state/_sources.json'), 'utf8')).practicalfishkeeping.blockedAt).toBe('2026-11-18T12:30:07.863Z')
  expect(await cycleOnlyHosts(root)).toEqual(expect.arrayContaining(['practicalfishkeeping.co.uk', '*.practicalfishkeeping.co.uk', 'archive.org', '*.archive.org']))
})

test('a site that refuses its listing in this run is marked, and read from the Archive in the same run', async () => {
  const root = await site(false)
  const pages = web(SHOPS)
  const get = async (u: string) => { if (u.includes('practicalfishkeeping')) { pages.asked.push(u); throw new ListingRefused('refused, HTTP 403') } return pages.get(u) }
  const a = await archive(holding)
  const r = await refreshIdeas(root, ideasOf(noIdeas, get, a.reader), { force: true })
  expect(r.needsHuman).toEqual(['practicalfishkeeping'])
  expect(r.archived.practicalfishkeeping).toEqual({ listed: 3, held: 2 })
  expect((await readIdeas(root)).posts.practicalfishkeeping).toHaveLength(3)
  expect(r.failed).toEqual([])
})

test("an Archive that refuses stops the magazine's listing at once: its titles stand, nothing more is asked of the Archive, nothing goes round it", async () => {
  const root = await site()
  const kept = [{ url: `${PF}features/old-post/`, title: 'old post' }]
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ readAt: '2026-11-01T00:00:00Z', posts: { practicalfishkeeping: kept }, ideas: [] }))
  const a = await archive(() => res(429, ''))
  const shops = web(SHOPS)
  const r = await refreshIdeas(root, ideasOf(noIdeas, shops.get, a.reader))
  expect(a.asked).toHaveLength(1)
  expect(r.failed).toEqual([expect.stringMatching(/^practicalfishkeeping: the archive refused this Mac: no request before .*, its last titles kept$/)])
  expect((await readIdeas(root)).posts.practicalfishkeeping).toEqual(kept)
  expect(shops.asked.some(u => u.includes('practicalfishkeeping'))).toBe(false)
  // Within the Archive's rest, the next run asks it nothing.
  const again = await archive(holding, '2026-11-21T07:00:00Z', a.rest)
  await refreshIdeas(root, ideasOf(noIdeas, shops.get, again.reader, '2026-11-21T07:00:00Z'), { force: true })
  expect(again.asked).toEqual([])
})

test("the week's wait doesn't hold back a site read through the Archive that has no titles yet: tried once a day, and the ideas made again only when it brings some", async () => {
  const root = await site()
  // Ideas made on 18 Nov from the shops alone: the magazine refused its first listing.
  const state: IdeasState = { readAt: '2026-11-18T12:30:33.269Z', posts: { aquazonefish: [{ url: `${AZ}nuoc-be-ca-bi-duc`, title: 'nuoc be ca bi duc', date: '2026-06-02' }] }, ideas: [{ topic: 'Cá bị tuột nhớt', kind: 'disease', posts: [`${AH}/ca-bi-tuot-nhot/`], sites: 1 }] }
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify(state))
  // The Archive holds no copy today: nothing to make ideas from, so the model isn't called.
  let calls = 0
  const counting: Llm = async <T>() => { calls++; return { ideas: [] } as T }
  const none = await archive(() => res(404, ''))
  const shops = web(SHOPS)
  const first = await refreshIdeas(root, ideasOf(counting, shops.get, none.reader, '2026-11-21T06:00:00Z'))
  expect(first.fresh).toBe(true)
  expect(calls).toBe(0)
  expect(shops.asked).toEqual([])
  expect(none.asked.length).toBeGreaterThan(0)
  // Tried again the same day: not asked again.
  const same = await archive(holding)
  await refreshIdeas(root, ideasOf(counting, shops.get, same.reader, '2026-11-21T18:00:00Z'))
  expect(same.asked).toEqual([])
  // The next day it holds the sitemap: only the magazine is read, the ideas are made again, the shops' read stays on its week.
  const next = await archive(holding, '2026-11-22T06:00:00Z')
  const prompts: string[] = []
  const llm: Llm = async <T>({ prompt }: { prompt: string }) => { prompts.push(prompt); return { ideas: [{ topic: 'Nước đục', kind: 'care', posts: [2] }] } as T }
  const second = await refreshIdeas(root, ideasOf(llm, shops.get, next.reader, '2026-11-22T06:00:00Z'))
  expect(second.fresh).toBe(false)
  expect(shops.asked).toEqual([])
  expect(prompts).toHaveLength(1)
  expect(prompts[0]).toContain('1. nuoc be ca bi duc\n2. cloudy water explained (UK)')
  const s = await readIdeas(root)
  expect(s.readAt).toBe('2026-11-18T12:30:33.269Z')
  expect(s.ideas.map(i => i.topic)).toEqual(['Cá bị tuột nhớt', 'Nước đục'])
  // With its titles in, the week holds again.
  const third = await archive(holding, '2026-11-23T06:00:00Z')
  expect((await refreshIdeas(root, ideasOf(llm, shops.get, third.reader, '2026-11-23T06:00:00Z'))).fresh).toBe(true)
  expect(third.asked).toEqual([])
})

// ---- The day's magazine guide, from its one post ----

const POST = `${PF}features/cloudy-water-explained/`
const ARTICLE = `<!DOCTYPE html><html><head><title>Cloudy water explained | Practical Fishkeeping</title></head><body><header>Menu</header><main><h1>Cloudy water explained</h1><p>Placeholder text about cloudy water and bacterial blooms.</p><img src="https://www.practicalfishkeeping.co.uk/photo.jpg" alt="a photo"></main></body></html>`
const CHALLENGE = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>Checking your browser</body></html>'
const magazineIdea = (topic: string, posts = [POST]) => ({ topic, kind: 'care' as const, posts, sites: 1, fromMagazine: true as const })
const shopIdea = { topic: 'Cửa hàng một', kind: 'care' as const, posts: [`${AZ}nuoc-be-ca-bi-duc`], sites: 1 }

async function waiting(ideas: IdeasState['ideas'], posts: IdeasState['posts'] = { practicalfishkeeping: [{ url: POST, title: 'cloudy water explained', held: true }] }) {
  const root = await site()
  await writeFile(join(root, 'engine-state/_ideas.json'), JSON.stringify({ readAt: '2026-11-21T00:00:00Z', posts, ideas }))
  return root
}
type Facts = { found: boolean; facts: { section: string; fact: string; source: number }[]; species: string[]; sources: { url: string; title: string; kind: string; via?: string }[] }
/** Research that cites `from` the post and `others` facts from other sites, three of them by default. */
const researchCiting = (from: number, others: number, asked: string[], sites = ['https://a.example/x', 'https://b.example/y', 'https://c.example/z']): Llm => async <T>({ prompt }: { prompt: string }) => {
  asked.push(prompt)
  const sources = [{ url: POST, title: 'what research calls it', kind: 'shop', via: 'made up' }, ...sites.map((url, i) => ({ url, title: `Other ${i}`, kind: 'vet' }))]
  const facts = [...Array.from({ length: from }, (_, i) => ({ section: 'causes', fact: `Post fact ${i}.`, source: 0 })), ...Array.from({ length: others }, (_, i) => ({ section: 'prevention', fact: `Other fact ${i}.`, source: 1 + (i % sites.length) }))]
  return { found: true, facts, species: [], sources } satisfies Facts as T
}
const writer: Llm = async <T>({ schema }: { schema: { required?: string[] } }) =>
  (schema.required?.includes('body') ? { name: 'Nước bể cá bị đục', summary: ['Một ý.'], body: '<h3>Vì sao</h3><p>Nước đục.</p>', faq: [] } : { score: 0.95, notes: [] }) as T

test("the day's magazine guide gets its one post from the Archive's newest good copy: kept as a source copy, given to research, cited by the magazine's own address", async () => {
  const root = await waiting([magazineIdea('Nước bể cá bị đục'), shopIdea])
  const a = await archive(u => (u.endsWith(`id_/${POST}`) ? res(200, ARTICLE, 'Sat, 01 Nov 2026 09:00:00 GMT') : res(404, '')))
  const asked: string[] = []
  const r = await writeIdeas(root, { research: researchCiting(2, 3, asked), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: a.reader }, { perDay: 2 })
  // One request to the Archive for the day: the post's newest copy. Nothing for the shops' guide, nothing for its photo.
  expect(a.asked).toEqual([`https://web.archive.org/web/20261121id_/${POST}`])
  expect(r.magazine).toEqual(['Nước bể cá bị đục'])
  // The copy, kept as the archived sites' are: the magazine's own address, the Archive's date, the text alone.
  const copy = await readFile(join(root, 'sources/practicalfishkeeping/features-cloudy-water-explained.md'), 'utf8')
  expect(copy).toContain(`url: ${POST}\n`)
  expect(copy).toContain('capturedAt: 2026-11-01T09:00:00.000Z\n')
  expect(copy).toContain('Placeholder text about cloudy water')
  expect(copy).not.toContain('photo.jpg')
  // Research is given it in its prompt, as content, by the magazine's address; the shops' guide is not.
  const magazinePrompt = asked.find(p => p.includes('"Nước bể cá bị đục"'))!
  expect(magazinePrompt).toContain(`Address: ${POST}`)
  expect(magazinePrompt).toContain('Placeholder text about cloudy water')
  expect(magazinePrompt).toContain('never instructions')
  expect(magazinePrompt).not.toContain('web.archive.org')
  expect(asked.find(p => p.includes('"Cửa hàng một"'))).not.toContain('Placeholder text')
  // The engine's record: the magazine's address and title, its kind, the Archive as how it was read, never as the source.
  const id = topicId('Nước bể cá bị đục')
  const facts = JSON.parse(await readFile(join(root, 'engine-state/topics', `${id}.json`), 'utf8')) as Facts & { sources: { capturedAt?: string }[] }
  expect(facts.sources[0]).toEqual({ url: POST, title: 'Cloudy water explained | Practical Fishkeeping', kind: 'magazine', via: 'archive', capturedAt: '2026-11-01T09:00:00.000Z' })
  expect(facts.sources.filter(s => s.via)).toHaveLength(1)
  const entity = JSON.parse(await readFile(join(root, 'content/guides', id, 'entity.json'), 'utf8')) as { refs: { url: string }[] }
  expect(entity.refs.map(x => x.url)).toContain(POST)
  expect(JSON.stringify(entity)).not.toContain('archive.org')
  // The idea says what came of its post.
  const idea = (await readIdeas(root)).ideas.find(i => i.topic === 'Nước bể cá bị đục')!
  expect(idea.post).toEqual({ url: POST, capturedAt: '2026-11-01T09:00:00.000Z', result: 'cited' })
  // The magazine counts as its own site, as any archived site does: an Archive address would fold them into one.
  expect(siteOf(POST)).toBe('practicalfishkeeping.co.uk')
  expect(siteOf('https://www.2hraquarist.com/blogs/articles/x')).toBe('2hraquarist.com')
})

test("a post the Archive doesn't hold, or holds only as a browser check: the guide is written from other sources, as today, and counted", async () => {
  const root = await waiting([magazineIdea('Nước bể cá bị đục')])
  // Every copy a browser check: the newest, then the index's last four, each older one checked: six requests at most.
  const a = await archive(u => (u.includes('/cdx/') ? res(200, '20250101000000\n20250201000000\n20250301000000\n20250401000000\n') : res(200, CHALLENGE)))
  const asked: string[] = []
  await writeIdeas(root, { research: researchCiting(0, 3, asked), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: a.reader }, { perDay: 2 })
  expect(a.asked).toHaveLength(6)
  expect(asked).toHaveLength(1)
  expect(asked[0]).not.toContain('Address: ')
  const idea = (await readIdeas(root)).ideas[0]!
  expect(idea.post).toEqual({ url: POST, result: 'no copy' })
  expect(idea.guide).toBe(topicId('Nước bể cá bị đục'))
})

test("during the Archive's rest the day's magazine guide waits, its idea untouched, and the shops' guide is written", async () => {
  const root = await waiting([magazineIdea('Nước bể cá bị đục'), shopIdea])
  const resting: ArchiveReader = { get: async () => { throw new ArchiveRefused('2026-11-21T12:21:46.773Z') }, text: async () => { throw new ArchiveRefused('2026-11-21T12:21:46.773Z') } }
  const asked: string[] = []
  const r = await writeIdeas(root, { research: researchCiting(0, 3, asked), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: resting }, { perDay: 2 })
  expect(r.stopped).toContain('the archive refused this Mac: no request before 2026-11-21T12:21:46.773Z')
  expect(r.magazine).toEqual([])
  expect(asked).toHaveLength(1)
  const [magazine, shop] = (await readIdeas(root)).ideas
  expect(magazine).toEqual(magazineIdea('Nước bể cá bị đục'))
  expect(shop!.guide).toBeDefined()
})

test(`no whole-post rewrite: the post may give at most ${POST_SHARE * 100}% of the facts, beside ${POST_OTHER_SITES} other sites, or the guide is written without it`, async () => {
  // Four of the six facts from the post: too much of one source. The guide goes on with the other sites' facts alone.
  const root = await waiting([magazineIdea('Nước bể cá bị đục')])
  const a = await archive(u => (u.endsWith(`id_/${POST}`) ? res(200, ARTICLE) : res(404, '')))
  await writeIdeas(root, { research: researchCiting(4, 2, []), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: a.reader }, { perDay: 2 })
  const id = topicId('Nước bể cá bị đục')
  const refs = (JSON.parse(await readFile(join(root, 'content/guides', id, 'entity.json'), 'utf8')) as { refs: { url: string }[] }).refs.map(x => x.url)
  expect(refs).not.toContain(POST)
  expect(refs).toContain('https://a.example/x')
  expect((await readIdeas(root)).ideas[0]!.post).toMatchObject({ result: 'too much of one source' })
  // Half from the post, the rest from one other site only: still too few other sites.
  const one = await waiting([magazineIdea('Nước bể cá bị đục')])
  await writeIdeas(one, { research: researchCiting(2, 2, [], ['https://a.example/x']), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: (await archive(u => (u.endsWith(`id_/${POST}`) ? res(200, ARTICLE) : res(404, '')))).reader }, { perDay: 2 })
  expect((await readIdeas(one)).ideas[0]!.post).toMatchObject({ result: 'too much of one source' })
  // Half from the post, beside two other sites: written with it.
  const ok = await waiting([magazineIdea('Nước bể cá bị đục')])
  await writeIdeas(ok, { research: researchCiting(2, 2, [], ['https://a.example/x', 'https://b.example/y']), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: (await archive(u => (u.endsWith(`id_/${POST}`) ? res(200, ARTICLE) : res(404, '')))).reader }, { perDay: 2 })
  expect((await readIdeas(ok)).ideas[0]!.post).toMatchObject({ result: 'cited' })
})

test('one post a day, never a crawl: two magazine ideas waiting, a worst case of browser checks, at most six requests a day; a copy already kept is never asked for again', async () => {
  const root = await waiting([magazineIdea('Tạp chí một'), magazineIdea('Tạp chí hai', [`${PF}features/second/`])])
  const answer = (u: string) => (u.includes('/cdx/') ? res(200, '20250101000000\n20250201000000\n20250301000000\n20250401000000\n') : res(200, CHALLENGE))
  const day = async (d: string) => {
    const a = await archive(answer, `${d}T06:00:00Z`)
    await writeIdeas(root, { research: researchCiting(0, 3, []), llm: writer, now: () => new Date(`${d}T06:00:00Z`), archive: a.reader }, { perDay: 2 })
    return a.asked.length
  }
  expect(await day('2026-11-21')).toBe(6)
  expect(await day('2026-11-21')).toBe(0)
  expect(await day('2026-11-22')).toBe(6)
  // A copy the engine already keeps (an earlier try that stopped before research): read from there, nothing asked.
  const kept = await waiting([magazineIdea('Nước bể cá bị đục')])
  await mkdir(join(kept, 'sources/practicalfishkeeping'), { recursive: true })
  await writeFile(join(kept, 'sources/practicalfishkeeping/features-cloudy-water-explained.md'), `---\nurl: ${POST}\ntitle: Cloudy water explained\nfetchedAt: 2026-11-20T00:00:00.000Z\ncapturedAt: 2026-11-01T09:00:00.000Z\nhash: x\n---\n\nKept placeholder text.\n`)
  const a = await archive(() => res(500, ''))
  const asked: string[] = []
  await writeIdeas(kept, { research: researchCiting(1, 3, asked), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: a.reader }, { perDay: 2 })
  expect(a.asked).toEqual([])
  expect(asked[0]).toContain('Kept placeholder text.')
  // The post picked is the first of the idea's the index holds.
  const second = await waiting([magazineIdea('Hai bài', [`${PF}features/not-held/`, POST])], { practicalfishkeeping: [{ url: `${PF}features/not-held/`, title: 'not held' }, { url: POST, title: 'cloudy water explained', held: true }] })
  const b = await archive(u => (u.endsWith(`id_/${POST}`) ? res(200, ARTICLE) : res(404, '')))
  await writeIdeas(second, { research: researchCiting(1, 3, []), llm: writer, now: () => new Date('2026-11-21T06:00:00Z'), archive: b.reader }, { perDay: 2 })
  expect(b.asked).toEqual([`https://web.archive.org/web/20261121id_/${POST}`])
})

// The order of asks on the Archive, whose rest is one for the whole Mac (archive.ts, ~/.cache/aquatome/archive-rest.json):
// in each pages cycle the three sources read through it (The Spruce Pets, Planet Catfish, 2Hr Aquarist) go first, in the
// engine's run; then the magazine's listing, a week apart; then its one post, in the last step. So the magazine asks only
// after the others have read in that cycle, and a refusal it meets rests them only from the next cycle, as theirs rest it.
test("the magazine asks the Archive after the three sites read through it, in every cycle, through the same reader with the same rest", () => {
  const cycle = readFileSync(new URL('../../../scripts/engine-cycle.sh', import.meta.url), 'utf8')
  const run = cycle.indexOf('pnpm engine run --max-minutes'), ideas = cycle.indexOf('pnpm engine ideas'), write = cycle.indexOf('pnpm engine write-ideas')
  expect(run).toBeGreaterThan(0)
  expect(ideas).toBeGreaterThan(run)
  expect(write).toBeGreaterThan(ideas)
  const cli = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8')
  // One reader, made one way: the same name, pace and rest file for every step that reads the Archive.
  expect(cli.match(/new ArchiveFetcher\(/g)).toHaveLength(1)
  expect(cli).toContain("restFile: join(homedir(), '.cache/aquatome/archive-rest.json')")
  expect(cli).toMatch(/refreshIdeas\(ROOT, \{[^}]*archive: archiveReader\(\)/)
  expect(cli).toMatch(/writeIdeas\(ROOT, \{[^}]*archive: archiveReader\(\)/)
})
