import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'
import { loadAll, type Content } from '@aq/schema'
import { GALLERY_MIN } from '../src/lib/gallery'
import { renamedPages } from '../src/lib/renamed'
import { slow } from '@aq/schema/test-time'

type Pages = Parameters<typeof renamedPages>[0]

const CONTENT = fileURLToPath(new URL('../../../content', import.meta.url))

// Read once: every page of the real content, which takes a minute on a busy machine.
let c: Content
beforeAll(async () => { c = await loadAll({ root: CONTENT, lang: 'vi', publicBuild: false }) }, slow(300_000))

// The owner's naming of the two discus species (2026-11-07), in the real content as /redirects.json is built from it.
// Symphysodon aequifasciatus, the discus shops sell, took the plain name and address from Symphysodon discus.
test("the shop discus's old address 301s to /ca/ca-dia/; /ca/ca-dia/, now its page, redirects nowhere", () => {
  const page = (sci: string) => c.species.find(s => s.scientificName === sci)!.t
  expect(page('Symphysodon aequifasciatus')).toMatchObject({ name: 'Cá đĩa', slug: 'ca-dia' })
  expect(page('Symphysodon discus')).toMatchObject({ name: 'Cá đĩa Heckel', slug: 'ca-dia-heckel' })
  const table = renamedPages(c)
  expect(table['/ca/ca-dia-nau/']).toBe('/ca/ca-dia/?tu=ca-dia-nau')
  expect(table['/ca/ca-dia/']).toBeUndefined()
  expect(Object.entries(table).filter(([, to]) => to.startsWith('/ca/ca-dia-heckel/'))).toEqual([])
})

// The chief of staff, 2026-11-13 (page-folds.ts): the skunk cory's address under a tube worm's name forwards bare, nothing
// of the worm in the address the reader lands on; the molly article's, which had a name, with its note.
test("the tube worm's old address forwards bare to the skunk cory; the molly article's to the common molly with its note", () => {
  const table = renamedPages(c)
  expect(table['/ca/ca-ditrupa-arietina/']).toBe('/ca/ca-chuot-skunk/')
  expect(table['/ca/ca-molly-bryophila/']).toBe('/ca/ca-molly/?tu=ca-molly-bryophila')
})

// The owner's names of 2026-11-07: locked, old address 301s here, old name still finds the fish.
test.each([
  ['Crossocheilus langei', 'Cá bút chì', 'ca-but-chi', 'ca-rong-tao-xiem', 'Cá rong tảo Xiêm'],
  ['Crossocheilus atrilimes', 'Cá bút chì Thái', 'ca-but-chi-thai', 'ca-rong-reu-thai', 'Cá rong rêu Thái'],
  ['Nannostomus marginatus', 'Cá chì lùn', 'ca-chi-lun', 'ca-but-chi-lun', 'Cá bút chì lùn'],
  ['Nannostomus beckfordi', 'Cá chì vàng', 'ca-chi-vang', 'ca-chi-do', 'Cá bút chì vàng'],
  ['Beaufortia kweichowensis', 'Cá tỳ bà bướm', 'ca-ty-ba-buom', 'ca-bam-da-buom', 'Cá bám đá bướm'],
  ['Sewellia lineolata', 'Cá tỳ bà bướm hổ', 'ca-ty-ba-buom-ho', 'ca-bam-da-ho', 'Cá bám đá hổ'],
  ['Sinogastromyzon wui', 'Cá tỳ bà bướm wui', 'ca-ty-ba-buom-wui', 'ca-chach-suoi-sinogastromyzon-wui', 'Cá chạch suối Sinogastromyzon wui'],
  ['Jordanella floridae', 'Cá flagfish Florida', 'ca-flagfish-florida', 'ca-co-florida', 'Cá cờ Florida'],
  ['Macropodus opercularis', 'Cá cờ', 'ca-co', 'ca-thien-duong', 'Cá thiên đường'],
  ['Macropodus spechti', 'Cá cờ đen', 'ca-co-den', 'ca-thien-duong-den', 'Cá thiên đường đen'],
])('%s is %s, and its old address and name still lead to it', (sci, name, slug, oldSlug, oldName) => {
  const t = c.species.find(s => s.scientificName === sci)!.t
  expect(t).toMatchObject({ name, slug, nameFixed: true })
  expect(t.altNames).toContain(oldName)
  expect(renamedPages(c)[`/ca/${oldSlug}/`]).toBe(`/ca/${slug}/?tu=${oldSlug}`)
})

