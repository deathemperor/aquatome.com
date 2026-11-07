import { expect, test } from 'vitest'
import { healthyKeys, memoryHealth, rotate, type KeyEntry } from '../fishid/keys'

// The owner's rule (docs/governance.md): a key out of credit is turned off and the next one takes over, by itself. Fish
// ID, the chat and the evals all go through these calls; the evals with this same in-memory store.
const key = (hash: string) => ({ hash, key: `sk-ant-${hash}` }) as unknown as KeyEntry
const OUT = Object.assign(new Error('400'), { status: 400, error: { error: { message: 'Your credit balance is too low to access the Anthropic API.' } } })
const askWith = (empty: Set<string>) => async (k: KeyEntry) => { if (empty.has(k.hash)) throw OUT; return k.hash }

test('a key out of credit is skipped: the next key answers, and later calls never ask it, until 24 h are over', async () => {
  const store = memoryHealth()
  const keys = [key('a'), key('b'), key('c')]
  const asked: string[] = []
  const call = async (k: KeyEntry) => { asked.push(k.hash); return askWith(new Set(['a']))(k) }
  const first = await rotate(await healthyKeys(keys, store, 1_000), store, call, { random: () => 0, clock: () => 1_000 })
  expect(first).toMatchObject({ ok: true, value: 'b' })
  expect(asked).toEqual(['a', 'b'])

  asked.length = 0
  const next = await healthyKeys(keys, store, 2_000)
  expect(next.map(k => k.hash)).toEqual(['b', 'c'])
  await rotate(next, store, call, { random: () => 0, clock: () => 2_000 })
  expect(asked).toEqual(['b'])

  // Credit added: the next day's try finds it working, with nobody to tell.
  expect((await healthyKeys(keys, store, 1_000 + 24 * 3600 * 1000 + 1)).map(k => k.hash)).toEqual(['a', 'b', 'c'])
})

test('every key out of credit: resting, the one state that stops the tools', async () => {
  const store = memoryHealth()
  const keys = [key('a'), key('b')]
  const r = await rotate(keys, store, askWith(new Set(['a', 'b'])), { random: () => 0, clock: () => 1_000 })
  expect(r).toMatchObject({ ok: false, reason: 'resting' })
  expect(await healthyKeys(keys, store, 2_000)).toEqual([])
  expect(await rotate([], store, askWith(new Set()), { clock: () => 2_000 })).toMatchObject({ ok: false, reason: 'resting' })
})
