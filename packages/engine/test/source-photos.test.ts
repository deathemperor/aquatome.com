import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { ArchiveRefused } from '../src/archive'
import { htmlToOutline } from '../src/outline'
import { linkedPhotos, pickSourcePhotos, storeSourcePhotos } from '../src/source-photos'

const jpeg = (width = 800, height = 600) => sharp({ create: { width, height, channels: 3, background: 'gray' } }).jpeg().toBuffer()

const SF = 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi'
const html = readFileSync(new URL('./fixtures/pages/seriouslyfish-cardinal.html', import.meta.url), 'utf8')

test('outline images carry sizes; srcset picks the largest candidate', () => {
  const imgs = htmlToOutline('<main><img src="/s.jpg" srcset="/s.jpg 300w, /l.jpg 1200w" alt="A"><img src="/x.jpg" width="640" height="480"></main>').images
  expect(imgs).toEqual([{ src: '/l.jpg', alt: 'A', width: 1200 }, { src: '/x.jpg', alt: '', displayWidth: 640, displayHeight: 480 }])
})

test('picks the best source photos from a real page', () => {
  const picked = pickSourcePhotos(htmlToOutline(html, 'main').images, SF, ['Paracheirodon axelrodi', 'Cardinal Tetra']).filter(p => !p.extra)
  expect(picked.length).toBe(4)
  expect(new Set(picked.map(p => p.src)).size).toBe(4)
  for (const p of picked) {
    expect(p.src).toMatch(/^https:\/\/www\.seriouslyfish\.com\/images\//)
    if (p.width) expect(p.width).toBeGreaterThanOrEqual(600)
    else expect(p.probe).toBe(true)
  }
  expect(picked[0]!.alt).not.toMatch(/habitat/i) // the hero is the fish, not the biotope
})

test("a source's read-next card, an image linking to another of its articles, is never picked; a link to its own file or another site doesn't make one", () => {
  // The owner's report, 2026-11-10: arowanas and a corydoras on the platy guide, from The Spruce Pets' cards.
  const page = `<main><h2>Hifin</h2><figure><img src="https://x.com/hifin.jpg" width="800" height="600" alt="Hifin platy"></figure>
    <a href="/silver-arowana-1234"><img src="https://x.com/arowana.jpg" width="600" height="400" alt="Two silver arowana"></a>
    <a href="https://x.com/full.jpg"><img src="https://x.com/zoom.jpg" width="800" height="600" alt="Platy to zoom"></a>
    <a href="https://photos.example/p/1"><img src="https://x.com/credit.jpg" width="800" height="600" alt="Platy by a photographer"></a>
    <a href="https://x.com/platy-types/"><img src="https://x.com/self.jpg" width="800" height="600" alt="Platy linking to its own page"></a></main>`
  expect(pickSourcePhotos(htmlToOutline(page).images, 'https://x.com/platy-types', ['platy'], 6, 'guide').map(p => p.alt)).toEqual(['Hifin platy', 'Platy to zoom', 'Platy by a photographer', 'Platy linking to its own page'])
})

test('logos, icons, svgs, QR codes, tiny and banner images are never picked', () => {
  const picked = pickSourcePhotos([
    { src: '/logo.png', alt: 'Site logo', width: 900, height: 300 },
    { src: '/icons/fish.svg', alt: 'Cardinal', width: 900, height: 700 },
    { src: '/small.jpg', alt: 'Cardinal tetra', width: 300, height: 200 },
    { src: '/banner-sale.jpg', alt: 'Sale', width: 1600, height: 300 },
    { src: 'https://quickchart.io/qr?text=https%3A%2F%2Fshop.example%2Fcardinal', alt: 'Cardinal tetra' },
    { src: '/cache/qr/pa/paracheirodon_axelrodi_64x64.png', alt: '' },
    { src: '/cardinal.jpg', alt: 'Cardinal tetra', width: 1000, height: 700 },
  ], 'https://shop.example/p', ['Cardinal Tetra'])
  expect(picked.map(p => p.src)).toEqual(['https://shop.example/cardinal.jpg'])
})

test("a drawing, plate or stamp a source shows is no photo of the species: ScotCat's line drawings and stamps, Seriously Fish's Bleeker plate", () => {
  const picked = pickSourcePhotos([
    { src: '/silurichthys_hasseltii.jpg', alt: 'Silurichthys hasseltii: line drawing', width: 1000, height: 500 },
    { src: '/tachysurus_nudiceps_stamp.jpg', alt: 'Tachysurus nudiceps: catfish stamp', width: 1000, height: 700 },
    { src: '/luciosoma.jpg', alt: "Pieter Bleeker's drawing of L. spilopleura.", width: 1000, height: 500 },
    { src: '/painted-betta.jpg', alt: 'Painted betta, a male', width: 1000, height: 700 },
  ], 'https://www.scotcat.com/x.htm', ['Silurichthys hasseltii'])
  expect(picked.map(p => p.src)).toEqual(['https://www.scotcat.com/painted-betta.jpg'])
  // A guide keeps what its source shows: a drawing there is the article's own.
  expect(pickSourcePhotos([{ src: '/fins.jpg', alt: 'Line drawing of the fins', width: 1000, height: 700 }], 'https://x/g', [], Infinity, 'guide')).toHaveLength(1)
})

test('stores picked photos once, credited to the source', async () => {
  const uploads: string[] = []
  const deps = {
    bytes: async (url: string, referer: string) => { expect(referer).toBe(SF); return jpeg() },
    media: { urlFor: (key: string) => `https://media.test/${key}`, put: async (key: string) => { uploads.push(key); return { url: `https://media.test/${key}`, width: 800, height: 600 } } },
  }
  const picked = [{ src: 'https://www.seriouslyfish.com/images/a.jpg', alt: 'Adult male.', width: 800, height: 600 }]
  const photos = await storeSourcePhotos('seriouslyfish', 'Seriously Fish', SF, picked, deps, [])
  expect(photos).toEqual([{ url: expect.stringMatching(/^https:\/\/media\.test\/seriouslyfish\/[0-9a-f]{16}\.webp$/), width: 800, height: 600, licence: 'dùng với sự cho phép', author: 'Seriously Fish', sourceUrl: SF, caption: 'Adult male.', source: 'seriouslyfish' }])
  const again = await storeSourcePhotos('seriouslyfish', 'Seriously Fish', SF, picked, deps, photos)
  expect(again).toEqual(photos)
  expect(uploads).toHaveLength(1)
})

test('species/plant picks skip product packshots; duplicate captions collapse', () => {
  const imgs = [
    { src: '/shrimp.jpg', alt: 'Red Cherry Shrimp "Neocaridina davidi" - Breeding', width: 1000, height: 667 },
    { src: '/cuisine.jpg', alt: 'Hikari Shrimp Cuisine - Aquarium Co - Op', width: 1024, height: 1024 },
    { src: '/cave.jpg', alt: 'Aquarium Co - Op Shrimp Cave', width: 1024, height: 1024 },
    { src: '/fert.jpg', alt: 'Easy Green All-in-One Fertilizer', width: 1024, height: 1024 },
    { src: '/a1.jpg', alt: 'Two red cherry shrimp on moss', width: 1200, height: 800 },
    { src: '/a2.jpg', alt: 'Two red cherry shrimp on moss', width: 1200, height: 800 },
  ]
  expect(pickSourcePhotos(imgs, 'https://x.test/p', ['Neocaridina davidi', 'Red Cherry Shrimp']).map(p => p.src)).toEqual(['https://x.test/shrimp.jpg', 'https://x.test/a1.jpg'])
  expect(pickSourcePhotos([{ src: '/sponge.jpg', alt: 'Filter sponge of grade 30 ppi', width: 800, height: 600 }], 'https://x.test/p', [], 3, 'guide')).toHaveLength(1)
})

test('slim fish are photos, not banners; images without a pixel size are measured after download', async () => {
  const picked = pickSourcePhotos([
    { src: '/loach.jpg', alt: 'Acanthopsoides robertsi', width: 600, height: 233 },
    { src: '/banner.jpg', alt: 'Sale', width: 1600, height: 300 },
    { src: '/glaser.jpg', alt: '' }, // width="100%" on the page
  ], 'https://x.test/p', ['Acanthopsoides robertsi'])
  expect(picked.map(p => [p.src, !!p.probe])).toEqual([['https://x.test/loach.jpg', false], ['https://x.test/glaser.jpg', true]])
  const uploads: string[] = []
  const deps = {
    bytes: async (url: string) => new TextEncoder().encode(url),
    media: { urlFor: (k: string) => `https://m/${k}`, put: async (k: string) => { uploads.push(k); return { url: `https://m/${k}`, width: 800, height: 533 } } },
    size: async (b: Uint8Array) => (new TextDecoder().decode(b).includes('big') ? { width: 850, height: 567 } : { width: 200, height: 200 }),
  }
  const probe = (src: string) => ({ src, alt: '', probe: true })
  const out = await storeSourcePhotos('glaser', 'Aquarium Glaser', 'https://x.test/p', [probe('https://x.test/big.jpg'), probe('https://x.test/tiny.jpg')], deps, [])
  expect(out).toHaveLength(1)
  expect(uploads).toHaveLength(1)
})

test('articles skip images in a shop product tile; species pages from shops keep their product photos', () => {
  const html = `<main><img src="/blog/hero.jpg" alt="How to set up a betta tank" width="1000" height="667">
    <div class="mini-product"><a><img src="/cdn/shop/files/green-easy-flow-sponge-filter.jpg" alt="Green Easy Flow Sponge Filter (coarse) - Aquarium Co - Op" width="1024" height="1024" class="mini-product__image-element"></a></div></main>`
  const imgs = htmlToOutline(html).images
  expect(imgs.map(i => !!i.product)).toEqual([false, true])
  expect(pickSourcePhotos(imgs, 'https://shop.test/blogs/a', [], 6, 'guide').map(p => p.src)).toEqual(['https://shop.test/blog/hero.jpg'])
  const fish = htmlToOutline('<main><div class="product__media"><img src="/betta-koi.jpg" alt="Betta splendens koi" width="1200" height="900"></div></main>').images
  expect(pickSourcePhotos(fish, 'https://shop.test/products/betta', ['Betta splendens'])).toHaveLength(1)
})

test('photos on pages of their own (ScotCat): each thumbnail\'s page gives the full image and its photographer', async () => {
  const SC = 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai.htm'
  const page = `<body><div class="top-padding-10">Hoplisoma sterbai</div>
    <a href="../callichfamily.htm"><img src="../familylink.gif"></a><a href="https://www.fishbase.se/x"><img src="../fishbase.jpg"></a>
    ${[1, 2, 3, 4, 5].map(n => `<a href="hoplisoma_sterbai${n}.htm"><img src="../Thumbnails/c_sterbai${n}.jpg" alt="Click for full image" width="100" height="63"></a>`).join('')}</body>`
  const photoPage = (n: number, alt: string, by: string) => `<img src="../familylink.gif"><img src="../images/c_sterbai${n}.jpg" alt="${alt}" width="500" height="316" class="TKi"><br>${by ? `&nbsp;<font color="#666666">&copy;&nbsp;<strong>${by}</strong></font>` : ''}<img src="../Thumbnails/c_sterbai${n}.jpg" width="100">${'<p>…</p>'.repeat(200)}<p>©2026 SCOTCAT.COM</p>`
  const asked: string[] = []
  const get = async (u: string) => {
    asked.push(u)
    if (u.endsWith('3.htm')) throw new Error('HTTP 404')
    const n = Number(u.match(/(\d)\.htm$/)![1])
    return { html: photoPage(n, n === 1 ? 'Hoplisoma sterbai = spawning embrace' : 'Hoplisoma sterbai', n === 1 ? 'Photographer\n   A' : n === 2 ? 'Photographer B' : '') }
  }
  const images = await linkedPhotos(page, SC, /^https:\/\/www\.scotcat\.com\/[a-z]+idae\/[a-z0-9_]+\d\.htm$/, get)
  // Four photo pages at most; the one that fails is skipped.
  expect(asked).toHaveLength(4)
  expect(images[0]).toEqual({ src: 'https://www.scotcat.com/images/c_sterbai1.jpg', alt: 'Hoplisoma sterbai: spawning embrace', displayWidth: 500, displayHeight: 316, page: 'https://www.scotcat.com/callichthyidae/hoplisoma_sterbai1.htm', author: 'Photographer A' })
  // No credit under a photo: no author (never the site's footer).
  expect(images.map(i => i.author)).toEqual(['Photographer A', 'Photographer B', undefined])
  // 500 px photos only where the source allows them; shared captions are not duplicates here.
  expect(await storeSourcePhotos('scotcat', 'ScotCat', SC, pickSourcePhotos(images, SC, ['Hoplisoma sterbai']), { bytes: async () => jpeg(500, 316), media: { urlFor: k => k, put: async () => { throw new Error('too small') } } }, [])).toEqual([])
  const picked = pickSourcePhotos(images, SC, ['Hoplisoma sterbai'], 4, 'subject', 500)
  expect(picked).toHaveLength(3)
  const media = { urlFor: (key: string) => `https://media.test/${key}`, put: async (key: string) => ({ url: `https://media.test/${key}`, width: 500, height: 316 }) }
  const [stored] = await storeSourcePhotos('scotcat', 'ScotCat', SC, picked.slice(0, 1), { bytes: async () => jpeg(500, 316), media }, [])
  expect(stored).toMatchObject({ author: 'Photographer A / ScotCat', sourceUrl: SC, caption: 'Hoplisoma sterbai: spawning embrace', source: 'scotcat' })
})

test('a photo taken off the site before (a watermark) is not stored again when its source page is re-read', async () => {
  const fetched: string[] = []
  const media = { urlFor: (key: string) => `https://media.test/${key}`, put: async (key: string) => ({ url: `https://media.test/${key}`, width: 800, height: 600 }) }
  const picked = [{ src: 'https://x.test/logo-stamped.jpg', alt: 'a' }, { src: 'https://x.test/clean.jpg', alt: 'b' }]
  const first = await storeSourcePhotos('glaser', 'Aquarium Glaser', 'https://x.test/p', picked, { bytes: async u => (fetched.push(u), jpeg()), media }, [])
  const blocked = { [first[0]!.url]: 'watermark: Aquarium Glaser banner, top' }
  fetched.length = 0
  const again = await storeSourcePhotos('glaser', 'Aquarium Glaser', 'https://x.test/p', picked, { bytes: async u => (fetched.push(u), jpeg()), media, blocked }, [])
  expect(again.map(p => p.url)).toEqual([first[1]!.url])
  expect(fetched).toEqual(['https://x.test/clean.jpg'])
})

test('the archive refusing a picture stops the page, which waits and keeps its pictures', async () => {
  const media = { urlFor: (k: string) => `https://media.test/${k}`, put: async () => { throw new Error('nothing to store') } }
  const picked = [{ src: 'https://x.test/a.jpg', alt: '' }]
  await expect(storeSourcePhotos('planetcatfish', 'PlanetCatfish', 'https://x.test/p', picked, { bytes: async () => { throw new ArchiveRefused('2026-11-10T12:00:00.000Z') }, media }, [])).rejects.toBeInstanceOf(ArchiveRefused)
})

test('a refusal on a linked photo page stops before the next photo page', async () => {
  const refused = new ArchiveRefused('2026-11-10T12:00:00.000Z')
  const asked: string[] = []
  const html = [1, 2].map(n => `<a href="/photo${n}.htm"><img src="/thumb${n}.jpg"></a>`).join('')
  await expect(linkedPhotos(html, 'https://source.test/species', /photo\d\.htm$/, async u => {
    asked.push(u)
    throw refused
  })).rejects.toBe(refused)
  expect(asked).toEqual(['https://source.test/photo1.htm'])
})


test('a full-size file displayed at 350 px is measured; actual files under 600 px and thumbnails stay out', async () => {
  const images = htmlToOutline(`<main>
    <img src="/uploads/fish-large.jpg" width="350" height="233">
    <img src="/uploads/fish-small.jpg" width="350" height="233">
    <img src="/uploads/fish-150x100.jpg" width="150" height="100">
    <img src="/thumbnails/fish.jpg" width="100" height="67">
    <img src="/icon.png" width="32" height="32">
  </main>`).images
  const fetched: string[] = []
  const picked = pickSourcePhotos(images, 'https://source.test/fish', [])
  const out = await storeSourcePhotos('glaser', 'Source', 'https://source.test/fish', picked, {
    bytes: async u => { fetched.push(u); return sharp({ create: { width: u.includes('large') ? 850 : 599, height: 567, channels: 3, background: 'gray' } }).jpeg().toBuffer() },
    media: { urlFor: k => `https://media.test/${k}`, put: async (k, b) => { const m = await sharp(b).metadata(); return { url: `https://media.test/${k}`, width: m.width!, height: m.height! } } },
  }, [])
  expect(fetched).toEqual(['https://source.test/uploads/fish-large.jpg', 'https://source.test/uploads/fish-small.jpg'])
  expect(out).toHaveLength(1)
  expect(out[0]).toMatchObject({ width: 850, height: 567 })
})

test('a dead filename duplicate cannot hide a working address; a retrieved duplicate is not fetched again', async () => {
  const page = 'https://source.test/fish'
  const images = htmlToOutline(`<main>
    <img src="/old/fish.jpg" srcset="/old/fish.jpg 850w" alt="An adult fish">
    <img src="/current/fish.jpg" srcset="/current/fish.jpg 850w" alt="An adult fish">
    <img src="/another/fish.jpg" srcset="/another/fish.jpg 850w" alt="An adult fish">
  </main>`).images
  const fetched: string[] = []
  const out = await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, []), {
    bytes: async u => { fetched.push(u); if (u.includes('/old/')) throw new Error('HTTP 404'); return jpeg(850, 567) },
    media: { urlFor: k => `https://media.test/${k}`, put: async k => ({ url: `https://media.test/${k}`, width: 850, height: 567 }) },
  }, [])
  expect(fetched).toEqual(['https://source.test/old/fish.jpg', 'https://source.test/current/fish.jpg'])
  expect(out).toHaveLength(1)
})