// The owner, 2026-11-08: "Cá cờ is right." The paradise fish took the name and the address from the flag cichlids.
test.each([
  ['Mesonauta festivus', 'Cá Mesonauta', 'ca-mesonauta', 'ca-co'],
  ['Mesonauta insignis', 'Cá Mesonauta insignis', 'ca-mesonauta-insignis', 'ca-co-mesonauta-insignis'],
  ['Mesonauta mirificus', 'Cá Mesonauta mirificus', 'ca-mesonauta-mirificus', 'ca-co-mesonauta-mirificus'],
  ['Laetacara curviceps', 'Cá Laetacara', 'ca-laetacara', 'ca-co-lun'],
])('%s gave up "cá cờ": now %s', (sci, name, slug, oldSlug) => {
  const t = c.species.find(s => s.scientificName === sci)!.t
  expect(t).toMatchObject({ name, slug, nameFixed: true })
  expect(t.altNames.filter(a => /^Cá cờ/.test(a))).toEqual([])
  // /ca/ca-co/ is the paradise fish's page now, so it leads there and nowhere else.
  expect(renamedPages(c)[`/ca/${oldSlug}/`]).toBe(oldSlug === 'ca-co' ? undefined : `/ca/${slug}/?tu=${oldSlug}`)
})

test('the paradise fish keeps its other names, and only it is called "Cá cờ"', () => {
  expect(c.species.find(s => s.scientificName === 'Macropodus opercularis')!.t.altNames).toEqual(expect.arrayContaining(['Cá thiên đường', 'Cá săn sắt']))
  expect(c.species.filter(s => s.t.name === 'Cá cờ' || s.t.altNames.includes('Cá cờ')).map(s => s.scientificName)).toEqual(['Macropodus opercularis'])
})

// The chief of staff, 2026-11-14: four fish pages went live at 03:26 under one run's names, and a kept batch renamed them
// at 03:45. Each first address leads to the page as it is named now, so a later rename (Corbicula's, on the way) keeps it.
test.each([
  ['amphilius-cryptobullatus', 'ca-amphilius-cryptobullatus'],
  ['amphilius-frieli', 'ca-da-tron-amphilius-frieli'],
  ['corbicula-fluminea', 'hen-nuoc-ngot'],
  ['nothobranchius-pienaari', 'ca-nothobranchius-pienaari'],
])('%s: its first address, /ca/%s/, is its page or leads to it', (id, first) => {
  const slug = c.species.find(s => s.id === id)!.t.slug
  // A later naming can give the page its first address back; then it is the page, and nothing forwards from it.
  expect(renamedPages(c)[`/ca/${first}/`]).toBe(slug === first ? undefined : `/ca/${slug}/?tu=${first}`)
})

test('the pencilfish guide took "cá chì" and its old address 301s to it', () => {
  const old = 'huong-dan-nuoi-ca-but-chi-nhom-ca-dan-song-o-tang-mat'
  expect(renamedPages(c)[`/huong-dan/${old}/`]).toBe(`/huong-dan/huong-dan-nuoi-ca-chi-nhom-ca-dan-song-o-tang-mat/?tu=${old}`)
})

test('an old address another page has taken since stays that page: it never redirects', () => {
  const t = (slug: string, redirectFrom?: { slug: string; name: string }[]) => ({ t: { slug, ...(redirectFrom ? { redirectFrom } : {}) } })
  const pages = { species: [t('ca-dia', [{ slug: 'ca-dia-nau', name: 'Cá đĩa nâu' }]), t('ca-dia-heckel', [{ slug: 'ca-dia', name: 'Cá đĩa' }])], breeds: [], plants: [], guides: [], galleries: {} }
  expect(renamedPages(pages as unknown as Pages)).toEqual({ '/ca/ca-dia-nau/': '/ca/ca-dia/?tu=ca-dia-nau' })
})

// Search Console, 2026-11-05: /ca/ca-tu-van-puntigrus/anh/ was a 404 when the fish's own old address redirected.
test('a renamed page with a photo page takes its old photo address with it; a page without one has none to redirect', () => {
  const page = (id: string, slug: string, old: string) => ({ id, t: { slug, redirectFrom: [{ slug: old, name: old }] } })
  const pages = { species: [page('a', 'ca-moi', 'ca-cu'), page('b', 'ca-it-anh', 'ca-it-anh-cu')], breeds: [], plants: [page('c', 'cay-moi', 'cay-cu')], guides: [], galleries: { a: Array(GALLERY_MIN).fill({}), b: Array(GALLERY_MIN - 1).fill({}), c: Array(GALLERY_MIN).fill({}) } }
  expect(renamedPages(pages as unknown as Pages)).toEqual({
    '/ca/ca-cu/': '/ca/ca-moi/?tu=ca-cu', '/ca/ca-cu/anh/': '/ca/ca-moi/anh/',
    '/ca/ca-it-anh-cu/': '/ca/ca-it-anh/?tu=ca-it-anh-cu',
    '/cay/cay-cu/': '/cay/cay-moi/?tu=cay-cu', '/cay/cay-cu/anh/': '/cay/cay-moi/anh/',
  })
  expect(renamedPages(c)['/ca/ca-tu-van-puntigrus/anh/']).toBe('/ca/ca-tu-van/anh/')
})
