import { readFileSync } from 'node:fs'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { dueFields, extractTraits, readTraits, RULES } from '../src/traits'

async function content() {
  const root = join(await mkdtemp(join(tmpdir(), 'tr-')), 'content')
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), root, { recursive: true })
  await rm(join(root, 'traits'), { recursive: true, force: true })
  return root
}
const now = () => new Date('2026-10-29T00:00:00Z')

test('extracts traits up to the limit, then only for species without them', async () => {
  const root = await content()
  let calls = 0
  const llm = async <T,>() => { calls++; return { temperament: 'peaceful', finNipper: false, schoolMin: 8 } as T }
  const a = await extractTraits(root, llm, { limit: 3, now, publicBuild: false })
  expect(a.done.length).toBe(3)
  const b = await extractTraits(root, llm, { limit: 100, now, publicBuild: false })
  expect(b.done.some(id => a.done.includes(id))).toBe(false)
  expect((await readTraits(root)).length).toBe(a.done.length + b.done.length)
  expect(await extractTraits(root, llm, { limit: 100, now, publicBuild: false })).toEqual({ done: [], failed: [] })
  expect(calls).toBe(a.done.length + b.done.length)
})
test('invalid output is reported, not written', async () => {
  const root = await content()
  const r = await extractTraits(root, async <T,>() => ({ temperament: 'grumpy', finNipper: false, schoolMin: null }) as T, { limit: 1, now, publicBuild: false })
  expect(r.done).toEqual([])
  expect(r.failed.length).toBe(1)
  expect(await readTraits(root)).toEqual([])
})

// 2026-11-07, a design lab: the angelfish's school size was 6, from "if you intend to breed, start with a group of six
// juveniles; from this a pair is sure to form", so the tank-mates tool started it at six fish and advised six in a full
// tank. The rule says a number only about breeding, a pair or a harem is no school, and traits read with an older
// prompt are read again, after the pages that changed.
test('the school-size rule leaves out breeding groups, pairs and harems', () => {
  const rule = readFileSync(new URL('../src/prompts/traits.md', import.meta.url), 'utf8').split('\n').find(l => l.startsWith('- `schoolMin`'))!
  for (const words of ['a pair forms', 'harem', 'spawning tank', 'in a pair', 'small group" with no number is null']) expect(rule, words).toContain(words)
})

test('a field read with an older rule is read again after the changed pages, and only that field takes the new answer', async () => {
  const root = await content()
  const llm = async <T,>() => ({ temperament: 'peaceful', finNipper: false, schoolMin: null }) as T
  await extractTraits(root, llm, { limit: 100, now, publicBuild: false })
  const all = await readTraits(root)
  expect(all.every(t => JSON.stringify(t.rules) === JSON.stringify(RULES))).toBe(true)
  const [older, moved, before, noSchool] = all
  const put = (t: Record<string, unknown> & { id: string }) => writeFile(join(root, 'traits', `${t.id}.json`), JSON.stringify(t))
  // Its school size read with an older school rule; a temperament the same rule reads still stands.
  await put({ ...older!, temperament: 'aggressive', schoolMin: 6, rules: { ...RULES, schoolMin: 'older' } })
  // Its page changed since: every field read again.
  await put({ ...moved!, temperament: 'aggressive', speciesUpdatedAt: '2000-01-01' })
  // Read before rules were recorded: its school size again when it has one; none, nothing to read.
  const { rules: _a, ...b } = before!
  await put({ ...b, temperament: 'aggressive', schoolMin: 6 })
  const { rules: _b, ...n } = noSchool!
  await put({ ...n, temperament: 'aggressive', schoolMin: null })
  const r = await extractTraits(root, llm, { limit: 100, now, publicBuild: false })
  expect(r.done[0]).toBe(moved!.id)
  expect(new Set(r.done)).toEqual(new Set([moved!.id, older!.id, before!.id]))
  const now2 = new Map((await readTraits(root)).map(t => [t.id, t]))
  expect(now2.get(older!.id)).toMatchObject({ temperament: 'aggressive', schoolMin: null, rules: RULES })
  expect(now2.get(moved!.id)).toMatchObject({ temperament: 'peaceful', schoolMin: null })
  expect(now2.get(before!.id)).toMatchObject({ temperament: 'aggressive', schoolMin: null, rules: RULES })
  expect(dueFields(now2.get(noSchool!.id)!)).toEqual([])
  expect((await extractTraits(root, llm, { limit: 100, now, publicBuild: false })).done).toEqual([])
  // --only: its fields due, or all when none is.
  expect((await extractTraits(root, llm, { limit: 100, now, publicBuild: false, only: [older!.id] })).done).toEqual([older!.id])
  expect((await readTraits(root)).find(t => t.id === older!.id)).toMatchObject({ temperament: 'peaceful' })
})
