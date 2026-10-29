import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { extractTraits, readTraits } from '../src/traits'

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
