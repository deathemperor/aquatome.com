import { describe, expect, test } from 'vitest'
import { languageWord, videosForPage } from '../src/videos'
import type { Video } from '../src/types'

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

describe('a language not yet turned on for translated titles (content/video-titles/on.json; the chief of staff, 15 Nov)', () => {
  const vids: Video[] = [
    { youtubeId: 'kept1', title: 'Heckel tank tour', durationSec: 60, lang: 'en' },
    { youtubeId: 'other', title: 'Discus care guide', durationSec: 60, lang: 'en' },
    { youtubeId: 'none1', title: 'Discus breeding', durationSec: 60, lang: 'en' },
    { youtubeId: 'vivi1', title: 'Nuôi cá đĩa', durationSec: 60, lang: 'vi' },
  ]
  const titles = { kept1: 'Tham quan bể cá đĩa Heckel', other: 'Hướng dẫn nuôi cá đĩa' }
  const kept = { kept1: 'passed at 9' }
  test('shows only the kept titles translated; every other foreign video keeps its own title, marked, and none is hidden', () => {
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: false, kept })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false],
      ['kept1', 'Tham quan bể cá đĩa Heckel', false],
      ['other', 'Discus care guide', true],
      ['none1', 'Discus breeding', true],
    ])
  })
  test('turned on, every stored title shows, and a foreign video with none is hidden as before', () => {
    const out = videosForPage(vids, 'vi', titles, {}, { requireTitle: true, on: true, kept })
    expect(out.map(v => [v.youtubeId, v.title, v.ownTitle ?? false])).toEqual([
      ['vivi1', 'Nuôi cá đĩa', false],
      ['kept1', 'Tham quan bể cá đĩa Heckel', false],
      ['other', 'Hướng dẫn nuôi cá đĩa', false],
    ])
  })
})
