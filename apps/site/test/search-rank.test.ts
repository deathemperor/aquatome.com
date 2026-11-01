import { expect, test } from 'vitest'
import { namedFirst } from '../src/scripts/search-rank'

const doc = (url: string, title: string, aka = '') => ({ url, meta: { title, aka } })
const urls = (ds: { url: string }[]) => ds.map(d => d.url)

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

test('no page with that name, or a blank query: Pagefind\'s order unchanged', () => {
  const ds = [doc('a', 'Tép blue dream'), doc('b', 'Tép quạt')]
  expect(urls(namedFirst('tép', ds))).toEqual(['a', 'b'])
  expect(urls(namedFirst('  ', ds))).toEqual(['a', 'b'])
})
