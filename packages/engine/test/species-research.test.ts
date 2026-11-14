import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SpeciesSchema } from '@aq/schema'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { citeResearch, makeSpecies, namesVideo, type SpeciesFacts, type VideoSource } from '../src/species-research'
import { WikimediaRefused } from '../src/wikimedia-rest'

const sources: SpeciesFacts['sources'] = [
  { url: 'https://journal.example/nanosphronemus', title: 'A new miniature labyrinth fish from Vietnam', kind: 'paper' },
  { url: 'javascript:alert(1)', title: 'x', kind: 'other' },
  { url: 'https://www.youtube.com/watch?v=iV3tUG5Vd4I', title: 'Meet the Jewel Gourami!', kind: 'video' },
  { url: 'https://shopee.vn/ca-sac-ngoc', title: 'Cá sặc ngọc giá rẻ', kind: 'shop' },
  { url: 'https://vnexpress.net/ca-moi-hue', title: 'Phát hiện loài cá mới ở Huế', kind: 'news' },
  { url: 'https://news.example/jewel', title: 'Jewel gourami described', kind: 'news' },
  { url: 'https://unused.example/page', title: 'Listed, cited by nothing', kind: 'article' },
]
const facts: SpeciesFacts = {
  found: true, group: 'labyrinth',
  enNames: [{ name: 'Jewel Gourami', source: 2 }],
  // A Vietnamese name only from a Vietnamese page: the shop's is a marketplace, the English news isn't Vietnamese.
  viNames: [{ name: 'Cá sặc ngọc', source: 3 }, { name: 'Cá đuôi đỏ', source: 5 }, { name: 'Cá bãi trầu Huế', source: 4 }],
  facts: [
    { section: 'notes', fact: 'described in July 2026 in a new genus', source: 0 },
    { section: 'notes', fact: 'a red stripe and iridescent scales', source: 2 },
    { section: 'habitat', fact: 'lives in wetlands', source: 1 }, // its source is no web page: it goes
    { section: 'reproduction', fact: 'builds a bubble nest', source: 2 },
  ],
  care: [
    { field: 'sizeCm', min: 1.65, max: 1.65, source: 0, quote: 'maximum size 16.5 mm SL' },
    { field: 'sizeCm', min: 2, max: 2, source: 2, quote: 'less than 2 cm' }, // the field has its figure
    { field: 'tempC', min: 24, max: 28, source: 1, quote: '24–28 °C' }, // not a web page
    { field: 'ph', min: 6, max: 7, source: 9, quote: 'pH 6–7' }, // no such source
    { field: 'gh', min: 2, max: 8, source: 5, quote: '' }, // no words of the source's
    { field: 'tankCm', min: 2000, max: 2000, source: 5, quote: '20 m' }, // outside a card's bounds
    { field: 'lifeYears', min: 2, max: 2, source: 3, quote: 'sống 2 năm' }, // a marketplace
  ],
  places: [{ continent: 'Asia', country: 'Vietnam', region: 'Hue', source: 4 }, { continent: 'Asia', country: 'Laos', source: 1 }],
  sources,
}

test('no figure without a cited page: a card figure comes from a web page the research cites, in its words, inside a card\'s bounds; the rest is missing', () => {
  const c = citeResearch(facts)
  expect(c.card).toEqual([{ field: 'sizeCm', value: 1.65, source: 0, quote: 'maximum size 16.5 mm SL', ref: 0 }])
  expect(c.missing).toEqual(['tempC', 'ph', 'gh', 'tankCm', 'difficulty', 'lifeYears'])
  // Only pages something cites, numbered by first use; never a marketplace or a non-web source.
  expect(c.refs.map(r => r.url)).toEqual(['https://journal.example/nanosphronemus', 'https://www.youtube.com/watch?v=iV3tUG5Vd4I', 'https://vnexpress.net/ca-moi-hue'])
  expect(c.facts).toEqual([
    { section: 'notes', fact: 'described in July 2026 in a new genus', ref: 0 },
    { section: 'notes', fact: 'a red stripe and iridescent scales', ref: 1 },
    { section: 'reproduction', fact: 'builds a bubble nest', ref: 1 },
  ])
  expect(c.viNames).toEqual(['Cá bãi trầu Huế'])
  expect(c.enNames).toEqual(['Jewel Gourami'])
  expect(c.places).toEqual([{ continent: 'Asia', country: 'Vietnam', region: 'Hue' }])
})

