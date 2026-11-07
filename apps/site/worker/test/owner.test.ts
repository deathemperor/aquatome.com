import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { OWNER_HOME, OWNER_PAGE, OWNER_SCRIPT } from '../owner'

test('the script in every page is valid JavaScript, and fetches nothing without the flag', async () => {
  expect(() => new Function(OWNER_SCRIPT)).not.toThrow()
  const fetched: string[] = []
  const run = (cookie: string) => new Function('document', 'imp', OWNER_SCRIPT.replace('import(', 'imp('))({ cookie }, (u: string) => { fetched.push(u); return Promise.resolve() })
  run('')
  run('ts_sid=1; aq_owner=0')
  expect(fetched).toEqual([])
  run('a=1; aq_owner=1')
  expect(fetched).toEqual(['/_owner/bar.js'])
})

test('readers pay for the owner bar with the shortest script that can load it, no more', () => {
  // The bar was 1.4 KB in every page. A bigger script here is weight on every reader's page: add to src/owner/bar.ts.
  expect(OWNER_SCRIPT.length).toBeLessThanOrEqual(110)
})

test("the bar's page check: every language's pages, not the admin or other paths", () => {
  const re = new RegExp(OWNER_PAGE)
  expect(['/', '/ca/x/', '/huong-dan/x/', '/id/ikan/x/', '/th/fish/x/'].every(p => re.test(p))).toBe(true)
  expect(['/_ab/', '/go/shopee/', '/data/vi/species.json', '/vi/ca/x/'].some(p => re.test(p))).toBe(false)
  const home = new RegExp(OWNER_HOME)
  expect(['/', '/id/', '/th/'].every(p => home.test(p))).toBe(true)
  expect(['/ca/x/', '/id/ikan/x/'].some(p => home.test(p))).toBe(false)
})

test('the bar reads the page check it is held to', () => {
  const bar = readFileSync(new URL('../../src/owner/bar.ts', import.meta.url), 'utf8')
  expect(bar).toContain('new RegExp(OWNER_PAGE)')
  expect(bar).toContain('new RegExp(OWNER_HOME)')
})
