import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { DIST, page } from './dist'

describe('species page', () => {
  const { html, dom } = page('/vi/ca/ca-neon-vua/')
  test('shows scientific name and Seriously Fish credit link', () => {
    expect(html).toContain('Paracheirodon axelrodi')
    expect(dom.querySelector('a[href="https://www.seriouslyfish.com/species/paracheirodon-axelrodi"]')).not.toBeNull()
  })
  test('sources disagree on temperature: the range they all accept, each source one tap away', () => {
    const t = dom.querySelector('.card [data-field="tempC"][data-conflict="true"]')!
    expect(t.querySelector('.v')?.text).toBe('24–27°C') // Seriously Fish 24–30, Glaser 23–27
    // Only the cell the sources disagree on is marked; one toggle per card holds every value's sources.
    expect(dom.querySelectorAll('.card [data-conflict]').map(c => c.getAttribute('data-field'))).toEqual(['tempC'])
    expect(dom.querySelectorAll('.card .mark').length).toBe(1)
    expect(dom.querySelectorAll('.datacard details').length).toBe(1)
    expect(dom.querySelector('.datacard summary .label')?.text).toBe('Nguồn và độ tin cậy')
    const by = dom.querySelector('.trust [data-src-field="tempC"]')!
    expect(by.querySelector('p')?.text).toBe('Mức mọi nguồn cùng khuyên')
    expect(by.querySelectorAll('li').map(l => l.text)).toEqual(['Seriously Fish: 24–30°C', 'Aquarium Glaser: 23–27°C'])
    expect(by.querySelectorAll('li span').map(s => s.getAttribute('data-c'))).toEqual(['24,30', '23,27']) // °F toggle too
    expect(dom.querySelector('.trust [data-src-field="ph"] li')?.text).toBe('Seriously Fish')
    expect(html).not.toContain('nguồn khác nhau')
  })
  test('the name and four key facts come before the photo, from the data card\'s own values', () => {
    const top = dom.querySelector('header.top')!
    const order = top.childNodes.filter(n => n.nodeType === 1).map(n => (n as typeof top).getAttribute('class')?.split(' ')[0])
    expect(order).toEqual(['id', 'photo', 'facts'])
    const facts = top.querySelectorAll('.id .keyfacts > div')
    expect(facts.map(f => f.getAttribute('data-field'))).toEqual(['tempC', 'ph', 'tankCm', 'difficulty'])
    expect(facts[0]!.querySelector('[data-c]')?.getAttribute('data-c')).toBe('24,27') // the card's resolved range, °F toggle too
    expect(facts[2]!.querySelector('[data-cm]')?.text).toBe('60 cm')
    expect(facts[3]!.querySelector('dd')?.text.trim()).toBe('Dễ')
  })
  test('jump row: the main parts this page has, in page order, each to its section', () => {
    const links = dom.querySelectorAll('nav.jump a')
    expect(links.map(a => [a.text, a.getAttribute('href')])).toEqual([
      ['Ảnh', '#gal-h'], ['Nước', '#muc-waterConditions'], ['Thức ăn', '#muc-diet'], ['Nuôi chung', '#muc-behaviour'], ['Sinh sản', '#muc-reproduction'],
    ])
    for (const a of links) expect(dom.querySelector(a.getAttribute('href')!), a.getAttribute('href')!).not.toBeNull()
  })
  test('"Nuôi chung" block: temperament, group size, species to keep with it and away from it, the checker pre-filled', () => {
    const box = dom.querySelector('.facts .mates')!
    expect(box.querySelector('.tag')?.text).toBe('Hiền')
    expect(box.querySelector('.traits')?.text).toContain('8 con')
    const [good, avoid] = box.querySelectorAll('.row')
    expect(good!.querySelectorAll('a').map(a => a.getAttribute('href'))).toEqual(['/vi/ca/ca-neon-xanh/', '/vi/ca/ca-boraras-do/'])
    expect(avoid!.querySelector('a')?.getAttribute('href')).toBe('/vi/ca/ca-apisto-cacatuoides/')
    expect(avoid!.querySelector('.why')?.text).toBe('Hơi dữ, có thể rượt đuổi Cá neon vua')
    expect(box.querySelector('a[href="/vi/cong-cu/nuoi-chung/?ca=ca-neon-vua:8"]')).not.toBeNull()
    expect(box.getAttribute('data-pagefind-ignore')).not.toBeNull()
  })
  // The card is the page's one copy of each figure (design critique 2026-10-31: the text said 5 cm, "Trung bình", pH 3,5–7,5
  // where the card said 3,5 cm, Dễ, pH 4,6–6,2).
  test('quick facts: what the card already gives is left out, the rest stays', () => {
    const glaser = dom.querySelector('section[data-section="quickFacts"] .prose[data-source="glaser"]')!
    const items = glaser.querySelectorAll('li')
    expect(items.length).toBe(1) // no family, no temperature
    expect(items[0]!.text).toMatch(/^Nguồn gốc: Rio Negro, Brazil\d$/) // and its source's mark
    expect(page('/vi/ca/ca-neon-xanh/').dom.querySelector('section[data-section="quickFacts"]')).toBeNull() // nothing but the card's
  })
  test('a block stating a figure the card shows otherwise says which source it follows, with both figures', () => {
    const note = dom.querySelector('section[data-section="waterConditions"] p.off')!
    expect(note.text.replace(/\s+/g, ' ').trim()).toBe('Seriously Fish ghi khác bảng dữ liệu: nhiệt độ 24–30°C (bảng: 24–27°C).')
    expect(note.getAttribute('data-source')).toBe('seriouslyfish')
    expect(note.getAttribute('data-pagefind-ignore')).not.toBeNull()
    expect(note.querySelectorAll('[data-c]').map(x => x.getAttribute('data-c'))).toEqual(['24,30', '24,27']) // °F toggle too
    expect(note.nextElementSibling?.getAttribute('data-source')).toBe('seriouslyfish') // above its own block
    expect(dom.querySelectorAll('p.off').length).toBe(1) // pH 4–6 is the card's own figure: nothing to say
  })
  test('the phone\'s key facts mark a value the sources disagree on, as the card does', () => {
    expect(dom.querySelectorAll('.keyfacts [data-conflict]').map(x => x.getAttribute('data-field'))).toEqual(['tempC'])
    expect(dom.querySelector('.keyfacts [data-field="tempC"] dt .mark')?.text).toBe('Các nguồn ghi khác nhau')
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
  test('product slots are sponsored /go/ links carrying the placement', () => {
    const a = dom.querySelector('a[href^="/go/shopee/?k="]')
    expect(a?.getAttribute('rel')).toContain('sponsored')
    expect(a?.getAttribute('href')).toContain('e=species%3Aparacheirodon-axelrodi')
    expect(dom.querySelector('a[href^="/go/tiki/?k="]')).not.toBeNull()
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
  const { dom } = page('/vi/ca/ca-boraras-do/')
  expect(dom.querySelector('section[data-section="dimorphism"]')).toBeNull()
  expect(dom.querySelector('[data-field="gh"]')).toBeNull()
  expect(dom.querySelector('nav.jump')).toBeNull() // none of the main parts to jump to
})

test('"Nuôi chung" shows only what the data supports: no temperament, no "hợp với"; a clash still listed', () => {
  const box = page('/vi/ca/ca-galaxy/').dom.querySelector('.mates')! // no behaviour traits for this one
  expect(box.querySelector('.traits')).toBeNull()
  expect(box.querySelectorAll('.row').length).toBe(1)
  expect(box.querySelector('.row h3')?.text).toBe('Tránh')
  const why = box.querySelector('.row .why')!
  expect(why.text).toBe('Lớn tới 9 cm, có thể ăn Cá galaxy') // the apisto: 9 cm against 2,5 cm, said on the chip
  expect(why.querySelector('[data-cm]')?.getAttribute('data-cm')).toBe('9,9') // the inch toggle converts it
})

test('low-quality page is noindex', () => {
  expect(page('/vi/ca/ca-boraras-do/').html).toMatch(/<meta name="robots" content="noindex/)
  expect(page('/vi/ca/ca-neon-vua/').html).not.toMatch(/noindex/)
})

test('a thin page (one dealer\'s note) stays out of search; a heading over a few words is a quick fact instead', () => {
  const { html, dom } = page('/vi/ca/ca-ong-tien/')
  expect(html).toMatch(/<meta name="robots" content="noindex/)
  expect(readFileSync(`${DIST}/sitemap.xml`, 'utf8')).not.toContain('/vi/ca/ca-ong-tien/')
  // "Spawns on leaves." under its own heading becomes a line of the quick facts, with its source's mark; "Amazon basin."
  // is left out, the quick facts already say it.
  expect(dom.querySelectorAll('section[data-section]').map(s => s.getAttribute('data-section'))).toEqual(['quickFacts'])
  const facts = dom.querySelector('#muc-quickFacts')!
  expect(facts.querySelectorAll('li').map(li => li.text)).toEqual(['Sinh sản: Đẻ trứng trên lá.1'])
  expect(facts.querySelector('li strong')?.text).toBe('Sinh sản:')
  expect(dom.querySelectorAll('nav.jump a').map(a => a.text)).not.toContain('Sinh sản')
})

test('home features well-known species and links the full list instead of every card', () => {
  const { dom } = page('/vi/')
  const cards = dom.querySelectorAll('article.sc a[href^="/vi/ca/"]').map(a => a.getAttribute('href'))
  for (const slug of ['ca-neon-xanh', 'tep-red-cherry']) expect(cards, slug).toContain(`/vi/ca/${slug}/`)
  expect(cards.length).toBeLessThanOrEqual(8)
  expect(dom.querySelector('a[href="/vi/ca/"]')).toBeTruthy()
  // Full data cards first: Cá ông tiên (a staple, only its size known) only fills a spot no complete species can.
  const full = dom.querySelectorAll('section[aria-labelledby="featured-h"] article.sc').map(c => c.querySelectorAll('.label dd').length >= 2)
  expect(full.length).toBeGreaterThan(0)
  expect(full).toEqual([...full].sort((a, b) => Number(b) - Number(a)))
})

test('species page has JSON-LD', () => {
  expect(page('/vi/ca/ca-neon-vua/').html).toContain('application/ld+json')
})

describe('browse pages', () => {
  const species = (path: string) => new Set(page(path).dom.querySelectorAll('a[href^="/vi/ca/"]').map(a => a.getAttribute('href')))
  test('genus page lists both Paracheirodon', () => {
    const s = species('/vi/phan-loai/characiformes/characidae/paracheirodon/')
    expect(s.has('/vi/ca/ca-neon-vua/') && s.has('/vi/ca/ca-neon-xanh/')).toBe(true)
  })
  test('order and family pages exist', () => {
    expect(species('/vi/phan-loai/cichliformes/').has('/vi/ca/ca-dia/')).toBe(true)
    expect(page('/vi/phan-loai/').html).toContain('Characiformes')
  })
  test('country page lists its species', () => {
    expect(species('/vi/nguon-goc/south-america/brazil/').has('/vi/ca/ca-neon-vua/')).toBe(true)
    expect(species('/vi/nguon-goc/asia/').has('/vi/ca/ca-galaxy/')).toBe(true)
  })
  test('every group has a page', () => {
    for (const g of ['tetras', 'cichlids', 'danios', 'shrimp', 'rasboras']) expect(species(`/vi/nhom/${g}/`).size, g).toBeGreaterThan(0)
  })
  test('species list embeds a filter index and unit-tagged values', () => {
    const { dom, html } = page('/vi/ca/')
    expect(JSON.parse(dom.querySelector('#species-index')!.text)).toHaveLength(9)
    expect(page('/vi/ca/ca-neon-vua/').html).toMatch(/data-c="24,27"/)
    expect(html).toContain('data-units-toggle')
  })
})

describe('plants, guides, glossary, equipment, discovery', () => {
  test('plant page shows growing needs and shop links', () => {
    const { html, dom } = page('/vi/cay/ray-nana/')
    for (const t of ['Ánh sáng', 'CO₂', 'Tốc độ mọc']) expect(html).toContain(t)
    const shop = dom.querySelector('a[href^="/go/shopee/?k="]')?.getAttribute('href') ?? ''
    expect(new URLSearchParams(shop.split('?')[1]).get('c')).toBe('cay-thuy-sinh') // plants are always an affiliate item
    // a plant whose slots lack the plant category still gets one, first
    const mc = page('/vi/cay/monte-carlo/').dom.querySelectorAll('a[href^="/go/shopee/?k="]').map(a => new URLSearchParams(a.getAttribute('href')!.split('?')[1]).get('c'))
    expect(mc[0]).toBe('cay-thuy-sinh')
    expect(mc).toContain('den')
    expect(page('/vi/cay/').dom.querySelectorAll('a[href^="/vi/cay/"]').length).toBeGreaterThanOrEqual(3)
  })
  test('guide page credits its source and links glossary terms', () => {
    const { html, dom } = page('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
    expect(html).toContain('2Hr Aquarist')
    expect(dom.querySelector('main .gl')).not.toBeNull()
    // Each term carries its name and definition for the hover/tap card.
    const gl = dom.querySelector('main a.gl')!
    expect(gl.getAttribute('data-term')).toBeTruthy()
    expect(gl.getAttribute('data-tip')!.length).toBeGreaterThan(20)
  })
  test('guide links species, genus and equipment it names; those pages link back', () => {
    const { dom } = page('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
    const links = dom.querySelectorAll('article .prose a.ml').map(a => [a.text, a.getAttribute('href')])
    expect(links).toContainEqual(['cá neon xanh', '/vi/ca/ca-neon-xanh/'])
    expect(links).toContainEqual(['Paracheirodon', expect.stringMatching(/^\/vi\/phan-loai\/[a-z]+\/characidae\/paracheirodon\/$/)])
    expect(links.find(([, h]) => h === '/vi/thiet-bi/loc/')).toBeDefined()
    expect(links.filter(([, h]) => h === '/vi/ca/ca-neon-xanh/')).toHaveLength(1) // first mention only
    expect(dom.querySelectorAll('.chips a').map(a => a.getAttribute('href'))).toContain('/vi/thiet-bi/loc/')
    const back = (p: string) => page(p).dom.querySelectorAll('a[href="/vi/huong-dan/setup-be-thuy-sinh-dau-tien/"]').length
    expect(back('/vi/ca/ca-neon-xanh/')).toBeGreaterThan(0)
    expect(back('/vi/thiet-bi/loc/')).toBeGreaterThan(0)
  })
  test('glossary index lists every term and term pages exist', () => {
    const { dom } = page('/vi/thuat-ngu/')
    expect(dom.querySelectorAll('a[href^="/vi/thuat-ngu/"]').length).toBeGreaterThanOrEqual(4)
    expect(page('/vi/thuat-ngu/chu-trinh-nito/').html).toContain('Nitrogen cycle')
  })
  test('species body links a glossary term', () => {
    expect(page('/vi/ca/ca-neon-vua/').dom.querySelector('section[data-section] .gl')).not.toBeNull()
  })
  test('equipment index and a page per product category', () => {
    for (const cat of ['be-ca', 'loc', 'thuc-an', 'suoi', 'cay-thuy-sinh']) expect(page(`/vi/thiet-bi/${cat}/`).html, cat).toContain(`/go/shopee/?k=`)
    expect(page('/vi/thiet-bi/').dom.querySelectorAll('a[href^="/vi/thiet-bi/"]').length).toBeGreaterThanOrEqual(5)
  })
  test('equipment guide: hero, types with the species that need them, FAQ data; shop links collapsed', () => {
    const { html, dom } = page('/vi/thiet-bi/loc/')
    expect(dom.querySelector('.hero img')).not.toBeNull()
    const thung = dom.querySelector('article.type#thung')!
    expect(thung.querySelector('img')).not.toBeNull()
    expect(thung.querySelectorAll('.who a[href^="/vi/ca/"]').length).toBeGreaterThan(0) // fixture species suggest "lọc thùng …"
    expect(html).toContain('"@type":"FAQPage"')
    const visible = dom.querySelectorAll('a[href^="/go/"]').filter(a => !a.closest('details'))
    expect(visible.length).toBeLessThanOrEqual(dom.querySelectorAll('article.type').length * 7)
    expect(page('/vi/thiet-bi/').dom.querySelector('a[href="/vi/thiet-bi/loc/"] img')).not.toBeNull()
    expect(page('/vi/thiet-bi/suoi/').html).toContain('/go/shopee/?k=') // no written guide yet: still a page
  })
  test('renamed page: old address in /redirects.json, hidden "Chuyển hướng từ" note, aliases in structured data', () => {
    const table = JSON.parse(readFileSync(`${DIST}/redirects.json`, 'utf8'))
    expect(table['/vi/ca/ca-neon-vua-super-red/']).toBe('/vi/ca/ca-neon-vua/?tu=ca-neon-vua-super-red')
    const { html, dom } = page('/vi/ca/ca-neon-vua/')
    const note = dom.querySelector('p.redirected[data-from="ca-neon-vua-super-red"]')!
    expect(note.hasAttribute('hidden')).toBe(true)
    expect(note.text).toContain('Cá neon vua Super Red')
    expect(html).toContain('"alternateName":[')
  })
  test('discovery lists discovery guides', () => {
    expect(page('/vi/kham-pha/').dom.querySelector('a[href="/vi/huong-dan/hang-moi-ve-nhung-loai-hiem-thang-nay/"]')).not.toBeNull()
  })
  test('Vietnam hub exists', () => {
    expect(page('/vi/nguon-goc/asia/vietnam/').html).toContain('Cá Việt Nam')
  })
  test('every link in the header, the menu sheet and the footer resolves; the old Khám phá address still does', () => {
    const links = page('/vi/').dom.querySelectorAll('header.nav a, #site-menu a, footer a').map(a => a.getAttribute('href')!).filter(h => /^\/vi\/.+\/$/.test(h))
    expect(links.length).toBeGreaterThan(10)
    for (const p of [...links, '/vi/kham-pha/']) expect(() => page(p), p).not.toThrow()
  })
})

describe('review fixes', () => {
  test('pages with photo cards credit every photo', () => {
    for (const p of ['/vi/', '/vi/ca/', '/vi/nhom/tetras/']) {
      const { html } = page(p)
      expect(html, p).toContain('CHUCAO')
      expect(html, p).toContain('Holger Krisp')
    }
    expect(page('/vi/cay/').html).toContain('Abhik.Mazumdar.73')
  })
  test('glossary pages honour quality.indexable', () => {
    expect(page('/vi/thuat-ngu/gh/').html).toMatch(/noindex/)
  })
})

test('a styled 404 page exists for the static host', () => {
  expect(page('/404').html).toContain('Không tìm thấy trang')
})

test("what's new lists changelog entries that exist, with links", () => {
  const { dom } = page('/vi/moi-cap-nhat/')
  const hrefs = dom.querySelectorAll('[data-changelog] a').map(a => a.getAttribute('href'))
  expect(hrefs).toEqual(['/vi/ca/ca-neon-vua/', '/vi/huong-dan/setup-be-thuy-sinh-dau-tien/'])
})

test('static /go/ fallback pages exist for hosting without the Worker, and are noindex', () => {
  for (const n of ['shopee', 'lazada', 'tiki']) {
    const { html } = page(`/go/${n}/`)
    expect(html).toContain('noindex')
    expect(html).toMatch(/location\.replace/)
  }
})

test('approved summary shows above the sections; pending drafts stay hidden', () => {
  const { dom } = page('/vi/ca/ca-neon-vua/')
  expect(dom.querySelector('section.qs')?.text).toContain('nuôi đàn từ 8 con')
  expect(page('/vi/ca/ca-dia/').html).not.toContain('Bản nháp chưa duyệt')
})

test('cards use the recorded thumb, Wikimedia 500px, else the full photo', async () => {
  const { smallSrc } = await import('../src/lib/img')
  const base = { width: 800, height: 600, licence: 'x', author: 'x', sourceUrl: 'x' }
  expect(smallSrc({ ...base, url: 'https://media.aquatome.com/s/a.webp', thumb: 'https://media.aquatome.com/s/a-480.webp' })).toBe('https://media.aquatome.com/s/a-480.webp')
  expect(smallSrc({ ...base, url: 'https://media.aquatome.com/s/a.webp' })).toBe('https://media.aquatome.com/s/a.webp')
  expect(smallSrc({ ...base, url: 'https://upload.wikimedia.org/w/thumb/a/F.jpg/960px-F.jpg' })).toBe('https://upload.wikimedia.org/w/thumb/a/F.jpg/500px-F.jpg')
})

test('owner hide button script is on content pages but not the 404 page', () => {
  expect(page('/vi/ca/ca-dia/').dom.querySelector('script[data-owner]')?.text).toContain('/_ab/hidden')
  expect(page('/vi/').dom.querySelector('script[data-owner]')?.text).toContain("['Quản trị','/_ab/']") // admin link on every page, home included
  expect(page('/vi/').dom.querySelectorAll('footer a[href^="/_ab"]')).toHaveLength(0) // no admin link for visitors; the owner bar needs the owner cookie
  expect(page('/404').dom.querySelector('script[data-owner]')).toBeNull()
})

test('pictures inside the text: extra species photos between sections, a mentioned species pictured in the guide', () => {
  const { dom } = page('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
  expect(dom.querySelectorAll('article .prose figure.inl a[href="/vi/ca/ca-neon-xanh/"]').length).toBeGreaterThan(0)
  for (const slug of ['ca-neon-vua', 'ca-dia', 'ca-galaxy']) {
    const sp = page(`/vi/ca/${slug}/`).dom
    const sections = sp.querySelectorAll('section[data-section]').length
    expect(sp.querySelectorAll('.body > figure.inl').length, slug).toBeLessThan(sections)
    expect(sp.querySelector('.gallery .thumbs'), slug).toBeNull()
  }
})

test('species text never links to the page itself; glossary and genus links come from one pass', () => {
  for (const slug of ['ca-neon-vua', 'ca-neon-xanh', 'ca-dia', 'ca-galaxy', 'tep-red-cherry']) {
    const { dom } = page(`/vi/ca/${slug}/`)
    expect(dom.querySelectorAll(`section[data-section] a[href="/vi/ca/${slug}/"]`), slug).toHaveLength(0)
  }
  expect(page('/vi/ca/ca-neon-vua/').dom.querySelector('section[data-section] a.gl[href^="/vi/thuat-ngu/"]')).not.toBeNull()
})

test('species cards are specimen labels: temperature and pH bars, difficulty in words, no family line', () => {
  const { dom } = page('/vi/')
  const card = dom.querySelector('article.sc')!
  expect(card.querySelectorAll('.rb').length).toBeGreaterThan(0)
  expect(card.querySelector('.diff')?.text).toMatch(/^(Dễ|Vừa|Khó)$/)
  expect(card.querySelector('.fam')).toBeNull()
  const bar = card.querySelector('.rb i')!.getAttribute('style')!
  expect(bar).toMatch(/left:[\d.]+%;width:[\d.]+%/)
})

test('home leads with the tank form (to the species filter) and three first steps', () => {
  const { dom, html } = page('/vi/')
  const form = dom.querySelector('form#tank')!
  expect(form.getAttribute('action')).toBe('/vi/ca/')
  for (const n of ['tankCm', 'tempC', 'ph']) expect(form.querySelector(`input[name="${n}"]`)).toBeTruthy()
  expect(html.indexOf('id="tank"')).toBeLessThan(html.indexOf('featured-h'))
  expect(html).toContain("localStorage.setItem(k")
  expect(dom.querySelector('#fresh-h')).toBeNull() // "Mới trên AquaTome" moved off the home page
})

test('species list: every card in the HTML, a "show more" pager, collapsible filters with difficulty in words', () => {
  const { dom, html } = page('/vi/ca/')
  expect(dom.querySelector('#species-more')).toBeTruthy()
  expect(html.indexOf('id="species-filter"')).toBeLessThan(html.indexOf('id="breeds-h"')) // the search comes before the breed cards
  expect(dom.querySelector('details#filter-box[open] form#species-filter')).toBeTruthy()
  expect(dom.querySelectorAll('select[name="difficultyMax"] option').map(o => o.text)).toEqual(['Bất kỳ', 'Dễ', 'Dễ và vừa'])
  expect(dom.querySelectorAll('[data-slug]').length).toBeGreaterThan(0)
})

test('guide pages show reading time and suggest what to read next', () => {
  const { dom } = page('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
  expect(dom.querySelector('.kind')?.text).toMatch(/đọc khoảng \d+ phút/)
  const next = dom.querySelectorAll('#next-h ~ .grid a').map(a => a.getAttribute('href'))
  expect(next).not.toContain('/vi/huong-dan/setup-be-thuy-sinh-dau-tien/')
})

test('species pages carry a hidden reader-photo section (gallery + upload form) for their entity', () => {
  const { dom } = page('/vi/ca/ca-neon-vua/')
  const s = dom.querySelector('section[data-reader-photos]')!
  expect(s.getAttribute('data-entity')).toMatch(/^species:/)
  expect(s.hasAttribute('hidden')).toBe(true)
  expect(s.querySelector('input[type="file"][accept="image/jpeg,image/png,image/webp"]')).toBeTruthy()
  expect(s.querySelector('input[name="consent"][required]')).toBeTruthy()
})

describe('video guide', () => {
  const { html, dom } = page('/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
  test('click-to-load player with Vietnamese captions, credited to the channel', () => {
    expect(html).not.toContain('<iframe')
    expect(dom.querySelector('figure[data-vp="vl1Lx9iWDYU"] button.facade')).not.toBeNull()
    expect(dom.querySelector('.facade .cover')?.text).toBe('Bí quyết trị rêu hại')
    expect(dom.querySelector('.credit')?.text).toContain('Bài viết của AquaTome, dựa trên video của MJ Aquascaping')
    expect(dom.querySelector('figcaption a[href="https://www.youtube.com/watch?v=vl1Lx9iWDYU"]')).not.toBeNull()
  })
  test('the thumbnail is fast to show: phones get the 640 px one, and the connection opens from the head', () => {
    expect(dom.querySelector('.facade picture source[media="(max-width: 480px)"]')?.getAttribute('srcset')).toBe('https://i.ytimg.com/vi/vl1Lx9iWDYU/sddefault.jpg')
    expect(dom.querySelector('.facade picture img')?.getAttribute('src')).toBe('https://i.ytimg.com/vi/vl1Lx9iWDYU/maxresdefault.jpg')
    expect(dom.querySelector('head link[rel="preconnect"][href="https://i.ytimg.com"]')).not.toBeNull()
  })
  test('chapters in Vietnamese seek the video; summary and FAQ shown', () => {
    const marks = dom.querySelectorAll('.chapters button[data-t]')
    expect(marks.map(b => b.getAttribute('data-t'))).toEqual(['0', '31', '91'])
    expect(marks[1]?.text).toContain('Thay nước đều đặn')
    expect(dom.querySelectorAll('.takeaways li')).toHaveLength(2)
    expect(dom.querySelector('.faq summary')?.text).toBe('Nên thay nước lúc nào?')
    expect(dom.querySelector('.crumb a[href="/vi/video/reu-hai-tu-a-den-z/"]')).not.toBeNull()
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

describe('video pages', () => {
  test('/vi/video/ lists series with a published guide only', () => {
    const { dom } = page('/vi/video/')
    expect(dom.querySelector('h2 a[href="/vi/video/reu-hai-tu-a-den-z/"]')).not.toBeNull()
    expect(dom.querySelector('a[href="/vi/video/trong/"]')).toBeNull()
    expect(dom.querySelector('.gc .dur')?.text).toContain('29:15')
    expect(dom.querySelector('.gc .cover')?.text).toBe('Bí quyết trị rêu hại')
  })
  test('series page lists parts in order with an ItemList', () => {
    const { dom } = page('/vi/video/reu-hai-tu-a-den-z/')
    expect(dom.querySelectorAll('.parts li')).toHaveLength(1)
    const ld = dom.querySelectorAll('script[type="application/ld+json"]').map(s => JSON.parse(s.text))
    expect(ld.find(j => j['@type'] === 'ItemList').itemListElement[0].url).toContain('/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
  })
  test('video guides: Hướng dẫn marked in the nav, kept off the text-guide index (which links to /vi/video/)', () => {
    const { dom } = page('/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
    expect(dom.querySelector('.nav a[aria-current="page"]')?.getAttribute('href')).toBe('/vi/huong-dan/')
    expect(dom.querySelector('#site-menu a[aria-current="page"]')?.getAttribute('href')).toBe('/vi/huong-dan/')
    expect(page('/vi/video/').dom.querySelector('.nav a[aria-current="page"]')?.getAttribute('href')).toBe('/vi/huong-dan/')
    const idx = page('/vi/huong-dan/').dom
    expect(idx.querySelector('a[href="/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).toBeNull()
    expect(idx.querySelector('.vid a[href="/vi/video/"]')).not.toBeNull()
  })
  test('single videos: grouped by channel on /vi/video/, a channel page, a breadcrumb to it; no caption promise when transcribed', () => {
    const idx = page('/vi/video/').dom
    expect(idx.querySelector('h2 a[href="/vi/video/kenh/green-aqua/"]')?.text).toBe('Video lẻ của Green Aqua')
    const ch = page('/vi/video/kenh/green-aqua/').dom
    expect(ch.querySelector('.grid a[href="/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/"]')).not.toBeNull()
    const g = page('/vi/huong-dan/bon-phan-cho-cay-thuy-sinh/').dom
    expect(g.querySelector('.crumb a[href="/vi/video/kenh/green-aqua/"]')).not.toBeNull()
    expect(g.querySelector('.facade .cc')).toBeNull()
    expect(page('/vi/video/kenh/mj-aquascaping/').dom.querySelector('.series a[href="/vi/video/reu-hai-tu-a-den-z/"]')).not.toBeNull()
  })
  test('Video is inside Hướng dẫn (no nav entry of its own); sitemap has the video pages', () => {
    expect(page('/vi/').dom.querySelector('.nav a[href="/vi/video/"], #site-menu a[href="/vi/video/"]')).toBeNull()
    const sm = readFileSync(`${DIST}/sitemap.xml`, 'utf8')
    expect(sm).toContain('/vi/video/</loc>')
    expect(sm).toContain('/vi/video/reu-hai-tu-a-den-z/</loc>')
    expect(sm).toContain('/vi/video/kenh/green-aqua/</loc>')
  })
})

describe('dark mode', () => {
  const { html, dom } = page('/vi/')
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
  const { html, dom } = page('/vi/')
  test('hovered site links prerender; affiliate, outbound and admin links never', () => {
    const rules = JSON.parse(dom.querySelector('script[type="speculationrules"]')!.textContent!)
    const r = rules.prerender[0]
    expect(r.eagerness).toBe('moderate')
    expect(r.where.and[0]).toEqual({ href_matches: '/vi/*' })
    expect(r.where.and[1].not.selector_matches).toContain('[rel~=sponsored]')
    // The page's HTML is fetched sooner (10 ms hover; on phones, a link in view): a first visit waits ~0.5 s for it.
    expect(rules.prefetch).toEqual([{ where: r.where, eagerness: 'eager' }])
  })
  test('analytics wait until a preloaded page is shown', () => {
    const beacon = dom.querySelector('script[data-beacon]')!.textContent!
    expect(beacon).toMatch(/document\.prerendering\?document\.addEventListener\('prerenderingchange',go/)
    expect(html).not.toContain('<script type="module" src="https://static.cloudflareinsights.com')
  })
})

describe('what a video shows', () => {
  test('kit in the video: brand and model or the type, a seek button, exact-model shop links; species it shows are linked', () => {
    const { dom } = page('/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
    const rows = dom.querySelectorAll('.gear li')
    expect(rows.map(r => r.querySelector('.name')?.text)).toEqual(['Oase BioMaster 350', 'Seachem Flourish', 'Lọc bọt biển (lọc sủi)'])
    expect(rows[0]!.querySelector('.cat a')?.getAttribute('href')).toBe('/vi/thiet-bi/loc/')
    expect(rows[1]!.querySelector('.cat')?.text).toBe('Khác')
    expect(rows[0]!.querySelector('button.seek')?.getAttribute('data-t')).toBe('95')
    expect(rows[0]!.querySelector('button.seek')?.getAttribute('data-vp-for')).toBe('vl1Lx9iWDYU')
    expect(rows[0]!.querySelector('a[href^="/go/shopee/"]')?.getAttribute('href')).toContain('k=Oase+BioMaster+350')
    expect(rows[2]!.querySelector('button.seek')).toBeNull()
    expect(dom.querySelector('.related a[href="/vi/ca/tep-red-cherry/"]')).not.toBeNull()
  })
  test('the species page lists the video guide that shows it, apart from text guides', () => {
    const { dom } = page('/vi/ca/tep-red-cherry/')
    expect(dom.querySelector('.vg a[href="/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).not.toBeNull()
    expect(dom.querySelector('.guides a[href="/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).toBeNull()
  })
  test('the equipment page lists what creators use, with their videos', () => {
    const { dom } = page('/vi/thiet-bi/loc/')
    const li = dom.querySelector('.creators li')!
    expect(li.querySelector('strong')?.text).toBe('Oase BioMaster 350')
    expect(li.querySelector(':scope > a')?.getAttribute('href')).toBe('/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/')
  })
})

describe('product page', () => {
  const { html, dom } = page('/vi/san-pham/oase-biomaster-350/')
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
    expect(dom.querySelector('.vg a[href="/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/"]')).not.toBeNull()
    const guide = page('/vi/huong-dan/cach-han-che-reu-hai-trong-be-thuy-sinh/').dom
    expect(guide.querySelector('.gear .name a')?.getAttribute('href')).toBe('/vi/san-pham/oase-biomaster-350/')
    const eq = page('/vi/thiet-bi/loc/').dom
    expect(eq.querySelector('#thung .picks a')?.getAttribute('href')).toBe('/vi/san-pham/oase-biomaster-350/')
    expect(eq.querySelector('.creators strong a')?.getAttribute('href')).toBe('/vi/san-pham/oase-biomaster-350/')
  })
  test('indexable products are in the sitemap', () => {
    expect(readFileSync(`${DIST}/sitemap.xml`, 'utf8')).toContain('/vi/san-pham/oase-biomaster-350/</loc>')
  })
})

describe('photo gallery', () => {
  test('species page: a strip of thumbs linking each photo on the gallery page; open licences only', () => {
    const { dom } = page('/vi/ca/ca-neon-vua/')
    const strip = dom.querySelector('section.strip')!
    expect(strip.querySelector('.head a')!.getAttribute('href')).toBe('/vi/ca/ca-neon-vua/anh/')
    expect(strip.querySelector('.head a')!.textContent).toContain('Xem tất cả 6 ảnh')
    const links = [...strip.querySelectorAll('li a')].map(a => a.getAttribute('href'))
    expect(links[0]).toBe('/vi/ca/ca-neon-vua/anh/#a1')
    expect(strip.querySelector('img')!.getAttribute('src')).toMatch(/500px-Neon1\.jpg$/)
    expect(strip.innerHTML).not.toContain('Neon3')
    const credits = dom.querySelector('#photo-credits')!.innerHTML
    for (const n of [1, 2, 4, 5, 6, 7]) expect(credits).toContain(`File:Neon${n}.jpg`)
  })
  test('a species with too few photos gets no strip and no gallery page', () => {
    expect(page('/vi/ca/ca-neon-xanh/').dom.querySelector('section.strip')).toBeNull()
    expect(() => readFileSync(`${DIST}/vi/ca/ca-neon-xanh/anh/index.html`)).toThrow()
  })
  test('gallery page: every photo credited (author, licence, source), lightbox, ImageObject licence data, captions escaped', () => {
    const { html, dom } = page('/vi/ca/ca-neon-vua/anh/')
    const items = [...dom.querySelectorAll('[data-gallery] a[data-i]')]
    expect(items).toHaveLength(6)
    expect(items[0]!.getAttribute('data-author')).toBe('Tác giả 1')
    expect(items[0]!.getAttribute('data-lic')).toBe('CC BY 2.0')
    expect(items[0]!.getAttribute('data-src')).toBe('https://commons.wikimedia.org/wiki/File:Neon1.jpg')
    expect(dom.querySelector('dialog.lb')).toBeTruthy()
    expect(dom.querySelector('[data-gallery] b')).toBeNull()
    expect(html.indexOf('data-gallery')).toBeLessThan(html.indexOf('</body>'))
    expect(html.lastIndexOf('<script')).toBeLessThan(html.indexOf('</html>'))
    const ld = [...dom.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)).flat()
    const g = ld.find((x: { '@type': string }) => x['@type'] === 'ImageGallery')
    expect(g.image).toHaveLength(6)
    expect(g.image[0]).toMatchObject({ '@type': 'ImageObject', creditText: 'Tác giả 1', license: 'https://creativecommons.org/licenses/by/2.0/', acquireLicensePage: 'https://commons.wikimedia.org/wiki/File:Neon1.jpg' })
    expect(g.image.find((x: { license?: string }) => x.license?.includes('publicdomain'))).toBeTruthy()
    expect(dom.querySelector('a[href="/vi/ca/ca-neon-vua/"]')).toBeTruthy()
  })
  test('sitemap lists the gallery page', () => {
    expect(readFileSync(`${DIST}/sitemap.xml`, 'utf8')).toContain('/vi/ca/ca-neon-vua/anh/')
  })
})

describe('man-made fish (breeds)', () => {
  test('a line of a species: kind, link to its species, care card citing its own sources, no Taxon', () => {
    const { html, dom } = page('/vi/ca/ca-dia-pigeon-blood/')
    expect(dom.querySelector('h1')!.textContent).toBe('Cá đĩa Pigeon Blood')
    expect(dom.querySelector('.where')!.textContent).toContain('Dòng cá cảnh')
    expect(dom.querySelector('.where a')!.getAttribute('href')).toBe('/vi/ca/ca-dia/')
    expect(dom.querySelector('.crumb a[href="/vi/ca/ca-dia/"]')).toBeTruthy()
    // Two sources disagree on temperature: the range both accept, each source named by its title.
    expect(dom.querySelector('[data-field="tempC"] .v')!.textContent).toBe('28–30°C')
    expect(dom.querySelector('.trust [data-src-field="tempC"]')!.textContent).toContain('Trại cá đĩa A')
    expect(dom.querySelector('.sources a[href="https://breeder.example/pigeon"]')!.getAttribute('rel')).toContain('nofollow')
    const ld = [...dom.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent!)).flat()
    expect(ld.some((x: { '@type': string }) => x['@type'] === 'FAQPage')).toBe(true)
    expect(html).not.toContain('"Taxon"')
    // Its text links other pages it names, never itself.
    expect(dom.querySelector('.body a[href="/vi/ca/ca-la-han/"]')).toBeTruthy()
    expect(dom.querySelector('.body a[href="/vi/ca/ca-dia-pigeon-blood/"]')).toBeNull()
    expect(dom.querySelector('[data-comments][data-entity="breed:pigeon-blood-discus"], [data-entity="breed:pigeon-blood-discus"]')).toBeTruthy()
    // Too few photos for a gallery page: the second photo shows in the strip, opening itself, credited.
    expect(dom.querySelector('section.strip .head a')).toBeNull()
    expect(dom.querySelector('section.strip li a')!.getAttribute('href')).toMatch(/Breed2\.jpg$/)
    expect(dom.querySelector('#photo-credits')!.innerHTML).toContain('File:Breed2.jpg')
  })
  test('a hybrid: its parents, linked when we have the species, doubtful ones marked; noindex below the bar', () => {
    const { dom } = page('/vi/ca/ca-la-han/')
    const p = dom.querySelector('.parents')!
    expect(p.textContent).toContain('Amphilophus trimaculatus')
    expect(p.querySelector('a')!.getAttribute('href')).toBe('/vi/ca/ca-dia/')
    expect(p.querySelector('a')!.textContent).toMatch(/^Cá đĩa \(Symphysodon/)
    expect(p.textContent).toContain('chưa chắc chắn')
    expect(dom.querySelector('meta[name="robots"]')!.getAttribute('content')).toContain('noindex')
    expect(dom.querySelector('section.strip .head a')!.getAttribute('href')).toBe('/vi/ca/ca-la-han/anh/')
  })
  test('a breed gallery page has no scientific name', () => {
    const { dom } = page('/vi/ca/ca-la-han/anh/')
    expect(dom.querySelector('.lead')!.textContent).toMatch(/^7 ảnh từ Wikimedia Commons/)
    expect(dom.querySelector('.lead .sci')).toBeNull()
  })
  test('the species page lists its lines and hybrids, crediting their pictures; the species list shows them', () => {
    const { dom } = page('/vi/ca/ca-dia/')
    const names = [...dom.querySelectorAll('section.breeds .n')].map(x => x.textContent)
    expect(names).toEqual(['Cá đĩa Pigeon Blood', 'Cá La Hán (Flowerhorn)'])
    expect(dom.querySelector('#photo-credits')!.innerHTML).toContain('File:Breed1.jpg')
    expect(page('/vi/ca/').dom.querySelector('section.breeds a[href="/vi/ca/ca-la-han/"]')).toBeTruthy()
  })
  test('on the species list the breed cards lead the page: small pictures, loaded at once', () => {
    const img = page('/vi/ca/').dom.querySelector('section.breeds img')!
    expect(img.getAttribute('src')).toContain('/500px-')
    expect(img.getAttribute('loading')).toBe('eager')
    expect(page('/vi/ca/ca-dia/').dom.querySelector('section.breeds img')!.getAttribute('loading')).toBe('lazy')
  })
  test('sitemap: indexable breed pages only', () => {
    const sm = readFileSync(`${DIST}/sitemap.xml`, 'utf8')
    expect(sm).toContain('/vi/ca/ca-dia-pigeon-blood/')
    expect(sm).not.toContain('/vi/ca/ca-la-han/')
  })
})

describe('header and menu sheet', () => {
  const sections = (dom: ReturnType<typeof page>['dom'], sel: string) => dom.querySelectorAll(`${sel} a`).map(a => a.getAttribute('href'))
  test('five sections in the header row; the sheet adds Thiết bị and Mới cập nhật, then units, theme and language', () => {
    const { dom } = page('/vi/')
    expect(sections(dom, 'header.nav .sections')).toEqual(['/vi/ca/', '/vi/cay/', '/vi/huong-dan/', '/vi/cong-cu/', '/vi/thuat-ngu/'])
    expect(sections(dom, '#site-menu .go')).toEqual(['/vi/ca/', '/vi/cay/', '/vi/huong-dan/', '/vi/cong-cu/', '/vi/thuat-ngu/'])
    expect(sections(dom, '#site-menu .more')).toEqual(['/vi/thiet-bi/', '/vi/moi-cap-nhat/'])
    for (const sel of ['[data-units-toggle]', '[data-theme-toggle] [data-theme-mode]', '[data-lang-menu]']) expect(dom.querySelector(`#site-menu ${sel}`), sel).not.toBeNull()
    expect(dom.querySelector('header [data-menu-open]')?.getAttribute('aria-controls')).toBe('site-menu')
    expect(dom.querySelectorAll('footer a').map(a => a.getAttribute('href'))).toEqual(expect.arrayContaining(['/vi/thiet-bi/', '/vi/moi-cap-nhat/']))
  })
  test('other languages: the sheet lists only pages they have, with translated labels', () => {
    const { dom } = page('/id/')
    expect(sections(dom, '#site-menu .more')).toEqual(['/id/peralatan/'])
    expect(dom.querySelector('#site-menu-h')?.text).not.toBe('')
    expect(dom.querySelector('#site-menu .go a[href="/id/istilah/"]')?.text).toBe('Istilah')
  })
})

test('the logo link is named by its visible text (no aria-label that differs from it)', () => {
  const a = page('/vi/').dom.querySelector('a.logo')!
  expect(a.hasAttribute('aria-label')).toBe(false)
  expect(a.text.replace(/\s+/g, ' ').trim()).toBe('AquaTome Cẩm nang cá cảnh & thủy sinh')
})

test('every page has the language menu; a fish without other-language pages offers their fish lists', () => {
  // The header's (computers) and the menu sheet's (phones).
  for (const path of ['/vi/', '/vi/ca/ca-neon-vua/', '/vi/video/', '/id/', '/th/']) for (const menu of ['header', '#site-menu']) {
    const links = page(path).dom.querySelectorAll(`${menu} [data-lang-menu] a[data-lang]`)
    expect(links.map(a => a.getAttribute('data-lang')), `${path} ${menu}`).toEqual(['vi', 'id', 'th'])
  }
  for (const menu of ['header', '#site-menu']) {
    const fish = page('/vi/ca/ca-neon-vua/').dom.querySelectorAll(`${menu} [data-lang-menu] a[data-lang]`)
    expect(fish.map(a => [a.getAttribute('href'), a.getAttribute('aria-current')]), menu).toEqual([['/vi/ca/ca-neon-vua/', 'true'], ['/id/ikan/', undefined], ['/th/fish/', undefined]])
    // On an Indonesian page the Vietnamese link stays Vietnamese (localizeLinks leaves hreflang links alone).
    const id = page('/id/').dom.querySelectorAll(`${menu} [data-lang-menu] a[data-lang]`)
    expect(id.map(a => [a.getAttribute('href'), a.getAttribute('aria-current')]), menu).toEqual([['/vi/', undefined], ['/id/', 'true'], ['/th/', undefined]])
  }
})
