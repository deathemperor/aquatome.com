import { expect, test } from 'vitest'
import { upsertProducts } from '../affiliate/admin'
import { runChecks } from '../affiliate/check'
import { parseGo, recordClick, resolveGo } from '../affiliate/go'
import { NETWORKS } from '../affiliate/networks'
import { testD1 } from './d1'

const now = new Date('2026-10-28T10:00:00Z')
const go = (q: string) => parseGo(new URL(`https://x.test/go/${q}`))!
const product = { id: 'shp-neon-food', network: 'shopee', title: 'Thức ăn tetra', url: 'https://shopee.vn/product/1/2', category: 'thuc-an', entity_ref: 'species:paracheirodon-axelrodi', price_vnd: 45000 }

test('/go/ only accepts a known network and a keyword — never a URL', () => {
  expect(go('shopee/?k=cá neon&c=thuc-an&e=species:paracheirodon-axelrodi')).toEqual({ network: 'shopee', keyword: 'cá neon', category: 'thuc-an', entityRef: 'species:paracheirodon-axelrodi' })
  expect(parseGo(new URL('https://x.test/go/ebay/?k=x'))).toBeNull()
  expect(parseGo(new URL('https://x.test/go/shopee/'))).toBeNull()
  expect(parseGo(new URL('https://x.test/go/shopee/?u=https://evil.test'))).toBeNull()
  // malformed labels are dropped, the link still works
  expect(go('shopee/?k=x&c=Bad Cat&e=javascript:alert(1)')).toEqual({ network: 'shopee', keyword: 'x', category: '', entityRef: '' })
})

test('the keyword can never steer the redirect off the marketplace', async () => {
  for (const k of ['https://evil.test', '//evil.test', '@evil.test', '%2F%2Fevil.test']) {
    const r = await resolveGo(go(`shopee/?k=${encodeURIComponent(k)}`), testD1(), {}, now)
    expect(new URL(r.location).host, k).toBe('shopee.vn')
  }
})

test('re-posting a product revives it; the id "search" is reserved', async () => {
  const db = testD1()
  await upsertProducts(db, [product], now)
  await db.prepare(`UPDATE products SET status = 'inactive', fail_count = 2`).run()
  await upsertProducts(db, [product], now)
  expect(await db.prepare('SELECT status, fail_count FROM products').first()).toEqual({ status: 'active', fail_count: 0 })
  expect((await upsertProducts(db, [{ ...product, id: 'search' }, { ...product, id: 'x-img', image: 'javascript:1' }], now)).errors.map(e => e.error)).toEqual(['bad id', 'bad image'])
})

test('no products, no templates → plain marketplace search', async () => {
  const r = await resolveGo(go('shopee/?k=cá neon&c=thuc-an&e=species:x'), testD1(), {}, now)
  expect(r).toEqual({ location: 'https://shopee.vn/search?keyword=c%C3%A1%20neon', productId: 'search' })
})

test('deeplink template wraps the target; a bad template is ignored', async () => {
  const tpl = { AFF_TEMPLATE_SHOPEE: 'https://go.isclix.com/deep_link/123?url={url}' }
  const r = await resolveGo(go('shopee/?k=neon'), testD1(), tpl, now)
  expect(r.location).toBe(`https://go.isclix.com/deep_link/123?url=${encodeURIComponent(NETWORKS.shopee.searchUrl('neon'))}`)
  expect((await resolveGo(go('shopee/?k=neon'), testD1(), { AFF_TEMPLATE_SHOPEE: 'http://evil.test/?u={url}' }, now)).location).toBe(NETWORKS.shopee.searchUrl('neon'))
})

test('an active product for the placement wins; inactive or stale ones are skipped', async () => {
  const db = testD1()
  expect(await upsertProducts(db, [product, { ...product, id: 'bad-host', url: 'https://evil.test/x' }], now)).toEqual({ saved: 1, errors: [{ index: 1, error: 'url not on network host' }] })
  const p = go('shopee/?k=thức ăn&c=thuc-an&e=species:paracheirodon-axelrodi')
  expect(await resolveGo(p, db, {}, now)).toEqual({ location: 'https://shopee.vn/product/1/2', productId: 'shp-neon-food' })
  expect((await resolveGo(p, db, {}, new Date('2026-11-05T00:00:00Z'))).productId).toBe('search') // not checked for > 48 h
  await db.prepare(`UPDATE products SET status = 'inactive'`).run()
  expect((await resolveGo(p, db, {}, now)).productId).toBe('search')
})

test('clicks aggregate per day and placement', async () => {
  const db = testD1()
  const p = go('lazada/?k=lọc&c=loc&e=guide:x')
  await recordClick(db, p, 'search', now)
  await recordClick(db, p, 'search', now)
  expect(await db.prepare('SELECT n FROM clicks_daily').first()).toEqual({ n: 2 })
})

test('checker: two strikes deactivate, a pass revives, unknown never deactivates', async () => {
  const db = testD1()
  await upsertProducts(db, [product], new Date('2026-10-20T00:00:00Z'))
  const orig = NETWORKS.shopee.check
  const day = (d: number) => new Date(Date.UTC(2026, 9, 21 + d))
  try {
    NETWORKS.shopee.check = async () => ({ result: 'unknown' })
    await runChecks(db, {}, day(0))
    expect(await db.prepare('SELECT status, fail_count FROM products').first()).toEqual({ status: 'active', fail_count: 0 })
    NETWORKS.shopee.check = async () => ({ result: 'dead', detail: 'out of stock' })
    await runChecks(db, {}, day(1))
    expect(await db.prepare('SELECT status FROM products').first()).toEqual({ status: 'active' })
    expect(await runChecks(db, {}, day(2))).toEqual({ checked: 1, deactivated: 1 })
    expect(await db.prepare('SELECT status FROM products').first()).toEqual({ status: 'inactive' })
    NETWORKS.shopee.check = async () => ({ result: 'ok', price_vnd: 39000 })
    await runChecks(db, {}, day(3))
    expect(await db.prepare('SELECT status, fail_count, price_vnd FROM products').first()).toEqual({ status: 'active', fail_count: 0, price_vnd: 39000 })
    expect(await db.prepare('SELECT COUNT(*) AS n FROM checks').first()).toEqual({ n: 4 })
    expect(await runChecks(db, {}, day(3))).toEqual({ checked: 0, deactivated: 0 }) // checked < 20 h ago
    NETWORKS.shopee.check = async () => { throw new Error('api down') }
    await runChecks(db, {}, day(4))
    expect(await db.prepare(`SELECT result, detail FROM checks ORDER BY id DESC`).first()).toEqual({ result: 'unknown', detail: 'api down' })
    expect(await db.prepare('SELECT status FROM products').first()).toEqual({ status: 'active' })
  } finally {
    NETWORKS.shopee.check = orig
  }
})
