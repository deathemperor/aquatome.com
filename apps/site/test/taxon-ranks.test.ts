import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { taxonHref, taxonKeys, taxonRanks } from '../src/lib/taxa-places'
import { DIST } from './dist'

// Pond and freshwater snails have no rank called "order" (their families sit under groups ranked above it), and the
// taxonomy leaves it empty: such a rank is skipped, never an empty step in a page's address.
const snail = { order: '', family: 'Lymnaeidae', genus: 'Radix' }
const betta = { order: 'Anabantiformes', family: 'Osphronemidae', genus: 'Betta' }

test('a rank with no name is skipped: a snail family\'s page is /phan-loai/<family>/, keeping its rank', () => {
  expect(taxonRanks(snail)).toEqual([{ level: 2, name: 'Lymnaeidae', slug: 'lymnaeidae' }, { level: 3, name: 'Radix', slug: 'radix' }])
  expect(taxonHref(snail, 2)).toBe('/vi/phan-loai/lymnaeidae/')
  expect(taxonHref(snail, 3)).toBe('/vi/phan-loai/lymnaeidae/radix/')
  expect(taxonKeys(snail)).toEqual(['phan-loai/lymnaeidae', 'phan-loai/lymnaeidae/radix'])
  expect(taxonHref(betta, 3)).toBe('/vi/phan-loai/anabantiformes/osphronemidae/betta/')
  expect(taxonKeys(betta)).toEqual(['phan-loai/anabantiformes', 'phan-loai/anabantiformes/osphronemidae', 'phan-loai/anabantiformes/osphronemidae/betta'])
  expect(taxonHref({ ...snail, genus: '' }, 3)).toBeUndefined()
})

const htmls = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? htmls(p) : f.endsWith('.html') ? [p] : []
})

test('no built page links a taxon page through an empty rank', () => {
  const bad = htmls(DIST).filter(f => /\/phan-loai\/[^"']*\/\//.test(readFileSync(f, 'utf8')) || readFileSync(f, 'utf8').includes('/phan-loai//'))
  expect(bad).toEqual([])
})
