import { readFileSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import { ChallengeError } from '../src/fetch'
import { runEngine } from '../src/run'

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8')
const SF = 'https://www.seriouslyfish.com/species/'
const sitemap = (urls: string[]) => `<urlset>${urls.map(u => `<url><loc>${SF}${u}</loc><lastmod>2026-10-01</lastmod></url>`).join('')}</urlset>`

const species = {
  kind: 'species', scientificName: 'Paracheirodon axelrodi', enCommonNames: ['Cardinal Tetra'], viName: 'Cá neon vua', viAltNames: [], group: 'tetras',
  places: [{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }], dataCard: { tempC: { min: 23, max: 29 } },
  sections: [{ key: 'habitat', en: '<p>Blackwater.</p>', vi: '<p>Nước đen.</p>' }], productSlots: [],
}

function deps(root: string, opts: { urls?: string[]; score?: number; page?: object; llmFails?: boolean } = {}) {
  const calls = { images: 0, commons: 0, llm: 0, review: 0, process: 0, sleeps: 0, prompts: [] as string[] }
  const fetcher = {
    text: async (_u: string) => sitemap(opts.urls ?? ['paracheirodon-axelrodi', 'broken-fish', 'blocked-fish']),
    links: async () => [],
    get: async (url: string) => {
      if (url.endsWith('broken-fish')) throw new Error('net::ERR_CONNECTION_RESET')
      return { status: 200, html: fx(url.endsWith('blocked-fish') ? 'pages/challenge.html' : 'pages/seriouslyfish-cardinal.html'), finalUrl: url }
    },
    bytes: async (url: string) => { calls.images++; return new TextEncoder().encode(url) },
  }
  const media = { urlFor: (k: string) => `https://media.test/${k}`, put: async (k: string) => ({ url: `https://media.test/${k}`, width: 800, height: 600 }) }
  const llm = async <T,>(a: { prompt: string; schema: object }): Promise<T> => {
    calls.llm++
    calls.prompts.push(a.prompt)
    if ('score' in ((a.schema as { properties?: object }).properties ?? {})) { calls.review++; return { score: opts.score ?? 0.9, notes: ['fix "Nước đen"'] } as T }
    if (opts.llmFails) throw new LlmError('claude failed (1): usage limit')
    calls.process++
    return structuredClone(opts.page ?? species) as T
  }
  const http = async (url: string) => {
    if (url.includes('gbif')) return JSON.parse(fx('gbif/paracheirodon-axelrodi.json'))
    calls.commons++
    return JSON.parse(fx('commons/paracheirodon-axelrodi.json'))
  }
  const d = { fetcher, llm, http, media, root, now: () => new Date('2026-10-28T10:00:00Z'), sleep: async () => { calls.sleeps++ } }
  return { d, calls }
}

/** Empty repo root with the real source registry (names for photo credits). */
async function fresh() {
  const root = await mkdtemp(join(tmpdir(), 'eng-'))
  await mkdir(join(root, 'content'))
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(root, 'content/sources.json'))
  return root
}

async function tree(dir: string, base = dir): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) Object.assign(out, await tree(p, base))
    else out[p.slice(base.length)] = await readFile(p, 'utf8')
  }
  return out
}

