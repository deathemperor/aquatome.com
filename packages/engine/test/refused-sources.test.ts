import { expect, test } from 'vitest'
import { refsWithoutRefused, withoutRefused } from '../src/refused-sources'

const REFUSED = 'https://cabaymau.vn/cach-tha-ca-moi-mua-vao-be-2/'
const src = (url: string) => ({ url, title: url, kind: 'article' })

// The chief of staff, 17 Nov 2026 (Thursday's change): a refused site's facts leave every kind's facts file, by the engine.
test('a guide\'s or a term\'s facts lose every fact whose source is refused, whatever its also; the refused page leaves also and sources, and the rest renumber', () => {
  const r = {
    found: true,
    facts: [
      { section: 'vietnam', fact: 'a', source: 0 },
      { section: 'steps', fact: 'b', source: 1 },
      { section: 'steps', fact: 'c', source: 1, also: [2] },
      { section: 'steps', fact: 'd', source: 2, also: [1] },
      { section: 'steps', fact: 'e', source: 2, also: [1, 0] },
      { section: 'steps', fact: 'f', source: 7 },
    ],
    species: ['x'],
    sources: [src('https://a.example/1'), src(REFUSED), src('https://b.example/2')],
  }
  const { kept, refused, dropped } = withoutRefused(r)
  expect(kept).toEqual({
    found: true,
    facts: [
      { section: 'vietnam', fact: 'a', source: 0 },
      { section: 'steps', fact: 'd', source: 1 },
      { section: 'steps', fact: 'e', source: 1, also: [0] },
      { section: 'steps', fact: 'f', source: 7 },
    ],
    species: ['x'],
    sources: [src('https://a.example/1'), src('https://b.example/2')],
  })
  expect(Object.keys(kept)).toEqual(Object.keys(r))
  expect(refused).toEqual([{ url: REFUSED, items: 2 }])
  expect(dropped).toEqual([{ list: 'facts', at: 1 }, { list: 'facts', at: 2 }])
  // The input is left as it was.
  expect(r.facts).toHaveLength(6)
})

test('a breed\'s and a product\'s facts lose their refused items in every list, nested ones too', () => {
  const breed = {
    found: true, kind: 'guppy',
    viNames: [{ name: 'Full red', source: 1 }, { name: 'Bảy màu đỏ', source: 0 }],
    origin: [{ fact: 'o', source: 1 }],
    care: [{ field: 'tempC', min: 24, max: 28, source: 2 }, { field: 'pH', min: 6.5, max: 7.5, source: 1 }],
    sources: [src('https://a.example/1'), src('https://www.cabaymau.vn/full-red/'), src('https://b.example/2')],
  }
  expect(withoutRefused(breed).kept).toEqual({
    found: true, kind: 'guppy',
    viNames: [{ name: 'Bảy màu đỏ', source: 0 }],
    origin: [],
    care: [{ field: 'tempC', min: 24, max: 28, source: 1 }],
    sources: [src('https://a.example/1'), src('https://b.example/2')],
  })
  const product = {
    found: true,
    specs: [{ key: 'w', value: '10 W', source: 0 }],
    variants: [{ name: 'S', specs: [{ key: 'w', value: '5 W', source: 0 }, { key: 'l', value: '20 cm', source: 1 }] }],
    prices: [{ shop: 'A', url: 'https://a.example/p', variant: 'S', vnd: 100000, source: 1 }],
    sources: [src('https://cabaymau.vn/den/'), src('https://a.example/p')],
  }
  expect(withoutRefused(product).kept).toEqual({
    found: true,
    specs: [],
    variants: [{ name: 'S', specs: [{ key: 'l', value: '20 cm', source: 0 }] }],
    prices: [{ shop: 'A', url: 'https://a.example/p', variant: 'S', vnd: 100000, source: 0 }],
    sources: [src('https://a.example/p')],
  })
})

test('facts with no refused source come back as they were; a near name is another site, and a source that isn\'t a web page stays', () => {
  const r = { found: true, facts: [{ section: 'x', fact: 'a', source: 0 }, { section: 'x', fact: 'b', source: 1 }], sources: [src('https://cabaymau.net/x'), src('a book')] }
  const out = withoutRefused(r)
  expect(out.kept).toBe(r)
  expect(out.refused).toEqual([])
  expect(refsWithoutRefused([{ url: REFUSED, title: 't' }, { url: 'https://cabaymau.net/x', title: 'u' }, { url: 'a book', title: 'b' }])).toEqual([{ url: 'https://cabaymau.net/x', title: 'u' }, { url: 'a book', title: 'b' }])
})