test('the plain src is retained when the layout width exceeds every srcset width', () => {
  const images = htmlToOutline('<main><img src="/a.jpg" srcset="/small.jpg 300w, /full.jpg 850w" width="1200" height="800"></main>').images
  expect(images).toEqual([{ src: '/a.jpg', alt: '', displayWidth: 1200, displayHeight: 800 }])
})

test('newly eligible layout sizes and fallback addresses share at most four extra downloads, including on guides', async () => {
  const page = 'https://source.test/guide'
  const images = htmlToOutline(`<main>${Array.from({ length: 20 }, (_, n) => `<img src="/fish-${n}.jpg" width="350" height="233">`).join('')}</main>`).images
  const fetched: string[] = []
  const out = await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, [], Infinity, 'guide'), {
    bytes: async u => { fetched.push(u); return new Uint8Array(1) },
    size: async () => ({ width: 850, height: 567 }),
    media: { urlFor: k => `https://media.test/${k}`, put: async k => ({ url: `https://media.test/${k}`, width: 850, height: 567 }) },
  }, [])
  expect(fetched).toHaveLength(4)
  expect(out).toHaveLength(4)
})


test('the downloaded file must pass the real minimum even when srcset claims a larger width', async () => {
  const page = 'https://source.test/fish'
  const picked = pickSourcePhotos(htmlToOutline('<main><img src="/fish.jpg" srcset="/fish.jpg 850w"></main>').images, page, [])
  expect(await storeSourcePhotos('glaser', 'Source', page, picked, {
    bytes: async () => jpeg(599, 400),
    media: { urlFor: k => k, put: async () => { throw new Error('too small to upload') } },
  }, [])).toEqual([])
})


