import { expect, test } from 'vitest'
import { groupCredits } from '../src/lib/credits'
import { page } from './dist'

test('groupCredits merges same author + licence and keeps every source link in order', () => {
  const c = (author: string, licence: string, sourceUrl: string) => ({ author, licence, sourceUrl, what: 'Ảnh' })
  expect(groupCredits([c('SF', 'perm', 'u1'), c('Zell', 'CC BY-SA 3.0', 'u2'), c('SF', 'perm', 'u3'), c('SF', 'CC0', 'u4')])).toEqual([
    { author: 'SF', licence: 'perm', urls: ['u1', 'u3'] },
    { author: 'Zell', licence: 'CC BY-SA 3.0', urls: ['u2'] },
    { author: 'SF', licence: 'CC0', urls: ['u4'] },
  ])
})
test('footer shows one "Nguồn ảnh" button; the popover lists every photo link', () => {
  const { dom } = page('/vi/ca/')
  const btn = dom.querySelector('footer button[popovertarget="photo-credits"]')
  const pop = dom.querySelector('#photo-credits[popover]')
  expect(btn?.text).toMatch(/^Nguồn ảnh \(\d+\)$/)
  const n = Number(btn!.text.match(/\d+/)![0])
  const links = pop!.querySelectorAll('li').reduce((s, li) => s + (li.querySelector('.nums') ? li.querySelectorAll('.nums a').length : 1), 0)
  expect(links).toBe(n)
  expect(dom.querySelector('footer p.credits')).toBeNull()
})
