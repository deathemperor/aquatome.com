import { existsSync, readdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { glossaryKinds, PictureSet, slugify, toneKey, type GlossaryEntity, type Localized, type Photo } from '@aq/schema'
import { getContent } from '../src/lib/content'
import { bodySections, glossaryParts, linkedTermPaths, nameCount, termTitle, tipLine, usedPictures, usedRows } from '../src/lib/glossary-page'
import { smallSrc } from '../src/lib/img'
import { DIST, page } from './dist'

// A term's page (pages/thuat-ngu/[slug].astro): its other names, its definition's links, and every page that uses it.
// The owner asked, of the Lũa page on 13 Nov, "Where's the better glossary page and details?": it led nowhere.
const term = (g: Localized<GlossaryEntity>, t: Partial<Localized<GlossaryEntity>['t']>, en = g.en): Localized<GlossaryEntity> => ({ ...g, en, t: { ...g.t, ...t } })

test('a term\'s title carries its English name, once, without that name\'s own brackets', async () => {
  const c = await getContent('vi')
  const g = c.glossary.find(x => x.id === 'chu-trinh-nito')!
  expect(termTitle(g)).toBe('Chu trình nitơ (Nitrogen cycle)')
  expect(termTitle(c.glossary.find(x => x.id === 'ph')!)).toBe('pH')
  expect(termTitle(term(g, { name: 'Vùng D' }, 'D area (discus)'))).toBe('Vùng D (D area)')
  expect(termTitle(term(g, { name: 'CO2' }, 'CO₂'))).toBe('CO2 (CO₂)')
  expect(termTitle(term(g, { name: 'KH' }, 'KH'))).toBe('KH')
})

test('a term\'s other names are shown once each, never its own name; its definition links other terms, never its own names', async () => {
  const c = await getContent('vi')
  const gh = c.glossary.find(x => x.id === 'gh')!
  const p = glossaryParts('vi', c, term(gh, { altNames: ['độ cứng tổng', 'GH', 'Độ cứng tổng', ' ', 'dGH'], definition: 'Độ cứng tổng (GH) khác với pH: GH < 4 là nước mềm, đo bằng dGH.' }))
  expect(p.otherNames).toEqual(['độ cứng tổng', 'dGH'])
  // pH is another term: linked, with its card. Its own names (GH, dGH) are not; "<" stays text.
  expect(p.definition).toContain('<a href="/vi/thuat-ngu/ph/" class="gl"')
  expect(p.definition).not.toContain('/vi/thuat-ngu/gh/')
  expect(p.definition).toContain('GH &lt; 4')
})

// The chief of staff, 18 Nov 2026: "Tên khác: đông lạnh, Frozen food. Tiếng Anh: Frozen food", and "sống theo đàn" printed
// as another name for Cá đàn. A link phrase is linked from, never printed; the English name prints once, on its own line.
test('a term\'s other names never repeat its English line, nor print its link phrases, which still link to it', async () => {
  const c = await getContent('vi')
  const gh = c.glossary.find(x => x.id === 'gh')!
  const p = glossaryParts('vi', c, term(gh, { altNames: ['General hardness', 'dGH'], linkNames: ['độ cứng của nước'], definition: 'Đo độ cứng của nước bằng dGH.' }, 'General Hardness'))
  expect(p.otherNames).toEqual(['dGH'])
  // Nor in the singular: "tannin" beside "Tiếng Anh: Tannins", "Bloodworms" beside "Bloodworm".
  expect(glossaryParts('vi', c, term(gh, { altNames: ['tannin', 'trà lá'] }, 'Tannins')).otherNames).toEqual(['trà lá'])
  expect(glossaryParts('vi', c, term(gh, { altNames: ['Bloodworms', 'giun đỏ'] }, 'Bloodworm')).otherNames).toEqual(['giun đỏ'])
  const ph = c.glossary.find(x => x.id === 'ph')!
  const withPhrase = { ...c, glossary: c.glossary.map(x => (x.id === 'gh' ? term(x, { linkNames: ['độ cứng của nước'] }) : x)) }
  expect(glossaryParts('vi', withPhrase, term(ph, { definition: 'pH khác với độ cứng của nước.' })).definition).toContain('<a href="/vi/thuat-ngu/gh/" class="gl"')
})

// The chief of staff, 19 Nov 2026: "Oxy hoà tan" printed as Oxy hòa tan's other name, its own name with the tone mark on the
// other vowel. A name is one name whichever vowel the mark sits on (toneKey).
test('a term\'s other names never repeat its name, nor each other, with a tone mark on another vowel', async () => {
  expect(toneKey('Oxy hoà tan')).toBe(toneKey('oxy hòa tan'))
  expect(toneKey('thuỷ sinh')).toBe(toneKey('thủy sinh'))
  expect(toneKey('hóa')).not.toBe(toneKey('hoa'))
  expect(toneKey('ô')).not.toBe(toneKey('o'))
  const c = await getContent('vi')
  const gh = c.glossary.find(x => x.id === 'gh')!
  const p = glossaryParts('vi', c, term(gh, { name: 'Oxy hòa tan', altNames: ['Oxy hoà tan', 'thuỷ sinh', 'thủy sinh', 'Ôxy hòa tan'] }, 'Dissolved oxygen'))
  expect(p.otherNames).toEqual(['thuỷ sinh', 'Ôxy hòa tan'])
})

test('a page\'s link to a term is found however it is written: either quote, a #part; never another address', () => {
  expect(linkedTermPaths('<a href="/vi/thuat-ngu/ph/" class="gl">pH</a> <a href=\'/vi/thuat-ngu/gh/\'>GH</a> <a href="/vi/thuat-ngu/lua/#loai">lũa</a>')).toEqual(['/vi/thuat-ngu/ph/', '/vi/thuat-ngu/gh/', '/vi/thuat-ngu/lua/'])
  expect(linkedTermPaths('<a href="/vi/thuat-ngu/">Thuật ngữ</a> <a href="/vi/huong-dan/ph/">pH</a> <a href="/vi/thuat-ngu/ph/x/">x</a> data-href="/vi/thuat-ngu/kh/"')).toEqual([])
})

// On the real site pH's "Used in" led with "Phosphat trong bể san hô": its guides were ranked by "ph" inside other words.
test('the guides that explain a term are found by its names as whole words, in any case', () => {
  const ph = nameCount(['ph'])
  expect(['Phosphat trong bể san hô', 'Cách tự làm viên phân nền', 'Lắp phông nền 3D'].map(ph)).toEqual([0, 0, 0])
  expect(['pH, GH, KH trong bể cá là gì', 'Hướng dẫn về pH và GH', 'PH thấp (pH 6)'].map(ph)).toEqual([1, 1, 2])
  expect(nameCount(['chu trình nitơ', 'cycle bể'])('Cách cycle bể. Chu trình nitơ là… (chu trình nitơ)')).toBe(3)
  expect(nameCount(['chiều dài chuẩn (sl)'])('chiều dài chuẩn (SL) là')).toBe(1)
})

test('a fuller entry: its sections under plain headings, a term linked once across the meaning and the text, the terms to see next, its sources', async () => {
  const c = await getContent('vi')
  const cycle = c.glossary.find(x => x.id === 'chu-trinh-nito')!
  const refs = [{ url: 'https://edis.ifas.ufl.edu/x', title: 'UF/IFAS' }]
  const p = glossaryParts('vi', c, { ...term(cycle, { definition: 'Vi khuẩn đổi amoniac, nên pH quan trọng.', body: '<h3>Nên làm gì</h3><p>Đo pH mỗi tuần, đo GH khi thay nước.</p>' }), related: ['ph', 'nope', 'gh'], refs })
  expect(p.body).toContain('<h2>Nên làm gì</h2>')
  // pH is linked in the meaning, so not again in the text; GH is first named in the text.
  expect(p.definition).toContain('/vi/thuat-ngu/ph/')
  expect(p.body).not.toContain('/vi/thuat-ngu/ph/')
  expect(p.body).toContain('/vi/thuat-ngu/gh/')
  expect(p.related.map(x => x.id)).toEqual(['ph', 'gh'])
  expect(p.refs).toEqual(refs)
  // A term with no fuller entry has none of these.
  expect(glossaryParts('vi', c, c.glossary.find(x => x.id === 'gh')!)).toMatchObject({ body: '', related: [], refs: [] })
})

/** The built pages of one kind (Vietnamese, at the root), each with the terms its text links: [path, slugs]. */
function linking(dir: string): [string, Set<string>][] {
  if (!existsSync(`${DIST}/${dir}`)) return []
  return readdirSync(`${DIST}/${dir}`, { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(`${DIST}/${dir}/${d.name}/index.html`)).map(d => {
    const { dom } = page(`/${dir}/${d.name}/`)
    return [`/vi/${dir}/${d.name}/`, new Set(dom.querySelectorAll('main a[href^="/thuat-ngu/"]').flatMap(a => a.getAttribute('href')!.match(/^\/thuat-ngu\/([^/]+)\/$/)?.[1] ?? []))]
  })
}

test('every term page lists, with its count, every built guide, fish and plant page that links the term', async () => {
  const c = await getContent('vi')
  const kinds = { 'huong-dan': linking('huong-dan'), ca: linking('ca'), cay: linking('cay') }
  expect(kinds['huong-dan'].length + kinds.ca.length + kinds.cay.length).toBeGreaterThan(0)
  let shown = 0
  for (const g of c.glossary) {
    const p = glossaryParts('vi', c, g)
    const users = (dir: keyof typeof kinds) => kinds[dir].filter(([, slugs]) => slugs.has(g.t.slug)).map(([path]) => path).sort()
    expect(p.guides.map(x => `/vi/huong-dan/${x.t.slug}/`).sort(), g.id).toEqual(users('huong-dan'))
    expect(p.fish.map(x => x.href).sort(), g.id).toEqual(users('ca'))
    expect(p.plants.map(x => x.href).sort(), g.id).toEqual(users('cay'))
    // The built term page: the whole count, each kind's count, its rows (three of each past six in all, the Design
    // Lead's board), each with its picture's place, and the search for the rest only past six.
    const { dom } = page(`/thuat-ngu/${g.t.slug}/`)
    const h2 = dom.querySelector('.used h2')
    expect(Number(h2?.textContent.replace(/\D/g, '') ?? 0), g.id).toBe(p.total)
    const lists = dom.querySelectorAll('.used h3').map(h3 => [Number(h3.textContent.match(/\(([\d.]+)\)/)?.[1]?.replace(/\./g, '')), (h3.nextElementSibling?.querySelectorAll('a') ?? []).map(a => a.getAttribute('href'))] as const)
    const rows = usedRows(p)
    const want = [
      [p.guides.length, rows.guides.map(x => `/huong-dan/${x.t.slug}/`)],
      [p.fish.length, rows.fish.map(x => x.href.replace(/^\/vi/, ''))],
      [p.plants.length, rows.plants.map(x => x.href.replace(/^\/vi/, ''))],
    ].filter(([n]) => n)
    expect(lists, g.id).toEqual(want)
    expect(dom.querySelectorAll('.used .rows a').every(a => a.querySelector('.pic') && a.querySelector('.name')?.textContent.trim()), g.id).toBe(true)
    expect(!!dom.querySelector('.used .more a[href^="/tim-kiem/"]'), g.id).toBe(rows.more)
    shown += p.total
  }
  // The fixture's pages use its terms: the check above compared something.
  expect(shown).toBeGreaterThan(0)
})

// The built page of a term with a fuller entry (the fixture's "cá đàn"): its photo with its credit, its text under
// headings, the terms to see next (one the content doesn't have is left out) and its sources, each a tap target.
test('a term with a fuller entry shows its photo, its text under headings, the terms to see next and its sources', () => {
  const { dom } = page('/thuat-ngu/ca-dan/')
  const fig = dom.querySelector('main figure')
  expect(fig?.querySelector('img')?.getAttribute('src')).toContain('Danio_Margaritatus')
  expect(fig?.querySelector('figcaption')?.textContent).toContain('Cá trân châu đực')
  // Its kinds first in its body (the Design Lead's board, 16 Nov 2026), then its other parts in the entry's order.
  expect(dom.querySelectorAll('.body h2').map(h => h.textContent.trim())).toEqual(['Các loại', 'Trong bể của bạn'])
  expect(dom.querySelector('.body a[href="/thuat-ngu/ph/"]')).toBeTruthy()
  expect(dom.querySelectorAll('.related a').map(a => a.getAttribute('href'))).toEqual(['/thuat-ngu/chu-trinh-nito/', '/thuat-ngu/ph/'])
  expect(dom.querySelectorAll('.refs a').map(a => a.getAttribute('href'))).toEqual(['https://www.seriouslyfish.com/glossary/shoal'])
})

// Every term page as the Design Lead's board has it (14 Nov 2026): a long term's parts in the fish page's jump row with
// "Dùng trong" at its end, none for a term of a meaning alone; each related term with its one line; five sources, the rest
// folded under "Xem cả N nguồn".
test('every term page: the jump row only for a term in parts, related terms in one line each, five sources and the rest folded', async () => {
  const c = await getContent('vi')
  let rows = 0, folded = 0
  for (const g of c.glossary) {
    const p = glossaryParts('vi', c, g)
    const { dom } = page(`/thuat-ngu/${g.t.slug}/`)
    const parts = [...(p.kinds ? [{ href: `#${slugify(p.kinds.title)}` }] : []), ...bodySections(p.pageBody).parts]
    const chips = dom.querySelectorAll('nav.jump a').map(a => a.getAttribute('href'))
    if (parts.length >= 2) {
      rows++
      expect(chips, g.id).toEqual([...parts.map(x => x.href), ...(p.total ? ['#dung-trong'] : [])])
      for (const x of parts) expect(dom.querySelector(`.body section ${x.href}`), `${g.id} ${x.href}`).toBeTruthy()
    } else expect(chips, g.id).toEqual([])
    expect(dom.querySelectorAll('.related li').map(li => li.textContent.trim()), g.id).toEqual(p.related.map(r => (r.t.definition ? `${r.t.name}: ${tipLine(r.t.definition)}` : r.t.name)))
    const shown = dom.querySelectorAll('.refs > ol > li a').map(a => a.getAttribute('href'))
    const rest = dom.querySelectorAll('.refs details ol > li a').map(a => a.getAttribute('href'))
    expect([...shown, ...rest], g.id).toEqual(p.refs.map(r => r.url))
    expect(shown.length, g.id).toBe(Math.min(5, p.refs.length))
    if (rest.length) { folded++; expect(dom.querySelector('.refs details summary')?.textContent.trim(), g.id).toBe(`Xem cả ${p.refs.length} nguồn`) }
  }
  // The fixture holds a term in parts (lũa) and one with more than five sources: both rules were read.
  expect([rows > 0, folded > 0]).toEqual([true, true])
})

// The live checks, 15 Nov 2026: /thuat-ngu/tinh-lanh-tho/ showed one photo twice, on two crayfish guides that share it.
test('a term\'s rows show no picture twice: a row whose picture the page shows already takes its next one, else none', () => {
  const photo = (name: string) => ({ url: `https://media.aquatome.com/commons/${name}.webp`, width: 960, height: 720 }) as Photo
  const own = photo('own'), a = photo('a'), b = photo('b'), copy = photo('a-copy'), plant = photo('plant')
  // The same picture in two files counts as one (PictureSet).
  const c = { pictureHashes: { [a.url]: '0f1e2d3c4b5a6978', [copy.url]: '0f1e2d3c4b5a6978' } }
  const guides = { g1: [a], g2: [copy, b], g3: [a] }, ids: (keyof typeof guides)[] = ['g1', 'g2', 'g3']
  const fish = [{ href: '/vi/ca/x/', name: 'x', photo: own }, { href: '/vi/ca/y/', name: 'y', photo: b }]
  const r = usedPictures(c, [own], { guides: ids, fish, plants: [{ href: '/vi/cay/z/', name: 'z', photo: plant }] }, g => guides[g])
  expect(r.guides).toEqual([a, b, null])
  expect(r.fish).toEqual([null, null]) // the term's own photo is above them; b went to the second guide
  expect(r.plants).toEqual([plant])
})

// The chief of staff, 15 Nov 2026, on the live pages at 18:12: lá bàng held two photos and its page drew the first only,
// and Lũa's bonsai and cholla, each a kind's photo, showed nowhere. A term's page shows every photo it holds, none twice:
// each kind's photo (its kind named in the entry) claims first, on its kind's card (the Design Lead's board, 16 Nov
// 2026); the term's own photo is its first no kind holds; its other photos follow under it.
test('a term\'s page shows every photo it holds: its first under its names, the rest under it, its kinds\' on their cards, none twice', async () => {
  const c = await getContent('vi')
  const g = c.glossary.find(x => x.id === 'ca-dan')!
  const [danio, boraras] = g.photos ?? []
  const neon = g.kinds?.find(k => k.id === 'ca-neon')?.photo
  expect(danio && boraras && neon).toBeTruthy()
  const p = glossaryParts('vi', c, g)
  expect(p.photo).toEqual(danio)
  expect(p.others).toEqual([boraras])
  // A kind with a photo is a card, first; one without is in words, after.
  expect(p.kinds!.items.map(k => [k.name, k.aka, k.line, k.photo])).toEqual([
    ['Cá neon', 'neon tetra', 'Bơi thành đàn chặt khi có cá lạ.', neon],
    ['Cá trân châu', 'celestial pearl danio', 'Bơi ở tầng giữa, cần nhiều cây.', undefined],
  ])
  // A kind's photo that is also the term's: shown once, on the kind's card; the term opens on its next photo.
  const shared = glossaryParts('vi', c, { ...g, kinds: [{ id: 'ca-tran-chau', photo: danio! }] })
  expect([shared.photo, shared.others]).toEqual([boraras, []])
  expect(shared.kinds!.items.map(k => [k.name, k.photo])).toEqual([['Cá trân châu', danio], ['Cá neon', undefined]])
  // A kind the entry doesn't name has no card to show its photo on: left out, as the engine reports it.
  expect(glossaryParts('vi', c, { ...g, kinds: [{ id: 'ca-khong-co', photo: neon! }] }).kinds!.items.every(k => !k.photo)).toBe(true)
  // The app's copy keeps its body whole, the kinds in their place, until its own build (iOS Content, Mon 23).
  expect(p.body).toContain('<h2>Các loại</h2>')
  expect(p.pageBody).not.toContain('Các loại')
})

// The Design Lead's board, 16 Nov 2026: the kinds as cards, each opening large with its photo's credit, its whole text
// and the kinds either side by name, "n / N" in card order. The page holds each picture once: the large view's photo is
// drawn when it opens.
test('a term\'s built page shows its kinds as cards, then in words, each with its large view, and each picture once', () => {
  const { dom } = page('/thuat-ngu/ca-dan/')
  const kinds = dom.querySelector('.body > section.kinds')
  expect(kinds).toBeTruthy()
  expect(dom.querySelector('.body > *')).toBe(kinds)
  expect(kinds!.querySelector('.k-count')?.textContent.trim()).toBe('2 loại')
  expect(kinds!.querySelectorAll('.k-cards .k-name').map(x => x.textContent.trim())).toEqual(['Cá neon'])
  expect(kinds!.querySelectorAll('.k-words .k-name').map(x => x.textContent.trim())).toEqual(['Cá trân châu'])
  const views = kinds!.querySelectorAll('dialog.k-view')
  expect(views.map(v => v.getAttribute('id'))).toEqual(['loai-ca-neon', 'loai-ca-tran-chau'])
  expect(views.map(v => v.querySelector('.kv-n')?.textContent.trim())).toEqual(['1 / 2', '2 / 2'])
  // Of two kinds, each names the other once, on its side; the kinds wrap round only from three (the Design Lead, 16 Nov).
  expect(views.map(v => v.querySelectorAll('.kv-step a').map(a => `${a.getAttribute('rel')} ${a.textContent.trim()}`))).toEqual([['next Cá trân châu ›'], ['prev ‹ Cá neon']])
  expect(views[0]!.querySelector('.kv-by a[href]')?.textContent.trim()).toBe('Xem ảnh gốc ↗')
  expect(views[0]!.querySelector('.kv-text')?.textContent.trim()).toBe('Bơi thành đàn chặt khi có cá lạ.')
  expect(views[0]!.querySelector('.kv-x')?.getAttribute('aria-label')).toBe('Đóng')
  // Each card opens its own view; no view draws a photo before it opens.
  expect(kinds!.querySelectorAll('a.k-card').map(a => a.getAttribute('href'))).toEqual(['#loai-ca-neon', '#loai-ca-tran-chau'])
  expect(kinds!.querySelectorAll('dialog img')).toHaveLength(0)
  const srcs = dom.querySelectorAll('main img').map(i => i.getAttribute('src'))
  expect(new Set(srcs).size).toBe(srcs.length)
  // One other photo under the term's own sits with its caption beside it (the Design Lead, 16 Nov 2026).
  expect(dom.querySelectorAll('.others figure')).toHaveLength(1)
  expect(dom.querySelector('.others')?.classList.contains('one')).toBe(true)
})

// The chief of staff, 15 Nov 2026: "a photo that's stored and unseen is the same complaint again" (the owner's: the page
// doesn't show the thing). Every photo the build kept for a term (after the screen, as getContent loads it like the build)
// and every kind's photo whose kind its entry names is drawn on the term's built page, in every language. Failed on the
// page of 15 Nov: lá bàng's second photo and Lũa's bonsai and cholla.
test('every photo a term holds, and every named kind\'s photo, is drawn on its built page', async () => {
  let held = 0
  for (const lang of ['vi', 'id', 'th', 'ms'] as const) {
    const c = await getContent(lang).catch(() => null)
    if (!c) continue
    for (const g of c.glossary) {
      const named = new Set(glossaryKinds(g.t.body ?? '').map(k => k.id))
      const photos = [...(g.photos ?? []), ...(g.kinds ?? []).filter(k => named.has(k.id)).map(k => k.photo)]
      if (!photos.length) continue
      const path = `${lang === 'vi' ? '' : `/${lang}`}/thuat-ngu/${g.t.slug}/`
      if (lang !== 'vi' && !existsSync(`${DIST}${path}index.html`)) continue
      const drawn = new PictureSet(c.pictureHashes)
      for (const img of page(path).dom.querySelectorAll('main img')) drawn.add(img.getAttribute('src') ?? undefined)
      // As the page draws it: the photo, its thumb, or the small copy a row draws (a Wikimedia photo's 500px size).
      for (const p of photos) expect(drawn.has(p.url) || drawn.has(p.thumb) || drawn.has(smallSrc(p)), `${path} draws ${p.url}`).toBe(true)
      held += photos.length
    }
  }
  expect(held).toBeGreaterThan(0)
})