test('normal picks retain the old width bonus, unknown-size penalty, stable ties and cutoff', () => {
  const images = htmlToOutline(`<main>
    <img src="/plain.jpg" width="800" height="600">
    <img src="/wide.jpg" width="1200" height="800">
    <img src="/unknown.jpg">
    <img src="/subject.jpg" width="800" height="600" alt="Example fish">
    <img src="/set.jpg" srcset="/set.jpg 1400w" width="800" height="600">
    <img src="/habitat.jpg" width="800" height="600" alt="Example fish habitat">
    <img src="/second-plain.jpg" width="800" height="600">
  </main>`).images
  // The pre-fix picker: subject match, then the two large hints and habitat, stable in page order, then plain/unknown.
  const expected = ['subject', 'wide', 'set', 'habitat', 'plain', 'second-plain', 'unknown'].map(n => `https://source.test/${n}.jpg`)
  expect(pickSourcePhotos(images, 'https://source.test/fish', ['Example fish'], Infinity).map(p => p.src)).toEqual(expected)
  expect(pickSourcePhotos(images, 'https://source.test/fish', ['Example fish']).map(p => p.src)).toEqual(expected.slice(0, 4))
})

test('early small-display images cannot take normal places or their download turn', async () => {
  const page = 'https://source.test/fish'
  const normal = Array.from({ length: 4 }, (_, n) => `https://source.test/normal-${n}.jpg`)
  const small = Array.from({ length: 8 }, (_, n) => `https://source.test/small-${n}.jpg`)
  const images = htmlToOutline(`<main>${small.map(src => `<img src="${src}" width="350" height="233">`).join('')}${normal.map(src => `<img src="${src}" width="800" height="600">`).join('')}</main>`).images
  const picked = pickSourcePhotos(images, page, [])
  expect(picked.map(p => p.src)).toEqual([...normal, ...small])
  const fetched: string[] = []
  const out = await storeSourcePhotos('glaser', 'Source', page, picked, {
    bytes: async u => { fetched.push(u); return jpeg(u.includes('/small-') ? 200 : 800, u.includes('/small-') ? 150 : 600) },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 600 }) },
  }, [])
  expect(fetched.slice(0, 4)).toEqual(normal)
  expect(out).toHaveLength(4)
})

