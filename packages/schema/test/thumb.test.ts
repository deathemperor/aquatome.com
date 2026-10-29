import { expect, test } from 'vitest'
import { thumbOf } from '../src/thumb'

test('R2 photos get their -480 sibling; Wikimedia thumbs drop to 500px; others have none', () => {
  expect(thumbOf('https://media.aquatome.com/seriouslyfish/0ce369febb7029f2.webp')).toBe('https://media.aquatome.com/seriouslyfish/0ce369febb7029f2-480.webp')
  expect(thumbOf('https://media.aquatome.com/seriouslyfish/0ce369febb7029f2-480.webp')).toBeUndefined()
  expect(thumbOf('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fish.jpg/960px-Fish.jpg')).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Fish.jpg/500px-Fish.jpg')
  expect(thumbOf('https://upload.wikimedia.org/wikipedia/commons/a/ab/Fish.jpg')).toBeUndefined()
  expect(thumbOf('https://thumb.wikimedia.org/w/thumb/a/ab/F.jpg/960px-F.jpg?utm_source=x')).toBe('https://thumb.wikimedia.org/w/thumb/a/ab/F.jpg/500px-F.jpg?utm_source=x')
  expect(thumbOf('https://example.com/a.webp')).toBeUndefined()
})
