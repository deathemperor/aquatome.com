import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Content, Localized, SpeciesEntity } from '@aq/schema'
import { expect, test } from 'vitest'
import { bareForwards } from '../src/lib/bare'
import type { Lang } from '../src/lib/i18n'

const fish = (id: string, [order, family, genus]: [string, string, string], slug: string, redirectFrom?: { slug: string; name: string }[]) =>
  ({ id, order, family, genus, t: { slug, ...(redirectFrom ? { redirectFrom } : {}) } }) as unknown as Localized<SpeciesEntity>
const album = (id: string, n: number) => Array.from({ length: n }, (_, i) => ({ url: `/media/species/${id}/${i}.jpg` }))

test('a bare fish page forwards to its genus page, else the fish list, with its photo page and old addresses; a taxon page left empty goes up a rank', async () => {
  const kept = [fish('corydoras-paleatus', ['Siluriformes', 'Callichthyidae', 'Corydoras'], 'ca-chuot-tieu'), fish('xiphophorus-maculatus', ['Cyprinodontiformes', 'Poeciliidae', 'Xiphophorus'], 'ca-platy')]
  const bare = [
    // Another fish keeps its genus's page.
    fish('corydoras-ellisae', ['Siluriformes', 'Callichthyidae', 'Corydoras'], 'ca-chuot-ellis', [{ slug: 'ca-chuot-ellis-cu', name: 'Cá chuột Ellis' }]),
    // Alone in its genus, its family kept by another fish: the genus page goes to the family's.
    fish('poecilia-mexicana', ['Cyprinodontiformes', 'Poeciliidae', 'Poecilia'], 'ca-molly-mexico'),
    // Alone in its order: genus, family and order pages all go to the taxonomy's first page.
    fish('pipa-parva', ['Anura', 'Pipidae', 'Pipa'], 'coc-suriname-lun'),
  ]
  const content = { species: kept, galleries: { 'poecilia-mexicana': album('poecilia-mexicana', 6), 'pipa-parva': album('pipa-parva', 5) }, pictureHashes: {} } as unknown as Content
  const only = (langs: Lang[]) => async (lang: Lang) => (langs.includes(lang) ? bare : [])
  const out = await bareForwards(async () => content, only(['vi', 'th']))
  expect(out).toEqual({
    '/ca/ca-chuot-ellis/': '/phan-loai/siluriformes/callichthyidae/corydoras/',
    '/ca/ca-chuot-ellis-cu/': '/phan-loai/siluriformes/callichthyidae/corydoras/',
    '/ca/ca-molly-mexico/': '/ca/',
    // Six photos make a photo page (lib/photo-page.ts); five don't.
    '/ca/ca-molly-mexico/anh/': '/ca/',
    '/phan-loai/cyprinodontiformes/poeciliidae/poecilia/': '/phan-loai/cyprinodontiformes/poeciliidae/',
    '/ca/coc-suriname-lun/': '/ca/',
    '/phan-loai/anura/': '/phan-loai/',
    '/phan-loai/anura/pipidae/': '/phan-loai/',
    '/phan-loai/anura/pipidae/pipa/': '/phan-loai/',
    '/th/fish/ca-chuot-ellis/': '/th/taxonomy/siluriformes/callichthyidae/corydoras/',
    '/th/fish/ca-chuot-ellis-cu/': '/th/taxonomy/siluriformes/callichthyidae/corydoras/',
    '/th/fish/ca-molly-mexico/': '/th/fish/',
    '/th/fish/ca-molly-mexico/photos/': '/th/fish/',
    '/th/taxonomy/cyprinodontiformes/poeciliidae/poecilia/': '/th/taxonomy/cyprinodontiformes/poeciliidae/',
    '/th/fish/coc-suriname-lun/': '/th/fish/',
    '/th/taxonomy/anura/': '/th/taxonomy/',
    '/th/taxonomy/anura/pipidae/': '/th/taxonomy/',
    '/th/taxonomy/anura/pipidae/pipa/': '/th/taxonomy/',
  })
})

// The site's own content with the angelfish made bare: no care topic in its text (its breeding part gone) and nothing on
// its card. It leaves the fish list, the group and taxon lists, the sitemap and the app's index, and its address forwards.
test('a bare fish page is left out of every list, the sitemap and the app index, and its addresses forward', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-bare-'))
  await cp(fileURLToPath(new URL('./fixture-content', import.meta.url)), dir, { recursive: true })
  const id = 'pterophyllum-scalare'
  const file = join(dir, 'species', id, 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8')) as { sections: { key: string }[] }
  await writeFile(file, JSON.stringify({ ...e, sections: e.sections.filter(s => s.key !== 'reproduction'), dataCard: {} }))
  const was = process.env.CONTENT_ROOT
  process.env.CONTENT_ROOT = dir
  try {
    const { getBare, getContent } = await import('../src/lib/content')
    const { fishList, speciesLists } = await import('../src/lib/list-data')
    const { sitemapEntries } = await import('../src/lib/sitemap')
    const { appIndex } = await import('../src/lib/app-index')
    const c = await getContent('vi')
    expect((await getBare('vi')).map(s => s.id)).toEqual([id])
    expect(c.species.map(s => s.id)).not.toContain(id)
    expect(c.species.length).toBeGreaterThan(0)
    expect(fishList('vi', c).species.map(s => s.id)).not.toContain(id)
    expect([...speciesLists('vi', c).values()].flat().map(s => s.id)).not.toContain(id)
    expect([...speciesLists('vi', c).keys()]).not.toContain('phan-loai/cichliformes/cichlidae/pterophyllum')
    expect((await sitemapEntries()).map(x => x.path).filter(p => p.includes('ca-ong-tien'))).toEqual([])
    expect(JSON.stringify(appIndex('vi', c))).not.toContain(id)
    expect(await bareForwards(getContent, getBare)).toEqual({
      '/ca/ca-ong-tien/': '/ca/',
      '/phan-loai/cichliformes/cichlidae/pterophyllum/': '/phan-loai/cichliformes/cichlidae/',
    })
  } finally {
    process.env.CONTENT_ROOT = was
  }
})