test('a dead normal address waits until every normal pick has had its turn before its fallback', async () => {
  const page = 'https://source.test/fish'
  const images = htmlToOutline(`<main>
    <img src="/old/fish.jpg" width="800" height="600">
    <img src="/current/fish.jpg" width="800" height="600">
    <img src="/other.jpg" width="800" height="600">
  </main>`).images
  const fetched: string[] = []
  expect(await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, []), {
    bytes: async u => { fetched.push(u); if (u.includes('/old/')) throw new Error('HTTP 404'); return jpeg() },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 600 }) },
  }, [])).toHaveLength(2)
  expect(fetched).toEqual(['https://source.test/old/fish.jpg', 'https://source.test/other.jpg', 'https://source.test/current/fish.jpg'])
})

test('newly eligible photos still get a turn when every normal group is blocked, even with a shared caption', async () => {
  const page = 'https://source.test/fish'
  const normal = htmlToOutline(`<main>${Array.from({ length: 4 }, (_, n) => `<img src="/normal-${n}.jpg" width="800" height="600" alt="View ${n}">`).join('')}</main>`).images
  const fetched: string[] = []
  const deps = {
    bytes: async (u: string) => { fetched.push(u); return jpeg() },
    media: { urlFor: (k: string) => k, put: async (k: string) => ({ url: k, width: 800, height: 600 }) },
  }
  const previous = await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(normal, page, []), deps, [])
  const blocked = Object.fromEntries(previous.map(p => [p.url, 'refused by a prior check']))
  const images = [...normal, ...htmlToOutline('<main><img src="/new-photo.jpg" width="350" height="233" alt="View 0"></main>').images]
  fetched.length = 0
  const out = await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, []), { ...deps, blocked }, [])
  expect(fetched).toEqual(['https://source.test/new-photo.jpg'])
  expect(out).toHaveLength(1)
})

