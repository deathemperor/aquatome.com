import { runInNewContext } from 'node:vm'
import { expect, test } from 'vitest'
import { beaconScript, NOCOUNT, VID, VID_MS } from '../src/lib/beacon'

// The beacon, run as a browser would run it, with the visitor switch on and off (src/lib/beacon.ts).

type Sent = { p: string; t: string; v: number; sid: string; r: string; u?: string }
function run(on: boolean, o: { local?: Record<string, string> | 'blocked'; gpc?: boolean; dnt?: string; now?: number } = {}) {
  const sent: Sent[] = []
  const clicks: ((e: unknown) => void)[] = []
  const store = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) } })
  const local = o.local === 'blocked' ? undefined : new Map(Object.entries(o.local ?? {}))
  const window: Record<string, unknown> = {
    sessionStorage: store(new Map()),
    navigator: { sendBeacon: (_: string, body: string) => { sent.push(JSON.parse(body)); return true }, globalPrivacyControl: o.gpc, doNotTrack: o.dnt ?? null },
    location: { pathname: '/ca/ca-betta/', hostname: 'aquatome.com' },
    document: { documentElement: { scrollHeight: 1000 }, referrer: '', prerendering: false, visibilityState: 'visible', addEventListener: (t: string, f: (e: unknown) => void) => { if (t === 'click') clicks.push(f) } },
    addEventListener: () => {}, setTimeout: () => 0, scrollY: 0, innerHeight: 800, URL,
    Date: { now: () => o.now ?? Date.parse('2026-11-08T00:00:00Z') }, Math, JSON,
  }
  Object.defineProperty(window, 'localStorage', { get: () => { if (!local) throw new Error('SecurityError'); return store(local) } })
  runInNewContext(beaconScript(on), window)
  // closest() as a browser answers it, for the two selectors the beacons use.
  type El = { rel?: string; dataset?: Record<string, string> }
  const matches = (el: El, sel: string) => (/\[rel~=sponsored\]/.test(sel) && /\bsponsored\b/.test(el.rel ?? '')) || (sel.includes('[data-ev]') && Boolean(el.dataset?.ev))
  const click = (el: El) => clicks.forEach(f => f({ target: { closest: (sel: string) => (matches(el, sel) ? el : null) } }))
  return { sent, local, click }
}

test('both beacons stay small: the switch off is today\'s beacon, on adds the visitor code and the click hook', () => {
  expect(beaconScript(false).length).toBeLessThan(1500)
  expect(beaconScript(true).length).toBeLessThan(1500)
  expect(beaconScript(false)).not.toContain(VID)
  expect(beaconScript(false)).not.toContain('data-ev')
})

test('switch off: no visitor code, local storage never touched, no click but a shop link\'s', () => {
  const { sent, local, click } = run(false, { local: {} })
  expect(sent).toEqual([{ p: '/ca/ca-betta/', t: 'view', v: 1, sid: expect.stringMatching(/^[a-z0-9]{12}$/), r: '' }])
  expect(local!.size).toBe(0)
  click({ dataset: { ev: 'tank' } })
  click({ rel: 'sponsored nofollow', dataset: {} })
  expect(sent.map(s => s.t)).toEqual(['view', 'aff'])
})

test('switch on: a visitor code made once, kept, sent with each event, and replaced after 13 months', () => {
  const first = run(true, { local: {} })
  const u = first.sent[0]!.u!
  expect(u).toMatch(/^[a-z0-9]{4,12}$/)
  expect(first.local!.get(VID)).toBe(`${u}.${Date.parse('2026-11-08T00:00:00Z')}`)
  // The next page: the same code.
  const again = run(true, { local: Object.fromEntries(first.local!) })
  expect(again.sent[0]!.u).toBe(u)
  // 13 months on: a new one.
  const later = run(true, { local: Object.fromEntries(first.local!), now: Date.parse('2026-11-08T00:00:00Z') + VID_MS + 1 })
  expect(later.sent[0]!.u).not.toBe(u)
  // Clicks: "add to tank", a source link, a shop link.
  first.click({ dataset: { ev: 'tank' } })
  first.click({ dataset: { ev: 'src' }, rel: 'noopener' })
  first.click({ rel: 'sponsored', dataset: {} })
  expect(first.sent.map(s => [s.t, s.u])).toEqual([['view', u], ['tank', u], ['src', u], ['aff', u]])
})

test('switch on: no code with Global Privacy Control or Do Not Track, none when storage is blocked; the tab still counts', () => {
  for (const o of [{ gpc: true }, { dnt: '1' }]) {
    const { sent, local } = run(true, { local: {}, ...o })
    expect([sent.length, sent[0]!.u, local!.size]).toEqual([1, '', 0])
  }
  const blocked = run(true, { local: 'blocked' })
  expect(blocked.sent).toHaveLength(1)
  expect(blocked.sent[0]!.u).toBe('')
})

test('switch on: «Không đếm tôi» (aq_nocount) stops every event, in a tab already open too', () => {
  const { sent, click } = run(true, { local: { [NOCOUNT]: '1' } })
  click({ dataset: { ev: 'tank' } })
  expect(sent).toEqual([])
  // Pressed while a page is open: its next events aren't sent; pressed again, they are, without the deleted code.
  const open = run(true, { local: {} })
  open.local!.set(NOCOUNT, '1')
  open.local!.delete(VID)
  open.click({ dataset: { ev: 'tank' } })
  expect(open.sent.map(s => s.t)).toEqual(['view'])
  open.local!.delete(NOCOUNT)
  open.click({ dataset: { ev: 'src' } })
  expect(open.sent.map(s => [s.t, s.u])).toEqual([['view', open.sent[0]!.u], ['src', '']])
  // A code made before Global Privacy Control was turned on is never sent.
  const gpc = run(true, { local: { [VID]: `abcd1234.${Date.parse('2026-11-01T00:00:00Z')}` }, gpc: true })
  gpc.click({ dataset: { ev: 'tank' } })
  expect(gpc.sent.map(s => s.u)).toEqual(['', ''])
})
