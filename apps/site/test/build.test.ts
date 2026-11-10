import { describe, expect, test } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DIST, page, sitemapText } from './dist'
import { CATEGORY_ORDER } from '../src/lib/format'
import { VI_SECTIONS } from '../worker/paths'
import { LANGS } from '@aq/schema/langs'

describe('species page', () => {
  const { html, dom } = page('/ca/ca-neon-vua/')
  test('shows scientific name and Seriously Fish credit link', () => {
    expect(html).toContain('Paracheirodon axelrodi')
    expect(dom.querySelector('a[href="https://www.seriouslyfish.com/species/paracheirodon-axelrodi"]')).not.toBeNull()
  })
  test('sources disagree on temperature: Seriously Fish\'s range, each source one tap away', () => {
    const t = dom.querySelector('.card [data-field="tempC"][data-conflict="true"]')!
    expect(t.querySelector('.v')?.text).toBe('24–30°C') // Seriously Fish 24–30, Glaser 23–27
    // Only the cell the sources disagree on is told apart; one toggle per card holds every value's sources. Ranges that
    // overlap get no dot (card-rows.test.ts).
    expect(dom.querySelectorAll('.card [data-conflict]').map(c => c.getAttribute('data-field'))).toEqual(['tempC'])
    expect(dom.querySelectorAll('.card .mark').length).toBe(0)
    expect(dom.querySelector('.datacard .trust .legend')).toBeNull()
    expect(dom.querySelectorAll('.datacard details.trust').length).toBe(1) // the difficulty cell's "Vì sao?" is its own (card-guide.test.ts)
    expect(dom.querySelector('.datacard .trust summary .label')?.text).toBe('Nguồn và độ tin cậy')
    const by = dom.querySelector('.trust [data-src-field="tempC"]')!
    expect(by.querySelector('p')?.text).toBe('Mỗi nguồn ghi một mức')
    expect(by.querySelectorAll('li').map(l => l.text)).toEqual(['Seriously Fish: 24–30°C', 'Aquarium Glaser: 23–27°C'])
    expect(by.querySelectorAll('li span').map(s => s.getAttribute('data-c'))).toEqual(['24,30', '23,27']) // °F toggle too
    expect(dom.querySelector('.trust [data-src-field="ph"] li')?.text).toBe('Seriously Fish')
    expect(html).not.toContain('nguồn khác nhau')
  })
  // Answer first, in reading order (a screen reader's too): the name and key facts, the full card (closed on a phone, under
  // its own heading), the summary, then the photo (design critique, 2026-11-06: the summary was 2.7 screens down).
  test('the name and four key facts, the card, the summary, then the photo, from the data card\'s own values', () => {
    const top = dom.querySelector('header.top')!
    const order = (el: typeof top) => el.childNodes.filter(n => n.nodeType === 1).map(n => (n as typeof top).getAttribute('class')?.split(' ')[0])
    expect(order(top)).toEqual(['id', 'facts', 'qs', 'side'])
    expect(order(top.querySelector('.id')!).slice(-2)).toEqual(['alt', 'keyfacts'])
    expect(top.querySelector('.facts > h2')?.text).toBe('Bảng dữ liệu')
    expect(top.querySelector('.facts > details.full > summary')?.text).toBe('Xem đủ bảng')
    expect(top.querySelector('.facts > details.full .datacard')).not.toBeNull()
    // The photo column: the photo, then the gallery's thumbnails, there on a phone too (no script moves them).
    expect(order(top.querySelector('.side')!)).toEqual(['photo', 'strip'])
    expect(dom.querySelectorAll('section.strip')).toHaveLength(1)
    expect(dom.querySelector('#anh-dien-thoai')).toBeNull()
    const facts = top.querySelectorAll('.id .keyfacts > div')
    expect(facts.map(f => f.getAttribute('data-field'))).toEqual(['tempC', 'ph', 'tankCm', 'difficulty'])
    expect(facts[0]!.querySelector('[data-c]')?.getAttribute('data-c')).toBe('24,30') // the card's resolved range, °F toggle too
    expect(facts[2]!.querySelector('[data-cm]')?.text).toBe('60 cm')
    expect(facts[3]!.querySelector('dd')?.text.trim()).toBe('Dễ')
  })
  // At most five chips (seven ran off a phone's row): the care questions, the shop, the photos; breeding gives way first
  // (test/jump-row.test.ts: the tank next, the photos never). Each to its section, the photos to their gallery with its count.
  test('jump row: at most five of the main parts this page has, in page order, the photos last with their count', () => {
    const links = dom.querySelectorAll('nav.jump a')
    expect(links.map(a => [a.text, a.getAttribute('href')])).toEqual([
      ['Nước', '#muc-waterConditions'], ['Thức ăn', '#muc-diet'], ['Nuôi chung', '#muc-behaviour'], ['Mua đồ', '#mua-do'], ['Ảnh 45', '/ca/ca-neon-vua/anh/'],
    ])
    for (const a of links.slice(0, -1)) expect(dom.querySelector(a.getAttribute('href')!), a.getAttribute('href')!).not.toBeNull()
    expect(dom.querySelector('#muc-reproduction')).not.toBeNull() // the part that gave way
    expect(page('/ca/ca-neon-vua/anh/').dom.querySelectorAll('[data-gallery] a[data-i]')).toHaveLength(45) // the chip's count
    // Just before the text: after the summary and the photo.
    expect(dom.querySelector('header.top')?.nextElementSibling?.tagName).toBe('NAV')
  })
  // At the end of the question it answers ("Nuôi chung với con gì?"), not under the card before the summary.
  test('"Nuôi chung" block: temperament, group size, species to keep with it and away from it, the checker pre-filled', () => {
    const box = dom.querySelector('#muc-behaviour .mates')!
    expect(dom.querySelector('header.top .mates')).toBeNull()
    expect(dom.querySelector('#muc-waterConditions .vn')).not.toBeNull() // Vietnam's climate, after the water question
    expect(box.querySelector('.tag')?.text).toBe('Hiền')
    expect(box.querySelector('.traits')?.text).toContain('8 con')
    const [good, avoid] = box.querySelectorAll('.row')
    expect(good!.querySelectorAll('a').map(a => a.getAttribute('href'))).toEqual(['/ca/ca-neon-xanh/', '/ca/ca-boraras-do/'])
    expect(avoid!.querySelector('a')?.getAttribute('href')).toBe('/ca/ca-dia/')
    expect(avoid!.querySelector('.why')?.text).toBe('Lớn tới 15 cm, có thể ăn Cá neon vua')
    expect(box.querySelector('a[href="/cong-cu/nuoi-chung/?ca=ca-neon-vua:8"]')).not.toBeNull()
    expect(box.getAttribute('data-pagefind-ignore')).not.toBeNull()
  })
  // The card is the page's one copy of each figure (design critique 2026-10-31: the text said 5 cm, "Trung bình", pH 3,5–7,5
  // where the card said 3,5 cm, Dễ, pH 4,6–6,2).
  test('quick facts: what the card already gives is left out, the rest stays', () => {
    const glaser = dom.querySelector('section[data-section="quickFacts"] .prose[data-source="glaser"]')!
    const items = glaser.querySelectorAll('li')
    expect(items.length).toBe(1) // no family, no temperature
    expect(items[0]!.text).toMatch(/^Nguồn gốc: Rio Negro, Brazil\d$/) // and its source's mark
    expect(page('/ca/ca-neon-xanh/').dom.querySelector('section[data-section="quickFacts"]')).toBeNull() // nothing but the card's
  })
  // On aquatome.com "Thông tin nhanh" ran to 1.5 screens before the first care question, repeating the key facts and the
  // summary: a phone folds it under its heading. Open in the HTML (search, the Markdown copy), its heading the section's.
  test('quick facts fold under their heading, open in the HTML; the other sections don\'t', () => {
    const fold = dom.querySelector('#muc-quickFacts > details.fold')!
    expect(fold.hasAttribute('open')).toBe(true)
    expect(fold.querySelector(':scope > summary > h2')?.text).toBe('Thông tin nhanh')
    expect(fold.querySelector('.prose[data-source="glaser"]')).not.toBeNull()
    expect(fold.nextElementSibling?.tagName).toBe('SCRIPT')
    expect(dom.querySelectorAll('.body details.fold').length).toBe(1)
    expect(dom.querySelector('#muc-waterConditions > h2')).not.toBeNull()
    expect(page('/cay/ray-nana/').dom.querySelector('details.fold')).toBeNull()
  })
  test('a block whose figure is near the card\'s says nothing: the sources only round differently', () => {
    // The card is Seriously Fish's 24–30 °C; Glaser's block says 23–27 °C, which overlaps it.
    expect(dom.querySelector('section[data-section="waterConditions"] .prose[data-source="glaser"]')).not.toBeNull()
    expect(dom.querySelectorAll('p.off').length).toBe(0)
  })
  // The betta's page said "Dung tích bể tối thiểu: 8 lít" twice under a 45 cm card (design critique 2026-11-06): a volume
  // that makes a much shorter tank than the card's is noted after its block, and a quick-facts line that says it goes.
  test('a tank volume that makes a much shorter tank than the card: off its quick facts, the card\'s figure after its other text', () => {
    const galaxy = page('/ca/ca-galaxy/').dom
    const facts = galaxy.querySelector('section[data-section="quickFacts"] .prose[data-source="sprucepets"]')!
    expect(facts.querySelectorAll('li').map(li => li.text.replace(/\d+$/, ''))).toEqual(['Thức ăn: ăn tạp'])
    const note = galaxy.querySelector('section[data-section="aquariumSize"] p.off')!
    expect(note.text.replace(/\s+/g, ' ').trim()).toBe('Thông số ở đầu trang ghi khác đoạn này: bể tối thiểu 45 cm.')
    expect(note.getAttribute('data-pagefind-ignore')).not.toBeNull()
    expect(note.querySelectorAll('[data-cm]').map(x => x.getAttribute('data-cm'))).toEqual(['45,45']) // the units toggle too
    expect(note.previousElementSibling?.getAttribute('data-source')).toBe('sprucepets') // after its own block
    expect(galaxy.querySelectorAll('p.off').length).toBe(1)
  })
  test('the phone\'s key facts mark a value the sources disagree on only as the card does: here, by too little to', () => {
    expect(dom.querySelectorAll('.keyfacts [data-conflict]').map(x => x.getAttribute('data-field'))).toEqual(['tempC'])
    expect(dom.querySelector('.keyfacts .mark')).toBeNull()
  })
  test('videos are click-to-load facades', () => {
    expect(html).not.toContain('<iframe')
    expect(dom.querySelector('[data-youtube-id]')).not.toBeNull()
  })
  test('renders sections in reader order with question headings and credited sub-blocks', () => {
    const keys = dom.querySelectorAll('section[data-section]').map(s => s.getAttribute('data-section'))
    expect(keys.indexOf('reproduction')).toBeLessThan(keys.indexOf('habitat'))
    expect(dom.querySelector('section[data-section="reproduction"] > h2')?.text.trim()).toBe('Sinh sản ra sao?')
    expect(dom.querySelectorAll('section[data-section="reproduction"] [data-source]').length).toBe(2)
  })
  test('sources are numbered marks at the end of each block, listed once at the end; no credit line per block', () => {
    const marks = dom.querySelectorAll('.body section[data-section] .prose a.cite')
    expect(marks.length).toBe(dom.querySelectorAll('.body section[data-section] .prose').length)
    expect(marks.every(m => ['P', 'LI'].includes(m.parentNode?.tagName ?? ''))).toBe(true) // inside the last sentence's element
    const list = dom.querySelectorAll('#nguon li')
    expect(list.length).toBe(new Set(marks.map(m => m.getAttribute('href'))).size)
    expect(Number(marks.at(-1)!.text)).toBeLessThanOrEqual(list.length)
    expect(marks[0]!.getAttribute('data-term')).toBe(list[0]!.querySelector('a')!.text)
    expect(dom.querySelector('.body .credit')).toBeNull()
  })
  // What to buy: right after the care text (not at the foot of the page by the comments), one row a kind of thing, each
  // search a sponsored /go/ link to Shopee that the page's picker can point at Lazada or Tiki (e2e/species.spec.ts).
  test('what to buy: after the care text, sponsored /go/ links carrying the placement, one shop picked for all', () => {
    const kit = dom.querySelector('section.kit')!
    expect(kit.querySelector('h2')?.text).toBe('Chuẩn bị để nuôi Cá neon vua')
    expect(kit.querySelector('h2')?.getAttribute('id')).toBe('mua-do')
    const links = kit.querySelectorAll('a[data-go]')
    expect(links.length).toBeGreaterThan(0)
    for (const a of links) {
      expect(a.getAttribute('href')).toMatch(/^\/go\/shopee\/\?k=/)
      expect(a.getAttribute('rel')).toContain('sponsored')
      expect(a.getAttribute('href')).toContain('e=species%3Aparacheirodon-axelrodi')
    }
    // The tank row offers no tank shorter than the card's minimum (60 cm): the fixture's "bể cá mini 20cm" and "bể cá 40 lít"
    // are left out, as the shop sold the betta and the neon smaller tanks than their pages ask for (critique 2026-11-06).
    expect(links.map(a => a.text.replace(/\s*\(.*$/, '').trim())).toContain('bể kính 60cm')
    expect(kit.text).not.toMatch(/bể cá mini 20cm|bể cá 40 lít/)
    const kinds = kit.querySelectorAll('.rows > li .what').map(w => w.childNodes[0]!.text)
    expect(new Set(kinds).size, 'one row a kind').toBe(kinds.length)
    expect(kit.querySelectorAll('[data-shop-pick] button').map(b => b.getAttribute('data-shop'))).toEqual(['shopee', 'lazada', 'tiki'])
    const order = [...html.matchAll(/id="(muc-reproduction|mua-do|comments-h)"/g)].map(m => m[1])
    expect(order).toEqual(['muc-reproduction', 'mua-do', 'comments-h'])
    expect(html).not.toMatch(/href="https:\/\/(shopee\.vn|www\.lazada\.vn|tiki\.vn)/)
  })
  test('"Nuôi ở Việt Nam" box: heater for the northern winter, convertible temperatures', () => {
    const box = dom.querySelector('aside.vn')
    expect(box?.querySelector('li[data-ok="false"]')?.text).toContain('Mùa đông miền Bắc')
    expect(box?.querySelector('[data-c="16,16"]')).not.toBeNull()
  })
  test('has no broken values', () => {
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})

test('missing sections produce no empty headings', () => {
  const { dom } = page('/ca/ca-boraras-do/')
  expect(dom.querySelector('section[data-section="dimorphism"]')).toBeNull()
  expect(dom.querySelector('[data-field="gh"]')).toBeNull()
  expect(dom.querySelector('nav.jump')).toBeNull() // none of the main parts to jump to
})

// Sources far enough apart to change what a reader does (Seriously Fish 45 cm, Glaser 30 cm) are marked, on the card and
// the phone's key facts, with words for a screen reader; the card keeps the figure it chose.
test('a gap that matters is marked on the card and the key facts, and said to a screen reader', () => {
  const { dom } = page('/ca/ca-galaxy/')
  expect(dom.querySelectorAll('.card .mark').length).toBe(1)
  expect(dom.querySelector('.card [data-field="tankCm"] dt .mark')?.text).toBe('Các nguồn ghi khác nhau')
  expect(dom.querySelector('.card [data-field="tankCm"] .v')?.text).toBe('45 cm')
  expect(dom.querySelector('.keyfacts [data-field="tankCm"] dt .mark')?.text).toBe('Các nguồn ghi khác nhau')
  expect(dom.querySelector('.datacard .trust .legend')?.text).toBe('Các nguồn ghi khác nhau')
  expect(dom.querySelectorAll('.trust [data-src-field="tankCm"] li').map(l => l.text)).toEqual(['Seriously Fish: 45 cm', 'Aquarium Glaser: 30 cm'])
})

test('"Nuôi chung" shows only what the data supports: no temperament, no "hợp với"; a clash still listed', () => {
  const box = page('/ca/ca-galaxy/').dom.querySelector('.mates')! // no behaviour traits for this one
  expect(box.querySelector('.traits')).toBeNull()
  expect(box.querySelectorAll('.row').length).toBe(1)
  expect(box.querySelector('.row h4')?.text).toBe('Tránh')
  const why = box.querySelector('.row .why')!
  expect(why.text).toBe('Lớn tới 9 cm, có thể ăn Cá galaxy') // the apisto: 9 cm against 2,5 cm, said on the chip
  expect(why.querySelector('[data-cm]')?.getAttribute('data-cm')).toBe('9,9') // the inch toggle converts it
})

test('low-quality page is noindex', () => {
  expect(page('/ca/ca-boraras-do/').html).toMatch(/<meta name="robots" content="noindex/)
  expect(page('/ca/ca-neon-vua/').html).not.toMatch(/noindex/)
})

test('a thin page (one dealer\'s note) stays out of search; a heading over a few words is a quick fact instead', () => {
  const { html, dom } = page('/ca/ca-ong-tien/')
  expect(html).toMatch(/<meta name="robots" content="noindex/)
  expect(sitemapText()).not.toContain('/ca/ca-ong-tien/')
  // "Spawns on leaves." under its own heading becomes a line of the quick facts, with its source's mark; "Amazon basin."
  // is left out, the quick facts already say it. Its range (where it lives in the wild) is a section of its own.
  expect(dom.querySelectorAll('section[data-section]').map(s => s.getAttribute('data-section'))).toEqual(['quickFacts', 'range'])
  const facts = dom.querySelector('#muc-quickFacts')!
  expect(facts.querySelectorAll('li').map(li => li.text)).toEqual(['Sinh sản: Đẻ trứng trên lá.1'])
  expect(facts.querySelector('li strong')?.text).toBe('Sinh sản:')
  expect(dom.querySelectorAll('nav.jump a').map(a => a.text)).not.toContain('Sinh sản')
})

test('home features well-known species and links the full list instead of every card', () => {
  const { dom } = page('/')
  const cards = dom.querySelectorAll('article.sc a[href^="/ca/"]').map(a => a.getAttribute('href'))
  for (const slug of ['ca-neon-xanh', 'tep-red-cherry']) expect(cards, slug).toContain(`/ca/${slug}/`)
  expect(cards.length).toBeLessThanOrEqual(8)
  expect(dom.querySelector('a[href="/ca/"]')).toBeTruthy()
  // Full data cards first: Cá ông tiên (a staple, only its size known) only fills a spot no complete species can.
  const full = dom.querySelectorAll('section[aria-labelledby="featured-h"] article.sc').map(c => c.querySelectorAll('.label dd').length >= 2)
  expect(full.length).toBeGreaterThan(0)
  expect(full).toEqual([...full].sort((a, b) => Number(b) - Number(a)))
})

test('species page has JSON-LD', () => {
  expect(page('/ca/ca-neon-vua/').html).toContain('application/ld+json')
})

describe('browse pages', () => {
  const species = (path: string) => new Set(page(path).dom.querySelectorAll('a[href^="/ca/"]').map(a => a.getAttribute('href')))
  test('genus page lists both Paracheirodon', () => {
    const s = species('/phan-loai/characiformes/characidae/paracheirodon/')
    expect(s.has('/ca/ca-neon-vua/') && s.has('/ca/ca-neon-xanh/')).toBe(true)
  })
  test('order and family pages exist', () => {
    expect(species('/phan-loai/cichliformes/').has('/ca/ca-dia/')).toBe(true)
    expect(page('/phan-loai/').html).toContain('Characiformes')
  })
  test('country page lists its species', () => {
    expect(species('/nguon-goc/south-america/brazil/').has('/ca/ca-neon-vua/')).toBe(true)
    expect(species('/nguon-goc/asia/').has('/ca/ca-galaxy/')).toBe(true)
  })
  test('every group has a page', () => {
    for (const g of ['tetras', 'cichlids', 'danios', 'shrimp', 'rasboras']) expect(species(`/nhom/${g}/`).size, g).toBeGreaterThan(0)
  })
  test('species list: every species in its data file (the page has none inline), unit-tagged values', () => {
    const { dom, html } = page('/ca/')
    const result = dom.querySelector('#species-result')!
    expect(result.getAttribute('data-src')).toBe('/data/vi/species.json')
    expect(result.getAttribute('data-total')).toBe('9')
    expect(JSON.parse(readFileSync(`${DIST}/data/vi/species.json`, 'utf8'))).toHaveLength(9)
    expect(dom.querySelector('#species-index')).toBeNull()
    expect(page('/ca/ca-neon-vua/').html).toMatch(/data-c="24,30"/)
    expect(html).toContain('data-units-toggle')
  })
  // The angelfish card ended at its Latin name, beside cards with figures, and read as unfinished (page review 2026-11-01).
  test('a species card with no temperature, pH or difficulty says so where the figures go', () => {
    const card = (path: string, slug: string) => page(path).dom.querySelector(`[data-slug="${slug}"] article`)!
    expect(card('/ca/', 'ca-ong-tien').querySelector('.label.none')?.text).toBe('Chưa có số liệu')
    expect(card('/ca/', 'ca-dia').querySelector('.label.none')).toBeNull()
  })
})

describe('plants, guides, glossary, equipment, discovery', () => {
  test('plant page shows growing needs and shop links', () => {
    const { html, dom } = page('/cay/ray-nana/')
    for (const t of ['Ánh sáng', 'CO₂', 'Tốc độ mọc']) expect(html).toContain(t)
    const shop = dom.querySelector('a[href^="/go/shopee/?k="]')?.getAttribute('href') ?? ''
    expect(new URLSearchParams(shop.split('?')[1]).get('c')).toBe('cay-thuy-sinh') // plants are always an affiliate item
    // a plant whose slots lack the plant category still gets one, first
    const mc = page('/cay/monte-carlo/').dom.querySelectorAll('a[href^="/go/shopee/?k="]').map(a => new URLSearchParams(a.getAttribute('href')!.split('?')[1]).get('c'))
    expect(mc[0]).toBe('cay-thuy-sinh')
    expect(mc).toContain('den')
    expect(page('/cay/').dom.querySelectorAll('a[href^="/cay/"]').length).toBeGreaterThanOrEqual(3)
  })
  // Ráy nana's other names were stored but never shown (design critique, 2026-11-06); the guides that say more about a
  // plant come before its shops.
  test('a plant page shows its other names, and its guides before its shops', () => {
    const { dom } = page('/cay/ray-nana/')
    expect(dom.querySelector('header .alt')?.text).toBe('Tên khác: Anubias nana, Anubias barteri nana')
    expect(dom.querySelector('header .alt')?.hasAttribute('data-pagefind-ignore')).toBe(true)
    const parts = dom.querySelectorAll('main section.guides, main section.vg, main section.kit').map(x => x.getAttribute('class')!.split(' ').find(c => ['guides', 'vg', 'kit'].includes(c)))
    expect(parts).toEqual(['guides', 'kit'])
  })
  test("a plant page is found by its former scientific names (searching \"Vesicularia dubyana\" finds Java moss)", () => {
    const aka = page('/cay/ray-nana/').dom.querySelector('h1')!.getAttribute('data-aka')!.split(', ')
    expect(aka.slice(0, 2)).toEqual(['Anubias barteri var. nana', 'Anubias nana'])
  })
  test('guide page credits its source and links glossary terms', () => {
    const { html, dom } = page('/huong-dan/setup-be-thuy-sinh-dau-tien/')
    expect(html).toContain('2Hr Aquarist')
    expect(dom.querySelector('main .gl')).not.toBeNull()
    // Each term carries its name and definition for the hover/tap card.
    const gl = dom.querySelector('main a.gl')!
    expect(gl.getAttribute('data-term')).toBeTruthy()
    expect(gl.getAttribute('data-tip')!.length).toBeGreaterThan(20)
  })
  test('guide links species, genus and equipment it names; those pages link back', () => {
    const { dom } = page('/huong-dan/setup-be-thuy-sinh-dau-tien/')
    const links = dom.querySelectorAll('article .prose a.ml').map(a => [a.text, a.getAttribute('href')])
    expect(links).toContainEqual(['cá neon xanh', '/ca/ca-neon-xanh/'])
    expect(links).toContainEqual(['Paracheirodon', expect.stringMatching(/^\/phan-loai\/[a-z]+\/characidae\/paracheirodon\/$/)])
    expect(links.find(([, h]) => h === '/thiet-bi/loc/')).toBeDefined()
    expect(links.filter(([, h]) => h === '/ca/ca-neon-xanh/')).toHaveLength(1) // first mention only
    expect(dom.querySelectorAll('.chips a').map(a => a.getAttribute('href'))).toContain('/thiet-bi/loc/')
    const back = (p: string) => page(p).dom.querySelectorAll('a[href="/huong-dan/setup-be-thuy-sinh-dau-tien/"]').length
    expect(back('/ca/ca-neon-xanh/')).toBeGreaterThan(0)
    expect(back('/thiet-bi/loc/')).toBeGreaterThan(0)
  })
  test('glossary index lists every term and term pages exist', () => {
    const { dom } = page('/thuat-ngu/')
    expect(dom.querySelectorAll('a[href^="/thuat-ngu/"]').length).toBeGreaterThanOrEqual(4)
    expect(page('/thuat-ngu/chu-trinh-nito/').html).toContain('Nitrogen cycle')
  })
  test('species body links a glossary term', () => {
    expect(page('/ca/ca-neon-vua/').dom.querySelector('section[data-section] .gl')).not.toBeNull()
  })
  test('equipment index and a page per product category', () => {
    for (const cat of ['be-ca', 'loc', 'thuc-an', 'suoi', 'cay-thuy-sinh']) expect(page(`/thiet-bi/${cat}/`).html, cat).toContain(`/go/shopee/?k=`)
    expect(page('/thiet-bi/').dom.querySelectorAll('a[href^="/thiet-bi/"]').length).toBeGreaterThanOrEqual(5)
    // In a keeper's order (tank, filter, heater… food last), the written guides first: not by how many fish need them.
    const cats = page('/thiet-bi/').dom.querySelectorAll('a.cat').map(a => a.getAttribute('href')!.split('/')[2]!)
    expect(cats[0]).toBe('loc')
    expect(cats.slice(1)).toEqual(CATEGORY_ORDER.filter(x => cats.slice(1).includes(x)))
  })
  test('equipment guide: hero, types with the species that need them, FAQ data; shop links collapsed', () => {
    const { html, dom } = page('/thiet-bi/loc/')
    expect(dom.querySelector('.hero img')).not.toBeNull()
    const thung = dom.querySelector('article.type#thung')!
    expect(thung.querySelector('img')).not.toBeNull()
    expect(thung.querySelectorAll('.who a[href^="/ca/"]').length).toBeGreaterThan(0) // fixture species suggest "lọc thùng …"
    expect(html).toContain('"@type":"FAQPage"')
    const visible = dom.querySelectorAll('a[href^="/go/"]').filter(a => !a.closest('details'))
    expect(visible.length).toBeLessThanOrEqual(dom.querySelectorAll('article.type').length * 7)
    expect(page('/thiet-bi/').dom.querySelector('a[href="/thiet-bi/loc/"] img')).not.toBeNull()
    expect(page('/thiet-bi/suoi/').html).toContain('/go/shopee/?k=') // no written guide yet: still a page
  })
  test('renamed page: old address in /redirects.json, hidden "Chuyển hướng từ" note, aliases in structured data', () => {
    const table = JSON.parse(readFileSync(`${DIST}/redirects.json`, 'utf8'))
    expect(table['/ca/ca-neon-vua-super-red/']).toBe('/ca/ca-neon-vua/?tu=ca-neon-vua-super-red')
    const { html, dom } = page('/ca/ca-neon-vua/')
    const note = dom.querySelector('p.redirected[data-from="ca-neon-vua-super-red"]')!
    expect(note.hasAttribute('hidden')).toBe(true)
    expect(note.text).toContain('Cá neon vua Super Red')
    expect(html).toContain('"alternateName":[')
  })
  test('discovery lists discovery guides', () => {
    expect(page('/kham-pha/').dom.querySelector('a[href="/huong-dan/hang-moi-ve-nhung-loai-hiem-thang-nay/"]')).not.toBeNull()
  })
  test('Vietnam hub exists', () => {
    expect(page('/nguon-goc/asia/vietnam/').html).toContain('Cá Việt Nam')
  })
  test('every link in the header, the menu sheet and the footer resolves; the old Khám phá address still does', () => {
    const links = page('/').dom.querySelectorAll('header.nav a, #site-menu a, footer a').map(a => a.getAttribute('href')!).filter(h => /^\/.+\/$/.test(h))
    expect(links.length).toBeGreaterThan(10)
    for (const p of [...links, '/kham-pha/']) expect(() => page(p), p).not.toThrow()
  })
})

test("a guide's photos go under the section they name, at their own size and credited; one whose section is missing is still shown", () => {
  const { dom, html } = page('/huong-dan/phan-loai-ca-dia/')
  const prose = dom.querySelector('.prose')!
  const kids = prose.childNodes.filter(n => n.nodeType === 1) as (typeof prose)[]
  const at = kids.findIndex(k => k.tagName === 'H3' && k.text === 'Can, chỉ và hoa văn')
  expect(kids[at + 1]!.tagName).toBe('P') // after the heading's first paragraph
  expect(kids[at + 2]!.classNames).toContain('figs')
  expect(kids[at + 2]!.querySelector('img')?.getAttribute('src')).toBe('https://media.aquatome.com/aquatome/guides-aquatome-phan-loai-ca-dia-ca-dia-giai-phau.webp')
  expect(kids[at + 2]!.querySelector('img')?.getAttribute('alt')).toBe('Các bộ phận của cá dĩa')
  expect(kids.at(-1)!.querySelector('img')?.getAttribute('src')).toBe('https://media.aquatome.com/commons/00000000000000a2.webp')
  // The guide's first photo names no section: it leads the page; a section's picture never does.
  expect(dom.querySelector('img.lead')?.getAttribute('src')).toBe('https://media.aquatome.com/commons/00000000000000a1.webp')
  expect(html).toContain('Ảnh: AquaTome')
  expect(html).toContain('Ảnh: David J')
})

test('a breed the guide names (engine mentions) lists the guide on its page', () => {
  expect(page('/ca/ca-dia-pigeon-blood/').dom.querySelector('a[href="/huong-dan/phan-loai-ca-dia/"]')).not.toBeNull()
  expect(page('/ca/ca-dia/').dom.querySelector('a[href="/huong-dan/phan-loai-ca-dia/"]')).not.toBeNull()
})

// 2026-11-05: the halfmoon betta's other names held the betta's ("Cá xiêm"), so every guide naming the betta was listed on
// the halfmoon's page (a pea puffer video among them). A breed's names are its own (engine alt-names.ts cleanBreedAltNames).
test("a guide naming only a breed's species is listed on the species' page, not the breed's", () => {
  const guide = 'a[href="/huong-dan/hang-moi-ve-nhung-loai-hiem-thang-nay/"]' // "Cá đĩa hoang dã về ít…"
  expect(page('/ca/ca-dia/').dom.querySelector(guide)).not.toBeNull()
  expect(page('/ca/ca-dia-pigeon-blood/').dom.querySelector(guide)).toBeNull()
  expect(page('/ca/ca-la-han/').dom.querySelector(guide)).toBeNull() // a hybrid the discus may be a parent of
})

describe('review fixes', () => {
  test('pages with photo cards credit every photo', () => {
    for (const p of ['/', '/ca/', '/nhom/tetras/']) {
      const { html } = page(p)
      expect(html, p).toContain('CHUCAO')
      expect(html, p).toContain('Holger Krisp')
    }
    expect(page('/cay/').html).toContain('Abhik.Mazumdar.73')
  })
  test('glossary pages honour quality.indexable', () => {
    expect(page('/thuat-ngu/gh/').html).toMatch(/noindex/)
  })
})

test('a styled 404 page exists for the static host', () => {
  expect(page('/404').html).toContain('Không tìm thấy trang')
})

test("what's new lists changelog entries that exist, with links", () => {
  const { dom } = page('/moi-cap-nhat/')
  const hrefs = dom.querySelectorAll('[data-changelog] a').map(a => a.getAttribute('href'))
  expect(hrefs).toEqual(['/ca/ca-neon-vua/', '/huong-dan/setup-be-thuy-sinh-dau-tien/'])
})

test('static /go/ fallback pages exist for hosting without the Worker, and are noindex', () => {
  for (const n of ['shopee', 'lazada', 'tiki']) {
    const { html } = page(`/go/${n}/`)
    expect(html).toContain('noindex')
    expect(html).toMatch(/location\.replace/)
  }
})

test('approved summary shows above the sections; pending drafts stay hidden', () => {
  const { dom } = page('/ca/ca-neon-vua/')
  expect(dom.querySelector('section.qs')?.text).toContain('nuôi đàn từ 8 con')
  expect(page('/ca/ca-dia/').html).not.toContain('Bản nháp chưa duyệt')
})

test('cards use the recorded thumb, Wikimedia 500px, else the full photo', async () => {
  const { smallSrc } = await import('../src/lib/img')
  const base = { width: 800, height: 600, licence: 'x', author: 'x', sourceUrl: 'x' }
  expect(smallSrc({ ...base, url: 'https://media.aquatome.com/s/a.webp', thumb: 'https://media.aquatome.com/s/a-480.webp' })).toBe('https://media.aquatome.com/s/a-480.webp')
  expect(smallSrc({ ...base, url: 'https://media.aquatome.com/s/a.webp' })).toBe('https://media.aquatome.com/s/a.webp')
  expect(smallSrc({ ...base, url: 'https://upload.wikimedia.org/w/thumb/a/F.jpg/960px-F.jpg' })).toBe('https://upload.wikimedia.org/w/thumb/a/F.jpg/500px-F.jpg')
})

test('the script that loads the owner bar is on content pages but not the 404 page, and the bar is a file of its own', () => {
  // A page holds only what loads the bar: its buttons are in a file only a browser with the owner's flag fetches.
  for (const path of ['/ca/ca-dia/', '/']) {
    expect(page(path).dom.querySelector('script[data-owner]')?.text, path).toContain("import('/_owner/bar.js')")
    expect(page(path).html, path).not.toContain('/_ab/hidden')
    expect(page(path).html, path).not.toContain('Báo lỗi')
  }
  const bar = readFileSync(`${DIST}/_owner/bar.js`, 'utf8')
  for (const words of ['/_ab/hidden', 'Quản trị', '/_ab/doc-gia/', 'Báo lỗi', '/api/feedback']) expect(bar, words).toContain(words)
  expect(page('/').dom.querySelectorAll('footer a[href^="/_ab"]')).toHaveLength(0) // no admin link for visitors; the owner bar needs the owner cookie
  expect(page('/404').dom.querySelector('script[data-owner]')).toBeNull()
})

test('pictures inside the text: extra species photos between sections, a mentioned species pictured in the guide', () => {
  const { dom } = page('/huong-dan/setup-be-thuy-sinh-dau-tien/')
  expect(dom.querySelectorAll('article .prose figure.inl a[href="/ca/ca-neon-xanh/"]').length).toBeGreaterThan(0)
  for (const slug of ['ca-neon-vua', 'ca-dia', 'ca-galaxy']) {
    const sp = page(`/ca/${slug}/`).dom
    const sections = sp.querySelectorAll('section[data-section]').length
    expect(sp.querySelectorAll('.body > figure.inl').length, slug).toBeLessThan(sections)
    expect(sp.querySelector('.gallery .thumbs'), slug).toBeNull()
  }
})

test('species text never links to the page itself; glossary and genus links come from one pass', () => {
  for (const slug of ['ca-neon-vua', 'ca-neon-xanh', 'ca-dia', 'ca-galaxy', 'tep-red-cherry']) {
    const { dom } = page(`/ca/${slug}/`)
    expect(dom.querySelectorAll(`section[data-section] a[href="/ca/${slug}/"]`), slug).toHaveLength(0)
  }
  expect(page('/ca/ca-neon-vua/').dom.querySelector('section[data-section] a.gl[href^="/thuat-ngu/"]')).not.toBeNull()
})

test('species cards are specimen labels: temperature and pH bars, difficulty in words, no family line', () => {
  const { dom } = page('/')
  const card = dom.querySelector('article.sc')!
  expect(card.querySelectorAll('.rb').length).toBeGreaterThan(0)
  expect(card.querySelector('.diff')?.text).toMatch(/^(Dễ|Vừa|Khó)$/)
  expect(card.querySelector('.fam')).toBeNull()
  const bar = card.querySelector('.rb i')!.getAttribute('style')!
  expect(bar).toMatch(/left:[\d.]+%;width:[\d.]+%/)
})

test('home leads with the tank form (to the species filter) and three first steps', () => {
  const { dom, html } = page('/')
  const form = dom.querySelector('form#tank')!
  expect(form.getAttribute('action')).toBe('/ca/')
  for (const n of ['tankCm', 'tempC', 'ph']) expect(form.querySelector(`input[name="${n}"]`)).toBeTruthy()
  expect(html.indexOf('id="tank"')).toBeLessThan(html.indexOf('featured-h'))
  expect(html).toContain("localStorage.setItem(k")
  expect(dom.querySelector('#fresh-h')).toBeNull() // "Mới trên AquaTome" moved off the home page
})

test('species list: a page of cards and a card template in the HTML, a "show more" pager, collapsible filters with difficulty in words', () => {
  const { dom, html } = page('/ca/')
  expect(dom.querySelector('#species-more')).toBeTruthy()
  // The script builds every species past the first page from this template (scripts/species-card.ts).
  expect(dom.querySelector('template#species-card .sc .diff')).toBeTruthy()
  expect(html.indexOf('id="species-filter"')).toBeLessThan(html.indexOf('id="breeds-h"')) // the search comes before the breed cards
  expect(dom.querySelector('details#filter-box[open] form#species-filter')).toBeTruthy()
  expect(dom.querySelectorAll('select[name="difficultyMax"] option').map(o => o.text)).toEqual(['Bất kỳ', 'Dễ', 'Dễ và vừa'])
  expect(dom.querySelectorAll('[data-slug]').length).toBeGreaterThan(0)
})

test('guide pages show reading time and suggest what to read next', () => {
  const { dom } = page('/huong-dan/setup-be-thuy-sinh-dau-tien/')
  expect(dom.querySelector('.kind')?.text).toMatch(/đọc khoảng \d+ phút/)
  const next = dom.querySelectorAll('#next-h ~ .grid a').map(a => a.getAttribute('href'))
  expect(next).not.toContain('/huong-dan/setup-be-thuy-sinh-dau-tien/')
})

test('species pages carry a hidden reader-photo section (gallery + upload form) for their entity', () => {
  const { dom } = page('/ca/ca-neon-vua/')
  const s = dom.querySelector('section[data-reader-photos]')!
  expect(s.getAttribute('data-entity')).toMatch(/^species:/)
  expect(s.hasAttribute('hidden')).toBe(true)
  expect(s.querySelector('input[type="file"][accept="image/jpeg,image/png,image/webp"]')).toBeTruthy()
  expect(s.querySelector('input[name="consent"][required]')).toBeTruthy()
})

describe('video guide', () => {
  const { html, dom } = page('/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
  // No channel or video named in the reader's way (PRODUCT.md, the owner, 2026-11-06): the line under the title says it is
  // AquaTome's, from its sources; the video and its channel are the first of them, linked, in the list after the text.
  test('click-to-load player with Vietnamese captions; the channel credited in the source list, not on the page', () => {
    expect(html).not.toContain('<iframe')
    expect(dom.querySelector('figure[data-vp="vl1Lx9iWDYU"] button.facade')).not.toBeNull()
    expect(dom.querySelector('.facade .cover')?.text).toBe('Bí quyết trị rêu hại')
    expect(dom.querySelector('.credit')?.text.replace(/\s+/g, ' ').trim()).toBe('AquaTome tổng hợp từ 1 nguồn rồi tự viết')
    expect(dom.querySelector('.credit a')?.getAttribute('href')).toBe('#nguon')
    expect(dom.querySelector('figure[data-vp] figcaption')).toBeNull()
    const video = dom.querySelector('#nguon li.video')!
    expect(video.querySelector('a[href="https://www.youtube.com/watch?v=vl1Lx9iWDYU"]')).not.toBeNull()
    expect(video.text).toContain('MJ Aquascaping')
    expect(dom.querySelector('.ahead')?.text).not.toContain('MJ Aquascaping')
    expect(dom.querySelector('.art .prose')?.text).not.toContain('MJ Aquascaping')
  })
  test('the thumbnail is fast to show: phones get the 640 px one, and the connection opens from the head', () => {
    expect(dom.querySelector('.facade picture source[media="(max-width: 480px)"]')?.getAttribute('srcset')).toBe('https://i.ytimg.com/vi/vl1Lx9iWDYU/sddefault.jpg')
    expect(dom.querySelector('.facade picture img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/vl1Lx9iWDYU/maxresdefault.jpg')
    expect(dom.querySelector('head link[rel="preconnect"][href="https://i.ytimg.com"]')).not.toBeNull()
  })
  test('chapters in Vietnamese seek the video, in a closed list; summary and FAQ shown', () => {
    expect(dom.querySelector('details.chapters')?.hasAttribute('open')).toBe(false)
    const marks = dom.querySelectorAll('.chapters button[data-t]')
    expect(marks.map(b => b.getAttribute('data-t'))).toEqual(['0', '31', '91'])
    expect(marks[1]?.text).toContain('Thay nước đều đặn')
    expect(dom.querySelectorAll('.takeaways li')).toHaveLength(2)
    expect(dom.querySelector('.faq summary')?.text).toBe('Nên thay nước lúc nào?')
    expect(dom.querySelector('.crumb a[href="/video/reu-hai-tu-a-den-z/"]')).not.toBeNull()
  })
  test('section pictures: licensed photo with credit, then video stills that play from their moment (captions escaped)', () => {
    const figs = dom.querySelector('h3#khoi-dong-be-moi')?.nextElementSibling?.nextElementSibling
    expect(figs?.classList.contains('vfigs')).toBe(true)
    expect(figs?.querySelector('.vphoto a.cite[href="https://commons.wikimedia.org/wiki/File:Oto.jpg"]')?.getAttribute('data-term')).toBe('Ảnh: Fremen')
    const m = figs?.querySelector('button.moment')
    expect(m?.getAttribute('data-t')).toBe('95')
    expect(m?.getAttribute('data-vp-for')).toBe('vl1Lx9iWDYU')
    expect(m?.querySelector('.mc')?.text).toBe('Bể mới set với <đá> và cây.')
    // Named by what it shows (voice control: "click 1:35"), with a spoken-only prefix; ▶ is decoration.
    expect(m?.hasAttribute('aria-label')).toBe(false)
    expect(m?.querySelector('.visually-hidden')?.text).toBe('Xem video từ')
    expect(m?.querySelector('.mt [aria-hidden="true"]')?.text).toBe('▶')
    expect(html).not.toContain('<đá>')
  })
  test('VideoObject with chapter clips and FAQPage JSON-LD', () => {
    const ld = dom.querySelectorAll('script[type="application/ld+json"]').map(s => JSON.parse(s.text))
    const v = ld.find(j => j['@type'] === 'VideoObject')
    expect(v).toMatchObject({ duration: 'PT29M15S', uploadDate: '2023-02-11', embedUrl: 'https://www.youtube-nocookie.com/embed/vl1Lx9iWDYU' })
    expect(v.hasPart[2]).toMatchObject({ name: 'Giờ thay nước hợp lý', startOffset: 91, endOffset: 1755 })
    expect(ld.some(j => j['@type'] === 'FAQPage')).toBe(true)
  })
  test('has no broken values', () => {
    expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  })
})

/** Every page the build wrote that a search engine can reach. */
const builtPages = (dir = DIST): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? (['_astro', '_owner', 'pagefind', 'app', 'data'].includes(e.name) ? [] : builtPages(join(dir, e.name))) : e.name === 'index.html' ? [join(dir, e.name)] : [])

// Google leaves a video out of its index when the mark-up names no thumbnail (Search Console, "No thumbnail URL provided").
test('every video marked up on a page names a thumbnail, also a guide with no picture of its own', () => {
  const videos = builtPages().flatMap(file => [...readFileSync(file, 'utf8').matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => JSON.parse(m[1]!)).filter(j => j['@type'] === 'VideoObject').map(v => ({ page: file.slice(DIST.length), thumbs: [v.thumbnailUrl].flat() })))
  expect(videos.length).toBeGreaterThan(0)
  expect(videos.filter(v => !v.thumbs.length || !v.thumbs.every(u => typeof u === 'string' && u.startsWith('https://')))).toEqual([])
})

test('the sitemap names no page that keeps itself out of search', () => {
  const locs = [...sitemapText().matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]!).pathname)
  expect(locs.filter(p => /<meta name="robots" content="[^"]*noindex/.test(page(p).html))).toEqual([])
})

describe('video pages', () => {
  test('/video/ lists series with a published guide only, each as one row; the newest videos as cards', () => {
    const { dom } = page('/video/')
    expect(dom.querySelector('.rows a[href="/video/reu-hai-tu-a-den-z/"] h3')?.text).toBe('Rêu hại từ A đến Z')
    expect(dom.querySelector('a[href="/video/trong/"]')).toBeNull()
    // Newest first (2024's video, then 2023's).
    expect(dom.querySelectorAll('.new .gc').map(a => a.getAttribute('href'))).toEqual(['/huong-dan/bon-phan-cho-cay-thuy-sinh/', '/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/'])
    const card = dom.querySelector('.new .gc[href="/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')
    expect(card?.querySelector('.dur')?.text).toContain('29:15')
    // No YouTube thumbnail and no label over it: a thumbnail shows the people in the video. A photo from its sections.
    expect(card?.querySelector('.cover')).toBeNull()
    expect(card?.querySelector('img')?.getAttribute('src')).not.toMatch(/ytimg/)
    expect(card?.querySelector('.src')?.text).not.toMatch(/Theo video/)
  })
  test('series page lists parts in order with an ItemList', () => {
    const { dom } = page('/video/reu-hai-tu-a-den-z/')
    expect(dom.querySelectorAll('.parts li')).toHaveLength(1)
    const ld = dom.querySelectorAll('script[type="application/ld+json"]').map(s => JSON.parse(s.text))
    expect(ld.find(j => j['@type'] === 'ItemList').itemListElement[0].url).toContain('/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
  })
  test('video guides: Hướng dẫn marked in the nav, kept off the text-guide index (which links to /video/)', () => {
    const { dom } = page('/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
    expect(dom.querySelector('.nav a[aria-current="page"]')?.getAttribute('href')).toBe('/huong-dan/')
    expect(dom.querySelector('#site-menu a[aria-current="page"]')?.getAttribute('href')).toBe('/huong-dan/')
    expect(page('/video/').dom.querySelector('.nav a[aria-current="page"]')?.getAttribute('href')).toBe('/huong-dan/')
    const idx = page('/huong-dan/').dom
    expect(idx.querySelector('a[href="/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).toBeNull()
    expect(idx.querySelector('.vid a[href="/video/"]')).not.toBeNull()
  })
  test('single videos: grouped by channel on /video/, a channel page; the guide\'s path names no channel; no caption promise when transcribed', () => {
    const idx = page('/video/').dom
    expect(idx.querySelector('.rows a[href="/video/kenh/green-aqua/"] h3')?.text).toBe('Video lẻ của Green Aqua')
    const ch = page('/video/kenh/green-aqua/').dom
    expect(ch.querySelector('.grid a[href="/huong-dan/bon-phan-cho-cay-thuy-sinh/"]')).not.toBeNull()
    const g = page('/huong-dan/bon-phan-cho-cay-thuy-sinh/').dom
    // The owner's decision (2026-11-07): a page never names a channel in its path; the source list credits it.
    expect(g.querySelector('.crumb')?.text.trim()).toBe('Video')
    expect(g.querySelector('.facade .cc')).toBeNull()
    expect(page('/video/kenh/mj-aquascaping/').dom.querySelector('.series a[href="/video/reu-hai-tu-a-den-z/"]')).not.toBeNull()
  })
  test('Video is inside Hướng dẫn (no nav entry of its own); sitemap has the video pages', () => {
    expect(page('/').dom.querySelector('.nav a[href="/video/"], #site-menu a[href="/video/"]')).toBeNull()
    const sm = sitemapText()
    expect(sm).toContain('/video/</loc>')
    expect(sm).toContain('/video/reu-hai-tu-a-den-z/</loc>')
    expect(sm).toContain('/video/kenh/green-aqua/</loc>')
  })
})

describe('dark mode', () => {
  const { html, dom } = page('/')
  test('the saved theme is applied in <head> before the styles; both schemes declared', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<meta name="color-scheme" content="light dark">')
    expect(head.indexOf("localStorage.getItem('aq_theme')")).toBeGreaterThan(-1)
    expect(head.indexOf("localStorage.getItem('aq_theme')")).toBeLessThan(head.search(/<style|<link rel="stylesheet"/))
  })
  test('dark tokens for the system setting and the explicit choice; a toggle in the nav', () => {
    expect(html).toMatch(/:root\[data-theme=["']?dark["']?\]\s*\{[^}]*--c-paper:\s*#0b1a1e/)
    expect(html).toMatch(/prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme=["']?light["']?\]\)/)
    expect(dom.querySelector('.nav [data-theme-toggle]')).not.toBeNull()
  })
})

describe('instant navigation', () => {
  const { html, dom } = page('/')
  test('hovered site links prerender; affiliate, outbound and admin links never', () => {
    const rules = JSON.parse(dom.querySelector('script[type="speculationrules"]')!.textContent!)
    const r = rules.prerender[0]
    expect(r.eagerness).toBe('moderate')
    // This language's pages only: Vietnamese ones are the home page and its sections (never /go/, /_ab/ or /id/…).
    expect(r.where.and[0]).toEqual({ href_matches: ['/', ...VI_SECTIONS.map(s => `/${s}/*`)] })
    expect(JSON.parse(page('/id/').dom.querySelector('script[type="speculationrules"]')!.textContent!).prerender[0].where.and[0]).toEqual({ href_matches: '/id/*' })
    expect(r.where.and[1].not.selector_matches).toContain('[rel~=sponsored]')
    // The page's HTML is fetched sooner (10 ms hover; on phones, a link in view): a first visit waits ~0.5 s for it.
    expect(rules.prefetch).toEqual([{ where: r.where, eagerness: 'eager' }])
  })
  test('analytics wait until a preloaded page is shown', () => {
    const beacon = dom.querySelector('script[data-beacon]')!.textContent!
    expect(beacon).toMatch(/D=document\b.*D\.prerendering\?D\.addEventListener\('prerenderingchange',go/)
    expect(html).not.toContain('<script type="module" src="https://static.cloudflareinsights.com')
  })
})

describe('what a video shows', () => {
  test('kit in the video: brand and model or the type, a seek button, exact-model shop links; species it shows are linked', () => {
    const { dom } = page('/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
    const rows = dom.querySelectorAll('.gear li')
    expect(rows.map(r => r.querySelector('.name')?.text)).toEqual(['Oase BioMaster 350', 'Seachem Flourish', 'Lọc bọt biển (lọc sủi)'])
    expect(rows[0]!.querySelector('.cat a')?.getAttribute('href')).toBe('/thiet-bi/loc/')
    expect(rows[1]!.querySelector('.cat')?.text).toBe('Khác')
    expect(rows[0]!.querySelector('button.seek')?.getAttribute('data-t')).toBe('95')
    expect(rows[0]!.querySelector('button.seek')?.getAttribute('data-vp-for')).toBe('vl1Lx9iWDYU')
    expect(rows[0]!.querySelector('a[href^="/go/shopee/"]')?.getAttribute('href')).toContain('k=Oase+BioMaster+350')
    expect(rows[2]!.querySelector('button.seek')).toBeNull()
    expect(dom.querySelector('.related a[href="/ca/tep-red-cherry/"]')).not.toBeNull()
  })
  test('the species page lists the video guide that shows it, apart from text guides', () => {
    const { dom } = page('/ca/tep-red-cherry/')
    expect(dom.querySelector('.vg a[href="/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).not.toBeNull()
    expect(dom.querySelector('.guides a[href="/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).toBeNull()
  })
  test('the equipment page lists what creators use, with their videos', () => {
    const { dom } = page('/thiet-bi/loc/')
    const li = dom.querySelector('.creators li')!
    expect(li.querySelector('strong')?.text).toBe('Oase BioMaster 350')
    expect(li.querySelector(':scope > a')?.getAttribute('href')).toBe('/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
  })
})

describe('product page', () => {
  const { html, dom } = page('/san-pham/oase-biomaster-350/')
  test('verdict, dated shop prices, specs and variants with Vietnamese labels, sources; Product + FAQ structured data', () => {
    expect(dom.querySelector('h1')?.text).toBe('Lọc thùng Oase BioMaster 350')
    expect(dom.querySelector('.verdict')?.text).toContain('Hợp với bể 150–350 lít')
    expect(dom.querySelector('.range')?.text).toBe('4.200.000 ₫ – 4.550.000 ₫')
    expect(dom.querySelector('.prices a[href="https://shop-a.example/oase-350"]')?.getAttribute('rel')).toBe('nofollow noopener')
    expect(dom.querySelector('.prices .note')?.text).toContain('30/10/2026')
    expect(dom.querySelectorAll('.specs th').map(t => t.text)).toEqual(['Lưu lượng', 'Công suất'])
    expect(dom.querySelectorAll('.variants thead th').map(t => t.text)).toEqual(['Phiên bản', 'Lưu lượng', 'Cỡ bể'])
    expect(dom.querySelector('.sources a[href="https://www.oase.com/en/biomaster-350"]')).not.toBeNull()
    expect(dom.querySelector('.gear a[href^="/go/shopee/"]')?.getAttribute('href')).toContain('k=Oase+BioMaster+350')
    expect(html).toContain('"@type":"AggregateOffer"')
    expect(html).toContain('"lowPrice":4200000')
    expect(html).toContain('"@type":"FAQPage"')
  })
  test('the video that uses it is listed; its kit row, the equipment type and the creators list link to the page', () => {
    expect(dom.querySelector('.vg a[href="/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).not.toBeNull()
    const guide = page('/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/').dom
    expect(guide.querySelector('.gear .name a')?.getAttribute('href')).toBe('/san-pham/oase-biomaster-350/')
    const eq = page('/thiet-bi/loc/').dom
    expect(eq.querySelector('#thung .picks a')?.getAttribute('href')).toBe('/san-pham/oase-biomaster-350/')
    expect(eq.querySelector('.creators strong a')?.getAttribute('href')).toBe('/san-pham/oase-biomaster-350/')
  })
  test('indexable products are in the sitemap', () => {
    expect(sitemapText()).toContain('/san-pham/oase-biomaster-350/</loc>')
  })
  test('a product with no reviews and no control shows neither block', () => {
    expect(dom.querySelector('.reviews')).toBeNull()
    expect(dom.querySelector('.control')).toBeNull()
  })
})

describe('a product page\'s reviews and control', () => {
  const { dom } = page('/san-pham/chihiros-wrgb-ii-slim/')
  const reviews = dom.querySelector('.reviews')!
  test('says what it is: a summary of its reviews, not our own test', () => {
    expect(reviews.querySelector('.reviews-note')?.text).toContain('tóm tắt 2 bài review trên YouTube, không phải AquaTome tự thử')
  })
  test('each claim marks its video at the second it was said, numbered as the source list numbers it', () => {
    const list = dom.querySelectorAll('.sources ol a').map(a => a.getAttribute('href'))
    const marks = reviews.querySelectorAll('li').find(li => li.querySelector('a.cite'))!.querySelectorAll('a.cite')
    expect(marks.map(a => a.getAttribute('href'))).toEqual(['https://www.youtube.com/watch?v=aaaaaaaaaaa&t=95', 'https://www.youtube.com/watch?v=bbbbbbbbbbb&t=212'])
    expect(marks.map(a => a.text)).toEqual(['https://www.youtube.com/watch?v=aaaaaaaaaaa', 'https://www.youtube.com/watch?v=bbbbbbbbbbb'].map(u => String(list.indexOf(u) + 1)))
    // Not the wording of a text we translated with permission: a review we summarize, at its moment.
    expect(marks[0]!.getAttribute('data-tip')).toBe('YouTube · 1:35')
    expect(marks[0]!.getAttribute('data-more')).toBe('Xem đoạn này ↗')
  })
  test('where they differ, side by side; what one found, on its own', () => {
    expect(reviews.querySelector('.differ dt')?.text).toBe('Tiếng quạt')
    expect(reviews.querySelectorAll('.differ dd')).toHaveLength(2)
    expect(reviews.text).toContain('Chỉ một bài nhắc tới')
  })
  test('the figures a reviewer measured, how, cited; none where nothing was said about how', () => {
    const rows = reviews.querySelectorAll('.measured tbody tr')
    expect(rows.map(r => r.querySelector('th')?.text)).toEqual(['PAR ở nền, cách đèn 30 cm', 'Độ ồn ở 1 m'])
    expect(rows[0]!.querySelector('.num')?.text).toContain('48 µmol')
    expect(rows[0]!.querySelector('a.cite')?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=aaaaaaaaaaa&t=433')
    expect(rows[1]!.querySelectorAll('td')[1]?.text).toBe('–')
  })
  test('embeds the top review, with no channel or reviewer in its running text; the sources carry the titles', () => {
    expect(reviews.querySelector('button.facade')?.getAttribute('data-youtube-id')).toBe('bbbbbbbbbbb')
    expect(reviews.text).not.toContain('Example Scapes')
    expect(reviews.text).not.toContain('Kênh Ví Dụ')
    expect(dom.querySelector('.sources')?.text).toContain('Chihiros WRGB II Slim after 6 months')
  })
  test('a line the code controls gets its control block: what, where, the tool; our own test cited as ours', () => {
    const c = dom.querySelector('.control')!
    expect(c.querySelector('h2')?.text).toBe('Điều khiển bằng AquaTome')
    expect(c.text).toContain('dòng WRGB II Slim')
    expect(c.text).toContain('Chrome và Edge')
    expect(c.text).toContain('Trình duyệt trên iPhone không dùng được Bluetooth')
    expect(c.querySelector('a.tool')?.getAttribute('href')).toBe('/cong-cu/den-chihiros/')
    const mark = c.querySelector('li a.cite')!
    expect(mark.getAttribute('data-tip')).toBe('Ghi chép AquaTome tự thử')
    expect(mark.getAttribute('href')).toContain('aquarium-device-control.md')
  })
  test('a light the code doesn\'t control gets no block, whatever else the page has', () => {
    const week = page('/san-pham/week-aqua-l600-pro/')
    expect(week.dom.querySelector('.control')).toBeNull()
    expect(week.html).not.toContain('Điều khiển bằng AquaTome')
  })
})

describe('photo gallery', () => {
  test('species page: a strip of thumbs linking each photo on the gallery page; open licences only', () => {
    const { dom } = page('/ca/ca-neon-vua/')
    const strip = dom.querySelector('section.strip')!
    expect(strip.querySelector('.head a')!.getAttribute('href')).toBe('/ca/ca-neon-vua/anh/')
    // Its gallery has the readers' photos too (the gallery test below), and the link says so; a breed's has none yet.
    expect(strip.querySelector('.head a')!.textContent).toBe('Xem tất cả 45 ảnh và ảnh bạn đọc →')
    expect(page('/ca/ca-la-han/').dom.querySelector('section.strip .head a')!.textContent).not.toContain('bạn đọc')
    // A phone's row hides the heading's link and ends with its own, short enough for a tile.
    expect(strip.querySelector('a.all')!.getAttribute('href')).toBe('/ca/ca-neon-vua/anh/')
    expect(strip.querySelector('a.all')!.textContent).toBe('Xem tất cả 45 ảnh →')
    const links = [...strip.querySelectorAll('li a')].map(a => a.getAttribute('href'))
    expect(links[0]).toBe('/ca/ca-neon-vua/anh/#a1')
    expect(strip.querySelector('img')!.getAttribute('src')).toMatch(/500px-Neon1\.jpg$/)
    expect(strip.innerHTML).not.toContain('Neon3')
    const credits = dom.querySelector('#photo-credits')!.innerHTML
    for (const n of [1, 2, 4, 5, 6, 7]) expect(credits).toContain(`File:Neon${n}.jpg`)
    // On a tall computer screen the photo column goes on with the gallery's next photos (`.more`), each at its own place
    // on the gallery page and credited, up to 40 thumbnails, never the fish's own photo (#a19).
    const more = [...strip.querySelectorAll('li.more a')].map(a => a.getAttribute('href'))
    expect(links.slice(0, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map(n => `/ca/ca-neon-vua/anh/#a${n}`))
    expect(more).toEqual([...Array.from({ length: 33 }, (_, i) => i + 9).filter(n => n !== 19)].map(n => `/ca/ca-neon-vua/anh/#a${n}`))
    expect(credits).toContain('File:NeonVua43.jpg')
    expect(credits).not.toContain('File:NeonVua44.jpg')
  })
  test('a species with too few photos gets no strip, no gallery page and no chip for its photos: its photo is right above the row', () => {
    const { dom } = page('/ca/ca-neon-xanh/')
    expect(dom.querySelector('section.strip')).toBeNull()
    expect(() => readFileSync(`${DIST}/ca/ca-neon-xanh/anh/index.html`)).toThrow()
    expect(dom.querySelectorAll('nav.jump a').map(a => [a.text, a.getAttribute('href')])).toEqual([['Nuôi chung', '#muc-behaviour'], ['Mua đồ', '#mua-do']])
    expect(dom.querySelector('header.top #anh img')).not.toBeNull()
  })
  test('gallery page: its title is the count, nothing but the crumbs before it; the fish\'s name stays in the page\'s title', () => {
    const { dom } = page('/ca/ca-neon-vua/anh/')
    const h1 = dom.querySelector('h1')!
    expect(h1.text).toBe('45 ảnh')
    expect(dom.querySelectorAll('[data-gallery] a[data-i]')).toHaveLength(45)
    expect(h1.previousElementSibling?.classList.contains('crumb')).toBe(true)
    expect(h1.previousElementSibling?.previousElementSibling).toBeNull()
    expect(h1.nextElementSibling?.classList.contains('lead')).toBe(true)
    expect(dom.querySelector('title')!.text).toContain('Cá neon vua')
    expect(page('/cay/cryptocoryne-wendtii/anh/').dom.querySelector('h1')!.text).toBe('6 ảnh')
  })
  test('a fish\'s gallery page has a link down to its readers\' photos, hidden until there are any; a breed\'s and a plant\'s have none', () => {
    const { dom } = page('/ca/ca-neon-vua/anh/')
    const down = dom.querySelector('.lead a[data-to-readers]')!
    expect(down.hasAttribute('hidden')).toBe(true)
    expect(dom.querySelector(down.getAttribute('href')!)?.tagName).toBe('H2')
    for (const other of ['/ca/ca-la-han/anh/', '/cay/cryptocoryne-wendtii/anh/']) expect(page(other).dom.querySelector('[data-to-readers]'), other).toBeNull()
  })
  test('gallery page: every photo credited (author, licence, source), each tile its full photo for the viewer, ImageObject licence data, captions escaped', () => {
    const { html, dom } = page('/ca/ca-neon-vua/anh/')
    const items = [...dom.querySelectorAll('[data-gallery] a[data-i]')]
    expect(items).toHaveLength(45)
    expect(items[0]!.getAttribute('data-author')).toBe('Tác giả 1')
    expect(items[0]!.getAttribute('data-lic')).toBe('CC BY 2.0')
    expect(items[0]!.getAttribute('data-src')).toBe('https://commons.wikimedia.org/wiki/File:Neon1.jpg')
    // The viewer (scripts/photo-viewer.ts, made by the page's script) shows each tile's full photo at its size; without
    // the script the tile links to it.
    for (const a of items) expect([a.getAttribute('href'), Number(a.getAttribute('data-w')) > 0, Number(a.getAttribute('data-h')) > 0]).toEqual([a.getAttribute('data-full'), true, true])
    expect(dom.querySelector('[data-gallery] b')).toBeNull()
    expect(html.indexOf('data-gallery')).toBeLessThan(html.indexOf('</body>'))
    expect(html.lastIndexOf('<script')).toBeLessThan(html.indexOf('</html>'))
    const ld = [...dom.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)).flat()
    const g = ld.find((x: { '@type': string }) => x['@type'] === 'ImageGallery')
    expect(g.image).toHaveLength(45)
    expect(g.image[0]).toMatchObject({ '@type': 'ImageObject', creditText: 'Tác giả 1', license: 'https://creativecommons.org/licenses/by/2.0/', acquireLicensePage: 'https://commons.wikimedia.org/wiki/File:Neon1.jpg' })
    expect(g.image.find((x: { license?: string }) => x.license?.includes('publicdomain'))).toBeTruthy()
    expect(dom.querySelector('a[href="/ca/ca-neon-vua/"]')).toBeTruthy()
  })
  test('a fish\'s gallery ends with its readers\' photos, loaded live by the fish\'s key, outside the gallery\'s count and data', () => {
    const { html, dom } = page('/ca/ca-neon-vua/anh/')
    const s = dom.querySelector('section[data-reader-photos]')!
    // The fish page's key (lib/talk.ts photosKey), never a comment's: their photos list under `comment:<id>`.
    expect(s.getAttribute('data-entity')).toBe(page('/ca/ca-neon-vua/').dom.querySelector('section[data-reader-photos]')!.getAttribute('data-entity'))
    expect(s.getAttribute('data-entity')).toMatch(/^species:[a-z0-9-]+$/)
    expect(s.hasAttribute('hidden')).toBe(true)
    expect(s.hasAttribute('data-later')).toBe(true) // after the gallery's photos (components/ReaderPhotos.astro)
    expect(s.classList.contains('wrap')).toBe(false) // inside the page's margins already
    expect(s.querySelector('input[type="file"]')).toBeTruthy()
    expect(s.querySelector('button[data-more][hidden]')?.text).toBe('Xem thêm')
    // After the gallery, and none of its photos: the count in the title, the tiles and the ImageGallery data are the
    // gallery's 45 (checked above).
    expect(html.indexOf('data-gallery')).toBeLessThan(html.indexOf('data-reader-photos'))
    expect(s.querySelectorAll('a[data-i], img')).toHaveLength(0)
    expect(dom.querySelector('title')!.text).toContain('45 ảnh')
    // A fish's only (a breed's and a plant's gallery: none yet).
    for (const other of ['/ca/ca-la-han/anh/', '/cay/cryptocoryne-wendtii/anh/']) expect(page(other).dom.querySelector('[data-reader-photos]'), other).toBeNull()
  })
  test('sitemap lists the gallery page', () => {
    expect(sitemapText()).toContain('/ca/ca-neon-vua/anh/')
  })
  test('a plant gets a gallery too: the strip on its page, a gallery page naming each photo site (Indonesian and Thai addresses: i18n.test.ts)', () => {
    const { dom } = page('/cay/cryptocoryne-wendtii/')
    const strip = dom.querySelector('section.strip')!
    expect(strip.querySelector('.head a')!.getAttribute('href')).toBe('/cay/cryptocoryne-wendtii/anh/')
    expect(strip.querySelector('.head a')!.textContent).toContain('Xem tất cả 6 ảnh') // the CC BY-NC photo is left out
    expect(dom.querySelector('#photo-credits')!.innerHTML).toContain('https://www.flickr.com/photos/1@N00/102')
    const g = page('/cay/cryptocoryne-wendtii/anh/').dom
    expect(g.querySelectorAll('[data-gallery] a[data-i]')).toHaveLength(6)
    expect(g.querySelector('.lead')!.textContent).toContain('Ảnh từ iNaturalist, Flickr, Wikimedia Commons và GBIF, giấy phép mở.')
    expect(g.querySelector('.lead a')!.getAttribute('href')).toBe('/cay/cryptocoryne-wendtii/')
    expect(g.querySelector('.lead a')!.textContent).toContain('Cách trồng')
    expect(g.querySelector('.crumb a[href="/cay/"]')).toBeTruthy()
    expect(page('/cay/ray-nana/').dom.querySelector('section.strip')).toBeNull()
    expect(sitemapText()).toContain('/cay/cryptocoryne-wendtii/anh/')
  })
})

describe('man-made fish (breeds)', () => {
  test('a line of a species: kind, link to its species, care card citing its own sources, no Taxon', () => {
    const { html, dom } = page('/ca/ca-dia-pigeon-blood/')
    expect(dom.querySelector('h1')!.textContent).toBe('Cá đĩa Pigeon Blood')
    expect(dom.querySelector('.where')!.textContent).toContain('Dòng cá cảnh')
    expect(dom.querySelector('.where a')!.getAttribute('href')).toBe('/ca/ca-dia/')
    expect(dom.querySelector('.crumb a[href="/ca/ca-dia/"]')).toBeTruthy()
    // Two sources disagree on temperature: the span they give between them, each source named by its title.
    expect(dom.querySelector('[data-field="tempC"] .v')!.textContent).toBe('27–31°C')
    expect(dom.querySelector('.trust [data-src-field="tempC"]')!.textContent).toContain('Trại cá đĩa A')
    expect(dom.querySelector('.sources a[href="https://breeder.example/pigeon"]')!.getAttribute('rel')).toContain('nofollow')
    const ld = [...dom.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)).flat()
    expect(ld.some((x: { '@type': string }) => x['@type'] === 'FAQPage')).toBe(true)
    expect(html).not.toContain('"Taxon"')
    // Its text links other pages it names, never itself.
    expect(dom.querySelector('.body a[href="/ca/ca-la-han/"]')).toBeTruthy()
    expect(dom.querySelector('.body a[href="/ca/ca-dia-pigeon-blood/"]')).toBeNull()
    expect(dom.querySelector('[data-comments][data-entity="breed:pigeon-blood-discus"], [data-entity="breed:pigeon-blood-discus"]')).toBeTruthy()
    // Too few photos for a gallery page: the second photo shows in the strip, opening itself, credited.
    expect(dom.querySelector('section.strip .head a')).toBeNull()
    expect(dom.querySelector('section.strip li a')!.getAttribute('href')).toMatch(/Breed2\.jpg$/)
    expect(dom.querySelector('#photo-credits')!.innerHTML).toContain('File:Breed2.jpg')
  })
  test('a hybrid: its parents, linked when we have the species, doubtful ones marked; noindex below the bar', () => {
    const { dom } = page('/ca/ca-la-han/')
    const p = dom.querySelector('.parents')!
    expect(p.textContent).toContain('Amphilophus trimaculatus')
    expect(p.querySelector('a')!.getAttribute('href')).toBe('/ca/ca-dia/')
    expect(p.querySelector('a')!.textContent).toMatch(/^Cá đĩa \(Symphysodon/)
    expect(p.textContent).toContain('chưa chắc chắn')
    expect(dom.querySelector('meta[name="robots"]')!.getAttribute('content')).toContain('noindex')
    expect(dom.querySelector('section.strip .head a')!.getAttribute('href')).toBe('/ca/ca-la-han/anh/')
  })
  test('a breed gallery page has no scientific name', () => {
    const { dom } = page('/ca/ca-la-han/anh/')
    expect(dom.querySelector('.lead')!.textContent).toMatch(/^Ảnh từ Wikimedia Commons/)
    expect(dom.querySelector('.lead .sci')).toBeNull()
  })
  test('the species page lists its lines and hybrids, crediting their pictures; the species list shows them', () => {
    const { dom } = page('/ca/ca-dia/')
    const names = [...dom.querySelectorAll('section.breeds .n')].map(x => x.textContent)
    expect(names).toEqual(['Cá đĩa Pigeon Blood', 'Cá La Hán (Flowerhorn)'])
    expect(dom.querySelector('#photo-credits')!.innerHTML).toContain('photos/a-red-discus-fish-Pb1Fixture1')
    expect(page('/ca/').dom.querySelector('section.breeds a[href="/ca/ca-la-han/"]')).toBeTruthy()
  })
  // The owner (2026-11-06): a breed's card shows its figures as a species' card does, from its own care card.
  test("a breed's card shows its temperature and pH as a species' does, or says it has none", () => {
    const cards = [...page('/ca/').dom.querySelectorAll('section.breeds .sc')]
    const pigeon = cards.find(c => c.querySelector('.n')!.textContent === 'Cá đĩa Pigeon Blood')!
    expect(pigeon.querySelector('.label dt')!.textContent).toBe('Nhiệt độ')
    expect(pigeon.querySelector('.label dd')!.getAttribute('data-c')).toMatch(/^\d+,\d+$/)
    expect(JSON.parse(pigeon.getAttribute('data-fig')!).tempC).toEqual({ min: Number(pigeon.querySelector('.label dd')!.getAttribute('data-c')!.split(',')[0]), max: Number(pigeon.querySelector('.label dd')!.getAttribute('data-c')!.split(',')[1]) })
    const flowerhorn = cards.find(c => c.querySelector('.n')!.textContent === 'Cá La Hán (Flowerhorn)')!
    expect(flowerhorn.querySelector('.label.none')!.textContent).toBe('Chưa có số liệu')
    expect(JSON.parse(flowerhorn.getAttribute('data-fig')!)).toEqual({})
  })
  // The owner (2026-11-06): no bred fish's page said how hard it is to keep. Its own sources' figure, as a species'.
  test("a breed's data card gives its difficulty (the word, N/8, why) and lifespan as a species' does, and its card on the fish list the difficulty the filter reads", () => {
    const { dom } = page('/ca/ca-vang-oranda/')
    const diff = dom.querySelector('.datacard .card [data-field="difficulty"]')!
    expect(diff.querySelector('summary .diff')!.textContent).toBe('Dễ')
    expect(diff.querySelector('summary .n')!.textContent).toBe('3/8')
    expect(diff.querySelector('summary .q')!.textContent).toBe('Vì sao?')
    expect(diff.querySelectorAll('.needs li[data-need]').map(li => li.getAttribute('data-need'))).toEqual(['space', 'water', 'temperature'])
    expect(dom.querySelector('.datacard .card [data-field="lifeYears"] .v')!.textContent).toBe('10–15 năm')
    expect(dom.querySelector('.trust [data-src-field="difficulty"]')!.textContent).toContain('Bài D')
    expect(dom.querySelector('.trust [data-src-field="lifeYears"]')!.textContent).toContain('Trại cá vàng E')
    const card = [...page('/ca/').dom.querySelectorAll('section.breeds .sc')].find(c => c.querySelector('.n')!.textContent === 'Cá vàng Oranda')!
    expect(card.querySelector('.lvl .diff')!.textContent).toBe('Dễ')
    expect(JSON.parse(card.getAttribute('data-fig')!)).toEqual({ tempC: { min: 18, max: 24 }, ph: { min: 6.5, max: 7.5 }, difficulty: 3 })
  })
  test('on the species list the breed cards lead the page: small pictures, loaded at once', () => {
    const img = page('/ca/').dom.querySelector('section.breeds img')!
    expect(img.getAttribute('src')).toContain('&w=480&') // the lead's small copy: Unsplash's, at 480 px
    expect(img.getAttribute('loading')).toBe('eager')
    expect(page('/ca/ca-dia/').dom.querySelector('section.breeds img')!.getAttribute('loading')).toBe('lazy')
  })
  test('sitemap: indexable breed pages only', () => {
    const sm = sitemapText()
    expect(sm).toContain('/ca/ca-dia-pigeon-blood/')
    expect(sm).not.toContain('/ca/ca-la-han/')
  })
})

describe('header and menu sheet', () => {
  const sections = (dom: ReturnType<typeof page>['dom'], sel: string) => dom.querySelectorAll(`${sel} a`).map(a => a.getAttribute('href'))
  test('five sections in the header row; the sheet adds Thiết bị and Mới cập nhật, then units, theme and language', () => {
    const { dom } = page('/')
    expect(sections(dom, 'header.nav .sections')).toEqual(['/ca/', '/cay/', '/huong-dan/', '/cong-cu/', '/thuat-ngu/'])
    expect(sections(dom, '#site-menu .go')).toEqual(['/ca/', '/cay/', '/huong-dan/', '/cong-cu/', '/thuat-ngu/'])
    expect(sections(dom, '#site-menu .more')).toEqual(['/thiet-bi/', '/moi-cap-nhat/'])
    for (const sel of ['[data-units-toggle]', '[data-theme-toggle] [data-theme-mode]', '[data-lang-menu]']) expect(dom.querySelector(`#site-menu ${sel}`), sel).not.toBeNull()
    expect(dom.querySelector('header [data-menu-open]')?.getAttribute('aria-controls')).toBe('site-menu')
    expect(dom.querySelectorAll('footer a').map(a => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/thiet-bi/', '/moi-cap-nhat/']))
  })
  test('other languages: the sheet lists only pages they have, with translated labels', () => {
    const { dom } = page('/id/')
    expect(sections(dom, '#site-menu .more')).toEqual(['/id/peralatan/'])
    expect(dom.querySelector('#site-menu-h')?.text).not.toBe('')
    expect(dom.querySelector('#site-menu .go a[href="/id/istilah/"]')?.text).toBe('Istilah')
  })
})

test('the logo link is named by its visible text (no aria-label that differs from it)', () => {
  const a = page('/').dom.querySelector('a.logo')!
  expect(a.hasAttribute('aria-label')).toBe(false)
  expect(a.text.replace(/\s+/g, ' ').trim()).toBe('AquaTome Cẩm nang cá cảnh & thủy sinh')
})

test('every page has the language menu; a fish without other-language pages offers their fish lists', () => {
  // The header's (computers) and the menu sheet's (phones).
  for (const path of ['/', '/ca/ca-neon-vua/', '/video/', '/id/', '/th/', '/ms/']) for (const menu of ['header', '#site-menu']) {
    const links = page(path).dom.querySelectorAll(`${menu} [data-lang-menu] a[data-lang]`)
    expect(links.map(a => a.getAttribute('data-lang')), `${path} ${menu}`).toEqual([...LANGS])
  }
  for (const menu of ['header', '#site-menu']) {
    const fish = page('/ca/ca-neon-vua/').dom.querySelectorAll(`${menu} [data-lang-menu] a[data-lang]`)
    expect(fish.map(a => [a.getAttribute('href'), a.getAttribute('aria-current')]), menu).toEqual([['/ca/ca-neon-vua/', 'true'], ['/id/ikan/', undefined], ['/th/fish/', undefined], ['/ms/ikan/', undefined]])
    // On an Indonesian page the Vietnamese link stays Vietnamese (localizeLinks leaves hreflang links alone).
    const id = page('/id/').dom.querySelectorAll(`${menu} [data-lang-menu] a[data-lang]`)
    expect(id.map(a => [a.getAttribute('href'), a.getAttribute('aria-current')]), menu).toEqual([['/', undefined], ['/id/', 'true'], ['/th/', undefined], ['/ms/', undefined]])
  }
})
