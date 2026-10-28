import { readFileSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { runEngine } from '../src/run'

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8')
const SF = 'https://www.seriouslyfish.com/species/'
const sitemap = (urls: string[]) => `<urlset>${urls.map(u => `<url><loc>${SF}${u}</loc><lastmod>2026-10-01</lastmod></url>`).join('')}</urlset>`

const species = {
  kind: 'species', scientificName: 'Paracheirodon axelrodi', enCommonNames: ['Cardinal Tetra'], viName: 'Cá neon vua', viAltNames: [], group: 'tetras',
  places: [{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }], dataCard: { tempC: { min: 23, max: 29 } },
  sections: [{ key: 'habitat', en: '<p>Blackwater.</p>', vi: '<p>Nước đen.</p>' }], productSlots: [],
}

function deps(root: string, opts: { urls?: string[]; score?: number } = {}) {
  const calls = { images: 0, commons: 0, llm: 0, review: 0, process: 0, sleeps: 0, prompts: [] as string[] }
  const fetcher = {
    text: async () => sitemap(opts.urls ?? ['paracheirodon-axelrodi', 'broken-fish', 'blocked-fish']),
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
    calls.process++
    return structuredClone(species) as T
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
