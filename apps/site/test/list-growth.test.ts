import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { allPages } from '../e2e/pages'
import { unreached } from './reach'

// The fish and plant lists must not grow with the catalogue: past their first page, a species or plant adds nothing to
// their HTML (#272 left ~0.6 KB and ~2.6 elements per species, and the catalogue grows ~50 species a day). The test
// content has fewer than a page of each, so the site is built twice more here, with 40 and then 80 made-up species and
// plants past the first page: the lists' HTML must come out the same but for the totals they print. The same holds for
// the pages that list some of the species (2026-11-01, on the real build: /vi/nguon-goc/asia/ had 11,039 elements, the
// fish groups' pages up to 5,384): the made-up species are copies of one fish, so they join its group's page, its
// order's, family's and genus's, and those of the continent and countries it comes from.
const SITE = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(SITE, 'test/fixture-content')
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const nn = (i: number) => String(i).padStart(2, '0')
/** Guides go past 99: three digits, so their folders sort in number order. */
const nnn = (i: number) => String(i).padStart(3, '0')
const roots: string[] = []

/** The test content plus `extra` species and plants, each with its own name, address and photo, built into a folder. */
function buildWith(extra: number) {
  // Inside the site (gitignored .astro/), not the OS temp dir: Astro moves built files into OUT_DIR with rename(), which
  // fails across filesystems (EXDEV), and some CI runners mount /tmp separately from the checkout (as public-build.test).
  mkdirSync(join(SITE, '.astro'), { recursive: true })
  const root = mkdtempSync(join(SITE, '.astro', 'growth-'))
  roots.push(root)
  const content = join(root, 'content')
  cpSync(FIXTURE, content, { recursive: true })
  const add = (kind: 'species' | 'plants', from: string, made: (i: number) => { id: string; sci: string; name: string; slug: string }, n = extra) => {
    const entity = read(join(FIXTURE, kind, from, 'entity.json')), vi = read(join(FIXTURE, kind, from, 'vi.json'))
    for (let i = 1; i <= n; i++) {
      const m = made(i)
      // One photo each (the test content's species have one or more), so they come after them in the list's order.
      const photos = [{ url: `https://media.aquatome.com/test/${m.id}.webp`, width: 960, height: 720, licence: 'CC BY 4.0', author: `Tác giả ${m.id}`, sourceUrl: `https://example.org/${m.id}` }]
      mkdirSync(join(content, kind, m.id), { recursive: true })
      writeFileSync(join(content, kind, m.id, 'entity.json'), JSON.stringify({ ...entity, id: m.id, scientificName: m.sci, photos }))
      writeFileSync(join(content, kind, m.id, 'vi.json'), JSON.stringify({ ...vi, name: m.name, slug: m.slug, altNames: [] }))
      // An Indonesian page too for the made-up fish (the test content has none), so the Indonesian group has numbered pages.
      if (kind === 'species') writeFileSync(join(content, kind, m.id, 'id.json'), JSON.stringify({ ...vi, name: m.name, slug: m.slug, altNames: [] }))
    }
  }
  // Ten more species than `extra`, as for guides below: a list that holds two of the fixture's species and the made-up
  // ones has a full page left after its first in both builds.
  add('species', 'paracheirodon-innesi', i => ({ id: `testus-thu-${nn(i)}`, sci: `Testus thu${nn(i)}`, name: `Cá thử ${nn(i)}`, slug: `ca-thu-${nn(i)}` }), extra + 10)
  add('plants', 'anubias-barteri-nana', i => ({ id: `plantus-thu-${nn(i)}`, sci: `Plantus thu${nn(i)}`, name: `Cây thử ${nn(i)}`, slug: `cay-thu-${nn(i)}` }))
  // Guides too (the guide list went over its page-element budget at about 230 guides, 2026-11-01). Ten more than `extra`:
  // both builds have a full page left after the first ("Xem thêm 24 bài" in both) and totals of two digits.
  const guide = read(join(FIXTURE, 'guides/setup-be-dau-tien/entity.json')), gvi = read(join(FIXTURE, 'guides/setup-be-dau-tien/vi.json'))
  for (let i = 1; i <= extra + 10; i++) {
    const id = `zz-bai-thu-${nnn(i)}`
    mkdirSync(join(content, 'guides', id), { recursive: true })
    writeFileSync(join(content, 'guides', id, 'entity.json'), JSON.stringify({ ...guide, id, sourceUrl: `https://example.invalid/${id}`, photos: [{ ...guide.photos[0], url: `https://media.aquatome.com/test/${id}.webp`, author: `Tác giả ${id}`, sourceUrl: `https://example.org/${id}` }] }))
    writeFileSync(join(content, 'guides', id, 'vi.json'), JSON.stringify({ ...gvi, name: `Bài thử ${nnn(i)}`, slug: `bai-thu-${nnn(i)}` }))
  }
  const out = join(root, 'dist')
  execFileSync('pnpm', ['exec', 'astro', 'build'], { cwd: SITE, env: { ...process.env, CONTENT_ROOT: content, OUT_DIR: out }, stdio: 'pipe' })
  return { dist: out, page: (path: string) => readFileSync(join(out, path, 'index.html'), 'utf8') }
}

