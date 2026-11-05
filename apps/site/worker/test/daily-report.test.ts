import { afterEach, expect, test, vi } from 'vitest'
import { createSession } from '../accounts/session'
import { ADMIN_PAGES, SECTIONS } from '../dashboard'
import { LOG_PREFIX, LOG_TTL, type Report } from '../daily/log'
import { handle, type Env } from '../index'
import { testD1 } from './d1'
import * as S from './owner-sample'

afterEach(() => { vi.restoreAllMocks() })

const REPO = 'https://github.com/deathemperor/aquatome.com'
const TOKEN = 'dashtoken-0123456789'
const ADDRESS = 'owner@example.com'
const nothing = { total: 0, items: [] }
const runs = { runs: 0, failed: 0 }
const body = (runId = '1001', over: Record<string, unknown> = {}) => JSON.stringify({
  runId, runUrl: `${REPO}/actions/runs/${runId}`, since: '2026-11-05T00:00:00Z', missing: [], merged: nothing, deploys: runs, engine: runs, commits: { total: 0, parts: [] },
  ios: runs, testflight: { uploads: [], failed: 0 }, appStore: runs, watch: runs, failing: [], issues: nothing, notes: 0, prs: { ready: nothing, draft: nothing }, ...over,
})

type Put = { value: string; opts?: { expirationTtl?: number; metadata?: unknown } }
function kv() {
  const m = new Map<string, Put>()
  const ns = {
    get: async (k: string, o?: string | { type?: string }) => {
      const v = m.get(k)?.value
      if (v === undefined) return null
      return (typeof o === 'string' ? o : o?.type) === 'json' ? JSON.parse(v) : v
    },
    put: async (k: string, value: string, opts?: Put['opts']) => { m.set(k, { value, opts }) },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, x]) => ({ name, metadata: x.opts?.metadata })), list_complete: true }),
  } as unknown as KVNamespace
  return { m, ns }
}

function world(over: Record<string, unknown> = {}) {
  const ab = kv()
  const db = testD1()
  const send = vi.fn(async (_m: { to: string; from: { email: string; name: string }; subject: string; text: string; html?: string }) => ({ messageId: 'm1' }))
  const e = {
    ASSETS: { fetch: async () => Response.json(S.STATS) }, AB: ab.ns, DB: db, AB_DASH_TOKEN: TOKEN, REPORT_TO: ADDRESS, EMAIL: { send }, OWNER_ACCOUNTS: 'owner-1', ...over,
  } as unknown as Env
  return { e, ab, db, send }
}
const post = (e: Env, b = body(), headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) => handle(new Request('https://x.test/_ab/report', { method: 'POST', headers, body: b }), e)
const stored = (w: ReturnType<typeof world>, id = '1001') => JSON.parse(w.ab.m.get(`${LOG_PREFIX}${id}`)!.value) as Report

test('POST /_ab/report: the dashboard token only; anyone else is not found, and nothing happens', async () => {
  const w = world()
  const db = w.db
  await db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('owner-1', '2026-11-01T00:00:00Z').run()
  const now = new Date()
  const cookie = `__Host-aq_session=${await createSession(db, 'owner-1', 'web', now)}`
  const app = await createSession(db, 'owner-1', 'app', now)
  for (const h of [{}, { authorization: 'Bearer wrong' }, { authorization: `Bearer ${TOKEN}x` }, { authorization: TOKEN.slice(0, 5) }, { cookie }, { authorization: `Bearer ${app}` }] as Record<string, string>[]) {
    const r = await post(w.e, body(), h)
    expect(r.status, JSON.stringify(Object.keys(h))).toBe(404)
    expect(r.headers.get('cache-control')).toBe('no-store')
  }
  expect(w.send).not.toHaveBeenCalled()
  expect(w.ab.m.size).toBe(0)
  // Any other method, even with the token; and no token set means no way in.
  expect((await handle(new Request('https://x.test/_ab/report', { headers: { authorization: `Bearer ${TOKEN}` } }), w.e)).status).toBe(404)
  expect((await post(world({ AB_DASH_TOKEN: undefined }).e, body(), { authorization: 'Bearer ' })).status).toBe(404)
  const ok = await post(w.e)
  expect(ok.status).toBe(200)
  expect(await ok.json()).toEqual({ ok: true, id: '1001', sent: true })
  expect(w.send).toHaveBeenCalledTimes(1)
})

test('a body of the wrong shape, or too large, is refused and nothing is stored or sent', async () => {
  const w = world()
  for (const b of ['not json', '{}', body('abc'), body('1', { runUrl: 'https://evil.test/x' })]) expect((await post(w.e, b)).status, b.slice(0, 40)).toBe(400)
  expect((await post(w.e, 'x'.repeat(128 * 1024 + 1))).status).toBe(413)
  expect(w.ab.m.size).toBe(0)
  expect(w.send).not.toHaveBeenCalled()
})

