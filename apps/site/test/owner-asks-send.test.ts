import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { sendOnce } from '../../../scripts/owner-asks-send.mjs'

// The job on the Mac that sends the chief of staff's list of the owner's asks to the dashboard (admin/asks.ts): only a
// changed file goes, and its result file says what happened without the list's words. Made-up rows only.
const dir = mkdtempSync(join(tmpdir(), 'owner-asks-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const LIST = { today: '2026-11-17', updated: 'Tue 17 Nov 18:00', rows: [{ ask: 'A made-up ask', words: 'secret words', asked: ['15 Nov'], lead: 'Site', state: 'open', due: '', now: '' }], parked: [], rules: [] }

/** The site as the job sees it: each PUT it gets, and the answer it gives. */
function site(answer: () => Response | Promise<Response>) {
  const calls: { url: string; token: string | null; body: { modified: string; list: unknown } }[] = []
  const http = (async (url: string, o: RequestInit) => {
    calls.push({ url, token: new Headers(o.headers).get('authorization'), body: JSON.parse(String(o.body)) })
    return answer()
  }) as typeof fetch
  return { calls, http }
}

function files(name: string) {
  const list = join(dir, `${name}.json`), result = join(dir, `${name}-sent.json`)
  writeFileSync(list, JSON.stringify(LIST))
  utimesSync(list, new Date('2026-11-17T11:00:00Z'), new Date('2026-11-17T11:00:00Z'))
  return { list, result, read: () => JSON.parse(readFileSync(result, 'utf8')) }
}

test('a changed list goes once, with the token and the file\'s time; the same file again sends nothing', async () => {
  const f = files('once')
  const s = site(() => Response.json({ ok: true, rows: 1, parked: 0 }))
  const one = await sendOnce({ site: 'https://x.test', list: f.list, result: f.result, token: 'tok', http: s.http, now: () => new Date('2026-11-17T11:01:00Z') })
  expect(one).toMatchObject({ result: 'sent', sent: '2026-11-17T11:01:00.000Z' })
  expect(s.calls).toEqual([{ url: 'https://x.test/_ab/asks', token: 'Bearer tok', body: { modified: '2026-11-17T11:00:00.000Z', list: LIST } }])
  const two = await sendOnce({ site: 'https://x.test', list: f.list, result: f.result, token: 'tok', http: s.http, now: () => new Date('2026-11-17T11:02:00Z') })
  expect(two).toMatchObject({ result: 'unchanged', sent: '2026-11-17T11:01:00.000Z' })
  expect(s.calls).toHaveLength(1)
  writeFileSync(f.list, JSON.stringify({ ...LIST, updated: 'Tue 17 Nov 19:00' }))
  expect(await sendOnce({ site: 'https://x.test', list: f.list, result: f.result, token: 'tok', http: s.http })).toMatchObject({ result: 'sent' })
  expect(s.calls).toHaveLength(2)
  // The result file is for a watch: what happened, never the list's words.
  expect(readFileSync(f.result, 'utf8')).not.toMatch(/made-up|secret words/)
})

test('a list the site refuses is kept as refused, with why, and not sent again until it changes', async () => {
  const f = files('refused')
  const s = site(() => Response.json({ error: 'refused', why: "rows 1's state isn't one of late, …" }, { status: 400 }))
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: s.http })).toMatchObject({ result: 'refused', why: "rows 1's state isn't one of late, …" })
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: s.http })).toMatchObject({ result: 'refused', why: "rows 1's state isn't one of late, …" })
  expect(s.calls).toHaveLength(1)
  writeFileSync(f.list, '{ not json')
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: s.http })).toMatchObject({ result: 'refused', why: "the list isn't JSON" })
  expect(s.calls).toHaveLength(1)
})

test('no answer, or any other answer, fails and tries again next run', async () => {
  const f = files('failed')
  let down = true
  const s = site(() => (down ? Promise.reject(new TypeError('fetch failed')) : Response.json({ ok: true })))
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: s.http })).toMatchObject({ result: 'failed', why: 'no answer: TypeError' })
  down = false
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: s.http })).toMatchObject({ result: 'sent' })
  expect(s.calls).toHaveLength(2)
  const t = site(() => new Response('', { status: 503 }))
  writeFileSync(f.list, JSON.stringify({ ...LIST, today: '2026-11-18' }))
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: t.http })).toMatchObject({ result: 'failed', why: 'HTTP 503' })
  expect(await sendOnce({ list: f.list, result: f.result, token: 'tok', http: t.http })).toMatchObject({ result: 'failed' })
  expect(t.calls).toHaveLength(2)
})