test('a name only a video gives must be in its title or description: its captions are machine-made and mishear names', () => {
  const v: VideoSource = { meta: { id: 'iV3tUG5Vd4I', title: 'Meet the Jewel Gourami!', channel: 'C', description: 'A miniature fish from Vietnam.', durationSec: 1, embeddable: false, lang: 'en' }, transcript: 'The Vietnamese mini, or pearl gourami, is a dwarf gourami' }
  const heard = { ...facts, enNames: [{ name: 'Jewel Gourami', source: 2 }, { name: 'pearl gourami', source: 2 }, { name: 'Jewel gourami', source: 5 }] }
  expect(citeResearch(heard, [v]).enNames).toEqual(['Jewel Gourami', 'Jewel gourami'])
  expect(citeResearch(heard).enNames).toEqual(['Jewel Gourami', 'pearl gourami', 'Jewel gourami'])
})

test('text written from a video never names it or its channel; a species\' describers may be named', () => {
  expect(namesVideo('Một người nuôi CHRIS LUKHAUP kể rằng…', ['CHRIS LUKHAUP'])).toEqual(['CHRIS LUKHAUP'])
  expect(namesVideo('Chris Lukhaup giới thiệu loài này trong video này.', ['CHRIS LUKHAUP'])).toEqual(['trong video', 'Chris Lukhaup'])
  expect(namesVideo('Các tác giả Britz, Tan & Rüber mô tả loài này năm 2026.', ['CHRIS LUKHAUP'])).toEqual([])
})

const ZOOBANK = { canonicalName: 'Nanosphronemus gemma', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', genus: 'Nanosphronemus', parentKey: 1 }
const WORMS = { ...ZOOBANK, order: 'Anabantiformes', family: 'Osphronemidae' }
const gbif = async (u: string) => (u.includes('/species/match') ? { matchType: 'NONE' } : u.includes('/species/search') ? { results: [ZOOBANK, WORMS] } : u.includes('commons.wikimedia.org') ? {} : {})
const video = (embeddable: boolean): VideoSource => ({ meta: { id: 'iV3tUG5Vd4I', title: 'Meet the Jewel Gourami!', channel: 'CHRIS LUKHAUP', description: 'Nanosphronemus gemma was formally described in July 2026.', durationSec: 261, embeddable, lang: 'en' }, transcript: 'this tiny fish builds a bubble nest' })

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-species-'))
  await mkdir(join(r, 'content/places/vietnam'), { recursive: true })
  await mkdir(join(r, 'content/places/asia'), { recursive: true })
  await writeFile(join(r, 'content/sources.json'), '{}')
  return r
}

