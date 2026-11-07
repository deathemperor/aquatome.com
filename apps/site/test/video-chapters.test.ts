import { expect, test } from 'vitest'
import type { GuideEntity } from '@aq/schema'
import { guideChapters } from '../src/lib/video'

type Video = NonNullable<GuideEntity['video']>
const video = (chapters: [number, string][], durationSec = 600) => ({ youtubeId: 'x', title: 'X', channel: 'C', channelUrl: 'https://youtube.com/@c', durationSec, chapters: chapters.map(([start, title]) => ({ start, title })) }) as unknown as Video

// A creator's first chapter that only lists the others ("Chapters cuz uncle MJ cares about your time", in the guide
// "Mục lục video") was the first of 18 items a phone met before the guide's first paragraph (design critique, 2026-11-06).
test('a guide\'s chapters leave out a first chapter that only lists the others, in the creator\'s words or the guide\'s', () => {
  const v = video([[0, 'Chapters cuz uncle MJ cares about your time'], [48, 'Past experiences'], [134, 'The One Thing']])
  expect(guideChapters(v)).toEqual([{ start: 48, end: 134, title: 'Past experiences' }, { start: 134, end: 600, title: 'The One Thing' }])
  expect(guideChapters(v, ['Mục lục video', 'Kinh nghiệm những năm đầu', 'Thay đổi tạo khác biệt']).map(c => c.title)).toEqual(['Kinh nghiệm những năm đầu', 'Thay đổi tạo khác biệt'])
  // Only as the first chapter, at 0: an intro stays, and so does a later chapter named so.
  expect(guideChapters(video([[0, 'Intro'], [31, 'Water changes']])).map(c => c.start)).toEqual([0, 31])
  expect(guideChapters(video([[0, 'Intro'], [31, 'Chapters of a tank\'s life']])).map(c => c.start)).toEqual([0, 31])
  // The guide's titles only when it has one per chapter; else the creator's.
  expect(guideChapters(video([[0, 'Intro'], [31, 'Water changes']]), ['Mở đầu']).map(c => c.title)).toEqual(['Intro', 'Water changes'])
})
