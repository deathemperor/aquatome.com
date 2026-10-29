import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LlmError, type Llm } from '../src/claude'
import { rewriteExisting } from '../src/vi-backfill'

const put = async (root: string, path: string, v: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(v)) }
async function setup(before = 0.8) {
  const root = await mkdtemp(join(tmpdir(), 'aq-rw-'))
  const sec = (key: string, source: string) => ({ key, source, sourceUrl: `https://${source}/x`, html: `<p>${key} in English</p>` })
  await put(root, 'species/x/entity.json', { id: 'x', sections: [sec('habitat', 'seriouslyfish'), sec('diet', 'seriouslyfish'), sec('references', 'seriouslyfish'), sec('diet', 'glaser')] })
  await put(root, 'species/x/vi.json', { slug: 'ca-x', name: 'Cá X', sections: { 'habitat:seriouslyfish': '<p>cũ</p>', 'diet:seriouslyfish': '<p>cũ</p>', 'references:seriouslyfish': '<p>Ref</p>', 'diet:glaser': '<p>cũ</p>' }, quality: { score: before, indexable: before >= 0.75, bySource: { seriouslyfish: before, glaser: 0.9 } } })
  await put(root, 'guides/g/entity.json', { id: 'g', source: 'aquariumcoop', html: '' })
  await put(root, 'guides/g/vi.json', { slug: 'g', name: 'G', body: '<p>cũ</p>', quality: { score: 0.85, indexable: true } })
  await put(root, 'guides/youtube-v/entity.json', { id: 'youtube-v', source: 'youtube', html: '' })
  await put(root, 'guides/youtube-v/vi.json', { slug: 'v', name: 'V', body: '<p>video</p>' })
  await put(root, 'glossary/t/vi.json', { slug: 't', name: 'T', definition: 'cũ' })
  return root
}
/** Rewrites every part to "mới <id>"; reviewers score per kind. */
const fake = (score: { en: number; vi: number }, calls: string[] = []): Llm => async <T,>(a: { system: string; prompt: string }) => {
  if (a.system.includes('English→Vietnamese')) { calls.push('review'); return { score: score.en, notes: [] } as T }
  if (a.system.includes('checking a rewrite')) { calls.push('same'); return { score: score.vi, notes: [] } as T }
  calls.push('rewrite')
  return { parts: [...a.prompt.matchAll(/^### (\S+)$/gm)].map(m => ({ id: m[1], vi: `<p>mới ${m[1]}</p>` })) } as T
}
const now = () => new Date('2026-10-30T00:00:00Z')
const read = async (root: string, p: string) => JSON.parse(await readFile(join(root, p), 'utf8'))

test('rewrites guides, species (per source, references untouched) and glossary once; video guides never', async () => {
  const root = await setup()
  const state = join(root, 'state.json')
  const calls: string[] = []
  const r = await rewriteExisting(root, state, { llm: fake({ en: 0.9, vi: 0.9 }, calls), opts: { mode: 'fix' }, now }, { limit: 10 })
  expect(r.done.map(x => x.split(' ')[0])).toEqual(['guides/g', 'species/x', 'glossary/t'])
  const sp = await read(root, 'species/x/vi.json')
  expect(sp.sections).toEqual({ 'habitat:seriouslyfish': '<p>mới habitat:seriouslyfish</p>', 'diet:seriouslyfish': '<p>mới diet:seriouslyfish</p>', 'references:seriouslyfish': '<p>Ref</p>', 'diet:glaser': '<p>mới diet:glaser</p>' })
  expect(sp.quality).toEqual({ score: 0.9, indexable: true, bySource: { seriouslyfish: 0.9, glaser: 0.9 } })
  expect(sp.name).toBe('Cá X')
  expect((await read(root, 'guides/g/vi.json')).body).toBe('<p>mới body</p>')
  expect((await read(root, 'guides/g/vi.json')).quality).toEqual({ score: 0.85, indexable: true }) // meaning check, not a translation score
  expect((await read(root, 'glossary/t/vi.json')).definition).toBe('mới definition') // plain text stays plain
  expect((await read(root, 'guides/youtube-v/vi.json')).body).toBe('<p>video</p>')
  expect(calls.filter(c => c === 'rewrite')).toHaveLength(4)
  const again = await rewriteExisting(root, state, { llm: fake({ en: 0.9, vi: 0.9 }), opts: { mode: 'fix' }, now }, { limit: 10 })
  expect(again.done).toEqual([])
})

test('a rewrite the reviewer fails is not kept, unless it beats a low old score', async () => {
  const root = await setup(0.8)
  await rewriteExisting(root, join(root, 's.json'), { llm: fake({ en: 0.7, vi: 0.6 }), opts: { mode: 'fix' }, now }, { limit: 10 })
  expect((await read(root, 'species/x/vi.json')).sections['habitat:seriouslyfish']).toBe('<p>cũ</p>')
  expect((await read(root, 'guides/g/vi.json')).body).toBe('<p>cũ</p>')
  const low = await setup(0.6)
  await rewriteExisting(low, join(low, 's.json'), { llm: fake({ en: 0.7, vi: 0.9 }), opts: { mode: 'fix' }, now }, { limit: 10, kinds: ['species'] })
  const sp = await read(low, 'species/x/vi.json')
  expect(sp.sections['habitat:seriouslyfish']).toBe('<p>mới habitat:seriouslyfish</p>') // 0.7 beats 0.6
  expect(sp.sections['diet:glaser']).toBe('<p>cũ</p>') // 0.7 is below both the threshold and glaser's 0.9
  expect(sp.quality).toMatchObject({ score: 0.7, indexable: false })
})

test('a model failure stops the run and leaves the page for next time; --limit bounds the pages', async () => {
  const root = await setup()
  const state = join(root, 's.json')
  const r = await rewriteExisting(root, state, { llm: async () => { throw new LlmError('usage limit') }, opts: { mode: 'fix' }, now }, { limit: 10 })
  expect(r.stopped).toContain('guides/g')
  expect(await read(root, 's.json')).toEqual({})
  const one = await rewriteExisting(root, state, { llm: fake({ en: 0.9, vi: 0.9 }), opts: { mode: 'fix' }, now }, { limit: 1 })
  expect(one.done).toHaveLength(1)
  expect(Object.keys(await read(root, 's.json'))).toEqual(['guides/g'])
})