test('the send: from the report\'s own sender to REPORT_TO, text and HTML; the same report in the log for 90 days', async () => {
  const w = world()
  expect((await post(w.e, body('1001', { merged: { total: 1, items: [{ number: 575, title: 'docs: x', url: `${REPO}/pull/575` }] } }))).status).toBe(200)
  const mail = w.send.mock.calls[0]![0]
  expect(mail.to).toBe(ADDRESS)
  expect(mail.from).toEqual({ email: 'bao-cao@aquatome.com', name: 'AquaTome' })
  expect(mail.subject).toMatch(/^AquaTome daily · \d+ \w+ · \d+ needs? care$/)
  expect(mail.text).toContain('#575 docs: x')
  expect(mail.html).toContain(`<a href="${REPO}/pull/575"`)
  const put = w.ab.m.get(`${LOG_PREFIX}1001`)!
  expect(put.opts?.expirationTtl).toBe(90 * 86_400)
  expect(LOG_TTL).toBe(90 * 86_400)
  const r = JSON.parse(put.value) as Report
  expect(r).toMatchObject({ subject: mail.subject, text: mail.text, html: mail.html, sent: true })
  expect(r).not.toHaveProperty('why')
  expect(Date.parse(r.when)).toBeGreaterThan(0)
  expect(put.opts?.metadata).toEqual({ when: r.when, subject: r.subject, sent: true, care: r.care })
})

test('the sender is one the binding allows', async () => {
  const { readFileSync } = await import('node:fs')
  const wrangler = readFileSync(new URL('../../wrangler.jsonc', import.meta.url).pathname, 'utf8')
  expect(wrangler).toMatch(/"allowed_sender_addresses": \[[^\]]*"bao-cao@aquatome\.com"/)
})

test('no REPORT_TO: kept in the log as not sent, no recipient, and answered 200; sent once it is set', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world({ REPORT_TO: undefined })
  const r = await post(w.e)
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ ok: true, id: '1001', sent: false, why: 'no_recipient' })
  expect(w.send).not.toHaveBeenCalled()
  expect(stored(w)).toMatchObject({ sent: false, why: 'no_recipient' })
  // The job run again, same id: still nothing to send, still one report.
  expect((await post(w.e)).status).toBe(200)
  expect([...w.ab.m.keys()].filter(k => k.startsWith(LOG_PREFIX))).toHaveLength(1)
  const first = stored(w)
  ;(w.e as unknown as { REPORT_TO: string }).REPORT_TO = ADDRESS
  expect(await (await post(w.e)).json()).toEqual({ ok: true, id: '1001', sent: true })
  expect(w.send.mock.calls[0]![0].text).toBe(first.text)
  expect(stored(w)).toMatchObject({ sent: true, when: first.when })
  expect(stored(w)).not.toHaveProperty('why')
  log.mockRestore()
})

test('no EMAIL binding: not sent, said so, and the job fails', async () => {
  const w = world({ EMAIL: undefined })
  const r = await post(w.e)
  expect(r.status).toBe(502)
  expect(await r.json()).toEqual({ ok: false, id: '1001', sent: false, why: 'no_binding' })
  expect(stored(w).why).toBe('no_binding')
})

test('the same run id never sends twice: after the send, and at the same moment', async () => {
  const w = world()
  await post(w.e)
  const again = await post(w.e)
  expect(again.status).toBe(200)
  expect(await again.json()).toEqual({ ok: true, id: '1001', sent: true, duplicate: true })
  expect(w.send).toHaveBeenCalledTimes(1)
  // Two at once (a retry while the first still runs): one goes on, the other is told to wait.
  const x = world()
  const both = await Promise.all([post(x.e, body('2002')), post(x.e, body('2002'))])
  expect(both.map(r => r.status).sort()).toEqual([200, 409])
  expect(x.send).toHaveBeenCalledTimes(1)
  // A later run is a new report.
  await post(w.e, body('1002'))
  expect(w.send).toHaveBeenCalledTimes(2)
})

test('a report sent but not logged is not sent again', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world()
  const put = w.ab.ns.put
  const down = vi.fn(async () => { throw new Error('KV 429') })
  const e = { ...w.e, AB: Object.assign(Object.create(w.ab.ns), { put: down }) } as unknown as Env
  expect((await post(e)).status).toBe(503)
  expect(w.send).toHaveBeenCalledTimes(1)
  // The claim stays: the retry is told a try is in progress, and the job shows it.
  expect((await post({ ...w.e, AB: { ...w.ab.ns, put } } as unknown as Env)).status).toBe(409)
  expect(w.send).toHaveBeenCalledTimes(1)
  log.mockRestore()
})

