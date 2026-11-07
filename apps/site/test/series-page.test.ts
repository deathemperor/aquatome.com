import { PictureSet } from '@aq/schema'
import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { guideImage } from '../src/lib/mentions'
import { seriesParts } from '../src/lib/series-page'
import { seriesGuides } from '../src/lib/video'

// 2026-11-07, the check on aquatome.com (/video/bao-duong-be-ca-co-ban-cho-nguoi-moi/, "repeat"): two videos of a series
// illustrated a section with the same Commons photo of a sponge filter, and the page showed it on both cards. A series'
// cards are chosen once for the page, in order, none twice: a guide whose picture an earlier card shows takes its next
// one, else none.
test("a series page's cards show no picture twice", async () => {
  const c = await getContent('vi')
  const s = c.series.find(x => seriesGuides(c, x).some(g => guideImage(c, g)))!
  const g = seriesGuides(c, s).find(x => guideImage(c, x))!
  const twin = { ...g, id: `${g.id}-twin`, t: { ...g.t, slug: `${g.t.slug}-twin` }, video: { ...g.video, series: { id: s.id, position: g.video.series!.position + 100 } } }
  const both = { ...c, guides: [...c.guides, twin] }
  const photos = seriesParts('vi', both, s).guides.map(x => x.photo)
  expect(photos.filter(Boolean).length).toBeGreaterThan(0)
  const pics = new PictureSet(c.pictureHashes)
  for (const p of photos.filter(p => !!p)) {
    expect(pics.has(p.url), p.url).toBe(false)
    pics.add(p.url)
  }
})
