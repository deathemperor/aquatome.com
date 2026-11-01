import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'

// The fish and plant lists must not grow with the catalogue: past their first page, a species or plant adds nothing to
// their HTML (#272 left ~0.6 KB and ~2.6 elements per species, and the catalogue grows ~50 species a day). The test
// content has fewer than a page of each, so the site is built twice more here, with 40 and then 80 made-up species and
// plants past the first page: the lists' HTML must come out the same but for the totals they print.
const SITE = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = join(SITE, 'test/fixture-content')
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const nn = (i: number) => String(i).padStart(2, '0')
const roots: string[] = []

/** The test content plus `extra` species and plants, each with its own name, address and photo, built into a folder. */
function buildWith(extra: number) {
  const root = mkdtempSync(join(tmpdir(), 'aq-growth-'))
  roots.push(root)
  const content = join(root, 'content')
  cpSync(FIXTURE, content, { recursive: true })
  const add = (kind: 'species' | 'plants', from: string, made: (i: number) => { id: string; sci: string; name: string; slug: string }) => {
    const entity = read(join(FIXTURE, kind, from, 'entity.json')), vi = read(join(FIXTURE, kind, from, 'vi.json'))
    for (let i = 1; i <= extra; i++) {
      const m = made(i)
      // One photo each (the test content's species have one or more), so they come after them in the list's order.
      const photos = [{ url: `https://media.aquatome.com/test/${m.id}.webp`, width: 960, height: 720, licence: 'CC BY 4.0', author: `Tác giả ${m.id}`, sourceUrl: `https://example.org/${m.id}` }]
      mkdirSync(join(content, kind, m.id), { recursive: true })
      writeFileSync(join(content, kind, m.id, 'entity.json'), JSON.stringify({ ...entity, id: m.id, scientificName: m.sci, photos }))
      writeFileSync(join(content, kind, m.id, 'vi.json'), JSON.stringify({ ...vi, name: m.name, slug: m.slug, altNames: [] }))
    }
  }
  add('species', 'paracheirodon-innesi', i => ({ id: `testus-thu-${nn(i)}`, sci: `Testus thu${nn(i)}`, name: `Cá thử ${nn(i)}`, slug: `ca-thu-${nn(i)}` }))
  add('plants', 'anubias-barteri-nana', i => ({ id: `plantus-thu-${nn(i)}`, sci: `Plantus thu${nn(i)}`, name: `Cây thử ${nn(i)}`, slug: `cay-thu-${nn(i)}` }))
  const out = join(root, 'dist')
  execFileSync('pnpm', ['exec', 'astro', 'build'], { cwd: SITE, env: { ...process.env, CONTENT_ROOT: content, OUT_DIR: out }, stdio: 'pipe' })
  return (path: string) => readFileSync(join(out, path, 'index.html'), 'utf8')
}

let small: (path: string) => string, large: (path: string) => string
beforeAll(() => { small = buildWith(40); large = buildWith(80) }, 600_000)
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

for (const [path, kind] of [['vi/ca', 'species'], ['vi/cay', 'plants']] as const) {
  test(`the ${kind} list's HTML is the same with 40 or 80 more ${kind} past its first page (/${path}/)`, () => {
    expect(otherDifference(small(path), large(path))).toBeUndefined()
  })
}
