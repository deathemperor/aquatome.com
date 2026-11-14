import { readFileSync } from 'node:fs'
import { loadAll } from '@aq/schema'
import { expect, test } from 'vitest'
import { searchAliases } from '../src/lib/search'
import { namedFirst } from '../src/scripts/search-rank'

const doc = (url: string, title: string, aka = '') => ({ url, meta: { title, aka } })
const urls = (ds: { url: string }[]) => ds.map(d => d.url)

test('sa tùng is first for its title and every other name, ahead of a guide that mentions it', async () => {
  const c = await loadAll({ root: new URL('./fixture-content', import.meta.url).pathname, lang: 'vi', publicBuild: false })
  const m = c.materials.find(m => m.id === 'lua-sa-tung')!
  const aka = searchAliases(m.t, undefined, m.names)
  const ds = [doc('guide', 'Chọn lũa sa tùng cho bể'), doc('material', m.t.name, aka)]
  for (const query of [m.t.name, ...m.t.altNames, ...m.names, 'sa tung', 'lua sa tung', 'kim sa tung']) {
    expect(namedFirst(query, ds)[0]!.url, query).toBe('material')
  }
})

test('a page named exactly what was searched for comes first, by its title or another name; the rest keep their order', () => {
  // Pagefind's live order for "neon" and "bảy màu" on 2026-11-01.
  const neon = [doc('bong-neon', 'Cá bống neon', 'Elacatinus oceanops, Cá bống neon xanh'), doc('neon-xanh', 'Cá neon xanh', 'Paracheirodon innesi, Cá neon, Neon tetra'), doc('neon-vua', 'Cá neon vua')]
  expect(urls(namedFirst('neon', neon))).toEqual(['neon-xanh', 'bong-neon', 'neon-vua'])
  const guppy = [doc('koi', 'Bảy màu koi'), doc('tai-voi', 'Cá bảy màu tai voi'), doc('bay-mau', 'Cá bảy màu', 'Poecilia reticulata, Guppy')]
  expect(urls(namedFirst('bảy màu', guppy))).toEqual(['bay-mau', 'koi', 'tai-voi'])
})

test('accents, đ, a leading "cá" and a name in brackets are matched as readers type them', () => {
  const ds = [doc('lam-phan', 'Cá đĩa lam phấn'), doc('dia', 'Cá đĩa', 'Symphysodon discus'), doc('betta', 'Cá betta (cá xiêm)')]
  expect(urls(namedFirst('cá dĩa', ds))[0]).toBe('dia')
  expect(urls(namedFirst('ca dia', ds))[0]).toBe('dia')
  expect(urls(namedFirst('Betta', ds))[0]).toBe('betta')
})

// The chief of staff, 2026-11-13: renamed for the owner, each lands on its own page; the apple snails' "ốc táo" and the
// water hyacinth's "bèo tây" find no fish or frogbit first.
test('the names keepers use come first, and words another page shares only in part move nothing', () => {
  const ds = [doc('oc-mystery', 'Ốc mystery', 'Pomacea diffusa, Ốc táo gai, Mystery snail'), doc('ca-tao-do', 'Cá táo đỏ', 'Glossolepis incisus, Red rainbowfish, Cá cầu vồng đỏ, Cá cầu vồng táo đỏ'), doc('beo-nhat', 'Bèo Nhật', 'Limnobium laevigatum, Amazon frogbit')]
  expect(urls(namedFirst('táo đỏ', ds))[0]).toBe('ca-tao-do')
  expect(urls(namedFirst('cá cầu vồng táo đỏ', ds))[0]).toBe('ca-tao-do')
  expect(urls(namedFirst('cầu vồng đỏ', ds))[0]).toBe('ca-tao-do')
  expect(urls(namedFirst('bèo nhật', ds))[0]).toBe('beo-nhat')
  expect(urls(namedFirst('ốc táo', ds))).toEqual(urls(ds))
  expect(urls(namedFirst('bèo tây', ds))).toEqual(urls(ds))
})

test("a page's old name, kept as another name too, is one alias", () => {
  const t = { name: 'Cá đĩa', altNames: ['Discus', 'Cá đĩa nâu'], redirectFrom: [{ slug: 'ca-dia-nau', name: 'Cá đĩa nâu' }] }
  expect(searchAliases(t, 'Symphysodon aequifasciatus')).toBe('Symphysodon aequifasciatus, Discus, Cá đĩa nâu, ca dia, ca dia nau')
})

// 2026-11-13: the skunk cory's page forwards the address it had under a tube worm's name, and search never finds it by the worm.
test('an old address forwarded with no name adds no alias', () => {
  const t = { name: 'Cá chuột skunk', altNames: ['Skunk Cory'], redirectFrom: [{ slug: 'ca-ditrupa-arietina', name: '' }] }
  expect(searchAliases(t, 'Corydoras arcuatus')).toBe('Corydoras arcuatus, Skunk Cory')
})

test('no page with that name, or a blank query: Pagefind\'s order unchanged', () => {
  const ds = [doc('a', 'Tép blue dream'), doc('b', 'Tép quạt')]
  expect(urls(namedFirst('tép', ds))).toEqual(['a', 'b'])
  expect(urls(namedFirst('  ', ds))).toEqual(['a', 'b'])
})

// Shared with the iOS app's tests, which run the app's own search on the same cases.
type Vectors = { cases: { note: string; query: string; items: { name: string; sub?: string; aka?: string[]; kind: string }[]; first: string[] }[] }
const v: Vectors = JSON.parse(readFileSync(new URL('../../../protocols/search-vectors.json', import.meta.url), 'utf8'))

test('each shared case starts with the pages named what was searched for, as the app\'s search does', () => {
  expect(v.cases.length).toBeGreaterThan(5)
  for (const c of v.cases) {
    // Each page's title and its `aka` metadata, as a species, breed or plant page sets them.
    const docs = c.items.map(i => ({ meta: { title: i.name, aka: searchAliases({ name: i.name, altNames: i.aka ?? [] }, i.sub) } }))
    const titles = namedFirst(c.query, docs).map(d => d.meta.title)
    expect(new Set(titles.slice(0, c.first.length)), `${c.note}: ${titles.join(' · ')}`).toEqual(new Set(c.first))
  }
})
