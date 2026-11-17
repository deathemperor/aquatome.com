import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'
import { fitsCard, loadAll, stillShown, thumbOf, unmarked, type Content, type Photo } from '@aq/schema'
import { slow } from '@aq/schema/test-time'
import { guideImage, guideImages, seriesImage, titleNames, withOffCards, withVietnameseHeads } from '../src/lib/mentions'
import picks from '../src/lib/guide-heads-picks.json' with { type: 'json' }
import frames from '../src/lib/guide-frames.json' with { type: 'json' }

const CONTENT = fileURLToPath(new URL('../../../content', import.meta.url))
const LANGS = ['vi', 'id', 'th', 'ms'] as const

// Every guide of the real content in every served language, which takes a few minutes on a busy machine.
const all = {} as Record<(typeof LANGS)[number], Content>
beforeAll(async () => {
  for (const lang of LANGS) all[lang] = await loadAll({ root: CONTENT, lang, publicBuild: false })
  // As the site loads them (content.ts): each language's heads are chosen by the Vietnamese titles.
  for (const lang of LANGS) withVietnameseHeads(all[lang], all.vi)
  // And each card skips a photo the calendar keeps off cards.
  for (const lang of LANGS) withOffCards(all[lang], avoid)
}, slow(900_000))

const avoid = (JSON.parse(readFileSync(new URL('../../../content/curation.json', import.meta.url), 'utf8')) as { avoid?: Record<string, string> }).avoid ?? {}
/** A guide's own pictures, as its card reads them: its own photos and its video's stills that pass the stills' bar. */
const own = (g: Content['guides'][number]): string[] => [
  ...g.photos.filter(p => !p.generated).map(p => p.url),
  ...(g.video?.figures ?? []).flatMap(f => f.moments).filter(stillShown).map(m => m.url),
]
/** The stock photos the picture step found for a video guide's parts, which its card never shows. */
const parts = (g: Content['guides'][number]): string[] =>
  (g.video?.figures ?? []).flatMap(f => f.photo ?? []).filter(fitsCard).filter(p => !p.generated).map(p => p.url)
/** A page's photo a guide borrows: its head, or where the calendar holds that off cards, its next photo with no mark on it. */
const headOf = (photos: Photo[]): Photo | undefined => {
  const [head, ...rest] = photos
  return !head || head.generated ? undefined : Object.hasOwn(avoid, head.url) ? rest.find(p => !p.generated && unmarked(p) && !Object.hasOwn(avoid, p.url)) : head
}
/** What the Vietnamese title names, as this language's pages (a guide the Vietnamese doesn't have: its own title's). */
const named = (c: Content, g: Content['guides'][number]): Photo[] => {
  const vg = all.vi.guides.find(x => x.id === g.id)
  const pages = vg ? titleNames(all.vi, vg).map(x => [...c.species, ...c.plants, ...c.breeds].find(p => p.id === x.id && p.photos[0]?.url === x.photos[0]?.url)) : titleNames(c, g)
  return pages.flatMap(x => (x && headOf(x.photos)) ?? [])
}

// The owner's report, 15 Nov 2026: the discus guide opened on an oscar its text names in passing, as on 13 Nov a guppy guide
// on a water louse. A guide borrows only what its title names (the chief of staff, 15 Nov 2026). The ones that borrowed
// another fish before then Curation kept as picks or dropped (guide-heads-picks.json), and the drops went with the guide
// card's cover (16 Nov): no guide borrows otherwise.
test("every guide's head is its own photo, its video's, what its title names or its pick", () => {
  const left: string[] = []
  for (const lang of LANGS) for (const g of all[lang].guides) {
    const head = guideImage(all[lang], g)
    // A guide picked by hand is the next test's.
    if (!head || own(g).includes(head.url) || named(all[lang], g).includes(head) || g.id in picks || g.id in frames) continue
    left.push(`${lang} ${g.id}`)
  }
  expect(left).toEqual([])
}, slow(300_000))

// The chief of staff, 15 Nov 2026: a guide picturing the wrong animal shows no photo until its page is right, in no language.
test('a guide picked by hand shows only its own photos and its pick, the same in every language', () => {
  for (const lang of LANGS) for (const [id, pick] of Object.entries(picks as Record<string, string | null>)) {
    const g = all[lang].guides.find(x => x.id === id)
    if (!g) continue
    const head = guideImage(all[lang], g)
    if (own(g).length) { expect(head?.url, `${lang} ${id}`).toBe(own(g)[0]); continue }
    if (pick === null) { expect(head, `${lang} ${id}`).toBeUndefined(); continue }
    const [kind, page] = pick.split('/')
    const x = (kind === 'species' ? all[lang].species : kind === 'plant' ? all[lang].plants : all[lang].breeds).find(p => p.id === page)
    expect(head?.url, `${lang} ${id}`).toBe(x && headOf(x.photos)?.url)
  }
})

