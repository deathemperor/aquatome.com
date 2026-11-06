import { expect, test } from 'vitest'
import { APP_PAGES, APP_SWITCH, appPageClosed } from '../app-switch'
import { handle, type Env } from '../index'

// The app's page before the store launch is the owner's (app-switch.ts): anyone without the owner's flag gets a 404.
const OWNER = 'aq_lang=vi; aq_owner=1'
test.each(['off', 'owner', 'on'] as const)('%s: who gets the app page and its files', state => {
  for (const p of APP_PAGES) for (const path of [p, `${p}index.html`, `${p}index.md`]) {
    expect(appPageClosed(path, null, state), path).toBe(state === 'owner')
    expect(appPageClosed(path, 'aq_owner=0; x_aq_owner=1', state), path).toBe(state === 'owner')
    expect(appPageClosed(path, OWNER, state), path).toBe(false)
  }
  // Its badges stay open (a hidden invitation never fetches one), and so does everything else.
  for (const path of ['/ung-dung/app-store-vi.svg', '/cong-cu/', '/id/', '/app/vi.json']) expect(appPageClosed(path, null, state), path).toBe(false)
})

const PAGE = '<!doctype html><html lang="vi"><head><title>t</title></head><body><main>x</main></body></html>'
function env() {
  const asked: string[] = []
  const e = {
    ASSETS: { fetch: async (r: Request) => { asked.push(new URL(r.url).pathname); return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } }) } },
    AB: { get: async () => null, put: async () => {} },
    STAGING: '1',
  } as unknown as Env
  return { e, asked }
}
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, { headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1', 'accept-language': 'vi', ...headers } })

test.runIf(APP_SWITCH === 'owner')('the Worker answers the app page 404 without the owner\'s flag, its markdown too, and the page with it', async () => {
  for (const path of APP_PAGES) {
    const { e, asked } = env()
    const closed = await handle(get(path), e)
    expect(closed.status, path).toBe(404)
    expect(asked, 'the site\'s 404 page, never the app page').toEqual(['/404/'])
    expect(closed.headers.get('cache-control')).toBe('private, max-age=0')
    expect((await handle(get(path, { accept: 'text/markdown' }), e)).status).toBe(404)
    const open = await handle(get(path, { cookie: OWNER }), env().e)
    expect(open.status, path).toBe(200)
    expect(await open.text()).toBe(PAGE)
  }
  expect((await handle(get('/cong-cu/'), env().e)).status).toBe(200)
})