test('a refused send: logged by its code only, kept as not sent, the job told; the next try sends the same report', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world()
  w.send.mockRejectedValueOnce(Object.assign(new Error(`can't send to ${ADDRESS}`), { code: 'E_RECIPIENT_NOT_ALLOWED' }))
  const r = await post(w.e)
  expect(r.status).toBe(502)
  expect(await r.json()).toEqual({ ok: false, id: '1001', sent: false, why: 'E_RECIPIENT_NOT_ALLOWED' })
  expect(log).toHaveBeenCalledWith('daily report not sent:', 'E_RECIPIENT_NOT_ALLOWED')
  const first = stored(w)
  expect(first).toMatchObject({ sent: false, why: 'E_RECIPIENT_NOT_ALLOWED' })
  expect((await post(w.e)).status).toBe(200)
  expect(w.send).toHaveBeenCalledTimes(2)
  expect(w.send.mock.calls[1]![0].text).toBe(first.text)
  expect(stored(w)).toMatchObject({ sent: true, when: first.when })
  // An error with no code, or a "code" that isn't one, is unknown.
  for (const code of [undefined, ADDRESS, 'x'.repeat(41)]) {
    const x = world()
    x.send.mockRejectedValueOnce(Object.assign(new Error(ADDRESS), { code }))
    expect(await (await post(x.e)).json()).toMatchObject({ why: 'unknown' })
  }
})

test('the recipient reaches the send and nothing else: no log line, stored report, answer or claim', async () => {
  const lines: unknown[][] = []
  for (const k of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => { lines.push(a) })
  const sentBody = world()
  const answers = [await (await post(sentBody.e)).text()]
  const refused = world()
  refused.send.mockRejectedValue(Object.assign(new Error(`refused ${ADDRESS}`), { code: 'E_DELIVERY_FAILED' }))
  answers.push(await (await post(refused.e)).text())
  const parts = world({ AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(`no ${ADDRESS}`, { status: 500 }))
  answers.push(await (await post(parts.e)).text())
  expect(lines.length).toBeGreaterThan(0)
  const everything = JSON.stringify([
    answers, [...sentBody.ab.m], [...refused.ab.m],
    await sentBody.db.prepare('SELECT * FROM rate_limits').all().then(r => r.results),
    lines.filter(l => l[0] === 'daily report not sent:' || l[0] === 'daily report failed:'),
  ])
  expect(everything).not.toContain(ADDRESS)
  expect(sentBody.send.mock.calls[0]![0].to).toBe(ADDRESS)
  // What a stored report says about addresses at all.
  for (const [k, v] of sentBody.ab.m) if (k.startsWith(LOG_PREFIX)) expect(v.value).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
})

test('the numbers come from the dashboard\'s loaders, in Vietnam\'s days; a part that can\'t load is said, the report still goes', async () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const w = world({ AE_API_TOKEN: 'ae', CF_ACCOUNT_ID: 'acc' })
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('down', { status: 500 }))
  expect((await post(w.e)).status).toBe(200)
  expect(fetch).toHaveBeenCalled()
  const r = stored(w)
  expect(r.text).toContain('Could not load readers')
  expect(r.text).toContain('Could not load the app\'s telemetry')
  err.mockRestore()
  // No Analytics Engine yet: the app's line says so too.
  const x = world()
  await post(x.e)
  expect(stored(x).text).toContain('Could not load the app\'s telemetry')
})

// ——— The log on the dashboard ———

const browser = { 'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36', 'accept-language': 'vi' }
async function owner(w: ReturnType<typeof world>) {
  await w.db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('owner-1', '2026-11-01T00:00:00Z').run()
  await w.db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind('reader-1', '2026-11-01T00:00:00Z').run()
  const now = new Date()
  return { owner: `__Host-aq_session=${await createSession(w.db, 'owner-1', 'web', now)}`, reader: `__Host-aq_session=${await createSession(w.db, 'reader-1', 'web', now)}` }
}
const open = (e: Env, path: string, cookie?: string) => handle(new Request(`https://x.test${path}`, { headers: { ...browser, ...(cookie ? { cookie } : {}) } }), e)
const keep = (w: ReturnType<typeof world>, id: string, r: Partial<Report>) => {
  const full = { when: '2026-11-05T00:00:00.000Z', subject: 's', sent: true, care: 0, text: 't', html: '<div>h</div>', ...r }
  const { when, subject, sent, why, care } = full as Report
  w.ab.m.set(`${LOG_PREFIX}${id}`, { value: JSON.stringify(full), opts: { metadata: { when, subject, sent, ...(why ? { why } : {}), care } } })
}

