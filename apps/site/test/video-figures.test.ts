import { expect, test } from 'vitest'
import { parse } from 'node-html-parser'
import { illustrate } from '../src/lib/video'

const video = (moments: { t: number; url: string; width: number; height: number; caption: string; sharpness?: number }[]) => ({
  youtubeId: 'P7GTfHdl5E8', title: 'Scape', channel: 'S', channelUrl: 'https://x', durationSec: 539, chapters: [], figures: [{ heading: 'Keo', moments }],
})

test("a still that is the video's own frame offers its 480 px copy, sized to the stills' grid; a 480p frame is drawn as it is", () => {
  const html = illustrate('vi', '<h3>Keo</h3><p>Dán lũa.</p>', video([
    { t: 163, url: 'https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd.webp', width: 1200, height: 675, caption: 'Nghiền phân nền.', sharpness: 400 },
    { t: 173, url: 'https://media.aquatome.com/video/P7GTfHdl5E8/at173-hd.webp', width: 480, height: 480, caption: 'Nhỏ keo.', sharpness: 400 },
  ]))
  const [sharp, small] = parse(html).querySelectorAll('button.moment img')
  expect(sharp!.getAttribute('src')).toBe('https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd.webp')
  expect(sharp!.getAttribute('srcset')).toBe('https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd-480.webp 480w, https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd.webp 1200w')
  expect(sharp!.getAttribute('sizes')).toBe('(max-width: 411px) calc(100vw - 3rem), (max-width: 599px) calc(50vw - 1.875rem), 14rem')
  expect([sharp!.getAttribute('width'), sharp!.getAttribute('height')]).toEqual(['1200', '675'])
  // Its "-480" copy is the frame itself: no srcset to claim otherwise.
  expect(small!.getAttribute('srcset')).toBeUndefined()
  expect(small!.getAttribute('sizes')).toBeUndefined()
})

test('no still under 480p is shown: a storyboard tile or a low-resolution frame leaves the section its words', () => {
  // The owner's report (2026-11-09): two 160×90 tiles drawn across a phone were unreadable smudges.
  const html = illustrate('vi', '<h3>Keo</h3><p>Dán lũa.</p>', video([
    { t: 163, url: 'https://media.aquatome.com/video/DZ0JTLYiawU/at163.webp', width: 160, height: 90, caption: 'Bể nhỏ nền đất đen.' },
    { t: 168, url: 'https://media.aquatome.com/video/DZ0JTLYiawU/at168.webp', width: 320, height: 180, caption: 'Cá bơi sát mặt nước.' },
    { t: 170, url: 'https://media.aquatome.com/video/DZ0JTLYiawU/at170-hd.webp', width: 640, height: 360, caption: 'Một video 360p.', sharpness: 400 },
  ]))
  const root = parse(html)
  expect(root.querySelector('.moments')).toBeNull()
  expect(root.querySelector('.vfigs')).toBeNull()
  expect(root.querySelector('p')!.textContent).toBe('Dán lũa.')
  // With one 480p still among them, only that one shows.
  const one = parse(illustrate('vi', '<h3>Keo</h3><p>Dán lũa.</p>', video([
    { t: 163, url: 'https://media.aquatome.com/video/DZ0JTLYiawU/at163.webp', width: 160, height: 90, caption: 'Tile.' },
    { t: 170, url: 'https://media.aquatome.com/video/DZ0JTLYiawU/at170-hd.webp', width: 854, height: 480, caption: 'Một video 480p.', sharpness: 400 },
  ])))
  expect(one.querySelectorAll('button.moment').map(b => b.getAttribute('data-t'))).toEqual(['170'])
})

test('no blurry still is shown: under the sharpness bar, or not yet measured, it leaves the section its words', () => {
  const still = (t: number, sharpness?: number) => ({ t, url: `https://media.aquatome.com/video/x/at${t}-hd.webp`, width: 1200, height: 675, caption: `Cảnh ${t}.`, ...(sharpness === undefined ? {} : { sharpness }) })
  const root = parse(illustrate('vi', '<h3>Keo</h3><p>Dán lũa.</p>', video([still(10, 11.9), still(20), still(30, 12)])))
  expect(root.querySelectorAll('button.moment').map(b => b.getAttribute('data-t'))).toEqual(['30'])
  const none = parse(illustrate('vi', '<h3>Keo</h3><p>Dán lũa.</p>', video([still(10, 4), still(20)])))
  expect(none.querySelector('.vfigs')).toBeNull()
  expect(none.querySelector('p')!.textContent).toBe('Dán lũa.')
})
