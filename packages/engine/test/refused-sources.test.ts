import { expect, test } from 'vitest'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ARCHIVES, namesRefused, onProxy, onRefused, PROXY_HOSTS, refsWithoutRefused, refusedScan, refusedSweep, WAITING, withoutRefused } from '../src/refused-sources'
import { cycleOnlyHosts, refused } from '../src/cycle-only'
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
  // A host written another way is the site, as the address parses (Codex, 17 Nov 2026); an archive's copy with or without its scheme.
  const yes = ['https://cabaymau.vn/x', 'http://www.cabaymau.vn/x', 'https://forum.cabaymau.vn/t/1', 'https://CABAYMAU.VN/x', 'https://cabaymau.vn./x', 'https://user:pass@cabaymau.vn/x',
    'https://%63abaymau.vn/x', 'https://ｃａｂａｙｍａｕ.vn/x', 'https://cabaymau。vn/x',
    'https://web.archive.org/web/2024/https://cabaymau.vn/x', 'https://web.archive.org/web/2024id_/http://www.cabaymau.vn/x?p=1', 'https://web.archive.org/web/2024/cabaymau.vn/x', 'https://archive.ph/2024.01.01/https://www.cabaymau.vn/x', 'https://archive.ph/newest/cabaymau.vn/x',
    // Codex's second read, 17 Nov 2026: an archive's host with a trailing dot, any time, the copy percent-encoded.
    'https://web.archive.org./web/2024/https://cabaymau.vn/x', 'https://web.archive.org/web/2024*/cabaymau.vn/*', 'https://wayback.archive.org/web/20240101000000/https://cabaymau.vn/x', 'https://archive.ph/oldest/https://cabaymau.vn/x', 'https://web.archive.org/web/2024/https%3A%2F%2Fcabaymau.vn%2Fx']
  // An address that doesn't parse isn't one, though refusedSite refuses it for a fetch (the first reader, 17 Nov 2026). Another
  // site's address that carries the site's in its query, path or fragment is that site's (Codex, 17 Nov 2026).
  const no = ['https://cabaymau.net/x', 'https://xcabaymau.vn/x', 'https://cabaymau.vn.example.com/x', 'https://cabaymau.vn@example.com/x', 'https://example.org/?from=cabaymau.vn', 'https://web.archive.org/web/2024/https://cabaymau.net/x',
    'https://example.org/?url=https://cabaymau.vn/x', 'https://example.org/articles/https://cabaymau.vn/x', 'https://example.org/#https://cabaymau.vn/x', 'https://archive.org/details/https://cabaymau.vn/x', 'https://archive.ph/AbCdE',
    // Codex's second read: an archived copy of another site whose path carries the site's address, and an archive's page
    // that isn't a copy, are not the site.
    'https://web.archive.org/web/2024/example.org/articles/https://cabaymau.vn/x', 'https://archive.ph/about/cabaymau.vn/x',
    'https://[bad/x', 'a book', '']
  expect(yes.map(onRefused)).toEqual(yes.map(() => true))
  expect(no.map(onRefused)).toEqual(no.map(() => false))
  // In a text, each address is taken whole: a link to the site is one, a share link to another site isn't. An address
  // ends at a bracket, a comma or a semicolon, and the sentence's punctuation after it isn't part of it (Codex, 17 Nov 2026).
  expect(namesRefused('<p>Xem <a href="https://cabaymau.vn/x">trang này</a>.</p>')).toBe(true)
  expect(namesRefused('Xem https://example.org/a và https://www.cabaymau.vn/x')).toBe(true)
  expect(namesRefused('<a href="https://example.org/?url=https://cabaymau.vn/x">chia sẻ</a>')).toBe(false)
  for (const t of ['See (https://cabaymau.vn).', 'https://cabaymau.vn, next', 'https://example.org/a,https://cabaymau.vn/x', 'Xem https://cabaymau.vn.', '[https://cabaymau.vn/x]', 'https://cabaymau.vn; https://example.org'])
    expect(namesRefused(t), t).toBe(true)
  for (const t of ['See (https://example.org/x).', 'https://example.org/wiki/Foo_(cabaymau.vn)', 'https://cabaymau.net, next'])
    expect(namesRefused(t), t).toBe(false)
  // A link's address in quotes is taken whole (Codex's third read, 17 Nov 2026).
  expect(namesRefused('<a href="https://example.org/?ref=(https://cabaymau.vn/x)">chia sẻ</a>')).toBe(false)
  expect(namesRefused('<a href=\'https://cabaymau.vn/x\'>trang</a>')).toBe(true)
  // Only an attribute's quotes: an apostrophe may stand in a link, and quotes in prose don't make one address of two (Codex's
  // fourth read, 17 Nov 2026).
  expect(namesRefused('<a href="https://example.org/?ref=(https://cabaymau.vn/x)&label=it\'s">link</a>')).toBe(false)
  expect(namesRefused('Xem "https://example.org/x,https://cabaymau.vn/x".')).toBe(true)
  // A fact whose own source is a share link stays (Codex, 17 Nov 2026), and so does one whose source isn't a web address:
  // a book, a relative path, another scheme (Codex's third read).
  const kept = ['https://example.org/?url=https://cabaymau.vn/x', 'https://example.org/?ref=(https://cabaymau.vn/x)', 'a book', 'example.org/cabaymau.vn', '/cabaymau.vn/x', '\\cabaymau.vn\\x', 'mailto:info@cabaymau.vn', 'ISBN: 978-0-00-000000-0']
  const shared = { found: true, facts: kept.map((_, i) => ({ section: 'x', fact: `f${i}`, source: i })), sources: kept.map(src) }
  expect(withoutRefused(shared).kept).toBe(shared)
  // One with its scheme written without slashes is the site's.
  expect(withoutRefused({ found: true, facts: [{ section: 'x', fact: 'f', source: 0 }], sources: [src('https:cabaymau.vn/x')] }).refused).toEqual([{ url: 'https:cabaymau.vn/x', items: 1 }])
})

