import { expect, test } from 'vitest'
import { BANDS, bandOf, cell, CO2_MONTH, FOOD_PACK, money, PARTS, plan, PRESETS, READ, readDate, TARIFFS, TIERS, type Country, type Input } from '../src/scripts/budget'
import { CATEGORY_LABELS } from '../src/lib/format'
import { translator } from '../src/lib/i18n'

const t = translator('vi')
const base: Input = { size: { l: 60, w: 30, h: 36 }, tier: 'tam-trung', co2: false, smart: false, country: 'vn', tariff: 2, foodMonths: 1 }
const run = (o: Partial<Input> = {}) => plan({ ...base, ...o })!

test('size: a tank falls in the priced size nearest its length, else its litres; past 120 cm it says so', () => {
  const at = (l: number) => bandOf({ l })
  expect([30, 37, 38, 52, 53, 75, 76, 105, 106, 150].map(l => BANDS[at(l)!.i])).toEqual([30, 30, 45, 45, 60, 60, 90, 90, 120, 120])
  expect([at(120)!.over, at(135)!.over, at(136)!.over]).toEqual([false, false, true])
  expect([12, 17, 18, 40, 41, 108, 109, 245, 246, 450].map(litres => BANDS[bandOf({ litres })!.i])).toEqual([30, 30, 45, 45, 60, 60, 90, 90, 120, 120])
  expect(bandOf({ litres: 451 })!.over).toBe(true)
  // Length wins over litres; nothing given, nothing to price.
  expect(BANDS[bandOf({ l: 90, litres: 20 })!.i]).toBe(90)
  expect(bandOf({})).toBeUndefined()
  expect(plan({ ...base, size: {} })).toBeUndefined()
  // Each preset is priced at its own size.
  expect(PRESETS.map(([l, w, h]) => run({ size: { l, w, h } }).band)).toEqual([...BANDS])
})

test('a 60 cm mid-range tank, no CO₂: each part, the total, and a month in Vietnam', () => {
  const p = run()
  expect(p.parts.map(x => [x.id, x.range])).toEqual([
    ['be', [510_000, 800_000]], ['chan', [650_000, 1_200_000]], ['loc', [1_050_000, 1_200_000]], ['nhiet', [200_000, 320_000]],
    ['den', [848_000, 1_600_000]], ['nen', [480_000, 600_000]], ['test', [160_000, 245_000]],
  ])
  expect(p.total).toEqual([3_898_000, 5_965_000])
  // Light 49–67 W for 8 hours and a canister 8–22 W all day: 584–1,064 Wh a day, 17.52–31.92 kWh a month, at 2,894 ₫.
  expect(p.kwh[0]).toBeCloseTo(17.52)
  expect(p.kwh[1]).toBeCloseTo(31.92)
  expect(p.power[0]).toBeCloseTo(17.52 * 2894)
  // Flourish for 55 L of water (64.8 L × 85%): 4.72 mL a month dosed once a week, at ₫1,160 a mL; twice, double.
  expect(p.fert[0]).toBeCloseTo(5476.5, 0)
  expect(p.fert[1]).toBeCloseTo(10_953, 0)
  expect(p.food).toEqual(FOOD_PACK)
  expect(p.co2).toBeUndefined()
  expect(p.month[0]).toBeCloseTo(p.power[0] + p.fert[0] + FOOD_PACK[0])
  expect(p.month[1]).toBeCloseTo(p.power[1] + p.fert[1] + FOOD_PACK[1])
})

test('the total is the parts added up, and both its ends rise with the tier, at every size, with and without extras', () => {
  for (const [l, w, h] of PRESETS) for (const co2 of [false, true]) for (const smart of [false, true]) {
    const totals = TIERS.map(tier => run({ size: { l, w, h }, tier, co2, smart }))
    for (const p of totals) expect(p.total).toEqual(p.parts.reduce((s, x) => [s[0] + x.range[0], s[1] + x.range[1]], [0, 0]))
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]!.total[0], `${l} cm, ${TIERS[i]} low`).toBeGreaterThan(totals[i - 1]!.total[0])
      expect(totals[i]!.total[1], `${l} cm, ${TIERS[i]} high`).toBeGreaterThan(totals[i - 1]!.total[1])
    }
  }
})

