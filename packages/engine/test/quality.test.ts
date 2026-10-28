import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { appendChangelog } from '../src/changelog'
import { gate, reviewTranslation } from '../src/quality'

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
  expect(await reviewTranslation(llm, [{ en: '<p>Streams</p>', vi: '<p>Suối</p>' }])).toEqual({ score: 1, notes: ['ok'] })
  expect(prompt).toContain('Streams')
  expect(prompt).toContain('Suối')
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
