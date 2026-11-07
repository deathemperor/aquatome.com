import { expect, test } from 'vitest'
import type { Content, Photo } from '@aq/schema'
import { videoDoc } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { pagePictures } from '../src/lib/pictures'
import { seriesParts } from '../src/lib/series-page'

// Two videos of one series often take the same Commons photo for a section (each in its own folder, the same picture by
// its hash): the series page showed it on both cards (aquatome.com #688, /video/bao-duong-be-ca-co-ban-cho-nguoi-moi/,
// page check "repeat"). Each card takes the first of its guide's pictures the page doesn't show yet.
test('a video series\' cards show no picture twice, the same photo in two files included; the app\'s copy the same', async () => {
  const c0 = await getContent('vi')
  const g0 = c0.guides.find(g => g.video?.series?.id === 'PLtest')!
  const s = c0.series.find(x => x.id === 'PLtest')!
  const photo = (dir: string): Photo => ({ url: `https://media.aquatome.com/video/${dir}/p0-x.webp`, thumb: `https://media.aquatome.com/video/${dir}/p0-x-480.webp`, width: 960, height: 720, licence: 'CC BY-SA 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg' } as Photo)
  const second = (pos: number, dir: string, extra: Photo[] = []) => ({
    ...g0, id: `${g0.id}-${dir}`, photos: [], t: { ...g0.t, slug: `${g0.t.slug}-${dir}` },
    video: { ...g0.video!, youtubeId: dir, series: { id: 'PLtest', position: pos }, figures: [{ heading: 'H', moments: [], photo: photo(dir) }, ...extra.map(p => ({ heading: 'K', moments: [], photo: p }))] },
  })
  const other = { ...photo('cc'), url: 'https://media.aquatome.com/video/cc/p1-y.webp', thumb: 'https://media.aquatome.com/video/cc/p1-y-480.webp' }
  const guides = [second(10, 'aa'), second(11, 'bb', [other])]
  const c = { ...c0, guides: [...c0.guides.filter(g => g.video?.series?.id !== 'PLtest'), ...guides], pictureHashes: { ...c0.pictureHashes, [photo('aa').url]: 'f0f0f0f0f0f0f0f0', [photo('bb').url]: 'f0f0f0f0f0f0f0f0' } } as Content

  const p = seriesParts('vi', c, s)
  expect(p.guides.map(x => x.photo?.url)).toEqual([photo('aa').url, other.url])
  const seen = pagePictures(c)
  for (const x of p.guides) if (x.photo) { expect(seen.has(x.photo.url), x.photo.url).toBe(false); seen.add(x.photo.url) }
  // The app's copy reads the same cards.
  const cards = videoDoc('vi', c, s).blocks.find(b => b.t === 'cards')
  expect(cards?.t === 'cards' && cards.items.map(i => i.img?.src)).toEqual(p.guides.map(x => x.photo && x.photo.thumb))
})
