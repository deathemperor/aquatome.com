import type { PageDoc } from '@aq/schema/app-page'
import { expect, test } from 'vitest'
import { CLASH_PREFIX, fileClashes, recentClashes } from '../chat/clash-store'
import { checkedClashes, type Clash, type FiledClash } from '../chat/clashes'
import type { Handbook, Item } from '../chat/handbook'
import { memoryR2 } from './r2'

const FISH = '/vi/ca/ca-thu/'
const GUIDE = '/vi/huong-dan/nuoc-mem/'
const KEEP = 'Nếu chỉ nuôi thì nước cứng vừa là đủ.'
const MUST = 'Nuôi loài này bắt buộc phải có nước mềm.'
const MIX = 'Pha một phần nước máy với ba phần nước RO.'
const page = (kind: PageDoc['kind'], title: string, text: string[]) =>
  ({ kind, title, blocks: [{ t: 'h', text: 'Nước cần thế nào?', id: 'nuoc' }, ...text.map(t => ({ t: 'p', c: [t] }))] }) as unknown as PageDoc
const pages: Record<string, PageDoc> = { [FISH]: page('fish', 'Cá thử', [KEEP, MUST]), [GUIDE]: page('guide', 'Nước mềm', [MIX]) }
const items = [
  { path: FISH, kind: 'fish', name: 'Cá thử', id: 'ca-thu', ph: { min: 4.8, max: 6.2 } },
  { path: GUIDE, kind: 'guide', name: 'Nước mềm' },
] as unknown as Item[]
const hb: Handbook = { lang: 'vi', items, byPath: p => items.find(i => i.path === p), byId: id => items.find(i => i.id === id), page: async p => pages[p], topics: async () => null }
const at = (path: string, passage: string) => ({ path, passage })
const AT = new Date('2026-11-10T03:00:00Z')

test('two places each word for word are kept, across two pages too, spaces evened out, in one order whichever came first', async () => {
  const one: Clash = { a: at(FISH, KEEP), b: at(FISH, `  ${MUST.replace(' ', '\n')} `) }
  const two: Clash = { a: at(GUIDE, MIX), b: at(FISH, MUST) }
  expect(await checkedClashes(hb, [one, two])).toEqual([[at(FISH, MUST), at(FISH, KEEP)], [at(FISH, MUST), at(GUIDE, MIX)]])
})

test('a card\'s figure can be one of the places, as read_page gives it', async () => {
  expect(await checkedClashes(hb, [{ a: at(FISH, '"ph":{"min":4.8,"max":6.2}'), b: at(FISH, KEEP) }])).toHaveLength(1)
})

test('a passage not on its page word for word, a page that isn\'t there or a place named twice is dropped: nothing but the handbook\'s words can be kept', async () => {
  const bad: Clash[] = [
    { a: at(FISH, 'Bạn đọc này nuôi trong bể sáu mươi lít.'), b: at(FISH, MUST) },
    { a: at(FISH, MIX), b: at(FISH, MUST) },
    { a: at('/vi/khong-co/', KEEP), b: at(FISH, MUST) },
    { a: at(FISH, MUST), b: at(FISH, MUST) },
    { a: at(FISH, 'Nước'), b: at(FISH, MUST) },
    { a: at(FISH, KEEP) } as Clash,
  ]
  expect(await checkedClashes(hb, bad)).toEqual([])
})

test('the same two places are one entry, however many answers file them, and the entry holds the two places and nothing else', async () => {
  const r2 = memoryR2()
  await fileClashes(r2.bucket, hb, [{ a: at(FISH, KEEP), b: at(FISH, MUST) }], 'vi', AT)
  await fileClashes(r2.bucket, hb, [{ a: at(FISH, MUST), b: at(FISH, KEEP) }], 'vi', AT)
  const keys = [...r2.m.keys()]
  expect(keys).toHaveLength(1)
  expect(keys[0]!.startsWith(CLASH_PREFIX)).toBe(true)
  const kept = await (await r2.bucket.get(keys[0]!))!.json<FiledClash>()
  expect(kept).toEqual({ at: AT.toISOString(), lang: 'vi', places: [at(FISH, MUST), at(FISH, KEEP)] })
  expect(await recentClashes(r2.bucket)).toEqual([kept])
})

test('at most three from one answer', async () => {
  const c: Clash = { a: at(FISH, KEEP), b: at(FISH, MUST) }
  expect(await checkedClashes(hb, [c, c, c, c, c])).toHaveLength(3)
})
