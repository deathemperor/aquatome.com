import { expect, test } from 'vitest'
import { smallSrc, widthSrcset } from '../src/lib/img'
import { figureHtml } from '../src/lib/figures'

const photo = (url: string, width: number, thumb?: string) => ({ url, thumb, width, height: 720, licence: 'CC BY-SA 4.0', author: 'x', sourceUrl: 'x' })
const ORIGINAL = 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Can_flowerhorn.png?utm_source=commons.wikimedia.org'

test('a Commons original (recorded as its own thumb when it is ≤1280 px) gets the 500 px thumb', () => {
  expect(smallSrc(photo(ORIGINAL, 1280, ORIGINAL))).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Can_flowerhorn.png/500px-Can_flowerhorn.png')
  // Narrower than 500 px: Commons cannot scale it up, so the original stays.
  expect(smallSrc(photo(ORIGINAL, 400, ORIGINAL))).toBe(ORIGINAL)
})

test('a recorded thumb, a sized Wikimedia thumb and our own photos keep their small version', () => {
  expect(smallSrc(photo('https://media.aquatome.com/a/b.webp', 1024, 'https://media.aquatome.com/a/b-480.webp'))).toBe('https://media.aquatome.com/a/b-480.webp')
  expect(smallSrc(photo('https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/X.jpg/1280px-X.jpg', 1280))).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/X.jpg/500px-X.jpg')
  expect(smallSrc(photo('https://static.inaturalist.org/photos/1/medium.jpg', 500))).toBe('https://static.inaturalist.org/photos/1/medium.jpg')
})


test('article photos offer their recorded 480 px copy and keep the original fallback', () => {
  const full = 'https://media.aquatome.com/a/b.webp'
  const small = 'https://media.aquatome.com/a/b-480.webp'
  const p = photo(full, 1024, small)
  const srcset = `${small} 480w, ${full} 1024w`
  expect(widthSrcset(p)).toBe(srcset)
  const html = figureHtml('vi', { photo: p, label: 'Cá neon' })
  expect(html).toContain(`src="${full}" width="1024" height="720" alt="Cá neon"`)
  expect(html).toContain(`srcset="${srcset}"`)
  expect(html).toContain('sizes="auto,')
  expect(figureHtml('vi', { photo: p }, true)).not.toContain('srcset=')
})

test('unrecorded, unrelated and same-width thumbs do not enter the responsive set', () => {
  const full = 'https://media.aquatome.com/a/b.webp'
  const small = 'https://media.aquatome.com/a/b-480.webp'
  expect(widthSrcset(photo(full, 800))).toBeUndefined()
  expect(widthSrcset(photo(full, 480, small))).toBeUndefined()
  expect(widthSrcset(photo(full, 900, 'https://media.aquatome.com/a/c-480.webp'))).toBeUndefined()
  expect(widthSrcset(photo(ORIGINAL, 1000, ORIGINAL))).toBeUndefined()
})
