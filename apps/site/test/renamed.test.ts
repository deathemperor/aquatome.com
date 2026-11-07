import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll, type Content } from '@aq/schema'
import { renamedPages } from '../src/lib/renamed'

const CONTENT = fileURLToPath(new URL('../../../content', import.meta.url))

// The owner's naming of the two discus species (2026-11-07), in the real content as /redirects.json is built from it.
// Symphysodon aequifasciatus, the discus shops sell, took the plain name and address from Symphysodon discus.
test("the shop discus's old address 301s to /ca/ca-dia/; /ca/ca-dia/, now its page, redirects nowhere", async () => {
  const c = await loadAll({ root: CONTENT, lang: 'vi', publicBuild: false })
  const page = (sci: string) => c.species.find(s => s.scientificName === sci)!.t
  expect(page('Symphysodon aequifasciatus')).toMatchObject({ name: 'Cá đĩa', slug: 'ca-dia' })
  expect(page('Symphysodon discus')).toMatchObject({ name: 'Cá đĩa Heckel', slug: 'ca-dia-heckel' })
  const table = renamedPages(c)
  expect(table['/ca/ca-dia-nau/']).toBe('/ca/ca-dia/?tu=ca-dia-nau')
  expect(table['/ca/ca-dia/']).toBeUndefined()
  expect(Object.entries(table).filter(([, to]) => to.startsWith('/ca/ca-dia-heckel/'))).toEqual([])
}, 60_000)

test('an old address another page has taken since stays that page: it never redirects', () => {
  const t = (slug: string, redirectFrom?: { slug: string; name: string }[]) => ({ t: { slug, ...(redirectFrom ? { redirectFrom } : {}) } })
  const c = { species: [t('ca-dia', [{ slug: 'ca-dia-nau', name: 'Cá đĩa nâu' }]), t('ca-dia-heckel', [{ slug: 'ca-dia', name: 'Cá đĩa' }])], breeds: [], plants: [] }
  expect(renamedPages(c as unknown as Pick<Content, 'species' | 'breeds' | 'plants'>)).toEqual({ '/ca/ca-dia-nau/': '/ca/ca-dia/?tu=ca-dia-nau' })
})
