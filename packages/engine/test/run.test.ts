import { denied } from './piece-admission'
import { readFileSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import sharp from 'sharp'
import { ArchiveRefused } from '../src/archive'
import { LlmError } from '../src/claude'
import { ChallengeError } from '../src/fetch'
import { runEngine, soft } from '../src/run'
import { moveToArchive } from '../src/state'
import { WikimediaRefused } from '../src/wikimedia-rest'

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), 'utf8')
const SF = 'https://www.seriouslyfish.com/species/'
const sitemap = (urls: string[]) => `<urlset>${urls.map(u => `<url><loc>${SF}${u}</loc><lastmod>2026-10-01</lastmod></url>`).join('')}</urlset>`

const species = {
  kind: 'species', scientificName: 'Paracheirodon axelrodi', enCommonNames: ['Cardinal Tetra'], viName: 'Cá neon vua', viAltNames: [], group: 'tetras',
  places: [{ continent: 'South America', country: 'Brazil', region: 'Rio Negro' }], dataCard: { tempC: { min: 23, max: 29 } },
  sections: [{ key: 'habitat', en: '<p>Blackwater.</p>', vi: '<p>Nước đen.</p>' }], productSlots: [],
}

function deps(root: string, opts: { urls?: string[]; score?: number; /** The reviewer's reads in turn, then `score`. */ scores?: number[]; page?: object; llmFails?: boolean; rewritten?: string } = {}) {
  const calls = { images: 0, commons: 0, llm: 0, review: 0, process: 0, rewrite: 0, sleeps: 0, prompts: [] as string[] }
  const fetcher = {
    text: async (_u: string) => sitemap(opts.urls ?? ['paracheirodon-axelrodi', 'broken-fish', 'blocked-fish']),
    links: async (_u: string): Promise<string[]> => [],
    get: async (url: string) => {
      if (url.endsWith('broken-fish')) throw new Error('net::ERR_CONNECTION_RESET')
      return { status: 200, html: fx(url.endsWith('blocked-fish') ? 'pages/challenge.html' : 'pages/seriouslyfish-cardinal.html'), finalUrl: url }
    },
    bytes: async () => { calls.images++; return sharp({ create: { width: 800, height: 600, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
  }
  const media = { urlFor: (k: string) => `https://media.test/${k}`, put: async (k: string) => ({ url: `https://media.test/${k}`, width: 800, height: 600 }) }
  const llm = async <T,>(a: { prompt: string; schema: object }): Promise<T> => {
    calls.llm++
    calls.prompts.push(a.prompt)
    if ('score' in ((a.schema as { properties?: object }).properties ?? {})) { const score = opts.scores?.[calls.review] ?? opts.score ?? 0.9; calls.review++; return { score, notes: ['fix "Nước đen"'] } as T }
    if (opts.llmFails) throw new LlmError('claude failed (1): usage limit')
    if ('parts' in ((a.schema as { properties?: object }).properties ?? {})) { calls.rewrite++; return { parts: [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => ({ id: m[1], vi: opts.rewritten ?? `<p>Viết lại ${m[1]}</p>` })) } as T }
    calls.process++
    return structuredClone(opts.page ?? species) as T
  }
  const http = async (url: string) => {
    // GBIF knows the one species these pages are about; other names (the popular list's) it can't place.
    if (url.includes('gbif')) return JSON.parse(fx(url.includes('Paracheirodon%20axelrodi') ? 'gbif/paracheirodon-axelrodi.json' : 'gbif/none.json'))
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
  expect(calls).toMatchObject({ process: 1, rewrite: 1, review: 1 }) // the style pass runs on every new translation
  const vi = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect(Object.values(vi.sections)).toContain('<p>Viết lại habitat</p>')
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

test('a new page is written in metric only, whatever the writer kept of the source\'s units', async () => {
  const root = await fresh()
  const { d } = deps(root, { rewritten: '<p>Nhiệt độ 23–29°C (73–84°F), cá dài 2 inch (khoảng 5 cm), bể 10 gallon.</p>' })
  await runEngine(d, { sources: ['seriouslyfish'] })
  const vi = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect(Object.values(vi.sections)).toContain('<p>Nhiệt độ 23–29°C, cá dài 5 cm, bể 38 lít.</p>')
})
test('a guide translated from a source is written in metric only too', async () => {
  const root = await fresh()
  const guide = { kind: 'guide', scientificName: 'none', enCommonNames: [], viName: '', viAltNames: [], places: [], dataCard: {}, sections: [], productSlots: [], guide: { kind: 'care', viTitle: 'Bể 20 gallon', viBody: '<p>x</p>' } }
  const { d } = deps(root, { urls: ['paracheirodon-axelrodi'], page: guide, rewritten: '<p>Bể 20 gallon long, nước 75 °F, ống PVC ¾ inch.</p>' })
  await runEngine(d, { sources: ['seriouslyfish'] })
  const dir = (await readdir(join(root, 'content/guides')))[0]!
  const vi = JSON.parse(await readFile(join(root, 'content/guides', dir, 'vi.json'), 'utf8'))
  expect(vi.body).toBe('<p>Bể khoảng 75 lít (76 × 30 × 30 cm), nước 24 °C, ống PVC phi 27.</p>')
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

test('an archived source falls back on its last good index while the archive index is down', async () => {
  const root = await fresh()
  const { d } = deps(root)
  const page = 'https://www.planetcatfish.com/common/species.php?species_id=9'
  const archive = { ...d.fetcher, text: async () => `${page}\n`, get: async () => { throw new Error('no archived copy (HTTP 404)') } }
  const first = await runEngine({ ...d, archive }, { sources: ['planetcatfish'] })
  expect(first.perSource.planetcatfish).toMatchObject({ discovered: 1 })
  const down = await runEngine({ ...d, archive: { ...archive, text: async () => { throw new Error('HTTP 503 from web.archive.org') } } }, { sources: ['planetcatfish'] })
  expect(down.perSource.planetcatfish).toMatchObject({ discovered: 1 })
  expect(down.errors.join('\n')).toMatch(/using the last index \(1 pages\)/)
})

test('the archive slowing us down stops that source at once, with no attempt used and the other sources still running', async () => {
  const root = await fresh()
  const { d } = deps(root)
  const pages = [9, 10, 11].map(n => `https://www.planetcatfish.com/common/species.php?species_id=${n}`)
  let asked = 0
  const archive = { ...d.fetcher, text: async () => `${pages.join('\n')}\n`, get: async () => { asked++; throw new Error('no archived copy (HTTP 429)') } }
  const r = await runEngine({ ...d, archive }, { sources: ['planetcatfish', 'seriouslyfish'] })
  expect(asked).toBe(1)
  expect(r.errors.join('\n')).toMatch(/planetcatfish: stopping: the archive asked us to slow down/)
  expect(r.perSource.seriouslyfish).toMatchObject({ processed: 1 })
  const state = JSON.parse(await readFile(join(root, 'engine-state/planetcatfish.json'), 'utf8')) as Record<string, { attempts: number }>
  expect(Object.values(state).map(s => s.attempts)).toEqual([0])
})

test('the archive refusing this Mac: the source stops, no page is marked, and the next archived source asks nothing', async () => {
  const root = await fresh()
  const { d } = deps(root)
  const pages = [9, 10].map(n => `https://www.planetcatfish.com/common/species.php?species_id=${n}`)
  let asked = 0
  const archive = { ...d.fetcher, text: async () => `${pages.join('\n')}\n`, get: async () => { asked++; throw new ArchiveRefused('2026-11-10T12:00:00.000Z') } }
  const r = await runEngine({ ...d, archive }, { sources: ['planetcatfish', 'seriouslyfish'] })
  expect(asked).toBe(1)
  expect(r.errors.join('\n')).toMatch(/planetcatfish: not read: the archive refused this Mac: no request before 2026-11-10T12:00:00.000Z/)
  expect(r.perSource.seriouslyfish).toMatchObject({ processed: 1 })
  expect(JSON.parse(await readFile(join(root, 'engine-state/planetcatfish.json'), 'utf8').catch(() => '{}'))).toEqual({})
})

test('Wikimedia resting: a page that needs it waits, unmarked and with its attempts, and the source goes on; a refusal is no "nothing found"', async () => {
  const root = await fresh()
  const { d } = deps(root)
  const get = d.fetcher.get
  const fetcher = { ...d.fetcher, get: async (url: string) => { if (url.endsWith('broken-fish')) throw new WikimediaRefused('2026-10-28T22:00:00.000Z'); return get(url) } }
  const r = await runEngine({ ...d, fetcher }, { sources: ['seriouslyfish'] })
  expect(r.errors).toContain(`${SF}broken-fish: waits for Wikimedia: Wikimedia refused this Mac: no request before 2026-10-28T22:00:00.000Z`)
  const state = JSON.parse(await readFile(join(root, 'engine-state/seriouslyfish.json'), 'utf8'))
  expect(state[`${SF}broken-fish`]).toBeUndefined()
  expect(state[`${SF}paracheirodon-axelrodi`]).toMatchObject({ status: 'processed' })
  // The Commons photo lookup (soft) passes a rest on, so a page isn't saved as having found none.
  await expect(soft('commons photos', async () => { throw new WikimediaRefused('t') }, [])).rejects.toBeInstanceOf(WikimediaRefused)
  expect(await soft('commons photos', async () => { throw new Error('HTTP 500') }, ['fallback'])).toEqual(['fallback'])
})

test('the archive refusing this Mac at its index: no fallback on the last list, so no page is asked for', async () => {
  const root = await fresh()
  const { d } = deps(root)
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_index-planetcatfish.json'), JSON.stringify([{ url: 'https://www.planetcatfish.com/common/species.php?species_id=9' }]))
  let asked = 0
  const archive = { ...d.fetcher, text: async () => { throw new ArchiveRefused('2026-11-10T12:00:00.000Z') }, get: async () => { asked++; throw new Error('should not be asked') } }
  const r = await runEngine({ ...d, archive }, { sources: ['planetcatfish'] })
  expect(asked).toBe(0)
  expect(r.errors.join('\n')).toMatch(/planetcatfish: not read: the archive refused this Mac/)
})

test('a page read through the archive records its capture date beside the real address', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  const page = 'https://www.planetcatfish.com/common/species.php?species_id=9'
  const html = await d.fetcher.get('https://www.seriouslyfish.com/species/paracheirodon-axelrodi/')
  const archive = { ...d.fetcher, text: async () => `${page}\n`, get: async () => ({ ...html, finalUrl: page, capturedAt: '2025-10-17T04:09:55.000Z' }) }
  await runEngine({ ...d, archive }, { sources: ['planetcatfish'] })
  const snapshot = await readFile(join(root, 'sources/planetcatfish/common-species-php.md'), 'utf8')
  expect(snapshot).toContain(`url: ${page}`)
  expect(snapshot).toContain('capturedAt: 2025-10-17T04:09:55.000Z')
  expect(snapshot).not.toContain('web.archive.org')
})

test('a name newer than GBIF is found under a synonym the page gives', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['paracheirodon-axelrodi'], page: { ...species, scientificName: 'Novum axelrodi', synonyms: ['Paracheirodon axelrodi'] } })
  const http = d.http
  d.http = async (url: string) => (url.includes('gbif') && url.includes('Novum') ? { matchType: 'HIGHERRANK', canonicalName: 'Novum' } : http(url))
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish).toMatchObject({ processed: 1 })
  expect(JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8')).scientificName).toBe('Paracheirodon axelrodi')
})

test('limit is respected per source', async () => {
  const root = await fresh()
  const r = await runEngine(deps(root).d, { sources: ['seriouslyfish'], limit: 1 })
  expect(r.perSource.seriouslyfish).toMatchObject({ discovered: 3, fetched: 1, processed: 1 })
})

test('a species readers keep on their tanks without a page is fetched first; reported for the audit; a failed read changes nothing', async () => {
  const urls = ['broken-fish', 'paracheirodon-axelrodi']
  const plain = await runEngine(deps(await fresh(), { urls }).d, { sources: ['seriouslyfish'], limit: 1 })
  expect(plain.perSource.seriouslyfish).toMatchObject({ processed: 0, errors: 1 }) // the address order: the broken page first

  const root = await fresh()
  const readersWanted = async () => [{ kind: 'fish', name: 'Cá neon vua', sci: 'Paracheirodon axelrodi', readers: 2, sources: { tank: 2 }, last: '2026-10-27' }]
  const r = await runEngine({ ...deps(root, { urls }).d, readersWanted }, { sources: ['seriouslyfish'], limit: 1 })
  expect(r.perSource.seriouslyfish).toMatchObject({ processed: 1, errors: 0 })
  const report = JSON.parse(await readFile(join(root, 'engine-state/_readers-wanted.json'), 'utf8'))
  // Two readers: the public report names the species, not the readers' words.
  expect(report).toEqual({ names: [expect.objectContaining({ name: 'Paracheirodon axelrodi', readers: 2, status: 'queued', slug: 'paracheirodon-axelrodi' })], held: { names: 0, readers: 0 } })
  expect(JSON.stringify(report)).not.toContain('Cá neon vua')
  expect(JSON.parse(await readFile(join(root, 'engine-state/_wanted.json'), 'utf8'))['paracheirodon-axelrodi']).toMatchObject({ readers: 2 })

  // No access to KV this run: the run goes on as without readers, and the last report stays.
  const failed = await runEngine({ ...deps(root, { urls: ['broken-fish'] }).d, readersWanted: async () => { throw new Error('Cloudflare KV list: HTTP 403') } }, { sources: ['seriouslyfish'], limit: 1 })
  expect(failed.perSource.seriouslyfish).toMatchObject({ discovered: 1 })
  expect(JSON.parse(await readFile(join(root, 'engine-state/_readers-wanted.json'), 'utf8'))).toEqual(report)
})

test('low quality: one re-translation with reviewer notes, then noindex', async () => {
  const root = await fresh()
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'], score: 0.5 })
  await runEngine(d, { sources: ['seriouslyfish'] })
  expect(calls).toMatchObject({ process: 2, rewrite: 2, review: 2 })
  expect(calls.prompts[3]).toContain('fix "Nước đen"') // process, style pass, review, then process again with the notes
  const vi = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect(vi.quality).toMatchObject({ score: 0.5, indexable: false, bySource: { seriouslyfish: 0.5 } })
})

test('the page writer\'s reviewer reads a page within 0.1 of the bar three times and the middle read counts; one clear of it, once', async () => {
  // The chief of staff, 2026-11-11. 0.7 alone would send the page back to be written again; the middle of 0.7, 0.9 and
  // 0.8 passes it.
  const root = await fresh()
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'], scores: [0.7, 0.9, 0.8] })
  await runEngine(d, { sources: ['seriouslyfish'] })
  expect(calls).toMatchObject({ process: 1, review: 3 })
  const vi = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect(vi.quality).toMatchObject({ score: 0.8, indexable: true })
  const clear = deps(await fresh(), { urls: ['paracheirodon-axelrodi'], scores: [0.86] })
  await runEngine(clear.d, { sources: ['seriouslyfish'] })
  expect(clear.calls).toMatchObject({ process: 1, review: 1 })
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

test("a page whose credits are still to learn is read only on its own turn: not due, no request; on its turn, each of our photos gets its credit's kind, with no model call", async () => {
  // The chief of staff, 14 Nov 2026: the credit reads go inside the source's pace as it stands, taking no page's place early.
  const root = await fresh()
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'] }).d, { sources: ['seriouslyfish'] })
  const url = `${SF}paracheirodon-axelrodi`
  await writeFile(join(root, 'engine-state/_credit-reads.json'), JSON.stringify({ [url]: { source: 'seriouslyfish', at: '2026-11-14', by: 'the chief of staff' } }))
  const early = deps(root, { urls: ['paracheirodon-axelrodi'] })
  expect((await runEngine(early.d, { sources: ['seriouslyfish'] })).perSource.seriouslyfish?.fetched).toBe(0)
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/_credit-reads.json'), 'utf8')))).toEqual([url])
  const due = deps(root, { urls: ['paracheirodon-axelrodi'] })
  due.d.fetcher.text = async () => `<urlset><url><loc>${url}</loc><lastmod>2026-10-20</lastmod></url></urlset>`
  expect((await runEngine(due.d, { sources: ['seriouslyfish'] })).perSource.seriouslyfish).toMatchObject({ fetched: 1, processed: 0 })
  expect(due.calls.llm).toBe(0)
  expect(JSON.parse(await readFile(join(root, 'engine-state/_credit-reads.json'), 'utf8'))).toEqual({})
  const credits = JSON.parse(await readFile(join(root, 'engine-state/_photo-credits.json'), 'utf8'))
  const photos = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8')).photos as { url: string }[]
  expect(photos.length).toBeGreaterThan(0)
  for (const p of photos) expect(credits[p.url]).toMatchObject({ page: url, at: '2026-10-28' })
})

test("a credit read that fails is ours, not the page's: the page keeps its read and its turn, and its credits wait for the next one", async () => {
  const root = await fresh()
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'] }).d, { sources: ['seriouslyfish'] })
  const url = `${SF}paracheirodon-axelrodi`
  await writeFile(join(root, 'engine-state/_credit-reads.json'), JSON.stringify({ [url]: { source: 'seriouslyfish', at: '2026-11-14', by: 'the chief of staff' } }))
  await writeFile(join(root, 'engine-state/_photo-credits.json'), 'not json')
  const due = deps(root, { urls: ['paracheirodon-axelrodi'] })
  due.d.fetcher.text = async () => `<urlset><url><loc>${url}</loc><lastmod>2026-10-20</lastmod></url></urlset>`
  const r = await runEngine(due.d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish).toMatchObject({ fetched: 1, errors: 0 })
  expect(r.errors.some(e => e.startsWith(`${url}: credits not read`))).toBe(true)
  const state = JSON.parse(await readFile(join(root, 'engine-state/seriouslyfish.json'), 'utf8'))
  expect(state[url]).toMatchObject({ status: 'processed', lastmod: '2026-10-20' })
  expect(state[url].error).toBeUndefined()
  expect(Object.keys(JSON.parse(await readFile(join(root, 'engine-state/_credit-reads.json'), 'utf8')))).toEqual([url])
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

test('a closed browser stops the run; the page it was on runs first next time, ahead of new pages', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['new-fish', 'paracheirodon-axelrodi', 'broken-fish'] })
  let gets = 0
  d.fetcher.get = async () => { gets++; throw new Error('page.goto: Target page, context or browser has been closed') }
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(gets).toBe(1)
  expect(r.errors.at(-1)).toContain('stopping: the browser closed')
  const state = JSON.parse(await readFile(join(root, 'engine-state', 'seriouslyfish.json'), 'utf8'))
  expect(state[`${SF}new-fish`]).toMatchObject({ status: 'error', attempts: 1 })
  // The next cycle, minutes later (no backoff): the crashed page first, before the pages never tried.
  const next = deps(root, { urls: ['new-fish', 'paracheirodon-axelrodi', 'broken-fish'] })
  const order: string[] = []
  const get = next.d.fetcher.get
  next.d.fetcher.get = async (u: string) => { order.push(u.slice(SF.length)); return get(u) }
  next.d.now = () => new Date('2026-10-28T10:30:00Z')
  await runEngine(next.d, { sources: ['seriouslyfish'] })
  expect(order[0]).toBe('new-fish')
})

test("the 2026-10-29 crash's errors run first: due at once and ahead of the backlog", async () => {
  const root = await fresh()
  await mkdir(join(root, 'engine-state'))
  const crashed = { entityIds: [], updatedAt: '2026-10-29T04:05:56.271Z', status: 'error', attempts: 1, error: 'page.goto: Target page, context or browser has been closed' }
  const limited = { ...crashed, attempts: 2, error: "claude failed (1): You've hit your 5-hour limit · resets 12:10pm (UTC)" }
  await writeFile(join(root, 'engine-state', 'seriouslyfish.json'), JSON.stringify({ [`${SF}zz-crashed`]: crashed, [`${SF}zz-limited`]: limited }))
  const { d } = deps(root, { urls: ['aa-new', 'zz-crashed', 'bb-new', 'zz-limited'] })
  d.now = () => new Date('2026-10-29T06:00:00Z') // two hours later: an ordinary error would still be waiting out its backoff
  const order: string[] = []
  const get = d.fetcher.get
  d.fetcher.get = async (u: string) => { order.push(u.slice(SF.length)); return get(u) }
  await runEngine(d, { sources: ['seriouslyfish'], limit: 2 })
  expect(order).toEqual(['zz-crashed', 'zz-limited'])
})

test('the network gone: the source stops after 3 pages in a row, so the rest keep their attempts', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['f1', 'f2', 'f3', 'f4', 'f5'] })
  d.fetcher.get = async () => { throw new Error('page.goto: net::ERR_INTERNET_DISCONNECTED') }
  const r = await runEngine(d, { sources: ['seriouslyfish'] })
  expect(r.perSource.seriouslyfish).toMatchObject({ fetched: 3, errors: 3 })
  expect(r.errors.at(-1)).toMatch(/seriouslyfish: stopping: 3 pages in a row failed on the network/)
})

test('a usage limit uses none of the page\'s attempts', async () => {
  const root = await fresh()
  await runEngine(deps(root, { urls: ['f1'], llmFails: true }).d, { sources: ['seriouslyfish'] })
  await runEngine(deps(root, { urls: ['f1'], llmFails: true }).d, { sources: ['seriouslyfish'] })
  const state = JSON.parse(await readFile(join(root, 'engine-state', 'seriouslyfish.json'), 'utf8'))
  expect(state[`${SF}f1`]).toMatchObject({ status: 'error', attempts: 0 })
})

test("a thin species' profile runs before new species; under a newer name, the source's search finds it", async () => {
  const root = await fresh()
  // Two thin pages, made from one Glaser note each.
  for (const [id, sci] of [['corydoras-panda', 'Corydoras panda'], ['betta-macrostoma', 'Betta macrostoma']]) {
    await mkdir(join(root, 'content/species', id!), { recursive: true })
    await writeFile(join(root, 'content/species', id!, 'entity.json'), JSON.stringify({ id, scientificName: sci, order: 'O', family: 'F', genus: sci!.split(' ')[0], group: 'other', places: [], dataCard: {}, sections: [{ key: 'notes', source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/en/x/y', html: '<p>A note.</p>' }], photos: [], videos: [], productSlots: [], updatedAt: '2026-10-01' }))
    await writeFile(join(root, 'content/species', id!, 'vi.json'), JSON.stringify({ slug: id, name: id, altNames: [], sections: { 'notes:glaser': '<p>Ghi chú.</p>' }, quality: { score: 0.9, indexable: true, bySource: { glaser: 0.9 } } }))
  }
  const { d } = deps(root, { urls: ['aaa-new', 'betta-macrostoma', 'bbb-new', 'hoplisoma-panda'] })
  const searches: string[] = []
  d.fetcher.links = async (u: string) => { searches.push(u); return u.includes('Corydoras%20panda') ? [`${SF}hoplisoma-panda`] : [] }
  const order: string[] = []
  const get = d.fetcher.get
  d.fetcher.get = async (u: string) => { order.push(u.slice(SF.length)); return get(u) }
  const r = await runEngine(d, { sources: ['seriouslyfish'], limit: 2 })
  expect(searches).toEqual(['https://www.seriouslyfish.com/search?q=Corydoras%20panda']) // betta-macrostoma was in the index
  expect(order).toEqual(['hoplisoma-panda', 'betta-macrostoma']) // the panda cory is on the popular list
  expect(JSON.parse(await readFile(join(root, 'engine-state/_depth-search.json'), 'utf8'))).toEqual({ 'seriouslyfish/corydoras-panda': { url: `${SF}hoplisoma-panda`, at: '2026-10-28' } })
  expect(r.depth).toMatchObject({ thin: 2, bySource: { glaser: 2 } })
})

test('a page from a shop listing alone is recorded out of search (thin); an in-depth source brings it back', async () => {
  const root = await fresh()
  const BW = 'https://bwaquatics.com/products/'
  const shop = deps(root)
  shop.d.fetcher.text = async () => `<urlset><url><loc>${BW}cardinal-tetra</loc></url></urlset>`
  await runEngine(shop.d, { sources: ['bwaquatics'] })
  const vi = async () => JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8'))
  expect((await vi()).quality).toEqual({ score: 0.9, indexable: false, bySource: { bwaquatics: 0.9 }, reason: 'thin' })
  await runEngine(deps(root, { urls: ['paracheirodon-axelrodi'] }).d, { sources: ['seriouslyfish'] })
  expect((await vi()).quality).toEqual({ score: 0.9, indexable: true, bySource: { bwaquatics: 0.9, seriouslyfish: 0.9 } })
})

test('a page about one variety stays off the species page, now and on every later run', async () => {
  // BW Aquatics' Copper Alien product page gave the betta's page the hybrid's facts (design critique 2026-11-06).
  const root = await fresh()
  const BW = 'https://bwaquatics.com/products/'
  const shop = deps(root, { page: { ...species, variety: 'Albino' } })
  shop.d.fetcher.text = async () => `<urlset><url><loc>${BW}albino-cardinal</loc></url></urlset>`
  const r = await runEngine(shop.d, { sources: ['bwaquatics'] })
  expect(r.perSource.bwaquatics).toMatchObject({ processed: 0, skipped: 1 })
  await expect(readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8')).rejects.toThrow()
  expect(JSON.parse(await readFile(join(root, 'engine-state/_variety-pages.json'), 'utf8'))).toEqual({ [`${BW}albino-cardinal`]: { species: 'paracheirodon-axelrodi', variety: 'Albino', at: '2026-10-28' } })
  // Translated again with no variety named, it is still that variety's page.
  const again = deps(root)
  again.d.fetcher.text = shop.d.fetcher.text
  await runEngine(again.d, { sources: ['bwaquatics'], force: true, only: /albino/ })
  expect(again.calls.process).toBe(1)
  await expect(readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8')).rejects.toThrow()
})

test('a usage limit during the style pass stops the run; nothing publishes unpolished', async () => {
  const root = await fresh()
  const { d } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  const llm = d.llm
  d.llm = (async (a: { prompt: string; schema: object }) => {
    if ('parts' in ((a.schema as { properties?: object }).properties ?? {})) throw new LlmError('claude failed (1): usage limit')
    return llm(a as never)
  }) as typeof d.llm
  await runEngine(d, { sources: ['seriouslyfish'] })
  await expect(readFile(join(root, 'content/species/paracheirodon-axelrodi/vi.json'), 'utf8')).rejects.toThrow()
})

test("card-fill reads only the profiles of pages whose card lacks a figure, most-read first, from a source they don't have yet", async () => {
  const root = await fresh()
  const page = async (id: string, source: string, html: string, dataCard: object) => {
    const sci = id.replace('-', ' ').replace(/^./, c => c.toUpperCase())
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), JSON.stringify({ id, scientificName: sci, order: 'O', family: 'F', genus: sci.split(' ')[0], group: 'other', places: [], dataCard, sections: [{ key: 'aquariumSize', source, sourceUrl: 'https://x.test/a', html }], photos: [], videos: [], productSlots: [], updatedAt: '2026-10-01' }))
    await writeFile(join(root, 'content/species', id, 'vi.json'), JSON.stringify({ slug: id, name: id, altNames: [], sections: { [`aquariumSize:${source}`]: html }, quality: { score: 0.9, indexable: true, bySource: { [source]: 0.9 } } }))
  }
  const sized = (source: string, tank?: number) => ({ tempC: [{ source, value: { min: 22, max: 26 } }], ph: [{ source, value: { min: 6, max: 7 } }], gh: [{ source, value: { min: 2, max: 10 } }], sizeCm: [{ source, value: 4 }], difficulty: [{ source, value: 2 }], ...(tank ? { tankCm: [{ source, value: tank }] } : {}) })
  // The cardinal's only tank length was made from The Spruce Pets' volume: the page shows none, and it is a staple.
  await page('paracheirodon-axelrodi', 'sprucepets', '<p>Minimum tank size: 10 gallons (about 38 litres).</p>', sized('sprucepets', 40))
  await page('danio-rerio', 'sprucepets', '<p>Minimum tank size: 10 gallons (about 38 litres).</p>', sized('sprucepets'))
  // Already has Seriously Fish's text, which gave no tank: reading it again would add nothing.
  await page('puntius-titteya', 'seriouslyfish', '<p>A planted tank.</p>', sized('seriouslyfish'))
  await page('boraras-brigittae', 'sprucepets', '<p>Aquarium of 40 × 20 cm.</p>', sized('sprucepets', 40))
  const urls = ['aaa-new', 'boraras-brigittae', 'danio-rerio', 'paracheirodon-axelrodi', 'puntius-titteya']
  const run = async (limit: number) => {
    const { d } = deps(root, { urls, page: { ...species, dataCard: { tankCm: 60 }, sections: [{ key: 'aquariumSize', en: '<p>Aquarium base: 60 × 30 cm.</p>', vi: '<p>Đáy bể 60 × 30 cm.</p>' }] } })
    const order: string[] = []
    const get = d.fetcher.get
    d.fetcher.get = async (u: string) => { order.push(u.slice(SF.length)); return get(u) }
    await runEngine(d, { sources: ['seriouslyfish'], cardFill: true, limit })
    return order
  }
  expect(await run(1)).toEqual(['paracheirodon-axelrodi'])
  const card = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8')).dataCard
  expect(card.tankCm).toEqual([{ source: 'sprucepets', value: 40 }, { source: 'seriouslyfish', value: 60 }])
  // Next cycle: the cardinal has Seriously Fish now; the danio is next; the rest are no card's gap.
  expect(await run(5)).toEqual(['danio-rerio'])
})

// The owner, 2026-11-10: "won't get pass the check, switch to internet archive for this. any site that are often blocked should use the same way."
const blockedThenArchived = async (holds: boolean, gapDays: number) => {
  const root = await fresh()
  const { d } = deps(root)
  let clock = Date.parse('2026-11-01T00:00:00Z')
  let siteAsked = 0
  const fetcher = { ...d.fetcher, text: async (u: string) => { siteAsked++; throw new ChallengeError(u) } }
  const archive = { ...d.fetcher, get: async (u: string) => { if (!holds) throw new Error('no archived copy (HTTP 404)'); return { status: 200, html: sitemap(['paracheirodon-axelrodi']), finalUrl: u } } }
  const run = () => runEngine({ ...d, now: () => new Date(clock), fetcher, archive }, { sources: ['seriouslyfish'] })
  const first = await run()
  clock += gapDays * 86_400_000
  const second = await run()
  const asked = siteAsked
  clock += 2 * 86_400_000
  const third = await run()
  const blocks = JSON.parse(await readFile(join(root, 'engine-state/_sources.json'), 'utf8'))
  return { first, second, third, entry: blocks.seriouslyfish, siteAskedThird: siteAsked - asked }
}

test('a source blocked on two runs within a week moves to the archive, and the owner is not asked', async () => {
  const { first, second, third, entry, siteAskedThird } = await blockedThenArchived(true, 2)
  expect(first.needsHuman).toEqual(['seriouslyfish'])
  expect(first.movedToArchive).toEqual([])
  expect(second.needsHuman).toEqual([])
  expect(second.movedToArchive).toEqual(['seriouslyfish'])
  expect(entry.archive).toBeTruthy()
  expect(entry.blockedAt).toBeUndefined()
  expect(third.needsHuman).toEqual([])
  expect(siteAskedThird).toBe(0)
})

test('a source the archive does not hold still asks the owner', async () => {
  const { second, entry } = await blockedThenArchived(false, 2)
  expect(second.movedToArchive).toEqual([])
  expect(second.needsHuman).toEqual(['seriouslyfish'])
  expect(entry.archive).toBeUndefined()
})

test('two blocks more than a week apart do not move a source', async () => {
  const { second } = await blockedThenArchived(true, 8)
  expect(second.movedToArchive).toEqual([])
  expect(second.needsHuman).toEqual(['seriouslyfish'])
})

test('a refusal during an archived source search stops that source, not the run, before reading or marking pages', async () => {
  const root = await fresh()
  // Two thin pages, made from one Glaser note each.
  for (const [id, sci] of [['corydoras-panda', 'Corydoras panda'], ['betta-macrostoma', 'Betta macrostoma']]) {
    await mkdir(join(root, 'content/species', id!), { recursive: true })
    await writeFile(join(root, 'content/species', id!, 'entity.json'), JSON.stringify({ id, scientificName: sci, order: 'O', family: 'F', genus: sci!.split(' ')[0], group: 'other', places: [], dataCard: {}, sections: [{ key: 'notes', source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/en/x/y', html: '<p>A note.</p>' }], photos: [], videos: [], productSlots: [], updatedAt: '2026-10-01' }))
    await writeFile(join(root, 'content/species', id!, 'vi.json'), JSON.stringify({ slug: id, name: id, altNames: [], sections: { 'notes:glaser': '<p>Ghi chú.</p>' }, quality: { score: 0.9, indexable: true, bySource: { glaser: 0.9 } } }))
  }
  const { d } = deps(root, { urls: ['aaa-new'] })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await moveToArchive(root, 'seriouslyfish', '2026-10-27T10:00:00Z')
  const refused = new ArchiveRefused('2026-11-10T12:00:00.000Z')
  let asked = 0
  let pages = 0
  const archive = { ...d.fetcher, links: async () => { asked++; throw refused }, get: async (u: string) => { if (u.endsWith('/sitemap.xml')) return { status: 200, html: sitemap(['aaa-new']), finalUrl: u }; pages++; throw new Error('should not read a page') } }
  const r = await runEngine({ ...d, archive }, { sources: ['seriouslyfish'] })
  expect(r.errors.join('\n')).toMatch(/seriouslyfish: not read: the archive refused this Mac/)
  expect(asked).toBe(1)
  expect(pages).toBe(0)
  expect(JSON.parse(await readFile(join(root, 'engine-state/seriouslyfish.json'), 'utf8').catch(() => '{}'))).toEqual({})
})

// The run's own read of a page (run.ts apply) refuses a credit its source's permission record refuses, before any request.
test("a run's read of a page doesn't take a photo whose credit the source's permission record refuses", async () => {
  const { createHash } = await import('node:crypto')
  const { htmlToOutline } = await import('../src/outline')
  const { pickSourcePhotos } = await import('../src/source-photos')
  const url = `${SF}paracheirodon-axelrodi`
  const picks = pickSourcePhotos(htmlToOutline(fx('pages/seriouslyfish-cardinal.html'), 'main').images, url, ['Paracheirodon axelrodi'])
  const keyOf = (src: string) => `https://media.test/seriouslyfish/${createHash('sha256').update(src).digest('hex').slice(0, 16)}.webp`
  const refused = picks[0]!.credit!
  const root = await fresh()
  const sources = JSON.parse(await readFile(join(root, 'content/sources.json'), 'utf8'))
  sources.seriouslyfish.permission.refusedCredits = [refused]
  await writeFile(join(root, 'content/sources.json'), JSON.stringify(sources))
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  await runEngine(d, { sources: ['seriouslyfish'] })
  const entity = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8'))
  const gone = picks.filter(p => p.credit === refused).map(p => keyOf(p.src))
  expect(gone.length).toBeGreaterThan(0)
  expect(entity.photos.length).toBeGreaterThan(0)
  for (const p of entity.photos) expect(gone).not.toContain(p.url)
  expect(calls.images).toBe(picks.filter(p => p.credit !== refused).length)
})

// The run's own read of a source page (run.ts apply) picks as the backfill does: photos on the never-again list
// (engine-state/_photo-rejected.json) take none of the page's four places, so the next four are tried.
test("a run's read of a page: photos taken off the site before don't hold its four places", async () => {
  const { createHash } = await import('node:crypto')
  const { htmlToOutline } = await import('../src/outline')
  const { pickSourcePhotos } = await import('../src/source-photos')
  const url = `${SF}paracheirodon-axelrodi`
  const order = pickSourcePhotos(htmlToOutline(fx('pages/seriouslyfish-cardinal.html'), 'main').images, url, ['Paracheirodon axelrodi'], Infinity).map(p => `https://media.test/seriouslyfish/${createHash('sha256').update(p.src).digest('hex').slice(0, 16)}.webp`)
  const root = await fresh()
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify(Object.fromEntries(order.slice(0, 4).map(u => [u, 'watermark: withheld']))))
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  await runEngine(d, { sources: ['seriouslyfish'] })
  const entity = JSON.parse(await readFile(join(root, 'content/species/paracheirodon-axelrodi/entity.json'), 'utf8'))
  expect(entity.photos.map((p: { url: string }) => p.url)).toEqual(order.slice(4, 8))
  expect(calls.images).toBe(4)
})

test('last item cost refuses admission without calls or content writes', async () => {
  const root = await fresh()
  const { d, calls } = deps(root, { urls: ['paracheirodon-axelrodi'] })
  await denied('run', root, async () => {
    const r = await runEngine(d, { sources: ['seriouslyfish'], limit: 1 })
    expect(r.stopped).toContain('not started')
    expect(r.errors).toEqual([])
    expect(r.perSource.seriouslyfish?.errors).toBe(0)
    expect(calls.llm).toBe(0)
  })
})
