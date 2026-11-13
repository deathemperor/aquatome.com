import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { nameStep, type Ceilings } from '../src/ceiling'
import { draftSummaries } from '../src/summaries'
import { rewriteExisting } from '../src/vi-backfill'

const roots: string[] = []
afterEach(async () => {
  process.env.ENGINE_COST_LOG = 'off'
  nameStep(undefined)
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

// 13 Nov 2026, the chief of staff: a page waits when the line cannot cover its last item.
for (const step of ['summaries', 'rewrite-vi']) test(`${step}: admission stops before any call or page write`, async () => {
  const root = await mkdtemp(join(tmpdir(), 'piece-loops-'))
  roots.push(root)
  const content = join(root, 'content')
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), content, { recursive: true })
  await rm(join(content, 'summaries'), { recursive: true, force: true })
  const files = (await readdir(content, { recursive: true })).filter(f => f.endsWith('.json'))
  const before = await Promise.all(files.map(f => readFile(join(content, f), 'utf8')))
  const log = join(root, 'cost.jsonl')
  await writeFile(log, JSON.stringify({ at: new Date().toISOString(), step, piece: 'last', pieceUsd: 10000, finished: true }) + '\n')
  process.env.ENGINE_COST_LOG = log
  nameStep(step)
  let calls = 0
  const llm = async <T>(): Promise<T> => { calls++; throw new Error('must not call') }
  const now = () => new Date()
  const state = join(root, 'state.json')
  const report = step === 'summaries'
    ? await draftSummaries(content, llm, { top: 2, now, publicBuild: false })
    : await rewriteExisting(content, state, { llm, now, opts: { mode: 'fix' } }, { limit: 2 })
  expect(report.stopped).toContain('not started')
  expect(report.failed).toEqual([])
  expect(calls).toBe(0)
  expect(await Promise.all(files.map(f => readFile(join(content, f), 'utf8')))).toEqual(before)
  if (step === 'rewrite-vi') expect(JSON.parse(await readFile(state, 'utf8'))).toEqual({})
})

test('every ceiling step has an item admission decision', async () => {
  const { WRAPPED, ONE_CALL } = await import('../src/pieces')
  const ceilings = JSON.parse(await readFile(new URL('../src/ceilings.json', import.meta.url), 'utf8')) as Ceilings
  const steps = [...new Set<string>(ceilings.tables.flatMap(table => (['mac', 'github'] as const).flatMap(machine => Object.keys(table[machine].steps))))].sort()
  expect(steps.filter(step => !WRAPPED[step] && !ONE_CALL[step])).toEqual([])
  for (const [step, file] of Object.entries(WRAPPED)) {
    expect(await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8'), step).toContain('piece(')
  }
  expect(Object.keys(WRAPPED).filter(step => step in ONE_CALL)).toEqual([])
  for (const reason of Object.values(ONE_CALL)) {
    expect(reason.trim()).not.toBe('')
    expect(reason).not.toContain('\n')
  }
})