test('full run writes entity, translation, places, snapshot, state, changelog; blocked and errors recorded', async () => {
  const root = await fresh()
  const { d, calls } = deps(root)
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish).toEqual({ discovered: 3, fetched: 3, processed: 1, skipped: 0, blocked: 1, errors: 1 })
  expect(r.needsHuman).toEqual(['seriouslyfish'])
  expect(calls).toMatchObject({ process: 1, review: 1 })
  expect(calls.sleeps).toBeGreaterThanOrEqual(4) // discovery + 3 page fetches are throttled
  const t = await tree(root)
  const entity = JSON.parse(t['/content/species/paracheirodon-axelrodi/entity.json']!)
  expect(entity).toMatchObject({ family: 'Characidae', places: ['south-america', 'brazil', 'rio-negro'] })
  expect(entity.photos).toHaveLength(4) // best source photos, copied once, credited to the source
  expect(entity.photos[0]).toMatchObject({ source: 'seriouslyfish', author: 'Seriously Fish', sourceUrl: `${SF}paracheirodon-axelrodi`, caption: 'Adult male individual.' })
  expect(calls).toMatchObject({ images: 4, commons: 0 })
  expect(JSON.parse(t['/content/species/paracheirodon-axelrodi/vi.json']!)).toMatchObject({ slug: 'ca-neon-vua', quality: { indexable: true } })
  expect(t['/content/places/rio-negro/entity.json']).toContain('"river"')
  expect(Object.keys(t).filter(k => k.startsWith('/sources/seriouslyfish/'))).toEqual(['/sources/seriouslyfish/species-paracheirodon-axelrodi.md'])
  const state = JSON.parse(t['/engine-state/seriouslyfish.json']!)
  expect(state[`${SF}blocked-fish`].status).toBe('blocked')
  expect(state[`${SF}broken-fish`]).toMatchObject({ status: 'error', attempts: 1 })
  expect(state[`${SF}paracheirodon-axelrodi`]).toMatchObject({ status: 'processed', entityIds: ['species/paracheirodon-axelrodi'] })
  expect(JSON.parse(t['/content/changelog.json']!)).toEqual([{ date: '2026-10-28', kind: 'species', id: 'paracheirodon-axelrodi', source: 'seriouslyfish', action: 'new' }])
  expect(r.changed).toHaveLength(1)
})

test('second identical run makes no llm calls and changes no file', async () => {
  const root = await fresh()
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'] }).d, { sources: ['seriouslyfish'] })
  const before = await tree(root)
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(calls.llm).toBe(0)
  expect(r.perSource.seriouslyfish?.fetched).toBe(0)
  expect(await tree(root)).toEqual(before)
})

test('force re-translates only the pages matched by `only`, even when unchanged', async () => {
  const root = await fresh()
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi', 'symphysodon-discus'] }).d, { sources: ['seriouslyfish'] })
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi', 'symphysodon-discus'] })
  const r = await runEngine(d, { sources: ['seriouslyfish'], only: /axelrodi/, force: true })
  expect(r.perSource.seriouslyfish?.fetched).toBe(1)
  expect(r.perSource.seriouslyfish?.processed).toBe(1)
  expect(calls.process).toBeGreaterThan(0)
})

test('a browser check during discovery marks the source needs-human', async () => {
  const root = await fresh()
  const { d, calls } = deps(root)
  d.fetcher.text = async (u: string) => { throw new ChallengeError(u) }
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(r.needsHuman).toEqual(['seriouslyfish'])
  expect(r.perSource.seriouslyfish).toMatchObject({ discovered: 0, blocked: 1, errors: 0 })
  expect(calls.llm).toBe(0)
})

test('limit is respected per source', async () => {
  const root = await fresh()
  const r = await runEngine(deps(root).d, { sources: ['seriouslyfish'], limit: 1 })
  expect(r.perSource.seriouslyfish).toMatchObject({ discovered: 3, fetched: 1, processed: 1 })
})

test('low quality: one re-translation with reviewer notes, then noindex', async () => {
  const root = await fresh()
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'], score: 0.5 })
  await runEngine(d, { sources: ['seriouslyfish'] })
  expect(calls).toMatchObject({ process: 2, review: 2 })
  expect(calls.prompts[2]).toContain('fix "Nước đen"')
  const vi = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect(vi.quality).toMatchObject({ score: 0.5, indexable: false, bySource: { seriouslyfish: 0.5 } })
})

test('a challenge stops the source, keeps processedHash, and the source is skipped for a day unless retried explicitly', async () => {
  const root = await fresh()
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'] }).d, { sources: ['seriouslyfish'] })
  const stateOf = async () => JSON.parse(await readFile(join(root, 'engine-state/seriouslyfish.json'), 'utf8'))
  const hash = (await stateOf())[`${SF}paracheirodon-axelrodi`].processedHash
  const ch = deps(root)
  ch.d.fetcher.text = async () => `<urlset><url><loc>${SF}paracheirodon-axelrodi</loc><lastmod>2026-10-20</lastmod></url><url><loc>${SF}other-fish</loc></url></urlset>`
  ch.d.fetcher.get = async (url: string) => ({ status: 200, html: fx('pages/challenge.html'), finalUrl: url })
  const r = await runEngine(ch.d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish).toMatchObject({ fetched: 1, blocked: 1 })
  expect((await stateOf())[`${SF}paracheirodon-axelrodi`]).toMatchObject({ status: 'blocked', processedHash: hash })
  const again = deps(root, { urls: ['other-fish'] })
  const r2 = await runEngine(again.d, { sources: ['seriouslyfish'] })
  expect(r2.perSource.seriouslyfish).toMatchObject({ discovered: 0, fetched: 0 })
  expect(r2.needsHuman).toEqual(['seriouslyfish'])
  const r3 = await runEngine(deps(root, { urls: ['other-fish'] }).d, { sources: ['seriouslyfish'], retryBlocked: true })
  expect(r3.perSource.seriouslyfish).toMatchObject({ fetched: 1, processed: 1 })
})

