import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import type { Content } from '@aq/schema'
import { drawnKinds, levelBlocks, PageDoc, PageShard, pageShard, shardCount, type Block, type Inline } from '@aq/schema/app-page'
import { appEquipment, appGlossary, appGuides, appPlants, appSeries, appSpecies, type AppIndex } from '../src/lib/app-index'
import { appPages, guideDoc, listedPaths, PAGE_LEVELS, proseBlocks, shardsOf } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { GUIDE_KIND_LABELS } from '../src/lib/format'
import { guideParts } from '../src/lib/guide-page'
import { appPath, LANGS, translator } from '../src/lib/i18n'
import { htmlBlocks } from '../src/lib/page-blocks'
import { appPage, DIST } from './dist'

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
  let leads = 0, named = 0
  for (const g of appGuides('vi', c)) {
    const d = guideDoc('vi', c, g, listed)
    const { dom } = appPage(d.path)
    expect(d.title, d.path).toBe(clean(dom.querySelector('h1')!.textContent))
    expect(d.meta, d.path).toBe(clean(dom.querySelector('.kind')!.textContent))
    expect(textOf(d.credit), d.path).toBe(clean(dom.querySelector('.credit')!.textContent))
    // Its readers' comments, by the key the page's section reads them by.
    expect(d.talk, d.path).toEqual({ comments: dom.querySelector('[data-comments]')!.getAttribute('data-entity') })
    const lead = dom.querySelector('img.lead')
    expect(d.lead?.src, d.path).toBe(lead?.getAttribute('src'))
    if (d.lead) {
      leads++
      expect(d.lead.credit?.text, d.path).toMatch(/^Ảnh: \S/)
      // Its licence by name; none for a photo a source let us use (stored with the permission note as its licence).
      const photo = guideParts('vi', c, g).lead!
      expect(d.lead.credit?.licence, d.path).toBe(photo.licence === 'dùng với sự cho phép' ? '' : photo.licence)
      if (d.lead.credit?.licence) named++
    }
  }
  expect(leads).toBeGreaterThan(0)
  expect(named).toBeGreaterThan(0)
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
  const listed = listedPaths('vi', c)
  const g = appGuides('vi', c).find(g => g.id === 'aquariumcoop-thay-nuoc')!
  const fish = '/vi/ca/ca-neon-vua/'
  expect(pagesOf(guideDoc('vi', c, g, listed))).toContain(fish)
  // A fish the index doesn't list (another language's index has only the fish with a page there) leaves the block, not the text.
  const d = guideDoc('vi', c, g, new Set([...listed].filter(p => p !== fish)))
  expect(pagesOf(d)).not.toContain(fish)
  expect(hrefsOf(d)).toContain(fish)
  // A fish and a guide whose translations scored low (Cá boraras đỏ, Thay nước đúng cách) are on the site's lists, so in
  // the index and in the blocks that name them.
  const block = (id: string) => pagesOf(guideDoc('vi', c, appGuides('vi', c).find(x => x.id === id)!, listed))
  expect(block('sprucepets-low-maintenance-freshwater-fish-4770223')).toContain('/vi/ca/ca-boraras-do/')
  expect(block('loc-cho-be-nano')).toContain('/vi/huong-dan/thay-nuoc-dung-cach/')
})

// The owner approved the privacy page's text for the app's anonymous statistics (2026-11-06): every language's index
// lets the app send them (protocols/app-telemetry.openapi.json; a reader can still turn them off in the app).
test('every language\'s index turns the app\'s anonymous statistics on', () => {
  for (const lang of LANGS) expect((JSON.parse(readFileSync(`${DIST}/app/${lang}.json`, 'utf8')) as { telemetry?: boolean }).telemetry, lang).toBe(true)
})

