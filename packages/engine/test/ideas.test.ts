import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { nameStep } from '../src/ceiling'
import { LlmError, type Llm } from '../src/claude'
import { listPosts, readIdeas, refreshIdeas, writeIdeas, type IdeasState } from '../src/ideas'

// Shaped like the shops' own sitemaps and WordPress answers: placeholder titles, never the shops' text.
const sitemap = (urls: [string, string?][]) => `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, d]) => `<url><loc>${u}</loc>${d ? `<lastmod>${d}T08:00:00+07:00</lastmod>` : ''}</url>`).join('')}</urlset>`
const AZ = 'https://aquazonefish.vn/blogs/kien-thuc/'
const TL = 'https://cacanhtailoc.com/blogs/tin-tuc/'
const AH = 'https://aquahouse.vn'
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
}

async function site(guides: Record<string, string> = { 'be-moi-chu-trinh-nito': 'Chu trình nitơ cho bể mới' }) {
  const root = await mkdtemp(join(tmpdir(), 'ideas-'))
  for (const [id, name] of Object.entries(guides)) {
    await mkdir(join(root, 'content/guides', id), { recursive: true })
    await writeFile(join(root, 'content/guides', id, 'vi.json'), JSON.stringify({ name }))
  }
  await mkdir(join(root, 'engine-state'), { recursive: true })
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
  expect(r).toMatchObject({ fresh: false, posts: 5, ideas: 2, failed: [] })
  expect(slept).toEqual(Array(asked.length - 1).fill(5000))
  expect(prompts[0]).toContain('1. nuoc be ca bi duc')
  expect(prompts[0]).toContain('Hồ cá bị tảo xanh – cách xử lý')
  expect(prompts[0]).toContain('- Chu trình nitơ cho bể mới')
  expect(prompts[0]).not.toContain('sale')
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
  expect(later.failed).toEqual(['cacanhtailoc: HTTP 404'])
  expect(later.posts).toBe(5)
})

test('writing: the most asked idea first, its shops\' posts as leads that say never to copy them; the day\'s cap; a guide already there is not rewritten', async () => {
  const root = await site({ 'aquatome-ca-bi-tuot-nhot': 'Cá bị tuột nhớt' })
  const state: IdeasState = {
    readAt: '2026-11-03T00:00:00Z',
    posts: { aquazonefish: [{ url: `${AZ}nuoc-be-ca-bi-duc`, title: 'nuoc be ca bi duc' }] },
    ideas: [
      { topic: 'Cá bị tuột nhớt', kind: 'disease', posts: [], sites: 1 },
      { topic: 'Nước bể cá bị đục trắng', kind: 'disease', posts: [`${AZ}nuoc-be-ca-bi-duc`], sites: 2 },
      { topic: 'Cá thiếu oxy', kind: 'care', posts: [], sites: 1 },
    ],
    written: { '2026-09-01': 3 },
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
  let s = await readIdeas(root)
  expect(s.ideas.map(i => i.guide ?? i.skipped ?? '')).toEqual(['aquatome-ca-bi-tuot-nhot', 'Nước bể cá bị đục trắng: nothing reliable found', ''])
  // Old days are dropped; today's count stops a second run.
  expect(s.written).toEqual({ '2026-11-03': 1 })
  expect((await writeIdeas(root, { research, llm: research, now: now('2026-11-03T08:00:00Z') }, { perDay: 1 })).skipped).toEqual([])
  expect(asked).toHaveLength(1)
  // The next day, a model out of quota: stopped, the idea left for later and nothing counted.
  const tired: Llm = async () => { throw new LlmError('usage limit') }
  expect(await writeIdeas(root, { research: tired, llm: tired, now: now('2026-11-04T00:00:00Z') }, { perDay: 1 })).toMatchObject({ stopped: 'usage limit' })
  s = await readIdeas(root)
  expect(s.ideas[2]).not.toHaveProperty('skipped')
  expect(s.written['2026-11-04']).toBeUndefined()
  expect(JSON.parse(await readFile(join(root, 'engine-state/_ideas.json'), 'utf8')).ideas).toHaveLength(3)
})

test('a guide is started only when what\'s left of the day\'s line covers a typical one: in the cloud, $3 a day from 13 Nov', async () => {
  // The chief of staff, 2026-11-12: on 12 Nov the step spent its $1 line on 7 of a guide's 9 calls and wrote nothing.
  // A guide costs $1.28 to $1.37; the cloud's line is $3 (two guides). The Mac's stays $0: the step runs in the cloud.
  const root = await site({})
  const state: IdeasState = { readAt: '2026-11-13T00:00:00Z', posts: {}, ideas: [{ topic: 'Cá thiếu oxy', kind: 'care', posts: [], sites: 1 }], written: {} }
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
    // $1.80 spent today: $1.20 left, under a guide.
    await writeFile(log, [piece('2026-11-10T09:00:00Z', 1.28), piece('2026-11-11T09:00:00Z', 1.3), piece('2026-11-11T10:00:00Z', 1.37), JSON.stringify({ at: '2026-11-13T04:00:00Z', step: 'write-ideas', usd: 1.8 })].join('\n') + '\n')
    const r = await writeIdeas(root, { research, llm: research, now: () => new Date('2026-11-13T05:00:00Z') }, { perDay: 2 })
    expect(r.stopped).toContain('not started: $1.20 left, a piece costs about $1.30')
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
