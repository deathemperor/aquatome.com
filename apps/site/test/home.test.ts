import type { Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { cleanPhoto, easyPlants, featuredSpecies, groupTiles, listOrder, nativeCards, nativeSpecies } from '../src/lib/home'

const fish = (id: string, o: { places?: string[]; indexable?: boolean; photo?: boolean } = {}) => ({
  id, places: o.places ?? ['thailand'], sections: [], photos: o.photo === false ? [] : [{ url: `https://x/${id}.jpg`, width: 800, height: 600 }],
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

// 22 Nov 2026: the three groups the engine accepts outside its model's list have names, but no home tile while the owner
// decides whether characoids folds into characins (format.ts OFF_LIST_GROUPS).
test('the groups outside the model\'s list have no home tile', () => {
  const c = { species: ['characins', 'characoids', 'cyprinid', 'catfish'].map(group => ({ ...fish(`x-${group}`), group })) } as unknown as Content
  expect(groupTiles('vi', c).map(t => t.group)).toEqual(['catfish'])
})

test("a photo the calendar keeps off cards leads no featured fish and no group tile; its page keeps it", () => {
  const avoid = { 'https://x/betta-splendens.jpg': 'a drawing (the chief of staff, 15 Nov)', 'https://x/a-0.jpg': 'a figure plate' }
  const c = { species: [sp('betta-splendens'), sp('rasbora-x'), sp('rasbora-y')] } as unknown as Content
  expect(featuredSpecies('th', c, 2).map(s => s.id)).toEqual(['betta-splendens', 'rasbora-x'])
  expect(featuredSpecies('th', c, 2, avoid).map(s => s.id)).toEqual(['rasbora-x', 'rasbora-y'])
  expect(c.species[0]!.photos[0]!.url).toBe('https://x/betta-splendens.jpg')
  const cat = (id: string, photos: number) => ({ ...fish(id), group: 'catfish', photos: Array.from({ length: photos }, (_, i) => ({ url: `https://x/${id}-${i}.jpg`, width: 1000, height: 667, source: 'commons' })) })
  const g = { species: [cat('a', 3), cat('b', 1)] } as unknown as Content
  expect(groupTiles('vi', g)[0]!.photo?.url).toBe('https://x/a-0.jpg')
  expect(groupTiles('vi', g, undefined, avoid)[0]!.photo?.url).toBe('https://x/b-0.jpg')
})

test("a video guide's card picture is its own video's still, never a part's stock photo; the home page's videos have one but for at most one", async () => {
  const { stillShown } = await import('@aq/schema')
  const { getContent } = await import('../src/lib/content')
  const { guideImages } = await import('../src/lib/mentions')
  const { homeVideos } = await import('../src/lib/video')
  const { pagePictures, takeRow } = await import('../src/lib/pictures')
  const c = await getContent('vi')
  const g = c.guides.find(x => x.video?.figures?.some(f => f.photo) && x.video.figures.some(f => f.moments.some(stillShown)))!
  const photo = g.video!.figures!.find(f => f.photo)!.photo!, still = g.video!.figures!.flatMap(f => f.moments).find(stillShown)!
  expect(guideImages(c, g)[0]?.url).toBe(still.url)
  expect(guideImages(c, g).map(p => p.url)).not.toContain(photo.url)
  // A guide with no picture at all keeps its place and draws a cover (the chief of staff and the Design Lead, 15 Nov 2026),
  // one at most in the home page's row of four.
  const bare = { ...g, id: 'bare', photos: [], mentions: [], t: { ...g.t, body: '<p>Không nhắc loài nào.</p>' }, video: { ...g.video!, figures: [], series: { ...g.video!.series!, position: 0 } } }
  expect(guideImages({ ...c, guides: [bare, ...c.guides] }, bare)).toEqual([])
  const withBare = { ...c, guides: [bare, ...c.guides] }
  expect(homeVideos(withBare).map(v => v.id)).toContain('bare')
  const row = takeRow(pagePictures(withBare), homeVideos(withBare), v => guideImages(withBare, v))
  expect(row.items.length).toBeGreaterThan(0)
  expect(row.photos.filter(p => !p).length).toBeLessThanOrEqual(1)
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
  expect(homeVideos({ ...c, guides: [...guides, ...c.guides.filter(x => !x.video)] }).slice(0, 2).map(v => v.id)).toEqual(['build-1', 'plants'])
})

test("the home page's native fish: one whose photos are all strips waits", () => {
  const c = {
    places: [{ id: 'thailand', parent: 'asia', t: { name: 'ไทย' } }],
    species: [
      { ...fish('trigonostigma-espei'), dataCard: {}, photos: [{ url: 'https://x/strip.jpg', width: 640, height: 263 }], range: { records: { countries: [['TH', 50]] } } },
      { ...fish('akysis-hendricksoni'), dataCard: {}, photos: [{ url: 'https://x/a.jpg', width: 800, height: 600 }], range: { records: { countries: [['TH', 20]] } } },
    ],
  } as unknown as Content
  expect(nativeCards('th', c, [], 4).map(s => s.id)).toEqual(['akysis-hendricksoni'])
})

test("the home page's native fish and easy plants: one led by a non-commercial photo waits, the row features them (the chief of staff's rule, 17 Nov)", () => {
  const shot = (id: string, licence: string) => [{ url: `https://x/${id}.jpg`, width: 800, height: 600, licence }]
  const plant = (id: string, licence: string) => ({ id, photos: shot(id, licence), light: 'low', co2: 'none', difficulty: 1, sections: [], t: { name: id } })
  const c = {
    places: [{ id: 'thailand', parent: 'asia', t: { name: 'ไทย' } }],
    species: [
      { ...fish('akysis-hendricksoni'), dataCard: {}, photos: shot('a', 'CC BY-NC 4.0'), range: { records: { countries: [['TH', 50]] } } },
      { ...fish('trichopodus-trichopterus'), dataCard: {}, photos: shot('t', 'CC BY 4.0'), range: { records: { countries: [['TH', 20]] } } },
    ],
    plants: [plant('plant-nc', 'CC BY-NC-SA 4.0'), plant('plant-open', 'CC BY-SA 4.0')],
  } as unknown as Content
  expect(nativeCards('th', c, [], 4).map(s => s.id)).toEqual(['trichopodus-trichopterus'])
  expect(easyPlants(c, 4).map(p => p.id)).toEqual(['plant-open'])
})

test("the home page's native fish: one kept in brackish or sea water waits, and the row still fills", () => {
  const c = {
    places: [{ id: 'thailand', parent: 'asia', t: { name: 'ไทย' } }],
    species: [
      { ...fish('dichotomyctere-nigroviridis'), dataCard: {}, water: { kind: 'brackish', source: 'seriouslyfish', quote: 'x y' }, range: { records: { countries: [['TH', 90]] } } },
      { ...fish('akysis-hendricksoni'), dataCard: {}, range: { records: { countries: [['TH', 20]] } } },
      { ...fish('rasbora-x'), dataCard: {} },
    ],
  } as unknown as Content
  expect(nativeCards('th', c, [], 2).map(s => s.id)).toEqual(['akysis-hendricksoni', 'rasbora-x'])
})

// The chief of staff, 15 Nov 2026: a guide never loses its place in a list because it has no picture; its card draws a
// cover (the Design Lead's board). Before, a guide with no picture was on no list of guides to lead with or read next.
test('a guide with no picture keeps its place among the guides to lead with and to read next', async () => {
  const { getContent } = await import('../src/lib/content')
  const { leadGuides, nextGuides } = await import('../src/lib/home')
  const { guideImage } = await import('../src/lib/mentions')
  const c = await getContent('vi')
  const lead = leadGuides(c)
  const g = lead[0]!
  const bare = { ...g, photos: [], t: { ...g.t, name: 'Thay nước cho bể' } }
  const c2 = { ...c, guides: c.guides.map(x => (x.id === g.id ? bare : x)) }
  expect(guideImage(c2, bare)).toBeUndefined()
  expect(leadGuides(c2).map(x => x.id)).toEqual(lead.map(x => x.id))
  // The guide before it in the lead list reads it next, as before.
  const other = c2.guides.find(x => x.id !== g.id && !x.video && x.kind === g.kind)!
  expect(nextGuides(c2, other, lead.length).map(x => x.id)).toContain(g.id)
})

test("a home row's four: at most one with no picture, the next with one taking its place; one passed by takes nothing", async () => {
  const { PictureSet } = await import('@aq/schema')
  const { takeRow } = await import('../src/lib/pictures')
  const photo = (id: string) => ({ url: `https://x/${id}.jpg`, width: 800, height: 500 }) as never
  const items = [{ id: 'a', p: [photo('a')] }, { id: 'none-1', p: [] }, { id: 'none-2', p: [] }, { id: 'b', p: [photo('b')] }, { id: 'c', p: [photo('c')] }, { id: 'd', p: [photo('d')] }]
  const pics = new PictureSet({})
  const row = takeRow(pics, items, x => x.p)
  expect(row.items.map(x => x.id)).toEqual(['a', 'none-1', 'b', 'c'])
  expect(row.photos.map(p => p && (p as { url: string }).url)).toEqual(['https://x/a.jpg', null, 'https://x/b.jpg', 'https://x/c.jpg'])
  // "d" wasn't reached: the page can still show its photo.
  expect(pics.take([photo('d')])).toBeTruthy()
  // A photo the page shows already counts as none.
  const shown = new PictureSet({})
  shown.add('https://x/a.jpg')
  expect(takeRow(shown, items, x => x.p).items.map(x => x.id)).toEqual(['a', 'b', 'c', 'd'])
})
