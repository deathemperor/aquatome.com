import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'
import { fitsCard, loadAll, type Content, type Photo } from '@aq/schema'
import { slow } from '@aq/schema/test-time'
import { guideImage, titleNames } from '../src/lib/mentions'
import awaiting from '../src/lib/guide-heads-awaiting.json' with { type: 'json' }
import none from '../src/lib/guide-heads-none.json' with { type: 'json' }

const CONTENT = fileURLToPath(new URL('../../../content', import.meta.url))
const LANGS = ['vi', 'id', 'th', 'ms'] as const

// Every guide of the real content in every served language, which takes a few minutes on a busy machine.
const all = {} as Record<(typeof LANGS)[number], Content>
beforeAll(async () => { for (const lang of LANGS) all[lang] = await loadAll({ root: CONTENT, lang, publicBuild: false }) }, slow(900_000))

const own = (g: Content['guides'][number]): Photo[] =>
  [...g.photos, ...(g.video?.figures ?? []).flatMap(f => f.photo ?? []).filter(fitsCard)].filter(p => !p.generated)
const named = (c: Content, g: Content['guides'][number]): Photo[] => titleNames(c, g).flatMap(x => x.photos[0] ?? []).filter(p => !p.generated)

// The owner's report, 15 Nov 2026: the discus guide opened on an oscar its text names in passing, as on 13 Nov a guppy guide
// on a water louse. A guide borrows only what its title names (the chief of staff, 15 Nov 2026). The ones that borrowed
// another fish before then keep it until Curation keeps or drops each (Mon 16 Nov), and the list only shrinks.
test("every guide's head is its own photo, its video's, or what its title names; only the waiting list borrows otherwise", () => {
  const left: string[] = []
  for (const lang of LANGS) for (const g of all[lang].guides) {
    const head = guideImage(all[lang], g)
    if (!head || own(g).includes(head) || named(all[lang], g).includes(head)) continue
    if (!awaiting.includes(g.id)) left.push(`${lang} ${g.id}`)
  }
  expect(left).toEqual([])
}, slow(300_000))

// The chief of staff, 15 Nov 2026: a guide picturing the wrong animal shows no photo until its page is right, in no language.
test('a guide on the borrow-nothing list shows only its own photos, in every language', () => {
  for (const lang of LANGS) for (const id of none) {
    const g = all[lang].guides.find(x => x.id === id)
    if (!g) continue
    const head = guideImage(all[lang], g)
    expect(head === undefined || own(g).includes(head), `${lang} ${id}`).toBe(true)
  }
})

// A listed guide that has since got its own photo, or a title name, is simply passed by: the engine's pushes can't break this.
test('the waiting list only shrinks', () => {
  expect(awaiting.length).toBeLessThanOrEqual(149)
  expect(new Set(awaiting).size).toBe(awaiting.length)
})

test("the discus guide opens on the discus, and the flowerhorn guide on the flowerhorn breed, not on fish their text names", () => {
  const vi = all.vi
  const head = (prefix: string) => { const g = vi.guides.find(g => g.id.startsWith(prefix))!; return { g, head: guideImage(vi, g) } }
  const discus = head('aquatome-ca-di-phan-trang-')
  expect(discus.head?.url).toBe(own(discus.g)[0]?.url ?? vi.species.find(s => s.id === 'symphysodon-aequifasciatus')!.photos[0]!.url)
  const laHan = head('aquatome-nuoi-ca-la-han-')
  expect(laHan.head?.url).toBe(own(laHan.g)[0]?.url ?? vi.breeds.find(b => b.id === 'flowerhorn-cichlid')!.photos[0]!.url)
}, slow(300_000))
