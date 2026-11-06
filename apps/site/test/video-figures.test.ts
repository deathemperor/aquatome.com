import { expect, test } from 'vitest'
import { parse } from 'node-html-parser'
import { illustrate } from '../src/lib/video'

const video = (moments: { t: number; url: string; width: number; height: number; caption: string }[]) => ({
  youtubeId: 'P7GTfHdl5E8', title: 'Scape', channel: 'S', channelUrl: 'https://x', durationSec: 539, chapters: [], figures: [{ heading: 'Keo', moments }],
})

test("a still that is the video's own frame offers its 480 px copy, sized to the stills' grid; a storyboard tile is drawn as it is", () => {
  const html = illustrate('vi', '<h3>Keo</h3><p>Dán lũa.</p>', video([
    { t: 163, url: 'https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd.webp', width: 1200, height: 675, caption: 'Nghiền phân nền.' },
    { t: 173, url: 'https://media.aquatome.com/video/P7GTfHdl5E8/t173.webp', width: 320, height: 180, caption: 'Nhỏ keo.' },
  ]))
  const [sharp, tile] = parse(html).querySelectorAll('button.moment img')
  expect(sharp!.getAttribute('src')).toBe('https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd.webp')
  expect(sharp!.getAttribute('srcset')).toBe('https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd-480.webp 480w, https://media.aquatome.com/video/P7GTfHdl5E8/t163-hd.webp 1200w')
  expect(sharp!.getAttribute('sizes')).toBe('(max-width: 411px) calc(100vw - 3rem), (max-width: 599px) calc(50vw - 1.875rem), 14rem')
  expect([sharp!.getAttribute('width'), sharp!.getAttribute('height')]).toEqual(['1200', '675'])
  // Its "-480" copy is the 320 px tile itself: no srcset to claim otherwise.
  expect(tile!.getAttribute('srcset')).toBeUndefined()
  expect(tile!.getAttribute('sizes')).toBeUndefined()
})
