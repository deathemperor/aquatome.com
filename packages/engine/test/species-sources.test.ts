import { expect, test } from 'vitest'
import { shopTalk, shopTalkBlocks, stockOnly, stockTalk, withoutShopTalk } from '../src/species-sources'

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

// Stock talk (the chief of staff, 15 Nov 2026): a dealer's sentence true only of its own shelf, not of the fish wherever a
// keeper buys it. Limia perugiae's "Có nên mua không?" as aquatome.com had it was stock talk in every sentence, and the
// sweep kept it: none of its words is a shop's own talk.
test('a dealer\'s part that is stock talk in every sentence goes whole, in every language; a mixed part waits', () => {
  const limia = '<p>This beautiful livebearer is available on a quite regular basis, but usually only a few specimens. The specimens are German bred ones. Available size: 4-5 cm.</p>'
  const limiaVi = '<p>Loài cá đẻ con xinh đẹp này về hàng khá đều, nhưng mỗi đợt thường chỉ có vài con. Cá bán ra là cá sinh sản tại Đức. Cá có kích cỡ 4-5 cm.</p>'
  expect(withoutShopTalk(limia, { vi: limiaVi, th: '<p>x</p>' })).toEqual({ en: '', tr: { vi: '', th: '' } })
  for (const s of ['German-bred fish are currently available.', 'Available size: 6–8 cm.', 'The animals offered originate from German breeding.', 'The fish were obtained from a breeder (captive bred).', 'Currently both wild collected and bred specimens are available (the photos are taken from bred specimens).']) expect(stockTalk(s), s).toBe(true)
  // Mixed: "offered only very rarely" is true wherever a keeper buys it, so the part waits for the sentence mend.
  const diplotaenia = '<p>Sadly this species is offered only very rarely. Both wild-collected and bred fish are currently available.</p>'
  expect(withoutShopTalk(diplotaenia, { vi: '<p>a</p>' })).toEqual({ en: diplotaenia, tr: { vi: '<p>a</p>' } })
  // True anywhere: a place the species comes from, rarity in the trade, only captive-bred fish traded, a care fact.
  // "Origin: bred." is the trade's for a guppy or a medaka, and it waits too.
  for (const s of ['Imported from Nigeria.', 'A strikingly marked species that is rarely seen in the hobby.', 'Since there are no exports from Australia, all animals in the trade are captive-bred specimens.', 'Large wild-collected oscars from Colombia are currently available.', 'The African Glass Catfish, Parailia pellucida, is always available and fits perfectly in any community tank.', 'Although oscars are always available as bred ones, wild-collected ones are real rarities on the market.', 'As no regular imports of this beautiful species are made from the spreading area, the currently available fish are German bred.', 'Finally this beautiful cory, the long snouted counterpart to C. sterbai, is available again – in show size!', 'Origin: bred.']) {
    expect(stockTalk(s), s).toBe(false)
    expect(stockOnly(`<p>${s}</p>`), s).toBe(false)
  }
  const glass = '<p>The African Glass Catfish, Parailia pellucida, is always available and fits perfectly in any community tank. The maximum length is given as 15 cm in the literature.</p>'
  expect(withoutShopTalk(glass, { vi: '<p>a</p>' }).en).toBe(glass)
})

// The fresh read of 15 Nov: true-anywhere facts the first word list took for stock talk. merge.ts runs this filter on a
// dealer's new text with no one reading, so each must stay alone.
test('a dealer\'s sentence true wherever the fish is bought is no stock talk, alone or not', () => {
  for (const s of [
    'All Sheatfish in the trade are artificially bred ones.',
    'These cichlids have not been imported for a long time; all specimens in the hobby are bred ones.',
    'So it is always available in the shops and almost all of the offered fish are bred ones.',
    'Both sexes of the variety currently available have black bands in the vertical fins.',
    'It is offered under the name Ampullaria cornuarietis, which is now only used as a synonym.',
    'This species grows to 10 cm and is currently available.',
    'Juveniles are now available; they need live prey.',
  ]) expect(stockOnly(`<p>${s}</p>`), s).toBe(false)
})

