import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { deeperPages, depthReport, namedPairs, runOrder, searchThin, thinSpecies, type SearchCache, type Thin } from '../src/depth'
import { sourceById } from '../src/sources'
import type { UrlState } from '../src/state'

const SF = 'https://www.seriouslyfish.com/species/'
const sf = sourceById('seriouslyfish')
const thinOf = (id: string, family = 'Callichthyidae'): Thin => {
  const [g, e] = id.split('-')
  return { id, name: id, scientificName: `${g![0]!.toUpperCase()}${g!.slice(1)} ${e}`, genus: `${g![0]!.toUpperCase()}${g!.slice(1)}`, family, sources: ['glaser'], depth: { deep: false, chars: 400, topics: [] } }
}

test('the species an address names', () => {
  expect(namedPairs(`${SF}betta-macrostoma`)).toEqual([['betta', 'macrostoma']])
  expect(namedPairs('https://www.scotcat.com/callichthyidae/corydoras_panda.htm')).toEqual([['corydoras', 'panda']])
  expect(namedPairs('https://www.scotcat.com/callichthyidae/corydoras_panda2.htm')).toEqual([]) // a photo page
})

test("thin species' profiles among a source's pages: same genus, any gender of the epithet; never another genus by address", () => {
  const thin = [thinOf('betta-macrostoma', 'Osphronemidae'), thinOf('glossolepis-incisus', 'Melanotaeniidae'), thinOf('corydoras-panda')]
  const found = [`${SF}aaa-new`, `${SF}betta-macrostoma`, `${SF}glossolepis-incisa`, `${SF}hoplisoma-panda`, 'https://www.seriouslyfish.com/articles/betta-macrostoma-in-the-wild'].map(url => ({ url }))
  expect([...deeperPages(found, thin, sf)]).toEqual([[`${SF}betta-macrostoma`, 0], [`${SF}glossolepis-incisa`, 1]])
  expect(deeperPages(found, thin, sourceById('glaser')).size).toBe(0) // a shallow source pulls nothing
})

test("a thin species listed under a newer name is found with the source's search, once a month, a few a run", async () => {
  const thin = [thinOf('corydoras-panda'), thinOf('corydoras-similis'), thinOf('corydoras-aeneus')]
  const families = new Map([['neolamprologus', 'Cichlidae'], ['corydoras', 'Callichthyidae']])
  const results: Record<string, string[]> = {
    'Corydoras panda': [`${SF}hoplisoma-oiapoquense`, `${SF}hoplisoma-panda`],
    'Corydoras similis': [`${SF}neolamprologus-similis`], // the same epithet in a genus we know in another family: not it
  }
  const searched: string[] = []
  const links = async (u: string) => { const q = decodeURIComponent(new URL(u).searchParams.get('q')!); searched.push(q); return results[q] ?? [] }
  const cache: SearchCache = {}
  const now = new Date('2026-10-31T00:00:00Z')
  const found = await searchThin(sf, thin, new Set(), families, links, cache, now, 2)
  expect([...found]).toEqual([[`${SF}hoplisoma-panda`, 0]])
  expect(searched).toEqual(['Corydoras panda', 'Corydoras similis']) // the budget: two searches
  expect(cache).toEqual({ 'seriouslyfish/corydoras-panda': { url: `${SF}hoplisoma-panda`, at: '2026-10-31' }, 'seriouslyfish/corydoras-similis': { url: null, at: '2026-10-31' } })
  // The next run: the found page from the cache, no search for the miss until a month has passed, the third searched now.
  searched.length = 0
  expect([...await searchThin(sf, thin, new Set(), families, links, cache, now)]).toEqual([[`${SF}hoplisoma-panda`, 0]])
  expect(searched).toEqual(['Corydoras aeneus'])
  searched.length = 0
  await searchThin(sf, thin, new Set(), families, links, cache, new Date('2026-12-15T00:00:00Z'))
  expect(searched).toEqual(['Corydoras similis', 'Corydoras aeneus'])
  // A species the index already matched is not searched; a source without a search searches nothing.
  searched.length = 0
  await searchThin(sf, thin, new Set([0, 1, 2]), families, links, {}, now)
  await searchThin(sourceById('scotcat'), thin, new Set(), families, links, {}, now)
  expect(searched).toEqual([])
})

test('run order: transient retries first, then thin species by popularity, then the rest as given', () => {
  const crash: UrlState = { status: 'error', entityIds: [], attempts: 1, updatedAt: '2026-10-29T04:05:56.271Z', error: 'page.goto: Target page, context or browser has been closed' }
  const state: Record<string, UrlState> = {
    [`${SF}betta-macrostoma`]: crash, // thin and crashed: first of all
    [`${SF}crashed-new`]: crash,
    [`${SF}limited`]: { ...crash, error: "claude failed (1): You've hit your 5-hour limit" },
    [`${SF}not-found`]: { ...crash, error: 'HTTP 404' },
  }
  const due = ['popular-new', 'crashed-new', 'other-new', 'hoplisoma-panda', 'not-found', 'limited', 'betta-macrostoma', 'danio-margaritatus'].map(u => ({ url: `${SF}${u}` }))
  const deeper = new Map([[`${SF}danio-margaritatus`, 3], [`${SF}hoplisoma-panda`, 1], [`${SF}betta-macrostoma`, 40]])
  expect(runOrder(due, state, deeper).map(f => f.url.slice(SF.length))).toEqual([
    'betta-macrostoma', 'crashed-new', 'limited', // transient retries (thin ones first)
    'hoplisoma-panda', 'danio-margaritatus', // thin species' profiles, most popular first
    'popular-new', 'other-new', 'not-found', // as given (wanted and popular first, from wantedFirst)
  ])
})

test('thin species and the report: by the sources pages are made from, most popular first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'depth-'))
  await mkdir(join(root, 'species'), { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(root, 'sources.json'))
  const page = async (id: string, sections: { key: string; source: string; html: string }[]) => {
    await mkdir(join(root, 'species', id))
    const [g, e] = id.split('-')
    await writeFile(join(root, 'species', id, 'entity.json'), JSON.stringify({ id, scientificName: `${g} ${e}`, genus: g, family: 'F', sections: sections.map(s => ({ ...s, sourceUrl: 'https://x' })) }))
    await writeFile(join(root, 'species', id, 'vi.json'), JSON.stringify({ name: `Cá ${id}` }))
  }
  await page('betta-macrostoma', [{ key: 'reproduction', source: 'bwaquatics', html: '<p>Mouthbrooder.</p>' }])
  await page('corydoras-panda', [{ key: 'notes', source: 'glaser', html: '<p>Pandas.</p>' }])
  await page('danio-margaritatus', [{ key: 'notes', source: 'seriouslyfish', html: '<p>Myanmar.</p>' }])
  await page('mixed-fish', [{ key: 'notes', source: 'glaser', html: '<p>A.</p>' }, { key: 'diet', source: 'bwaquatics', html: '<p>B.</p>' }])
  const { pages, thin } = await thinSpecies(root, ['corydoras-panda'])
  expect(thin.map(t => t.id)).toEqual(['corydoras-panda', 'betta-macrostoma', 'mixed-fish'])
  expect(depthReport(pages, thin, 2)).toEqual({
    pages: 4, thin: 3, bySource: { 'bwaquatics': 1, 'bwaquatics+glaser': 1, glaser: 1 },
    top: [{ id: 'corydoras-panda', name: 'Cá corydoras-panda', sources: 'glaser', chars: 7 }, { id: 'betta-macrostoma', name: 'Cá betta-macrostoma', sources: 'bwaquatics', chars: 13 }],
  })
})
