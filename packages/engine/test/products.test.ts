import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import type { Llm } from '../src/claude'
import { isMarketplace } from '../src/marketplaces'
import { checkPrices, cleanVariant, makeProduct, type Facts } from '../src/products'

const facts: Facts = {
  found: true,
  specs: [{ key: 'Flow rate', value: '500 L/h', source: 0 }, { key: 'Noise', value: 'quiet', source: 3 }, { key: 'Made in', value: 'China', source: 0 }, { key: 'Head height', value: '35 cm max', source: 0 }], variants: [{ name: 'HBL-802', specs: [{ key: 'Flow rate', value: '500 L/h' }] }],
  prices: [
    { shop: 'Thủy Sinh A', url: 'https://a.example/hbl', variant: '802', vnd: 310000, source: 1 },
    { shop: 'Thủy Sinh B', url: 'https://b.example/hbl', vnd: 299000, source: 2 }, // the page doesn't show it
    { shop: 'Shopee', url: 'https://shopee.vn/x', vnd: 250000, source: 3 }, // marketplaces are never fetched
  ],
  fits: [{ fact: 'tanks 30–50 cm', source: 0 }], usage: [], issues: [{ fact: 'new version lost surface skimming', source: 1 }], alternatives: [],
  sources: [{ url: 'https://maker.example', title: 'Maker', kind: 'manufacturer' }, { url: 'https://a.example/hbl', title: 'A', kind: 'shop' }, { url: 'javascript:alert(1)', title: 'x', kind: 'other' }, { url: 'https://review.example', title: 'R', kind: 'review' }],
}
const pages: Record<string, string> = { 'https://a.example/hbl': '<span class="price">310.000<sup>₫</sup></span>', 'https://b.example/hbl': '<p>Liên hệ</p>' }
const get = async (u: string) => { if (!(u in pages)) throw new Error('not fetched'); return pages[u]! }

test('checkPrices keeps only prices the shop page shows, in any of the usual formats; never marketplaces', async () => {
  expect((await checkPrices(facts.prices, get)).map(p => p.shop)).toEqual(['Thủy Sinh A'])
  expect((await checkPrices([{ shop: 'C', url: 'https://c.example', vnd: 1250000, source: 0 }], async () => '1,250,000đ')).length).toBe(1)
  expect((await checkPrices([{ shop: 'C', url: 'https://c.example', vnd: 280000, source: 0 }], async () => 'chỉ 280k')).length).toBe(1)
  // Part of a bigger number is not the price.
  expect((await checkPrices([{ shop: 'C', url: 'https://c.example', vnd: 450000, source: 0 }], async () => 'Giá 1.450.000₫')).length).toBe(0)
  expect((await checkPrices([{ shop: 'C', url: 'https://c.example', vnd: 280000, source: 0 }], async () => 'chỉ 1280k')).length).toBe(0)
  expect((await checkPrices([{ shop: 'C', url: 'https://c.example', vnd: 280000, source: 0 }], async () => '1 280 000đ')).length).toBe(0)
  // A money amount in the variant note never publishes unchecked.
  expect((await checkPrices([{ shop: 'C', url: 'https://c.example', variant: 'M (out of stock; previously 180,000₫)', vnd: 280000, source: 0 }], async () => '280.000đ'))[0]!.variant).toBe('M (out of stock)')
})

test('marketplaces and their short links are never fetched', async () => {
  for (const u of ['https://shopee.vn/x', 'https://SHOPEE.VN/x', 'https://shope.ee/abc', 'https://vn.shp.ee/abc', 'https://lzd.co/x', 'https://www.lazada.vn/x', 'https://tiki.vn/x', 'https://ti.ki/x', 'not a url']) expect(isMarketplace(u)).toBe(true)
  expect(isMarketplace('https://thuysinh365.vn/x')).toBe(false)
  expect(cleanVariant('M')).toBe('M')
  expect(cleanVariant('180k')).toBeUndefined()
})