test('unchanged content refetched after a lastmod bump: no llm calls, error cleared', async () => {
  const root = await fresh()
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'] }).d, { sources: ['seriouslyfish'] })
  const bumped = deps(root, { urls: ['paracheirodon-axelrodi'] })
  bumped.d.fetcher.text = async () => `<urlset><url><loc>${SF}paracheirodon-axelrodi</loc><lastmod>2026-10-20</lastmod></url></urlset>`
  const r = await runEngine(bumped.d, { sources: ['seriouslyfish'] })
  expect(bumped.calls.llm).toBe(0)
  expect(r.perSource.seriouslyfish).toMatchObject({ fetched: 1, skipped: 1, processed: 0 })
  expect(r.changed).toHaveLength(0)
})

test('a poorer page from the same source does not replace a richer one', async () => {
  const root = await fresh()
  const rich = { ...species, sections: [...species.sections, { key: 'diet', en: '<p>Small.</p>', vi: '<p>Nhỏ.</p>' }] }
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'], page: rich }).d, { sources: ['seriouslyfish'] })
  const poor = { ...species, sections: [{ key: 'notes', en: '<p>News.</p>', vi: '<p>Tin.</p>' }] }
  const r = await runEngine(deps(root, { urls: ['cardinal-news'], page: poor }).d, { sources: ['seriouslyfish'] })
  const vi = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect(Object.keys(vi.sections).sort()).toEqual(['diet:seriouslyfish', 'habitat:seriouslyfish'])
  expect(r.changed).toHaveLength(0)
})

test('a failed photo upload fails the page so it is retried', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  d.media.put = async () => { throw new Error('R2 upload 403') }
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish).toMatchObject({ errors: 1, processed: 0 })
})

test('repeated LLM failures stop the run instead of burning every URL', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['f1', 'f2', 'f3', 'f4', 'f5'], llmFails: true })
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish?.fetched).toBe(3)
  expect(r.errors.at(-1)).toMatch(/stopping/)
})

test('least-covered source runs first and gets only a fair share of the time', async () => {
  const root = await fresh()
  await mkdir(join(root, 'engine-state'))
  const seen = Object.fromEntries(['a', 'b', 'c', 'd'].map(k => [`https://tropica.com/${k}`, { status: 'processed', entityIds: [], updatedAt: '2026-10-01T00:00:00Z' }]))
  await writeFile(join(root, 'engine-state', 'tropica.json'), JSON.stringify(seen))
  const { d } = deps(root)
  let t = new Date('2026-10-28T10:00:00Z').getTime()
  d.now = () => new Date(t)
  const get = d.fetcher.get
  d.fetcher.get = async (u: string) => { t += 10 * 60_000; return get(u) }
  const r = await runEngine(d, { sources: ['tropica', 'seriouslyfish'], maxMinutes: 30 })
  expect(Object.keys(r.perSource)).toEqual(['seriouslyfish', 'tropica'])
  // 30 min over 2 sources → 15 min for Seriously Fish: fetches at t=0 and t=10, stops before the third.
  expect(r.perSource.seriouslyfish?.fetched).toBe(2)
})

test('a closed browser stops the run without marking the page as an error', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['paracheirodon-axelrodi', 'broken-fish'] })
  let gets = 0
  d.fetcher.get = async () => { gets++; throw new Error('page.goto: Target page, context or browser has been closed') }
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(gets).toBe(1)
  expect(r.errors.at(-1)).toContain('stopping: the browser closed')
  expect(JSON.parse(await readFile(join(root, 'engine-state', 'seriouslyfish.json'), 'utf8').catch(() => '{}'))['https://www.seriouslyfish.com/species/paracheirodon-axelrodi']?.status).not.toBe('error')
})