test('layout strips and tall images are refused before download, and real shape is checked too', async () => {
  const page = 'https://source.test/fish'
  const images = htmlToOutline(`<main>
    <img src="/strip-a.jpg" width="1600" height="100">
    <img src="/strip-b.jpg" srcset="/strip-b.jpg 1600w" width="800" height="100">
    <img src="/tall.jpg" width="600" height="1800">
    <img src="/distorted.jpg" width="800" height="600">
    <img src="/photo.jpg" width="800" height="600">
  </main>`).images
  const picked = pickSourcePhotos(images, page, [])
  expect(picked.map(p => p.src)).toEqual(['https://source.test/distorted.jpg', 'https://source.test/photo.jpg'])
  const fetched: string[] = []
  const out = await storeSourcePhotos('glaser', 'Source', page, picked, {
    bytes: async u => { fetched.push(u); return jpeg(800, u.includes('/distorted') ? 100 : 600) },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 600 }) },
  }, [])
  expect(fetched).toEqual(picked.map(p => p.src))
  expect(out).toHaveLength(1)
})

test('a blocked first candidate ends the filename group without fetching another address', async () => {
  const page = 'https://source.test/fish'
  const picked = pickSourcePhotos(htmlToOutline('<main><img src="/first/fish.jpg" width="800" height="600"><img src="/second/fish.jpg" width="800" height="600"></main>').images, page, [])
  const fetched: string[] = []
  const deps = {
    bytes: async (u: string) => { fetched.push(u); return jpeg() },
    media: { urlFor: (k: string) => k, put: async (k: string) => ({ url: k, width: 800, height: 600 }) },
  }
  const previous = await storeSourcePhotos('glaser', 'Source', page, picked, deps, [])
  fetched.length = 0
  expect(await storeSourcePhotos('glaser', 'Source', page, picked, { ...deps, blocked: { [previous[0]!.url]: 'refused by a prior check' } }, [])).toEqual([])
  expect(fetched).toEqual([])
})