// The delta reads of 15 Nov: a fact beside a stock word, alone in its part, went whole while a list of facts to spare
// decided. Now a sentence is stock talk only when nothing else is left in it.
test('a fact beside a stock word keeps a one-sentence part, whatever the fact', () => {
  for (const s of [
    'Origin of the fish offered: wild caught (Sibu, Sarawak, Malaysia).',
    'S. pardalis is imported every now and then, which makes specimens available for breeding and conservation programs.',
    'The yellow face mask of the male is very obvious in the population currently available.',
    'The species is translucent in appearance and a bit mousy, but tetra specialists will nevertheless be glad that it is available again.',
    'The Serpae tetra (currently Megalamphodus eques, formerly Hyphessobrycon eques) is one of the standard fish available at pet stores.',
    'How variable Botia lohachata can be, however, can be seen when wild caught specimens are available, like right now (the season runs from about July until October).',
    'The specimens offered are venomous and must be handled with care.',
    'Available size: 4-5 cm, up to 30 cm when mature.',
    'Fish from Malaysia are currently available.',
    'The venomous specimens are currently available.',
    'They bite, but are currently available.',
    'This nocturnal fish is currently available.',
    'The Sarawak population is currently available.',
    'Specimens of Malaysian origin are currently available.',
    // A full name can't be told from a fact by its shape, so a sentence naming its fish in full stays.
    'Umbra pygmaea is available as German bred.',
  ]) {
    expect(stockTalk(s), s).toBe(false)
    expect(withoutShopTalk(`<p>${s}</p>`, { vi: '<p>a</p>' }).en, s).toBe(`<p>${s}</p>`)
  }
  // The parts the cut takes still go: their every word is the dealer's shelf.
  for (const s of ['Wild-caught specimens of A. atahualpa are currently available.', 'Two specimens were received, currently 20-25 cm long.']) expect(stockTalk(s), s).toBe(true)
})

test('a dealer\'s list line of the size it sells goes; the same words inside a paragraph wait for the sentence mend', () => {
  const en = '<ul><li>Origin: Argentina</li><li>Available size: 3-4 cm</li></ul>'
  const vi = '<ul><li>Nguồn gốc: Argentina</li><li>Cỡ cá bán: 3-4 cm</li></ul>'
  expect(withoutShopTalk(en, { vi })).toEqual({ en: '<ul><li>Origin: Argentina</li></ul>', tr: { vi: '<ul><li>Nguồn gốc: Argentina</li></ul>' } })
  const para = '<p>Origin: Brazil. Available size: 4–6 cm.</p>'
  expect(withoutShopTalk(para, { vi: '<p>a</p>' }).en).toBe(para)
  // A translation that doesn't match the English block for block: the part keeps the line, and its facts, for the mend.
  const eel = '<ul><li>Origin: D.R. Congo</li><li>Available size: 10-15 cm</li></ul><p>The species grows to about 15 cm in length.</p>'
  const eelVi = '<p>Nguồn gốc: CHDC Congo. Cỡ cá bán: 10–15 cm.</p><p>Loài này dài tới khoảng 15 cm.</p>'
  expect(withoutShopTalk(eel, { vi: eelVi })).toEqual({ en: eel, tr: { vi: eelVi } })
  // A fact on the same line keeps the line; so does a translation whose block there gives other figures (another order).
  const more = '<ul><li>Origin: Peru</li><li>Available size: 4-5 cm; adults reach 12 cm</li></ul>'
  expect(withoutShopTalk(more, { vi: '<ul><li>a</li><li>b 4-5 12</li></ul>' }).en).toBe(more)
  // A decimal comma is the same figure.
  expect(withoutShopTalk('<ul><li>Origin: Thailand</li><li>Available size: 0.3–0.5 cm</li></ul>', { vi: '<ul><li>Xuất xứ: Thái Lan</li><li>Cỡ thường bán: 0,3–0,5 cm</li></ul>' }).tr.vi).toBe('<ul><li>Xuất xứ: Thái Lan</li></ul>')
  const swapped = { vi: '<ul><li>Cỡ cá bán: 3-4 cm</li><li>Nguồn gốc: Argentina</li></ul>' }
  expect(withoutShopTalk(en, swapped)).toEqual({ en, tr: swapped })
})