let small: (path: string) => string, large: (path: string) => string, largeDist: string
beforeAll(() => { small = buildWith(40).page; ({ page: large, dist: largeDist } = buildWith(80)) }, 600_000)
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }) })

/**
 * Where the two builds' pages differ, each difference must be a total (40 more in the second, with as many digits),
 * never a species or plant: the first other difference, with what is around it.
 */
function otherDifference(x: string, y: string): string | undefined {
  if (x.length !== y.length) return `the pages differ in length: ${x.length} and ${y.length} characters`
  const digits = (s: string, i: number) => { let j = i, k = i; while (/\d/.test(s[j - 1] ?? '')) j--; while (/\d/.test(s[k] ?? '')) k++; return s.slice(j, k) }
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue
    const [a, b] = [digits(x, i), digits(y, i)]
    if (!a || !b || Number(b) - Number(a) !== 40) return `…${x.slice(i - 100, i + 100)}… against …${y.slice(i - 100, i + 100)}…`
  }
}

for (const [path, kind] of [['vi/ca', 'species'], ['vi/cay', 'plants'], ['vi/huong-dan', 'guides']] as const) {
  test(`the ${kind} list's HTML is the same with 40 or 80 more ${kind} past its first page (/${path}/)`, () => {
    expect(otherDifference(small(path), large(path))).toBeUndefined()
  })
}

// The pages the made-up species join, as the fixture's fish they copy has them: its group, its taxa, its places.
const NEON = read(join(FIXTURE, 'species/paracheirodon-innesi/entity.json'))
const PLACES = new Map(readdirSync(join(FIXTURE, 'places')).map(id => [id, read(join(FIXTURE, 'places', id, 'entity.json'))]))
const TAXON = [NEON.order, NEON.family, NEON.genus].map((x: string) => x.toLowerCase())
const SPECIES_PAGES = [
  `vi/nhom/${NEON.group}`,
  ...[1, 2, 3].map(i => `vi/phan-loai/${TAXON.slice(0, i).join('/')}`),
  ...(NEON.places as string[]).flatMap(id => {
    const p = PLACES.get(id)
    return p?.kind === 'continent' ? [`vi/nguon-goc/${id}`] : p?.kind === 'country' ? [`vi/nguon-goc/${p.parent}/${id}`] : []
  }),
]
test('the made-up species join a group, three taxa and places with pages', () => expect(SPECIES_PAGES.length).toBeGreaterThanOrEqual(6))
for (const path of SPECIES_PAGES) {
  test(`a page listing some species has the same HTML with 40 or 80 more of them past its first page (/${path}/)`, () => {
    expect(otherDifference(small(path), large(path))).toBeUndefined()
  })
}

