import { expect, test } from 'vitest'
import { getContent } from '../src/lib/content'
import { speciesParts } from '../src/lib/species-page'
import { spokenIn, videoAbout } from '../src/lib/video-about'

// The engine labels a video YouTube gives no spoken language as English, so a Vietnamese shop's clip came labelled "en"
// and showed its Vietnamese title on the Indonesian rainbowfish page (/id/ikan/rainbow-rubrostriata/, the live checks of
// 21 Nov 2026; 11 such videos on 7 fish pages that day). A video whose own title is Vietnamese is a Vietnamese video:
// other languages' pages leave it out, and the Vietnamese page names its language as Vietnamese.
const viClip = { youtubeId: '71fo8CAdTp8', title: 'Cá cầu vồng, Rainbowfish Melanotaenia Rubrostriata Remauke and Timika', durationSec: 28, lang: 'en' }
const enClip = { youtubeId: 'aaaaaaaaaaa', title: 'Melanotaenia rubrostriata breeding', durationSec: 300, lang: 'en' }

test('a video titled in Vietnamese is spoken in Vietnamese, whatever its label; its translated title changes nothing', () => {
  expect(spokenIn(viClip)).toBe('vi')
  expect(spokenIn({ ...viClip, title: 'Ikan pelangi', originalTitle: viClip.title })).toBe('vi')
  expect(spokenIn(enClip)).toBe('en')
  expect(spokenIn({ ...enClip, lang: 'id' })).toBe('id')
  const t = (s: string) => s
  expect(videoAbout(viClip, 'vi', t)).toBe(videoAbout({ ...viClip, lang: 'vi' }, 'vi', t))
})

test("other languages' fish pages leave out a video titled in Vietnamese, and the Vietnamese page keeps it", async () => {
  // The fixture's one fish with another language's copy: the dwarf cichlid's Malay page.
  for (const lang of ['ms', 'vi'] as const) {
    const c = await getContent(lang)
    const s0 = c.species.find(x => x.id === 'apistogramma-cacatuoides')
    expect(s0, lang).toBeDefined()
    const p = await speciesParts(lang, c, { ...s0!, videos: [viClip, enClip] })
    expect(p.videos.map(v => v.youtubeId), lang).toEqual(lang === 'vi' ? [viClip.youtubeId, enClip.youtubeId] : [enClip.youtubeId])
  }
}, 120_000)
