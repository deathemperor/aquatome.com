import { expect, test } from 'vitest'
import { parse } from 'node-html-parser'
import { placeFigures } from '../src/lib/figures'
import { sectionFigures } from '../src/lib/guide-page'

const ph = (n: string) => ({ url: `https://m/${n}.webp`, width: 800, height: 600, licence: 'CC BY', author: 'A', sourceUrl: 'https://s' })
const body = Array.from({ length: 8 }, (_, i) => i === 2 ? `<p>p${i} <a href="/vi/ca/x/" class="ml">Cá X</a></p>` : `<p>p${i}</p>`).join('')

test('a mentioned species gets its photo right after the paragraph that names it; own photos spread out, never adjacent', () => {
  const out = placeFigures('vi', body, [{ photo: ph('x'), label: 'Cá X', href: '/vi/ca/x/' }, { photo: ph('missing'), label: 'Y', href: '/vi/ca/y/' }], [ph('a'), ph('b')].map(photo => ({ photo })))
  const nodes = parse(out).childNodes
  const kids = nodes.map(n => (n as { rawTagName?: string }).rawTagName ?? '')
  const named = nodes.findIndex(n => n.toString().includes('>Cá X</a></p>') || n.toString().startsWith('<p>p2'))
  expect(nodes[named + 1]!.toString()).toContain('x.webp') // right after the paragraph that names it
  expect(out).toContain('<a href="/vi/ca/x/">Cá X</a><a class="cite pic" href="https://s"') // the credit is a © mark, its author and licence in the card
  expect(out).not.toContain('missing.webp') // not named in the text → not placed
  expect(kids.filter(k => k === 'figure')).toHaveLength(3)
  expect(kids.some((k, i) => k === 'figure' && kids[i + 1] === 'figure')).toBe(false)
  expect(kids.at(-1)).toBe('p') // nothing dangling after the last paragraph
})

test('text without blocks is returned unchanged', () => {
  expect(placeFigures('vi', 'plain', [], [{ photo: ph('a') }])).toBe('plain')
})

test('a guide photo naming its section goes under that heading, several together; one whose heading is missing goes at the end', () => {
  const html = '<h3>Màu</h3><p>a</p><p>b</p><h3>Mắt</h3><ul><li>c</li></ul><p>d</p><h3>Vùng D</h3><p>e</p>'
  const f = (n: string, heading: string) => ({ photo: { ...ph(n), caption: `Sơ đồ ${n}` }, label: `Sơ đồ ${n}`, heading })
  const out = placeFigures('vi', html, [], [], [f('c1', 'Màu'), f('c2', ' màu '), f('e1', 'Mắt'), f('x', 'Lớp 15')])
  const kids = parse(out).childNodes.map(n => n.toString())
  // After the heading's first paragraph (or list), the heading's figures together.
  expect(kids[2]).toMatch(/^<div class="figs">.*c1\.webp.*c2\.webp/)
  expect(kids[6]).toMatch(/^<div class="figs">.*e1\.webp/)
  expect(kids.at(-1)).toMatch(/^<div class="figs">.*x\.webp/)
  expect(out).toContain('<figcaption>Sơ đồ c1')
})

test('more figures than room: every headed figure is shown, spread ones still never back to back', () => {
  const html = Array.from({ length: 3 }, (_, i) => `<h3>H${i}</h3><p>p${i}</p>`).join('')
  const headed = Array.from({ length: 9 }, (_, i) => ({ photo: ph(`d${i}`), heading: `H${i % 4}` }))
  const out = placeFigures('vi', html, [], [ph('s1'), ph('s2')].map(photo => ({ photo })), headed)
  for (let i = 0; i < 9; i++) expect(out).toContain(`d${i}.webp`)
  const kids = parse(out).childNodes.map(n => (n as { rawTagName?: string; classNames?: string }).rawTagName ?? '')
  expect(kids.some((k, i) => (k === 'figure' || k === 'div') && ['figure', 'div'].includes(kids[i + 1] ?? '') && i < kids.length - 2)).toBe(false)
})

test('three or more pictures for one section make a grid of their small copies; a section may start with a table', () => {
  const html = '<h3>Lớp</h3><table><tr><td>1</td></tr></table><p>a</p><h3>Mắt</h3><p>b</p>'
  const f = (n: string, heading: string) => ({ photo: { ...ph(n), thumb: `https://media.aquatome.com/${n}-480.webp` }, heading })
  const out = placeFigures('vi', html, [], [], [f('a', 'Lớp'), f('b', 'Lớp'), f('c', 'Lớp'), f('d', 'Mắt')])
  const kids = parse(out).childNodes.map(n => n.toString())
  expect(kids[2]).toMatch(/^<div class="figs grid">/) // after the table
  expect(kids[2]).toContain('src="https://media.aquatome.com/a-480.webp"')
  expect(kids[6]).toMatch(/^<div class="figs">/)
  expect(kids[6]).toContain('src="https://m/d.webp"')
})

test("a guide photo's section in the page's language, else the Vietnamese heading", () => {
  const photo = { ...ph('x'), section: { vi: 'Can, chỉ và hoa văn', id: 'Istilah dasar' } }
  expect(sectionFigures('id', [photo, ph('y')]).map(f => f.heading)).toEqual(['Istilah dasar'])
  expect(sectionFigures('th', [photo]).map(f => f.heading)).toEqual(['Can, chỉ và hoa văn'])
})
