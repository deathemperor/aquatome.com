import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PlantSchema, SpeciesSchema } from '@aq/schema'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import type { SpeciesFacts } from '../src/species-research'
import { PROFILE_CHANNELS, speciesVideos, type SpeciesVideo } from '../src/species-videos'
import { CHANNELS } from '../src/video-discovery'

const UPLOADS = [
  { id: 'A', title: 'Sawbwa resplendens – The Tiny Fish with a Big Story' },
  { id: 'B', title: 'My fish room tour 2026' },
  { id: 'C', title: 'Species Spotlight: Christmas Moss' },
  { id: 'D', title: 'Meet the Imaginary Tetra' },
  { id: 'F', title: 'Meet the fish of Inle Lake' },
  { id: 'G', title: 'Meet the Jewel Gourami! A Newly Discovered Miniature Fish from Vietnam!' },
].map(u => ({ ...u, channel: 'CHRIS LUKHAUP' }))
// What each video presents, as its description gives it.
const ABOUT: Record<string, { kind: string; species: string }> = {
  A: { kind: 'animal', species: 'Sawbwa resplendens' }, C: { kind: 'plant', species: 'Taxiphyllum barbieri' }, D: { kind: 'animal', species: 'Notafishus imaginarius' },
  F: { kind: 'expedition', species: '' }, G: { kind: 'animal', species: 'Nanosphronemus gemma' },
}
const research: SpeciesFacts = {
  found: true, group: 'labyrinth', enNames: [], viNames: [], places: [],
  facts: [{ section: 'notes', fact: 'described in 2026', source: 0 }],
  care: [{ field: 'sizeCm', min: 1.65, max: 1.65, source: 0, quote: '16.5 mm SL' }],
  sources: [{ url: 'https://www.youtube.com/watch?v=G', title: 'Meet the Jewel Gourami!', kind: 'video' }],
}

