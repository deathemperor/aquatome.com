import { expect, test } from 'vitest'
import { languageWord, videosForPage } from '../src/videos'

const v = (youtubeId: string, title: string, lang: string) => ({ youtubeId, title, durationSec: 60, lang })
const en = v('en1', 'Neon tetra care', 'en-US')
const fr = v('fr1', 'Le néon', 'fr')
const vi = v('vi1', 'Nuôi cá neon', 'vi')
const titles = { en1: 'Cách nuôi cá neon' }

test("a title in the page's language, the real one kept; a video spoken in that language first and never left out", () => {
  expect(videosForPage([en, vi], 'vi', titles, {})).toEqual([vi, { ...en, title: 'Cách nuôi cá neon', originalTitle: 'Neon tetra care' }])
  expect(videosForPage([en, vi], 'vi', titles, {}, { order: false }).map(x => x.youtubeId)).toEqual(['en1', 'vi1'])
})

test('with the rule on, a foreign video with no title in that language is not shown, and one spoken in it always is', () => {
  expect(videosForPage([fr, vi, en], 'vi', titles, {}, { requireTitle: true }).map(x => x.youtubeId)).toEqual(['vi1', 'en1'])
  expect(videosForPage([fr], 'vi', titles, {}).map(x => x.title)).toEqual(['Le néon'])
  expect(videosForPage([vi], 'vi', {}, {}, { requireTitle: true })).toEqual([vi])
})

test('a generated video is marked, translated or not', () => {
  const out = videosForPage([en, vi], 'vi', titles, { en1: 'generated', vi1: 'drawn' })
  expect(out.every(x => (x as { generated?: boolean }).generated === true)).toBe(true)
})

test("a video's language as a word in the page's language; none where the tag names none", () => {
  expect(languageWord('en', 'vi')).toBe('tiếng Anh')
  expect(languageWord('en-US', 'vi')).toBe('tiếng Anh')
  expect(languageWord('fr', 'vi')).toBe('tiếng Pháp')
  expect(languageWord('vi', 'vi')).toBe('tiếng Việt')
  expect(languageWord('en', 'id')).toBe('bahasa Inggris')
  expect(languageWord('vi', 'id')).toBe('bahasa Vietnam')
  expect(languageWord('en', 'th')).toBe('ภาษาอังกฤษ')
  expect(languageWord('en', 'ms')).toBe('bahasa Inggeris')
  expect(languageWord('zxx', 'vi')).toBeUndefined()
  expect(languageWord('und', 'vi')).toBeUndefined()
})
