import { LANGS, type BreedEntity, type Content } from '@aq/schema'
import { expect, test } from 'vitest'
import { saysFish } from '../scripts/page-check'
import { breedIsFish, breedKind } from '../src/lib/breeds'
import { AVOID_REASONS, avoidWhy } from '../src/lib/companions'
import { translator } from '../src/lib/i18n'
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