test('the log: nothing yet', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  const r = await open(w.e, '/_ab/bao-cao/', c)
  expect(r.status).toBe(200)
  expect([r.headers.get('cache-control'), r.headers.get('x-robots-tag')]).toEqual(['no-store', 'noindex, nofollow'])
  const html = await r.text()
  expect(html).toContain('<h1>Báo cáo hằng ngày</h1>')
  expect(html).toContain('aria-current="page">Báo cáo hằng ngày<')
  expect(html).toContain('Chưa có báo cáo nào.')
})

test('the log: newest first, date and time, sent or why not, subject and how many need care; each opens the report as it was sent', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  keep(w, '1001', { when: '2026-11-04T00:00:00.000Z', subject: 'AquaTome daily · 4 Nov · nothing needs care', care: 0 })
  keep(w, '1003', { when: '2026-11-06T00:00:00.000Z', subject: 'AquaTome daily · 6 Nov · 2 need care', care: 2, sent: false, why: 'no_recipient', html: '<div style="color:#000">the mail <b>as sent</b></div>', text: 'the mail as text & all' })
  keep(w, '1002', { when: '2026-11-05T00:00:00.000Z', subject: 'AquaTome daily · 5 Nov <b>', care: 1, sent: false, why: 'E_RECIPIENT_NOT_ALLOWED' })
  const list = await (await open(w.e, '/_ab/bao-cao', c)).text()
  const rows = list.split('<ul class="areas">')[1]!.split('</li>').slice(0, 3)
  expect(rows[0]).toContain('2 need care')
  expect(rows[0]).toContain('Chưa gửi')
  expect(rows[0]).toContain('chưa có người nhận')
  expect(rows[0]).toContain('href="/_ab/bao-cao/1003/"')
  expect(rows[0]).toContain('2 cần xử lý')
  expect(rows[0]).toContain('<time datetime="2026-11-06T00:00:00.000Z">')
  expect(rows[1]).toContain('<code>E_RECIPIENT_NOT_ALLOWED</code>')
  expect(rows[1]).toContain('5 Nov &lt;b&gt;')
  expect(rows[2]).toContain('Đã gửi')
  const one = await open(w.e, '/_ab/bao-cao/1003/', c)
  expect(one.status).toBe(200)
  const page = await one.text()
  expect(page).toContain('<div class="mail"><div style="color:#000">the mail <b>as sent</b></div></div>')
  expect(page).toContain('the mail as text &amp; all')
  expect(page).toContain('href="/_ab/bao-cao/"')
  expect((await open(w.e, '/_ab/bao-cao/999/', c)).status).toBe(404)
  expect((await open(w.e, '/_ab/bao-cao/abc/', c)).status).toBe(404)
})

test('the log after a real report: the page shows what was sent', async () => {
  const w = world()
  const { owner: c } = await owner(w)
  await post(w.e)
  const list = await (await open(w.e, '/_ab/bao-cao/', c)).text()
  expect(list).toContain('Đã gửi')
  expect(list).toContain('href="/_ab/bao-cao/1001/"')
  expect(await (await open(w.e, '/_ab/bao-cao/1001/', c)).text()).toContain(stored(w).html)
})

test('the log opens only to the owner\'s account signed in on the web', async () => {
  const w = world()
  const { reader } = await owner(w)
  keep(w, '1001', { subject: 'secret subject', html: '<div>secret mail</div>' })
  for (const path of ['/_ab/bao-cao/', '/_ab/bao-cao/1001/']) {
    for (const [cookie, status] of [[undefined, 200], [reader, 403]] as const) {
      const r = await open(w.e, path, cookie)
      const html = await r.text()
      expect(r.status, path).toBe(status)
      expect(html, path).not.toContain('secret')
      expect(html, path).not.toContain('Các mục quản trị')
    }
    // A token opens no page.
    expect(await (await handle(new Request(`https://x.test${path}`, { headers: { ...browser, authorization: `Bearer ${TOKEN}` } }), w.e)).text(), path).not.toContain('secret')
  }
})

test('the app\'s contract holds: the log is on the web dashboard only, reached from its rail and the overview', async () => {
  // SECTIONS is what GET /api/owner/dashboard lists and the iOS app draws (protocols/owner-dashboard.openapi.json).
  expect(SECTIONS.map(s => s.key)).not.toContain('bao-cao')
  expect(ADMIN_PAGES).not.toContain('/_ab/bao-cao/' as never)
  const w = world()
  const { owner: c } = await owner(w)
  for (const page of ['/_ab/', '/_ab/an-trang/']) expect(await (await open(w.e, page, c)).text(), page).toContain('<li><a href="/_ab/bao-cao/">Báo cáo hằng ngày</a></li>')
  // A phone's overview hides the rail: the page itself links it.
  expect((await (await open(w.e, '/_ab/', c)).text()).split('<main>')[1]).toContain('href="/_ab/bao-cao/"')
})