test('fallbacks and newly eligible probes share four extra requests after the normal requests', async () => {
  const page = 'https://source.test/fish'
  const normal = Array.from({ length: 4 }, (_, n) => `https://source.test/normal-${n}.jpg`)
  const small = Array.from({ length: 5 }, (_, n) => `https://source.test/small-${n}.jpg`)
  const alternate = 'https://source.test/alternate/normal-0.jpg'
  const images = htmlToOutline(`<main>${normal.map(src => `<img src="${src}" width="800" height="600">`).join('')}<img src="${alternate}" width="800" height="600">${small.map(src => `<img src="${src}" width="350" height="233">`).join('')}</main>`).images
  const fetched: string[] = []
  const out = await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, []), {
    bytes: async u => { fetched.push(u); if (u === normal[0]) throw new Error('HTTP 404'); return jpeg(u.includes('/small-') ? 599 : 800, 400) },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 400 }) },
  }, [])
  expect(fetched).toEqual([...normal, alternate, ...small.slice(0, 3)])
  expect(out).toHaveLength(4)
})

test('a partial layout size is never combined with a srcset file width to guess a shape', () => {
  const images = htmlToOutline('<main><img srcset="/height-only.jpg 1200w" width="100%" height="100"><img srcset="/width-only.jpg 1200w" width="800"></main>').images
  expect(pickSourcePhotos(images, 'https://source.test/fish', []).map(p => p.src)).toEqual(['https://source.test/height-only.jpg', 'https://source.test/width-only.jpg'])
})