test('makeSpecies: a species GBIF\'s backbone lacks, researched with its video as a source, written as AquaTome\'s own text citing its pages, reviewed, its card only what a page states', async () => {
  const r = await root()
  const prompts: string[] = []
  let researchPrompt = ''
  const research: Llm = async <T,>(a: { prompt: string }) => { researchPrompt = a.prompt; return facts as T }
  let checks = 0
  const llm: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    const props = (a.schema as { properties: object }).properties
    if ('score' in props) return { score: ++checks === 1 ? 0.9 : 0.85, notes: [] } as T
    // The first draft names the channel: it is rewritten with that note.
    return (checks === 0
      ? { sections: [{ key: 'notes', html: '<p>CHRIS LUKHAUP giới thiệu loài này.</p>', facts: ['f0'] }] }
      : { sections: [
        { key: 'reproduction', html: '<p>Cá đực xây tổ bọt.</p>', facts: ['f2'] },
        { key: 'notes', html: '<p onclick="x">Loài được mô tả năm 2026, dài chưa tới 2 cm.</p>', facts: ['f0', 'c0', 'f1', 'x9'] },
        { key: 'habitat', html: '<p>Chưa có nguồn nào công bố nhiệt độ hay pH.</p>', facts: [] },
      ] }) as T
  }
  const out = await makeSpecies(r, { research, llm, http: gbif, now: () => new Date('2026-11-06T00:00:00Z') }, { name: 'Nanosphronemus gemma', videos: [video(false)] })
  expect(out).toMatchObject({ id: 'nanosphronemus-gemma', slug: 'ca-bai-trau-hue', name: 'Cá bãi trầu Huế', score: 0.85, deep: false, refs: 3, card: ['sizeCm'] })
  // The video is a primary source of the research, as data; the writer is told what no page gives.
  expect(researchPrompt).toContain('cite it as url https://www.youtube.com/watch?v=iV3tUG5Vd4I')
  expect(researchPrompt).toContain('this tiny fish builds a bubble nest')
  expect(prompts[0]).toContain('"missing"')
  expect(prompts[0]).toContain('nhiệt độ (°C)')
  expect(prompts.filter(p => p.includes('"CHRIS LUKHAUP" names the video or its channel'))).toHaveLength(1)

  const e = SpeciesSchema.parse(JSON.parse(await readFile(join(r, 'content/species/nanosphronemus-gemma/entity.json'), 'utf8')))
  expect(e).toMatchObject({ scientificName: 'Nanosphronemus gemma', order: 'Anabantiformes', family: 'Osphronemidae', genus: 'Nanosphronemus', group: 'labyrinth', places: ['asia', 'vietnam', 'hue'] })
  expect(e.dataCard).toEqual({ sizeCm: [{ source: 'aquatome', ref: 0, value: 1.65 }] })
  // Each part cites the pages its facts come from; one that names none, its own section's facts' (none here).
  expect(e.sections.map(s => [s.key, s.source, s.refs])).toEqual([['habitat', 'aquatome', undefined], ['reproduction', 'aquatome', [1]], ['notes', 'aquatome', [0, 1]]])
  expect(e.refs).toEqual([{ url: 'https://journal.example/nanosphronemus', title: 'A new miniature labyrinth fish from Vietnam' }, { url: 'https://www.youtube.com/watch?v=iV3tUG5Vd4I', title: 'Meet the Jewel Gourami!' }, { url: 'https://vnexpress.net/ca-moi-hue', title: 'Phát hiện loài cá mới ở Huế' }])
  // A video YouTube won't embed is cited, never listed to play.
  expect(e.videos).toEqual([])
  expect(e.photos).toEqual([])
  const vi = JSON.parse(await readFile(join(r, 'content/species/nanosphronemus-gemma/vi.json'), 'utf8'))
  expect(vi.sections['notes:aquatome']).toBe('<p>Loài được mô tả năm 2026, dài chưa tới 2 cm.</p>')
  expect(vi.altNames).toEqual(['Jewel Gourami'])
  // Thin: out of search, as any page short of the depth bar.
  expect(vi.quality).toEqual({ score: 0.85, indexable: false, bySource: { aquatome: 0.85 }, reason: 'thin' })
  expect(JSON.parse(await readFile(join(r, 'content/places/hue/entity.json'), 'utf8'))).toEqual({ id: 'hue', kind: 'region', parent: 'vietnam' })
  expect(JSON.parse(await readFile(join(r, 'engine-state/reviews/species.json'), 'utf8'))['vi/species/nanosphronemus-gemma']).toHaveLength(2)
  expect(JSON.parse(await readFile(join(r, 'content/changelog.json'), 'utf8'))).toEqual([{ date: '2026-11-06', kind: 'species', id: 'nanosphronemus-gemma', source: 'aquatome', action: 'new' }])
  expect(JSON.parse(await readFile(join(r, 'engine-state/species-research/nanosphronemus-gemma.json'), 'utf8')).group).toBe('labyrinth')

  // Written again from the research kept: an embeddable video joins the page's videos.
  await makeSpecies(r, { research: (async () => { throw new Error('no new research on a redo') }) as Llm, llm, http: gbif, now: () => new Date('2026-11-06T00:00:00Z') }, { name: 'Nanosphronemus gemma', videos: [video(true)] }, { reuse: true })
  expect(SpeciesSchema.parse(JSON.parse(await readFile(join(r, 'content/species/nanosphronemus-gemma/entity.json'), 'utf8'))).videos).toEqual([{ youtubeId: 'iV3tUG5Vd4I', title: 'Meet the Jewel Gourami!', durationSec: 261, lang: 'en' }])
  // While Wikimedia rests, no page is made with no photo: the species waits until the rest ends.
  const r2 = await root()
  checks = 0
  const resting = async (u: string) => { if (u.includes('commons.wikimedia.org')) throw new WikimediaRefused('2026-11-06T12:00:00.000Z'); return gbif(u) }
  await expect(makeSpecies(r2, { research, llm, http: resting, now: () => new Date('2026-11-06T00:00:00Z') }, { name: 'Nanosphronemus gemma', videos: [video(false)] })).rejects.toBeInstanceOf(WikimediaRefused)
  await expect(readFile(join(r2, 'content/species/nanosphronemus-gemma/entity.json'), 'utf8')).rejects.toThrow()
})