test('CO₂ adds its kit and its refills; smart gear adds its part, and a premium hub its watts; nothing else moves', () => {
  const off = run(), co2 = run({ co2: true }), smart = run({ smart: true })
  expect(co2.parts.map(x => x.id)).toEqual(['be', 'chan', 'loc', 'nhiet', 'den', 'nen', 'co2', 'test'])
  expect(co2.parts.find(x => x.id === 'co2')!.range).toEqual([1_050_000, 1_600_000])
  expect(co2.co2).toEqual(CO2_MONTH)
  expect(co2.month[0]).toBeCloseTo(off.month[0] + CO2_MONTH[0])
  expect(co2.kwh).toEqual(off.kwh)
  expect(smart.parts.map(x => x.id)).toEqual(['be', 'chan', 'loc', 'nhiet', 'den', 'nen', 'test', 'thong-minh'])
  expect(smart.total[0] - off.total[0]).toBe(250_000)
  expect(smart.kwh).toEqual(off.kwh)
  // A premium setup's smart gear is a strip, a probe and a Home Assistant box: 1.7–3 W all day more.
  const top = run({ tier: 'cao-cap' }), topSmart = run({ tier: 'cao-cap', smart: true })
  expect(topSmart.kwh[0] - top.kwh[0]).toBeCloseTo(1.7 * 24 * 30 / 1000)
  expect(topSmart.kwh[1] - top.kwh[1]).toBeCloseTo(3 * 24 * 30 / 1000)
  // A 30 cm tank's CO₂ is a mini kit, up to a cylinder, in every tier.
  for (const tier of TIERS) expect(run({ size: { l: 30, w: 20, h: 20 }, tier, co2: true }).parts.find(x => x.id === 'co2')!.range).toEqual([160_000, 1_050_000])
})

test('electricity: the month\'s kWh at each tariff tier of each country, in its currency; only đồng adds to the đồng total', () => {
  for (const country of Object.keys(TARIFFS) as Country[]) {
    TARIFFS[country].tiers.forEach((tier, i) => {
      const p = run({ country, tariff: i })
      expect(p.currency).toBe(TARIFFS[country].currency)
      expect(p.rate).toBe(tier.rate)
      expect(p.power[0]).toBeCloseTo(p.kwh[0] * tier.rate)
      expect(p.power[1]).toBeCloseTo(p.kwh[1] * tier.rate)
      const bought = p.fert[0] + p.food[0]
      expect(p.month[0]).toBeCloseTo(country === 'vn' ? bought + p.power[0] : bought)
    })
  }
  expect(TARIFFS.vn.tiers.map(x => x.rate)).toEqual([1901, 2289, 2894, 3456, 3844])
  expect(TARIFFS.id.tiers.map(x => x.rate)).toEqual([1352, 1444.7, 1699.53])
  expect(TARIFFS.th.tiers.map(x => x.rate)).toEqual([3.1623, 4.3207, 4.5206].map(r => expect.closeTo(r, 4)))
  // A tier the country doesn't have falls back to the one the research worked with.
  expect(run({ country: 'id', tariff: 4 }).rate).toBe(1444.7)
  // Food: a pack over the months it lasts.
  expect(run({ foodMonths: 2 }).food).toEqual([25_000, 60_000])
})

test('money: ranges in đồng read as nghìn or triệu, other currencies as their own', () => {
  expect(money([510_000, 800_000], 'VND', t, 'vi-VN')).toBe('510–800 nghìn ₫')
  expect(money([1_296_000, 3_700_000], 'VND', t, 'vi-VN')).toBe('1,3–3,7 triệu ₫')
  expect(money([848_000, 1_600_000], 'VND', t, 'vi-VN')).toBe('850 nghìn – 1,6 triệu ₫')
  expect(money([5476.5, 10_953], 'VND', t, 'vi-VN')).toBe('5,5–11 nghìn ₫')
  expect(money([0, 600_000], 'VND', t, 'vi-VN')).toBe('0–600 nghìn ₫')
  expect(money([25_311, 46_117], 'IDR', t, 'id-ID').replace(/\s/g, ' ')).toBe('Rp 25.300 – Rp 46.100')
  expect(money([55.4, 100.9], 'THB', t, 'th-TH')).toBe('฿55 – ฿101')
  expect(readDate('vi-VN')).toBe('06/11/2026')
})

test('the rule a table cell becomes a range by', () => {
  const table = { 'tiet-kiem': [[10], [20, 30], [], [50]], 'tam-trung': [[], [40], [60], [70, 80]], 'cao-cap': [[], [], [], [90]] }
  const at = (tier: keyof typeof table, i: number) => cell(table, tier, i)
  expect(at('tiet-kiem', 1)).toEqual({ range: [20_000, 30_000], from: 'tiet-kiem' }) // two prices: lowest to highest
  expect(at('tiet-kiem', 0).range).toEqual([10_000, 20_000]) // one: up to the next price in the table
  expect(at('tiet-kiem', 3).range).toEqual([50_000, 60_000])
  expect(at('cao-cap', 3).range).toEqual([80_000, 90_000]) // the table's top: down to the one below
  expect(at('tiet-kiem', 2)).toEqual({ range: [20_000, 50_000], from: 'tiet-kiem' }) // none: the sizes either side
  expect(at('tam-trung', 0)).toEqual({ range: [10_000, 20_000], from: 'tiet-kiem' }) // none and nothing beside: the nearest tier
  expect(at('cao-cap', 1)).toEqual({ range: [40_000, 50_000], from: 'tam-trung' })
})

