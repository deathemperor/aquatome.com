import type { TankStore } from '@aq/schema'
import { expect, test } from 'vitest'
import { codeInHash, getSession, PENDING, pendingFlow, signInWith, syncOnce } from '../src/scripts/sync'

const at = '2026-10-31T10:00:00.000Z'
const later = '2026-10-31T11:00:00.000Z'
const tank = (n: number, updatedAt = at) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: `Bể ${n}`, species: [], plants: [], createdAt: at, updatedAt })
const store = (...tanks: ReturnType<typeof tank>[]): TankStore => ({ v: 1, tanks, devices: [] })

test("a sync sends this browser's store and keeps the account's, merged with changes made here meanwhile", async () => {
  let local = store(tank(1))
  const sent: unknown[] = []
  const f = async (_: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init!.body)))
    local = store(tank(1), tank(3)) // made here while the request was out
    return Response.json({ store: store(tank(1, later), tank(2)), refused: [] })
  }
  const r = await syncOnce(() => local, f)
  expect(sent).toEqual([{ store: store(tank(1)) }])
  expect(r).toEqual({ store: store(tank(1, later), tank(2), tank(3)), refused: 0 })
})

test('busy (another sync of the account): tried again three times, then reported; offline and signed out are reported', async () => {
  let n = 0
  const waits: number[] = []
  const busy = async () => { n++; return Response.json({ error: 'busy' }, { status: 409 }) }
  expect(await syncOnce(() => store(), busy, async ms => { waits.push(ms) })).toEqual({ error: 'busy' })
  expect([n, waits]).toEqual([4, [500, 1000, 2000]])
  expect(await syncOnce(() => store(), async () => { throw new TypeError('Failed to fetch') })).toEqual({ error: 'offline' })
  expect(await syncOnce(() => store(), async () => Response.json({ error: 'signed_out' }, { status: 401 }))).toEqual({ error: 'signed_out' })
})

test('calls never throw: no session when offline; a sign-in sends the web client and the nonce', async () => {
  expect(await getSession(async () => { throw new TypeError('offline') })).toBeUndefined()
  let body: unknown
  const r = await signInWith('google', 'tok', 'n1', false, async (_, init) => { body = JSON.parse(String(init!.body)); return Response.json({ error: 'bad_nonce' }, { status: 401 }) })
  expect(r).toEqual({ error: 'bad_nonce' })
  expect(body).toEqual({ idToken: 'tok', nonce: 'n1', client: 'web' })
  // Adding it to the account signed in here.
  await signInWith('apple', 'tok', 'n2', true, async (_, init) => { body = JSON.parse(String(init!.body)); return Response.json({}) })
  expect(body).toEqual({ idToken: 'tok', nonce: 'n2', client: 'web', link: true })
})

test('the email sign-in waiting for its code: kept until it expires; the code comes from the link #ma=', () => {
  const data = new Map<string, string>()
  const s = { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => void data.delete(k) }
  data.set(PENDING, JSON.stringify({ flow: 'f1', until: '2026-10-31T10:15:00.000Z' }))
  expect(pendingFlow(s, new Date('2026-10-31T10:14:00.000Z'))).toEqual({ flow: 'f1', until: '2026-10-31T10:15:00.000Z' })
  expect(pendingFlow(s, new Date('2026-10-31T10:16:00.000Z'))).toBeUndefined()
  expect(data.has(PENDING)).toBe(false)
  expect(codeInHash('#ma=012345')).toBe('012345')
  expect(codeInHash('#ma=12345')).toBeUndefined()
  expect(codeInHash('#du-lieu')).toBeUndefined()
})
