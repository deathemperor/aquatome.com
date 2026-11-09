import { expect, test } from 'vitest'
import { Ledger, MAX_EARLY_STOPS, STALE_MS, type AdmitInput } from '../fishid/ledger'
import { memoryStorage } from './ledger'

const DAY = '2026-11-05'
const base: AdmitInput = { day: DAY, reader: 'fishid:ip:r1', perReader: 10, perDay: 300, usdCap: 15, reserve: 0.5, healthy: true }
/** A ledger over a storage that waits a turn on every read and write, so parallel requests really interleave. */
const slow = () => {
  const storage = memoryStorage({ slow: true })
  let id = 0
  return { storage, ledger: new Ledger(storage, () => `run-${++id}`) }
}
const saved = (storage: ReturnType<typeof memoryStorage>, d = DAY) => storage.m.get(`day:${d}`) as { calls: number; usd: number; readers: Record<string, number>; runs: Record<string, unknown>; keys: Record<string, number>; ok: Record<string, number> }

test('parallel admission at a limit admits exactly what the limit allows: a reader\'s day, the site\'s day, the site\'s spend', async () => {
  const one = slow()
  const reader = await Promise.all(Array.from({ length: 6 }, () => one.ledger.admit({ ...base, perReader: 1 })))
  expect(reader.filter(a => a.ok)).toHaveLength(1)
  expect(reader.filter(a => !a.ok)).toEqual(Array(5).fill({ ok: false, error: 'rate', limit: 1 }))
  expect(saved(one.storage).readers).toEqual({ 'fishid:ip:r1': 1 })

  const site = slow()
  const day = await Promise.all(Array.from({ length: 6 }, (_, i) => site.ledger.admit({ ...base, reader: `fishid:ip:r${i}`, perDay: 2 })))
  expect(day.map(a => (a.ok ? 'ok' : a.error))).toEqual(['ok', 'ok', 'busy', 'busy', 'busy', 'busy'])
  expect(saved(site.storage).calls).toBe(2)

  // $1.20 left under the cap and $0.50 reserved each: two runs fit, the third would pass the cap.
  const spend = slow()
  spend.storage.m.set(`day:${DAY}`, { calls: 0, keys: {}, ok: {}, usd: 13.8, readers: {}, refunds: {}, runs: {}, counts: {} })
  const usd = await Promise.all(Array.from({ length: 5 }, (_, i) => spend.ledger.admit({ ...base, reader: `fishid:ip:r${i}` })))
  expect(usd.map(a => (a.ok ? 'ok' : a.error))).toEqual(['ok', 'ok', 'busy', 'busy', 'busy'])
  expect(saved(spend.storage).usd).toBeCloseTo(14.8, 10)
})

test('in order: the reader\'s day, then the site\'s, then whether a key is healthy; a refusal counts nothing', async () => {
  const { storage, ledger } = slow()
  expect(await ledger.admit({ ...base, healthy: false })).toEqual({ ok: false, error: 'resting' })
  expect(saved(storage)).toBeUndefined()
  expect(await ledger.admit({ ...base, perReader: 0, perDay: 0 })).toEqual({ ok: false, error: 'rate', limit: 0 })
  expect(await ledger.admit({ ...base, perDay: 0, healthy: false })).toEqual({ ok: false, error: 'busy' })
})

test('parallel settles and spends: every call and key counted once, the day\'s spend what the calls cost, no run left open', async () => {
  const { storage, ledger } = slow()
  const runs = await Promise.all(Array.from({ length: 5 }, (_, i) => ledger.admit({ ...base, reader: `fishid:ip:r${i}` })))
  const ids = runs.map(r => (r.ok ? r.run : ''))
  expect(saved(storage).usd).toBeCloseTo(2.5, 10)
  await Promise.all(ids.flatMap(id => [ledger.spend(DAY, id, 0.01), ledger.spend(DAY, id, 0.02)]))
  await Promise.all(ids.map((id, i) => ledger.settle({ day: DAY, run: id, refund: false, keys: { a: 1, ...(i % 2 ? { b: 1 } : {}) }, ok: 'a', counts: { fallback: i === 0 ? 1 : 0 } })))
  const day = saved(storage)
  expect(day).toMatchObject({ calls: 5, keys: { a: 5, b: 2 }, ok: { a: 5 }, runs: {} })
  expect(day.usd).toBeCloseTo(0.15, 10)
  expect((await ledger.read(DAY))).toMatchObject({ calls: 5, open: 0, counts: { fallback: 1, refunds: 0 }, mostRefunds: 0 })
})

