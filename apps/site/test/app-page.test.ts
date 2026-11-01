import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { PageDoc, PageShard, pageShard, shardCount, type Block, type Inline } from '@aq/schema/app-page'
import { appGuides, type AppIndex } from '../src/lib/app-index'
import { guideDoc, listedPaths, proseBlocks } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { GUIDE_KIND_LABELS } from '../src/lib/format'
import { guideParts } from '../src/lib/guide-page'
import { LANGS, translator } from '../src/lib/i18n'
import { htmlBlocks } from '../src/lib/page-blocks'
import { DIST, page } from './dist'

// The app draws guides from these files instead of loading the web page: what they hold must be the page.
type Vectors = {
  html: { note: string; html: string; blocks: Block[]; unknown?: string[] }[]
  shards: { path: string; shards: number; n: number }[]
  docs: { note: string; valid: boolean; doc: unknown; blocks: string[] }[]
}
const v: Vectors = JSON.parse(readFileSync(new URL('../../../protocols/page-vectors.json', import.meta.url), 'utf8'))
const CONTENT = fileURLToPath(new URL('../../../content/', import.meta.url))
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
const textOf = (c: Inline[] = []) => c.map(r => (typeof r === 'string' ? r : r.text)).join('')
const pagesOf = (d: PageDoc) => d.blocks.flatMap(b => (b.t === 'pages' ? b.paths : []))
/** Every link in a page: inline ones, in lists too, and the credit's. */
const hrefsOf = (d: PageDoc): string[] => {
  const runs = (c: Inline[] = []) => c.flatMap(r => (typeof r === 'string' || !r.href ? [] : [r.href]))
  const walk = (bs: Block[]): string[] => bs.flatMap(b =>
    b.t === 'p' ? runs(b.c) : b.t === 'list' ? b.items.flatMap(walk) : b.t === 'figure' ? [...runs(b.caption), ...(b.href ? [b.href] : [])]
      : b.t === 'table' ? [...(b.head ?? []), ...b.rows.flat()].flatMap(runs) : [])
  return [...runs(d.credit), ...walk(d.blocks)]
}

test.each(v.html)('converts: $note', c => {
  expect(htmlBlocks(c.html)).toEqual({ blocks: c.blocks, unknown: c.unknown ?? [] })
})

test.each(v.shards)('$path is in shard $n of $shards', c => {
  expect(pageShard(c.path, c.shards)).toBe(c.n)
})

test('about 8 pages a shard, a power of two', () => {
  expect([0, 1, 8, 9, 16, 17, 249, 1016].map(shardCount)).toEqual([1, 1, 1, 2, 2, 4, 32, 128])
})

test('every content file\'s text converts: nothing the app would have to send to the web', () => {
  const unknown = new Map<string, string>()
  let n = 0
  for (const kind of ['guides', 'species', 'plants', 'breeds']) {
    for (const id of readdirSync(CONTENT + kind)) {
      for (const lang of LANGS) {
        const f = `${CONTENT}${kind}/${id}/${lang}.json`
        if (!existsSync(f)) continue
        const t = JSON.parse(readFileSync(f, 'utf8')) as { body?: string; sections?: Record<string, string> }
        for (const html of [t.body, ...Object.values(t.sections ?? {})]) {
          if (typeof html !== 'string' || !html) continue
          n++
          for (const u of htmlBlocks(html).unknown) unknown.set(u, `${kind}/${id}/${lang}`)
        }
      }
    }
  }
  expect(n).toBeGreaterThan(100)
  expect([...unknown]).toEqual([])
}, 60_000) // about 17,000 texts: a second alone, more beside the other tests

test('every guide converts as its page shows it (links, photos, a video\'s pictures), and is the format', async () => {
  let n = 0
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const listed = listedPaths(lang, c)
    for (const g of appGuides(lang, c)) {
      n++
      expect(proseBlocks(lang, guideParts(lang, c, g).prose).unknown, g.id).toEqual([])
      expect(PageDoc.safeParse(guideDoc(lang, c, g, listed)).error, g.id).toBeUndefined()
    }
  }
  expect(n).toBeGreaterThan(0)
})

test('a guide\'s header line, credit and lead photo read as its built page\'s', async () => {
  const c = await getContent('vi')
  const listed = listedPaths('vi', c)
  let leads = 0
  for (const g of appGuides('vi', c)) {
    const d = guideDoc('vi', c, g, listed)
    const { dom } = page(d.path)
    expect(d.title, d.path).toBe(clean(dom.querySelector('h1')!.textContent))
    expect(d.meta, d.path).toBe(clean(dom.querySelector('.kind')!.textContent))
    expect(textOf(d.credit), d.path).toBe(clean(dom.querySelector('.credit')!.textContent))
    const lead = dom.querySelector('img.lead')
    expect(d.lead?.src, d.path).toBe(lead?.getAttribute('src'))
    if (d.lead) {
      leads++
      expect(d.lead.credit?.text, d.path).toMatch(/^Ảnh: \S/)
      expect(d.lead.credit?.licence, d.path).toBeTruthy()
    }
  }
  expect(leads).toBeGreaterThan(0)
})

