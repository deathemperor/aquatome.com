import { expect, test } from 'vitest'
import type { Item } from '../chat/handbook'
import { search } from '../chat/search'

const fish = (id: string, name: string, aka: string[] = []): Item => ({ kind: 'fish', id, name, aka, path: `/vi/ca/${id}/` })
// The order of the app index: a page that only shares a word, or names it among its other names, may come first.
const items = [
  fish('neocaridina-davidi', 'Tép red cherry', ['Tép đỏ', 'Tép vàng']),
  fish('carassius-auratus', 'Cá vàng', ['Goldfish']),
  fish('chromobotia-macracanthus', 'Cá heo hề', ['Cá chuột vằn', 'Clown loach']),
  fish('corydoras-aeneus', 'Cá chuột đồng', ['Bronze cory']),
  fish('barbodes-semifasciolatus', 'Cá barb vàng', ['Cá chép vàng Koi']),
  fish('cyprinus-rubrofuscus', 'Cá chép koi', ['Koi']),
]

test("a page named exactly what was asked comes before one of another animal's that shares its last word", () => {
  // "cá vàng" is the goldfish; "Tép vàng" (a yellow shrimp) is only the same once "cá" and "tép" are both dropped.
  expect(search(items, 'cá vàng', 'fish')[0]?.id).toBe('carassius-auratus')
  expect(search(items, 'vàng', 'fish')[0]?.id).toBe('carassius-auratus')
  expect(search(items, 'tép vàng', 'fish')[0]?.id).toBe('neocaridina-davidi')
})

test("a page whose own name begins with what was asked comes before one whose other name does", () => {
  expect(search(items, 'cá chuột', 'fish')[0]?.id).toBe('corydoras-aeneus')
  expect(search(items, 'cá chép', 'fish')[0]?.id).toBe('cyprinus-rubrofuscus')
  // Its other names still find it.
  expect(search(items, 'cá chuột vằn', 'fish')[0]?.id).toBe('chromobotia-macracanthus')
})

// The chief of staff, 18 Nov 2026: a glossary term's link phrases (the app index's `words`) find it as its other names do.
// A tool's words, its page's own description, don't: the chat finds a tool by its name.
test("a glossary term is found by its link phrases, alone or inside a question; a tool isn't found by its words", () => {
  const term = (id: string, name: string, words: string[]): Item => ({ kind: 'glossary', id, name, words, path: `/vi/thuat-ngu/${id}/` })
  const pages = [...items, term('ca-dan', 'Cá đàn', ['sống theo đàn', 'bơi theo đàn']), term('ca-an-dem', 'Cá ăn đêm', ['về đêm']),
    { kind: 'tool', name: 'Tính thể tích bể', words: ['lít, gallon, độ dày kính'], path: '/vi/cong-cu/the-tich-be/' } as Item]
  expect(search(pages, 'sống theo đàn', null)[0]?.name).toBe('Cá đàn')
  expect(search(pages, 'về đêm', 'glossary')[0]?.name).toBe('Cá ăn đêm')
  expect(search(pages, 'cá neon có sống theo đàn không', 'glossary').map(i => i.name)).toEqual(['Cá đàn'])
  expect(search(pages, 'độ dày kính', 'tool')).toEqual([])
})
