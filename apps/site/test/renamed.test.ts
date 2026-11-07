import { fileURLToPath } from 'node:url'
import { beforeAll, expect, test } from 'vitest'
import { loadAll, type Content } from '@aq/schema'
import { renamedPages } from '../src/lib/renamed'

const CONTENT = fileURLToPath(new URL('../../../content', import.meta.url))

// Read once: every page of the real content, which takes a minute on a busy machine.
let c: Content
beforeAll(async () => { c = await loadAll({ root: CONTENT, lang: 'vi', publicBuild: false }) }, 300_000)

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
])('%s is %s, and its old address and name still lead to it', (sci, name, slug, oldSlug, oldName) => {
  const t = c.species.find(s => s.scientificName === sci)!.t
  expect(t).toMatchObject({ name, slug, nameFixed: true })
  expect(t.altNames).toContain(oldName)
  expect(renamedPages(c)[`/ca/${oldSlug}/`]).toBe(`/ca/${slug}/?tu=${oldSlug}`)
})

test('the pencilfish guide took "cá chì" and its old address 301s to it', () => {
  const old = 'huong-dan-nuoi-ca-but-chi-nhom-ca-dan-song-o-tang-mat'
  expect(renamedPages(c)[`/huong-dan/${old}/`]).toBe(`/huong-dan/huong-dan-nuoi-ca-chi-nhom-ca-dan-song-o-tang-mat/?tu=${old}`)
})

test('an old address another page has taken since stays that page: it never redirects', () => {
  const t = (slug: string, redirectFrom?: { slug: string; name: string }[]) => ({ t: { slug, ...(redirectFrom ? { redirectFrom } : {}) } })
  const pages = { species: [t('ca-dia', [{ slug: 'ca-dia-nau', name: 'Cá đĩa nâu' }]), t('ca-dia-heckel', [{ slug: 'ca-dia', name: 'Cá đĩa' }])], breeds: [], plants: [], guides: [] }
  expect(renamedPages(pages as unknown as Pick<Content, 'species' | 'breeds' | 'plants' | 'guides'>)).toEqual({ '/ca/ca-dia-nau/': '/ca/ca-dia/?tu=ca-dia-nau' })
})