test('makeSpecies: a Vietnamese page\'s name with another kind\'s word is no name of it; the page takes its plain scientific form, listed for the Writing Lead', async () => {
  const r = await root()
  const research: Llm = async <T,>() => ({ ...facts, viNames: [{ name: 'Cá rô Huế', source: 4 }] }) as T
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in (a.schema as { properties: object }).properties
    ? { score: 0.95, notes: [] }
    : { sections: [{ key: 'reproduction', html: '<p>Cá đực xây tổ bọt.</p>', facts: ['f2'] }] }) as T
  const out = await makeSpecies(r, { research, llm, http: gbif, now: () => new Date('2026-11-15T00:00:00Z') }, { name: 'Nanosphronemus gemma', videos: [video(false)] })
  expect(out).toMatchObject({ slug: 'ca-nanosphronemus-gemma', name: 'Cá Nanosphronemus gemma' })
  const vi = JSON.parse(await readFile(join(r, 'content/species/nanosphronemus-gemma/vi.json'), 'utf8'))
  expect(vi.altNames).toEqual(['Jewel Gourami'])
  expect(JSON.parse(await readFile(join(r, 'engine-state/_kind-fallbacks.json'), 'utf8'))).toEqual({
    'species/nanosphronemus-gemma': { name: 'Cá rô Huế', word: 'rô', took: 'Cá Nanosphronemus gemma', at: '2026-11-15T00:00:00.000Z' },
  })
})

test('makeSpecies never writes over a page from a licensed source, nor a name GBIF doesn\'t know', async () => {
  const r = await root()
  await mkdir(join(r, 'content/species/nanosphronemus-gemma'), { recursive: true })
  await writeFile(join(r, 'content/species/nanosphronemus-gemma/entity.json'), JSON.stringify({ sections: [{ key: 'notes', source: 'seriouslyfish', sourceUrl: 'x', html: 'y' }] }))
  const never = (async () => { throw new Error('no research') }) as Llm
  expect(await makeSpecies(r, { research: never, llm: never, http: gbif, now: () => new Date() }, { name: 'Nanosphronemus gemma' })).toEqual({ id: 'nanosphronemus-gemma', skipped: 'Nanosphronemus gemma: a licensed source has its page' })
  expect(await makeSpecies(r, { research: never, llm: never, http: async u => (u.includes('/match') ? { matchType: 'NONE' } : { results: [] }), now: () => new Date() }, { name: 'Notafishus imaginarius' })).toMatchObject({ skipped: 'Notafishus imaginarius: GBIF has no species of that name' })
})

test('the schema holds the rule too: an AquaTome figure or part names a page of the species\' refs', () => {
  const base = { id: 'x', scientificName: 'X y', order: 'O', family: 'F', genus: 'X', group: 'other', places: [], sections: [], photos: [], videos: [], productSlots: [], updatedAt: '2026-11-06' }
  const refs = [{ url: 'https://a.example', title: 'A' }]
  expect(SpeciesSchema.safeParse({ ...base, refs, dataCard: { sizeCm: [{ source: 'aquatome', ref: 0, value: 2 }] } }).success).toBe(true)
  expect(SpeciesSchema.safeParse({ ...base, refs, dataCard: { sizeCm: [{ source: 'aquatome', value: 2 }] } }).success).toBe(false)
  expect(SpeciesSchema.safeParse({ ...base, refs, dataCard: { sizeCm: [{ source: 'aquatome', ref: 1, value: 2 }] } }).success).toBe(false)
  expect(SpeciesSchema.safeParse({ ...base, dataCard: {}, sections: [{ key: 'notes', source: 'aquatome', sourceUrl: 'x', html: 'y', refs: [0] }] }).success).toBe(false)
  expect(SpeciesSchema.safeParse({ ...base, refs: [{ url: 'javascript:alert(1)', title: 'A' }], dataCard: {} }).success).toBe(false)
})