test.each([
  ['dead', 'working', 'blocked'],
  ['working', 'dead', 'blocked'],
  ['dead', 'blocked', 'working'],
])('a blocked member vetoes its whole filename group before fetching: %s, %s, %s', async (...order) => {
  const page = 'https://source.test/fish'
  const images = htmlToOutline(`<main>${order.map(dir => `<img src="/${dir}/fish.jpg" width="800" height="600">`).join('')}</main>`).images
  const fetched: string[] = []
  const deps = {
    bytes: async (u: string) => { fetched.push(u); if (u.includes('/dead/')) throw new Error('HTTP 404'); return jpeg() },
    media: { urlFor: (k: string) => k, put: async (k: string) => ({ url: k, width: 800, height: 600 }) },
  }
  const previous = await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images.filter(i => i.src.includes('/blocked/')), page, []), deps, [])
  fetched.length = 0
  expect(await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, []), { ...deps, blocked: { [previous[0]!.url]: 'refused by a prior check' } }, [])).toEqual([])
  expect(fetched).toEqual([])
})

test.each([250, 1600])('srcset shape filtering preserves the old rounded height at the %i px boundary', async height => {
  const page = 'https://source.test/guide'
  const images = htmlToOutline(`<main>${Array.from({ length: 5 }, (_, n) => `<img src="/ratio-${n}.jpg" srcset="/ratio-${n}.jpg 1001w" width="1000" height="${height}">`).join('')}</main>`).images
  const fetched: string[] = []
  expect(await storeSourcePhotos('glaser', 'Source', page, pickSourcePhotos(images, page, [], Infinity, 'guide'), {
    bytes: async u => { fetched.push(u); return jpeg() },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 600 }) },
  }, [], Infinity)).toEqual([])
  expect(fetched).toEqual([])
})