// The owner's report, 16 Nov 2026: a coffee-table tank's series opened on an office ceiling light, a stock photo the
// picture step found for one of its parts. A video guide picked by hand opens on its own video's still, its only picture, in
// every language it is in, credited to the channel; a pick naming a still the guide doesn't have, or one the stills' bar
// doesn't show (a person in it, soft, small), fails here, not quietly on the site. The stock photo taken off its part
// (the engine's refused list, which its runs read) stays off.
test("a video guide picked by hand opens on its own video's still at that second, and on nothing else, in every language", () => {
  const refused = JSON.parse(readFileSync(new URL('../../../engine-state/_photo-rejected.json', import.meta.url), 'utf8')) as Record<string, string>
  for (const [id, t] of Object.entries(frames as Record<string, number>)) {
    const langs = LANGS.filter(lang => all[lang].guides.some(x => x.id === id))
    expect(langs, id).toContain('vi')
    for (const lang of langs) {
      const g = all[lang].guides.find(x => x.id === id)!
      const still = (g.video?.figures ?? []).flatMap(f => f.moments).find(m => m.t === t)
      expect(still, `${lang} ${id} has a still at ${t} s`).toBeDefined()
      expect(stillShown(still!), `${lang} ${id}: the still at ${t} s passes the stills' bar`).toBe(true)
      expect(guideImages(all[lang], g), `${lang} ${id}`).toEqual([expect.objectContaining({ url: still!.url, thumb: thumbOf(still!.url), licence: 'YouTube', author: g.video!.channel, source: 'youtube' })])
      expect((g.video?.figures ?? []).flatMap(f => f.photo ? [f.photo.url] : []).filter(u => u in refused), `${lang} ${id}: a refused photo on a part`).toEqual([])
    }
  }
})

// The owner's report, 16 Nov 2026 (above), and the chief of staff's rule that day: a video guide's card is its first still
// that passes the stills' bar, else the fish or plant its title names, and never the stock photo the picture step found for
// one of its parts (that day's count: most show no fish and no plant). One with neither takes a card's own look.
test("a video guide's card is its first still, else what its title names, and never a part's stock photo", () => {
  for (const lang of LANGS) for (const g of all[lang].guides) {
    if (!g.video || g.id in frames) continue
    const pics = guideImages(all[lang], g).map(p => p.url), stills = own(g)
    if (stills.length) expect(pics[0], `${lang} ${g.id}`).toBe(stills[0])
    expect(pics.filter(u => parts(g).includes(u) && !stills.includes(u)), `${lang} ${g.id}`).toEqual([])
  }
})

// The chief of staff, 16 Nov 2026: a face that stands for more than one fish never takes a head the calendar keeps off
// cards (content/curation.json `avoid`), and a guide's card stands for more than one. The photo stays on its own page.
test("a guide card never shows a photo the calendar keeps off cards, and a borrowed head held off cards gives way to its page's next photo", () => {
  for (const lang of LANGS) for (const g of all[lang].guides)
    expect(guideImages(all[lang], g).map(p => p.url).filter(u => Object.hasOwn(avoid, u)), `${lang} ${g.id}`).toEqual([])
  const g = all.vi.guides.find(x => !x.video && !own(x).length && guideImage(all.vi, x))!
  const head = guideImage(all.vi, g)!.url
  const held = withOffCards({ ...all.vi }, { [head]: 'a test' })
  expect(guideImages(held, g).map(p => p.url)).not.toContain(head)
  expect(guideImages(all.vi, g).map(p => p.url)).toContain(head)
}, slow(300_000))

// The chief of staff, 16 Nov 2026: a series' card is its first part that has a picture, so a series whose first part has
// none still shows one; none only where no part has a picture.
test("a series' card is its first part that has a picture", () => {
  for (const lang of LANGS) for (const s of all[lang].series) {
    const parts = all[lang].guides.filter(g => g.video?.series?.id === s.id).sort((a, b) => a.video!.series!.position - b.video!.series!.position)
    const first = parts.find(g => guideImage(all[lang], g))
    expect(seriesImage(all[lang], parts)?.url, `${lang} ${s.id}`).toBe(first && guideImage(all[lang], first)?.url)
  }
}, slow(300_000))

// The chief of staff, 15 Nov 2026: a guide's head is chosen once and shows in every language, so the languages can't
// disagree. A language without the page the Vietnamese borrows shows none rather than another.
test('a guide shows the same head in every language as in Vietnamese, or none where the language lacks its page', () => {
  const vi = new Map(all.vi.guides.map(g => [g.id, guideImage(all.vi, g)?.url]))
  const differ: string[] = []
  for (const lang of LANGS) for (const g of all[lang].guides) {
    const head = guideImage(all[lang], g)?.url
    if (vi.has(g.id) && head !== undefined && head !== vi.get(g.id)) differ.push(`${lang} ${g.id}`)
  }
  expect(differ).toEqual([])
}, slow(300_000))

test("the discus guide opens on the discus, and the flowerhorn guide on the flowerhorn breed, in every language", () => {
  for (const lang of LANGS) {
    const c = all[lang]
    const head = (prefix: string) => { const g = c.guides.find(g => g.id.startsWith(prefix)); return g && { g, head: guideImage(c, g) } }
    const discus = head('aquatome-ca-di-phan-trang-')
    if (discus) expect(discus.head?.url, lang).toBe(own(discus.g)[0] ?? headOf(c.species.find(s => s.id === 'symphysodon-aequifasciatus')!.photos)?.url)
    const laHan = head('aquatome-nuoi-ca-la-han-')
    // The flowerhorn breed's head is held off cards (its head outside a card's crop): the guide shows the breed's next photo.
    if (laHan) expect(laHan.head?.url, lang).toBe(own(laHan.g)[0] ?? headOf(c.breeds.find(b => b.id === 'flowerhorn-cichlid')!.photos)?.url)
  }
}, slow(300_000))
