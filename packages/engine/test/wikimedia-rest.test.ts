import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { namedWait, restingFetch, WikimediaRefused, WIKIMEDIA_REST_MAX_MS, WIKIMEDIA_REST_MS } from '../src/wikimedia-rest'

const UA = 'aquatome-engine/0.1 (https://aquatome.com)'
const API = 'https://commons.wikimedia.org/w/api.php?action=query'
const PICTURE = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Fish.jpg'

/** A fetch that answers from a list of statuses and records each request's address and client name. */
function server(statuses: { status: number; retryAfter?: string }[]) {
  const sent: { url: string; ua: string | null }[] = []
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(input), ua: new Headers(init?.headers).get('user-agent') })
    const s = statuses.shift() ?? { status: 200 }
    return new Response('{}', { status: s.status, headers: s.retryAfter ? { 'retry-after': s.retryAfter } : {} })
  }) as typeof globalThis.fetch
  return { fetch, sent }
}

test('a refusal from Wikimedia puts every Wikimedia read to rest, for the time it names or 12 hours, doubling to a day; other hosts never rest', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wm-rest-'))
  const restFile = join(dir, 'rest.json')
  let now = new Date('2026-11-12T13:05:00Z')
  const s = server([{ status: 200 }, { status: 429 }])
  const f = restingFetch(s.fetch, { restFile, now: () => now, ua: UA })

  // Asked as ourselves, whatever name the caller set.
  expect((await f(API, { headers: { 'user-agent': 'Mozilla/5.0' } })).status).toBe(200)
  expect(s.sent[0]).toEqual({ url: API, ua: UA })

  // Refused: 12 hours' rest, and nothing more is sent to any Wikimedia host until then.
  await expect(f(API)).rejects.toBeInstanceOf(WikimediaRefused)
  expect(JSON.parse(await readFile(restFile, 'utf8'))).toEqual({ until: '2026-11-13T01:05:00.000Z', waitMs: WIKIMEDIA_REST_MS })
  await expect(f(PICTURE)).rejects.toThrow('no request before 2026-11-13T01:05:00.000Z')
  await expect(f(API)).rejects.toBeInstanceOf(WikimediaRefused)
  expect(s.sent).toHaveLength(2)
  // Another host is untouched, and keeps its own client name.
  await f('https://api.inaturalist.org/v1/taxa', { headers: { 'user-agent': 'other' } })
  expect(s.sent.at(-1)).toEqual({ url: 'https://api.inaturalist.org/v1/taxa', ua: 'other' })

  // After the rest, one request; refused again, the wait doubles, to a day at most.
  now = new Date('2026-11-13T01:06:00Z')
  const again = server([{ status: 429 }])
  await expect(restingFetch(again.fetch, { restFile, now: () => now, ua: UA })(API)).rejects.toBeInstanceOf(WikimediaRefused)
  expect(again.sent).toHaveLength(1)
  expect(JSON.parse(await readFile(restFile, 'utf8')).waitMs).toBe(WIKIMEDIA_REST_MAX_MS)

  // A wait the refusal names wins; after it, requests go again. Nothing deletes the rest: an ended one is past.
  now = new Date('2026-11-14T02:00:00Z')
  const named = server([{ status: 429, retryAfter: '600' }, { status: 200 }])
  const g = restingFetch(named.fetch, { restFile, now: () => now, ua: UA })
  await expect(g(PICTURE)).rejects.toBeInstanceOf(WikimediaRefused)
  const ended = { until: '2026-11-14T02:10:00.000Z', waitMs: 600_000 }
  expect(JSON.parse(await readFile(restFile, 'utf8'))).toEqual(ended)
  now = new Date('2026-11-14T02:10:01Z')
  expect((await g(PICTURE)).status).toBe(200)
  expect(named.sent).toHaveLength(2)

  // Any other failure is the caller's, as before: no rest.
  const down = server([{ status: 503 }])
  expect((await restingFetch(down.fetch, { restFile, now: () => now, ua: UA })(API)).status).toBe(503)
  expect(JSON.parse(await readFile(restFile, 'utf8'))).toEqual(ended)

  // Refused long after the last rest ended: 12 hours again, not doubled.
  now = new Date('2026-11-20T00:00:00Z')
  await expect(restingFetch(server([{ status: 429 }]).fetch, { restFile, now: () => now, ua: UA })(API)).rejects.toBeInstanceOf(WikimediaRefused)
  expect(JSON.parse(await readFile(restFile, 'utf8'))).toEqual({ until: '2026-11-20T12:00:00.000Z', waitMs: WIKIMEDIA_REST_MS })
})

test("the rest file: a URL is guarded like a string, a file cut short is no rest, and an answer never ends a newer rest", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wm-rest-'))
  const restFile = join(dir, 'rest.json')
  const now = new Date('2026-11-13T02:00:00Z')
  // A URL, as cli.ts passes one: our name, and the rest holds it back too.
  const s = server([{ status: 429 }])
  const f = restingFetch(s.fetch, { restFile, now: () => now, ua: UA })
  await expect(f(new URL(API))).rejects.toBeInstanceOf(WikimediaRefused)
  expect(s.sent).toEqual([{ url: API, ua: UA }])
  await expect(f(new URL(PICTURE))).rejects.toBeInstanceOf(WikimediaRefused)
  expect(s.sent).toHaveLength(1)
  // Cut short or empty: no rest, so the request goes (a refusal would write it again whole).
  for (const bad of ['{"until":', '']) {
    await writeFile(restFile, bad)
    const ok = server([{ status: 200 }])
    expect((await restingFetch(ok.fetch, { restFile, now: () => now, ua: UA })(API)).status).toBe(200)
    expect(ok.sent).toHaveLength(1)
  }
  // After an expired rest, two requests at once: one refused, then the other answered. The new rest stays.
  await writeFile(restFile, JSON.stringify({ until: '2026-11-13T01:00:00.000Z', waitMs: WIKIMEDIA_REST_MS }))
  let open!: () => void
  const gate = new Promise<void>(r => { open = r })
  const both = (async (input: string | URL | Request) => {
    if (String(input) === PICTURE) { await gate; return new Response('', { status: 200 }) }
    return new Response('', { status: 429 })
  }) as typeof globalThis.fetch
  const g = restingFetch(both, { restFile, now: () => now, ua: UA })
  const slow = g(PICTURE)
  await expect(g(API)).rejects.toBeInstanceOf(WikimediaRefused)
  open()
  expect((await slow).status).toBe(200)
  expect(JSON.parse(await readFile(restFile, 'utf8')).until).toBe('2026-11-14T02:00:00.000Z') // refused again after a rest: a day
})

test('a wait is read as seconds or as a date; anything else names none', () => {
  const now = new Date('2026-11-12T13:00:00Z')
  expect(namedWait('120', now)).toBe(120_000)
  expect(namedWait('Thu, 12 Nov 2026 14:00:00 GMT', now)).toBe(3_600_000)
  expect(namedWait('soon', now)).toBeUndefined()
  expect(namedWait(null, now)).toBeUndefined()
})

test("the engine's commands all run behind the rest: cli.ts puts it on the process's fetch before any command", () => {
  const cli = readFileSync(new URL('../src/cli.ts', import.meta.url), 'utf8')
  const at = cli.indexOf('globalThis.fetch = restingFetch(')
  expect(at).toBeGreaterThan(0)
  expect(at).toBeLessThan(cli.indexOf('const cmd = positionals[0]'))
  expect(cli).toContain("restFile: join(homedir(), '.cache/aquatome/wikimedia-rest.json')")
})