test('thumbnail and icon folders exclude newly eligible images while normal images keep their places', async () => {
  const page = 'https://source.test/guide'
  const normal = ['https://source.test/thumbnails/normal.jpg', 'https://source.test/icons/normal-two.jpg', 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Photo.jpg/1200px-Photo.jpg']
  const images = htmlToOutline(`<main>${normal.map(src => `<img src="${src}" width="1200" height="800">`).join('')}
    <img src="/thumbnails/small.jpg" width="350" height="233"><img src="/icons/small-two.jpg" width="350" height="233">
    <img src="/normal-150x100.jpg" width="800" height="600">
  </main>`).images
  const picked = pickSourcePhotos(images, page, [], Infinity, 'guide')
  expect(picked.map(p => p.src)).toEqual(normal)
  const fetched: string[] = []
  expect(await storeSourcePhotos('glaser', 'Source', page, picked, {
    bytes: async u => { fetched.push(u); return jpeg() },
    media: { urlFor: k => k, put: async k => ({ url: k, width: 800, height: 600 }) },
  }, [], Infinity)).toHaveLength(3)
  expect(fetched).toEqual(normal)
})

// Seriously Fish prints each photo's credit under it (figcaption's credit line): a photographer, or a picture agency its
// permission doesn't cover. The intake reads it, so a refused credit can be refused (the chief of staff, 2026-11-13).
test("every photo in a source's figure carries the credit line printed under it", () => {
  const images = htmlToOutline(html, 'main').images
  const lines = [...html.matchAll(/<span class="_credit_[^"]*"><b>([^<]+)<\/b><\/span>/g)].map(m => m[1]!.trim())
  expect(lines.length).toBeGreaterThan(10)
  expect(images.filter(i => i.credit).map(i => i.credit)).toEqual(lines)
  for (const i of images.filter(i => i.credit)) expect(i.alt.endsWith(i.credit!)).toBe(false) // the caption stays the caption
})

test('a photo whose credit its source refuses is never fetched or stored, however the credit is spaced or cased', async () => {
  const fetched: string[] = []
  const media = { urlFor: (key: string) => `https://media.test/${key}`, put: async (key: string) => ({ url: `https://media.test/${key}`, width: 800, height: 600 }) }
  const picked = [
    { src: 'https://x.test/a.jpg', alt: 'Adult male.', credit: 'Example Picture-Agency' },
    { src: 'https://x.test/b.jpg', alt: 'Adult female.', credit: 'Imaginary Person' },
  ]
  const out = await storeSourcePhotos('seriouslyfish', 'Seriously Fish', SF, picked, { bytes: async u => (fetched.push(u), jpeg()), media, refusedCredits: ['example picture agency'] }, [])
  expect(fetched).toEqual(['https://x.test/b.jpg'])
  expect(out.map(p => p.caption)).toEqual(['Adult female.'])
})