// The fixture's guides have no summary, FAQ or sources: one with all three.
const withExtras = (c: Content) => {
  const g = appGuides('vi', c).find(g => !g.video)!
  return { ...g, t: { ...g.t, summary: ['Thay một phần tư nước mỗi tuần.'], faq: [{ q: 'Thay bao nhiêu?', a: 'Một phần tư.' }], refs: [{ title: 'Thay nước cho bể cá', url: 'https://example.org/thay-nuoc' }] } }
}

test('a guide\'s summary comes first, its FAQ and sources after the text, the sources where the credit links', async () => {
  const c = await getContent('vi')
  const d = guideDoc('vi', c, withExtras(c), listedPaths('vi', c))
  expect(d.blocks[0]).toEqual({ t: 'summary', title: 'Tóm tắt nhanh', items: ['Thay một phần tư nước mỗi tuần.'] })
  expect(d.blocks.find(b => b.t === 'faq')).toEqual({ t: 'faq', title: 'Câu hỏi thường gặp', items: [{ q: 'Thay bao nhiêu?', a: 'Một phần tư.' }] })
  expect(d.blocks.find(b => b.t === 'refs')).toEqual({ t: 'refs', title: 'Nguồn tham khảo', id: 'nguon', items: [{ title: 'Thay nước cho bể cá', url: 'https://example.org/thay-nuoc' }] })
  const order = d.blocks.map(b => b.t)
  expect(order.indexOf('faq')).toBeGreaterThan(order.lastIndexOf('p'))
})

test('in Indonesian: the Indonesian page\'s paths, links and words, and a Vietnamese source says so', async () => {
  // The fixture has no Indonesian guides: its Vietnamese ones, made as the Indonesian pages are.
  const c = await getContent('vi')
  const t = translator('id')
  const listed = listedPaths('id', c)
  const guides = appGuides('id', c)
  expect(guides.length).toBeGreaterThan(0)
  for (const g of guides) {
    const d = guideDoc('id', c, g, listed)
    expect(d.path).toBe(`/id/panduan/${g.t.slug}/`)
    expect(d.meta?.startsWith(t(GUIDE_KIND_LABELS[g.kind]!)), d.meta).toBe(true)
    expect(d.meta).not.toMatch(/đọc khoảng/)
    for (const h of hrefsOf(d)) expect(h, `${d.path} links to ${h}`).not.toMatch(/^\/vi\//)
    for (const p of pagesOf(d)) expect(listed.has(p), `${d.path} names ${p}`).toBe(true)
  }
  const d = guideDoc('id', c, withExtras(c), listed)
  expect(d.blocks.find(b => b.t === 'refs')).toMatchObject({ title: t('Nguồn tham khảo'), items: [{ title: `Thay nước cho bể cá (${t('tiếng Việt')})` }] })
})

test('a page the app index leaves out is in no "pages" block; a link to it in the text stays, for the web', async () => {
  const c = await getContent('vi')
  const g = appGuides('vi', c).find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const fish = '/vi/ca/ca-neon-vua/'
  expect(pagesOf(guideDoc('vi', c, g, listedPaths('vi', c)))).toContain(fish)
  // The same content with that fish too thin to list (the index lists a thin page only above the quality bar).
  const thin = { ...c, species: c.species.map(s => (`/vi/ca/${s.t.slug}/` === fish ? { ...s, t: { ...s.t, quality: { ...s.t.quality, indexable: false, reason: 'low', score: 0 } } } : s)) } as Content
  const d = guideDoc('vi', thin, g, listedPaths('vi', thin))
  expect(pagesOf(d)).not.toContain(fish)
  expect(hrefsOf(d)).toContain(fish)
})

test('each guide the app index lists is in the shard its path names, the shards hold nothing else, and every page they name is listed', () => {
  for (const lang of LANGS) {
    const ix: AppIndex = JSON.parse(readFileSync(`${DIST}/app/${lang}.json`, 'utf8'))
    const listed = new Set(ix.items.map(i => i.path))
    const guides = ix.items.filter(i => i.kind === 'guide').map(i => i.path)
    const files = existsSync(`${DIST}/app/pages/${lang}`) ? readdirSync(`${DIST}/app/pages/${lang}`) : []
    expect(files.length, lang).toBe(guides.length ? ix.pages?.guide : 0)
    const held: string[] = []
    for (const f of files) {
      const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/${lang}/${f}`, 'utf8')))
      for (const [path, d] of Object.entries(shard.pages)) {
        expect(f, path).toBe(`guide-${pageShard(path, ix.pages!.guide!)}.json`)
        expect(d.path).toBe(path)
        for (const p of pagesOf(d)) expect(listed.has(p), `${path} names ${p}`).toBe(true)
        held.push(path)
      }
    }
    expect(held.sort(), lang).toEqual([...guides].sort())
  }
})

test('the guide page and the app\'s copy are put together by the same code', () => {
  const page = readFileSync(new URL('../src/pages/vi/huong-dan/[slug].astro', import.meta.url), 'utf8')
  expect(page).toContain("from '../../../lib/guide-page'")
  for (const own of ['placeFigures(', 'withToc(', 'mentionIndex(', 'nextGuides(']) expect(page, own).not.toContain(own)
})
