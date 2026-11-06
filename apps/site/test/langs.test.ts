import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { LANG, LANGS } from '@aq/schema/langs'
import { ENTITY_RE } from '../worker/comments/rules'

// Copies of the language table (packages/schema/src/langs.ts) that have to stay written out, held to it.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('the contracts the iOS app reads list the languages the table has', () => {
  // A language added to the table is a language these APIs answer in: its contract says so too (protocols/, a change the
  // iOS leads make).
  for (const file of ['app-telemetry.openapi.json', 'fishid.openapi.json']) {
    const enums: string[][] = []
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk)
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) {
        if (k === 'enum' && Array.isArray(v) && v.includes('vi')) enums.push(v)
        else walk(v)
      }
    }
    walk(JSON.parse(read(`../../../protocols/${file}`)))
    expect(enums.length, file).toBeGreaterThan(0)
    for (const e of enums) expect(e, file).toEqual([...LANGS])
  }
})

test("the talk contract's comments key is the Worker's, one prefix per other language", () => {
  const api = JSON.parse(read('../../../protocols/talk.openapi.json')) as { components: { parameters: { CommentsKey: { schema: { pattern: string } } } } }
  expect(new RegExp(api.components.parameters.CommentsKey.schema.pattern).source).toBe(ENTITY_RE.source)
})

test("the video player's script, which has no imports, names each language as the table does", () => {
  const src = read('../src/components/VideoPlayer.astro')
  const literal = /const LANG_NAME: Record<string, string> = \{([^}]*)\}/.exec(src)?.[1]
  expect(literal).toBeDefined()
  const names = Object.fromEntries([...literal!.matchAll(/(\w+): '([^']*)'/g)].map(m => [m[1], m[2]]))
  expect(names).toEqual(Object.fromEntries(LANGS.map(l => [l, LANG[l].name])))
})
