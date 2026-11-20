import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toneKey } from '@aq/schema'
import { expect, test } from 'vitest'

// A term's saved link phrases agree with its notes: none its notes take off, and each its notes give is on it and on no
// other term (the chief of staff, 20 Nov 2026: "lớp nền" linked fish pages to Nền cát; it and "vật liệu nền" name any bed,
// so they are Nền bể's). A read of the names that put one back fails here.
const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const DIR = join(ROOT, 'content/glossary')
const ASKS = JSON.parse(readFileSync(join(ROOT, 'packages/engine/src/glossary-asks.json'), 'utf8')) as Record<string, { notNames?: string[]; linkNames?: string[] }>
type Names = { name: string; altNames: string[]; linkNames?: string[] }
const terms = readdirSync(DIR).filter(id => existsSync(join(DIR, id, 'vi.json')))
const vi = (id: string) => JSON.parse(readFileSync(join(DIR, id, 'vi.json'), 'utf8')) as Names
const holds = (t: Names, n: string) => [t.name, ...t.altNames, ...(t.linkNames ?? [])].some(x => toneKey(x) === toneKey(n))

test('no term keeps a link phrase its notes take off, and each link phrase its notes give is its own and no other term\'s', () => {
  const wrong: string[] = []
  for (const id of terms) {
    const t = vi(id), off = new Set((ASKS[id]?.notNames ?? []).map(toneKey))
    for (const n of t.linkNames ?? []) if (off.has(toneKey(n))) wrong.push(`${id} keeps "${n}"`)
    for (const n of ASKS[id]?.linkNames ?? []) {
      if (!(t.linkNames ?? []).some(x => toneKey(x) === toneKey(n))) wrong.push(`${id} lacks "${n}"`)
      for (const o of terms) if (o !== id && holds(vi(o), n)) wrong.push(`${o} holds "${n}", ${id}'s`)
    }
  }
  expect(wrong).toEqual([])
})