// Past the first page, guides are linked from numbered pages ("Xem thêm" on the list is a link to the next one), so
// crawlers and readers without the list's script still reach every guide.
test('the guide list and its numbered pages link every guide, a page at a time', () => {
  const links = (html: string) => [...html.matchAll(/<a class="gc[^"]*" href="\/vi\/huong-dan\/([^"/]+)\/"/g)].map(m => m[1]!)
  const seen: string[] = []
  let path: string | undefined = 'vi/huong-dan', pages = 0
  while (path) {
    const html = large(path), list: boolean = path === 'vi/huong-dan'
    // The list's own page also has the beginner row: only its "Tất cả hướng dẫn" grid counts.
    const own: string = list ? html.slice(html.indexOf('id="guide-list"')) : html
    seen.push(...links(own.slice(0, own.search(/<template|<nav class="pages"|<\/main>/))))
    path = (list ? /<a id="guide-more" href="\/(vi\/huong-dan\/trang\/\d+)\/"/ : /<a href="\/(vi\/huong-dan\/trang\/\d+)\/" rel="next"/).exec(own)?.[1]
    if (++pages > 10) break
  }
  const all = Array.from({ length: 80 + 10 }, (_, i) => `bai-thu-${nnn(i + 1)}`)
  expect(all.filter(s => !seen.includes(s)), 'guides no page links').toEqual([])
  expect(new Set(seen).size, 'no guide on two pages').toBe(seen.length)
  expect(pages).toBe(Math.ceil(seen.length / 24))
})

// Past the first page, a fish group's species are linked from its numbered pages ("Xem thêm" on the group's page is a
// link to the next one), so crawlers and readers without the page's script still reach every species.
test("a fish group's page and its numbered pages link every species of the group, a page at a time", () => {
  const links = (html: string) => [...html.matchAll(/<a href="\/vi\/ca\/([^"/]+)\/"/g)].map(m => m[1]!)
  const seen: string[] = []
  let path: string | undefined = `vi/nhom/${NEON.group}`, pages = 0
  while (path) {
    const html = large(path), own = html.slice(html.indexOf('class="grid"'))
    seen.push(...links(own.slice(0, own.search(/<template|<nav class="pages"|<\/main>/))))
    path = (pages === 0 ? /<a data-more href="\/(vi\/nhom\/[^/]+\/trang\/\d+)\/"/ : /<a href="\/(vi\/nhom\/[^/]+\/trang\/\d+)\/" rel="next"/).exec(own)?.[1]
    if (++pages > 10) break
  }
  const made = Array.from({ length: 80 + 10 }, (_, i) => `ca-thu-${nn(i + 1)}`)
  expect(made.filter(s => !seen.includes(s)), 'species no page links').toEqual([])
  expect(new Set(seen).size, 'no species on two pages').toBe(seen.length)
  expect(pages).toBe(Math.ceil(seen.length / 24))
})

// A numbered page's links, its language menu's too, lead to pages that exist, in Vietnamese and in Indonesian (a group's
// page 2 once linked its Vietnamese version to /vi/nhom/, a page there isn't).
test("a fish group's numbered pages link only pages that exist, in every language", () => {
  const pages = new Set(allPages(largeDist))
  for (const path of [`vi/nhom/${NEON.group}/trang/2`, `id/kelompok/${NEON.group}/halaman/2`]) {
    const hrefs = [...large(path).matchAll(/<a\b[^>]*?\shref="(\/(?:vi|id|th)\/[^"]*)"/g)].map(m => m[1]!.replace(/[?#].*$/, ''))
    expect(hrefs.length, path).toBeGreaterThan(24)
    expect([...new Set(hrefs)].filter(h => !pages.has(h)), `/${path}/: links to missing pages`).toEqual([])
  }
})

// With every list longer than a page, every species, plant and guide is still a chain of links from the home pages.
test('every species, plant and guide page is reached from the home pages when the lists are longer than a page', () => {
  const r = unreached(largeDist)
  expect(r.items).toBeGreaterThan(80)
  expect(r.unreached, 'pages no link leads to').toEqual([])
}, 120_000)
