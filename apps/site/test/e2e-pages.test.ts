import { expect, test } from 'vitest'
import { onePerKind } from '../e2e/pages'

test('onePerKind: the first page of each kind, then the extras, none twice', () => {
  // aquatome.com's sitemap lists the tank-mates page first among the tools; the Lighthouse check also names it, and a
  // duplicate test title stopped the whole watch run.
  const sitemap = ['/vi/', '/vi/cong-cu/', '/vi/cong-cu/nuoi-chung/', '/vi/cong-cu/the-tich-be/', '/th/']
  const pages = onePerKind(sitemap, ['vi//1', 'vi/cong-cu/2', 'vi/cong-cu/3', 'th//1', 'vi/ca/2'], ['/vi/cong-cu/nuoi-chung/'])
  expect(pages).toEqual(['/vi/', '/vi/cong-cu/', '/vi/cong-cu/the-tich-be/', '/th/', '/vi/cong-cu/nuoi-chung/'])
  expect(new Set(pages).size).toBe(pages.length)
})
