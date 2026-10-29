import { expect, test } from 'vitest'
import { parse } from 'node-html-parser'
import { placeFigures } from '../src/lib/figures'

const ph = (n: string) => ({ url: `https://m/${n}.webp`, width: 800, height: 600, licence: 'CC BY', author: 'A', sourceUrl: 'https://s' })
const body = Array.from({ length: 8 }, (_, i) => i === 2 ? `<p>p${i} <a href="/vi/ca/x/" class="ml">Cá X</a></p>` : `<p>p${i}</p>`).join('')

test('a mentioned species gets its photo right after the paragraph that names it; own photos spread out, never adjacent', () => {
  const out = placeFigures(body, [{ photo: ph('x'), label: 'Cá X', href: '/vi/ca/x/' }, { photo: ph('missing'), label: 'Y', href: '/vi/ca/y/' }], [ph('a'), ph('b')].map(photo => ({ photo })))
  const nodes = parse(out).childNodes
  const kids = nodes.map(n => (n as { rawTagName?: string }).rawTagName ?? '')
  const named = nodes.findIndex(n => n.toString().includes('>Cá X</a></p>') || n.toString().startsWith('<p>p2'))
  expect(nodes[named + 1]!.toString()).toContain('x.webp') // right after the paragraph that names it
  expect(out).toContain('<a href="/vi/ca/x/">Cá X</a> · Ảnh:')
  expect(out).not.toContain('missing.webp') // not named in the text → not placed
  expect(kids.filter(k => k === 'figure')).toHaveLength(3)
  expect(kids.some((k, i) => k === 'figure' && kids[i + 1] === 'figure')).toBe(false)
  expect(kids.at(-1)).toBe('p') // nothing dangling after the last paragraph
})

test('text without blocks is returned unchanged', () => {
  expect(placeFigures('plain', [], [{ photo: ph('a') }])).toBe('plain')
})
