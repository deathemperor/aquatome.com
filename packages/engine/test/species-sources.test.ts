import { expect, test } from 'vitest'
import { shopTalk, shopTalkBlocks, withoutShopTalk } from '../src/species-sources'

// The betta's page as aquatome.com had it (design critique 2026-11-06): BW Aquatics' product page, its "Có nên mua không?"
// the shop's note on how it picks fish for its customers, and Aquarium Glaser's stock-list line.
const bw = '<p>Please note that pairs that "we pick" aren\'t necessarily lower quality than the posted males; we usually only sell customers the best of what we have.</p><p>Be sure to have the habitat ready before purchase.</p>'

test('a shop speaking as itself or selling is its own talk; a fact is not', () => {
  expect(shopTalkBlocks(bw)).toEqual([0, 1])
  expect(shopTalk('Carnivorous. The seller currently feeds live blackworms, frozen bloodworms and pellets.')).toBe(true)
  expect(shopTalk('For our customers: the fish have code 369498 on our stocklist.')).toBe(true)
  expect(shopTalk('We received from Peru one of these dwarfish species.')).toBe(true)
  expect(shopTalk('In my experience they jump.')).toBe(true)
  expect(shopTalk('Males are VERY aggressive and should be kept alone.')).toBe(false)
  // "US" is a country, a Roman numeral is no "I", and an order is a rank.
  expect(shopTalk('Introduced to the US in 1930; Type I of the order Cypriniformes.')).toBe(false)
})

test('a shop\'s talk goes from the English and every translation, block for block', () => {
  const en = '<p>Males are VERY aggressive.</p><ul><li>pH: 5.0-7.0</li><li>TDS: 60-200 (kept soft to match the seller\'s other wild bettas)</li></ul>'
  const vi = '<p>Cá đực RẤT hung dữ.</p><ul><li>pH: 5,0-7,0</li><li>TDS: 60-200 (người bán nuôi nước mềm)</li></ul>'
  const th = '<p>ปลาตัวผู้ดุมาก</p><ul><li>pH: 5.0-7.0</li><li>TDS: 60-200</li></ul>'
  expect(withoutShopTalk(en, { vi, th })).toEqual({
    en: '<p>Males are VERY aggressive.</p><ul><li>pH: 5.0-7.0</li></ul>',
    tr: { vi: '<p>Cá đực RẤT hung dữ.</p><ul><li>pH: 5,0-7,0</li></ul>', th: '<p>ปลาตัวผู้ดุมาก</p><ul><li>pH: 5.0-7.0</li></ul>' },
  })
  // Nothing left, or a translation whose blocks can't be matched: the section goes.
  expect(withoutShopTalk(bw, { vi: '<p>a</p><p>b</p>' })).toEqual({ en: '', tr: { vi: '' } })
  expect(withoutShopTalk(en, { vi: '<p>Cá đực RẤT hung dữ. pH 5,0-7,0.</p>' })).toEqual({ en: '', tr: { vi: '' } })
  // No talk: as it was.
  expect(withoutShopTalk('<p>Bubblenester.</p>', { vi: '<p>Làm tổ bọt.</p>' })).toEqual({ en: '<p>Bubblenester.</p>', tr: { vi: '<p>Làm tổ bọt.</p>' } })
})
