import { readFileSync } from 'node:fs'
import { LANGS, type BreedEntity, type Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { notFishPaths, saysFish } from '../scripts/page-check'
import { breedIsFish, breedKind, pageIsFish } from '../src/lib/breeds'
import { FIELD_TIPS, FIELD_TIPS_NOT_FISH } from '../src/lib/card-guide'
import { AVOID_REASONS, avoidWhy } from '../src/lib/companions'
import { localizePath, translator } from '../src/lib/i18n'
import { speciesDescription } from '../src/lib/meta'
import { isFish } from '../src/lib/taxa-places'

// The owner's report of 15 Nov (the fiddler crab's page sat under "Loài cá"), and a reader's points on 17 Nov: the words
// the site writes for a crab, a shrimp or a snail don't call it a fish, in any language. Each was a fish's until then.
test("a crab's, a shrimp's or a snail's own words, in every language: its lines' kind, its reasons to be kept away, its description", () => {
  for (const lang of LANGS) {
    const t = translator(lang)
    for (const k of ['hybrid', 'variety', 'transgenic'] as const) expect(saysFish(lang, t(breedKind(k, false))), `${lang} ${k}`).toBe(false)
    const why = avoidWhy(t, 'X', false)
    for (const r of AVOID_REASONS) expect(saysFish(lang, why[r]), `${lang} ${r}: ${why[r]}`).toBe(false)
    expect(saysFish(lang, speciesDescription(lang, 'X', 'Xus yus', {}, false)), lang).toBe(false)
    // The card's tips on tap (Codex's read, 17 Nov).
    for (const [field, tip] of Object.entries(FIELD_TIPS_NOT_FISH)) {
      expect(saysFish(lang, t(tip)), `${lang} ${field}: ${t(tip)}`).toBe(false)
      expect(saysFish(lang, t(FIELD_TIPS[field as keyof typeof FIELD_TIPS])), `${lang} ${field}, a fish's`).toBe(true)
    }
    // A fish's keep their words.
    expect(saysFish(lang, speciesDescription(lang, 'X', 'Xus yus', {})), lang).toBe(true)
    expect(saysFish(lang, avoidWhy(t, 'X').predator), lang).toBe(true)
  }
})

test("a line is a fish's by its species, through the line it's a form of; a page whose content doesn't say what it is, by name", () => {
  const sp = (id: string, group: string, order: string) => ({ id, group, order }) as Content['species'][number]
  const line = (id: string, basedOn?: string, parents: BreedEntity['parents'] = []) => ({ id, kind: 'variety', basedOn, parents }) as Content['breeds'][number]
  const c = {
    species: [sp('neocaridina-davidi', 'shrimp', 'Decapoda'), sp('carassius-auratus', 'goldfish', 'Cypriniformes')],
    breeds: [line('blue-velvet-shrimp', 'neocaridina-davidi'), line('ranchu', 'carassius-auratus'), line('ranchu-red', 'ranchu'), line('loop-a', 'loop-b'), line('loop-b', 'loop-a'), line('butterfly-koi'), line('crystal-red-shrimp')],
  }
  const is = (id: string) => breedIsFish(c, c.breeds.find(b => b.id === id)!)
  expect(is('blue-velvet-shrimp')).toBe(false)
  expect(is('ranchu')).toBe(true)
  expect(is('ranchu-red')).toBe(true)
  expect(is('loop-a')).toBe(true)
  // A line linked to no species stays a fish's, but for the one the content doesn't say is a shrimp.
  expect(is('butterfly-koi')).toBe(true)
  expect(is('crystal-red-shrimp')).toBe(false)
  // The sea slug has no order: by name until its content says it.
  expect(isFish({ id: 'costasiella-kuroshimae', group: 'other', order: '' })).toBe(false)
  expect(isFish({ group: 'other', order: '' })).toBe(true)
})

test("a shrimp line's page and its photos page are a shrimp's, and the check reads both (a reader's point, 17 Nov: the crystal red shrimp's photos page said \"Loài cá\")", () => {
  const c = {
    species: [{ id: 'neocaridina-davidi', group: 'shrimp', order: 'Decapoda', t: { slug: 'tep-red-cherry' } }, { id: 'carassius-auratus', group: 'goldfish', order: 'Cypriniformes', t: { slug: 'ca-vang' } }],
    breeds: [{ id: 'blue-velvet-shrimp', kind: 'variety', basedOn: 'neocaridina-davidi', parents: [], t: { slug: 'tep-blue-velvet' } }, { id: 'ranchu', kind: 'variety', basedOn: 'carassius-auratus', parents: [], t: { slug: 'ca-ranchu' } }],
  } as unknown as Content
  expect(pageIsFish(c, c.breeds[0]!)).toBe(false)
  expect(pageIsFish(c, c.breeds[1]!)).toBe(true)
  expect(pageIsFish(c, c.species[0]!)).toBe(false)
  expect(notFishPaths(c, 'vi').sort()).toEqual(['/ca/tep-blue-velvet/', '/ca/tep-blue-velvet/anh/', '/ca/tep-red-cherry/', '/ca/tep-red-cherry/anh/', '/nhom/shrimp/'])
  expect(notFishPaths(c, 'th')).toContain(localizePath('th', '/vi/ca/tep-blue-velvet/anh/'))
  // A group of more than a page of species: each numbered page too, in each language's word for it (Codex's read, 17 Nov:
  // 26 shrimp, 24 a page).
  const many = { ...c, species: [...c.species, ...Array.from({ length: 25 }, (_, i) => ({ ...c.species[0]!, id: `shrimp-${i}`, t: { slug: `tep-${i}` } }))] } as unknown as Content
  expect(notFishPaths(many, 'vi')).toEqual(expect.arrayContaining(['/nhom/shrimp/', '/nhom/shrimp/trang/2/']))
  expect(notFishPaths(many, 'vi')).not.toContain('/nhom/shrimp/trang/3/')
  expect(notFishPaths(many, 'th')).toContain(localizePath('th', '/vi/nhom/shrimp/trang/2/'))
  // The photos page asks the same question for a species and a line alike.
  expect(readFileSync(new URL('../src/pages/ca/[slug]/anh.astro', import.meta.url), 'utf8')).toContain("t(fish ? 'Loài cá' : 'Loài')")
  expect(readFileSync(new URL('../src/pages/ca/[slug]/anh.astro', import.meta.url), 'utf8')).toContain('const fish = pageIsFish(')
})
