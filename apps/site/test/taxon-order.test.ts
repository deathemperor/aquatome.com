import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, test } from 'vitest'
import { DIST, page } from './dist'

// A taxon page lists the next rank down by most species first, then by name in plain character order (the names are
// Latin, ASCII): a rule the app applies to its index too, so its fish shelves list them in the same order.
const pages = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? pages(p) : f === 'index.html' ? [`/${relative(DIST, dir)}/`] : []
})

test('a taxon page lists the ranks under it by most species, then A–Z by name', () => {
  const all = pages(join(DIST, 'phan-loai'))
  expect(all.length).toBeGreaterThan(3)
  let lists = 0
  for (const path of all) {
    const kids = page(path).dom.querySelectorAll('ul.kids li').map(li => ({ name: li.querySelector('a')!.text.trim(), n: Number(li.querySelector('span')!.text.replace(/\D/g, '')) }))
    if (kids.length < 2) continue
    lists++
    const sorted = [...kids].sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    expect(kids, path).toEqual(sorted)
  }
  expect(lists).toBeGreaterThan(0)
})
