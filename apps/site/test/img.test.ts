import { expect, test } from 'vitest'
import { smallSrc } from '../src/lib/img'

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
