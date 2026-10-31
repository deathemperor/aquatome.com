import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { nameKey } from '../src/index'

// Two items of one kind under one name can't be told apart in lists, and typing the name in the tank-mates checker adds
// neither. Species and breeds share /ca/, so they count as one kind. Holds for the real content (the engine runs this
// before it publishes) and the fixture.
const ROOTS = { content: '../../../content', fixture: '../../../apps/site/test/fixture-content' }
const KINDS = [['species', 'breeds'], ['plants']]

function clashes(root: string, lang: string, kinds: string[]): string[] {
  const by = new Map<string, string[]>()
  for (const kind of kinds) for (const id of readdirSync(join(root, kind))) {
    let name: string
    try { name = (JSON.parse(readFileSync(join(root, kind, id, `${lang}.json`), 'utf8')) as { name: string }).name } catch { continue }
    by.set(nameKey(name), [...(by.get(nameKey(name)) ?? []), `${kind}/${id} "${name}"`])
  }
  return [...by.values()].filter(xs => xs.length > 1).map(xs => xs.join(' = '))
}

for (const [label, rel] of Object.entries(ROOTS)) for (const lang of ['vi', 'id', 'th']) for (const kinds of KINDS) {
  test(`${label}: no two ${kinds.join(' or ')} share a ${lang} name`, () => {
    expect(clashes(fileURLToPath(new URL(rel, import.meta.url)), lang, kinds)).toEqual([])
  })
}

test('names that differ only in accents, case, punctuation or spaces are one name', () => {
  expect(nameKey('Cá Tứ vân')).toBe(nameKey('ca tu-van'))
  expect(nameKey('อนูเบียสนานา')).toBe(nameKey('อนูเบียส นานา'))
  expect(nameKey('Cá đĩa')).not.toBe(nameKey('Cá đĩa nâu'))
})
