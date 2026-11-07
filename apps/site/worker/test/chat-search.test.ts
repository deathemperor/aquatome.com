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
