import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { handbookOf, sectionsOf, type Handbook, type Source } from '../chat/handbook'
import { HANDED_NOTE, handoverFor, handsOver, WHOLE_POST, type Found, type SectionSearch } from '../chat/handover'
import { sectionSearch } from '../chat/section-search'
import type { Tank } from '../chat/tools'

const DIST = fileURLToPath(new URL('../../dist/', import.meta.url).href)
const json = (file: string) => (existsSync(DIST + file) ? JSON.parse(readFileSync(DIST + file, 'utf8')) : null)
const source: Source = { index: async lang => json(`app/${lang}.json`), shard: async (lang, kind, n) => json(`app/pages/${lang}/${kind}-${n}.json`), topics: async lang => json(`app/chat/${lang}.json`) }
const hb = async (): Promise<Handbook> => (await handbookOf(source, 'vi'))!
const GUIDE = '/vi/huong-dan/thay-nuoc-dung-cach/'
const NEON = '/vi/ca/ca-neon-xanh/'
/** A guide with a section that has its own heading. */
const SECTIONED = '/vi/huong-dan/ca-nano-cho-be-19-lit/'
const tank: Tank = { id: 't1', name: 'Bể phòng khách', dims: { l: 60, w: 30, h: 36 }, species: [{ id: 'paracheirodon-innesi', count: 10 }], unlisted: [] }
const POST = 'Bể em mới set được ba tuần, nước cứ đục trắng dù đã thay nước. '.repeat(4)
const finds = (found: Found[]) => { const asked: string[] = []; const search: SectionSearch = async t => { asked.push(t); return found }; return { asked, search } }

test('sections go with a saved tank or a whole post; a short question with neither stays on the chat\'s own reading', () => {
  expect(handsOver('Nước đục có sao không?', [])).toBe(false)
  expect(handsOver('Nước đục có sao không?', [tank])).toBe(true)
  expect(handsOver('x'.repeat(WHOLE_POST), [])).toBe(true)
  expect(handsOver('x'.repeat(WHOLE_POST - 1), [])).toBe(false)
  expect(handsOver(`  ${'x'.repeat(WHOLE_POST - 1)}  `, [])).toBe(false)
})

test('a short question with no tank, or any question in Thai, is not searched and hands nothing over', async () => {
  const h = await hb()
  const { asked, search } = finds([{ path: GUIDE, heading: null }])
  expect(await handoverFor({ question: 'Nước đục có sao không?', start: {}, tanks: [], hb: h, lang: 'vi', search })).toBeUndefined()
  expect(await handoverFor({ question: POST, start: {}, tanks: [tank], hb: h, lang: 'th', search })).toBeUndefined()
  expect(asked).toEqual([])
})

test('with a saved tank: the tank without its name, then what the search found that fits, each as read_page gives it', async () => {
  const h = await hb()
  const heading = sectionsOf((await h.page(SECTIONED))!).find(s => s.heading?.id)!.heading!.id!
  const { asked, search } = finds([{ path: SECTIONED, heading }, { path: NEON, heading: null }, { path: '/vi/ca/ca-dia/', heading: null }])
  const out = (await handoverFor({ question: 'Nước đục có sao không?', start: {}, tanks: [tank], hb: h, lang: 'vi', search }))!
  expect(asked).toEqual(['Nước đục có sao không?'])
  expect(out.text).toContain('The reader\'s saved tanks, as read_tanks gives them:')
  expect(out.text).not.toContain('Bể phòng khách')
  expect(out.text).toContain(HANDED_NOTE)
  expect(out.text).toContain(`read_page ${JSON.stringify({ path: SECTIONED, heading })}:`)
  // The tank's own fish goes; the discus, which the reader never named, doesn't.
  expect(out.sections).toEqual([{ path: SECTIONED, heading }, { path: NEON, heading: null }])
  expect(out.text).not.toContain('/vi/ca/ca-dia/')
})

test('a whole post with no tank hands over only the sections; from a fish\'s page, that page first and the search told which fish', async () => {
  const h = await hb()
  const post = await handoverFor({ question: POST, start: {}, tanks: [], hb: h, lang: 'vi', search: finds([{ path: GUIDE, heading: null }]).search })
  expect(post!.text).not.toContain('saved tanks')
  expect(post!.sections).toEqual([{ path: GUIDE, heading: null }])
  const { asked, search } = finds([{ path: NEON, heading: null }, { path: GUIDE, heading: null }])
  const from = await handoverFor({ question: POST, start: { from: 'species', about: 'paracheirodon-innesi' }, tanks: [], hb: h, lang: 'vi', search })
  const about = h.byId('paracheirodon-innesi')!
  expect(asked).toEqual([`${about.name}${about.sub ? ` (${about.sub})` : ''}: ${POST}`])
  // The page once, though the search found it too.
  expect(from!.sections).toEqual([{ path: NEON, heading: null }, { path: GUIDE, heading: null }])
})

test('a search that fails, or finds what the handbook no longer has, leaves the tank; with no tank, nothing', async () => {
  const h = await hb()
  const failed: SectionSearch = async () => { throw new Error('search timed out') }
  const gone = finds([{ path: '/vi/huong-dan/khong-con/', heading: null }, { path: GUIDE, heading: 'khong-co-muc-nay' }]).search
  for (const search of [failed, gone]) {
    const out = (await handoverFor({ question: 'Nước đục có sao không?', start: {}, tanks: [tank], hb: h, lang: 'vi', search }))!
    expect(out.sections).toEqual([])
    expect(out.text).toContain('saved tanks')
    expect(out.text).not.toContain(HANDED_NOTE)
    expect(await handoverFor({ question: POST, start: {}, tanks: [], hb: h, lang: 'vi', search })).toBeUndefined()
  }
})

test('the search embeds the reader\'s words, asks the namespace of their language, and gives up rather than hold the chat', async () => {
  const runs: unknown[] = []
  const queries: unknown[] = []
  const ai = { run: async (model: string, input: unknown) => { runs.push([model, input]); return { data: [[0.1, 0.2]] } } } as unknown as Ai
  const index = { query: async (v: number[], o: unknown) => { queries.push([v, o]); return { matches: [{ metadata: { path: GUIDE, heading: 'a' } }, { metadata: { path: NEON } }, { metadata: {} }] } } } as unknown as Vectorize
  expect(await sectionSearch(ai, index)('nước đục', 'id')).toEqual([{ path: GUIDE, heading: 'a' }, { path: NEON, heading: null }])
  expect(runs).toEqual([['@cf/baai/bge-m3', { text: ['nước đục'] }]])
  expect(queries).toEqual([[[0.1, 0.2], { topK: 5, namespace: 'id', returnMetadata: 'all' }]])
  // A long post is cut to what a section holds.
  await sectionSearch(ai, index)('x'.repeat(5000), 'vi')
  expect((runs[1] as [string, { text: string[] }])[1].text[0]).toHaveLength(2000)
  const stuck = { run: () => new Promise(() => undefined) } as unknown as Ai
  await expect(sectionSearch(stuck, index, 5)('nước đục', 'vi')).rejects.toThrow('search timed out')
})
