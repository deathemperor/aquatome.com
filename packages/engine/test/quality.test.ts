import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { appendChangelog } from '../src/changelog'
import { PHRASES, VI_STYLE } from '../src/phrases'
import { gate, INVERTEBRATES, reviewRewrite, reviewTranslation } from '../src/quality'

test('gate truth table', () => {
  expect(gate(0.9, false)).toBe('pass')
  expect(gate(0.75, false)).toBe('pass')
  expect(gate(0.74, false)).toBe('retry')
  expect(gate(0.74, true)).toBe('noindex')
  expect(gate(0.8, true)).toBe('pass')
})

test('reviewTranslation clamps the score and passes both texts', async () => {
  let prompt = ''
  const llm = async <T,>(a: { prompt: string }) => { prompt = a.prompt; return { score: 1.4, notes: ['ok'] } as T }
  expect(await reviewTranslation(llm, [{ en: '<p>Streams</p>', vi: '<p>Suối</p>' }])).toEqual({ score: 1, notes: ['ok'], lost: [] })
  expect(prompt).toContain('Streams')
  expect(prompt).toContain('Suối')
})

// The Writing Lead, 22 Nov 2026: 421 of the translation review's notes asked for "động vật không xương sống" where the list
// asks the writer for the animals, so the daily rewrites kept writing it back.
test('"invertebrates": both reviewers are told what every writer is, in a tank the animals keepers mean, in the wild the word where the source names none', async () => {
  const prompts: string[] = []
  const llm = async <T,>(a: { prompt: string }) => { prompts.push(a.prompt); return { score: 1, notes: [] } as T }
  await reviewTranslation(llm, [{ en: '<p>Safe with invertebrates.</p>', vi: '<p>Nuôi chung được với tép, ốc.</p>' }])
  await reviewRewrite(llm, [{ before: '<p>An toàn với động vật không xương sống.</p>', after: '<p>Nuôi chung được với tép, ốc.</p>' }])
  expect(prompts).toHaveLength(2)
  for (const p of prompts) {
    expect(p).toContain(INVERTEBRATES)
    expect(p).not.toContain('{{')
  }
  const hint = PHRASES.vi!.find(p => p.say === 'không xương sống')!.instead
  expect(hint).toMatch(/^trong bể .*"tép, ốc".*; ngoài tự nhiên .*nguồn không nói con nào thì để "động vật không xương sống"$/)
  expect(VI_STYLE).toContain(hint)
})

test('changelog: newest first, capped at 500', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cl-'))
  const e = (date: string, id: string) => ({ date, kind: 'species' as const, id, source: 'seriouslyfish' as const, action: 'new' as const })
  await writeFile(join(root, 'changelog.json'), JSON.stringify(Array.from({ length: 499 }, (_, i) => e('2026-10-01', `old-${i}`))))
  await appendChangelog(root, [e('2026-10-28', 'a'), e('2026-10-28', 'b')])
  const log = JSON.parse(await readFile(join(root, 'changelog.json'), 'utf8'))
  expect(log).toHaveLength(500)
  expect(log.slice(0, 3).map((x: { id: string }) => x.id)).toEqual(['a', 'b', 'old-0'])
  const fresh = await mkdtemp(join(tmpdir(), 'cl-'))
  await appendChangelog(fresh, [e('2026-10-28', 'x')])
  expect(JSON.parse(await readFile(join(fresh, 'changelog.json'), 'utf8'))).toHaveLength(1)
})