test('each page of each kind is in the shard its path names, the shards hold nothing else, and every page they name is listed', async () => {
  let kinds = 0
  for (const lang of LANGS) {
    const c = await getContent(lang)
    const ix: AppIndex = JSON.parse(readFileSync(`${DIST}/app/${lang}.json`, 'utf8'))
    const listed = new Set(ix.items.map(i => i.path))
    // The index gives every kind's count and level, and the first app's kind (guides) in `pages` too.
    const { counts } = shardsOf(await appPages(lang, c))
    expect(ix.shards ?? {}, lang).toEqual(Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, { n, level: PAGE_LEVELS[k as PageDoc['kind']] }])))
    expect(ix.pages ?? {}, lang).toEqual(counts.guide ? { guide: counts.guide } : {})
    // A kind's pages are the ones the index lists of it (a breed is listed as a fish, and has no page here yet).
    const at = (vi: string) => appPath(lang, vi)
    const want: Record<PageDoc['kind'], string[]> = {
      guide: ix.items.filter(i => i.kind === 'guide').map(i => i.path),
      fish: appSpecies(lang, c).map(s => at(`/vi/ca/${s.t.slug}/`)),
      plant: appPlants(lang, c).map(p => at(`/vi/cay/${p.t.slug}/`)),
      glossary: appGlossary(lang, c).map(g => at(`/vi/thuat-ngu/${g.t.slug}/`)),
      video: appSeries(lang, c).map(({ s }) => at(`/vi/video/${s.vi.slug}/`)),
      equipment: appEquipment(lang, c).map(u => at(`/vi/thiet-bi/${u.category}/`)),
    }
    for (const p of Object.values(want).flat()) expect(listed.has(p), `${p} is in the index`).toBe(true)
    const files = existsSync(`${DIST}/app/pages/${lang}`) ? readdirSync(`${DIST}/app/pages/${lang}`) : []
    const held: Record<string, string[]> = {}
    for (const f of files) {
      const kind = f.replace(/-\d+\.json$/, '') as PageDoc['kind']
      const shard = PageShard.parse(JSON.parse(readFileSync(`${DIST}/app/pages/${lang}/${f}`, 'utf8')))
      for (const [path, d] of Object.entries(shard.pages)) {
        expect(d.kind, path).toBe(kind)
        expect(f, path).toBe(`${kind}-${pageShard(path, counts[kind]!)}.json`)
        expect(d.path).toBe(path)
        for (const p of pagesOf(d)) expect(listed.has(p), `${path} names ${p}`).toBe(true)
        ;(held[kind] ??= []).push(path)
      }
    }
    for (const [kind, paths] of Object.entries(want)) {
      expect((held[kind] ?? []).sort(), `${lang} ${kind}`).toEqual([...paths].sort())
      expect(files.filter(f => f.startsWith(`${kind}-`)).length, `${lang} ${kind}`).toBe(paths.length ? counts[kind as PageDoc['kind']] : 0)
      if (paths.length) kinds++
    }
  }
  expect(kinds).toBeGreaterThanOrEqual(6)
})

test('the first app draws guides only; an app that knows level 2 draws fish, plant, glossary, video series and equipment pages too', () => {
  // The first app draws every kind `pages` counts, and would offer the web for every block it doesn't know: `pages` stays
  // guides only, and the other kinds are in `shards` at level 2.
  expect(PAGE_LEVELS).toEqual({ guide: 1, fish: 2, plant: 2, glossary: 2, video: 2, equipment: 2 })
  const ix: AppIndex = JSON.parse(readFileSync(`${DIST}/app/vi.json`, 'utf8'))
  expect(Object.keys(ix.pages ?? {})).toEqual(['guide'])
  expect(ix.shards?.guide?.n).toBe(ix.pages?.guide)
  expect(drawnKinds(ix.shards ?? {}, 1)).toEqual(Object.keys(ix.pages ?? {}))
  expect(drawnKinds(ix.shards ?? {}, 2).sort()).toEqual(['equipment', 'fish', 'glossary', 'guide', 'plant', 'video'])
  const files = readdirSync(`${DIST}/app/pages/vi`)
  for (const kind of ['fish', 'plant', 'glossary', 'video', 'equipment']) expect(files.some(f => f.startsWith(`${kind}-`)), kind).toBe(true)
})

/** The blocks a page uses that an app knowing `level` doesn't read, those inside lists too. */
const beyond = (blocks: Block[], level: number): string[] => {
  const known = levelBlocks(level)
  const walk = (bs: Block[]): string[] => bs.flatMap(b => [...(known.has(b.t) ? [] : [b.t]), ...(b.t === 'list' ? b.items.flatMap(walk) : [])])
  return walk(blocks)
}

test('each kind\'s copies use only the blocks its level reads, inside lists too: an app that draws the kind has no part to send to the web', async () => {
  // The rule's own cases: a level-2 block (known to the format, newer than the kind) fails a level-1 kind, in a list too.
  const cards: Block = { t: 'cards', title: 'Video', items: [] }
  expect(beyond([{ t: 'p', c: ['x'] }, cards], 1)).toEqual(['cards'])
  expect(beyond([{ t: 'list', items: [[{ t: 'p', c: ['x'] }, cards]] }], 1)).toEqual(['cards'])
  expect(beyond([cards], 2)).toEqual([])
  for (const lang of LANGS) {
    const docs = await appPages(lang, await getContent(lang))
    if (lang === 'vi') for (const [kind, list] of Object.entries(docs)) expect(list.length, `${kind}: no copy to check`).toBeGreaterThan(0)
    for (const [kind, list] of Object.entries(docs) as [PageDoc['kind'], PageDoc[]][]) {
      for (const d of list) expect(beyond(d.blocks, PAGE_LEVELS[kind]), `${d.path} (${kind}, level ${PAGE_LEVELS[kind]})`).toEqual([])
    }
  }
})

test('the guide page and the app\'s copy are put together by the same code', () => {
  const page = readFileSync(new URL('../src/pages/huong-dan/[slug].astro', import.meta.url), 'utf8')
  expect(page).toContain("from '../../lib/guide-page'")
  for (const own of ['placeFigures(', 'withToc(', 'mentionIndex(', 'nextGuides(']) expect(page, own).not.toContain(own)
})
