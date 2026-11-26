import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { LANG, OTHER_LANGS } from '@aq/schema/langs'
import { expect, test } from 'vitest'
import { handle, type Env } from '../index'
import { VI_SECTIONS } from '../paths'

const ORIGIN = 'https://aquatome.com'
const request = (path: string, asset: Response, init?: RequestInit) => handle(new Request(ORIGIN + path, init), {
  AB: { get: async () => null },
  ASSETS: { fetch: async () => asset },
} as unknown as Env)

test('each slashless landing address reaches the Worker', () => {
  const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../wrangler.jsonc', import.meta.url).href), 'utf8').replace(/^\s*\/\/.*$/gm, ''))
  for (const path of [...VI_SECTIONS.map(section => `/${section}`), ...OTHER_LANGS.map(lang => LANG[lang].prefix)]) {
    expect(config.assets.run_worker_first, path).toContain(path)
  }
})

test.each([
  ['/ca', '', '/ca/'],
  ['/ca/ca-neon-xanh', '?utm_source=search&x=2', '/ca/ca-neon-xanh/?utm_source=search&x=2'],
  ['/th', '', '/th/'],
  ['/ms/ikan/guppy', '?view=1', '/ms/ikan/guppy/?view=1'],
])('the canonical slash for %s is permanent and keeps the query', async (path, query, location) => {
  for (const method of ['GET', 'HEAD']) {
    const response = await request(path + query, new Response(null, { status: 307, headers: { location: path + '/' } }), { method })
    expect(response.status).toBe(301)
    expect(response.headers.get('Location')).toBe(location)
  }
})

test('missing pages and other temporary redirects retain their status', async () => {
  expect((await request('/ca/unknown', new Response(null, { status: 404 }))).status).toBe(404)
  const response = await request('/ca/example', new Response(null, { status: 307, headers: { location: '/ca/somewhere-else/' } }))
  expect(response.status).toBe(307)
  expect(response.headers.get('Location')).toBe('/ca/somewhere-else/')
})
