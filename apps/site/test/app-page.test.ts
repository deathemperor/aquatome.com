import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { PageDoc, PageShard, pageShard, shardCount, type Block } from '@aq/schema/app-page'
import type { AppIndex } from '../src/lib/app-index'
import { appGuides, guideDoc, proseBlocks } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { guideParts } from '../src/lib/guide-page'
import { LANGS } from '../src/lib/i18n'
import { htmlBlocks } from '../src/lib/page-blocks'
import { DIST } from './dist'

// The app draws guides from these files instead of loading the web page: what they hold must be the page.
type Vectors = {
  html: { note: string; html: string; blocks: Block[]; unknown?: string[] }[]
  shards: { path: string; shards: number; n: number }[]
  docs: { note: string; valid: boolean; doc: unknown; blocks: string[] }[]
}
const v: Vectors = JSON.parse(readFileSync(new URL('../../../protocols/page-vectors.json', import.meta.url), 'utf8'))
const CONTENT = fileURLToPath(new URL('../../../content/', import.meta.url))

test.each(v.html)('converts: $note', c => {
  expect(htmlBlocks(c.html)).toEqual({ blocks: c.blocks, unknown: c.unknown ?? [] })
})

test.each(v.shards)('$path is in shard $n of $shards', c => {
  expect(pageShard(c.path, c.shards)).toBe(c.n)
})

test('about 8 pages a shard, a power of two', () => {
  expect([0, 1, 8, 9, 16, 17, 249, 1016].map(shardCount)).toEqual([1, 1, 1, 2, 2, 4, 32, 128])
})

test('the vectors\' pages as the site writes them are the format', () => {
  for (const d of v.docs.filter(d => d.valid)) expect(PageDoc.safeParse(d.doc).success, d.note).toBe(true)
  for (const d of v.docs.filter(d => !d.valid)) expect(PageDoc.safeParse(d.doc).success, d.note).toBe(false)
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
    for (const g of appGuides(lang, c)) {
      n++
      expect(proseBlocks(lang, guideParts(lang, c, g).prose).unknown, g.id).toEqual([])
      expect(PageDoc.safeParse(guideDoc(lang, c, g)).error, g.id).toBeUndefined()
    }
  }
  expect(n).toBeGreaterThan(0)
})

test('each guide the app index lists is in the shard its path names, and the shards hold nothing else', () => {
  for (const lang of LANGS) {
    const ix: AppIndex & { pages: Record<string, number> } = JSON.parse(readFileSync(`${DIST}/app/${lang}.json`, 'utf8'))
    const guides = ix.items.filter(i => i.kind === 'guide').map(i => i.path)
    const files = existsSync(`${DIST}/app/pages/${lang}`) ? readdirSync(`${DIST}/app/pages/${lang}`) : []
    expect(files.length, lang).toBe(guides.length ? ix.pages.guide : 0)
    const held: string[] = []
    for (const f of files) {
      const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/${lang}/${f}`, 'utf8')))
      for (const path of Object.keys(shard.pages)) {
        expect(f, path).toBe(`guide-${pageShard(path, ix.pages.guide!)}.json`)
        expect(shard.pages[path]!.path).toBe(path)
        held.push(path)
      }
    }
    expect(held.sort(), lang).toEqual([...guides].sort())
  }
})

test('a guide\'s copy is its page: title, header line, credit, summary, text, sources and what to read next', async () => {
  const c = await getContent('vi')
  const g = appGuides('vi', c).find(g => g.t.summary?.length && g.refs?.length) ?? appGuides('vi', c)[0]!
  const d = guideDoc('vi', c, g)
  expect(d.path).toBe(`/vi/huong-dan/${g.t.slug}/`)
  expect(d.title).toBe(g.t.name)
  expect(d.meta).toMatch(/đọc khoảng \d+ phút/)
  expect(d.credit?.length).toBeGreaterThan(0)
  expect(d.blocks.some(b => b.t === 'p')).toBe(true)
  if (g.t.summary?.length) expect(d.blocks[0]).toEqual({ t: 'summary', title: 'Tóm tắt nhanh', items: g.t.summary })
  for (const b of d.blocks) if (b.t === 'pages') for (const p of b.paths) expect(p).toMatch(/^\/vi\/(huong-dan|ca|cay)\/[^/]+\/$/)
})

test('the guide page and the app\'s copy are put together by the same code', () => {
  const page = readFileSync(new URL('../src/pages/vi/huong-dan/[slug].astro', import.meta.url), 'utf8')
  expect(page).toContain("from '../../../lib/guide-page'")
  for (const own of ['placeFigures(', 'withToc(', 'mentionIndex(', 'nextGuides(']) expect(page, own).not.toContain(own)
})
