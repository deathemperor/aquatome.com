import type { Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { cleanPhoto, featuredSpecies, groupTiles, listOrder, nativeCards, nativeSpecies } from '../src/lib/home'

const fish = (id: string, o: { places?: string[]; indexable?: boolean; photo?: boolean } = {}) => ({
  id, places: o.places ?? ['thailand'], sections: [], photos: o.photo === false ? [] : [{ url: `https://x/${id}.jpg` }],
  t: { name: id, quality: { indexable: o.indexable ?? true } },
})

test("the home page's native fish: the language's country, popular fish first, only indexable pages with a photo", () => {
  const c = {
    places: [{ id: 'thailand', parent: 'asia', t: { name: 'ไทย' } }, { id: 'indonesia', parent: 'asia', t: { name: 'Indonesia' } }],
    species: [
      fish('akysis-hendricksoni'), fish('trichopodus-trichopterus'), fish('scleropages-formosus'), fish('betta-splendens'),
      fish('rasbora-x', { indexable: false }), fish('rasbora-y', { photo: false }), fish('betta-z', { places: ['indonesia'] }),
    ],
  } as unknown as Content
  const n = nativeSpecies('th', c)
  expect(n.place?.id).toBe('thailand')
  // Staples, then the popular list in its order, then the rest.
  expect(n.species.map(s => s.id)).toEqual(['betta-splendens', 'scleropages-formosus', 'trichopodus-trichopterus', 'akysis-hendricksoni'])
  expect(n.count).toBe(6)
  expect(nativeSpecies('id', c).species.map(s => s.id)).toEqual(['betta-z'])
})

const card = { tempC: [{ source: 'seriouslyfish', value: { min: 24, max: 28 } }], ph: [{ source: 'seriouslyfish', value: { min: 6, max: 7.5 } }], sizeCm: [{ source: 'seriouslyfish', value: 5 }], tankCm: [{ source: 'seriouslyfish', value: 60 }] }
const sp = (id: string, dataCard: object = card) => ({ ...fish(id), dataCard })

test('home features only species with a full data card while there are enough, staples first', () => {
  // Angelfish is a staple with only its size known: it waits until no complete species is left.
  const c = { species: [sp('pterophyllum-scalare', { sizeCm: card.sizeCm }), sp('betta-splendens'), sp('rasbora-x'), sp('rasbora-y', { tempC: card.tempC, ph: card.ph, sizeCm: card.sizeCm })] } as unknown as Content
  expect(featuredSpecies('th', c, 2).map(s => s.id)).toEqual(['betta-splendens', 'rasbora-x'])
  expect(featuredSpecies('th', c, 4).map(s => s.id)).toEqual(['betta-splendens', 'rasbora-x', 'pterophyllum-scalare', 'rasbora-y'])
  // The full species list keeps its order: well-known first, whatever their card.
  expect(listOrder('th', c).map(s => s.id).slice(0, 2)).toEqual(['betta-splendens', 'pterophyllum-scalare'])
})

test("a group's tile takes a photo at least 640 px wide before a smaller one, even from a less documented member", () => {
  const cat = (id: string, width: number, photos = 3) => ({ ...fish(id), group: 'catfish', photos: Array.from({ length: photos }, (_, i) => ({ url: `https://x/${id}-${i}.jpg`, width, height: width / 1.5, source: 'commons' })) })
  const c = { species: [cat('corydoras-small-scan', 500), cat('corydoras-sharp', 1000, 1)] } as unknown as Content
  expect(groupTiles('vi', c)[0]!.photo?.url).toBe('https://x/corydoras-sharp-0.jpg')
  // With none that wide, the best-documented member's.
  const soft = { species: [cat('a', 500), cat('b', 400, 1)] } as unknown as Content
  expect(groupTiles('vi', soft)[0]!.photo?.url).toBe('https://x/a-0.jpg')
})

test("a video guide's card picture: a photo from its sections, not a strip a card would crop to a sliver; the home page's videos all have one", async () => {
  const { getContent } = await import('../src/lib/content')
  const { guideImages } = await import('../src/lib/mentions')
  const { homeVideos } = await import('../src/lib/video')
  const c = await getContent('vi')
  const g = c.guides.find(x => x.video?.figures?.some(f => f.photo))!
  const photo = g.video!.figures!.find(f => f.photo)!.photo!
  expect(guideImages(c, g)).toContain(photo)
  const strip = { ...g, video: { ...g.video!, figures: [{ heading: 'x', moments: [], photo: { ...photo, url: 'https://x/strip.webp', width: 960, height: 267 } }] } }
  expect(guideImages(c, strip).map(p => p.url)).not.toContain('https://x/strip.webp')
  // A guide with no picture at all waits: the home page's row shows only videos with one.
  const bare = { ...g, id: 'bare', photos: [], mentions: [], t: { ...g.t, body: '<p>Không nhắc loài nào.</p>' }, video: { ...g.video!, figures: [], series: { ...g.video!.series!, position: 0 } } }
  expect(guideImages({ ...c, guides: [bare, ...c.guides] }, bare)).toEqual([])
  const withBare = { ...c, guides: [bare, ...c.guides] }
  expect(homeVideos(withBare).map(v => v.id)).not.toContain('bare')
  expect(homeVideos(withBare).length).toBeGreaterThan(0)
})

test("the snails' tile shows a living snail before a museum shell, whoever is better documented", () => {
  const snail = (id: string, photos: number) => ({ ...fish(id), group: 'snails', photos: Array.from({ length: photos }, (_, i) => ({ url: `https://x/${id}-${i}.jpg`, width: 960, height: 720, source: 'commons' })) })
  const c = { species: [snail('monetaria-annulus', 3), snail('radix-rubiginosa', 1)] } as unknown as Content
  expect(groupTiles('vi', c)[0]!.photo?.url).toBe('https://x/radix-rubiginosa-0.jpg')
})

test("the home page's native fish: those often recorded in the country lead, ahead of a popular fish a source places at its edge", () => {
  const seen = (n: number) => ({ dataCard: {}, range: { records: { countries: [['TH', n]] } } })
  const c = {
    places: [{ id: 'thailand', parent: 'asia', t: { name: 'ไทย' } }],
    species: [{ ...fish('betta-splendens'), ...seen(1) }, { ...fish('rasbora-x'), ...seen(12) }, { ...fish('akysis-hendricksoni'), ...seen(40) }, { ...fish('trichopodus-trichopterus'), dataCard: {} }],
  } as unknown as Content
  // The most recorded first, whichever is better known.
  expect(nativeCards('th', c, [], 4).map(s => s.id)).toEqual(['akysis-hendricksoni', 'rasbora-x', 'betta-splendens', 'trichopodus-trichopterus'])
})

test('a card takes a photo it can crop whole before a strip wider than about 2:1', () => {
  const strip = { url: 'https://x/strip.jpg', width: 640, height: 263, source: 'seriouslyfish' }
  const whole = { url: 'https://x/whole.jpg', width: 800, height: 600, source: 'seriouslyfish' }
  expect(cleanPhoto([strip, whole] as never)).toBe(whole)
  expect(cleanPhoto([strip] as never)).toBe(strip)
})

test("the home page's videos: one of each subject before a second of any", async () => {
  const { getContent } = await import('../src/lib/content')
  const { homeVideos } = await import('../src/lib/video')
  const c = await getContent('vi')
  const g = c.guides.find(x => x.video?.series && x.video.figures?.some(f => f.photo))!
  const part = (id: string, kind: typeof g.kind, position: number): typeof g => ({ ...g, id, kind, video: { ...g.video!, series: { ...g.video!.series!, position } } })
  const guides = [part('build-1', 'setup', 0), part('build-2', 'setup', 1), part('build-3', 'setup', 2), part('plants', 'plantCare', 3)]
  expect(homeVideos({ ...c, guides: [...guides, ...c.guides.filter(x => !x.video)] }, 2).map(v => v.id)).toEqual(['build-1', 'plants'])
})