// Codex's fourth read, 17 Nov 2026: research's copy-host list missed archive.fo and some proxies' hosts. Every host whose
// copies this file reads, or whose addresses it names, is one research may not fetch, itself or any host under it.
test('research may fetch no host this file reads copies from or names as a proxy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-refused-hosts-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_sources.json'), '{}')
  const off = await cycleOnlyHosts(root)
  for (const h of [...ARCHIVES, ...PROXY_HOSTS]) for (const u of [`https://${h}/x`, `https://sub.${h}/x`]) expect(refused(off, u), u).toBe(true)
})

// The chief of staff, 17 Nov 2026: a copy of a page under a proxy's host (Google's cache, Translate's proxy, a reader proxy)
// isn't unwrapped, so an address on one anywhere fails the check, and none stays none.
test('the check names a file with an address on a proxy\'s host', async () => {
  const yes = ['https://webcache.googleusercontent.com/search?q=cache:https://cabaymau.vn/x', 'https://cabaymau-vn.translate.goog/x?_x_tr_sl=vi', 'https://r.jina.ai/https://cabaymau.vn/x', 'https://R.JINA.AI./https://example.org/']
  const no = ['https://translate.google.com/', 'https://example.org/translate.goog', 'https://jina.ai/', 'https://web.archive.org/web/2024/https://example.org/', 'a book']
  expect(yes.map(onProxy)).toEqual(yes.map(() => true))
  expect(no.map(onProxy)).toEqual(no.map(() => false))
  const root = await mkdtemp(join(tmpdir(), 'aq-refused-proxy-'))
  for (const d of ['engine-state/glossary', 'content/glossary/t', 'content/guides/g']) await mkdir(join(root, d), { recursive: true })
  await writeFile(join(root, 'engine-state/glossary/t.json'), JSON.stringify({ found: true, facts: [{ section: 'x', fact: 'a', source: 0 }], sources: [src(yes[1]!)] }))
  await writeFile(join(root, 'content/guides/g/vi.json'), JSON.stringify({ slug: 'g', body: `<p>Xem <a href="${yes[2]}">trang này</a>.</p>` }))
  await writeFile(join(root, 'content/glossary/t/entity.json'), JSON.stringify({ id: 't', refs: [{ url: 'https://example.org/a', title: 'a' }] }))
  expect(await refusedScan(root)).toEqual({ naming: [], proxied: ['content/guides/g/vi.json', 'engine-state/glossary/t.json'] })
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

// Codex, 17 Nov 2026: the pass and the real-content check skipped a file that didn't spell the site's name plainly, though
// the address parses to it. Both read every file now, and the check is the same code the real-content test runs.
test('the pass and the check find the site\'s host however it is written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-refused-spelled-'))
  const term = join(root, 'content/glossary/t')
  await mkdir(term, { recursive: true })
  await mkdir(join(root, 'engine-state/glossary'), { recursive: true })
  // A source's or a reference's own address written without its scheme is one too (the second reader, 17 Nov 2026).
  const ways = ['https://%63abaymau.vn/x', 'https://ｃａｂａｙｍａｕ.vn/x', 'https://cabaymau。vn/x', 'www.cabaymau.vn/y', 'cabaymau.vn:443/z']
  const ref = (url: string) => ({ url, title: url })
  await writeFile(join(term, 'entity.json'), JSON.stringify({ id: 't', refs: [ref('https://a.example/1'), ...ways.map(ref)] }, null, 2))
  await writeFile(join(root, 'engine-state/glossary/t.json'), JSON.stringify({ found: true, facts: [{ section: 'x', fact: 'a', source: 0 }, ...ways.map((_, i) => ({ section: 'x', fact: `b${i}`, source: i + 1 }))], sources: [src('https://a.example/1'), ...ways.map(src)] }, null, 2))
  expect((await refusedScan(root)).naming).toEqual(['content/glossary/t/entity.json', 'engine-state/glossary/t.json'])
  const out = await refusedSweep(root)
  expect(out.facts.map(f => [f.file, f.dropped])).toEqual([['engine-state/glossary/t.json', 5]])
  expect(out.refs).toEqual([{ file: 'content/glossary/t/entity.json', urls: ways }])
  expect((await refusedScan(root)).naming).toEqual([])
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
  // Codex's second read: a reference list's item with no address (a null, an empty object) is kept as it is, a page that
  // doesn't parse is named, and the pass goes on to the next page.
  const page = (id: string) => join(root, `content/glossary/${id}`)
  for (const id of ['a', 'b', 'c', 'd']) await mkdir(page(id), { recursive: true })
  await writeFile(join(page('a'), 'entity.json'), JSON.stringify({ id: 'a', refs: [null, { url: REFUSED, title: 't' }] }))
  await writeFile(join(page('b'), 'entity.json'), JSON.stringify({ id: 'b', refs: [{}, { url: REFUSED, title: 't' }] }))
  await writeFile(join(page('c'), 'entity.json'), `{"id": "c", "refs": [{"url": "${REFUSED}"}`)
  await writeFile(join(page('d'), 'entity.json'), JSON.stringify({ id: 'd', refs: [{ url: REFUSED, title: 't' }, { url: 'https://a.example/1', title: 'u' }] }))
  const out = await refusedSweep(root)
  expect(out.failed).toHaveLength(2)
  expect(out.failed[0]).toMatch(/^engine-state\/glossary\/bad\.json: /)
  expect(out.failed[1]).toMatch(/^content\/glossary\/c\/entity\.json: /)
  expect(out.facts.map(f => f.file)).toEqual(['engine-state/glossary/good.json'])
  expect(out.refs.map(r => r.file)).toEqual(['a', 'b', 'd'].map(id => `content/glossary/${id}/entity.json`))
  expect(JSON.parse(await readFile(join(page('a'), 'entity.json'), 'utf8')).refs).toEqual([null])
  expect(JSON.parse(await readFile(join(page('b'), 'entity.json'), 'utf8')).refs).toEqual([{}])
  // The check stops at the first file that doesn't parse (pages are read before kept research), and names it.
  await expect(refusedScan(root)).rejects.toThrow(/^content\/glossary\/c\/entity\.json: /)
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
