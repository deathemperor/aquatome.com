import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { fitKey, fitText, type FitFinding, type FitState } from '../src/fit'
import { fitRewrite, mendable, rewriteDue } from '../src/fit-rewrite'
import { loadPages, type Page } from '../src/pages'

const FIXTURE = new URL('../../../apps/site/test/fixture-content', import.meta.url).pathname
const ID = 'danio-margaritatus'
const content = async () => {
  const root = await mkdtemp(join(tmpdir(), 'fit-rewrite-'))
  await cp(FIXTURE, join(root, 'content'), { recursive: true })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  // The fixture's fish sources aren't shown on a public build, which is what the checker reads: here they are.
  const file = join(root, 'content/sources.json')
  const sources = JSON.parse(await readFile(file, 'utf8')) as Record<string, { publish: boolean; permission?: object }>
  for (const s of ['seriouslyfish', 'sprucepets']) Object.assign(sources[s]!, { publish: true, permission: { date: '2026-11-08', file: 'test', scope: ['text'] } })
  await writeFile(file, JSON.stringify(sources))
  return root
}
const danio = async (root: string) => (await loadPages(join(root, 'content'), ['vi'])).find(p => p.id === ID)!
const part = (p: Page, field: string) => fitText(p).parts.find(x => x.field === field)!.id
const reading = (p: Page, findings: Omit<FitFinding, 'by'>[]): FitState => ({ [fitKey(p)]: { at: '2026-11-08', hash: fitText(p).hash, model: 'opus', findings: findings.map(f => ({ ...f, by: 'model' as const })), products: [] } })
const found = (p: Page) => [
  { check: 'elsewhere' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'Ao cạn nhiều cỏ', why: 'x' },
  { check: 'words' as const, part: part(p, 'sections.habitat:seriouslyfish'), quote: 'cao nguyên Shan', why: 'y' },
  { check: 'units' as const, part: part(p, 'sections.aquariumSize:sprucepets'), quote: '19 lít', why: 'z' },
  { check: 'words' as const, part: part(p, 'sections.quickFacts:sprucepets'), quote: 'ăn tạp', why: 'w' },
]

/** A stand-in for the rewriter (each part it's given, changed) and its reviewer (a score). */
const fakeLlm = (rewrite: (vi: string) => string, score: number) => {
  const calls: string[] = []
  const llm = (async ({ prompt, schema }: { prompt: string; schema: object }) => {
    if ((schema as { required: string[] }).required.includes('parts')) {
      calls.push('rewrite')
      return { parts: [...prompt.matchAll(/### (\S+)\n(?:EN:\n[\s\S]*?\n)?VI:\n([\s\S]*?)(?=\n\n### |$)/g)].map(m => ({ id: m[1]!, vi: rewrite(m[2]!.trim()) })) }
    }
    calls.push('review')
    return { score, notes: [] }
  }) as Llm
  return { llm, calls }
}

test('what a page has to mend: the parts its current reading faults for the reader, with their wording findings; units and words alone wait', async () => {
  const p = await danio(await content())
  const state = reading(p, found(p))
  expect([...mendable(p, state)].map(([field, fs]) => [field, fs.map(f => f.check)])).toEqual([['sections.habitat:seriouslyfish', ['elsewhere', 'words']]])
  expect(rewriteDue(p, state)).toBe(true)
  // A reading of an older text, units and words alone, or a kit, which the gate holds: nothing to rewrite here.
  expect(rewriteDue(p, { [fitKey(p)]: { ...state[fitKey(p)]!, hash: 'old' } })).toBe(false)
  expect(rewriteDue(p, reading(p, found(p).filter(f => f.check !== 'elsewhere')))).toBe(false)
  expect(rewriteDue(p, reading(p, [...found(p), { check: 'kit', part: '', quote: 'Cá galaxy', why: 'k' }]))).toBe(false)
  // A guide is written again whole, from its facts: due on any finding but units and words.
  const g = (await loadPages(join(await content(), 'content'), ['vi'])).find(x => x.kind === 'guides')!
  expect(rewriteDue(g, reading(g, [{ check: 'source', part: 'P1', quote: '', why: 's' }]))).toBe(true)
  expect(rewriteDue(g, reading(g, [{ check: 'units', part: 'P1', quote: '', why: 'u' }, { check: 'words', part: 'P1', quote: '', why: 'w' }]))).toBe(false)
})

test('a part its reviewer passes is written and recorded with the page\'s new hash; one it fails leaves the file and the record alone', async () => {
  const root = await content()
  const file = join(root, 'content/species', ID, 'vi.json')
  const p = await danio(root)
  const failing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.5)
  const before = await readFile(file, 'utf8')
  let r = await fitRewrite(root, [p], reading(p, found(p)), { llm: failing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.notKept).toHaveLength(1)
  expect(await readFile(file, 'utf8')).toBe(before)
  await expect(readFile(join(root, 'engine-state/rewritten.json'), 'utf8')).rejects.toThrow()

  const passing = fakeLlm(vi => vi.replace('Ao cạn nhiều cỏ', 'Vũng nước cạn, nhiều cỏ'), 0.9)
  r = await fitRewrite(root, [p], reading(p, found(p)), { llm: passing.llm, now: () => new Date('2026-11-08T09:00:00Z') }, { limit: 5 })
  expect(r.rewritten).toEqual(['vi/species/danio-margaritatus sections.habitat:seriouslyfish (0.90)'])
  expect(passing.calls).toEqual(['rewrite', 'review'])
  expect(JSON.parse(await readFile(file, 'utf8')).sections['habitat:seriouslyfish']).toContain('Vũng nước cạn, nhiều cỏ')
  const now = await danio(root)
  expect(JSON.parse(await readFile(join(root, 'engine-state/rewritten.json'), 'utf8'))).toEqual({ 'vi/species/danio-margaritatus': { at: '2026-11-08T09:00:00.000Z', hash: fitText(now).hash } })
})