test('makeProduct: research, then a page written from the facts only, checked against them; entity, Vietnamese and market files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-pr-'))
  const prompts: string[] = []
  const research: Llm = async <T,>() => facts as T
  const llm: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    prompts.push(a.prompt)
    if ('score' in ((a.schema as { properties: object }).properties)) return { score: 0.9, notes: [] } as T
    return { name: 'Lọc treo Sunsun HBL-802', summary: ['Hợp bể 30–50 cm.'], body: '<h3>Hợp với bể nào</h3><p onclick="x">Bể nhỏ.</p>', faq: [{ q: 'Ồn không?', a: 'Êm.' }], labels: { 'Flow rate': 'Lưu lượng', China: 'Trung Quốc', '35 cm max': 'tối đa 40 cm' } } as T
  }
  const r = await makeProduct(root, { research, llm, get, now: () => new Date('2026-10-30T00:00:00Z') }, { brand: 'Sunsun', model: 'HBL-802', category: 'loc', type: 'treo', kind: 'Lọc treo' })
  expect(r).toMatchObject({ id: 'sunsun-hbl-802', score: 0.9, prices: '1/3 prices confirmed on the shop page' })
  const read = async (f: string) => JSON.parse(await readFile(join(root, 'products/sunsun-hbl-802', f), 'utf8'))
  expect(await read('entity.json')).toMatchObject({ brand: 'Sunsun', model: 'HBL-802', category: 'loc', type: 'treo', sources: [{ url: 'https://maker.example', at: '2026-10-30' }, { kind: 'shop' }, { url: 'https://review.example' }] })
  // The javascript: source is dropped and the spec citing the review still points at it.
  expect((await read('entity.json')).specs.find((x: { key: string }) => x.key === 'Noise').source).toBe(2)
  expect(await read('vi.json')).toMatchObject({ slug: 'sunsun-hbl-802', name: 'Lọc treo Sunsun HBL-802', body: '<h3>Hợp với bể nào</h3><p>Bể nhỏ.</p>', labels: { 'Flow rate': 'Lưu lượng', China: 'Trung Quốc' }, quality: { score: 0.9, indexable: true } })
  expect(await read('vn.json')).toEqual({ currency: 'VND', checkedAt: '2026-10-30', prices: [{ shop: 'Thủy Sinh A', url: 'https://a.example/hbl', variant: '802', price: 310000, at: '2026-10-30' }] })
  // The writer never sees shop prices or URLs: only the facts.
  expect(prompts[0]).not.toContain('a.example')
  expect(prompts[0]).toContain('new version lost surface skimming')
  // Every English string the page shows is listed for a label; a label that changes a number is dropped.
  expect(prompts[0]!.split('--- CHUỖI HIỆN TRÊN TRANG ---').at(-1)!).toContain('"China"')
  expect(prompts[0]!.split('--- CHUỖI HIỆN TRÊN TRANG ---').at(-1)!).not.toContain('500 L/h')
})

test('a product research could not find is skipped, nothing written', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-pr-'))
  const r = await makeProduct(root, { research: (async () => ({ ...facts, found: false })) as Llm, llm: (async () => { throw new Error('not called') }) as Llm, get, now: () => new Date() }, { brand: 'X', model: 'Y', category: 'loc', kind: 'Lọc' })
  expect(r.skipped).toContain('not found')
})

test('a page that goes beyond the facts is rewritten once with the notes; the better-grounded one is kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-pr-'))
  const prompts: string[] = []
  const scores = [0.6, 0.85]
  const llm: Llm = async <T,>(a: { prompt: string; schema: object }) => {
    if ('score' in ((a.schema as { properties: object }).properties)) return { score: scores.shift(), notes: ['"cứ lấy mốc 40–50 cm" is not in the facts'] } as T
    prompts.push(a.prompt)
    return { name: `Lần ${prompts.length}`, summary: ['x'], body: '<p>x</p>', faq: [], labels: {} } as T
  }
  const r = await makeProduct(root, { research: (async () => facts) as Llm, llm, get, now: () => new Date('2026-10-30T00:00:00Z') }, { brand: 'Sunsun', model: 'HBL-802', category: 'loc', kind: 'Lọc treo' })
  expect(r).toMatchObject({ score: 0.85 })
  expect(prompts[1]).toContain('"cứ lấy mốc 40–50 cm" is not in the facts')
  expect(JSON.parse(await readFile(join(root, 'products/sunsun-hbl-802/vi.json'), 'utf8')).name).toBe('Lần 2')
})

test('research is kept; --redo rewrites from it without searching again', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-pr-'))
  let searches = 0
  const research: Llm = async <T,>() => { searches++; return facts as T }
  const llm: Llm = async <T,>(a: { schema: object }) => ('score' in ((a.schema as { properties: object }).properties) ? { score: 0.9, notes: [] } : { name: 'x', summary: [], body: '', faq: [], labels: {} }) as T
  const d = { research, llm, get, now: () => new Date('2026-10-30T00:00:00Z') }
  const ask = { brand: 'Sunsun', model: 'HBL-802', category: 'loc', kind: 'Lọc treo' }
  await makeProduct(root, d, ask, { factsDir: join(root, 'state') })
  await makeProduct(root, d, ask, { factsDir: join(root, 'state'), reuse: true })
  expect(searches).toBe(1)
  expect(JSON.parse(await readFile(join(root, 'state/sunsun-hbl-802.json'), 'utf8')).specs[0].value).toBe('500 L/h')
})