async function root() {
  const r = await mkdtemp(join(tmpdir(), 'aq-species-videos-'))
  const put = async (f: string, x: unknown) => { await mkdir(join(r, f, '..'), { recursive: true }); await writeFile(join(r, f), JSON.stringify(x)) }
  await put('content/sources.json', { seriouslyfish: { name: 'Seriously Fish', homepage: 'x', publish: true, permission: { date: 'x', file: 'x', scope: [] } }, aquatome: { name: 'AquaTome', homepage: 'x', publish: true, permission: { date: 'x', file: 'x', scope: [] } } })
  const sf = (key: string) => ({ key, source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/sawbwa-resplendens/', html: `<p>${key}</p>` })
  await put('content/species/sawbwa-resplendens/entity.json', {
    id: 'sawbwa-resplendens', scientificName: 'Sawbwa resplendens', order: 'Cypriniformes', family: 'Cyprinidae', genus: 'Sawbwa', group: 'rasboras', places: [],
    dataCard: { sizeCm: [{ source: 'seriouslyfish', value: 3.5 }] }, sections: [sf('habitat'), sf('behaviour'), sf('reproduction')], photos: [], videos: [], productSlots: [], updatedAt: '2026-10-01',
  })
  await put('content/species/sawbwa-resplendens/vi.json', { slug: 'ca-sawbwa', name: 'Cá Sawbwa', altNames: [], sections: { 'habitat:seriouslyfish': '<p>Hồ Inle.</p>', 'behaviour:seriouslyfish': '<p>Hiền.</p>', 'reproduction:seriouslyfish': '<p>Rải trứng.</p>' }, quality: { score: 0.9, indexable: true, bySource: { seriouslyfish: 0.9 } } })
  await put('content/plants/taxiphyllum-sp-christmas/entity.json', {
    id: 'taxiphyllum-sp-christmas', scientificName: 'Vesicularia montagnei', synonyms: ['Taxiphyllum barbieri'], difficulty: 1, light: 'low', co2: 'optional', growth: 'slow', placement: ['epiphyte'],
    sections: [{ key: 'maintenance', source: 'tropica', sourceUrl: 'https://tropica.com/x', html: '<p>Easy.</p>' }], photos: [], productSlots: [], updatedAt: '2026-10-01',
  })
  await put('content/plants/taxiphyllum-sp-christmas/vi.json', { slug: 'reu-giang-sinh', name: 'Rêu Giáng Sinh', altNames: [], sections: { 'maintenance:tropica': '<p>Dễ.</p>' }, quality: { score: 0.9, indexable: true } })
  return r
}

function deps(calls: string[]) {
  const llm: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    const props = (a.schema as { properties: Record<string, unknown> }).properties
    if ('verdicts' in props) { calls.push('vet'); return { verdicts: UPLOADS.map(u => ({ id: u.id, profile: u.id !== 'B', reason: u.id === 'B' ? 'tank tour' : 'one species' })) } as T }
    if ('kind' in props) { const id = /Title: (.*)/.exec(a.prompt)![1]!; const u = UPLOADS.find(x => x.title === id)!; calls.push(`identify ${u.id}`); return { ...ABOUT[u.id]!, reason: 'x' } as T }
    if ('score' in props) return { score: 0.9, notes: [] } as T
    // A new page's writer cites facts; what a video adds to a page doesn't.
    if (JSON.stringify(a.schema).includes('"facts"')) return { sections: [{ key: 'notes', html: '<p>Loài được mô tả năm 2026.</p>', facts: ['f0', 'c0'] }] } as T
    return { sections: [a.prompt.includes('Rêu Giáng Sinh') ? { key: 'maintenance', html: '<p>Rêu bám lũa sau vài tuần.</p>' } : { key: 'behaviour', html: '<p>Một người nuôi lâu năm thấy cá đực xòe vây khoe nhau mỗi sáng, ở 75°F.</p>' }] } as T
  }
  const http = async (u: string) => (u.includes('/species/match') ? { matchType: 'NONE' } : u.includes('/species/search') ? { results: u.includes('Nanosphronemus') ? [{ canonicalName: 'Nanosphronemus gemma', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', order: 'Anabantiformes', family: 'Osphronemidae', genus: 'Nanosphronemus' }] : [] } : {})
  return {
    research: (async () => research) as Llm, llm, http, now: () => new Date('2026-11-06T00:00:00Z'),
    find: { uploads: async (h: string) => (calls.push(`uploads ${h}`), h === 'chrislukhaup' ? UPLOADS : []) },
    yt: {
      video: async (id: string) => ({ id, title: UPLOADS.find(u => u.id === id)!.title, channel: 'CHRIS LUKHAUP', channelUrl: '', durationSec: 300, chapters: [], embeddable: id !== 'G', description: `About ${ABOUT[id]?.species}.`, thumb: { url: '', width: 0, height: 0 }, lang: 'en' }),
      transcript: async () => 'what is said',
    },
  }
}

test('the species-profile channels are their own list, apart from the guides\' teaching channels', () => {
  expect(PROFILE_CHANNELS).toContain('chrislukhaup')
  expect(PROFILE_CHANNELS.filter(c => CHANNELS.includes(c))).toEqual([])
})

test('species-videos: uploads vetted by title once; a few profiles a run, each tried once: what it adds to a species or plant page, a new page, or skipped and recorded', async () => {
  const r = await root()
  const calls: string[] = []
  const d = deps(calls)
  const state = async () => JSON.parse(await readFile(join(r, 'engine-state/_species-videos.json'), 'utf8')) as Record<string, SpeciesVideo>

  const one = await speciesVideos(r, d, { channels: ['chrislukhaup'], limit: 2 })
  expect(one).toMatchObject({ vetted: 6, failed: [], stopped: '' })
  expect(calls.filter(c => c === 'vet')).toHaveLength(1)
  let s = await state()
  expect(s.B).toEqual({ at: '2026-11-06', title: 'My fish room tour 2026', channel: 'CHRIS LUKHAUP', kind: 'other', done: 'skipped', reason: 'tank tour' })
  expect(s.A).toMatchObject({ kind: 'profile', species: 'Sawbwa resplendens', page: 'species/sawbwa-resplendens', done: 'added', score: 0.9 })
  expect(s.C).toMatchObject({ species: 'Taxiphyllum barbieri', page: 'plants/taxiphyllum-sp-christmas', done: 'added' })
  expect(s.D).toEqual({ at: '2026-11-06', title: 'Meet the Imaginary Tetra', channel: 'CHRIS LUKHAUP', kind: 'profile' }) // the next run's

  // The species page: AquaTome's part after the source's under its heading, citing the video; the video joins its videos.
  const e = SpeciesSchema.parse(JSON.parse(await readFile(join(r, 'content/species/sawbwa-resplendens/entity.json'), 'utf8')))
  expect(e.sections.map(x => `${x.key}:${x.source}`)).toEqual(['habitat:seriouslyfish', 'behaviour:seriouslyfish', 'behaviour:aquatome', 'reproduction:seriouslyfish'])
  expect(e.sections[2]).toMatchObject({ refs: [0], sourceUrl: 'https://aquatome.com/vi/gioi-thieu/' })
  expect(e.refs).toEqual([{ url: 'https://www.youtube.com/watch?v=A', title: 'Sawbwa resplendens – The Tiny Fish with a Big Story' }])
  expect(e.videos).toEqual([{ youtubeId: 'A', title: 'Sawbwa resplendens – The Tiny Fish with a Big Story', durationSec: 300, lang: 'en' }])
  expect(e.updatedAt).toBe('2026-11-06')
  const vi = JSON.parse(await readFile(join(r, 'content/species/sawbwa-resplendens/vi.json'), 'utf8'))
  // Metric only: a writer's °F is converted.
  expect(vi.sections['behaviour:aquatome']).toMatch(/^<p>Một người nuôi lâu năm thấy cá đực xòe vây khoe nhau mỗi sáng, ở 24 ?°C\.<\/p>$/)
  expect(vi.quality).toEqual({ score: 0.9, indexable: true, bySource: { seriouslyfish: 0.9, aquatome: 0.9 } })
  // The plant page, found by a synonym: the same, with no list of videos.
  const p = PlantSchema.parse(JSON.parse(await readFile(join(r, 'content/plants/taxiphyllum-sp-christmas/entity.json'), 'utf8')))
  expect(p.sections.map(x => [x.key, x.source, x.refs])).toEqual([['maintenance', 'tropica', undefined], ['maintenance', 'aquatome', [0]]])
  expect(p.refs).toEqual([{ url: 'https://www.youtube.com/watch?v=C', title: 'Species Spotlight: Christmas Moss' }])

  // The next run: nothing new to vet; the rest, each tried once.
  calls.length = 0
  const two = await speciesVideos(r, d, { channels: ['chrislukhaup'], limit: 5 })
  expect(two.vetted).toBe(0)
  expect(calls.filter(c => c === 'vet')).toEqual([])
  s = await state()
  expect(s.D).toMatchObject({ species: 'Notafishus imaginarius', done: 'skipped', reason: 'no page, and GBIF has no species of that name' })
  expect(s.F).toMatchObject({ kind: 'other', done: 'skipped', reason: 'expedition: x' })
  expect(s.G).toMatchObject({ species: 'Nanosphronemus gemma', page: 'species/nanosphronemus-gemma', done: 'new page', score: 0.9 })
  const g = SpeciesSchema.parse(JSON.parse(await readFile(join(r, 'content/species/nanosphronemus-gemma/entity.json'), 'utf8')))
  expect(g.dataCard).toEqual({ sizeCm: [{ source: 'aquatome', ref: 0, value: 1.65 }] })
  expect(g.videos).toEqual([]) // its owner keeps it off other sites: cited only

  calls.length = 0
  expect(await speciesVideos(r, d, { channels: ['chrislukhaup'] })).toEqual({ vetted: 0, done: [], skipped: [], failed: [], stopped: '' })
  expect(calls).toEqual(['uploads chrislukhaup'])
  // The owner's pick runs again, but a page that cites the video is left as it is.
  const again = await speciesVideos(r, d, { only: ['A'] })
  expect(again.skipped).toEqual(['A Sawbwa resplendens – The Tiny Fish with a Big Story: skipped (species/sawbwa-resplendens): the page cites this video already'])
})
