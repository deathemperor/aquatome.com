import { expect, test } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onRefused, refsWithoutRefused, refusedSweep, WAITING, withoutRefused } from '../src/refused-sources'
import { sweep } from '../src/sweep'

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

// The chief of staff, 17 Nov 2026: a sub-domain, a redirect and an archived copy.
test('a refused site\'s hosts and archived copies of its pages are refused; near names, look-alike hosts and other sites are not', () => {
  const yes = ['https://cabaymau.vn/x', 'http://www.cabaymau.vn/x', 'https://forum.cabaymau.vn/t/1', 'https://CABAYMAU.VN/x', 'https://web.archive.org/web/2024/https://cabaymau.vn/x', 'https://archive.ph/2024.01.01/https://www.cabaymau.vn/x', '<p>Xem <a href="https://cabaymau.vn/x">trang này</a>.</p>']
  // An address that doesn't parse isn't one, though refusedSite refuses it for a fetch (the first reader, 17 Nov 2026).
  const no = ['https://cabaymau.net/x', 'https://xcabaymau.vn/x', 'https://cabaymau.vn.example.com/x', 'https://example.org/?from=cabaymau.vn', 'https://web.archive.org/web/2024/https://cabaymau.net/x', 'https://[bad/x', 'a book', '']
  expect(yes.map(onRefused)).toEqual(yes.map(() => true))
  expect(no.map(onRefused)).toEqual(no.map(() => false))
})

// A cycle that started before a refused site's facts left, on older code, can write them again; the sweep at its push runs
// on the merge with main's code and takes them out before its tests (the chief of staff, 17 Nov 2026).
test('the sweep takes a refused site\'s facts out of kept research and its pages out of every language\'s references', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-refused-sweep-'))
  const guide = join(root, 'content/guides/g')
  await mkdir(guide, { recursive: true })
  await mkdir(join(root, 'engine-state/topics'), { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(root, 'content/sources.json'))
  const ref = (url: string) => ({ url, title: url })
  await writeFile(join(guide, 'entity.json'), JSON.stringify({ id: 'g', kind: 'care', source: 'aquatome', html: '', photos: [], mentions: [], updatedAt: '2026-11-17', refs: [ref('https://a.example/1'), ref(REFUSED)] }, null, 2))
  await writeFile(join(guide, 'th.json'), JSON.stringify({ slug: 'g', name: 'g', refs: [ref(REFUSED), ref('https://a.example/1')] }, null, 2))
  await writeFile(join(root, 'engine-state/topics/g.json'), JSON.stringify({ found: true, facts: [{ section: 'steps', fact: 'a', source: 1 }, { section: 'steps', fact: 'b', source: 0 }], sources: [src('https://a.example/1'), src(REFUSED)] }, null, 2))
  const r = await sweep(root, {})
  expect(r.refusedSources).toEqual(['engine-state/topics/g.json: 1 out', 'content/guides/g/entity.json: refs lose 1', 'content/guides/g/th.json: refs lose 1'])
  expect(JSON.parse(await readFile(join(root, 'engine-state/topics/g.json'), 'utf8'))).toEqual({ found: true, facts: [{ section: 'steps', fact: 'b', source: 0 }], sources: [src('https://a.example/1')] })
  for (const f of ['entity.json', 'th.json']) expect(JSON.parse(await readFile(join(guide, f), 'utf8')).refs).toEqual([ref('https://a.example/1')])
  // A second sweep finds nothing.
  expect((await sweep(root, {})).refusedSources).toEqual([])
})

// The first reader, 17 Nov 2026: an `also` that was empty stays; a refused page cited outside a list is said, never
// renumbered to another page; a file the pass can't read is named and the pass goes on.
test('an empty also stays, a refused page cited outside a list stops the step, and the sweep names a file it can\'t read and goes on', async () => {
  const r = { found: true, facts: [{ section: 'x', fact: 'a', source: 0, also: [] as number[] }, { section: 'x', fact: 'b', source: 1 }], sources: [src('https://a.example/1'), src(REFUSED)] }
  expect(withoutRefused(r).kept.facts).toEqual([{ section: 'x', fact: 'a', source: 0, also: [] }])
  expect(() => withoutRefused({ found: true, lead: { fact: 'a', source: 1 }, sources: [src('https://a.example/1'), src(REFUSED)] })).toThrow('lead cites a refused page (source 1) outside a list')
  const root = await mkdtemp(join(tmpdir(), 'aq-refused-bad-'))
  await mkdir(join(root, 'engine-state/glossary'), { recursive: true })
  await mkdir(join(root, 'content'), { recursive: true })
  await writeFile(join(root, 'engine-state/glossary/bad.json'), `{"sources": [{"url": "${REFUSED}"}], `)
  await writeFile(join(root, 'engine-state/glossary/good.json'), JSON.stringify({ found: true, facts: [{ section: 'x', fact: 'a', source: 0 }], sources: [src(REFUSED)] }))
  const out = await refusedSweep(root)
  expect(out.failed).toHaveLength(1)
  expect(out.failed[0]).toMatch(/^engine-state\/glossary\/bad\.json: /)
  expect(out.facts.map(f => f.file)).toEqual(['engine-state/glossary/good.json'])
})

// The chief of staff, 17 Nov 2026: a page left waiting for its text has an owner and a day, as a site's change carries them.
test('every page left waiting names why, its owner and a day', () => {
  for (const [file, w] of Object.entries(WAITING)) {
    expect(file).toMatch(/^content\/[^/]+\/[^/]+\/[a-z]+\.json$/)
    expect(w.why.trim(), file).not.toBe('')
    expect(w.owner.trim(), file).not.toBe('')
    expect(w.day, file).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  }
})