test('a run that spends past its reservation raises it; a spend after the settle still counts; a run cut off keeps what it spent', async () => {
  let now = 0
  const storage = memoryStorage()
  const ledger = new Ledger(storage, () => `run-${now}`, () => now)
  const a = await ledger.admit({ ...base, reserve: 0.1 })
  if (!a.ok) throw new Error('not admitted')
  await ledger.spend(DAY, a.run, 0.08)
  await ledger.spend(DAY, a.run, 0.07)
  expect(saved(storage).usd).toBeCloseTo(0.15, 10)
  await ledger.settle({ day: DAY, run: a.run, refund: false, keys: {} })
  await ledger.spend(DAY, a.run, 0.05) // landed after the settle
  expect(saved(storage).usd).toBeCloseTo(0.2, 10)

  // Cut off: spent 0.03 of its 0.5, never settled. Its spend stays; once it's stale the next admission frees the rest.
  now = 1
  const cut = await ledger.admit({ ...base, reader: 'fishid:ip:r2' })
  if (!cut.ok) throw new Error('not admitted')
  await ledger.spend(DAY, cut.run, 0.03)
  expect(saved(storage).usd).toBeCloseTo(0.7, 10)
  now = 1 + STALE_MS / 2
  await ledger.admit({ ...base, reader: 'fishid:ip:r3', reserve: 0 })
  expect(saved(storage).usd).toBeCloseTo(0.7, 10)
  now = 2 + STALE_MS
  await ledger.admit({ ...base, reader: 'fishid:ip:r4', reserve: 0 })
  expect(saved(storage).usd).toBeCloseTo(0.23, 10)
  expect(Object.keys(saved(storage).runs)).not.toContain(cut.run)
  // Its reader's count was never given back.
  expect(saved(storage).readers['fishid:ip:r2']).toBe(1)
})

test('a refund only when the settle says so: the reader\'s count goes back, and the dashboard sees how many and the most one reader had', async () => {
  const { storage, ledger } = slow()
  const ids: string[] = []
  for (const reader of ['fishid:ip:r1', 'fishid:ip:r1', 'fishid:ip:r2']) { const a = await ledger.admit({ ...base, reader }); if (a.ok) ids.push(a.run) }
  await ledger.settle({ day: DAY, run: ids[0]!, refund: true, keys: {} })
  await ledger.settle({ day: DAY, run: ids[1]!, refund: true, keys: {} })
  await ledger.settle({ day: DAY, run: ids[2]!, refund: false, keys: {} })
  expect(saved(storage).readers).toEqual({ 'fishid:ip:r1': 0, 'fishid:ip:r2': 1 })
  expect(saved(storage).calls).toBe(3) // the site's day keeps them
  expect(await ledger.read(DAY)).toMatchObject({ counts: { refunds: 2 }, mostRefunds: 2 })
  // A settle for a run it doesn't know (twice, or made up) changes nothing.
  await ledger.settle({ day: DAY, run: ids[0]!, refund: true, keys: { x: 1 } })
  expect(saved(storage).readers['fishid:ip:r1']).toBe(0)
  expect(saved(storage).keys).toEqual({})
})

test('days: a new day starts empty, and days past the last three are cleared', async () => {
  const storage = memoryStorage()
  for (const d of ['2026-10-30', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']) storage.m.set(`day:${d}`, { calls: 1 })
  const ledger = new Ledger(storage)
  expect(await ledger.read(DAY)).toMatchObject({ calls: 0, usd: 0, open: 0 })
  expect([...storage.m.keys()].sort()).toEqual(['day:2026-11-03', 'day:2026-11-04'])
})

test('chat\'s questions count against chat\'s own day, not the identifications\'; the dollar cap is the one both share', async () => {
  const { ledger, storage } = slow()
  const chat = await Promise.all(Array.from({ length: 4 }, (_, i) => ledger.admit({ ...base, reader: `chat:acct:a${i}`, perDay: 2, kind: 'chat' })))
  expect(chat.map(a => (a.ok ? 'ok' : a.error))).toEqual(['ok', 'ok', 'busy', 'busy'])
  // Chat's day is full; an identification is still admitted, under its own day.
  expect((await ledger.admit({ ...base, perDay: 1 })).ok).toBe(true)
  expect(saved(storage)).toMatchObject({ calls: 1, chat: 2, usd: 1.5 })
  expect(await ledger.read(DAY)).toMatchObject({ calls: 1, chat: 2 })
  // The shared cap: $13.50 spent or reserved by both, so a chat question reserving $2 is busy.
  storage.m.set(`day:${DAY}`, { ...saved(storage), usd: 13.5 })
  const fresh = new Ledger(storage, () => 'run-x')
  expect(await fresh.admit({ ...base, reader: 'chat:acct:z', perDay: 100, reserve: 2, kind: 'chat' })).toEqual({ ok: false, error: 'busy' })
})

test('a stop that comes before its question holds, its question dated either side of midnight', async () => {
  for (const [stop, asked] of [['2026-03-02', '2026-03-01'], ['2026-03-01', '2026-03-02']] as const) {
    const ledger = new Ledger(memoryStorage(), () => 'run')
    expect(await ledger.cancel({ day: stop, key: 'a:k', free: 10 })).toEqual({ result: 'cancelled', counted: false })
    expect(await ledger.admit({ ...base, day: asked, key: 'a:k' })).toEqual({ ok: false, error: 'cancelled', counted: false })
  }
})

test('stops of questions that haven\'t come are bounded, so they can\'t fill the day; a stop of a running question isn\'t', async () => {
  const ledger = new Ledger(memoryStorage(), () => 'run')
  for (let i = 0; i < MAX_EARLY_STOPS; i++) await ledger.cancel({ day: DAY, key: `a:${i}`, free: 10 })
  expect(await ledger.cancel({ day: DAY, key: 'a:past', free: 10 })).toEqual({ result: 'too late' })
  expect(await ledger.admit({ ...base, key: 'a:past' })).toMatchObject({ ok: true })
  expect(await ledger.cancel({ day: DAY, key: 'a:past', free: 10 })).toMatchObject({ result: 'cancelled', freeLeft: 9 })
})
