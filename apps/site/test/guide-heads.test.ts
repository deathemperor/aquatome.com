import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'
import { fitsCard, loadAll, type Content, type Photo } from '@aq/schema'
import { slow } from '@aq/schema/test-time'
import { guideImage, titleNames, withVietnameseHeads } from '../src/lib/mentions'
import picks from '../src/lib/guide-heads-picks.json' with { type: 'json' }

const CONTENT = fileURLToPath(new URL('../../../content', import.meta.url))
const LANGS = ['vi', 'id', 'th', 'ms'] as const

// Every guide of the real content in every served language, which takes a few minutes on a busy machine.
const all = {} as Record<(typeof LANGS)[number], Content>
beforeAll(async () => {
  for (const lang of LANGS) all[lang] = await loadAll({ root: CONTENT, lang, publicBuild: false })
  // As the site loads them (content.ts): each language's heads are chosen by the Vietnamese titles.
  for (const lang of LANGS) withVietnameseHeads(all[lang], all.vi)
}, slow(900_000))

const own = (g: Content['guides'][number]): Photo[] =>
  [...g.photos, ...(g.video?.figures ?? []).flatMap(f => f.photo ?? []).filter(fitsCard)].filter(p => !p.generated)
/** What the Vietnamese title names, as this language's pages (a guide the Vietnamese doesn't have: its own title's). */
const named = (c: Content, g: Content['guides'][number]): Photo[] => {
  const vg = all.vi.guides.find(x => x.id === g.id)
  const pages = vg ? titleNames(all.vi, vg).map(x => [...c.species, ...c.plants, ...c.breeds].find(p => p.id === x.id && p.photos[0]?.url === x.photos[0]?.url)) : titleNames(c, g)
  return pages.flatMap(x => x?.photos[0] ?? []).filter(p => !p.generated)
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
    if (!head || own(g).includes(head) || named(all[lang], g).includes(head) || g.id in picks) continue
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
    if (own(g).length) { expect(head, `${lang} ${id}`).toBe(own(g)[0]); continue }
    if (pick === null) { expect(head, `${lang} ${id}`).toBeUndefined(); continue }
    const [kind, page] = pick.split('/')
    const x = (kind === 'species' ? all[lang].species : kind === 'plant' ? all[lang].plants : all[lang].breeds).find(p => p.id === page)
    expect(head?.url, `${lang} ${id}`).toBe(x?.photos.find(p => !p.generated)?.url)
  }
})

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
    if (discus) expect(discus.head?.url, lang).toBe(own(discus.g)[0]?.url ?? c.species.find(s => s.id === 'symphysodon-aequifasciatus')!.photos[0]!.url)
    const laHan = head('aquatome-nuoi-ca-la-han-')
    if (laHan) expect(laHan.head?.url, lang).toBe(own(laHan.g)[0]?.url ?? c.breeds.find(b => b.id === 'flowerhorn-cichlid')!.photos[0]!.url)
  }
}, slow(300_000))