test('data: every tier has every part at every size, each a real range in whole đồng; the prices and tariffs are dated', () => {
  expect(PARTS.map(p => p.id)).toEqual(['be', 'chan', 'loc', 'nhiet', 'den', 'nen', 'co2', 'test', 'thong-minh'])
  for (const part of PARTS) for (const tier of TIERS) for (let i = 0; i < BANDS.length; i++) {
    const { range, what, keyword } = part.price(tier, i)
    const where = `${part.id}, ${tier}, ${BANDS[i]} cm`
    expect(Number.isInteger(range[0]) && Number.isInteger(range[1]), where).toBe(true)
    expect(range[0], where).toBeGreaterThanOrEqual(0)
    expect(range[1], `${where}: a range, never one number`).toBeGreaterThan(range[0])
    expect(what, where).toBeTruthy()
    // A shop link only for kit the site already has a shop search for, under that search's category.
    expect(!!keyword, where).toBe(!!part.category)
  }
  for (const p of PARTS.filter(x => x.category)) expect(CATEGORY_LABELS[p.category!], p.id).toBeTruthy()
  expect(READ).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(new Date(READ).getTime()).toBeLessThanOrEqual(Date.now())
  for (const [country, tariff] of Object.entries(TARIFFS)) {
    expect(tariff.tiers.length, country).toBeGreaterThan(0)
    expect(tariff.tiers[tariff.pick], country).toBeDefined()
    for (const x of tariff.tiers) expect(x.rate, country).toBeGreaterThan(0)
    // Each tariff names the period it applies to.
    expect(tariff.note, country).toMatch(/\d{4}/)
  }
})

test('the page: drawn for a 60 cm mid-range tank without a script, in each language; shop links on the Vietnamese page only', async () => {
  const { page } = await import('./dist')
  const { readFileSync } = await import('node:fs')
  const p = run()
  for (const [path, lang, locale] of [['/cong-cu/du-toan-be/', 'vi', 'vi-VN'], ['/id/alat/anggaran-akuarium/', 'id', 'id-ID'], ['/th/tools/tank-budget/', 'th', 'th-TH']] as const) {
    const { dom } = page(path)
    const tl = translator(lang)
    expect(dom.querySelector('#db-total')!.text, path).toBe(money(p.total, 'VND', tl, locale))
    expect(dom.querySelector('#db-parts-total')!.text, path).toBe(money(p.total, 'VND', tl, locale))
    // Every part is drawn; the CO₂ kit and smart gear wait, hidden, until chosen.
    expect(dom.querySelectorAll('tr[data-part]').map(r => [r.getAttribute('data-part'), r.hasAttribute('hidden')]), path).toEqual(PARTS.map(x => [x.id, !!x.only]))
    expect(dom.querySelector('.read')!.text, path).toContain(readDate(locale))
    expect(dom.querySelector('noscript'), path).not.toBeNull()
    // The page's own country's tariff, at the tier the research worked with.
    const country = ({ vi: 'vn', id: 'id', th: 'th' } as const)[lang]
    expect(dom.querySelector('select[name=nuoc] option[selected]')!.getAttribute('value'), path).toBe(country)
    expect(dom.querySelectorAll('select[name=bac] option').length, path).toBe(TARIFFS[country].tiers.length)
    const shops = dom.querySelectorAll('a[data-go]').map(a => a.getAttribute('href')!)
    if (lang === 'vi') {
      // One per part the site has a shop search for, through /go/, marked as sponsored.
      expect(shops.length).toBe(PARTS.filter(x => x.category).length)
      for (const h of shops) expect(h).toMatch(/^\/go\/shopee\/\?k=[^&]+&c=[a-z0-9-]+&e=tool%3Adu-toan-be$/)
      expect(dom.querySelector('a[data-go]')!.getAttribute('rel')).toContain('sponsored')
      expect(dom.querySelector('[data-shop-pick]')).not.toBeNull()
    } else {
      expect(shops, path).toEqual([])
      // Prices are Vietnamese shops', in đồng: the page says so.
      expect(dom.querySelector('.read')!.text, path).toContain(tl('Giá đồ là giá của các cửa hàng thủy sinh ở Việt Nam, tính bằng đồng Việt Nam: chưa có giá ở Indonesia và Thái Lan.'))
    }
  }
  // The tools index lists it in each language, and the sitemap has it.
  expect(page('/id/alat/').dom.querySelector('.tools a[href="/id/alat/anggaran-akuarium/"]')).not.toBeNull()
  expect(page('/th/tools/').dom.querySelector('.tools a[href="/th/tools/tank-budget/"]')).not.toBeNull()
  const { DIST } = await import('./dist')
  const sitemap = readFileSync(`${DIST}/sitemap.xml`, 'utf8')
  for (const path of ['/cong-cu/du-toan-be/', '/id/alat/anggaran-akuarium/', '/th/tools/tank-budget/']) expect(sitemap).toContain(path)
})
