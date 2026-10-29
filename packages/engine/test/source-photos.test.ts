import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { htmlToOutline } from '../src/outline'
import { pickSourcePhotos, storeSourcePhotos } from '../src/source-photos'

const SF = 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi'
const html = readFileSync(new URL('./fixtures/pages/seriouslyfish-cardinal.html', import.meta.url), 'utf8')

test('outline images carry sizes; srcset picks the largest candidate', () => {
  const imgs = htmlToOutline('<main><img src="/s.jpg" srcset="/s.jpg 300w, /l.jpg 1200w" alt="A"><img src="/x.jpg" width="640" height="480"></main>').images
  expect(imgs).toEqual([{ src: '/l.jpg', alt: 'A', width: 1200 }, { src: '/x.jpg', alt: '', width: 640, height: 480 }])
})

test('picks the best source photos from a real page', () => {
  const picked = pickSourcePhotos(htmlToOutline(html, 'main').images, SF, ['Paracheirodon axelrodi', 'Cardinal Tetra'])
  expect(picked.length).toBe(4)
  expect(new Set(picked.map(p => p.src)).size).toBe(4)
  for (const p of picked) {
    expect(p.src).toMatch(/^https:\/\/www\.seriouslyfish\.com\/images\//)
    expect(p.width).toBeGreaterThanOrEqual(600)
  }
  expect(picked[0]!.alt).not.toMatch(/habitat/i) // the hero is the fish, not the biotope
})

test('logos, icons, svgs, tiny and banner images are never picked', () => {
  const picked = pickSourcePhotos([
    { src: '/logo.png', alt: 'Site logo', width: 900, height: 300 },
    { src: '/icons/fish.svg', alt: 'Cardinal', width: 900, height: 700 },
    { src: '/small.jpg', alt: 'Cardinal tetra', width: 300, height: 200 },
    { src: '/banner-sale.jpg', alt: 'Sale', width: 1600, height: 300 },
    { src: '/cardinal.jpg', alt: 'Cardinal tetra', width: 1000, height: 700 },
  ], 'https://shop.example/p', ['Cardinal Tetra'])
  expect(picked.map(p => p.src)).toEqual(['https://shop.example/cardinal.jpg'])
})

test('stores picked photos once, credited to the source', async () => {
  const uploads: string[] = []
  const deps = {
    bytes: async (url: string, referer: string) => { expect(referer).toBe(SF); return new TextEncoder().encode(url) },
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
