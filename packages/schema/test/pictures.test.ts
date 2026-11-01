import { expect, test } from 'vitest'
import { hashDistance, PictureSet } from '../src/pictures'

test('two hashes differ in as many bits as they do, in either half', () => {
  const slow = (a: string, b: string) => [...(BigInt(`0x${a}`) ^ BigInt(`0x${b}`)).toString(2)].filter(x => x === '1').length
  expect(hashDistance('0000000000000000', 'ffffffffffffffff')).toBe(64)
  expect(hashDistance('8000000000000001', '0000000000000000')).toBe(2)
  for (let i = 0; i < 200; i++) {
    const [a, b] = [0, 1].map(() => Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join(''))
    expect(hashDistance(a!, b!)).toBe(slow(a!, b!))
  }
})

test('one picture in two files, a card thumb of a photo, a video by its thumbnails', () => {
  const pics = new PictureSet({ 'https://m/a.webp': '0d4367a7830b31d1', 'https://m/b.webp': '0d4367a7830b31d3' })
  pics.add('https://m/a.webp')
  expect(pics.has('https://m/b.webp')).toBe(true)
  expect(pics.has('https://m/a-480.webp')).toBe(true)
  expect(pics.has('https://m/c.webp')).toBe(false)
  pics.add('https://i.ytimg.com/vi/xyz/hqdefault.jpg')
  expect(pics.has('https://i.ytimg.com/vi_webp/xyz/mqdefault.webp')).toBe(true)
  expect(pics.take([{ url: 'https://m/b.webp' }, { url: 'https://m/c.webp' }])?.url).toBe('https://m/c.webp')
})
